import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../config/api';

let zonesMemo = null;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const labelOf = (z) => {
  const parts = String(z?.fullPath || z?.name || '').split(' > ');
  return { title: z?.name || '', subtitle: parts.slice(1, -1).reverse().join(', ') };
};

async function loadZones() {
  if (zonesMemo) return zonesMemo;
  const r = await apiClient.get('/api/shipping-v3/zones', { timeout: 12000 });
  zonesMemo = (r.data?.data || []).map((z) => ({ ...z, _id: String(z._id) }));
  return zonesMemo;
}

function search(zones, q) {
  const n = norm(q);
  const usable = zones.filter((z) => z.type !== 'country');
  if (!n) return usable.filter((z) => z.type === 'city' && z.fullPath.startsWith('Niger'));
  const rank = { district: 0, city: 1, region: 2 };
  return usable
    .map((z) => {
      const names = [z.name, ...(z.aliases || [])].map(norm);
      let s = names.some((x) => x === n) ? 100 : names.some((x) => x.startsWith(n)) ? 80 : names.some((x) => x.split(' ').some((w) => w.startsWith(n))) ? 60 : norm(z.fullPath).includes(n) ? 30 : -1;
      if (s < 0) return null;
      if (z.fullPath.startsWith('Niger')) s += 10;
      return { z, s: s - (rank[z.type] || 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.s - a.s)
    .slice(0, 50)
    .map((x) => x.z);
}

/**
 * Lieu d'expédition de la boutique : quartier ou ville dans la liste officielle des zones.
 * onChange(zoneId, zone)
 */
export default function ShippingOriginField({ value, onChange, colors }) {
  const [zones, setZones] = useState(zonesMemo || []);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (zones.length) return;
    loadZones().then(setZones).catch(() => setError('Zones indisponibles hors connexion.'));
  }, [zones.length]);

  const selected = zones.find((z) => z._id === String(value || ''));
  const data = useMemo(() => search(zones, q), [zones, q]);
  const sel = selected ? labelOf(selected) : null;

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Ionicons name="navigate-outline" size={13} color={colors.textMuted} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSub }}>Lieu d'expédition (d'où partent vos colis)</Text>
      </View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        style={[styles.field, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primaryLight : colors.bgHover }]}
      >
        <Text style={{ fontSize: 18 }}>📍</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: selected ? '700' : '400', color: selected ? colors.text : colors.textMuted }} numberOfLines={1}>
            {sel ? sel.title : 'Choisir le quartier ou la ville'}
          </Text>
          {sel?.subtitle ? <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>{sel.subtitle}</Text> : null}
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{selected ? 'Modifier' : 'Choisir'}</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
        Sert à calculer les frais de livraison et à afficher « 📍 ville » sur vos produits.
      </Text>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
          <View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>D'où partent vos colis ?</Text>
            <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Ex. Grand Marché, Yantala, Maradi…"
                placeholderTextColor={colors.textPlaceholder}
                style={{ flex: 1, fontSize: 15, color: colors.text }}
                autoCorrect={false}
              />
            </View>
            {error ? <Text style={{ color: colors.dangerText, fontSize: 12, marginTop: 6 }}>{error}</Text> : null}
            {!zones.length && !error ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={data}
                keyExtractor={(z) => z._id}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 420, marginTop: 8 }}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.textMuted, marginVertical: 24 }}>Aucune zone « {q} »</Text>}
                renderItem={({ item }) => {
                  const l = labelOf(item);
                  const on = item._id === String(value || '');
                  return (
                    <TouchableOpacity
                      onPress={() => { onChange(item._id, item); setOpen(false); setQ(''); }}
                      style={[styles.row, on && { backgroundColor: colors.primaryLight }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={item.type === 'district' ? 'location' : 'business'} size={16} color={item.type === 'district' ? colors.primary : '#B17236'} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{l.title}</Text>
                        {l.subtitle ? <Text style={{ fontSize: 12, color: colors.textMuted }}>{l.subtitle}</Text> : null}
                      </View>
                      {on ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 10 },
});
