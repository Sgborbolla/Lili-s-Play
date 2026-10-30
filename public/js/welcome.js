const header = document.querySelector('.site-header');
const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');

if (header) {
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

if (toggle && header) {
  const closeNav = () => {
    header.classList.remove('nav-open');
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const open = !header.classList.contains('nav-open');
    header.classList.toggle('nav-open', open);
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNav();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeNav();
  });
}

const revealItems = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const openStatus = document.getElementById('open-status');
const openHours = document.getElementById('open-hours');
const openSep = document.getElementById('open-sep');
const socialLinkEls = document.querySelectorAll('[data-social]');
if (openStatus || openHours || socialLinkEls.length) {
  fetch('/api/public-info', { headers: { Accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((info) => {
      if (!info) return;
      if (openStatus) {
        openStatus.textContent = info.opening_status || '';
        openStatus.hidden = !info.opening_status;
      }
      if (openHours) {
        openHours.textContent = info.opening_hours || '';
        openHours.hidden = !info.opening_hours;
      }
      if (openSep) openSep.hidden = !info.opening_status || !info.opening_hours;
      socialLinkEls.forEach((link) => {
        const href = info.social?.[link.dataset.social];
        if (!href) return;
        const waText = link.dataset.waText;
        link.setAttribute('href', waText ? `${href}${href.includes('?') ? '&' : '?'}text=${encodeURIComponent(waText)}` : href);
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener');
        link.removeAttribute('data-empty');
      });
    })
    .catch(() => { /* se mantiene el horario y los enlaces de respaldo */ });
}

const station = new URLSearchParams(window.location.search).get('station');
if (station) {
  const menuUrl = `/?station=${encodeURIComponent(station)}`;
  document.querySelectorAll('[data-menu-link]').forEach((link) => {
    link.setAttribute('href', menuUrl);
  });
}

document.querySelectorAll('.social-banner__link').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (link.getAttribute('href') === '#' || link.hasAttribute('data-empty')) event.preventDefault();
  });
  link.addEventListener('pointerdown', () => {
    link.classList.add('is-flash');
    window.setTimeout(() => link.classList.remove('is-flash'), 280);
  });
});

const welcomeTargets = document.querySelectorAll('[data-welcome-card], [data-welcome-media], [data-welcome-text]');
if (welcomeTargets.length) {
  fetch('/api/welcome', { headers: { Accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data) return;
      const items = Array.isArray(data.items) ? data.items : [];
      const bySlot = new Map(items.map((item) => [item.slot, item]));
      document.querySelectorAll('[data-welcome-card]').forEach((card) => {
        const item = bySlot.get(card.dataset.welcomeCard);
        if (!item) return;
        const img = card.querySelector('img');
        if (img && item.image) {
          img.src = item.image;
          if (item.alt) img.alt = item.alt;
        }
        const title = card.querySelector('h2, h3');
        if (title && item.title !== undefined) title.textContent = item.title;
        const pill = card.querySelector('.pill');
        if (pill && item.pill !== undefined) pill.textContent = item.pill;
        const text = card.querySelector('p');
        if (text && item.text !== undefined) text.textContent = item.text;
      });
      items.forEach((item) => {
        const media = document.querySelector(`[data-welcome-media="${item.slot}"]`);
        if (!media || !item.image) return;
        media.src = item.image;
        if (item.alt) media.alt = item.alt;
        const picture = media.closest('picture');
        const source = picture ? picture.querySelector('source') : null;
        if (source) {
          source.srcset = item.image;
          source.removeAttribute('type');
        }
      });
      const texts = data.texts || {};
      Object.entries(texts).forEach(([key, value]) => {
        document.querySelectorAll(`[data-welcome-text="${key}"]`).forEach((el) => {
          el.textContent = value;
        });
      });
    })
    .catch(() => { /* se mantienen los textos e imágenes de respaldo */ });
}
