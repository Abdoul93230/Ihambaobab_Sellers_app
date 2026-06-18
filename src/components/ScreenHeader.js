import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import SyncIndicator from './SyncIndicator';
import OfflineBanner from './OfflineBanner';

export default function ScreenHeader({ title, subtitle, rightActions }) {
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgCard} />
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
        </View>
        {rightActions && (
          <View style={styles.actions}>
            {rightActions.map((action, i) => (
              <TouchableOpacity key={i} onPress={action.onPress} style={[styles.actionBtn, { backgroundColor: colors.bgHover }]}>
                <Ionicons name={action.icon} size={18} color={colors.textSub} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <SyncIndicator />
      <OfflineBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { borderBottomWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  titleBlock: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});
