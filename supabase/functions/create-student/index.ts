import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Create Student Edge Function ─────────────────────────
// Called by the mess admin to create:
//   1. A Supabase auth account for the student
//   2. A students row linked to auth_user_id
//   3. A subscriptions row if a plan is provided
// Uses service role key so the admin doesn't need admin SDK access.

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

  // Verify the caller is a mess_admin
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

  // Verify caller is mess_admin
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (!callerProfile || callerProfile.role !== 'mess_admin') {
    return new Response(
      JSON.stringify({ success: false, message: 'Only mess admins can create students.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = await req.json();
    const { name, email, phone, gender, plan_id, tenant_id } = body;

    // Validate
    if (!name || !email || !tenant_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'name, email, and tenant_id are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Make sure admin owns this tenant
    if (callerProfile.tenant_id !== tenant_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'You can only add students to your own mess.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Create auth user for the student
    const tempPassword = `MT${Math.random().toString(36).slice(2, 10).toUpperCase()}!`;
    const { data: authData, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: tempPassword,
      user_metadata: { name: name.trim(), role: 'student' },
      email_confirm: true,
    });

    if (authCreateError) {
      // If user already exists, try to get their ID
      if (authCreateError.message?.includes('already registered')) {
        return new Response(
          JSON.stringify({ success: false, message: `A user with email ${email} already exists. Ask them to log in.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      throw authCreateError;
    }

    const studentAuthId = authData.user!.id;

    // 2. Update the auto-created profile to role=student, tenant_id=...
    await supabaseAdmin.from('profiles').upsert({
      id: studentAuthId,
      role: 'student',
      tenant_id: tenant_id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
    });

    // 3. Create student record
    const { data: studentData, error: studentError } = await supabaseAdmin
      .from('students')
      .insert({
        tenant_id,
        auth_user_id: studentAuthId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        gender: gender || null,
      })
      .select()
      .single();

    if (studentError) throw studentError;

    // 4. Create subscription if plan provided
    if (plan_id) {
      const { data: plan } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .eq('id', plan_id)
        .single();

      if (plan) {
        const startDate = new Date().toISOString().split('T')[0];
        const endDate = new Date(Date.now() + plan.duration_days * 86400000)
          .toISOString()
          .split('T')[0];

        await supabaseAdmin.from('subscriptions').insert({
          student_id: studentData.id,
          plan_id: plan.id,
          tenant_id,
          start_date: startDate,
          end_date: endDate,
          status: 'active',
          amount_paid: plan.price,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        student_id: studentData.id,
        message: `Student created! Login credentials:\nEmail: ${email}\nPassword: ${tempPassword}\n\nShare these with the student.`,
        temp_password: tempPassword,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('create-student error:', err);
    return new Response(
      JSON.stringify({ success: false, message: err.message || 'Failed to create student.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
