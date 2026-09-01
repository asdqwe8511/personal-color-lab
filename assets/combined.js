/* 퍼스널 컬러 페이지에서 얼굴형까지 같이 판정한다.
 *
 * 같은 사진 한 장이면 피부색과 얼굴 윤곽을 둘 다 잴 수 있다.
 * 사용자에게 사진을 두 번 올리게 할 이유가 없다.
 */
import { OVAL, P, measure, classify, SHAPES } from "./face.js";

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";
let landmarker = null, loading = null;

function load() {
  if (loading) return loading;
  loading = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import(CDN + "/vision_bundle.mjs");
    const fs = await FilesetResolver.forVisionTasks(CDN + "/wasm");
    landmarker = await FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
      runningMode: "IMAGE", numFaces: 1
    });
    return landmarker;
  })().catch(() => null);
  return loading;
}

/* 캔버스에서 얼굴형을 판정한다. 얼굴을 못 찾으면 null — 컬러 진단은 그대로 진행된다. */
async function analyzeFace(canvas) {
  const lm = await load();
  if (!lm) return null;
  let res;
  try { res = lm.detect(canvas); } catch (e) { return null; }
  if (!res.faceLandmarks || !res.faceLandmarks.length) return null;
  const pts = res.faceLandmarks[0].map(p => ({ x: p.x * canvas.width, y: p.y * canvas.height }));
  const m = measure(pts);
  const c = classify(m);
  const T = SHAPES[c.key];
  return {
    key: c.key, ko: T.ko, en: T.en, desc: T.desc,
    good: T.good, avoid: T.avoid,
    margin: c.margin, second: SHAPES[c.second].ko,
    ratioLW: m.ratioLW, points: pts
  };
}

/* 판정에 쓴 윤곽선을 사진 위에 겹쳐 보여준다 */
function drawOutline(ctx, pts, accent) {
  if (!pts) return;
  ctx.beginPath();
  OVAL.forEach((idx, i) => { const p = pts[idx]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
  ctx.closePath();
  ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.strokeStyle = accent || "#2F615C"; ctx.lineWidth = 1.8; ctx.stroke();
  [[P.foreL, P.foreR], [P.cheekL, P.cheekR], [P.jawL, P.jawR]].forEach(([a, b]) => {
    ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y);
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = "#00E5FF"; ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
  });
}

/* 다음 단계로 자동 이동. 사용자가 결과를 읽을 시간은 주고, 멈출 수도 있게 한다. */
function autoAdvance(href, label, seconds) {
  let left = seconds || 5, timer = null;
  const bar = document.createElement("div");
  bar.className = "advance";
  bar.innerHTML = '<span class="msg"></span>' +
    '<a class="btn primary" href="' + href + '">' + label + ' →</a>' +
    '<button class="btn" type="button">여기 더 보기</button>';
  const msg = bar.querySelector(".msg");
  const stop = () => { clearInterval(timer); bar.classList.add("stopped");
    msg.textContent = "준비되면 눌러 주세요."; };
  bar.querySelector("button").onclick = stop;
  const tick = () => {
    const c = label.charCodeAt(label.length - 1);
    const jong = c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 : 0;
    msg.textContent = left + "초 후 " + label + (jong && jong !== 8 ? "으로" : "로") + " 이동합니다";
    if (left-- <= 0) { clearInterval(timer); location.href = href; }
  };
  tick(); timer = setInterval(tick, 1000);
  return bar;
}

export { analyzeFace, drawOutline, autoAdvance };
