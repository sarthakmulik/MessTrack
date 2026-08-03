import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';
import { Button } from '../../components/ui/Button';

export default function PaymentSettingsScreen({ navigation }: any) {
  const { tenantId } = useAuth();
  
  // Direct UPI VPA Settings (GPay / PhonePe / Paytm Native Intent)
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');

  // PhonePe Merchant Gateway Secrets (Optional)
  const [merchantId, setMerchantId] = useState('');
  const [saltKey, setSaltKey] = useState('');
  const [saltIndex, setSaltIndex] = useState('1');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPaymentSettings();
  }, [tenantId]);

  const fetchPaymentSettings = async () => {
    if (!tenantId) return;
    try {
      // 1. Fetch Tenant UPI ID & Name
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('name, upi_id, upi_name')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantData) {
        setUpiId(tenantData.upi_id || '');
        setUpiName(tenantData.upi_name || tenantData.name || '');
      }

      // 2. Fetch PhonePe Secrets if present
      const { data: secrets } = await supabase
        .from('tenant_secrets')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (secrets) {
        setMerchantId(secrets.phonepe_merchant_id || '');
        setSaltKey(secrets.phonepe_salt_key || '');
        setSaltIndex(secrets.phonepe_salt_index || '1');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!upiId.trim()) {
      Alert.alert('Validation Error', 'Please enter your Mess UPI ID / VPA (e.g., messname@upi or 9876543210@ybl) so students can pay via GPay / PhonePe.');
      return;
    }

    setSaving(true);
    try {
      // 1. Save Direct UPI ID to Tenants
      const { error: tenantErr } = await supabase
        .from('tenants')
        .update({
          upi_id: upiId.trim(),
          upi_name: upiName.trim() || 'Mess Admin',
        })
        .eq('id', tenantId);

      if (tenantErr) throw tenantErr;

      // 2. Save PhonePe Secrets if provided
      if (merchantId.trim() && saltKey.trim()) {
        const { error: secretsErr } = await supabase
          .from('tenant_secrets')
          .upsert({
            tenant_id: tenantId,
            phonepe_merchant_id: merchantId.trim(),
            phonepe_salt_key: saltKey.trim(),
            phonepe_salt_index: saltIndex.trim() || '1',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id' });

        if (secretsErr) throw secretsErr;
      }

      Alert.alert('Success 🎉', 'UPI Payment settings saved! Students can now pay directly to your UPI ID.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>UPI & Payment Settings 💳</Text>
        <Text style={styles.subtitle}>Configure your mess UPI ID so students can pay monthly bills directly via GPay, PhonePe, or Paytm.</Text>
      </View>

      {/* 🌟 Direct UPI Configuration (Recommended for 95% of Pune Messes) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚡ Direct Instant UPI (GPay / PhonePe / Paytm)</Text>
        <Text style={styles.cardSub}>No merchant gateway needed! Money goes directly into your bank account.</Text>

        <Text style={styles.label}>Mess UPI ID / VPA <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 9876543210@ybl or shreeganeshmess@upi"
          placeholderTextColor={Colors.textMuted}
          value={upiId}
          onChangeText={setUpiId}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Business / Mess Display Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Shree Ganesh Mess"
          placeholderTextColor={Colors.textMuted}
          value={upiName}
          onChangeText={setUpiName}
        />
      </View>

      {/* ⚙️ Optional PhonePe Merchant Gateway Secrets */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔒 PhonePe Merchant Gateway (Optional)</Text>
        <Text style={styles.cardSub}>Only fill this if you have a PhonePe Merchant API account.</Text>

        <Text style={styles.label}>Merchant ID</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. PGTESTPAYUAT"
          placeholderTextColor={Colors.textMuted}
          value={merchantId}
          onChangeText={setMerchantId}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Salt Key</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          placeholderTextColor={Colors.textMuted}
          value={saltKey}
          onChangeText={setSaltKey}
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.label}>Salt Index</Text>
        <TextInput
          style={styles.input}
          placeholder="1"
          placeholderTextColor={Colors.textMuted}
          value={saltIndex}
          onChangeText={setSaltIndex}
          keyboardType="numeric"
        />
      </View>

      <Button
        title="Save Payment Settings"
        onPress={handleSave}
        isLoading={saving}
        style={{ marginTop: Spacing.md }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  header: { marginBottom: Spacing.lg },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.md },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginBottom: 4, marginTop: Spacing.sm },
  required: { color: Colors.error },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.sm,
  },
});
