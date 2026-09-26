import { useState, useRef, useCallback } from 'react';
import type { ActivityItem, ChatMsg, DataCard, JarvisState } from '../types';

const SUCCESS_PULSE_MS = 500;
const ERROR_PULSE_MS = 600;

export function useAdminAI(onWriteLikelyHappened: () => void, onAssistantFinal?: (text: string) => void) {
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [asking, setAsking] = useState(false);
  const [liveActivity, setLiveActivity] = useState<ActivityItem[]>([]);
  const [jarvisState, setJarvisState] = useState<JarvisState>('idle');
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pulse = useCallback((state: JarvisState, ms: number) => {
    setJarvisState(state);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setJarvisState('idle'), ms);
  }, []);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setLiveActivity([]);
    setJarvisState('processing');
    const nextMessages = [...chatMessages, { role: 'user' as const, content: q }];
    setChatMessages(nextMessages);

    try {
      const res = await fetch('/admin-ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response stream.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawFinal = false;
      let pendingCards: DataCard[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: any;
          try { event = JSON.parse(line); } catch { continue; }

          if (event.type === 'tool_call') {
            setJarvisState('tool');
            setLiveActivity(prev => [...prev, { tool: event.tool, status: 'running', startedAt: Date.now() }]);
          } else if (event.type === 'tool_result') {
            setLiveActivity(prev => {
              const idx = prev.map(a => a.tool).lastIndexOf(event.tool);
              if (idx === -1) return prev;
              const copy = [...prev];
              copy[idx] = { ...copy[idx], status: event.ok ? 'done' : 'error', error: event.error };
              return copy;
            });
            if (!event.ok) pulse('error', ERROR_PULSE_MS);
          } else if (event.type === 'data') {
            pendingCards = [...pendingCards, { tool: event.tool, payload: event.payload }];
          } else if (event.type === 'final') {
            sawFinal = true;
            const finalText = event.text || 'No answer.';
            setChatMessages(prev => [...prev, { role: 'assistant', content: finalText, cards: pendingCards.length ? pendingCards : undefined }]);
            onAssistantFinal?.(finalText);
            pendingCards = [];
            setLiveActivity([]);
            pulse('success', SUCCESS_PULSE_MS);
            onWriteLikelyHappened();
          } else if (event.type === 'error') {
            sawFinal = true;
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.message}` }]);
            setLiveActivity([]);
            pulse('error', ERROR_PULSE_MS);
          }
        }
      }

      if (!sawFinal) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Connection ended before a final answer arrived. Try again.' }]);
        setLiveActivity([]);
        pulse('error', ERROR_PULSE_MS);
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
      setLiveActivity([]);
      pulse('error', ERROR_PULSE_MS);
    } finally {
      setAsking(false);
    }
  }, [asking, chatMessages, onWriteLikelyHappened, onAssistantFinal, pulse]);

  const clear = useCallback(() => {
    setChatMessages([]);
    setLiveActivity([]);
    setJarvisState('idle');
  }, []);

  return { chatMessages, asking, liveActivity, jarvisState, ask, clear };
}
