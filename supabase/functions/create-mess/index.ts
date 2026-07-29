import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Create Mess Edge Function ─────────────────────────────
// Called by Super Admin to:
//   1. Create a Supabase auth account for the mess admin
//   2. Create the tenant (mess) record
//   3. Set up the admin's profile with role=mess_admin + tenant_id

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

  // Verify caller is super_admin
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, message: 'Not authenticated.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!callerProfile || callerProfile.role !== 'super_admin') {
    return new Response(
      JSON.stringify({ success: false, message: 'Only super admins can create messes.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = await req.json();
    const { mess_name, address, meal_types, admin_name, admin_email, admin_password } = body;

    if (!mess_name || !admin_email || !admin_name || !admin_password) {
      return new Response(
        JSON.stringify({ success: false, message: 'mess_name, admin_email, admin_name, admin_password are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Create mess admin auth user
    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email: admin_email.trim().toLowerCase(),
      password: admin_password,
      user_metadata: { name: admin_name.trim(), role: 'mess_admin' },
      email_confirm: true,
    });

    if (signUpError) throw signUpError;
    const adminUserId = signUpData.user!.id;

    // 2. Create tenant record
    const { data: tenantData, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        owner_id: adminUserId,
        name: mess_name.trim(),
        address: address?.trim() || null,
        meal_types: meal_types || ['breakfast', 'lunch', 'dinner'],
        is_active: true,
      })
      .select()
      .single();

    if (tenantError) throw tenantError;

    // 3. Update admin profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: adminUserId,
        role: 'mess_admin',
        tenant_id: tenantData.id,
        name: admin_name.trim(),
        email: admin_email.trim().toLowerCase(),
      });

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantData.id,
        admin_user_id: adminUserId,
        message: `Mess "${mess_name}" created successfully!`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('create-mess error:', err);
    return new Response(
      JSON.stringify({ success: false, message: err.message || 'Failed to create mess.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
