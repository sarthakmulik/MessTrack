// Design Tokens for MessTrack
// Premium Light Beige & White Theme with Vibrant Accents

export const Colors = {
  // Brand
  primary: '#2A9D8F',       // Vibrant Sage Green
  primaryDark: '#21867a',
  primaryLight: '#a8dcd6',
  accent: '#E76F51',        // Burnt Orange / Coral

  // Meal type colors (Pastel highlights)
  breakfast: '#F4A261',     // Warm Sand
  lunch: '#2A9D8F',         // Sage
  dinner: '#457B9D',        // Muted Blue

  // Status colors
  present: '#2A9D8F',
  absent: '#E76F51',
  leave: '#E9C46A',

  // Backgrounds
  background: '#F9F7F1',    // Light beige
  surface: '#FFFFFF',       // Pure white cards
  surfaceElevated: '#F0EBE1', // Slightly darker beige for contrast areas
  card: '#FFFFFF',

  // Text
  text: '#264653',          // Deep Slate
  textSecondary: '#6B7A8C',
  textMuted: '#9BA4B5',

  // Border
  border: '#EAE6DB',
  borderLight: '#F2EFE8',

  // State
  success: '#2A9D8F',
  error: '#E76F51',
  warning: '#F4A261',
  info: '#457B9D',

  // Transparent overlays
  overlay: 'rgba(38, 70, 83, 0.4)',
  glassLight: 'rgba(255,255,255,0.7)',
  glassMedium: 'rgba(255,255,255,0.85)',
};

export const Shadows = {
  soft: {
    shadowColor: '#264653',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  medium: {
    shadowColor: '#264653',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
  },
  large: {
    shadowColor: '#264653',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 8,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Increased radii for a softer, premium look
export const Radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
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
