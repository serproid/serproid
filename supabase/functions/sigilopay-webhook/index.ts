import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const payload = await req.json();
    const event = String(payload?.event || "");
    const token = String(payload?.token || "");
    const transaction = payload?.transaction || {};
    const transactionId = String(transaction?.id || payload?.transactionId || "");
    if (!event || !token || !transactionId) return json({ error: "Webhook inválido" }, 400);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Webhook não configurado" }, 503);
    const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
    const lookup = await fetch(`${supabaseUrl}/rest/v1/payment_transactions?transaction_id=eq.${encodeURIComponent(transactionId)}&select=id,webhook_token,status&limit=1`, { headers });
    const rows = await lookup.json().catch(() => []);
    const record = rows?.[0];
    if (!record || record.webhook_token !== token) return json({ error: "Token de webhook inválido" }, 401);
    const nextStatus = event === "TRANSACTION_PAID" ? "COMPLETED" : event === "TRANSACTION_CANCELED" ? "CANCELED" : event === "TRANSACTION_REFUNDED" ? "REFUNDED" : event === "TRANSACTION_CHARGEBACK" ? "CHARGEBACK" : record.status;
    const update = { status: nextStatus, raw_payload: payload, paid_at: nextStatus === "COMPLETED" ? new Date().toISOString() : null };
    const response = await fetch(`${supabaseUrl}/rest/v1/payment_transactions?id=eq.${encodeURIComponent(record.id)}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(update) });
    if (!response.ok) return json({ error: "Não foi possível atualizar o pagamento" }, 500);
    return json({ received: true });
  } catch { return json({ error: "Não foi possível processar o webhook" }, 500); }
});
