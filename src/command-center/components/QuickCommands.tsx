import { Send, BadgeDollarSign, PhoneCall, CalendarClock } from 'lucide-react';
import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';

const commands = [
  { label: 'Follow-ups', query: 'who needs follow-up', icon: Send },
  { label: 'Unpaid', query: "what's unpaid", icon: BadgeDollarSign },
  { label: 'Ad Performance', query: 'how are my ads doing', icon: CalendarClock },
  { label: 'Take-Home', query: 'what did I actually take home this week', icon: PhoneCall },
];

export function QuickCommands({ onRun }: { onRun: (query: string) => void }) {
  return (
    <HudPanel title="Quick Commands" status={{ label: 'Ready', color: COLORS.accent }}>
      <div className="grid grid-cols-2 gap-2">
        {commands.map(c => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              onClick={() => onRun(c.query)}
              className="rounded-xl border px-3 py-3 transition-all text-left hover:-translate-y-0.5"
              style={{ borderColor: COLORS.border, background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-2 mb-2" style={{ color: COLORS.accent }}>
                <Icon size={13} />
                <span className="text-[10px] uppercase tracking-[0.18em]">Run</span>
              </div>
              <div className="text-xs font-medium" style={{ color: COLORS.text }}>{c.label}</div>
            </button>
          );
        })}
      </div>
    </HudPanel>
  );
}
