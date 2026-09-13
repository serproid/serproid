import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const body = await req.json();
    const cpf = String(body?.cpf ?? "").replace(/\D/g, "");
    if (!/^\d{11}$/.test(cpf)) return json({ error: "CPF inválido" }, 400);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Consulta não configurada" }, 503);
    const response = await fetch(`${supabaseUrl}/rest/v1/payment_transactions?cpf=eq.${encodeURIComponent(cpf)}&or=(status.eq.COMPLETED,paid_at.not.is.null)&select=transaction_id,status,admin_status,paid_at&order=created_at.desc&limit=1`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
    const rows = await response.json().catch(() => []);
    if (!response.ok) return json({ error: "Não foi possível consultar o cadastro" }, 500);
    return json({ success: true, data: rows?.[0] || null });
  } catch { return json({ error: "Não foi possível processar a consulta" }, 500); }
});
