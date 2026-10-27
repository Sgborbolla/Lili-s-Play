(() => {
  document.querySelectorAll('[data-confirm]').forEach((element) => {
    const message = element.dataset.confirm || '¿Seguro que quieres continuar?';
    const eventName = element.tagName === 'FORM' ? 'submit' : 'click';
    element.addEventListener(eventName, (event) => {
      if (!window.confirm(message)) event.preventDefault();
    });
  });

  const navToggle = document.getElementById('admin-nav-toggle');
  if (navToggle) {
    document.querySelectorAll('.admin-nav a').forEach((link) => {
      link.addEventListener('click', () => { navToggle.checked = false; });
    });
    document.querySelector('.admin-overlay')?.addEventListener('click', () => { navToggle.checked = false; });
  }

  const searchInput = document.querySelector('[data-table-search]');
  const categorySelect = document.querySelector('[data-table-category]');

  function filterTable() {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    const category = String(categorySelect?.value || 'all');
    document.querySelectorAll('[data-row]').forEach((row) => {
      const text = String(row.dataset.search || '').toLowerCase();
      const rowCategory = String(row.dataset.category || '');
      const matchesQuery = !query || text.includes(query);
      const matchesCategory = category === 'all' || rowCategory === category;
      row.hidden = !(matchesQuery && matchesCategory);
    });
  }

  if (searchInput) searchInput.addEventListener('input', filterTable);
  if (categorySelect) categorySelect.addEventListener('change', filterTable);

  const orderFilters = Array.from(document.querySelectorAll('[data-order-filter]'));
  const orderCards = Array.from(document.querySelectorAll('[data-order-status]'));

  orderFilters.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.orderFilter || 'all';
      orderFilters.forEach((item) => item.classList.toggle('is-active', item === button));
      orderCards.forEach((card) => {
        card.hidden = filter !== 'all' && card.dataset.orderStatus !== filter;
      });
    });
  });

  const imageInput = document.querySelector('[data-image-input]');
  const imagePreview = document.querySelector('[data-image-preview]');
  if (imageInput && imagePreview) {
    imageInput.addEventListener('change', () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) return;
      const url = URL.createObjectURL(file);
      imagePreview.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Vista previa de la imagen';
      imagePreview.appendChild(img);
    });
  }

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.dataset.copy || '';
      try {
        await navigator.clipboard.writeText(value);
        const original = button.textContent;
        button.textContent = 'Copiado';
        window.setTimeout(() => { button.textContent = original; }, 1600);
      } catch {
        window.prompt('Copia el enlace:', value);
      }
    });
  });

  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (event.defaultPrevented) return;
      const submit = form.querySelector('button[type="submit"]:not([value])');
      if (submit && !submit.dataset.noLock) {
        window.setTimeout(() => { submit.disabled = true; }, 0);
        window.setTimeout(() => { submit.disabled = false; }, 5000);
      }
    });
  });

  document.querySelectorAll('.alert-ok').forEach((alert) => {
    window.setTimeout(() => alert.classList.add('is-hidden'), 6000);
  });

  document.querySelectorAll('[data-print]').forEach((button) => {
    button.addEventListener('click', () => window.print());
  });

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.passwordToggle);
      if (!target) return;
      const visible = target.type === 'text';
      target.type = visible ? 'password' : 'text';
      button.textContent = visible ? 'Mostrar' : 'Ocultar';
    });
  });
})();
