(function () {
  const aarValg = document.getElementById('aar-valg');
  const hentEconomic = document.getElementById('hent-economic');
  const economicStatus = document.getElementById('economic-status');
  const economicSektion = document.getElementById('economic-sektion');
  const economicTotals = document.getElementById('economic-totals');
  const valgtAar = document.getElementById('valgt-aar');
  const valgtAarFooter = document.getElementById('valgt-aar-footer');
  const footerDatasource = document.getElementById('footer-datasource');

  function formatBeloeb(n) {
    if (n == null || isNaN(n)) return '-';
    return Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function visStatus(msg, type) {
    economicStatus.textContent = msg;
    economicStatus.className = 'economic-status ' + (type || '');
  }

  function grupperTotals(totals) {
    const resultat = []; // 7xx, 8xx, 9xx (indtægter, udgifter)
    const balance = []; // 1xx-6xx (aktiver, passiver, egenkapital)
    for (const t of totals) {
      const num = t.accountNumber;
      if (num >= 100 && num < 700) balance.push(t);
      else if (num >= 700) resultat.push(t);
    }
    return { resultat, balance };
  }

  function bygTabel(rows, caption) {
    if (rows.length === 0) return '';
    let html = '<table class="regnskabstabel"><tbody>';
    if (caption) html += '<tr class="gruppe-header"><td colspan="2">' + caption + '</td></tr>';
    for (const r of rows) {
      const beloeb = r.totalInBaseCurrency;
      const formatted = beloeb >= 0 ? formatBeloeb(beloeb) : '- ' + formatBeloeb(-beloeb);
      html += '<tr><td>' + escapeHtml(r.name) + ' (' + r.accountNumber + ')</td><td class="beloeb">' + formatted + '</td></tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function opdaterUI() {
    const aar = aarValg.value;
    valgtAar.textContent = aar;
    valgtAarFooter.textContent = aar;
  }

  aarValg.addEventListener('change', opdaterUI);

  hentEconomic.addEventListener('click', async function () {
    const aar = aarValg.value;
    visStatus('Henter...', 'loading');
    economicTotals.innerHTML = '';
    economicSektion.style.display = 'block';

    try {
      const base = window.location.origin;
      const res = await fetch(base + '/api/arsregnskab/' + aar);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.detail || res.statusText);
      }

      visStatus('Hentet fra e-conomic', 'success');
      footerDatasource.textContent =
        'Resultatopgørelse og balance bygget ud fra data fra e-conomic (kontoplan med totaler).';

      const totals = data.totals || [];
      const { resultat, balance } = grupperTotals(totals);

      let html = '';
      if (resultat.length > 0) {
        html += '<h3>Resultatopgørelse (konto 7xx–9xx)</h3>';
        html += bygTabel(resultat);
      }
      if (balance.length > 0) {
        html += '<h3>Formueopgørelse (konto 1xx–6xx)</h3>';
        html += bygTabel(balance);
      }
      if (totals.length === 0) {
        html = '<p>Ingen data for dette regnskabsår i e-conomic.</p>';
      }

      economicTotals.innerHTML = html;
    } catch (err) {
      visStatus('Fejl: ' + (err.message || 'Kunne ikke hente data'), 'error');
      economicTotals.innerHTML =
        '<p class="economic-fejl">' +
        escapeHtml(err.message) +
        '</p><p>Kontroller at serveren kører (<code>npm start</code>) og at e-conomic-tokens er sat i <code>.env</code>.</p>';
    }
  });

  opdaterUI();
})();
