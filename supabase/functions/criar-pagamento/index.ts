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

function pickPixCode(payload: any) {
  const pix = payload?.pix || payload?.order?.pix || {};
  return pix.qrCode || pix.qr_code || pix.copyPaste || pix.copy_paste || pix.payload || pix.emv || pix.code || payload?.qrCode || payload?.qr_code || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const cpf = String(body?.cpf ?? "").replace(/\D/g, "");
    const name = String(body?.name ?? "Cliente").trim();
    const amount = Number(body?.amount);
    if (!/^\d{11}$/.test(cpf)) return json({ error: "CPF inválido", code: "INVALID_CPF" }, 400);
    if (!name || !Number.isFinite(amount) || amount <= 0) return json({ error: "Dados da cobrança inválidos", code: "INVALID_PAYMENT" }, 400);

    const publicKey = Deno.env.get("SIGILOPAY_PUBLIC_KEY");
    const secretKey = Deno.env.get("SIGILOPAY_SECRET_KEY");
    const callbackUrl = Deno.env.get("SIGILOPAY_CALLBACK_URL");
    if (!publicKey || !secretKey) return json({ error: "Gateway de pagamento não configurado", code: "CONFIG_ERROR" }, 503);

    const identifier = `serproid-${crypto.randomUUID()}`;
    const requestBody: Record<string, unknown> = {
      identifier,
      amount,
      client: { name, email: String(body?.email ?? "cliente@serproid.com"), phone: String(body?.phone ?? "11999999999"), document: cpf },
      products: [{ id: "serproid-cadastro", name: "Cadastro SerproID", quantity: 1, price: amount }],
      metadata: { provider: "SerproID", cpf, identifier },
    };
    if (callbackUrl) requestBody.callbackUrl = callbackUrl;

    const upstream = await fetch("https://app.sigilopay.com.br/api/v1/gateway/pix/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-public-key": publicKey, "x-secret-key": secretKey, Accept: "application/json" },
      body: JSON.stringify(requestBody),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json({ error: payload?.message || "A SigiloPay recusou a cobrança", details: payload?.details || payload?.errorDescription || payload?.error || null, code: "GATEWAY_ERROR" }, 502);

    const pixCode = pickPixCode(payload);
    if (!pixCode) return json({ error: "A SigiloPay não retornou o código Pix", code: "MISSING_PIX_CODE" }, 502);
    return json({ success: true, data: { identifier, transactionId: payload.transactionId, status: payload.transactionStatus || payload.status, amount, pixCode } });
  } catch {
    return json({ error: "Não foi possível criar a cobrança Pix", code: "REQUEST_ERROR" }, 500);
  }
});
