const { getSettings, setSetting, db } = require('./db');

const MENU_TEXTS = {
  station_label: 'Estación',
  hero_badge: '● En vivo en sala',
  hero_cta: 'Ver la carta completa',
  featured_add: 'Agregar al pedido',
  category_eyebrow: 'Carta',
  all_label: 'Todos',
  search_placeholder: 'Buscar en el menú…',
  add_label: 'Agregar',
  count_singular: 'opción',
  count_plural: 'opciones',
  empty_title: 'El menú está en preparación',
  empty_text: 'Todavía no hay productos activos. Vuelve en un momento o pregunta al personal.',
  no_results_title: 'Sin resultados',
  no_results_text: 'No encontramos productos con ese nombre. Prueba con otra palabra.',
  cart_label: 'Carrito',
  cart_title: 'Tu pedido',
  cart_close: 'Cerrar carrito',
  cart_empty_title: 'Tu carrito está vacío',
  cart_empty_text: 'Agrega un combo o una poción para empezar la partida.',
  cart_delivery_title: 'Datos de entrega',
  cart_station_label: 'Estación',
  cart_customer_label: 'Nombre (opcional)',
  cart_customer_placeholder: 'Tu nombre',
  cart_note_label: 'Nota para la cocina (opcional)',
  cart_note_placeholder: 'Sin cebolla, salsa aparte…',
  cart_subtotal_label: 'Subtotal',
  cart_service_label: 'Servicio',
  cart_total_label: 'Total',
  cart_submit_label: 'Enviar pedido',
  cart_sending_label: 'Enviando pedido…',
  cart_hint: 'El pedido llega directo a la cocina y a tu estación.',
  item_singular: 'artículo',
  item_plural: 'artículos',
  error_send: 'No se pudo enviar el pedido. Intenta de nuevo.',
  modal_back: 'Volver al menú',
  modal_add: 'Agregar al pedido',
  spec_category: 'Categoría',
  spec_station: 'Estación',
  spec_badge: 'Etiqueta',
  spec_note: 'Nota',
  spec_tax: 'Impuesto',
};

const MENU_TEXT_META = [
  ['station_label', 'Etiqueta de estación'],
  ['hero_badge', 'Portada · insignia'],
  ['hero_cta', 'Portada · botón de la carta'],
  ['featured_add', 'Destacado · botón'],
  ['category_eyebrow', 'Carta · texto pequeño'],
  ['all_label', 'Filtro · “Todos”'],
  ['search_placeholder', 'Buscador · texto de ayuda'],
  ['add_label', 'Producto · botón agregar'],
  ['count_singular', 'Contador · singular'],
  ['count_plural', 'Contador · plural'],
  ['empty_title', 'Menú vacío · título'],
  ['empty_text', 'Menú vacío · texto', 'textarea'],
  ['no_results_title', 'Sin resultados · título'],
  ['no_results_text', 'Sin resultados · texto', 'textarea'],
  ['cart_label', 'Carrito · botón'],
  ['cart_title', 'Carrito · título'],
  ['cart_close', 'Carrito · cerrar'],
  ['cart_empty_title', 'Carrito vacío · título'],
  ['cart_empty_text', 'Carrito vacío · texto', 'textarea'],
  ['cart_delivery_title', 'Entrega · título'],
  ['cart_station_label', 'Entrega · estación'],
  ['cart_customer_label', 'Entrega · nombre'],
  ['cart_customer_placeholder', 'Entrega · nombre de ejemplo'],
  ['cart_note_label', 'Entrega · nota'],
  ['cart_note_placeholder', 'Entrega · nota de ejemplo'],
  ['cart_subtotal_label', 'Resumen · subtotal'],
  ['cart_service_label', 'Resumen · servicio'],
  ['cart_total_label', 'Resumen · total'],
  ['cart_submit_label', 'Carrito · botón enviar'],
  ['cart_sending_label', 'Carrito · enviando'],
  ['cart_hint', 'Carrito · aviso'],
  ['item_singular', 'Carrito · 1 artículo'],
  ['item_plural', 'Carrito · varios artículos'],
  ['error_send', 'Carrito · error al enviar', 'textarea'],
  ['modal_back', 'Producto · volver'],
  ['modal_add', 'Producto · agregar'],
  ['spec_category', 'Ficha · categoría'],
  ['spec_station', 'Ficha · estación'],
  ['spec_badge', 'Ficha · etiqueta'],
  ['spec_note', 'Ficha · nota'],
  ['spec_tax', 'Ficha · impuesto'],
];

const MENU_TEXT_GROUPS = [
  {
    title: 'Portada',
    keys: ['station_label', 'hero_badge', 'hero_cta', 'featured_add'],
  },
  {
    title: 'Carta y buscador',
    keys: ['category_eyebrow', 'all_label', 'search_placeholder', 'add_label', 'count_singular', 'count_plural', 'empty_title', 'empty_text', 'no_results_title', 'no_results_text'],
  },
  {
    title: 'Carrito y entrega',
    keys: ['cart_label', 'cart_title', 'cart_close', 'cart_empty_title', 'cart_empty_text', 'cart_delivery_title', 'cart_station_label', 'cart_customer_label', 'cart_customer_placeholder', 'cart_note_label', 'cart_note_placeholder', 'cart_subtotal_label', 'cart_service_label', 'cart_total_label', 'cart_submit_label', 'cart_sending_label', 'cart_hint', 'item_singular', 'item_plural', 'error_send'],
  },
  {
    title: 'Ficha del producto',
    keys: ['modal_back', 'modal_add', 'spec_category', 'spec_station', 'spec_badge', 'spec_note', 'spec_tax'],
  },
];

function settingValue(settings, key) {
  return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : undefined;
}

function getMenuTexts(settings = getSettings()) {
  const out = {};
  for (const [key, fallback] of Object.entries(MENU_TEXTS)) {
    const stored = settingValue(settings, `menu_text_${key}`);
    out[key] = stored === undefined ? fallback : stored;
  }
  return out;
}

function setMenuText(key, value) {
  if (!Object.prototype.hasOwnProperty.call(MENU_TEXTS, key)) return;
  const clean = String(value || '').trim();
  if (clean) setSetting(`menu_text_${key}`, clean.slice(0, 600));
  else db.prepare('DELETE FROM settings WHERE key = ?').run(`menu_text_${key}`);
}

module.exports = {
  MENU_TEXTS,
  MENU_TEXT_META,
  MENU_TEXT_GROUPS,
  getMenuTexts,
  setMenuText,
};
