import type { JevRequest, JevResponse } from "./types";

/**
 * 呼叫 Jev 的薄層。
 *
 * Jev 的 CORS 白名單不收外部網域，瀏覽器沒辦法直接打它的 API，所以請求一律
 * 先送到一層自家的轉發：本機開發是 Vite dev server 的 /api/jev，線上版是自己
 * 部署的 Cloudflare Worker。使用者填的金鑰放在 x-typesafe-key 這個自訂標頭，
 * 轉發層收到之後才換成正式的 Authorization，金鑰不會寫死在任何地方。
 */

/** 線上版要指向自己的 Worker，建置時由 VITE_JEV_ENDPOINT 注入 */
export const PROXY_ENDPOINT = import.meta.env.VITE_JEV_ENDPOINT || "/api/jev";

/** 靜態部署但沒設定 Worker 網址時，判定一定會失敗，首頁要先講清楚 */
export const isProxyReachable = () =>
  import.meta.env.DEV || Boolean(import.meta.env.VITE_JEV_ENDPOINT);
export const KEY_HEADER = "x-typesafe-key";

/** model 是必填欄位，少了會被擋在 422 */
export const DEFAULT_MODEL = "jev-latest";

/** 這兩種狀態是暫時性的，官方建議退避後重試 */
const RETRYABLE = new Set([429, 529]);

export class JevError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "JevError";
    this.status = status;
  }
}

export type AskOptions = {
  endpoint?: string;
  /** 使用者填的金鑰，存在瀏覽器本機 */
  apiKey?: string;
  /** 釘住版本，避免判定結果隨模型更新而漂移 */
  model?: string;
  fetch?: typeof globalThis.fetch;
  maxRetries?: number;
  retryDelay?: (attempt: number) => number;
  signal?: AbortSignal;
};

const defaultDelay = (attempt: number) => Math.min(2 ** attempt * 250, 8000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 把伺服器回的說明挖出來，格式有好幾種，盡量拿到一句人看得懂的話 */
function detailOf(raw: string): string {
  if (raw === "") return "";
  try {
    const parsed = JSON.parse(raw) as {
      detail?: unknown;
      message?: string;
      error?: string;
    };
    const detail = parsed.detail ?? parsed.message ?? parsed.error;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const single = detail as { message?: string; msg?: string };
      if (single.message) return single.message;
      if (Array.isArray(detail)) {
        return detail
          .map((item: { msg?: string; loc?: unknown[] }) =>
            item.loc ? `${item.msg}（${item.loc.join(".")}）` : item.msg,
          )
          .filter(Boolean)
          .join("；");
      }
    }
  } catch {
    // 不是 JSON 就直接用原文
  }
  return raw.slice(0, 200);
}

function describe(status: number, raw: string): string {
  const detail = detailOf(raw);
  const suffix = detail ? `：${detail}` : "";

  switch (status) {
    case 403:
      // Jev 對完全沒帶金鑰的請求回 403，跟金鑰錯誤的 401 是兩回事
      return `Jev 沒有收到 API key，請確認已經在上方填入金鑰${suffix}`;
    case 401:
      return `金鑰無法通過驗證，請確認有沒有填錯或已被撤銷${suffix}`;
    case 422:
      return `請求格式不合規${suffix}`;
    case 429:
      return `超過流量限制，稍後再試${suffix}`;
    case 529:
      return `Jev 服務忙碌中，稍後再試${suffix}`;
    default:
      return `Jev 回應 ${status}${suffix}`;
  }
}

export async function askJev(
  request: JevRequest,
  options: AskOptions = {},
): Promise<JevResponse> {
  const {
    endpoint = PROXY_ENDPOINT,
    apiKey,
    model = DEFAULT_MODEL,
    fetch: fetchImpl = globalThis.fetch,
    maxRetries = 4,
    retryDelay = defaultDelay,
    signal,
  } = options;

  const body = JSON.stringify({ ...request, model });
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers[KEY_HEADER] = apiKey;

  let lastError: JevError | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body,
      signal,
    });

    if (response.ok) return (await response.json()) as JevResponse;

    const raw = await response.text().catch(() => "");
    lastError = new JevError(response.status, describe(response.status, raw));
    if (!RETRYABLE.has(response.status)) throw lastError;

    if (attempt < maxRetries) await sleep(retryDelay(attempt));
  }

  throw lastError ?? new JevError(0, "Jev 呼叫失敗");
}

/**
 * 有上限的平行處理，用來把整個 vault 的請求控制在 rate limit 之內
 * （每分鐘 1200 requests），同時保持輸出順序與輸入一致。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await task(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}
