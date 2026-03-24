import PDFDocument from 'pdfkit';

function formatDatoDansk(isoDato) {
  const parts = String(isoDato).split('-');
  if (parts.length !== 3) return String(isoDato);
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return String(isoDato);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

function formatKr(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0,00';
  return new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

/**
 * GF-stil faktura-PDF — samme information som tekstbilaget (dato, adresse, titel, linjer, I alt, indsender).
 */
export function buildGfFakturaPdfBuffer({
  datoIso,
  navn,
  adr,
  postnr,
  by,
  titel,
  linjer,
  total,
  kontaktNavn,
  kontaktEmail,
  bem,
}) {
  const datoVis = /^\d{4}-\d{2}-\d{2}$/.test(String(datoIso)) ? formatDatoDansk(datoIso) : String(datoIso || '');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 56,
      info: { Title: String(titel).slice(0, 200), Author: 'Friland' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 56;
    const right = 539;
    const w = right - left;
    const amountW = 92;
    const textW = w - amountW - 14;

    let y = 56;

    doc.fillColor('#000000');
    doc.font('Helvetica-Bold').fontSize(18).text(String(titel), left, y, { width: w });
    y += doc.heightOfString(String(titel), { width: w }) + 10;

    doc.font('Helvetica').fontSize(10).text(`Dato: ${datoVis}`, left, y);
    y += 20;

    doc.text(String(navn), left, y, { width: w });
    y += 14;
    doc.text(String(adr), left, y, { width: w });
    y += 14;
    doc.text(`${String(postnr)} ${String(by)}`, left, y, { width: w });
    y += 26;

    doc.save().moveTo(left, y).lineTo(right, y).strokeColor('#222222').lineWidth(0.75).stroke().restore();
    y += 10;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
    doc.text('Tekst', left, y, { width: textW });
    doc.text('Beløb (kr)', right - amountW, y, { width: amountW, align: 'right' });
    y += 14;

    doc.save().moveTo(left, y).lineTo(right, y).strokeColor('#cccccc').lineWidth(0.5).stroke().restore();
    y += 8;

    doc.font('Helvetica').fontSize(10);
    for (const l of linjer) {
      const tekst = String(l.tekst ?? '');
      const pris = l.pris;
      const amountStr = `${formatKr(pris)} kr`;
      const hText = doc.heightOfString(tekst, { width: textW });
      doc.fillColor('#000000').text(tekst, left, y, { width: textW, lineGap: 1 });
      doc.text(amountStr, right - amountW, y, { width: amountW, align: 'right' });
      y += Math.max(hText, 15) + 5;
    }

    y += 4;
    doc.save().moveTo(left, y).lineTo(right, y).strokeColor('#222222').lineWidth(0.75).stroke().restore();
    y += 12;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
    doc.text('I alt', left, y, { width: textW });
    doc.text(`${formatKr(total)} kr`, right - amountW, y, { width: amountW, align: 'right' });
    y += 40;

    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    doc.text(`Indsender: ${kontaktNavn} <${kontaktEmail}>`, left, y, { width: w });
    y += 14;
    if (bem && String(bem).trim()) {
      doc.text(`Bemærkning: ${String(bem)}`, left, y, { width: w, lineGap: 2 });
    }

    doc.end();
  });
}
