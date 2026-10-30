const { getSettings, setSetting, db } = require('./db');

const WELCOME_SLOTS = [
  {
    slot: 'station-1',
    group: 'Estaciones',
    kind: 'card',
    label: 'Estación 1',
    image: '/img/consolas/estacion-a.webp',
    alt: 'Consola PlayStation 4 de pie junto a su mando',
    title: 'PS4 · Estación 1',
    pill: '',
    text: 'Una estación cómoda para partidas individuales o cooperativas, con mando inalámbrico y pantalla grande.',
  },
  {
    slot: 'station-2',
    group: 'Estaciones',
    kind: 'card',
    label: 'Estación 2',
    image: '/img/consolas/estacion-b.webp',
    alt: 'Dos consolas PlayStation 4 con el mando sobre ellas',
    title: 'PS4 · Estación 2',
    pill: '',
    text: 'La estación para retos y torneos. Ideal para jugar con amigos y turnarse el mando.',
  },
  {
    slot: 'retro-01',
    group: 'Zona retro',
    kind: 'card',
    label: 'Atari 2600',
    image: '/img/retro/atari-2600-joystick.webp',
    alt: 'Joystick de Atari 2600',
    title: 'Atari 2600',
    pill: '1977 · Pionero',
    text: 'El joystick que empezó todo.',
  },
  {
    slot: 'retro-02',
    group: 'Zona retro',
    kind: 'card',
    label: 'NES',
    image: '/img/retro/nes-controller.webp',
    alt: 'Mando de Nintendo Entertainment System',
    title: 'NES',
    pill: '1983 · 8 bits',
    text: 'El mando que cambió las reglas.',
  },
  {
    slot: 'retro-03',
    group: 'Zona retro',
    kind: 'card',
    label: 'Sega Master System',
    image: '/img/retro/sega-master-system.webp',
    alt: 'Mandos de Sega Master System',
    title: 'Master System',
    pill: '1985 · 8 bits',
    text: 'La otra cara de los 8 bits.',
  },
  {
    slot: 'retro-04',
    group: 'Zona retro',
    kind: 'card',
    label: 'Sega Genesis',
    image: '/img/retro/sega-genesis.webp',
    alt: 'Mando de Sega Genesis',
    title: 'Sega Genesis',
    pill: '1989 · 16 bits',
    text: 'Velocidad y actitud Sega.',
  },
  {
    slot: 'retro-05',
    group: 'Zona retro',
    kind: 'card',
    label: 'SNES',
    image: '/img/retro/snes-controller.webp',
    alt: 'Mando de Super Nintendo',
    title: 'SNES',
    pill: '1990 · 16 bits',
    text: 'Más botones, más horas de juego.',
  },
  {
    slot: 'retro-06',
    group: 'Zona retro',
    kind: 'card',
    label: 'Sega Saturn',
    image: '/img/retro/sega-saturn.webp',
    alt: 'Mando de Sega Saturn',
    title: 'Sega Saturn',
    pill: '1994 · 32 bits',
    text: 'Los arcades llegaron a casa.',
  },
  {
    slot: 'retro-07',
    group: 'Zona retro',
    kind: 'card',
    label: 'Nintendo 64',
    image: '/img/retro/n64-controller.webp',
    alt: 'Mando de Nintendo 64',
    title: 'Nintendo 64',
    pill: '1996 · 64 bits',
    text: 'Tres agarres y una revolución.',
  },
  {
    slot: 'retro-08',
    group: 'Zona retro',
    kind: 'card',
    label: 'PlayStation',
    image: '/img/retro/ps1-dualshock.webp',
    alt: 'Mando DualShock de PlayStation',
    title: 'PlayStation',
    pill: '1997 · DualShock',
    text: 'La vibración llegó para quedarse.',
  },
  {
    slot: 'retro-09',
    group: 'Zona retro',
    kind: 'card',
    label: 'Sega Dreamcast',
    image: '/img/retro/sega-dreamcast.webp',
    alt: 'Mando de Sega Dreamcast',
    title: 'Dreamcast',
    pill: '1998 · 128 bits',
    text: 'La última gran apuesta de Sega.',
  },
  {
    slot: 'retro-10',
    group: 'Zona retro',
    kind: 'card',
    label: 'PlayStation 2',
    image: '/img/retro/ps2-dualshock.webp',
    alt: 'Mando DualShock 2 de PlayStation 2',
    title: 'PlayStation 2',
    pill: '2000 · DualShock 2',
    text: 'El mando de la generación Full HD.',
  },
  {
    slot: 'retro-11',
    group: 'Zona retro',
    kind: 'card',
    label: 'GameCube',
    image: '/img/retro/gamecube-controller.webp',
    alt: 'Mando de Nintendo GameCube',
    title: 'GameCube',
    pill: '2001 · 128 bits',
    text: 'Compacta, potente y muy querida.',
  },
  {
    slot: 'retro-12',
    group: 'Zona retro',
    kind: 'card',
    label: 'Xbox',
    image: '/img/retro/xbox-original.webp',
    alt: 'Mando Duke de la Xbox original',
    title: 'Xbox',
    pill: '2001 · La entrada',
    text: 'La primera Xbox, con su Duke.',
  },
  {
    slot: 'retro-13',
    group: 'Zona retro',
    kind: 'card',
    label: 'Xbox 360',
    image: '/img/retro/xbox-360.webp',
    alt: 'Mando de Xbox 360',
    title: 'Xbox 360',
    pill: '2005 · HD',
    text: 'La era del logro y el online.',
  },
  {
    slot: 'retro-14',
    group: 'Zona retro',
    kind: 'card',
    label: 'PlayStation 3',
    image: '/img/retro/ps3-dualshock.webp',
    alt: 'Mando DualShock 3 de PlayStation 3',
    title: 'PlayStation 3',
    pill: '2006 · DualShock 3',
    text: 'La era del juego en línea.',
  },
  {
    slot: 'retro-15',
    group: 'Zona retro',
    kind: 'card',
    label: 'PlayStation 4',
    image: '/img/retro/ps4-dualshock4.webp',
    alt: 'Mando DualShock 4 de PlayStation 4',
    title: 'PlayStation 4',
    pill: '2013 · Full HD',
    text: 'El mando de la generación Full HD.',
  },
  {
    slot: 'retro-16',
    group: 'Zona retro',
    kind: 'card',
    label: 'Xbox One',
    image: '/img/retro/xbox-one.webp',
    alt: 'Mando de Xbox One',
    title: 'Xbox One',
    pill: '2013 · Nueva gen',
    text: 'El mando que evolucionó al 360.',
  },
  {
    slot: 'retro-17',
    group: 'Zona retro',
    kind: 'card',
    label: 'PlayStation 5',
    image: '/img/retro/ps5-dualsense.webp',
    alt: 'Mando DualSense de PlayStation 5',
    title: 'PlayStation 5',
    pill: '2020 · Nueva gen',
    text: 'Hasta hoy: la nueva generación.',
  },
  {
    slot: 'retro-18',
    group: 'Zona retro',
    kind: 'card',
    label: 'Xbox Series',
    image: '/img/retro/xbox-series.webp',
    alt: 'Mando de Xbox Series',
    title: 'Xbox Series',
    pill: '2020 · Nueva gen',
    text: 'La generación más reciente de Xbox.',
  },
  {
    slot: 'group',
    group: 'Amigos y familia',
    kind: 'card',
    label: 'Foto del grupo',
    image: '/img/user/grupo-jugando.jpg',
    alt: 'Amigos y familia jugando juntos en una sala con una consola',
    title: 'La partida empieza cuando llegan todos.',
    pill: '',
    text: 'Reúne a los tuyos, elijan estación y dejen que la noche ruede. Cumpleaños, plan de familia o revancha entre amigos: aquí hay un mando para cada uno.',
  },
  { slot: 'hero-banner', group: 'Portada', kind: 'media', label: 'Banner principal', image: '/img/banner-lilys-plays.jpg', alt: "Letrero neón de Lily's Plays, Salón Gamer y Bistró" },
  { slot: 'game-feature', group: 'Portada', kind: 'media', label: 'Juegos · foto grande', image: '/img/user/juegos.jpg', alt: 'Collage de juegos de acción, carreras, aventura y deportes' },
  { slot: 'game-mini-1', group: 'Portada', kind: 'media', label: 'Juegos · retro y arcade', image: '/img/user/juegos-1.jpg', alt: 'Selección de juegos retro y arcade' },
  { slot: 'game-mini-2', group: 'Portada', kind: 'media', label: 'Juegos · shooters y carreras', image: '/img/user/juegos-2.jpg', alt: 'Selección de juegos de disparos, carreras y aventura' },
  { slot: 'promo-1', group: 'Portada', kind: 'media', label: 'Promo · combo gamer', image: '/img/stock/food.jpg', alt: 'Platos de comida para compartir' },
  { slot: 'promo-2', group: 'Portada', kind: 'media', label: 'Promo · torneo', image: '/img/stock/esports.jpg', alt: 'Jugador de esports en una competencia' },
  { slot: 'food-1', group: 'Portada', kind: 'media', label: 'Comida · hamburguesa', image: '/img/stock/burger.jpg', alt: 'Hamburguesa God of War Ragnarök Smash' },
  { slot: 'food-2', group: 'Portada', kind: 'media', label: 'Comida · pizzas', image: '/img/stock/pizza.jpg', alt: 'Pizzas Smash Dúo Party' },
  { slot: 'food-3', group: 'Portada', kind: 'media', label: 'Comida · snack', image: '/img/stock/wings.jpg', alt: 'Snack DualShock Haptic Astro' },
  { slot: 'food-4', group: 'Portada', kind: 'media', label: 'Comida · postre', image: '/img/stock/shake.jpg', alt: 'Sundae Kirby Dream Land' },
  { slot: 'reserve-photo', group: 'Portada', kind: 'media', label: 'Reserva · foto del salón', image: '/img/stock/restaurant.jpg', alt: "Interior del salón de Lily's Plays" },
  { slot: 'footer-social', group: 'Portada', kind: 'media', label: 'Pie · banner de redes', image: '/img/redes-sociales-gamer.jpg', alt: 'Banner de redes sociales de Lily\'s Plays' },
];

const TEXT_FIELDS = ['title', 'pill', 'text', 'alt'];

function slotKey(slot) {
  return `welcome_${slot.replace(/-/g, '_')}`;
}

function settingValue(settings, key) {
  return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : undefined;
}

function getWelcomeMedia(settings = getSettings()) {
  return WELCOME_SLOTS.map((item) => {
    const base = slotKey(item.slot);
    const customImage = settingValue(settings, `${base}_image`);
    const out = { slot: item.slot, group: item.group, kind: item.kind || 'card', label: item.label, image: customImage || item.image };
    if ((item.kind || 'card') === 'card') {
      for (const field of TEXT_FIELDS) {
        const value = settingValue(settings, `${base}_${field}`);
        out[field] = value === undefined ? item[field] : value;
      }
    }
    const customAlt = settingValue(settings, `${base}_alt`);
    out.alt = customAlt === undefined ? item.alt : customAlt;
    out.is_custom = Boolean(customImage);
    return out;
  });
}

function resetWelcomeField(slot, field) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(`${slotKey(slot)}_${field}`);
}

function setWelcomeField(slot, field, value) {
  setSetting(`${slotKey(slot)}_${field}`, value);
}


const WELCOME_TEXTS = {
  hero_badge: 'Nuevo · Zona gamer',
  hero_eyebrow: 'Salón gamer y bistró · Bienvenido',
  hero_title_1: 'JUEGA, COME',
  hero_title_2: 'Y REPITE.',
  hero_lead: 'Estaciones PlayStation 4, clásicos de siempre y una cocina que juega de local. Todo en un solo lugar, con la noche a tu favor.',
  hero_cta_1: 'Ver el menú',
  hero_cta_2: 'Reservar mesa',
  stat_1_value: '2 consolas',
  stat_1_label: 'PlayStation 4 · Full HD',
  stat_2_value: '+30 juegos',
  stat_2_label: 'De clásicos a torneos',
  stat_3_value: 'Cocina propia',
  stat_3_label: 'Comida y bebida',
  stat_4_value: 'Reservas',
  stat_4_label: 'Tu estación, tu mesa',
  stations_eyebrow: 'Elige tu estación',
  stations_title: 'Dos estaciones PS4.',
  stations_text: 'Dos formas de jugar, una sola noche. Mandos listos, pantallas grandes y sillones para quedarse.',
  stations_link: 'Reservar una estación →',
  games_eyebrow: 'Juegos que enganchan',
  games_title: 'De clásicos a torneos.',
  games_text: 'Elige tu favorito, arma la partida y únete a la próxima noche de torneo. Siempre hay un mando libre.',
  games_link: 'Ver el menú →',
  promos_eyebrow: 'Anuncios y promos',
  promos_title: 'La noche se arma aquí.',
  promos_link: 'Ver combos →',
  menu_eyebrow: 'Del menú',
  menu_title: 'Para jugar con hambre.',
  menu_text: 'Clásicos de bistró con nombres de videojuego. Todo se prepara en casa.',
  menu_link: 'Ver menú completo →',
  menu_note: 'Precios en USD y CUC. Consulta combos, promociones y opciones sin alcohol.',
  menu_cta: 'Hacer mi pedido',
  retro_eyebrow: 'Zona retro',
  retro_title: 'Del Atari a la PS5 y Xbox Series.',
  retro_text: 'Un recorrido por mandos y consolas que marcaron época: Atari, Nintendo, Sega, PlayStation y Xbox.',
  group_cta: 'Reservar para el grupo',
  reserve_eyebrow: 'Reserva tu mesa',
  reserve_title: 'La noche empieza aquí.',
  reserve_text: 'Elige consola, pide tu combo y quédate hasta que se termine la partida. Dinos cuántos vienen y te guardamos el mejor lugar.',
  reserve_cta: 'Reservar por WhatsApp',
  reserve_cta_2: "Acerca de Lily's Plays",
};

const WELCOME_TEXT_META = [
  ['hero_badge', 'Portada · insignia'], ['hero_eyebrow', 'Portada · eyebrow'], ['hero_title_1', 'Portada · título línea 1'], ['hero_title_2', 'Portada · título línea 2'], ['hero_lead', 'Portada · texto', 'textarea'], ['hero_cta_1', 'Portada · botón 1'], ['hero_cta_2', 'Portada · botón 2'],
  ['stat_1_value', 'Dato 1 · valor'], ['stat_1_label', 'Dato 1 · etiqueta'], ['stat_2_value', 'Dato 2 · valor'], ['stat_2_label', 'Dato 2 · etiqueta'], ['stat_3_value', 'Dato 3 · valor'], ['stat_3_label', 'Dato 3 · etiqueta'], ['stat_4_value', 'Dato 4 · valor'], ['stat_4_label', 'Dato 4 · etiqueta'],
  ['stations_eyebrow', 'Estaciones · eyebrow'], ['stations_title', 'Estaciones · título'], ['stations_text', 'Estaciones · texto', 'textarea'], ['stations_link', 'Estaciones · enlace'],
  ['games_eyebrow', 'Juegos · eyebrow'], ['games_title', 'Juegos · título'], ['games_text', 'Juegos · texto', 'textarea'], ['games_link', 'Juegos · enlace'],
  ['promos_eyebrow', 'Promos · eyebrow'], ['promos_title', 'Promos · título'], ['promos_link', 'Promos · enlace'],
  ['menu_eyebrow', 'Menú · eyebrow'], ['menu_title', 'Menú · título'], ['menu_text', 'Menú · texto', 'textarea'], ['menu_link', 'Menú · enlace'], ['menu_note', 'Menú · nota', 'textarea'], ['menu_cta', 'Menú · botón'],
  ['retro_eyebrow', 'Retro · eyebrow'], ['retro_title', 'Retro · título'], ['retro_text', 'Retro · texto', 'textarea'],
  ['group_cta', 'Amigos · botón'],
  ['reserve_eyebrow', 'Reserva · eyebrow'], ['reserve_title', 'Reserva · título'], ['reserve_text', 'Reserva · texto', 'textarea'], ['reserve_cta', 'Reserva · botón 1'], ['reserve_cta_2', 'Reserva · botón 2'],
];

function getWelcomeTexts(settings = getSettings()) {
  const out = {};
  for (const [key, fallback] of Object.entries(WELCOME_TEXTS)) {
    const stored = settingValue(settings, `welcome_text_${key}`);
    out[key] = stored === undefined ? fallback : stored;
  }
  return out;
}

function setWelcomeText(key, value) {
  if (!Object.prototype.hasOwnProperty.call(WELCOME_TEXTS, key)) return;
  const clean = String(value || '').trim();
  if (clean) setSetting(`welcome_text_${key}`, clean.slice(0, 600));
  else db.prepare('DELETE FROM settings WHERE key = ?').run(`welcome_text_${key}`);
}

module.exports = {
  WELCOME_SLOTS,
  TEXT_FIELDS,
  slotKey,
  getWelcomeMedia,
  getWelcomeTexts,
  setWelcomeText,
  WELCOME_TEXTS,
  WELCOME_TEXT_META,
  resetWelcomeField,
  setWelcomeField,
};
