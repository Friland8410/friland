/**
 * Mapping fra e-conomic kontonumre til årsregnskab.
 * Tilpas til Frilands kontoplan i e-conomic ved at ændre intervallerne nedenfor.
 * BAS bruger 4-cifrede kontonumre.
 *
 * Formueopgørelse: 1xxx aktiver, 2xxx-3xxx passiver/egenkapital
 * Resultatopgørelse: 4xxx-5xxx indtægter, 6xxx-9xxx udgifter (typisk)
 * Undtagen 8xxx der ofte er finansielle indtægter/udgifter
 */

// (from, to) intervaller - inklusiv
function i(from, to) {
  return { from, to };
}

const INDTAEGTER = {
  parkeringVaskeri: [i(4020, 4039)],
  andelskontingent: [i(7010, 7299), i(4000, 4019), i(4040, 4099)],
  renteindtaegter: [i(8110, 8139)],
};

const UDGIFTER = {
  administration: [i(6100, 6199)],
  vedligeholdelse: [i(6300, 6499)],
  renteudgifter: [i(8210, 8299), i(8111, 8119)],
  forsikring: [i(6120, 6129)],
  ejendomsskatter: [i(6200, 6219)],
  varmeVandAfloeb: [i(6130, 6169)],
  revisionOevrige: [i(6190, 6199), i(6990, 6999)],
};

const AKTIVER = {
  kasseBank: [i(1000, 1099)],
  fordringer: [i(1510, 1599)],
  ejendom: [i(1200, 1299)],
};

const PASSIVER = {
  andelskapital: [i(3000, 3019)],
  overfoerselsreserve: [i(3020, 3099)],
  realkreditlaan: [i(3100, 3999)],
  skyldigeOmkostninger: [i(2000, 2199), i(5500, 5599)],
  forudbetaltBoligafgift: [i(2200, 2299), i(4500, 4529)],
};

function inInterval(num, iv) {
  return num >= iv.from && num <= iv.to;
}

function findPost(accountNumber, accountType) {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) return null;

  const type = accountType || (num >= 4000 ? 'profitAndLoss' : 'status');

  if (type === 'profitAndLoss' || num >= 4000) {
    for (const [post, intervals] of Object.entries(INDTAEGTER)) {
      if (intervals.some((iv) => inInterval(num, iv))) return { kategori: 'indtaegter', post };
    }
    for (const [post, intervals] of Object.entries(UDGIFTER)) {
      if (intervals.some((iv) => inInterval(num, iv))) return { kategori: 'udgifter', post };
    }
    if (num >= 4000 && num <= 5999) return { kategori: 'indtaegter', post: 'andreIndtaegter' };
    if (num >= 7000 && num <= 7999) return { kategori: 'udgifter', post: 'oevrigeUdgifter' };
    if (num >= 8000 && num <= 8999) {
      if (num >= 8110 && num < 8200) return { kategori: 'indtaegter', post: 'renteindtaegter' };
      return { kategori: 'udgifter', post: 'oevrigeUdgifter' };
    }
    if (num >= 9000 && num <= 9999) return { kategori: 'udgifter', post: 'oevrigeUdgifter' };
    if (num >= 6000 && num <= 6999) return { kategori: 'udgifter', post: 'oevrigeUdgifter' };
  }

  if (type === 'status' || (num >= 1000 && num < 4000)) {
    for (const [post, intervals] of Object.entries(AKTIVER)) {
      if (intervals.some((iv) => inInterval(num, iv))) return { kategori: 'aktiver', post };
    }
    for (const [post, intervals] of Object.entries(PASSIVER)) {
      if (intervals.some((iv) => inInterval(num, iv))) return { kategori: 'passiver', post };
    }
    if (num >= 1000 && num <= 1999) return { kategori: 'aktiver', post: 'oevrigeAktiver' };
    if (num >= 2000 && num <= 3999) return { kategori: 'passiver', post: 'oevrigePassiver' };
  }

  return null;
}

const POST_NAVNE = {
  andelskontingent: 'Andelskontingent',
  parkeringVaskeri: 'Indtægter fra parkering og vaskeri',
  renteindtaegter: 'Renteindtægter',
  andreIndtaegter: 'Andre indtægter',
  administration: 'Administration og drift',
  vedligeholdelse: 'Vedligeholdelse',
  renteudgifter: 'Renteudgifter',
  forsikring: 'Forsikring',
  ejendomsskatter: 'Ejendomsskatter og grundskyld',
  varmeVandAfloeb: 'Varme, vand og afløb',
  revisionOevrige: 'Revision og øvrige driftsomkostninger',
  oevrigeUdgifter: 'Øvrige udgifter',
  kasseBank: 'Kasse og bank',
  fordringer: 'Fordringer',
  ejendom: 'Ejendom',
  oevrigeAktiver: 'Øvrige aktiver',
  andelskapital: 'Andelskapital',
  overfoerselsreserve: 'Overførselsreserve',
  realkreditlaan: 'Realkreditlån',
  skyldigeOmkostninger: 'Skyldige omkostninger',
  forudbetaltBoligafgift: 'Forudbetalt boligafgift',
  oevrigePassiver: 'Øvrige passiver',
};

export { findPost, POST_NAVNE, INDTAEGTER, UDGIFTER, AKTIVER, PASSIVER };
