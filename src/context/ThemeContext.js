import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'seller_theme';

// ─── Palette complète light / dark ───────────────────────────────────────────
const palette = {
  light: {
    // Fonds
    bg:           '#F8FAFC',
    bgCard:       '#FFFFFF',
    bgInput:      '#F9FAFB',
    bgHover:      '#F3F4F6',
    bgSuccess:    '#ECFDF5',
    bgWarning:    '#FFFBEB',
    bgDanger:     '#FEF2F2',
    bgInfo:       '#EFF6FF',

    // Textes
    text:         '#111827',
    textSub:      '#374151',
    textMuted:    '#6B7280',
    textPlaceholder: '#9CA3AF',
    textDisabled: '#D1D5DB',

    // Bordures
    border:       '#E5E7EB',
    borderFocus:  '#30A08B',

    // Brand
    primary:      '#30A08B',
    primaryDark:  '#267a6b',
    primaryLight: '#e6f5f2',
    primaryText:  '#FFFFFF',

    // États
    success:      '#10B981',
    successText:  '#065F46',
    warning:      '#F59E0B',
    warningText:  '#92400E',
    danger:       '#EF4444',
    dangerText:   '#B91C1C',
    info:         '#3B82F6',
    infoText:     '#1D4ED8',

    // Barre de statut
    statusBar:    'dark-content',

    // Ombre
    shadow:       '#000000',
  },
  dark: {
    // Fonds
    bg:           '#030712',   // gray-950
    bgCard:       '#111827',   // gray-900
    bgInput:      '#1F2937',   // gray-800
    bgHover:      '#1F2937',
    bgSuccess:    '#064E3B',
    bgWarning:    '#78350F',
    bgDanger:     '#7F1D1D',
    bgInfo:       '#1E3A5F',

    // Textes
    text:         '#F9FAFB',
    textSub:      '#E5E7EB',
    textMuted:    '#9CA3AF',
    textPlaceholder: '#6B7280',
    textDisabled: '#374151',

    // Bordures
    border:       '#1F2937',
    borderFocus:  '#30A08B',

    // Brand (identique)
    primary:      '#30A08B',
    primaryDark:  '#267a6b',
    primaryLight: '#0F3D35',
    primaryText:  '#FFFFFF',

    // États
    success:      '#10B981',
    successText:  '#6EE7B7',
    warning:      '#F59E0B',
    warningText:  '#FCD34D',
    danger:       '#EF4444',
    dangerText:   '#FCA5A5',
    info:         '#3B82F6',
    infoText:     '#93C5FD',

    // Barre de statut
    statusBar:    'light-content',

    // Ombre
    shadow:       '#000000',
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────
const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  // 'light' | 'dark' | 'system'
  const [mode, setMode] = useState('system');
  const [loaded, setLoaded] = useState(false);

  // Chargement depuis AsyncStorage au démarrage
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setMode(saved);
      }
      setLoaded(true);
    });
  }, []);

  // Persistance à chaque changement
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(THEME_KEY, mode);
  }, [mode, loaded]);

  const isDark =
    mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const colors = isDark ? palette.dark : palette.light;

  const setTheme = (newMode) => setMode(newMode); // 'light' | 'dark' | 'system'
  const toggleTheme = () =>
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ isDark, mode, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
