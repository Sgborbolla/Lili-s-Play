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
