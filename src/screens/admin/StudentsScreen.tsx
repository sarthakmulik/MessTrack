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
  Modal,
} from 'react-native';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { LoadingState } from '../../components/ui/LoadingState';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '../../theme/tokens';
import { Student, Subscription, SubscriptionPlan } from '../../types';

interface StudentWithSub extends Student {
  is_active: boolean; // Added for soft delete
  active_subscriptions: {
    id: string;
    status: string;
    end_date: string;
    plan_name?: string;
  }[];
}

export default function StudentsScreen({ navigation }: { navigation: any }) {
  const { tenantId } = useAuth();
  const [students, setStudents] = useState<StudentWithSub[]>([]);
  const [filtered, setFiltered] = useState<StudentWithSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Assign Plan Modal State
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithSub | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const fetchStudents = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          subscriptions (
            id,
            status,
            end_date,
            subscription_plans ( name )
          )
        `)
        .eq('tenant_id', tenantId)
        .order('name');

      if (error) throw error;

      const mapped: StudentWithSub[] = (data ?? []).map((s: any) => {
        // Find all active subscriptions
        const activeSubs = (s.subscriptions || []).filter((sub: any) => sub.status === 'active').map((sub: any) => ({
            id: sub.id,
            status: sub.status,
            end_date: sub.end_date,
            plan_name: sub.subscription_plans?.name,
        }));

        return {
          ...s,
          is_active: s.is_active ?? true,
          active_subscriptions: activeSubs,
        };
      });

      setStudents(mapped);
      setFiltered(mapped);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load students');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    const q = search.toLowerCase();
    if (!q) {
      setFiltered(students);
    } else {
      setFiltered(
        students.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q) ||
            (s.phone ?? '').includes(q),
        ),
      );
    }
  }, [search, students]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStudents();
  };

  // ─── CRUD Actions ───

  const toggleStudentStatus = async (studentId: string, currentStatus: boolean) => {
    Alert.alert(
      currentStatus ? 'Deactivate Student?' : 'Reactivate Student?',
      currentStatus 
        ? 'This student will no longer be able to scan QR codes for this mess. Their past billing and attendance records will be preserved.'
        : 'This student will be able to scan QR codes again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: currentStatus ? 'Deactivate' : 'Reactivate', 
          style: currentStatus ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('students')
                .update({ is_active: !currentStatus })
                .eq('id', studentId);
              if (error) throw error;
              fetchStudents();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          }
        }
      ]
    );
  };

  const resetDeviceBinding = async (studentId: string) => {
    Alert.alert(
      'Reset Device Binding?',
      'This will allow the student to log in and scan from a new phone. Use this if they lost their old phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset Device', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('students')
                .update({ device_id: null })
                .eq('id', studentId);
              if (error) throw error;
              Alert.alert('Success', 'Device binding has been reset.');
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          }
        }
      ]
    );
  };

  const openPlanModal = async (student: StudentWithSub) => {
    setSelectedStudent(student);
    setPlanModalVisible(true);
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      setPlans(data || []);
    } catch (err: any) {
      Alert.alert('Error fetching plans', err.message);
    } finally {
      setLoadingPlans(false);
    }
  };

  const assignPlanToStudent = async (plan: SubscriptionPlan) => {
    if (!selectedStudent || !tenantId) return;

    // If student already has active subscriptions, ask whether to Replace or Add
    if (selectedStudent.active_subscriptions.length > 0) {
      Alert.alert(
        'Assign Plan',
        `Does this new "${plan.name}" replace the current plan, or run alongside it?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace Current', style: 'destructive', onPress: () => processAssignPlan(plan, true) },
          { text: 'Run Alongside (Overlap)', onPress: () => processAssignPlan(plan, false) },
        ]
      );
    } else {
      Alert.alert(
        'Assign Plan',
        `Assign "${plan.name}" to ${selectedStudent.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Assign', onPress: () => processAssignPlan(plan, false) }
        ]
      );
    }
  };

  const processAssignPlan = async (plan: SubscriptionPlan, replaceExisting: boolean) => {
    setPlanModalVisible(false);
    try {
      if (replaceExisting) {
        // 1. Mark existing active subscriptions as cancelled
        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('student_id', selectedStudent!.id)
          .eq('status', 'active');
      }

      // 2. Create new subscription
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + plan.duration_days);

      const { error } = await supabase
        .from('subscriptions')
        .insert({
          student_id: selectedStudent!.id,
          plan_id: plan.id,
          tenant_id: tenantId,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          status: 'active',
          amount_paid: 0,
        });

      if (error) throw error;
      Alert.alert('Success', 'Plan assigned successfully!');
      fetchStudents();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleStudentPress = (student: StudentWithSub) => {
    Alert.alert(
      'Manage Student',
      student.name,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Assign/Update Plan', onPress: () => openPlanModal(student) },
        { text: 'Reset Device Binding', onPress: () => resetDeviceBinding(student.id) },
        { 
          text: student.is_active ? 'Deactivate Account' : 'Reactivate Account', 
          style: student.is_active ? 'destructive' : 'default',
          onPress: () => toggleStudentStatus(student.id, student.is_active) 
        },
      ]
    );
  };

  const renderStudent = ({ item }: { item: StudentWithSub }) => (
    <Card 
      style={[styles.card, !item.is_active && styles.cardInactive]}
      onPress={() => handleStudentPress(item)}
    >
      <View style={[styles.avatar, !item.is_active && { backgroundColor: Colors.border }]}>
        <Text style={styles.avatarText}>{item.name[0].toUpperCase()}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={[styles.studentName, !item.is_active && { color: Colors.textMuted }]}>
          {item.name} {!item.is_active && '(Inactive)'}
        </Text>
        <Text style={styles.studentEmail}>{item.email}</Text>
        {item.phone ? <Text style={styles.studentPhone}>📱 {item.phone}</Text> : null}
        
        {item.active_subscriptions.length > 0 ? (
          item.active_subscriptions.map((sub, idx) => (
            <View key={sub.id} style={styles.subRow}>
              <Badge 
                label={sub.status} 
                variant={
                  sub.status === 'active' ? 'success' :
                  sub.status === 'expired' ? 'error' : 'default'
                }
                style={{ marginRight: 8 }}
              />
              {sub.plan_name ? (
                <Text style={styles.planName}>{sub.plan_name}</Text>
              ) : null}
            </View>
          ))
        ) : (
          <View style={styles.subRow}>
            <Badge label="NO PLAN" variant="default" style={{ marginRight: 8 }} />
          </View>
        )}
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Input
          placeholder="Search students..."
          value={search}
          onChangeText={setSearch}
        />
      </View>
      
      {loading ? (
        <LoadingState fullScreen={false} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderStudent}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No students found.</Text>
          }
        />
      )}

      {/* Plan Assignment Modal */}
      <Modal visible={planModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign Plan to {selectedStudent?.name}</Text>
            
            {loadingPlans ? (
              <LoadingState fullScreen={false} />
            ) : plans.length === 0 ? (
              <Text style={styles.emptyText}>No active plans found. Create one first.</Text>
            ) : (
              <FlatList
                data={plans}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 300 }}
                renderItem={({ item }) => (
                  <View style={styles.planOption}>
                    <View>
                      <Text style={styles.planOptionName}>{item.name}</Text>
                      <Text style={styles.planOptionDetails}>
                        ₹{item.price} • {item.duration_days} Days
                      </Text>
                    </View>
                    <Button 
                      title="Assign" 
                      size="small"
                      fullWidth={false}
                      onPress={() => assignPlanToStudent(item)} 
                    />
                  </View>
                )}
              />
            )}
            
            <Button 
              title="Close"
              variant="outline"
              style={{ marginTop: Spacing.lg }}
              onPress={() => setPlanModalVisible(false)}
            />
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddStudent')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
  },
  cardInactive: {
    opacity: 0.6,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary + '33',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    color: Colors.primary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  studentName: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    marginBottom: 2,
  },
  studentEmail: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: 2,
  },
  studentPhone: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: 6,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  planName: {
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xl,
    fontSize: FontSize.md,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    marginTop: -2,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    ...Shadows.large,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.lg,
  },
  planOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  planOptionName: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  planOptionDetails: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: 4,
  }
});
