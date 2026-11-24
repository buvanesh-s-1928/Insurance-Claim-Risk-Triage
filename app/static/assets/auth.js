// Claim Triage - Enterprise Authentication & Session Guard
(function () {
  const STORAGE_KEY = 'claim_triage_investigator';
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

  function setActiveUser(user) {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      syncUI();
    } catch (e) {
      console.warn('Unable to write to localStorage:', e);
    }
  }

  function isAuthenticated() {
    return !!getActiveUser();
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

  function completeTour() {
    const user = getActiveUser();
    if (user) {
      user.hasCompletedTour = true;
      setActiveUser(user);
    }
  }

  function logout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(RETURN_KEY);
    } catch (e) {}
    window.location.href = '../auth-account/CreateAccountLogin.html';
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
    setUser: setActiveUser,
    isAuthenticated: isAuthenticated,
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
