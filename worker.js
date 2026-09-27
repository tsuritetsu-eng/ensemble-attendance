const ALLOWED_ORIGIN = "https://tsuritetsu-eng.github.io";
const WORKER_SHARED_SECRET_BINDING = "WORKER_SHARED_SECRET";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "false",
    "Access-Control-Allow-Headers": "Content-Type",
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
        status: "running",
        authentication: "page-public"
      }, 200, origin);
    }

    if (request.method === "GET" && url.pathname === "/debug") {
      return json({
        ok: true,
        googleAppsScriptUrlConfigured: Boolean(env.GOOGLE_APPS_SCRIPT_URL),
        workerSharedSecretConfigured: Boolean(env.WORKER_SHARED_SECRET),
        pageAuthentication: false,
        apiAuthentication: false,
        environment: "production"
      }, 200, origin);
    }

    if (request.method !== "POST" || url.pathname !== "/api") {
      return json({ ok: false, error: "Not Found" }, 404, origin);
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