/**
 * Årsregnskabsstruktur fra Excel (GF 25-26).
 * Hver post er parret med Frilands kontonumre fra Kontoplan.xlsx.
 * E-conomic: indtægtskonti har negativ balance, udgiftskonti har positiv balance.
 */

export const ARSREGNSKAB_STRUKTUR = {
  indtaegter: [
    { post: 'kontingent', navn: 'Kontingent', konti: [1010] },
    { post: 'grundskyld', navn: 'Grundskyld', konti: [1020] },
    { post: 'renteindtaegter', navn: 'Renteindtægter bank', konti: [4310] },
  ],
  udgifter: [
    { post: 'administration', navn: 'Administration', konti: [1310] },
    { post: 'fondenNoedvaerge', navn: 'Fonden Nødværge', konti: [1311] },
    { post: 'ansvarsforsikring', navn: 'Ansvarsforsikring', konti: [1312] },
    { post: 'renoDjurs', navn: 'Reno Djurs', konti: [1320] },
    { post: 'generalforsamling', navn: 'Generalforsamling', konti: [1321] },
    { post: 'driftRessourceplads', navn: 'Drift af ressourceplads', konti: [1325] },
    { post: 'vedligeholdelseVeje', navn: 'Vedligeholdelse af veje', konti: [1326] },
    { post: 'plejeFaellesarealer', navn: 'Pleje af fællesarealer', konti: [1327] },
    { post: 'medlemsskab', navn: 'Medlemsskab af foreninger', konti: [1328] },
    { post: 'frilandsaften', navn: 'Frilandsaften rådighedsbeløb', konti: [1380] },
    { post: 'oekonomigruppen', navn: 'Økonomigruppens rådighedsbeløb', konti: [1385] },
    { post: 'tilskudFestival', navn: 'Tilskud til Festival 25', konti: [2507, 2509] },
    { post: 'skilte', navn: 'Skilte', konti: [2508] },
    { post: 'arbejdsdage', navn: 'Arbejdsdage', konti: [2510] },
    { post: 'ravnebidrag', navn: 'Ravnebidrag', konti: [2511] },
    { post: 'aebledag', navn: 'Æbledag', konti: [2512] },
    { post: 'remise', navn: 'Remise', konti: [2513] },
    { post: 'sctHans', navn: 'Sct. Hans fest', konti: [2518] },
    { post: 'faellesspisning', navn: 'Fællesspisning', konti: [2520] },
    { post: 'spontaneGaver', navn: 'Spontane gaver', konti: [2521] },
    { post: 'livIRavnen', navn: 'Liv i Ravnen', konti: [2529] },
    { post: 'solhvervsfest', navn: 'Solhvervsfest', konti: [2530] },
    { post: 'syddjursRottebekaempelse', navn: 'Syddjurs Kommune Rottebekæmpelse', konti: [2638] },
    { post: 'projekterGF', navn: 'Projekter godkendt på GF (svævebane)', konti: [2640] },
    { post: 'grundskyldOpkraevning', navn: 'Grundskyld opkrævning', konti: [1324] },
  ],
};

/** Kontonummer → Excel-post (for hurtig opslag) */
export function buildKontoTilPostMap() {
  const map = {};
  for (const { post, konti } of ARSREGNSKAB_STRUKTUR.indtaegter) {
    for (const k of konti) map[k] = { kategori: 'indtaegter', post };
  }
  for (const { post, konti } of ARSREGNSKAB_STRUKTUR.udgifter) {
    for (const k of konti) map[k] = { kategori: 'udgifter', post };
  }
  return map;
}
