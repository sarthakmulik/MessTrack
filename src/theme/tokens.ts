// Design Tokens for MessTrack
// Dark, professional, mess-management feel

export const Colors = {
  // Brand
  primary: '#6C63FF',       // Vibrant purple
  primaryDark: '#4B44CC',
  primaryLight: '#A09AF5',
  accent: '#FF6584',        // Coral accent

  // Meal type colors
  breakfast: '#FFB347',     // Morning orange
  lunch: '#4CAF7D',         // Fresh green
  dinner: '#5B8AF5',        // Evening blue

  // Status colors
  present: '#4CAF7D',
  absent: '#FF6584',
  leave: '#FFB347',

  // Backgrounds
  background: '#0F0F17',
  surface: '#1A1A2E',
  surfaceElevated: '#22223A',
  card: '#1E1E34',

  // Text
  text: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#606080',

  // Border
  border: '#2A2A4A',
  borderLight: '#3A3A5A',

  // State
  success: '#4CAF7D',
  error: '#FF5252',
  warning: '#FFB347',
  info: '#5B8AF5',

  // Transparent overlays
  overlay: 'rgba(0,0,0,0.6)',
  glassLight: 'rgba(255,255,255,0.05)',
  glassMedium: 'rgba(255,255,255,0.10)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 38,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
};
