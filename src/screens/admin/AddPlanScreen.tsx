import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme/tokens';

// dynamic from tenant

export default function AddPlanScreen({ navigation, route }: { navigation: any; route: any }) {
  const { tenantId, tenant } = useAuth();
  
  const mealConfigs = tenant?.meal_configs || {
    breakfast: { id: 'breakfast', icon: '🌅', color: Colors.breakfast, label: 'Breakfast' },
    lunch: { id: 'lunch', icon: '☀️', color: Colors.lunch, label: 'Lunch' },
    dinner: { id: 'dinner', icon: '🌙', color: Colors.dinner, label: 'Dinner' }
  };
  const mealOptions = Object.values(mealConfigs);

  const [planName, setPlanName] = useState('');
  const [price, setPrice] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [daysIncluded, setDaysIncluded] = useState('');
  const [selectedMeals, setSelectedMeals] = useState<string[]>(Object.keys(mealConfigs));
  const [loading, setLoading] = useState(false);

  const toggleMeal = (mealId: string) => {
    setSelectedMeals((prev) =>
      prev.includes(mealId) ? prev.filter((m) => m !== mealId) : [...prev, mealId],
    );
  };

  const validate = (): boolean => {
    if (!planName.trim()) { Alert.alert('Validation', 'Plan name is required'); return false; }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) { Alert.alert('Validation', 'Enter a valid price'); return false; }
    const durationNum = parseInt(durationDays, 10);
    if (isNaN(durationNum) || durationNum <= 0) { Alert.alert('Validation', 'Enter a valid duration in days'); return false; }
    const daysNum = parseInt(daysIncluded, 10);
    if (isNaN(daysNum) || daysNum <= 0) { Alert.alert('Validation', 'Enter valid days included'); return false; }
    if (daysNum > durationNum) { Alert.alert('Validation', 'Days included cannot exceed duration'); return false; }
    if (selectedMeals.length === 0) { Alert.alert('Validation', 'Select at least one meal type'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !tenantId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('subscription_plans').insert({
        tenant_id: tenantId,
        name: planName.trim(),
        price: parseFloat(price),
        duration_days: parseInt(durationDays, 10),
        days_included: parseInt(daysIncluded, 10),
        meal_types: selectedMeals,
        is_active: true,
      });
      if (error) throw error;

      Alert.alert('Success', `Plan "${planName.trim()}" created!`, [
        {
          text: 'OK',
          onPress: () => {
            route.params?.onRefresh?.();
            navigation.goBack();
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to create plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Plan Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Plan Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={planName}
            onChangeText={setPlanName}
            placeholder="e.g. Monthly Full Board"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
          />
        </View>

        {/* Price */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Price (₹) <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 3000"
            placeholderTextColor={Colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Duration */}
        <View style={styles.rowFields}>
          <View style={[styles.fieldGroup, { flex: 1, marginRight: Spacing.sm }]}>
            <Text style={styles.label}>Duration (days) <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={durationDays}
              onChangeText={setDurationDays}
              placeholder="30"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1, marginLeft: Spacing.sm }]}>
            <Text style={styles.label}>Days Included <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={daysIncluded}
              onChangeText={setDaysIncluded}
              placeholder="26"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Meal Types */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Included Meals <Text style={styles.required}>*</Text></Text>
          <View style={styles.mealsContainer}>
            {mealOptions.map((opt: any) => {
              const isSelected = selectedMeals.includes(opt.id);
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.mealChip,
                    { borderColor: opt.color },
                    isSelected && { backgroundColor: opt.color + '15' },
                  ]}
                  onPress={() => toggleMeal(opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.mealChipIcon}>{opt.icon}</Text>
                  <Text style={[styles.mealChipLabel, { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Preview */}
        {planName || price || durationDays ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Preview</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewName}>{planName || 'Plan Name'}</Text>
              <Text style={styles.previewPrice}>₹{price || '0'} / {durationDays || '0'} days</Text>
              <Text style={styles.previewMeals}>
                {selectedMeals.map((m) => mealConfigs[m]?.icon).join(' ')}
                {'  '}{selectedMeals.map((m) => mealConfigs[m]?.label).join(', ')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <Text style={styles.submitText}>Create Plan</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  fieldGroup: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, marginBottom: Spacing.xs },
  subLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  required: { color: Colors.error },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, color: Colors.text, fontSize: FontSize.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  rowFields: { flexDirection: 'row' },
  mealsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  mealChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: Radius.full, borderWidth: 1, backgroundColor: Colors.surface,
  },
  mealChipIcon: { fontSize: 16 },
  mealChipLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  preview: { marginBottom: Spacing.lg },
  previewTitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm, fontWeight: FontWeight.semibold },
  previewCard: {
    backgroundColor: Colors.primary + '11', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.primary + '44', padding: Spacing.md,
  },
  previewName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  previewPrice: { fontSize: FontSize.md, color: Colors.primary, marginTop: 4 },
  previewMeals: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: Spacing.md + 2, alignItems: 'center',
    marginTop: Spacing.sm, marginBottom: Spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.text, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  cancelText: { color: Colors.textMuted, fontSize: FontSize.md },
});
