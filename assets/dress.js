/* 착장 그림 — 측정한 치수로 인체를 그리고 처방된 옷을 입힌다.
 *
 * 생성형 이미지를 쓰지 않는 이유: 모델은 프롬프트로 어깨 39cm·허리 66cm를
 * 받을 방법이 없어 자기가 아는 체형을 그린다. 치수를 잰 의미가 사라진다.
 * 인터넷 인물 사진 수집도 쓰지 않는다 — 초상권·저작권 문제가 있다.
 *
 * 여기서는 둘레를 폭으로 환산해 16개 단면의 반폭을 구하고, 그 점들을
 * 스플라인으로 이어 윤곽을 만든다. 치수를 바꾸면 그림이 즉시 바뀐다.
 */
"use strict";

const CIRC_W = 2.74;                       // 몸통 둘레 → 폭 (깊이 0.72배 타원 가정)
const LIMB_W = Math.PI;                    // 팔다리 둘레 → 지름 (원기둥 가정)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ── 넥라인 ─────────────────────────────────────────────────── */
const NECK_TYPE = {
  "브이넥": "v", "딥 브이넥": "deepv", "부드러운 브이넥": "v",
  "스쿱넥": "scoop", "라운드넥": "crew", "크루넥": "crew",
  "보트넥": "boat", "각진 보트넥": "boat", "터틀넥": "turtle",
  "스퀘어넥": "square", "카울넥": "cowl", "오프숄더": "off",
  "대부분의 목선": "crew"
};
const neckTypeOf = n => NECK_TYPE[n] || "crew";

const BOTTOM_TYPE = {
  hourglass: "straight", rectangle: "wide", pear: "bootcut",
  inverted: "wide", apple: "straight"
};
const BOTTOM_SHAPE = {
  straight: { knee: 1.00, hem: 0.96 },
  wide:     { knee: 1.42, hem: 1.62 },
  bootcut:  { knee: 0.88, hem: 1.30 },
  skinny:   { knee: 0.74, hem: 0.58 },
  aline:    { knee: 1.9,  hem: 2.4  }
};

/* ── 색 보조 ────────────────────────────────────────────────── */
function shade(hex, amt) {                 // amt<0 어둡게, >0 밝게
  const n = parseInt(hex.slice(1), 16);
  const f = c => clamp(Math.round(c + 255 * amt), 0, 255);
  return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)]
    .map(v => v.toString(16).padStart(2, "0")).join("");
}

/* 세로 접선을 가진 부드러운 곡선 — 몸의 윤곽이 각지지 않게 */
function curve(pts) {
  let d = "";
  pts.forEach((p, i) => {
    if (i === 0) { d += "M" + p[0].toFixed(1) + " " + p[1].toFixed(1); return; }
    const q = pts[i - 1], dy = (p[1] - q[1]) * 0.42;
    d += " C" + q[0].toFixed(1) + " " + (q[1] + dy).toFixed(1) +
         " " + p[0].toFixed(1) + " " + (p[1] - dy).toFixed(1) +
         " " + p[0].toFixed(1) + " " + p[1].toFixed(1);
  });
  return d;
}
/* 좌우 대칭 폐곡선 */
function symBody(st, cx, sign1) {
  const right = st.map(s => [cx + s.w, s.y]);
  const left = st.slice().reverse().map(s => [cx - s.w, s.y]);
  return curve(right) + " " + curve(left).replace(/^M[\d.\-]+ [\d.\-]+/, "L" +
    (cx - st[st.length - 1].w).toFixed(1) + " " + st[st.length - 1].y.toFixed(1)) + " Z";
}

/* ── 인체 단면 ──────────────────────────────────────────────── */
function stations(m, y, s) {
  const w = c => (c / CIRC_W) * s / 2;
  const sh = (m.shoulder * s) / 2;
  const bust = w(m.bust), waist = w(m.waist), hip = w(m.hip);
  return [
    { k: "neck",   y: y.neckBase, w: w(m.neck || m.bust * 0.38) * 1.02 },
    { k: "shoul",  y: y.shoulder, w: sh },
    { k: "armpit", y: y.armpit,   w: bust * 1.01 },
    { k: "bust",   y: y.bust,     w: bust },
    { k: "under",  y: y.under,    w: bust * 0.87 },
    { k: "waist",  y: y.waist,    w: waist },
    { k: "hhip",   y: y.hhip,     w: waist + (hip - waist) * 0.52 },
    { k: "hip",    y: y.hip,      w: hip },
    { k: "crotch", y: y.crotch,   w: hip * 0.97 }
  ];
}

/* ── 착장 그림 ──────────────────────────────────────────────── */
let _uid = 0;
function dressedSVG(m, outfit, opt) {
  opt = opt || {};
  const W = opt.width || 200, H = opt.height || 460;
  const skin = opt.skin || "#C9A183", hair = opt.hair || "#3A2A22";
  const neckT = neckTypeOf(opt.neckline || "라운드넥");
  const bt = BOTTOM_SHAPE[opt.bottom || BOTTOM_TYPE[opt.bodyKey] || "straight"];
  const u = "f" + (++_uid);
  const top = outfit.items[0].c.hex, bottom = outfit.items[1].c.hex, point = outfit.items[2].c.hex;

  const yTop = H * 0.015, yFoot = H * 0.985, FH = yFoot - yTop;
  const s = FH / m.height;
  const cx = W / 2;
  const headH = FH / 7.5;
  /* 7.5등신 기준 세로 배치 */
  const y = {
    chin:     yTop + headH,
    neckBase: yTop + FH * 0.152,
    shoulder: yTop + FH * 0.178,
    armpit:   yTop + FH * 0.232,
    bust:     yTop + FH * 0.272,
    under:    yTop + FH * 0.318,
    waist:    yTop + FH * 0.378,
    hhip:     yTop + FH * 0.432,
    hip:      yTop + FH * 0.487,
    crotch:   yTop + FH * 0.545,
    thigh:    yTop + FH * 0.620,
    knee:     yTop + FH * 0.705,
    calf:     yTop + FH * 0.795,
    ankle:    yTop + FH * 0.925,
    foot:     yFoot
  };
  const st = stations(m, y, s);
  const at = k => st.find(x => x.k === k).w;
  const legR = (m.thigh ? m.thigh : m.hip * 0.58) / LIMB_W * s / 2;
  const calfR = (m.calf ? m.calf : m.hip * 0.38) / LIMB_W * s / 2;
  const ankR = calfR * 0.56;
  const armR = at("bust") * 0.30;
  const P = [];

  const g = (id, c, a, b) => '<linearGradient id="' + id + '" x1="0" x2="1">' +
    '<stop offset="0" stop-color="' + shade(c, a) + '"/>' +
    '<stop offset=".42" stop-color="' + c + '"/>' +
    '<stop offset="1" stop-color="' + shade(c, b) + '"/></linearGradient>';
  P.push("<defs>" + g(u + "s", skin, .05, -.10) + g(u + "t", top, .07, -.11) +
         g(u + "b", bottom, .06, -.10) + "</defs>");

  /* 다리 — 허벅지·무릎·종아리·발목 굵기를 실측에서 */
  [-1, 1].forEach(d => {
    const hx = cx + d * at("hip") * 0.50;
    P.push('<path d="' + curve([
      [hx - legR, y.crotch], [cx + d * at("hip") * 0.52 - d * legR * 0.1, y.thigh],
      [cx + d * (legR * 0.62) * 0 + hx - legR * 0.72, y.knee],
      [hx - calfR * 0.86, y.calf], [hx - ankR, y.ankle]
    ]) + " L" + (hx + ankR) + " " + y.ankle +
      " " + curve([[hx + ankR, y.ankle], [hx + calfR * 0.86, y.calf],
                   [hx + legR * 0.72, y.knee], [hx + legR, y.thigh],
                   [hx + legR, y.crotch]]).replace(/^M[^C]*/, "") +
      ' Z" fill="url(#' + u + 's)"/>');
    P.push('<ellipse cx="' + hx + '" cy="' + (y.foot - armR * 0.3) + '" rx="' + (ankR * 1.5) +
      '" ry="' + (ankR * 0.62) + '" fill="' + shade(skin, -.18) + '"/>');
  });

  /* 몸통 */
  P.push('<path d="' + symBody(st, cx) + '" fill="url(#' + u + 's)"/>');

  /* 팔 */
  [-1, 1].forEach(d => {
    const x0 = cx + d * (at("shoul") - armR * 0.7);
    P.push('<path d="' + curve([
      [x0 - d * armR, y.shoulder + armR * 0.3],
      [cx + d * (at("bust") + armR * 1.5), y.under],
      [cx + d * (at("waist") + armR * 1.9), y.hhip],
      [cx + d * (at("hip") + armR * 1.2), y.hip + armR]
    ]) + " l" + (d * armR * 0.95) + " 0 " +
      curve([[cx + d * (at("hip") + armR * 2.2), y.hip + armR],
             [cx + d * (at("waist") + armR * 3.0), y.hhip],
             [cx + d * (at("bust") + armR * 2.6), y.under],
             [x0 + d * armR * 0.9, y.shoulder + armR * 0.3]]).replace(/^M[^C]*/, "") +
      ' Z" fill="' + shade(skin, d > 0 ? -.06 : .02) + '"/>');
  });

  /* 머리 · 목 */
  P.push('<rect x="' + (cx - at("neck") * 0.62) + '" y="' + (y.chin - headH * 0.06) +
    '" width="' + (at("neck") * 1.24) + '" height="' + (y.shoulder - y.chin + headH * 0.1) +
    '" fill="' + shade(skin, -.05) + '"/>');
  P.push('<ellipse cx="' + cx + '" cy="' + (yTop + headH * 0.5) + '" rx="' + (headH * 0.33) +
    '" ry="' + (headH * 0.46) + '" fill="url(#' + u + 's)"/>');
  P.push('<path d="M' + (cx - headH * 0.35) + ' ' + (yTop + headH * 0.52) +
    ' a' + (headH * 0.35) + ' ' + (headH * 0.5) + ' 0 0 1 ' + (headH * 0.7) + ' 0' +
    ' q' + (-headH * 0.05) + ' ' + (-headH * 0.26) + ' ' + (-headH * 0.35) + ' ' + (-headH * 0.24) +
    ' q' + (-headH * 0.3) + ' ' + (-headH * 0.02) + ' ' + (-headH * 0.35) + ' ' + (headH * 0.24) +
    ' Z" fill="' + hair + '"/>');

  /* 하의 */
  const wb = y.waist + (y.hip - y.waist) * 0.10;
  const hemY = opt.bottom === "aline" ? y.knee + (y.ankle - y.knee) * 0.35 : y.ankle + ankR * 0.3;
  if (opt.bottom === "aline") {
    P.push('<path d="' + curve([[cx - at("waist") * 1.05, wb], [cx - at("hip") * 1.04, y.hip],
      [cx - at("hip") * bt.knee, y.knee], [cx - at("hip") * bt.hem, hemY]]) +
      " L" + (cx + at("hip") * bt.hem) + " " + hemY +
      " " + curve([[cx + at("hip") * bt.hem, hemY], [cx + at("hip") * bt.knee, y.knee],
        [cx + at("hip") * 1.04, y.hip], [cx + at("waist") * 1.05, wb]]).replace(/^M[^C]*/, "") +
      ' Z" fill="url(#' + u + 'b)"/>');
  } else {
    [-1, 1].forEach(d => {
      const hx = cx + d * at("hip") * 0.50;
      P.push('<path d="' + curve([
        [cx + d * 1.5, wb], [cx + d * at("hip") * 1.04, wb],
        [cx + d * at("hip") * 1.03, y.hip],
        [hx + d * legR * bt.knee, y.knee], [hx + d * calfR * bt.hem * 1.15, hemY]
      ]) + " L" + (hx - d * calfR * bt.hem * 0.55) + " " + hemY +
        " L" + (cx + d * 1.5) + " " + (y.crotch + (y.knee - y.crotch) * 0.12) + ' Z" fill="url(#' + u + 'b)"/>');
    });
    P.push('<path d="M' + cx + ' ' + wb + ' L' + cx + ' ' + (y.crotch + 2) +
      '" stroke="' + shade(bottom, -.10) + '" stroke-width="1.2"/>');
  }

  /* 상의 — 처방된 목선 */
  const sl = cx - at("shoul") * 1.04, sr = cx + at("shoul") * 1.04;
  const nd = { v: 2.9, deepv: 4.4, scoop: 3.1, crew: 1.3, boat: 0.8,
               turtle: 1.0, square: 2.3, cowl: 2.7, off: 0.3 }[neckT] * armR;
  const nw = { v: 1.15, deepv: 1.0, scoop: 1.6, crew: 1.25, boat: 2.5,
               turtle: 1.1, square: 1.5, cowl: 1.7, off: 3.0 }[neckT] * armR;
  const nl = cx - nw, nr = cx + nw, ys = y.shoulder;
  let neck;
  if (neckT === "v" || neckT === "deepv")
    neck = "L" + nl + " " + ys + " L" + cx + " " + (ys + nd) + " L" + nr + " " + ys;
  else if (neckT === "square")
    neck = "L" + nl + " " + ys + " L" + nl + " " + (ys + nd) + " L" + nr + " " + (ys + nd) + " L" + nr + " " + ys;
  else if (neckT === "boat" || neckT === "off")
    neck = "L" + nl + " " + (ys + nd) + " Q" + cx + " " + (ys + nd * 1.7) + " " + nr + " " + (ys + nd);
  else if (neckT === "cowl")
    neck = "L" + nl + " " + ys + " C" + nl + " " + (ys + nd * 1.6) + " " + nr + " " + (ys + nd * 1.6) + " " + nr + " " + ys;
  else
    neck = "L" + nl + " " + ys + " Q" + cx + " " + (ys + nd * 2.0) + " " + nr + " " + ys;

  const topHem = y.hip - (y.hip - y.waist) * 0.18;
  P.push('<path d="M' + sl + " " + ys + " " + neck + " L" + sr + " " + ys +
    " " + curve([[cx + at("armpit") * 1.09, y.armpit], [cx + at("bust") * 1.08, y.bust],
      [cx + at("waist") * 1.12, y.waist], [cx + at("hip") * 1.06, topHem]]).replace(/^M[^C]*/, "") +
    " L" + (cx - at("hip") * 1.06) + " " + topHem +
    " " + curve([[cx - at("hip") * 1.06, topHem], [cx - at("waist") * 1.12, y.waist],
      [cx - at("bust") * 1.08, y.bust], [cx - at("armpit") * 1.09, y.armpit],
      [sl, ys]]).replace(/^M[^C]*/, "") + ' Z" fill="url(#' + u + 't)"/>');
  if (neckT === "turtle")
    P.push('<rect x="' + (cx - nw * 1.1) + '" y="' + (ys - armR * 1.7) + '" width="' + (nw * 2.2) +
      '" height="' + (armR * 2.0) + '" rx="' + (armR * 0.3) + '" fill="' + shade(top, -.05) + '"/>');

  /* 소매 */
  [-1, 1].forEach(d => {
    P.push('<path d="' + curve([
      [cx + d * at("shoul") * 1.02, ys],
      [cx + d * (at("bust") + armR * 2.1), y.bust + armR],
      [cx + d * (at("bust") + armR * 2.3), y.under + armR * 0.6]
    ]) + " l" + (-d * armR * 1.5) + " 0 " +
      curve([[cx + d * (at("bust") + armR * 0.8), y.under + armR * 0.6],
             [cx + d * (at("armpit") * 0.92), y.armpit],
             [cx + d * at("shoul") * 0.55, ys]]).replace(/^M[^C]*/, "") +
      ' Z" fill="' + shade(top, d > 0 ? -.05 : .03) + '"/>');
  });

  /* 포인트 — 좁은 면적에만 */
  if (/hourglass|rectangle/.test(opt.bodyKey || "") || opt.bottom === "aline")
    P.push('<rect x="' + (cx - at("waist") * 1.14) + '" y="' + (y.waist - armR * 0.32) +
      '" width="' + (at("waist") * 2.28) + '" height="' + (armR * 0.64) +
      '" fill="' + point + '" rx="' + (armR * 0.1) + '"/>');
  else
    P.push('<path d="M' + (cx - nw * 1.05) + ' ' + (ys + nd * 0.5) +
      ' Q' + cx + ' ' + (ys + nd * 1.9) + ' ' + (cx + nw * 1.05) + ' ' + (ys + nd * 0.5) +
      ' l0 ' + (armR * 0.6) + ' Q' + cx + ' ' + (ys + nd * 1.9 + armR * 0.6) + ' ' +
      (cx - nw * 1.05) + ' ' + (ys + nd * 0.5 + armR * 0.6) + ' Z" fill="' + point + '"/>');

  return P.join("");
}

export { dressedSVG, neckTypeOf, BOTTOM_TYPE, BOTTOM_SHAPE };
