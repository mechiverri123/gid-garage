# GID Garage JARVIS — realtime voice cutover

This build replaces the old multi-hop voice experiment with a realtime LiveKit/WebRTC path while preserving the existing GID Garage dashboard and the existing typed Ask GID agent.

## What changed

Website:

- `functions/jarvis-livekit-token.js` creates a short-lived private LiveKit room token and explicitly dispatches the `gid-jarvis` agent.
- `src/command-center/hooks/useLiveKitJarvis.ts` connects the browser microphone directly to LiveKit with WebRTC.
- `src/command-center/components/RealtimeVoiceControl.tsx` adds START JARVIS / LISTENING / SPEAKING controls to the existing AI core.
- `CommandCenterPage.tsx` keeps the current dashboard but reflects realtime voice state and refreshes business data while a voice session is active.
- The old typed `Ask GID` bar still works exactly as a fallback.

Hosted agent:

- `jarvis-agent/agent.py` is the realtime voice agent.
- Streaming STT: Deepgram through LiveKit Inference.
- LLM: Claude Haiku through the Anthropic LiveKit plugin.
- Streaming TTS: Cartesia Sonic 3.6 through LiveKit Inference.
- The agent contains GID Garage tools for jobs, leads, customers, calls, marketing spend, pricing, owner pay, payment recording, and customer email.
- PAID and customer-email actions preserve the confirmation requirement from the existing typed agent.

No desktop app, terminal, local model, Railway voice server, MediaRecorder upload, `/jarvis-transcribe`, or `/jarvis-speak` is required for this realtime path.

---

# ONE-TIME SETUP

## 1. Install the new website packages

From the main GID Garage project folder in PowerShell:

```powershell
npm install
npm run build
```

`npm install` is important because this ZIP adds:

- `livekit-client`
- `livekit-server-sdk`
- `@livekit/protocol`

It will also update `package-lock.json` on your machine. Commit/push the updated lock file with the rest of the project.

## 2. Create a LiveKit Cloud project

Create a LiveKit Cloud project at the LiveKit dashboard. You need the project's:

- WebSocket URL: `wss://...livekit.cloud`
- API key
- API secret

Do not paste the API secret into the website frontend or into chat.

## 3. Add Cloudflare Pages variables

Cloudflare Dashboard -> Workers & Pages -> GID Garage -> Settings -> Variables and Secrets -> Production.

Add:

```text
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=your LiveKit project key
LIVEKIT_API_SECRET=your LiveKit project secret
LIVEKIT_AGENT_NAME=gid-jarvis
```

`LIVEKIT_API_SECRET` should be stored as a secret.

Then redeploy the Cloudflare Pages project.

After deploy, while authenticated through Cloudflare Access, open:

```text
https://www.gidgarage.com/jarvis-livekit-token
```

Expected response:

```json
{
  "ok": true,
  "configured": true,
  "agent_name": "gid-jarvis"
}
```

## 4. Install LiveKit CLI on Windows

PowerShell:

```powershell
winget install LiveKit.LiveKitCLI
```

Close/reopen PowerShell if `lk` is not immediately recognized.

## 5. Deploy the hosted JARVIS agent

From the main project:

```powershell
cd jarvis-agent
lk cloud auth
```

Your browser will open. Link the CLI to the same LiveKit Cloud project you used for the Cloudflare variables.

Create a temporary local secrets file named `secrets.env` inside `jarvis-agent`:

```text
ANTHROPIC_API_KEY=your existing Anthropic key
SUPABASE_URL=your existing Supabase URL
SUPABASE_SERVICE_KEY=your existing Supabase service role key
BREVO_API_KEY=your existing Brevo key
LIVEKIT_AGENT_NAME=gid-jarvis
JARVIS_LLM_MODEL=claude-haiku-4-5-20251001
JARVIS_STT_MODEL=deepgram/flux-general
JARVIS_TTS_MODEL=cartesia/sonic-3.6
JARVIS_TTS_VOICE=9626c31c-bec5-4cca-baa8-f8ba9e84c8bc
JARVIS_TTS_SPEED=0.96
```

If you do not use voice email yet, `BREVO_API_KEY` can be omitted. The email tool will refuse to send instead of pretending it worked.

Deploy:

```powershell
lk agent create --secrets-file=secrets.env
```

The CLI creates `livekit.toml`, builds the agent, and deploys it to LiveKit Cloud.

After it succeeds, DELETE the local `secrets.env` file. It is ignored by Git, but there is no reason to leave secrets sitting around.

For later code changes, deploy from `jarvis-agent` with:

```powershell
lk agent deploy
```

For later secret changes:

```powershell
lk agent update-secrets --secrets-file=secrets.env
```

LiveKit Cloud automatically injects its own `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` into the hosted agent. Do not add those three to the agent's secrets file.

## 6. Test the real site

Open:

```text
https://www.gidgarage.com/jarvis
```

Click `START JARVIS` once and allow microphone access.

The AI core should move through:

```text
START JARVIS
CONNECTING
LISTENING
SPEAKING
LISTENING
```

Try these in order:

```text
What's scheduled today?
What needs my attention?
Find my recent leads.
What did I actually take home this week?
```

Then test interruption: start talking while JARVIS is speaking. The new stack is designed for realtime turn/interruption handling instead of waiting for a complete MP3/WAV response.

## 7. Test one write

Use a harmless write first, for example changing a lead status or rescheduling a test job.

Do not test payment/email first.

Payment and email intentionally require a two-turn confirmation:

```text
Michael: Mark that job paid for $500.
JARVIS: [reads what it will do and asks for confirmation]
Michael: Yes.
JARVIS: [executes]
```

## 8. Retire Railway only after this works

Do not delete the old Railway Piper service until the LiveKit version is proven on the real site.

Once LiveKit is stable, Railway can be shut down and the old `JARVIS_VOICE_URL` / `JARVIS_VOICE_SECRET` Cloudflare variables can be removed if they are no longer used anywhere else.

---

# Voice choice

The bundled Cartesia voice ID is only a starting voice so the whole realtime system can be tested immediately. It is not intended to imitate a specific actor.

Once latency and the business tools are proven, change only these LiveKit agent secrets to audition voices without touching the website:

```text
JARVIS_TTS_VOICE=<Cartesia voice id>
JARVIS_TTS_SPEED=0.96
```

Then:

```powershell
lk agent update-secrets --secrets-file=secrets.env
```

That is the point to tune a polished British/cinematic assistant voice. The architecture no longer depends on Piper.

---

# If START JARVIS errors

1. Check `https://www.gidgarage.com/jarvis-livekit-token` returns `configured: true`.
2. Check LiveKit Cloud -> Agents -> `gid-jarvis` is deployed and healthy.
3. Check the agent has `ANTHROPIC_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_KEY` secrets.
4. Check Cloudflare uses the same LiveKit project URL/key/secret as the agent deployment.
5. Check Opera microphone permission for `gidgarage.com`.

The browser no longer needs `/jarvis-transcribe` or `/jarvis-speak`, so errors from those old endpoints are unrelated to the new realtime path.
