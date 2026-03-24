export const KONTINGENT_AAR = ['2025', '2026', '2027', '2028', '2029', '2030'];

export function defaultBetalt() {
  const o = {};
  for (const y of KONTINGENT_AAR) o[y] = false;
  return o;
}

/** Tom skabelon — udfyldes af admin/bogholder (eller importeres senere). */
export function createDefaultKontingent() {
  const b = defaultBetalt();
  const person = (id) => ({
    id,
    navn: '',
    email: '',
    telefon: '',
    notat: '',
    betalt: { ...b },
  });
  return {
    version: 1,
    lods: [
      { id: 'lod-1', label: 'Lod 1', personer: [person('p-1-1')] },
      { id: 'lod-2', label: 'Lod 2', personer: [person('p-2-1')] },
    ],
  };
}
