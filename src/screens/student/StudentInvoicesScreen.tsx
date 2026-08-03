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
  Linking,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Invoice } from '../../types';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';
import * as WebBrowser from 'expo-web-browser';
import Badge from '../../components/Badge';

interface ExtendedInvoice extends Invoice {
  paid_amount?: number;
  payments_ledger?: Array<{
    id: string;
    amount: number;
    method: string;
    status: string;
    created_at: string;
  }>;
}

export default function StudentInvoicesScreen() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<ExtendedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalDue, setTotalDue] = useState(0);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);

  // Tenant UPI Config for Direct Intent
  const [tenantUpiId, setTenantUpiId] = useState('');
  const [tenantUpiName, setTenantUpiName] = useState('');

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      // 1. Fetch student info & tenant UPI details
      const { data: studentData, error: sErr } = await supabase
        .from('students')
        .select('id, tenant_id, tenants:tenant_id(name, upi_id, upi_name)')
        .eq('auth_user_id', user.id)
        .limit(1)
        .single();
      if (sErr) throw sErr;

      if (studentData?.tenants) {
        const t = studentData.tenants as any;
        setTenantUpiId(t.upi_id || '');
        setTenantUpiName(t.upi_name || t.name || 'Mess');
      }

      // 2. Fetch invoices with payments ledger
      const { data, error } = await supabase
        .from('invoices')
        .select('*, payments(*)')
        .eq('student_id', studentData.id)
        .order('generated_at', { ascending: false });

      if (error) throw error;

      const invList: ExtendedInvoice[] = (data || []).map((inv: any) => ({
        ...inv,
        paid_amount: inv.paid_amount ?? 0,
        payments_ledger: inv.payments || [],
      }));

      setInvoices(invList);

      // Compute total balance due across all unpaid invoices
      const due = invList
        .filter((i) => i.status !== 'paid')
        .reduce((sum, i) => sum + Math.max(0, i.total_amount - (i.paid_amount ?? 0)), 0);
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
      case 'partially_paid': return Colors.warning;
      case 'overdue': return Colors.error;
      case 'sent': return Colors.primary;
      default: return Colors.textMuted;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'paid': return '✅ Paid';
      case 'partially_paid': return '⚠️ Partial';
      case 'overdue': return '🔴 Overdue';
      case 'sent': return '📤 Unpaid';
      default: return '📝 Draft';
    }
  };

  const handlePayOnline = async (invoice: ExtendedInvoice) => {
    const balanceDue = Math.max(0, invoice.total_amount - (invoice.paid_amount ?? 0));
    if (balanceDue <= 0) {
      Alert.alert('Info', 'This invoice is already paid in full.');
      return;
    }

    setProcessingPayment(invoice.id);
    try {
      // 1. Attempt Merchant API Payment Gateway
      const { data, error } = await supabase.functions.invoke('initiate-payment', {
        body: {
          amount: balanceDue,
          invoice_id: invoice.id,
          tenant_id: invoice.tenant_id,
        },
      });

      if (!error && data?.success && data?.paymentUrl) {
        // Open PhonePe Payment URL
        await WebBrowser.openBrowserAsync(data.paymentUrl);
        fetchInvoices();
        return;
      }

      // 2. Fallback to Direct Instant UPI Intent (GPay / PhonePe / Paytm / BHIM)
      if (tenantUpiId) {
        const upiUrl = `upi://pay?pa=${tenantUpiId}&pn=${encodeURIComponent(tenantUpiName)}&am=${balanceDue.toFixed(0)}&cu=INR&tn=Invoice_${invoice.id.substring(0, 6)}`;
        
        const canOpen = await Linking.canOpenURL(upiUrl);
        if (canOpen) {
          await Linking.openURL(upiUrl);
          Alert.alert('Payment Sent?', 'After completing payment in GPay/PhonePe, pull down to refresh invoice status.');
          return;
        }
      }

      // If neither merchant gateway nor upi_id are available
      Alert.alert(
        'UPI Payment',
        `To pay ₹${balanceDue.toFixed(0)}, please request your mess owner to set their Mess UPI ID in Payment Settings or pay cash at the counter.`
      );
    } catch (err: any) {
      // Direct UPI Fallback on error
      if (tenantUpiId) {
        const upiUrl = `upi://pay?pa=${tenantUpiId}&pn=${encodeURIComponent(tenantUpiName)}&am=${balanceDue.toFixed(0)}&cu=INR&tn=Invoice_${invoice.id.substring(0, 6)}`;
        Linking.openURL(upiUrl).catch(() => {
          Alert.alert('Payment Error', 'Unable to launch UPI app.');
        });
      } else {
        Alert.alert('Payment Error', err.message || 'Payment initiation failed.');
      }
    } finally {
      setProcessingPayment(null);
    }
  };

  const renderInvoice = ({ item }: { item: ExtendedInvoice }) => {
    const paidAmount = item.paid_amount ?? 0;
    const balanceDue = Math.max(0, item.total_amount - paidAmount);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.period}>
              {new Date(item.period_start).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
              {' — '}
              {new Date(item.period_end).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
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
            <Text style={styles.metaLabel}>Total Bill</Text>
            <Text style={styles.metaValue}>₹{item.total_amount.toFixed(0)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Paid</Text>
            <Text style={[styles.metaValue, { color: Colors.success }]}>₹{paidAmount.toFixed(0)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Balance Due</Text>
            <Text style={[styles.metaValue, { color: balanceDue > 0 ? Colors.warning : Colors.textMuted, fontSize: FontSize.xl }]}>
              ₹{balanceDue.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Itemized Payment History Ledger */}
        {item.payments_ledger && item.payments_ledger.length > 0 && (
          <View style={styles.ledgerSection}>
            <Text style={styles.ledgerHeader}>Payment History ({item.payments_ledger.length})</Text>
            {item.payments_ledger.map((p) => (
              <View key={p.id} style={styles.ledgerRow}>
                <Text style={styles.ledgerDate}>
                  {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
                <Text style={styles.ledgerMethod}>{p.method?.toUpperCase() || 'PAYMENT'}</Text>
                <Text style={styles.ledgerAmount}>+₹{p.amount.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}

        {balanceDue > 0 && (
          <TouchableOpacity
            style={styles.payButton}
            onPress={() => handlePayOnline(item)}
            disabled={processingPayment === item.id}
          >
            {processingPayment === item.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.payButtonText}>⚡ Pay ₹{balanceDue.toFixed(0)} via GPay / PhonePe</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Due Amount Banner */}
      {totalDue > 0 && (
        <View style={styles.dueBanner}>
          <Text style={styles.dueLabel}>Total Balance Due</Text>
          <Text style={styles.dueAmount}>₹{totalDue.toFixed(0)}</Text>
          <Text style={styles.dueHint}>Pay online instantly via GPay, PhonePe, Paytm or Cash</Text>
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
              <Text style={styles.emptyText}>No invoices yet.</Text>
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
    backgroundColor: Colors.warning + '15',
    borderWidth: 1,
    borderColor: Colors.warning,
    margin: Spacing.lg,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    ...Shadows.soft,
  },
  dueLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.bold },
  dueAmount: { fontSize: FontSize.xxxl, fontWeight: FontWeight.heavy, color: Colors.warning, marginTop: 2 },
  dueHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.lg, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.soft,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.md,
  },
  payButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    margin: Spacing.md,
    marginTop: Spacing.xs,
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
    backgroundColor: Colors.background,
  },
  metaItem: { alignItems: 'center' },
  metaLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  metaValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginTop: 2 },

  ledgerSection: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  ledgerHeader: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginBottom: Spacing.xs },
  ledgerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  ledgerDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  ledgerMethod: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.text },
  ledgerAmount: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.success },

  empty: { alignItems: 'center', paddingTop: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, color: Colors.textMuted },
});
