import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../context/ThemeContext';

export default function OfflineBanner() {
  const { isOffline } = useSync();
  const { colors } = useTheme();
  if (!isOffline) return null;
  return (
    <View style={[styles.banner, { backgroundColor: colors.bgWarning, borderBottomColor: colors.border }]}>
      <Ionicons name="wifi-outline" size={14} color={colors.warningText} />
      <Text style={[styles.text, { color: colors.warningText }]}>
        Mode hors ligne — les données affichées sont locales
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderBottomWidth: 1, flexDirection: 'row',
    alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 7,
  },
  text: { fontSize: 12, fontWeight: '500', flex: 1 },
});
