let cachedClaims: any = null;

// Return true if we think we might be authenticated (optimistic)
export function getToken() {
  return cachedClaims ? "cookie_auth" : null;
}

export function setClaims(claims: any) {
  cachedClaims = claims;
}

export function removeToken() {
  cachedClaims = null;
}

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  const response = await fetch(endpoint, {
    credentials: 'include',
    ...options,
    headers
  });

  if (response.status === 401 && !endpoint.includes('/login')) {
    cachedClaims = null;
    // If we're not on the login/landing screen, redirect
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    }
    throw new Error('Sesja wygasła. Zaloguj się ponownie.');
  }

  const contentType = response.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  if (!response.ok) {
    throw new Error(body?.error || body?.message || `Błąd ${response.status}`);
  }

  return body;
}

export function currentClaims() {
  return cachedClaims;
}
