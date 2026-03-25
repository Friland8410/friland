(function () {
  const apiBase =
    window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:3000';

  const cred = { credentials: 'include' };

  const aarValg = document.getElementById('aar-valg');
  const hentEconomic = document.getElementById('hent-economic');
  const hentSupabaseLedger = document.getElementById('hent-supabase-ledger');
  const economicStatus = document.getElementById('economic-status');
  const economicSektion = document.getElementById('economic-sektion');
  const economicTotals = document.getElementById('economic-totals');
  const valgtAar = document.getElementById('valgt-aar');
  const valgtAarFooter = document.getElementById('valgt-aar-footer');
  const footerDatasource = document.getElementById('footer-datasource');
  const resultatTbody = document.getElementById('resultat-tbody');
  const verificerSektion = document.getElementById('verificer-sektion');
  const verificerIndhold = document.getElementById('verificer-indhold');

  let arsregnskabStruktur = null;

  /** Excel-postnavn → årsregnskab post-key (til verifikation) */
  const excelTilPost = {
    Kontingent: 'kontingent',
    Grundskyld: 'grundskyld',
    'Renteindtægter bank': 'renteindtaegter',
    Administration: 'administration',
    'Fonden Nødværge': 'fondenNoedvaerge',
    Ansvarsforsikring: 'ansvarsforsikring',
    'Reno Djurs': 'renoDjurs',
    Generalforsamling: 'generalforsamling',
    'Drift af ressourceplads': 'driftRessourceplads',
    'Vedligeholdelse af veje': 'vedligeholdelseVeje',
    'Pleje af fællesarealer': 'plejeFaellesarealer',
    'Medlemsskab af foreninger': 'medlemsskab',
    'Frilandsaften rådighedsbeløb': 'frilandsaften',
    'Økonomigruppens rådighedsbeløb': 'oekonomigruppen',
    'Tilskud til Festival 25': 'tilskudFestival',
    Skilte: 'skilte',
    Arbejdsdage: 'arbejdsdage',
    Ravnebidrag: 'ravnebidrag',
    Æbledag: 'aebledag',
    Remise: 'remise',
    'Sct. Hans fest': 'sctHans',
    Fællesspisning: 'faellesspisning',
    'Spontane gaver': 'spontaneGaver',
    'Liv i Ravnen': 'livIRavnen',
    Solhvervsfest: 'solhvervsfest',
    'Syddjurs Kommune Rottebekæmpelse': 'syddjursRottebekaempelse',
    'Projekter godkendt på GF (svævebane)': 'projekterGF',
    'Grundskyld opkrævning': 'grundskyldOpkraevning',
  };

  function formatBeloeb(n) {
    if (n == null || isNaN(n)) return '-';
    return Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function formatBeloebMedFortegn(n) {
    if (n == null || isNaN(n)) return '-';
    const abs = Math.abs(Math.round(n));
    const str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return n < 0 ? '- ' + str : str;
  }

  function visStatus(msg, type) {
    economicStatus.textContent = msg;
    economicStatus.className = 'economic-status ' + (type || '');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function bygRække(navn, beloeb, klasser = '') {
    const formatted = formatBeloebMedFortegn(beloeb);
    const kl = beloeb >= 0 ? 'positive' : '';
    return (
      '<tr' +
      (klasser ? ' class="' + klasser + '"' : '') +
      '><td>' +
      escapeHtml(navn) +
      '</td><td class="beloeb ' +
      kl +
      '">' +
      formatted +
      '</td></tr>'
    );
  }

  function bygResultatopgoerelse(agg, struktur) {
    const s = struktur || arsregnskabStruktur;
    if (!s) return;
    const indt = agg?.indtaegter || {};
    const udg = agg?.udgifter || {};
    let html = '<tr class="gruppe-header"><td colspan="2">Indtægter</td></tr>';
    let sumIndt = 0;
    for (const { post, navn } of s.indtaegter || []) {
      const v = indt[post];
      if (v != null) sumIndt += v;
      html += bygRække(navn, v ?? 0);
    }
    html += bygRække('Samlede indtægter', sumIndt, 'subtotal');
    html += '<tr class="gruppe-header"><td colspan="2">Udgifter</td></tr>';
    let sumUdg = 0;
    for (const { post, navn } of s.udgifter || []) {
      const v = udg[post];
      if (v != null) sumUdg += v;
      html += bygRække(navn, v ?? 0);
    }
    html += bygRække('Samlede udgifter', sumUdg, 'subtotal');
    const resultat = sumIndt + sumUdg;
    html += bygRække(
      'Årets resultat (' + (resultat >= 0 ? 'overskud' : 'underskud') + ')',
      resultat,
      'resultat positive'
    );
    resultatTbody.innerHTML = html;
  }

  function grupperTotals(totals) {
    const resultat = [];
    const balance = [];
    for (const t of totals) {
      const num = parseInt(t.accountNumber, 10);
      if (num >= 1000 && num < 5000) resultat.push(t);
      else if (num >= 5000) balance.push(t);
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
      html +=
        '<tr><td>' +
        escapeHtml(r.name) +
        ' (' +
        r.accountNumber +
        ')</td><td class="beloeb">' +
        formatted +
        '</td></tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function formatTal(n) {
    if (n == null || isNaN(n)) return '-';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function opdaterUI() {
    const aar = aarValg.value;
    valgtAar.textContent = aar === '2025' ? '2025/26' : aar;
    valgtAarFooter.textContent =
      aar === '2025' ? '01.03.25 – 28.02.26' : '1. januar – 31. december ' + aar;
  }

  aarValg.addEventListener('change', opdaterUI);

  fetch('arsregnskab-struktur.json', cred)
    .then((r) => r.json())
    .then((struktur) => {
      arsregnskabStruktur = struktur;
      bygResultatopgoerelse({ indtaegter: {}, udgifter: {} }, struktur);
    })
    .catch((err) => {
      console.error(err);
      if (resultatTbody) resultatTbody.innerHTML = '<tr><td colspan="2">Kunne ikke indlæse struktur. Klik "Hent fra e-conomic".</td></tr>';
    });

  document.getElementById('debug-btn').addEventListener('click', async function () {
    const aar = aarValg.value;
    const debugOutput = document.getElementById('debug-output');
    const debugSektion = document.getElementById('debug-sektion');
    debugSektion.style.display = 'block';
    debugOutput.textContent = 'Henter...';

    try {
      const res = await fetch(apiBase + '/api/debug/' + aar, cred);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = { rawResponse: text.slice(0, 2000), status: res.status };
      }
      if (!res.ok && data.error) {
        data = { fejl: data.error, economicBody: data.economicBody, hint: data.hint };
      }
      debugOutput.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      debugOutput.textContent = 'Fejl: ' + (err.message || err);
    }
  });

  hentEconomic.addEventListener('click', async function () {
    const aar = aarValg.value;
    visStatus('Henter...', 'loading');
    economicTotals.innerHTML = '';
    economicSektion.style.display = 'block';

    try {
      const base = apiBase;
      const res = await fetch(base + '/api/arsregnskab/' + aar, cred);
      const data = await res.json();

      if (!res.ok) {
        const e = new Error(data.error || data.detail || res.statusText);
        e.economicBody = data.economicBody;
        throw e;
      }

      visStatus('Hentet fra e-conomic', 'success');
      footerDatasource.textContent =
        'Årsregnskab hentet fra e-conomic. Tal er aggregeret efter arsregnskab-struktur.js (Frilands konti).';

      if (data.aggregated && data.struktur) {
        arsregnskabStruktur = data.struktur;
        bygResultatopgoerelse(data.aggregated, data.struktur);
      }

      const totals = data.totals || [];
      const { resultat, balance } = grupperTotals(totals);

      let debugHtml = '';
      if (totals.length > 0) {
        debugHtml += '<details class="economic-detail"><summary>Vis rådata (kontoplan)</summary>';
        if (resultat.length > 0) {
          debugHtml += '<h3>Resultatopgørelse (konto 1xxx–4xxx)</h3>';
          debugHtml += bygTabel(resultat);
        }
        if (balance.length > 0) {
          debugHtml += '<h3>Formueopgørelse (konto 5xxx+)</h3>';
          debugHtml += bygTabel(balance);
        }
        debugHtml += '</details>';
      }
      if (totals.length === 0) {
        debugHtml = '<p>Ingen data for dette regnskabsår i e-conomic.</p>';
      }
      economicTotals.innerHTML = debugHtml;
    } catch (err) {
      const errMsg = err.message || 'Kunne ikke hente data';
      const errDetail = err.economicBody
        ? '<p class="economic-fejl">e-conomic svar: ' + escapeHtml(err.economicBody) + '</p>'
        : '';
      visStatus('Fejl: ' + errMsg, 'error');
      economicTotals.innerHTML =
        '<p class="economic-fejl">' +
        escapeHtml(errMsg) +
        '</p>' +
        errDetail +
        '<p>Prøv <strong>Debug</strong> for mere info. Vælg et år der findes i e-conomic.</p>';
    }
  });

  if (hentSupabaseLedger) {
    hentSupabaseLedger.addEventListener('click', async function () {
      const aar = aarValg.value;
      visStatus('Henter fra Supabase...', 'loading');
      economicTotals.innerHTML = '';
      economicSektion.style.display = 'block';

      try {
        const base = apiBase;
        const res = await fetch(base + '/api/arsregnskab-supabase/' + encodeURIComponent(aar), cred);
        const data = await res.json();

        if (!res.ok) {
          const e = new Error(data.error || res.statusText);
          throw e;
        }

        visStatus('Hentet fra Supabase (periode ' + (data.fromDate || '') + ' – ' + (data.toDate || '') + ')', 'success');
        footerDatasource.textContent =
          'Resultatopgørelse fra synkroniserede posteringer i Supabase (saldobalance). Poster uden for årsregnskabsstrukturen vises ikke i tabellen ovenfor, men kan ses under kontoplanen nedenfor.';

        if (data.aggregated && data.struktur) {
          arsregnskabStruktur = data.struktur;
          bygResultatopgoerelse(data.aggregated, data.struktur);
        }

        const totals = data.totals || [];
        const { resultat, balance } = grupperTotals(totals);

        let debugHtml = '';
        if (totals.length > 0) {
          debugHtml += '<details class="economic-detail" open><summary>Vis rådata (kontoplan fra Supabase)</summary>';
          if (resultat.length > 0) {
            debugHtml += '<h3>Resultatopgørelse (konto 1xxx–4xxx)</h3>';
            debugHtml += bygTabel(resultat);
          }
          if (balance.length > 0) {
            debugHtml += '<h3>Formueopgørelse (konto 5xxx+)</h3>';
            debugHtml += bygTabel(balance);
          }
          debugHtml += '</details>';
        }
        if (totals.length === 0) {
          debugHtml = '<p>Ingen konti i perioden — kør <code>npm run sync:supabase</code> eller vælg anden periode under Saldobalancer.</p>';
        }
        economicTotals.innerHTML = debugHtml;
      } catch (err) {
        const errMsg = err.message || 'Kunne ikke hente fra Supabase';
        visStatus('Fejl: ' + errMsg, 'error');
        economicTotals.innerHTML =
          '<p class="economic-fejl">' +
          escapeHtml(errMsg) +
          '</p>' +
          '<p>Tjek at <code>SUPABASE_URL</code> og service role er sat på serveren, og at der findes data for regnskabsåret.</p>';
      }
    });
  }

  document.getElementById('verificer-btn').addEventListener('click', async function () {
    const base = apiBase;
    verificerSektion.style.display = 'block';
    verificerIndhold.innerHTML = '<p>Henter Excel og e-conomic...</p>';

    try {
      const [excelRes, economicRes] = await Promise.all([
        fetch('regnskab-2025.json', cred),
        fetch(base + '/api/arsregnskab/2025', cred),
      ]);
      const excelData = await excelRes.json();
      const economicData = await economicRes.json();

      if (!economicRes.ok) {
        throw new Error(economicData.error || economicData.detail || 'Kunne ikke hente fra e-conomic');
      }

      const agg = economicData.aggregated || {};
      const ecIndt = agg.indtaegter || {};
      const ecUdg = agg.udgifter || {};

      const excelIndt = {};
      for (const r of excelData.indtaegter || []) {
        const post = excelTilPost[r.navn];
        if (post) excelIndt[post] = r.perioden;
      }
      const excelUdg = {};
      for (const r of excelData.udgifter || []) {
        const post = excelTilPost[r.navn];
        if (post) excelUdg[post] = -Math.abs(r.perioden);
      }

      const poster = [];
      for (const { post, navn } of (arsregnskabStruktur || economicData.struktur || {}).indtaegter || []) {
        poster.push({ post, navn, excel: excelIndt[post], ec: ecIndt[post], type: 'indt' });
      }
      for (const { post, navn } of (arsregnskabStruktur || economicData.struktur || {}).udgifter || []) {
        poster.push({ post, navn, excel: excelUdg[post], ec: ecUdg[post], type: 'udg' });
      }

      let html = '<table class="regnskabstabel sammenligning-tabel"><thead><tr><th>Post</th><th>Excel (reference)</th><th>e-conomic</th><th>Forskel</th><th>Status</th></tr></thead><tbody>';
      let matcherOk = 0;
      let matcherFejl = 0;
      for (const p of poster) {
        const excelVal = p.excel;
        const ecVal = p.ec;
        const diff = excelVal != null && ecVal != null ? ecVal - excelVal : null;
        const diffAbs = diff != null ? Math.abs(diff) : null;
        const tolereret = diffAbs != null && diffAbs <= 1;
        const mangler = excelVal != null && ecVal == null;
        let status = '-';
        if (tolereret) {
          status = '✓ Ok';
          matcherOk++;
        } else if (mangler) {
          status = '⚠ Mangler i e-conomic';
          matcherFejl++;
        } else if (diff != null) {
          status = '⚠ Forskel';
          matcherFejl++;
        }
        html +=
          '<tr><td>' +
          escapeHtml(p.navn) +
          '</td><td class="beloeb">' +
          formatTal(excelVal) +
          '</td><td class="beloeb">' +
          formatTal(ecVal) +
          '</td><td class="beloeb">' +
          (diff != null ? (diff >= 0 ? '+' : '') + formatTal(diff) : '-') +
          '</td><td>' +
          status +
          '</td></tr>';
      }
      const sumIndtExcel = excelData.sumIndtaegter;
      const sumUdgExcel = excelData.sumUdgifter;
      const sumIndtEc = Object.values(ecIndt).reduce((a, b) => a + b, 0);
      const sumUdgEc = Object.values(ecUdg).reduce((a, b) => a + b, 0);
      html += '<tr class="subtotal"><td><strong>Indtægter i alt</strong></td><td class="beloeb">' + formatTal(sumIndtExcel) + '</td><td class="beloeb">' + formatTal(sumIndtEc) + '</td><td class="beloeb">' + (sumIndtExcel != null && sumIndtEc != null ? (sumIndtEc - sumIndtExcel >= 0 ? '+' : '') + formatTal(sumIndtEc - sumIndtExcel) : '-') + '</td><td></td></tr>';
      html += '<tr class="subtotal"><td><strong>Udgifter i alt</strong></td><td class="beloeb">' + formatTal(sumUdgExcel) + '</td><td class="beloeb">' + formatTal(sumUdgEc) + '</td><td class="beloeb">' + (sumUdgExcel != null && sumUdgEc != null ? (sumUdgEc - sumUdgExcel >= 0 ? '+' : '') + formatTal(sumUdgEc - sumUdgExcel) : '-') + '</td><td></td></tr>';
      html += '<tr class="resultat"><td><strong>Årets resultat</strong></td><td class="beloeb">' + formatTal(excelData.resultat) + '</td><td class="beloeb">' + formatTal(sumIndtEc + sumUdgEc) + '</td><td class="beloeb">' + (excelData.resultat != null && sumIndtEc != null && sumUdgEc != null ? ((sumIndtEc + sumUdgEc) - excelData.resultat >= 0 ? '+' : '') + formatTal((sumIndtEc + sumUdgEc) - excelData.resultat) : '-') + '</td><td></td></tr>';
      html += '</tbody></table>';
      html += '<p class="economic-info">' + matcherOk + ' poster matcher (inden for 1 kr), ' + matcherFejl + ' med forskel eller manglende data. Bemærk: Excel og e-conomic skal have samme regnskabsperiode (01.03.25–28.02.26). Hvis regnskabsår i e-conomic er kalenderår, vil tallene ikke matche.</p>';
      verificerIndhold.innerHTML = html;
    } catch (err) {
      verificerIndhold.innerHTML =
        '<p class="economic-fejl">' +
        escapeHtml(err.message || 'Kunne ikke verificere') +
        '</p><p>Kontroller at e-conomic er forbundet og at regnskabsåret 2025 findes.</p>';
    }
  });

  opdaterUI();
})();
