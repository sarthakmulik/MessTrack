import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Invoice } from '../../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';
import * as WebBrowser from 'expo-web-browser';

export default function StudentInvoicesScreen() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalDue, setTotalDue] = useState(0);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      if (sErr) throw sErr;

      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('student_id', studentData.id)
        .order('generated_at', { ascending: false });

      if (error) throw error;
      const inv = data as Invoice[];
      setInvoices(inv);
      const due = inv
        .filter((i) => i.status === 'sent' || i.status === 'overdue')
        .reduce((sum, i) => sum + i.total_amount, 0);
      setTotalDue(due);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchInvoices();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return Colors.success;
      case 'overdue': return Colors.error;
      case 'sent': return Colors.warning;
      default: return Colors.textMuted;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'paid': return '✅ Paid';
      case 'overdue': return '🔴 Overdue';
      case 'sent': return '📤 Due';
      default: return '📝 Draft';
    }
  };

  const handlePayOnline = async (invoice: Invoice) => {
    setProcessingPayment(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke('initiate-payment', {
        body: {
          amount: invoice.total_amount,
          invoice_id: invoice.id,
          tenant_id: invoice.tenant_id,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      // Open PhonePe Payment URL
      const result = await WebBrowser.openBrowserAsync(data.paymentUrl);
      
      // When they return from browser, refresh to see if status updated
      fetchInvoices();
    } catch (err: any) {
      console.error('Full Payment Error:', err);
      Alert.alert('Payment Error', err.context?.message || err.message || 'Failed to initiate payment.');
    } finally {
      setProcessingPayment(null);
    }
  };

  const renderInvoice = ({ item }: { item: Invoice }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.period}>
            {new Date(item.period_start).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
            {' — '}
            {new Date(item.period_end).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </Text>
          <Text style={styles.generatedAt}>
            Generated: {new Date(item.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20', borderColor: statusColor(item.status) }]}>
          <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
            {statusLabel(item.status)}
          </Text>
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardBottom}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Days Present</Text>
          <Text style={styles.metaValue}>{item.days_present}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Rate / Day</Text>
          <Text style={styles.metaValue}>₹{item.rate_per_day}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Total</Text>
          <Text style={[styles.metaValue, { color: Colors.primary, fontSize: FontSize.xl }]}>
            ₹{item.total_amount.toFixed(0)}
          </Text>
        </View>
      </View>
      {(item.status === 'sent' || item.status === 'overdue') && (
        <TouchableOpacity
          style={styles.payButton}
          onPress={() => handlePayOnline(item)}
          disabled={processingPayment === item.id}
        >
          {processingPayment === item.id ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.payButtonText}>Pay Online via UPI</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Due Amount Banner */}
      {totalDue > 0 && (
        <View style={styles.dueBanner}>
          <Text style={styles.dueLabel}>Total Amount Due</Text>
          <Text style={styles.dueAmount}>₹{totalDue.toFixed(0)}</Text>
          <Text style={styles.dueHint}>Pay online safely via UPI</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => item.id}
          renderItem={renderInvoice}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🧾</Text>
              <Text style={styles.emptyText}>No invoices yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  dueBanner: {
    backgroundColor: Colors.warning + '20',
    borderWidth: 1,
    borderColor: Colors.warning,
    margin: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  dueLabel: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: 4 },
  dueAmount: { fontSize: FontSize.xxxl, fontWeight: FontWeight.heavy, color: Colors.warning },
  dueHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.lg, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  payButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    margin: Spacing.md,
    marginTop: 0,
  },
  payButtonText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  period: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  generatedAt: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  cardDivider: { height: 1, backgroundColor: Colors.border },
  cardBottom: {
    flexDirection: 'row',
    padding: Spacing.md,
    justifyContent: 'space-around',
  },
  metaItem: { alignItems: 'center' },
  metaLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  metaValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, color: Colors.textMuted },
});
