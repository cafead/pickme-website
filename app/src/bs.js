// Bikram Sambat (Nepali) dates, the same table the website uses (BS 2082 to 2090).

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

export const BS = { toBS, toAD, todayAD, label, MONTHS, WEEK, AD_MONTHS };
