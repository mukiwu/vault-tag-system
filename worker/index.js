/**
 * Jev 的轉發層（Cloudflare Worker）
 *
 * 為什麼需要它：Jev 的 CORS 白名單不收外部網域，瀏覽器直接打它的 API 會在
 * preflight 就被擋掉，回一句 Disallowed CORS origin。本機開發時這件事由 Vite
 * dev server 代勞，線上版就得靠這支。
 *
 * 它刻意不保存任何金鑰。金鑰由使用者自己填、存在自己的瀏覽器，隨請求放在
 * x-typesafe-key 標頭送過來，這裡只負責換成正式的 Authorization 再轉出去。
 * 所以部署這支 Worker 的人不會替訪客付 Jev 的帳。
 */

const UPSTREAM = "https://api.typesafe.ai/v1/systemone";
const KEY_HEADER = "x-typesafe-key";

/**
 * 只放行自家頁面。少了這道，這支 Worker 會變成任何人都能用的免費通道
 * @param {Request} request
 * @param {{ ALLOWED_ORIGINS?: string }} env
 */
function resolveOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return allowed.includes(origin) ? origin : null;
}

const cors = (origin) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": `content-type, ${KEY_HEADER}`,
  "access-control-max-age": "86400",
  // 回應會因來源而異，不加這個會被快取成錯的那份
  vary: "Origin",
});

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(origin ? cors(origin) : {}),
    },
  });

export default {
  /**
   * @param {Request} request
   * @param {{ ALLOWED_ORIGINS?: string }} env
   */
  async fetch(request, env) {
    const origin = resolveOrigin(request, env);

    if (!origin) {
      return json(
        {
          error: "origin_not_allowed",
          message:
            "這個來源不在允許清單內。部署者要在 Worker 的 ALLOWED_ORIGINS 變數列出自己的網域",
        },
        403,
        null,
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method !== "POST") {
      return json(
        { error: "method_not_allowed", message: "只接受 POST" },
        405,
        origin,
      );
    }

    const key = request.headers.get(KEY_HEADER);
    if (!key) {
      return json(
        {
          error: "missing_api_key",
          message: "沒有收到 Jev API key，請先在畫面上填入金鑰",
        },
        400,
        origin,
      );
    }

    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: await request.text(),
      });
    } catch {
      return json(
        { error: "upstream_unreachable", message: "連不上 Jev，稍後再試" },
        502,
        origin,
      );
    }

    // 原樣把上游的狀態碼與內容帶回去，前端才分得出 401 跟 403 的差別
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        ...cors(origin),
        "content-type":
          upstream.headers.get("content-type") ??
          "application/json; charset=utf-8",
      },
    });
  },
};
