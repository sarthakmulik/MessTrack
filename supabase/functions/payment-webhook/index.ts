import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const xVerify = req.headers.get('x-verify');
    
    if (!body.response || !xVerify) {
      throw new Error('Invalid webhook payload');
    }

    // 1. Decode the base64 response from PhonePe
    const decodedStr = atob(body.response);
    const payload = JSON.parse(decodedStr);

    const merchantTransactionId = payload.data?.merchantTransactionId;
    if (!merchantTransactionId) throw new Error('No transaction ID found in payload');

    // 2. Fetch the pending payment from our DB to get the tenant_id
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('transaction_id', merchantTransactionId)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found:', merchantTransactionId);
      return new Response('OK', { status: 200 }); // Return 200 so PhonePe doesn't retry endlessly
    }

    // 3. Fetch Tenant Secrets to verify checksum
    const { data: secrets, error: secretsError } = await supabaseAdmin
      .from('tenant_secrets')
      .select('*')
      .eq('tenant_id', payment.tenant_id)
      .single();

    if (secretsError || !secrets) throw new Error('Tenant secrets not found');

    const saltKey = secrets.phonepe_salt_key.trim();
    const saltIndex = (secrets.phonepe_salt_index || '1').toString().trim();

    // 4. Verify Checksum: sha256(base64Response + saltKey) + "###" + saltIndex
    const stringToHash = body.response + saltKey;
    const msgUint8 = new TextEncoder().encode(stringToHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const expectedXVerify = hashHex + '###' + saltIndex;

    if (xVerify !== expectedXVerify) {
      console.error('Checksum validation failed');
      return new Response('Unauthorized', { status: 401 });
    }

    // 5. Update Database based on Payment Status
    const isSuccess = payload.success && payload.code === 'PAYMENT_SUCCESS';
    const newStatus = isSuccess ? 'success' : 'failed';
    const providerTxnId = payload.data?.transactionId || null;

    // Update the payment record
    await supabaseAdmin
      .from('payments')
      .update({ 
        status: newStatus,
        provider_txn_id: providerTxnId,
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.id);

    // If successful, update associated records
    if (isSuccess) {
      if (payment.invoice_id) {
        // Mark invoice as paid
        await supabaseAdmin
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', payment.invoice_id);
      } else if (payment.plan_id) {
        // Create new subscription if this was a plan purchase
        const { data: plan } = await supabaseAdmin
          .from('subscription_plans')
          .select('*')
          .eq('id', payment.plan_id)
          .single();
        
        if (plan) {
          // Cancel old active subs
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'cancelled' })
            .eq('student_id', payment.student_id)
            .eq('status', 'active');

          const startDate = new Date();
          const endDate = new Date();
          endDate.setDate(startDate.getDate() + plan.duration_days);

          await supabaseAdmin
            .from('subscriptions')
            .insert({
              student_id: payment.student_id,
              tenant_id: payment.tenant_id,
              plan_id: plan.id,
              start_date: startDate.toISOString().split('T')[0],
              end_date: endDate.toISOString().split('T')[0],
              status: 'active',
              amount_paid: payment.amount
            });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    console.error('Webhook Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
