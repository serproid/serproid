import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const cpf = String(body?.cpf ?? "").replace(/\D/g, "");
    if (!/^\d{11}$/.test(cpf)) return json({ error: "CPF inválido", code: "INVALID_CPF" }, 400);

    const apiKey = Deno.env.get("CPFHUB_API_KEY");
    if (!apiKey) return json({ error: "Serviço de consulta não configurado", code: "CONFIG_ERROR" }, 503);

    const upstream = await fetch(`https://api.cpfhub.io/cpf/${cpf}`, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
    });
    const payload = await upstream.json().catch(() => ({}));

    if (upstream.ok && payload?.success) return json({ success: true, data: payload.data });
    if (upstream.status === 404) return json({ error: "CPF não encontrado na base consultada", code: "CPF_NOT_FOUND" }, 404);
    if (upstream.status === 422 || upstream.status === 400) return json({ error: "CPF inválido", code: "INVALID_CPF" }, 422);
    if (upstream.status === 401) return json({ error: "Credencial de consulta inválida", code: "UPSTREAM_AUTH" }, 502);
    if (upstream.status === 403) return json({ error: "Limite de consultas excedido ou chave suspensa", code: "QUOTA_EXCEEDED" }, 429);
    if (upstream.status === 429) return json({ error: "Muitas tentativas. Aguarde alguns segundos", code: "RATE_LIMITED" }, 429);
    return json({ error: "Não foi possível consultar o CPF agora", code: "UPSTREAM_ERROR" }, 502);
  } catch {
    return json({ error: "Não foi possível processar a consulta", code: "REQUEST_ERROR" }, 500);
  }
});
