/**
 * Buildy Proxy Worker
 *
 * Proxies requests to Claude (Anthropic) so the app never ships with
 * raw API keys. Keys are stored as Cloudflare Worker secrets.
 *
 * Routes:
 *   POST /chat  → Anthropic Messages API (non-streaming, returns JSON)
 *
 * Simplified from Clicky's worker — Buildy doesn't use voice, so we
 * only need the /chat route. ElevenLabs and AssemblyAI routes removed.
 */

interface Env {
  ANTHROPIC_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers — allow the Mac app to call this from any origin
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      if (url.pathname === "/chat") {
        return await handleChat(request, env, corsHeaders);
      }

      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok", service: "buildy-proxy" }), {
          status: 200,
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      }
    } catch (error) {
      console.error(`[${url.pathname}] Unhandled error:`, error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { "content-type": "application/json", ...corsHeaders } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleChat(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const requestBody = await request.text();

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: requestBody,
  });

  if (!anthropicResponse.ok) {
    const errorResponseBody = await anthropicResponse.text();
    console.error(
      `[/chat] Anthropic API error ${anthropicResponse.status}: ${errorResponseBody}`
    );
    return new Response(errorResponseBody, {
      status: anthropicResponse.status,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  // Pass through the full response body (works for both streaming and non-streaming)
  return new Response(anthropicResponse.body, {
    status: anthropicResponse.status,
    headers: {
      "content-type":
        anthropicResponse.headers.get("content-type") || "application/json",
      "cache-control": "no-cache",
      ...corsHeaders,
    },
  });
}
