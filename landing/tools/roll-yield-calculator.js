/*!
 * Roll yield / contango cost calculator — pure client-side, no data feed.
 * Answers "how much am I losing/gaining by rolling this futures position?"
 */
(function () {
  function fmtPct(x) {
    var sign = x >= 0 ? '+' : '';
    return sign + x.toFixed(2) + '%';
  }

  function calc() {
    var front = parseFloat(document.getElementById('rycFront').value);
    var deferred = parseFloat(document.getElementById('rycDeferred').value);
    var months = parseFloat(document.getElementById('rycMonths').value);
    var out = document.getElementById('rycResult');

    if (!isFinite(front) || !isFinite(deferred) || !isFinite(months) || front <= 0 || months <= 0) {
      out.innerHTML = '<p class="ryc-hint">Enter a front-month price, a deferred-month price, and the number of months between them.</p>';
      return;
    }

    var spread = deferred - front;
    var spreadPct = (spread / front) * 100;
    var annualized = spreadPct * (12 / months);
    var structure = spread > 0 ? 'contango' : spread < 0 ? 'backwardation' : 'flat';
    var rollDirection = spread > 0 ? 'costs' : spread < 0 ? 'earns' : 'neither costs nor earns';

    out.innerHTML =
      '<div class="ryc-card">' +
      '<div class="ryc-row"><span>Spread (deferred − front)</span><strong>' + spread.toFixed(4) + '</strong></div>' +
      '<div class="ryc-row"><span>Spread as % of front price</span><strong>' + fmtPct(spreadPct) + '</strong></div>' +
      '<div class="ryc-row"><span>Annualized (× 12 / months)</span><strong>' + fmtPct(annualized) + '</strong></div>' +
      '<div class="ryc-row"><span>Curve structure</span><strong>' + structure + '</strong></div>' +
      '</div>' +
      '<p class="ryc-explain">Holding a long position and rolling from the front contract to the deferred one ' +
      rollDirection + ' roughly <strong>' + fmtPct(spreadPct) + '</strong> each roll — ' +
      (annualized !== 0 ? 'about ' + fmtPct(annualized) + ' annualized if this spread held steady all year. ' : '') +
      (structure === 'contango'
        ? 'In contango, a long roll sells low and buys high — a persistent drag independent of where the spot price goes.'
        : structure === 'backwardation'
          ? 'In backwardation, a long roll sells high and buys low — a tailwind independent of where the spot price goes.'
          : 'The curve is essentially flat between these two contracts right now.') +
      '</p>';
  }

  function init() {
    var btn = document.getElementById('rycCalc');
    if (!btn) return;
    btn.addEventListener('click', calc);
    ['rycFront', 'rycDeferred', 'rycMonths'].forEach(function (id) {
      document.getElementById(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') calc();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
