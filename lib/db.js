const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.LP_DB || path.join(DATA_DIR, 'lilys-plays.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#00a6c9',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  price_cuc_cents INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  station TEXT NOT NULL,
  customer TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'nuevo',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS order_payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  admin_user_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON order_payment_events(order_id, id);
`);

const productColumns = db.prepare('PRAGMA table_info(products)').all();
if (!productColumns.some((column) => column.name === 'price_cuc_cents')) {
  db.exec('ALTER TABLE products ADD COLUMN price_cuc_cents INTEGER NOT NULL DEFAULT 0;');
}
db.exec('UPDATE products SET price_cuc_cents = price_cents WHERE price_cuc_cents = 0;');

const orderColumns = db.prepare('PRAGMA table_info(orders)').all();
const addOrderColumn = (name, definition) => {
  if (!orderColumns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition};`);
  }
};
addOrderColumn('payment_status', "TEXT NOT NULL DEFAULT 'pendiente'");
addOrderColumn('paid_at', "TEXT NOT NULL DEFAULT ''");
addOrderColumn('payment_method', "TEXT NOT NULL DEFAULT ''");
addOrderColumn('refunded_at', "TEXT NOT NULL DEFAULT ''");
addOrderColumn('currency_mode', "TEXT NOT NULL DEFAULT ''");
addOrderColumn('currency_code', "TEXT NOT NULL DEFAULT ''");
addOrderColumn('currency_symbol', "TEXT NOT NULL DEFAULT ''");
addOrderColumn('currency_locale', "TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_status, paid_at);');

const paymentEventsTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'order_payment_events'").get();
if (paymentEventsTable) {
  const paidOrders = db.prepare("SELECT * FROM orders WHERE payment_status IN ('pagado', 'reembolsado')").all();
  const hasEvent = db.prepare('SELECT 1 FROM order_payment_events WHERE order_id = ? AND type = ? LIMIT 1');
  const insertEvent = db.prepare('INSERT INTO order_payment_events(order_id, type, amount_cents, method, note, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const order of paidOrders) {
    if (!hasEvent.get(order.id, 'pago')) {
      insertEvent.run(order.id, 'pago', Number(order.total_cents) || 0, order.payment_method || '', 'Migrado', order.paid_at || order.created_at);
    }
    if (order.payment_status === 'reembolsado' && !hasEvent.get(order.id, 'reembolso')) {
      insertEvent.run(order.id, 'reembolso', -(Number(order.total_cents) || 0), order.payment_method || '', 'Migrado', order.refunded_at || order.paid_at || order.created_at);
    }
  }
}

const DEFAULTS = {
  brand_name: "Lily's Plays",
  brand_sub: 'Salón Gamer y Bistró',
  currency_code: 'USD',
  currency_mode: 'BOTH',
  currency_symbol: 'US$',
  currency_symbol_cuc: '$',
  currency_locale: 'en-US',
  currency_locale_cuc: 'es-CU',
  tax_percent: '0',
  default_station: '14',
  opening_status: 'Abierto hoy',
  opening_hours: '8 am a 8 pm',
  kitchen_hours: 'Cocina abierta de 8 am a 8 pm',
  service_note: 'Entrega directa en tu mando',
  default_theme: 'light',
  hero_eyebrow: 'Combo Jefe Final',
  hero_title: 'Sube de nivel tu sabor',
  hero_text: 'Burger Angus, papas Cybernetic y una poción Quantum Splash. El combo definitivo para tu estación.',
  about_eyebrow: 'Nuestra historia · Palma Soriano',
  about_title_primary: 'MÁS QUE',
  about_title_accent: 'UNA PARTIDA.',
  about_subtitle: "Acerca de Lily's Plays",
  about_intro: "Lily's Plays nació con una idea sencilla: reunir en un mismo lugar los videojuegos, la buena comida y la compañía de siempre. Un salón gamer y bistró donde cada visita se disfruta a su manera.",
  about_story_eyebrow: "Acerca de Lily's Plays",
  about_story_title: 'Un lugar para jugar, compartir y sentirte en casa.',
  about_story_intro: "Más que una estación de juego, queremos que Lily's Plays sea ese punto de encuentro al que siempre dan ganas de volver.",
  about_story_text: "Lily's Plays nació en Palma Soriano con una idea sencilla: reunir en un mismo espacio los videojuegos, la buena comida y la compañía de siempre. Un salón gamer y bistró pensado para quienes crecieron con un mando en las manos y para quienes descubren la diversión por primera vez.\n\nEn nuestras consolas conviven varias generaciones: desde los clásicos que despiertan recuerdos hasta las partidas que siguen escribiendo historias nuevas. Aquí puedes venir a jugar, retar a tus amigos, celebrar una tarde especial, disfrutar de un combo o simplemente sentarte a compartir mientras la pantalla se llena de momentos.\n\nCreemos que jugar es mucho más que ganar. Es reírse de una derrota, celebrar una remontada, conocer gente nueva y guardar una anécdota para contar después. Por eso cuidamos cada detalle: el ambiente, la atención, la comida y, sobre todo, la forma en que te recibimos.\n\nLily's Plays es un proyecto hecho con cariño en Palma Soriano. Un salón gamer y bistró donde cada visita tiene su propio ritmo: una partida rápida, una tarde entre amigos o una noche que se alarga porque nadie quiere que termine.",
  about_quote: "Del Family a la PS4. Si tuviste un mando en las manos, en Lily's Plays tienes un lugar.",
  about_future_eyebrow: 'Lo que viene',
  about_future_title: 'PS5, XBOX',
  about_future_accent: 'Y PC. MUY PRONTO.',
  about_future_text: 'Estamos ampliando la zona gamer para que más personas puedan jugar al mismo tiempo. Muy pronto sumaremos PS5, Xbox y PC: más consolas, más juegos y más espacio para compartir.',
  about_future_platforms: 'PS5, XBOX, PC',
  about_map_eyebrow: 'Visítanos',
  about_map_title: 'Estamos en el corazón de Palma Soriano.',
  about_map_text: 'Ven con tus amigos, con tu pareja, con tu familia o con las ganas de jugar. Nos encontrarás en la Calle Agramonte, entre 1ro de Mayo y Maceo.',
  about_address: 'Calle Agramonte, entre 1ro de Mayo y Maceo\nPalma Soriano, Santiago de Cuba.',
  about_map_caption: "Ubicación referencial · Lily's Plays / Freeman y Diseños",
  about_map_url: 'https://www.google.com/maps/search/?api=1&query=20.21443%2C-75.99887',
  featured_product_id: '',
  footer_credit: 'Creado y Diseñado por QBASwing Designer y Freeman y Diseños © 2026. Todos los derechos reservados.',
  qr_public_url: '',
  social_facebook: '',
  social_instagram: '',
  social_whatsapp: 'https://wa.me/5352740665',
  social_website: '',
  social_email: '',
  social_youtube: '',
  seeded: '0',
};

const seedCategories = [
  {
    name: 'Combos Legendarios',
    subtitle: 'Combustible gamer para sesiones intensas',
    icon: '🎮',
    accent: '#00a6c9',
    products: [
      { name: 'Combo Jefe Final', image: '/img/menu/burger-jefe.webp', description: "Lily's Double Smash de res Angus con cheddar fundido + papas Cybernetic sazonadas + Poción Energética Quantum Splash.", price: 1499, badge: '+1 Hora gratis', tag: 'Edición PS4', emoji: '🍔' },
      { name: 'Combo Solo Q', image: '/img/menu/burger-solo.webp', description: 'Hamburguesa clásica + papas rústicas + bebida energética. Ideal para ranked en solitario.', price: 1250, badge: '+100 XP', tag: '1 jugador', emoji: '🕹️' },
      { name: 'Duo Queue Pack', image: '/img/menu/pizza-duo.webp', description: 'Dos hamburguesas + papas grandes + 2 pociones para la dupla. Sin pausas entre partidas.', price: 2200, badge: '+180 XP', tag: '2 jugadores', emoji: '👾' },
      { name: 'Loot Box Snacks', image: '/img/menu/snacks-loot.webp', description: 'Alitas, aros de cebolla, bastones de mozzarella y papas. La caja sorpresa para compartir.', price: 1100, badge: '+90 XP', tag: 'Para compartir', emoji: '🍟' },
    ],
  },
  {
    name: 'PlayStation Hub',
    subtitle: 'Combos Pro optimizados para DualShock 4',
    icon: '△',
    accent: '#006FCD',
    products: [
      { name: 'God of War: Ragnarök Smash', image: '/img/menu/burger-god.webp', description: 'Hamburguesa smash con pan brioche negro, cheddar curado, tocino nórdico crujiente + papas con paprika.', price: 1250, badge: '+120 XP', tag: 'Res Angus 180g', emoji: '🍔' },
      { name: 'Snack DualShock Haptic Astro', image: '/img/menu/snack-dualshock.webp', description: 'Bocaditos de pollo crocantes con toque cítrico, aros de cebolla y bastones de mozzarella con salsas.', price: 1100, badge: '+100 XP', tag: '3 dips incluidos', emoji: '🍗' },
      { name: 'Spider-Smash Nueva York', image: '/img/menu/burger-spider.webp', description: 'Doble smash de res Angus, queso gouda ahumado, cebolla al bourbon y salsa especial roja.', price: 1099, badge: '+140 XP', tag: 'Doble Angus', emoji: '🍔' },
    ],
  },
  {
    name: 'Rincón Xbox & Game Pass',
    subtitle: 'Snacks calibrados para maratones multijugador',
    icon: '◉',
    accent: '#107C10',
    products: [
      { name: 'Master Chief Spartan Dog XXL', image: '/img/menu/hotdog-masterchief.webp', description: 'Salchicha jumbo ahumada a la leña, cebolla crocante, bacon y aderezo verde de guacamole-jalapeño.', price: 850, badge: '+90 XP', tag: 'Jumbo ahumado', emoji: '🌭' },
      { name: 'Papas Rejilla Halo Overcharge', image: '/img/menu/fries-halo.webp', description: 'Papas waffle súper crujientes con especias ahumadas y dip cremoso de cheddar y hierbas.', price: 650, badge: '+80 XP', tag: 'Waffle crunch', emoji: '🍟' },
      { name: 'Popcorn Chicken Forza Drift', image: '/img/menu/popcorn-forza.webp', description: 'Bocaditos crocantes de pechuga marinada con rebozado seco que no deja residuos en el mando.', price: 750, badge: '+70 XP', tag: 'Cero residuos', emoji: '🍗' },
    ],
  },
  {
    name: 'Nintendo Corner',
    subtitle: 'Dúo & fiesta para compartir',
    icon: '◐',
    accent: '#FF3C28',
    products: [
      { name: 'Pizzas Smash Dúo Party', image: '/img/menu/pizza-smash.webp', description: '2 pizzas individuales de pepperoni artesanal + nachos con queso fundido + 2 malteadas.', price: 2200, badge: '+180 XP', tag: 'Para compartir', emoji: '🍕' },
      { name: 'Super Star Quesadillas Power-Up', image: '/img/menu/quesadilla-star.webp', description: 'Tortilla dorada sin grasa con queso gouda fundido y carne mechada, corte limpio para Joy-Con.', price: 800, badge: '+110 XP', tag: 'Corte limpio', emoji: '🌮' },
      { name: 'Tazón Vegano Hyrule Harvest', image: '/img/menu/bowl-hyrule.webp', description: 'Quinoa tricolor, aguacate, edamames, tofu teriyaki y sésamo tostado con jengibre.', price: 950, badge: '+100 XP', tag: '100% botánico', emoji: '🥗' },
    ],
  },
  {
    name: 'Pociones & Elixires',
    subtitle: 'Recarga de maná, vida y enfoque mental',
    icon: '⚗',
    accent: '#8a2be2',
    products: [
      { name: 'Poción de Maná Zelda Azul', image: '/img/menu/potion-mana.webp', description: 'Mocktail brillante con curaçao azul sin alcohol, mora silvestre, limón y tónica con glitter comestible.', price: 550, badge: 'MANÁ +80', tag: 'Mocktail', emoji: '🧪' },
      { name: 'Elixir Estamina Pokémon', image: '/img/menu/elixir-estamina.webp', description: 'Fresa silvestre, arándanos rojos macerados, sandía refrescante y destellos dorados comestibles.', price: 550, badge: 'VIDA +100', tag: 'Fresa & arándano', emoji: '🧪' },
      { name: 'Nitro Brew Cyberpunk', image: '/img/menu/nitro-brew.webp', description: 'Cold brew infusionado con nitrógeno, vainilla de Madagascar y doble espresso para reflejos al 100%.', price: 600, badge: '200MG CAFEÍNA', tag: 'Cold brew', emoji: '☕' },
      { name: 'Té Boba Chispa de Lily', image: '/img/menu/tea-boba.webp', description: 'Matcha ceremonial helado con perlas de tapioca negra y popping boba de maracuyá.', price: 650, badge: 'MATCHA + BOBA', tag: 'Perlas de tapioca', emoji: '🧋' },
    ],
  },
  {
    name: 'Dulces, Postres & Sweet Respawn',
    subtitle: 'Bonus stage dulce para cerrar la partida',
    icon: '🍰',
    accent: '#ff4a8d',
    products: [
      { name: 'Waffle Triforce Hyliano', image: '/img/menu/waffle-triforce.webp', description: 'Waffle dorado crujiente en forma de Trifuerza con helado de vainilla, miel silvestre y chispas doradas.', price: 750, badge: '+50 XP', tag: 'Legend of Zelda', emoji: '🧇' },
      { name: 'Cheesecake Portal 2', image: '/img/menu/cheesecake-portal.webp', description: 'Tarta mitad fresa neón y mitad arándano azul con diseño de portales interconectados. The cake is real.', price: 800, badge: '+50 XP', tag: 'The cake is real', emoji: '🍰' },
      { name: 'Brownie Netherite Minecraft', image: '/img/menu/brownie-netherite.webp', description: 'Brownie de chocolate belga 70% con cubos de fudge y salsa de lava de caramelo salado caliente.', price: 650, badge: '+50 XP', tag: 'Chocolate 70%', emoji: '🍫' },
      { name: 'Sundae Kirby Dream Land', image: '/img/menu/sundae-kirby.webp', description: 'Helado de fresa y algodón de azúcar, mochi rosado, estrellitas crocantes y nata. Edición rosa.', price: 600, badge: '+50 XP', tag: 'Edición rosa', emoji: '🍨' },
    ],
  },
];

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULTS };
  for (const row of rows) s[row.key] = row.value;
  return s;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(String(key), String(value ?? ''));
}

function backfillOrderCurrency() {
  const settings = getSettings();
  const mode = ['USD', 'CUC', 'BOTH'].includes(settings.currency_mode) ? settings.currency_mode : 'USD';
  const code = mode === 'CUC' ? 'CUC' : 'USD';
  const symbol = code === 'CUC' ? (settings.currency_symbol_cuc || '$') : (settings.currency_symbol || 'US$');
  const locale = code === 'CUC' ? (settings.currency_locale_cuc || 'es-CU') : (settings.currency_locale || 'en-US');
  db.prepare(`
    UPDATE orders
    SET currency_mode = ?, currency_code = ?, currency_symbol = ?, currency_locale = ?
    WHERE currency_mode = '' OR currency_code = '' OR currency_symbol = '' OR currency_locale = ''
  `).run(mode, code, symbol, locale);
}

function seedIfNeeded() {
  const settings = getSettings();
  if (settings.seeded === '1') return;

  const insertCategory = db.prepare('INSERT INTO categories(name, subtitle, icon, accent, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)');
  const insertProduct = db.prepare('INSERT INTO products(category_id, name, description, price_cents, price_cuc_cents, image, emoji, badge, tag, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)');

  db.exec('BEGIN');
  try {
    let catOrder = 0;
    let featuredId = null;
    for (const cat of seedCategories) {
      const catResult = insertCategory.run(cat.name, cat.subtitle, cat.icon, cat.accent, catOrder++);
      const catId = Number(catResult.lastInsertRowid);
      let prodOrder = 0;
      for (const p of cat.products) {
        const prodResult = insertProduct.run(catId, p.name, p.description, p.price, p.price_cuc_cents ?? p.price, p.image || '', p.emoji, p.badge, p.tag, prodOrder++);
        if (!featuredId) featuredId = Number(prodResult.lastInsertRowid);
      }
    }

    setSetting('featured_product_id', String(featuredId || ''));
    setSetting('seeded', '1');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function ensureDefaultAdmin() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get();
  if (Number(row.c) === 0) {
    const { salt, hash } = hashPassword('12345678');
    db.prepare('INSERT INTO admin_users(username, display_name, salt, hash, role, active) VALUES (?, ?, ?, ?, ?, 1)')
      .run('freeman', 'Freeman', salt, hash, 'admin');
  }
}

backfillOrderCurrency();
seedIfNeeded();
ensureDefaultAdmin();

module.exports = { db, getSettings, setSetting, DEFAULTS, DB_PATH };
