/* 상품 매칭 — 처방한 색에 실제로 가까운 상품을 고른다.
 *
 * 색 이름으로 검색하지 않는다. "애프리콧 니트"로 검색하면 쇼핑몰이
 * 알아듣지 못한다. 카테고리로만 검색한 뒤, 상품 썸네일에서 옷 색을
 * 직접 재서 처방 색과의 ΔE 로 정렬한다.
 */
"use strict";

const WORKER = "https://pc-lab-image.asdqwe8511.workers.dev";

/* ── 색채 ───────────────────────────────────────────────────── */
const Xn = 0.95047, Yn = 1, Zn = 1.08883;
const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const fL = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab(r, g, b) {
  const R = s2l(r), G = s2l(g), B = s2l(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / Xn;
  const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / Yn;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / Zn;
  const fx = fL(X), fy = fL(Y), fz = fL(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const labOfHex = h => lab(...hex2rgb(h));
const toHex = (r, g, b) => "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

/* ── 상품 검색 ──────────────────────────────────────────────── */
async function search(keyword, limit) {
  const r = await fetch(WORKER, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "coupang", keyword, limit: limit || 20 })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return ((d.data || {}).data || {}).productData || [];
}

/* ── 썸네일에서 옷 색 추출 ──────────────────────────────────
 * 상품 컷은 대개 흰 배경이다. 배경·무채색·극단 명도를 걷어내고
 * 가운데 영역에서 가장 자주 나오는 유채색을 옷 색으로 본다.
 */
function garmentColor(img) {
  const N = 96;
  const c = document.createElement("canvas");
  c.width = N; c.height = N;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, N, N);
  let d;
  try { d = g.getImageData(0, 0, N, N).data; }
  catch (e) { return null; }                     // CORS 로 막히면 포기
  const bins = new Map();
  for (let y = N * 0.18; y < N * 0.86; y += 1) {
    for (let x = N * 0.18; x < N * 0.82; x += 1) {
      const i = ((y | 0) * N + (x | 0)) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (d[i + 3] < 200) continue;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx > 238 && mx - mn < 22) continue;    // 흰 배경
      if (mx < 26) continue;                     // 그림자
      const L = lab(r, gg, b);
      if (Math.hypot(L[1], L[2]) < 7 && L[0] > 62) continue;  // 밝은 무채색
      const key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4);
      const v = bins.get(key) || [0, 0, 0, 0];
      v[0] += r; v[1] += gg; v[2] += b; v[3]++;
      bins.set(key, v);
    }
  }
  if (!bins.size) return null;
  let best = null;
  for (const v of bins.values()) if (!best || v[3] > best[3]) best = v;
  if (!best || best[3] < 40) return null;
  return [best[0] / best[3], best[1] / best[3], best[2] / best[3]];
}

function loadImage(url) {
  return new Promise(res => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = WORKER + "/img?u=" + encodeURIComponent(url);
  });
}

/* ── 매칭 ───────────────────────────────────────────────────
 * targets: [{hex, name}]  처방 팔레트
 * 각 상품을 팔레트 중 가장 가까운 색과의 ΔE 로 평가한다.
 */
async function match(keyword, targets, opt) {
  opt = opt || {};
  const items = await search(keyword, opt.pool || 24);
  const tl = targets.map(t => ({ ...t, lab: labOfHex(t.hex) }));
  const out = [];
  const batch = 6;
  for (let i = 0; i < items.length; i += batch) {
    await Promise.all(items.slice(i, i + batch).map(async p => {
      const im = await loadImage(p.productImage);
      if (!im) return;
      const rgb = garmentColor(im);
      if (!rgb) return;
      const L = lab(...rgb);
      let bestT = null, bestD = 1e9;
      for (const t of tl) { const d = dE(L, t.lab); if (d < bestD) { bestD = d; bestT = t; } }
      out.push({
        name: p.productName, price: p.productPrice, url: p.productUrl,
        image: p.productImage, isRocket: p.isRocket,
        hex: toHex(...rgb), matched: bestT.name, matchedHex: bestT.hex,
        dE: Math.round(bestD * 10) / 10
      });
    }));
    if (out.length >= (opt.want || 8) * 2) break;
  }
  out.sort((a, b) => a.dE - b.dE);
  return out.slice(0, opt.want || 8);
}

export { match, search, garmentColor, loadImage, dE, lab, labOfHex, toHex, WORKER };
