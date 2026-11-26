// Claim Triage - Enterprise Authentication & Session Guard
(function () {
  const STORAGE_KEY = 'claim_triage_investigator';
  const TOKEN_KEY = 'claim_triage_token';
  const RETURN_KEY = 'claim_triage_return_url';

  function getActiveUser() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Unable to read localStorage:', e);
    }
    return null;
  }

  function getSessionToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setActiveUser(user, token) {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        if (token) localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
      syncUI();
    } catch (e) {
      console.warn('Unable to write to localStorage:', e);
    }
  }

  function isAuthenticated() {
    return !!getActiveUser();
  }

  async function register(name, email, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.detail || 'Failed to create account.';
      throw new Error(msg);
    }
    setActiveUser(data.user, data.token);
    return data.user;
  }

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.detail || 'Invalid email or password.';
      throw new Error(msg);
    }
    setActiveUser(data.user, data.token);
    return data.user;
  }

  async function loginDemo() {
    const res = await fetch('/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Fallback local mock if backend offline
      const mock = {
        name: 'Elena Rostova',
        email: 'elena.rostova@claimtriage.internal',
        role: 'Lead Fraud Strategist',
        hasCompletedTour: true
      };
      setActiveUser(mock, 'demo-token');
      return mock;
    }
    setActiveUser(data.user, data.token);
    return data.user;
  }

  async function completeTour() {
    const user = getActiveUser();
    if (user) {
      user.hasCompletedTour = true;
      setActiveUser(user, getSessionToken());
      try {
        await fetch('/api/auth/complete-tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email })
        });
      } catch (e) {
        console.warn('Tour completion not synced to server:', e);
      }
    }
  }

  async function logout() {
    const token = getSessionToken();
    try {
      if (token) {
        await fetch('/api/auth/logout?token=' + encodeURIComponent(token), { method: 'POST' });
      }
    } catch (e) {}
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
    } catch (e) {}
    window.location.href = '../auth-account/CreateAccountLogin.html';
  }

  function requireAuth(options = { requireTour: true }) {
    const user = getActiveUser();
    const currentPath = window.location.pathname;

    // 1. Not signed in: redirect to login
    if (!user) {
      try {
        sessionStorage.setItem(RETURN_KEY, window.location.href);
      } catch (e) {}
      window.location.replace('../auth-account/CreateAccountLogin.html');
      return false;
    }

    // 2. Signed in, but mandatory tour has not been completed
    if (options.requireTour && user.hasCompletedTour === false) {
      if (!currentPath.includes('FirstRunTutorial.html')) {
        window.location.replace('../first-run-tutorial/FirstRunTutorial.html?mandatory=1');
        return false;
      }
    }

    return true;
  }

  function syncUI() {
    const user = getActiveUser();
    if (!user) return;

    document.querySelectorAll('.investigator-name').forEach((el) => {
      el.textContent = user.name || 'Investigator';
    });
    document.querySelectorAll('.investigator-email').forEach((el) => {
      el.textContent = user.email || '';
    });
    document.querySelectorAll('.investigator-initials').forEach((el) => {
      const parts = (user.name || 'Investigator').trim().split(/\s+/);
      const initials = parts.map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'IN';
      el.textContent = initials;
    });
  }

  window.ClaimTriageAuth = {
    getUser: getActiveUser,
    getToken: getSessionToken,
    setUser: setActiveUser,
    isAuthenticated: isAuthenticated,
    register: register,
    login: login,
    loginDemo: loginDemo,
    requireAuth: requireAuth,
    completeTour: completeTour,
    logout: logout,
    sync: syncUI
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncUI);
  } else {
    syncUI();
  }
})();
