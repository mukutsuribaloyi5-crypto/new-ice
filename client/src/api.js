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

// Sends one file as the raw request body (used by the admin gallery) and reports progress.
export function uploadFile(path, file, params = {}, onProgress) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin${path}${query ? `?${query}` : ''}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'fetch');
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      const error = new Error(data.error || (xhr.status === 413 ? 'That file is too large to upload.' : `Upload failed (${xhr.status})`));
      error.status = xhr.status;
      reject(error);
    };
    xhr.onerror = () => reject(new Error('Network error while uploading. Please try again.'));
    xhr.send(file);
  });
}
