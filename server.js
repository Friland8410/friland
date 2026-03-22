import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const ECONOMIC_BASE = 'https://restapi.e-conomic.com';
const appSecret = process.env.ECONOMIC_APP_SECRET_TOKEN || 'demo';
const agreementGrant = process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN || 'demo';

function economicHeaders() {
  return {
    'X-AppSecretToken': appSecret,
    'X-AgreementGrantToken': agreementGrant,
    'Content-Type': 'application/json',
  };
}

async function fetchEconomic(url) {
  const fullUrl = url.startsWith('http') ? url : `${ECONOMIC_BASE}${url}`;
  const res = await fetch(fullUrl, { headers: economicHeaders() });
  if (!res.ok) {
    const err = new Error(`e-conomic API: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = await res.text();
    throw err;
  }
  return res.json();
}

app.use(cors());
app.use(express.static(join(__dirname, '.')));

// API: Hent regnskabsår
app.get('/api/accounting-years', async (req, res) => {
  try {
    const data = await fetchEconomic('/accounting-years?pagesize=100');
    res.json(data);
  } catch (err) {
    console.error('e-conomic accounting-years:', err);
    res.status(err.status || 500).json({
      error: 'Kunne ikke hente regnskabsår fra e-conomic',
      detail: err.body || err.message,
    });
  }
});

function extractYearId(selfLink) {
  if (!selfLink || typeof selfLink !== 'string') return null;
  const match = selfLink.match(/\/accounting-years\/([^/?]+)/);
  return match ? match[1] : null;
}

// API: Hent årsafslutning for et regnskabsår (konto-totaler)
app.get('/api/accounting-years/:year/totals', async (req, res) => {
  try {
    const year = req.params.year;
    const yearsRes = await fetchEconomic('/accounting-years?pagesize=100');
    const years = yearsRes.collection || yearsRes;
    const list = Array.isArray(years) ? years : [years];
    const match = list.find(
      (y) =>
        y &&
        (String(y.year) === year ||
          (y.year && String(y.year).startsWith(year)) ||
          (y.year && String(y.year).includes(year)))
    );
    const yearId = match ? extractYearId(match.self) : year;
    const data = await fetchEconomic(`/accounting-years/${yearId}/totals?pagesize=1000`);
    res.json(data);
  } catch (err) {
    console.error('e-conomic totals:', err);
    res.status(err.status || 500).json({
      error: 'Kunne ikke hente totaler fra e-conomic',
      detail: err.body || err.message,
    });
  }
});

// API: Hent kontoplan (accounts) for at få kontonavne
app.get('/api/accounts', async (req, res) => {
  try {
    const data = await fetchEconomic('/accounts?pagesize=1000');
    res.json(data);
  } catch (err) {
    console.error('e-conomic accounts:', err);
    res.status(err.status || 500).json({
      error: 'Kunne ikke hente kontoplan fra e-conomic',
      detail: err.body || err.message,
    });
  }
});

// API: Samlet årsregnskab-data (regnskabsår + totaler + kontoplan)
app.get('/api/arsregnskab/:year', async (req, res) => {
  try {
    const year = req.params.year;
    const yearsRes = await fetchEconomic('/accounting-years?pagesize=100');
    const years = yearsRes.collection || yearsRes;
    const list = Array.isArray(years) ? years : [years];
    const match = list.find(
      (y) =>
        y &&
        (String(y.year) === year ||
          (y.year && String(y.year).startsWith(year)) ||
          (y.year && String(y.year).includes(year)))
    );
    const yearId = match ? extractYearId(match.self) : year;

    const [totalsRes, accountsRes] = await Promise.all([
      fetchEconomic(`/accounting-years/${yearId}/totals?pagesize=1000`).catch(() => ({ collection: [] })),
      fetchEconomic('/accounts?pagesize=1000'),
    ]);

    const totals = totalsRes.collection || totalsRes;
    const accounts = accountsRes.collection || accountsRes;

    const accountMap = {};
    (Array.isArray(accounts) ? accounts : [accounts]).forEach((a) => {
      if (a && a.accountNumber != null) accountMap[a.accountNumber] = a;
    });

    const totalsWithNames = (Array.isArray(totals) ? totals : [totals])
      .filter(Boolean)
      .map((t) => ({
        accountNumber: t.account?.accountNumber ?? t.accountNumber,
        name: accountMap[t.account?.accountNumber ?? t.accountNumber]?.name ?? `Konto ${t.account?.accountNumber ?? '?'}`,
        totalInBaseCurrency: t.totalInBaseCurrency ?? 0,
      }));

    res.json({
      accountingYears: list,
      totals: totalsWithNames,
      year: parseInt(year, 10),
    });
  } catch (err) {
    console.error('e-conomic årsregnskab:', err);
    res.status(err.status || 500).json({
      error: 'Kunne ikke hente årsregnskab fra e-conomic',
      detail: err.body || err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Friland årsregnskab kører på http://localhost:${PORT}`);
  console.log(`e-conomic: ${appSecret === 'demo' ? 'Demo-mode (dummy data)' : 'Produktion'}`);
});
