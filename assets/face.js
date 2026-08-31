/* 얼굴형 · 이목구비 분석
 *
 * MediaPipe Face Landmarker(468점 + 홍채 10점)를 브라우저에서 실행한다.
 * 사진과 랜드마크는 기기를 벗어나지 않는다. 서버 전송이 필요해지면
 * sendToServer()의 주석 지점 한 곳만 연결하면 된다.
 */
"use strict";

/* ── 얼굴 윤곽 링 (MediaPipe FACEMESH_FACE_OVAL) ─────────────── */
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397,
  365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
  234, 127, 162, 21, 54, 103, 67, 109];

const P = {                 // 계측에 쓰는 개별 점
  top: 10,                  // 이마 중앙(헤어라인 근사)
  chin: 152,                // 턱 끝
  cheekL: 234, cheekR: 454, // 광대 바깥
  foreL: 54,  foreR: 284,   // 이마 양옆
  jawL: 172,  jawR: 397,    // 턱선
  browL: 105, browR: 334,   // 눈썹 상단
  eyeLo: 33,  eyeLi: 133,   // 왼눈 바깥/안쪽 (화면 기준)
  eyeRi: 362, eyeRo: 263,   // 오른눈 안쪽/바깥
  noseTip: 1, noseBase: 2,  // 코끝 / 코밑
  mouthL: 61, mouthR: 291,
  lipTop: 13, lipBot: 14
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* 세 점이 이루는 각(도). 턱 끝의 벌어짐을 잰다. */
function angleAt(v, a, b) {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x);
  const a2 = Math.atan2(b.y - v.y, b.x - v.x);
  let d = Math.abs(a1 - a2) * 180 / Math.PI;
  return d > 180 ? 360 - d : d;
}

/* ── 계측 ────────────────────────────────────────────────────── */
function measure(lm) {
  const g = i => lm[i];
  const faceLen = dist(g(P.top), g(P.chin));

  // 광대 폭은 개별 점 대신 윤곽 링에서 가장 넓은 구간을 쓴다 (각도 변화에 덜 민감)
  let cheekW = 0;
  for (let i = 0; i < OVAL.length; i++) {
    for (let j = i + 1; j < OVAL.length; j++) {
      const d = Math.abs(g(OVAL[i]).x - g(OVAL[j]).x);
      if (d > cheekW) cheekW = d;
    }
  }
  const foreW = Math.abs(g(P.foreL).x - g(P.foreR).x);
  const jawW = Math.abs(g(P.jawL).x - g(P.jawR).x);
  const jawAngle = angleAt(g(P.chin), g(P.jawL), g(P.jawR));

  // 삼정 — 이마 / 중안부 / 하안부. 이상적으로 1 : 1 : 1
  const browY = (g(P.browL).y + g(P.browR).y) / 2;
  const upper = browY - g(P.top).y;
  const mid = g(P.noseBase).y - browY;
  const lower = g(P.chin).y - g(P.noseBase).y;
  const third = upper + mid + lower;

  // 오분법 — 얼굴 폭이 눈 길이의 5배일 때 균형
  const eyeW = (dist(g(P.eyeLo), g(P.eyeLi)) + dist(g(P.eyeRi), g(P.eyeRo))) / 2;
  const eyeGap = dist(g(P.eyeLi), g(P.eyeRi));

  return {
    ratioLW: faceLen / cheekW,          // 얼굴 길이 / 광대 폭
    ratioFore: foreW / cheekW,          // 이마 폭 / 광대 폭
    ratioJaw: jawW / cheekW,            // 턱 폭 / 광대 폭
    jawAngle,
    thirds: [upper / third, mid / third, lower / third],
    fifths: cheekW / eyeW,              // 5에 가까울수록 균형
    eyeGapRatio: eyeGap / eyeW,         // 1에 가까울수록 균형
    mouthRatio: dist(g(P.mouthL), g(P.mouthR)) / cheekW,
    faceLen, cheekW, foreW, jawW
  };
}

/* ── 얼굴형 분류 ─────────────────────────────────────────────── */
const SHAPES = {
  oblong: {
    ko: "긴형", en: "Oblong",
    desc: "세로가 길고 폭이 좁습니다. 가로 볼륨을 더하면 길이가 중화되어 균형이 잡힙니다.",
    good: ["턱선 길이의 단발·중단발", "옆으로 퍼지는 C컬·굵은 웨이브", "시스루뱅·가로 앞머리로 얼굴 길이 분할"],
    avoid: ["긴 생머리", "정수리 볼륨을 세운 스타일", "센터 가르마 롱헤어"]
  },
  round: {
    ko: "둥근형", en: "Round",
    desc: "가로세로가 비슷하고 턱선이 부드럽습니다. 세로선을 만들면 얼굴이 길어 보입니다.",
    good: ["쇄골 아래 긴 레이어드", "사이드뱅·긴 앞머리로 세로선", "정수리 볼륨 펌"],
    avoid: ["턱선에서 끝나는 단발", "일자 앞머리", "볼 옆 가로 볼륨"]
  },
  square: {
    ko: "각진형", en: "Square",
    desc: "이마와 턱 폭이 비슷하고 턱각이 뚜렷합니다. 곡선을 더하면 각이 부드러워집니다.",
    good: ["턱선을 감싸는 S컬·웨이브", "사이드 가르마", "얼굴 옆 레이어드"],
    avoid: ["일자 단발", "귀 뒤로 완전히 넘긴 스타일", "직선적인 일자 앞머리"]
  },
  heart: {
    ko: "하트형", en: "Heart",
    desc: "이마가 넓고 턱이 좁습니다. 아래쪽에 볼륨을 주면 위아래 폭이 맞습니다.",
    good: ["턱선 아래 볼륨의 웨이브", "시스루뱅으로 이마 폭 완화", "사이드 파팅"],
    avoid: ["정수리만 부풀린 스타일", "짧은 픽시컷", "이마를 다 드러낸 올백"]
  },
  diamond: {
    ko: "다이아몬드형", en: "Diamond",
    desc: "광대가 가장 넓고 이마와 턱이 좁습니다. 이마와 턱 주변 볼륨이 도움이 됩니다.",
    good: ["이마를 덮는 앞머리", "턱선 길이의 밥컷", "광대를 지나는 레이어"],
    avoid: ["광대 높이에서 끝나는 단발", "올백·포니테일", "광대 옆 볼륨"]
  },
  oval: {
    ko: "계란형", en: "Oval",
    desc: "길이와 폭의 비율이 균형적입니다. 대부분의 스타일이 무난하게 받습니다.",
    good: ["대부분의 길이와 컷", "가르마 위치도 자유롭게", "원하는 인상에 맞춰 선택"],
    avoid: ["특별히 피할 스타일 없음"]
  }
};

/* 각 형태를 (길이비, 이마비, 턱비, 턱각)의 기준점으로 두고 가장 가까운 것을 고른다.
 * 임의 가중합으로 점수를 매기면 '계란형'처럼 중앙에 있는 형태가 어느 항목에서도
 * 1등을 못 해 영영 나오지 않는다. 기준점 방식은 모든 형태가 도달 가능하다. */
const PROTO = {
  //        길이/폭  이마/광대  턱/광대  턱각
  oval:    { L: 1.48, F: 0.84, J: 0.74, A: 122 },
  round:   { L: 1.18, F: 0.84, J: 0.82, A: 132 },
  square:  { L: 1.28, F: 0.90, J: 0.92, A: 114 },
  oblong:  { L: 1.78, F: 0.86, J: 0.80, A: 118 },
  heart:   { L: 1.42, F: 0.93, J: 0.64, A: 104 },
  diamond: { L: 1.52, F: 0.76, J: 0.70, A: 110 }
};
const WEIGHT = { L: 1.0, F: 2.4, J: 2.4, A: 0.9 };

function classify(m) {
  const score = {};
  for (const k in PROTO) {
    const q = PROTO[k];
    const dL = (m.ratioLW - q.L) * WEIGHT.L;
    const dF = (m.ratioFore - q.F) * WEIGHT.F;
    const dJ = (m.ratioJaw - q.J) * WEIGHT.J;
    const dA = ((m.jawAngle - q.A) / 30) * WEIGHT.A;
    score[k] = -Math.sqrt(dL * dL + dF * dF + dJ * dJ + dA * dA);
  }
  const order = Object.keys(score).sort((a, b) => score[b] - score[a]);
  return { key: order[0], second: order[1], scores: score,
           margin: score[order[0]] - score[order[1]] };
}

/* ── 이목구비 균형 판정 ──────────────────────────────────────── */
function proportions(m) {
  const [u, mid, lo] = m.thirds;
  const out = [];
  const dev = x => (x - 1 / 3) * 3;                       // 1/3 기준 편차
  out.push({
    key: "삼정 비율", value: [u, mid, lo].map(x => (x * 3).toFixed(2)).join(" : "),
    note: Math.max(Math.abs(dev(u)), Math.abs(dev(mid)), Math.abs(dev(lo))) < 0.12
      ? "상·중·하안부가 고른 편입니다"
      : (dev(lo) > 0.12 ? "하안부가 긴 편 — 턱선 볼륨을 줄이면 균형이 잡힙니다"
        : dev(u) > 0.12 ? "이마가 넓은 편 — 앞머리가 도움이 됩니다"
        : "중안부가 긴 편 — 가로 볼륨이 도움이 됩니다")
  });
  out.push({
    key: "오분법", value: m.fifths.toFixed(2) + " (기준 5)",
    note: Math.abs(m.fifths - 5) < 0.5 ? "눈 크기와 얼굴 폭이 균형적입니다"
      : m.fifths > 5.5 ? "얼굴 폭 대비 눈이 작은 편입니다"
      : "얼굴 폭 대비 눈이 큰 편입니다"
  });
  out.push({
    key: "눈 사이 간격", value: m.eyeGapRatio.toFixed(2) + " (기준 1)",
    note: Math.abs(m.eyeGapRatio - 1) < 0.12 ? "눈 간격이 표준 범위입니다"
      : m.eyeGapRatio > 1.12 ? "눈 사이가 넓은 편입니다" : "눈 사이가 좁은 편입니다"
  });
  out.push({
    key: "턱 각도", value: m.jawAngle.toFixed(0) + "°",
    note: m.jawAngle < 118 ? "턱선이 뚜렷한 편입니다"
      : m.jawAngle > 132 ? "턱선이 부드러운 편입니다" : "중간 정도의 턱선입니다"
  });
  return out;
}

/* ── 서버 전송 지점 (지금은 비활성) ──────────────────────────
 * 백엔드가 준비되면 ENDPOINT만 채우면 된다. 랜드마크 원본이 아니라
 * 판정 결과 코드만 보내도록 의도적으로 좁혀 두었다.
 * 켜기 전에 PIPA 생체인식정보 별도 동의 절차를 반드시 앞에 붙일 것.
 */
const ENDPOINT = null;
async function sendToServer(payload) {
  if (!ENDPOINT) return { skipped: true };
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shape: payload.shape, thirds: payload.thirds })
  }).then(r => r.json());
}

export { OVAL, P, measure, classify, proportions, SHAPES, sendToServer, clamp };
