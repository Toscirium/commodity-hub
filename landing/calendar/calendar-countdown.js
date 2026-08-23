/*!
 * Computes "next occurrence" for the site's fixed-weekday recurring
 * reports client-side (COT: Friday, EIA petroleum: Wednesday, EIA nat
 * gas storage: Thursday) — all in US Eastern time, since that's the
 * exchanges' and agencies' publication timezone regardless of visitor
 * location. No live data involved, just calendar math.
 */
(function () {
  var TARGETS = {
    cotNext: { weekday: 5, hour: 15, minute: 30 },       // Friday, ~3:30pm ET
    eiaPetroleumNext: { weekday: 3, hour: 10, minute: 30 }, // Wednesday, 10:30am ET
    eiaGasNext: { weekday: 4, hour: 10, minute: 30 },     // Thursday, 10:30am ET
  };

  function nowInEastern() {
    // Intl gives us the ET wall-clock fields without a timezone library.
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    var parts = {};
    fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      weekday: weekdayMap[parts.weekday],
      hour: parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
      minute: parseInt(parts.minute, 10),
    };
  }

  function nextOccurrence(target) {
    var et = nowInEastern();
    var daysAhead = (target.weekday - et.weekday + 7) % 7;
    var isToday = daysAhead === 0;
    var alreadyPassedToday = isToday &&
      (et.hour > target.hour || (et.hour === target.hour && et.minute >= target.minute));
    if (alreadyPassedToday) daysAhead = 7;

    if (daysAhead === 0) return 'today, ~' + formatTime(target);
    if (daysAhead === 1) return 'tomorrow, ~' + formatTime(target);
    var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return 'this ' + dayNames[target.weekday] + ', ~' + formatTime(target);
  }

  function formatTime(target) {
    var h12 = target.hour % 12 === 0 ? 12 : target.hour % 12;
    var ampm = target.hour < 12 ? 'am' : 'pm';
    var mm = target.minute < 10 ? '0' + target.minute : target.minute;
    return h12 + ':' + mm + ampm + ' ET';
  }

  function init() {
    Object.keys(TARGETS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = nextOccurrence(TARGETS[id]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
