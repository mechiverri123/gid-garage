import { HudPanel } from './HudPanel';
import { COLORS } from '../tokens';

export function QuickCommands({ onRun }: { onRun: (query: string) => void }) {
  const commands = [
    { label: 'Follow-ups', query: 'who needs follow-up' },
    { label: 'Unpaid', query: "what's unpaid" },
    { label: 'Ad Performance', query: 'how are my ads doing' },
    { label: 'Take-Home', query: 'what did I actually take home this week' },
  ];
  return (
    <HudPanel title="Quick Commands">
      <div className="grid grid-cols-2 gap-1.5">
        {commands.map(c => (
          <button
            key={c.label}
            onClick={() => onRun(c.query)}
            className="text-[10px] font-medium px-2 py-2 rounded transition-colors text-left"
            style={{ background: 'rgba(255,255,255,0.03)', color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}
            onMouseEnter={e => { e.currentTarget.style.color = COLORS.accent; e.currentTarget.style.borderColor = COLORS.accent; }}
            onMouseLeave={e => { e.currentTarget.style.color = COLORS.textMuted; e.currentTarget.style.borderColor = COLORS.border; }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </HudPanel>
  );
}
