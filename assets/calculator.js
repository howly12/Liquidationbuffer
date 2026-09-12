/* ============================================================
   Fully static, manual-input liquidation buffer calculator.
   No backend, no live API calls — the user enters their own
   exchange's numbers (maintenance margin rate, fee, funding
   rate) directly, copied from that exchange's own fee/margin
   pages. This works for ANY exchange, not just one, and can
   never fail due to a blocked API call or rate limit.

   CORRECTNESS NOTE (fixed during the static rebuild): whether
   the fee is "in the trigger" changes what it affects, not just
   how it's labeled:
   - Fee counted in the trigger (Bybit/OKX/KuCoin-style): the fee
     reduces the price-move buffer directly, because the exchange
     builds it into the liquidation formula itself.
   - Fee NOT counted in the trigger (Binance/MEXC-isolated-style):
     the fee is deducted from remaining margin only AFTER
     liquidation starts. It does NOT move the trigger price, so it
     must NOT be subtracted from the real buffer — only shown as a
     separate "additional loss at liquidation" line.
   Funding is always subtracted from the buffer either way, since
   accumulated funding payments reduce available margin regardless
   of how the exchange treats fees.
   ============================================================ */

let state = { side: 'long', feeInTrigger: false };

const btnLong = document.getElementById('btnLong');
const btnShort = document.getElementById('btnShort');
btnLong.addEventListener('click', () => { state.side='long'; btnLong.classList.add('active'); btnShort.classList.remove('active'); calculate(); });
btnShort.addEventListener('click', () => { state.side='short'; btnShort.classList.add('active'); btnLong.classList.remove('active'); calculate(); });

const btnFeeYes = document.getElementById('btnFeeYes');
const btnFeeNo = document.getElementById('btnFeeNo');
function setFeeInTrigger(val){
  state.feeInTrigger = val;
  btnFeeYes.classList.toggle('active', val === true);
  btnFeeNo.classList.toggle('active', val === false);
  document.getElementById('clearanceFeeField').style.display = val ? 'none' : 'block';
  calculate();
}
btnFeeYes.addEventListener('click', () => setFeeInTrigger(true));
btnFeeNo.addEventListener('click', () => setFeeInTrigger(false));

document.querySelectorAll('.funding-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('fundingIntervalInput').value = btn.dataset.hours;
    calculate();
  });
});

const holdSlider = document.getElementById('holdSlider'); // 0–168 hours, plain
function formatHours(h){
  if (h < 24) return h + 'h';
  const days = h / 24;
  return (days % 1 === 0 ? days : days.toFixed(1)) + 'd';
}
holdSlider.addEventListener('input', () => {
  document.getElementById('holdOut').textContent = '— ' + formatHours(parseInt(holdSlider.value, 10));
  calculate();
});

[
  'marginInput','leverageInput','mmrInput','feeInput','clearanceFeeInput',
  'fundingRateInput','fundingIntervalInput','priceInput'
].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', calculate);
});

function findLeverageWarning(leverage){
  if (leverage > 100){
    return `<div class="warn-box">${leverage}x is very high — most exchanges cap leverage well below this for anything but the smallest positions. Double-check this is really available for your position size.</div>`;
  }
  return '';
}

function riskLabel(realPct){
  if (realPct >= 5) return { cls: 'low', text: 'Low risk' };
  if (realPct >= 2) return { cls: 'moderate', text: 'Moderate risk' };
  if (realPct >= 0.5) return { cls: 'high', text: 'High risk' };
  return { cls: 'extreme', text: 'Extreme risk' };
}

let lastResult = null; // used by the copy/share buttons

function calculate(){
  const margin = parseFloat(document.getElementById('marginInput').value) || 0;
  const leverage = parseFloat(document.getElementById('leverageInput').value) || 1;
  const mmrRaw = document.getElementById('mmrInput').value.trim();
  const mmrMissing = mmrRaw === ''; // exchange pages leave this blank on purpose — never assume 0
  const mmrPct = parseFloat(mmrRaw) || 0;
  const feePct = parseFloat(document.getElementById('feeInput').value) || 0;
  const clearanceFeePct = parseFloat(document.getElementById('clearanceFeeInput').value) || 0;
  const fundingRatePct = parseFloat(document.getElementById('fundingRateInput').value) || 0;
  const fundingIntervalHours = parseFloat(document.getElementById('fundingIntervalInput').value) || 8;
  const price = parseFloat(document.getElementById('priceInput').value) || 0;
  const holdHours = parseInt(holdSlider.value, 10);

  document.getElementById('leverageWarning').innerHTML = findLeverageWarning(leverage);

  const notional = margin * leverage;
  const maintenanceMarginUsd = notional * (mmrPct / 100);

  document.getElementById('notionalOut').textContent = 'Notional $' + notional.toLocaleString('en-US', {maximumFractionDigits:0});
  document.getElementById('scPosition').textContent = '$' + notional.toLocaleString('en-US', {maximumFractionDigits:0});
  document.getElementById('scInitialMargin').textContent = '$' + margin.toLocaleString('en-US', {maximumFractionDigits:0});
  document.getElementById('scMaintMargin').textContent = mmrMissing ? '—' : ('$' + maintenanceMarginUsd.toLocaleString('en-US', {maximumFractionDigits:2}));

  const intervals = fundingIntervalHours > 0 ? Math.floor(holdHours / fundingIntervalHours) : 0;
  document.getElementById('fundingIntervalsOut').textContent =
    `${intervals}× funding payment${intervals === 1 ? '' : 's'} within the selected holding period (every ${fundingIntervalHours}h)`;

  const sideSign = state.side === 'long' ? 1 : -1;
  const fundingImpact = fundingRatePct * sideSign * intervals; // percentage points
  const openCloseFeePct = feePct * 2; // open + close

  const naive = 100 / leverage;
  document.getElementById('naiveOut').textContent = naive.toFixed(2) + '%';

  if (mmrMissing){
    // Never silently treat a blank MMR as 0 — that would understate risk,
    // exactly what this site exists to avoid. Show a waiting state instead.
    const riskEl = document.getElementById('riskBadge');
    riskEl.textContent = 'Enter MMR to see risk';
    riskEl.className = 'risk-badge';
    document.getElementById('pathBadge').textContent = 'waiting for input';
    const riskBand = document.getElementById('riskBand');
    if (riskBand){ riskBand.removeAttribute('data-risk'); riskBand.setAttribute('data-state', 'waiting'); }
    document.getElementById('realOut').textContent = '—';
    const dir0 = state.side === 'long' ? -1 : 1;
    document.getElementById('naivePriceOut').textContent = price > 0 ? ('Liq. at ' + formatPrice(price * (1 + dir0 * naive / 100))) : '';
    document.getElementById('realPriceOut').textContent = "Add your pair's MMR above to calculate";
    document.getElementById('bufferBar').style.width = '0%';
    document.getElementById('dtFill').style.width = '0%';
    document.getElementById('liqMarker').style.left = '0%';
    document.getElementById('entryLabel').textContent = 'Entry';
    document.getElementById('liqLabel').textContent = 'Liq.';
    const tbl = document.getElementById('breakdownTable');
    tbl.innerHTML = '';
    const row = (a,b) => { const tr=document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; return tr; };
    tbl.appendChild(row('Assumed (1/leverage)', naive.toFixed(3) + '%'));
    tbl.appendChild(row('Maintenance margin rate', 'enter above'));
    const totalTr = row('Real buffer', '—'); totalTr.className = 'total';
    tbl.appendChild(totalTr);
    lastResult = null;
    return;
  }
  const riskBandEl = document.getElementById('riskBand');
  if (riskBandEl) riskBandEl.removeAttribute('data-state');

  const feeBufferImpact = state.feeInTrigger ? openCloseFeePct : 0;
  const real0 = naive - mmrPct - feeBufferImpact - fundingImpact;
  const real = Math.min(naive, Math.max(0, real0));

  const breakdownRows = [
    ['Assumed (1/leverage)', naive.toFixed(3) + '%'],
    ['Maintenance margin rate', '−' + mmrPct.toFixed(3) + '%'],
  ];
  if (state.feeInTrigger){
    breakdownRows.push(['Opening + closing fee (in trigger)', '−' + openCloseFeePct.toFixed(3) + '%']);
  }
  breakdownRows.push(['Funding (' + intervals + '×, ' + state.side + ')', (fundingImpact >= 0 ? '−' : '+') + Math.abs(fundingImpact).toFixed(3) + '%']);

  document.getElementById('pathBadge').textContent = state.feeInTrigger ? 'Fee in trigger' : 'Fee after trigger';
  document.getElementById('realOut').textContent = real.toFixed(2) + '%';
  document.getElementById('bufferBar').style.width = ((real / naive) * 100).toFixed(1) + '%';

  const risk = riskLabel(real);
  const riskEl = document.getElementById('riskBadge');
  riskEl.textContent = risk.text;
  riskEl.className = 'risk-badge ' + risk.cls;
  const riskBand = document.getElementById('riskBand');
  if (riskBand) riskBand.setAttribute('data-risk', risk.cls);

  const dir = state.side === 'long' ? -1 : 1;
  let naivePrice = 0, realPrice = 0;
  if (price > 0){
    naivePrice = price * (1 + dir * naive / 100);
    realPrice = price * (1 + dir * real / 100);
    document.getElementById('naivePriceOut').textContent = 'Liq. at ' + formatPrice(naivePrice);
    document.getElementById('realPriceOut').textContent = 'Liq. at ' + formatPrice(realPrice);
  } else {
    document.getElementById('naivePriceOut').textContent = '';
    document.getElementById('realPriceOut').textContent = '';
  }

  // Distance visual: Entry marker at the left, real-liquidation marker
  // positioned proportionally along the naive-to-real range.
  const dv = document.getElementById('distanceVisual');
  const fillPct = naive > 0 ? Math.min(100, (real / naive) * 100) : 0;
  document.getElementById('dtFill').style.width = fillPct + '%';
  document.getElementById('liqMarker').style.left = fillPct + '%';
  document.getElementById('entryLabel').textContent = price > 0 ? ('Entry ' + formatPrice(price)) : 'Entry';
  document.getElementById('liqLabel').textContent = price > 0 ? ('Liq. ' + formatPrice(realPrice)) : ('Liq. ' + real.toFixed(2) + '%');

  const tbl = document.getElementById('breakdownTable');
  tbl.innerHTML = '';
  breakdownRows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r[0]}</td><td>${r[1]}</td>`;
    tbl.appendChild(tr);
  });
  const totalTr = document.createElement('tr');
  totalTr.className = 'total';
  totalTr.innerHTML = `<td>Real buffer</td><td>${real.toFixed(3)}%</td>`;
  tbl.appendChild(totalTr);

  if (!state.feeInTrigger && clearanceFeePct > 0){
    const feeTr = document.createElement('tr');
    feeTr.innerHTML = `<td style="color:var(--danger)">Additional loss at liquidation (fee, doesn't move the trigger)</td><td style="color:var(--danger)">≈ ${clearanceFeePct.toFixed(2)}% of $${notional.toLocaleString('en-US')}</td>`;
    tbl.appendChild(feeTr);
  }

  lastResult = { naive, real, leverage, side: state.side };
}

function formatPrice(p){
  if (p < 0.01) return '$' + p.toFixed(8);
  return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/* ---------- Copy / Share result ---------- */
function resultSummary(){
  if (!lastResult) return '';
  return `I assumed a ${lastResult.naive.toFixed(1)}% buffer to liquidation at ${lastResult.leverage}x — turns out it's only ${lastResult.real.toFixed(1)}%. Check your own: https://www.liquidationbuffer.com/`;
}

const copyBtn = document.getElementById('copyResultBtn');
if (copyBtn){
  copyBtn.addEventListener('click', () => {
    const text = resultSummary();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.classList.add('copied');
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Copied ✓';
      setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.textContent = original; }, 1800);
    });
  });
}

const shareBtn = document.getElementById('shareXBtn');
if (shareBtn){
  shareBtn.addEventListener('click', () => {
    const text = resultSummary();
    if (!text) return;
    const url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener');
  });
}

// Initial fee-in-trigger state comes from whichever button the page's own
// HTML marks active (exchange pages pre-select "Yes" or "No" accordingly),
// not a hardcoded default — otherwise every page would reset to "No".
setFeeInTrigger(btnFeeYes.classList.contains('active'));
