import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Invoice Generation Edge Function ───────────────────────
// Can be called on-demand (POST) or via monthly cron.
// POST body: { tenant_id?: string }
// If tenant_id is provided, generates only for that tenant.
// Otherwise generates for all tenants (super admin use).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    let targetTenantId: string | null = null;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      targetTenantId = body.tenant_id ?? null;
    }

    // Billing period: 1st of current month to today
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const periodStartStr = periodStart.toISOString().split('T')[0];
    const periodEndStr = today.toISOString().split('T')[0];

    // Fetch active subscriptions
    let subsQuery = supabaseAdmin
      .from('subscriptions')
      .select('id, student_id, plan_id, tenant_id, start_date, end_date, plan:subscription_plans(price, days_included, meal_types)')
      .eq('status', 'active')
      .lte('start_date', periodEndStr)
      .gte('end_date', periodStartStr);

    if (targetTenantId) {
      subsQuery = subsQuery.eq('tenant_id', targetTenantId);
    }

    const { data: subscriptions, error: subErr } = await subsQuery;
    if (subErr) throw subErr;

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const sub of (subscriptions || []) as any[]) {
      try {
        // Skip if invoice already exists for this period
        const { data: existing } = await supabaseAdmin
          .from('invoices')
          .select('id')
          .eq('student_id', sub.student_id)
          .eq('tenant_id', sub.tenant_id)
          .eq('period_start', periodStartStr)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        // Count attendance_records for this student this month
        const { count: daysPresent } = await supabaseAdmin
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', sub.student_id)
          .eq('tenant_id', sub.tenant_id)
          .eq('status', 'present')
          .gte('scanned_at', periodStart.toISOString())
          .lte('scanned_at', today.toISOString());

        const plan = sub.plan;
        const mealTypesCount = (plan?.meal_types || []).length || 1;
        const ratePerMeal = (plan ? plan.price / plan.days_included : 0) / mealTypesCount;
        const totalAmount = (daysPresent ?? 0) * ratePerMeal;

        const { error: insertErr } = await supabaseAdmin.from('invoices').insert({
          student_id: sub.student_id,
          tenant_id: sub.tenant_id,
          period_start: periodStartStr,
          period_end: periodEndStr,
          days_present: daysPresent ?? 0,
          rate_per_day: ratePerMeal,
          total_amount: totalAmount,
          status: 'sent',
        });

        if (insertErr) {
          errors.push(`Student ${sub.student_id}: ${insertErr.message}`);
        } else {
          generated++;
        }
      } catch (e: any) {
        errors.push(`Student ${sub.student_id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        period: `${periodStartStr} to ${periodEndStr}`,
        generated,
        skipped,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('generate-invoices error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
