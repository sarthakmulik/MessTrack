import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const dPhi = (lat2 - lat1) * Math.PI / 180;
  const dLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const {
      token,
      scanned_at,
      geo_lat = null,
      geo_lng = null,
      device_id = null,
      is_mocked = false,
    } = body;

    // ── CHECK 0: Anti-Fraud Fake GPS ──
    if (is_mocked) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Fake GPS detected. You must be physically present at the mess to scan.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get the auth user from the JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Not authenticated.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: 'Authentication failed.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── CHECK 1: Token exists and is not expired ──
    const { data: qrToken, error: tokenError } = await supabaseAdmin
      .from('qr_tokens')
      .select('*, meal_sessions(*, tenants(lat, lng))')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (tokenError || !qrToken) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'QR code has expired. Wait for the next rotation and try again.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const session = qrToken.meal_sessions;
    const tenant = session.tenants;

    // ── CHECK 1.5: GEOFENCING (Anti-Remote Scan) ──
    if (tenant?.lat && tenant?.lng) {
      if (!geo_lat || !geo_lng) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Location required to scan for this mess. Enable GPS and try again.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      
      const distance = getDistance(geo_lat, geo_lng, tenant.lat, tenant.lng);
      if (distance > 100) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `You are too far from the mess (${Math.round(distance)}m). You must be within 100m to scan.`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── CHECK 2: Session is within time window ──
    const now = new Date();
    const sessionStart = new Date(session.start_time);
    const sessionEnd = new Date(session.end_time);

    if (now < sessionStart || now > sessionEnd) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Scanning is only allowed between ${sessionStart.toLocaleTimeString()} and ${sessionEnd.toLocaleTimeString()}.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── CHECK 3: Session is active ──
    if (session.status !== 'active') {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'This meal session is not currently active.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── CHECK 4 & 5: Get active student record for THIS tenant ──
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('*')
      .eq('auth_user_id', user.id)
      .eq('tenant_id', session.tenant_id)
      .eq('is_active', true)
      .single();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Student record not found, inactive, or you are scanning a QR for a different mess.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── CHECK 5.5: DEVICE BINDING (Anti-Account Sharing) ──
    if (device_id) {
      if (!student.device_id) {
        // Bind to this device for the first time
        await supabaseAdmin.from('students').update({ device_id }).eq('id', student.id);
      } else if (student.device_id !== device_id) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'This account is bound to another device. You cannot scan from multiple devices. Contact Admin to reset.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── CHECK 6: Active subscription for this meal type ──
    const today = new Date().toISOString().split('T')[0];
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('student_id', student.id)
      .eq('status', 'active')
      .lte('start_date', today)
      .gte('end_date', today);

    if (subError || !subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'You do not have an active subscription. Contact your mess admin.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check if ANY active subscription covers this meal type
    const authorizingSub = subscriptions.find((sub: any) => {
      const planMealTypes: string[] = sub.plan?.meal_types ?? [];
      return planMealTypes.includes(session.meal_type);
    });

    if (!authorizingSub) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Your active plans do not include ${session.meal_type}. Contact your mess admin.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── CHECK 7: No duplicate attendance (UNIQUE constraint) ──
    // We let the database unique constraint handle this, but we can pre-check for a better message
    const { data: existing } = await supabaseAdmin
      .from('attendance_records')
      .select('id')
      .eq('student_id', student.id)
      .eq('meal_session_id', session.id)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Already marked present for ${session.meal_type}. No duplicate scans allowed.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── INSERT: Record attendance ──
    const { error: insertError } = await supabaseAdmin
      .from('attendance_records')
      .insert({
        student_id: student.id,
        meal_session_id: session.id,
        tenant_id: session.tenant_id,
        qr_token_id: qrToken.id,
        subscription_id: authorizingSub.id,
        scanned_at: new Date().toISOString(),
        geo_lat,
        geo_lng,
        status: 'present',
        synced_offline: false,
      });

    if (insertError) {
      // Unique constraint violation (race condition)
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Already marked present for ${session.meal_type}.`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      throw insertError;
    }

    // Get updated scan count for this session
    const { count } = await supabaseAdmin
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('meal_session_id', session.id)
      .eq('status', 'present');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Attendance marked! Enjoy your ${session.meal_type}.`,
        meal_type: session.meal_type,
        scanned_at: new Date().toISOString(),
        session_scan_count: count,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('validate-scan error:', err);
    return new Response(
      JSON.stringify({ success: false, message: 'Server error. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
