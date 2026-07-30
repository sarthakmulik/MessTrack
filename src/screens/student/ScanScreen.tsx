import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import 'react-native-url-polyfill/auto';

// Simple UUID generator for device ID
const generateDeviceId = () => {
  return 'device_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
};

interface ScanResult {
  success: boolean;
  message: string;
  meal_type?: string;
}

export default function ScanScreen({ navigation }: any) {
  const { user, tenantId } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, []);

  const handleBarcodeScanned = async ({ data: rawData }: { data: string }) => {
    // Prevent rapid double-scans
    if (scanned || processing) return;

    // SECURITY: Reject if data looks like a file path (gallery import attempt)
    // In CameraView, gallery import is not possible — this is an extra safeguard
    if (!rawData || rawData.length < 10) {
      return;
    }

    setScanned(true);
    setProcessing(true);
    Vibration.vibrate(100);

    try {
      // Get Location (Geofencing)
      let geo_lat = null;
      let geo_lng = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          geo_lat = location.coords.latitude;
          geo_lng = location.coords.longitude;
        } else {
          Alert.alert('Permission Denied', 'Location is required to verify you are at the mess.');
          setProcessing(false);
          setScanned(false);
          return;
        }
      } catch (e) {
        console.log('Location error', e);
      }

      // Get persistent Device ID (Anti-Account Sharing)
      let device_id = await AsyncStorage.getItem('messtrack_device_id');
      if (!device_id) {
        device_id = generateDeviceId();
        await AsyncStorage.setItem('messtrack_device_id', device_id);
      }

      const { data: responseData, error } = await supabase.functions.invoke('validate-scan', {
        body: {
          token: rawData,
          scanned_at: new Date().toISOString(),
          geo_lat,
          geo_lng,
          device_id,
        },
      });

      if (error) {
        // Network error
        if (error.message?.includes('network') || error.message?.includes('fetch')) {
          setResult({
            success: false,
            message: '📶 No internet connection. Please connect to the internet to scan.',
          });
        } else {
          setResult({
            success: false,
            message: error.message || 'Scan failed. Please try again.',
          });
        }
      } else if (responseData?.success) {
        setResult({
          success: true,
          message: `✅ Attendance marked for ${responseData.meal_type || 'this meal'}!`,
          meal_type: responseData.meal_type,
        });
      } else {
        setResult({
          success: false,
          message: responseData?.message || 'Scan rejected. Please contact your mess admin.',
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: '📶 No internet connection. Please connect to the internet to scan.',
      });
    } finally {
      setProcessing(false);
      // Reset scanner after 3 seconds
      cooldownRef.current = setTimeout(() => {
        setScanned(false);
        setResult(null);
      }, 3000);
    }
  };

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          MessTrack needs camera access to scan the QR code at your mess counter.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera — live only, no gallery */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing={'back' as CameraType}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      />

      {/* Overlay UI */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Scan QR Code</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Instruction */}
        <Text style={styles.instruction}>
          Point your camera at the QR code displayed at the mess counter
        </Text>

        {/* Viewfinder */}
        <View style={styles.viewfinderContainer}>
          <View style={styles.viewfinder}>
            {/* Corner brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {processing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator color={Colors.primary} size="large" />
                <Text style={styles.processingText}>Validating...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Result banner */}
        {result && (
          <View style={[styles.resultBanner, result.success ? styles.resultSuccess : styles.resultError]}>
            <Text style={styles.resultText}>{result.message}</Text>
          </View>
        )}

        {/* Bottom hint */}
        {!result && !processing && (
          <View style={styles.bottomHint}>
            <Text style={styles.hintText}>🔒 Live camera scan only — no gallery import</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const VIEWFINDER_SIZE = 250;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing.lg,
    paddingTop: 54,
    paddingBottom: Spacing.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  topTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  instruction: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  viewfinderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: Colors.primary,
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  processingText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  resultBanner: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    width: '85%',
    alignItems: 'center',
  },
  resultSuccess: { backgroundColor: 'rgba(76,175,125,0.9)' },
  resultError: { backgroundColor: 'rgba(255,82,82,0.9)' },
  resultText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  bottomHint: {
    paddingBottom: 48,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  hintText: { color: 'rgba(255,255,255,0.5)', fontSize: FontSize.xs, textAlign: 'center' },
  permissionIcon: { fontSize: 56, marginBottom: Spacing.lg },
  permissionTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  permissionText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  permissionBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  permissionBtnText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  backBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  backBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
