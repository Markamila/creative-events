// Генератор стилизованных пастельных иллюстраций для демонстрационного содержимого.
// Это заглушки вместо фотографий: замените их реальными фото через админ-панель.
// Запуск: npm run art
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img');
fs.mkdirSync(OUT, { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = {
  rose:   { bg: ['#fff1f4', '#ffd9e2'], a: '#f8b4c8', b: '#e98aa8', c: '#c2587a', d: '#fff8f9', e: '#f6d6c2' },
  peach:  { bg: ['#fff4ec', '#ffdcc8'], a: '#ffc2a8', b: '#f59e86', c: '#d9715c', d: '#fffaf6', e: '#f9e0b8' },
  lilac:  { bg: ['#f6f0ff', '#e3d6f8'], a: '#cdb8f0', b: '#a98ae0', c: '#7d5cc4', d: '#fbf8ff', e: '#f8d3e6' },
  mint:   { bg: ['#f0fbf6', '#d4efe3'], a: '#a9dcc6', b: '#78c4a4', c: '#3f9f7c', d: '#f9fffc', e: '#fbd9d9' },
  sand:   { bg: ['#fbf4ea', '#f0dfc8'], a: '#e8c9a0', b: '#d4a574', c: '#a8744a', d: '#fffaf2', e: '#f6c9d0' },
  sky:    { bg: ['#f1f8ff', '#d7e9fb'], a: '#b3d4f5', b: '#85b6ec', c: '#4f87cf', d: '#fafdff', e: '#fcd7e2' },
};

const f = (n) => Math.round(n * 10) / 10;

// ───────── мотивы (рисуются в системе координат 400×400) ─────────

function flower(cx, cy, r, color, center, r0) {
  const petals = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    petals.push(`<ellipse cx="${f(cx + Math.cos(ang) * r * 0.62)}" cy="${f(cy + Math.sin(ang) * r * 0.62)}" rx="${f(r * 0.46)}" ry="${f(r * 0.3)}" transform="rotate(${f((ang * 180) / Math.PI)} ${f(cx + Math.cos(ang) * r * 0.62)} ${f(cy + Math.sin(ang) * r * 0.62)})" fill="${color}"/>`);
  }
  return petals.join('') + `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.3)}" fill="${center}"/>`;
}

function canvas(p, R) {
  const hills = [p.a, p.b, p.c].map((c, i) => {
    const y = 210 + i * 38;
    return `<path d="M60 ${y} Q150 ${y - 50 - R() * 20} 230 ${y - 10} T340 ${y - 20} V330 H60Z" fill="${c}" opacity="${0.9 - i * 0.1}"/>`;
  }).join('');
  return `
  <g transform="translate(0 6)">
    <rect x="52" y="52" width="296" height="296" rx="6" fill="#00000012" transform="translate(8 10)"/>
    <rect x="50" y="50" width="300" height="300" rx="6" fill="${p.d}" stroke="#ffffff" stroke-width="4"/>
    <clipPath id="cv"><rect x="60" y="60" width="280" height="280" rx="3"/></clipPath>
    <g clip-path="url(#cv)">
      <rect x="60" y="60" width="280" height="280" fill="${p.bg[1]}"/>
      <circle cx="${f(250 + R() * 30)}" cy="${f(125 + R() * 20)}" r="${f(34 + R() * 12)}" fill="${p.e}"/>
      ${hills}
      ${flower(120, 300, 22, p.d, p.c)}${flower(160, 312, 16, p.e, p.b)}
    </g>
  </g>`;
}

function wood(p, R) {
  return `
  <rect x="62" y="70" width="276" height="260" rx="${f(40 + R() * 30)}" fill="#00000012" transform="translate(7 9)"/>
  <rect x="60" y="68" width="276" height="260" rx="${f(40 + R() * 30)}" fill="#e6c8a0"/>
  <g fill="none" stroke="#d4a574" stroke-width="2" opacity=".5">
    <path d="M70 120 Q200 100 326 130"/><path d="M68 170 Q200 190 330 160"/><path d="M72 230 Q200 210 326 240"/><path d="M80 285 Q200 300 320 275"/>
  </g>
  ${flower(200, 190, 56, p.a, p.c)}${flower(120, 130, 26, p.d, p.b)}${flower(280, 255, 28, p.d, p.b)}
  <path d="M200 246 Q196 290 170 310" stroke="${p.c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
}

function water(p, R) {
  const blobs = Array.from({ length: 7 }, () => `<circle cx="${f(110 + R() * 190)}" cy="${f(110 + R() * 130)}" r="${f(26 + R() * 40)}" fill="${[p.a, p.b, p.e][Math.floor(R() * 3)]}" opacity=".45"/>`).join('');
  return `
  <rect x="62" y="48" width="286" height="320" fill="#00000012" transform="translate(6 8)"/>
  <rect x="60" y="46" width="286" height="320" fill="#fffdfb"/>
  <clipPath id="wt"><rect x="72" y="58" width="262" height="296"/></clipPath>
  <g clip-path="url(#wt)">${blobs}
    <g stroke="${p.c}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7">
      <path d="M150 350 Q160 270 150 210"/><path d="M215 350 Q225 260 230 180"/><path d="M280 350 Q270 280 285 230"/>
    </g>
    ${flower(150, 205, 30, p.b, p.e)}${flower(230, 172, 36, p.a, p.c)}${flower(285, 225, 26, p.e, p.b)}
  </g>`;
}

function tote(p, R) {
  const dots = Array.from({ length: 10 }, () => flower(100 + R() * 200, 190 + R() * 120, 10 + R() * 10, [p.a, p.b, p.e][Math.floor(R() * 3)], p.d)).join('');
  return `
  <path d="M150 140 Q150 50 200 50 Q250 50 250 140" fill="none" stroke="#e9dccb" stroke-width="12" stroke-linecap="round"/>
  <path d="M80 140 H320 L338 350 H62Z" fill="#00000012" transform="translate(6 8)"/>
  <path d="M80 140 H320 L338 350 H62Z" fill="#f7efe2"/>
  <path d="M80 140 H320" stroke="#e9dccb" stroke-width="6"/>
  ${flower(200, 240, 62, p.a, p.c)}${flower(150, 190, 26, p.e, p.b)}${flower(256, 200, 22, p.b, p.d)}${dots}`;
}

function bag(p) {
  return `
  <path d="M130 150 Q130 50 200 50 Q270 50 270 150" fill="none" stroke="${p.c}" stroke-width="12" stroke-linecap="round"/>
  <path d="M70 150 H330 L350 330 Q350 350 330 350 H70 Q50 350 50 330Z" fill="#00000012" transform="translate(6 8)"/>
  <path d="M70 150 H330 L350 330 Q350 350 330 350 H70 Q50 350 50 330Z" fill="${p.a}"/>
  <path d="M70 150 H330 L338 215 H62Z" fill="${p.b}"/>
  <circle cx="200" cy="215" r="16" fill="${p.d}"/><circle cx="200" cy="215" r="7" fill="${p.c}"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${100 + i * 40}" cy="285" r="7" fill="${p.d}" opacity=".85"/>`).join('')}`;
}

function ceramic(p, R) {
  const stripes = [0, 1, 2, 3].map((i) => `<path d="M104 ${190 + i * 28} Q170 ${176 + i * 28} 236 ${190 + i * 28}" stroke="${[p.c, p.b, p.a, p.c][i]}" stroke-width="7" fill="none" opacity=".85"/>`).join('');
  return `
  <ellipse cx="200" cy="352" rx="150" ry="12" fill="#00000010"/>
  <path d="M96 150 H244 V290 Q244 336 170 336 Q96 336 96 290Z" fill="${p.d}" stroke="#ffffff" stroke-width="3"/>
  <path d="M244 180 Q300 180 300 232 Q300 284 240 284" fill="none" stroke="${p.d}" stroke-width="16"/>
  ${stripes}
  <ellipse cx="170" cy="150" rx="74" ry="14" fill="${p.bg[1]}"/>
  ${flower(170, 252, 20, p.e, p.c)}`;
}

function decor(p, R) {
  const gems = Array.from({ length: 22 }, (_, i) => {
    const ang = (i / 22) * Math.PI * 2;
    return `<circle cx="${f(200 + Math.cos(ang) * 120)}" cy="${f(200 + Math.sin(ang) * 120)}" r="${i % 2 ? 6 : 4}" fill="#ffffff" stroke="${p.a}" stroke-width="1.5"/>`;
  }).join('');
  return `
  <rect x="58" y="58" width="290" height="290" rx="60" fill="#00000012" transform="translate(6 8)"/>
  <rect x="56" y="56" width="290" height="290" rx="60" fill="${p.a}"/>
  <rect x="78" y="78" width="246" height="246" rx="46" fill="${p.d}"/>
  ${gems}
  <path d="M201 262 C150 222 152 176 186 176 C194 176 200 182 201 188 C202 182 208 176 216 176 C250 176 252 222 201 262Z" fill="${p.b}"/>
  ${flower(125, 135, 14, p.a, p.c)}${flower(278, 268, 14, p.a, p.c)}`;
}

function resin(p, R) {
  const flakes = Array.from({ length: 26 }, () => {
    const ang = R() * Math.PI * 2; const rr = 100 + (R() - 0.5) * 34;
    return `<circle cx="${f(200 + Math.cos(ang) * rr)}" cy="${f(200 + Math.sin(ang) * rr)}" r="${f(2 + R() * 4)}" fill="${['#fff', p.e, p.d][Math.floor(R() * 3)]}" opacity=".9"/>`;
  }).join('');
  return `
  <defs><linearGradient id="rs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset=".5" stop-color="${p.e}"/><stop offset="1" stop-color="${p.b}"/></linearGradient></defs>
  <circle cx="204" cy="208" r="116" fill="none" stroke="#00000014" stroke-width="40"/>
  <circle cx="200" cy="200" r="116" fill="none" stroke="url(#rs)" stroke-width="38" opacity=".92"/>
  <circle cx="200" cy="200" r="116" fill="none" stroke="#ffffff" stroke-width="5" opacity=".55" stroke-dasharray="120 600" stroke-dashoffset="-40"/>
  ${flakes}
  ${flower(200, 84, 16, p.d, p.c)}`;
}

function beads(p, R) {
  const cols = [p.a, p.b, p.c, p.e, p.d];
  const n = 30;
  const items = Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2;
    const r = i % 3 === 0 ? 17 : 12;
    return `<circle cx="${f(200 + Math.cos(ang) * 120)}" cy="${f(200 + Math.sin(ang) * 120)}" r="${r}" fill="${cols[i % cols.length]}" stroke="#ffffff" stroke-width="2"/>
            <circle cx="${f(200 + Math.cos(ang) * 120 - 4)}" cy="${f(200 + Math.sin(ang) * 120 - 4)}" r="${f(r * 0.28)}" fill="#fff" opacity=".7"/>`;
  }).join('');
  return `<circle cx="200" cy="200" r="120" fill="none" stroke="${p.c}" stroke-width="2" opacity=".4"/>${items}
  <g transform="translate(168 168)"><rect width="64" height="64" rx="14" fill="${p.d}" opacity=".9"/>${flower(32, 32, 18, p.a, p.c)}</g>`;
}

function jewel(p) {
  const drop = (x, c1, c2) => `
    <path d="M${x} 70 q0 20 0 40" stroke="${p.c}" stroke-width="3" fill="none"/>
    <circle cx="${x}" cy="68" r="6" fill="none" stroke="${p.c}" stroke-width="3"/>
    <path d="M${x} 110 C${x - 44} 160 ${x - 40} 230 ${x} 262 C${x + 40} 230 ${x + 44} 160 ${x} 110Z" fill="${c1}"/>
    <path d="M${x} 130 C${x - 26} 168 ${x - 24} 212 ${x} 236 C${x + 24} 212 ${x + 26} 168 ${x} 130Z" fill="${c2}" opacity=".85"/>
    <circle cx="${x - 10}" cy="170" r="5" fill="#fff" opacity=".7"/>`;
  return `${drop(130, p.a, p.d)}${drop(270, p.b, p.e)}
  <path d="M70 320 Q200 380 330 320" fill="none" stroke="${p.c}" stroke-width="3"/>
  <circle cx="200" cy="351" r="14" fill="${p.a}" stroke="#fff" stroke-width="3"/>`;
}

function process(p, R) {
  const blobs = [[150, 150, 26, p.a], [210, 118, 24, p.b], [262, 160, 22, p.c], [236, 226, 26, p.e], [160, 232, 22, p.d]]
    .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.28}" fill="#fff" opacity=".5"/>`).join('');
  return `
  <path d="M200 70 C300 62 350 150 328 220 C306 290 240 328 180 316 C140 308 150 270 128 262 C80 246 56 182 92 130 C120 90 160 74 200 70Z" fill="#00000012" transform="translate(6 8)"/>
  <path d="M200 70 C300 62 350 150 328 220 C306 290 240 328 180 316 C140 308 150 270 128 262 C80 246 56 182 92 130 C120 90 160 74 200 70Z" fill="#f3e2c9"/>
  <circle cx="190" cy="270" r="18" fill="${p.bg[0]}"/>
  ${blobs}
  <g transform="rotate(35 300 300)"><rect x="150" y="290" width="200" height="12" rx="6" fill="#c9a37a"/><rect x="330" y="287" width="44" height="18" rx="6" fill="${p.c}"/><path d="M374 290 q24 9 0 18Z" fill="${p.b}"/></g>`;
}

function table(p, R) {
  const cups = [[90, 100], [310, 290]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="34" fill="${p.d}" stroke="${p.a}" stroke-width="4"/><circle cx="${x}" cy="${y}" r="22" fill="${p.e}"/>`).join('');
  return `
  <rect x="20" y="20" width="360" height="360" rx="22" fill="${p.d}" opacity=".55"/>
  <rect x="110" y="110" width="180" height="150" rx="6" fill="${p.d}" stroke="#fff" stroke-width="4"/>
  <rect x="122" y="122" width="156" height="126" fill="${p.bg[1]}"/>
  <path d="M122 220 Q170 170 220 206 T278 190 V248 H122Z" fill="${p.b}" opacity=".8"/>
  ${cups}
  ${flower(318, 100, 26, p.a, p.c)}${flower(70, 300, 28, p.e, p.b)}
  <g transform="rotate(-24 120 320)"><rect x="60" y="310" width="140" height="9" rx="4" fill="#c9a37a"/><rect x="190" y="307" width="30" height="15" rx="5" fill="${p.c}"/></g>
  <g transform="rotate(12 310 180)"><rect x="240" y="176" width="130" height="9" rx="4" fill="#c9a37a"/></g>`;
}

function group(p, R) {
  const spots = [[90, 90], [200, 70], [310, 90], [90, 310], [200, 330], [310, 310]];
  const items = spots.map(([x, y], i) => `
    <rect x="${x - 40}" y="${y - 32}" width="80" height="64" rx="4" fill="${p.d}" stroke="#fff" stroke-width="3"/>
    <path d="M${x - 40} ${y + 12} Q${x - 10} ${y - 16} ${x + 40} ${y + 8} V${y + 32} H${x - 40}Z" fill="${[p.a, p.b, p.e, p.c, p.a, p.b][i]}" opacity=".8"/>
    <circle cx="${x + (i < 3 ? 0 : 0)}" cy="${y + (i < 3 ? -50 : 50)}" r="9" fill="${p.c}" opacity=".55"/>`).join('');
  return `<ellipse cx="200" cy="200" rx="170" ry="150" fill="${p.d}" opacity=".7"/>${items}${flower(200, 200, 26, p.a, p.c)}`;
}

const MOTIFS = { canvas, wood, water, tote, bag, ceramic, decor, resin, beads, jewel, process, table, group };

function art(name, motif, paletteName, w, h, seed) {
  const p = PALETTES[paletteName];
  const R = rng(seed);
  const s = (Math.min(w, h) / 400) * 0.86;
  const tx = (w - 400 * s) / 2;
  const ty = (h - 400 * s) / 2;
  const orbs = Array.from({ length: 3 }, () => `<circle cx="${f(R() * w)}" cy="${f(R() * h)}" r="${f(60 + R() * 140)}" fill="${[p.a, p.e, p.d][Math.floor(R() * 3)]}" opacity=".35"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${name}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>${orbs}
<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(s)})">${MOTIFS[motif](p, R)}</g>
</svg>`;
  fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
}

// Каталог услуг (4:3)
const covers = [
  ['s-acrylic-canvas', 'canvas', 'rose', 11], ['s-acrylic-wood', 'wood', 'sand', 12], ['s-watercolor', 'water', 'sky', 13],
  ['s-tote', 'tote', 'peach', 14], ['s-bags', 'bag', 'lilac', 15], ['s-ceramic', 'ceramic', 'mint', 16],
  ['s-decor', 'decor', 'rose', 17], ['s-resin', 'resin', 'lilac', 18], ['s-beads', 'beads', 'peach', 19], ['s-jewelry', 'jewel', 'sky', 20],
];
for (const [n, m, p, s] of covers) art(n, m, p, 800, 600, s);

// Примеры работ и галерея (разные пропорции — для Pinterest-сетки)
const pal = Object.keys(PALETTES);
const examples = [
  ['g-canvas', 'canvas', 3, [[800, 1000], [800, 800], [800, 1000]]],
  ['g-wood', 'wood', 2, [[800, 800], [800, 1000]]],
  ['g-water', 'water', 3, [[800, 1100], [800, 900], [800, 1000]]],
  ['g-tote', 'tote', 3, [[800, 1000], [800, 1100], [800, 800]]],
  ['g-bag', 'bag', 2, [[800, 900], [800, 1000]]],
  ['g-ceramic', 'ceramic', 3, [[800, 800], [800, 1000], [800, 900]]],
  ['g-decor', 'decor', 2, [[800, 800], [800, 1000]]],
  ['g-resin', 'resin', 3, [[800, 1000], [800, 800], [800, 1000]]],
  ['g-beads', 'beads', 2, [[800, 900], [800, 1000]]],
  ['g-jewel', 'jewel', 2, [[800, 1100], [800, 900]]],
  ['g-process', 'process', 1, [[800, 900]]],
  ['g-table', 'table', 2, [[800, 800], [800, 1100]]],
  ['g-group', 'group', 1, [[800, 1000]]],
];
let seed = 100;
for (const [prefix, motif, count, sizes] of examples) {
  for (let i = 0; i < count; i++) {
    seed += 7;
    art(`${prefix}-${i + 1}`, motif, pal[(seed + i) % pal.length], sizes[i][0], sizes[i][1], seed);
  }
}

// Главное изображение (широкое)
{
  const p = PALETTES.rose; const R = rng(777);
  const w = 1400, h = 1000;
  const place = (motif, x, y, s, rot = 0, pn = 'rose') => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${MOTIFS[motif](PALETTES[pn], rng(x + y))}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Творческое мероприятие">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4f6"/><stop offset="1" stop-color="#f9cfdb"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
<circle cx="1180" cy="180" r="260" fill="#fff" opacity=".35"/><circle cx="160" cy="880" r="300" fill="#f8b4c8" opacity=".35"/>
${place('canvas', 140, 90, 1.25, -4, 'rose')}
${place('process', 700, 40, 1.0, 8, 'peach')}
${place('ceramic', 880, 460, 1.1, -6, 'lilac')}
${place('tote', 90, 560, 0.95, 5, 'peach')}
${place('resin', 520, 600, 0.7, 0, 'lilac')}
${place('beads', 1010, 90, 0.62, 0, 'rose')}
</svg>`;
  fs.writeFileSync(path.join(OUT, 'hero.svg'), svg);
}

// Иконка сайта
fs.writeFileSync(path.join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#f8b4c8"/>${flower(32, 32, 20, '#fff', '#c2587a')}</svg>`);

console.log('Иллюстрации сгенерированы в', OUT, '—', fs.readdirSync(OUT).length, 'файлов');
