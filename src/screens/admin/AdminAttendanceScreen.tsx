import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';

type AttendanceStatus = 'present' | 'absent' | 'leave' | 'not_scanned';

interface StudentAttendanceRow {
  student_id: string;
  student_name: string;
  student_email: string;
  status: AttendanceStatus;
  attendance_record_id: string | null;
  scanned_at: string | null;
}

const MEAL_TABS = ['breakfast', 'lunch', 'dinner'] as const;

export default function AdminAttendanceScreen({ navigation }: any) {
  const { tenantId } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMeal, setSelectedMeal] = useState<'breakfast' | 'lunch' | 'dinner'>('lunch');
  const [rows, setRows] = useState<StudentAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const fetchAttendance = useCallback(async () => {
    if (!tenantId) return;
    try {
      // Get the session for this date + meal
      const { data: session } = await supabase
        .from('meal_sessions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('session_date', selectedDate)
        .eq('meal_type', selectedMeal)
        .maybeSingle();

      // Get all students for this tenant
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, name, email')
        .eq('tenant_id', tenantId)
        .order('name');

      if (sErr) throw sErr;

      if (!session || !students) {
        setRows(
          (students || []).map((s: any) => ({
            student_id: s.id,
            student_name: s.name,
            student_email: s.email,
            status: 'not_scanned',
            attendance_record_id: null,
            scanned_at: null,
          })),
        );
        return;
      }

      // Get attendance records for this session
      const { data: records } = await supabase
        .from('attendance_records')
        .select('id, student_id, status, scanned_at')
        .eq('meal_session_id', session.id);

      const recordMap = new Map(
        (records || []).map((r: any) => [r.student_id, r]),
      );

      const merged: StudentAttendanceRow[] = (students || []).map((s: any) => {
        const rec = recordMap.get(s.id);
        return {
          student_id: s.id,
          student_name: s.name,
          student_email: s.email,
          status: rec ? rec.status : 'not_scanned',
          attendance_record_id: rec?.id ?? null,
          scanned_at: rec?.scanned_at ?? null,
        };
      });

      setRows(merged);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, selectedDate, selectedMeal]);

  useEffect(() => {
    setLoading(true);
    fetchAttendance();
  }, [fetchAttendance]);

  const adjustAttendance = async (
    row: StudentAttendanceRow,
    newStatus: 'present' | 'absent' | 'leave',
  ) => {
    if (!tenantId) return;
    setAdjustingId(row.student_id);
    try {
      // Get or create the session
      let sessionId: string;
      const { data: session } = await supabase
        .from('meal_sessions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('session_date', selectedDate)
        .eq('meal_type', selectedMeal)
        .maybeSingle();

      if (!session) {
        Alert.alert('No Session', 'There is no session for this date/meal. Please create one first.');
        return;
      }
      sessionId = session.id;

      if (row.attendance_record_id) {
        // Record exists — log an adjustment
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('attendance_adjustments').insert({
          attendance_record_id: row.attendance_record_id,
          adjusted_by_admin_id: user!.id,
          reason: `Admin override: changed to ${newStatus}`,
          action: `mark_${newStatus}`,
        });
        // NOTE: per spec, we don't update the record directly.
        // For the UI we reflect the latest adjustment status:
        Alert.alert(
          'Adjustment Logged',
          `Adjustment for ${row.student_name} logged. The attendance record is kept intact (audit trail preserved).`,
        );
      } else {
        // No record yet — create one directly
        const { error } = await supabase.from('attendance_records').insert({
          student_id: row.student_id,
          meal_session_id: sessionId,
          tenant_id: tenantId,
          status: newStatus,
          scanned_at: new Date().toISOString(),
          synced_offline: false,
        });
        if (error && error.code !== '23505') throw error;
      }

      await fetchAttendance();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setAdjustingId(null);
    }
  };

  const statusColor = (s: AttendanceStatus) => {
    if (s === 'present') return Colors.success;
    if (s === 'leave') return Colors.warning;
    if (s === 'absent') return Colors.error;
    return Colors.textMuted;
  };
  const statusIcon = (s: AttendanceStatus) => {
    if (s === 'present') return '✅';
    if (s === 'leave') return '🏖️';
    if (s === 'absent') return '❌';
    return '—';
  };

  const mealIcon: Record<string, string> = { breakfast: '☀️', lunch: '🌤️', dinner: '🌙' };
  const mealColorMap: Record<string, string> = {
    breakfast: Colors.breakfast,
    lunch: Colors.lunch,
    dinner: Colors.dinner,
  };

  const presentCount = rows.filter((r) => r.status === 'present').length;
  const leaveCount = rows.filter((r) => r.status === 'leave').length;
  const absentCount = rows.filter((r) => r.status === 'absent' || r.status === 'not_scanned').length;

  const renderRow = ({ item }: { item: StudentAttendanceRow }) => {
    const isAdjusting = adjustingId === item.student_id;
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <View style={[styles.avatar, { backgroundColor: statusColor(item.status) + '20' }]}>
            <Text style={[styles.avatarText, { color: statusColor(item.status) }]}>
              {item.student_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.studentName}>{item.student_name}</Text>
            <Text style={styles.studentEmail} numberOfLines={1}>{item.student_email}</Text>
            {item.scanned_at && (
              <Text style={styles.scannedAt}>
                {new Date(item.scanned_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rowRight}>
          {isAdjusting ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <>
              <View style={[styles.statusChip, { borderColor: statusColor(item.status) }]}>
                <Text style={styles.statusChipText}>{statusIcon(item.status)}</Text>
              </View>
              {/* Adjust buttons */}
              <View style={styles.adjustRow}>
                {(['present', 'absent', 'leave'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.adjustBtn,
                      item.status === s && { backgroundColor: statusColor(s) + '30', borderColor: statusColor(s) },
                    ]}
                    onPress={() => adjustAttendance(item, s)}
                    disabled={item.status === s}
                  >
                    <Text style={[styles.adjustBtnText, { color: statusColor(s) }]}>
                      {statusIcon(s)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    );
  };

  // Simple date navigation (-1/+1 day)
  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <View style={styles.container}>
      {/* Date nav */}
      <View style={styles.dateBar}>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => shiftDate(-1)}>
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>
          {new Date(selectedDate).toLocaleDateString('en-IN', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          })}
        </Text>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => shiftDate(1)}>
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Meal tabs */}
      <View style={styles.mealTabs}>
        {MEAL_TABS.map((m) => (
          <TouchableOpacity
            key={m}
            style={[
              styles.mealTab,
              selectedMeal === m && { borderColor: mealColorMap[m], backgroundColor: mealColorMap[m] + '20' },
            ]}
            onPress={() => setSelectedMeal(m)}
          >
            <Text style={styles.mealTabIcon}>{mealIcon[m]}</Text>
            <Text style={[styles.mealTabText, selectedMeal === m && { color: mealColorMap[m] }]}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={[styles.summaryItem, { color: Colors.success }]}>✅ {presentCount} Present</Text>
        <Text style={[styles.summaryItem, { color: Colors.warning }]}>🏖️ {leaveCount} Leave</Text>
        <Text style={[styles.summaryItem, { color: Colors.error }]}>❌ {absentCount} Absent</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.student_id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAttendance(); }} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>No students found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  arrowText: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  dateText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  mealTabs: {
    flexDirection: 'row',
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mealTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  mealTabIcon: { fontSize: 14 },
  mealTabText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textMuted },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.card,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryItem: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.md, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  studentName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  studentEmail: { fontSize: FontSize.xs, color: Colors.textMuted, maxWidth: 130 },
  scannedAt: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 1 },
  rowRight: { alignItems: 'center', gap: Spacing.xs },
  statusChip: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipText: { fontSize: 14 },
  adjustRow: { flexDirection: 'row', gap: 4 },
  adjustBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  adjustBtnText: { fontSize: 12 },
  empty: { alignItems: 'center', paddingTop: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, color: Colors.textMuted },
});
