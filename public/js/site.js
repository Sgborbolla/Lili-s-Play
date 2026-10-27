const menuHeader = document.querySelector('.menu-header');

if (menuHeader) {
  const onScroll = () => menuHeader.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && String(event.key).toLowerCase() === 'a') {
    event.preventDefault();
    window.location.href = '/admin';
  }
});

const brand = document.querySelector('.brand');
if (brand) {
  let adminTimer = 0;
  let adminFired = false;
  const cancelAdmin = () => window.clearTimeout(adminTimer);
  brand.addEventListener('pointerdown', () => {
    adminFired = false;
    adminTimer = window.setTimeout(() => {
      adminFired = true;
      window.location.href = '/admin';
    }, 1400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((name) => brand.addEventListener(name, cancelAdmin));
  brand.addEventListener('click', (event) => {
    if (adminFired) {
      event.preventDefault();
      adminFired = false;
    }
  });
  brand.addEventListener('contextmenu', (event) => event.preventDefault());
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
