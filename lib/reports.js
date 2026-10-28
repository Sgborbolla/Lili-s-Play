const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { db, getSettings } = require('./db');
const { nowLocal } = require('./format');

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'Reportes');
const BACKUP_DIR = path.join(REPORTS_DIR, 'Respaldos');
const EXCEL_PATH = path.join(REPORTS_DIR, 'pedidos-maestro.xlsx');
const JSON_PATH = path.join(REPORTS_DIR, 'pedidos-maestro.json');
const PYTHON_SCRIPT = path.join(ROOT, 'scripts', 'build_reports.py');

function ensureDirs() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
ensureDirs();

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateStamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function parseLocal(value) {
  if (!value) return null;
  const text = String(value);
  const d = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateOnly(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeOnly(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const shortDate = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' });
const longMonth = new Intl.DateTimeFormat('es', { month: 'long' });

function weekInfo(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const key = dateOnly(start);
  const label = `${shortDate.format(start)} – ${shortDate.format(end)} ${end.getFullYear()}`;
  return { key, label, start: dateOnly(start), end: dateOnly(end) };
}

function monthInfo(d) {
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const raw = longMonth.format(d);
  const label = `${raw.charAt(0).toUpperCase()}${raw.slice(1)} ${d.getFullYear()}`;
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { key, label, start: dateOnly(start), end: dateOnly(end) };
}

function yearInfo(d) {
  const key = String(d.getFullYear());
  return { key, label: key, start: `${key}-01-01`, end: `${key}-12-31` };
}

function bucketInfo(type, d) {
  if (type === 'semanal') return weekInfo(d);
  if (type === 'mensual') return monthInfo(d);
  return yearInfo(d);
}

function paymentEvents(orders) {
  const events = [];
  for (const order of orders) {
    const paid = parseLocal(order.paid_at) || parseLocal(order.created_at);
    if (paid && (order.payment_status === 'pagado' || order.payment_status === 'reembolsado')) {
      events.push({
        timestamp: order.paid_at || order.created_at,
        date: dateOnly(paid),
        time: timeOnly(paid),
        code: order.code,
        type: 'Pago',
        method: order.payment_method || '—',
        amount_cents: Number(order.total_cents) || 0,
      });
    }
    if (order.payment_status === 'reembolsado' && order.refunded_at) {
      const refunded = parseLocal(order.refunded_at);
      if (refunded) {
        events.push({
          timestamp: order.refunded_at,
          date: dateOnly(refunded),
          time: timeOnly(refunded),
          code: order.code,
          type: 'Reembolso',
          method: order.payment_method || '—',
          amount_cents: -(Number(order.total_cents) || 0),
        });
      }
    }
  }
  return events.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

function buildPeriods(type, orders, itemsByOrder, events) {
  const buckets = new Map();
  const bucket = (d) => {
    const info = bucketInfo(type, d);
    if (!buckets.has(info.key)) {
      buckets.set(info.key, {
        ...info,
        orders: 0,
        units: 0,
        order_revenue_cents: 0,
        income_cents: 0,
        payments_cents: 0,
        refund_cents: 0,
      });
    }
    return buckets.get(info.key);
  };

  for (const order of orders) {
    if (order.payment_status !== 'pagado') continue;
    const d = parseLocal(order.paid_at) || parseLocal(order.created_at);
    if (!d) continue;
    const target = bucket(d);
    target.orders += 1;
    target.order_revenue_cents += Number(order.total_cents) || 0;
    for (const item of itemsByOrder.get(order.id) || []) target.units += Number(item.qty) || 0;
  }

  for (const event of events) {
    const d = parseLocal(event.timestamp);
    if (!d) continue;
    const target = bucket(d);
    target.income_cents += event.amount_cents;
    if (event.type === 'Pago') target.payments_cents += event.amount_cents;
    else target.refund_cents += Math.abs(event.amount_cents);
  }

  return Array.from(buckets.values())
    .map((row) => ({
      ...row,
      ticket_cents: row.orders ? Math.round(row.order_revenue_cents / row.orders) : 0,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function buildReportData() {
  const settings = getSettings();
  const sourceOrders = db.prepare(`
    SELECT * FROM orders
    WHERE payment_status IN ('pagado', 'reembolsado')
    ORDER BY COALESCE(NULLIF(paid_at, ''), created_at), id
  `).all();

  const orderIds = sourceOrders.map((order) => order.id);
  const itemsByOrder = new Map();
  if (orderIds.length) {
    const placeholders = orderIds.map(() => '?').join(',');
    const items = db.prepare(`
      SELECT oi.*, c.name AS category_name
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE oi.order_id IN (${placeholders})
      ORDER BY oi.id
    `).all(...orderIds);
    for (const item of items) {
      if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
      itemsByOrder.get(item.order_id).push({
        name: item.name,
        category: item.category_name || 'Sin categoría',
        qty: Number(item.qty) || 0,
        price_cents: Number(item.price_cents) || 0,
        line_cents: (Number(item.price_cents) || 0) * (Number(item.qty) || 0),
      });
    }
  }

  const paidOrders = sourceOrders.filter((order) => order.payment_status === 'pagado');
  const events = paymentEvents(sourceOrders);
  const activeOrderIds = new Set(paidOrders.map((order) => order.id));

  const productMap = new Map();
  const categoryMap = new Map();
  for (const order of paidOrders) {
    for (const item of itemsByOrder.get(order.id) || []) {
      const pKey = item.name;
      if (!productMap.has(pKey)) productMap.set(pKey, { name: item.name, category: item.category, qty: 0, revenue_cents: 0 });
      const p = productMap.get(pKey);
      p.qty += item.qty;
      p.revenue_cents += item.line_cents;

      const cKey = item.category;
      if (!categoryMap.has(cKey)) categoryMap.set(cKey, { name: item.category, qty: 0, revenue_cents: 0 });
      const c = categoryMap.get(cKey);
      c.qty += item.qty;
      c.revenue_cents += item.line_cents;
    }
  }

  const products = Array.from(productMap.values()).sort((a, b) => b.revenue_cents - a.revenue_cents || b.qty - a.qty || a.name.localeCompare(b.name));
  const categories = Array.from(categoryMap.values()).sort((a, b) => b.revenue_cents - a.revenue_cents || a.name.localeCompare(b.name));

  const summary = {
    income_cents: events.reduce((sum, event) => sum + event.amount_cents, 0),
    payments_cents: events.filter((event) => event.type === 'Pago').reduce((sum, event) => sum + event.amount_cents, 0),
    refund_cents: events.filter((event) => event.type === 'Reembolso').reduce((sum, event) => sum + Math.abs(event.amount_cents), 0),
    orders: paidOrders.length,
    units: products.reduce((sum, product) => sum + product.qty, 0),
    order_revenue_cents: paidOrders.reduce((sum, order) => sum + (Number(order.total_cents) || 0), 0),
    top_product: products[0]?.name || '—',
  };
  summary.ticket_cents = summary.orders ? Math.round(summary.order_revenue_cents / summary.orders) : 0;

  const periods = {
    semanal: buildPeriods('semanal', paidOrders, itemsByOrder, events),
    mensual: buildPeriods('mensual', paidOrders, itemsByOrder, events),
    anual: buildPeriods('anual', paidOrders, itemsByOrder, events),
  };

  const productPeriods = [];
  for (const type of ['semanal', 'mensual', 'anual']) {
    const grouped = new Map();
    for (const order of paidOrders) {
      if (!activeOrderIds.has(order.id)) continue;
      const d = parseLocal(order.paid_at) || parseLocal(order.created_at);
      if (!d) continue;
      const info = bucketInfo(type, d);
      for (const item of itemsByOrder.get(order.id) || []) {
        const key = `${info.key}\u0000${item.name}`;
        if (!grouped.has(key)) grouped.set(key, { type, period_key: info.key, period_label: info.label, product: item.name, qty: 0, revenue_cents: 0 });
        const row = grouped.get(key);
        row.qty += item.qty;
        row.revenue_cents += item.line_cents;
      }
    }
    productPeriods.push(...Array.from(grouped.values()));
  }
  productPeriods.sort((a, b) => {
    const typeOrder = { semanal: 0, mensual: 1, anual: 2 };
    return typeOrder[a.type] - typeOrder[b.type] || a.period_key.localeCompare(b.period_key) || b.revenue_cents - a.revenue_cents;
  });

  const orders = sourceOrders.map((order) => ({
    id: order.id,
    code: order.code,
    created_at: order.created_at,
    paid_at: order.paid_at || order.created_at,
    payment_status: order.payment_status,
    payment_method: order.payment_method || '—',
    refunded_at: order.refunded_at || '',
    status: order.status,
    station: order.station,
    customer: order.customer || '',
    note: order.note || '',
    subtotal_cents: Number(order.subtotal_cents) || 0,
    tax_cents: Number(order.tax_cents) || 0,
    total_cents: Number(order.total_cents) || 0,
    items: (itemsByOrder.get(order.id) || []).map((item) => ({ ...item })),
  }));

  const currencySymbol = (settings.currency_mode === 'CUC' ? settings.currency_symbol_cuc : settings.currency_symbol) || 'US$';
  return {
    version: 1,
    generated_at: nowLocal(),
    business: {
      name: settings.brand_name || "Lily's Plays",
      subtitle: settings.brand_sub || 'Salón Gamer y Bistró',
      footer: settings.footer_credit || '',
    },
    currency: {
      code: settings.currency_mode === 'CUC' ? 'CUC' : 'USD',
      symbol: currencySymbol,
      locale: settings.currency_mode === 'CUC' ? settings.currency_locale_cuc : settings.currency_locale,
    },
    summary,
    orders,
    products,
    categories,
    periods,
    product_periods: productPeriods,
    payments: events,
    paths: {
      logo: path.join(ROOT, 'public', 'logo-icon.png'),
    },
  };
}

function pruneBackups(limit = 30) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith('.xlsx') || name.endsWith('.json'))
      .map((name) => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (const file of files.slice(limit)) fs.unlinkSync(path.join(BACKUP_DIR, file.name));
  } catch (error) {
    console.error('No se pudieron limpiar respaldos:', error.message);
  }
}

function backupExisting() {
  const stamp = dateStamp();
  for (const [source, base] of [[EXCEL_PATH, 'pedidos-maestro'], [JSON_PATH, 'pedidos-maestro']]) {
    if (!fs.existsSync(source)) continue;
    const ext = path.extname(source);
    fs.copyFileSync(source, path.join(BACKUP_DIR, `${base}-${stamp}${ext}`));
  }
  pruneBackups(30);
}

function writeJson(data) {
  const temp = `${JSON_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temp, JSON_PATH);
}

function runPythonReport(inputPath, outputPath) {
  const helper = process.env.LP_REPORT_HELPER;
  const python = process.env.LP_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const command = helper || python;
  const args = helper ? [inputPath, outputPath] : [PYTHON_SCRIPT, inputPath, outputPath];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => reject(new Error(`No se pudo ejecutar Python: ${error.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `El generador de Excel terminó con código ${code}.`));
    });
  });
}

async function generateReports() {
  ensureDirs();
  const data = buildReportData();
  backupExisting();
  writeJson(data);

  const inputPath = path.join(REPORTS_DIR, '.report-data.json');
  const outputPath = path.join(REPORTS_DIR, '.pedidos-maestro.tmp.xlsx');
  fs.writeFileSync(inputPath, JSON.stringify(data), 'utf8');
  let excelError = '';
  try {
    fs.rmSync(outputPath, { force: true });
    await runPythonReport(inputPath, outputPath);
    fs.renameSync(outputPath, EXCEL_PATH);
  } catch (error) {
    excelError = error.message;
    console.error('No se pudo generar el Excel maestro:', error.message);
  } finally {
    fs.rmSync(inputPath, { force: true });
    fs.rmSync(outputPath, { force: true });
  }
  return {
    generated_at: data.generated_at,
    data,
    excel_ok: !excelError,
    excel_error: excelError,
    excel_path: EXCEL_PATH,
    json_path: JSON_PATH,
  };
}

let chain = Promise.resolve();
function refreshReports() {
  const run = chain.then(() => generateReports());
  chain = run.catch(() => {});
  return run;
}

function getReportStatus() {
  const stat = (file) => {
    try {
      const info = fs.statSync(file);
      return { exists: true, modified: info.mtime, size: info.size };
    } catch {
      return { exists: false, modified: null, size: 0 };
    }
  };
  return {
    reportsDir: REPORTS_DIR,
    excelPath: EXCEL_PATH,
    jsonPath: JSON_PATH,
    excel: stat(EXCEL_PATH),
    json: stat(JSON_PATH),
  };
}

module.exports = {
  REPORTS_DIR,
  BACKUP_DIR,
  EXCEL_PATH,
  JSON_PATH,
  buildReportData,
  generateReports,
  refreshReports,
  getReportStatus,
};
