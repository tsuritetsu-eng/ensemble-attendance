const ALLOWED_ORIGIN = "https://tsuritetsu-eng.github.io";
const TOKEN_TTL = 43200;
const WORKER_SHARED_SECRET_BINDING = "WORKER_SHARED_SECRET";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...cors(origin)
    }
  });
}

async function sha256(text) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function sessionSecret(env) {
  // SESSION_SECRETを別途設定しなくても動くよう、
  // パスワードハッシュをセッション署名鍵として利用します。
  return String(env.MEMBER_PASSWORD_HASH || "").trim().toLowerCase();
}

function base64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function createToken(secret) {
  const payload = btoa(JSON.stringify({
    e: Math.floor(Date.now() / 1000) + TOKEN_TTL
  }));

  const signature = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(secret),
    new TextEncoder().encode(payload)
  );

  return payload + "." + base64(new Uint8Array(signature));
}

async function verifyToken(secret, token) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature) return false;

    const data = JSON.parse(atob(payload));
    if (!data.e || data.e <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    const expected = await crypto.subtle.sign(
      "HMAC",
      await getHmacKey(secret),
      new TextEncoder().encode(payload)
    );

    return signature === base64(new Uint8Array(expected));
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ALLOWED_ORIGIN;

    if (origin !== ALLOWED_ORIGIN) {
      return json({ ok: false, error: "Forbidden" }, 403, origin);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors(origin)
      });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "ensemble-attendance",
        status: "running"
      }, 200, origin);
    }

    // Secretの「存在」だけを確認する診断用エンドポイント。
    // Secretの値そのものは絶対に返しません。
    if (request.method === "GET" && url.pathname === "/debug") {
      return json({
        ok: true,
        memberPasswordHashConfigured: Boolean(env.MEMBER_PASSWORD_HASH),
        googleAppsScriptUrlConfigured: Boolean(env.GOOGLE_APPS_SCRIPT_URL),
        workerSharedSecretConfigured: Boolean(env.WORKER_SHARED_SECRET),
        sessionSecretRequired: false,
        environment: "production"
      }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/login") {
      if (!env.MEMBER_PASSWORD_HASH) {
        return json({
          ok: false,
          error: "MEMBER_PASSWORD_HASH が未設定です。"
        }, 503, origin);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({
          ok: false,
          error: "ログイン情報を読み取れません。"
        }, 400, origin);
      }

      const password = String(body.password || "");
      const hash = await sha256(password);

      if (hash !== String(env.MEMBER_PASSWORD_HASH).trim().toLowerCase()) {
        return json({
          ok: false,
          error: "パスワードが正しくありません。"
        }, 401, origin);
      }

      return json({
        ok: true,
        token: await createToken(sessionSecret(env)),
        expiresIn: TOKEN_TTL
      }, 200, origin);
    }

    if (request.method !== "POST" || url.pathname !== "/api") {
      return json({ ok: false, error: "Not Found" }, 404, origin);
    }

    if (!env.MEMBER_PASSWORD_HASH) {
      return json({
        ok: false,
        error: "MEMBER_PASSWORD_HASH が未設定です。"
      }, 503, origin);
    }

    const auth = request.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");

    if (!(await verifyToken(sessionSecret(env), token))) {
      return json({
        ok: false,
        error: "認証が必要です。"
      }, 401, origin);
    }

    if (!env.GOOGLE_APPS_SCRIPT_URL) {
      return json({
        ok: false,
        error: "GOOGLE_APPS_SCRIPT_URLが未設定です。"
      }, 503, origin);
    }

    if (!env.WORKER_SHARED_SECRET) {
      return json({
        ok: false,
        error: "WORKER_SHARED_SECRETが未設定です。"
      }, 503, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        error: "APIリクエストを読み取れません。"
      }, 400, origin);
    }

    const allowed = [
      "getAll",
      "saveMember",
      "deleteMember",
      "saveRecord",
      "deleteRecord"
    ];

    if (!allowed.includes(body.action)) {
      return json({
        ok: false,
        error: "許可されていない操作です。"
      }, 400, origin);
    }

    try {
      const target = new URL(env.GOOGLE_APPS_SCRIPT_URL);
      target.searchParams.set("action", body.action);
      target.searchParams.set("payload", JSON.stringify(body));

      const response = await fetch(target.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...body,
          _workerSecret: env[WORKER_SHARED_SECRET_BINDING]
        })
      });
      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return json({
          ok: false,
          error: "Google Apps ScriptからJSONではない応答が返りました。",
          detail: text.slice(0, 500)
        }, 502, origin);
      }

      return json(
        data,
        response.ok ? 200 : response.status,
        origin
      );
    } catch (error) {
      return json({
        ok: false,
        error: "Google Apps Scriptへの接続に失敗しました。",
        detail: String(error?.message || error)
      }, 502, origin);
    }
  }
};
