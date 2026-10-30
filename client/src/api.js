export async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'X-Requested-With': 'fetch',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}
export const api = (path, options) => request(`/api${path}`, options);
export const adminApi = (path, options) => request(`/api/admin${path}`, options);
