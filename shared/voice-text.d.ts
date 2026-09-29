// Types for voice-text.js (what Jarvis speaks aloud).
export function speakable(text: string, opts?: { maxChars?: number }): string;
export function createSentenceBuffer(): { push(delta: string): string[]; flush(): string };
export function wantsFullReadout(text: string): boolean;
