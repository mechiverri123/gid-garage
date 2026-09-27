import { Radar, Briefcase, Users, TrendingUp, Settings, Lock } from 'lucide-react';
import { COLORS } from '../tokens';

const NAV_ITEMS = [
  { icon: Radar, label: 'Command', active: true, href: undefined },
  { icon: Briefcase, label: 'Jobs', href: '/admin' },
  { icon: Users, label: 'Customers', href: '/admin' },
  { icon: TrendingUp, label: 'Marketing', href: '#marketing' },
  { icon: Settings, label: 'Hub', href: '/admin' },
];

export function Sidebar({ onLock }: { onLock: () => void }) {
  return (
    <div
      className="hidden lg:flex flex-col items-center w-[68px] shrink-0 py-4 gap-1 border-r"
      style={{ borderColor: COLORS.border, background: 'rgba(5,11,20,0.6)' }}
    >
      <div className="w-8 h-8 rounded-full mb-4 flex items-center justify-center" style={{ border: `1px solid ${COLORS.accent}`, boxShadow: `0 0 12px ${COLORS.accent}55` }}>
        <span className="text-[10px] font-bold" style={{ color: COLORS.accent }}>G</span>
      </div>
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const body = (
          <div
            className={`w-11 h-11 flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${item.active ? 'bg-[rgba(79,232,255,0.1)]' : 'hover:bg-white/5'}`}
            style={item.active ? { border: `1px solid ${COLORS.border}`, boxShadow: `0 0 12px rgba(79,232,255,0.15)` } : undefined}
          >
            <Icon size={16} color={item.active ? COLORS.accent : COLORS.textMuted} />
            <span className="text-[7px] uppercase tracking-wide" style={{ color: item.active ? COLORS.accent : COLORS.textFaint }}>{item.label}</span>
          </div>
        );
        return item.href ? (
          <a key={item.label} href={item.href} title={item.label}>{body}</a>
        ) : (
          <div key={item.label} title={item.label}>{body}</div>
        );
      })}
      <div className="flex-1" />
      <a href="/admin" title="Back to Admin" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/5 mb-1">
        <span className="text-[9px]" style={{ color: COLORS.textFaint }}>ADM</span>
      </a>
      <button onClick={onLock} title="Lock" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/5">
        <Lock size={14} color={COLORS.textFaint} />
      </button>
    </div>
  );
}
