// Claim Triage - Production Authentication & Session State Management
(function () {
  const STORAGE_KEY = 'claim_triage_investigator';
  
  function getActiveUser() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Unable to read localStorage:', e);
    }
    return {
      name: 'Lead Adjuster',
      email: 'investigator@claimtriage.internal',
      role: 'Fraud Risk Specialist'
    };
  }

  function setActiveUser(user) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      syncUI();
    } catch (e) {
      console.warn('Unable to write to localStorage:', e);
    }
  }

  function logout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    window.location.href = '../auth-account/CreateAccountLogin.html';
  }

  function syncUI() {
    const user = getActiveUser();
    document.querySelectorAll('.investigator-name').forEach((el) => {
      el.textContent = user.name;
    });
    document.querySelectorAll('.investigator-email').forEach((el) => {
      el.textContent = user.email;
    });
    document.querySelectorAll('.investigator-initials').forEach((el) => {
      const initials = user.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'CT';
      el.textContent = initials;
    });
  }

  window.ClaimTriageAuth = {
    getUser: getActiveUser,
    setUser: setActiveUser,
    logout: logout,
    sync: syncUI
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncUI);
  } else {
    syncUI();
  }
})();
