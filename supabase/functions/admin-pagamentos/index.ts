import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const auth = req.headers.get("authorization") || "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!accessToken || !supabaseUrl || !serviceRoleKey) return json({ error: "Não autorizado" }, 401);
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${accessToken}` } });
    const user = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || (user?.app_metadata?.role !== "admin" && user?.user_metadata?.role !== "admin")) return json({ error: "Acesso administrativo negado" }, 403);
    const body = await req.json().catch(() => ({}));
    const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
    if (body.action === "update") {
      const status = ["APPROVED", "REJECTED"].includes(body.adminStatus) ? body.adminStatus : null;
      if (!status || !body.id) return json({ error: "Atualização inválida" }, 400);
      const update = await fetch(`${supabaseUrl}/rest/v1/payment_transactions?id=eq.${encodeURIComponent(String(body.id))}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ admin_status: status, admin_updated_at: new Date().toISOString() }) });
      if (!update.ok) return json({ error: "Não foi possível atualizar o cadastro" }, 500);
      return json({ success: true });
    }
    const response = await fetch(`${supabaseUrl}/rest/v1/payment_transactions?select=id,identifier,transaction_id,cpf,amount,status,admin_status,created_at,paid_at&order=created_at.desc&limit=100`, { headers });
    const rows = await response.json().catch(() => []);
    if (!response.ok) return json({ error: "Não foi possível carregar os cadastros" }, 500);
    return json({ success: true, data: rows });
  } catch { return json({ error: "Não foi possível processar a solicitação" }, 500); }
});
