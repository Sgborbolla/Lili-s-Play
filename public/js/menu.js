(() => {
  const data = window.LP || {};
  const products = Array.isArray(data.products) ? data.products : [];
  const byId = new Map(products.map((p) => [Number(p.id), p]));
  const currency = data.currency || {};
  const taxPercent = Number(data.taxPercent) || 0;
  const mode = currency.mode || 'USD';

  const cart = new Map();
  const STORAGE_KEY = 'lilys-plays-cart';

  const drawer = document.getElementById('carrito');
  const backdrop = document.getElementById('cart-backdrop');
  const openBtn = document.getElementById('cart-open');
  const closeBtn = document.getElementById('cart-close');
  const itemsEl = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const countEl = document.getElementById('cart-count');
  const headCountEl = document.getElementById('cart-head-count');
  const subtotalEl = document.getElementById('cart-subtotal');
  const taxEl = document.getElementById('cart-tax');
  const totalEl = document.getElementById('cart-total');
  const form = document.getElementById('checkout-form');
  const submitBtn = document.getElementById('checkout-submit');
  const errorEl = document.getElementById('checkout-error');
  const searchInput = document.getElementById('menu-search');
  const noResults = document.getElementById('no-results');
  const chips = Array.from(document.querySelectorAll('[data-filter]'));
  const sections = Array.from(document.querySelectorAll('[data-section]'));

  const modal = document.getElementById('product-modal');
  const pmBody = document.getElementById('pm-body');
  const pmMedia = document.getElementById('pm-media');
  const pmBack = document.getElementById('pm-back');
  const pmCat = document.getElementById('pm-cat');
  const pmTitle = document.getElementById('pm-title');
  const pmDesc = document.getElementById('pm-desc');
  const pmChips = document.getElementById('pm-chips');
  const pmPriceMain = document.getElementById('pm-price-main');
  const pmPriceSub = document.getElementById('pm-price-sub');
  const pmSpecs = document.getElementById('pm-specs');
  const pmQtyEl = document.getElementById('pm-qty');
  const pmAdd = document.getElementById('pm-add');
  const scrollTopBtn = document.getElementById('scroll-top');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let modalProduct = null;
  let modalSource = null;
  let modalQty = 1;
  let modalClosing = false;

  function money(cents, code) {
    const isCuc = code === 'CUC';
    const locale = isCuc ? (currency.localeCuc || 'es-CU') : (currency.locale || 'en-US');
    const symbol = isCuc ? (currency.symbolCuc || '$') : (currency.symbol || 'US$');
    const value = (Number(cents) || 0) / 100;
    try {
      return `${symbol}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
    } catch {
      return `${symbol}${value.toFixed(2)}`;
    }
  }

  function unitPrice(product) {
    if (mode === 'CUC') return Number(product.price_cuc_cents) || Number(product.price) || 0;
    return Number(product.price) || 0;
  }

  function lineLabel(cents) {
    return money(cents, mode === 'CUC' ? 'CUC' : 'USD');
  }

  function loadCart() {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      Object.entries(saved).forEach(([id, qty]) => {
        const product = byId.get(Number(id));
        const amount = Math.max(0, Math.min(30, Number(qty) || 0));
        if (product && amount > 0) cart.set(product.id, amount);
      });
    } catch {
      /* sin carrito guardado */
    }
  }

  function saveCart() {
    try {
      const plain = {};
      cart.forEach((qty, id) => { plain[id] = qty; });
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plain));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  function totals() {
    let subtotal = 0;
    cart.forEach((qty, id) => {
      const product = byId.get(id);
      if (product) subtotal += unitPrice(product) * qty;
    });
    const tax = Math.round((subtotal * taxPercent) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }

  function makeThumb(product) {
    const thumb = document.createElement('span');
    thumb.className = 'cart-thumb';
    if (product.image) {
      const img = document.createElement('img');
      img.src = product.image;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.textContent = product.emoji || '🍽️';
    }
    return thumb;
  }

  function renderCart() {
    let count = 0;
    cart.forEach((qty) => { count += qty; });
    countEl.textContent = String(count);
    if (headCountEl) headCountEl.textContent = `${count} ${count === 1 ? 'artículo' : 'artículos'}`;

    if (itemsEl) {
      itemsEl.replaceChildren();
      itemsEl.hidden = cart.size === 0;
    }
    if (emptyEl) emptyEl.hidden = cart.size > 0;

    cart.forEach((qty, id) => {
      const product = byId.get(id);
      if (!product || !itemsEl) return;
      const unit = unitPrice(product);

      const li = document.createElement('li');
      li.className = 'cart-item';

      const info = document.createElement('div');
      const name = document.createElement('h3');
      name.textContent = product.name;
      const price = document.createElement('p');
      price.className = 'ci-price';
      price.textContent = lineLabel(unit);
      info.append(name, price);

      const qtyBox = document.createElement('div');
      qtyBox.className = 'qty-control';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.dataset.qty = String(id);
      minus.dataset.delta = '-1';
      minus.setAttribute('aria-label', `Quitar una unidad de ${product.name}`);
      minus.textContent = '−';
      const amount = document.createElement('span');
      amount.textContent = String(qty);
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.dataset.qty = String(id);
      plus.dataset.delta = '1';
      plus.setAttribute('aria-label', `Agregar una unidad de ${product.name}`);
      plus.textContent = '+';
      qtyBox.append(minus, amount, plus);

      const lineTotal = document.createElement('span');
      lineTotal.className = 'cart-line-total';
      lineTotal.textContent = lineLabel(unit * qty);

      li.append(makeThumb(product), info, qtyBox, lineTotal);
      itemsEl.appendChild(li);
    });

    const sums = totals();
    if (subtotalEl) subtotalEl.textContent = lineLabel(sums.subtotal);
    if (taxEl) taxEl.textContent = lineLabel(sums.tax);
    if (totalEl) totalEl.textContent = lineLabel(sums.total);
    if (submitBtn) submitBtn.disabled = cart.size === 0;
  }

  function addToCart(id, qty = 1) {
    const product = byId.get(Number(id));
    if (!product) return;
    const amount = Math.max(1, Math.min(30, Number(qty) || 1));
    cart.set(product.id, Math.min(30, (cart.get(product.id) || 0) + amount));
    saveCart();
    renderCart();
    openDrawer();
  }

  function changeQty(id, delta) {
    const product = byId.get(Number(id));
    if (!product) return;
    const next = (cart.get(product.id) || 0) + delta;
    if (next <= 0) cart.delete(product.id);
    else cart.set(product.id, Math.min(30, next));
    saveCart();
    renderCart();
  }

  function setModalQty(value) {
    modalQty = Math.max(1, Math.min(30, Number(value) || 1));
    if (pmQtyEl) pmQtyEl.textContent = String(modalQty);
  }

  function isRectVisible(rect) {
    return Boolean(
      rect && rect.width > 0 && rect.height > 0
      && rect.bottom > 0 && rect.right > 0
      && rect.top < window.innerHeight && rect.left < window.innerWidth
    );
  }

  function makeFlyer(product, rect, radius) {
    const flyer = document.createElement('div');
    flyer.className = 'pm-fly';
    flyer.style.setProperty('--pm-accent', product.category_accent || '#006fcd');
    flyer.style.top = `${rect.top}px`;
    flyer.style.left = `${rect.left}px`;
    flyer.style.width = `${rect.width}px`;
    flyer.style.height = `${rect.height}px`;
    flyer.style.borderRadius = radius;
    if (product.image) {
      const img = document.createElement('img');
      img.src = product.image;
      img.alt = '';
      flyer.appendChild(img);
    } else {
      const emoji = document.createElement('span');
      emoji.className = 'pm-emoji';
      emoji.textContent = product.emoji || '🍽️';
      flyer.appendChild(emoji);
    }
    document.body.appendChild(flyer);
    return flyer;
  }

  function flyTo(flyer, from, to, radiusFrom, radiusTo, duration) {
    return flyer.animate([
      {
        top: `${from.top}px`,
        left: `${from.left}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        borderRadius: radiusFrom,
      },
      {
        top: `${to.top}px`,
        left: `${to.left}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
        borderRadius: radiusTo,
      },
    ], {
      duration,
      easing: 'cubic-bezier(.22, .8, .32, 1)',
      fill: 'forwards',
    }).finished.catch(() => {});
  }

  function fillModal(product) {
    if (pmCat) pmCat.textContent = product.category || 'Menú';
    if (pmTitle) pmTitle.textContent = product.name;
    if (pmDesc) {
      pmDesc.textContent = product.description || '';
      pmDesc.hidden = !product.description;
    }

    if (pmMedia) {
      pmMedia.replaceChildren();
      if (product.image) {
        const img = document.createElement('img');
        img.src = product.image;
        img.alt = product.name;
        pmMedia.appendChild(img);
      } else {
        const emoji = document.createElement('span');
        emoji.className = 'pm-emoji';
        emoji.textContent = product.emoji || '🍽️';
        pmMedia.appendChild(emoji);
      }
    }

    if (pmChips) {
      pmChips.replaceChildren();
      [product.badge, product.tag].filter(Boolean).forEach((text, index) => {
        const chip = document.createElement('span');
        chip.className = index === 0 && product.badge ? 'pm-chip is-accent' : 'pm-chip';
        chip.textContent = text;
        pmChips.appendChild(chip);
      });
      pmChips.hidden = !product.badge && !product.tag;
    }

    if (pmPriceMain) {
      pmPriceMain.textContent = mode === 'CUC'
        ? (product.price_cuc_label || product.price_label || '')
        : (product.price_usd_label || product.price_label || '');
    }
    if (pmPriceSub) {
      const sub = mode === 'BOTH' ? (product.price_cuc_label || '') : '';
      pmPriceSub.textContent = sub;
      pmPriceSub.hidden = !sub;
    }

    if (pmSpecs) {
      pmSpecs.replaceChildren();
      const specs = [];
      if (product.category) specs.push(['Categoría', product.category]);
      if (data.station) specs.push(['Estación', `#${data.station}`]);
      if (product.badge) specs.push(['Etiqueta', product.badge]);
      if (product.tag) specs.push(['Nota', product.tag]);
      if (taxPercent > 0) specs.push(['Impuesto', `${taxPercent}%`]);
      specs.forEach(([label, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        row.append(dt, dd);
        pmSpecs.appendChild(row);
      });
      pmSpecs.hidden = specs.length === 0;
    }

    setModalQty(1);
  }

  function openProduct(id, source) {
    if (!modal || !pmMedia || modalClosing) return;
    const product = byId.get(Number(id));
    if (!product) return;

    modalProduct = product;
    modalSource = source || document.querySelector(`[data-expand="${product.id}"]`) || document.activeElement;
    modal.style.setProperty('--pm-accent', product.category_accent || '#006fcd');
    fillModal(product);
    if (pmBody) pmBody.scrollTop = 0;

    const sourceRect = modalSource && modalSource.getBoundingClientRect
      ? modalSource.getBoundingClientRect()
      : null;
    const shouldFly = !reduceMotion && isRectVisible(sourceRect);

    if (shouldFly) pmMedia.style.opacity = '0';

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');

    if (shouldFly) {
      const flyer = makeFlyer(product, sourceRect, '18px');
      requestAnimationFrame(() => {
        const targetRect = pmMedia.getBoundingClientRect();
        flyTo(flyer, sourceRect, targetRect, '18px', '0px', 340).then(() => {
          flyer.remove();
          pmMedia.style.opacity = '';
        });
      });
    }

    window.setTimeout(() => {
      if (pmBack && modal.classList.contains('is-open')) pmBack.focus({ preventScroll: true });
    }, 30);
  }

  function closeProduct(options = {}) {
    if (!modal || !modal.classList.contains('is-open') || modalClosing) return;

    const restoreFocus = options.restoreFocus !== false;
    const animate = options.animate !== false && !reduceMotion;
    const focusTarget = modalSource;
    const product = modalProduct;
    const sourceRect = focusTarget && focusTarget.getBoundingClientRect
      ? focusTarget.getBoundingClientRect()
      : null;
    const mediaRect = pmMedia ? pmMedia.getBoundingClientRect() : null;
    const shouldFly = animate && product && isRectVisible(sourceRect) && mediaRect;

    modalClosing = true;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (pmMedia) pmMedia.style.opacity = '';
      modalProduct = null;
      modalSource = null;
      modalClosing = false;
      document.body.classList.remove('is-locked');
      if (restoreFocus && focusTarget && focusTarget.isConnected) {
        focusTarget.focus({ preventScroll: true });
      }
    };

    if (!shouldFly) {
      finish();
      return;
    }

    const flyer = makeFlyer(product, mediaRect, '0px');
    flyTo(flyer, mediaRect, sourceRect, '0px', '18px', 300).then(() => {
      flyer.remove();
      finish();
    });
    window.setTimeout(() => {
      flyer.remove();
      finish();
    }, 380);
  }

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('is-open');
    if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-locked');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.classList.remove('is-open');
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
    if (openBtn) openBtn.focus({ preventScroll: true });
  }

  let activeCategory = 'all';

  function applyFilters() {
    const query = String(searchInput && searchInput.value || '').trim().toLowerCase();
    let visible = 0;

    sections.forEach((section) => {
      const sectionId = section.dataset.section;
      const categoryMatch = activeCategory === 'all' || activeCategory === sectionId;
      const cards = Array.from(section.querySelectorAll('[data-card]'));
      let cardMatches = 0;

      cards.forEach((card) => {
        const match = !query || String(card.dataset.search || '').includes(query);
        card.hidden = !match;
        if (match) cardMatches += 1;
      });

      const show = categoryMatch && cardMatches > 0;
      section.hidden = !show;
      if (show) visible += 1;
    });

    if (noResults) noResults.classList.toggle('is-visible', visible === 0);
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      activeCategory = chip.dataset.filter || 'all';
      chips.forEach((item) => {
        const active = item === chip;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      applyFilters();
      if (activeCategory !== 'all') {
        const target = document.getElementById(`cat-${activeCategory}`);
        if (target && !target.hidden) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  document.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]');
    if (add) {
      event.preventDefault();
      addToCart(add.dataset.add);
      return;
    }
    const qty = event.target.closest('[data-qty]');
    if (qty) {
      event.preventDefault();
      changeQty(qty.dataset.qty, Number(qty.dataset.delta) || 0);
      return;
    }
    const expand = event.target.closest('[data-expand]');
    if (expand) {
      event.preventDefault();
      openProduct(expand.dataset.expand, expand);
      return;
    }
    const card = event.target.closest('[data-card]');
    if (card && !event.target.closest('button') && !event.target.closest('a')) {
      openProduct(card.dataset.id, card.querySelector('[data-expand]'));
    }
  });

  if (modal) {
    modal.addEventListener('click', (event) => {
      const delta = event.target.closest('[data-pm-delta]');
      if (delta) {
        setModalQty(modalQty + (Number(delta.dataset.pmDelta) || 0));
        return;
      }
      if (event.target.closest('#pm-add')) {
        if (!modalProduct) return;
        const id = modalProduct.id;
        const qty = modalQty;
        closeProduct({ animate: false, restoreFocus: false });
        addToCart(id, qty);
        return;
      }
      if (event.target.closest('[data-pm-close]')) closeProduct();
    });
  }

  if (openBtn) openBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (modal && modal.classList.contains('is-open')) {
      closeProduct();
      return;
    }
    if (drawer && drawer.classList.contains('is-open')) closeDrawer();
  });

  if (scrollTopBtn) {
    const updateScrollTop = () => {
      scrollTopBtn.classList.toggle('is-visible', window.scrollY > 480);
    };
    updateScrollTop();
    window.addEventListener('scroll', updateScrollTop, { passive: true });
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!cart.size || !submitBtn) return;
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.remove('is-visible');
      }

      const items = Array.from(cart.entries()).map(([id, qty]) => ({ id, qty }));
      const stationInput = document.getElementById('cart-station');
      const customerInput = document.getElementById('cart-customer');
      const noteInput = document.getElementById('cart-note');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando pedido…';

      try {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            station: stationInput ? stationInput.value.trim() : '',
            customer: customerInput ? customerInput.value.trim() : '',
            note: noteInput ? noteInput.value.trim() : '',
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'No se pudo enviar el pedido.');
        }
        try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        window.location.href = `/pedido/${encodeURIComponent(payload.code)}`;
      } catch (error) {
        if (errorEl) {
          errorEl.textContent = error.message || 'No se pudo enviar el pedido. Intenta de nuevo.';
          errorEl.classList.add('is-visible');
        }
        submitBtn.disabled = cart.size === 0;
        submitBtn.textContent = 'Enviar pedido';
      }
    });
  }

  loadCart();
  renderCart();

  if (window.location.hash === '#carrito' && cart.size > 0) {
    openDrawer();
  }
})();
