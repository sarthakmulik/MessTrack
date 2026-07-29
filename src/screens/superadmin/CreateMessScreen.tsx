import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

export default function CreateMessScreen({ navigation }: any) {
  const [messName, setMessName] = useState('');
  const [address, setAddress] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [selectedMeals, setSelectedMeals] = useState<string[]>(['breakfast', 'lunch', 'dinner']);
  const [loading, setLoading] = useState(false);

  const toggleMeal = (meal: string) => {
    setSelectedMeals((prev) =>
      prev.includes(meal) ? prev.filter((m) => m !== meal) : [...prev, meal],
    );
  };

  const handleCreate = async () => {
    if (!messName.trim()) return Alert.alert('Validation', 'Mess name is required.');
    if (!adminEmail.trim()) return Alert.alert('Validation', 'Admin email is required.');
    if (!adminName.trim()) return Alert.alert('Validation', 'Admin name is required.');
    if (!adminPassword.trim() || adminPassword.length < 6)
      return Alert.alert('Validation', 'Password must be at least 6 characters.');
    if (selectedMeals.length === 0)
      return Alert.alert('Validation', 'Select at least one meal type.');

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-mess', {
        body: {
          mess_name: messName.trim(),
          address: address.trim() || null,
          meal_types: selectedMeals,
          admin_name: adminName.trim(),
          admin_email: adminEmail.trim().toLowerCase(),
          admin_password: adminPassword,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Failed to create mess');

      Alert.alert(
        '✅ Mess Created!',
        `"${messName}" has been created.\n\nAdmin credentials:\nEmail: ${adminEmail}\nPassword: ${adminPassword}\n\nShare these with the mess admin.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create mess. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const mealColors: Record<string, string> = {
    breakfast: Colors.breakfast,
    lunch: Colors.lunch,
    dinner: Colors.dinner,
  };
  const mealIcons: Record<string, string> = {
    breakfast: '☀️',
    lunch: '🌤️',
    dinner: '🌙',
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Section: Mess Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏠 Mess Information</Text>

          <Text style={styles.label}>Mess Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sai Krishna Mess"
            placeholderTextColor={Colors.textMuted}
            value={messName}
            onChangeText={setMessName}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Full address of the mess"
            placeholderTextColor={Colors.textMuted}
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={2}
          />

          <Text style={styles.label}>Meal Types Offered</Text>
          <View style={styles.mealRow}>
            {MEAL_TYPES.map((meal) => {
              const selected = selectedMeals.includes(meal);
              return (
                <TouchableOpacity
                  key={meal}
                  style={[
                    styles.mealChip,
                    selected && { backgroundColor: mealColors[meal] + '30', borderColor: mealColors[meal] },
                  ]}
                  onPress={() => toggleMeal(meal)}
                >
                  <Text style={styles.mealChipIcon}>{mealIcons[meal]}</Text>
                  <Text
                    style={[
                      styles.mealChipText,
                      selected && { color: mealColors[meal], fontWeight: FontWeight.bold },
                    ]}
                  >
                    {meal.charAt(0).toUpperCase() + meal.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section: Admin Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Mess Admin Account</Text>
          <Text style={styles.sectionNote}>
            A new account will be created for the mess admin. Share the credentials with them.
          </Text>

          <Text style={styles.label}>Admin Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Rajesh Patil"
            placeholderTextColor={Colors.textMuted}
            value={adminName}
            onChangeText={setAdminName}
          />

          <Text style={styles.label}>Admin Email *</Text>
          <TextInput
            style={styles.input}
            placeholder="admin@example.com"
            placeholderTextColor={Colors.textMuted}
            value={adminEmail}
            onChangeText={setAdminEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Temporary Password *</Text>
          <TextInput
            style={styles.input}
            placeholder="Min 6 characters"
            placeholderTextColor={Colors.textMuted}
            value={adminPassword}
            onChangeText={setAdminPassword}
            secureTextEntry
          />
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createBtn, loading && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <Text style={styles.createBtnText}>🍱 Create Mess</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  sectionNote: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  inputMultiline: {
    height: 72,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  mealRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  mealChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 4,
  },
  mealChipIcon: { fontSize: 14 },
  mealChipText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  createBtnDisabled: {
    opacity: 0.7,
  },
  createBtnText: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
});
