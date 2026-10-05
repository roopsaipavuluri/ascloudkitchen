const API_BASE = '/api';

async function request(endpoint, options = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

export function apiGet(endpoint, token) {
  return request(endpoint, { method: 'GET' }, token);
}

export function apiPost(endpoint, data, token) {
  return request(endpoint, { method: 'POST', body: JSON.stringify(data || {}) }, token);
}

export function apiPatch(endpoint, data, token) {
  return request(endpoint, { method: 'PATCH', body: JSON.stringify(data || {}) }, token);
}

export function apiDelete(endpoint, token) {
  return request(endpoint, { method: 'DELETE' }, token);
}

export async function apiUpload(endpoint, file, token) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Image upload failed.');
  }

  return payload;
}
