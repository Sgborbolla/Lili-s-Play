const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');

const { db, getSettings, setSetting } = require('./lib/db');
const { formatMoney, formatAmount, formatPrice, orderUnitPrice, parsePriceToCents, formatDate, nowLocal, statusMeta, STATUS } = require('./lib/format');
const { hashPassword, verifyPassword, createToken, verifyToken, parseCookies, serializeCookie } = require('./lib/auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
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
  const user = db.prepare('SELECT id, username, display_name, role, active FROM admin_users WHERE id = ?').get(Number(data.uid));
  if (!user || !user.active) return null;
  return user;
}

app.use((req, res, next) => {
  const settings = getSettings();
  res.locals.settings = settings;
  res.locals.money = (cents, code) => formatMoney(cents, settings, code);
  res.locals.amount = (cents, code) => formatAmount(cents, settings, code);
  res.locals.price = (product) => formatPrice(product, settings);
  res.locals.fmtDate = formatDate;
  res.locals.statusMeta = statusMeta;
  res.locals.STATUS = STATUS;
  res.locals.currentPath = req.path;
  res.locals.adminUser = getSessionUser(req);
  res.locals.lanIp = getLanIp();
  res.locals.port = PORT;
  res.locals.notice = typeof req.query.ok === 'string' ? req.query.ok : '';
  res.locals.warning = typeof req.query.err === 'string' ? req.query.err : '';
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
    price_cents: body.price !== undefined ? parsePriceToCents(body.price) : (existing ? existing.price_cents : 0),
    price_input: priceInput,
    price_cuc_cents: body.price_cuc !== undefined ? parsePriceToCents(body.price_cuc) : (existing ? existing.price_cuc_cents : 0),
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

  res.render('menu', {
    title: "Menú · Lily's Plays",
    categories: grouped,
    featured,
    station,
    stationFromQuery: Boolean(req.query.station),
    productsForJs,
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

app.get('/acerca', (req, res) => {
  return res.render('about', {
    title: "Acerca de Lily's Plays · Salón Gamer y Bistró",
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
    const orderResult = db.prepare('INSERT INTO orders(code, station, customer, note, subtotal_cents, tax_cents, total_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(code, station, customer, note, subtotal, tax, total, 'nuevo', createdAt);
    const orderId = Number(orderResult.lastInsertRowid);
    const insertItem = db.prepare('INSERT INTO order_items(order_id, product_id, name, price_cents, qty) VALUES (?, ?, ?, ?, ?)');
    for (const item of orderItems) insertItem.run(orderId, item.product_id, item.name, item.price_cents, item.qty);
    db.exec('COMMIT');
    started = false;

    return res.json({ ok: true, code, total_cents: total });
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
    defaultUser: 'freeman',
  });
});

app.post('/admin/login', (req, res) => {
  const ip = req.ip || 'local';
  if (loginBlocked(ip)) {
    return res.status(429).render('admin/login', {
      title: 'Ingresar · Panel',
      error: 'Demasiados intentos. Espera 10 minutos e intenta de nuevo.',
      next: safeNext(req.body.next),
      username: String(req.body.username || ''),
      defaultUser: 'freeman',
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
      defaultUser: 'freeman',
    });
  }
  loginAttempts.delete(ip);
  const token = createToken(SECRET, { uid: user.id, username: user.username }, SESSION_TTL);
  res.setHeader('Set-Cookie', serializeCookie(COOKIE, token, { maxAge: SESSION_TTL, sameSite: 'Lax' }));
  return res.redirect(safeNext(req.body.next));
});

app.post('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', serializeCookie(COOKIE, '', { maxAge: 0, sameSite: 'Lax' }));
  res.redirect('/admin/login');
});

app.get('/admin', requireAdmin, (req, res) => {
  const stats = {
    todayOrders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE date(created_at) = date('now','localtime')").get().c,
    pending: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('nuevo','preparando','listo')").get().c,
    todayRevenue: db.prepare("SELECT COALESCE(SUM(total_cents),0) AS s FROM orders WHERE status != 'cancelado' AND date(created_at) = date('now','localtime')").get().s,
    activeProducts: db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get().c,
  };
  const recent = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 6').all();
  res.render('admin/dashboard', { title: 'Resumen', stats, recent });
});

function loadOrdersWithItems(limit = 100) {
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ?').all(limit);
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
  const orderList = loadOrdersWithItems(100);
  res.render('admin/orders', { title: 'Pedidos', orders: orderList });
});

app.post('/admin/pedidos/limpiar', requireAdmin, (req, res) => {
  const total = Number(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c) || 0;
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM order_items').run();
    db.prepare('DELETE FROM orders').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_items')").run();
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('No se pudieron limpiar los pedidos:', error);
    return res.redirect(flash('/admin/pedidos', 'err', 'No se pudieron limpiar los pedidos. Inténtalo de nuevo.'));
  }
  const message = total
    ? `Se eliminaron ${total} ${total === 1 ? 'pedido' : 'pedidos'} y se reiniciaron los resúmenes.`
    : 'No había pedidos para limpiar. Los resúmenes ya están en cero.';
  return res.redirect(flash('/admin/pedidos', 'ok', message));
});

app.post('/admin/pedidos/:id/estado', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status || '');
  if (!STATUS[status]) return res.redirect(flash('/admin/pedidos', 'err', 'Estado no válido.'));
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  return res.redirect(flash('/admin/pedidos', 'ok', `Pedido actualizado a ${STATUS[status].label}.`));
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
  db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
  removeUpload(product.image);
  return res.redirect(flash('/admin/productos', 'ok', 'Producto eliminado.'));
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
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  for (const row of images) removeUpload(row.image);
  return res.redirect(flash('/admin/categorias', 'ok', 'Categoría y sus productos eliminados.'));
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
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    return '';
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
  db.prepare('INSERT INTO admin_users(username, display_name, salt, hash, role, active) VALUES (?, ?, ?, ?, ?, 1)')
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
  if (password && password.length < 6) error = 'La nueva contraseña debe tener al menos 6 caracteres.';
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
    db.prepare('UPDATE admin_users SET display_name = ?, active = ?, salt = ?, hash = ? WHERE id = ?').run(displayName || user.username, active, salt, hash, id);
  } else {
    db.prepare('UPDATE admin_users SET display_name = ?, active = ? WHERE id = ?').run(displayName || user.username, active, id);
  }
  if (isSelf) {
    const token = createToken(SECRET, { uid: user.id, username: user.username }, SESSION_TTL);
    res.setHeader('Set-Cookie', serializeCookie(COOKIE, token, { maxAge: SESSION_TTL, sameSite: 'Lax' }));
  }
  return res.redirect(flash('/admin/usuarios', 'ok', 'Administrador actualizado.'));
});

app.post('/admin/usuarios/:id/eliminar', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (res.locals.adminUser.id === id) return res.redirect(flash('/admin/usuarios', 'err', 'No puedes eliminar tu propia cuenta.'));
  db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  return res.redirect(flash('/admin/usuarios', 'ok', 'Administrador eliminado.'));
});

app.get('/admin/ajustes', requireAdmin, (req, res) => {
  const products = db.prepare('SELECT id, name FROM products ORDER BY name').all();
  res.render('admin/settings', { title: 'Ajustes', products });
});

app.post('/admin/ajustes', requireAdmin, (req, res) => {
  const body = req.body || {};
  const textKeys = [
    'brand_name', 'brand_sub', 'currency_code', 'currency_symbol', 'currency_symbol_cuc', 'currency_locale', 'currency_locale_cuc',
    'default_station', 'opening_status', 'opening_hours', 'kitchen_hours', 'service_note', 'hero_eyebrow', 'hero_title',
    'hero_text', 'footer_credit', 'qr_public_url', 'social_facebook', 'social_instagram', 'social_whatsapp', 'social_website', 'social_email', 'social_youtube',
    'about_eyebrow', 'about_title_primary', 'about_title_accent', 'about_subtitle', 'about_intro',
    'about_story_eyebrow', 'about_story_title', 'about_story_intro', 'about_story_text', 'about_quote',
    'about_future_eyebrow', 'about_future_title', 'about_future_accent', 'about_future_text', 'about_future_platforms',
    'about_map_eyebrow', 'about_map_title', 'about_map_text', 'about_address', 'about_map_caption', 'about_map_url',
  ];
  const longTextKeys = new Set([
    'about_story_text', 'about_intro', 'about_story_intro', 'about_future_text',
    'about_map_text', 'about_address', 'about_quote', 'about_map_url',
  ]);
  for (const key of textKeys) {
    if (body[key] !== undefined) {
      const max = key === 'about_story_text' ? 6000 : longTextKeys.has(key) ? 800 : 400;
      setSetting(key, String(body[key]).trim().slice(0, max));
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
  return res.redirect(flash('/admin/ajustes', 'ok', 'Ajustes guardados.'));
});

app.post('/admin/password', requireAdmin, (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  const confirm = String(req.body.confirm_password || '');
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(res.locals.adminUser.id);
  if (!user || !verifyPassword(current, user.salt, user.hash)) {
    return res.redirect(flash('/admin/ajustes', 'err', 'La contraseña actual no es correcta.'));
  }
  if (next.length < 6) return res.redirect(flash('/admin/ajustes', 'err', 'La nueva contraseña debe tener al menos 6 caracteres.'));
  if (next !== confirm) return res.redirect(flash('/admin/ajustes', 'err', 'Las contraseñas no coinciden.'));
  const { salt, hash } = hashPassword(next);
  db.prepare('UPDATE admin_users SET salt = ?, hash = ? WHERE id = ?').run(salt, hash, user.id);
  return res.redirect(flash('/admin/ajustes', 'ok', 'Contraseña actualizada.'));
});

function qrBaseUrl(settings) {
  const custom = String(settings.qr_public_url || '').trim().replace(/\/+$/, '');
  if (custom) return custom;
  return `http://${getLanIp()}:${PORT}`;
}

function qrTargetUrl(settings, station) {
  const base = qrBaseUrl(settings);
  const query = station ? `?station=${encodeURIComponent(station)}` : '';
  return `${base}/bienvenida.html${query}`;
}

app.get('/admin/qr', requireAdmin, (req, res) => {
  const station = String(req.query.station || '').trim().slice(0, 40);
  const base = qrBaseUrl(res.locals.settings);
  const url = qrTargetUrl(res.locals.settings, station);
  res.render('admin/qr', { title: 'Código QR', station, base, url });
});

app.get('/admin/qr.png', requireAdmin, async (req, res) => {
  try {
    const station = String(req.query.station || '').trim().slice(0, 40);
    const url = qrTargetUrl(res.locals.settings, station);
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
    const url = qrTargetUrl(res.locals.settings, station);
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
  if (req.path.startsWith('/api')) return res.status(400).json({ ok: false, error: err.message || 'Error' });
  return res.status(400).send(`<div style="font-family:system-ui;padding:24px"><h3>No se pudo completar la acción</h3><p>${String(err.message || 'Error').replace(/</g, '&lt;')}</p><a href="javascript:history.back()">Volver</a></div>`);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIp();
  console.log('');
  console.log("  Lily's Plays · Salón Gamer y Bistró");
  console.log('  ------------------------------------------');
  console.log(`  Menú local:    http://localhost:${PORT}`);
  console.log(`  Menú en LAN:   http://${ip}:${PORT}`);
  console.log(`  Panel local:   http://localhost:${PORT}/admin`);
  console.log(`  Panel en LAN:  http://${ip}:${PORT}/admin`);
  console.log('  Usuario inicial: freeman  ·  Contraseña: 12345678');
  console.log('  Cambia la contraseña en Admin > Ajustes.');
  console.log('');
});

function shutdown() {
  server.close(() => {
    try { db.close(); } catch { /* ignore */ }
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
