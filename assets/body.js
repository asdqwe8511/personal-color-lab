/* 체형 분석 · 핏 추천
 *
 * 사진에서 치수를 추정하지 않는다. 사진 기반 치수 추정은 오차가 커서
 * 옷 사이즈처럼 실패 비용이 큰 판단에 쓸 수 없다. 줄자로 잰 값을 받는다.
 */
"use strict";

/* ── 체형 기준점 ─────────────────────────────────────────────
 * 얼굴형에서와 같은 이유로 기준점 최근접 방식을 쓴다. 가중합으로 점수를
 * 매기면 '직사각형'처럼 중앙에 있는 체형이 영영 나오지 않는다.
 *   SH = 어깨/엉덩이,  WH = 허리/엉덩이,  BW = 가슴/허리
 */
const PROTO = {
  hourglass: { SH: 1.10, WH: 0.71, BW: 1.32 },
  rectangle: { SH: 1.10, WH: 0.84, BW: 1.10 },
  pear:      { SH: 0.98, WH: 0.73, BW: 1.18 },
  inverted:  { SH: 1.26, WH: 0.79, BW: 1.30 },
  apple:     { SH: 1.12, WH: 0.93, BW: 1.02 }
};
const WEIGHT = { SH: 2.6, WH: 2.4, BW: 1.3 };

const SHAPES = {
  hourglass: {
    ko: "모래시계형", en: "Hourglass",
    desc: "어깨와 엉덩이 폭이 비슷하고 허리가 뚜렷하게 들어갑니다. 허리선을 살리는 옷이 가장 잘 맞습니다.",
    good: ["허리를 잡아주는 벨티드·랩 원피스", "하이웨이스트 보텀", "몸선을 따라가는 니트"],
    avoid: ["허리선을 지우는 박스형 오버핏", "통짜 시프트 원피스", "밑단이 넓은 스목 상의"]
  },
  rectangle: {
    ko: "직사각형", en: "Rectangle",
    desc: "어깨·허리·엉덩이 폭 차이가 작습니다. 굴곡을 만들어주는 디테일이 있으면 입체감이 생깁니다.",
    good: ["페플럼·러플로 허리 위아래 대비 만들기", "레이어드로 상하 분절", "벨트로 허리 위치 지정"],
    avoid: ["위아래가 같은 폭의 일자 실루엣", "허리가 없는 롱 카디건 단독", "과한 오버핏"]
  },
  pear: {
    ko: "서양배형", en: "Pear",
    desc: "엉덩이가 어깨보다 넓습니다. 위쪽에 시선과 볼륨을 더하면 위아래 균형이 맞습니다.",
    good: ["퍼프·보트넥 등 어깨를 넓히는 상의", "밝은 상의 + 어두운 하의", "A라인·부츠컷 보텀"]
  ,
    avoid: ["엉덩이에 붙는 스키니·타이트 스커트", "허벅지에서 끝나는 상의", "밝은색 하의 + 어두운 상의"]
  },
  inverted: {
    ko: "역삼각형", en: "Inverted Triangle",
    desc: "어깨가 엉덩이보다 넓습니다. 아래쪽에 볼륨을 주면 어깨선이 완화됩니다.",
    good: ["A라인·플레어 스커트", "와이드·부츠컷 팬츠", "브이넥으로 어깨 폭 분산"],
    avoid: ["어깨 패드·퍼프 소매", "스키니 보텀", "호리존탈 스트라이프 상의"]
  },
  apple: {
    ko: "사과형", en: "Apple",
    desc: "허리 둘레가 가슴·엉덩이와 가깝습니다. 세로선을 만들고 허리를 지나치게 조이지 않는 옷이 편합니다.",
    good: ["엠파이어 라인 원피스", "오픈 카디건·롱 재킷의 세로선", "스트레이트·와이드 보텀"],
    avoid: ["허리를 꽉 조이는 벨트", "몸에 붙는 크롭 상의", "허리에 개더가 몰린 디자인"]
  }
};

/* 어깨는 '너비', 가슴·허리·엉덩이는 '둘레'라 그대로 나누면 안 된다.
 * 단면을 깊이 0.72배의 타원으로 보면 둘레 ≈ 2.74 × 폭이므로,
 * 엉덩이 둘레를 폭으로 환산한 뒤 어깨너비와 비교한다. */
const CIRC_TO_WIDTH = 2.74;
function ratios(m) {
  return {
    SH: m.shoulder / (m.hip / CIRC_TO_WIDTH),   // 어깨너비 / 엉덩이 폭
    WH: m.waist / m.hip,                        // 둘레끼리
    BW: m.bust / m.waist                        // 둘레끼리
  };
}

function classify(m) {
  const r = ratios(m), score = {};
  for (const k in PROTO) {
    const q = PROTO[k];
    const d = ["SH", "WH", "BW"].reduce((a, f) => {
      const t = (r[f] - q[f]) * WEIGHT[f];
      return a + t * t;
    }, 0);
    score[k] = -Math.sqrt(d);
  }
  const order = Object.keys(score).sort((a, b) => score[b] - score[a]);
  return { key: order[0], second: order[1], scores: score, ratios: r,
           margin: score[order[0]] - score[order[1]] };
}

/* ── 기성복 사이즈 가늠 ──────────────────────────────────────
 * 브랜드마다 편차가 커서 '가늠치'이지 정답이 아니다. 가슴·허리 둘레를
 * 국내에서 통용되는 호수 구간에 맞춘다.
 */
const TOP_W = [[82, "44 (85)"], [87, "55 (90)"], [92, "66 (95)"], [97, "77 (100)"],
               [103, "88 (105)"], [999, "99 (110)"]];
const TOP_M = [[88, "90 (S)"], [94, "95 (M)"], [100, "100 (L)"], [106, "105 (XL)"],
               [112, "110 (2XL)"], [999, "115 (3XL)"]];

function sizes(m, system) {
  const table = system === "men" ? TOP_M : TOP_W;
  let top = table[table.length - 1][1];
  for (const [max, label] of table) { if (m.bust <= max) { top = label; break; } }
  // 하의는 허리둘레를 인치로 환산. 저허리 제품은 보통 1~2인치 작게 나온다.
  const inch = Math.round(m.waist / 2.54);
  const out = [
    { key: "상의", value: top, note: "가슴둘레 " + m.bust + "cm 기준" },
    { key: "하의", value: inch + "인치", note: "허리둘레 " + m.waist + "cm 환산 · 로우라이즈는 1~2인치 작게" }
  ];
  if (system !== "men") {
    const dress = m.bust <= 84 ? "XS" : m.bust <= 89 ? "S" : m.bust <= 94 ? "M"
      : m.bust <= 100 ? "L" : m.bust <= 106 ? "XL" : "2XL";
    out.push({ key: "원피스", value: dress, note: "가슴·엉덩이 중 큰 쪽에 맞추세요" });
  }
  out.push({
    key: "아우터",
    value: (system === "men" ? TOP_M : TOP_W)
      .find(([max]) => m.bust + 5 <= max)?.[1] ?? "가장 큰 호수",
    note: "이너 두께를 고려해 한 호수 위로 잡았습니다"
  });
  return out;
}

/* ── 입력 점검 ───────────────────────────────────────────────
 * 오타를 그대로 판정에 태우면 엉뚱한 체형이 나온다.
 */
const RANGE = {
  height:   [130, 210, "키"],
  shoulder: [30,  60,  "어깨너비"],
  bust:     [65,  140, "가슴둘레"],
  waist:    [50,  140, "허리둘레"],
  hip:      [65,  150, "엉덩이둘레"]
};
function validate(m) {
  const errs = [];
  for (const k in RANGE) {
    const [lo, hi, ko] = RANGE[k];
    const v = m[k];
    if (!isFinite(v) || v <= 0) errs.push(ko + "를 입력하세요");
    else if (v < lo || v > hi) errs.push(ko + "가 " + lo + "~" + hi + "cm 범위를 벗어납니다 (" + v + ")");
  }
  if (!errs.length) {
    if (m.waist > m.bust + 25) errs.push("허리가 가슴보다 25cm 이상 큽니다 — 입력을 확인해 주세요");
    if (m.shoulder > m.bust * 0.75) errs.push("어깨너비가 가슴둘레에 비해 큽니다 — 어깨는 '너비', 가슴은 '둘레'입니다");
  }
  return errs;
}

export { PROTO, SHAPES, classify, ratios, sizes, validate, RANGE };
