'use strict';
/*
 * HomeZone – خادم المتجر ولوحة الإدارة
 * بلا أي حزم خارجية: يحتاج Node.js 22.13 أو أحدث فقط (SQLite مدمجة فيه).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { seed } = require('./lib/seed');

/* ---------- الإعدادات ---------- */
// قراءة ملف .env إن وُجد (دون استبدال متغيرات البيئة الموجودة)
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch (e) { /* تجاهل */ }

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // فعّله فقط خلف وسيط موثوق واحد (Nginx، Render، Railway...)
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = (parseInt(process.env.MAX_VIDEO_MB, 10) || 100) * 1024 * 1024;
const SESSION_MS = 12 * 60 * 60 * 1000;

const ZONE_IDS = ['coffee', 'tea', 'kitchen', 'fry', 'toast', 'clean', 'care', 'air'];
const CITIES = ['عمّان', 'إربد', 'الزرقاء', 'العقبة', 'السلط', 'مادبا', 'جرش', 'أخرى'];
const STATUSES = ['new', 'confirmed', 'delivered', 'cancelled'];
const ICONS = ['espresso', 'grinder', 'pot', 'kettle', 'blender', 'mixer', 'processor', 'airfryer', 'toaster', 'waffle', 'press', 'vacuum', 'steamiron', 'hairdryer', 'shaver', 'straightener', 'fan', 'heater', 'purifier'];

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- قاعدة البيانات ---------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'homezone.db'));
db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY, zone TEXT NOT NULL, name TEXT NOT NULL, spec TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL, old REAL NOT NULL DEFAULT 0, tag TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'processor',
  img TEXT NOT NULL DEFAULT '', vid TEXT NOT NULL DEFAULT '', vurl TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 999);
CREATE TABLE IF NOT EXISTS coupons(
  code TEXT PRIMARY KEY, type TEXT NOT NULL, amount REAL NOT NULL, min_total REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, city TEXT NOT NULL,
  address TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', items TEXT NOT NULL, subtotal REAL NOT NULL, discount REAL NOT NULL DEFAULT 0,
  code TEXT NOT NULL DEFAULT '', ship REAL NOT NULL DEFAULT 0, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'web');
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at DESC);
CREATE TABLE IF NOT EXISTS videos(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '', file TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '', product_id TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS partners(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  logo TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 999);
CREATE TABLE IF NOT EXISTS settings(skey TEXT PRIMARY KEY, sval TEXT NOT NULL);
`);
seed(db);

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
const getSetting = (k) => { const r = db.prepare('SELECT sval FROM settings WHERE skey=?').get(k); return r ? r.sval : null; };
const putSetting = (k, v) => db.prepare('INSERT INTO settings(skey,sval) VALUES(?,?) ON CONFLICT(skey) DO UPDATE SET sval=excluded.sval').run(k, String(v));

/* ---------- أسرار الجلسة وكلمة مرور الإدارة ---------- */
let SECRET = process.env.SESSION_SECRET || getSetting('session_secret');
if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); putSetting('session_secret', SECRET); }

const ENV_PASS = process.env.ADMIN_PASSWORD || '';
let generatedPass = '';
function hashPass(p) { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(p, salt, 32).toString('hex')}`; }
function safeEq(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
if (!ENV_PASS && !getSetting('admin_hash')) {
  generatedPass = crypto.randomBytes(9).toString('base64url');
  putSetting('admin_hash', hashPass(generatedPass));
}
function checkPassword(p) {
  p = String(p || '');
  if (ENV_PASS) return safeEq(p, ENV_PASS);
  const [, salt, hash] = String(getSetting('admin_hash') || '').split('$');
  if (!salt || !hash) return false;
  const got = crypto.scryptSync(p, salt, 32).toString('hex');
  return safeEq(got, hash);
}

/* ---------- أدوات ---------- */
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}
const bad = (m) => new HttpError(400, m);
const rnd = (n) => crypto.randomBytes(n).toString('hex');
const r2 = (n) => Math.round(n * 100) / 100;
const cents = (n) => Math.round(n * 100);

const CTRL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u2028\\u2029]', 'g');
function clean(v, max, multiline) {
  let s = String(v == null ? '' : v).replace(CTRL, '');
  if (!multiline) s = s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}
function money(v, label) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw bad(`قيمة غير صحيحة: ${label}`);
  return r2(n);
}
function url(v) {
  const s = clean(v, 500);
  if (!s) return '';
  if (!/^https?:\/\/[^\s]+$/i.test(s)) throw bad('الرابط يجب أن يبدأ بـ https://');
  return s;
}
function upload(v, kind) {
  const s = String(v || '');
  if (!s) return '';
  const re = kind === 'video' ? /^[a-f0-9]{32}\.(mp4|webm)$/ : /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/;
  if (!re.test(s) || !fs.existsSync(path.join(UPLOAD_DIR, s))) throw bad('ملف مرفوع غير صالح');
  return s;
}
const fileUrl = (n) => (n ? '/uploads/' + n : '');
function removeFile(name) {
  if (!name || !/^[a-f0-9]{32}\.[a-z0-9]+$/.test(name)) return;
  fs.unlink(path.join(UPLOAD_DIR, name), () => {});
}

/* ---------- تحديد معدل الطلبات (في الذاكرة) ---------- */
const buckets = new Map();
function hit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return b.n <= max;
}
function peek(key, max) { const b = buckets.get(key); return !b || b.reset < Date.now() || b.n < max; }
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60000).unref();

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}
function isSecure(req) {
  return !!req.socket.encrypted || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}

/* ---------- الجلسات ---------- */
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken() { const exp = String(Date.now() + SESSION_MS); return exp + '.' + sign(exp); }
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
function isAdmin(req) {
  const t = parseCookies(req).hz_admin;
  if (!t) return false;
  const [exp, mac] = t.split('.');
  if (!exp || !mac || !/^\d+$/.test(exp) || +exp < Date.now()) return false;
  const want = sign(exp);
  return mac.length === want.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want));
}
function setSession(req, res, token, maxAge) {
  res.setHeader('Set-Cookie', `hz_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`);
}

/* ---------- المنتجات والتسعير ---------- */
function productOut(r, admin) {
  const o = {
    id: r.id, zone: r.zone, name: r.name, spec: r.spec, desc: r.descr, price: r.price, old: r.old, tag: r.tag, icon: r.icon,
    img: fileUrl(r.img), vid: fileUrl(r.vid), vurl: r.vurl, sort: r.sort
  };
  if (admin) { o.active = !!r.active; o.imgName = r.img; o.vidName = r.vid; }
  return o;
}
function settings() {
  const num = (k, d) => { const n = parseFloat(getSetting(k)); return Number.isFinite(n) && n >= 0 ? n : d; };
  return { freeFrom: num('freeFrom', 50), shipFee: num('shipFee', 3), notice: getSetting('notice') || '', whatsapp: getSetting('whatsapp') || '' };
}
const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);

function couponDiscount(c, subC) {
  if (subC < cents(c.min_total)) throw new HttpError(422, `الحد الأدنى لهذا الكود ${c.min_total.toFixed(2)} د.أ`);
  const d = c.type === 'percent' ? Math.round(subC * c.amount / 100) : cents(c.amount);
  return Math.min(d, subC);
}
function priceOrder(rawItems, rawCode, allowInactive) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 60) throw new HttpError(422, 'السلة فارغة');
  const qtys = new Map();
  for (const it of rawItems) {
    const id = String(it && it.id || '');
    const q = Number(it && it.qty);
    if (!id || !Number.isInteger(q) || q < 1 || q > 20) throw new HttpError(422, 'كمية غير صحيحة');
    qtys.set(id, Math.min(20, (qtys.get(id) || 0) + q));
  }
  const items = [];
  let subC = 0;
  for (const [id, qty] of qtys) {
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!p || (!p.active && !allowInactive)) throw new HttpError(422, 'أحد الأجهزة في السلة لم يعد متوفرًا، حدّث الصفحة وأعد المحاولة', { removed: id });
    items.push({ id, name: p.name, price: p.price, qty });
    subC += cents(p.price) * qty;
  }
  const st = settings();
  let discC = 0, code = normCode(rawCode);
  if (code) {
    const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(code);
    if (!c || !c.active) throw new HttpError(422, 'كود الخصم غير صالح');
    discC = couponDiscount(c, subC);
  }
  const afterC = subC - discC;
  const shipC = afterC >= cents(st.freeFrom) ? 0 : cents(st.shipFee);
  return { items, subtotal: subC / 100, discount: discC / 100, code, ship: shipC / 100, total: (afterC + shipC) / 100 };
}
function customer(b) {
  const name = clean(b.name, 80), phone = clean(b.phone, 20), address = clean(b.address, 200), note = clean(b.note, 300);
  const city = CITIES.includes(b.city) ? b.city : '';
  if (name.length < 3) throw new HttpError(422, 'اكتب الاسم الكامل');
  if (!/^[+\d][\d\s\-()]{7,19}$/.test(phone) || phone.replace(/\D/g, '').length < 9) throw new HttpError(422, 'اكتب رقم هاتف صحيحًا');
  if (!city) throw new HttpError(422, 'اختر المدينة');
  if (address.length < 5) throw new HttpError(422, 'اكتب عنوان التوصيل بالتفصيل');
  return { name, phone, city, address, note };
}
function insertOrder(c, priced, source) {
  const r = db.prepare(`INSERT INTO orders(created_at,name,phone,city,address,note,items,subtotal,discount,code,ship,total,status,source)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'new', ?)`).run(Date.now(), c.name, c.phone, c.city, c.address, c.note, JSON.stringify(priced.items),
    priced.subtotal, priced.discount, priced.code, priced.ship, priced.total, source);
  return Number(r.lastInsertRowid);
}
function orderOut(r) {
  let items = [];
  try { items = JSON.parse(r.items); } catch (e) { /* تجاهل */ }
  return { id: r.id, createdAt: r.created_at, name: r.name, phone: r.phone, city: r.city, address: r.address, note: r.note, items,
    subtotal: r.subtotal, discount: r.discount, code: r.code, ship: r.ship, total: r.total, status: r.status, source: r.source };
}

/* ---------- قراءة الطلب ---------- */
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > (limit || 1048576)) { reject(new HttpError(413, 'الطلب كبير جدًا')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!n) return resolve({});
      try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(v && typeof v === 'object' ? v : {}); }
      catch (e) { reject(bad('بيانات غير صالحة')); }
    });
    req.on('error', reject);
  });
}

const SIGNATURES = [
  { ext: 'png', kind: 'image', test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a },
  { ext: 'jpg', kind: 'image', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', kind: 'image', test: (b) => b.length > 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)) },
  { ext: 'webp', kind: 'image', test: (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { ext: 'mp4', kind: 'video', test: (b) => b.length > 12 && b.toString('latin1', 4, 8) === 'ftyp' },
  { ext: 'webm', kind: 'video', test: (b) => b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3 }
];
function saveUpload(req, kind) {
  return new Promise((resolve, reject) => {
    const limit = kind === 'video' ? MAX_VIDEO : MAX_IMAGE;
    const tooBig = () => Object.assign(new HttpError(413, `الملف أكبر من الحد المسموح (${Math.round(limit / 1048576)} ميغابايت)`), { closeConn: true });
    if (Number(req.headers['content-length']) > limit) return reject(tooBig());
    const tmp = path.join(UPLOAD_DIR, '.tmp-' + rnd(8));
    const out = fs.createWriteStream(tmp, { flags: 'wx', mode: 0o640 });
    let n = 0, failed = false;
    const fail = (e) => { if (failed) return; failed = true; req.unpipe(out); out.destroy(); fs.unlink(tmp, () => {}); reject(e); };
    req.on('data', (c) => { n += c.length; if (n > limit) fail(tooBig()); });
    req.on('error', () => fail(bad('انقطع الرفع')));
    req.on('aborted', () => fail(bad('انقطع الرفع')));
    out.on('error', () => fail(new HttpError(500, 'تعذّر حفظ الملف')));
    out.on('finish', () => {
      if (failed) return;
      if (!n) return fail(bad('الملف فارغ'));
      const fd = fs.openSync(tmp, 'r');
      const head = Buffer.alloc(16);
      fs.readSync(fd, head, 0, 16, 0);
      fs.closeSync(fd);
      const sig = SIGNATURES.find((s) => s.test(head));
      if (!sig || sig.kind !== kind) return fail(bad(kind === 'video' ? 'الملف ليس فيديو mp4 أو webm' : 'الملف ليس صورة png أو jpg أو webp أو gif'));
      const name = rnd(16) + '.' + sig.ext;
      fs.rename(tmp, path.join(UPLOAD_DIR, name), (err) => {
        if (err) return fail(new HttpError(500, 'تعذّر حفظ الملف'));
        resolve({ name, url: fileUrl(name) });
      });
    });
    req.pipe(out);
  });
}

/* ---------- المسارات ---------- */
const routes = [];
function route(method, pattern, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, fn, admin: !!opts.admin });
}
const json = (res, data, status) => {
  const body = JSON.stringify(data);
  res.writeHead(status || 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
};

/* عام */
route('GET', '/api/store', (req, res) => {
  json(res, {
    settings: settings(),
    products: db.prepare('SELECT * FROM products WHERE active=1 ORDER BY sort, name').all().map((r) => productOut(r, false)),
    videos: db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all().map((v) => ({
      id: v.id, title: v.title, desc: v.descr, file: fileUrl(v.file), url: v.url, product: v.product_id })),
    partners: db.prepare('SELECT * FROM partners ORDER BY sort, name').all().map((p) => ({
      id: p.id, name: p.name, desc: p.descr, url: p.url, logo: fileUrl(p.logo) }))
  });
});
route('POST', '/api/coupon', async (req, res) => {
  if (!hit('coupon:' + clientIp(req), 30, 10 * 60 * 1000)) throw new HttpError(429, 'محاولات كثيرة، انتظر قليلًا');
  const b = await readJson(req);
  const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(normCode(b.code));
  if (!c || !c.active) throw new HttpError(404, 'كود الخصم غير صحيح');
  json(res, { code: c.code, type: c.type, amount: c.amount, min: c.min_total });
});
route('POST', '/api/orders', async (req, res) => {
  const ip = clientIp(req);
  if (!hit('order:' + ip, 8, 60 * 60 * 1000)) throw new HttpError(429, 'أرسلت طلبات كثيرة، حاول لاحقًا أو تواصل معنا هاتفيًا');
  const b = await readJson(req);
  if (b.website) return json(res, { ok: true, number: '00000' }); // فخّ للروبوتات
  const c = customer(b);
  const priced = priceOrder(b.items, b.code, false);
  const id = tx(() => insertOrder(c, priced, 'web'));
  json(res, { ok: true, number: String(id).padStart(5, '0'), total: priced.total, discount: priced.discount, ship: priced.ship }, 201);
});

/* الإدارة */
route('POST', '/api/admin/login', async (req, res) => {
  const ip = clientIp(req);
  if (!peek('login:' + ip, 8)) throw new HttpError(429, 'محاولات كثيرة. انتظر ربع ساعة ثم أعد المحاولة');
  const b = await readJson(req, 4096);
  if (!checkPassword(b.password)) {
    hit('login:' + ip, 8, 15 * 60 * 1000);
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'كلمة المرور غير صحيحة');
  }
  setSession(req, res, makeToken(), SESSION_MS / 1000);
  json(res, { ok: true });
});
route('POST', '/api/admin/logout', (req, res) => { setSession(req, res, '', 0); json(res, { ok: true }); });
route('GET', '/api/admin/me', { admin: true }, (req, res) => json(res, { ok: true }));

route('GET', '/api/admin/products', { admin: true }, (req, res) => {
  json(res, db.prepare('SELECT * FROM products ORDER BY sort, name').all().map((r) => productOut(r, true)));
});
function readProduct(b, existing) {
  const name = clean(b.name, 120);
  if (name.length < 2) throw bad('اكتب اسم المنتج');
  if (!ZONE_IDS.includes(b.zone)) throw bad('اختر القسم');
  const price = money(b.price, 'السعر');
  const old = b.old === '' || b.old == null || Number(b.old) === 0 ? 0 : money(b.old, 'السعر قبل الخصم');
  if (old && old <= price) throw bad('السعر قبل الخصم يجب أن يكون أعلى من السعر الحالي');
  const img = upload(b.imgName, 'image'), vid = upload(b.vidName, 'video');
  return {
    zone: b.zone, name, spec: clean(b.spec, 200), descr: clean(b.desc, 2000, true), price, old, tag: clean(b.tag, 24),
    icon: ICONS.includes(b.icon) ? b.icon : 'processor', img, vid, vurl: url(b.vurl), active: b.active === false ? 0 : 1,
    sort: existing ? existing.sort : (db.prepare('SELECT COALESCE(MAX(sort),0)+1 AS n FROM products WHERE sort<999').get().n)
  };
}
route('POST', '/api/admin/products', { admin: true }, async (req, res) => {
  const p = readProduct(await readJson(req), null);
  const id = 'p' + rnd(4);
  db.prepare(`INSERT INTO products(id,zone,name,spec,descr,price,old,tag,icon,img,vid,vurl,active,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, p.zone, p.name, p.spec, p.descr, p.price, p.old, p.tag, p.icon, p.img, p.vid, p.vurl, p.active, p.sort);
  json(res, { id }, 201);
});
route('PUT', '/api/admin/products/:id', { admin: true }, async (req, res, params) => {
  const cur = db.prepare('SELECT * FROM products WHERE id=?').get(params.id);
  if (!cur) throw new HttpError(404, 'المنتج غير موجود');
  const p = readProduct(await readJson(req), cur);
  db.prepare(`UPDATE products SET zone=?,name=?,spec=?,descr=?,price=?,old=?,tag=?,icon=?,img=?,vid=?,vurl=?,active=? WHERE id=?`)
    .run(p.zone, p.name, p.spec, p.descr, p.price, p.old, p.tag, p.icon, p.img, p.vid, p.vurl, p.active, cur.id);
  if (cur.img && cur.img !== p.img) removeFile(cur.img);
  if (cur.vid && cur.vid !== p.vid) removeFile(cur.vid);
  json(res, { ok: true });
});
route('PATCH', '/api/admin/products/:id', { admin: true }, async (req, res, params) => {
  const cur = db.prepare('SELECT * FROM products WHERE id=?').get(params.id);
  if (!cur) throw new HttpError(404, 'المنتج غير موجود');
  const b = await readJson(req);
  if ('price' in b) {
    const price = money(b.price, 'السعر');
    if (cur.old && cur.old <= price) throw bad('السعر الجديد أعلى من السعر قبل الخصم. عدّل المنتج أو احذف السعر القديم');
    db.prepare('UPDATE products SET price=? WHERE id=?').run(price, cur.id);
  }
  if ('active' in b) db.prepare('UPDATE products SET active=? WHERE id=?').run(b.active ? 1 : 0, cur.id);
  json(res, { ok: true });
});
route('DELETE', '/api/admin/products/:id', { admin: true }, (req, res, params) => {
  const cur = db.prepare('SELECT * FROM products WHERE id=?').get(params.id);
  if (!cur) return json(res, { ok: true });
  tx(() => {
    db.prepare('DELETE FROM products WHERE id=?').run(cur.id);
    db.prepare("UPDATE videos SET product_id='' WHERE product_id=?").run(cur.id);
  });
  removeFile(cur.img); removeFile(cur.vid);
  json(res, { ok: true });
});

route('GET', '/api/admin/coupons', { admin: true }, (req, res) => {
  json(res, db.prepare('SELECT * FROM coupons ORDER BY code').all().map((c) => ({ code: c.code, type: c.type, amount: c.amount, min: c.min_total, active: !!c.active })));
});
route('PUT', '/api/admin/coupons/:code', { admin: true }, async (req, res, params) => {
  const code = normCode(params.code);
  if (code.length < 3) throw bad('الكود يجب أن يتكوّن من 3 أحرف أو أرقام إنجليزية على الأقل');
  const b = await readJson(req);
  const type = b.type === 'fixed' ? 'fixed' : 'percent';
  const amount = money(b.amount, 'قيمة الخصم');
  if (amount <= 0) throw bad('اكتب قيمة الخصم');
  if (type === 'percent' && amount > 100) throw bad('النسبة لا تتجاوز 100%');
  const min = b.min === '' || b.min == null ? 0 : money(b.min, 'الحد الأدنى');
  db.prepare(`INSERT INTO coupons(code,type,amount,min_total,active) VALUES(?,?,?,?,1)
    ON CONFLICT(code) DO UPDATE SET type=excluded.type, amount=excluded.amount, min_total=excluded.min_total`).run(code, type, amount, min);
  json(res, { ok: true });
});
route('PATCH', '/api/admin/coupons/:code', { admin: true }, async (req, res, params) => {
  const b = await readJson(req);
  db.prepare('UPDATE coupons SET active=? WHERE code=?').run(b.active ? 1 : 0, normCode(params.code));
  json(res, { ok: true });
});
route('DELETE', '/api/admin/coupons/:code', { admin: true }, (req, res, params) => {
  db.prepare('DELETE FROM coupons WHERE code=?').run(normCode(params.code));
  json(res, { ok: true });
});

route('GET', '/api/admin/orders', { admin: true }, (req, res) => {
  json(res, db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 500').all().map(orderOut));
});
route('GET', '/api/admin/orders/count', { admin: true }, (req, res) => {
  json(res, { new: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='new'").get().n });
});
route('POST', '/api/admin/orders', { admin: true }, async (req, res) => {
  const b = await readJson(req);
  const c = customer(b);
  const priced = priceOrder(b.items, b.code, true);
  const id = tx(() => insertOrder(c, priced, 'manual'));
  json(res, { ok: true, id }, 201);
});
route('PATCH', '/api/admin/orders/:id', { admin: true }, async (req, res, params) => {
  const b = await readJson(req);
  if (!STATUSES.includes(b.status)) throw bad('حالة غير صحيحة');
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(b.status, parseInt(params.id, 10) || 0);
  json(res, { ok: true });
});
route('DELETE', '/api/admin/orders/:id', { admin: true }, (req, res, params) => {
  db.prepare('DELETE FROM orders WHERE id=?').run(parseInt(params.id, 10) || 0);
  json(res, { ok: true });
});
route('GET', '/api/admin/orders.csv', { admin: true }, (req, res) => {
  const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const ST = { new: 'جديد', confirmed: 'مؤكد', delivered: 'تم التسليم', cancelled: 'ملغي' };
  const rows = [['رقم الطلب', 'التاريخ', 'الحالة', 'الاسم', 'الهاتف', 'المدينة', 'العنوان', 'ملاحظات', 'الأجهزة', 'المجموع الفرعي', 'الخصم', 'الكود', 'التوصيل', 'الإجمالي']];
  db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all().map(orderOut).forEach((o) => {
    rows.push([String(o.id).padStart(5, '0'), new Date(o.createdAt).toISOString().replace('T', ' ').slice(0, 16), ST[o.status], o.name, o.phone, o.city, o.address, o.note,
      o.items.map((x) => x.qty + 'x ' + x.name).join(' | '), o.subtotal.toFixed(2), o.discount.toFixed(2), o.code, o.ship.toFixed(2), o.total.toFixed(2)]);
  });
  const body = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="homezone-orders.csv"', 'Cache-Control': 'no-store' });
  res.end(body);
});

route('GET', '/api/admin/videos', { admin: true }, (req, res) => {
  json(res, db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all().map((v) => ({
    id: v.id, title: v.title, desc: v.descr, file: v.file, url: v.url, product: v.product_id })));
});
route('POST', '/api/admin/videos', { admin: true }, async (req, res) => {
  const b = await readJson(req);
  const title = clean(b.title, 120);
  if (title.length < 2) throw bad('اكتب عنوان الفيديو');
  const file = upload(b.file, 'video'), link = url(b.url);
  if (!file && !link) throw bad('ارفع ملف فيديو أو ضع رابطًا');
  const product = b.product && db.prepare('SELECT 1 FROM products WHERE id=?').get(String(b.product)) ? String(b.product) : '';
  db.prepare('INSERT INTO videos(title,descr,file,url,product_id,created_at) VALUES(?,?,?,?,?,?)')
    .run(title, clean(b.desc, 600, true), file, file ? '' : link, product, Date.now());
  json(res, { ok: true }, 201);
});
route('DELETE', '/api/admin/videos/:id', { admin: true }, (req, res, params) => {
  const v = db.prepare('SELECT * FROM videos WHERE id=?').get(parseInt(params.id, 10) || 0);
  if (v) { db.prepare('DELETE FROM videos WHERE id=?').run(v.id); removeFile(v.file); }
  json(res, { ok: true });
});

route('GET', '/api/admin/partners', { admin: true }, (req, res) => {
  json(res, db.prepare('SELECT * FROM partners ORDER BY sort, name').all().map((p) => ({
    id: p.id, name: p.name, desc: p.descr, url: p.url, logo: fileUrl(p.logo), logoName: p.logo, sort: p.sort })));
});
function readPartner(b, cur) {
  const name = clean(b.name, 100);
  if (name.length < 2) throw bad('اكتب اسم الشريك');
  const next = db.prepare('SELECT COALESCE(MAX(sort),0)+1 AS n FROM partners WHERE sort<999').get().n;
  let sort = cur ? cur.sort : next;
  if (b.sort !== '' && b.sort != null) { const n = parseInt(b.sort, 10); if (Number.isInteger(n) && n >= 0 && n < 100000) sort = n; }
  return { name, descr: clean(b.desc, 500, true), url: url(b.url), logo: upload(b.logoName, 'image'), sort };
}
route('POST', '/api/admin/partners', { admin: true }, async (req, res) => {
  const p = readPartner(await readJson(req), null);
  db.prepare('INSERT INTO partners(name,descr,url,logo,sort) VALUES(?,?,?,?,?)').run(p.name, p.descr, p.url, p.logo, p.sort);
  json(res, { ok: true }, 201);
});
route('PUT', '/api/admin/partners/:id', { admin: true }, async (req, res, params) => {
  const cur = db.prepare('SELECT * FROM partners WHERE id=?').get(parseInt(params.id, 10) || 0);
  if (!cur) throw new HttpError(404, 'الشريك غير موجود');
  const p = readPartner(await readJson(req), cur);
  db.prepare('UPDATE partners SET name=?,descr=?,url=?,logo=?,sort=? WHERE id=?').run(p.name, p.descr, p.url, p.logo, p.sort, cur.id);
  if (cur.logo && cur.logo !== p.logo) removeFile(cur.logo);
  json(res, { ok: true });
});
route('DELETE', '/api/admin/partners/:id', { admin: true }, (req, res, params) => {
  const cur = db.prepare('SELECT * FROM partners WHERE id=?').get(parseInt(params.id, 10) || 0);
  if (cur) { db.prepare('DELETE FROM partners WHERE id=?').run(cur.id); removeFile(cur.logo); }
  json(res, { ok: true });
});

route('GET', '/api/admin/settings', { admin: true }, (req, res) => json(res, settings()));
route('PUT', '/api/admin/settings', { admin: true }, async (req, res) => {
  const b = await readJson(req);
  const free = money(b.freeFrom, 'حد التوصيل المجاني'), ship = money(b.shipFee, 'رسوم التوصيل');
  let wa = String(b.whatsapp || '').replace(/\D/g, '');
  if (wa.startsWith('00')) wa = wa.slice(2);
  else if (/^07\d{8}$/.test(wa)) wa = '962' + wa.slice(1);
  if (wa && !/^\d{9,15}$/.test(wa)) throw new HttpError(422, 'رقم واتساب غير صحيح. اكتبه مع رمز الدولة، مثل 962791234567');
  tx(() => { putSetting('freeFrom', free); putSetting('shipFee', ship); putSetting('notice', clean(b.notice, 140)); putSetting('whatsapp', wa); });
  json(res, { ok: true });
});

route('POST', '/api/admin/upload', { admin: true }, async (req, res) => {
  const kind = new URL(req.url, 'http://x').searchParams.get('kind') === 'video' ? 'video' : 'image';
  json(res, await saveUpload(req, kind), 201);
});

/* ---------- الملفات الثابتة ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8'
};
function serveFile(req, res, root, rel, cacheHeader) {
  let p;
  try { p = path.normalize(path.join(root, decodeURIComponent(rel))); } catch (e) { throw bad('مسار غير صالح'); }
  if (p !== root && !p.startsWith(root + path.sep)) throw new HttpError(404, 'غير موجود');
  if (p.split(path.sep).some((s) => s.startsWith('.'))) throw new HttpError(404, 'غير موجود');
  let st;
  try { st = fs.statSync(p); } catch (e) { throw new HttpError(404, 'غير موجود'); }
  if (st.isDirectory()) { p = path.join(p, 'index.html'); try { st = fs.statSync(p); } catch (e) { throw new HttpError(404, 'غير موجود'); } }
  const type = MIME[path.extname(p).toLowerCase()];
  if (!type) throw new HttpError(404, 'غير موجود');
  const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
  const headers = { 'Content-Type': type, 'Cache-Control': cacheHeader, ETag: etag, 'Accept-Ranges': 'bytes' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  let start = 0, end = st.size - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = parseInt(m[1], 10); if (m[2]) end = Math.min(parseInt(m[2], 10), end); }
    else { start = Math.max(0, st.size - parseInt(m[2], 10)); }
    if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || st.size === 0) return res.end();
  fs.createReadStream(p, { start, end }).on('error', () => res.destroy()).pipe(res);
}

/* ---------- الخادم ---------- */
function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
    "img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  if (isSecure(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
function sendError(req, res, e) {
  const status = e instanceof HttpError ? e.status : 500;
  if (!(e instanceof HttpError)) console.error(e);
  if (res.headersSent) return res.destroy();
  const body = JSON.stringify(Object.assign({ error: e instanceof HttpError ? e.message : 'حدث خطأ في الخادم' }, e.extra || {}));
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) };
  if (e.closeConn) { headers.Connection = 'close'; res.on('finish', () => req.destroy()); }
  res.writeHead(status, headers);
  res.end(body);
}

async function handle(req, res) {
  securityHeaders(req, res);
  const u = new URL(req.url, 'http://x');
  const pathname = u.pathname;
  if (pathname.startsWith('/api/')) {
    const csrfSafe = req.method === 'GET' || req.method === 'HEAD';
    if (!csrfSafe) {
      const origin = req.headers.origin;
      if (req.headers['x-hz'] !== '1') throw new HttpError(403, 'طلب مرفوض');
      if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch (e) { ok = false; } if (!ok) throw new HttpError(403, 'طلب مرفوض'); }
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.admin && !isAdmin(req)) throw new HttpError(401, 'سجّل الدخول أولًا');
      const params = {};
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch (e) { throw bad('مسار غير صالح'); } });
      return r.fn(req, res, params);
    }
    throw new HttpError(404, 'غير موجود');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'غير مسموح');
  if (pathname.startsWith('/uploads/')) return serveFile(req, res, UPLOAD_DIR, pathname.slice(9), 'public, max-age=2592000, immutable');
  if (pathname === '/admin' || pathname === '/admin/') { res.setHeader('X-Robots-Tag', 'noindex'); return serveFile(req, res, PUBLIC_DIR, 'admin.html', 'no-cache'); }
  if (pathname === '/admin.html') { res.writeHead(301, { Location: '/admin' }); return res.end(); }
  return serveFile(req, res, PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1), 'no-cache');
}

const server = http.createServer((req, res) => {
  Promise.resolve().then(() => handle(req, res)).catch((e) => {
    if (e && e.status === 404 && !req.url.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta charset="utf-8"><title>غير موجود</title><body style="font-family:sans-serif;text-align:center;padding:4rem" dir="rtl"><h1>الصفحة غير موجودة</h1><p><a href="/">العودة إلى المتجر</a></p>');
    }
    sendError(req, res, e);
  });
});
server.requestTimeout = 30 * 60 * 1000; // رفع الفيديوهات الكبيرة
server.headersTimeout = 30 * 1000;

/* ---------- تنظيف الملفات اليتيمة ---------- */
function cleanOrphans() {
  try {
    const used = new Set();
    db.prepare("SELECT img, vid FROM products").all().forEach((r) => { used.add(r.img); used.add(r.vid); });
    db.prepare('SELECT file FROM videos').all().forEach((r) => used.add(r.file));
    db.prepare('SELECT logo FROM partners').all().forEach((r) => used.add(r.logo));
    const now = Date.now();
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      const full = path.join(UPLOAD_DIR, f);
      const old = now - fs.statSync(full).mtimeMs > 60 * 60 * 1000;
      if (old && (f.startsWith('.tmp-') || !used.has(f))) fs.unlinkSync(full);
    }
  } catch (e) { console.error('تنظيف الملفات:', e.message); }
}
cleanOrphans();
setInterval(cleanOrphans, 6 * 60 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`HomeZone يعمل على http://localhost:${PORT}  (لوحة الإدارة: /admin)`);
  if (generatedPass) {
    console.log('────────────────────────────────────────────');
    console.log(' كلمة مرور الإدارة المؤقتة (تظهر هذه المرة فقط):');
    console.log('   ' + generatedPass);
    console.log(' لتعيين كلمة مرورك: شغّل الخادم مع المتغير ADMIN_PASSWORD');
    console.log('────────────────────────────────────────────');
  } else if (!ENV_PASS) {
    console.log(' كلمة مرور الإدارة محفوظة من أول تشغيل. لتغييرها استخدم المتغير ADMIN_PASSWORD.');
  }
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => { try { db.close(); } catch (e) { /* */ } process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); });
}
