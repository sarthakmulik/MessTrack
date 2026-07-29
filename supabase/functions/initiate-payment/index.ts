import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { amount, invoice_id, plan_id, tenant_id } = await req.json();

    if (!amount || !tenant_id) {
      throw new Error('Missing required fields: amount, tenant_id');
    }

    // 1. Get the student ID for this auth user and tenant
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id, phone')
      .eq('auth_user_id', user.id)
      .eq('tenant_id', tenant_id)
      .single();

    if (studentError || !student) throw new Error('Student record not found');

    // 2. Fetch PhonePe Credentials for this tenant
    const { data: secrets, error: secretsError } = await supabaseAdmin
      .from('tenant_secrets')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (secretsError) {
      throw new Error(`DB Error fetching secrets: ${secretsError.message}`);
    }
    
    if (!secrets) {
      throw new Error(`No secrets found for tenant_id: ${tenant_id}`);
    }
    
    if (!secrets.phonepe_merchant_id || !secrets.phonepe_salt_key) {
      throw new Error('Keys are empty in the database.');
    }

    const merchantId = secrets.phonepe_merchant_id.trim();
    const saltKey = secrets.phonepe_salt_key.trim();
    const saltIndex = (secrets.phonepe_salt_index || '1').toString().trim();
    
    // Generate unique transaction ID
    const transactionId = 'MT_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    // 3. Create Pending Payment Record
    const { error: insertError } = await supabaseAdmin
      .from('payments')
      .insert({
        tenant_id,
        student_id: student.id,
        invoice_id: invoice_id || null,
        plan_id: plan_id || null,
        transaction_id: transactionId,
        amount: amount,
        status: 'pending'
      });

    if (insertError) throw insertError;

    // 4. Construct PhonePe Payload
    const redirectUrl = `https://your-app.com/payment/success?txnid=${transactionId}`; 
    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`;

    const payload = {
      merchantId,
      merchantTransactionId: transactionId,
      merchantUserId: student.id,
      amount: Math.round(amount * 100), // PhonePe expects amount in paise
      redirectUrl: redirectUrl,
      redirectMode: 'REDIRECT',
      callbackUrl: callbackUrl,
      mobileNumber: student.phone || '9999999999',
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    // 5. Generate Checksum
    const payloadStr = JSON.stringify(payload);
    const base64Payload = base64Encode(payloadStr);
    const stringToHash = base64Payload + '/pg/v1/pay' + saltKey;
    
    const msgUint8 = new TextEncoder().encode(stringToHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const xVerify = hashHex + '###' + saltIndex;

    // 6. Call PhonePe API 
    // Dynamically use Sandbox if testing credentials are used
    const isSandbox = merchantId === 'PGTESTPAYUAT' || merchantId === 'PGTESTPAYUAT86';
    const phonepeHost = isSandbox 
      ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay'
      : 'https://api.phonepe.com/apis/hermes/pg/v1/pay';

    const phonePeResponse = await fetch(phonepeHost, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const result = await phonePeResponse.json();

    if (result.success && result.data?.instrumentResponse?.redirectInfo?.url) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          paymentUrl: result.data.instrumentResponse.redirectInfo.url,
          transactionId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.error('PhonePe Error:', result);
      throw new Error(result.message || 'Payment initiation failed.');
    }

  } catch (err: any) {
    console.error('Payment Error:', err.message);
    return new Response(
      JSON.stringify({ success: false, message: err.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
