// Small wrapper so every screen doesn't have to remember to attach the
// token by hand. Reads it from localStorage, sends it as a Bearer token,
// and if the server ever says the token's no good (expired, wrong, or
// missing), clears it and forces the login screen to show again.

const TOKEN_KEY = "mypa_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function authedFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    // Reload so the app falls back to the login screen. Simple and
    // reliable for an app this small, no need for a global auth store.
    window.location.reload();
  }

  return res;
}
