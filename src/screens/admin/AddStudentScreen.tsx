import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme/tokens';
import { SubscriptionPlan } from '../../types';

type Gender = 'male' | 'female' | 'other';
const GENDERS: { label: string; value: Gender }[] = [
  { label: '👨 Male', value: 'male' },
  { label: '👩 Female', value: 'female' },
  { label: '🧑 Other', value: 'other' },
];

export default function AddStudentScreen({ navigation, route }: { navigation: any; route: any }) {
  const { tenantId } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, [tenantId]);

  const loadPlans = async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      setPlans(data ?? []);
      if (data && data.length > 0) setSelectedPlanId(data[0].id);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load plans');
    } finally {
      setPlansLoading(false);
    }
  };

  const validate = () => {
    if (!name.trim()) { Alert.alert('Validation', 'Name is required'); return false; }
    if (!email.trim()) { Alert.alert('Validation', 'Email is required'); return false; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) { Alert.alert('Validation', 'Enter a valid email'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-student', {
        body: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          gender,
          plan_id: selectedPlanId,
          tenant_id: tenantId,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Failed to create student');

      Alert.alert(
        '✅ Student Added!',
        `${name.trim()} has been added to your mess.\n\n📱 Login credentials:\nEmail: ${email.trim().toLowerCase()}\nPassword: ${data.temp_password}\n\nShare these with the student so they can log in.`,
        [
          {
            text: 'OK',
            onPress: () => {
              route.params?.onRefresh?.();
              navigation.goBack();
            },
          },
        ],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to add student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rahul Sharma"
            autoCapitalize="words"
          />
        </View>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email <Text style={styles.required}>*</Text></Text>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="e.g. rahul@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Phone */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone</Text>
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 9876543210"
            keyboardType="phone-pad"
          />
        </View>

        {/* Gender */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.pillRow}>
            {GENDERS.map((g) => (
              <TouchableOpacity
                key={g.value}
                style={[styles.pill, gender === g.value && styles.pillActive]}
                onPress={() => setGender(g.value)}
              >
                <Text style={[styles.pillText, gender === g.value && styles.pillTextActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Plan */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Subscription Plan</Text>
          {plansLoading ? (
            <LoadingState fullScreen={false} />
          ) : plans.length === 0 ? (
            <View style={styles.noPlansBox}>
              <Text style={styles.noPlansText}>No active plans found. Create a plan first.</Text>
            </View>
          ) : (
            plans.map((plan) => (
              <Card
                key={plan.id}
                style={[styles.planCard, selectedPlanId === plan.id && styles.planCardActive]}
                onPress={() => setSelectedPlanId(plan.id)}
              >
                <View style={styles.planLeft}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planMeta}>
                    {plan.duration_days} days • {plan.meal_types.join(', ')}
                  </Text>
                </View>
                <View style={styles.planRight}>
                  <Text style={styles.planPrice}>₹{plan.price}</Text>
                  {selectedPlanId === plan.id && (
                    <Text style={styles.planCheck}>✓</Text>
                  )}
                </View>
              </Card>
            ))
          )}
        </View>

        {/* Submit */}
        <Button
          title="Add Student"
          isLoading={loading}
          onPress={handleSubmit}
          style={{ marginTop: Spacing.sm, marginBottom: Spacing.sm }}
        />

        <Button
          title="Cancel"
          variant="ghost"
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  fieldGroup: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, marginBottom: Spacing.sm },
  required: { color: Colors.error },
  pillRow: { flexDirection: 'row', gap: Spacing.sm },
  pill: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  pillActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
  pillText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  pillTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  noPlansBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md,
  },
  noPlansText: { color: Colors.textMuted, fontSize: FontSize.sm },
  planCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  planCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '11' },
  planLeft: { flex: 1 },
  planName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  planMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  planRight: { alignItems: 'flex-end' },
  planPrice: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary },
  planCheck: { color: Colors.success, fontWeight: FontWeight.bold, fontSize: FontSize.lg, marginTop: 2 },
});
