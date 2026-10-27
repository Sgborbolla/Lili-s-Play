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
if (openStatus || openHours) {
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
    })
    .catch(() => { /* se mantiene el horario de respaldo */ });
}

const station = new URLSearchParams(window.location.search).get('station');
if (station) {
  const menuUrl = `/?station=${encodeURIComponent(station)}`;
  document.querySelectorAll('[data-menu-link]').forEach((link) => {
    link.setAttribute('href', menuUrl);
  });
}

document.querySelectorAll('.social-banner__link').forEach((link) => {
  const empty = link.getAttribute('href') === '#' || link.hasAttribute('data-empty');
  link.addEventListener('click', (event) => {
    if (empty) event.preventDefault();
  });
  link.addEventListener('pointerdown', () => {
    link.classList.add('is-flash');
    window.setTimeout(() => link.classList.remove('is-flash'), 280);
  });
});
