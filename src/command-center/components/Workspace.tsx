import { resultComponentFor } from '../utils/resultRenderer';
import type { ChatMsg } from '../types';
import { CorrectionButton } from '../../VocabularySettings';

export function Workspace({ messages }: { messages: ChatMsg[] }) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => (
        <div key={i} className={`text-xs ${m.role === 'user' ? 'text-[#8899A6] pl-3 border-l-2 border-white/10' : 'text-[#F5F8FA] pl-3 border-l-2 border-[#32D9FF]/40'}`}>
          <div className="py-1">{m.content}</div>
          {/* "Wrong?" on the latest reply only: teach Jarvis what that message meant. */}
          {m.role === 'assistant' && i === messages.length - 1 && messages[i - 1]?.role === 'user' && <CorrectionButton key={messages[i - 1].content} said={messages[i - 1].content} />}
          {m.cards && m.cards.length > 0 && (
            <div className="mb-2 space-y-2 bg-black/30 border border-white/5 rounded-lg p-2.5">
              {m.cards.map((c, ci) => {
                const CardComponent = resultComponentFor(c.tool);
                return <CardComponent key={ci} payload={c.payload} />;
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
