/* 생성된 착장 이미지의 옷 색을 처방 hex 로 정확히 옮긴다.
 *
 * 생성 모델은 색 지시를 잘 못 따른다 — 실측으로 ΔE 30까지 벌어졌다.
 * 그렇다고 색을 통째로 덮어씌우면 주름·그림자가 사라져 평면이 된다.
 * 그래서 Lab 에서 명도(L*)의 상대 변화는 보존하고 색상·채도(a*b*)만
 * 목표값으로 교체한다. 결과적으로 평균색이 처방과 일치하면서
 * 옷의 입체감은 남는다.
 */
"use strict";

const Xn = 0.95047, Yn = 1, Zn = 1.08883;
const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const l2s = c => { c = Math.max(0, Math.min(1, c)); return (c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c) * 255; };
const fF = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const fI = t => { const c = t * t * t; return c > 0.008856 ? c : (t - 16 / 116) / 7.787; };

function rgb2lab(r, g, b) {
  const R = s2l(r), G = s2l(g), B = s2l(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / Xn;
  const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / Yn;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / Zn;
  const fx = fF(X), fy = fF(Y), fz = fF(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function lab2rgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = Xn * fI(fx), Y = Yn * fI(fy), Z = Zn * fI(fz);
  return [
    l2s(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z),
    l2s(-0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z),
    l2s(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z)
  ];
}
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const toHex = (r, g, b) => "#" + [r, g, b].map(v =>
  Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();

/* 피부는 건드리면 안 된다 — 옷만 바꾼다 */
function isSkin(r, g, b) {
  if (r < 40 || r < b) return false;
  const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return Cr >= 130 && Cr <= 180 && Cb >= 75 && Cb <= 135;
}

/* 인물 영역의 세로 범위를 찾는다. 구도가 매번 달라 고정 좌표는 못 쓴다. */
function figureBox(d, W, H, bgLab) {
  let top = H, bot = 0;
  for (let y = 0; y < H; y += 2) {
    let cnt = 0;
    for (let x = (W * 0.2) | 0; x < W * 0.8; x += 3) {
      const i = (y * W + x) * 4;
      if (dE(rgb2lab(d[i], d[i + 1], d[i + 2]), bgLab) > 26) cnt++;
      if (cnt > 6) break;
    }
    if (cnt > 6) { if (y < top) top = y; bot = y; }
  }
  return top < bot ? { top, bot } : { top: 0, bot: H - 1 };
}

/* 한 구역에서 옷으로 볼 화소들의 대표색을 찾는다 */
function dominant(d, W, y0, y1, x0, x1, bgLab) {
  const bins = new Map();
  for (let y = y0 | 0; y < y1; y++) {
    for (let x = x0 | 0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (dE(rgb2lab(r, g, b), bgLab) < 26) continue;   // 배경
      if (isSkin(r, g, b)) continue;                    // 피부
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const v = bins.get(key) || [0, 0, 0, 0];
      v[0] += r; v[1] += g; v[2] += b; v[3]++;
      bins.set(key, v);
    }
  }
  let best = null;
  for (const v of bins.values()) if (!best || v[3] > best[3]) best = v;
  if (!best || best[3] < 60) return null;
  return { rgb: [best[0] / best[3], best[1] / best[3], best[2] / best[3]], n: best[3] };
}

/* ── 재색상 ──────────────────────────────────────────────────
 * regions: [{ y0, y1, hex }]  인물 높이 기준 0~1 비율과 목표색
 * 대표색에서 ΔE 가 가까운 화소일수록 강하게, 먼 화소는 약하게 섞어
 * 경계가 딱딱해지지 않게 한다.
 */
function recolor(img, regions, opt) {
  opt = opt || {};
  const TOL = opt.tolerance || 30;      // 이 거리 안쪽만 옷으로 본다
  const KEEP = opt.keepShading == null ? 0.85 : opt.keepShading;
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  let im;
  try { im = g.getImageData(0, 0, W, H); }
  catch (e) { return null; }            // CORS 로 막히면 포기
  const d = im.data;
  const bgLab = rgb2lab(d[0], d[1], d[2]);
  const box = figureBox(d, W, H, bgLab);
  const FH = box.bot - box.top;
  const x0 = (W * 0.22) | 0, x1 = (W * 0.78) | 0;
  const report = [];

  for (const reg of regions) {
    const y0 = box.top + FH * reg.y0, y1 = box.top + FH * reg.y1;
    const dom = dominant(d, W, y0, y1, x0, x1, bgLab);
    if (!dom) { report.push({ hex: reg.hex, ok: false }); continue; }
    const domLab = rgb2lab(...dom.rgb);
    const tgt = rgb2lab(...hex2rgb(reg.hex));
    let changed = 0;

    for (let y = y0 | 0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (isSkin(r, gg, b)) continue;
        const L = rgb2lab(r, gg, b);
        if (dE(L, bgLab) < 26) continue;
        const dist = dE(L, domLab);
        if (dist > TOL) continue;
        const w = 1 - dist / TOL;                       // 가장자리는 약하게
        /* 명도는 대표색 대비 상대 변화를 살려 주름을 남긴다 */
        const nL = tgt[0] + (L[0] - domLab[0]) * KEEP;
        const out = lab2rgb(nL, tgt[1], tgt[2]);
        d[i]     = r  + (out[0] - r)  * w;
        d[i + 1] = gg + (out[1] - gg) * w;
        d[i + 2] = b  + (out[2] - b)  * w;
        changed++;
      }
    }
    report.push({ hex: reg.hex, ok: changed > 0, pixels: changed,
                  before: toHex(...dom.rgb) });
  }
  g.putImageData(im, 0, 0);
  return { canvas: c, dataUrl: c.toDataURL("image/jpeg", 0.92), report };
}

/* 재색상 뒤 실제로 목표에 닿았는지 다시 잰다 */
function verify(canvas, regions) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const d = g.getImageData(0, 0, W, H).data;
  const bgLab = rgb2lab(d[0], d[1], d[2]);
  const box = figureBox(d, W, H, bgLab);
  const FH = box.bot - box.top;
  return regions.map(reg => {
    const dom = dominant(d, W, box.top + FH * reg.y0, box.top + FH * reg.y1,
                         (W * 0.22) | 0, (W * 0.78) | 0, bgLab);
    if (!dom) return { hex: reg.hex, dE: null };
    return { hex: reg.hex, got: toHex(...dom.rgb),
             dE: +dE(rgb2lab(...dom.rgb), rgb2lab(...hex2rgb(reg.hex))).toFixed(1) };
  });
}

export { recolor, verify, rgb2lab, lab2rgb, dE, toHex, hex2rgb };
