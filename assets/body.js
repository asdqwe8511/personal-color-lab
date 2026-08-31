/* 체형 분석 · 핏 추천
 *
 * 사진에서 치수를 추정하지 않는다. 사진 기반 치수 추정은 오차가 커서
 * 옷 사이즈처럼 실패 비용이 큰 판단에 쓸 수 없다. 줄자로 잰 값을 받는다.
 */
"use strict";

/* ── 입력 항목 ───────────────────────────────────────────────
 * req: 체형 분류에 반드시 필요한 값
 * 나머지는 있으면 사이즈 가늠이 정밀해지고, 없으면 그 항목만 생략한다.
 */
const FIELDS = [
  { k:"height",   ko:"키",         unit:"cm", req:true,  ph:165, min:130, max:210,
    how:"신발 벗고 벽에 붙어 서서" },
  { k:"shoulder", ko:"어깨너비",   unit:"cm", req:true,  ph:39,  min:30,  max:60,
    how:"뒤쪽 어깨끝뼈에서 반대쪽 어깨끝뼈까지 (둘레 아님)" },
  { k:"bust",     ko:"가슴둘레",   unit:"cm", req:true,  ph:88,  min:65,  max:140,
    how:"가슴에서 가장 나온 지점을 수평으로 한 바퀴" },
  { k:"waist",    ko:"허리둘레",   unit:"cm", req:true,  ph:68,  min:50,  max:140,
    how:"배꼽 위, 옆구리가 가장 들어간 지점" },
  { k:"hip",      ko:"엉덩이둘레", unit:"cm", req:true,  ph:93,  min:65,  max:150,
    how:"엉덩이에서 가장 나온 지점" },

  { k:"neck",     ko:"목둘레",     unit:"cm", group:"top", ph:35, min:26, max:55,
    how:"목 아래쪽, 쇄골 바로 위를 한 바퀴" },
  { k:"sleeve",   ko:"팔길이",     unit:"cm", group:"top", ph:58, min:40, max:80,
    how:"어깨끝에서 팔을 살짝 굽힌 채 손목뼈까지" },
  { k:"wrist",    ko:"손목둘레",   unit:"cm", group:"top", ph:15, min:11, max:25,
    how:"손목뼈 바로 위를 한 바퀴" },

  { k:"thigh",    ko:"허벅지둘레", unit:"cm", group:"bottom", ph:54, min:35, max:90,
    how:"허벅지에서 가장 굵은 지점" },
  { k:"inseam",   ko:"인심",       unit:"cm", group:"bottom", ph:75, min:55, max:100,
    how:"사타구니에서 복사뼈까지 안쪽 다리 길이" },
  { k:"calf",     ko:"종아리둘레", unit:"cm", group:"bottom", ph:35, min:25, max:60,
    how:"종아리에서 가장 굵은 지점" },

  { k:"foot",     ko:"발 길이",    unit:"mm", group:"etc", ph:245, min:200, max:320,
    how:"벽에 발뒤꿈치를 대고 가장 긴 발가락까지" }
];
const REQUIRED = FIELDS.filter(f => f.req).map(f => f.k);

/* ── 체형 기준점 ─────────────────────────────────────────────
 * 얼굴형에서와 같은 이유로 기준점 최근접 방식을 쓴다. 가중합으로 점수를
 * 매기면 '직사각형'처럼 중앙에 있는 체형이 영영 나오지 않는다.
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
    good: ["퍼프·보트넥 등 어깨를 넓히는 상의", "밝은 상의 + 어두운 하의", "A라인·부츠컷 보텀"],
    avoid: ["엉덩이에 붙는 스키니·타이트 스커트", "허벅지에서 끝나는 상의", "밝은색 하의 + 어두운 상의"]
  },
  inverted: {
    ko: "역삼각형", en: "Inverted Triangle",
    desc: "어깨가 엉덩이보다 넓습니다. 아래쪽에 볼륨을 주면 어깨선이 완화됩니다.",
    good: ["A라인·플레어 스커트", "와이드·부츠컷 팬츠", "브이넥으로 어깨 폭 분산"],
    avoid: ["어깨 패드·퍼프 소매", "스키니 보텀", "가로 스트라이프 상의"]
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
    SH: m.shoulder / (m.hip / CIRC_TO_WIDTH),
    WH: m.waist / m.hip,
    BW: m.bust / m.waist
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
 * 브랜드마다 편차가 커서 '가늠치'이지 정답이 아니다.
 */
const TOP_W = [[82, "44 (85)"], [87, "55 (90)"], [92, "66 (95)"], [97, "77 (100)"],
               [103, "88 (105)"], [9e9, "99 (110)"]];
const TOP_M = [[88, "90 (S)"], [94, "95 (M)"], [100, "100 (L)"], [106, "105 (XL)"],
               [112, "110 (2XL)"], [9e9, "115 (3XL)"]];
const pick = (table, v) => (table.find(([max]) => v <= max) || table[table.length - 1])[1];

function sizes(m, system) {
  const table = system === "men" ? TOP_M : TOP_W;
  const out = [
    { key: "상의", value: pick(table, m.bust), note: "가슴둘레 " + m.bust + "cm 기준" },
    { key: "하의", value: Math.round(m.waist / 2.54) + "인치",
      note: "허리둘레 " + m.waist + "cm 환산 · 로우라이즈는 1~2인치 작게" },
    { key: "아우터", value: pick(table, m.bust + 5), note: "이너 두께를 고려해 한 호수 위" }
  ];
  if (system !== "men") {
    const b = m.bust;
    out.splice(2, 0, { key: "원피스",
      value: b <= 84 ? "XS" : b <= 89 ? "S" : b <= 94 ? "M" : b <= 100 ? "L" : b <= 106 ? "XL" : "2XL",
      note: "가슴·엉덩이 중 큰 쪽에 맞추세요" });
  }
  if (m.neck) out.push({ key: "드레스셔츠 목", value: Math.round(m.neck + 1.5) + "cm",
    note: "목둘레 " + m.neck + "cm + 여유 1.5cm" });
  if (m.sleeve) out.push({ key: "소매 기장", value: m.sleeve + "cm",
    note: "재킷은 셔츠보다 1~2cm 짧게 입습니다" });
  if (m.inseam) out.push({ key: "팬츠 기장", value: m.inseam + "cm (인심)",
    note: "제품의 '총장'은 인심 + 밑위입니다" });
  if (m.foot) out.push({ key: "신발", value: Math.round((m.foot + 7) / 5) * 5 + "mm",
    note: "발 길이 " + m.foot + "mm + 여유 7mm" });
  if (m.wrist) out.push({ key: "시계·팔찌", value: Math.round(m.wrist + 1.5) + "cm",
    note: "손목둘레 " + m.wrist + "cm + 여유 1.5cm" });
  return out;
}

/* ── 선택 입력이 있을 때만 나오는 핏 메모 ───────────────────── */
function fitNotes(m) {
  const out = [];
  if (m.thigh && m.hip) {
    const r = m.thigh / m.hip;
    out.push(r > 0.60
      ? "허벅지가 엉덩이 대비 굵은 편입니다(" + r.toFixed(2) + "). 스키니는 허벅지에서 당기기 쉬우니 스트레이트·부츠컷이 편합니다."
      : "허벅지와 엉덩이 비율이 표준 범위입니다(" + r.toFixed(2) + "). 대부분의 팬츠 핏이 무난합니다.");
  }
  if (m.inseam && m.height) {
    const r = m.inseam / m.height;
    out.push(r > 0.47
      ? "다리 길이 비율이 긴 편입니다(인심/키 " + r.toFixed(3) + "). 하이웨이스트를 굳이 쓰지 않아도 비율이 나옵니다."
      : r < 0.44
      ? "상체 비중이 큰 편입니다(인심/키 " + r.toFixed(3) + "). 하이웨이스트와 짧은 상의가 비율에 도움이 됩니다."
      : "상하 비율이 표준 범위입니다(인심/키 " + r.toFixed(3) + ").");
  }
  if (m.calf && m.thigh) {
    const r = m.calf / m.thigh;
    if (r > 0.70) out.push("종아리가 허벅지 대비 굵은 편입니다. 발목에서 좁아지는 부츠는 통이 넉넉한 쪽을 보세요.");
  }
  if (m.neck && m.bust) {
    const r = m.neck / m.bust;
    if (r > 0.42) out.push("목둘레가 가슴 대비 굵은 편입니다. 하이넥보다 브이넥·오픈카라가 답답하지 않습니다.");
  }
  return out;
}

/* ── 입력 점검 ───────────────────────────────────────────────
 * 오타를 그대로 판정에 태우면 엉뚱한 체형이 나온다.
 */
/* 받침 유무에 따라 조사를 고른다. "인심가 / 인심를"은 틀린 한국어다. */
function josa(word, withJong, withoutJong) {
  const c = word.charCodeAt(word.length - 1);
  const hasJong = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0;
  return word + (hasJong ? withJong : withoutJong);
}

function validate(m) {
  const errs = [];
  for (const f of FIELDS) {
    const v = m[f.k];
    const empty = v === undefined || v === null || !isFinite(v);
    if (empty) { if (f.req) errs.push(josa(f.ko, "을", "를") + " 입력하세요"); continue; }
    if (v < f.min || v > f.max)
      errs.push(josa(f.ko, "이", "가") + " " + f.min + "~" + f.max + f.unit +
        " 범위를 벗어납니다 (" + v + ")");
  }
  if (!errs.length) {
    if (m.waist > m.bust + 25) errs.push("허리가 가슴보다 25cm 이상 큽니다 — 입력을 확인해 주세요");
    if (m.shoulder > m.bust * 0.75)
      errs.push("어깨너비가 가슴둘레에 비해 큽니다 — 어깨는 '너비', 가슴은 '둘레'입니다");
    if (m.thigh && m.thigh > m.hip) errs.push("허벅지둘레가 엉덩이둘레보다 큽니다 — 확인해 주세요");
    if (m.calf && m.thigh && m.calf > m.thigh) errs.push("종아리둘레가 허벅지둘레보다 큽니다 — 확인해 주세요");
    if (m.inseam && m.height && m.inseam > m.height * 0.6)
      errs.push("인심이 키에 비해 깁니다 — 인심은 사타구니~복사뼈 안쪽 길이입니다");
  }
  return errs;
}

export { FIELDS, REQUIRED, PROTO, SHAPES, classify, ratios, sizes, fitNotes, validate, CIRC_TO_WIDTH };
