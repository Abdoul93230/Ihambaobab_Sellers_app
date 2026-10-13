import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** Classes de taille (identiques au moteur de livraison du backend) */
export const SIZE_CLASSES = [
  { key: 'small', label: 'Petit', icon: '👕', kg: 0.5, hint: 'Vêtements, bijoux, téléphone, cosmétiques' },
  { key: 'medium', label: 'Moyen', icon: '👟', kg: 2, hint: 'Chaussures, sac, petit électroménager' },
  { key: 'large', label: 'Grand', icon: '📺', kg: 8, hint: 'TV, micro-ondes, carton volumineux' },
  { key: 'xl', label: 'Très volumineux', icon: '🛋️', kg: 30, hint: 'Meuble, frigo, matelas : livraison sur devis' },
];

export const defaultWeightFor = (key) => SIZE_CLASSES.find((c) => c.key === key)?.kg ?? null;

/**
 * Taille du colis : 4 cartes. Choisir une taille préremplit le poids s'il est vide
 * (ou s'il valait le poids par défaut d'une autre taille).
 */
export default function SizeClassPicker({ value, weight, onChange, colors }) {
  const pick = (key) => {
    const w = String(weight ?? '').trim();
    const wasDefault = !w || SIZE_CLASSES.some((c) => String(c.kg) === w);
    onChange({ sizeClass: key, weight: wasDefault ? String(defaultWeightFor(key)) : w });
  };
  const selected = SIZE_CLASSES.find((c) => c.key === value);
  return (
    <View>
      <View style={styles.grid}>
        {SIZE_CLASSES.map((c) => {
          const on = c.key === value;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => pick(c.key)}
              activeOpacity={0.8}
              style={[styles.card, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryLight : colors.bgCard }]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={styles.icon}>{c.icon}</Text>
              <Text style={[styles.label, { color: on ? colors.primary : colors.text }]} numberOfLines={1}>{c.label}</Text>
              <Text style={[styles.kg, { color: colors.textMuted }]}>{c.key === 'xl' ? 'Sur devis' : `≈ ${String(c.kg).replace('.', ',')} kg`}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: selected ? colors.textMuted : '#B45309' }]}>
        {selected ? selected.hint : 'Choisissez la taille du colis : elle sert à calculer les frais de livraison.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { width: '48%', flexGrow: 1, borderWidth: 1.5, borderRadius: 12, padding: 10 },
  icon: { fontSize: 20 },
  label: { marginTop: 4, fontSize: 14, fontWeight: '700' },
  kg: { fontSize: 12, marginTop: 1 },
  hint: { fontSize: 12, marginTop: 8 },
});
