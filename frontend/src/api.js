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
