import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Switch,
  StatusBar,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';
import { Button } from '../../components/ui/Button';
import Badge from '../../components/Badge';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const MEAL_EMOJI: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };
const MEAL_COLORS: Record<string, string> = {
  breakfast: Colors.breakfast,
  lunch: Colors.lunch,
  dinner: Colors.dinner,
};

interface MenuEntry {
  id?: string;
  meal_type: string;
  items: string[];
  notes?: string;
  is_special?: boolean;
  category?: 'veg' | 'non_veg' | 'special';
}

export default function MenuScreen({ navigation }: any) {
  const { tenantId, profile } = useAuth();
  const [menus, setMenus] = useState<Record<string, MenuEntry>>({});
  const [editMode, setEditMode] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [notesText, setNotesText] = useState('');
  const [isSpecial, setIsSpecial] = useState(false);
  const [category, setCategory] = useState<'veg' | 'non_veg' | 'special'>('veg');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const fetchMenus = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from('daily_menus')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('menu_date', today);

      if (error) throw error;

      const menuMap: Record<string, MenuEntry> = {};
      (data ?? []).forEach((m) => {
        menuMap[m.meal_type] = {
          id: m.id,
          meal_type: m.meal_type,
          items: m.items,
          notes: m.notes,
          is_special: m.is_special ?? false,
          category: m.category ?? 'veg',
        };
      });
      setMenus(menuMap);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, today]);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  const handleEdit = (mealType: string) => {
    const existing = menus[mealType];
    setEditMode(mealType);
    setInputText(existing?.items?.join(', ') ?? '');
    setNotesText(existing?.notes ?? '');
    setIsSpecial(existing?.is_special ?? false);
    setCategory(existing?.category ?? 'veg');
  };

  const handleSave = async (mealType: string) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const items = inputText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (items.length === 0) {
        if (menus[mealType]?.id) {
          await supabase.from('daily_menus').delete().eq('id', menus[mealType].id);
        }
        const updated = { ...menus };
        delete updated[mealType];
        setMenus(updated);
        setEditMode(null);
        return;
      }

      const payload = {
        tenant_id: tenantId,
        menu_date: today,
        meal_type: mealType,
        items,
        notes: notesText.trim() || null,
        is_special: isSpecial,
        category: category,
        created_by: profile?.id,
      };

      const { data, error } = await supabase
        .from('daily_menus')
        .upsert(payload, { onConflict: 'tenant_id,menu_date,meal_type' })
        .select()
        .single();

      if (error) throw error;

      setMenus((prev) => ({
        ...prev,
        [mealType]: {
          id: data.id,
          meal_type: mealType,
          items,
          notes: notesText.trim() || undefined,
          is_special: isSpecial,
          category: category,
        },
      }));
      setEditMode(null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Daily Menu Manager 🍛</Text>
        <Text style={styles.subtitle}>{todayStr}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchMenus(); }}
            tintColor={Colors.primary}
          />
        }
      >
        {MEAL_TYPES.map((mealType) => {
          const entry = menus[mealType];
          const isEditing = editMode === mealType;
          const color = MEAL_COLORS[mealType] ?? Colors.primary;

          return (
            <View key={mealType} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.mealEmoji}>{MEAL_EMOJI[mealType]}</Text>
                  <Text style={styles.mealTitle}>
                    {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                  </Text>
                  {entry?.is_special && <Badge label="⭐ Sunday Special" variant="warning" />}
                  {entry?.category === 'non_veg' && <Badge label="🔴 Non-Veg" variant="error" />}
                  {entry?.category === 'veg' && entry && <Badge label="🟢 Veg" variant="success" />}
                </View>
                {!isEditing && (
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleEdit(mealType)}
                  >
                    <Text style={styles.editBtnText}>{entry ? 'Edit' : '+ Add'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isEditing ? (
                <View style={styles.editContainer}>
                  <Text style={styles.label}>Menu Items (comma separated)</Text>
                  <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="e.g. Rice, Dal, Chapati, Paneer Masala"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />

                  <Text style={styles.label}>Special Notes / Extra Item</Text>
                  <TextInput
                    style={styles.inputSmall}
                    value={notesText}
                    onChangeText={setNotesText}
                    placeholder="e.g. Unlimited Gulab Jamun"
                    placeholderTextColor={Colors.textMuted}
                  />

                  {/* Special Feast Toggle */}
                  <View style={styles.specialToggleRow}>
                    <Text style={styles.specialToggleLabel}>⭐ Mark as Sunday Special / Feast</Text>
                    <Switch
                      value={isSpecial}
                      onValueChange={setIsSpecial}
                      trackColor={{ false: Colors.border, true: Colors.warning + 'AA' }}
                      thumbColor={isSpecial ? Colors.warning : '#f4f3f4'}
                    />
                  </View>

                  {/* Category selector */}
                  <Text style={styles.label}>Diet Category</Text>
                  <View style={styles.catRow}>
                    {(['veg', 'non_veg', 'special'] as const).map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catBtn, category === cat && styles.catBtnActive]}
                        onPress={() => setCategory(cat)}
                      >
                        <Text style={[styles.catText, category === cat && styles.catTextActive]}>
                          {cat === 'veg' ? '🟢 Veg' : cat === 'non_veg' ? '🔴 Non-Veg' : '⭐ Feast'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.editActions}>
                    <Button
                      title="Cancel"
                      variant="outline"
                      onPress={() => setEditMode(null)}
                      style={{ flex: 1, marginRight: Spacing.sm }}
                    />
                    <Button
                      title="Save Menu"
                      onPress={() => handleSave(mealType)}
                      isLoading={saving}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : (
                <View>
                  {entry && entry.items && entry.items.length > 0 ? (
                    <View style={styles.itemsList}>
                      {entry.items.map((item, idx) => (
                        <View key={idx} style={styles.itemChip}>
                          <Text style={styles.itemChipText}>• {item}</Text>
                        </View>
                      ))}
                      {entry.notes && (
                        <Text style={styles.notesText}>💡 Note: {entry.notes}</Text>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>No menu posted for this meal yet.</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, paddingBottom: 0 },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, marginTop: 2 },

  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 40 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  mealEmoji: { fontSize: 24 },
  mealTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  editBtn: { backgroundColor: Colors.primary + '20', paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full },
  editBtnText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  itemsList: { gap: 6 },
  itemChip: { marginVertical: 2 },
  itemChipText: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.medium },
  notesText: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 4, fontWeight: FontWeight.semibold },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },

  editContainer: { marginTop: Spacing.xs },
  label: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.bold, marginBottom: 4, marginTop: Spacing.sm },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.sm,
    minHeight: 70,
  },
  inputSmall: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  specialToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: Spacing.md },
  specialToggleLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.warning },
  catRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  catBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  catBtnActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
  catText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  catTextActive: { color: Colors.primary },
  editActions: { flexDirection: 'row', marginTop: Spacing.md },
});
