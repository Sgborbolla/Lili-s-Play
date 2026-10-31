(() => {
  const order = window.ORDER;
  if (!order) return;

  const badge = document.getElementById('order-status-badge');
  const statusText = document.getElementById('order-status-text');
  const stepper = document.getElementById('order-stepper');
  const refreshBtn = document.getElementById('order-refresh');
  const printBtn = document.getElementById('order-print');
  const cancelledBox = document.getElementById('order-cancelled');

  const steps = Array.from(document.querySelectorAll('[data-step]'));
  const terminalStates = ['entregado', 'cancelado'];

  function renderStatus(status) {
    if (!status) return;
    order.status = status;

    const labels = order.labels || {};
    const label = labels[status] || status;
    const index = order.sequence.indexOf(status);
    const cancelled = status === 'cancelado';

    if (badge) {
      badge.textContent = label;
      badge.className = `badge order-status ${cancelled ? 'tone-red' : status === 'entregado' ? 'tone-green' : status === 'listo' ? 'tone-violet' : status === 'preparando' ? 'tone-amber' : 'tone-cyan'}`;
    }
    if (statusText) statusText.textContent = label;

    if (stepper) stepper.hidden = cancelled;

    if (cancelled && !cancelledBox) {
      const box = document.createElement('div');
      box.className = 'order-cancelled';
      box.id = 'order-cancelled';
      box.textContent = 'Este pedido fue cancelado. Habla con el personal si necesitas ayuda.';
      const head = document.querySelector('.order-meta');
      if (head && head.parentNode) head.parentNode.insertBefore(box, head.nextSibling);
    } else if (!cancelled && cancelledBox) {
      cancelledBox.remove();
    }

    steps.forEach((step) => {
      const stepIndex = order.sequence.indexOf(step.dataset.step);
      step.classList.remove('is-done', 'is-current');
      if (cancelled) return;
      if (stepIndex < index) step.classList.add('is-done');
      if (stepIndex === index) step.classList.add('is-current');
    });
  }

  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Actualizando…';
    }
    try {
      const response = await fetch(`/api/pedidos/${encodeURIComponent(order.code)}/estado`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) renderStatus(payload.status);
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    } finally {
      busy = false;
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Actualizar ahora';
      }
    }
  }

  if (refreshBtn) refreshBtn.addEventListener('click', refresh);
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  if (!terminalStates.includes(order.status)) {
    const timer = window.setInterval(() => {
      if (terminalStates.includes(order.status)) {
        window.clearInterval(timer);
        return;
      }
      refresh();
    }, 10000);
  }
})();
