/**
 * Synkroniserer e-conomic → Supabase:
 * - GET /accounts (pagination)
 * - GET /accounting-years/:accountingYear/entries (pagination pr. regnskabsår)
 *
 * Miljø: ECONOMIC_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valgfrit: SYNC_ACCOUNTING_YEARS=2024,2025 (tom = alle år)
 *          SYNC_FROM_DATE / SYNC_TO_DATE (ISO) — filtrerer posteringer (client-side efter hent)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const ECONOMIC_BASE = 'https://restapi.e-conomic.com';
const PAGE_SIZE = 1000;

function economicHeaders() {
  const appSecret = process.env.ECONOMIC_APP_SECRET_TOKEN;
  const agreementGrant = process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN;
  if (!appSecret || !agreementGrant) {
    throw new Error('Mangler ECONOMIC_APP_SECRET_TOKEN eller ECONOMIC_AGREEMENT_GRANT_TOKEN i .env');
  }
  return {
    'X-AppSecretToken': appSecret,
    'X-AgreementGrantToken': agreementGrant,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function fetchEconomicJson(url) {
  const fullUrl = url.startsWith('http') ? url : `${ECONOMIC_BASE}${url}`;
  const res = await fetch(fullUrl, { headers: economicHeaders() });
  const bodyText = await res.text();
  if (!res.ok) {
    let msg = `e-conomic ${res.status} ${res.statusText} — ${fullUrl}`;
    try {
      const j = JSON.parse(bodyText);
      if (j.message) msg = j.message;
      if (j.developerHint) msg += ` (${j.developerHint})`;
    } catch {
      msg += ` — ${bodyText.slice(0, 200)}`;
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  try {
    return JSON.parse(bodyText);
  } catch (e) {
    throw new Error(`e-conomic returnerede ugyldig JSON fra ${fullUrl}: ${e.message}`);
  }
}

/** Hent alle sider (pagination.nextPage) */
async function fetchAllCollection(firstPathOrUrl) {
  let nextUrl = firstPathOrUrl.startsWith('http')
    ? firstPathOrUrl
    : `${ECONOMIC_BASE}${firstPathOrUrl}${firstPathOrUrl.includes('?') ? '&' : '?'}pagesize=${PAGE_SIZE}`;
  const items = [];
  let page = 0;
  while (nextUrl) {
    page += 1;
    const data = await fetchEconomicJson(nextUrl);
    const col = data.collection;
    if (!Array.isArray(col)) {
      console.error('[sync] Uventet svar uden collection-array:', Object.keys(data), 'url=', nextUrl);
      break;
    }
    items.push(...col);
    nextUrl = data.pagination?.nextPage || null;
    if (nextUrl && page % 10 === 0) {
      console.log(`[sync] …hentet side ${page}, ${items.length} rækker indtil videre`);
    }
  }
  return items;
}

function extractYearId(selfLink) {
  if (!selfLink || typeof selfLink !== 'string') return null;
  const m = selfLink.match(/\/accounting-years\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function findAccountingYear(list, yearStr) {
  const yStr = String(yearStr);
  return (
    list.find((y) => y && String(y.year) === yStr) ||
    list.find((y) => y && y.year && String(y.year).startsWith(yStr)) ||
    list.find((y) => y && y.year && String(y.year).includes(yStr)) ||
    null
  );
}

function parseYearFilter() {
  const raw = process.env.SYNC_ACCOUNTING_YEARS;
  if (!raw || !raw.trim()) return null;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseOptionalDate(envName) {
  const v = process.env[envName];
  if (!v || !String(v).trim()) return null;
  const d = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.warn(`[sync] ${envName}="${d}" er ikke YYYY-MM-DD — ignoreres`);
    return null;
  }
  return d;
}

function mapAccountRow(a) {
  const num = a.accountNumber;
  if (num == null || Number.isNaN(Number(num))) return null;
  return {
    account_number: Number(num),
    name: String(a.name ?? `Konto ${num}`),
    updated_at: new Date().toISOString(),
  };
}

function mapEntryRow(entry, accountingYearId) {
  const self = entry.self;
  if (!self || typeof self !== 'string') {
    return null;
  }
  const accNum = entry.account?.accountNumber ?? entry.accountNumber;
  if (accNum == null) {
    return null;
  }
  const rawAmount =
    entry.amountInBaseCurrency != null ? entry.amountInBaseCurrency : entry.amount;
  if (rawAmount == null || Number.isNaN(Number(rawAmount))) {
    return null;
  }
  const dateStr = entry.date;
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  const entryDate = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return null;
  }
  return {
    economic_self: self,
    account_number: Number(accNum),
    amount: Number(rawAmount),
    entry_date: entryDate,
    accounting_year_id: accountingYearId ?? null,
  };
}

function entryPassesDateFilter(row, fromD, toD) {
  if (!row) return false;
  if (fromD && row.entry_date < fromD) return false;
  if (toD && row.entry_date > toD) return false;
  return true;
}

export async function runSync() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Mangler SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const fromD = parseOptionalDate('SYNC_FROM_DATE');
  const toD = parseOptionalDate('SYNC_TO_DATE');
  const yearFilter = parseYearFilter();

  console.log('[sync] Henter kontoplan fra e-conomic …');
  const accountItems = await fetchAllCollection('/accounts');
  const accountRows = accountItems.map(mapAccountRow).filter(Boolean);
  if (accountRows.length === 0) {
    console.error('[sync] Ingen gyldige konti — afbryder');
    return;
  }

  const batchSize = 500;
  for (let i = 0; i < accountRows.length; i += batchSize) {
    const chunk = accountRows.slice(i, i + batchSize);
    const { error } = await supabase.from('accounts').upsert(chunk, { onConflict: 'account_number' });
    if (error) {
      console.error('[sync] Supabase accounts upsert fejl:', error.message, error.details || '');
      throw error;
    }
  }
  console.log(`[sync] Kontoplan: ${accountRows.length} konti upsertet`);

  console.log('[sync] Henter regnskabsår …');
  const yearsData = await fetchEconomicJson(`${ECONOMIC_BASE}/accounting-years?pagesize=100`);
  const yearsList = Array.isArray(yearsData.collection) ? yearsData.collection : [];
  let yearsToSync = yearsList.filter((y) => y && y.self);
  if (yearFilter?.length) {
    yearsToSync = yearFilter
      .map((y) => findAccountingYear(yearsList, y))
      .filter(Boolean);
    console.log('[sync] Filtreret til år:', yearFilter.join(', '));
  }
  if (yearsToSync.length === 0) {
    console.error('[sync] Ingen regnskabsår at synkronisere');
    return;
  }

  const accountNumbers = new Set(accountRows.map((r) => r.account_number));
  let totalEntries = 0;
  let skipped = 0;

  for (const yearObj of yearsToSync) {
    const yearId = extractYearId(yearObj.self);
    const label = yearObj.year ?? yearId;
    if (!yearId) {
      console.error('[sync] Kan ikke udlede yearId fra', yearObj);
      continue;
    }
    const path = `/accounting-years/${encodeURIComponent(yearId)}/entries`;
    console.log(`[sync] Posteringer for regnskabsår ${label} (${yearId}) …`);
    let entryItems;
    try {
      entryItems = await fetchAllCollection(path);
    } catch (e) {
      console.error(`[sync] Fejl ved hent af entries for ${label}:`, e.message);
      continue;
    }

    const mapped = [];
    for (const e of entryItems) {
      const row = mapEntryRow(e, yearId);
      if (!row) {
        skipped += 1;
        continue;
      }
      if (!accountNumbers.has(row.account_number)) {
        skipped += 1;
        console.warn(`[sync] Springer postering over (ukendt konto ${row.account_number}): ${row.economic_self}`);
        continue;
      }
      if (!entryPassesDateFilter(row, fromD, toD)) {
        continue;
      }
      mapped.push(row);
    }

    for (let i = 0; i < mapped.length; i += batchSize) {
      const chunk = mapped.slice(i, i + batchSize);
      const { error } = await supabase.from('entries').upsert(chunk, { onConflict: 'economic_self' });
      if (error) {
        console.error('[sync] Supabase entries upsert fejl:', error.message, error.details || '');
        throw error;
      }
    }
    totalEntries += mapped.length;
    console.log(`[sync]   → ${mapped.length} linjer upsertet for ${label}`);
  }

  console.log(
    `[sync] Færdig. Entries upsert i alt (efter dato-filter): ${totalEntries}. Sprunget over (ugyldig/ukendt): ${skipped}`
  );
  if (fromD || toD) {
    console.log(`[sync] Dato-filter: fra ${fromD ?? '(ingen)'} til ${toD ?? '(ingen)'}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  runSync()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[sync] FEJL:', err.message || err);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
}
