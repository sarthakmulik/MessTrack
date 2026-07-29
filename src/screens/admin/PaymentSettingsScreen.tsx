import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';

export default function PaymentSettingsScreen({ navigation }: any) {
  const { tenantId } = useAuth();
  
  const [merchantId, setMerchantId] = useState('');
  const [saltKey, setSaltKey] = useState('');
  const [saltIndex, setSaltIndex] = useState('1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSecrets();
  }, [tenantId]);

  const fetchSecrets = async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from('tenant_secrets')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setMerchantId(data.phonepe_merchant_id || '');
        setSaltKey(data.phonepe_salt_key || '');
        setSaltIndex(data.phonepe_salt_index || '1');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!merchantId.trim() || !saltKey.trim() || !saltIndex.trim()) {
      Alert.alert('Validation Error', 'All fields are required to enable payments.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenant_secrets')
        .upsert({
          tenant_id: tenantId,
          phonepe_merchant_id: merchantId.trim(),
          phonepe_salt_key: saltKey.trim(),
          phonepe_salt_index: saltIndex.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id' });

      if (error) throw error;
      Alert.alert('Success', 'Payment gateway settings updated securely.');
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
        <Text style={styles.title}>PhonePe Business</Text>
        <Text style={styles.subtitle}>Configure your API keys to accept UPI payments directly from students.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Merchant ID <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. YOUR_MERCHANT_ID"
          placeholderTextColor={Colors.textMuted}
          value={merchantId}
          onChangeText={setMerchantId}
          autoCapitalize="none"
        />
        
        <Text style={styles.label}>Salt Key <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          placeholderTextColor={Colors.textMuted}
          value={saltKey}
          onChangeText={setSaltKey}
          autoCapitalize="none"
          secureTextEntry
        />

        <Text style={styles.label}>Salt Index <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 1"
          placeholderTextColor={Colors.textMuted}
          value={saltIndex}
          onChangeText={setSaltIndex}
          keyboardType="numeric"
        />

        <Text style={styles.helpText}>
          These credentials can be found in your PhonePe Business Dashboard under Developer Settings. 
          Keep them extremely secure. They are encrypted before storage.
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.saveBtn, saving && { opacity: 0.7 }]} 
        onPress={handleSave} 
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save Securely</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg },
  header: { marginBottom: Spacing.xl },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  card: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
  },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, marginBottom: Spacing.sm },
  required: { color: Colors.error },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.md,
    marginBottom: Spacing.lg,
  },
  helpText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing.xs,
    fontStyle: 'italic'
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveBtnText: { color: '#ffffff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
