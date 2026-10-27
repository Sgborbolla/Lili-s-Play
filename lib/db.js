const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.LP_DB || path.join(DATA_DIR, 'lilis.db');

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
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
`);

const productColumns = db.prepare('PRAGMA table_info(products)').all();
if (!productColumns.some((column) => column.name === 'price_cuc_cents')) {
  db.exec('ALTER TABLE products ADD COLUMN price_cuc_cents INTEGER NOT NULL DEFAULT 0;');
}
db.exec('UPDATE products SET price_cuc_cents = price_cents WHERE price_cuc_cents = 0;');

const DEFAULTS = {
  brand_name: "Lili's Play",
  brand_sub: 'Salón Gamer y Bistró',
  currency_code: 'USD',
  currency_mode: 'BOTH',
  currency_symbol: 'US$',
  currency_symbol_cuc: 'CUC$',
  currency_locale: 'en-US',
  currency_locale_cuc: 'es-CU',
  tax_percent: '0',
  default_station: '14',
  kitchen_hours: 'Cocina abierta hasta las 04:00',
  service_note: 'Entrega directa en tu mando',
  default_theme: 'light',
  hero_eyebrow: 'Combo Jefe Final',
  hero_title: 'Sube de nivel tu sabor',
  hero_text: 'Burger Angus, papas Cybernetic y una poción Quantum Splash. El combo definitivo para tu estación.',
  featured_product_id: '',
  footer_credit: 'Creado y Diseñado por QBASwing Designer y Freeman y Diseños © 2026. Todos los derechos reservados.',
  qr_public_url: '',
  social_facebook: '',
  social_instagram: '',
  social_whatsapp: '',
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
      { name: 'Combo Jefe Final', description: "Lili's Double Smash de res Angus con cheddar fundido + papas Cybernetic sazonadas + Poción Energética Quantum Splash.", price: 1499, badge: '+1 Hora gratis', tag: 'Edición PS4', emoji: '🍔' },
      { name: 'Combo Solo Q', description: 'Hamburguesa clásica + papas rústicas + bebida energética. Ideal para ranked en solitario.', price: 1250, badge: '+100 XP', tag: '1 jugador', emoji: '🕹️' },
      { name: 'Duo Queue Pack', description: 'Dos hamburguesas + papas grandes + 2 pociones para la dupla. Sin pausas entre partidas.', price: 2200, badge: '+180 XP', tag: '2 jugadores', emoji: '👾' },
      { name: 'Loot Box Snacks', description: 'Alitas, aros de cebolla, bastones de mozzarella y papas. La caja sorpresa para compartir.', price: 1100, badge: '+90 XP', tag: 'Para compartir', emoji: '🍟' },
    ],
  },
  {
    name: 'PlayStation Hub',
    subtitle: 'Combos Pro optimizados para DualShock 4',
    icon: '△',
    accent: '#006FCD',
    products: [
      { name: 'God of War: Ragnarök Smash', description: 'Hamburguesa smash con pan brioche negro, cheddar curado, tocino nórdico crujiente + papas con paprika.', price: 1250, badge: '+120 XP', tag: 'Res Angus 180g', emoji: '🍔' },
      { name: 'Snack DualShock Haptic Astro', description: 'Bocaditos de pollo crocantes con toque cítrico, aros de cebolla y bastones de mozzarella con salsas.', price: 1100, badge: '+100 XP', tag: '3 dips incluidos', emoji: '🍗' },
      { name: 'Spider-Smash Nueva York', description: 'Doble smash de res Angus, queso gouda ahumado, cebolla al bourbon y salsa especial roja.', price: 1099, badge: '+140 XP', tag: 'Doble Angus', emoji: '🍔' },
    ],
  },
  {
    name: 'Rincón Xbox & Game Pass',
    subtitle: 'Snacks calibrados para maratones multijugador',
    icon: '◉',
    accent: '#107C10',
    products: [
      { name: 'Master Chief Spartan Dog XXL', description: 'Salchicha jumbo ahumada a la leña, cebolla crocante, bacon y aderezo verde de guacamole-jalapeño.', price: 850, badge: '+90 XP', tag: 'Jumbo ahumado', emoji: '🌭' },
      { name: 'Papas Rejilla Halo Overcharge', description: 'Papas waffle súper crujientes con especias ahumadas y dip cremoso de cheddar y hierbas.', price: 650, badge: '+80 XP', tag: 'Waffle crunch', emoji: '🍟' },
      { name: 'Popcorn Chicken Forza Drift', description: 'Bocaditos crocantes de pechuga marinada con rebozado seco que no deja residuos en el mando.', price: 750, badge: '+70 XP', tag: 'Cero residuos', emoji: '🍗' },
    ],
  },
  {
    name: 'Nintendo Corner',
    subtitle: 'Dúo & fiesta para compartir',
    icon: '◐',
    accent: '#FF3C28',
    products: [
      { name: 'Pizzas Smash Dúo Party', description: '2 pizzas individuales de pepperoni artesanal + nachos con queso fundido + 2 malteadas.', price: 2200, badge: '+180 XP', tag: 'Para compartir', emoji: '🍕' },
      { name: 'Super Star Quesadillas Power-Up', description: 'Tortilla dorada sin grasa con queso gouda fundido y carne mechada, corte limpio para Joy-Con.', price: 800, badge: '+110 XP', tag: 'Corte limpio', emoji: '🌮' },
      { name: 'Tazón Vegano Hyrule Harvest', description: 'Quinoa tricolor, aguacate, edamames, tofu teriyaki y sésamo tostado con jengibre.', price: 950, badge: '+100 XP', tag: '100% botánico', emoji: '🥗' },
    ],
  },
  {
    name: 'Pociones & Elixires',
    subtitle: 'Recarga de maná, vida y enfoque mental',
    icon: '⚗',
    accent: '#8a2be2',
    products: [
      { name: 'Poción de Maná Zelda Azul', description: 'Mocktail brillante con curaçao azul sin alcohol, mora silvestre, limón y tónica con glitter comestible.', price: 550, badge: 'MANÁ +80', tag: 'Mocktail', emoji: '🧪' },
      { name: 'Elixir Estamina Pokémon', description: 'Fresa silvestre, arándanos rojos macerados, sandía refrescante y destellos dorados comestibles.', price: 550, badge: 'VIDA +100', tag: 'Fresa & arándano', emoji: '🧪' },
      { name: 'Nitro Brew Cyberpunk', description: 'Cold brew infusionado con nitrógeno, vainilla de Madagascar y doble espresso para reflejos al 100%.', price: 600, badge: '200MG CAFEÍNA', tag: 'Cold brew', emoji: '☕' },
      { name: 'Té Boba Chispa de Lili', description: 'Matcha ceremonial helado con perlas de tapioca negra y popping boba de maracuyá.', price: 650, badge: 'MATCHA + BOBA', tag: 'Perlas de tapioca', emoji: '🧋' },
    ],
  },
  {
    name: 'Dulces, Postres & Sweet Respawn',
    subtitle: 'Bonus stage dulce para cerrar la partida',
    icon: '🍰',
    accent: '#ff4a8d',
    products: [
      { name: 'Waffle Triforce Hyliano', description: 'Waffle dorado crujiente en forma de Trifuerza con helado de vainilla, miel silvestre y chispas doradas.', price: 750, badge: '+50 XP', tag: 'Legend of Zelda', emoji: '🧇' },
      { name: 'Cheesecake Portal 2', description: 'Tarta mitad fresa neón y mitad arándano azul con diseño de portales interconectados. The cake is real.', price: 800, badge: '+50 XP', tag: 'The cake is real', emoji: '🍰' },
      { name: 'Brownie Netherite Minecraft', description: 'Brownie de chocolate belga 70% con cubos de fudge y salsa de lava de caramelo salado caliente.', price: 650, badge: '+50 XP', tag: 'Chocolate 70%', emoji: '🍫' },
      { name: 'Sundae Kirby Dream Land', description: 'Helado de fresa y algodón de azúcar, mochi rosado, estrellitas crocantes y nata. Edición rosa.', price: 600, badge: '+50 XP', tag: 'Edición rosa', emoji: '🍨' },
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
        const prodResult = insertProduct.run(catId, p.name, p.description, p.price, p.price_cuc_cents ?? p.price, '', p.emoji, p.badge, p.tag, prodOrder++);
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

seedIfNeeded();
ensureDefaultAdmin();

module.exports = { db, getSettings, setSetting, DEFAULTS, DB_PATH };
