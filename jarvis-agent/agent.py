import asyncio
import html
import json
import os
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


_db: GIDData | None = None


def db() -> GIDData:
    global _db
    if _db is None:
        _db = GIDData()
    return _db


async def send_brevo_email(to_email: str, to_name: str, subject: str, body_html: str) -> None:
    key = os.getenv("BREVO_API_KEY")
    if not key:
        raise RuntimeError("BREVO_API_KEY is not configured; email was not sent")

    safe_body = body_html
    payload = {
        "sender": {"name": "GID Garage", "email": "bookings@gidgarage.com"},
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


class GIDJarvis(Agent):
    def __init__(self) -> None:
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

BUSINESS DATA:
- You have one live GID Garage dispatcher tool named gid_business for jobs, customers, leads, calls, marketing, pricing, owner pay, and email.
- Never invent business facts. For live business information, call gid_business with the appropriate action and a JSON object string in args_json.
- For questions about revenue, sales, money made, or weekly totals, use action get_revenue_summary. Use period=this_week unless Michael explicitly asks for the last 7 days.
- Low-risk writes may be done immediately only after you have identified the exact record and read its current value.
- For a requested job service/category change, first use list_jobs to identify exactly one booking. Then use update_job_service with that booking id. If Michael says "from X to Y", pass X as expected_current_service so the write is rejected if the live record does not match what he said.
- The bookings.service field uses these canonical admin values: oil, brakes, diag, suspension, audio, full, other. Human phrases such as "Brakes", "brake job", "breaks", "Diagnostics", "Oil Change", "Full Service", and "Other" must be normalized to those values.
- Never guess which job Michael means when more than one booking could match. Ask a short clarification instead.
- After a successful reversible change, briefly state what changed and say "Say undo that if that was wrong." If Michael says "undo that", use undo_last_action.
- mark_job_paid and send_customer_email are external/financial actions. First call them with confirmed=false. Read the returned confirmation summary and ask Michael to confirm. Only repeat the tool with confirmed=true after a clear yes on the next turn.
- Never mark a job PAID using update_job_status. Use mark_job_paid so the amount is recorded.
"""
        )

    async def get_business_summary(self, context: RunContext) -> dict[str, Any]:
        """Get today's revenue/jobs, attention items, recent lead conversion, and marketing totals."""
        now = datetime.now(ARIZONA)
        today = now.date().isoformat()
        week_start = (now.date() - timedelta(days=7)).isoformat()
        next_week = (now.date() + timedelta(days=7)).isoformat()
        window_start = (now.date() - timedelta(days=30)).isoformat()

        bookings = await db().get(
            "bookings",
            [
                ("select", "id,fname,lname,vehicle,date,time,job_status,status,estimate_amount,invoice_amount,tax_amount,amount_paid,paid_at"),
                ("date", f"gte.{week_start}"),
                ("date", f"lte.{next_week}"),
            ],
        )
        leads = await db().get("leads", {"select": "*", "created_at": f"gte.{window_start}"})
        spend = await db().get("marketing_spend", {"select": "*", "date": f"gte.{window_start}"})

        todays_jobs = [b for b in bookings if b.get("date") == today and b.get("status") != "cancelled"]
        def revenue(job: dict[str, Any]) -> float:
            if job.get("paid_at") and job.get("amount_paid") is not None:
                return float(job.get("amount_paid") or 0)
            return float(job.get("invoice_amount") or job.get("estimate_amount") or 0) + float(job.get("tax_amount") or 0)

        overdue_leads = []
        now_utc = datetime.now(timezone.utc)
        for lead in leads:
            if lead.get("status") in ("booked", "lost"):
                continue
            created_raw = lead.get("created_at")
            created = None
            if created_raw:
                try:
                    created = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                except ValueError:
                    pass
            follow_raw = lead.get("follow_up_at")
            follow = None
            if follow_raw:
                try:
                    follow = datetime.fromisoformat(follow_raw.replace("Z", "+00:00"))
                except ValueError:
                    pass
            overdue = bool(follow and follow <= now_utc)
            stale = bool(created and not lead.get("last_contacted_at") and (now_utc - created).total_seconds() > 172800)
            if overdue or stale:
                overdue_leads.append(f"{lead.get('fname') or ''} {lead.get('lname') or ''}".strip() or lead.get("phone"))

        unpaid = [
            b for b in bookings
            if b.get("job_status") == "INVOICED"
            and not b.get("paid_at")
            and float(b.get("invoice_amount") or 0) > float(b.get("amount_paid") or 0)
        ]
        booked_count = sum(1 for lead in leads if lead.get("status") == "booked")
        return {
            "today": {
                "date": today,
                "jobCount": len(todays_jobs),
                "revenue": round(sum(revenue(job) for job in todays_jobs), 2),
            },
            "needsAttention": {
                "overdueLeadFollowUps": overdue_leads,
                "unpaidInvoices": [
                    {
                        "customer": f"{b.get('fname') or ''} {b.get('lname') or ''}".strip(),
                        "owed": round(float(b.get("invoice_amount") or 0) - float(b.get("amount_paid") or 0), 2),
                    }
                    for b in unpaid
                ],
            },
            "leadsLast30Days": {
                "total": len(leads),
                "booked": booked_count,
                "conversionRatePct": round(booked_count / len(leads) * 100, 1) if leads else 0,
            },
            "marketingLast30Days": {
                "totalSpend": round(sum(float(r.get("amount") or 0) for r in spend), 2),
                "leadCount": len(leads),
            },
        }

    async def list_leads(self, context: RunContext, status: str, source: str, limit: int) -> list[dict[str, Any]]:
        """List recent leads. Pass an empty string for status/source when no filter is wanted. Use 15 for a normal limit."""
        params: dict[str, Any] = {"select": "*", "order": "created_at.desc", "limit": str(min(limit, 50))}
        if status: params["status"] = f"eq.{status}"
        if source: params["source"] = f"eq.{source}"
        return await db().get("leads", params)

    async def update_lead_status(self, context: RunContext, lead_id: str, status: str) -> dict[str, Any]:
        """Update a lead's status using its lead id."""
        await db().patch("leads", f"id=eq.{lead_id}", {"status": status, "last_contacted_at": datetime.now(timezone.utc).isoformat()})
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
        """Reschedule a job by id to a new YYYY-MM-DD date and/or time."""
        fields: dict[str, Any] = {}
        if date: fields["date"] = date
        if time: fields["time"] = time
        if not fields:
            raise ValueError("A date or time is required")
        await db().patch("bookings", f"id=eq.{job_id}", fields)
        return {"ok": True, **fields}

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

    async def mark_job_paid(
        self,
        context: RunContext,
        job_id: str,
        amount: float,
        stripe_transaction_id: str = "",
        confirmed: bool = False,
    ) -> dict[str, Any]:
        """Mark a job paid. Call with confirmed=false first; only set true after Michael clearly confirms."""
        rows = await db().get(
            "bookings",
            {"select": "id,fname,lname,vehicle,job_status,invoice_amount,estimate_amount,amount_paid,paid_at", "id": f"eq.{job_id}"},
        )
        if not rows:
            raise ValueError("No job found with that id")
        job = rows[0]
        summary = (
            f"Mark {job.get('fname') or ''} {job.get('lname') or ''}'s job "
            f"({job.get('vehicle') or 'vehicle on file'}) as PAID for {money(amount)}"
            + (f" with Stripe transaction {stripe_transaction_id}." if stripe_transaction_id else ", with no Stripe transaction id yet.")
            + (f" This job already shows a payment recorded on {job.get('paid_at')}." if job.get("paid_at") else "")
        )
        if not confirmed:
            return {"needs_confirmation": True, "summary": summary}
        fields: dict[str, Any] = {
            "job_status": "PAID",
            "amount_paid": amount,
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }
        if stripe_transaction_id:
            fields["stripe_transaction_id"] = stripe_transaction_id
        await db().patch("bookings", f"id=eq.{job_id}", fields)
        return {"ok": True, "markedPaid": money(amount)}

    async def get_revenue_summary(self, context: RunContext, period: str = "this_week") -> dict[str, Any]:
        """Get a revenue summary for this week or the last 7 days."""
        now = datetime.now(ARIZONA)

        if period == "last_7_days":
            start_date = (now.date() - timedelta(days=6))
            end_date = now.date()
            label = "Last 7 days"
        else:
            # Monday through Sunday in Arizona.
            start_date = now.date() - timedelta(days=now.weekday())
            end_date = start_date + timedelta(days=6)
            label = "This week"

        # Select * on purpose: it survives schema differences between older/newer
        # bookings tables and lets us use whichever revenue fields are present.
        bookings = await db().get(
            "bookings",
            [
                ("select", "*"),
                ("date", f"gte.{start_date.isoformat()}"),
                ("date", f"lte.{end_date.isoformat()}"),
                ("order", "date.asc"),
            ],
        )

        active = [
            b for b in bookings
            if str(b.get("status") or "").lower() != "cancelled"
            and str(b.get("job_status") or "").upper() != "CANCELLED"
        ]

        def num(value: Any) -> float:
            try:
                return float(value or 0)
            except (TypeError, ValueError):
                return 0.0

        collected = sum(num(b.get("amount_paid")) for b in active)
        invoiced = sum(num(b.get("invoice_amount")) for b in active)
        estimated = sum(num(b.get("estimate_amount")) for b in active)

        paid_jobs = [b for b in active if num(b.get("amount_paid")) > 0 or b.get("paid_at")]
        completed_jobs = [
            b for b in active
            if str(b.get("job_status") or "").upper() in {"COMPLETED", "INVOICED", "PAID"}
        ]
        upcoming_jobs = [
            b for b in active
            if b.get("date") and str(b.get("date")) > now.date().isoformat()
        ]

        return {
            "ok": True,
            "period": label,
            "dateFrom": start_date.isoformat(),
            "dateTo": end_date.isoformat(),
            "jobsScheduled": len(active),
            "jobsCompleted": len(completed_jobs),
            "jobsPaid": len(paid_jobs),
            "grossCollected": round(collected, 2),
            "invoiceTotal": round(invoiced, 2),
            "estimateTotal": round(estimated, 2),
            "upcomingJobs": len(upcoming_jobs),
        }

    async def get_owner_pay_summary(self, context: RunContext, period_days: int = 7) -> dict[str, Any]:
        """Estimate owner take-home from recent collected payments."""
        days = max(1, min(period_days, 365))
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        bookings = await db().get("bookings", {"select": "amount_paid,paid_at,invoice_amount,tax_amount", "paid_at": f"gte.{since}"})
        settings_rows = await db().get("business_settings", {"select": "*", "id": "eq.default", "limit": "1"})
        settings = settings_rows[0] if settings_rows else {}
        gross = sum(float(b.get("amount_paid") or 0) for b in bookings)
        stripe = float(settings.get("owner_stripe_fee_pct") or 0.0285)
        tax = float(settings.get("owner_tax_reserve_pct") or 0.3)
        monthly_overhead = float(settings.get("owner_monthly_overhead") or 0)
        stripe_fees = gross * stripe
        tax_reserve = gross * tax
        overhead = (monthly_overhead / 30) * days
        return {
            "periodDays": days,
            "jobsPaid": len(bookings),
            "grossCollected": money(gross),
            "estStripeFees": money(stripe_fees),
            "estTaxReserve": money(tax_reserve),
            "proratedOverhead": money(overhead),
            "estimatedTakeHome": money(gross - stripe_fees - tax_reserve - overhead),
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
    async def gid_business(
        self,
        context: RunContext,
        action: str,
        args_json: str,
    ) -> Any:
        """Use GID Garage business data/actions.

        action must be one of:
        get_business_summary, get_revenue_summary, list_leads, update_lead_status, list_jobs,
        reschedule_job, update_job_service, undo_last_action, pricing_history, get_tax_rate,
        add_marketing_spend, log_call, list_calls, list_marketing_spend, search_customers,
        update_job_status, mark_job_paid, get_owner_pay_summary, send_customer_email.

        args_json must be a JSON object string containing that action's arguments.
        Use empty strings for unused text filters. For list limits, use 15 unless
        Michael asks for more. mark_job_paid and send_customer_email must first
        use confirmed=false; only use confirmed=true after Michael clearly confirms.
        """
        try:
            args = json.loads(args_json or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError(f"args_json must be valid JSON: {exc}") from exc

        if not isinstance(args, dict):
            raise ValueError("args_json must decode to a JSON object")

        actions = {
            "get_business_summary": self.get_business_summary,
            "get_revenue_summary": self.get_revenue_summary,
            "list_leads": self.list_leads,
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
            "mark_job_paid": self.mark_job_paid,
            "get_owner_pay_summary": self.get_owner_pay_summary,
            "send_customer_email": self.send_customer_email,
        }

        fn = actions.get(action)
        if fn is None:
            raise ValueError(f"Unsupported GID action: {action}")

        # Fill normal defaults here instead of exposing dozens of nullable/union
        # parameters to Anthropic's tool-schema compiler.
        defaults = {
            "get_revenue_summary": {"period": "this_week"},
            "list_leads": {"status": "", "source": "", "limit": 15},
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
            "mark_job_paid": {"stripe_transaction_id": "", "confirmed": False},
            "get_owner_pay_summary": {"period_days": 7},
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
        llm=inference.LLM(model=LLM_MODEL, extra_kwargs={"max_completion_tokens": 512}),
        tts=inference.TTS(
            model=TTS_MODEL,
            voice=TTS_VOICE,
            language="en",
            extra_kwargs={"speed": TTS_SPEED, "emotion": "calm", "volume": 0.50, "max_buffer_delay_ms": 80},
        ),
        turn_handling=TurnHandlingOptions(
            turn_detection="stt",
            preemptive_generation={
                "enabled": True,
                "preemptive_tts": True,
                "max_speech_duration": 8.0,
            },
        ),
    )

    # The website's existing text/business agent remains authoritative for
    # Quick Commands. It sends the final answer on this private text topic and
    # this handler speaks it through the SAME Cartesia voice, without another LLM call.
    async def _speak_stream(reader, participant_identity: str) -> None:
        if participant_identity != participant.identity:
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
        agent=GIDJarvis(),
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

    await session.generate_reply(
        instructions="Give a very short startup greeting. Say GID Garage is online and you're ready. Do not give a business briefing unless Michael asks."
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
