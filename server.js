import './log-start.js';

process.on('uncaughtException', (err) => {
  console.error('Uventet fejl:', err);
  process.exit(1);
});

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { buildGfFakturaPdfBuffer } from './gf-faktura-pdf.js';
import { createDefaultOversigt } from './oversigt-default.js';
import { createDefaultForbrugIndtastet } from './forbrug-indtastet-default.js';
import { createDefaultKontingent, KONTINGENT_AAR, defaultBetalt } from './kontingent-default.js';

try {
  dotenv.config();
} catch (e) {
  console.error('Fejl ved indlæsning af .env:', e.message);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const FORBRUG_DEFAULT_JSON = join(__dirname, 'forbrug-kategorier.json');
const FORBRUG_STATE_JSON = join(__dirname, 'data', 'forbrug-kategorier-state.json');
const FORBRUG_MANUEL_JSON = join(__dirname, 'data', 'forbrug-manuelle-beloeb.json');
const USERS_JSON = join(__dirname, 'data', 'users.json');
const SETTINGS_JSON = join(__dirname, 'data', 'settings.json');
const OVERSIGT_JSON = join(__dirname, 'data', 'oversigt.json');
const FORBRUG_INDTASTET_JSON = join(__dirname, 'data', 'forbrug-indtastet.json');
const KONTINGENT_JSON = join(__dirname, 'data', 'kontingent.json');

const authSessions = new Map();
const SESSION_COOKIE = 'friland_sid';

const uploadBilag = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function normalizeEmail(e) {
  return String(e ?? '').trim().toLowerCase();
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function loadUsers() {
  const raw = await readFile(USERS_JSON, 'utf8');
  const j = JSON.parse(raw);
  if (!j.users || !Array.isArray(j.users)) return { users: [] };
  return j;
}

async function saveUsers(data) {
  await mkdir(join(__dirname, 'data'), { recursive: true });
  await writeFile(USERS_JSON, JSON.stringify(data, null, 2), 'utf8');
}

async function loadSettings() {
  try {
    const raw = await readFile(SETTINGS_JSON, 'utf8');
    const j = JSON.parse(raw);
    return {
      bookkeeperEmail: typeof j.bookkeeperEmail === 'string' ? j.bookkeeperEmail.trim() : '',
    };
  } catch {
    return { bookkeeperEmail: '' };
  }
}

async function saveSettings(partial) {
  const cur = await loadSettings();
  const next = { bookkeeperEmail: cur.bookkeeperEmail };
  if (partial && partial.bookkeeperEmail !== undefined) {
    next.bookkeeperEmail = String(partial.bookkeeperEmail ?? '').trim();
  }
  await mkdir(join(__dirname, 'data'), { recursive: true });
  await writeFile(SETTINGS_JSON, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function parseTalLoose(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  let t = String(v).trim().replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function normalizeOversigtRowIds(rows, prefix) {
  return (Array.isArray(rows) ? rows : []).map((row, i) => {
    const o = row && typeof row === 'object' ? { ...row } : {};
    o.id = String(o.id || `${prefix}-${i}-${Date.now()}`).slice(0, 80);
    return o;
  });
}

function normalizeOversigtPayload(body) {
  const d = body && typeof body === 'object' ? body : {};
  const def = createDefaultOversigt();
  const periodLabel = String(d.periodLabel ?? def.periodLabel).slice(0, 120);
  const mapTre = (arr, p) =>
    normalizeOversigtRowIds(arr, p).map((r) => ({
      id: r.id,
      label: String(r.label ?? 'Linje').slice(0, 200),
      budget: parseTalLoose(r.budget),
      forbrug: parseTalLoose(r.forbrug),
    }));
  const mapIndt = (arr) =>
    normalizeOversigtRowIds(arr, 'i').map((r) => ({
      id: r.id,
      label: String(r.label ?? 'Linje').slice(0, 200),
      beloeb: parseTalLoose(r.beloeb),
    }));
  const mapKont = (arr) =>
    normalizeOversigtRowIds(arr, 'k').map((r) => ({
      id: r.id,
      label: String(r.label ?? 'Linje').slice(0, 200),
      antal: r.antal === null || r.antal === '' ? null : parseTalLoose(r.antal),
      sats: r.sats === null || r.sats === '' ? null : parseTalLoose(r.sats),
      total: parseTalLoose(r.total),
    }));
  const mapLik = (arr) =>
    normalizeOversigtRowIds(arr, 'l').map((r) => ({
      id: r.id,
      label: String(r.label ?? 'Linje').slice(0, 200),
      beloeb: parseTalLoose(r.beloeb),
    }));
  return {
    version: 1,
    periodLabel,
    indtaegter: mapIndt(d.indtaegter ?? def.indtaegter),
    fasteUdgifter: mapTre(d.fasteUdgifter ?? def.fasteUdgifter, 'f'),
    raadighed: mapTre(d.raadighed ?? def.raadighed, 'r'),
    projekter: mapTre(d.projekter ?? def.projekter, 'p'),
    kontingent: mapKont(d.kontingent ?? def.kontingent),
    likviditetLinjer: mapLik(d.likviditetLinjer ?? def.likviditetLinjer),
    likviditetPrimo: parseTalLoose(d.likviditetPrimo ?? def.likviditetPrimo),
    likviditetUltimo: parseTalLoose(d.likviditetUltimo ?? def.likviditetUltimo),
    garantbevis: parseTalLoose(d.garantbevis ?? def.garantbevis),
  };
}

async function loadOversigt() {
  try {
    const raw = await readFile(OVERSIGT_JSON, 'utf8');
    const j = JSON.parse(raw);
    return normalizeOversigtPayload(j);
  } catch {
    return normalizeOversigtPayload(createDefaultOversigt());
  }
}

async function saveOversigt(data) {
  const norm = normalizeOversigtPayload(data);
  await mkdir(join(__dirname, 'data'), { recursive: true });
  await writeFile(OVERSIGT_JSON, JSON.stringify(norm, null, 2), 'utf8');
  return norm;
}

async function ensureOversigtFile() {
  try {
    await readFile(OVERSIGT_JSON);
  } catch {
    await saveOversigt(createDefaultOversigt());
    console.log('[oversigt] Oprettet data/oversigt.json med standardlayout');
  }
}

function normalizeForbrugIndtastetPayload(body) {
  const def = createDefaultForbrugIndtastet();
  const d = body && typeof body === 'object' ? body : {};
  const periodLabel = String(d.periodLabel ?? def.periodLabel).slice(0, 120);
  const raw = Array.isArray(d.rows) ? d.rows : def.rows;
  const rows = raw.map((row, i) => {
    if (row && row.type === 'separator') {
      return { type: 'separator', id: String(row.id || `sep-${i}`).slice(0, 80) };
    }
    return {
      type: 'data',
      id: String(row?.id || `row-${i}`).slice(0, 80),
      label: String(row?.label ?? 'Linje').slice(0, 200),
      samletForbrug: parseTalLoose(row?.samletForbrug),
    };
  });
  return { version: 1, periodLabel, rows };
}

async function loadForbrugIndtastet() {
  try {
    const raw = await readFile(FORBRUG_INDTASTET_JSON, 'utf8');
    const j = JSON.parse(raw);
    return normalizeForbrugIndtastetPayload(j);
  } catch {
    return normalizeForbrugIndtastetPayload(createDefaultForbrugIndtastet());
  }
}

async function saveForbrugIndtastet(data) {
  const norm = normalizeForbrugIndtastetPayload(data);
  await mkdir(join(__dirname, 'data'), { recursive: true });
  await writeFile(FORBRUG_INDTASTET_JSON, JSON.stringify(norm, null, 2), 'utf8');
  return norm;
}

async function ensureForbrugIndtastetFile() {
  try {
    await readFile(FORBRUG_INDTASTET_JSON);
  } catch {
    await saveForbrugIndtastet(createDefaultForbrugIndtastet());
    console.log('[forbrug-indtastet] Oprettet data/forbrug-indtastet.json med standardrækker');
  }
}

function normalizeKontingentPayload(body) {
  const def = createDefaultKontingent();
  const d = body && typeof body === 'object' ? body : {};
  const lodsRaw = Array.isArray(d.lods) ? d.lods : def.lods;
  const lods = lodsRaw.map((lod, li) => {
    const id = String(lod?.id || `lod-${li}`).slice(0, 80);
    const label = String(lod?.label ?? 'Lod').slice(0, 120);
    let personer = (Array.isArray(lod?.personer) ? lod.personer : []).map((p, pi) => {
      const pid = String(p?.id || `p-${li}-${pi}`).slice(0, 80);
      const betalt = defaultBetalt();
      if (p && typeof p.betalt === 'object') {
        for (const y of KONTINGENT_AAR) betalt[y] = Boolean(p.betalt[y]);
      }
      return {
        id: pid,
        navn: String(p?.navn ?? '').slice(0, 120),
        email: String(p?.email ?? '').slice(0, 120),
        telefon: String(p?.telefon ?? '').slice(0, 40),
        notat: p?.notat != null ? String(p.notat).slice(0, 80) : '',
        betalt,
      };
    });
    if (personer.length === 0) {
      personer = [
        {
          id: `p-${li}-0`,
          navn: '',
          email: '',
          telefon: '',
          notat: '',
          betalt: defaultBetalt(),
        },
      ];
    }
    return { id, label, personer };
  });
  if (lods.length === 0) return normalizeKontingentPayload(def);
  return { version: 1, lods };
}

async function loadKontingent() {
  try {
    const raw = await readFile(KONTINGENT_JSON, 'utf8');
    const j = JSON.parse(raw);
    return normalizeKontingentPayload(j);
  } catch {
    return normalizeKontingentPayload(createDefaultKontingent());
  }
}

async function saveKontingent(data) {
  const norm = normalizeKontingentPayload(data);
  await mkdir(join(__dirname, 'data'), { recursive: true });
  await writeFile(KONTINGENT_JSON, JSON.stringify(norm, null, 2), 'utf8');
  return norm;
}

async function ensureKontingentFile() {
  try {
    await readFile(KONTINGENT_JSON);
  } catch {
    await saveKontingent(createDefaultKontingent());
    console.log('[kontingent] Oprettet data/kontingent.json med skabelon');
  }
}

function formatBeloebDaServer(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0,00';
  return new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

function parseBeloebDaLoose(s) {
  let t = String(s ?? '').trim().replace(/\s/g, '');
  if (!t) return NaN;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

function formatDatoKort(isoDato) {
  const [y, m, d] = String(isoDato).split('-').map(Number);
  if (!y || !m || !d) return String(isoDato);
  return `${d}/${m} ${y}`;
}

function safeAttachmentName(name) {
  const base = String(name || 'bilag').split(/[/\\]/).pop();
  return base.replace(/[^\wæøåÆØÅ.\s-]/gi, '_').slice(0, 120) || 'bilag';
}

async function sendMailToBookkeeper({ subject, text, html, attachments }) {
  const { bookkeeperEmail } = await loadSettings();
  const to = bookkeeperEmail?.trim();
  if (!to) {
    const err = new Error('Bogholder-email er ikke konfigureret');
    err.status = 503;
    throw err;
  }
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn('[mail] SMTP_HOST mangler — simuleret afsendelse (sæt SMTP_* og MAIL_FROM i .env)');
    console.log('--- MAIL (simulation) ---\nTil:', to, '\nEmne:', subject, '\n', String(text).slice(0, 2500));
    return { simulated: true };
  }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) {
    const err = new Error('MAIL_FROM eller SMTP_USER skal være sat for udgående mail');
    err.status = 500;
    throw err;
  }
  await transporter.sendMail({
    from,
    to,
    subject: String(subject).slice(0, 200),
    text,
    html: html || undefined,
    attachments: attachments?.length ? attachments : undefined,
  });
  return { simulated: false };
}

async function ensureUsersFile() {
  try {
    await readFile(USERS_JSON);
  } catch {
    const email = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL || 'nikolaj@idevaerket.dk');
    const plain = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Design86930881';
    const passwordHash = bcrypt.hashSync(plain, 10);
    await saveUsers({ users: [{ email, passwordHash, role: 'admin' }] });
    console.log('[auth] Oprettet data/users.json med administrator:', email);
  }
}

/** Sikrer primær admin (nikolaj@idevaerket.dk som standard): rolle admin; opretter bruger hvis mangler. */
async function ensureBootstrapAdmin() {
  const email = normalizeEmail(process.env.BOOTSTRAP_ADMIN_EMAIL || 'nikolaj@idevaerket.dk');
  const plain = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Design86930881';
  let data;
  try {
    data = await loadUsers();
  } catch {
    return;
  }
  const idx = data.users.findIndex((u) => u.email === email);
  if (idx < 0) {
    data.users.push({
      email,
      passwordHash: bcrypt.hashSync(plain, 10),
      role: 'admin',
    });
    await saveUsers(data);
    console.log('[auth] Primær admin-bruger oprettet:', email);
    return;
  }
  let changed = false;
  if (data.users[idx].role !== 'admin') {
    data.users[idx].role = 'admin';
    changed = true;
  }
  if (process.env.BOOTSTRAP_ADMIN_SYNC_PASSWORD === '1' || process.env.BOOTSTRAP_ADMIN_SYNC_PASSWORD === 'true') {
    data.users[idx].passwordHash = bcrypt.hashSync(
      process.env.BOOTSTRAP_ADMIN_PASSWORD || plain,
      10
    );
    changed = true;
  }
  if (changed) await saveUsers(data);
}

function pruneAuthSessions() {
  const now = Date.now();
  for (const [token, s] of authSessions) {
    if (!s || s.exp < now) authSessions.delete(token);
  }
}

function getSessionToken(req) {
  const c = req.cookies?.[SESSION_COOKIE];
  if (c && typeof c === 'string' && c.trim()) return c.trim();
  const h = req.headers.authorization;
  if (h && typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim() || null;
  return null;
}

function attachSessionUser(req, res, next) {
  pruneAuthSessions();
  const t = getSessionToken(req);
  if (t) {
    const s = authSessions.get(t);
    if (s && s.exp > Date.now()) {
      req.frilandUser = { email: s.email, role: s.role };
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.frilandUser) {
    return res.status(401).json({ error: 'Kræver login', loginRequired: true });
  }
  next();
}

function apiSkalIkkeKræveLogin(req) {
  const p = req.path || '';
  if (req.method === 'POST' && (p === '/auth/login' || p === '/auth/logout')) return true;
  if (req.method === 'GET' && (p === '/ping' || p === '/auth/me')) return true;
  return false;
}

function requireAdmin(req, res, next) {
  if (!req.frilandUser || req.frilandUser.role !== 'admin') {
    return res.status(403).json({ error: 'Kræver administrator' });
  }
  next();
}

function requireAdminOrBogholder(req, res, next) {
  const r = req.frilandUser?.role;
  if (!req.frilandUser || (r !== 'admin' && r !== 'bogholder')) {
    return res.status(403).json({ error: 'Kræver administrator eller bogholder' });
  }
  next();
}

async function loadManuelleBeloeb() {
  try {
    const raw = await readFile(FORBRUG_MANUEL_JSON, 'utf8');
    const j = JSON.parse(raw);
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

async function saveManuelleBeloebFile(obj) {
  await mkdir(join(__dirname, 'data'), { recursive: true });
  await writeFile(FORBRUG_MANUEL_JSON, JSON.stringify(obj, null, 2), 'utf8');
}

function febLastDayRegnskabsaarSlut(y) {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return leap ? 29 : 28;
}

function regnskabsaarTilDatoer(startYear) {
  const y = Number(startYear);
  if (!Number.isFinite(y)) return null;
  const endY = y + 1;
  const d = febLastDayRegnskabsaarSlut(endY);
  return {
    fromDate: `${y}-03-01`,
    toDate: `${endY}-02-${String(d).padStart(2, '0')}`,
  };
}

/** Samme fortegns-/post-logik som i GET /api/arsregnskab/:year (e-conomic totaler). */
function aggregerLedgerRowsTilArsregnskab(balanceRows, kontoTilPost) {
  const aggregated = { indtaegter: {}, udgifter: {} };
  for (const r of balanceRows) {
    const accNum = Number(r.account_number);
    if (!Number.isFinite(accNum)) continue;
    const v = Number(r.balance) || 0;
    const mapped = kontoTilPost[accNum] ?? kontoTilPost[String(accNum)];
    if (!mapped) continue;
    const { kategori, post } = mapped;
    let beloeb = v;
    if (kategori === 'indtaegter') beloeb = -v;
    if (kategori === 'udgifter') beloeb = -Math.abs(v);
    if (!aggregated[kategori][post]) aggregated[kategori][post] = 0;
    aggregated[kategori][post] += beloeb;
  }
  return aggregated;
}

function ledgerRowsTilTotalsMedMapping(balanceRows, kontoTilPost) {
  return (balanceRows || []).map((r) => {
    const accNum = Number(r.account_number);
    const v = Number(r.balance) || 0;
    const mapped = Number.isFinite(accNum) ? kontoTilPost[accNum] ?? kontoTilPost[String(accNum)] : null;
    return {
      accountNumber: accNum,
      name: r.name ?? `Konto ${accNum}`,
      totalInBaseCurrency: v,
      mapped,
    };
  });
}

async function loadForbrugKategorier() {
  try {
    const raw = await readFile(FORBRUG_STATE_JSON, 'utf8');
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.kategorier)) return j;
  } catch (_) {}
  const raw = await readFile(FORBRUG_DEFAULT_JSON, 'utf8');
  return JSON.parse(raw);
}

function validateForbrugKategoriListe(list) {
  if (!Array.isArray(list)) {
    const err = new Error('kategorier skal være et array');
    err.status = 400;
    throw err;
  }
  const out = [];
  for (const k of list) {
    if (!k || typeof k.id !== 'string' || typeof k.navn !== 'string' || !Array.isArray(k.konti)) {
      const err = new Error('Hver kategori skal have id (string), navn (string), konti (array af tal)');
      err.status = 400;
      throw err;
    }
    const konti = [];
    for (const n of k.konti) {
      if (!Number.isFinite(Number(n))) {
        const err = new Error('konti skal kun indeholde tal');
        err.status = 400;
        throw err;
      }
      konti.push(Number(n));
    }
    out.push({ id: k.id, navn: k.navn, konti });
  }
  return out;
}

async function saveForbrugKategorier(body) {
  if (!body || !Array.isArray(body.kategorier)) {
    const err = new Error('Forventer { kategorier: [...] }');
    err.status = 400;
    throw err;
  }
  const kategorier = validateForbrugKategoriListe(body.kategorier);
  await mkdir(join(__dirname, 'data'), { recursive: true });
  await writeFile(
    FORBRUG_STATE_JSON,
    JSON.stringify({ version: body.version || 1, kategorier }, null, 2),
    'utf8'
  );
  return { ok: true };
}

async function forbrugAggForAar(startYearStr, kategorierInput) {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const err = new Error('Supabase ikke konfigureret (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    err.status = 503;
    throw err;
  }
  const datoer = regnskabsaarTilDatoer(startYearStr);
  if (!datoer) {
    const err = new Error('Ugyldigt årstal');
    err.status = 400;
    throw err;
  }
  const { fromDate, toDate } = datoer;
  let kategorier;
  if (Array.isArray(kategorierInput)) {
    kategorier = validateForbrugKategoriListe(kategorierInput);
  } else {
    const katData = await loadForbrugKategorier();
    kategorier = validateForbrugKategoriListe(katData.kategorier || []);
  }
  const balRes = await sb.rpc('get_ledger_balance', {
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (balRes.error) {
    const err = new Error(balRes.error.message || 'Supabase RPC fejl');
    err.status = 500;
    throw err;
  }
  const balanceRows = balRes.data || [];
  const saldoPrKonto = new Map();
  for (const r of balanceRows) {
    const n = Number(r.account_number);
    saldoPrKonto.set(n, Number(r.balance));
  }
  const manualAll = await loadManuelleBeloeb();
  const yearKey = String(Number(startYearStr));
  const yearManual =
    manualAll[yearKey] && typeof manualAll[yearKey] === 'object' && !Array.isArray(manualAll[yearKey])
      ? manualAll[yearKey]
      : {};

  const rows = kategorier.map((k) => {
    let sum = 0;
    for (const knr of k.konti) {
      sum += saldoPrKonto.get(Number(knr)) ?? 0;
    }
    const beloebBeregnet = Math.round(sum * 100) / 100;
    let beloeb = beloebBeregnet;
    let harManueltBeloeb = false;
    if (Object.prototype.hasOwnProperty.call(yearManual, k.id)) {
      const man = yearManual[k.id];
      if (man !== null && man !== '' && Number.isFinite(Number(man))) {
        beloeb = Math.round(Number(man) * 100) / 100;
        harManueltBeloeb = true;
      }
    }
    return {
      id: k.id,
      navn: k.navn,
      konti: k.konti,
      beloebBeregnet,
      beloeb,
      harManueltBeloeb,
    };
  });
  return {
    startYear: Number(startYearStr),
    fromDate,
    toDate,
    kategorier: rows,
  };
}

const ECONOMIC_BASE = 'https://restapi.e-conomic.com';
const appSecret = process.env.ECONOMIC_APP_SECRET_TOKEN || 'demo';
const agreementGrant = process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN || 'demo';

function economicHeaders() {
  return {
    'X-AppSecretToken': appSecret,
    'X-AgreementGrantToken': agreementGrant,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function fetchEconomic(url) {
  const fullUrl = url.startsWith('http') ? url : `${ECONOMIC_BASE}${url}`;
  const res = await fetch(fullUrl, { headers: economicHeaders() });
  const bodyText = await res.text();
  if (!res.ok) {
    let msg = `e-conomic API: ${res.status} ${res.statusText}`;
    try {
      const json = JSON.parse(bodyText);
      if (json.message) msg = json.message;
      else if (json.developerHint) msg += '. ' + json.developerHint;
    } catch (_) {}
    const err = new Error(msg);
    err.status = res.status;
    err.body = bodyText;
    throw err;
  }
  try {
    return JSON.parse(bodyText);
  } catch (e) {
    const err = new Error('e-conomic returnerede ugyldig JSON: ' + (e.message || 'parse fejl'));
    err.body = bodyText.slice(0, 500);
    throw err;
  }
}

let supabaseAdmin = null;
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(url, key);
  }
  return supabaseAdmin;
}

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '512kb' }));
app.use(attachSessionUser);

// Log når serveren modtager første request (viser at den kører)
let vistKlar = false;
app.use((req, res, next) => {
  if (!vistKlar) {
    vistKlar = true;
    console.log('Server kører på http://localhost:' + (process.env.PORT || 3000) + ' – åbn i browser');
  }
  next();
});

app.use('/api', (req, res, next) => {
  if (apiSkalIkkeKræveLogin(req)) return next();
  return requireAuth(req, res, next);
});

// API-ruter FØR express.static, så /api/* altid hits routes
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, msg: 'Serveren kører' });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.frilandUser) {
    return res.json({ loggedIn: false });
  }
  const role = req.frilandUser.role;
  res.json({
    loggedIn: true,
    email: req.frilandUser.email,
    role,
    admin: role === 'admin',
    bogholder: role === 'bogholder',
    canEditOversigt: role === 'admin' || role === 'bogholder',
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || password == null || String(password) === '') {
      return res.status(400).json({ error: 'Email og kode påkrævet' });
    }
    const data = await loadUsers();
    const u = data.users.find((x) => x.email === email);
    if (!u || !(await bcrypt.compare(String(password), u.passwordHash))) {
      return res.status(401).json({ error: 'Forkert email eller kode' });
    }
    pruneAuthSessions();
    const token = crypto.randomBytes(32).toString('hex');
    const maxAgeMs = 48 * 60 * 60 * 1000;
    authSessions.set(token, {
      email: u.email,
      role: u.role,
      exp: Date.now() + maxAgeMs,
    });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeMs,
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ ok: true, token, email: u.email, role: u.role });
  } catch (err) {
    console.error('auth login:', err);
    res.status(500).json({ error: 'Login fejlede' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const t = getSessionToken(req);
  if (t) authSessions.delete(t);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/settings/public', async (req, res) => {
  try {
    const s = await loadSettings();
    res.json({ bogholderKonfigureret: Boolean(s.bookkeeperEmail) });
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke læse indstillinger' });
  }
});

app.get('/api/settings', requireAdmin, async (req, res) => {
  try {
    const s = await loadSettings();
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: 'Kunne ikke læse indstillinger' });
  }
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  try {
    if (!req.body || !('bookkeeperEmail' in req.body)) {
      return res.status(400).json({ error: 'Mangler bookkeeperEmail (kan være tom streng)' });
    }
    const v = String(req.body.bookkeeperEmail ?? '').trim();
    if (v !== '' && !isValidEmail(v)) {
      return res.status(400).json({ error: 'Ugyldig bogholder-email' });
    }
    const s = await saveSettings({ bookkeeperEmail: v });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Kunne ikke gemme' });
  }
});

app.get('/api/oversigt', async (req, res) => {
  try {
    const data = await loadOversigt();
    res.json(data);
  } catch (err) {
    console.error('oversigt get:', err);
    res.status(500).json({ error: err.message || 'Kunne ikke læse oversigt' });
  }
});

app.put('/api/oversigt', requireAdminOrBogholder, async (req, res) => {
  try {
    const saved = await saveOversigt(req.body);
    res.json(saved);
  } catch (err) {
    console.error('oversigt put:', err);
    res.status(500).json({ error: err.message || 'Kunne ikke gemme oversigt' });
  }
});

app.get('/api/forbrug-indtastet', async (req, res) => {
  try {
    const data = await loadForbrugIndtastet();
    res.json(data);
  } catch (err) {
    console.error('forbrug-indtastet get:', err);
    res.status(500).json({ error: err.message || 'Kunne ikke læse data' });
  }
});

app.put('/api/forbrug-indtastet', requireAdminOrBogholder, async (req, res) => {
  try {
    const saved = await saveForbrugIndtastet(req.body);
    res.json(saved);
  } catch (err) {
    console.error('forbrug-indtastet put:', err);
    res.status(500).json({ error: err.message || 'Kunne ikke gemme' });
  }
});

app.get('/api/kontingent', async (req, res) => {
  try {
    const data = await loadKontingent();
    res.json({ ...data, years: KONTINGENT_AAR });
  } catch (err) {
    console.error('kontingent get:', err);
    res.status(500).json({ error: err.message || 'Kunne ikke læse kontingent' });
  }
});

app.put('/api/kontingent', requireAdminOrBogholder, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    delete body.years;
    const saved = await saveKontingent(body);
    res.json({ ...saved, years: KONTINGENT_AAR });
  } catch (err) {
    console.error('kontingent put:', err);
    res.status(500).json({ error: err.message || 'Kunne ikke gemme' });
  }
});

app.post('/api/bogholder-afsendelse', uploadBilag.single('fil'), async (req, res) => {
  try {
    const cfg = await loadSettings();
    if (!cfg.bookkeeperEmail?.trim()) {
      return res.status(503).json({
        error:
          'Bogholder-email er ikke sat endnu. En administrator sætter den under Brugeradmin.',
      });
    }

    const mode = String(req.body.mode || '');
    const kontaktNavn = String(req.body.kontaktNavn || '').trim();
    const kontaktEmail = normalizeEmail(req.body.kontaktEmail);
    if (!kontaktNavn || !kontaktEmail || !isValidEmail(kontaktEmail)) {
      return res.status(400).json({ error: 'Udfyld dit navn og en gyldig email.' });
    }

    let subject = '';
    let text = '';
    let html = '';
    const attachments = [];
    const bem = String(req.body.bemærkning || '').trim();

    if (mode === 'foto' || mode === 'upload') {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'Vælg en fil eller tag et foto før du sender.' });
      }
      const fn = safeAttachmentName(req.file.originalname);
      attachments.push({
        filename: fn,
        content: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream',
      });
      subject = `[Friland bilag] ${kontaktNavn} (${mode === 'foto' ? 'foto' : 'upload'})`;
      text = `Bilag sendt fra Friland-web.\n\nIndsender: ${kontaktNavn}\nEmail: ${kontaktEmail}\nMetode: ${mode === 'foto' ? 'Foto (kamera)' : 'Upload af fil'}\n`;
      if (bem) text += `\nBemærkning: ${bem}\n`;
      html = `<p>${text.replace(/\n/g, '<br>')}</p>`;
    } else if (mode === 'form') {
      const dato = String(req.body.fakturaDato || '').trim();
      const navn = String(req.body.fakturaNavn || '').trim();
      const adr = String(req.body.fakturaAdresse || '').trim();
      const postnr = String(req.body.fakturaPostnr || '').trim();
      const by = String(req.body.fakturaBy || '').trim();
      const titel = String(req.body.fakturaTitel || '').trim();
      if (!dato || !navn || !adr || !postnr || !by || !titel) {
        return res.status(400).json({ error: 'Udfyld alle fakturafelter.' });
      }
      let linjer;
      try {
        linjer = JSON.parse(req.body.linjerJson || '[]');
      } catch {
        return res.status(400).json({ error: 'Ugyldige fakturalinjer.' });
      }
      if (!Array.isArray(linjer) || linjer.length === 0) {
        return res.status(400).json({ error: 'Tilføj mindst én linje med tekst og beløb.' });
      }
      let total = 0;
      const linjeLinjer = [];
      const linjerParsed = [];
      for (const l of linjer) {
        const tekst = String(l.tekst ?? '').trim();
        const pris = parseBeloebDaLoose(l.pris);
        if (!tekst || !Number.isFinite(pris)) {
          return res.status(400).json({ error: 'Hver linje skal have tekst og gyldigt beløb.' });
        }
        total += pris;
        linjerParsed.push({ tekst, pris });
        linjeLinjer.push(`${tekst}\t${formatBeloebDaServer(pris)} kr`);
      }
      const datoVis = /^\d{4}-\d{2}-\d{2}$/.test(dato) ? formatDatoKort(dato) : dato;
      const bodyText = [
        datoVis,
        navn,
        adr,
        `${postnr} ${by}`,
        titel,
        '',
        ...linjeLinjer,
        '—————',
        `Ialt\t${formatBeloebDaServer(total)} kr`,
        '',
        `Indsender (kontakt): ${kontaktNavn} <${kontaktEmail}>`,
      ].join('\n');
      text = `Faktura (som GF-skabelon) sendt fra Friland-web.\nVedhæftet: GF-faktura.pdf\n\n${bodyText}`;
      if (bem) text += `\n\nBemærkning: ${bem}`;
      subject = `[Friland faktura] ${titel} — ${kontaktNavn}`;
      const safeHtml = bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html = `<p style="font-family:system-ui,sans-serif;">Vedhæftet: <strong>GF-faktura.pdf</strong> (samme layout som GF-skabelonen).</p><pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;">${safeHtml}</pre>`;
      if (bem) html += `<p><strong>Bemærkning:</strong> ${bem.replace(/</g, '&lt;')}</p>`;
      const pdfBuf = await buildGfFakturaPdfBuffer({
        datoIso: dato,
        navn,
        adr,
        postnr,
        by,
        titel,
        linjer: linjerParsed,
        total,
        kontaktNavn,
        kontaktEmail: kontaktEmail,
        bem,
      });
      attachments.push({
        filename: 'GF-faktura.pdf',
        content: pdfBuf,
        contentType: 'application/pdf',
      });
    } else {
      return res.status(400).json({ error: 'Ukendt metode.' });
    }

    const result = await sendMailToBookkeeper({ subject, text, html, attachments });
    res.json({ ok: true, simulated: result.simulated });
  } catch (err) {
    const st = err.status || 500;
    console.error('bogholder-afsendelse:', err);
    res.status(st).json({ error: err.message || 'Afsendelse fejlede' });
  }
});

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const data = await loadUsers();
    res.json({
      users: data.users.map(({ email, role }) => ({ email, role })),
    });
  } catch (err) {
    console.error('users list:', err);
    res.status(500).json({ error: 'Kunne ikke hente brugere' });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    let role = 'user';
    const br = req.body?.role;
    if (br === 'admin' || br === 'bogholder') role = br;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Ugyldig email' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Kode skal være mindst 8 tegn' });
    }
    const data = await loadUsers();
    if (data.users.some((x) => x.email === email)) {
      return res.status(409).json({ error: 'Brugeren findes allerede' });
    }
    data.users.push({
      email,
      passwordHash: bcrypt.hashSync(String(password), 10),
      role,
    });
    await saveUsers(data);
    res.json({ ok: true, user: { email, role } });
  } catch (err) {
    console.error('users create:', err);
    res.status(500).json({ error: 'Kunne ikke oprette bruger' });
  }
});

app.put('/api/users', requireAdmin, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Mangler email' });
    const data = await loadUsers();
    const idx = data.users.findIndex((x) => x.email === email);
    if (idx < 0) return res.status(404).json({ error: 'Bruger findes ikke' });
    if (req.body.password != null && String(req.body.password) !== '') {
      if (String(req.body.password).length < 8) {
        return res.status(400).json({ error: 'Kode skal være mindst 8 tegn' });
      }
      data.users[idx].passwordHash = bcrypt.hashSync(String(req.body.password), 10);
    }
    if (req.body.role === 'admin' || req.body.role === 'user' || req.body.role === 'bogholder') {
      const prev = data.users[idx].role;
      const next = req.body.role;
      if (prev === 'admin' && next !== 'admin') {
        const admins = data.users.filter((x) => x.role === 'admin');
        if (admins.length <= 1) {
          return res.status(400).json({ error: 'Kan ikke fjerne den sidste administrator' });
        }
      }
      data.users[idx].role = next;
    }
    await saveUsers(data);
    res.json({ ok: true, user: { email, role: data.users[idx].role } });
  } catch (err) {
    console.error('users update:', err);
    res.status(500).json({ error: 'Kunne ikke opdatere bruger' });
  }
});

app.delete('/api/users', requireAdmin, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Mangler email' });
    const data = await loadUsers();
    const idx = data.users.findIndex((x) => x.email === email);
    if (idx < 0) return res.status(404).json({ error: 'Bruger findes ikke' });
    const victim = data.users[idx];
    if (victim.email === req.frilandUser.email) {
      return res.status(400).json({ error: 'Du kan ikke slette din egen bruger her' });
    }
    if (victim.role === 'admin') {
      const admins = data.users.filter((x) => x.role === 'admin');
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Kan ikke slette den sidste administrator' });
      }
    }
    data.users.splice(idx, 1);
    await saveUsers(data);
    res.json({ ok: true });
  } catch (err) {
    console.error('users delete:', err);
    res.status(500).json({ error: 'Kunne ikke slette bruger' });
  }
});

// Supabase: offentlig anon-nøgle til browser (RLS skal tillade læsning)
app.get('/api/supabase/public-config', (req, res) => {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return res.status(503).json({
      error: 'Supabase ikke konfigureret (SUPABASE_URL / SUPABASE_ANON_KEY)',
    });
  }
  res.json({ supabaseUrl: url, supabaseAnonKey: anon });
});

// Saldobalance ud fra synkroniserede posteringer i Supabase (SUM(amount) pr. konto)
app.get('/api/supabase/ledger-balance', async (req, res) => {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return res.status(503).json({
      error: 'Supabase ikke konfigureret (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
    });
  }
  const fromDate = req.query.fromDate || null;
  const toDate = req.query.toDate || null;
  if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate))) {
    return res.status(400).json({ error: 'fromDate skal være YYYY-MM-DD' });
  }
  if (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(toDate))) {
    return res.status(400).json({ error: 'toDate skal være YYYY-MM-DD' });
  }
  try {
    const { data, error } = await sb.rpc('get_ledger_balance', {
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
    });
    if (error) {
      console.error('Supabase get_ledger_balance:', error);
      return res.status(500).json({ error: error.message || 'Supabase RPC fejl' });
    }
    res.json({ fromDate, toDate, rows: data || [] });
  } catch (err) {
    console.error('ledger-balance:', err);
    res.status(500).json({ error: err.message || 'Uventet fejl' });
  }
});

// Resultatopgørelse aggregeret fra Supabase-saldobalance (samme periode som saldobalance-siden: 1/3–28/29/2)
app.get('/api/arsregnskab-supabase/:startYear', async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) {
      return res.status(503).json({
        error: 'Supabase ikke konfigureret (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      });
    }
    const datoer = regnskabsaarTilDatoer(req.params.startYear);
    if (!datoer) {
      return res.status(400).json({ error: 'Ugyldigt startår for regnskabsår' });
    }
    const { fromDate, toDate } = datoer;
    const { data, error } = await sb.rpc('get_ledger_balance', {
      p_from_date: fromDate,
      p_to_date: toDate,
    });
    if (error) {
      console.error('arsregnskab-supabase RPC:', error);
      return res.status(500).json({ error: error.message || 'Supabase RPC fejl' });
    }
    const rows = data || [];
    const { ARSREGNSKAB_STRUKTUR, buildKontoTilPostMap } = await import('./arsregnskab-struktur.js');
    const kontoTilPost = buildKontoTilPostMap();
    const aggregated = aggregerLedgerRowsTilArsregnskab(rows, kontoTilPost);
    const totals = ledgerRowsTilTotalsMedMapping(rows, kontoTilPost);
    res.json({
      aggregated,
      struktur: ARSREGNSKAB_STRUKTUR,
      year: parseInt(req.params.startYear, 10),
      fromDate,
      toDate,
      source: 'supabase',
      totals,
    });
  } catch (err) {
    console.error('arsregnskab-supabase:', err);
    res.status(500).json({ error: err.message || 'Kunne ikke hente årsregnskab fra Supabase' });
  }
});

// Forbrug: kategoriopsætning (standard + evt. gemt i data/forbrug-kategorier-state.json)
app.get('/api/forbrug/kategorier', async (req, res) => {
  try {
    const data = await loadForbrugKategorier();
    res.json(data);
  } catch (err) {
    console.error('forbrug kategorier:', err);
    res.status(500).json({ error: err.message || 'Kunne ikke læse forbrug-kategorier' });
  }
});

app.put('/api/forbrug/kategorier', requireAdmin, async (req, res) => {
  try {
    await saveForbrugKategorier(req.body);
    const data = await loadForbrugKategorier();
    res.json(data);
  } catch (err) {
    const st = err.status || 500;
    console.error('forbrug kategorier save:', err);
    res.status(st).json({ error: err.message || 'Kunne ikke gemme' });
  }
});

/** Manuelle beløb pr. regnskabsår (overskriver beregning fra konti) */
app.put('/api/forbrug/manuelle/:startYear', requireAdmin, async (req, res) => {
  const y = String(Number(req.params.startYear));
  if (!Number.isFinite(Number(y))) {
    return res.status(400).json({ error: 'Ugyldigt årstal' });
  }
  const overrides = req.body?.overrides;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return res.status(400).json({ error: 'Forventer { overrides: { kategoriId: tal eller null } }' });
  }
  try {
    const all = await loadManuelleBeloeb();
    if (!all[y] || typeof all[y] !== 'object') all[y] = {};
    for (const [id, val] of Object.entries(overrides)) {
      if (typeof id !== 'string' || !id.trim()) continue;
      if (val === null || val === '') {
        delete all[y][id];
      } else {
        const n = Number(val);
        if (!Number.isFinite(n)) {
          return res.status(400).json({ error: `Ugyldigt beløb for ${id}` });
        }
        all[y][id] = Math.round(n * 100) / 100;
      }
    }
    if (Object.keys(all[y]).length === 0) delete all[y];
    await saveManuelleBeloebFile(all);
    const data = await forbrugAggForAar(y, null);
    res.json(data);
  } catch (err) {
    const st = err.status || 500;
    console.error('forbrug manuelle:', err);
    res.status(st).json({ error: err.message || 'Kunne ikke gemme' });
  }
});

/** Forbrug med kategoriopsætning fra klient (fx før gem) — kun læsning */
app.post('/api/forbrug/aggregat', async (req, res) => {
  const sy = req.body?.startYear ?? req.body?.year;
  if (sy == null || sy === '') {
    return res.status(400).json({ error: 'Mangler startYear' });
  }
  try {
    const data = await forbrugAggForAar(sy, req.body.kategorier);
    res.json(data);
  } catch (err) {
    const st = err.status || 500;
    console.error('forbrug aggregat:', err);
    res.status(st).json({ error: err.message || 'Uventet fejl' });
  }
});

/** Forbrug pr. kategori (serverens gemte kategoriopsætning) */
app.get('/api/forbrug/:startYear', async (req, res) => {
  try {
    const data = await forbrugAggForAar(req.params.startYear, null);
    res.json(data);
  } catch (err) {
    const st = err.status || 500;
    console.error('forbrug GET:', err);
    res.status(st).json({ error: err.message || 'Uventet fejl' });
  }
});

// API: Trial Balance (saldobalance) fra e-conomic Reports API
app.get('/api/reports/trialbalance', async (req, res) => {
  try {
    const fromDate = req.query.fromDate || '2025-03-01';
    const toDate = req.query.toDate || '2026-02-28';
    const dimension = req.query.dimension !== undefined ? req.query.dimension : 0;

    const url = `${ECONOMIC_BASE}/reports/trialbalance?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&dimension=${encodeURIComponent(dimension)}`;
    const data = await fetchEconomic(url);
    res.json(data);
  } catch (err) {
    console.error('e-conomic trialbalance:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Kunne ikke hente trial balance fra e-conomic',
      economicBody: err.body ? String(err.body).slice(0, 800) : undefined,
    });
  }
});

// API: Diagnostik – vis hvad e-conomic returnerer og hvad der fejler
app.get('/api/diagnostik', async (req, res) => {
  const trin = [];
  try {
    trin.push({ step: 1, navn: 'Regnskabsår', status: 'starter' });
    const yearsRes = await fetchEconomic('/accounting-years?pagesize=100');
    const years = yearsRes.collection || yearsRes;
    const list = Array.isArray(years) ? years : [years];
    const aarListe = list.filter(Boolean).map((y) => ({
      year: y.year,
      self: y.self,
      yearId: extractYearId(y.self),
    }));
    trin.push({ step: 1, navn: 'Regnskabsår', status: 'ok', antal: aarListe.length, data: aarListe });

    if (aarListe.length === 0) {
      return res.json({ ok: false, trin, fejl: 'Ingen regnskabsår i e-conomic' });
    }

    const foerste = aarListe[0];
    const totalsUrl = getTotalsUrl(foerste, foerste.year);
    trin.push({ step: 2, navn: 'Totals for første år', status: 'starter', url: totalsUrl });

    const totalsRes = await fetchEconomic(totalsUrl);
    const totals = totalsRes.collection || totalsRes;
    const totalsList = Array.isArray(totals) ? totals : [totals].filter(Boolean);
    trin.push({ step: 2, navn: 'Totals', status: 'ok', antal: totalsList.length, eksempel: totalsList.slice(0, 3) });

    trin.push({ step: 3, navn: 'Kontoplan', status: 'starter' });
    const accountsRes = await fetchEconomic('/accounts?pagesize=1000');
    const accounts = accountsRes.collection || accountsRes;
    const accList = Array.isArray(accounts) ? accounts : [accounts].filter(Boolean);
    trin.push({ step: 3, navn: 'Kontoplan', status: 'ok', antal: accList.length, eksempel: accList.slice(0, 2) });

    const match2025 = findAccountingYear(list, '2025');
    const yearId2025 = match2025 ? extractYearId(match2025.self) : '2025';
    trin.push({ step: 4, navn: 'Saldobalancer år 2025', status: 'info', match: !!match2025, yearIdBrugt: yearId2025, yearObjekt: match2025 ? { year: match2025.year, self: match2025.self } : null });

    return res.json({ ok: true, trin });
  } catch (err) {
    trin.push({
      step: 'fejl',
      navn: err.message,
      status: 'fejl',
      economicBody: err.body ? String(err.body).slice(0, 1200) : null,
      hint: 'Tjek .env (ECONOMIC_APP_SECRET_TOKEN, ECONOMIC_AGREEMENT_GRANT_TOKEN). Fejlen "string did not match" kan betyde at yearId-formatet er forkert – API-diagnostik viser hvad e-conomic returnerer.',
    });
    return res.json({ ok: false, trin });
  }
});

// API: Hent en enkelt konto (fx 1010) – placeres tidligt så den altid matcher
app.get('/api/konto/:accountNumber', async (req, res) => {
  try {
    const accountNumber = req.params.accountNumber;
    const year = req.query.year || '2025';
    const yearsRes = await fetchEconomic('/accounting-years?pagesize=100');
    const years = yearsRes.collection || yearsRes;
    const list = Array.isArray(years) ? years : [years];
    const match = findAccountingYear(list, year);
    const yearId = match ? extractYearId(match.self) : year;

    const [totalsRes, accountsRes] = await Promise.all([
      fetchEconomic(`/accounting-years/${encodeURIComponent(yearId)}/totals?pagesize=1000`).catch(() => ({ collection: [] })),
      fetchEconomic('/accounts?pagesize=1000'),
    ]);

    const totals = totalsRes.collection || totalsRes;
    const accounts = accountsRes.collection || accountsRes;
    const totalsList = Array.isArray(totals) ? totals : [totals].filter(Boolean);
    const accountsList = Array.isArray(accounts) ? accounts : [accounts].filter(Boolean);

    const accountMap = {};
    accountsList.forEach((a) => {
      if (a && a.accountNumber != null) accountMap[a.accountNumber] = a;
    });

    const totalEntry = totalsList.find(
      (t) => String(t.account?.accountNumber ?? t.accountNumber) === String(accountNumber)
    );
    const account = accountMap[accountNumber] || accountMap[parseInt(accountNumber, 10)];

    res.json({
      accountNumber,
      name: account?.name ?? `Konto ${accountNumber}`,
      total: totalEntry?.totalInBaseCurrency ?? null,
      year,
      yearId,
    });
  } catch (err) {
    console.error('e-conomic konto:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Kunne ikke hente konto fra e-conomic',
      economicBody: err.body ? String(err.body).slice(0, 500) : undefined,
    });
  }
});

// API: Saldobalancer for et regnskabsår (1/3–28/2)
app.get('/api/saldobalancer/:year', async (req, res) => {
  try {
    const year = req.params.year;
    const yearsRes = await fetchEconomic('/accounting-years?pagesize=100');
    const years = yearsRes.collection || yearsRes;
    const list = Array.isArray(years) ? years : [years];
    const match = findAccountingYear(list, year);
    const yearId = match ? extractYearId(match.self) : year;
    const totalsUrl = getTotalsUrl(match, year);

    const [totalsRes, accountsRes] = await Promise.all([
      fetchEconomic(totalsUrl),
      fetchEconomic('/accounts?pagesize=1000'),
    ]);

    const totals = totalsRes.collection || totalsRes;
    const accounts = accountsRes.collection || accountsRes;
    const totalsList = Array.isArray(totals) ? totals : [totals].filter(Boolean);
    const accountsList = Array.isArray(accounts) ? accounts : [accounts].filter(Boolean);

    const accountMap = {};
    accountsList.forEach((a) => {
      if (a && a.accountNumber != null) accountMap[a.accountNumber] = a;
    });

    const saldobalancer = totalsList.map((t) => {
      const accNum = t.account?.accountNumber ?? t.accountNumber;
      const account = accountMap[accNum];
      return {
        accountNumber: accNum,
        name: account?.name ?? `Konto ${accNum}`,
        totalInBaseCurrency: t.totalInBaseCurrency ?? 0,
      };
    });

    res.json({
      year: parseInt(year, 10),
      yearId,
      periode: `01.03.${String(year).slice(-2)} – 28.02.${String(Number(year) + 1).toString().slice(-2)}`,
      saldobalancer,
    });
  } catch (err) {
    console.error('e-conomic saldobalancer:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Kunne ikke hente saldobalancer fra e-conomic',
      economicBody: err.body ? String(err.body).slice(0, 500) : undefined,
    });
  }
});

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
  const m = selfLink.match(/\/accounting-years\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Brug totals-URL direkte fra år-objektet (e-conomic's eget format – undgår "string did not match") */
function getTotalsUrl(yearObj, yearFallback) {
  if (yearObj && yearObj.totals && typeof yearObj.totals === 'string') {
    const m = yearObj.totals.match(/\/accounting-years\/[^?]+/);
    if (m) return m[0] + '?pagesize=1000';
  }
  const yearId = yearObj ? extractYearId(yearObj.self) : yearFallback;
  return `/accounting-years/${encodeURIComponent(String(yearId))}/totals?pagesize=1000`;
}

/** Find det bedste match af regnskabsår. Foretrækker exact, derefter startsWith, så includes. */
function findAccountingYear(list, year) {
  const yStr = String(year);
  const exact = list.find((y) => y && String(y.year) === yStr);
  if (exact) return exact;
  const starts = list.find((y) => y && y.year && String(y.year).startsWith(yStr));
  if (starts) return starts;
  const contains = list.find((y) => y && y.year && String(y.year).includes(yStr));
  return contains || null;
}

// API: Hent årsafslutning for et regnskabsår (konto-totaler)
app.get('/api/accounting-years/:year/totals', async (req, res) => {
  try {
    const year = req.params.year;
    const yearsRes = await fetchEconomic('/accounting-years?pagesize=100');
    const years = yearsRes.collection || yearsRes;
    const list = Array.isArray(years) ? years : [years];
    const match = findAccountingYear(list, year);
    const yearId = match ? extractYearId(match.self) : year;
    const data = await fetchEconomic(`/accounting-years/${encodeURIComponent(yearId)}/totals?pagesize=1000`);
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

// API: Debug – vis hvad vi henter fra e-conomic
app.get('/api/debug/:year', async (req, res) => {
  try {
    const year = req.params.year;
    const yearsRes = await fetchEconomic('/accounting-years?pagesize=100');
    const years = yearsRes.collection || yearsRes;
    const list = Array.isArray(years) ? years : [years];
    const match = findAccountingYear(list, year);
    const yearId = match ? extractYearId(match.self) : year;

    const [totalsRes, accountsRes] = await Promise.all([
      fetchEconomic(`/accounting-years/${encodeURIComponent(yearId)}/totals?pagesize=1000`).catch((e) => ({
        error: e.message,
        collection: [],
      })),
      fetchEconomic('/accounts?pagesize=1000').catch((e) => ({
        error: e.message,
        collection: [],
      })),
    ]);

    const totals = totalsRes.collection || totalsRes.error ? [] : totalsRes;
    const accounts = accountsRes.collection || accountsRes.error ? [] : accountsRes;
    const totalsList = Array.isArray(totals) ? totals : [totals].filter(Boolean);
    const accountsList = Array.isArray(accounts) ? accounts : [accounts].filter(Boolean);

    res.json({
      regnskabsaar: list.map((y) => ({ year: y.year, self: y.self })),
      valgtYearId: yearId,
      antalKontoTotaler: totalsList.length,
      antalKonti: accountsList.length,
      eksempelTotal: totalsList[0] || null,
      eksempelKonto: accountsList[0] || null,
      kontoTotaler: totalsList.slice(0, 20).map((t) => ({
        konto: t.account?.accountNumber ?? t.accountNumber,
        total: t.totalInBaseCurrency,
        fraApi: t.account?.self,
      })),
      fejl: totalsRes.error || accountsRes.error || null,
    });
  } catch (err) {
    const body = err.body || err.message;
    res.status(err.status || 500).json({
      error: err.message,
      economicBody: typeof body === 'string' ? body.slice(0, 1000) : body,
      hint: 'Tjek .env og at e-conomic tokens er korrekte. Vælg et år der findes i e-conomic.',
    });
  }
});

// API: Samlet årsregnskab-data (regnskabsår + totaler + kontoplan)
app.get('/api/arsregnskab/:year', async (req, res) => {
  try {
    const { ARSREGNSKAB_STRUKTUR, buildKontoTilPostMap } = await import('./arsregnskab-struktur.js');
    const year = req.params.year;
    const yearsRes = await fetchEconomic('/accounting-years?pagesize=100');
    const years = yearsRes.collection || yearsRes;
    const list = Array.isArray(years) ? years : [years];
    const match = findAccountingYear(list, year);
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

    const kontoTilPost = buildKontoTilPostMap();
    const totalsWithNames = (Array.isArray(totals) ? totals : [totals])
      .filter(Boolean)
      .map((t) => {
        const accNum = t.account?.accountNumber ?? t.accountNumber;
        const account = accountMap[accNum];
        const total = t.totalInBaseCurrency ?? 0;
        const mapped = kontoTilPost[accNum] ?? kontoTilPost[String(accNum)];
        return {
          accountNumber: accNum,
          name: account?.name ?? `Konto ${accNum}`,
          totalInBaseCurrency: total,
          mapped,
        };
      });

    const aggregated = { indtaegter: {}, udgifter: {} };
    for (const t of totalsWithNames) {
      const v = t.totalInBaseCurrency;
      if (!t.mapped) continue;
      const { kategori, post } = t.mapped;
      let beloeb = v;
      if (kategori === 'indtaegter') beloeb = -v;
      if (kategori === 'udgifter') beloeb = -Math.abs(v);
      if (!aggregated[kategori][post]) aggregated[kategori][post] = 0;
      aggregated[kategori][post] += beloeb;
    }

    res.json({
      accountingYears: list,
      totals: totalsWithNames,
      aggregated,
      struktur: ARSREGNSKAB_STRUKTUR,
      year: parseInt(year, 10),
    });
  } catch (err) {
    console.error('e-conomic årsregnskab:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Kunne ikke hente årsregnskab fra e-conomic',
      economicBody: err.body ? String(err.body).slice(0, 500) : undefined,
    });
  }
});

const PUBLIC_STATIC_EXT = /\.(css|js|mjs|ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|eot|map)$/i;

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const p = req.path || '';
  if (p.startsWith('/api')) return next();
  if (p === '/login.html' || p === '/login') return next();
  if (PUBLIC_STATIC_EXT.test(p)) return next();
  if (!req.frilandUser) {
    const raw = req.originalUrl || '/';
    const q = raw !== '/' && raw !== '/login.html' ? '?next=' + encodeURIComponent(raw) : '';
    return res.redirect(302, '/login.html' + q);
  }
  next();
});

// Static files – kun for ikke-API paths
app.use(express.static(join(__dirname, '.')));

const supabaseAutoMs = Number(process.env.SUPABASE_AUTO_SYNC_MS || 0);
if (supabaseAutoMs > 0) {
  const tick = async () => {
    try {
      const { runSync } = await import('./scripts/sync-economic-to-supabase.js');
      await runSync();
      console.log('[supabase-auto-sync] Synkronisering gennemført');
    } catch (e) {
      console.error('[supabase-auto-sync] Fejl:', e.message || e);
    }
  };
  setInterval(tick, supabaseAutoMs);
  console.log(`[supabase-auto-sync] Interval sat til ${supabaseAutoMs} ms (se SUPABASE_AUTO_SYNC_MS)`);
}

await ensureUsersFile();
await ensureBootstrapAdmin();
await ensureOversigtFile();
await ensureForbrugIndtastetFile();
await ensureKontingentFile();

app.listen(PORT).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} er allerede i brug. Prøv: PORT=3001 npm start`);
  } else {
    console.error('Serverfejl:', err);
  }
  process.exit(1);
});
