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
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';
import Badge from '../../components/Badge';
import { Button } from '../../components/ui/Button';

const MEAL_EMOJI: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };
const MEAL_COLORS: Record<string, string> = {
  breakfast: Colors.breakfast,
  lunch: Colors.lunch,
  dinner: Colors.dinner,
};

const REASONS = [
  'Going Home 🏡',
  'Exams / College 📚',
  'Festival / Holiday 🪔',
  'Eating Outside 🍕',
  'Sick / Unwell 🤒',
];

interface StudentInfo {
  student_id: string;
  tenant_id: string;
  tenant_name: string;
  meal_types: string[];
}

interface UpcomingLeave {
  id: string;
  leave_date: string;
  meal_type: string;
  reason?: string;
}

export default function LeaveScreen({ navigation }: any) {
  const { user } = useAuth();
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'today' | 'advance'>('today');

  // Today Leave State
  const [leaveStatus, setLeaveStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Advance Leave Form State
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const defaultEndStr = new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(tomorrowStr);
  const [endDate, setEndDate] = useState(defaultEndStr);
  const [selectedReason, setSelectedReason] = useState(REASONS[0]);
  const [advanceMeals, setAdvanceMeals] = useState<string[]>([]);
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

  // Upcoming Leaves State
  const [upcomingLeaves, setUpcomingLeaves] = useState<UpcomingLeave[]>([]);

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

      if (advanceMeals.length === 0) {
        setAdvanceMeals(mealTypes);
      }

      // Fetch today's leave entries
      const { data: leaves } = await supabase
        .from('meal_leaves')
        .select('meal_type')
        .eq('student_id', students.id)
        .eq('leave_date', today);

      const leaveMap: Record<string, boolean> = {};
      (leaves ?? []).forEach((l) => (leaveMap[l.meal_type] = true));
      setLeaveStatus(leaveMap);

      // Fetch upcoming advance leaves (leave_date > today)
      const { data: futureLeaves } = await supabase
        .from('meal_leaves')
        .select('id, leave_date, meal_type, reason')
        .eq('student_id', students.id)
        .gt('leave_date', today)
        .order('leave_date', { ascending: true })
        .limit(30);

      setUpcomingLeaves(futureLeaves || []);
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

  const handleApplyAdvanceLeave = async () => {
    if (!studentInfo) return;
    if (!startDate || !endDate) {
      Alert.alert('Validation', 'Please enter both Start Date and End Date (YYYY-MM-DD)');
      return;
    }
    if (advanceMeals.length === 0) {
      Alert.alert('Validation', 'Please select at least one meal type.');
      return;
    }

    setSubmittingAdvance(true);
    try {
      const { data, error } = await supabase.rpc('apply_advance_leave', {
        p_student_id: studentInfo.student_id,
        p_tenant_id: studentInfo.tenant_id,
        p_start_date: startDate,
        p_end_date: endDate,
        p_meal_types: advanceMeals,
        p_reason: selectedReason,
      });

      if (error) throw error;

      Alert.alert(
        'Vacation Leave Booked! 🎉',
        `Successfully marked ${data} meal leave records from ${startDate} to ${endDate}. Your mess admin has been notified!`,
      );

      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmittingAdvance(false);
    }
  };

  const handleCancelUpcomingLeave = async (id: string) => {
    try {
      const { error } = await supabase.from('meal_leaves').delete().eq('id', id);
      if (error) throw error;
      setUpcomingLeaves((prev) => prev.filter((l) => l.id !== id));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const toggleAdvanceMeal = (m: string) => {
    setAdvanceMeals((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  };

  const totalOnLeave = Object.values(leaveStatus).filter(Boolean).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading leave settings...</Text>
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
        <Text style={styles.headerTitle}>Mess Leave Manager 🚫</Text>
        <Text style={styles.headerMess}>{studentInfo.tenant_name}</Text>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'today' && styles.tabButtonActive]}
          onPress={() => setActiveTab('today')}
        >
          <Text style={[styles.tabText, activeTab === 'today' && styles.tabTextActive]}>
            ☀️ Skip Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'advance' && styles.tabButtonActive]}
          onPress={() => setActiveTab('advance')}
        >
          <Text style={[styles.tabText, activeTab === 'advance' && styles.tabTextActive]}>
            📅 Date Range Leave
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'today' ? (
        <>
          {/* Today's Date Header */}
          <View style={styles.dateHeader}>
            <Text style={styles.dateTitle}>Today's Meals</Text>
            <Text style={styles.dateSub}>{todayDisplay}</Text>
          </View>

          {totalOnLeave > 0 && (
            <View style={styles.summaryBanner}>
              <Text style={styles.summaryText}>
                ✅ You've marked leave for {totalOnLeave} meal{totalOnLeave !== 1 ? 's' : ''} today.
              </Text>
            </View>
          )}

          {/* Today Leave Toggles */}
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

          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>ℹ️ How Mess Off Works</Text>
            <Text style={styles.noteText}>• Toggle OFF to notify the mess not to cook for you today.</Text>
            <Text style={styles.noteText}>• Your 30-day meal balance naturally stays preserved for when you eat!</Text>
          </View>
        </>
      ) : (
        <>
          {/* Advance Vacation Form */}
          <View style={styles.advanceCard}>
            <Text style={styles.sectionTitle}>Book Vacation / Multi-Day Leave 🏡</Text>
            <Text style={styles.sectionSub}>
              Select dates when traveling home or eating outside. Your mess owner won't cook for you during these dates.
            </Text>

            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Start Date</Text>
                <TextInput
                  style={styles.input}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>End Date</Text>
                <TextInput
                  style={styles.input}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            {/* Meal Selector */}
            <Text style={styles.label}>Meals to Skip</Text>
            <View style={styles.mealChipsRow}>
              {studentInfo.meal_types.map((m) => {
                const selected = advanceMeals.includes(m);
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.mealChip, selected && styles.mealChipSelected]}
                    onPress={() => toggleAdvanceMeal(m)}
                  >
                    <Text style={[styles.mealChipText, selected && styles.mealChipTextSelected]}>
                      {selected ? '✓ ' : ''}{m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Reason Selector */}
            <Text style={styles.label}>Reason for Leave</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reasonsScroll}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonChip, selectedReason === r && styles.reasonChipSelected]}
                  onPress={() => setSelectedReason(r)}
                >
                  <Text style={[styles.reasonText, selectedReason === r && styles.reasonTextSelected]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Button
              title="Confirm Advance Leave"
              onPress={handleApplyAdvanceLeave}
              isLoading={submittingAdvance}
              style={{ marginTop: Spacing.md }}
            />
          </View>

          {/* Upcoming Leaves List */}
          <Text style={styles.upcomingHeader}>Upcoming Booked Leaves ({upcomingLeaves.length})</Text>
          {upcomingLeaves.length === 0 ? (
            <View style={styles.emptyUpcoming}>
              <Text style={styles.emptyUpcomingText}>No upcoming leaves scheduled.</Text>
            </View>
          ) : (
            upcomingLeaves.map((item) => (
              <View key={item.id} style={styles.upcomingCard}>
                <View>
                  <Text style={styles.upcomingDate}>📅 {item.leave_date}</Text>
                  <Text style={styles.upcomingDetail}>
                    {item.meal_type.toUpperCase()} • {item.reason || 'Skipped'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handleCancelUpcomingLeave(item.id)}
                >
                  <Text style={styles.cancelBtnText}>Cancel 🗑️</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.md, marginTop: Spacing.sm },
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
  headerMess: { fontSize: FontSize.sm, color: Colors.primary, marginTop: 2, fontWeight: FontWeight.bold },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  tabTextActive: {
    color: '#ffffff',
  },

  dateHeader: { marginBottom: Spacing.sm },
  dateTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  dateSub: { fontSize: FontSize.xs, color: Colors.textMuted },

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

  // Advance Leave Styles
  advanceCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
    ...Shadows.soft,
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 4 },
  sectionSub: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18, marginBottom: Spacing.md },
  rowInputs: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.bold, marginBottom: 4 },
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
  mealChipsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  mealChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  mealChipSelected: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  mealChipText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  mealChipTextSelected: { color: Colors.primary },

  reasonsScroll: { marginBottom: Spacing.md },
  reasonChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    marginRight: Spacing.xs,
  },
  reasonChipSelected: {
    backgroundColor: Colors.accent + '25',
    borderColor: Colors.accent,
  },
  reasonText: { color: Colors.textMuted, fontSize: FontSize.xs },
  reasonTextSelected: { color: Colors.accent, fontWeight: FontWeight.bold },

  upcomingHeader: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  emptyUpcoming: { padding: Spacing.md, alignItems: 'center' },
  emptyUpcomingText: { color: Colors.textMuted, fontSize: FontSize.xs },
  upcomingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  upcomingDate: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  upcomingDetail: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  cancelBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  cancelBtnText: { color: Colors.error, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
});
