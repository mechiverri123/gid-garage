import { Radar, Briefcase, Users, TrendingUp, Phone, WalletCards, Settings, Lock } from 'lucide-react';
import { COLORS } from '../tokens';

const NAV_ITEMS = [
  { icon: Radar, label: 'Command', active: true, href: undefined },
  { icon: Briefcase, label: 'Jobs', href: '/admin' },
  { icon: Users, label: 'Customers', href: '/admin' },
  { icon: TrendingUp, label: 'Marketing', href: '#marketing' },
  { icon: Phone, label: 'Calls', href: '/admin' },
  { icon: WalletCards, label: 'Finance', href: '/admin' },
  { icon: Settings, label: 'Hub', href: '/admin' },
];

export function Sidebar({ onLock }: { onLock: () => void }) {
  return (
    <aside
      className="hidden lg:flex w-[88px] shrink-0 flex-col px-3 py-4 border-r relative"
      style={{
        borderColor: COLORS.border,
        background: 'linear-gradient(180deg, rgba(5,11,20,0.98) 0%, rgba(4,8,15,0.95) 100%)',
      }}
    >
      <div className="absolute inset-y-0 right-0 w-px" style={{ background: `linear-gradient(180deg, transparent, ${COLORS.borderStrong}, transparent)` }} />
      <div className="mb-5 flex flex-col items-center gap-2">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `1px solid ${COLORS.accent}`, boxShadow: `0 0 18px rgba(84,231,255,0.25), inset 0 0 24px rgba(84,231,255,0.08)` }}>
          <span className="text-xs font-bold" style={{ color: COLORS.accent }}>G</span>
        </div>
        <div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-center" style={{ color: COLORS.textMuted }}>
          GID<br />Garage
        </div>
      </div>
      <nav className="flex flex-col gap-2">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const body = (
            <div
              className="group rounded-2xl px-2 py-2.5 flex flex-col items-center gap-1 transition-all duration-200"
              style={item.active
                ? { background: 'rgba(84,231,255,0.1)', border: `1px solid ${COLORS.borderStrong}`, boxShadow: '0 0 18px rgba(84,231,255,0.12)' }
                : { border: '1px solid transparent' }}
            >
              <Icon size={16} color={item.active ? COLORS.accent : COLORS.textMuted} />
              <span className="text-[8px] uppercase tracking-[0.18em] text-center leading-tight" style={{ color: item.active ? COLORS.accent : COLORS.textFaint }}>{item.label}</span>
            </div>
          );
          return item.href ? (
            <a key={item.label} href={item.href} title={item.label}>{body}</a>
          ) : (
            <div key={item.label} title={item.label}>{body}</div>
          );
        })}
      </nav>
      <div className="mt-auto pt-4 flex flex-col gap-2 border-t border-white/5">
        <a href="/admin" title="Back to Admin" className="rounded-2xl px-2 py-2.5 flex flex-col items-center gap-1 hover:bg-white/5 transition-colors">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: COLORS.textFaint }}>ADM</span>
          <span className="text-[8px] uppercase tracking-[0.12em]" style={{ color: COLORS.textFaint }}>Admin</span>
        </a>
        <button onClick={onLock} title="Lock" className="rounded-2xl px-2 py-2.5 flex flex-col items-center gap-1 hover:bg-white/5 transition-colors">
          <Lock size={15} color={COLORS.textFaint} />
          <span className="text-[8px] uppercase tracking-[0.12em]" style={{ color: COLORS.textFaint }}>Lock</span>
        </button>
      </div>
    </aside>
  );
}
