function parsePriceToCents(input, currency = 'USD') {
  if (input === null || input === undefined) return 0;
  let s = String(input).trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (currency === 'CUC' && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function normalizeLocale(locale) {
  try {
    new Intl.NumberFormat(locale);
    return locale;
  } catch {
    return 'en-US';
  }
}

function normalizeCurrencyMode(mode) {
  return ['USD', 'CUC', 'BOTH'].includes(mode) ? mode : 'USD';
}

function formatAmount(cents, settings, currencyOverride) {
  const mode = currencyOverride || (normalizeCurrencyMode(settings.currency_mode) === 'CUC' ? 'CUC' : 'USD');
  const isCuc = mode === 'CUC';
  const locale = normalizeLocale(isCuc ? (settings.currency_locale_cuc || 'es-CU') : (settings.currency_locale || 'en-US'));
  const value = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatMoney(cents, settings, currencyOverride) {
  const mode = currencyOverride || (normalizeCurrencyMode(settings.currency_mode) === 'CUC' ? 'CUC' : 'USD');
  const isCuc = mode === 'CUC';
  const symbol = isCuc ? (settings.currency_symbol_cuc || '$') : (settings.currency_symbol || 'US$');
  return `${symbol}${formatAmount(cents, settings, currencyOverride)}`;
}

function formatPrice(product, settings) {
  if (!product) return '';
  const mode = normalizeCurrencyMode(settings.currency_mode);
  const usd = formatMoney(product.price_cents, settings, 'USD');
  const cucCents = Number(product.price_cuc_cents) > 0 ? product.price_cuc_cents : product.price_cents;
  const cuc = formatMoney(cucCents, settings, 'CUC');
  if (mode === 'CUC') return cuc;
  if (mode === 'BOTH') return `${usd} · ${cuc}`;
  return usd;
}

function orderUnitPrice(product, settings) {
  const mode = normalizeCurrencyMode(settings.currency_mode);
  if (mode === 'CUC') return Number(product.price_cuc_cents) || Number(product.price_cents) || 0;
  return Number(product.price_cents) || 0;
}

function orderCurrency(order, settings) {
  const fallback = normalizeCurrencyMode(settings.currency_mode) === 'CUC' ? 'CUC' : 'USD';
  const code = order && order.currency_code === 'CUC' ? 'CUC' : order && order.currency_code === 'USD' ? 'USD' : fallback;
  const symbol = (order && order.currency_symbol)
    || (code === 'CUC' ? settings.currency_symbol_cuc : settings.currency_symbol)
    || (code === 'CUC' ? '$' : 'US$');
  const locale = (order && order.currency_locale)
    || (code === 'CUC' ? settings.currency_locale_cuc : settings.currency_locale)
    || (code === 'CUC' ? 'es-CU' : 'en-US');
  return { code, symbol, locale: normalizeLocale(locale) };
}

function formatOrderAmount(cents, order, settings) {
  const { locale } = orderCurrency(order, settings);
  const value = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatOrderMoney(cents, order, settings) {
  const { symbol } = orderCurrency(order, settings);
  return `${symbol}${formatOrderAmount(cents, order, settings)}`;
}

function formatDate(value) {
  if (!value) return '';
  const normalized = String(value).includes('T') ? value : String(value).replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

function nowLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const STATUS = {
  nuevo: { label: 'Nuevo', tone: 'cyan' },
  preparando: { label: 'Preparando', tone: 'amber' },
  listo: { label: 'Listo', tone: 'violet' },
  entregado: { label: 'Entregado', tone: 'green' },
  cancelado: { label: 'Cancelado', tone: 'red' },
};

function statusMeta(status) {
  return STATUS[status] || { label: status || '—', tone: 'gray' };
}

const PAYMENT_STATUS = {
  pendiente: { label: 'Pago pendiente', tone: 'amber' },
  pagado: { label: 'Pagado', tone: 'green' },
  reembolsado: { label: 'Reembolsado', tone: 'red' },
};

function paymentMeta(status) {
  return PAYMENT_STATUS[status] || { label: status || '—', tone: 'gray' };
}

module.exports = { parsePriceToCents, formatMoney, formatAmount, formatPrice, orderUnitPrice, normalizeCurrencyMode, orderCurrency, formatOrderAmount, formatOrderMoney, formatDate, nowLocal, statusMeta, STATUS, paymentMeta, PAYMENT_STATUS };
