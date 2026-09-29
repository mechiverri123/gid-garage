// Read an Anthropic Messages streaming (SSE) response into the same shape as a
// non-streaming response ({ content, stop_reason, usage }), calling onText for
// each text delta as it arrives. Lets the voice path start speaking on the
// first sentence while tool calls keep working exactly as before.
// Tests: tests/voice-stack.test.js.

export async function readClaudeStream(response, { onText = () => {}, onToolStart = () => {} } = {}) {
  const blocks = [];
  const partialJson = new Map();
  const usage = {};
  let stopReason = null;
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = evt => {
    switch (evt.type) {
      case 'message_start':
        Object.assign(usage, evt.message?.usage || {});
        break;
      case 'content_block_start': {
        const b = evt.content_block || {};
        blocks[evt.index] = b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: {} } : { type: b.type || 'text', text: b.text || '' };
        if (b.type === 'tool_use') onToolStart(b.name);
        break;
      }
      case 'content_block_delta': {
        const b = blocks[evt.index];
        const d = evt.delta || {};
        if (d.type === 'text_delta' && b) { b.text += d.text; onText(d.text); }
        else if (d.type === 'input_json_delta') partialJson.set(evt.index, (partialJson.get(evt.index) || '') + (d.partial_json || ''));
        break;
      }
      case 'content_block_stop': {
        const b = blocks[evt.index];
        if (b?.type === 'tool_use') {
          const raw = partialJson.get(evt.index);
          try { b.input = raw ? JSON.parse(raw) : {}; } catch { b.input = {}; }
        }
        break;
      }
      case 'message_delta':
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        if (evt.usage) Object.assign(usage, evt.usage);
        break;
      case 'error':
        throw new Error(`Claude stream error: ${evt.error?.message || evt.error?.type || 'unknown'}`);
      default:
        break;
    }
  };

  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = chunk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
      if (data) { let evt; try { evt = JSON.parse(data); } catch { continue; } handle(evt); }
    }
    if (done) break;
  }
  return { content: blocks.filter(Boolean), stop_reason: stopReason, usage };
}
