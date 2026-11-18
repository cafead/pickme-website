# Draws the photo border themes for Pick Me Cafe: SVG files plus borders.css.
import math, os, random, sys
OUT = sys.argv[1]
IMG = os.path.join(OUT, 'img', 'borders'); os.makedirs(IMG, exist_ok=True)
random.seed(7)

def svg(name, w, h, body):
    open(os.path.join(IMG, name + '.svg'), 'w').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>')

def flip(name, w, h, body, x=False, y=False):
    sx, sy = (-1 if x else 1), (-1 if y else 1)
    tx, ty = (w if x else 0), (h if y else 0)
    svg(name, w, h, f'<g transform="translate({tx} {ty}) scale({sx} {sy})">{body}</g>')

def star(cx, cy, r, fill, rot=-90, inner=.45):
    pts = []
    for i in range(10):
        a = math.radians(rot + i * 36)
        rr = r if i % 2 == 0 else r * inner
        pts.append(f'{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}')
    return f'<polygon points="{" ".join(pts)}" fill="{fill}"/>'

def heart(cx, cy, s, fill, rot=0):
    return (f'<path transform="translate({cx} {cy}) rotate({rot}) scale({s}) translate(-12 -14)" fill="{fill}" '
            'd="M12 21s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5c0 5.1-7 9.5-7 9.5z"/>')

def quad(t, p0, p1, p2):
    return ((1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t*t*p2[0], (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t*t*p2[1])

# --- gold: small diamond ornament for top and bottom centre
svg('gold-gem', 60, 20, '<path d="M0 10H22M38 10H60" stroke="#C4A265" stroke-width="1.2"/><path d="M30 2L38 10L30 18L22 10Z" fill="#FFFDF9" stroke="#C4A265" stroke-width="1.4"/><circle cx="30" cy="10" r="2.2" fill="#C4A265"/>')

# --- snow: snow cap along the top, and snowflakes
cap = ('<path d="M0 0H120V13C112 13 109 23 99 23C89 23 88 14 77 15C66 16 65 27 53 27C41 27 41 15 30 15C19 15 17 23 9 22C4 21 2 15 0 13Z" '
       'fill="#FFFFFF" stroke="#BFD8EA" stroke-width="1.6"/>')
dots = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFFFFF" stroke="#CFE3F0" stroke-width=".8"/>' for x, y, r in [(18, 32, 2.2), (64, 36, 1.6), (104, 32, 2)])
svg('snow-top', 120, 40, cap + dots)
arm = '<path d="M0 0V-24M0 -10L-6 -16M0 -10L6 -16M0 -18L-4 -22M0 -18L4 -22" stroke="#8FB8D6" stroke-width="2.4" stroke-linecap="round" fill="none"/>'
flake = ''.join(f'<g transform="rotate({a})">{arm}</g>' for a in range(0, 360, 60))
svg('snowflake', 80, 80, f'<g transform="translate(30 50)">{flake}</g><g transform="translate(64 18) scale(.5)">{flake}</g>')

# --- holly: leaves and berries
leaf = ('M0 0C6-6 10-4 12-10C16-6 20-8 24-14C26-8 32-8 36-12C36-4 42-2 46 0C40 4 40 8 44 14C38 12 34 16 32 22C28 16 22 18 18 22C16 16 10 14 4 16C6 10 2 6 0 0Z')
holly = (f'<path transform="translate(6 30) rotate(-20)" d="{leaf}" fill="#2E6B3A" stroke="#1E4D29" stroke-width="1.2"/>'
         f'<path transform="translate(36 8) rotate(55)" d="{leaf}" fill="#3C8048" stroke="#1E4D29" stroke-width="1.2"/>'
         '<path d="M14 26L44 22M42 14L40 46" stroke="#1E4D29" stroke-width="1" opacity=".5"/>'
         + ''.join(f'<circle cx="{x}" cy="{y}" r="6" fill="#C62828"/><circle cx="{x-2}" cy="{y-2}" r="1.8" fill="#FFB3B3"/>' for x, y in [(30, 30), (40, 36), (28, 40)]))
svg('holly-tl', 80, 80, holly)
flip('holly-br', 80, 80, holly, x=True, y=True)

# --- fairy lights: wire with glowing bulbs (tile of four colours)
def bulbs(colors, w):
    p0, p1, p2 = (0, 6), (w / 2, 30), (w, 6)
    out = f'<path d="M0 6Q{w/2} 30 {w} 6" stroke="#2F4A2F" stroke-width="2" fill="none"/>'
    n = len(colors)
    for i, col in enumerate(colors):
        x, y = quad((i + .5) / n, p0, p1, p2)
        out += (f'<g transform="translate({x:.1f} {y:.1f})"><circle cx="0" cy="12" r="10" fill="{col}" opacity=".25"/>'
                f'<rect x="-3" y="-1" width="6" height="6" rx="1" fill="#2F4A2F"/>'
                f'<ellipse cx="0" cy="12" rx="5" ry="8" fill="{col}"/><ellipse cx="-1.5" cy="9" rx="1.5" ry="3" fill="#fff" opacity=".7"/></g>')
    return out
svg('lights-top', 160, 44, bulbs(['#E53935', '#FDD835'], 80) + f'<g transform="translate(80 0)">{bulbs(["#43A047", "#1E88E5"], 80)}</g>')

# --- candy cane: bow for the top
svg('bow', 70, 40, '<path d="M35 20C20 4 6 6 8 16C10 26 24 26 35 20Z" fill="#C62828" stroke="#8E1B1B" stroke-width="1.5"/>'
    '<path d="M35 20C50 4 64 6 62 16C60 26 46 26 35 20Z" fill="#C62828" stroke="#8E1B1B" stroke-width="1.5"/>'
    '<path d="M33 22L24 38L30 36L33 40ZM37 22L46 38L40 36L37 40Z" fill="#B71C1C"/>'
    '<circle cx="35" cy="20" r="5" fill="#E53935" stroke="#8E1B1B" stroke-width="1.5"/>')

# --- candy canes crossed with a bow
def cane(x, y, r):
    d = 'M0 40V6A8 8 0 0 1 16 6V10'
    return (f'<g transform="translate({x} {y}) rotate({r})"><path d="{d}" stroke="#FFFFFF" stroke-width="7" fill="none" stroke-linecap="round"/>'
            f'<path d="{d}" stroke="#D32F2F" stroke-width="7" fill="none" stroke-dasharray="5 5" stroke-linecap="butt"/>'
            f'<path d="{d}" stroke="#00000022" stroke-width="7.6" fill="none" stroke-linecap="round" opacity=".25"/></g>')
bow_small = ('<g transform="translate(30 38) scale(.55)"><path d="M0 0C-15-16-29-14-27-4C-25 6-11 6 0 0Z" fill="#2E7D32"/>'
             '<path d="M0 0C15-16 29-14 27-4C25 6 11 6 0 0Z" fill="#2E7D32"/><circle r="5" fill="#43A047"/></g>')
candy_c = cane(14, 18, -20) + cane(34, 12, 22) + bow_small
svg('candy-tl', 70, 70, candy_c)
flip('candy-br', 70, 70, candy_c, x=True, y=True)

# --- spider web corner and hanging spider
web = ''
angles = [0, 18, 36, 54, 72, 90]
for a in angles:
    r = math.radians(a)
    web += f'<path d="M0 0L{78*math.cos(r):.1f} {78*math.sin(r):.1f}" stroke="#5E5E5E" stroke-width="1"/>'
for rad in [16, 30, 44, 58, 72]:
    pts = []
    for i, a in enumerate(angles):
        rr = rad * (0.92 if i % 2 else 1)
        pts.append((rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a))))
    d = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}' + ''.join(
        f'Q{(pts[i][0]+pts[i+1][0])/2*0.86:.1f} {(pts[i][1]+pts[i+1][1])/2*0.86:.1f} {pts[i+1][0]:.1f} {pts[i+1][1]:.1f}' for i in range(len(pts) - 1))
    web += f'<path d="{d}" stroke="#5E5E5E" stroke-width="1" fill="none"/>'
svg('web-tl', 80, 80, web)
legs = ''.join(f'<path d="M0 0Q{s*8} {d-4} {s*13} {d+4}" stroke="#1B1B1B" stroke-width="1.6" fill="none"/>' for s in (-1, 1) for d in (-4, 0, 4, 8))
svg('spider-tr', 60, 80, f'<path d="M30 0V46" stroke="#5E5E5E" stroke-width="1"/><g transform="translate(30 54)">{legs}<ellipse cx="0" cy="2" rx="7" ry="8" fill="#1B1B1B"/><circle cx="0" cy="-7" r="4.5" fill="#1B1B1B"/><circle cx="-1.6" cy="-8" r="1" fill="#F5A623"/><circle cx="1.6" cy="-8" r="1" fill="#F5A623"/></g>')

# --- pumpkins
def pumpkin(cx, cy, s):
    seg = ''.join(f'<ellipse cx="{cx+dx*s}" cy="{cy}" rx="{rx*s}" ry="{16*s}" fill="{c}" stroke="#B4500F" stroke-width="1.2"/>'
                  for dx, rx, c in [(-10, 9, '#E8741A'), (10, 9, '#E8741A'), (-4, 9, '#F28C28'), (4, 9, '#F28C28'), (0, 8, '#F7A03C')])
    face = (f'<path d="M{cx-8*s} {cy-3*s}l{4*s} {-5*s}l{4*s} {5*s}z M{cx+0*s} {cy-3*s}l{4*s} {-5*s}l{4*s} {5*s}z" fill="#3B1D05"/>'
            f'<path d="M{cx-9*s} {cy+5*s}Q{cx} {cy+13*s} {cx+9*s} {cy+5*s}l{-3*s} {2*s}l{-3*s} {-2*s}l{-3*s} {2*s}l{-3*s} {-2*s}l{-3*s} {2*s}z" fill="#3B1D05"/>')
    stem = f'<path d="M{cx-2*s} {cy-15*s}q{1*s} {-7*s} {6*s} {-9*s}l{1*s} {3*s}q{-4*s} {2*s} {-3*s} {6*s}z" fill="#4E6B22"/>'
    return stem + seg + face
svg('pumpkin-bl', 90, 70, pumpkin(32, 44, 1.25) + pumpkin(70, 54, .8))
flip('pumpkin-br', 90, 70, pumpkin(32, 44, 1.0), x=True)

# --- bats
bat = 'M0 6Q4 0 9 4Q10 1 12 3Q14 1 15 4Q20 0 24 6Q19 5 17 10Q15 8 12 11Q9 8 7 10Q5 5 0 6Z'
bats = ''.join(f'<path transform="translate({x} {y}) scale({s}) rotate({r})" d="{bat}" fill="#2B2033"/>' for x, y, s, r in [(8, 30, 1.6, -8), (40, 10, 1.1, 6), (56, 40, .9, -14)])
svg('bats-tr', 80, 70, bats)
flip('bats-tl', 80, 70, bats, x=True)

# --- hearts
hearts = heart(18, 20, 1.5, '#D81B60', -14) + heart(42, 12, .9, '#F06292', 12) + heart(14, 50, .8, '#F48FB1', -4) + heart(44, 38, .6, '#EC407A', 20)
svg('hearts-tl', 70, 70, hearts)
flip('hearts-br', 70, 70, hearts, x=True, y=True)

# --- rose petals
def petal(x, y, r, c, s=1):
    return f'<path transform="translate({x} {y}) rotate({r}) scale({s})" d="M0 0C6-8 16-6 16 2C16 10 6 12 0 0Z" fill="{c}" opacity=".92"/>'
cols = ['#C2185B', '#E91E63', '#F06292', '#AD1457']
svg('petals-top', 140, 40, ''.join(petal(10 + i * 26 + random.randint(-4, 4), 6 + random.randint(0, 22), random.randint(0, 360), cols[i % 4], .9 + random.random() * .4) for i in range(5)))
svg('petals-br', 80, 80, ''.join(petal(x, y, r, c, s) for x, y, r, c, s in [(30, 52, 20, '#C2185B', 1.6), (52, 38, 120, '#E91E63', 1.2), (50, 64, 260, '#F06292', 1.1), (18, 34, 200, '#AD1457', .9)]))

# --- confetti
conf = ['#E53935', '#FDD835', '#43A047', '#1E88E5', '#8E24AA', '#FB8C00']
pieces = ''
for i in range(16):
    x, y, r, c = random.randint(2, 158), random.randint(2, 36), random.randint(0, 180), conf[i % 6]
    pieces += (f'<rect transform="translate({x} {y}) rotate({r})" x="-4" y="-1.6" width="8" height="3.2" rx="1" fill="{c}"/>' if i % 3
               else f'<circle cx="{x}" cy="{y}" r="2.4" fill="{c}"/>')
svg('confetti-top', 160, 40, pieces)

# --- stars
stars = star(20, 22, 13, '#D4A537') + star(46, 12, 7, '#E9C46A') + star(14, 50, 6, '#E9C46A') + '<path d="M44 34v10M39 39h10" stroke="#D4A537" stroke-width="2" stroke-linecap="round"/>'
svg('stars-tl', 70, 70, stars)
flip('stars-br', 70, 70, stars, x=True, y=True)

# --- fireworks
def burst(cx, cy, r, col, n=12):
    out = ''
    for i in range(n):
        a = math.radians(i * 360 / n)
        x1, y1 = cx + r * .3 * math.cos(a), cy + r * .3 * math.sin(a)
        x2, y2 = cx + r * math.cos(a), cy + r * math.sin(a)
        out += f'<path d="M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}" stroke="{col}" stroke-width="2" stroke-linecap="round"/><circle cx="{x2:.1f}" cy="{y2:.1f}" r="1.8" fill="{col}"/>'
    return out
svg('fireworks-tl', 80, 80, burst(28, 28, 24, '#E53935') + burst(62, 20, 12, '#FDD835', 10))
svg('fireworks-tr', 80, 80, burst(50, 30, 24, '#1E88E5') + burst(18, 18, 11, '#8E24AA', 10))

# --- marigold garland (toran)
def marigold(x, y, r, c1, c2):
    out = f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{c1}"/>'
    for i in range(10):
        a = math.radians(i * 36)
        out += f'<circle cx="{x + r*.62*math.cos(a):.1f}" cy="{y + r*.62*math.sin(a):.1f}" r="{r*.42:.1f}" fill="{c2}"/>'
    return out + f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r*.35:.1f}" fill="{c1}"/>'
p0, p1, p2 = (0, 6), (60, 30), (120, 6)
g = '<path d="M0 6Q60 30 120 6" stroke="#7A5A22" stroke-width="1.4" fill="none"/>'
for i, t in enumerate([.0, .17, .33, .5, .67, .83, 1.0]):
    x, y = quad(t, p0, p1, p2)
    if i in (2, 4):
        g += f'<path transform="translate({x:.1f} {y+6:.1f})" d="M0 0C-6 8-4 18 0 24C4 18 6 8 0 0Z" fill="#4E8A3A" stroke="#2F5E22" stroke-width=".8"/>'
    c = ('#F57C00', '#FFA726') if i % 2 == 0 else ('#F9A825', '#FFD54F')
    g += marigold(x, y, 7, *c)
svg('marigold-top', 120, 44, g)

# --- diyo lamps (along the bottom)
def diyo(x):
    return (f'<g transform="translate({x} 0)">'
            '<ellipse cx="0" cy="14" rx="5" ry="9" fill="#FFB300" opacity=".35"/>'
            '<path d="M0 4C4 10 4 15 0 19C-4 15-4 10 0 4Z" fill="#FFC107"/><path d="M0 9C2 12 2 15 0 17C-2 15-2 12 0 9Z" fill="#FF6F00"/>'
            '<path d="M-17 21H17C15 31 8 35 0 35C-8 35-15 31-17 21Z" fill="#A0522D" stroke="#6D3A1F" stroke-width="1.2"/>'
            '<path d="M-13 25H13" stroke="#E8B24A" stroke-width="1.6" stroke-dasharray="3 3"/></g>')
svg('diyo-bottom', 90, 40, diyo(45))

# --- prayer flags
fl = ['#1565C0', '#FFFFFF', '#C62828', '#2E7D32', '#F9A825']
g = '<path d="M0 4Q75 16 150 4" stroke="#7A5A22" stroke-width="1.2" fill="none"/>'
for i, c in enumerate(fl):
    x, y = quad((i + .5) / 5, (0, 4), (75, 16), (150, 4))
    g += f'<rect x="{x-11:.1f}" y="{y:.1f}" width="22" height="26" fill="{c}" stroke="#9E9E9E" stroke-width=".6"/>'
svg('flags-top', 150, 40, g)

# --- balloons
def balloon(x, y, c, s=1):
    return (f'<path d="M{x} {y+20*s}q{-6*s} {14*s} {2*s} {30*s}" stroke="#8D6E63" stroke-width="1" fill="none"/>'
            f'<ellipse cx="{x}" cy="{y}" rx="{12*s}" ry="{15*s}" fill="{c}"/><path d="M{x-2*s} {y+15*s}l{2*s} {4*s}l{2*s} {-4*s}z" fill="{c}"/>'
            f'<ellipse cx="{x-4*s}" cy="{y-6*s}" rx="{3*s}" ry="{5*s}" fill="#fff" opacity=".45"/>')
svg('balloons-bl', 90, 90, balloon(22, 30, '#E91E63') + balloon(46, 20, '#29B6F6', 1.1) + balloon(66, 38, '#FFCA28', .9))
svg('balloon-tr', 50, 80, balloon(26, 22, '#AB47BC', 1.1))

# --- sprinkles
sp = ['#E91E63', '#29B6F6', '#FFCA28', '#66BB6A', '#AB47BC', '#FF7043', '#FFFFFF']
pieces = ''.join(f'<rect transform="translate({random.randint(3, 117)} {random.randint(3, 21)}) rotate({random.randint(0, 180)})" x="-4" y="-1.4" width="8" height="2.8" rx="1.4" fill="{sp[i % 7]}" stroke="#00000014" stroke-width=".4"/>' for i in range(14))
svg('sprinkles-strip', 120, 24, pieces)

# --- bunting
bc = ['#F8BBD0', '#B3E5FC', '#FFF59D', '#C8E6C9', '#E1BEE7']
g = '<path d="M0 4Q60 14 120 4" stroke="#7A5A22" stroke-width="1.2" fill="none"/>'
for i in range(5):
    x, y = quad((i + .5) / 5, (0, 4), (60, 14), (120, 4))
    g += f'<path d="M{x-10:.1f} {y-1:.1f}H{x+10:.1f}L{x:.1f} {y+22:.1f}Z" fill="{bc[i]}" stroke="#00000022" stroke-width=".6"/>'
svg('bunting-top', 120, 40, g)

# ---------- CSS ----------
U = lambda n: f'url("/img/borders/{n}.svg")'
def strip(file, h, tile, where='top', off=-14):
    return f'{where}: {off}px; left: -4%; right: -4%; height: {h}px; background: {U(file)} repeat-x center {where} / auto {h}px;'
def corners(*items, inset=-16):
    bg = ', '.join(f'{U(f)} no-repeat {pos} / {size}px auto' for f, pos, size in items)
    return f'inset: {inset}px; background: {bg};'
ring = ('inset: -9px; padding: 1px; border-radius: var(--deco-r); background: var(--gold); '
        '-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; '
        'mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);')
candy = ('inset: -10px; padding: 7px; border-radius: var(--deco-r); background: repeating-linear-gradient(45deg, #C62828 0 7px, #FFFFFF 7px 14px); '
         '-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; '
         'mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);')
T = {
    'gold': (ring, f'top: -18px; bottom: -18px; left: 0; right: 0; background: {U("gold-gem")} no-repeat center top / 60px auto, {U("gold-gem")} no-repeat center bottom / 60px auto;'),
    'snow': (strip('snow-top', 40, 120), corners(('snowflake', 'left bottom', 66), ('snowflake', 'right 40%', 46))),
    'holly': (None, corners(('holly-tl', 'left top', 78), ('holly-br', 'right bottom', 78))),
    'lights': (strip('lights-top', 44, 160, off=-18), None),
    'candy': (None, corners(('candy-tl', 'left top', 74), ('candy-br', 'right bottom', 74))),
    'web': (None, corners(('web-tl', 'left top', 86), ('spider-tr', 'right top', 52), inset=-10)),
    'pumpkin': (None, corners(('pumpkin-bl', 'left bottom', 96), ('pumpkin-br', 'right bottom', 72))),
    'bats': (None, corners(('bats-tr', 'right top', 90), ('bats-tl', 'left top', 70), inset=-22)),
    'hearts': (None, corners(('hearts-tl', 'left top', 72), ('hearts-br', 'right bottom', 72))),
    'petals': (strip('petals-top', 40, 140), corners(('petals-br', 'right bottom', 80))),
    'confetti': (strip('confetti-top', 40, 160), corners(('confetti-top', 'left bottom', 120), inset=-18)),
    'stars': (None, corners(('stars-tl', 'left top', 72), ('stars-br', 'right bottom', 72))),
    'fireworks': (None, corners(('fireworks-tl', 'left top', 84), ('fireworks-tr', 'right top', 84), inset=-22)),
    'marigold': (strip('marigold-top', 44, 120, off=-18), None),
    'diyo': (strip('diyo-bottom', 40, 90, 'bottom', -18), None),
    'flags': (strip('flags-top', 40, 150), None),
    'balloons': (None, corners(('balloons-bl', 'left bottom', 92), ('balloon-tr', 'right top', 46), inset=-22)),
    'sprinkles': (strip('sprinkles-strip', 24, 120, off=-10), strip('sprinkles-strip', 24, 120, 'bottom', -10)),
    'bunting': (strip('bunting-top', 40, 120), None),
}
css = ['/* Photo border themes. Each theme decorates the frame with ::before and ::after. Made by tools/borders.py */',
       '.deco { position: relative; isolation: isolate; --deco-r: var(--radius); }',
       '.deco::before, .deco::after { content: none; position: absolute; pointer-events: none; z-index: 3; background-repeat: no-repeat; }',
       '.deco--arch, .deco--tall { --deco-r: 999px 999px var(--radius) var(--radius); }',
       '.deco--arch { width: min(100%, var(--sz-arch-w, 300px)); margin: 0 auto 14px; }',
       '.deco--arch .arch-pic { width: 100%; margin-bottom: 0; }',
       '.deco--gal { display: grid; }',
       '.deco--gal .gal-item { width: 100%; }']
for k, (b, a) in T.items():
    if b: css.append(f'.deco--{k}::before {{ content: ""; {b} }}')
    if a: css.append(f'.deco--{k}::after {{ content: ""; {a} }}')
css.append('@media (prefers-reduced-motion: no-preference) { .anim .deco--lights::before { animation: twinkle 2.4s ease-in-out infinite alternate; } }')
css.append('@keyframes twinkle { to { filter: brightness(1.25) saturate(1.2); } }')
open(os.path.join(OUT, 'css', 'borders.css'), 'w').write('\n'.join(css) + '\n')
print(len(os.listdir(IMG)), 'svg files;', len(T), 'themes')
