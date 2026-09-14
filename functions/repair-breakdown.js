/**
 * repair-breakdown — Cloudflare Pages Function
 * Internal admin tool: takes a short repair description, researches torque
 * specs across multiple independent sources, and returns a structured
 * breakdown. Specs are only marked "verified" when 2+ independent domains
 * agree — that check happens in code below, not by trusting Claude's own
 * judgment call.
 *
 * POST /repair-breakdown
 * Body: { "repair": "2014 hyundai tucson lower control arm replacement" }
 *
 * Setup required (Pages > Settings > Environment variables):
 *   - ANTHROPIC_API_KEY
 *   - YT_SERVICE_URL (optional — URL of the separate yt-dlp microservice;
 *     if unset, step photos/video-sourced specs are simply skipped)
 */

const SYSTEM_PROMPT = `You are a mobile mechanic's repair research agent. \
A technician (not a hobbyist) needs field-usable info before a job.

Use web search to find current, vehicle-specific information: factory \
service manual excerpts, OEM parts sites, repair forums, and parts \
retailers (RockAuto, AutoZone, O'Reilly, NAPA). Search MULTIPLE \
independent sources — minimum 3 distinct domains — specifically for any \
torque spec you report. Do not rely on a single source for a number.

Also note the single best YouTube walkthrough video URL you come across \
for this exact repair (prefer one with captions/well-established channel), \
if any turns up in your searches.

Respond with ONLY valid JSON, no prose before or after:

{
  "overview": "1-2 sentence summary",
  "tools_needed": ["specialty tools beyond a standard socket set"],
  "parts": [{"name": "...", "oem_part_number": "string or null", "source_url": "string or null"}],
  "torque_specs": [
    {"fastener": "...", "sources": [{"value_ft_lb": 80, "domain": "...", "url": "..."}]}
  ],
  "steps": ["technician-level steps, skip obvious basics"],
  "pitfalls": ["seized bolts, sequencing, TSBs/recalls, alignment implications"],
  "estimated_labor_hours": "e.g. '1.5-2 hrs'",
  "youtube_url_found": "https://youtube.com/watch?v=... or null"
}

CRITICAL: For torque_specs, report EVERY distinct value you find across \
sources separately — even if they disagree. Do not average or pick a \
favorite. Include real domain/URL for every source.`;

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function verifySpec(raw) {
  const sources = raw.sources.map((s) => ({ ...s, domain: s.domain || extractDomain(s.url) }));
  let bestCluster = [];

  for (const anchor of sources) {
    const tolerance = Math.max(3, anchor.value_ft_lb * 0.05);
    const cluster = sources.filter((s) => Math.abs(s.value_ft_lb - anchor.value_ft_lb) <= tolerance);
    const distinctDomains = new Set(cluster.map((c) => c.domain));
    if (distinctDomains.size >= 2 && cluster.length > bestCluster.length) {
      bestCluster = cluster;
    }
  }

  if (bestCluster.length >= 2) {
    const avg = bestCluster.reduce((sum, s) => sum + s.value_ft_lb, 0) / bestCluster.length;
    return {
      fastener: raw.fastener,
      status: 'verified',
      value_ft_lb: Math.round(avg * 10) / 10,
      agreeing_sources: bestCluster,
      all_sources: sources,
    };
  }
  return { fastener: raw.fastener, status: 'unconfirmed', value_ft_lb: null, agreeing_sources: [], all_sources: sources };
}

function mergeVideoSpecs(webSpecs, videoSpecs, videoUrl) {
  const merged = webSpecs.map((s) => ({ ...s, sources: [...s.sources] }));
  for (const vs of videoSpecs) {
    const match = merged.find(
      (s) => s.fastener.toLowerCase().includes(vs.fastener.toLowerCase()) ||
             vs.fastener.toLowerCase().includes(s.fastener.toLowerCase())
    );
    const entry = { value_ft_lb: vs.value_ft_lb, domain: 'youtube.com', url: videoUrl };
    if (match) {
      match.sources.push(entry);
    } else {
      merged.push({ fastener: vs.fastener, sources: [entry] });
    }
  }
  return merged;
}

export async function onRequestPost({ request, env }) {
  const { repair } = await request.json();
  if (!repair || typeof repair !== 'string') {
    return new Response(JSON.stringify({ error: "Missing 'repair' field" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Repair: ${repair}` }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return new Response(JSON.stringify({ error: 'Anthropic API error', detail: errText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await anthropicRes.json();
  const textBlocks = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  let parsed;
  try {
    parsed = JSON.parse(textBlocks.replace(/```json|```/g, '').trim());
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to parse agent output as JSON', raw: textBlocks }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let torqueSpecsRaw = parsed.torque_specs;
  let steps = parsed.steps.map((text) => ({ text, timestamp_seconds: 0, photo_base64: null }));
  let pitfalls = parsed.pitfalls;

  if (parsed.youtube_url_found && env.YT_SERVICE_URL) {
    try {
      const ytRes = await fetch(`${env.YT_SERVICE_URL}/analyze-video-steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: parsed.youtube_url_found, repair_context: repair }),
      });
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        if (ytData.steps?.length) steps = ytData.steps;
        if (ytData.specs_mentioned?.length) {
          torqueSpecsRaw = mergeVideoSpecs(torqueSpecsRaw, ytData.specs_mentioned, parsed.youtube_url_found);
        }
        if (ytData.pitfalls_mentioned?.length) {
          pitfalls = [...new Set([...pitfalls, ...ytData.pitfalls_mentioned])];
        }
      }
    } catch {
      // yt service unreachable/failed — fall back to text-only steps, non-fatal
    }
  }

  const verifiedSpecs = torqueSpecsRaw.map(verifySpec);

  const result = {
    overview: parsed.overview,
    torque_specs: verifiedSpecs,
    pitfalls,
    tools_needed: parsed.tools_needed,
    parts: parsed.parts,
    steps,
    estimated_labor_hours: parsed.estimated_labor_hours,
    video_source: parsed.youtube_url_found,
  };

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
}
