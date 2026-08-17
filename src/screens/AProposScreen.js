import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useTheme } from '../context/ThemeContext';

const LOGO = require('../../assets/logo.png');

const VERSION   = Constants.expoConfig?.version ?? '1.0.0';
const APP_NAME  = 'Ihambaobab Pro';
const COMPANY   = 'Ihambaobab';
const SUPPORT   = 'support@ihambaobab.com';
const WEBSITE   = 'https://www.ihambaobab.com';

export default function AProposScreen({ navigation }) {
  const { colors } = useTheme();
  const insets     = useSafeAreaInsets();

  const rows = [
    {
      icon: 'document-text-outline',
      color: '#6366F1',
      label: "Conditions d'utilisation",
      onPress: () => navigation.navigate('Legal', { type: 'cgu' }),
    },
    {
      icon: 'shield-checkmark-outline',
      color: '#30A08B',
      label: 'Politique de confidentialité',
      onPress: () => navigation.navigate('Legal', { type: 'privacy' }),
    },
    {
      icon: 'mail-outline',
      color: '#F59E0B',
      label: 'Contacter le support',
      onPress: () => Linking.openURL(`mailto:${SUPPORT}`),
    },
    {
      icon: 'globe-outline',
      color: '#B17236',
      label: 'Visiter notre site',
      onPress: () => Linking.openURL(WEBSITE),
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / nom app */}
        <View style={[styles.heroCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Image source={LOGO} style={styles.appIcon} resizeMode="contain" />

          <View style={[styles.versionBadge, { backgroundColor: colors.bgHover }]}>
            <Ionicons name="code-slash-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.versionText, { color: colors.textMuted }]}>Version {VERSION}</Text>
          </View>
        </View>

        {/* Liens légaux & support */}
        <View style={[styles.linksCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {rows.map((row, i) => (
            <React.Fragment key={row.label}>
              <TouchableOpacity
                style={styles.row}
                onPress={row.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIcon, { backgroundColor: row.color + '18' }]}>
                  <Ionicons name={row.icon} size={18} color={row.color} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.text }]}>{row.label}</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textDisabled} />
              </TouchableOpacity>
              {i < rows.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        <Text style={[styles.copy, { color: colors.textDisabled }]}>
          © {new Date().getFullYear()} {COMPANY}. Tous droits réservés.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 16, gap: 16 },

  heroCard: {
    borderRadius: 20, borderWidth: 1, paddingVertical: 0, paddingHorizontal: 24,
    alignItems: 'center', gap: 6,
  },
  appIcon: {
    width: 160, height: 160, borderRadius: 22,
    marginVertical: -10,
  },
  appName:  { fontSize: 20, fontWeight: '900' },
  appBy:    { fontSize: 13 },
  versionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, marginTop: -15, marginBottom: 10,
  },
  versionText: { fontSize: 12, fontWeight: '600' },

  linksCard: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  divider:  { height: StyleSheet.hairlineWidth, marginLeft: 64 },

  copy: { fontSize: 11, textAlign: 'center', marginTop: 4 },
});
