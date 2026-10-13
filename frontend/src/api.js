const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export async function request(path, { method = 'GET', token, body } = {}) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('Cannot connect to the server. Make sure the backend is running.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    if (Array.isArray(detail)) {
      throw new Error(detail.map((item) => item.msg).join(' · '));
    }
    const error = new Error(typeof detail === 'string' ? detail : 'Something went wrong.');
    error.status = response.status;
    throw error;
  }
  return data;
}


/** Streams NDJSON from FastAPI; legacy backend receives the old /messages request. */
export async function streamQuestion(conversationId, question, token, onProgress = () => {}) {
  let response;
  try {
    response = await fetch(`${base}/conversations/${conversationId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question }),
    });
  } catch {
    throw new Error('Cannot connect to the server. Check your connection and try again.');
  }
  if (response.status === 404 || response.status === 405) {
    return request(`/conversations/${conversationId}/messages`, {
      method: 'POST', token, body: { question },
    });
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Could not start an AI response.');
  }
  if (!response.body) throw new Error('This browser cannot read streaming responses.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let finished = null;
  let lastUpdate = 0;
  const consume = line => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch { throw new Error('The response was interrupted. Please retry.'); }
    if (event.type === 'delta') {
      accumulated += event.text || '';
      const now = Date.now();
      if (now - lastUpdate > 90) { onProgress(accumulated); lastUpdate = now; }
    } else if (event.type === 'error') throw new Error(event.message || 'The AI response failed.');
    else if (event.type === 'done') finished = event;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        consume(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!finished) throw new Error('The answer was interrupted. Please try again.');
    return finished;
  } finally {
    reader.releaseLock();
  }
}
