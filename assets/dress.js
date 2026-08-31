/* 착장 그림 — 측정한 체형에 처방된 옷을 입혀 그린다.
 *
 * 생성형 이미지 모델을 쓰지 않는다. 모델은 '일반적인 사람'을 그리지
 * 이 사람의 어깨 39cm, 허리 66cm, 실측 피부색을 반영하지 못한다.
 * 여기서는 측정값 그대로를 좌표로 써서 그린다.
 */
"use strict";

const CIRC_TO_WIDTH = 2.74;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ── 넥라인 ──────────────────────────────────────────────────
 * 처방된 목선 이름을 실제로 그릴 수 있는 형태로 옮긴다.
 */
const NECK_TYPE = {
  "브이넥": "v", "딥 브이넥": "deepv", "부드러운 브이넥": "v",
  "스쿱넥": "scoop", "라운드넥": "crew", "크루넥": "crew",
  "보트넥": "boat", "각진 보트넥": "boat", "터틀넥": "turtle",
  "스퀘어넥": "square", "카울넥": "cowl", "오프숄더": "off",
  "대부분의 목선": "crew"
};
function neckTypeOf(name) { return NECK_TYPE[name] || "crew"; }

/* 좌우 어깨점에서 목둘레 곡선을 그린다 */
function neckEdge(t, Lx, Rx, y, cx, unit) {
  const d = { v: 2.6, deepv: 4.2, scoop: 3.0, crew: 1.2, boat: 0.7,
              turtle: 1.0, square: 2.2, cowl: 2.6, off: 0.2 }[t] * unit;
  const halfW = { v: 1.1, deepv: 1.0, scoop: 1.5, crew: 1.2, boat: 2.3,
                  turtle: 1.1, square: 1.4, cowl: 1.6, off: 2.9 }[t] * unit;
  const nl = cx - halfW, nr = cx + halfW;
  if (t === "v" || t === "deepv")
    return "L" + nl + " " + y + " L" + cx + " " + (y + d) + " L" + nr + " " + y;
  if (t === "square")
    return "L" + nl + " " + y + " L" + nl + " " + (y + d) + " L" + nr + " " + (y + d) + " L" + nr + " " + y;
  if (t === "boat" || t === "off")
    return "L" + nl + " " + (y + d) + " Q" + cx + " " + (y + d * 1.6) + " " + nr + " " + (y + d);
  if (t === "cowl")
    return "L" + nl + " " + y + " C" + nl + " " + (y + d * 1.5) + " " + nr + " " + (y + d * 1.5) + " " + nr + " " + y;
  // scoop / crew / turtle
  return "L" + nl + " " + y + " Q" + cx + " " + (y + d * 1.9) + " " + nr + " " + y;
}

/* ── 하의 실루엣 ─────────────────────────────────────────────── */
const BOTTOM_TYPE = {
  hourglass: "straight", rectangle: "wide", pear: "bootcut",
  inverted: "wide", apple: "straight"
};
/* 밑단/무릎 폭 배율 (엉덩이 폭 기준) */
const BOTTOM_SHAPE = {
  straight: { knee: 0.52, hem: 0.50 },
  wide:     { knee: 0.72, hem: 0.86 },
  bootcut:  { knee: 0.44, hem: 0.66 },
  skinny:   { knee: 0.36, hem: 0.28 },
  aline:    { knee: 0.95, hem: 1.20 }
};

/* ── 착장 그림 ───────────────────────────────────────────────── */
let _u = 0;
function dressedSVG(m, outfit, opt) {
  opt = opt || {};
  const W = opt.width || 200, H = opt.height || 420;
  const skin = opt.skin || "#C9A183", hair = opt.hair || "#3A2A22";
  const neckT = neckTypeOf(opt.neckline || "라운드넥");
  const bt = BOTTOM_SHAPE[opt.bottom || BOTTOM_TYPE[opt.bodyKey] || "straight"];
  const uid = "d" + (++_u);

  const top = outfit.items[0].c.hex, bottom = outfit.items[1].c.hex, point = outfit.items[2].c.hex;

  const yTop = H * 0.02, yFoot = H * 0.985, FH = yFoot - yTop;
  const s = FH / m.height;                       // px per cm
  const w = c => (c / CIRC_TO_WIDTH) * s / 2;    // 둘레 → 반폭 px
  const cx = W / 2;
  const headH = (m.height / 7.6) * s;
  /* 어깨를 0.200에 두면 목이 신장의 6.6%가 되어 지나치게 길다 (실제 4% 안팎) */
  const yShoulder = yTop + FH * 0.172, yBust = yTop + FH * 0.258;
  const yWaist = yTop + FH * 0.370, yHip = yTop + FH * 0.475;
  const yKnee = yTop + FH * 0.705, yAnkle = yTop + FH * 0.945;
  const shW = (m.shoulder * s) / 2;
  const bW = w(m.bust), wW = w(m.waist), hW = w(m.hip);
  const unit = shW * 0.30;
  const P = [];

  /* 몸 — 실측 피부색으로 */
  P.push('<ellipse cx="' + cx + '" cy="' + (yTop + headH * 0.52) + '" rx="' + (headH * 0.34) +
    '" ry="' + (headH * 0.46) + '" fill="' + skin + '"/>');
  P.push('<path d="M' + (cx - headH * 0.36) + ' ' + (yTop + headH * 0.46) +
    ' a' + (headH * 0.36) + ' ' + (headH * 0.48) + ' 0 0 1 ' + (headH * 0.72) + ' 0' +
    ' l0 ' + (-headH * 0.12) + ' a' + (headH * 0.36) + ' ' + (headH * 0.42) + ' 0 0 0 ' +
    (-headH * 0.72) + ' 0 Z" fill="' + hair + '"/>');
  P.push('<rect x="' + (cx - unit * 0.8) + '" y="' + (yTop + headH * 0.9) + '" width="' + (unit * 1.6) +
    '" height="' + (yShoulder - yTop - headH * 0.85) + '" fill="' + skin + '"/>');
  // 몸통·다리 (옷 아래로 비치는 부분)
  P.push('<path d="M' + (cx - shW) + ' ' + yShoulder + ' C' + (cx - bW) + ' ' + yBust +
    ' ' + (cx - wW) + ' ' + yWaist + ' ' + (cx - wW) + ' ' + yWaist +
    ' C' + (cx - hW) + ' ' + yHip + ' ' + (cx - hW) + ' ' + yHip + ' ' + (cx - hW) + ' ' + yHip +
    ' L' + (cx + hW) + ' ' + yHip + ' C' + (cx + wW) + ' ' + yWaist + ' ' + (cx + bW) + ' ' + yBust +
    ' ' + (cx + shW) + ' ' + yShoulder + ' Z" fill="' + skin + '"/>');
  [-1, 1].forEach(g => {                          // 팔
    P.push('<path d="M' + (cx + g * shW * 0.94) + ' ' + yShoulder +
      ' L' + (cx + g * (hW + unit * 0.5)) + ' ' + (yHip + unit) +
      ' l' + (g * unit * 0.75) + ' 0 L' + (cx + g * shW * 0.94 + g * unit * 0.9) + ' ' + yShoulder +
      ' Z" fill="' + skin + '"/>');
    P.push('<path d="M' + (cx + g * unit * 0.35) + ' ' + yHip +
      ' L' + (cx + g * hW * 0.94) + ' ' + yHip +
      ' L' + (cx + g * hW * bt.knee) + ' ' + yKnee +
      ' L' + (cx + g * hW * bt.hem * 0.62) + ' ' + yAnkle +
      ' L' + (cx + g * unit * 0.3) + ' ' + yAnkle + ' Z" fill="' + skin + '"/>');
  });

  /* 하의 — 실루엣 유형에 따라 무릎·밑단 폭이 달라진다 */
  const bottomHem = opt.bottom === "aline" ? yKnee + (yAnkle - yKnee) * 0.45 : yAnkle;
  P.push('<path d="M' + (cx - hW * 1.03) + ' ' + (yWaist + (yHip - yWaist) * 0.15) +
    ' L' + (cx + hW * 1.03) + ' ' + (yWaist + (yHip - yWaist) * 0.15) +
    ' L' + (cx + hW * 1.02) + ' ' + yHip +
    ' L' + (cx + hW * bt.knee * 1.12) + ' ' + yKnee +
    ' L' + (cx + hW * bt.hem * 1.1) + ' ' + bottomHem +
    ' L' + (cx - hW * bt.hem * 1.1) + ' ' + bottomHem +
    ' L' + (cx - hW * bt.knee * 1.12) + ' ' + yKnee +
    ' L' + (cx - hW * 1.02) + ' ' + yHip + ' Z" fill="' + bottom + '"/>');
  if (opt.bottom !== "aline")                     // 가랑이 분할선
    P.push('<path d="M' + cx + ' ' + (yHip + unit * 0.4) + ' L' + cx + ' ' + bottomHem +
      '" stroke="rgba(0,0,0,.16)" stroke-width="1.4"/>');

  /* 상의 — 처방된 목선으로 */
  const hemY = yHip + (yWaist - yHip) * -0.15;
  const sl = cx - shW * 1.03, sr = cx + shW * 1.03;
  let d = "M" + sl + " " + yShoulder + " ";
  d += neckEdge(neckT, sl, sr, yShoulder, cx, unit);
  d += " L" + sr + " " + yShoulder +
       " C" + (cx + bW * 1.12) + " " + yBust + " " + (cx + wW * 1.14) + " " + yWaist +
       " " + (cx + hW * 1.06) + " " + hemY +
       " L" + (cx - hW * 1.06) + " " + hemY +
       " C" + (cx - wW * 1.14) + " " + yWaist + " " + (cx - bW * 1.12) + " " + yBust +
       " " + sl + " " + yShoulder + " Z";
  P.push('<path d="' + d + '" fill="' + top + '"/>');
  if (neckT === "turtle")
    P.push('<rect x="' + (cx - unit * 1.15) + '" y="' + (yShoulder - unit * 1.5) + '" width="' + (unit * 2.3) +
      '" height="' + (unit * 1.8) + '" rx="' + (unit * 0.35) + '" fill="' + top + '"/>');
  // 소매
  [-1, 1].forEach(g => {
    P.push('<path d="M' + (cx + g * shW * 0.99) + ' ' + yShoulder +
      ' L' + (cx + g * (bW * 1.1 + unit * 0.5)) + ' ' + (yBust + unit * 1.6) +
      ' l' + (g * unit * 0.95) + ' 0 L' + (cx + g * shW * 0.99 + g * unit * 1.05) + ' ' + yShoulder +
      ' Z" fill="' + top + '"/>');
  });

  /* 포인트 — 좁은 면적에만 (스카프/벨트) */
  if (opt.bottom === "aline" || /hourglass|rectangle/.test(opt.bodyKey || ""))
    P.push('<rect x="' + (cx - wW * 1.16) + '" y="' + (yWaist - unit * 0.34) + '" width="' + (wW * 2.32) +
      '" height="' + (unit * 0.68) + '" fill="' + point + '"/>');
  else
    P.push('<path d="M' + (cx - unit * 1.4) + ' ' + (yShoulder + unit * 0.4) +
      ' q' + (unit * 1.4) + ' ' + (unit * 1.5) + ' ' + (unit * 2.8) + ' 0' +
      ' l0 ' + (unit * 0.62) + ' q' + (-unit * 1.4) + ' ' + (unit * 1.5) + ' ' + (-unit * 2.8) + ' 0 Z"' +
      ' fill="' + point + '"/>');

  /* 신발 */
  [-1, 1].forEach(g => P.push('<ellipse cx="' + (cx + g * hW * 0.5) + '" cy="' + (yFoot - unit * 0.25) +
    '" rx="' + (unit * 0.72) + '" ry="' + (unit * 0.34) + '" fill="rgba(0,0,0,.42)"/>'));

  return P.join("");
}

export { dressedSVG, neckTypeOf, BOTTOM_TYPE, BOTTOM_SHAPE };
