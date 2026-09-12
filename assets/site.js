/* ============================================================
   Site-wide behavior shared by every page: theme toggle (dark
   is the default; light is opt-in and remembered) and the
   header BTC ticker via Binance's public WebSocket — no key,
   no backend, same public stream Blitzkurs already uses.
   ============================================================ */

document.querySelectorAll('[data-theme-btn]').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.themeBtn;
    if (val === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('lb-theme', val); } catch (e) {}
    document.querySelectorAll('[data-theme-btn]').forEach(b => b.classList.toggle('active', b === btn));
  });
});
(function syncToggleUI(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.querySelectorAll('[data-theme-btn]').forEach(b => {
    b.classList.toggle('active', (b.dataset.themeBtn === 'light') === isLight);
  });
})();

/* ---------- BTC ticker (Binance public WS, no auth) ---------- */
(function ticker(){
  const el = document.getElementById('btcTicker');
  if (!el) return;
  const priceEl = el.querySelector('.t-price');
  const chgEl = el.querySelector('.t-chg');
  let ws;
  try {
    ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
  } catch (e) { return; }
  ws.onmessage = (ev) => {
    try {
      const d = JSON.parse(ev.data);
      const price = parseFloat(d.c);
      const chgPct = parseFloat(d.P);
      priceEl.textContent = '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 });
      chgEl.textContent = (chgPct >= 0 ? '+' : '') + chgPct.toFixed(2) + '%';
      chgEl.className = 't-chg ' + (chgPct >= 0 ? 'up' : 'down');
    } catch (e) {}
  };
  ws.onerror = () => { el.style.display = 'none'; };
})();
