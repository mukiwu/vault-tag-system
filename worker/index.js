/**
 * Jev 的轉發層（Cloudflare Worker）
 *
 * 為什麼需要它：Jev 的 CORS 白名單不收外部網域，瀏覽器直接打它的 API 會在
 * preflight 就被擋掉。本機開發時這件事由 Vite dev server 代勞，線上版靠這支。
 *
 * 兩種模式：
 *
 * 1. 訪客自己填金鑰（x-typesafe-key）。Worker 換成 Authorization 就轉出去，
 *    不計數也不保存，費用算在訪客自己的帳上。
 *
 * 2. 沒填金鑰的試用。用站方的 TRIAL_KEY，費用是站方在付，所以額度必須
 *    擋在這裡。前端的限制用 curl 就能繞過，不能當數。
 */

const UPSTREAM = "https://api.typesafe.ai/v1/systemone";
const KEY_HEADER = "x-typesafe-key";

/**
 * 只放行自家頁面。少了這道，這支 Worker 會變成任何人都能用的免費通道
 * @param {Request} request
 * @param {Env} env
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
  "access-control-expose-headers": "x-trial-remaining, x-trial-limit",
  "access-control-max-age": "86400",
  vary: "Origin",
});

const json = (body, status, origin, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(origin ? cors(origin) : {}),
      ...extra,
    },
  });

/** 當天的日期，用來讓額度每天歸零 */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * 不存明文 IP。日期一起進 hash，跨天就無法把同一個人的紀錄串起來
 * @param {string} ip
 * @param {string} day
 */
async function visitorId(ip, day) {
  const data = new TextEncoder().encode(`${ip}|${day}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 隔天此時到期就夠了，不必精算到午夜 */
const DAY_SECONDS = 86400;

/**
 * 試用額度。個人與全站各扣一次
 * @param {Env} env
 * @param {string} ip
 */
async function spendTrialQuota(env, ip) {
  const perVisitor = Number(env.TRIAL_NOTES ?? 0);
  const dailyCap = Number(env.TRIAL_DAILY_CAP ?? 0);
  if (perVisitor <= 0 || dailyCap <= 0) {
    return { ok: false, reason: "disabled" };
  }

  const day = today();
  const mine = `v:${day}:${await visitorId(ip, day)}`;
  const all = `all:${day}`;

  const [usedRaw, totalRaw] = await Promise.all([
    env.TRIAL.get(mine),
    env.TRIAL.get(all),
  ]);
  const used = Number(usedRaw ?? 0);
  const total = Number(totalRaw ?? 0);

  if (used >= perVisitor) {
    return { ok: false, reason: "visitor_exhausted", limit: perVisitor };
  }
  if (total >= dailyCap) {
    return { ok: false, reason: "site_exhausted" };
  }

  // KV 沒有原子累加，並行請求可能小幅超扣。前端試用時把並行度壓到 1，
  // 真的溢出也只是多放行個位數，不值得為此上 Durable Objects
  await Promise.all([
    env.TRIAL.put(mine, String(used + 1), { expirationTtl: DAY_SECONDS }),
    env.TRIAL.put(all, String(total + 1), { expirationTtl: DAY_SECONDS }),
  ]);

  return { ok: true, remaining: perVisitor - used - 1, limit: perVisitor };
}

/**
 * Jev 那邊出問題不該算在訪客頭上，把剛才扣的還回去
 * @param {Env} env
 * @param {string} ip
 */
async function refundTrialQuota(env, ip) {
  const day = today();
  const mine = `v:${day}:${await visitorId(ip, day)}`;
  const all = `all:${day}`;

  const [usedRaw, totalRaw] = await Promise.all([
    env.TRIAL.get(mine),
    env.TRIAL.get(all),
  ]);

  await Promise.all([
    env.TRIAL.put(mine, String(Math.max(0, Number(usedRaw ?? 0) - 1)), {
      expirationTtl: DAY_SECONDS,
    }),
    env.TRIAL.put(all, String(Math.max(0, Number(totalRaw ?? 0) - 1)), {
      expirationTtl: DAY_SECONDS,
    }),
  ]);
}

/**
 * @param {string} key
 * @param {string} body
 */
async function callJev(key, body) {
  return fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body,
  });
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
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

    const body = await request.text();
    const ownKey = request.headers.get(KEY_HEADER);

    // 帶了自己的金鑰就直接走，不動用額度
    if (ownKey) {
      let upstream;
      try {
        upstream = await callJev(ownKey, body);
      } catch {
        return json(
          { error: "upstream_unreachable", message: "連不上 Jev，稍後再試" },
          502,
          origin,
        );
      }
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: {
          ...cors(origin),
          "content-type":
            upstream.headers.get("content-type") ??
            "application/json; charset=utf-8",
        },
      });
    }

    // 以下是試用
    if (!env.TRIAL_KEY) {
      return json(
        {
          error: "trial_unavailable",
          message: "這個站台沒有開放試用，請填入自己的 Jev API key",
        },
        400,
        origin,
      );
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const quota = await spendTrialQuota(env, ip);

    if (!quota.ok) {
      const messages = {
        disabled: "這個站台沒有開放試用，請填入自己的 Jev API key",
        visitor_exhausted: `今天的試用額度用完了，明天會重置。想繼續判定請填入自己的 Jev API key`,
        site_exhausted:
          "今天全站的試用額度用完了，明天會重置。想現在就跑請填入自己的 Jev API key",
      };
      return json(
        { error: quota.reason, message: messages[quota.reason] },
        429,
        origin,
        { "x-trial-remaining": "0" },
      );
    }

    let upstream;
    try {
      upstream = await callJev(env.TRIAL_KEY, body);
    } catch {
      await refundTrialQuota(env, ip);
      return json(
        { error: "upstream_unreachable", message: "連不上 Jev，稍後再試" },
        502,
        origin,
      );
    }

    // 上游自己出狀況時把額度還回去，訪客沒有做錯什麼
    if (upstream.status >= 500) await refundTrialQuota(env, ip);

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        ...cors(origin),
        "content-type":
          upstream.headers.get("content-type") ??
          "application/json; charset=utf-8",
        "x-trial-remaining": String(quota.remaining),
        "x-trial-limit": String(quota.limit),
      },
    });
  },
};

/**
 * @typedef {object} Env
 * @property {string} [ALLOWED_ORIGINS]
 * @property {string} [TRIAL_NOTES]
 * @property {string} [TRIAL_DAILY_CAP]
 * @property {string} [TRIAL_KEY]
 * @property {KVNamespace} TRIAL
 */
