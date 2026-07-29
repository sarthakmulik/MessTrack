import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';

const EMOJI_OPTIONS = ['🌅', '☀️', '☕', '🌙', '🍔', '🍕', '🥗', '🍩', '🍛', '🍲', '🍜', '🍱', '🥪'];
const COLOR_OPTIONS = [Colors.breakfast, Colors.lunch, Colors.dinner, '#8ECAE6', '#219EBC', '#FFB703', '#FB8500', '#9B2226', '#E9D8A6'];

export default function MealSettingsScreen({ navigation }: any) {
  const { tenant, tenantId, refreshTenant } = useAuth();
  
  const [configs, setConfigs] = useState<Record<string, any>>(tenant?.meal_configs || {});
  const [loading, setLoading] = useState(false);
  
  // New meal form state
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newIcon, setNewIcon] = useState(EMOJI_OPTIONS[0]);
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);

  const handleSave = async (updatedConfigs: Record<string, any>) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ meal_configs: updatedConfigs })
        .eq('id', tenantId);

      if (error) throw error;
      setConfigs(updatedConfigs);
      await refreshTenant();
      Alert.alert('Success', 'Meal settings updated!');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    if (!newLabel.trim()) {
      Alert.alert('Error', 'Please enter a name for the meal.');
      return;
    }
    const id = newLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (configs[id]) {
      Alert.alert('Error', 'A meal with this name already exists.');
      return;
    }
    
    const updated = {
      ...configs,
      [id]: {
        id,
        label: newLabel.trim(),
        icon: newIcon,
        color: newColor,
        durationHours: 2, // default duration
      }
    };
    
    setIsAdding(false);
    setNewLabel('');
    setNewIcon(EMOJI_OPTIONS[0]);
    setNewColor(COLOR_OPTIONS[0]);
    handleSave(updated);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Meal Type', 'Are you sure you want to remove this meal? This will not delete past attendance data, but it will hide this meal from your sessions list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
          const updated = { ...configs };
          delete updated[id];
          handleSave(updated);
      }}
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Custom Meal Types</Text>
      <Text style={styles.subtitle}>Define the meal sessions offered by your mess.</Text>

      {Object.values(configs).map((meal: any) => (
        <View key={meal.id} style={[styles.mealCard, { borderLeftColor: meal.color, borderLeftWidth: 4 }]}>
          <View style={styles.mealInfo}>
            <Text style={styles.mealIcon}>{meal.icon}</Text>
            <View>
              <Text style={styles.mealLabel}>{meal.label}</Text>
              <Text style={styles.mealMeta}>Standard Duration: {meal.durationHours} hrs</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => handleDelete(meal.id)} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}

      {isAdding ? (
        <View style={styles.addForm}>
          <Text style={styles.formTitle}>New Meal Type</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Meal Name (e.g., Evening Snack)"
            value={newLabel}
            onChangeText={setNewLabel}
          />
          
          <Text style={styles.sectionLabel}>Pick an Icon</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScroll}>
            {EMOJI_OPTIONS.map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={[styles.emojiOption, newIcon === emoji && styles.emojiSelected]}
                onPress={() => setNewIcon(emoji)}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>Pick a Theme Color</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScroll}>
            {COLOR_OPTIONS.map(color => (
              <TouchableOpacity
                key={color}
                style={[styles.colorOption, { backgroundColor: color }, newColor === color && styles.colorSelected]}
                onPress={() => setNewColor(color)}
              />
            ))}
          </ScrollView>

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsAdding(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddNew} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Meal Type</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => setIsAdding(true)}>
          <Text style={styles.addBtnText}>+ Add Custom Meal</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text },
  subtitle: { fontSize: FontSize.md, color: Colors.textMuted, marginBottom: Spacing.xl },
  
  mealCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mealInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  mealIcon: { fontSize: 32 },
  mealLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  mealMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: Spacing.sm },
  deleteBtnText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  addBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  addBtnText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.bold },

  addForm: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  formTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.md },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.background,
  },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, marginBottom: Spacing.sm },
  iconScroll: { flexDirection: 'row', marginBottom: Spacing.lg },
  emojiOption: { padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: 'transparent' },
  emojiSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '11' },
  emojiText: { fontSize: 24 },
  
  colorOption: { width: 40, height: 40, borderRadius: 20, marginRight: Spacing.md, borderWidth: 2, borderColor: 'transparent' },
  colorSelected: { borderColor: Colors.text },

  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.md },
  cancelBtn: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  cancelBtnText: { color: Colors.textMuted, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: Radius.md },
  saveBtnText: { color: '#ffffff', fontWeight: FontWeight.bold, fontSize: FontSize.md },
});
