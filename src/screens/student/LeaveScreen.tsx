import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';
import Badge from '../../components/Badge';

const MEAL_EMOJI: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };
const MEAL_COLORS: Record<string, string> = {
  breakfast: Colors.breakfast,
  lunch: Colors.lunch,
  dinner: Colors.dinner,
};

interface StudentInfo {
  student_id: string;
  tenant_id: string;
  tenant_name: string;
  meal_types: string[];
}

interface LeaveEntry {
  meal_type: string;
  reason?: string;
}

export default function LeaveScreen({ navigation }: any) {
  const { user } = useAuth();
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [leaveStatus, setLeaveStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const todayDisplay = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch student + active subscription + tenant info
      const { data: students, error } = await supabase
        .from('students')
        .select(`
          id, tenant_id,
          tenants:tenant_id(name),
          subscriptions!inner(plan:subscription_plans(meal_types))
        `)
        .eq('auth_user_id', user.id)
        .eq('is_active', true)
        .eq('subscriptions.status', 'active')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!students) {
        setStudentInfo(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const sub = (students.subscriptions as any[])?.[0];
      const mealTypes: string[] = sub?.plan?.meal_types ?? ['breakfast', 'lunch', 'dinner'];

      setStudentInfo({
        student_id: students.id,
        tenant_id: students.tenant_id,
        tenant_name: (students.tenants as any)?.name ?? 'Your Mess',
        meal_types: mealTypes,
      });

      // Fetch today's leave entries
      const { data: leaves } = await supabase
        .from('meal_leaves')
        .select('meal_type')
        .eq('student_id', students.id)
        .eq('leave_date', today);

      const leaveMap: Record<string, boolean> = {};
      (leaves ?? []).forEach((l) => (leaveMap[l.meal_type] = true));
      setLeaveStatus(leaveMap);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleLeave = async (mealType: string, value: boolean) => {
    if (!studentInfo) return;
    setSaving(mealType);
    try {
      if (value) {
        await supabase
          .from('meal_leaves')
          .upsert(
            {
              student_id: studentInfo.student_id,
              tenant_id: studentInfo.tenant_id,
              leave_date: today,
              meal_type: mealType,
            },
            { onConflict: 'student_id,leave_date,meal_type' },
          );
      } else {
        await supabase
          .from('meal_leaves')
          .delete()
          .eq('student_id', studentInfo.student_id)
          .eq('leave_date', today)
          .eq('meal_type', mealType);
      }
      setLeaveStatus((prev) => ({ ...prev, [mealType]: value }));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(null);
    }
  };

  const totalOnLeave = Object.values(leaveStatus).filter(Boolean).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!studentInfo) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🍽️</Text>
        <Text style={styles.emptyTitle}>No Active Subscription</Text>
        <Text style={styles.emptySubtitle}>You need an active mess subscription to mark leave.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchData(); }}
          tintColor={Colors.primary}
        />
      }
    >
      {/* Header Info */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Skip Meal Today 🚫</Text>
        <Text style={styles.headerDate}>{todayDisplay}</Text>
        <Text style={styles.headerMess}>{studentInfo.tenant_name}</Text>
        <Text style={styles.headerHint}>
          Toggle the meals you'll be skipping today. Your mess will know not to prepare your portion.
        </Text>
      </View>

      {totalOnLeave > 0 && (
        <View style={styles.summaryBanner}>
          <Text style={styles.summaryText}>
            ✅ You've marked leave for {totalOnLeave} meal{totalOnLeave !== 1 ? 's' : ''} today.
          </Text>
        </View>
      )}

      {/* Leave Toggles */}
      <View style={styles.toggleCard}>
        {studentInfo.meal_types.map((mealType, idx) => {
          const isOn = !!leaveStatus[mealType];
          const isSaving = saving === mealType;
          const color = MEAL_COLORS[mealType] ?? Colors.primary;

          return (
            <View key={mealType} style={[styles.toggleRow, idx > 0 && styles.toggleRowBorder]}>
              <View style={styles.toggleLeft}>
                <View style={[styles.mealIconBg, { backgroundColor: color + '20' }]}>
                  <Text style={styles.mealEmoji}>{MEAL_EMOJI[mealType] ?? '🍴'}</Text>
                </View>
                <View>
                  <Text style={styles.mealName}>
                    {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                  </Text>
                  {isOn ? (
                    <Badge label="Skipping Today" variant="error" />
                  ) : (
                    <Badge label="Eating Today" variant="success" />
                  )}
                </View>
              </View>
              <Switch
                value={isOn}
                onValueChange={(val) => toggleLeave(mealType, val)}
                disabled={isSaving}
                trackColor={{ false: Colors.border, true: Colors.error + 'AA' }}
                thumbColor={isOn ? Colors.error : '#f4f3f4'}
              />
            </View>
          );
        })}
      </View>

      {/* Informational Note */}
      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>ℹ️ How it works</Text>
        <Text style={styles.noteText}>• Toggle OFF to skip a meal today.</Text>
        <Text style={styles.noteText}>• Your mess admin sees a live headcount for planning.</Text>
        <Text style={styles.noteText}>• You can change your mind anytime during the day.</Text>
        <Text style={styles.noteText}>• Marked leaves are automatically reset the next day.</Text>
        <Text style={styles.noteText}>• This does NOT deduct from your subscription days.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.md },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  emptySubtitle: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  headerCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.text },
  headerDate: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold, marginTop: 4 },
  headerMess: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  headerHint: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: Spacing.md },

  summaryBanner: {
    backgroundColor: Colors.success + '15',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
  },
  summaryText: { color: '#065f46', fontWeight: FontWeight.semibold, fontSize: FontSize.sm },

  toggleCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    ...Shadows.soft,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  toggleRowBorder: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mealIconBg: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  mealEmoji: { fontSize: 22 },
  mealName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 4 },

  noteCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noteTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.md },
  noteText: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 24 },
});
