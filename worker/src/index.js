/* 이미지 생성 프록시 — Cloudflare Workers AI / Gemini
 *
 * API 키를 브라우저에 내려보내지 않기 위한 최소 서버다. 정적 사이트에서
 * 키를 클라이언트 JS에 넣으면 페이지 소스만 봐도 털린다.
 *
 * 배포:
 *   npx wrangler deploy
 *   npx wrangler secret put GEMINI_API_KEY   (gemini 경로를 쓸 때만)
 */

/* Workers AI 이미지 모델. 계정에 포함돼 있어 별도 키가 필요 없다. */
const WAI_TXT2IMG = "@cf/black-forest-labs/flux-1-schnell";
const WAI_IMG2IMG = "@cf/runwayml/stable-diffusion-v1-5-img2img";
const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_URL = m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

function cors(origin, allowed) {
  const ok = allowed === "*" || origin === allowed;
  return {
    "Access-Control-Allow-Origin": ok ? (origin || allowed) : allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...(headers || {}) }
  });

/* 큰 버퍼를 한 번에 String.fromCharCode 에 넘기면 스택이 넘친다 */
function toB64(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000)
    s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
const stripDataUrl = d => (d || "").replace(/^data:[^,]*,/, "");
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function overLimit(env) {
  if (!env.RATE) return false;                       // KV 미연결이면 상한 없음
  const key = "count:" + new Date().toISOString().slice(0, 10);
  const n = parseInt((await env.RATE.get(key)) || "0", 10);
  const cap = parseInt(env.DAILY_LIMIT || "200", 10);
  if (n >= cap) return true;
  await env.RATE.put(key, String(n + 1), { expirationTtl: 172800 });
  return false;
}

/* ── Workers AI ──────────────────────────────────────────────── */
async function viaWorkersAI(env, body) {
  if (!env.AI) throw new Error("AI 바인딩이 없습니다. wrangler.toml 의 [ai] 설정을 확인하세요.");
  const ref = stripDataUrl(body.referencePng);
  const model = body.model || (ref ? WAI_IMG2IMG : WAI_TXT2IMG);
  const input = { prompt: body.prompt };

  if (ref && model === WAI_IMG2IMG) {
    /* 우리가 그린 도식을 구조 레퍼런스로 넣는다. strength 가 낮을수록
       원본 비율·색을 더 지키고, 높을수록 모델이 자유롭게 다시 그린다. */
    input.image = Array.from(b64ToBytes(ref));
    input.strength = typeof body.strength === "number" ? body.strength : 0.55;
    if (body.negative_prompt) input.negative_prompt = body.negative_prompt;
  } else if (model === WAI_TXT2IMG) {
    input.steps = Math.min(body.steps || 6, 8);
  }

  const r = await env.AI.run(model, input);
  if (r && typeof r.image === "string") return ["data:image/jpeg;base64," + r.image];
  if (r instanceof ReadableStream) {
    const buf = await new Response(r).arrayBuffer();
    return ["data:image/png;base64," + toB64(buf)];
  }
  if (r instanceof ArrayBuffer) return ["data:image/png;base64," + toB64(r)];
  throw new Error("예상치 못한 응답 형식: " + Object.prototype.toString.call(r));
}

/* ── Replicate ───────────────────────────────────────────────
 * 가상 피팅(IDM-VTON)과 ControlNet 계열이 여기 있다. Workers AI 에는 없다.
 * Prefer: wait 로 동기 호출한다 — Worker 안에서 폴링할 필요가 없다.
 */
async function replicateAccount(env) {
  const r = await fetch("https://api.replicate.com/v1/account", {
    headers: { Authorization: "Bearer " + env.REPLICATE_API_TOKEN }
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(d?.detail || "토큰 확인 실패"); e.status = r.status; throw e; }
  return d;
}

async function viaReplicate(env, body) {
  if (!env.REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN 이 설정되지 않았습니다.");
  const ref = String(body.model || "cuuupid/idm-vton");
  const [owner, name] = ref.split("/");
  if (!owner || !name) throw new Error("model 은 'owner/name' 형식이어야 합니다.");

  /* 가상 피팅 모델은 콜드 스타트 포함 3분까지 걸린다. Prefer: wait 는
     60초에서 끊기므로, 시작과 조회를 나눠 비동기로 처리한다. */
  const hdr = { Authorization: "Bearer " + env.REPLICATE_API_TOKEN, "Content-Type": "application/json" };
  let d;
  if (body.predictionId) {
    const r = await fetch("https://api.replicate.com/v1/predictions/" + body.predictionId, { headers: hdr });
    d = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(d?.detail || "조회 실패"); e.status = r.status; throw e; }
  } else {
    const input = body.input || { prompt: body.prompt };
    const post = body.async ? hdr : { ...hdr, Prefer: "wait" };
    /* 공식 모델은 /models/.../predictions 를 받지만 커뮤니티 모델은 404 다.
       그 경우 최신 버전 해시를 조회해 /predictions 로 보낸다. */
    let r = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
      { method: "POST", headers: post, body: JSON.stringify({ input }) });
    if (r.status === 404) {
      const mr = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, { headers: hdr });
      const md = await mr.json().catch(() => null);
      if (!mr.ok) { const e = new Error(md?.detail || "모델을 찾지 못했습니다: " + ref); e.status = mr.status; throw e; }
      const ver = md?.latest_version?.id;
      if (!ver) throw new Error("모델 버전을 찾지 못했습니다: " + ref);
      r = await fetch("https://api.replicate.com/v1/predictions",
        { method: "POST", headers: post, body: JSON.stringify({ version: ver, input }) });
    }
    d = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(d?.detail || d?.title || "생성 실패"); e.status = r.status; throw e; }
  }

  if (d.status === "failed" || d.error) throw new Error("모델 실행 실패: " + (d.error || d.status));
  if (d.status !== "succeeded")
    return { pending: true, predictionId: d.id, status: d.status };

  let urls = d.output;
  if (typeof urls === "string") urls = [urls];
  if (!Array.isArray(urls) || !urls.length) throw new Error("출력이 비었습니다.");

  /* CORS·캔버스 오염을 피하려고 Worker 가 대신 받아 base64 로 돌려준다.
     그래야 브라우저에서 ΔE 측정을 할 수 있다. */
  if (body.raw) return urls;
  const out = [];
  for (const u of urls.slice(0, 2)) {
    const img = await fetch(u);
    if (!img.ok) continue;
    const buf = await img.arrayBuffer();
    const mime = img.headers.get("content-type") || "image/png";
    out.push("data:" + mime + ";base64," + toB64(buf));
  }
  if (!out.length) throw new Error("결과 이미지를 받지 못했습니다.");
  return out;
}

/* ── 쿠팡파트너스 ────────────────────────────────────────────
 * CEA HMAC-SHA256 서명 인증. 서명 규격은 문서 기준으로 구현했고,
 * 실제 호출에서 어긋나면 응답 메시지를 보고 맞춘다.
 *   message   = signed-date + METHOD + path + query
 *   signature = HMAC-SHA256(secretKey, message) 를 hex 로
 */
function cpDate() {
  const d = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return d.slice(2);                       // yyMMddTHHmmssZ
}
async function cpAuth(env, method, path, query) {
  const dt = cpDate();
  const msg = dt + method + path + (query || "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${dt}, signature=${hex}`;
}
async function viaCoupang(env, body) {
  if (!env.COUPANG_ACCESS_KEY || !env.COUPANG_SECRET_KEY)
    throw new Error("COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 가 설정되지 않았습니다.");
  const base = "/v2/providers/affiliate_open_api/apis/openapi";
  const path = body.path || (base + "/products/search");
  /* 서명 대상 문자열과 실제 요청 URL 의 인코딩이 조금이라도 다르면
     인증은 통과해도 검색어가 전달되지 않는다. 한 번만 인코딩해 양쪽에 같은 값을 쓴다. */
  const query = body.query ||
    ("keyword=" + encodeURIComponent(body.keyword || "니트") + "&limit=" + (body.limit || 10));
  const method = body.method || "GET";
  const auth = await cpAuth(env, method, path, query);
  const r = await fetch("https://api-gateway.coupang.com" + path + "?" + query, {
    method, headers: { Authorization: auth, "Content-Type": "application/json" }
  });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = { raw: txt.slice(0, 500) }; }
  if (!r.ok) { const e = new Error(d?.message || d?.rMessage || "쿠팡 API 실패"); e.status = r.status; e.detail = d; throw e; }
  return d;
}

/* ── Gemini ──────────────────────────────────────────────────── */
async function viaGemini(env, body) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY 가 설정되지 않았습니다.");
  const parts = [{ text: body.prompt }];
  if (body.referencePng)
    parts.unshift({ inlineData: { mimeType: "image/png", data: stripDataUrl(body.referencePng) } });

  const res = await fetch(GEMINI_URL(body.model || GEMINI_MODEL), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts }] })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error(data?.error?.message || "생성 실패");
    e.status = res.status;
    throw e;
  }
  const out = (data?.candidates?.[0]?.content?.parts || [])
    .filter(p => p.inlineData?.data)
    .map(p => "data:" + (p.inlineData.mimeType || "image/png") + ";base64," + p.inlineData.data);
  if (!out.length) throw new Error("이미지가 반환되지 않았습니다.");
  return out;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const headers = cors(origin, allowed);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    /* 이미지 프록시 — 쿠팡 CDN 이미지는 CORS 헤더가 없어 캔버스가 오염된다.
       색을 재려면 같은 오리진처럼 읽을 수 있어야 해서 여기서 중계한다.
       열린 프록시가 되지 않도록 쿠팡 CDN 으로만 제한한다. */
    if (request.method === "GET") {
      const u = new URL(request.url);
      if (u.pathname === "/img") {
        const src = u.searchParams.get("u") || "";
        let h; try { h = new URL(src).hostname; } catch { return json({ error: "잘못된 주소" }, 400, headers); }
        if (!/(^|\.)coupangcdn\.com$/.test(h) && !/(^|\.)coupang\.com$/.test(h))
          return json({ error: "허용되지 않은 이미지 호스트" }, 403, headers);
        const im = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!im.ok) return json({ error: "이미지를 받지 못했습니다", status: im.status }, 502, headers);
        return new Response(im.body, {
          status: 200,
          headers: {
            "Content-Type": im.headers.get("content-type") || "image/jpeg",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": allowed
          }
        });
      }
      return json({ error: "POST만 받습니다" }, 405, headers);
    }
    if (request.method !== "POST") return json({ error: "POST만 받습니다" }, 405, headers);
    if (allowed !== "*" && origin && origin !== allowed)
      return json({ error: "허용되지 않은 오리진입니다" }, 403, headers);
    if (await overLimit(env)) return json({ error: "오늘 호출 한도를 넘었습니다" }, 429, headers);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "JSON 본문이 필요합니다" }, 400, headers); }

    body.prompt = (body.prompt || "").slice(0, 4000);
    if (!body.prompt && !body.input && !body.check && !body.predictionId && !body.api
        && body.provider !== "coupang")
      return json({ error: "prompt 또는 input 이 필요합니다" }, 400, headers);

    const provider = body.provider || env.DEFAULT_PROVIDER || "workers-ai";
    try {
      /* 토큰이 유효한지 확인만 하는 무료 경로 — 생성 비용이 들지 않는다 */
      if (body.check === "replicate")
        return json({ ok: true, account: await replicateAccount(env) }, 200, headers);

      /* 읽기 전용 조회 — 모델 목록·검색. 예측을 만들지 않으므로 과금되지 않는다.
         경로를 /v1/ 로 제한해 토큰이 엉뚱한 곳에 쓰이지 않게 한다. */
      if (body.api) {
        if (!/^\/v1\/[A-Za-z0-9\/_?=&.,%-]*$/.test(body.api))
          return json({ error: "허용되지 않은 경로" }, 400, headers);
        const rr = await fetch("https://api.replicate.com" + body.api, {
          method: body.apiMethod === "QUERY" ? "QUERY" : "GET",
          headers: { Authorization: "Bearer " + env.REPLICATE_API_TOKEN,
                     "Content-Type": "text/plain" },
          body: body.apiMethod === "QUERY" ? (body.q || "") : undefined
        });
        return json(await rr.json().catch(() => ({ error: "파싱 실패" })), rr.status, headers);
      }
      if (provider === "coupang")
        return json({ provider, data: await viaCoupang(env, body) }, 200, headers);
      const out = provider === "replicate" ? await viaReplicate(env, body)
                : provider === "gemini"    ? await viaGemini(env, body)
                : await viaWorkersAI(env, body);
      if (out && out.pending) return json({ provider, ...out }, 200, headers);
      return json({ provider, images: out }, 200, headers);
    } catch (e) {
      return json({ error: e.message, provider, status: e.status || null,
                    detail: e.detail || null }, e.status || 502, headers);
    }
  }
};
