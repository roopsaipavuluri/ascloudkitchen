const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '');
const API_BASE = configuredApiBase
  || (import.meta.env.PROD ? 'https://ascloudkitchen.onrender.com/api' : '/api');
const API_ORIGIN = /^https?:\/\//i.test(API_BASE) ? new URL(API_BASE).origin : '';

function apiUrl(endpoint) {
  return `${API_BASE}${endpoint}`;
}

function normalizeAssets(value) {
  if (Array.isArray(value)) return value.map(normalizeAssets);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (typeof item === 'string' && item.startsWith('/uploads/')) {
      return [key, `${API_ORIGIN}${item}`];
    }
    return [key, normalizeAssets(item)];
  }));
}

async function request(endpoint, options = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(apiUrl(endpoint), {
      ...options,
      headers
    });
  } catch {
    throw new Error(
      `Could not reach the Cloud Kitchen API at ${API_BASE}. Check the deployed backend URL and confirm the backend is running.`
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (payload && typeof payload.message === 'string') throw new Error(payload.message);
    if (response.status === 404) {
      throw new Error(
        `The API route ${endpoint} was not found. Set VITE_API_BASE_URL to your deployed backend API URL (ending in /api) and redeploy the frontend.`
      );
    }
    throw new Error(`API request failed with HTTP ${response.status} for ${endpoint}.`);
  }

  return normalizeAssets(payload);
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

  let response;
  try {
    response = await fetch(apiUrl(endpoint), {
      method: 'POST',
      headers,
      body: formData
    });
  } catch {
    throw new Error(
      `Could not reach the Cloud Kitchen API at ${API_BASE}. Check the deployed backend URL and confirm the backend is running.`
    );
  }
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (payload && typeof payload.message === 'string') throw new Error(payload.message);
    throw new Error(`Image upload failed with HTTP ${response.status} for ${endpoint}.`);
  }

  return normalizeAssets(payload);
}
