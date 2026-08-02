import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── QR Token Rotation Edge Function ────────────────────────────────────────
// Called directly by the Admin QRDisplayScreen when a session is started,
// or periodically (every 20s) for auto-rotation.
//
// Accepts an optional body: { session_id?: string }
//   - If session_id is provided → rotate THAT specific session only.
//   - If no session_id → rotate ALL currently active sessions (cron mode).
//
// Always returns: { success: true, sessions: [{ session_id, meal_type, token }] }

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
    // Parse optional body
    let requestedSessionId: string | null = null;
    try {
      const body = await req.json();
      requestedSessionId = body?.session_id ?? null;
    } catch {
      // No body or invalid JSON — that's fine, we'll rotate all active sessions
    }

    let activeSessions: { id: string; tenant_id: string; meal_type: string }[] = [];

    if (requestedSessionId) {
      // ── TARGETED MODE: rotate only the requested session ──
      // We just verify it's active (no fragile time-window check)
      const { data, error } = await supabaseAdmin
        .from('meal_sessions')
        .select('id, tenant_id, meal_type')
        .eq('id', requestedSessionId)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      if (data) activeSessions = [data];
    } else {
      // ── CRON MODE: rotate all currently active sessions ──
      const todayDate = new Date().toISOString().split('T')[0];
      const { data, error } = await supabaseAdmin
        .from('meal_sessions')
        .select('id, tenant_id, meal_type')
        .eq('status', 'active')
        .eq('session_date', todayDate);

      if (error) throw error;
      activeSessions = data ?? [];
    }

    const results: { session_id: string; meal_type: string; token: string }[] = [];

    for (const session of activeSessions) {
      const token = `MT-${session.id.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const expiresAt = new Date(Date.now() + 20 * 1000).toISOString(); // 20s

      // Expire all old tokens for this session first
      await supabaseAdmin
        .from('qr_tokens')
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('meal_session_id', session.id)
        .gt('expires_at', new Date().toISOString());

      // Insert fresh token
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
        timestamp: new Date().toISOString(),
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
