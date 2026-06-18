import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../context/ThemeContext';
import { SyncStatus } from '../stores/syncStore';

export default function SyncIndicator() {
  const { colors } = useTheme();
  const { status, pendingCount, lastSyncLabel, isSyncing, isOffline, hasError, triggerSync } = useSync();

  if (status === SyncStatus.IDLE && pendingCount === 0) {
    if (!lastSyncLabel) return null;
    return (
      <View style={[styles.bar, { backgroundColor: colors.bgSuccess }]}>
        <Ionicons name="checkmark-circle-outline" size={13} color={colors.success} />
        <Text style={[styles.text, { color: colors.successText }]}>À jour {lastSyncLabel}</Text>
      </View>
    );
  }

  if (isOffline) {
    return (
      <View style={[styles.bar, { backgroundColor: colors.bgWarning }]}>
        <Ionicons name="cloud-offline-outline" size={13} color={colors.warningText} />
        <Text style={[styles.text, { color: colors.warningText }]}>
          Hors ligne{pendingCount > 0 ? ` — ${pendingCount} action(s) en attente` : ''}
        </Text>
      </View>
    );
  }

  if (isSyncing) {
    return (
      <View style={[styles.bar, { backgroundColor: colors.bgInfo }]}>
        <ActivityIndicator size={12} color={colors.info} />
        <Text style={[styles.text, { color: colors.infoText }]}>Synchronisation...</Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <TouchableOpacity style={[styles.bar, { backgroundColor: colors.bgDanger }]} onPress={triggerSync} activeOpacity={0.7}>
        <Ionicons name="warning-outline" size={13} color={colors.dangerText} />
        <Text style={[styles.text, { color: colors.dangerText }]}>Erreur sync — Appuyer pour réessayer</Text>
      </TouchableOpacity>
    );
  }

  if (pendingCount > 0) {
    return (
      <View style={[styles.bar, { backgroundColor: colors.bgWarning }]}>
        <Ionicons name="time-outline" size={13} color={colors.warningText} />
        <Text style={[styles.text, { color: colors.warningText }]}>{pendingCount} action(s) en attente de sync</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5 },
  text: { fontSize: 11, fontWeight: '600' },
});
