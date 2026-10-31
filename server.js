const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');

const { db, getSettings, setSetting } = require('./lib/db');
const { formatMoney, formatAmount, formatPrice, orderUnitPrice, normalizeCurrencyMode, formatOrderMoney, parsePriceToCents, formatDate, nowLocal, statusMeta, STATUS } = require('./lib/format');
const { hashPassword, verifyPassword, createToken, verifyToken, parseCookies, serializeCookie } = require('./lib/auth');
const { WELCOME_SLOTS, TEXT_FIELDS, slotKey, getWelcomeMedia, getWelcomeTexts, setWelcomeText } = require('./lib/welcome');
const { MENU_TEXT_META, MENU_TEXT_GROUPS, getMenuTexts, setMenuText } = require('./lib/menu-texts');
const { BACKUP_DIR: DB_BACKUP_DIR, backupDatabase, listBackups } = require('./lib/backup');
const { buildReportData, refreshReports, getReportStatus, EXCEL_PATH, JSON_PATH } = require('./lib/reports');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PORT = Number(process.env.ADMIN_PORT || 3001);
const PUBLIC_HOST = process.env.PUBLIC_HOST || '0.0.0.0';
const ADMIN_HOST = process.env.ADMIN_HOST || '127.0.0.1';
if (ADMIN_PORT === PORT) throw new Error('ADMIN_PORT debe ser distinto de PORT.');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
if (!fs.existsSync(SECRET_FILE)) {
  fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
}
const SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
const COOKIE = 'lp_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : process.env.TRUST_PROXY);

const ADMIN_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
const PUBLIC_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

app.use((req, res, next) => {
  const isAdminPath = req.path === '/admin' || req.path.startsWith('/admin/');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', isAdminPath ? ADMIN_CSP : PUBLIC_CSP);
  if (isAdminPath) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.static(PUBLIC_DIR, { maxAge: 0, etag: true }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const data = verifyToken(cookies[COOKIE], SECRET);
  if (!data || !data.uid) return null;
  const user = db.prepare('SELECT id, username, display_name, role, active, must_change_password, session_version FROM admin_users WHERE id = ?').get(Number(data.uid));
  if (!user || !user.active) return null;
  if (Number(data.sv) !== Number(user.session_version)) return null;
  return user;
}

app.use((req, res, next) => {
  const settings = getSettings();
  res.locals.settings = settings;
  res.locals.money = (cents, code) => formatMoney(cents, settings, code);
  res.locals.orderMoney = (cents, order) => formatOrderMoney(cents, order, settings);
  res.locals.amount = (cents, code) => formatAmount(cents, settings, code);
  res.locals.price = (product) => formatPrice(product, settings);
  res.locals.fmtDate = formatDate;
  res.locals.statusMeta = statusMeta;
  res.locals.STATUS = STATUS;
  res.locals.currentPath = req.path;
  res.locals.adminUser = getSessionUser(req);
  res.locals.lanIp = getLanIp();
  res.locals.port = PORT;
  res.locals.adminPort = ADMIN_PORT;
  res.locals.notice = typeof req.query.ok === 'string' ? req.query.ok : '';
  res.locals.warning = typeof req.query.err === 'string' ? req.query.err : '';
  next();
});

app.use((req, res, next) => {
  const isAdminPort = Number(req.socket.localPort) === ADMIN_PORT;
  const isAdminPath = req.path === '/admin' || req.path.startsWith('/admin/');
  if (!isAdminPort && isAdminPath) {
    return res.status(404).render('404', { title: 'Página no encontrada' });
  }
  if (isAdminPort && res.locals.adminUser && res.locals.adminUser.must_change_password) {
    const allowed = req.path === '/admin/ajustes' || req.path === '/admin/password' || req.path === '/admin/logout';
    if (!allowed) return res.redirect('/admin/ajustes?tab=general#seguridad');
  }
  next();
});

app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const origin = req.get('origin');
  if (!origin) return next();
  if (origin !== requestOrigin(req)) {
    return res.status(403).send('Origen de la solicitud no permitido.');
  }
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const safeExt = allowed.includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Formato de imagen no válido. Usa JPG, PNG, WEBP o GIF.'));
  },
});

const loginAttempts = new Map();
function loginBlocked(ip) {
  const a = loginAttempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.first > 10 * 60 * 1000) {
    loginAttempts.delete(ip);
    return false;
  }
  return a.count >= 8;
}
function noteLoginFail(ip) {
  const a = loginAttempts.get(ip);
  if (!a || Date.now() - a.first > 10 * 60 * 1000) loginAttempts.set(ip, { count: 1, first: Date.now() });
  else a.count += 1;
}

const orderAttempts = new Map();
function orderRateLimited(ip) {
  const now = Date.now();
  const a = orderAttempts.get(ip);
  if (!a || now - a.first > 10 * 60 * 1000) {
    orderAttempts.set(ip, { count: 1, first: now });
    return false;
  }
  a.count += 1;
  return a.count > 40;
}

function passwordError(password) {
  if (String(password || '').length < 12) return 'La contraseña debe tener al menos 12 caracteres.';
  return '';
}

function flash(url, key, msg) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${key}=${encodeURIComponent(msg)}`;
}
function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin';
}
function removeUpload(image) {
  if (!image || !image.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, path.basename(image));
  fs.promises.unlink(file).catch(() => {});
}
function newOrderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 10; i += 1) {
    let code = 'LP-';
    for (let j = 0; j < 6; j += 1) code += alphabet[crypto.randomInt(alphabet.length)];
    if (!db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code)) return code;
  }
  return `LP-${Date.now().toString(36).toUpperCase()}`;
}
function requireAdmin(req, res, next) {
  if (!res.locals.adminUser) {
    return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return next();
}
function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
}
function getProduct(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(Number(id));
}
function productValues(body, existing) {
  const priceInput = body.price !== undefined ? String(body.price) : (existing ? (existing.price_cents / 100).toFixed(2) : '');
  const priceCucInput = body.price_cuc !== undefined ? String(body.price_cuc) : (existing && existing.price_cuc_cents ? (existing.price_cuc_cents / 100).toFixed(2) : '');
  return {
    id: existing ? existing.id : null,
    category_id: Number(body.category_id || (existing && existing.category_id)) || 0,
    name: String(body.name || (existing && existing.name) || '').trim().slice(0, 90),
    description: String(body.description !== undefined ? body.description : (existing ? existing.description : '')).trim().slice(0, 400),
    price_cents: body.price !== undefined ? parsePriceToCents(body.price, 'USD') : (existing ? existing.price_cents : 0),
    price_input: priceInput,
    price_cuc_cents: body.price_cuc !== undefined ? parsePriceToCents(body.price_cuc, 'CUC') : (existing ? existing.price_cuc_cents : 0),
    price_cuc_input: priceCucInput,
    image: existing ? existing.image : '',
    emoji: String(body.emoji !== undefined ? body.emoji : (existing ? existing.emoji : '')).trim().slice(0, 8),
    badge: String(body.badge !== undefined ? body.badge : (existing ? existing.badge : '')).trim().slice(0, 28),
    tag: String(body.tag !== undefined ? body.tag : (existing ? existing.tag : '')).trim().slice(0, 28),
    active: body.active === 'on' ? 1 : 0,
    sort_order: Number(body.sort_order !== undefined ? body.sort_order : (existing ? existing.sort_order : 0)) || 0,
  };
}
function validateProduct(values, categories) {
  if (!values.name) return 'El nombre del producto es obligatorio.';
  if (!values.category_id || !categories.some((c) => c.id === values.category_id)) return 'Elige una categoría válida.';
  if (values.price_cents < 0) return 'El precio no es válido.';
  return '';
}

app.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order, id').all();
  const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order, id').all();
  const grouped = categories.map((cat) => ({
    ...cat,
    products: products.filter((p) => p.category_id === cat.id),
  })).filter((cat) => cat.products.length > 0);

  const featuredId = Number(res.locals.settings.featured_product_id) || 0;
  const featured = products.find((p) => p.id === featuredId) || products[0] || null;
  const station = String(req.query.station || '').trim().slice(0, 40) || res.locals.settings.default_station;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const productsForJs = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    badge: p.badge,
    tag: p.tag,
    price: p.price_cents,
    price_cuc_cents: p.price_cuc_cents,
    price_label: formatPrice(p, res.locals.settings),
    price_usd_label: formatMoney(p.price_cents, res.locals.settings, 'USD'),
    price_cuc_label: formatMoney(Number(p.price_cuc_cents) || p.price_cents, res.locals.settings, 'CUC'),
    emoji: p.emoji || '🍽️',
    image: p.image || '',
    category_id: p.category_id,
    category: categoryById.get(p.category_id)?.name || '',
    category_accent: categoryById.get(p.category_id)?.accent || '#006fcd',
  }));

  const social = publicSocialLinks(res.locals.settings);
  const waBase = social.whatsapp || 'https://wa.me/5352740665';
  const waLink = (message) => `${waBase}${waBase.includes('?') ? '&' : '?'}text=${encodeURIComponent(message)}`;
  const reserveMessage = String(res.locals.settings.reserve_message || 'Hola, quiero reservar la estación {estacion} en Lily\'s Plays.').trim();
  const welcomeMedia = getWelcomeMedia(res.locals.settings);
  const heroMedia = welcomeMedia.find((item) => item.slot === 'hero-banner') || {
    image: '/img/banner-lilys-plays.jpg',
    alt: "Letrero neón de Lily's Plays, Salón Gamer y Bistró",
  };
  const reserveStations = welcomeMedia
    .filter((item) => item.group === 'Estaciones')
    .map((item) => {
      const number = item.slot.replace('station-', '');
      return {
        ...item,
        number,
        whatsapp: waLink(reserveMessage.replace(/\{estacion\}/g, number)),
      };
    });

  res.render('menu', {
    title: "Menú · Lily's Plays",
    categories: grouped,
    featured,
    station,
    stationFromQuery: Boolean(req.query.station),
    productsForJs,
    welcomeTexts: getWelcomeTexts(res.locals.settings),
    menuTexts: getMenuTexts(res.locals.settings),
    heroMedia,
    reserveStations,
    page: 'menu',
  });
});

function publicSocialLinks(settings) {
  const raw = (value) => String(value || '').trim();
  const asUrl = (value) => {
    const text = raw(value);
    if (!text) return '';
    return /^https?:\/\//i.test(text) ? text : `https://${text}`;
  };
  const wa = raw(settings.social_whatsapp);
  const mail = raw(settings.social_email);
  const yt = raw(settings.social_youtube);
  return {
    whatsapp: wa ? (/^https?:\/\//i.test(wa) ? wa : `https://wa.me/${wa.replace(/\D/g, '')}`) : '',
    facebook: asUrl(settings.social_facebook),
    instagram: asUrl(settings.social_instagram),
    email: mail ? (/^mailto:/i.test(mail) ? mail : `mailto:${mail}`) : '',
    youtube: yt
      ? (/^https?:\/\//i.test(yt)
        ? yt
        : (/^(www\.)?(youtube\.com|youtu\.be)/i.test(yt) ? `https://${yt}` : `https://youtube.com/@${yt.replace(/^@/, '')}`))
      : '',
    website: asUrl(settings.social_website),
  };
}

app.get('/api/public-info', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    opening_status: res.locals.settings.opening_status || '',
    opening_hours: res.locals.settings.opening_hours || '',
    social: publicSocialLinks(res.locals.settings),
  });
});

app.get('/pedido/:code', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE code = ?').get(String(req.params.code).toUpperCase());
  if (!order) {
    return res.status(404).render('404', { title: 'Pedido no encontrado' });
  }
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  return res.render('order', { title: `Pedido ${order.code}`, order, items });
});

app.get('/api/pedidos/:code/estado', (req, res) => {
  const order = db.prepare('SELECT code, status FROM orders WHERE code = ?').get(String(req.params.code).toUpperCase());
  if (!order) return res.status(404).json({ ok: false });
  return res.json({ ok: true, code: order.code, status: order.status, ...statusMeta(order.status) });
});

app.post('/api/orders', (req, res) => {
  let started = false;
  const ip = req.ip || 'local';
  if (orderRateLimited(ip)) {
    res.setHeader('Retry-After', '600');
    return res.status(429).json({ ok: false, error: 'Demasiados pedidos seguidos. Espera unos minutos e intenta de nuevo.' });
  }
  try {
    const body = req.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return res.status(400).json({ ok: false, error: 'El pedido está vacío.' });
    if (rawItems.length > 60) return res.status(400).json({ ok: false, error: 'Demasiados productos en el pedido.' });

    const quantities = new Map();
    for (const item of rawItems) {
      const id = Number(item && item.id);
      const qty = Math.max(1, Math.min(30, parseInt(item && item.qty, 10) || 1));
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Producto inválido.' });
      quantities.set(id, (quantities.get(id) || 0) + qty);
    }

    const settings = getSettings();
    const currencyMode = normalizeCurrencyMode(settings.currency_mode);
    const currencyCode = currencyMode === 'CUC' ? 'CUC' : 'USD';
    const currencySymbol = currencyCode === 'CUC' ? (settings.currency_symbol_cuc || '$') : (settings.currency_symbol || 'US$');
    const currencyLocale = currencyCode === 'CUC' ? (settings.currency_locale_cuc || 'es-CU') : (settings.currency_locale || 'en-US');
    const orderItems = [];
    let subtotal = 0;
    for (const [id, qty] of quantities) {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id);
      if (!product) return res.status(400).json({ ok: false, error: 'Un producto ya no está disponible.' });
      const unitPrice = orderUnitPrice(product, settings);
      subtotal += unitPrice * qty;
      orderItems.push({ product_id: product.id, name: product.name, price_cents: unitPrice, qty });
    }

    const taxPercent = Math.max(0, Math.min(100, Number(settings.tax_percent) || 0));
    const tax = Math.round((subtotal * taxPercent) / 100);
    const total = subtotal + tax;
    const station = String(body.station || settings.default_station).trim().slice(0, 40) || settings.default_station;
    const customer = String(body.customer || '').trim().slice(0, 60);
    const note = String(body.note || '').trim().slice(0, 220);
    const code = newOrderCode();
    const createdAt = nowLocal();

    db.exec('BEGIN');
    started = true;
    const orderResult = db.prepare(`INSERT INTO orders(code, station, customer, note, subtotal_cents, tax_cents, total_cents, status, created_at, currency_mode, currency_code, currency_symbol, currency_locale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(code, station, customer, note, subtotal, tax, total, 'nuevo', createdAt, currencyMode, currencyCode, currencySymbol, currencyLocale);
    const orderId = Number(orderResult.lastInsertRowid);
    const insertItem = db.prepare('INSERT INTO order_items(order_id, product_id, name, price_cents, qty) VALUES (?, ?, ?, ?, ?)');
    for (const item of orderItems) insertItem.run(orderId, item.product_id, item.name, item.price_cents, item.qty);
    db.exec('COMMIT');
    started = false;

    refreshReports().catch((error) => {
      console.error('No se pudo actualizar el Excel maestro tras el pedido:', error.message);
    });

    return res.json({ ok: true, code, total_cents: total, currency_code: currencyCode });
  } catch (err) {
    if (started) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    }
    console.error('Error creando pedido:', err);
    return res.status(500).json({ ok: false, error: 'No se pudo enviar el pedido. Intenta de nuevo.' });
  }
});

app.get('/admin/login', (req, res) => {
  if (res.locals.adminUser) return res.redirect('/admin');
  return res.render('admin/login', {
    title: 'Ingresar · Panel',
    error: null,
    next: safeNext(req.query.next),
    username: '',
  });
});

function secureCookie(req) {
  return Boolean(req.secure) || String(req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
}

function setAdminCookie(req, res, token, maxAge = SESSION_TTL) {
  const secure = secureCookie(req);
  const cookies = [serializeCookie(COOKIE, '', { path: '/', maxAge: 0, sameSite: 'Strict' })];
  cookies.push(token
    ? serializeCookie(COOKIE, token, { path: '/admin', maxAge, sameSite: 'Strict', secure })
    : serializeCookie(COOKIE, '', { path: '/admin', maxAge: 0, sameSite: 'Strict', secure }));
  res.setHeader('Set-Cookie', cookies);
}

app.post('/admin/login', (req, res) => {
  const ip = req.ip || 'local';
  if (loginBlocked(ip)) {
    return res.status(429).render('admin/login', {
      title: 'Ingresar · Panel',
      error: 'Demasiados intentos. Espera 10 minutos e intenta de nuevo.',
      next: safeNext(req.body.next),
      username: String(req.body.username || ''),
    });
  }
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM admin_users WHERE lower(username) = ?').get(username);
  if (!user || !user.active || !verifyPassword(password, user.salt, user.hash)) {
    noteLoginFail(ip);
    return res.status(401).render('admin/login', {
      title: 'Ingresar · Panel',
      error: 'Usuario o contraseña incorrectos.',
      next: safeNext(req.body.next),
      username: String(req.body.username || ''),
    });
  }
  loginAttempts.delete(ip);
  const token = createToken(SECRET, { uid: user.id, username: user.username, sv: Number(user.session_version) || 1 }, SESSION_TTL);
  setAdminCookie(req, res, token);
  if (user.must_change_password) return res.redirect('/admin/ajustes?tab=general#seguridad');
  return res.redirect(safeNext(req.body.next));
});

app.post('/admin/logout', (req, res) => {
  setAdminCookie(req, res, '');
  res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, (req, res) => {
  const dashboardCurrency = normalizeCurrencyMode(res.locals.settings.currency_mode) === 'CUC' ? 'CUC' : 'USD';
  const stats = {
    todayOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE date(created_at) = date('now','localtime')").get().c,
    pending: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('nuevo','preparando','listo')").get().c,
    todayRevenue: db.prepare(`
      SELECT COALESCE(SUM(e.amount_cents),0) AS s
      FROM order_payment_events e
      JOIN orders o ON o.id = e.order_id
      WHERE date(e.created_at) = date('now','localtime')
        AND (o.currency_code = ? OR o.currency_code = '')
    `).get(dashboardCurrency).s,
    activeProducts: db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get().c,
  };
  const recent = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 6').all();
  res.render('admin/dashboard', { title: 'Resumen', stats, recent, dashboardCurrency });
});

function loadOrdersWithItems({ limit = 50, offset = 0, status = 'all' } = {}) {
  const filtered = status && status !== 'all';
  const sql = `SELECT * FROM orders ${filtered ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const params = filtered ? [status, limit, offset] : [limit, offset];
  const orders = db.prepare(sql).all(...params);
  if (!orders.length) return [];
  const placeholders = orders.map(() => '?').join(',');
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`).all(...orders.map((o) => o.id));
  const byOrder = new Map();
  for (const item of items) {
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
    byOrder.get(item.order_id).push(item);
  }
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [], meta: statusMeta(o.status) }));
}

app.get('/admin/pedidos', requireAdmin, (req, res) => {
  const perPage = 50;
  const status = STATUS[String(req.query.status || '')] ? String(req.query.status) : 'all';
  const total = Number((status === 'all'
    ? db.prepare('SELECT COUNT(*) AS c FROM orders').get()
    : db.prepare('SELECT COUNT(*) AS c FROM orders WHERE status = ?').get(status)).c) || 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const offset = (page - 1) * perPage;
  const orderList = loadOrdersWithItems({ limit: perPage, offset, status });
  const counts = { all: Number(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c) || 0 };
  for (const key of Object.keys(STATUS)) {
    counts[key] = Number(db.prepare('SELECT COUNT(*) AS c FROM orders WHERE status = ?').get(key).c) || 0;
  }
  res.render('admin/orders', { title: 'Pedidos', orders: orderList, counts, status, page, pages, total, perPage });
});

app.post('/admin/pedidos/limpiar', requireAdmin, (req, res) => {
  const total = Number(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c) || 0;
  if (!total) {
    return res.redirect(flash('/admin/pedidos', 'ok', 'No había pedidos para limpiar. Los resúmenes ya están en cero.'));
  }
  try {
    backupDatabase('borrar-pedidos');
  } catch (error) {
    console.error('No se pudo crear el respaldo antes de limpiar pedidos:', error);
    return res.redirect(flash('/admin/pedidos', 'err', 'No se pudo crear el respaldo de la base de datos. No se borró ningún pedido.'));
  }
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM orders').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_items', 'order_payment_events')").run();
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('No se pudieron limpiar los pedidos:', error);
    return res.redirect(flash('/admin/pedidos', 'err', 'No se pudieron limpiar los pedidos. Inténtalo de nuevo.'));
  }
  const orphans = Number(db.prepare(`
    SELECT COUNT(*) AS c FROM order_items oi
    LEFT JOIN orders o ON o.id = oi.order_id
    WHERE o.id IS NULL
  `).get().c) || 0;
  if (orphans > 0) {
    db.prepare('DELETE FROM order_items WHERE order_id NOT IN (SELECT id FROM orders)').run();
  }
  refreshReports().catch((error) => {
    console.error('No se pudo actualizar el Excel maestro tras limpiar pedidos:', error.message);
  });
  const message = `Se eliminaron ${total} ${total === 1 ? 'pedido' : 'pedidos'}, se reiniciaron los resúmenes y se guardó un respaldo.${orphans ? ` Se limpiaron ${orphans} detalle(s) huérfano(s).` : ''}`;
  return res.redirect(flash('/admin/pedidos', 'ok', message));
});

app.post('/admin/pedidos/:id/estado', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status || '');
  if (!STATUS[status]) return res.redirect(flash('/admin/pedidos', 'err', 'Estado no válido.'));
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  return res.redirect(flash('/admin/pedidos', 'ok', `Pedido actualizado a ${STATUS[status].label}.`));
});

app.post('/admin/pedidos/:id/pago', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const action = String(req.body.action || '');
  const returnTo = safeNext(req.body.return_to);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.redirect(flash(returnTo, 'err', 'Pedido no encontrado.'));
  if (order.status === 'cancelado' && action === 'pay') {
    return res.redirect(flash(returnTo, 'err', 'No se puede aprobar el pago de un pedido cancelado.'));
  }
  const method = String(req.body.payment_method || order.payment_method || 'efectivo').trim().slice(0, 40) || 'efectivo';
  const now = nowLocal();
  let message = '';
  try {
    db.exec('BEGIN');
    if (action === 'pay') {
      if (order.payment_status === 'pagado') {
        db.exec('ROLLBACK');
        return res.redirect(flash(returnTo, 'ok', 'Ese pedido ya estaba pagado.'));
      }
      db.prepare("UPDATE orders SET payment_status = 'pagado', payment_method = ?, paid_at = ?, refunded_at = '' WHERE id = ?")
        .run(method, now, id);
      db.prepare('INSERT INTO order_payment_events(order_id, type, amount_cents, method, note, admin_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, 'pago', Number(order.total_cents) || 0, method, String(req.body.note || '').trim().slice(0, 200), res.locals.adminUser.id, now);
      message = `Pago aprobado: ${formatOrderMoney(order.total_cents, order, res.locals.settings)} · ${method}.`;
    } else if (action === 'refund') {
      if (order.payment_status !== 'pagado') {
        db.exec('ROLLBACK');
        return res.redirect(flash(returnTo, 'err', 'Solo se puede reembolsar un pedido que esté pagado.'));
      }
      const paidAt = order.paid_at || now;
      db.prepare("UPDATE orders SET payment_status = 'reembolsado', payment_method = ?, paid_at = ?, refunded_at = ? WHERE id = ?")
        .run(method, paidAt, now, id);
      db.prepare('INSERT INTO order_payment_events(order_id, type, amount_cents, method, note, admin_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, 'reembolso', -(Number(order.total_cents) || 0), method, String(req.body.note || '').trim().slice(0, 200), res.locals.adminUser.id, now);
      message = `Reembolso registrado: ${formatOrderMoney(order.total_cents, order, res.locals.settings)}.`;
    } else if (action === 'reset') {
      if (order.payment_status === 'pendiente') {
        db.exec('ROLLBACK');
        return res.redirect(flash(returnTo, 'ok', 'Ese pedido ya estaba pendiente de pago.'));
      }
      const reversal = order.payment_status === 'pagado' ? -(Number(order.total_cents) || 0) : 0;
      db.prepare("UPDATE orders SET payment_status = 'pendiente', paid_at = '', refunded_at = '' WHERE id = ?").run(id);
      db.prepare('INSERT INTO order_payment_events(order_id, type, amount_cents, method, note, admin_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, 'anulacion', reversal, method, 'Pago anulado desde el panel', res.locals.adminUser.id, now);
      message = 'El pedido volvió a pendiente de pago.';
    } else {
      db.exec('ROLLBACK');
      return res.redirect(flash(returnTo, 'err', 'Acción de pago no válida.'));
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    console.error('No se pudo actualizar el pago:', error);
    return res.redirect(flash(returnTo, 'err', 'No se pudo actualizar el pago. Inténtalo de nuevo.'));
  }
  refreshReports().catch((error) => {
    console.error('No se pudo actualizar el Excel maestro tras el pago:', error.message);
  });
  return res.redirect(flash(returnTo, 'ok', message));
});

app.get('/admin/reportes', requireAdmin, (req, res) => {
  let data = null;
  let reportError = '';
  try {
    data = buildReportData();
  } catch (error) {
    reportError = error.message || 'No se pudieron calcular los reportes.';
    console.error('Error calculando reportes:', error);
  }
  res.render('admin/reports', {
    title: 'Reportes',
    data,
    reportError,
    status: getReportStatus(),
    backups: listBackups(8),
  });
});

app.post('/admin/reportes/generar', requireAdmin, async (req, res) => {
  try {
    const result = await refreshReports();
    if (!result.excel_ok) {
      return res.redirect(flash('/admin/reportes', 'err', `Se generó el JSON, pero el Excel falló: ${result.excel_error}`));
    }
    return res.redirect(flash('/admin/reportes', 'ok', 'Excel y JSON generados correctamente.'));
  } catch (error) {
    console.error('Error generando reportes:', error);
    return res.redirect(flash('/admin/reportes', 'err', `No se pudieron generar los reportes: ${error.message}`));
  }
});

app.get('/admin/reportes/descargar/excel', requireAdmin, (req, res) => {
  if (!fs.existsSync(EXCEL_PATH)) return res.redirect(flash('/admin/reportes', 'err', 'Todavía no hay Excel. Genera los reportes primero.'));
  return res.download(EXCEL_PATH, 'pedidos-maestro.xlsx');
});

app.get('/admin/reportes/descargar/json', requireAdmin, (req, res) => {
  if (!fs.existsSync(JSON_PATH)) return res.redirect(flash('/admin/reportes', 'err', 'Todavía no hay JSON. Genera los reportes primero.'));
  return res.download(JSON_PATH, 'pedidos-maestro.json');
});

app.post('/admin/reportes/respaldo', requireAdmin, (req, res) => {
  try {
    const file = backupDatabase('manual');
    return res.redirect(flash('/admin/reportes', 'ok', `Respaldo creado: ${path.basename(file)}`));
  } catch (error) {
    console.error('Error creando respaldo manual:', error);
    return res.redirect(flash('/admin/reportes', 'err', `No se pudo crear el respaldo: ${error.message}`));
  }
});

app.get('/admin/reportes/respaldo/:name', requireAdmin, (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  if (!/^lilys-plays-[a-z0-9-]+\.db$/i.test(name)) {
    return res.redirect(flash('/admin/reportes', 'err', 'Respaldo no válido.'));
  }
  const file = path.join(DB_BACKUP_DIR, name);
  if (!fs.existsSync(file)) return res.redirect(flash('/admin/reportes', 'err', 'El respaldo ya no existe.'));
  return res.download(file, name);
});

app.get('/admin/productos', requireAdmin, (req, res) => {
  const products = db.prepare(`
    SELECT p.*, c.name AS category_name, c.accent AS category_accent
    FROM products p JOIN categories c ON c.id = p.category_id
    ORDER BY c.sort_order, c.id, p.sort_order, p.id
  `).all();
  res.render('admin/products', { title: 'Productos', products });
});

app.get('/admin/productos/nuevo', requireAdmin, (req, res) => {
  res.render('admin/product-form', {
    title: 'Nuevo producto',
    product: { name: '', description: '', price_input: '', price_cuc_input: '', price_cuc_cents: 0, category_id: '', emoji: '', badge: '', tag: '', active: 1, sort_order: 0, image: '' },
    categories: getCategories(),
    isNew: true,
    error: null,
  });
});

app.get('/admin/productos/:id/editar', requireAdmin, (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) return res.status(404).render('404', { title: 'Producto no encontrado' });
  res.render('admin/product-form', {
    title: 'Editar producto',
    product: { ...product, price_input: (product.price_cents / 100).toFixed(2), price_cuc_input: (product.price_cuc_cents / 100).toFixed(2) },
    categories: getCategories(),
    isNew: false,
    error: null,
  });
});

app.post('/admin/productos', requireAdmin, upload.single('image'), (req, res) => {
  const categories = getCategories();
  const values = productValues(req.body, null);
  values.image = req.file ? `/uploads/${req.file.filename}` : '';
  const error = validateProduct(values, categories);
  if (error) {
    if (req.file) removeUpload(values.image);
    return res.status(400).render('admin/product-form', {
      title: 'Nuevo producto',
      product: { ...values, image: '' },
      categories,
      isNew: true,
      error,
    });
  }
  db.prepare('INSERT INTO products(category_id, name, description, price_cents, price_cuc_cents, image, emoji, badge, tag, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(values.category_id, values.name, values.description, values.price_cents, values.price_cuc_cents, values.image, values.emoji, values.badge, values.tag, values.active, values.sort_order);
  return res.redirect(flash('/admin/productos', 'ok', 'Producto creado.'));
});

app.post('/admin/productos/:id', requireAdmin, upload.single('image'), (req, res) => {
  const existing = getProduct(req.params.id);
  if (!existing) return res.status(404).render('404', { title: 'Producto no encontrado' });
  const categories = getCategories();
  const values = productValues(req.body, existing);
  const candidate = req.file ? `/uploads/${req.file.filename}` : '';
  let image = existing.image;
  if (candidate) image = candidate;
  else if (req.body.remove_image === 'on') image = '';
  values.image = image;
  const error = validateProduct(values, categories);
  if (error) {
    if (candidate) removeUpload(candidate);
    return res.status(400).render('admin/product-form', {
      title: 'Editar producto',
      product: { ...values, image: existing.image },
      categories,
      isNew: false,
      error,
    });
  }
  db.prepare('UPDATE products SET category_id = ?, name = ?, description = ?, price_cents = ?, price_cuc_cents = ?, image = ?, emoji = ?, badge = ?, tag = ?, active = ?, sort_order = ? WHERE id = ?')
    .run(values.category_id, values.name, values.description, values.price_cents, values.price_cuc_cents, image, values.emoji, values.badge, values.tag, values.active, values.sort_order, existing.id);
  if ((candidate || req.body.remove_image === 'on') && existing.image && existing.image !== image) removeUpload(existing.image);
  return res.redirect(flash('/admin/productos', 'ok', 'Producto actualizado.'));
});

app.post('/admin/productos/:id/eliminar', requireAdmin, (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) return res.redirect(flash('/admin/productos', 'err', 'Producto no encontrado.'));
  try {
    backupDatabase(`borrar-producto-${product.id}`);
  } catch (error) {
    console.error('No se pudo crear el respaldo antes de borrar el producto:', error);
    return res.redirect(flash('/admin/productos', 'err', 'No se pudo crear el respaldo. No se borró el producto.'));
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
  removeUpload(product.image);
  return res.redirect(flash('/admin/productos', 'ok', 'Producto eliminado. Se guardó un respaldo.'));
});

app.post('/admin/productos/:id/alternar', requireAdmin, (req, res) => {
  db.prepare('UPDATE products SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(Number(req.params.id));
  return res.redirect('/admin/productos');
});

app.get('/admin/categorias', requireAdmin, (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
    FROM categories c ORDER BY c.sort_order, c.id
  `).all();
  res.render('admin/categories', { title: 'Categorías', categories });
});

app.get('/admin/categorias/nueva', requireAdmin, (req, res) => {
  res.render('admin/category-form', {
    title: 'Nueva categoría',
    category: { name: '', subtitle: '', icon: '', accent: '#00a6c9', sort_order: 0, active: 1 },
    isNew: true,
    error: null,
  });
});

app.get('/admin/categorias/:id/editar', requireAdmin, (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(req.params.id));
  if (!category) return res.status(404).render('404', { title: 'Categoría no encontrada' });
  res.render('admin/category-form', { title: 'Editar categoría', category, isNew: false, error: null });
});

function categoryValues(body, existing) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(body.accent || '')) ? String(body.accent) : (existing ? existing.accent : '#00a6c9');
  return {
    name: String(body.name || '').trim().slice(0, 60),
    subtitle: String(body.subtitle || '').trim().slice(0, 140),
    icon: String(body.icon || '').trim().slice(0, 8),
    accent,
    sort_order: Number(body.sort_order || 0) || 0,
    active: body.active === 'on' ? 1 : 0,
  };
}

app.post('/admin/categorias', requireAdmin, (req, res) => {
  const values = categoryValues(req.body, null);
  if (!values.name) {
    return res.status(400).render('admin/category-form', { title: 'Nueva categoría', category: values, isNew: true, error: 'El nombre es obligatorio.' });
  }
  db.prepare('INSERT INTO categories(name, subtitle, icon, accent, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)')
    .run(values.name, values.subtitle, values.icon, values.accent, values.sort_order, values.active);
  return res.redirect(flash('/admin/categorias', 'ok', 'Categoría creada.'));
});

app.post('/admin/categorias/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) return res.status(404).render('404', { title: 'Categoría no encontrada' });
  const values = categoryValues(req.body, existing);
  if (!values.name) {
    return res.status(400).render('admin/category-form', { title: 'Editar categoría', category: { ...existing, ...values }, isNew: false, error: 'El nombre es obligatorio.' });
  }
  db.prepare('UPDATE categories SET name = ?, subtitle = ?, icon = ?, accent = ?, sort_order = ?, active = ? WHERE id = ?')
    .run(values.name, values.subtitle, values.icon, values.accent, values.sort_order, values.active, id);
  return res.redirect(flash('/admin/categorias', 'ok', 'Categoría actualizada.'));
});

app.post('/admin/categorias/:id/eliminar', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const images = db.prepare('SELECT image FROM products WHERE category_id = ?').all(id);
  try {
    backupDatabase(`borrar-categoria-${id}`);
  } catch (error) {
    console.error('No se pudo crear el respaldo antes de borrar la categoría:', error);
    return res.redirect(flash('/admin/categorias', 'err', 'No se pudo crear el respaldo. No se borró la categoría.'));
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  for (const row of images) removeUpload(row.image);
  return res.redirect(flash('/admin/categorias', 'ok', 'Categoría y sus productos eliminados. Se guardó un respaldo.'));
});

app.post('/admin/categorias/:id/alternar', requireAdmin, (req, res) => {
  db.prepare('UPDATE categories SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(Number(req.params.id));
  return res.redirect('/admin/categorias');
});

app.get('/admin/usuarios', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, role, active, created_at FROM admin_users ORDER BY id').all();
  res.render('admin/users', { title: 'Usuarios', users });
});

app.get('/admin/usuarios/nuevo', requireAdmin, (req, res) => {
  res.render('admin/user-form', {
    title: 'Nuevo administrador',
    user: { username: '', display_name: '', active: 1 },
    isNew: true,
    error: null,
  });
});

app.get('/admin/usuarios/:id/editar', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role, active FROM admin_users WHERE id = ?').get(Number(req.params.id));
  if (!user) return res.status(404).render('404', { title: 'Usuario no encontrado' });
  res.render('admin/user-form', { title: 'Editar administrador', user, isNew: false, error: null });
});

app.post('/admin/usuarios', requireAdmin, (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const displayName = String(req.body.display_name || '').trim().slice(0, 60);
  const password = String(req.body.password || '');
  const error = (() => {
    if (!/^[a-z0-9._-]{3,24}$/.test(username)) return 'El usuario debe tener entre 3 y 24 caracteres (letras, números, punto, guion).';
    if (db.prepare('SELECT 1 FROM admin_users WHERE lower(username) = ?').get(username)) return 'Ese usuario ya existe.';
    return passwordError(password);
  })();
  if (error) {
    return res.status(400).render('admin/user-form', {
      title: 'Nuevo administrador',
      user: { username, display_name: displayName, active: 1 },
      isNew: true,
      error,
    });
  }
  const { salt, hash } = hashPassword(password);
  db.prepare('INSERT INTO admin_users(username, display_name, salt, hash, role, active, must_change_password, session_version) VALUES (?, ?, ?, ?, ?, 1, 0, 1)')
    .run(username, displayName || username, salt, hash, 'admin');
  return res.redirect(flash('/admin/usuarios', 'ok', 'Administrador creado.'));
});

app.post('/admin/usuarios/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  if (!user) return res.status(404).render('404', { title: 'Usuario no encontrado' });
  const displayName = String(req.body.display_name || '').trim().slice(0, 60);
  const active = req.body.active === 'on' ? 1 : 0;
  const password = String(req.body.password || '');
  const isSelf = res.locals.adminUser.id === user.id;
  let error = '';
  if (isSelf && !active) error = 'No puedes desactivar tu propia cuenta.';
  if (password) error = passwordError(password);
  if (!error && isSelf && !user.active) error = 'Tu cuenta está inactiva.';
  if (error) {
    return res.status(400).render('admin/user-form', {
      title: 'Editar administrador',
      user: { ...user, display_name: displayName, active },
      isNew: false,
      error,
    });
  }
  if (password) {
    const { salt, hash } = hashPassword(password);
    db.prepare('UPDATE admin_users SET display_name = ?, active = ?, salt = ?, hash = ?, must_change_password = 0, session_version = session_version + 1 WHERE id = ?')
      .run(displayName || user.username, active, salt, hash, id);
  } else {
    db.prepare('UPDATE admin_users SET display_name = ?, active = ?, session_version = session_version + 1 WHERE id = ?')
      .run(displayName || user.username, active, id);
  }
  if (isSelf) {
    const updated = db.prepare('SELECT id, username, session_version FROM admin_users WHERE id = ?').get(id);
    const token = createToken(SECRET, { uid: updated.id, username: updated.username, sv: Number(updated.session_version) || 1 }, SESSION_TTL);
    setAdminCookie(req, res, token);
  }
  return res.redirect(flash('/admin/usuarios', 'ok', 'Administrador actualizado.'));
});

app.post('/admin/usuarios/:id/eliminar', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (res.locals.adminUser.id === id) return res.redirect(flash('/admin/usuarios', 'err', 'No puedes eliminar tu propia cuenta.'));
  try {
    backupDatabase(`borrar-usuario-${id}`);
  } catch (error) {
    console.error('No se pudo crear el respaldo antes de borrar el usuario:', error);
    return res.redirect(flash('/admin/usuarios', 'err', 'No se pudo crear el respaldo. No se borró el usuario.'));
  }
  db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  return res.redirect(flash('/admin/usuarios', 'ok', 'Administrador eliminado. Se guardó un respaldo.'));
});

app.get('/admin/ajustes', requireAdmin, (req, res) => {
  const products = db.prepare('SELECT id, name FROM products ORDER BY name').all();
  const settingsTab = ['menu', 'operacion', 'general'].includes(String(req.query.tab || '')) ? String(req.query.tab) : 'menu';
  const welcome = getWelcomeMedia();
  res.render('admin/settings', {
    title: 'Ajustes',
    products,
    settingsTab,
    welcome,
    heroMedia: welcome.find((item) => item.slot === 'hero-banner') || {
      image: '/img/banner-lilys-plays.jpg',
      alt: "Letrero neón de Lily's Plays, Salón Gamer y Bistró",
      is_custom: false,
    },
    welcomeTexts: getWelcomeTexts(),
    menuTexts: getMenuTexts(),
    menuTextMeta: MENU_TEXT_META,
    menuTextGroups: MENU_TEXT_GROUPS,
  });
});

const welcomeUpload = upload.fields(WELCOME_SLOTS.map((item) => ({ name: `${slotKey(item.slot)}_image`, maxCount: 1 })));

app.post('/admin/ajustes/reservas', requireAdmin, welcomeUpload, (req, res) => {
  const current = getSettings();
  const stationSlots = WELCOME_SLOTS.filter((item) => item.group === 'Estaciones');
  for (const item of stationSlots) {
    const base = slotKey(item.slot);
    const file = req.files && req.files[`${base}_image`] ? req.files[`${base}_image`][0] : null;
    const oldImage = current[`${base}_image`] || '';
    if (file) {
      const nextImage = `/uploads/${file.filename}`;
      setSetting(`${base}_image`, nextImage);
      if (oldImage && oldImage !== nextImage) removeUpload(oldImage);
    } else if (req.body[`${base}_remove`] === 'on') {
      if (oldImage) removeUpload(oldImage);
      db.prepare('DELETE FROM settings WHERE key = ?').run(`${base}_image`);
    }
    for (const field of TEXT_FIELDS) {
      const raw = req.body[`${base}_${field}`];
      if (raw === undefined) continue;
      const value = String(raw).trim();
      if (value) setSetting(`${base}_${field}`, value.slice(0, field === 'text' ? 600 : 180));
      else db.prepare('DELETE FROM settings WHERE key = ?').run(`${base}_${field}`);
    }
  }
  for (const key of ['reserve_eyebrow', 'reserve_title', 'reserve_text', 'reserve_cta']) {
    if (req.body[key] !== undefined) setWelcomeText(key, req.body[key]);
  }
  if (req.body.social_whatsapp !== undefined) {
    setSetting('social_whatsapp', String(req.body.social_whatsapp).trim().slice(0, 400));
  }
  if (req.body.reserve_message !== undefined) {
    const message = String(req.body.reserve_message).trim();
    if (message) setSetting('reserve_message', message.slice(0, 300));
    else db.prepare('DELETE FROM settings WHERE key = ?').run('reserve_message');
  }
  return res.redirect(`${flash('/admin/ajustes?tab=menu', 'ok', 'Reservas del menú actualizadas.')}#reservas`);
});

const menuBannerUpload = upload.single('menu_hero_image');

app.post('/admin/ajustes/menu-contenido', requireAdmin, menuBannerUpload, (req, res) => {
  const current = getSettings();
  const oldImage = current.welcome_hero_banner_image || '';
  if (req.file) {
    const nextImage = `/uploads/${req.file.filename}`;
    setSetting('welcome_hero_banner_image', nextImage);
    if (oldImage && oldImage !== nextImage) removeUpload(oldImage);
  } else if (req.body.welcome_hero_banner_remove === 'on') {
    if (oldImage) removeUpload(oldImage);
    db.prepare('DELETE FROM settings WHERE key = ?').run('welcome_hero_banner_image');
  }
  if (req.body.welcome_hero_banner_alt !== undefined) {
    const alt = String(req.body.welcome_hero_banner_alt).trim();
    if (alt) setSetting('welcome_hero_banner_alt', alt.slice(0, 180));
    else db.prepare('DELETE FROM settings WHERE key = ?').run('welcome_hero_banner_alt');
  }
  for (const [key] of MENU_TEXT_META) setMenuText(key, req.body[`text_${key}`]);
  return res.redirect(`${flash('/admin/ajustes?tab=menu', 'ok', 'Banner y textos del menú actualizados.')}#contenido-menu`);
});

app.post('/admin/ajustes', requireAdmin, (req, res) => {
  const body = req.body || {};
  const textKeys = [
    'brand_name', 'brand_sub', 'currency_code', 'currency_symbol', 'currency_symbol_cuc', 'currency_locale', 'currency_locale_cuc',
    'default_station', 'opening_status', 'opening_hours', 'kitchen_hours', 'service_note', 'hero_eyebrow', 'hero_title',
    'hero_text', 'footer_credit', 'qr_public_url', 'social_facebook', 'social_instagram', 'social_whatsapp', 'social_website', 'social_email', 'social_youtube',
  ];
  for (const key of textKeys) {
    if (body[key] !== undefined) {
      setSetting(key, String(body[key]).trim().slice(0, 400));
    }
  }
  if (body.currency_mode !== undefined) {
    const mode = ['USD', 'CUC', 'BOTH'].includes(body.currency_mode) ? body.currency_mode : 'USD';
    setSetting('currency_mode', mode);
  }
  if (body.tax_percent !== undefined) {
    const tax = Math.max(0, Math.min(100, Number(String(body.tax_percent).replace(',', '.')) || 0));
    setSetting('tax_percent', String(tax));
  }
  if (body.default_theme !== undefined) {
    setSetting('default_theme', body.default_theme === 'dark' ? 'dark' : 'light');
  }
  if (body.featured_product_id !== undefined) {
    const id = Number(body.featured_product_id) || 0;
    const exists = id ? db.prepare('SELECT 1 FROM products WHERE id = ?').get(id) : true;
    setSetting('featured_product_id', exists ? String(id) : '');
  }
  const tab = ['menu', 'operacion', 'general'].includes(String(body.tab || '')) ? String(body.tab) : 'menu';
  return res.redirect(flash(`/admin/ajustes?tab=${tab}`, 'ok', 'Ajustes guardados.'));
});

app.post('/admin/password', requireAdmin, (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  const confirm = String(req.body.confirm_password || '');
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(res.locals.adminUser.id);
  if (!user || !verifyPassword(current, user.salt, user.hash)) {
    return res.redirect(flash('/admin/ajustes?tab=general', 'err', 'La contraseña actual no es correcta.'));
  }
  const invalidPassword = passwordError(next);
  if (invalidPassword) return res.redirect(flash('/admin/ajustes?tab=general', 'err', invalidPassword));
  if (next !== confirm) return res.redirect(flash('/admin/ajustes?tab=general', 'err', 'Las contraseñas no coinciden.'));
  const { salt, hash } = hashPassword(next);
  db.prepare('UPDATE admin_users SET salt = ?, hash = ?, must_change_password = 0, session_version = session_version + 1 WHERE id = ?').run(salt, hash, user.id);
  const updated = db.prepare('SELECT id, username, session_version FROM admin_users WHERE id = ?').get(user.id);
  const token = createToken(SECRET, { uid: updated.id, username: updated.username, sv: Number(updated.session_version) || 1 }, SESSION_TTL);
  setAdminCookie(req, res, token);
  return res.redirect(`${flash('/admin/ajustes?tab=general', 'ok', 'Contraseña actualizada.')}#seguridad`);
});

function requestOrigin(req) {
  const proto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim() || req.protocol || 'http';
  const host = String(req.get('x-forwarded-host') || '').split(',')[0].trim() || req.get('host') || '';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function qrBaseUrl(req, settings) {
  const custom = String(settings.qr_public_url || '').trim().replace(/\/+$/, '');
  if (custom) return custom;
  const host = String(req.get('x-forwarded-host') || '').split(',')[0].trim() || String(req.get('host') || '');
  if (!host || /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
    return `http://${getLanIp()}:${PORT}`;
  }
  return requestOrigin(req);
}

function qrTargetUrl(req, settings, station) {
  const base = qrBaseUrl(req, settings);
  const query = station ? `?station=${encodeURIComponent(station)}` : '';
  return `${base}/${query}`;
}

app.get('/admin/qr', requireAdmin, (req, res) => {
  const station = String(req.query.station || '').trim().slice(0, 40);
  const base = qrBaseUrl(req, res.locals.settings);
  const url = qrTargetUrl(req, res.locals.settings, station);
  res.render('admin/qr', { title: 'Código QR', station, base, url });
});

app.get('/admin/qr.png', requireAdmin, async (req, res) => {
  try {
    const station = String(req.query.station || '').trim().slice(0, 40);
    const url = qrTargetUrl(req, res.locals.settings, station);
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 2400,
      margin: 4,
      errorCorrectionLevel: 'H',
      color: { dark: '#0b1220', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/png');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="lilys-plays-qr${station ? `-${station.replace(/[^a-z0-9]/gi, '')}` : ''}.png"`);
    }
    res.send(buffer);
  } catch (err) {
    console.error('QR error:', err);
    res.status(500).send('No se pudo generar el QR.');
  }
});

app.get('/admin/qr.svg', requireAdmin, async (req, res) => {
  try {
    const station = String(req.query.station || '').trim().slice(0, 40);
    const url = qrTargetUrl(req, res.locals.settings, station);
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 4,
      errorCorrectionLevel: 'H',
      color: { dark: '#0b1220', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="lilys-plays-qr${station ? `-${station.replace(/[^a-z0-9]/gi, '')}` : ''}.svg"`);
    }
    res.send(svg);
  } catch (err) {
    console.error('QR SVG error:', err);
    res.status(500).send('No se pudo generar el QR.');
  }
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Página no encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = Number(err.status || err.statusCode) || 500;
  const message = status < 500 ? (err.message || 'Solicitud inválida.') : 'Error interno del servidor.';
  if (req.path.startsWith('/api')) return res.status(status).json({ ok: false, error: message });
  return res.status(status).send(`<div style="font-family:system-ui;padding:24px"><h3>No se pudo completar la acción</h3><p>${String(message).replace(/</g, '&lt;')}</p><a href="javascript:history.back()">Volver</a></div>`);
});

const publicServer = app.listen(PORT, PUBLIC_HOST, () => {
  const ip = getLanIp();
  console.log('');
  console.log("  Lily's Plays · Salón Gamer y Bistró");
  console.log('  ------------------------------------------');
  console.log(`  Menú local:    http://localhost:${PORT}`);
  console.log(`  Menú en LAN:   http://${ip}:${PORT}`);
  console.log(`  Panel:         http://localhost:${ADMIN_PORT}/admin`);
  console.log('  El panel solo acepta conexiones desde esta PC.');
  console.log('');
  setTimeout(() => {
    refreshReports().catch((error) => {
      console.error('No se pudo generar el Excel maestro al iniciar:', error.message);
    });
  }, 1200);
});

const adminServer = app.listen(ADMIN_PORT, ADMIN_HOST, () => {
  if (ADMIN_HOST !== '127.0.0.1' && ADMIN_HOST !== '::1' && ADMIN_HOST !== 'localhost') {
    console.warn(`  Aviso: el panel está escuchando en ${ADMIN_HOST}:${ADMIN_PORT}. Debería ser solo localhost.`);
  }
});

publicServer.on('error', (error) => {
  console.error('No se pudo abrir el menú público:', error.message);
  process.exit(1);
});
adminServer.on('error', (error) => {
  console.error('No se pudo abrir el panel local:', error.message);
  process.exit(1);
});

let closing = 2;
function shutdown() {
  const done = () => {
    closing -= 1;
    if (closing > 0) return;
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  publicServer.close(done);
  adminServer.close(done);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
