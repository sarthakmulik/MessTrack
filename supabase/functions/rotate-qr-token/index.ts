import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── QR Token Rotation Edge Function ───────────────────────
// Called by a Supabase cron job every 15-20 seconds
// during active meal sessions.
// Inserts a new token for each active session; the DB trigger
// `on_new_qr_token` automatically expires the old one.
// Admin app listens via Realtime and re-renders instantly.

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
    const now = new Date().toISOString();
    const todayDate = new Date().toISOString().split('T')[0];

    // Find all currently active sessions
    const { data: activeSessions, error: sessErr } = await supabaseAdmin
      .from('meal_sessions')
      .select('id, tenant_id, meal_type')
      .eq('status', 'active')
      .eq('session_date', todayDate)
      .lte('start_time', now)
      .gte('end_time', now);

    if (sessErr) throw sessErr;

    const results = [];

    for (const session of (activeSessions || [])) {
      const token = `MT-${session.id.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const expiresAt = new Date(Date.now() + 20 * 1000).toISOString(); // 20s

      const { error: insertErr } = await supabaseAdmin
        .from('qr_tokens')
        .insert({
          meal_session_id: session.id,
          token,
          expires_at: expiresAt,
        });

      if (insertErr) {
        console.error(`Failed to rotate token for session ${session.id}:`, insertErr.message);
      } else {
        results.push({ session_id: session.id, meal_type: session.meal_type, token });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rotated: results.length,
        sessions: results,
        timestamp: now,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('rotate-qr-token error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
