/** Standardrækker til Forbrug (indtastet) — kan overskrives i data/forbrug-indtastet.json */
export function createDefaultForbrugIndtastet() {
  const data = (label) => ({ type: 'data', id: '', label, samletForbrug: 0 });
  const sep = { type: 'separator', id: '' };
  const rows = [
    data('Administration'),
    data('Bankgebyr & rente'),
    data('Drift af Ravnen'),
    data('Reno Djurs'),
    data('Generalforsamling'),
    data('Grundskyld fællesareal'),
    data('Drift af ressourceplads'),
    data('Pleje af fællesarealer - fællesarealgruppen'),
    data('Medlemsskab af foreninger'),
    data('Arbejdsdage'),
    data('Fonden Nødværge - årligt rådighedsbeløb'),
    data('Fællesspisninger'),
    data('Solhvervsfest 2024'),
    data('Æbledag'),
    data('Spontane gaver'),
    data('Ansvarsforsikring "bestyrelsen"'),
    data('Frilands samlings rådighedsbeløb'),
    data('Økonomigruppen rådighedsbeløb'),
    sep,
    data('1 Nye skilte på Friland'),
    data('2 Nyt intranet "Heynabo"'),
    data('3a FrilandsFestival'),
    data('3b Aktivit støtter Frilands Fællesskab'),
    data('Sct. Hans'),
    data('5 Emhætte til Ravnens køkken'),
    data('8 Julestue'),
    data('9 Flere og længere arbejdsdage'),
    data('10 Opgradering af lille sal til film og musik'),
    data('11 Vand projektgruppen'),
    data('12 Remisen (fælles værkste)'),
    data('13 Legeplads - genansøgning'),
  ];
  let i = 0;
  for (const r of rows) {
    r.id = r.type === 'separator' ? `sep-${i}` : `row-${i}`;
    i++;
  }
  return {
    version: 1,
    periodLabel: '2026-2027',
    rows,
  };
}
