import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPin, Newspaper, Sparkles, TrendingUp } from 'lucide-react';
import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';
import { money } from '../utils/formatters';
import type { CommandCenterSummary } from '../types';

type NewsItem = {
  id: string;
  title: string;
  link: string;
  source?: string;
  publishedAt?: string;
};

type NewsPayload = {
  location: string;
  local: NewsItem[];
  national: NewsItem[];
  fetchedAt: string;
};

function daypart() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function ago(value?: string) {
  if (!value) return '';
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function NewsColumn({ title, icon, items }: { title: string; icon: React.ReactNode; items: NewsItem[] }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: COLORS.accent }}>{icon}</span>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: COLORS.textMuted }}>{title}</div>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-xs py-4" style={{ color: COLORS.textFaint }}>No headlines available right now.</div>
        ) : items.slice(0, 3).map(item => (
          <a
            key={item.id}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="group block rounded-xl border px-3 py-2.5 transition-all hover:-translate-y-0.5"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))' }}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] leading-snug line-clamp-2" style={{ color: COLORS.text }}>{item.title}</div>
                <div className="flex items-center gap-2 mt-1.5 text-[10px]" style={{ color: COLORS.textFaint }}>
                  {item.source && <span>{item.source}</span>}
                  {item.publishedAt && <span>{ago(item.publishedAt)}</span>}
                </div>
              </div>
              <ExternalLink size={11} className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-80" color={COLORS.accent} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export function OwnerBriefing({ summary }: { summary: CommandCenterSummary }) {
  const [news, setNews] = useState<NewsPayload | null>(null);
  const [newsError, setNewsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/jarvis-news')
      .then(r => {
        if (!r.ok) throw new Error('news unavailable');
        return r.json();
      })
      .then(data => { if (!cancelled) setNews(data); })
      .catch(() => { if (!cancelled) setNewsError(true); });
    return () => { cancelled = true; };
  }, []);

  const businessLine = useMemo(() => {
    const bits = [
      `${summary.today.jobCount} job${summary.today.jobCount === 1 ? '' : 's'} today`,
      `${money(summary.today.revenue)} revenue`,
      `${summary.today.newLeads} new lead${summary.today.newLeads === 1 ? '' : 's'}`,
    ];
    if (summary.needsAttention.length) bits.push(`${summary.needsAttention.length} need attention`);
    else bits.push('nothing urgent');
    return bits.join(' · ');
  }, [summary]);

  return (
    <HudPanel title="Michael's Owner Briefing" status={{ label: 'Personalized', color: COLORS.accent }}>
      <div className="grid xl:grid-cols-[1.05fr_1fr_1fr] gap-4 xl:gap-5">
        <div className="relative rounded-2xl border p-4 overflow-hidden" style={{ borderColor: COLORS.border, background: 'radial-gradient(circle at 15% 0%, rgba(84,231,255,0.1), transparent 42%), rgba(255,255,255,0.018)' }}>
          <div className="absolute -right-14 -top-14 w-44 h-44 rounded-full" style={{ background: 'radial-gradient(circle, rgba(84,231,255,0.12), transparent 70%)' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} color={COLORS.accent} />
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: COLORS.textMuted }}>Owner Context</span>
            </div>
            <div className="text-[24px] font-semibold leading-tight" style={{ color: COLORS.text }}>{daypart()}, Michael.</div>
            <div className="text-[12px] mt-2 leading-relaxed" style={{ color: COLORS.textMuted }}>
              GID Garage is live. {businessLine}.
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}><TrendingUp size={11}/>Revenue</div>
                <div className="text-lg font-semibold mt-1" style={{ color: COLORS.success }}>{money(summary.today.revenue)}</div>
              </div>
              <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: COLORS.textFaint }}>Attention</div>
                <div className="text-lg font-semibold mt-1" style={{ color: summary.needsAttention.length ? COLORS.warning : COLORS.success }}>{summary.needsAttention.length || 'Clear'}</div>
              </div>
            </div>
          </div>
        </div>

        {news ? (
          <>
            <NewsColumn title="Flagstaff Brief" icon={<MapPin size={13} />} items={news.local} />
            <NewsColumn title="U.S. Brief" icon={<Newspaper size={13} />} items={news.national} />
          </>
        ) : (
          <>
            <div className="rounded-2xl border p-4 min-h-[170px]" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
              <div className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: COLORS.textMuted }}>Flagstaff Brief</div>
              <div className="text-xs animate-pulse" style={{ color: COLORS.textFaint }}>{newsError ? 'News feed unavailable.' : 'Loading local headlines…'}</div>
            </div>
            <div className="rounded-2xl border p-4 min-h-[170px]" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
              <div className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: COLORS.textMuted }}>U.S. Brief</div>
              <div className="text-xs animate-pulse" style={{ color: COLORS.textFaint }}>{newsError ? 'News feed unavailable.' : 'Loading national headlines…'}</div>
            </div>
          </>
        )}
      </div>
    </HudPanel>
  );
}
