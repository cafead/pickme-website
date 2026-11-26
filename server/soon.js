'use strict';
// "Opening soon" page: shown to visitors on the public pages until the launch time,
// then the server serves the normal website again by itself (and an open page reloads at zero).
// Owner and staff who are logged in, guests with a table QR (?table=N) and anyone who opened
// the private preview link (/preview/<PREVIEW_KEY>) see the real website before the launch.

const NP_TZ = 'Asia/Kathmandu';
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const font = (v, d) => (/^[A-Za-z0-9 ]{2,40}$/.test(v || '') ? v : d);
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function when(launch) {
  const d = new Date(launch);
  return {
    day: d.toLocaleDateString('en-GB', { timeZone: NP_TZ, weekday: 'long', day: 'numeric', month: 'long' }),
    year: d.toLocaleDateString('en-GB', { timeZone: NP_TZ, year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { timeZone: NP_TZ, hour: 'numeric', minute: '2-digit' }),
  };
}

// The opening ends at closing time that day (7 PM), or 4 hours after the start.
function endOf(c, launch) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((c.brand && c.brand.close) || '');
  const day = new Date(launch + 5.75 * 3600e3).toISOString().slice(0, 10);
  const close = m ? Date.parse(`${day}T${m[1].padStart(2, '0')}:${m[2]}:00+05:45`) : NaN;
  return close > launch ? close : launch + 4 * 3600e3;
}

function calendar(c, base, launch) {
  const b = c.brand || {};
  const end = endOf(c, launch);
  const title = `Grand opening: ${b.name || 'Pick Me Cafe'}`;
  const details = `Join us for the opening of ${b.name || 'Pick Me Cafe'}. ${base}/`;
  const google = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(title)}&dates=${icsDate(launch)}/${icsDate(end)}`
    + `&details=${encodeURIComponent(details)}&location=${encodeURIComponent(b.address || '')}`;
  const fold = (s) => s.replace(/[\\;,]/g, (x) => '\\' + x).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pick Me Cafe//Opening//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:opening-${launch}@pickmecafe`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(launch)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${fold(title)}`,
    `DESCRIPTION:${fold(details)}`,
    `LOCATION:${fold(b.address || '')}`,
    `URL:${base}/`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${fold(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  return { google, ics };
}

function soonPage({ c, base, launch, absUrl, cafeJson }) {
  const b = c.brand || {};
  const h = c.hero || {};
  const t = c.theme || {};
  const seo = c.seo || {};
  const w = when(launch);
  const name = b.name || 'Pick Me Cafe';
  const image = h.image || seo.image || '';
  const k = (c.crops || {})[image] || {};
  const pos = `${Number.isFinite(+k.x) ? +k.x : 50}% ${Number.isFinite(+k.y) ? +k.y : 50}%`;
  const fd = font(t.fontDisplay, 'Marcellus');
  const fs = font(t.fontScript, 'Allura');
  const fb = font(t.fontBody, 'Jost');
  const fam = [...new Set([fd, fs, fb])].map((f) => 'family=' + f.replace(/ /g, '+') + (f === fb ? ':wght@300;400;500' : '')).join('&');
  const wa = String(b.whatsapp || b.phone || '').replace(/\D/g, '');
  const waNum = wa.length === 10 ? '977' + wa : wa;
  const map = /^https?:\/\//.test((c.visit || {}).mapLink || '') ? c.visit.mapLink : '';
  const line = h.line || 'Coffee • Cheesecake • Mocktails';
  const title = `${name} opens ${w.day.replace(/^(\w+) /, '$1, ')}, ${w.time}`;
  const desc = `You're invited to the grand opening of ${name}, ${b.address || 'Hetauda'}. ${line.replace(/\s*•\s*/g, ', ')}. ${w.day}, ${w.time}.`;
  const cal = calendar(c, base, launch);
  const ogImage = absUrl(base, seo.image || image);
  const glints = Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 37 + 11) % 100}%;--y:${(i * 53 + 7) % 62}%;--d:${(i * 0.73) % 5}s;--s:${0.6 + ((i * 7) % 5) / 6}"></i>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(base)}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(base)}/">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#2A1D12">
<link rel="icon" href="/img/logo.png">
<link rel="apple-touch-icon" href="/img/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fam}&display=swap">
${image ? `<link rel="preload" as="image" href="${esc(image)}">` : ''}
${cafeJson ? `<script type="application/ld+json">${cafeJson}</script>` : ''}
<style>
:root{--bg:#FBF6EE;--ink:#3B2A1A;--muted:#6F5B48;--accent:#8C6A2E;--gold:#C4A265;--gold2:#E3CB93;--deep:#2A1D12;
--fd:"${fd}","Cormorant Garamond",Georgia,serif;--fs:"${fs}","Brush Script MT",cursive;--fb:"${fb}","Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--deep)}
body{color:var(--ink);font:400 16px/1.5 var(--fb);-webkit-font-smoothing:antialiased;min-height:100svh;display:grid;grid-template-rows:minmax(32svh,1fr) auto;overflow-x:hidden}
a{color:inherit}
.bg{position:fixed;inset:0;overflow:hidden;z-index:0;background:var(--deep)}
.bg img{width:100%;height:100%;object-fit:cover;object-position:${pos};transform:scale(1.04);animation:drift 26s ease-in-out infinite alternate}
.bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(42,29,18,.25) 0%,rgba(42,29,18,.05) 30%,rgba(42,29,18,.55) 70%,rgba(42,29,18,.9) 100%)}
@keyframes drift{from{transform:scale(1.04) translate3d(0,0,0)}to{transform:scale(1.14) translate3d(-1.5%,-1%,0)}}
.frame{position:fixed;inset:10px;border:1px solid rgba(227,203,147,.55);border-radius:22px;pointer-events:none;z-index:1}
.frame::before,.frame::after{content:"";position:absolute;width:9px;height:9px;border-radius:50%;background:var(--gold2);top:-5px;left:50%;margin-left:-4.5px;box-shadow:0 0 12px rgba(227,203,147,.9)}
.frame::after{top:auto;bottom:-5px}
.glints{position:fixed;inset:0;z-index:1;pointer-events:none}
.glints i{position:absolute;left:var(--x);top:var(--y);width:6px;height:6px;transform:scale(var(--s));opacity:0;animation:twinkle 5s var(--d) ease-in-out infinite}
.glints i::before,.glints i::after{content:"";position:absolute;inset:0;background:radial-gradient(circle,#fff6dc 0,rgba(227,203,147,.8) 35%,transparent 70%);border-radius:50%}
.glints i::after{inset:-6px 2.5px;border-radius:2px;background:linear-gradient(transparent,rgba(255,240,205,.9),transparent)}
@keyframes twinkle{0%,100%{opacity:0}50%{opacity:.9}}
.top{position:relative;z-index:2;display:flex;justify-content:center;align-items:flex-start;padding:calc(env(safe-area-inset-top) + 28px) 20px 0}
.tag{font:500 .72rem/1 var(--fb);letter-spacing:.32em;text-transform:uppercase;color:#FFF7E6;padding:9px 16px 9px 19px;border:1px solid rgba(227,203,147,.7);border-radius:99px;background:rgba(42,29,18,.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
main{position:relative;z-index:2;margin:0 10px 10px;background:linear-gradient(180deg,rgba(255,253,249,.97),rgba(251,246,238,.98));border-radius:28px 28px 22px 22px;padding:58px 22px calc(env(safe-area-inset-bottom) + 24px);text-align:center;box-shadow:0 -20px 60px rgba(0,0,0,.35)}
main::before{content:"";position:absolute;inset:8px;border:1px solid rgba(196,162,101,.55);border-radius:22px 22px 16px 16px;pointer-events:none}
.logo{position:absolute;left:50%;top:0;width:88px;height:88px;margin:-44px 0 0 -44px;border-radius:50%;background:#FFFDF9;padding:12px;box-shadow:0 0 0 1px rgba(196,162,101,.7),0 0 0 6px rgba(255,253,249,.9),0 0 0 7px rgba(196,162,101,.5),0 10px 28px rgba(0,0,0,.25);object-fit:contain}
.script{font:400 2.45rem/1 var(--fs);color:var(--accent);margin:0 0 2px}
h1{font:400 clamp(2.1rem,9vw,3.1rem)/1.05 var(--fd);letter-spacing:.04em;margin:0;color:var(--ink);text-transform:uppercase}
.line{margin:8px 0 0;font-size:clamp(.68rem,2.9vw,.82rem);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.rule{display:flex;align-items:center;gap:12px;margin:20px auto 12px;max-width:330px;font:500 .74rem/1 var(--fb);letter-spacing:.34em;text-transform:uppercase;color:var(--accent)}
.rule::before,.rule::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--gold))}
.rule::after{background:linear-gradient(270deg,transparent,var(--gold))}
.when{margin:0;font:400 1.35rem/1.25 var(--fd);color:var(--ink)}
.when span{display:block;margin-top:2px;font:500 .95rem/1.3 var(--fb);letter-spacing:.12em;color:var(--accent)}
.count{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:340px;margin:18px auto 20px}
.count div{background:#FFFDF9;border:1px solid rgba(196,162,101,.5);border-radius:14px;padding:10px 0 8px;box-shadow:inset 0 1px 0 #fff,0 6px 16px rgba(140,106,46,.1)}
.count b{display:block;font:400 1.9rem/1 var(--fd);color:var(--ink);font-variant-numeric:tabular-nums}
.count small{display:block;margin-top:5px;font-size:.62rem;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.open-now{display:none;margin:18px 0 20px;font:400 2rem/1 var(--fs);color:var(--accent)}
.done .count{display:none}.done .open-now{display:block}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:340px;margin:0 auto}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 14px;border-radius:99px;border:1px solid var(--accent);color:var(--accent);text-decoration:none;font:500 .9rem/1 var(--fb);letter-spacing:.02em;white-space:nowrap;background:transparent;-webkit-tap-highlight-color:transparent}
.btn.gold{background:linear-gradient(180deg,#A07B38,#8C6A2E);border-color:#7C5D27;color:#FFF9EC;box-shadow:0 8px 20px rgba(140,106,46,.3)}
.btn svg{width:18px;height:18px;flex:none}
.btn:active{transform:translateY(1px)}
.btn.wide{grid-column:1/-1}
@media (max-width:380px){.btn{font-size:.84rem;padding:0 10px;gap:6px}.btn svg{width:16px;height:16px}.count b{font-size:1.65rem}}
.info{margin:18px 0 0;font-size:.85rem;line-height:1.6;color:var(--muted)}
.info a{color:var(--accent);text-decoration:none;font-weight:500}
@media (min-width:900px){
  body{grid-template-rows:1fr;grid-template-columns:1fr minmax(420px,460px);align-items:center;padding:40px 64px}
  .bg::after{background:linear-gradient(90deg,rgba(42,29,18,.05) 30%,rgba(42,29,18,.55) 75%,rgba(42,29,18,.75) 100%)}
  .frame{inset:18px}
  .top{position:fixed;left:64px;top:52px;padding:0}
  main{grid-column:2;margin:0;border-radius:26px;padding:66px 34px 34px}
  main::before{border-radius:20px}
}
@media (prefers-reduced-motion:reduce){.bg img,.glints i{animation:none}.glints{display:none}}
</style>
</head>
<body>
<div class="bg" aria-hidden="true">${image ? `<img src="${esc(image)}" alt="">` : ''}</div>
<div class="frame" aria-hidden="true"></div>
<div class="glints" aria-hidden="true">${glints}</div>
<div class="top"><span class="tag">Opening soon</span></div>
<main id="card">
  <img class="logo" src="${esc(b.logo || '/img/logo.png')}" alt="${esc(name)} logo">
  <p class="script">You're invited</p>
  <h1>${esc(name)}</h1>
  <p class="line">${esc(line)}</p>
  <div class="rule">Grand opening</div>
  <p class="when">${esc(w.day)} ${esc(w.year)}<span>${esc(w.time)} · Nepal time</span></p>
  <div class="count" id="count" role="timer" aria-live="off">
    <div><b data-u="d">00</b><small>Days</small></div>
    <div><b data-u="h">00</b><small>Hours</small></div>
    <div><b data-u="m">00</b><small>Mins</small></div>
    <div><b data-u="s">00</b><small>Secs</small></div>
  </div>
  <p class="open-now">We're open! Welcome in…</p>
  <div class="btns">
    <a class="btn gold${map ? '' : ' wide'}" id="cal" href="/opening.ics" data-google="${esc(cal.google)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>Save the date</a>
    ${map ? `<a class="btn" href="${esc(map)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>Directions</a>` : ''}
  </div>
  <p class="info">${esc(b.address || '')}<br>${esc(b.hoursText || '')}${waNum ? ` · <a href="https://wa.me/${esc(waNum)}" target="_blank" rel="noopener">WhatsApp ${esc(b.phone || wa)}</a>` : ''}</p>
</main>
<script>
(function(){
  var launch=${launch}, skew=${Date.now()}-Date.now(), card=document.getElementById('card'), done=false;
  var cal=document.getElementById('cal');
  if(/android/i.test(navigator.userAgent)){cal.href=cal.getAttribute('data-google');cal.target='_blank';cal.rel='noopener';}
  var cells={};[].forEach.call(document.querySelectorAll('[data-u]'),function(el){cells[el.getAttribute('data-u')]=el;});
  function pad(n){return n<10?'0'+n:''+n;}
  var timer;
  function tick(){
    clearTimeout(timer);
    var left=launch-(Date.now()+skew);
    if(left<=0){
      if(!done){done=true;card.classList.add('done');setTimeout(function(){location.reload();},1500);}
      return;
    }
    var s=Math.floor(left/1000);
    cells.d.textContent=pad(Math.floor(s/86400));cells.h.textContent=pad(Math.floor(s%86400/3600));
    cells.m.textContent=pad(Math.floor(s%3600/60));cells.s.textContent=pad(s%60);
    timer=setTimeout(tick,1000-((Date.now()+skew)%1000)+20);
  }
  tick();
  // Phones pause timers in the background: check again when the page comes back.
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&!done)tick();});
})();
</script>
</body>
</html>`;
}

module.exports = { soonPage, calendar };
