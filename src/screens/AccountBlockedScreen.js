import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';

const ADMIN_EMAIL = 'ihambaobab@gmail.com';
const ADMIN_WHATSAPP = '+22787727501';

export default function AccountBlockedScreen() {
  const { adminBlockReason, clearBlockedFlag, seller } = useAuthStore();

  const handleContactEmail = () => {
    const subject = encodeURIComponent('Demande de réactivation de compte');
    const body = encodeURIComponent(
      `Bonjour,\n\nJe souhaite obtenir des informations concernant la suspension de mon compte vendeur.\n\nBoutique : ${seller?.storeName || ''}\nEmail : ${seller?.email || ''}\n\nMerci.`
    );
    Linking.openURL(`mailto:${ADMIN_EMAIL}?subject=${subject}&body=${body}`);
  };

  const handleContactWhatsApp = () => {
    const msg = encodeURIComponent(
      `Bonjour, je souhaite obtenir des informations sur la suspension de mon compte vendeur (${seller?.storeName || seller?.email || ''}).`
    );
    Linking.openURL(`https://wa.me/${ADMIN_WHATSAPP.replace(/\D/g, '')}?text=${msg}`);
  };

  const handleBack = async () => {
    await clearBlockedFlag();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#7f1d1d" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={56} color="#ef4444" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Compte désactivé</Text>
        <Text style={styles.subtitle}>
          Votre compte vendeur a été suspendu par un administrateur.
        </Text>

        {/* Reason block */}
        {adminBlockReason ? (
          <View style={styles.reasonCard}>
            <View style={styles.reasonHeader}>
              <Ionicons name="information-circle-outline" size={18} color="#b91c1c" />
              <Text style={styles.reasonLabel}>Motif communiqué</Text>
            </View>
            <Text style={styles.reasonText}>{adminBlockReason}</Text>
          </View>
        ) : (
          <View style={styles.reasonCard}>
            <Text style={styles.reasonText}>
              Aucun motif précisé. Contactez l'équipe d'administration pour en savoir plus.
            </Text>
          </View>
        )}

        {/* What to do */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Que faire ?</Text>
          <View style={styles.infoRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#6b7280" style={styles.infoIcon} />
            <Text style={styles.infoText}>Contactez l'équipe Ihambaobab pour connaître les raisons</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#6b7280" style={styles.infoIcon} />
            <Text style={styles.infoText}>Si la situation est réglée, votre compte peut être réactivé</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#6b7280" style={styles.infoIcon} />
            <Text style={styles.infoText}>Mentionnez votre nom de boutique dans votre message</Text>
          </View>
        </View>

        {/* Contact buttons */}
        <Text style={styles.contactTitle}>Contacter l'administration</Text>

        <TouchableOpacity style={styles.btnEmail} onPress={handleContactEmail} activeOpacity={0.8}>
          <Ionicons name="mail-outline" size={20} color="#fff" />
          <Text style={styles.btnText}>Envoyer un email</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnWhatsApp} onPress={handleContactWhatsApp} activeOpacity={0.8}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.btnText}>WhatsApp</Text>
        </TouchableOpacity>

        {/* Back to login */}
        <TouchableOpacity style={styles.btnBack} onPress={handleBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back-outline" size={18} color="#6b7280" />
          <Text style={styles.btnBackText}>Retour à la connexion</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  reasonCard: {
    width: '100%',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fca5a5',
    marginLeft: 6,
  },
  reasonText: {
    fontSize: 14,
    color: '#fecaca',
    lineHeight: 20,
  },
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  infoIcon: {
    marginTop: 1,
    marginRight: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#94a3b8',
    flex: 1,
    lineHeight: 19,
  },
  contactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  btnEmail: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1d4ed8',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  btnWhatsApp: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 28,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  btnBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  btnBackText: {
    color: '#64748b',
    fontSize: 14,
  },
});
