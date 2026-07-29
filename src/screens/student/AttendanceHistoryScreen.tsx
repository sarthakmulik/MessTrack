import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';

interface AttendanceRow {
  id: string;
  scanned_at: string;
  status: 'present' | 'absent' | 'leave';
  meal_type: string;
  session_date: string;
}

export default function AttendanceHistoryScreen() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAttendance = useCallback(async () => {
    if (!user) return;
    try {
      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      if (sErr) throw sErr;

      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, scanned_at, status, meal_sessions(meal_type, session_date)')
        .eq('student_id', studentData.id)
        .order('scanned_at', { ascending: false })
        .limit(60);

      if (error) throw error;

      const rows: AttendanceRow[] = (data || []).map((r: any) => ({
        id: r.id,
        scanned_at: r.scanned_at,
        status: r.status,
        meal_type: r.meal_sessions?.meal_type ?? '—',
        session_date: r.meal_sessions?.session_date ?? '',
      }));
      setRecords(rows);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAttendance();
  };

  const statusColor = (status: string) => {
    if (status === 'present') return Colors.success;
    if (status === 'leave') return Colors.warning;
    return Colors.error;
  };

  const statusIcon = (status: string) => {
    if (status === 'present') return '✅';
    if (status === 'leave') return '🏖️';
    return '❌';
  };

  const mealIcon = (meal: string) => {
    if (meal === 'breakfast') return '☀️';
    if (meal === 'dinner') return '🌙';
    return '🌤️';
  };

  const renderItem = ({ item }: { item: AttendanceRow }) => (
    <View style={styles.row}>
      <View style={styles.dateCol}>
        <Text style={styles.dateDay}>
          {item.session_date
            ? new Date(item.session_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            : '—'}
        </Text>
        <Text style={styles.dateYear}>
          {item.session_date ? new Date(item.session_date).getFullYear() : ''}
        </Text>
      </View>
      <View style={styles.mealCol}>
        <Text style={styles.mealIcon}>{mealIcon(item.meal_type)}</Text>
        <Text style={styles.mealType}>{item.meal_type.charAt(0).toUpperCase() + item.meal_type.slice(1)}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20', borderColor: statusColor(item.status) }]}>
        <Text style={styles.statusIcon}>{statusIcon(item.status)}</Text>
        <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </Text>
      </View>
    </View>
  );

  // Monthly stats
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const thisMonthRecords = records.filter(
    (r) => new Date(r.scanned_at) >= startOfMonth,
  );
  const presentCount = thisMonthRecords.filter((r) => r.status === 'present').length;
  const leaveCount = thisMonthRecords.filter((r) => r.status === 'leave').length;

  return (
    <View style={styles.container}>
      {/* Monthly summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: Colors.success }]}>{presentCount}</Text>
          <Text style={styles.summaryLabel}>Present{'\n'}This Month</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: Colors.warning }]}>{leaveCount}</Text>
          <Text style={styles.summaryLabel}>Leave{'\n'}This Month</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: Colors.primary }]}>{records.length}</Text>
          <Text style={styles.summaryLabel}>Total{'\n'}Records</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyText}>No attendance records yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summaryRow: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.md, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateCol: { width: 60, alignItems: 'center' },
  dateDay: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  dateYear: { fontSize: FontSize.xs, color: Colors.textMuted },
  mealCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm },
  mealIcon: { fontSize: 20 },
  mealType: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: 4,
  },
  statusIcon: { fontSize: 12 },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  empty: { alignItems: 'center', paddingTop: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, color: Colors.textMuted },
});
