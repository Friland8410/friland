(function () {
  const base =
    window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:3000';
  const SESSION_KEY = 'frilandAuthToken';

  const nav = document.querySelector('.topmenu');
  let logoutBtn = null;
  if (nav) {
    logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'topmenu-logout';
    logoutBtn.textContent = 'Log ud';
    logoutBtn.setAttribute('aria-label', 'Log ud');
    logoutBtn.hidden = true;
    nav.appendChild(logoutBtn);
    logoutBtn.addEventListener('click', async () => {
      const t = sessionStorage.getItem(SESSION_KEY);
      const h = t ? { Authorization: 'Bearer ' + t } : {};
      try {
        await fetch(base + '/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: h,
        });
      } catch (_) {}
      sessionStorage.removeItem(SESSION_KEY);
      window.location.reload();
    });
  }

  const token = sessionStorage.getItem(SESSION_KEY);
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  fetch(base + '/api/auth/me', { headers, credentials: 'include' })
    .then((r) => r.json())
    .then((d) => {
      const el = document.getElementById('navBrugeradmin');
      if (el && d.loggedIn && d.admin) el.style.display = '';
      if (logoutBtn && d.loggedIn) logoutBtn.hidden = false;
    })
    .catch(() => {});
})();
