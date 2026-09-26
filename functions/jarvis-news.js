// Cloudflare Pages Function — GET /jarvis-news
// Lightweight owner briefing feed for GID Garage. Uses public Google News RSS
// server-side so the browser never has to fight CORS. No API key required.

const FEEDS = {
  local: 'https://news.google.com/rss/search?q=Flagstaff%20Arizona&hl=en-US&gl=US&ceid=US:en',
  national: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
};

function decodeXml(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decodeXml(m[1]) : '';
}

function parseRss(xml, limit = 5) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, limit);
  return items.map((m, i) => ({
    id: `${i}:${tag(m[1], 'link') || tag(m[1], 'title')}`,
    title: tag(m[1], 'title'),
    link: tag(m[1], 'link'),
    source: tag(m[1], 'source'),
    publishedAt: tag(m[1], 'pubDate'),
  })).filter(x => x.title && x.link);
}

async function getFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GID-Garage-Owner-Briefing/1.0' },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`News feed returned ${res.status}`);
  return parseRss(await res.text(), 5);
}

export async function onRequestGet() {
  try {
    const [local, national] = await Promise.all([
      getFeed(FEEDS.local),
      getFeed(FEEDS.national),
    ]);
    return new Response(JSON.stringify({
      location: 'Flagstaff, Arizona',
      local,
      national,
      fetchedAt: new Date().toISOString(),
    }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Unable to load news' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
