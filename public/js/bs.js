/*
 * Bikram Sambat (Nepali) calendar: conversion and a small date picker.
 * Month lengths cover BS 2082 to 2090 (April 2025 to April 2034).
 * To extend, add more years to DAYS.
 */
(function () {
  'use strict';
  var DAYS = {
    2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
    2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
    2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
    2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
    2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
    2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
    2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
    2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30]
  };
  var FIRST = 2082, LAST = 2090;
  var EPOCH = Date.UTC(2025, 3, 14); // 1 Baisakh 2082
  var DAY = 864e5;
  var MONTHS = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
  var WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  // AD "YYYY-MM-DD" -> {y, m (1-12), d} in BS, or null if out of range
  function toBS(ad) {
    var p = ad.split('-').map(Number);
    var n = Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - EPOCH) / DAY);
    if (n < 0) return null;
    for (var y = FIRST; y <= LAST; y++) {
      for (var m = 0; m < 12; m++) {
        if (n < DAYS[y][m]) return { y: y, m: m + 1, d: n + 1 };
        n -= DAYS[y][m];
      }
    }
    return null;
  }
  // BS y, m (1-12), d -> AD "YYYY-MM-DD"
  function toAD(y, m, d) {
    var n = d - 1;
    for (var yy = FIRST; yy < y; yy++) for (var i = 0; i < 12; i++) n += DAYS[yy][i];
    for (var j = 0; j < m - 1; j++) n += DAYS[y][j];
    return new Date(EPOCH + n * DAY).toISOString().slice(0, 10);
  }
  function todayAD() { // today's date in Nepal
    return new Date(Date.now() + 345 * 60e3).toISOString().slice(0, 10);
  }
  function label(ad) {
    var b = toBS(ad);
    if (!b) return ad;
    var p = ad.split('-').map(Number);
    var wd = WEEK[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return b.d + ' ' + MONTHS[b.m - 1] + ' ' + b.y + ' (' + wd + ', ' + p[2] + ' ' + AD_MONTHS[p[1] - 1] + ')';
  }

  /*
   * mount(el, { name, value })
   * Turns el into a picker. Adds hidden inputs <name> (AD date) and <name>Bs (label).
   */
  function mount(el, opts) {
    var min = todayAD();
    var value = opts.value && opts.value >= min ? opts.value : '';
    var view = toBS(value || min) || { y: FIRST, m: 1 };
    var open = false;
    el.classList.add('bsp');

    function draw() {
      var first = toAD(view.y, view.m, 1);
      var fp = first.split('-').map(Number);
      var lead = new Date(Date.UTC(fp[0], fp[1] - 1, fp[2])).getUTCDay();
      var cells = '';
      for (var i = 0; i < lead; i++) cells += '<span></span>';
      for (var d = 1; d <= DAYS[view.y][view.m - 1]; d++) {
        var ad = toAD(view.y, view.m, d);
        var cls = (ad === value ? ' is-on' : '') + (ad === min ? ' is-today' : '');
        cells += '<button type="button" class="bsp-day' + cls + '" data-ad="' + ad + '"' + (ad < min ? ' disabled' : '') + '>'
          + d + '<small>' + Number(ad.slice(8)) + '</small></button>';
      }
      var canPrev = toAD(view.y, view.m, 1) > min;
      var canNext = !(view.y === LAST && view.m === 12);
      el.innerHTML =
        '<input type="hidden" name="' + opts.name + '" value="' + value + '">'
        + '<input type="hidden" name="' + opts.name + 'Bs" value="' + (value ? label(value) : '') + '">'
        + '<button type="button" class="bsp-btn" aria-haspopup="dialog" aria-expanded="' + open + '">'
        + '<span>' + (value ? label(value) : 'Choose a date') + '</span>'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></button>'
        + (open
          ? '<div class="bsp-pop" role="dialog" aria-label="Choose a date">'
            + '<div class="bsp-head"><button type="button" class="bsp-nav" data-nav="-1" aria-label="Previous month"' + (canPrev ? '' : ' disabled') + '>‹</button>'
            + '<strong>' + MONTHS[view.m - 1] + ' ' + view.y + '</strong>'
            + '<button type="button" class="bsp-nav" data-nav="1" aria-label="Next month"' + (canNext ? '' : ' disabled') + '>›</button></div>'
            + '<div class="bsp-grid bsp-week">' + WEEK.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>'
            + '<div class="bsp-grid">' + cells + '</div>'
            + '<p class="bsp-note">Nepali date, with the English date below it.</p></div>'
          : '');
    }
    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.classList.contains('bsp-btn')) { open = !open; draw(); return; }
      if (t.dataset.nav) {
        view.m += Number(t.dataset.nav);
        if (view.m < 1) { view.m = 12; view.y--; }
        if (view.m > 12) { view.m = 1; view.y++; }
        draw();
        return;
      }
      if (t.dataset.ad) {
        value = t.dataset.ad;
        open = false;
        draw();
        el.dispatchEvent(new CustomEvent('bs-change', { bubbles: true, detail: value }));
      }
    });
    document.addEventListener('click', function outside(e) {
      if (!el.isConnected) { document.removeEventListener('click', outside); return; }
      if (open && e.target.isConnected && !el.contains(e.target)) { open = false; draw(); }
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) { open = false; draw(); el.querySelector('.bsp-btn').focus(); }
    });
    draw();
  }

  window.BS = { toBS: toBS, toAD: toAD, todayAD: todayAD, label: label, mount: mount, MONTHS: MONTHS };
})();
