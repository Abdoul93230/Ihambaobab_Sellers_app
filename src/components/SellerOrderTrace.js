import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const when = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const LABEL = {
  created: 'Commande passée',
  paid: 'Paiement confirmé',
  payment_failed: 'Paiement non abouti',
  expired: 'Annulée : paiement non reçu',
  accepted: 'Articles validés',
  picked_up: 'Colis remis au livreur',
  in_delivery: 'En cours de livraison',
  delivered: 'Livrée au client',
  cancelled: 'Annulée',
  processing: 'En préparation',
  reactivated: 'Paiement reçu, commande rétablie',
};

/**
 * Traçabilité côté vendeur : raison d'annulation, code de retrait à donner au livreur,
 * remise au livreur (nom + numéro) et journal horodaté de la commande.
 */
export default function SellerOrderTrace({ trace, colors }) {
  if (!trace) return null;
  const { cancel, pickupCode, pickedUpAt, courier, deliveredAt, history = [] } = trace;

  return (
    <View style={{ gap: 12, marginTop: 16 }}>
      {cancel ? (
        <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }}>
          <Ionicons name="close-circle" size={20} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#7F1D1D' }}>Annulée : {cancel.label}</Text>
            <Text style={{ fontSize: 12, color: '#991B1B', marginTop: 2 }}>
              Par {cancel.by}{cancel.at ? ` · ${when(cancel.at)}` : ''}{cancel.note ? `\n${cancel.note}` : ''}
            </Text>
            <Text style={{ fontSize: 12, color: '#991B1B', marginTop: 6 }}>Le stock de vos articles a été remis automatiquement.</Text>
          </View>
        </View>
      ) : null}

      {pickupCode ? (
        <View style={{ padding: 16, borderRadius: 16, backgroundColor: '#E8F5F2', borderWidth: 1.5, borderColor: '#30A08B' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#1F7A69', textTransform: 'uppercase', letterSpacing: 0.5 }}>Code de retrait</Text>
              <Text style={{ fontSize: 12, color: '#1F2937', marginTop: 4, lineHeight: 17 }}>
                Donnez ce code au livreur Ihambaobab quand il prend le colis. C'est votre preuve de remise : ne le donnez à personne d'autre.
              </Text>
            </View>
            <Text selectable style={{ fontSize: 34, fontWeight: '900', color: '#1F7A69', letterSpacing: 6, fontVariant: ['tabular-nums'] }}>{pickupCode}</Text>
          </View>
        </View>
      ) : null}

      {pickedUpAt ? (
        <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="bicycle" size={20} color="#30A08B" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>Colis remis au livreur</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
              {courier?.name || 'Livreur'}{courier?.phone ? ` · ${courier.phone}` : ''} · {when(pickedUpAt)} · code vérifié
            </Text>
            {deliveredAt ? <Text style={{ fontSize: 12, color: '#059669', marginTop: 4, fontWeight: '700' }}>Livrée au client le {when(deliveredAt)} (code client vérifié)</Text> : null}
          </View>
        </View>
      ) : null}

      {history.length ? (
        <View style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Historique</Text>
          {history.map((e, i) => {
            const bad = e.type === 'cancelled' || e.type === 'payment_failed' || e.type === 'expired';
            return (
              <View key={`${e.at}-${i}`} style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ width: 12, alignItems: 'center' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: bad ? '#EF4444' : '#30A08B' }} />
                  {i < history.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{LABEL[e.type] || e.type}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                    {when(e.at)}{e.by ? ` · ${e.by}` : ''}{e.courier?.phone ? ` (${e.courier.phone})` : ''}{e.note ? ` · ${e.note}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
