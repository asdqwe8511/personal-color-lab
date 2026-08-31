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
/* 쿠팡 검색은 limit 최대가 10이다. 넘기면 "limit is out of range" 로
   0건이 온다. 더 많은 후보가 필요하면 키워드를 나눠 여러 번 부른다. */
const CP_MAX = 10;
async function searchOnce(keyword, limit) {
  const r = await fetch(WORKER, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "coupang", keyword, limit: Math.min(limit || CP_MAX, CP_MAX) })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  const body = d.data || {};
  if (String(body.rCode) !== "0")
    throw new Error("쿠팡: " + (body.rMessage || body.rCode));
  return (body.data || {}).productData || [];
}
/* 한 번에 10건뿐이므로 키워드를 여러 개 던져 합친다.
   조기 종료하면 후보가 10~20건에 그쳐 색이 맞는 상품이 위로 못 올라온다. */
async function search(keyword, want) {
  const keys = (Array.isArray(keyword) ? keyword : [keyword]).slice(0, 8);
  const seen = new Set(), out = [];
  const CONC = 3;                                  // 쿠팡 쪽 부담을 줄인다
  for (let i = 0; i < keys.length; i += CONC) {
    const batch = await Promise.all(keys.slice(i, i + CONC)
      .map(k => searchOnce(k, CP_MAX).catch(() => [])));
    for (const items of batch) for (const p of items) {
      const id = p.productId || p.productUrl;
      if (seen.has(id)) continue;
      seen.add(id); out.push(p);
    }
  }
  return out;
}

/* ── 팔레트 색 → 상품명에 실제로 쓰이는 한국어 색상어 ──────────
 * 색 이름으로 검색하면 안 된다고 했지만, 그건 "라이트 애프리콧"처럼
 * 진단 용어를 그대로 넣을 때다. 쇼핑몰이 쓰는 일반 색상어로 바꾸면
 * 후보의 색 분포가 크게 좋아진다. 최종 판정은 여전히 ΔE 로 한다.
 */
function colorWords(palette) {
  const words = new Set();
  for (const c of palette.slice(0, 8)) {
    const L = lab(...hex2rgb(c.hex));
    const C = Math.hypot(L[1], L[2]);
    let h = Math.atan2(L[2], L[1]) * 180 / Math.PI; if (h < 0) h += 360;
    if (C < 12) {                                  // 무채색
      words.add(L[0] > 78 ? "화이트" : L[0] > 45 ? "그레이" : "블랙");
      continue;
    }
    if (h < 20 || h >= 345) words.add(L[0] < 45 ? "버건디" : L[0] > 72 ? "핑크" : "레드");
    else if (h < 45) words.add(L[0] > 75 ? "아이보리" : L[0] > 55 ? "베이지" : "브라운");
    else if (h < 75) words.add(L[0] > 72 ? "크림" : L[0] > 50 ? "카멜" : "브라운");
    else if (h < 105) words.add(L[0] > 70 ? "레몬" : "머스터드");
    else if (h < 165) words.add(L[0] < 50 ? "카키" : "그린");
    else if (h < 215) words.add("민트");
    else if (h < 265) words.add(L[0] < 45 ? "네이비" : "블루");
    else if (h < 310) words.add(L[0] < 45 ? "네이비" : "라벤더");
    else words.add(L[0] < 50 ? "와인" : "퍼플");
  }
  return [...words];
}

/* 카테고리 + 색상어 조합으로 검색어를 늘린다 */
function expandKeys(baseKeys, palette, gender) {
  const G = gender === "men" ? "남성" : "여성";
  const noun = (baseKeys[0] || "").split(" ").pop();
  const keys = [...baseKeys];
  for (const w of colorWords(palette).slice(0, 4)) keys.push(G + " " + w + " " + noun);
  return keys;
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

/* ── 성별 필터 ──────────────────────────────────────────────
 * 쿠팡 검색은 키워드만 보므로 "여성 니트"에 남성 상품이 섞인다.
 * 상품명으로 걸러낸다. 남녀공용은 어느 쪽이든 남긴다.
 */
const RE_UNI = /(남녀공용|공용|유니섹스|unisex)/i;
const RE_MEN = /(남성|남자|맨즈|men)/i;
const RE_WOMEN = /(여성|여자|우먼|women)/i;
function genderOk(name, want) {
  if (!want || want === "any") return true;
  const n = String(name || "");
  if (RE_UNI.test(n)) return true;
  const men = RE_MEN.test(n), women = RE_WOMEN.test(n);
  if (want === "women") return women || !men;   // 남성 표기가 있고 여성 표기가 없으면 제외
  if (want === "men") return men || !women;
  return true;
}

/* ── 카테고리 필터 ──────────────────────────────────────────
 * "여성 니트"로 검색해도 반팔티·나시·원피스가 섞여 온다.
 * 상품명에 그 품목 단어가 있고, 다른 품목 단어가 없어야 통과시킨다.
 */
const CATEGORY = {
  knit:   { yes:/(니트|스웨터|가디건|풀오버)/,
            no:/(원피스|팬츠|바지|슬랙스|스커트|치마|코트|패딩|가방|모자|목도리|장갑|양말)/ },
  tee:    { yes:/(티셔츠|반팔티|긴팔티|맨투맨|나시|탑|티)/,
            no:/(니트|스웨터|원피스|팬츠|바지|스커트|치마|자켓|재킷|코트|가방)/ },
  bottom: { yes:/(팬츠|바지|슬랙스|데님|청바지|조거)/,
            no:/(원피스|니트|티셔츠|셔츠|자켓|재킷|코트|가방|스커트|치마)/ },
  skirt:  { yes:/(스커트|치마)/, no:/(팬츠|바지|원피스|가방)/ },
  dress:  { yes:/(원피스|드레스)/, no:/(팬츠|바지|가방|커튼)/ },
  outer:  { yes:/(자켓|재킷|코트|점퍼|블레이저|아우터|패딩|가디건|블루종)/,
            no:/(원피스|팬츠|바지|가방|신발)/ },
  shirt:  { yes:/(셔츠|블라우스)/,
            no:/(티셔츠|반팔티|긴팔티|니트|팬츠|바지|원피스)/ }
};
function categoryOk(name, cat) {
  const c = CATEGORY[cat];
  if (!c) return true;
  const n = String(name || "");
  return c.yes.test(n) && !c.no.test(n);
}

/* ── 매칭 ───────────────────────────────────────────────────
 * targets: [{hex, name}]  처방 팔레트
 * 각 상품을 팔레트 중 가장 가까운 색과의 ΔE 로 평가한다.
 */
async function match(keyword, targets, opt) {
  opt = opt || {};
  const baseKeys = Array.isArray(keyword) ? keyword : [keyword];
  const keys = opt.expand === false ? baseKeys
             : expandKeys(baseKeys, targets, opt.gender);
  const items = await search(keys, opt.pool || 60);
  const tl = targets.map(t => ({ ...t, lab: labOfHex(t.hex) }));
  const out = [];
  const batch = 6;
  for (let i = 0; i < items.length; i += batch) {
    await Promise.all(items.slice(i, i + batch).map(async p => {
      if (!genderOk(p.productName, opt.gender)) return;
      if (!categoryOk(p.productName, opt.cat)) return;
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
  }
  out.sort((a, b) => a.dE - b.dE);
  return out.slice(0, opt.want || 8);
}

export { match, search, garmentColor, loadImage, genderOk, categoryOk, colorWords,
         expandKeys, CATEGORY, dE, lab, labOfHex, toHex, WORKER };
