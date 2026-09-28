// Left navigation. Expanded on wide screens, icon rail on laptops, drawer on
// tablets/phones. Items link to real destinations: dashboard sections, SEO
// mode, and the /admin tabs where jobs, customers and the schedule live.
import { LayoutDashboard, Briefcase, Users, CalendarDays, Map as MapIcon, Megaphone, SearchCheck, BarChart3, Bot, Settings, Lock, X , type LucideIcon } from 'lucide-react';
import { C } from '../ui/theme';

export type NavTarget = { kind: 'mode'; mode: 'ops' | 'seo' } | { kind: 'section'; id: string } | { kind: 'href'; href: string };
export interface NavItem { key: string; label: string; icon: LucideIcon; target: NavTarget }

export const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, target: { kind: 'mode', mode: 'ops' } },
  { key: 'jobs', label: 'Jobs', icon: Briefcase, target: { kind: 'href', href: '/admin?tab=jobs' } },
  { key: 'customers', label: 'Customers', icon: Users, target: { kind: 'href', href: '/admin?tab=customers' } },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays, target: { kind: 'href', href: '/admin?tab=schedule' } },
  { key: 'map', label: 'Map', icon: MapIcon, target: { kind: 'section', id: 'cc-route' } },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, target: { kind: 'section', id: 'cc-marketing' } },
  { key: 'seo', label: 'SEO', icon: SearchCheck, target: { kind: 'mode', mode: 'seo' } },
  { key: 'reports', label: 'Reports', icon: BarChart3, target: { kind: 'href', href: '/admin?tab=pay' } },
  { key: 'jarvis', label: 'Jarvis', icon: Bot, target: { kind: 'section', id: 'cc-jarvis' } },
  { key: 'settings', label: 'Settings', icon: Settings, target: { kind: 'href', href: '/admin?tab=hub' } },
];

function NavButton({ item, active, compact, onGo }: { item: NavItem; active: boolean; compact: boolean; onGo: (t: NavTarget) => void }) {
  const Icon = item.icon;
  const cls = `cc-btn relative w-full flex items-center gap-3 rounded-lg ${compact ? 'justify-center h-11' : 'px-3 h-11'} text-[15px] font-medium`;
  const style = active
    ? { background: 'linear-gradient(90deg, rgba(52,214,255,0.18), rgba(52,214,255,0.04))', color: C.text, boxShadow: `inset 0 0 0 1px ${C.border}` }
    : { color: C.text2 };
  const inner = (
    <>
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: C.cyan, boxShadow: `0 0 10px ${C.cyan}` }} />}
      <Icon size={19} color={active ? C.cyan : C.text2} aria-hidden />
      {!compact && <span className="truncate">{item.label}</span>}
    </>
  );
  if (item.target.kind === 'href') return <a href={item.target.href} className={cls} style={style} title={compact ? item.label : undefined} aria-label={item.label}>{inner}</a>;
  return <button type="button" onClick={() => onGo(item.target)} className={cls} style={style} title={compact ? item.label : undefined} aria-label={item.label} aria-current={active ? 'page' : undefined}>{inner}</button>;
}

function SidebarBody({ active, compact, onGo, onLock, systemOk, voiceLabel, onClose }: { active: string; compact: boolean; onGo: (t: NavTarget) => void; onLock: () => void; systemOk: boolean; voiceLabel: string; onClose?: () => void }) {
  return (
    <div className="h-full flex flex-col p-3 gap-1">
      <div className={`flex items-center gap-3 mb-4 ${compact ? 'justify-center' : 'px-2'} pt-1`}>
        <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-black text-[15px]" style={{ background: 'linear-gradient(135deg, rgba(52,214,255,0.25), rgba(0,174,239,0.05))', border: `1px solid ${C.borderStrong}`, color: C.cyan, boxShadow: '0 0 18px rgba(52,214,255,0.2)' }}>GID</span>
        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold leading-tight" style={{ color: C.text }}>GID Garage</div>
            <div className="text-[12.5px]" style={{ color: C.text2 }}>Command Center</div>
          </div>
        )}
        {onClose && <button type="button" onClick={onClose} aria-label="Close menu" className="cc-btn p-2 rounded-lg" style={{ color: C.text2 }}><X size={20} /></button>}
      </div>
      <nav className="flex flex-col gap-1" aria-label="Command Center">
        {NAV.map(item => <NavButton key={item.key} item={item} active={item.key === active} compact={compact} onGo={t => { onGo(t); onClose?.(); }} />)}
      </nav>
      <div className="flex-1" />
      <div className={`rounded-lg ${compact ? 'p-2' : 'p-3'} mb-2`} style={{ background: 'rgba(52,214,255,0.04)', border: `1px solid ${C.border}` }}>
        <div className={`flex items-center gap-2 ${compact ? 'justify-center' : ''}`} title={systemOk ? 'All systems online' : 'Reconnecting'}>
          <span className="cc-pulse shrink-0" style={{ color: systemOk ? C.green : C.amber, background: systemOk ? C.green : C.amber }} />
          {!compact && <span className="text-[13px] font-medium" style={{ color: C.text }}>{systemOk ? 'Systems online' : 'Reconnecting…'}</span>}
        </div>
        {!compact && <div className="text-[12px] mt-1" style={{ color: C.text2 }}>Voice: {voiceLabel}</div>}
      </div>
      <button type="button" onClick={onLock} className={`cc-btn flex items-center gap-3 rounded-lg h-11 ${compact ? 'justify-center' : 'px-3'} text-[14px]`} style={{ color: C.text2 }} title="Lock the Command Center" aria-label="Lock">
        <Lock size={18} aria-hidden />{!compact && 'Lock'}
      </button>
    </div>
  );
}

export function AppSidebar(props: { active: string; onGo: (t: NavTarget) => void; onLock: () => void; systemOk: boolean; voiceLabel: string; drawerOpen: boolean; onCloseDrawer: () => void }) {
  const { drawerOpen, onCloseDrawer, ...rest } = props;
  return (
    <>
      <aside className="hidden lg:block xl:hidden w-[76px] shrink-0 border-r h-full" style={{ borderColor: C.border, background: 'rgba(5,13,21,0.85)' }}>
        <SidebarBody {...rest} compact />
      </aside>
      <aside className="hidden xl:block w-[240px] shrink-0 border-r h-full" style={{ borderColor: C.border, background: 'rgba(5,13,21,0.85)' }}>
        <SidebarBody {...rest} compact={false} />
      </aside>
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={onCloseDrawer} />
          <div className="relative w-[272px] max-w-[85vw] h-full border-r cc-fade-up" style={{ borderColor: C.border, background: C.bg2 }}>
            <SidebarBody {...rest} compact={false} onClose={onCloseDrawer} />
          </div>
        </div>
      )}
    </>
  );
}
