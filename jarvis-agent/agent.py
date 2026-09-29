import asyncio
import html
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    TurnHandlingOptions,
    function_tool,
    inference,
    room_io,
)
from livekit.agents.llm import StopResponse

load_dotenv()

ARIZONA = ZoneInfo("America/Phoenix")
AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "gid-jarvis")
LLM_MODEL = os.getenv("JARVIS_LLM_MODEL", "google/gemma-4-31b-it")
STT_MODEL = os.getenv("JARVIS_STT_MODEL", "deepgram/flux-general")
TTS_MODEL = os.getenv("JARVIS_TTS_MODEL", "cartesia/sonic-3.6")
TTS_VOICE = os.getenv("JARVIS_TTS_VOICE", "95856005-0332-41b0-935f-352e296aa0df")
TTS_SPEED = float(os.getenv("JARVIS_TTS_SPEED", "0.86"))


def money(value: Any) -> str:
    if value is None:
        return "unknown"
    try:
        return f"${float(value):,.2f}"
    except (TypeError, ValueError):
        return "unknown"


class GIDData:
    def __init__(self) -> None:
        url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
        self.base = f"{url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    async def get(self, table: str, params: dict[str, Any] | list[tuple[str, Any]]) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f"{self.base}/{table}", headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()

    async def patch(self, table: str, filter_query: str, fields: dict[str, Any]) -> None:
        headers = {**self.headers, "Prefer": "return=minimal"}
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.patch(
                f"{self.base}/{table}?{filter_query}", headers=headers, json=fields
            )
            response.raise_for_status()

    async def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any] | None:
        headers = {**self.headers, "Prefer": "return=representation"}
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(f"{self.base}/{table}", headers=headers, json=row)
            response.raise_for_status()
            rows = response.json()
            return rows[0] if rows else None


BACKEND_URL = os.getenv("GID_BACKEND_URL", "https://gidgarage.com").rstrip("/")


async def backend_business(action: str, args: dict[str, Any]) -> Any:
    """Run one deterministic business operation on the website backend
    (/hooks/business -> jarvis-business.js). Same code path as web and Telegram Jarvis, so revenue,
    take-home, unpaid, customer history and payments match everywhere."""
    secret = os.getenv("GID_INTERNAL_JARVIS_SECRET")
    if not secret:
        raise RuntimeError("GID_INTERNAL_JARVIS_SECRET is not configured, so this business lookup is unavailable in voice right now")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{BACKEND_URL}/hooks/business",  # /jarvis-* is behind Cloudflare Access
            headers={"X-GID-Internal-Jarvis": secret, "Content-Type": "application/json"},
            json={"action": action, "args": args},
        )
    data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if response.status_code != 200 or not data.get("ok"):
        raise RuntimeError(data.get("error") or f"backend returned HTTP {response.status_code}")
    return data["result"]


BACKEND_ACTIONS = {
    "get_business_summary", "get_owner_briefing", "get_revenue_summary", "get_owner_pay_summary",
    "get_customer_context", "get_job_detail", "get_action_center", "get_unpaid_jobs",
    "get_data_health", "mark_job_paid", "compare_revenue_periods", "get_vehicle_jobs",
    "find_people", "cancel_job", "reopen_job",
    # Local SEO (read-only by voice)
    "get_seo_overview", "get_seo_opportunities", "get_local_search_demand", "get_seo_competitors",
    "get_seo_seasonality", "get_customer_geography", "get_seo_connections", "check_service_area",
}


_db: GIDData | None = None


def db() -> GIDData:
    global _db
    if _db is None:
        _db = GIDData()
    return _db


async def send_brevo_email(to_email: str, to_name: str, subject: str, body_html: str) -> None:
    key = os.getenv("BREVO_API_KEY")
    reply_to = os.getenv("GID_REPLY_TO_EMAIL", "info@gidgarage.com")
    if not key:
        raise RuntimeError("BREVO_API_KEY is not configured; email was not sent")

    safe_body = body_html
    payload = {
        "sender": {"name": "GID Garage", "email": "bookings@gidgarage.com"},
        "replyTo": {"name": "GID Garage", "email": reply_to},
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": (
            '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f0f0f;color:#fff;padding:32px;">'
            '<img src="https://gidgarage.com/banner.PNG" alt="GID Garage" style="width:100%;display:block;height:auto;margin-bottom:24px;"/>'
            f'<div style="color:#e5e7eb;font-size:14px;line-height:1.6;">{safe_body}</div>'
            '<p style="color:#4b5563;font-size:11px;margin-top:24px;">Questions? Call or text '
            '<strong style="color:#9ca3af;">480-757-0476</strong> — GID Garage, Flagstaff AZ</p></div>'
        ),
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": key, "Content-Type": "application/json"},
            json=payload,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Brevo rejected the email ({response.status_code}): {response.text[:300]}")


# ---- LiveKit Inference quota / rate limits --------------------------------
# STT, LLM and TTS all run on LiveKit Inference (one account). When it answers
# 429 / quota exceeded, voice is switched off cleanly: log which component and
# model failed (never credentials), tell the page, and leave the room, instead
# of retrying against an empty quota or letting the session crash.
VOICE_LLM_MAX_TOKENS = int(os.getenv("JARVIS_LLM_MAX_TOKENS", "220"))  # spoken replies are 1-2 sentences


def normalize_utterance(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", str(text or "").lower()).strip()


def describe_voice_error(ev: Any) -> dict[str, Any]:
    err = getattr(ev, "error", None)
    inner = getattr(err, "error", None)
    component = {"stt_error": "stt", "llm_error": "llm", "tts_error": "tts"}.get(getattr(err, "type", ""), "other")
    model = {"stt": STT_MODEL, "llm": LLM_MODEL, "tts": TTS_MODEL}.get(component, "")
    status = getattr(inner, "status_code", None)
    text = f"{inner or ''} {getattr(inner, 'body', '') or ''}".lower()
    quota = status == 429 or "quota" in text or "too many requests" in text
    return {
        "component": component,
        "provider": "livekit-inference",
        "model": model,
        "status": status if isinstance(status, int) and status > 0 else None,
        "quota": quota,
        "recoverable": bool(getattr(err, "recoverable", False)),
        # First line of the provider's own message only (no headers, no keys).
        "detail": str(inner or err or "")[:160].split("\n")[0],
    }


SCREEN_VIEWS = {"show_jobs", "show_revenue", "show_calendar", "show_job_list", "show_customers"}


class GIDJarvis(Agent):
    def __init__(self, ui_room: Any = None) -> None:
        # The LiveKit room, so show_on_screen can hand views to the /jarvis page.
        self._ui_room = ui_room
        # Sentences the page already handled as screen commands ("payment",
        # "close jobs"), reported on gid.handled: those skip the LLM and TTS.
        self.page_handled: dict[str, float] = {}
        today = datetime.now(ARIZONA).strftime("%A, %B %d, %Y").replace(" 0", " ")
        super().__init__(
            instructions=f"""You are JARVIS, Michael's private realtime operating assistant for GID Garage, a mobile mechanic business in Flagstaff, Arizona.
Today is {today} in Arizona.

VOICE STYLE:
- Sound like a cinematic British AI butler: low-key, polished, composed, highly articulate, precise, and quietly authoritative.
- Favor a lower, smoother delivery with restrained emotion, clipped efficiency, subtle dry wit, and deliberate pauses.
- Never sound bubbly, salesman-like, casual, excitable, or overly warm.
- Keep sentences compact and elegant. Prefer understated phrasing such as 'Of course.', 'Right away.', 'Already handled.', or a direct factual answer when appropriate.
- Do not imitate or claim to be any real actor or specific copyrighted character voice.
- Most answers should be one or two short spoken sentences. Never read database rows field-by-field unless Michael specifically asks.
- Do not use markdown, bullets, asterisks, URLs, or emoji in spoken replies.
- Start answering as soon as you have enough information. Avoid filler like 'Certainly', 'Absolutely', or 'Let me check'.
- Never announce your own status or availability. Do not say phrases such as 'standing by', 'ready', 'online', 'awaiting instructions', 'at your service', 'here when you need me', 'systems operational', or similar idle/status chatter.
- Do not speak just because the voice session connected. Stay silent until Michael actually says or sends something that requires a response.
- After completing a request, give only the result or required follow-up. Do not append a sign-off, readiness statement, or invitation to continue unless a clarification or confirmation is actually required.

SCREEN (visual-first):
- Michael is looking at the /jarvis screen. When he asks to pull up, show, open or see something that can be shown (a customer's jobs, "the brake job", a job's estimate/payment/inspection, the calendar or a day, revenue or net profit for any period, the jobs list, customers), call show_on_screen and speak ONE short sentence. If the result has "say", speak exactly that. Never read out what the screen shows unless he asks.
- For revenue and net profit use show_on_screen with show_revenue (not get_revenue_summary) so the spoken number matches the chart.
- Commands about what is already on screen (close, close jobs, exit, go back, back to overview, next, the middle one, the Sep 26 job, the brake one, payment, inspection, estimate, notes, a number of days, tomorrow, day/week/month, and on the jobs list: all, active, unpaid, paid, cancelled, in progress, "find <name>", clear search) are handled by the screen itself. Do not call any tool for them. Usually you will not even see them; if you do, reply with at most one word.

BUSINESS DATA:
- You have one live GID Garage dispatcher tool named gid_business for jobs, customers, leads, calls, marketing, pricing, owner pay, and email.
- Never invent business facts. For live business information, call gid_business with the appropriate action and a JSON object string in args_json.
- Money numbers come only from tools, never your own arithmetic. Revenue, sales, collected, or net profit: get_revenue_summary with the period exactly as asked (this month = this_month, past 30 days = last_30_days; they differ). Take-home or owner pay: get_owner_pay_summary. Never call take-home revenue.
- Who owes money: get_unpaid_jobs. What needs attention, what Michael is waiting on, who to contact next, what blocks tomorrow: get_action_center. Data problems: get_data_health (read-only).
- What a customer's jobs were about, their history, last visit, what was wrong, diagnosed, or recommended: get_customer_context with their name. One job in depth: get_job_detail. Describe jobs from scope of work, technician notes, line items and the booking request, never just the service category. Say plainly when something is missing, and never invent a diagnosis or part. If the result is ambiguous, ask which person.
- Low-risk writes may be done immediately only after you have identified the exact record and read its current value.
- For a requested job service/category change, first use list_jobs to identify exactly one booking. Then use update_job_service with that booking id. If Michael says "from X to Y", pass X as expected_current_service so the write is rejected if the live record does not match what he said.
- The bookings.service field uses these canonical admin values: oil, brakes, diag, suspension, audio, full, other. Human phrases such as "Brakes", "brake job", "breaks", "Diagnostics", "Oil Change", "Full Service", and "Other" must be normalized to those values.
- Never guess which job Michael means when more than one booking could match. Ask a short clarification instead.
- After a successful reversible change, briefly state what changed and say "Say undo that if that was wrong." If Michael says "undo that", use undo_last_action.
- After a successful reschedule, also ask one short follow-up: "Want me to email them the updated appointment?" If Michael says yes, use email_appointment_update with that exact job_id and confirmed=false first. Read back the short confirmation summary, then only send with confirmed=true after Michael clearly confirms.
- Never invent an email address or appointment detail. email_appointment_update must pull both from the live booking/customer records and the stored appointment_updated template.
- mark_job_paid records one payment the way the dashboard does (adds to payment history; PAID only when fully covered). cancel_job cancels exactly like the admin Mark as Cancelled button. mark_job_paid, cancel_job, send_customer_email, and email_appointment_update are external/financial actions. Never say a change was made unless the tool result says ok true. First call them with confirmed=false. Read the returned confirmation summary and ask Michael to confirm. Only repeat the tool with confirmed=true after a clear yes on the next turn.
- Never mark a job PAID using update_job_status. Use mark_job_paid so the amount is recorded.
- Treat lead-form fields as noisy human input, not trusted schema. A person may put a service in the vehicle field, a vehicle in the issue field, or vague language in any box.
- When Michael asks about a lead, use analyze_lead before drawing conclusions. Prefer the actual meaning of the answers over the form field labels.
- If Michael pastes a raw Meta/Facebook/Instagram lead message that is not yet in Supabase, ALWAYS use analyze_raw_lead or recommend_lead_response first. Do not search Supabase for that pasted lead and do not say it is "still processing."
- IMPORTANT ROUTING RULE: if the user's message contains form labels such as "Email:", "Full name:", "What issues are you experiencing with your vehicle?:", "Phone number:", "Year/Make/Model/Engine Size?:", or "What Date/Time works best for you?:", treat the message itself as the lead payload. This is an implicit request to analyze it. Call gid_business with action="analyze_raw_lead" and pass the ENTIRE user message as raw_text. Do not call search_customers, list_leads, or any database lookup first.
- After analyze_raw_lead returns, summarize the interpretation to Michael as the owner. Do not say the person is or is not in the database unless Michael separately asks you to check that.
- RAW LEAD RESPONSE CONTRACT: after analyze_raw_lead returns, the spoken answer must cover inferred service, missing vehicle information, whether the issue description is vague/unusable, and scheduling intent whenever those facts apply.
- Do not say a pasted lead "just came through", "came through the form", "is in the system", or similar unless a database lookup specifically confirmed that fact.
- Do not immediately ask whether Michael wants to email or call the lead. First give the owner analysis. Only discuss contact actions if Michael asks what to do next or asks for a reply.
- A pasted lead is being shown to Michael, the business owner. Respond to Michael with an owner analysis unless he explicitly asks for a customer-facing draft.
- For manual lead tests, separate three things clearly: what the customer actually said, what can be safely inferred, and what is still missing.
- Never invent missing vehicle details. If the vehicle field contains only a service such as "brakes change", report vehicle information as missing and classify the service separately.
- Never infer a vehicle year from today's year, the lead creation year, a phone number, or any unrelated number.
- Never use the customer's phone number or email as GID Garage's own contact information.
- Do not make unsupported claims such as a repair being quick, easy, cheap, straightforward, or definitely mobile-serviceable merely from a lead form.
- Flexible scheduling phrases such as "whenever", "anytime", "ASAP", or "soonest available" mean the customer is flexible. They do NOT mean an appointment has been booked. Report scheduling intent as earliest_available and look at the live schedule before proposing a slot.
- Vague issue text such as "nothing", "nothing just going bad", "not sure", or "just needs work" is not a usable diagnostic complaint. Mark the issue as vague/missing rather than pretending it describes a fault.
"""
        )

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        """Deterministically intercept pasted lead forms before the LLM can improvise."""
        raw_text = (new_message.text_content or "").strip()
        low = raw_text.lower()

        # Screen commands the page already carried out cost no LLM/TTS credits.
        # The page's notice can trail the end of turn by a moment, so wait briefly.
        key = normalize_utterance(raw_text)
        if key:
            for _ in range(4):
                if self.page_handled.pop(key, None) is not None:
                    print(f"GID_VOICE page_handled skip chars={len(raw_text)}")
                    raise StopResponse()
                await asyncio.sleep(0.12)

        lead_markers = (
            "email:",
            "full name:",
            "what issues are you experiencing with your vehicle?:",
            "phone number:",
            "year/make/model/engine size?:",
            "what date/time works best for you?:",
        )

        # Require several form labels so normal conversation is never mistaken for a lead.
        marker_count = sum(1 for marker in lead_markers if marker in low)
        if marker_count < 3:
            return

        analysis = await self.analyze_raw_lead(None, raw_text)
        summary = str(analysis.get("owner_analysis") or "").strip()

        if not summary:
            summary = (
                "This looks like a raw lead form, but I could not safely interpret enough "
                "of it to summarize without guessing."
            )

        # Speak the deterministic parser result and stop the LLM from generating
        # its own alternative story about database status, vehicle details, or next actions.
        print(f"GID_LEAD_INTERCEPT fired markers={marker_count} summary={summary!r}")
        self.session.say(
            summary,
            allow_interruptions=True,
            add_to_chat_ctx=True,
        )
        raise StopResponse()

    def _flatten_lead_payload(self, value: Any) -> list[str]:
        """Collect human-entered text from an arbitrary raw lead payload."""
        out: list[str] = []
        if isinstance(value, dict):
            for v in value.values():
                out.extend(self._flatten_lead_payload(v))
        elif isinstance(value, list):
            for v in value:
                out.extend(self._flatten_lead_payload(v))
        elif value is not None:
            s = str(value).strip()
            if s:
                out.append(s)
        return out

    def _classify_lead_service(self, *values: Any) -> tuple[str | None, list[str]]:
        text_blob = " ".join(str(v or "") for v in values).lower()
        matches: list[tuple[str, tuple[str, ...]]] = [
            ("brakes", ("brake", "brakes", "brake change", "brake job", "pads", "rotors")),
            ("oil", ("oil change", "oil service")),
            ("diag", ("diagnostic", "diagnostics", "check engine", "check-engine", "diagnose")),
            ("suspension", ("suspension", "strut", "struts", "shock", "shocks", "control arm")),
            ("audio", ("audio", "stereo", "speaker", "speakers", "radio")),
            ("full", ("full service", "maintenance", "tune up", "tune-up")),
        ]
        evidence: list[str] = []
        for canonical, phrases in matches:
            for phrase in phrases:
                if phrase in text_blob:
                    evidence.append(phrase)
                    return canonical, evidence
        return None, evidence

    def _looks_like_vehicle(self, value: Any) -> bool:
        s = str(value or "").strip()
        if not s:
            return False
        low = s.lower()
        # A year plus some other text is a strong vehicle signal.
        if re.search(r"\b(19|20)\d{2}\b", s):
            return True
        common_makes = (
            "toyota", "honda", "ford", "chevy", "chevrolet", "gmc", "nissan",
            "subaru", "jeep", "dodge", "ram", "kia", "hyundai", "mazda",
            "lexus", "acura", "bmw", "mercedes", "audi", "volkswagen", "vw",
            "tesla", "buick", "cadillac", "chrysler", "lincoln", "mitsubishi",
        )
        return any(make in low for make in common_makes)

    def _lead_schedule_intent(self, value: Any) -> dict[str, Any]:
        raw = str(value or "").strip()
        low = raw.lower()
        flexible_terms = (
            "whenever", "anytime", "any time", "asap", "a.s.a.p",
            "soonest", "earliest", "first available", "next available",
        )
        if any(term in low for term in flexible_terms):
            return {
                "kind": "earliest_available",
                "customer_text": raw,
                "booked": False,
                "needs_schedule_lookup": True,
            }
        if not raw:
            return {
                "kind": "missing",
                "customer_text": "",
                "booked": False,
                "needs_schedule_lookup": False,
            }
        return {
            "kind": "customer_preference",
            "customer_text": raw,
            "booked": False,
            "needs_schedule_lookup": True,
        }

    def _lead_issue_quality(self, value: Any) -> dict[str, Any]:
        raw = str(value or "").strip()
        low = " ".join(raw.lower().split())
        vague_exact = {
            "", "nothing", "none", "n/a", "na", "not sure", "unsure",
            "nothing just going bad", "just going bad", "just needs work",
            "needs work", "idk", "i don't know", "dont know",
        }
        if low in vague_exact:
            return {
                "usable": False,
                "customer_text": raw,
                "reason": "vague_or_missing",
            }
        # Very short non-specific answers should not be treated as a diagnosis.
        if len(low) < 5:
            return {
                "usable": False,
                "customer_text": raw,
                "reason": "too_vague",
            }
        return {
            "usable": True,
            "customer_text": raw,
            "reason": None,
        }

    def _extract_raw_lead_fields(self, raw_text: str) -> dict[str, str]:
        """Parse Meta lead text whether fields are separated by newlines or spaces."""
        raw = " ".join((raw_text or "").replace("\r", " ").replace("\n", " ").split())

        labels = [
            (
                "email",
                re.compile(r"\bEmail\s*:\s*", re.IGNORECASE),
            ),
            (
                "full_name",
                re.compile(r"\bFull\s*name\s*:\s*", re.IGNORECASE),
            ),
            (
                "issue",
                re.compile(
                    r"\bWhat\s+issues\s+are\s+you\s+experiencing\s+with\s+your\s+vehicle\?\s*:\s*",
                    re.IGNORECASE,
                ),
            ),
            (
                "phone",
                re.compile(r"\bPhone\s*number\s*:\s*", re.IGNORECASE),
            ),
            (
                "vehicle",
                re.compile(
                    r"\bYear\s*/\s*Make\s*/\s*Model\s*/\s*Engine\s*Size\?\s*:\s*",
                    re.IGNORECASE,
                ),
            ),
            (
                "schedule",
                re.compile(
                    r"\bWhat\s+Date\s*/\s*Time\s+works\s+best\s+for\s+you\?\s*:\s*",
                    re.IGNORECASE,
                ),
            ),
        ]

        hits: list[tuple[int, int, str]] = []
        for key, pattern in labels:
            match = pattern.search(raw)
            if match:
                hits.append((match.start(), match.end(), key))

        hits.sort(key=lambda item: item[0])
        out = {
            "email": "",
            "full_name": "",
            "issue": "",
            "phone": "",
            "vehicle": "",
            "schedule": "",
        }

        for idx, (_, value_start, key) in enumerate(hits):
            value_end = hits[idx + 1][0] if idx + 1 < len(hits) else len(raw)
            out[key] = raw[value_start:value_end].strip(" \t,;.-")

        return out

    async def analyze_raw_lead(self, context: RunContext, raw_text: str) -> dict[str, Any]:
        """Analyze a pasted Meta/Facebook/Instagram lead form directly from the user's message. Use this before any database lookup whenever form labels are present, even if the user did not explicitly ask to analyze it. Prefer the returned owner_analysis for the owner-facing response."""
        fields = self._extract_raw_lead_fields(raw_text)

        name = fields.get("full_name", "")
        name_parts = name.split()
        first_name = name_parts[0] if name_parts else ""
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

        vehicle_raw = fields.get("vehicle", "")
        issue_raw = fields.get("issue", "")
        schedule_raw = fields.get("schedule", "")

        service, evidence = self._classify_lead_service(vehicle_raw, issue_raw, raw_text)
        vehicle_valid = self._looks_like_vehicle(vehicle_raw)
        issue = self._lead_issue_quality(issue_raw)
        schedule = self._lead_schedule_intent(schedule_raw)

        misplaced_service = bool(service and vehicle_raw and not vehicle_valid)

        missing: list[str] = []
        if not vehicle_valid:
            missing.append("vehicle")
        if not service:
            missing.append("service")
        if not issue["usable"]:
            missing.append("usable_issue_description")

        questions: list[str] = []
        if "vehicle" in missing:
            questions.append("What is the year, make, model, and engine size of the vehicle?")
        if "service" in missing:
            questions.append("What service or repair are you looking to have done?")
        if "usable_issue_description" in missing and service != "brakes":
            questions.append("What symptoms or problem are you noticing with the vehicle?")

        if service == "brakes" and "vehicle" in missing:
            customer_reply = (
                f"Hi {first_name or 'there'}, thanks for reaching out to GID Garage. "
                "I can help with the brake service. What is the year, make, model, and engine size "
                "of the vehicle? Once I have that, I can check the earliest available appointment for you."
            )
        elif questions:
            customer_reply = (
                f"Hi {first_name or 'there'}, thanks for reaching out to GID Garage. "
                + " ".join(questions)
            )
        else:
            customer_reply = (
                f"Hi {first_name or 'there'}, thanks for reaching out to GID Garage. "
                "I have the details. I can check the schedule and get you the next available appointment."
            )

        owner_analysis_parts: list[str] = []
        if service:
            owner_analysis_parts.append(f"{name or 'This lead'} appears to want {service} service.")
        else:
            owner_analysis_parts.append(f"{name or 'This lead'} did not provide a clear service request.")

        if not vehicle_valid:
            if misplaced_service:
                owner_analysis_parts.append(
                    f'The vehicle field contains "{vehicle_raw}", which looks like a service request rather than year/make/model/engine, so the vehicle information is missing.'
                )
            else:
                owner_analysis_parts.append("Vehicle information is missing.")

        if not issue["usable"]:
            issue_display = issue_raw or "blank"
            owner_analysis_parts.append(
                f'The issue answer "{issue_display}" is too vague to treat as a usable symptom.'
            )

        if schedule["kind"] == "earliest_available":
            owner_analysis_parts.append(
                f'The scheduling answer "{schedule_raw}" means the customer is flexible and wants the earliest real opening; it is not a booked appointment.'
            )
        elif schedule["kind"] == "customer_preference":
            owner_analysis_parts.append(
                f'The customer gave a scheduling preference of "{schedule_raw}", but no appointment is booked yet.'
            )

        owner_analysis = " ".join(owner_analysis_parts)

        return {
            "owner_analysis": owner_analysis,
            "customer": {
                "first_name": first_name or None,
                "last_name": last_name or None,
                "email": fields.get("email") or None,
                "phone": fields.get("phone") or None,
            },
            "raw_fields": fields,
            "interpreted": {
                "vehicle": vehicle_raw if vehicle_valid else None,
                "service": service,
                "issue": issue,
                "schedule": schedule,
            },
            "flags": [
                *(
                    ["service_answer_found_in_vehicle_field"]
                    if misplaced_service else []
                ),
                *(
                    ["issue_answer_is_vague"]
                    if not issue["usable"] else []
                ),
                *(
                    ["customer_is_schedule_flexible"]
                    if schedule["kind"] == "earliest_available" else []
                ),
            ],
            "missing_or_needs_clarification": missing,
            "questions_to_ask": questions,
            "recommended_customer_reply": customer_reply,
            "safe_to_auto_book": False,
            "booking_guidance": (
                "Check the live schedule and propose the earliest real opening after required vehicle information is known."
                if schedule["kind"] == "earliest_available"
                else "Do not create a booking until the requested date/time has been matched to a real available slot."
            ),
            "confidence": {
                "vehicle": "high" if vehicle_valid else "missing",
                "service": "high" if service and evidence else ("missing" if not service else "medium"),
                "issue": "high" if issue["usable"] else "low",
                "schedule": "high" if schedule_raw else "missing",
            },
        }

    async def recommend_lead_response(self, context: RunContext, raw_text: str) -> dict[str, Any]:
        """Return a concise owner summary plus a professional draft response for pasted lead text."""
        analysis = await self.analyze_raw_lead(context, raw_text)
        interpreted = analysis["interpreted"]
        customer = analysis["customer"]

        owner_summary_parts = []
        name = " ".join(x for x in [customer.get("first_name"), customer.get("last_name")] if x)
        if name:
            owner_summary_parts.append(name)
        if interpreted.get("service"):
            owner_summary_parts.append(f"appears to want {interpreted['service']} service")
        if not interpreted.get("vehicle"):
            owner_summary_parts.append("vehicle information is missing")
        if not interpreted.get("issue", {}).get("usable"):
            owner_summary_parts.append("issue description is not useful")
        if interpreted.get("schedule", {}).get("kind") == "earliest_available":
            owner_summary_parts.append("customer is flexible and wants the next available opening")

        return {
            "owner_summary": "; ".join(owner_summary_parts) + ".",
            "draft_reply": analysis["recommended_customer_reply"],
            "questions_to_ask": analysis["questions_to_ask"],
            "safe_to_send_without_editing": False,
            "requires_owner_confirmation_before_contact": True,
            "safe_to_auto_book": False,
            "analysis": analysis,
        }

    async def analyze_lead(self, context: RunContext, lead_id: str) -> dict[str, Any]:
        """Interpret one noisy lead form without blindly trusting which field each answer landed in."""
        rows = await db().get(
            "leads",
            {
                "select": "*",
                "id": f"eq.{lead_id}",
                "limit": "1",
            },
        )
        if not rows:
            raise ValueError("No lead found with that id")

        lead = rows[0]
        raw_payload = lead.get("raw_payload")
        flattened = self._flatten_lead_payload(raw_payload)

        vehicle_raw = str(lead.get("vehicle") or "").strip()
        requested_raw = str(lead.get("requested_service") or "").strip()
        notes_raw = str(lead.get("notes") or "").strip()

        service, service_evidence = self._classify_lead_service(
            requested_raw, vehicle_raw, notes_raw, *flattened
        )

        vehicle_valid = self._looks_like_vehicle(vehicle_raw)

        # A service-only value in the vehicle field is treated as misplaced form data.
        vehicle_field_service, _ = self._classify_lead_service(vehicle_raw)
        misplaced_vehicle_field = bool(vehicle_raw and vehicle_field_service and not vehicle_valid)

        # Search likely payload strings for a real vehicle if the normalized vehicle field is bad.
        recovered_vehicle = None
        if not vehicle_valid:
            for candidate in flattened:
                if self._looks_like_vehicle(candidate):
                    recovered_vehicle = candidate
                    break

        # Existing notes often contain the issue text when captured by a webhook.
        issue_source = notes_raw
        issue = self._lead_issue_quality(issue_source)

        # Try to recover a schedule answer from raw payload text when present.
        schedule_candidate = ""
        for candidate in flattened:
            low = candidate.lower()
            if any(x in low for x in ("whenever", "anytime", "asap", "soonest", "available")):
                schedule_candidate = candidate
                break
        schedule = self._lead_schedule_intent(schedule_candidate)

        missing: list[str] = []
        if not (vehicle_valid or recovered_vehicle):
            missing.append("vehicle")
        if not service:
            missing.append("service")
        if not issue["usable"]:
            missing.append("usable_issue_description")

        flags: list[str] = []
        if misplaced_vehicle_field:
            flags.append("service_answer_found_in_vehicle_field")
        if not issue["usable"]:
            flags.append("issue_answer_is_vague")
        if schedule["kind"] == "earliest_available":
            flags.append("customer_is_schedule_flexible")

        return {
            "lead_id": lead_id,
            "customer": {
                "name": f"{lead.get('fname') or ''} {lead.get('lname') or ''}".strip(),
                "phone": lead.get("phone"),
                "email": lead.get("email"),
                "source": lead.get("source"),
                "campaign": lead.get("campaign"),
            },
            "interpreted": {
                "vehicle": vehicle_raw if vehicle_valid else recovered_vehicle,
                "service": service,
                "issue": issue,
                "schedule": schedule,
            },
            "raw": {
                "vehicle_field": vehicle_raw or None,
                "requested_service_field": requested_raw or None,
                "notes": notes_raw or None,
            },
            "flags": flags,
            "missing_or_needs_clarification": missing,
            "confidence": {
                "vehicle": "high" if vehicle_valid else ("medium" if recovered_vehicle else "missing"),
                "service": "high" if service and service_evidence else ("missing" if not service else "medium"),
                "issue": "high" if issue["usable"] else "low",
                "schedule": "high" if schedule["kind"] == "earliest_available" else "medium",
            },
            "recommended_next_step": (
                "Ask for the missing vehicle year/make/model/engine before quoting or booking."
                if "vehicle" in missing
                else "Check the live schedule and propose the earliest real opening; do not auto-book."
                if schedule["kind"] == "earliest_available"
                else "Review missing fields before contacting or booking."
            ),
        }

    async def suggest_lead_openings(self, context: RunContext, lead_id: str, days_ahead: int = 14) -> dict[str, Any]:
        """Show lightly booked upcoming days for a flexible lead. This suggests days only; it does not book anything."""
        analysis = await self.analyze_lead(context, lead_id)
        if analysis["interpreted"]["schedule"]["kind"] != "earliest_available":
            return {
                "ok": False,
                "reason": "lead_not_marked_flexible",
                "analysis": analysis,
            }

        horizon = max(1, min(days_ahead, 30))
        today = datetime.now(ARIZONA).date()
        end = today + timedelta(days=horizon)
        bookings = await db().get(
            "bookings",
            [
                ("select", "id,date,time,job_status"),
                ("date", f"gte.{today.isoformat()}"),
                ("date", f"lte.{end.isoformat()}"),
                ("order", "date.asc"),
            ],
        )

        counts: dict[str, int] = {}
        times: dict[str, list[str]] = {}
        for booking in bookings:
            d = str(booking.get("date") or "")
            if not d:
                continue
            counts[d] = counts.get(d, 0) + 1
            if booking.get("time"):
                times.setdefault(d, []).append(str(booking.get("time")))

        # We intentionally do not invent business hours or job duration.
        candidates: list[dict[str, Any]] = []
        for offset in range(1, horizon + 1):
            day = today + timedelta(days=offset)
            d = day.isoformat()
            candidates.append({
                "date": d,
                "weekday": day.strftime("%A"),
                "existing_job_count": counts.get(d, 0),
                "existing_times": sorted(times.get(d, [])),
            })

        candidates.sort(key=lambda x: (x["existing_job_count"], x["date"]))
        return {
            "ok": True,
            "lead_id": lead_id,
            "note": (
                "These are lightly booked days, not guaranteed appointment slots. "
                "No business-hours or job-duration rules are configured in Jarvis yet."
            ),
            "best_days": candidates[:5],
            "analysis": analysis,
        }

    async def list_leads(self, context: RunContext, status: str, source: str, limit: int) -> list[dict[str, Any]]:
        """List recent leads. Pass an empty string for status/source when no filter is wanted. Use 15 for a normal limit."""
        params: dict[str, Any] = {"select": "*", "order": "created_at.desc", "limit": str(min(limit, 50))}
        if status: params["status"] = f"eq.{status}"
        if source: params["source"] = f"eq.{source}"
        return await db().get("leads", params)

    async def update_lead_status(self, context: RunContext, lead_id: str, status: str) -> dict[str, Any]:
        """Update a lead's status using its lead id."""
        status = status.strip().lower()
        allowed = {"new", "contacted", "quoted", "booked", "lost", "no_response"}
        if status not in allowed:
            raise ValueError(f"Lead status must be one of: {', '.join(sorted(allowed))}")
        now_iso = datetime.now(timezone.utc).isoformat()
        fields: dict[str, Any] = {"status": status, "updated_at": now_iso}
        # Same rule as web Jarvis: only a status that says contact happened stamps it.
        if status in {"contacted", "quoted"}:
            fields["last_contacted_at"] = now_iso
        await db().patch("leads", f"id=eq.{lead_id}", fields)
        return {"ok": True, "lead_id": lead_id, "status": status}

    async def list_jobs(
        self,
        context: RunContext,
        customer_id: str,
        customer_name: str,
        date_from: str,
        date_to: str,
        job_status: str,
        vehicle: str,
        service_keyword: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """List jobs/bookings. Pass empty strings for filters that are not needed. Use 15 for a normal limit."""
        params: list[tuple[str, Any]] = [
            ("select", "id,customer_id,fname,lname,vehicle,service,date,time,job_status,estimate_amount,invoice_amount,amount_paid,paid_at"),
            ("order", "date.desc"),
            ("limit", str(min(limit, 50))),
        ]
        if customer_id: params.append(("customer_id", f"eq.{customer_id}"))
        if customer_name:
            words = customer_name.strip().split()
            if len(words) >= 2:
                params.append(("and", f"(fname.ilike.*{words[0]}*,lname.ilike.*{' '.join(words[1:])}*)"))
            else:
                params.append(("or", f"(fname.ilike.*{customer_name}*,lname.ilike.*{customer_name}*)"))
        if date_from: params.append(("date", f"gte.{date_from}"))
        if date_to: params.append(("date", f"lte.{date_to}"))
        if job_status: params.append(("job_status", f"eq.{job_status.upper()}"))
        if vehicle: params.append(("vehicle", f"ilike.*{vehicle}*"))
        if service_keyword: params.append(("service", f"ilike.*{service_keyword}*"))
        return await db().get("bookings", params)

    async def reschedule_job(self, context: RunContext, job_id: str, date: str = "", time: str = "") -> dict[str, Any]:
        """Safely reschedule one booking, log the before/after state, and make it undoable."""
        fields: dict[str, Any] = {}
        if date:
            fields["date"] = date
        if time:
            fields["time"] = time
        if not fields:
            raise ValueError("A date or time is required")

        rows = await db().get(
            "bookings",
            {
                "select": "id,customer_id,fname,lname,vehicle,service,date,time,job_status",
                "id": f"eq.{job_id}",
                "limit": "1",
            },
        )
        if not rows:
            raise ValueError("No job found with that id")

        job = rows[0]
        before_patch = {key: job.get(key) for key in fields}
        changed_fields = {key: value for key, value in fields.items() if str(job.get(key) or "") != str(value)}

        if not changed_fields:
            return {
                "ok": True,
                "changed": False,
                "job_id": job_id,
                "message": "That appointment already has that date and time.",
            }

        before_state = {
            "date": job.get("date"),
            "time": job.get("time"),
            "fname": job.get("fname"),
            "lname": job.get("lname"),
            "vehicle": job.get("vehicle"),
            "service": job.get("service"),
        }
        after_state = {**before_state, **changed_fields}

        await db().patch("bookings", f"id=eq.{job_id}", changed_fields)

        customer_name = f"{job.get('fname') or ''} {job.get('lname') or ''}".strip()
        action = await db().insert(
            "jarvis_action_log",
            {
                "actor": "jarvis",
                "action_type": "reschedule_job",
                "entity_table": "bookings",
                "entity_id": str(job_id),
                "summary": (
                    f"Rescheduled {customer_name or 'booking'} from "
                    f"{job.get('date') or 'no date'} {job.get('time') or ''} to "
                    f"{after_state.get('date') or 'no date'} {after_state.get('time') or ''}"
                ).strip(),
                "resolved_intent": {
                    "action": "reschedule_job",
                    "job_id": str(job_id),
                    "requested_fields": changed_fields,
                },
                "before_state": before_state,
                "after_state": after_state,
                "undo_patch": before_patch,
                "reversible": True,
                "status": "applied",
            },
        )

        return {
            "ok": True,
            "changed": True,
            "job_id": job_id,
            "customer": customer_name,
            "vehicle": job.get("vehicle"),
            "from": before_patch,
            "to": changed_fields,
            "action_id": action.get("id") if action else None,
            "undo_available": True,
            "email_followup_available": True,
            "suggestion": "Ask Michael whether he wants the customer emailed the updated appointment details.",
        }

    async def _canonical_job_service(self, raw_value: str) -> str:
        """Normalize a spoken/human service name to the exact value used by the current admin."""
        raw = (raw_value or "").strip().lower()
        compact = " ".join(raw.replace("_", " ").replace("-", " ").split())

        aliases = {
            "oil": "oil",
            "oil change": "oil",
            "oil changes": "oil",
            "brake": "brakes",
            "brakes": "brakes",
            "break": "brakes",
            "breaks": "brakes",
            "brake job": "brakes",
            "brake service": "brakes",
            "diag": "diag",
            "diagnostic": "diag",
            "diagnostics": "diag",
            "diagnostic service": "diag",
            "suspension": "suspension",
            "suspension work": "suspension",
            "audio": "audio",
            "car audio": "audio",
            "full": "full",
            "full service": "full",
            "maintenance": "full",
            "other": "other",
            "something else": "other",
            "general inquiry": "other",
            "custom": "other",
            "other custom": "other",
        }

        if compact in aliases:
            return aliases[compact]

        # Also honor aliases stored in Supabase so this mapping can grow without
        # redeploying the agent.
        rows = await db().get(
            "jarvis_value_aliases",
            {
                "select": "canonical_value,alias",
                "table_name": "eq.bookings",
                "column_name": "eq.service",
                "enabled": "eq.true",
            },
        )
        for row in rows:
            alias = " ".join(str(row.get("alias") or "").strip().lower().replace("_", " ").replace("-", " ").split())
            if alias == compact:
                return str(row.get("canonical_value") or "").strip().lower()

        allowed = {"oil", "brakes", "diag", "suspension", "audio", "full", "other"}
        if compact in allowed:
            return compact

        raise ValueError(
            f"Unknown booking service '{raw_value}'. Allowed admin services are "
            "Oil Change, Brakes, Diagnostics, Suspension, Car Audio, Full Service, and Other."
        )

    async def update_job_service(
        self,
        context: RunContext,
        job_id: str,
        new_service: str,
        expected_current_service: str = "",
    ) -> dict[str, Any]:
        """Safely change one booking's service/category and make the change undoable."""
        rows = await db().get(
            "bookings",
            {
                "select": "id,fname,lname,vehicle,service,date,time,job_status",
                "id": f"eq.{job_id}",
                "limit": "1",
            },
        )
        if not rows:
            raise ValueError("No job found with that id")

        job = rows[0]
        current = str(job.get("service") or "").strip().lower()
        target = await self._canonical_job_service(new_service)

        if expected_current_service:
            expected = await self._canonical_job_service(expected_current_service)
            if current != expected:
                return {
                    "needs_clarification": True,
                    "reason": "current_service_mismatch",
                    "job_id": job_id,
                    "customer": f"{job.get('fname') or ''} {job.get('lname') or ''}".strip(),
                    "vehicle": job.get("vehicle"),
                    "expectedCurrentService": expected,
                    "actualCurrentService": current or None,
                    "requestedNewService": target,
                    "message": (
                        f"This job currently has service '{current or 'blank'}', not '{expected}'. "
                        "Do not change it until Michael confirms the correct job."
                    ),
                }

        if current == target:
            return {
                "ok": True,
                "changed": False,
                "job_id": job_id,
                "service": target,
                "message": "That job already has that service.",
            }

        before_state = {
            "service": current,
            "fname": job.get("fname"),
            "lname": job.get("lname"),
            "vehicle": job.get("vehicle"),
            "date": job.get("date"),
            "time": job.get("time"),
        }
        after_state = {**before_state, "service": target}

        await db().patch("bookings", f"id=eq.{job_id}", {"service": target})

        action = await db().insert(
            "jarvis_action_log",
            {
                "actor": "jarvis",
                "action_type": "update_job_service",
                "entity_table": "bookings",
                "entity_id": str(job_id),
                "summary": (
                    f"Changed {job.get('fname') or ''} {job.get('lname') or ''}'s "
                    f"job service from {current or 'blank'} to {target}"
                ).strip(),
                "resolved_intent": {
                    "action": "update_job_service",
                    "job_id": str(job_id),
                    "new_service": target,
                    "expected_current_service": expected_current_service or None,
                },
                "before_state": before_state,
                "after_state": after_state,
                "undo_patch": {"service": current},
                "reversible": True,
                "status": "applied",
            },
        )

        return {
            "ok": True,
            "changed": True,
            "job_id": job_id,
            "customer": f"{job.get('fname') or ''} {job.get('lname') or ''}".strip(),
            "vehicle": job.get("vehicle"),
            "from": current or None,
            "to": target,
            "action_id": action.get("id") if action else None,
            "undo_available": True,
        }

    async def undo_last_action(self, context: RunContext) -> dict[str, Any]:
        """Undo the most recent reversible Jarvis change."""
        rows = await db().get(
            "jarvis_action_log",
            {
                "select": "*",
                "status": "eq.applied",
                "reversible": "eq.true",
                "order": "created_at.desc",
                "limit": "1",
            },
        )
        if not rows:
            return {"ok": False, "nothing_to_undo": True, "message": "There is no reversible Jarvis change to undo."}

        action = rows[0]
        if action.get("entity_table") != "bookings":
            raise ValueError("The latest reversible action is not a supported booking change.")

        entity_id = str(action.get("entity_id") or "")
        undo_patch = action.get("undo_patch") or {}
        if not entity_id or not isinstance(undo_patch, dict) or not undo_patch:
            raise ValueError("The latest action does not contain a usable undo patch.")

        allowed_undo_fields = {"service", "date", "time", "job_status"}
        safe_patch = {k: v for k, v in undo_patch.items() if k in allowed_undo_fields}
        if not safe_patch:
            raise ValueError("The latest action has no safe fields to undo.")

        await db().patch("bookings", f"id=eq.{entity_id}", safe_patch)
        await db().patch(
            "jarvis_action_log",
            f"id=eq.{action['id']}",
            {
                "status": "undone",
                "undone_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        return {
            "ok": True,
            "undone": True,
            "action_id": action.get("id"),
            "summary": action.get("summary"),
            "restored": safe_patch,
        }

    async def pricing_history(self, context: RunContext, service_keyword: str, vehicle: str = "") -> dict[str, Any]:
        """Look up historical GID Garage prices for a repair/service."""
        params: dict[str, Any] = {
            "select": "vehicle,estimate_amount,invoice_amount,job_status",
            "service": f"ilike.*{service_keyword}*",
            "order": "created_at.desc",
            "limit": "20",
        }
        if vehicle: params["vehicle"] = f"ilike.*{vehicle}*"
        jobs = await db().get("bookings", params)
        amounts = [float(j.get("invoice_amount") or j.get("estimate_amount") or 0) for j in jobs]
        amounts = [x for x in amounts if x > 0]
        return {
            "count": len(jobs),
            "priceRange": {
                "min": money(min(amounts)),
                "max": money(max(amounts)),
                "avg": money(sum(amounts) / len(amounts)),
            } if amounts else None,
            "samples": [{"vehicle": j.get("vehicle"), "price": money(j.get("invoice_amount") or j.get("estimate_amount"))} for j in jobs[:5]],
        }

    async def get_tax_rate(self, context: RunContext) -> dict[str, Any]:
        """Get current tax, overhead, and Stripe fee settings."""
        rows = await db().get("business_settings", {"select": "*", "id": "eq.default", "limit": "1"})
        s = rows[0] if rows else {}
        return {
            "taxRatePct": float(s["tax_rate"]) * 100 if s.get("tax_rate") is not None else None,
            "monthlyOverhead": s.get("owner_monthly_overhead"),
            "stripeFeePct": float(s["owner_stripe_fee_pct"]) * 100 if s.get("owner_stripe_fee_pct") is not None else None,
        }

    async def add_marketing_spend(self, context: RunContext, date: str, channel: str, amount: float) -> dict[str, Any]:
        """Log a marketing-spend entry."""
        row = await db().insert("marketing_spend", {"date": date, "channel": channel, "amount": amount})
        return {"ok": True, "entry": row}

    async def log_call(self, context: RunContext, phone: str, outcome: str, direction: str = "inbound", notes: str = "") -> dict[str, Any]:
        """Log a phone call and its outcome."""
        row = await db().insert("calls", {"phone": phone, "direction": direction, "outcome": outcome, "notes": notes or None})
        return {"ok": True, "call": row}

    async def list_calls(self, context: RunContext, outcome: str = "", limit: int = 15) -> list[dict[str, Any]]:
        """List recently logged calls."""
        params: dict[str, Any] = {"select": "*", "order": "created_at.desc", "limit": str(min(limit, 50))}
        if outcome: params["outcome"] = f"eq.{outcome}"
        return await db().get("calls", params)

    async def list_marketing_spend(self, context: RunContext, channel: str = "", limit: int = 20) -> list[dict[str, Any]]:
        """List recent marketing spend entries, optionally by channel."""
        params: dict[str, Any] = {"select": "*", "order": "date.desc", "limit": str(min(limit, 50))}
        if channel: params["channel"] = f"eq.{channel}"
        return await db().get("marketing_spend", params)

    async def search_customers(self, context: RunContext, query: str) -> list[dict[str, Any]]:
        """Find a customer by name, phone, or VIN."""
        q = query.strip()
        words = q.split()
        parts: list[str] = []
        if len(words) >= 2:
            parts.append(f"and(fname.ilike.*{words[0]}*,lname.ilike.*{' '.join(words[1:])}*)")
        parts.extend([f"fname.ilike.*{q}*", f"lname.ilike.*{q}*", f"phone.ilike.*{q}*", f"vin.ilike.*{q}*"])
        return await db().get(
            "customers",
            {"select": "id,fname,lname,phone,email,vehicle,vin,notes", "or": f"({','.join(parts)})", "limit": "10"},
        )

    async def update_job_status(self, context: RunContext, job_id: str, job_status: str) -> dict[str, Any]:
        """Update a job pipeline status. Never use this for PAID."""
        status = job_status.upper()
        if status == "PAID":
            raise ValueError("Use mark_job_paid for PAID so the payment amount is recorded")
        allowed = {"BOOKED", "ESTIMATE_SENT", "SIGNED", "IN_PROGRESS", "COMPLETED", "INVOICED"}
        if status not in allowed:
            raise ValueError(f"Unsupported job status: {status}")
        await db().patch("bookings", f"id=eq.{job_id}", {"job_status": status})
        return {"ok": True, "status": status}

    async def email_appointment_update(
        self,
        context: RunContext,
        job_id: str,
        confirmed: bool = False,
    ) -> dict[str, Any]:
        """Prepare/send the standard appointment-updated email for a booking. Always confirm before send."""
        rows = await db().get(
            "bookings",
            {
                "select": "id,customer_id,fname,lname,vehicle,service,date,time",
                "id": f"eq.{job_id}",
                "limit": "1",
            },
        )
        if not rows:
            raise ValueError("No job found with that id")

        job = rows[0]
        email = ""
        customer_name = f"{job.get('fname') or ''} {job.get('lname') or ''}".strip()

        customer_id = str(job.get("customer_id") or "").strip()
        if customer_id:
            customers = await db().get(
                "customers",
                {
                    "select": "id,fname,lname,email",
                    "id": f"eq.{customer_id}",
                    "limit": "1",
                },
            )
            if customers:
                customer = customers[0]
                email = str(customer.get("email") or "").strip()
                if not customer_name:
                    customer_name = f"{customer.get('fname') or ''} {customer.get('lname') or ''}".strip()

        if not email:
            raise ValueError("That booking does not have a customer email on file.")

        templates = await db().get(
            "jarvis_email_templates",
            {
                "select": "subject_template,body_html_template",
                "template_key": "eq.appointment_updated",
                "active": "eq.true",
                "limit": "1",
            },
        )

        subject = "Your GID Garage appointment has been updated"
        body = (
            "<p>Hi {{first_name}},</p>"
            "<p>Your GID Garage appointment has been updated to "
            "<strong>{{new_date}}</strong> at <strong>{{new_time}}</strong>.</p>"
            "<p>If you have any questions or need another adjustment, just reply to this email.</p>"
            "<p>Thank you,<br>GID Garage</p>"
        )
        if templates:
            subject = str(templates[0].get("subject_template") or subject)
            body = str(templates[0].get("body_html_template") or body)

        first_name = str(job.get("fname") or "").strip() or "there"
        replacements = {
            "{{first_name}}": html.escape(first_name),
            "{{new_date}}": html.escape(str(job.get("date") or "the updated date")),
            "{{new_time}}": html.escape(str(job.get("time") or "the updated time")),
            "{{service}}": html.escape(str(job.get("service") or "")),
            "{{vehicle}}": html.escape(str(job.get("vehicle") or "")),
        }
        rendered = body
        for token, value in replacements.items():
            rendered = rendered.replace(token, value)

        summary = (
            f"Email {customer_name or email} at {email} confirming the appointment "
            f"is now {job.get('date') or 'date not set'} at {job.get('time') or 'time not set'}."
        )

        if not confirmed:
            return {
                "needs_confirmation": True,
                "summary": summary,
                "to_email": email,
                "to_name": customer_name,
                "subject": subject,
                "preview": rendered,
            }

        await send_brevo_email(email, customer_name, subject, rendered)
        return {
            "ok": True,
            "sent": True,
            "sentTo": email,
            "customer": customer_name,
            "subject": subject,
        }


    async def send_customer_email(
        self,
        context: RunContext,
        to_email: str,
        subject: str,
        body_html: str,
        to_name: str = "",
        confirmed: bool = False,
    ) -> dict[str, Any]:
        """Send a customer email. Call with confirmed=false first; only set true after Michael clearly confirms."""
        summary = f'Send an email to {to_name or to_email} <{to_email}> with subject "{subject}".'
        if not confirmed:
            return {"needs_confirmation": True, "summary": summary}
        await send_brevo_email(to_email, to_name, subject, body_html)
        return {"ok": True, "sentTo": to_email}


    @function_tool
    async def show_on_screen(self, context: RunContext, view: str, args_json: str) -> Any:
        """Open a view on Michael's /jarvis screen. view is one of:
        show_jobs {"customer", "vehicle", "service", "count", "newest_first", "tab", "date"} (date as spoken, e.g. "September 26th") (tab: overview, estimate, payment, inspection, notes, parts; "last three" = count 3, still oldest to newest),
        show_revenue {"period"} (today, yesterday, this_week, this_month, last_month, this_year) or {"last_days": N} or {"month": "september"} or {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"},
        show_calendar {"when"} (today, tomorrow, this week, next week, a weekday, YYYY-MM-DD),
        show_job_list {"query", "status"}, show_customers {"query"}.
        args_json is a JSON object string. Speak one short sentence afterward."""
        if view not in SCREEN_VIEWS:
            raise ValueError(f"view must be one of {sorted(SCREEN_VIEWS)}")
        try:
            args = json.loads(args_json or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError(f"args_json must be valid JSON: {exc}") from exc
        try:
            result = await backend_business(view, args if isinstance(args, dict) else {})
        except Exception as exc:
            return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        actions = result.pop("__ui", []) if isinstance(result, dict) else []
        if actions and self._ui_room is not None:
            payload = json.dumps({"actions": actions})
            try:
                lp = self._ui_room.local_participant
                if hasattr(lp, "send_text"):
                    await lp.send_text(payload, topic="gid.ui")
                else:
                    await lp.publish_data(payload.encode(), reliable=True, topic="gid.ui")
            except Exception as exc:
                print(f"gid.ui publish error: {type(exc).__name__}: {exc}")
                return {**result, "onScreen": False, "error": "The screen could not be updated."}
        return result

    @function_tool
    async def gid_business(
        self,
        context: RunContext,
        action: str,
        args_json: str,
    ) -> Any:
        """Use GID Garage business data/actions.

        action must be one of:
        get_business_summary, get_owner_briefing, get_revenue_summary, get_owner_pay_summary,
        get_customer_context, get_job_detail, get_vehicle_jobs, find_people, compare_revenue_periods,
        get_action_center, get_unpaid_jobs, get_data_health, cancel_job, reopen_job,
        list_leads, analyze_lead, analyze_raw_lead, recommend_lead_response, suggest_lead_openings,
        update_lead_status, list_jobs, reschedule_job, update_job_service, undo_last_action,
        pricing_history, get_tax_rate, add_marketing_spend, log_call, list_calls,
        list_marketing_spend, search_customers, update_job_status, mark_job_paid,
        email_appointment_update, send_customer_email.

        Args by action: get_revenue_summary {"period"} with period one of today, this_month,
        last_month, this_year, last_7_days, last_30_days, last_N_days (this_week = last 7 days);
        get_owner_pay_summary {"period"}; get_customer_context {"query"} (a name or phone) or
        {"customer_id"}; get_job_detail {"job_id"}; mark_job_paid {"job_id", "amount", "method",
        "confirmed"} with method one of Cash, Check, Zelle, Card (Stripe), Other; cancel_job
        {"job_id", "reason", "confirmed"}; compare_revenue_periods {"period_a", "period_b"};
        get_vehicle_jobs {"vehicle"}. Only say something was done after the result has ok true.

        args_json must be a JSON object string containing that action's arguments.

        LEAD ROUTING:
        - When the user pastes a lead-form message containing labels like Email:, Full name:,
          Phone number:, Year/Make/Model/Engine Size?:, or What Date/Time works best for you?:,
          use analyze_raw_lead immediately with {"raw_text": "<the entire pasted message>"}.
        - Do NOT search customers or leads first for a pasted raw form.
        - A pasted raw form should be analyzed even when the user does not explicitly say "analyze this."
        - After analyze_raw_lead, base the spoken answer on owner_analysis. Do not replace it with a generic sales follow-up.

        Use empty strings for unused text filters. For list limits, use 15 unless
        Michael asks for more. mark_job_paid, email_appointment_update, and
        send_customer_email must first use confirmed=false; only use confirmed=true
        after Michael clearly confirms.
        """
        try:
            args = json.loads(args_json or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError(f"args_json must be valid JSON: {exc}") from exc

        if not isinstance(args, dict):
            raise ValueError("args_json must decode to a JSON object")

        actions = {
            "list_leads": self.list_leads,
            "analyze_lead": self.analyze_lead,
            "analyze_raw_lead": self.analyze_raw_lead,
            "recommend_lead_response": self.recommend_lead_response,
            "suggest_lead_openings": self.suggest_lead_openings,
            "update_lead_status": self.update_lead_status,
            "list_jobs": self.list_jobs,
            "reschedule_job": self.reschedule_job,
            "update_job_service": self.update_job_service,
            "undo_last_action": self.undo_last_action,
            "pricing_history": self.pricing_history,
            "get_tax_rate": self.get_tax_rate,
            "add_marketing_spend": self.add_marketing_spend,
            "log_call": self.log_call,
            "list_calls": self.list_calls,
            "list_marketing_spend": self.list_marketing_spend,
            "search_customers": self.search_customers,
            "update_job_status": self.update_job_status,
            "email_appointment_update": self.email_appointment_update,
            "send_customer_email": self.send_customer_email,
        }

        if action in BACKEND_ACTIONS:
            try:
                return await backend_business(action, args)
            except Exception as exc:
                return {"ok": False, "action": action, "error": f"{type(exc).__name__}: {exc}"}

        fn = actions.get(action)
        if fn is None:
            raise ValueError(f"Unsupported GID action: {action}")

        # Fill normal defaults here instead of exposing dozens of nullable/union
        # parameters to Anthropic's tool-schema compiler.
        defaults = {
            "list_leads": {"status": "", "source": "", "limit": 15},
            "suggest_lead_openings": {"days_ahead": 14},
            "list_jobs": {
                "customer_id": "",
                "customer_name": "",
                "date_from": "",
                "date_to": "",
                "job_status": "",
                "vehicle": "",
                "service_keyword": "",
                "limit": 15,
            },
            "reschedule_job": {"date": "", "time": ""},
            "update_job_service": {"expected_current_service": ""},
            "undo_last_action": {},
            "pricing_history": {"vehicle": ""},
            "log_call": {"direction": "inbound", "notes": ""},
            "list_calls": {"outcome": "", "limit": 15},
            "list_marketing_spend": {"channel": "", "limit": 20},
            "email_appointment_update": {"confirmed": False},
            "send_customer_email": {"to_name": "", "confirmed": False},
        }
        merged = {**defaults.get(action, {}), **args}
        try:
            return await fn(context, **merged)
        except Exception as exc:
            return {
                "ok": False,
                "action": action,
                "error": f"{type(exc).__name__}: {exc}",
            }



server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def gid_jarvis(ctx: JobContext):
    # Validate the business connection before starting a room so configuration
    # errors surface in the agent logs, not halfway through a voice command.
    db()

    # IMPORTANT: explicitly bind the AgentSession to the actual browser
    # participant. This removes the race where the agent can start before the
    # site's mic track is published and end up listening to nobody.
    print(f"GID_DIAG job room={ctx.room.name}")
    participant = await ctx.wait_for_participant()
    print(f"GID_DIAG participant={participant.identity}")

    session = AgentSession(
        stt=inference.STT(model=STT_MODEL, language="en"),
        llm=inference.LLM(model=LLM_MODEL, extra_kwargs={"max_completion_tokens": VOICE_LLM_MAX_TOKENS}),
        tts=inference.TTS(
            model=TTS_MODEL,
            voice=TTS_VOICE,
            language="en",
            extra_kwargs={"speed": TTS_SPEED, "emotion": "calm", "volume": 0.50, "max_buffer_delay_ms": 80},
        ),
        turn_handling=TurnHandlingOptions(
            turn_detection="stt",
            preemptive_generation={
                "enabled": False,
            },
        ),
    )

    # The website's existing text/business agent remains authoritative for
    # Quick Commands. It sends the final answer on this private text topic and
    # this handler speaks it through the SAME Cartesia voice, without another LLM call.
    voice_disabled = {"reason": None}

    async def _disable_voice(info: dict[str, Any]) -> None:
        """Quota/rate limit: tell the page voice is unavailable, then leave the room."""
        try:
            await ctx.room.local_participant.send_text(
                json.dumps({"voice": "unavailable", **{k: info[k] for k in ("component", "model", "status", "quota")}}),
                topic="gid.status",
            )
        except Exception as exc:
            print(f"GID_VOICE status publish failed: {type(exc).__name__}")
        await asyncio.sleep(1.5)
        ctx.shutdown(reason=f"voice unavailable: {info['component']} {info['status'] or ''} quota={info['quota']}")

    @session.on("error")
    def _on_voice_error(ev) -> None:
        info = describe_voice_error(ev)
        print(
            f"GID_VOICE_ERROR component={info['component']} provider={info['provider']} model={info['model']} "
            f"status={info['status']} quota={info['quota']} recoverable={info['recoverable']} detail={info['detail']!r}"
        )
        if info["quota"] and voice_disabled["reason"] is None:
            voice_disabled["reason"] = info["component"]
            # Keep the session from crashing/looping; we shut down deliberately instead.
            try:
                ev.error.recoverable = True
            except Exception:
                pass
            asyncio.create_task(_disable_voice(info))

    async def _speak_stream(reader, participant_identity: str) -> None:
        if participant_identity != participant.identity:
            return
        if voice_disabled["reason"]:
            return
        try:
            text = await reader.read_all()
            if isinstance(text, list):
                text = "".join(str(part) for part in text)
            text = str(text).strip()
            if text:
                print(f"GID_DIAG speak_stream chars={len(text)}")
                handle = session.say(text, allow_interruptions=True, add_to_chat_ctx=False)
                await handle
                print("GID_DIAG speak_stream played")
        except Exception as exc:
            print(f"gid.speak handler error: {type(exc).__name__}: {exc}")

    def _handle_speak_stream(reader, participant_identity: str) -> None:
        asyncio.create_task(_speak_stream(reader, participant_identity))

    await session.start(
        room=ctx.room,
        agent=GIDJarvis(ui_room=ctx.room),
        room_options=room_io.RoomOptions(
            participant_identity=participant.identity,
            text_input=True,
            audio_input=True,
            audio_output=True,
            text_output=True,
        ),
    )
    print(f"GID_DIAG session_started linked={getattr(session.room_io.linked_participant, 'identity', None)}")
    ctx.room.register_text_stream_handler("gid.speak", _handle_speak_stream)

    agent_ref = session.current_agent

    async def _handled_stream(reader, participant_identity: str) -> None:
        if participant_identity != participant.identity:
            return
        try:
            text = await reader.read_all()
            if isinstance(text, list):
                text = "".join(str(part) for part in text)
            key = normalize_utterance(text)
            if key and isinstance(agent_ref, GIDJarvis):
                now = asyncio.get_event_loop().time()
                agent_ref.page_handled = {k: t for k, t in agent_ref.page_handled.items() if now - t < 10}
                agent_ref.page_handled[key] = now
        except Exception as exc:
            print(f"gid.handled handler error: {type(exc).__name__}")

    ctx.room.register_text_stream_handler("gid.handled", lambda reader, pid: asyncio.create_task(_handled_stream(reader, pid)))



if __name__ == "__main__":
    agents.cli.run_app(server)
