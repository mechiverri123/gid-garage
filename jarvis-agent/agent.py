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
)
from livekit.plugins import anthropic

load_dotenv()

ARIZONA = ZoneInfo("America/Phoenix")
AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "gid-jarvis")
LLM_MODEL = os.getenv("JARVIS_LLM_MODEL", "claude-haiku-4-5-20251001")
STT_MODEL = os.getenv("JARVIS_STT_MODEL", "deepgram/flux-general")
TTS_MODEL = os.getenv("JARVIS_TTS_MODEL", "cartesia/sonic-3")
TTS_VOICE = os.getenv("JARVIS_TTS_VOICE", "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc")
TTS_SPEED = float(os.getenv("JARVIS_TTS_SPEED", "0.96"))


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
- Speak like a polished, composed technical assistant: concise, calm, quick, slightly dry when natural.
- Do not impersonate or claim to be any real actor or copyrighted character performance.
- Most answers should be one or two short spoken sentences. Never read database rows field-by-field unless Michael specifically asks.
- Do not use markdown, bullets, asterisks, URLs, or emoji in spoken replies.
- Start answering as soon as you have enough information. Avoid filler like 'Certainly' or 'Let me check'.

BUSINESS DATA:
- You have live GID Garage tools for jobs, customers, leads, calls, marketing, pricing, owner pay, and email.
- Never invent business facts. Use the relevant tool whenever Michael asks about live business information.
- Low-risk writes such as rescheduling, lead status, job pipeline status, call logs, and marketing spend may be done immediately and then confirmed.
- mark_job_paid and send_customer_email are external/financial actions. First call them with confirmed=false. Read the returned confirmation summary and ask Michael to confirm. Only repeat the tool with confirmed=true after a clear yes on the next turn.
- Never mark a job PAID using update_job_status. Use mark_job_paid so the amount is recorded.
"""
        )

    @function_tool
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

    @function_tool
    async def list_leads(self, context: RunContext, status: str = "", source: str = "", limit: int = 15) -> list[dict[str, Any]]:
        """List recent leads, optionally filtered by status or source."""
        params: dict[str, Any] = {"select": "*", "order": "created_at.desc", "limit": str(min(limit, 50))}
        if status: params["status"] = f"eq.{status}"
        if source: params["source"] = f"eq.{source}"
        return await db().get("leads", params)

    @function_tool
    async def update_lead_status(self, context: RunContext, lead_id: str, status: str) -> dict[str, Any]:
        """Update a lead's status using its lead id."""
        await db().patch("leads", f"id=eq.{lead_id}", {"status": status, "last_contacted_at": datetime.now(timezone.utc).isoformat()})
        return {"ok": True, "lead_id": lead_id, "status": status}

    @function_tool
    async def list_jobs(
        self,
        context: RunContext,
        customer_id: str = "",
        customer_name: str = "",
        date_from: str = "",
        date_to: str = "",
        job_status: str = "",
        vehicle: str = "",
        service_keyword: str = "",
        limit: int = 15,
    ) -> list[dict[str, Any]]:
        """List jobs/bookings filtered by customer, dates, status, vehicle, or service."""
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

    @function_tool
    async def reschedule_job(self, context: RunContext, job_id: str, date: str = "", time: str = "") -> dict[str, Any]:
        """Reschedule a job by id to a new YYYY-MM-DD date and/or time."""
        fields: dict[str, Any] = {}
        if date: fields["date"] = date
        if time: fields["time"] = time
        if not fields:
            raise ValueError("A date or time is required")
        await db().patch("bookings", f"id=eq.{job_id}", fields)
        return {"ok": True, **fields}

    @function_tool
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

    @function_tool
    async def get_tax_rate(self, context: RunContext) -> dict[str, Any]:
        """Get current tax, overhead, and Stripe fee settings."""
        rows = await db().get("business_settings", {"select": "*", "id": "eq.default", "limit": "1"})
        s = rows[0] if rows else {}
        return {
            "taxRatePct": float(s["tax_rate"]) * 100 if s.get("tax_rate") is not None else None,
            "monthlyOverhead": s.get("owner_monthly_overhead"),
            "stripeFeePct": float(s["owner_stripe_fee_pct"]) * 100 if s.get("owner_stripe_fee_pct") is not None else None,
        }

    @function_tool
    async def add_marketing_spend(self, context: RunContext, date: str, channel: str, amount: float) -> dict[str, Any]:
        """Log a marketing-spend entry."""
        row = await db().insert("marketing_spend", {"date": date, "channel": channel, "amount": amount})
        return {"ok": True, "entry": row}

    @function_tool
    async def log_call(self, context: RunContext, phone: str, outcome: str, direction: str = "inbound", notes: str = "") -> dict[str, Any]:
        """Log a phone call and its outcome."""
        row = await db().insert("calls", {"phone": phone, "direction": direction, "outcome": outcome, "notes": notes or None})
        return {"ok": True, "call": row}

    @function_tool
    async def list_calls(self, context: RunContext, outcome: str = "", limit: int = 15) -> list[dict[str, Any]]:
        """List recently logged calls."""
        params: dict[str, Any] = {"select": "*", "order": "created_at.desc", "limit": str(min(limit, 50))}
        if outcome: params["outcome"] = f"eq.{outcome}"
        return await db().get("calls", params)

    @function_tool
    async def list_marketing_spend(self, context: RunContext, channel: str = "", limit: int = 20) -> list[dict[str, Any]]:
        """List recent marketing spend entries, optionally by channel."""
        params: dict[str, Any] = {"select": "*", "order": "date.desc", "limit": str(min(limit, 50))}
        if channel: params["channel"] = f"eq.{channel}"
        return await db().get("marketing_spend", params)

    @function_tool
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

    @function_tool
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

    @function_tool
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

    @function_tool
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

    @function_tool
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


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def gid_jarvis(ctx: JobContext):
    # Validate the business connection before starting a room so configuration
    # errors surface in the agent logs, not halfway through a voice command.
    db()

    session = AgentSession(
        stt=inference.STT(model=STT_MODEL, language="en"),
        llm=anthropic.LLM(model=LLM_MODEL, temperature=0.2),
        tts=inference.TTS(
            model=TTS_MODEL,
            voice=TTS_VOICE,
            language="en",
            extra_kwargs={"speed": TTS_SPEED, "max_buffer_delay_ms": 80},
        ),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
            preemptive_generation={"enabled": True, "preemptive_tts": True, "max_speech_duration": 8.0},
        ),
    )

    await session.start(room=ctx.room, agent=GIDJarvis())
    await session.generate_reply(
        instructions="Give a very short startup greeting. Say GID Garage is online and you're ready. Do not give a business briefing unless Michael asks."
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
