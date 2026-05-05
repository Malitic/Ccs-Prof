const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

export const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');

export const apiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
};

export const postJson = async <TResponse = any, TBody = Record<string, unknown>>(
  path: string,
  body: TBody
): Promise<TResponse> => {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Request failed with status ${response.status}`);
  }

  return payload as TResponse;
};