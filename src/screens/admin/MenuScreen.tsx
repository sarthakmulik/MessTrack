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
import Button from '../../components/Button';
import Card from '../../components/Card';

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
}

export default function MenuScreen({ navigation }: any) {
  const { tenantId, profile } = useAuth();
  const [menus, setMenus] = useState<Record<string, MenuEntry>>({});
  const [editMode, setEditMode] = useState<string | null>(null); // which meal type is open for editing
  const [inputText, setInputText] = useState('');
  const [notesText, setNotesText] = useState('');
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
        menuMap[m.meal_type] = { id: m.id, meal_type: m.meal_type, items: m.items, notes: m.notes };
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
        // Delete if empty
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
        [mealType]: { id: data.id, meal_type: mealType, items, notes: notesText.trim() || undefined },
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMenus(); }} tintColor={Colors.primary} />
        }
      >
        <View style={styles.dateHeader}>
          <Text style={styles.dateTitle}>📋 Today's Menu</Text>
          <Text style={styles.dateSubtitle}>{todayStr}</Text>
        </View>

        <Text style={styles.hint}>
          Tap each meal to post what's being served. Students will see this on their dashboard and can rate it after eating.
        </Text>

        {MEAL_TYPES.map((mealType) => {
          const menu = menus[mealType];
          const isEditing = editMode === mealType;
          const color = MEAL_COLORS[mealType];

          return (
            <Card key={mealType} style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <View style={styles.mealTitleRow}>
                  <View style={[styles.mealDot, { backgroundColor: color }]} />
                  <Text style={styles.mealEmoji}>{MEAL_EMOJI[mealType]}</Text>
                  <Text style={[styles.mealTitle, { color }]}>
                    {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                  </Text>
                </View>
                {!isEditing && (
                  <TouchableOpacity
                    style={[styles.editBtn, { borderColor: color + '60', backgroundColor: color + '15' }]}
                    onPress={() => handleEdit(mealType)}
                  >
                    <Text style={[styles.editBtnText, { color }]}>
                      {menu ? '✏️ Edit' : '+ Add'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {isEditing ? (
                <View style={styles.editSection}>
                  <Text style={styles.inputLabel}>Menu Items (comma separated)</Text>
                  <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="e.g. Dal Makhani, Jeera Rice, Roti, Salad"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    autoFocus
                  />
                  <Text style={styles.inputLabel}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputShort]}
                    value={notesText}
                    onChangeText={setNotesText}
                    placeholder="e.g. No onion today, Spicy gravy"
                    placeholderTextColor={Colors.textMuted}
                  />
                  <View style={styles.editActions}>
                    <Button label="Cancel" variant="ghost" onPress={() => setEditMode(null)} size="sm" />
                    <Button
                      label="Save Menu"
                      onPress={() => handleSave(mealType)}
                      loading={saving}
                      size="sm"
                      style={{ flex: 1, marginLeft: 8 }}
                    />
                  </View>
                </View>
              ) : menu ? (
                <View style={styles.menuDisplay}>
                  <Text style={styles.menuItemsText}>{menu.items.join(' · ')}</Text>
                  {menu.notes ? <Text style={styles.menuNotes}>📝 {menu.notes}</Text> : null}
                </View>
              ) : (
                <Text style={styles.noMenuText}>No menu posted yet for this meal.</Text>
              )}
            </Card>
          );
        })}

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Tips</Text>
          <Text style={styles.tipsText}>• Students see today's menu on their home screen</Text>
          <Text style={styles.tipsText}>• Students can rate meals (1-5 stars) after eating</Text>
          <Text style={styles.tipsText}>• You can edit the menu anytime before the session ends</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  dateHeader: { marginBottom: Spacing.sm },
  dateTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.text },
  dateSubtitle: { fontSize: FontSize.md, color: Colors.textMuted, marginTop: 4 },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.primary + '15',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  mealCard: { marginBottom: Spacing.md },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  mealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealDot: { width: 10, height: 10, borderRadius: 5 },
  mealEmoji: { fontSize: 20 },
  mealTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  editBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  editSection: { marginTop: 8 },
  inputLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: FontSize.md,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
    backgroundColor: Colors.surface,
  },
  inputShort: { minHeight: 44, textAlignVertical: 'center' },
  editActions: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  menuDisplay: { marginTop: 4 },
  menuItemsText: { fontSize: FontSize.md, color: Colors.text, lineHeight: 22 },
  menuNotes: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  noMenuText: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  tipsCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tipsTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  tipsText: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 22 },
});
