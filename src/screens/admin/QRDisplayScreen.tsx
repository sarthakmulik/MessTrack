import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as ScreenCapture from 'expo-screen-capture';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';
import { MealSession, QRToken } from '../../types';

const { width } = Dimensions.get('window');
const QR_SIZE = width * 0.72;

const ROTATION_SECONDS = 20;

const mealIcon: Record<string, string> = {
  breakfast: '☀️',
  lunch: '🌤️',
  dinner: '🌙',
};
const mealColor: Record<string, string> = {
  breakfast: Colors.breakfast,
  lunch: Colors.lunch,
  dinner: Colors.dinner,
};

export default function QRDisplayScreen({ route, navigation }: any) {
  // ── Prevent Screenshots (Anti-Fraud) ──
  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }
  }, []);

  const { sessionId } = route.params as { sessionId: string };
  const { tenantId } = useAuth();

  const [session, setSession] = useState<MealSession | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(ROTATION_SECONDS);
  const [scanCount, setScanCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch session details ──
  const fetchSession = useCallback(async () => {
    const { data, error } = await supabase
      .from('meal_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    if (error) Alert.alert('Error', error.message);
    else setSession(data as MealSession);
  }, [sessionId]);

  // ── Fetch scan count ──
  const fetchScanCount = useCallback(async () => {
    const { count } = await supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('meal_session_id', sessionId)
      .eq('status', 'present');
    setScanCount(count ?? 0);
  }, [sessionId]);

  // ── Generate & insert a new QR token via Edge Function ──
  // Pass sessionId so the Edge Function rotates ONLY this session (no time-window bug)
  const rotateToken = useCallback(async (): Promise<string | null> => {
    if (!tenantId) return null;

    const { data, error } = await supabase.functions.invoke('rotate-qr-token', {
      method: 'POST',
      body: { session_id: sessionId },
    });

    if (error) {
      console.warn('Token rotation error:', error.message);
      return null;
    }

    fetchScanCount();

    // The edge function returns the new token directly — use it immediately
    if (data?.sessions?.length > 0) {
      const newToken: string = data.sessions[0].token;
      setCurrentToken(newToken);
      setCountdown(ROTATION_SECONDS);
      return newToken;
    }
    return null;
  }, [tenantId, fetchScanCount, sessionId]);

  // ── Fetch latest active token on mount ──
  const fetchLatestToken = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('qr_tokens')
        .select('*')
        .eq('meal_session_id', sessionId)
        .gt('expires_at', new Date().toISOString())
        .order('issued_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        // There's already a valid token in DB — use it
        setCurrentToken((data as QRToken).token);
        const remaining = Math.max(
          0,
          Math.ceil((new Date((data as QRToken).expires_at).getTime() - Date.now()) / 1000),
        );
        setCountdown(remaining);
      } else {
        // No active token yet — mint the first one via edge function
        await rotateToken();
      }
    } catch (err) {
      console.warn('Error during fetchLatestToken:', err);
      // Even on error, try to mint a token
      await rotateToken();
    } finally {
      setLoading(false);
    }
  }, [sessionId, rotateToken]);

  // ── Subscribe to Realtime token updates ──
  useEffect(() => {
    fetchSession();
    fetchScanCount();
    fetchLatestToken();

    const channel = supabase
      .channel(`qr-tokens-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'qr_tokens',
          filter: `meal_session_id=eq.${sessionId}`,
        },
        (payload) => {
          const token = payload.new as QRToken;
          setCurrentToken(token.token);
          setCountdown(ROTATION_SECONDS);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSession, fetchScanCount, fetchLatestToken, sessionId]);

  // ── Countdown timer ──
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Auto-rotate when countdown hits 0 (debounce: only when exactly 0) ──
  const hasRotatedRef = useRef(false);
  useEffect(() => {
    if (countdown === 0 && !hasRotatedRef.current) {
      hasRotatedRef.current = true;
      rotateToken().finally(() => {
        hasRotatedRef.current = false;
      });
    }
  }, [countdown, rotateToken]);

  // ── Refresh scan count every 10s ──
  useEffect(() => {
    rotationRef.current = setInterval(fetchScanCount, 10000);
    return () => {
      if (rotationRef.current) clearInterval(rotationRef.current);
    };
  }, [fetchScanCount]);

  const handleEndSession = () => {
    Alert.alert('End Session', 'Are you sure you want to end this meal session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('meal_sessions')
            .update({ status: 'ended' })
            .eq('id', sessionId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading || !session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading QR Display...</Text>
      </View>
    );
  }

  const color = mealColor[session.meal_type] ?? Colors.primary;
  const countdownPercent = countdown / ROTATION_SECONDS;

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.endBtn} onPress={handleEndSession}>
          <Text style={styles.endBtnText}>End Session</Text>
        </TouchableOpacity>
      </View>

      {/* Meal label */}
      <View style={styles.mealBadge}>
        <Text style={styles.mealBadgeIcon}>{mealIcon[session.meal_type]}</Text>
        <Text style={[styles.mealBadgeText, { color }]}>
          {session.meal_type.charAt(0).toUpperCase() + session.meal_type.slice(1)}
        </Text>
      </View>

      {/* QR Code */}
      <View style={styles.qrWrapper}>
        {currentToken ? (
          <QRCode
            value={currentToken}
            size={QR_SIZE}
            backgroundColor="#FFFFFF"
            color="#000000"
          />
        ) : (
          <View style={[styles.qrPlaceholder, { width: QR_SIZE, height: QR_SIZE }]}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        )}
      </View>

      {/* Countdown bar */}
      <View style={styles.countdownSection}>
        <View style={styles.countdownBarBg}>
          <View
            style={[
              styles.countdownBarFill,
              {
                width: `${countdownPercent * 100}%`,
                backgroundColor: countdown <= 5 ? Colors.error : color,
              },
            ]}
          />
        </View>
        <Text style={styles.countdownText}>
          Refreshes in <Text style={{ color, fontWeight: FontWeight.bold }}>{countdown}s</Text>
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{scanCount}</Text>
          <Text style={styles.statLabel}>Scanned</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {new Date(session.start_time).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <Text style={styles.statLabel}>Start</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {new Date(session.end_time).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <Text style={styles.statLabel}>End</Text>
        </View>
      </View>

      {/* Hint */}
      <Text style={styles.hint}>
        🔒 QR rotates every {ROTATION_SECONDS}s · Screenshots are invalid
      </Text>

      {/* Manual refresh */}
      <TouchableOpacity style={styles.refreshBtn} onPress={rotateToken}>
        <Text style={styles.refreshBtnText}>↻ Rotate Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingBottom: Spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: { color: Colors.textMuted, marginTop: Spacing.sm },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 54,
    paddingBottom: Spacing.md,
  },
  backBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backBtnText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  endBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.error + '20',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  endBtnText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  mealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  mealBadgeIcon: { fontSize: 28 },
  mealBadgeText: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, letterSpacing: 1 },
  qrWrapper: {
    padding: Spacing.xl,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    elevation: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    marginBottom: Spacing.xl,
  },
  qrPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
  },
  countdownSection: {
    width: '80%',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  countdownBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  countdownBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  countdownText: { fontSize: FontSize.sm, color: Colors.textMuted },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statBox: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 90,
  },
  statValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  refreshBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  refreshBtnText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
