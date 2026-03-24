(function () {
  const base =
    window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:3000';
  const token = sessionStorage.getItem('frilandAuthToken');
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  fetch(base + '/api/auth/me', { headers, credentials: 'include' })
    .then((r) => r.json())
    .then((d) => {
      const el = document.getElementById('navBrugeradmin');
      if (el && d.loggedIn && d.admin) el.style.display = '';
    })
    .catch(() => {});
})();
