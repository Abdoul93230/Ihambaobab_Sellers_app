/**
 * LegalScreen — CGU et Politique de confidentialité
 * Paramètre de navigation : type = 'cgu' | 'privacy'
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

const APP_NAME    = 'Ihambaobab Pro';
const COMPANY     = 'Ihambaobab';
const CONTACT     = 'support@ihambaobab.com';
const LAST_UPDATE = '01 août 2025';
const WEBSITE     = 'www.ihambaobab.com';

const CGU_CONTENT = [
  {
    title: '1. Objet',
    body: `Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de l'application mobile ${APP_NAME} éditée par ${COMPANY}. En installant ou en utilisant l'application, le vendeur accepte sans réserve les présentes CGU.`,
  },
  {
    title: '2. Accès à l\'application',
    body: `L'accès à ${APP_NAME} est réservé aux vendeurs professionnels dûment enregistrés sur la plateforme Ihambaobab. Chaque compte est strictement personnel et non transférable. Le vendeur est responsable de la confidentialité de ses identifiants de connexion.`,
  },
  {
    title: '3. Obligations du vendeur',
    body: `Le vendeur s'engage à :\n• Fournir des informations exactes et à jour sur ses produits et son établissement.\n• Ne pas publier de contenu illégal, trompeur ou portant atteinte aux droits de tiers.\n• Respecter les prix et délais de livraison affichés.\n• Traiter les commandes avec sérieux et professionnalisme.\n• Ne pas utiliser l'application à des fins frauduleuses.`,
  },
  {
    title: '4. Gestion des commandes',
    body: `Le vendeur s'engage à confirmer ou refuser les commandes dans les délais raisonnables. Toute commande acceptée engage le vendeur à honorer la livraison. En cas d'annulation répétée, ${COMPANY} se réserve le droit de suspendre le compte.`,
  },
  {
    title: '5. Commissions et paiements',
    body: `${COMPANY} applique une commission sur les ventes réalisées via la marketplace, dont le taux est précisé lors de l'inscription ou dans les conditions d'abonnement. Les paiements sont reversés au vendeur selon les modalités définies dans son contrat d'abonnement.`,
  },
  {
    title: '6. Suspension et résiliation',
    body: `${COMPANY} se réserve le droit de suspendre ou de résilier tout compte vendeur en cas de violation des présentes CGU, de comportement frauduleux, ou de non-respect répété des engagements envers les acheteurs.`,
  },
  {
    title: '7. Responsabilité',
    body: `${COMPANY} met à disposition une plateforme technique et ne saurait être tenu responsable des litiges entre vendeurs et acheteurs, ni de l'inexactitude des informations publiées par le vendeur. ${APP_NAME} peut connaître des interruptions de service pour maintenance.`,
  },
  {
    title: '8. Propriété intellectuelle',
    body: `L'application ${APP_NAME}, son design, son code source et ses contenus sont la propriété exclusive de ${COMPANY}. Toute reproduction ou exploitation non autorisée est interdite.`,
  },
  {
    title: '9. Modifications des CGU',
    body: `${COMPANY} se réserve le droit de modifier les présentes CGU à tout moment. Le vendeur sera informé par notification dans l'application. L'utilisation continue de l'application après notification vaut acceptation des nouvelles conditions.`,
  },
  {
    title: '10. Contact',
    body: `Pour toute question relative aux présentes CGU : ${CONTACT} — ${WEBSITE}`,
  },
];

const PRIVACY_CONTENT = [
  {
    title: '1. Responsable du traitement',
    body: `${COMPANY} est responsable du traitement des données personnelles collectées via l'application ${APP_NAME}. Contact : ${CONTACT}`,
  },
  {
    title: '2. Données collectées',
    body: `Nous collectons les données suivantes :\n• Informations d'identification : nom, prénom, numéro de téléphone, adresse e-mail.\n• Informations commerciales : nom de la boutique, logo, localisation, documents de vérification.\n• Données transactionnelles : historique des ventes, commandes, paiements.\n• Données d'utilisation : logs de connexion, activité dans l'application.\n• Photos de profil uploadées volontairement.`,
  },
  {
    title: '3. Finalités du traitement',
    body: `Vos données sont utilisées pour :\n• Créer et gérer votre compte vendeur.\n• Traiter les commandes et paiements.\n• Vous envoyer des notifications relatives à votre activité.\n• Améliorer nos services et détecter les fraudes.\n• Respecter nos obligations légales et réglementaires.`,
  },
  {
    title: '4. Partage des données',
    body: `Vos données ne sont jamais vendues à des tiers. Elles peuvent être partagées avec :\n• Nos partenaires de paiement (pour le traitement des transactions).\n• Les services d'hébergement cloud (stockage sécurisé).\n• Les autorités compétentes si requis par la loi.`,
  },
  {
    title: '5. Conservation des données',
    body: `Vos données sont conservées pendant la durée de votre compte actif, puis 3 ans après sa fermeture pour des raisons légales et comptables. Les données de commandes sont conservées 5 ans conformément aux obligations fiscales.`,
  },
  {
    title: '6. Sécurité',
    body: `Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données : chiffrement HTTPS, hachage des mots de passe et PIN, accès restreint aux données sensibles. Les images sont stockées sur Cloudinary avec des contrôles d'accès.`,
  },
  {
    title: '7. Vos droits',
    body: `Conformément à la réglementation applicable, vous disposez des droits suivants :\n• Droit d'accès à vos données personnelles.\n• Droit de rectification des données inexactes.\n• Droit à l'effacement (sous conditions).\n• Droit d'opposition au traitement.\n\nPour exercer ces droits : ${CONTACT}`,
  },
  {
    title: '8. Notifications push',
    body: `Avec votre consentement, nous utilisons votre jeton de notification pour vous envoyer des alertes relatives à vos commandes, paiements et stock. Vous pouvez désactiver ces notifications depuis les paramètres de votre appareil à tout moment.`,
  },
  {
    title: '9. Cookies et données locales',
    body: `L'application stocke des données localement sur votre appareil (base de données SQLite, AsyncStorage) pour permettre le fonctionnement hors ligne. Ces données restent sur votre appareil et sont effacées lors de la déconnexion.`,
  },
  {
    title: '10. Contact',
    body: `Pour toute question relative à la protection de vos données : ${CONTACT} — ${WEBSITE}`,
  },
];

export default function LegalScreen({ route }) {
  const { type = 'cgu' } = route.params ?? {};
  const { colors } = useTheme();
  const insets     = useSafeAreaInsets();

  const isPrivacy = type === 'privacy';
  const content   = isPrivacy ? PRIVACY_CONTENT : CGU_CONTENT;
  const title     = isPrivacy ? 'Politique de confidentialité' : "Conditions Générales d'Utilisation";

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.updated, { color: colors.textMuted }]}>
          Dernière mise à jour : {LAST_UPDATE}
        </Text>

        {content.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
            <Text style={[styles.sectionBody, { color: colors.textSub || colors.textMuted }]}>
              {section.body}
            </Text>
          </View>
        ))}

        <Text style={[styles.footer, { color: colors.textDisabled }]}>
          {APP_NAME} — {COMPANY} · {WEBSITE}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1 },
  scroll:       { padding: 20, gap: 4 },
  pageTitle:    { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  updated:      { fontSize: 12, marginBottom: 24 },
  section:      { marginBottom: 20, gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  sectionBody:  { fontSize: 13, lineHeight: 20 },
  footer:       { fontSize: 11, textAlign: 'center', marginTop: 16 },
});
