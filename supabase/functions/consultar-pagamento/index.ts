import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const { transactionId } = await req.json();
    const id = String(transactionId || "");
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return json({ error: "Transação inválida" }, 400);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Consulta de pagamento não configurada" }, 503);
    const response = await fetch(`${supabaseUrl}/rest/v1/payment_transactions?transaction_id=eq.${encodeURIComponent(id)}&select=transaction_id,status,amount,paid_at&limit=1`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
    const rows = await response.json().catch(() => []);
    if (!response.ok || !rows?.[0]) return json({ error: "Pagamento não encontrado" }, 404);
    return json({ success: true, data: rows[0] });
  } catch { return json({ error: "Não foi possível consultar o pagamento" }, 500); }
});
