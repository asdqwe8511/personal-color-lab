/* 의류 처방 — 퍼스널 컬러 · 얼굴형 · 체형을 합쳐 '무엇을 살지'를 특정한다.
 *
 * 상품 목록을 만들지 않는다. 실제 카탈로그 없이 브랜드·가격을 지어내면
 * 그럴듯한 가짜가 되고, 링크를 누른 사람이 손해를 본다. 대신 색·넥라인·
 * 실루엣·소재를 특정한 처방을 만들고, 그걸 실제 쇼핑몰 검색으로 넘긴다.
 * 제휴 계정이 생기면 이 검색 링크가 그대로 제휴 링크 자리가 된다.
 */
"use strict";

/* ── 색채 (index.html과 동일한 변환) ────────────────────────── */
const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const l2s = c => { c = Math.max(0, Math.min(1, c)); return (c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c) * 255; };
const finv = t => { const c = t * t * t; return c > 0.008856 ? c : (t - 16 / 116) / 7.787; };
function lab2rgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = Xn * finv(fx), Y = Yn * finv(fy), Z = Zn * finv(fz);
  return [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
          -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
          0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z];
}
const hx2 = n => { n = Math.round(n); n = n < 0 ? 0 : n > 255 ? 255 : n; return (n < 16 ? "0" : "") + n.toString(16); };
const inGamut = (L, a, b) => lab2rgb(L, a, b).every(c => c >= -0.002 && c <= 1.002);
function lchHex(L, C, h) {
  const r = h * Math.PI / 180; let c = C;
  while (c > 0 && !inGamut(L, c * Math.cos(r), c * Math.sin(r))) c -= 0.5;
  const rgb = lab2rgb(L, c * Math.cos(r), c * Math.sin(r));
  return "#" + rgb.map(v => hx2(l2s(v))).join("");
}

const hex2rgbS = h => [1,3,5].map(i => parseInt(h.substr(i,2),16));
function labOf(hex){
  const [r,g,b] = hex2rgbS(hex);
  const R=s2l(r),G=s2l(g),B=s2l(b);
  const X=(0.4124564*R+0.3575761*G+0.1804375*B)/Xn;
  const Y=(0.2126729*R+0.7151522*G+0.0721750*B)/Yn;
  const Z=(0.0193339*R+0.1191920*G+0.9503041*B)/Zn;
  const f=t=>t>0.008856?Math.cbrt(t):7.787*t+16/116;
  const fx=f(X),fy=f(Y),fz=f(Z);
  return [116*fy-16,500*(fx-fy),200*(fy-fz)];
}

/* ── 계절별 뉴트럴 ───────────────────────────────────────────
 * 웜 타입에게 순검정, 쿨 타입에게 크림색을 주면 안 된다.
 * 계절 색상 편향을 넣은 저채도 색으로 생성한다.
 */
const NEUTRAL_SPEC = {
  spring: { h: 72, C: 11, names: ["아이보리", "카멜", "웜 브라운"] },
  summer: { h: 262, C: 7, names: ["오프화이트", "소프트 그레이", "네이비"] },
  autumn: { h: 58, C: 13, names: ["크림", "카키 베이지", "다크 브라운"] },
  winter: { h: 280, C: 5, names: ["퓨어 화이트", "차콜", "블랙"] }
};
function neutrals(season) {
  const q = NEUTRAL_SPEC[season] || NEUTRAL_SPEC.winter;
  const Ls = season === "winter" ? [96, 40, 18] : season === "autumn" ? [92, 55, 26] : [93, 58, 30];
  return Ls.map((L, i) => ({ hex: lchHex(L, q.C, q.h), name: q.names[i] }));
}

/* ── 얼굴형 → 넥라인 ─────────────────────────────────────────
 * 얼굴의 형태와 반대 방향의 선을 목선에 두면 균형이 잡힌다.
 */
const NECK = {
  round:   { good: ["브이넥", "딥 브이넥", "스퀘어넥"], avoid: ["목이 좁은 라운드넥", "터틀넥"],
             why: "세로로 열리는 목선이 가로 폭을 눌러줍니다" },
  square:  { good: ["스쿱넥", "부드러운 브이넥", "라운드넥"], avoid: ["스퀘어넥", "각진 보트넥"],
             why: "곡선 목선이 턱의 각을 부드럽게 받습니다" },
  oblong:  { good: ["보트넥", "크루넥", "터틀넥", "오프숄더"], avoid: ["깊은 브이넥", "딥 U넥"],
             why: "가로로 넓은 목선이 얼굴 길이를 끊어줍니다" },
  heart:   { good: ["스쿱넥", "라운드넥", "카울넥"], avoid: ["홀터넥", "스트랩리스"],
             why: "아래쪽에 폭을 주면 좁은 턱과 균형이 맞습니다" },
  diamond: { good: ["스쿱넥", "보트넥", "카울넥"], avoid: ["깊은 브이넥", "하이넥"],
             why: "광대보다 아래·위에 폭을 만들어 균형을 잡습니다" },
  oval:    { good: ["대부분의 목선"], avoid: [],
             why: "비율이 균형적이라 목선 선택이 자유롭습니다" }
};

/* ── 체형 → 실루엣 ───────────────────────────────────────────── */
const SILHOUETTE = {
  hourglass: { top:"허리가 들어간 핏, 랩·벨티드", bottom:"하이웨이스트 스트레이트·플레어",
               outer:"허리를 잡는 트렌치·테일러드", dress:"랩 원피스",
               key:"허리선", avoid:"박스형 오버핏" },
  rectangle: { top:"페플럼·러플, 레이어드", bottom:"하이웨이스트 와이드·A라인",
               outer:"벨트 있는 코트", dress:"허리 디테일 있는 원피스",
               key:"허리 만들기", avoid:"위아래 같은 폭의 일자" },
  pear:      { top:"퍼프소매·보트넥, 밝은 색", bottom:"A라인·부츠컷, 어두운 색",
               outer:"어깨가 있는 재킷", dress:"엠파이어·A라인",
               key:"위쪽 볼륨", avoid:"엉덩이에 붙는 스키니" },
  inverted:  { top:"브이넥·래글런, 어두운 색", bottom:"와이드·플레어, 밝은 색",
               outer:"어깨 패드 없는 드롭숄더", dress:"A라인 원피스",
               key:"아래쪽 볼륨", avoid:"퍼프소매·어깨 패드" },
  apple:     { top:"엠파이어 라인, 세로 절개", bottom:"스트레이트·와이드",
               outer:"길게 떨어지는 오픈 재킷", dress:"엠파이어 원피스",
               key:"세로선", avoid:"허리를 조이는 벨트" }
};

/* ── 계절 → 소재·마감 ────────────────────────────────────────── */
const FABRIC = {
  spring: { text:"가볍고 매끈한 소재에 은은한 광택", ex:["실크", "코튼 포플린", "얇은 니트"],
            avoid:"거친 트위드·두꺼운 기모" },
  summer: { text:"부드럽고 흐릿한 무광~반광 소재", ex:["리넨", "시폰", "레이온", "소프트 코튼"],
            avoid:"번쩍이는 새틴·에나멜" },
  autumn: { text:"질감이 살아 있는 무광 소재", ex:["스웨이드", "트위드", "코듀로이", "울"],
            avoid:"차가운 광택의 새틴" },
  winter: { text:"매끈하고 단단한, 광택 있는 소재", ex:["새틴", "가죽", "울 개버딘", "포플린"],
            avoid:"보풀 이는 헤더 니트" }
};

/* ── 선명도 → 패턴 ───────────────────────────────────────────── */
function patternFor(colorKey) {
  const bright = /bright|vivid/.test(colorKey), mute = /mute|light/.test(colorKey);
  if (bright) return { text:"고대비 큰 패턴을 감당합니다", ex:["볼드 스트라이프", "큰 체크", "그래픽 프린트"], avoid:"흐린 파스텔 잔무늬" };
  if (mute) return { text:"저대비 작은 패턴이 어울립니다", ex:["잔잔한 도트", "톤온톤 스트라이프", "작은 플로럴"], avoid:"흑백 고대비 대형 패턴" };
  return { text:"중간 대비 패턴이 무난합니다", ex:["미디엄 체크", "은은한 헤링본"], avoid:"극단적인 고대비·초저대비" };
}

/* ── 코디 조합 생성 ──────────────────────────────────────────
 * 팔레트 안에서만 고른다. 팔레트 밖 색을 섞으면 진단이 무의미해진다.
 */
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const bareName = n => n.replace(/^(라이트|딥|더스티|비비드|다크)\s/, "");

function outfits(best, season) {
  const N = neutrals(season);
  if (!best.length) return [];
  // '무난한' 기준색 — 명도가 중간이고 채도가 과하지 않은 것
  const wear = best.slice().sort((x, y) =>
    (Math.abs(x.L - 62) + x.C * 0.25) - (Math.abs(y.L - 62) + y.C * 0.25));
  const anchor = wear[0];
  const vivid = best.slice().sort((x, y) => y.C - x.C)[0];

  /* 톤온톤은 '같은 색상각에서 명도만 다르게'다. 명도 순으로만 고르면
     색상 계열이 제각각이 되어 톤온톤이 아니게 된다 — 색을 직접 생성한다. */
  const base = bareName(anchor.name);
  const tone = [[anchor.L + 15, 1, "라이트 "], [anchor.L, 1, ""], [anchor.L - 22, 0.92, "딥 "]]
    .map(([L, k, pre]) => ({
      hex: lchHex(clamp(L, 18, 93), anchor.C * k, anchor.h),
      name: pre + base
    }));

  const hueGap = (x, y) => { const d = Math.abs(x.h - y.h) % 360; return d > 180 ? 360 - d : d; };
  let far = [best[0], best[best.length - 1]], fd = 0;
  for (let i = 0; i < best.length; i++) for (let j = i + 1; j < best.length; j++) {
    const d = hueGap(best[i], best[j]); if (d > fd) { fd = d; far = [best[i], best[j]]; }
  }

  return [
    { name: "뉴트럴 베이스", why: "가장 실패가 적은 조합. 색은 상의 하나로만 씁니다.",
      items: [{ role:"상의", c:anchor }, { role:"하의", c:N[2] }, { role:"포인트", c:N[0] }] },
    { name: "톤온톤", why: base + " 계열을 명도만 다르게 썼습니다. 세로로 이어져 키가 커 보입니다.",
      items: [{ role:"상의", c:tone[0] }, { role:"하의", c:tone[2] }, { role:"포인트", c:tone[1] }] },
    { name: "대비 조합", why: "팔레트 안에서 색상각이 " + Math.round(fd) + "° 벌어진 두 색. 포인트는 좁은 면적에만.",
      items: [{ role:"상의", c:far[0] }, { role:"하의", c:N[2] }, { role:"포인트", c:far[1] }] },
    { name: "포인트 하나", why: "위아래를 뉴트럴로 두고 채도 높은 색을 한 곳에만. 실패 위험이 가장 낮습니다.",
      items: [{ role:"상의", c:N[0] }, { role:"하의", c:N[2] }, { role:"포인트", c:vivid }] }
  ];
}

/* ── 이미지 생성 프롬프트 ────────────────────────────────────
 * 색 이름을 영어 일반 색상어로 바꿔 넣는다. 앞선 실험에서
 * "coral pink"는 ΔE 40.9, "light apricot"은 10.6 이었다 —
 * 프롬프트의 색 단어가 결과 색을 가장 크게 좌우한다.
 */
function enColor(hex) {
  const L = labOf(hex), C = Math.hypot(L[1], L[2]);
  let h = Math.atan2(L[2], L[1]) * 180 / Math.PI; if (h < 0) h += 360;
  const lt = L[0] > 74, dk = L[0] < 40;
  if (C < 12) return lt ? "off-white" : L[0] > 45 ? "warm grey" : "charcoal black";
  if (h < 20 || h >= 345) return dk ? "deep burgundy" : lt ? "soft rose pink" : "true red";
  if (h < 45) return lt ? "pale ivory" : dk ? "chocolate brown" : "light apricot";
  if (h < 75) return lt ? "cream" : dk ? "dark brown" : "warm camel";
  if (h < 105) return lt ? "pale lemon" : "mustard yellow";
  if (h < 165) return dk ? "deep olive" : "sage green";
  if (h < 215) return lt ? "pale mint" : "teal";
  if (h < 265) return dk ? "navy blue" : lt ? "sky blue" : "cobalt blue";
  if (h < 310) return dk ? "deep indigo" : "lavender";
  return dk ? "wine" : "orchid purple";
}
const EN_NECK = {
  "브이넥": "v-neck", "딥 브이넥": "deep v-neck", "부드러운 브이넥": "soft v-neck",
  "스쿱넥": "scoop neck", "라운드넥": "round neck", "크루넥": "crew neck",
  "보트넥": "boat neck", "터틀넥": "turtleneck", "스퀘어넥": "square neck",
  "카울넥": "cowl neck", "오프숄더": "off-shoulder", "대부분의 목선": "round neck"
};
const EN_BODY = {
  hourglass: "hourglass figure with a clearly defined waist",
  rectangle: "straight balanced figure",
  pear: "narrower shoulders with fuller hips",
  inverted: "broad shoulders with narrower hips",
  apple: "fuller midsection with a softly defined waist"
};
const EN_BOTTOM = {
  straight: "straight-leg trousers", wide: "wide-leg trousers",
  bootcut: "bootcut trousers", skinny: "slim trousers", aline: "a-line skirt"
};
/* 실측값을 구조화해 넣으면 실루엣이 실제로 따라온다 — 단순 프롬프트와
 * 비교했을 때 와이드 팬츠·스쿱넥·팔 위치가 지시대로 나오는 것을 확인했다.
 * 다만 색은 여전히 따라오지 않는다. 색의 정답은 팔레트 hex 와 상품 카드다. */
function outfitPrompt(outfit, opt) {
  opt = opt || {};
  const m = opt.m || {};
  const top = enColor(outfit.items[0].c.hex);
  const bot = enColor(outfit.items[1].c.hex);
  const neck = EN_NECK[opt.neckline] || "round neck";
  const bottom = EN_BOTTOM[opt.bottom] || "straight-leg trousers";
  const who = opt.gender === "men" ? "man" : "woman";

  /* 치수를 문장으로 옮긴다. 모델이 cm 를 재현하진 못하지만
     '어깨가 엉덩이보다 좁다' 같은 관계는 실루엣에 반영된다. */
  const body = [];
  if (m.shoulder && m.hip) {
    const r = m.shoulder / (m.hip / 2.74);
    body.push(r > 1.18 ? "shoulders distinctly broader than the hips"
            : r < 1.02 ? "shoulders noticeably narrower than the hips"
            : "shoulders and hips of similar width");
    body.push("shoulder width " + m.shoulder + "cm, hip circumference " + m.hip + "cm");
  }
  if (m.waist && m.hip) {
    const w = m.waist / m.hip;
    body.push(w < 0.75 ? "clearly indented waist"
            : w > 0.88 ? "softly defined waistline"
            : "moderately defined waist");
    body.push("waist " + m.waist + "cm");
  }
  if (m.height) body.push("height " + m.height + "cm");
  if (EN_BODY[opt.bodyKey]) body.push(EN_BODY[opt.bodyKey]);

  return [
    "editorial full-body fashion lookbook photograph, single Korean " + who,
    /* 자세가 흐트러지면 실루엣 비교가 안 된다 — 정면·대칭·직립을 명시 */
    "standing perfectly upright and symmetrical, facing the camera straight on",
    "shoulders level, hips level, weight evenly on both feet, feet together and flat on the floor",
    "no contrapposto, body not turned or tilted, head straight and level",
    "arms hanging relaxed slightly away from the torso so the waistline is visible",
    /* 머리끝부터 신발까지 다 들어와야 한다 */
    "full length shot, entire body from the top of the head to the shoes fully inside the frame",
    "generous empty space above the head and below the shoes, nothing cropped",
    "BODY: " + body.join(", "),
    "TOP: " + top.toUpperCase() + " colored fine-knit top, " + top + " hue, " +
      neck + ", hem ending at the high hip",
    "BOTTOM: " + bot.toUpperCase() + " " + bottom + ", full length",
    "plain pale grey seamless backdrop, soft even studio lighting",
    "natural realistic proportions, sharp focus, no text, no logo, no cropping"
  ].join(". ");
}

/* ── 쇼핑 검색어 ─────────────────────────────────────────────
 * 처방을 실제 검색으로 옮긴다. 제휴 계정이 생기면 이 링크가 제휴 링크가 된다.
 */
const SHOPS = [
  { ko:"무신사", url:q => "https://www.musinsa.com/search/musinsa/integration?q=" + encodeURIComponent(q) },
  { ko:"29CM",  url:q => "https://search.29cm.co.kr/search?keyword=" + encodeURIComponent(q) },
  { ko:"네이버쇼핑", url:q => "https://search.shopping.naver.com/search/all?query=" + encodeURIComponent(q) },
  { ko:"쿠팡",  url:q => "https://www.coupang.com/np/search?q=" + encodeURIComponent(q) }
];
function queries(colorName, faceKey, bodyKey) {
  const s = SILHOUETTE[bodyKey], n = NECK[faceKey];
  const neck = n.good[0], color = colorName.replace(/^(라이트|딥|더스티|비비드|다크)\s/, "");
  return [
    { label:"상의", q:[color, neck, "티셔츠"].join(" ") },
    { label:"니트", q:[color, neck, "니트"].join(" ") },
    { label:"아우터", q:[s.outer.split("·")[0], "자켓"].join(" ") },
    { label:"하의", q:[s.bottom.split(",")[0].split("·")[0], "팬츠"].join(" ") },
    { label:"원피스", q:[color, s.dress].join(" ") }
  ];
}

export { neutrals, NECK, SILHOUETTE, FABRIC, patternFor, outfits, queries, SHOPS,
         lchHex, enColor, outfitPrompt };
