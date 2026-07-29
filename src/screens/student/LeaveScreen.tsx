import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';
import { MealSession } from '../../types';

export default function LeaveScreen() {
  const { user, tenantId } = useAuth();
  const [upcomingSessions, setUpcomingSessions] = useState<MealSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [markedIds, setMarkedIds] = useState<string[]>([]);

  const fetchSessions = useCallback(async () => {
    if (!tenantId) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const { data, error } = await supabase
      .from('meal_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('session_date', tomorrow.toISOString().split('T')[0])
      .lte('session_date', nextWeek.toISOString().split('T')[0])
      .order('session_date')
      .order('meal_type');

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setUpcomingSessions(data || []);
    }

    // Also fetch which sessions already have leave marked
    if (user) {
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (studentData) {
        const { data: leaveRecords } = await supabase
          .from('attendance_records')
          .select('meal_session_id')
          .eq('student_id', studentData.id)
          .eq('status', 'leave');

        setMarkedIds((leaveRecords || []).map((r: any) => r.meal_session_id));
      }
    }
    setLoading(false);
  }, [tenantId, user]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const markLeave = async (session: MealSession) => {
    if (!user) return;
    setMarking(session.id);
    try {
      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      if (sErr) throw sErr;

      const { error } = await supabase.from('attendance_records').insert({
        student_id: studentData.id,
        meal_session_id: session.id,
        tenant_id: tenantId,
        status: 'leave',
        scanned_at: new Date().toISOString(),
        synced_offline: false,
      });

      if (error) throw error;
      setMarkedIds((prev) => [...prev, session.id]);
      Alert.alert('✅ Leave Marked', `Leave marked for ${session.meal_type} on ${session.session_date}`);
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        Alert.alert('Already Marked', 'Leave is already marked for this session.');
        setMarkedIds((prev) => [...prev, session.id]);
      } else {
        Alert.alert('Error', err.message);
      }
    } finally {
      setMarking(null);
    }
  };

  const mealIcon = (m: string) => (m === 'breakfast' ? '☀️' : m === 'dinner' ? '🌙' : '🌤️');
  const mealColor = (m: string) =>
    m === 'breakfast' ? Colors.breakfast : m === 'dinner' ? Colors.dinner : Colors.lunch;

  const renderItem = ({ item }: { item: MealSession }) => {
    const isMarked = markedIds.includes(item.id);
    const isMarking = marking === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <Text style={styles.mealIcon}>{mealIcon(item.meal_type)}</Text>
          <View>
            <Text style={[styles.mealType, { color: mealColor(item.meal_type) }]}>
              {item.meal_type.charAt(0).toUpperCase() + item.meal_type.slice(1)}
            </Text>
            <Text style={styles.date}>
              {new Date(item.session_date).toLocaleDateString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short',
              })}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.leaveBtn,
            isMarked ? styles.leaveBtnMarked : styles.leaveBtnDefault,
          ]}
          onPress={() => !isMarked && markLeave(item)}
          disabled={isMarked || isMarking}
        >
          {isMarking ? (
            <ActivityIndicator color={Colors.text} size="small" />
          ) : (
            <Text style={styles.leaveBtnText}>{isMarked ? '✅ Leave Marked' : '🏖️ Mark Leave'}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>📋 Advance Leave Notice</Text>
        <Text style={styles.infoText}>
          Mark leave before a session to let your mess admin plan food quantities.
          This also ensures fair billing — you won't be charged for meals you notified in advance.
        </Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={upcomingSessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyText}>No upcoming sessions scheduled</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  infoBox: {
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    borderRadius: Radius.lg,
    margin: Spacing.lg,
    padding: Spacing.md,
  },
  infoTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: 4 },
  infoText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  card: {
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
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  mealIcon: { fontSize: 28 },
  mealType: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  date: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  leaveBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  leaveBtnDefault: {
    backgroundColor: Colors.warning + '15',
    borderColor: Colors.warning,
  },
  leaveBtnMarked: {
    backgroundColor: Colors.success + '15',
    borderColor: Colors.success,
  },
  leaveBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text },
  empty: { alignItems: 'center', paddingTop: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, color: Colors.textMuted },
});
