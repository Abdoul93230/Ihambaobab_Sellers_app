/**
 * AbonnementScreen — gestion complète des abonnements seller
 * Miroir de SellerSubscriptionPage.jsx (web Sellers)
 * Config centralisée : src/config/subscriptionConfig.js
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, ActivityIndicator, TextInput,
  RefreshControl, Platform, KeyboardAvoidingView,
  Alert, Dimensions, Animated, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { useSync } from '../hooks/useSync';
import apiClient, { TIMEOUTS } from '../config/api';
import Toast from 'react-native-toast-message';
import SUBSCRIPTION_CONFIG from '../config/subscriptionConfig'

// Décode le payload JWT (base64url → base64 standard, compatible Hermes/Expo)
function decodeToken(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

function getTokenExp(token) {
  return decodeToken(token)?.exp || null;
}

function isTokenExpired(token) {
  const exp = getTokenExp(token);
  if (!exp) return false;
  return Date.now() / 1000 > exp;
}

// Vrai source de vérité : lire purpose directement dans le JWT
function isResubToken(token) {
  return decodeToken(token)?.purpose === 'resubscription';
};

const { width: SCREEN_W } = Dimensions.get('window');
// Le ScrollView a padding: 16 → la card fait SCREEN_W - 32
// ITEM_W = largeur du conteneur FlatList (sans padding interne)
// CARD_W = largeur visuelle de la plan card (avec 12px de marge chaque côté)
const CONTAINER_W = SCREEN_W - 32;
const ITEM_W      = CONTAINER_W;
const CARD_W      = CONTAINER_W - 24; // 12px marge chaque côté

// ─── Couleurs / icônes par plan ───────────────────────────────────────────────
const PLAN_META = {
  Starter:  { color: '#10B981', bg: '#ECFDF5', darkBg: '#064E3B', icon: 'leaf-outline',     rank: 1 },
  Pro:      { color: '#6366F1', bg: '#EEF2FF', darkBg: '#1E1B4B', icon: 'rocket-outline',   rank: 2, popular: true },
  Business: { color: '#F59E0B', bg: '#FFFBEB', darkBg: '#1C1204', icon: 'business-outline', rank: 3 },
};

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function fmtPrice(n) {
  return Number(n || 0).toLocaleString('fr-FR') + ' ₣';
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
}
function daysLeft(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000));
}
function planRank(name) { return PLAN_META[name]?.rank || 0; }

// ─── Badge statut requête ─────────────────────────────────────────────────────
const REQ_STATUS_META = {
  pending_payment:   { label: 'En attente paiement', color: '#F59E0B', bg: '#FFFBEB' },
  payment_submitted: { label: 'Paiement soumis',     color: '#6366F1', bg: '#EEF2FF' },
  payment_verified:  { label: 'Paiement vérifié',    color: '#10B981', bg: '#ECFDF5' },
  activated:         { label: 'Activé',              color: '#10B981', bg: '#ECFDF5' },
  rejected:          { label: 'Rejeté',              color: '#EF4444', bg: '#FEF2F2' },
  cancelled:         { label: 'Annulé',              color: '#9CA3AF', bg: '#F9FAFB' },
};
function ReqBadge({ status }) {
  const m = REQ_STATUS_META[status] || { label: status, color: '#9CA3AF', bg: '#F9FAFB' };
  return (
    <View style={[s.chip, { backgroundColor: m.bg }]}>
      <Text style={[s.chipText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

// ─── Barre de progression ─────────────────────────────────────────────────────
function UsageBar({ current, limit, color }) {
  if (limit === -1) return null;
  const pct = Math.min((current / limit) * 100, 100);
  const barColor = pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : color;
  return (
    <View style={s.usageBarBg}>
      <View style={[s.usageBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARTES DE STATUT
// ═══════════════════════════════════════════════════════════════════════════════
function StatusCard({ subData, statusInfo, productCount, queuedSubs, colors }) {
  const status    = statusInfo?.status;
  const activeSub = subData?.activeSubscription;
  const planName  = activeSub?.planType || 'Starter';
  const meta      = PLAN_META[planName] || PLAN_META.Starter;
  const cfg       = SUBSCRIPTION_CONFIG.getPlan(planName);

  if (status === 'no_subscription' || (!status && !activeSub)) {
    return (
      <View style={[s.statusCard, { backgroundColor: '#ECFDF5', borderColor: '#10B981' }]}>
        <View style={s.statusCardHeader}>
          <View style={[s.statusIcon, { backgroundColor: '#10B981' }]}>
            <Ionicons name="gift-outline" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusTitle, { color: '#065F46' }]}>Bienvenue ! Choisissez votre plan</Text>
            <Text style={[s.statusSub, { color: '#10B981' }]}>Démarrez gratuitement — aucun paiement requis</Text>
          </View>
        </View>
        <View style={s.tripleGrid}>
          {[
            { val: '2', label: 'mois gratuits', sub: 'Plan Starter' },
            { val: '1', label: 'mois gratuit',  sub: 'Pro & Business' },
            { val: '0', label: 'carte requise', sub: 'Paiement après essai' },
          ].map((item, i) => (
            <View key={i} style={[s.tripleItem, { backgroundColor: '#fff', borderColor: '#10B981' }]}>
              <Text style={[s.tripleVal, { color: '#10B981' }]}>{item.val}</Text>
              <Text style={[s.tripleLabel, { color: '#374151' }]}>{item.label}</Text>
              <Text style={[s.tripleSub, { color: '#6B7280' }]}>{item.sub}</Text>
            </View>
          ))}
        </View>
        <Text style={[s.hintText, { color: '#10B981' }]}>↓ Choisissez un plan ci-dessous pour commencer</Text>
      </View>
    );
  }

  if (status === 'trial') {
    const days = daysLeft(activeSub?.trialEndDate);
    return (
      <View style={[s.statusCard, { backgroundColor: '#F5F3FF', borderColor: '#6366F1' }]}>
        <View style={s.statusCardHeader}>
          <View style={[s.statusIcon, { backgroundColor: '#6366F1' }]}>
            <Ionicons name="gift-outline" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusTitle, { color: '#3730A3' }]}>Période d'Essai Gratuit</Text>
            <Text style={[s.statusSub, { color: '#6366F1' }]}>Plan {planName} — {days} jours restants</Text>
            <Text style={[s.statusDate, { color: '#6366F1' }]}>Fin d'essai : {fmtDate(activeSub?.trialEndDate)}</Text>
          </View>
        </View>
        <View style={s.tripleGrid}>
          <View style={[s.tripleItem, { backgroundColor: '#fff', borderColor: '#6366F1' }]}>
            <Ionicons name="cube-outline" size={14} color="#6366F1" />
            <Text style={[s.tripleVal, { color: '#6366F1', fontSize: 15 }]}>
              {productCount}{cfg?.productLimit !== -1 ? `/${cfg?.productLimit}` : ''}
            </Text>
            <Text style={[s.tripleSub, { color: '#6B7280' }]}>produits</Text>
            <UsageBar current={productCount} limit={cfg?.productLimit} color="#6366F1" />
          </View>
          <View style={[s.tripleItem, { backgroundColor: '#fff', borderColor: '#6366F1' }]}>
            <Ionicons name="trending-down-outline" size={14} color="#8B5CF6" />
            <Text style={[s.tripleVal, { color: '#8B5CF6', fontSize: 15 }]}>{cfg?.commission}%</Text>
            <Text style={[s.tripleSub, { color: '#6B7280' }]}>commission</Text>
          </View>
          <View style={[s.tripleItem, { backgroundColor: '#fff', borderColor: '#6366F1' }]}>
            <Ionicons name="time-outline" size={14} color="#10B981" />
            <Text style={[s.tripleVal, { color: '#10B981', fontSize: 15 }]}>{days}j</Text>
            <Text style={[s.tripleSub, { color: '#6B7280' }]}>restants</Text>
          </View>
        </View>
        {queuedSubs.length > 0 && <QueueMini subs={queuedSubs} colors={colors} />}
        <View style={[s.infoBox, { backgroundColor: '#EDE9FE', borderColor: '#C4B5FD' }]}>
          <Text style={[s.infoBoxTitle, { color: '#3730A3' }]}>Profitez de votre essai gratuit !</Text>
          {['Toutes les fonctionnalités incluses', 'Paiements mobile money activés', 'Renouvellement possible avant expiration', 'Vos données seront conservées'].map((t, i) => (
            <Text key={i} style={[s.infoBoxLine, { color: '#4338CA' }]}>✓ {t}</Text>
          ))}
        </View>
      </View>
    );
  }

  if (status === 'active') {
    const days = daysLeft(activeSub?.endDate);
    const soon = days <= 10;
    return (
      <View style={[s.statusCard, {
        backgroundColor: soon ? '#FFF7ED' : '#ECFDF5',
        borderColor: soon ? '#F97316' : '#10B981',
      }]}>
        <View style={s.statusCardHeader}>
          <View style={[s.statusIcon, { backgroundColor: soon ? '#F97316' : '#10B981' }]}>
            <Ionicons name={soon ? 'warning-outline' : 'checkmark-circle-outline'} size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusTitle, { color: soon ? '#9A3412' : '#065F46' }]}>Abonnement {planName}</Text>
            <Text style={[s.statusSub, { color: soon ? '#EA580C' : '#10B981' }]}>
              {soon ? `⚠️ Expire dans ${days} jours` : `✅ Actif — ${days} jours restants`}
            </Text>
            <Text style={[s.statusDate, { color: soon ? '#EA580C' : '#10B981' }]}>
              Fin : {fmtDate(activeSub?.endDate)}
            </Text>
          </View>
        </View>
        <View style={s.tripleGrid}>
          <View style={[s.tripleItem, { backgroundColor: '#fff', borderColor: soon ? '#F97316' : '#10B981' }]}>
            <Ionicons name="cube-outline" size={14} color={meta.color} />
            <Text style={[s.tripleVal, { color: meta.color, fontSize: 15 }]}>
              {productCount}{cfg?.productLimit !== -1 ? `/${cfg?.productLimit}` : ''}
            </Text>
            <Text style={[s.tripleSub, { color: '#6B7280' }]}>produits</Text>
            <UsageBar current={productCount} limit={cfg?.productLimit} color={meta.color} />
          </View>
          <View style={[s.tripleItem, { backgroundColor: '#fff', borderColor: soon ? '#F97316' : '#10B981' }]}>
            <Ionicons name="trending-down-outline" size={14} color={meta.color} />
            <Text style={[s.tripleVal, { color: meta.color, fontSize: 15 }]}>{cfg?.commission}%</Text>
            <Text style={[s.tripleSub, { color: '#6B7280' }]}>commission</Text>
          </View>
          <View style={[s.tripleItem, { backgroundColor: '#fff', borderColor: soon ? '#F97316' : '#10B981' }]}>
            <Ionicons name={cfg?.features?.pos ? 'storefront-outline' : 'close-circle-outline'} size={14}
              color={cfg?.features?.pos ? '#10B981' : '#9CA3AF'} />
            <Text style={[s.tripleVal, { color: cfg?.features?.pos ? '#10B981' : '#9CA3AF', fontSize: 12 }]}>
              {cfg?.features?.pos ? 'Inclus' : 'Non'}
            </Text>
            <Text style={[s.tripleSub, { color: '#6B7280' }]}>POS</Text>
          </View>
        </View>
        {queuedSubs.length > 0 && <QueueMini subs={queuedSubs} colors={colors} />}
        {soon && (
          <View style={[s.infoBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
            <Text style={[s.infoBoxTitle, { color: '#9A3412' }]}>🔔 Renouvellement recommandé</Text>
            <Text style={[s.infoBoxLine, { color: '#C2410C' }]}>Renouvelez maintenant pour éviter toute interruption de service.</Text>
          </View>
        )}
        {/* Bannière POS upgrade Starter */}
        {planName === 'Starter' && (
          <View style={[s.posBanner, { backgroundColor: '#F0FDF4', borderColor: '#A7F3D0' }]}>
            <Ionicons name="storefront-outline" size={16} color="#059669" />
            <View style={{ flex: 1 }}>
              <Text style={[s.posBannerTitle, { color: '#065F46' }]}>Activez la Caisse POS avec le plan Pro</Text>
              <Text style={[s.posBannerSub, { color: '#047857' }]}>
                Plan Pro (5 000 ₣/mois) — caisse physique avec 0% de commission sur vos ventes en boutique.
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (status === 'grace_period') {
    const match = statusInfo?.message?.match(/(\d+)\s+jours?/);
    const graceDays = match ? parseInt(match[1], 10) : null;
    return (
      <View style={[s.statusCard, { backgroundColor: '#FEF2F2', borderColor: '#EF4444', borderWidth: 2 }]}>
        <View style={s.statusCardHeader}>
          <View style={[s.statusIcon, { backgroundColor: '#EF4444' }]}>
            <Ionicons name="time-outline" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.statusTitle, { color: '#7F1D1D' }]}>Période de Grâce</Text>
            <Text style={[s.statusSub, { color: '#EF4444' }]}>
              ⏰ Suspension dans {graceDays ?? '?'} jour{graceDays > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <View style={[s.infoBox, { backgroundColor: '#fff', borderColor: '#FECACA' }]}>
          {[
            { icon: 'alert-circle-outline', text: '🚨 Votre abonnement a expiré' },
            { icon: 'time-outline',         text: statusInfo?.message || 'Période de grâce en cours' },
            { icon: 'card-outline',         text: '💳 Renouvelez maintenant pour conserver l\'accès' },
            { icon: 'save-outline',         text: '💾 Toutes vos données seront conservées' },
          ].map((item, i) => (
            <View key={i} style={s.infoBoxRow}>
              <Ionicons name={item.icon} size={14} color="#EF4444" />
              <Text style={[s.infoBoxLine, { color: '#7F1D1D' }]}>{item.text}</Text>
            </View>
          ))}
        </View>
        <View style={[s.warnBanner, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
          <Text style={[s.warnBannerText, { color: '#7F1D1D' }]}>
            Après {graceDays ?? '?'} jour(s), votre compte sera suspendu et nécessitera une réactivation manuelle.
          </Text>
        </View>
      </View>
    );
  }

  if (status === 'suspended') {
    return null; // géré dans SuspendedCard plus bas
  }

  return null;
}

// ─── Mini file d'attente dans status card ─────────────────────────────────────
function QueueMini({ subs, colors }) {
  const visible = subs.filter(s => !['cancelled','rejected'].includes(s.status));
  if (!visible.length) return null;
  return (
    <View style={[s.queueMini, { borderColor: colors.primary + '40', backgroundColor: colors.bg }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <Ionicons name="layers-outline" size={13} color={colors.primary} />
        <Text style={[s.queueMiniTitle, { color: colors.text }]}>Abonnements programmés</Text>
      </View>
      {visible.slice(0, 2).map((sub, i) => (
        <View key={i} style={s.queueMiniRow}>
          <View style={[s.queueMiniNum, { backgroundColor: colors.primary }]}>
            <Text style={s.queueMiniNumText}>{i + 1}</Text>
          </View>
          <Text style={[s.queueMiniPlan, { color: colors.text }]}>Plan {sub.planType}</Text>
          <ReqBadge status={sub.status} />
        </View>
      ))}
    </View>
  );
}

// ─── Carte compte suspendu (avec input code) ──────────────────────────────────
function SuspendedCard({ code, setCode, onActivate, loading, isOffline, colors }) {
  return (
    <View style={[s.statusCard, { backgroundColor: '#FEF2F2', borderColor: '#EF4444', borderWidth: 2 }]}>
      <View style={s.statusCardHeader}>
        <View style={[s.statusIcon, { backgroundColor: '#EF4444' }]}>
          <Ionicons name="close-circle-outline" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.statusTitle, { color: '#7F1D1D' }]}>Compte Suspendu</Text>
          <Text style={[s.statusSub, { color: '#EF4444' }]}>Abonnement expiré — Réactivation requise</Text>
        </View>
      </View>
      <View style={[s.infoBox, { backgroundColor: '#fff', borderColor: '#FECACA' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Ionicons name="flash-outline" size={15} color="#EF4444" />
          <Text style={[s.infoBoxTitle, { color: '#7F1D1D' }]}>Réactivation avec Code Admin</Text>
        </View>
        <Text style={[s.inputLabel, { color: '#374151' }]}>Code de Réactivation</Text>
        <TextInput
          style={[s.codeInput, { borderColor: code.length === 8 ? '#10B981' : '#FECACA' }]}
          placeholder="Code reçu de l'administration"
          placeholderTextColor="#9CA3AF"
          value={code}
          onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}
          autoCapitalize="characters"
          maxLength={8}
        />
        <TouchableOpacity
          style={[s.bigBtn, { backgroundColor: '#EF4444', opacity: (loading || isOffline || code.length !== 8) ? 0.5 : 1 }]}
          onPress={onActivate}
          disabled={loading || isOffline || code.length !== 8}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Ionicons name="checkmark-circle-outline" size={16} color="#fff" /><Text style={s.bigBtnText}>Réactiver le Compte</Text></>
          }
        </TouchableOpacity>
        <View style={[s.helpBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
          <Text style={[s.helpText, { color: '#7F1D1D' }]}>
            📞 Besoin d'aide ? Contactez l'administration pour obtenir votre code de réactivation.
          </Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAROUSEL DE PLANS — swipe horizontal + dots
// ═══════════════════════════════════════════════════════════════════════════════
function PlansCarousel({
  plans, billingCycle, setBillingCycle,
  selectedPlan, setSelectedPlan,
  activePlanType, upgradeOnly, isTrialMode,
  productCount,
  colors,
}) {
  const flatRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Plans visibles selon la logique web
  const visiblePlans = plans || [];

  const onScroll = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / ITEM_W);
    setActiveIdx(idx);
  }, []);

  const scrollTo = (idx) => {
    flatRef.current?.scrollToIndex({ index: idx, animated: true });
    setActiveIdx(idx);
  };

  const renderPlan = ({ item: plan }) => {
    const cfg    = SUBSCRIPTION_CONFIG.getPlan(plan.name);
    const meta   = PLAN_META[plan.name] || PLAN_META.Starter;
    const isSelected = selectedPlan?.name === plan.name;
    const isCurrent  = plan.name === activePlanType;
    const price = billingCycle === 'annual'
      ? (plan.pricing?.annual  || cfg?.pricing?.annual  || 0)
      : (plan.pricing?.monthly || cfg?.pricing?.monthly || 0);
    const savings = SUBSCRIPTION_CONFIG.calculateAnnualSavings(plan.name);
    const features = SUBSCRIPTION_CONFIG.generateFeatureList(plan.name, billingCycle);

    // Désactiver si l'usage actuel dépasse la limite du plan
    const maxProducts = plan.features?.productManagement?.maxProducts
      ?? plan.productLimit
      ?? cfg?.productLimit
      ?? -1;
    const isProductIncompatible = maxProducts !== -1 && productCount > maxProducts;
    const isLowerPlan = upgradeOnly && planRank(plan.name) < planRank(activePlanType);
    const isPlanDisabled = isProductIncompatible || isCurrent || isLowerPlan;

    return (
      <View style={{ width: ITEM_W, alignItems: 'center', paddingVertical: 4 }}>
      <TouchableOpacity
        activeOpacity={isPlanDisabled ? 1 : 0.92}
        style={[
          s.planCard,
          isCurrent
            ? { width: CARD_W, borderColor: colors.primary, borderWidth: 2, opacity: 0.65 }
            : isLowerPlan
              ? { width: CARD_W, borderColor: colors.border, borderWidth: 1, opacity: 0.45 }
              : isProductIncompatible
                ? { width: CARD_W, borderColor: '#FED7AA', borderWidth: 1, opacity: 0.7 }
                : { width: CARD_W, borderColor: isSelected ? meta.color : colors.border, borderWidth: isSelected ? 2 : 1 },
        ]}
        onPress={() => !isPlanDisabled && setSelectedPlan(isSelected ? null : plan)}
      >
        {/* Badges */}
        {meta.popular && !isCurrent && !isLowerPlan && (
          <View style={[s.popularBadge, { backgroundColor: meta.color }]}>
            <Text style={s.badgeText}>⭐ Populaire</Text>
          </View>
        )}
        {isCurrent && (
          <View style={[s.currentBadge, { backgroundColor: colors.primary }]}>
            <Text style={s.badgeText}>Plan actuel</Text>
          </View>
        )}
        {isLowerPlan && (
          <View style={[s.currentBadge, { backgroundColor: '#9CA3AF' }]}>
            <Text style={s.badgeText}>Plan inférieur</Text>
          </View>
        )}

        {/* Header coloré */}
        <View style={[s.planCardTop, { backgroundColor: meta.color }]}>
          <View style={[s.planIconWrap, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={22} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.planCardName}>{plan.name}</Text>
            <Text style={s.planCardDesc} numberOfLines={2}>{plan.description || cfg?.description}</Text>
          </View>
          <View style={[s.radioCircle, { borderColor: isSelected ? '#fff' : 'rgba(255,255,255,0.5)' }]}>
            {isSelected && <View style={s.radioDot} />}
          </View>
        </View>

        {/* Prix */}
        <View style={s.planPriceRow}>
          <Text style={[s.planPrice, { color: meta.color }]}>{fmtPrice(price)}</Text>
          <Text style={[s.planPricePer, { color: colors.textMuted }]}>/{billingCycle === 'annual' ? 'an' : 'mois'}</Text>
          {billingCycle === 'annual' && savings > 0 && (
            <View style={[s.discountChip, { backgroundColor: meta.bg }]}>
              <Text style={[s.discountChipText, { color: meta.color }]}>-10%</Text>
            </View>
          )}
        </View>
        {billingCycle === 'annual' && savings > 0 && (
          <Text style={[s.savingsText, { color: '#10B981' }]}>Économisez {fmtPrice(savings)}/an</Text>
        )}

        {/* Essai gratuit */}
        {isTrialMode && (cfg?.pricing?.trialMonths || 0) > 0 && (
          <View style={[s.trialChip, { backgroundColor: meta.bg, borderColor: meta.color + '50' }]}>
            <Ionicons name="gift-outline" size={13} color={meta.color} />
            <Text style={[s.trialChipText, { color: meta.color }]}>
              {cfg.pricing.trialMonths} mois d'essai gratuit
            </Text>
          </View>
        )}

        {/* Features */}
        <View style={s.featureList}>
          {features.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Ionicons
                name={f.included ? (f.highlight ? 'star' : 'checkmark-circle') : 'close-circle-outline'}
                size={14}
                color={f.included ? (f.highlight ? meta.color : '#10B981') : '#D1D5DB'}
              />
              <Text style={[
                s.featureText,
                { color: f.included ? (f.highlight ? meta.color : colors.text) : colors.textMuted },
                f.highlight && { fontWeight: '700' },
                !f.included && { textDecorationLine: 'line-through' },
              ]}>
                {f.name}
              </Text>
            </View>
          ))}
        </View>

        {isCurrent && (
          <View style={[s.alertBox, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7', marginTop: 8 }]}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
            <Text style={[s.alertText, { color: '#065F46', textAlign: 'center' }]}>Votre plan actuel</Text>
          </View>
        )}
        {isLowerPlan && (
          <View style={[s.alertBox, { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', marginTop: 8 }]}>
            <Ionicons name="arrow-down-outline" size={14} color="#9CA3AF" />
            <Text style={[s.alertText, { color: '#6B7280' }]}>Plan inférieur à votre abonnement actuel</Text>
          </View>
        )}
        {isProductIncompatible && !isCurrent && !isLowerPlan && (
          <View style={[s.alertBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', marginTop: 8 }]}>
            <Ionicons name="warning-outline" size={14} color="#D97706" />
            <Text style={[s.alertText, { color: '#92400E' }]}>
              Incompatible — vous avez {productCount} produits, ce plan est limité à {maxProducts}.
            </Text>
          </View>
        )}
      </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      {/* Header */}
      <View style={[s.plansHeader, {
        backgroundColor: upgradeOnly ? colors.primary : isTrialMode ? '#10B981' : colors.primary,
      }]}>
        <Text style={s.plansHeaderTitle}>
          {isTrialMode ? '🎁 Choisissez votre plan de départ' : upgradeOnly ? '⚡ Passer à un plan supérieur' : 'Choisissez Votre Plan'}
        </Text>
        <Text style={s.plansHeaderSub}>
          {isTrialMode
            ? 'Démarrez gratuitement — Starter (2 mois) ou Pro/Business (1 mois). Aucun paiement requis.'
            : upgradeOnly
              ? `Votre activité grandit — débloquez de nouvelles capacités dès aujourd'hui.`
              : 'Faites glisser pour explorer tous les plans'}
        </Text>
      </View>

      {/* Toggle cycle mensuel / annuel */}
      {!isTrialMode && (
        <View style={[s.cycleToggle, { backgroundColor: colors.bg, borderColor: colors.border, margin: 12, marginBottom: 0 }]}>
          {[['monthly','Mensuel'],['annual','Annuel  (-10%)']].map(([val, lbl]) => (
            <TouchableOpacity
              key={val}
              style={[s.cycleBtn, billingCycle === val && { backgroundColor: colors.primary }]}
              onPress={() => setBillingCycle(val)}
              activeOpacity={0.8}
            >
              <Text style={[s.cycleBtnText, { color: billingCycle === val ? '#fff' : colors.textMuted }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Carousel */}
      <FlatList
        ref={flatRef}
        data={visiblePlans}
        renderItem={renderPlan}
        keyExtractor={p => p.name}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_W}
        snapToAlignment="start"
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ width: CONTAINER_W }}
        contentContainerStyle={{ paddingVertical: 8 }}
        getItemLayout={(_, idx) => ({ length: ITEM_W, offset: ITEM_W * idx, index: idx })}
        onLayout={() => {
          if (upgradeOnly && activePlanType) {
            const firstSelectableIdx = visiblePlans.findIndex(
              p => planRank(p.name) > planRank(activePlanType)
            );
            if (firstSelectableIdx > 0) {
              flatRef.current?.scrollToIndex({ index: firstSelectableIdx, animated: false });
              setActiveIdx(firstSelectableIdx);
            }
          }
        }}
      />

      {/* Dots */}
      {visiblePlans.length > 1 && (
        <View style={s.dotsRow}>
          {visiblePlans.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => scrollTo(i)} activeOpacity={0.7}>
              <View style={[
                s.dot,
                { backgroundColor: i === activeIdx ? colors.primary : colors.border },
                i === activeIdx && { width: 18 },
              ]} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANNEAU D'ACTION (après sélection d'un plan)
// ═══════════════════════════════════════════════════════════════════════════════
function ActionPanel({
  selectedPlan, activePlanType, isTrialMode, upgradeOnly,
  billingCycle, paymentMethod, setPaymentMethod,
  upgradeMode, setUpgradeMode,
  onSubmit, submitting, isOffline, statusInfo,
  productCount,
  colors,
}) {
  if (!selectedPlan) return null;

  const cfg      = SUBSCRIPTION_CONFIG.getPlan(selectedPlan.name);
  const meta     = PLAN_META[selectedPlan.name] || PLAN_META.Starter;
  const isUpgrade = activePlanType && planRank(selectedPlan.name) > planRank(activePlanType);

  const maxProducts = selectedPlan.features?.productManagement?.maxProducts
    ?? selectedPlan.productLimit
    ?? cfg?.productLimit
    ?? -1;
  const isIncompatible = maxProducts !== -1 && (productCount || 0) > maxProducts;
  const urgent   = !!statusInfo?.urgent;
  const price    = billingCycle === 'annual'
    ? (selectedPlan.pricing?.annual  || cfg?.pricing?.annual  || 0)
    : (selectedPlan.pricing?.monthly || cfg?.pricing?.monthly || 0);

  const pmList = Object.entries(SUBSCRIPTION_CONFIG.PAYMENT_METHODS)
    .filter(([, v]) => v.active)
    .map(([key, v]) => ({ key, ...v }));

  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={{ padding: 14, gap: 12 }}>
        <Text style={[s.cardTitle, { color: colors.text }]}>
          Plan sélectionné : <Text style={{ color: meta.color }}>{selectedPlan.name}</Text>
        </Text>

        {/* Mode essai */}
        {isTrialMode && (
          <View style={[s.trialActionBox, { borderColor: meta.color }]}>
            <View style={[s.trialActionTop, { backgroundColor: meta.bg }]}>
              <Ionicons name="gift-outline" size={20} color={meta.color} />
              <View style={{ flex: 1 }}>
                <Text style={[s.trialActionTitle, { color: meta.color }]}>
                  {cfg?.pricing?.trialMonths || 1} mois d'essai gratuit — {selectedPlan.name}
                </Text>
                <Text style={[s.trialActionSub, { color: colors.textMuted }]}>
                  Aucune carte bancaire requise. Vous serez notifié avant la fin de l'essai.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[s.bigBtn, { backgroundColor: meta.color, margin: 12, opacity: (submitting || isOffline) ? 0.5 : 1 }]}
              onPress={onSubmit}
              disabled={submitting || isOffline}
              activeOpacity={0.8}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="gift-outline" size={16} color="#fff" /><Text style={s.bigBtnText}>🎁 Démarrer mon essai gratuit {selectedPlan.name}</Text></>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Mode paiement */}
        {!isTrialMode && (
          <>
            {/* Upgrade mode */}
            {isUpgrade && (
              <View style={[s.upgradeBox, { borderColor: meta.color }]}>
                <View style={[s.upgradeBoxTop, { backgroundColor: meta.color }]}>
                  <Ionicons name="flash-outline" size={13} color="#fff" />
                  <Text style={s.upgradeBoxTopText}>🚀 Passez au niveau supérieur !</Text>
                  <View style={s.upgradeTag}>
                    <Text style={s.upgradeTagText}>{activePlanType} → {selectedPlan.name}</Text>
                  </View>
                </View>
                {[
                  { val: 'immediate', title: `⚡ Accéder au plan ${selectedPlan.name} maintenant`, desc: `Profitez immédiatement de toutes les nouvelles fonctionnalités. Votre plan ${activePlanType} est remplacé dès validation.\n⚠️ Les jours restants du plan ${activePlanType} ne sont pas remboursés.` },
                  ...(!upgradeOnly ? [{ val: 'scheduled', title: '🗓️ Planifier après mon plan actuel', desc: `Plan ${activePlanType} continue jusqu\'au dernier jour. Le ${selectedPlan.name} démarre automatiquement à l\'expiration.\n✓ Rentabilisez chaque jour de votre abonnement actuel.` }] : []),
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.val}
                    style={[s.upgradeModeRow, upgradeMode === opt.val && { backgroundColor: meta.color + '12' }]}
                    onPress={() => setUpgradeMode(opt.val)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.radioCircle2, { borderColor: upgradeMode === opt.val ? meta.color : colors.border }]}>
                      {upgradeMode === opt.val && <View style={[s.radioDot2, { backgroundColor: meta.color }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.upgradeModeTitle, { color: colors.text }]}>{opt.title}</Text>
                      <Text style={[s.upgradeModeDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Méthodes de paiement */}
            <Text style={[s.pmLabel, { color: colors.textMuted }]}>Méthode de paiement</Text>
            <View style={s.pmGrid}>
              {pmList.map(pm => (
                <TouchableOpacity
                  key={pm.key}
                  style={[s.pmCard, {
                    backgroundColor: colors.bg,
                    borderColor: paymentMethod === pm.key ? meta.color : colors.border,
                    borderWidth: paymentMethod === pm.key ? 2 : 1,
                  }]}
                  onPress={() => setPaymentMethod(pm.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="phone-portrait-outline" size={18} color={meta.color} />
                  <Text style={[s.pmCardLabel, { color: colors.text }]}>{pm.name.replace('iHambaObab ', '')}</Text>
                  <Text style={[s.pmCardPhone, { color: colors.textMuted }]}>{pm.phone}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Infos virement */}
            {(() => {
              const pm = pmList.find(m => m.key === paymentMethod);
              return pm ? (
                <View style={[s.transferInfo, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                  <Text style={[s.transferInfoText, { color: colors.textMuted }]}>
                    Envoyez {fmtPrice(price)} au {pm.name.replace('iHambaObab ','')} · {pm.phone}
                  </Text>
                </View>
              ) : null;
            })()}

            {isIncompatible ? (
              <View style={[s.alertBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                <Ionicons name="warning-outline" size={14} color="#D97706" />
                <Text style={[s.alertText, { color: '#92400E' }]}>
                  Vous avez {productCount} produits actifs et ce plan en inclut {maxProducts}. Choisissez un plan supérieur adapté à votre catalogue.
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.bigBtn, {
                  backgroundColor: urgent ? '#EF4444' : meta.color,
                  opacity: (submitting || isOffline) ? 0.5 : 1,
                }]}
                onPress={onSubmit}
                disabled={submitting || isOffline}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="card-outline" size={16} color="#fff" />
                      <Text style={s.bigBtnText}>
                        {isUpgrade && upgradeMode === 'immediate' ? '⚡ Upgrader maintenant' : urgent ? '🚨 Demande Urgente' : 'Créer la Demande'}
                      </Text>
                    </>
                }
              </TouchableOpacity>
            )}

            {urgent && !isIncompatible && (
              <View style={[s.urgentNote, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                <Text style={{ fontSize: 12, color: '#7F1D1D', textAlign: 'center', fontWeight: '600' }}>
                  ⚠️ Cette demande sera prioritaire pour éviter la suspension
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARTE REQUÊTE EN ATTENTE
// ═══════════════════════════════════════════════════════════════════════════════
function PendingRequestCard({
  request, showProof, onToggleProof,
  transferCode, setTransferCode, senderPhone, setSenderPhone,
  receipt, setReceipt, onSubmitProof, onCancelRequest,
  onNewRequest, onReconnect, onDismiss,
  submitting, isOffline, colors,
}) {
  const canSubmitFirst = request.status === 'pending_payment';
  const canModify      = request.status === 'payment_submitted';
  const isRejected     = request.status === 'rejected';
  const isVerified     = request.status === 'payment_verified';
  const canCancel      = ['pending_payment','payment_submitted'].includes(request.status);
  const canShowForm    = canSubmitFirst || canModify;

  const pd = request.paymentDetails;

  const pickReceipt = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: 'Permission refusée' }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) setReceipt(result.assets[0]);
  };

  // ── Cas payment_verified : carte dédiée ──────────────────────────────────
  if (isVerified) {
    return (
      <View style={[s.card, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7', borderWidth: 2 }]}>
        <View style={{ alignItems: 'center', paddingVertical: 12, gap: 8 }}>
          <Ionicons name="checkmark-circle" size={48} color="#10B981" />
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#065F46' }}>Paiement vérifié !</Text>
          <Text style={{ fontSize: 13, color: '#047857', textAlign: 'center', paddingHorizontal: 8 }}>
            Votre paiement a été validé par l'administration.{'\n'}Reconnectez-vous pour accéder à votre boutique.
          </Text>
        </View>
        <TouchableOpacity
          style={[s.proofBtn, { backgroundColor: '#10B981', marginTop: 4 }]}
          onPress={onReconnect}
          activeOpacity={0.8}
        >
          <Ionicons name="log-in-outline" size={16} color="#fff" />
          <Text style={s.proofBtnText}>Se reconnecter</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Cas rejected : carte dédiée ──────────────────────────────────────────
  if (isRejected) {
    return (
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: '#FECACA', borderWidth: 2 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Ionicons name="close-circle" size={22} color="#EF4444" />
          <Text style={[s.cardTitle, { color: '#DC2626', marginBottom: 0, flex: 1 }]}>Demande rejetée</Text>
          {onDismiss && (
            <TouchableOpacity onPress={onDismiss} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <View style={[s.reqRow, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.reqPlan, { color: colors.text }]}>
              Plan {request.planType}{request.billingCycle ? ` — ${request.billingCycle === 'annual' ? 'Annuel' : 'Mensuel'}` : ''}
            </Text>
            <Text style={[s.reqDate, { color: colors.textMuted }]}>Créée le {fmtDate(request.createdAt)}</Text>
          </View>
          <ReqBadge status="rejected" />
        </View>
        {pd?.rejectionReason ? (
          <View style={[s.alertBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', marginTop: 8 }]}>
            <Ionicons name="information-circle-outline" size={14} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={[s.alertText, { color: '#7F1D1D', fontWeight: '700' }]}>Motif du rejet</Text>
              <Text style={[s.alertText, { color: '#B91C1C', marginTop: 2 }]}>{pd.rejectionReason}</Text>
            </View>
          </View>
        ) : (
          <View style={[s.alertBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', marginTop: 8 }]}>
            <Ionicons name="information-circle-outline" size={14} color="#EF4444" />
            <Text style={[s.alertText, { color: '#7F1D1D' }]}>Paiement non conforme. Contactez le support si nécessaire.</Text>
          </View>
        )}
        <TouchableOpacity
          style={[s.proofBtn, { backgroundColor: colors.primary, marginTop: 12, opacity: isOffline ? 0.5 : 1 }]}
          onPress={onNewRequest}
          disabled={isOffline}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={14} color="#fff" />
          <Text style={s.proofBtnText}>Faire une nouvelle demande</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Cas normal : pending_payment / payment_submitted ─────────────────────
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Text style={[s.cardTitle, { color: colors.text }]}>Demande en cours</Text>

      <View style={[s.reqRow, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.reqPlan, { color: colors.text }]}>
            Plan {request.planType} — {request.billingCycle === 'annual' ? 'Annuel' : 'Mensuel'}
          </Text>
          <Text style={[s.reqDate, { color: colors.textMuted }]}>Créée le {fmtDate(request.createdAt)}</Text>
          {request.estimatedStartDate && (
            <Text style={[s.reqDate, { color: colors.textMuted }]}>Démarrage prévu : {fmtDate(request.estimatedStartDate)}</Text>
          )}
        </View>
        <ReqBadge status={request.status} />
      </View>

      {/* En attente de paiement */}
      {canSubmitFirst && (
        <View style={[s.alertBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
          <Ionicons name="time-outline" size={14} color="#D97706" />
          <Text style={[s.alertText, { color: '#92400E' }]}>
            Effectuez le virement puis soumettez votre preuve de paiement.
          </Text>
        </View>
      )}

      {/* Instructions de paiement */}
      {canSubmitFirst && pd?.recipientPhone && (
        <View style={s.payInstr}>
          {/* Header */}
          <View style={s.payInstrHeader}>
            <Ionicons name="receipt-outline" size={16} color="#fff" />
            <Text style={s.payInstrHeaderText}>Instructions de Paiement</Text>
          </View>

          {/* Montant — élément principal */}
          <View style={s.payInstrAmount}>
            <Text style={s.payInstrAmountLabel}>Montant à envoyer</Text>
            <Text style={s.payInstrAmountValue}>{pd.amount?.toLocaleString()} FCFA</Text>
          </View>

          {/* Détails */}
          <View style={s.payInstrDetails}>
            <View style={s.payInstrRow}>
              <View style={s.payInstrIconWrap}>
                <Ionicons name="call-outline" size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.payInstrRowLabel}>Numéro destinataire</Text>
                <Text style={s.payInstrRowValue}>{pd.recipientPhone}</Text>
              </View>
            </View>

            <View style={[s.payInstrRow, { borderBottomWidth: 0 }]}>
              <View style={s.payInstrIconWrap}>
                <Ionicons name="phone-portrait-outline" size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.payInstrRowLabel}>Méthode de paiement</Text>
                <Text style={s.payInstrRowValue}>{pd.method?.replace(/_/g, ' ').toUpperCase()}</Text>
              </View>
            </View>
          </View>

          {/* Hint */}
          <View style={s.payInstrHint}>
            <Text style={s.payInstrHintText}>
              💡 Envoyez le montant au numéro ci-dessus, puis soumettez votre preuve de paiement.
            </Text>
          </View>
        </View>
      )}

      {/* Preuve soumise → résumé */}
      {canModify && !showProof && (
        <View style={[s.alertBox, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE', alignItems: 'flex-start' }]}>
          <Ionicons name="checkmark-circle-outline" size={14} color="#6366F1" style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[s.alertText, { color: '#3730A3', fontWeight: '700' }]}>
              Preuve soumise — en attente de vérification (24-48h)
            </Text>
            {pd?.transferCode ? (
              <Text style={[s.alertText, { color: '#4338CA', marginTop: 4 }]}>
                Code : {pd.transferCode}{pd.senderPhone ? `  ·  ${pd.senderPhone}` : ''}
              </Text>
            ) : null}
            {pd?.receiptUrl ? (
              <View style={{ marginTop: 8 }}>
                <Image
                  source={{ uri: pd.receiptUrl }}
                  style={{ width: '100%', height: 140, borderRadius: 8, resizeMode: 'cover' }}
                />
                <Text style={[s.alertText, { color: '#6366F1', marginTop: 4, fontSize: 11 }]}>Reçu soumis</Text>
              </View>
            ) : (
              <Text style={[s.alertText, { color: '#818CF8', marginTop: 4, fontSize: 11 }]}>Aucun reçu joint</Text>
            )}
          </View>
        </View>
      )}

      <View style={s.reqActions}>
        {canSubmitFirst && !showProof && (
          <TouchableOpacity
            style={[s.proofBtn, { backgroundColor: colors.primary, opacity: isOffline ? 0.5 : 1 }]}
            onPress={() => onToggleProof(true)}
            disabled={isOffline}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
            <Text style={s.proofBtnText}>Soumettre la preuve de paiement</Text>
          </TouchableOpacity>
        )}
        {canModify && !showProof && (
          <TouchableOpacity
            style={[s.proofBtn, { backgroundColor: '#6366F1', opacity: isOffline ? 0.5 : 1 }]}
            onPress={() => onToggleProof(true)}
            disabled={isOffline}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={14} color="#fff" />
            <Text style={s.proofBtnText}>Modifier la preuve</Text>
          </TouchableOpacity>
        )}
        {canCancel && (
          <TouchableOpacity
            style={[s.cancelBtn, { borderColor: '#EF4444' }]}
            onPress={onCancelRequest}
            disabled={isOffline}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={13} color="#EF4444" />
            <Text style={[s.cancelBtnText, { color: '#EF4444' }]}>Annuler</Text>
          </TouchableOpacity>
        )}
      </View>

      {showProof && canShowForm && (
        <View style={[s.proofForm, { borderTopColor: colors.border }]}>
          <Text style={[s.proofFormTitle, { color: colors.text }]}>
            {canModify ? 'Modifier la preuve de paiement' : 'Preuve de paiement'}
          </Text>
          <Text style={[s.proofFormSub, { color: colors.textMuted }]}>
            {canModify
              ? 'Corrigez les informations si nécessaire puis renvoyez.'
              : 'Effectuez le virement puis renseignez les informations ci-dessous.'}
          </Text>
          <Text style={[s.inputLabel, { color: colors.textSub }]}>Code de transfert *</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
            placeholder="Ex: TRF123456789"
            placeholderTextColor={colors.textMuted}
            value={transferCode}
            onChangeText={setTransferCode}
            autoCapitalize="characters"
          />
          <Text style={[s.inputLabel, { color: colors.textSub }]}>Téléphone expéditeur (optionnel)</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
            placeholder="+227 XX XX XX XX"
            placeholderTextColor={colors.textMuted}
            value={senderPhone}
            onChangeText={setSenderPhone}
            keyboardType="phone-pad"
          />
          <Text style={[s.inputLabel, { color: colors.textSub }]}>Reçu / capture (optionnel)</Text>
          {!receipt && pd?.receiptUrl && (
            <View style={{ marginBottom: 8 }}>
              <Image
                source={{ uri: pd.receiptUrl }}
                style={{ width: '100%', height: 120, borderRadius: 8, resizeMode: 'cover' }}
              />
              <Text style={[s.alertText, { color: colors.textMuted, marginTop: 4, fontSize: 11 }]}>
                Reçu actuel — choisissez une image pour le remplacer
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[s.receiptPicker, { backgroundColor: colors.bg, borderColor: colors.border }]}
            onPress={pickReceipt}
            activeOpacity={0.7}
          >
            <Ionicons name={receipt ? 'image' : 'cloud-upload-outline'} size={17} color={colors.primary} />
            <Text style={[s.receiptPickerText, { color: receipt ? colors.primary : colors.textMuted }]}>
              {receipt ? (receipt.fileName || 'Image sélectionnée') : (pd?.receiptUrl ? "Remplacer l'image" : 'Choisir une image')}
            </Text>
          </TouchableOpacity>
          <View style={s.proofBtns}>
            <TouchableOpacity
              style={[s.proofCancelBtn, { borderColor: colors.border }]}
              onPress={() => onToggleProof(false)}
            >
              <Text style={[s.proofCancelText, { color: colors.textMuted }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.proofSubmitBtn, { backgroundColor: colors.primary, opacity: (submitting||isOffline) ? 0.5 : 1 }]}
              onPress={onSubmitProof}
              disabled={submitting || isOffline}
              activeOpacity={0.8}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.proofSubmitText}>Envoyer</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE D'ATTENTE COMPLÈTE
// ═══════════════════════════════════════════════════════════════════════════════
function QueueCard({ subs, colors }) {
  const visible = subs.filter(s => !['cancelled','rejected'].includes(s.status));
  if (!visible.length) return null;
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={[s.sectionHeader, { backgroundColor: colors.primary }]}>
        <Ionicons name="layers-outline" size={18} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.sectionHeaderTitle}>Abonnements Programmés</Text>
          <Text style={s.sectionHeaderSub}>Vos prochains abonnements démarreront automatiquement</Text>
        </View>
      </View>
      <View style={{ padding: 12, gap: 8 }}>
        {visible.map((sub, i) => (
          <View key={i} style={[s.queueFullRow, { backgroundColor: colors.bg, borderColor: colors.primary + '40' }]}>
            <View style={[s.queueFullNum, { backgroundColor: colors.primary }]}>
              <Text style={s.queueMiniNumText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.reqPlan, { color: colors.text }]}>Plan {sub.planType}</Text>
              {sub.estimatedStartDate && (
                <Text style={[s.reqDate, { color: colors.textMuted }]}>Démarrage : {fmtDate(sub.estimatedStartDate)}</Text>
              )}
            </View>
            <ReqBadge status={sub.status} />
          </View>
        ))}
        <View style={[s.queueNote, { backgroundColor: colors.bg, borderColor: colors.primary + '30' }]}>
          <Text style={[s.queueNoteText, { color: colors.textMuted }]}>
            💡 Transition automatique : vos abonnements se succèderont sans interruption une fois validés.
          </Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORIQUE
// ═══════════════════════════════════════════════════════════════════════════════
const HIST_META = {
  created:     { label: 'Abonnement créé',      icon: 'star-outline',            color: '#10B981' },
  renewed:     { label: 'Abonnement renouvelé', icon: 'refresh-outline',         color: '#30A08B' },
  activated:   { label: 'Abonnement activé',    icon: 'checkmark-circle-outline',color: '#10B981' },
  reactivated: { label: 'Compte réactivé',      icon: 'flash-outline',           color: '#14B8A6' },
  expired:     { label: 'Abonnement expiré',    icon: 'time-outline',            color: '#EF4444' },
  suspended:   { label: 'Compte suspendu',      icon: 'warning-outline',         color: '#F59E0B' },
};

const INIT_VISIBLE = 5;

function HistorySectionList({ title, items, renderItem, colors, initVisible = INIT_VISIBLE }) {
  const [visible, setVisible] = useState(initVisible);
  if (!items.length) return null;
  const shown = items.slice(0, visible);
  const hasMore = visible < items.length;
  const canCollapse = visible > initVisible;
  return (
    <View style={{ marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: 8 }}>
        <Text style={[s.histSection, { color: colors.textMuted, marginTop: 0, marginBottom: 0 }]}>{title}</Text>
        <Text style={{ fontSize: 11, color: colors.textMuted }}>{Math.min(visible, items.length)}/{items.length}</Text>
      </View>
      {shown.map((item, i) => renderItem(item, i))}
      {(hasMore || canCollapse) && (
        <TouchableOpacity
          onPress={() => setVisible(hasMore ? Math.min(visible + initVisible, items.length) : initVisible)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 4 }}
          activeOpacity={0.7}
        >
          <Ionicons name={hasMore ? 'chevron-down-outline' : 'chevron-up-outline'} size={14} color='#8B5CF6' />
          <Text style={{ fontSize: 12, color: '#8B5CF6', fontWeight: '600' }}>
            {hasMore ? `Voir ${Math.min(initVisible, items.length - visible)} de plus` : 'Réduire'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function HistoryCard({ history, paymentHistory = [], colors }) {
  const PAID_TYPES  = ['created','renewed','activated'];
  const paidEntries = history.filter(h => PAID_TYPES.includes(h.actionType));
  const sysEntries  = history.filter(h => !PAID_TYPES.includes(h.actionType));

  const activatedPayments = paymentHistory.filter(p => p.status === 'activated');
  const confirmedPayments = paymentHistory.filter(p => p.status === 'payment_verified' || p.status === 'activated');
  const totalPaid = activatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const sysActivations = history.filter(h => ['created','activated','renewed','reactivated'].includes(h.actionType));
  const nbAbonnements = activatedPayments.length > 0 ? activatedPayments.length : sysActivations.length;

  const sysConfirmed = history.filter(h => ['activated','reactivated'].includes(h.actionType));
  const nbConfirmed = confirmedPayments.length > 0 ? confirmedPayments.length : sysConfirmed.length;

  const oldest = history.map(h => h.createdAt).filter(Boolean).sort((a,b) => new Date(a)-new Date(b))[0];
  const tenure = oldest ? Math.max(0, Math.round((Date.now() - new Date(oldest)) / (1000*60*60*24*30))) : 0;

  if (!history.length && !paymentHistory.length) {
    return (
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
          <Ionicons name="time-outline" size={32} color={colors.textMuted} />
          <Text style={[s.emptyText, { color: colors.textMuted }]}>Aucun historique disponible</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={[s.sectionHeader, { backgroundColor: '#8B5CF6' }]}>
        <Ionicons name="document-text-outline" size={18} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.sectionHeaderTitle}>Historique des Abonnements</Text>
          <Text style={s.sectionHeaderSub}>Tous vos abonnements et transactions</Text>
        </View>
      </View>
      <View style={[s.histStats, { backgroundColor: '#F5F3FF', borderBottomColor: colors.border }]}>
        {[
          { val: nbAbonnements,       label: 'Abonnements' },
          { val: nbConfirmed,         label: 'Confirmés' },
          { val: `${tenure}m`,        label: 'Ancienneté' },
          { val: fmtPrice(totalPaid), label: 'Total payé', small: true },
        ].map((item, i) => (
          <View key={i} style={s.histStat}>
            <Text style={[s.histStatVal, { color: '#6D28D9', fontSize: item.small ? 10 : 16 }]}>{item.val}</Text>
            <Text style={[s.histStatLabel, { color: '#6B7280' }]}>{item.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ padding: 12, gap: 4 }}>
        <HistorySectionList
          title="Paiements"
          items={paymentHistory}
          colors={colors}
          initVisible={INIT_VISIBLE}
          renderItem={(p, i) => {
            const meta = REQ_STATUS_META[p.status] || { color: '#9CA3AF' };
            const icon = p.status === 'activated' ? 'checkmark-circle-outline' : p.status === 'rejected' ? 'close-circle-outline' : 'card-outline';
            return (
              <View key={i} style={[s.histItem, { borderLeftColor: meta.color, backgroundColor: meta.color + '12' }]}>
                <Ionicons name={icon} size={15} color={meta.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.histItemTitle, { color: colors.text }]}>Plan {p.planType} — {p.billingCycle === 'annual' ? 'Annuel' : 'Mensuel'}</Text>
                  <Text style={[s.histItemSub, { color: colors.textMuted }]}>{p.method?.replace('_', ' ')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.histItemDate, { color: colors.textMuted }]}>{fmtDate(p.date)}</Text>
                  {p.amount > 0 && <Text style={[s.histItemAmount, { color: '#10B981' }]}>{fmtPrice(p.amount)}</Text>}
                  <ReqBadge status={p.status} />
                </View>
              </View>
            );
          }}
        />
        <HistorySectionList
          title="Événements système"
          items={sysEntries}
          colors={colors}
          initVisible={INIT_VISIBLE}
          renderItem={(entry, i) => <HistoryItem key={entry._id || i} entry={entry} colors={colors} />}
        />
        <HistorySectionList
          title="Activations"
          items={paidEntries}
          colors={colors}
          initVisible={INIT_VISIBLE}
          renderItem={(entry, i) => <HistoryItem key={entry._id || i} entry={entry} colors={colors} />}
        />
      </View>
    </View>
  );
}

function HistoryItem({ entry, colors }) {
  const m         = HIST_META[entry.actionType] || { label: entry.actionType, icon: 'document-outline', color: '#9CA3AF' };
  const planLabel = entry?.actionDetails?.newPlan?.planType || entry?.actionDetails?.previousPlan?.planType || entry?.planType;
  return (
    <View style={[s.histItem, { borderLeftColor: m.color, backgroundColor: m.color + '12' }]}>
      <Ionicons name={m.icon} size={15} color={m.color} />
      <View style={{ flex: 1 }}>
        <Text style={[s.histItemTitle, { color: colors.text }]}>{m.label}</Text>
        {planLabel && <Text style={[s.histItemSub, { color: colors.textMuted }]}>Plan {planLabel}</Text>}
        {entry.actionDetails?.notes && <Text style={[s.histItemNote, { color: colors.textMuted }]}>{entry.actionDetails.notes}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.histItemDate, { color: colors.textMuted }]}>{fmtDate(entry.createdAt)}</Text>
        {entry.paymentInfo?.amount > 0 && (
          <Text style={[s.histItemAmount, { color: '#10B981' }]}>{fmtPrice(entry.paymentInfo.amount)}</Text>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ÉCRAN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function AbonnementScreen() {
  const { colors }                              = useTheme();
  const { seller, subscription, updateSubscription, token } = useAuthStore();
  const { isOffline }                           = useSync();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [subData, setSubData]                 = useState(null);
  const [availablePlans, setAvailablePlans]   = useState([]);
  const [paymentHistory, setPaymentHistory]   = useState([]);
  const [tab, setTab]                         = useState('historique');

  // Sélection plan
  const [selectedPlan, setSelectedPlan]       = useState(null);
  const [billingCycle, setBillingCycle]       = useState('monthly');
  const [paymentMethod, setPaymentMethod]     = useState('mynita');
  const [upgradeMode, setUpgradeMode]         = useState('scheduled');

  // Formulaire preuve
  const [showProof, setShowProof]             = useState(false);
  const [dismissedRejected, setDismissedRejected] = useState(false);
  const [transferCode, setTransferCode]       = useState('');
  const [senderPhone, setSenderPhone]         = useState('');
  const [receipt, setReceipt]                 = useState(null);
  const [submitting, setSubmitting]           = useState(false);

  // Réactivation
  const [reactivationCode, setReactivationCode] = useState('');
  const [reactivating, setReactivating]         = useState(false);

  const scrollRef    = useRef(null);
  const tabsYRef     = useRef(0);
  const isOfflineRef = useRef(isOffline);
  useEffect(() => { isOfflineRef.current = isOffline; }, [isOffline]);

  // Synchroniser l'onglet actif avec la disponibilité des plans
  useEffect(() => {
    if (!showPlans) setTab('historique');
    else setTab('plans');
  }, [showPlans]); // eslint-disable-line



  // ─── Détection expiration token resubscription ───────────────────────────────
  useEffect(() => {
    if (!token || !isResubToken(token)) return;
    if (isTokenExpired(token)) {
      useAuthStore.getState().forceLogout();
      Toast.show({ type: 'info', text1: 'Session expirée', text2: 'Reconnectez-vous pour continuer.', visibilityTime: 5000 });
      return;
    }
    // Programmer le logout exactement à l'expiration du token
    const exp = getTokenExp(token);
    if (exp) {
      const msLeft = exp * 1000 - Date.now();
      if (msLeft > 0) {
        const timer = setTimeout(async () => {
          await useAuthStore.getState().forceLogout();
          Toast.show({ type: 'info', text1: 'Session expirée', text2: 'Reconnectez-vous pour continuer.', visibilityTime: 5000 });
        }, msLeft);
        return () => clearTimeout(timer);
      }
    }
  }, [token]);

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (silent = false) => {
    if (isOfflineRef.current) return;
    // Vérifier l'expiration avant tout appel réseau (token resubscription = 1h)
    const currentToken = useAuthStore.getState().token;
    if (currentToken && isResubToken(currentToken) && isTokenExpired(currentToken)) {
      await useAuthStore.getState().forceLogout();
      Toast.show({ type: 'info', text1: 'Session expirée', text2: 'Reconnectez-vous pour continuer.', visibilityTime: 5000 });
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [statusRes, plansRes, payHistRes] = await Promise.allSettled([
        apiClient.get('/api/seller/subscription/complete-status', { timeout: TIMEOUTS.DEFAULT }),
        apiClient.get('/api/seller/subscription/available-plans',  { timeout: TIMEOUTS.DEFAULT }),
        apiClient.get('/api/seller/subscription/payment-history',  { timeout: TIMEOUTS.DEFAULT }),
      ]);

      // Si le token est expiré (401 sur l'une des requêtes protégées) → forceLogout
      const has401 = [statusRes, payHistRes].some(
        r => r.status === 'rejected' && r.reason?.response?.status === 401
      );
      if (has401) {
        await useAuthStore.getState().forceLogout();
        Toast.show({
          type: 'info',
          text1: 'Session expirée',
          text2: 'Reconnectez-vous pour continuer.',
          visibilityTime: 5000,
        });
        return;
      }

      if (statusRes.status === 'fulfilled' && statusRes.value.data?.status === 'success') {
        setSubData(statusRes.value.data.data);
        setDismissedRejected(false);
      }
      if (plansRes.status === 'fulfilled' && plansRes.value.data?.data?.plans)
        setAvailablePlans(plansRes.value.data.data.plans);
      if (payHistRes.status === 'fulfilled' && payHistRes.value.data?.status === 'success')
        setPaymentHistory(payHistRes.value.data.data?.payments || []);

      // Erreur bloquante seulement si les données principales échouent
      if (statusRes.status === 'rejected' && !silent) {
        Toast.show({ type: 'error', text1: 'Erreur', text2: "Impossible de charger l'abonnement" });
      }
    } catch (err) {
      if (!silent) Toast.show({ type: 'error', text1: 'Erreur', text2: "Impossible de charger l'abonnement" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOffline) { setLoading(false); setRefreshing(false); return; }
    fetchAll();
  }, [isOffline]); // eslint-disable-line

  const onRefresh = useCallback(() => {
    if (isOffline) { Toast.show({ type: 'info', text1: 'Hors ligne' }); return; }
    setRefreshing(true);
    fetchAll(true);
  }, []); // eslint-disable-line

  // ─── Actions ────────────────────────────────────────────────────────────────
  const startTrial = async () => {
    if (!selectedPlan || isOfflineRef.current) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post('/api/seller/subscription/start-trial', { planType: selectedPlan.name });
      if (res.data?.status === 'success') {
        const trialMonths = SUBSCRIPTION_CONFIG.getPlan(selectedPlan.name)?.pricing?.trialMonths || 1;
        Toast.show({ type: 'success', text1: 'Essai démarré !', text2: `${trialMonths} mois gratuits activés` });
        await updateSubscription({ status: 'trial', planName: selectedPlan.name });
        setSelectedPlan(null);
        fetchAll(true);
      } else {
        Toast.show({ type: 'error', text1: 'Erreur', text2: res.data?.message });
      }
    } catch { Toast.show({ type: 'error', text1: 'Erreur réseau' }); }
    finally { setSubmitting(false); }
  };

  const createRequest = async () => {
    if (!selectedPlan || isOfflineRef.current) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post('/api/seller/subscription/create-future-request', {
        planType: selectedPlan.name, billingCycle, paymentMethod, upgradeMode,
      });
      if (res.data?.status === 'success') {
        Toast.show({ type: 'success', text1: 'Demande créée', text2: 'Soumettez votre preuve de paiement' });
        setSelectedPlan(null);
        setShowProof(true);
        fetchAll(true);
      } else {
        Toast.show({ type: 'error', text1: 'Erreur', text2: res.data?.message });
      }
    } catch { Toast.show({ type: 'error', text1: 'Erreur réseau' }); }
    finally { setSubmitting(false); }
  };

  const submitProof = async () => {
    if (isOfflineRef.current) { Toast.show({ type: 'error', text1: 'Hors ligne' }); return; }
    if (!transferCode.trim()) { Toast.show({ type: 'error', text1: 'Code requis', text2: 'Saisissez le code de transfert' }); return; }
    const pending = subData?.queueInfo?.nextSubscriptions?.find(
      sub => ['pending_payment','payment_submitted','rejected'].includes(sub.status)
    );
    if (!pending?.paymentRequestId) { Toast.show({ type: 'error', text1: 'Aucune demande en attente' }); return; }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('transferCode', transferCode.trim());
      if (senderPhone.trim()) formData.append('senderPhone', senderPhone.trim());
      if (receipt) formData.append('receipt', { uri: receipt.uri, name: receipt.fileName || 'receipt.jpg', type: receipt.mimeType || 'image/jpeg' });
      const res = await apiClient.put(
        `/api/seller/subscription/submit-payment/${pending.paymentRequestId}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: TIMEOUTS.UPLOAD }
      );
      if (res.data?.status === 'success') {
        Toast.show({ type: 'success', text1: 'Preuve soumise !', text2: 'Vérification sous 24-48h' });
        setTransferCode(''); setSenderPhone(''); setReceipt(null); setShowProof(false);
        fetchAll(true);
      } else {
        Toast.show({ type: 'error', text1: 'Erreur', text2: res.data?.message });
      }
    } catch { Toast.show({ type: 'error', text1: 'Erreur réseau' }); }
    finally { setSubmitting(false); }
  };

  const cancelRequest = async (requestId) => {
    if (!requestId || isOfflineRef.current) return;
    Alert.alert('Annuler la demande', 'Cette action est irréversible. Vous pourrez créer une nouvelle demande après.', [
      { text: 'Retour', style: 'cancel' },
      { text: 'Annuler la demande', style: 'destructive', onPress: async () => {
        setSubmitting(true);
        try {
          const res = await apiClient.delete(`/api/seller/subscription/cancel-request/${requestId}`);
          if (res.data?.status === 'success') {
            Toast.show({ type: 'success', text1: 'Demande annulée' });
            setShowProof(false);
            fetchAll(true);
          } else {
            Toast.show({ type: 'error', text1: 'Erreur', text2: res.data?.message });
          }
        } catch { Toast.show({ type: 'error', text1: 'Erreur réseau' }); }
        finally { setSubmitting(false); }
      }},
    ]);
  };

  const activateWithCode = async () => {
    if (reactivationCode.length !== 8) { Toast.show({ type: 'error', text1: 'Code invalide', text2: '8 caractères attendus' }); return; }
    if (isOfflineRef.current) { Toast.show({ type: 'error', text1: 'Hors ligne' }); return; }
    setReactivating(true);
    try {
      const res = await apiClient.post('/api/seller/subscription/activate-with-code', { reactivationCode: reactivationCode.toUpperCase() });
      if (res.data?.status === 'success') {
        Toast.show({ type: 'success', text1: 'Compte réactivé !', text2: 'Bienvenue de retour' });
        await updateSubscription({ status: 'active' });
        setReactivationCode('');
        fetchAll(true);
      } else {
        Toast.show({ type: 'error', text1: 'Erreur', text2: res.data?.message });
      }
    } catch { Toast.show({ type: 'error', text1: 'Erreur réseau' }); }
    finally { setReactivating(false); }
  };

  // ─── Données dérivées ────────────────────────────────────────────────────────
  const statusInfo     = subData?.statusInfo;
  const status         = statusInfo?.status || subscription?.status || null;
  const activeSub      = subData?.activeSubscription;
  const productCount   = subData?.productCount || 0;
  const history        = subData?.history || [];
  const allQueued        = subData?.queueInfo?.nextSubscriptions || [];
  const activeQueued     = allQueued.filter(s => !['cancelled','rejected'].includes(s.status));
  // Uniquement les abonnements déjà validés en attente de démarrage (PendingRequestCard gère les autres)
  const scheduledQueued  = allQueued.filter(s => ['queued','payment_verified'].includes(s.status));

  const STATUS_PRIO    = ['pending_payment','payment_submitted','rejected','payment_verified','cancelled'];
  const pendingRequest = allQueued
    .filter(s => STATUS_PRIO.includes(s.status))
    .sort((a,b) => STATUS_PRIO.indexOf(a.status) - STATUS_PRIO.indexOf(b.status))[0];

  // rejected n'est pas une demande "en cours" — le vendeur peut refaire une demande
  const hasPendingRequest = allQueued.some(s => ['pending_payment','payment_submitted','payment_verified'].includes(s.status));
  const canCreateRequest  = statusInfo?.canCreateRequest;
  const canUpgradeNow     = statusInfo?.canUpgradeNow;
  const isSuspended       = status === 'suspended';
  const isTrialMode       = status === 'no_subscription';
  const upgradeOnly       = !isTrialMode && !isSuspended && !canCreateRequest && !!canUpgradeNow;
  const activePlanType    = activeSub?.planType;

  const hasHigherPlans = upgradeOnly
    ? availablePlans.some(p => planRank(p.name) > planRank(activePlanType))
    : true;
  const showPlans = hasHigherPlans && (
    (canCreateRequest && !hasPendingRequest) ||
    isTrialMode ||
    (canUpgradeNow && !hasPendingRequest) ||
    (isSuspended && !hasPendingRequest)   // compte suspendu → laisser choisir un plan
  );

  // Plans à afficher : API en priorité, sinon config locale
  const displayPlans = useMemo(() => {
    if (availablePlans.length > 0) return availablePlans;
    return Object.entries(SUBSCRIPTION_CONFIG.PLANS).map(([name, cfg]) => ({
      name,
      description:  cfg.description,
      pricing:      { monthly: cfg.pricing.monthly, annual: cfg.pricing.annual },
      trialMonths:  cfg.pricing.trialMonths,
      commission:   cfg.commission,
      productLimit: cfg.productLimit,
    }));
  }, [availablePlans]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[s.loadingText, { color: colors.textMuted }]}>Chargement de l'abonnement…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        {/* Bannière offline */}
        {isOffline && (
          <View style={s.offlinePill}>
            <Ionicons name="wifi-outline" size={12} color="#EF4444" />
            <Text style={s.offlinePillText}>Mode hors ligne — données en cache</Text>
          </View>
        )}

        {/* Carte de statut */}
        {status === 'suspended' ? (
          <SuspendedCard
            code={reactivationCode}
            setCode={setReactivationCode}
            onActivate={activateWithCode}
            loading={reactivating}
            isOffline={isOffline}
            colors={colors}
          />
        ) : (
          <StatusCard
            subData={subData}
            statusInfo={statusInfo}
            productCount={productCount}
            queuedSubs={scheduledQueued}
            colors={colors}
          />
        )}

        {/* File d'attente — uniquement abonnements validés en attente de démarrage */}
        {scheduledQueued.length > 0 && <QueueCard subs={scheduledQueued} colors={colors} />}

        {/* Requête en attente */}
        {pendingRequest && !(pendingRequest.status === 'rejected' && dismissedRejected) && (
          <PendingRequestCard
            request={pendingRequest}
            showProof={showProof}
            onToggleProof={(open) => {
              if (open && pendingRequest.paymentDetails) {
                const pd = pendingRequest.paymentDetails;
                if (pd.transferCode) setTransferCode(pd.transferCode);
                if (pd.senderPhone) setSenderPhone(pd.senderPhone);
                // Réinitialiser le nouveau fichier (le reçu existant est affiché séparément)
                setReceipt(null);
              }
              if (!open) {
                setReceipt(null);
              }
              setShowProof(open);
            }}
            transferCode={transferCode} setTransferCode={setTransferCode}
            senderPhone={senderPhone}  setSenderPhone={setSenderPhone}
            receipt={receipt} setReceipt={setReceipt}
            onSubmitProof={submitProof}
            onCancelRequest={() => cancelRequest(pendingRequest.paymentRequestId || pendingRequest._id)}
            onNewRequest={() => {
              setTab('plans');
              setTimeout(() => {
                scrollRef.current?.scrollTo({ y: tabsYRef.current, animated: true });
              }, 100);
            }}
            onReconnect={() => useAuthStore.getState().forceLogout()}
            onDismiss={pendingRequest.status === 'rejected' ? () => setDismissedRejected(true) : undefined}
            submitting={submitting}
            isOffline={isOffline}
            colors={colors}
          />
        )}

        {/* Onglets — "Choisir un plan" masqué si aucun plan disponible */}
        <View
          onLayout={e => { tabsYRef.current = e.nativeEvent.layout.y; }}
          style={[s.tabRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        >
          {[
            showPlans ? { key: 'plans', label: 'Choisir un plan' } : null,
            { key: 'historique', label: 'Historique' },
          ].filter(Boolean).map(t => (
            <TouchableOpacity
              key={t.key}
              style={[s.tabBtn, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabBtnText, { color: tab === t.key ? colors.primary : colors.textMuted }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab plans — carousel */}
        {tab === 'plans' && showPlans && (
          <>
            <PlansCarousel
              plans={displayPlans}
              billingCycle={billingCycle}
              setBillingCycle={setBillingCycle}
              selectedPlan={selectedPlan}
              setSelectedPlan={setSelectedPlan}
              activePlanType={activePlanType}
              upgradeOnly={upgradeOnly}
              isTrialMode={isTrialMode}
              productCount={productCount}
              colors={colors}
            />
            <ActionPanel
              selectedPlan={selectedPlan}
              activePlanType={activePlanType}
              isTrialMode={isTrialMode}
              upgradeOnly={upgradeOnly}
              billingCycle={billingCycle}
              paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
              upgradeMode={upgradeMode}     setUpgradeMode={setUpgradeMode}
              onSubmit={isTrialMode ? startTrial : createRequest}
              submitting={submitting}
              isOffline={isOffline}
              statusInfo={statusInfo}
              productCount={productCount}
              colors={colors}
            />
          </>
        )}
        {tab === 'plans' && !showPlans && !pendingRequest && !!activeSub && (
          <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.border, alignItems: 'center', paddingVertical: 28 }]}>
            <Ionicons name="checkmark-circle-outline" size={28} color="#10B981" />
            <Text style={[s.emptyText, { color: colors.textMuted, marginTop: 8 }]}>Votre abonnement est à jour.</Text>
          </View>
        )}

        {/* Tab historique */}
        {tab === 'historique' && <HistoryCard history={history} paymentHistory={paymentHistory} colors={colors} />}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Export pour SubscriptionWall dans AppNavigator
export { AbonnementScreen as AbonnementWallScreen };

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll:      { padding: 16, gap: 12 },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13 },

  offlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    alignSelf: 'center', backgroundColor: '#FEF2F2',
  },
  offlinePillText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },

  // Status card
  statusCard:       { borderRadius: 16, borderWidth: 2, padding: 16, gap: 12 },
  statusCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusIcon:       { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  statusTitle:      { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  statusSub:        { fontSize: 13, fontWeight: '600' },
  statusDate:       { fontSize: 11, marginTop: 2 },

  tripleGrid: { flexDirection: 'row', gap: 8 },
  tripleItem: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', gap: 2 },
  tripleVal:  { fontSize: 18, fontWeight: '900' },
  tripleLabel:{ fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tripleSub:  { fontSize: 10, textAlign: 'center' },

  usageBarBg:   { width: '100%', height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginTop: 4 },
  usageBarFill: { height: 4, borderRadius: 2 },

  hintText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },

  infoBox:      { borderRadius: 10, borderWidth: 1, padding: 12, gap: 4 },
  infoBoxRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoBoxTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  infoBoxLine:  { fontSize: 12, lineHeight: 18, flex: 1 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoRowText:  { fontSize: 13, lineHeight: 18, flex: 1 },

  // Bloc instructions de paiement
  payInstr:           { marginHorizontal: 12, marginBottom: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#30A08B' },
  payInstrHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#30A08B', paddingVertical: 10, paddingHorizontal: 14 },
  payInstrHeaderText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  payInstrAmount:     { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 14, backgroundColor: '#F0FAF8' },
  payInstrAmountLabel:{ fontSize: 11, color: '#30A08B', fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  payInstrAmountValue:{ fontSize: 28, fontWeight: '800', color: '#1A6B5A', letterSpacing: -0.5 },
  payInstrDetails:    { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 6 },
  payInstrRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E6F5F2' },
  payInstrIconWrap:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#E6F5F2', alignItems: 'center', justifyContent: 'center' },
  payInstrRowLabel:   { fontSize: 10, color: '#6B7280', fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 },
  payInstrRowValue:   { fontSize: 14, fontWeight: '700', color: '#111827' },
  payInstrHint:       { backgroundColor: '#FFFBEB', paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#FDE68A' },
  payInstrHintText:   { fontSize: 12, color: '#92400E', lineHeight: 17 },

  warnBanner:     { borderRadius: 10, borderWidth: 1, padding: 10 },
  warnBannerText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },

  posBanner:      { borderRadius: 10, borderWidth: 1, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  posBannerTitle: { fontSize: 12, fontWeight: '700' },
  posBannerSub:   { fontSize: 11, lineHeight: 16, marginTop: 2 },

  // Queue mini
  queueMini:       { borderRadius: 10, borderWidth: 1, padding: 10, gap: 6 },
  queueMiniTitle:  { fontSize: 12, fontWeight: '700' },
  queueMiniRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  queueMiniNum:    { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  queueMiniNumText:{ fontSize: 10, fontWeight: '800', color: '#fff' },
  queueMiniPlan:   { flex: 1, fontSize: 12, fontWeight: '600' },

  // Generic card
  card: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', padding: 14, paddingBottom: 8 },

  // Section header
  sectionHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  sectionHeaderTitle:{ fontSize: 15, fontWeight: '800', color: '#fff' },
  sectionHeaderSub:  { fontSize: 11, color: '#ffffffcc', marginTop: 2 },

  // Queue full
  queueFullRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, padding: 10 },
  queueFullNum:  { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  queueNote:     { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 4 },
  queueNoteText: { fontSize: 12, lineHeight: 17 },

  chip:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  chipText: { fontSize: 10, fontWeight: '700' },

  // Plans carousel
  plansHeader:     { padding: 16, gap: 4 },
  plansHeaderTitle:{ fontSize: 15, fontWeight: '800', color: '#fff' },
  plansHeaderSub:  { fontSize: 12, color: '#ffffffcc' },

  cycleToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden', padding: 3, gap: 3 },
  cycleBtn:    { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  cycleBtnText:{ fontSize: 12, fontWeight: '700' },

  // Plan card
  planCard: {
    borderRadius: 14, overflow: 'hidden', marginVertical: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, elevation: 3,
  },
  planCardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  planIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  planCardName: { fontSize: 18, fontWeight: '900', color: '#fff' },
  planCardDesc: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2, lineHeight: 15 },

  popularBadge: { position: 'absolute', top: 0, right: 0, zIndex: 2, paddingHorizontal: 10, paddingVertical: 4, borderBottomLeftRadius: 10 },
  currentBadge: { position: 'absolute', top: 0, left: 0,  zIndex: 2, paddingHorizontal: 10, paddingVertical: 4, borderBottomRightRadius: 10 },
  badgeText:    { fontSize: 10, fontWeight: '800', color: '#fff' },

  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  radioDot:    { width: 11, height: 11, borderRadius: 6, backgroundColor: '#fff' },

  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, paddingHorizontal: 14, paddingTop: 12 },
  planPrice:    { fontSize: 26, fontWeight: '900' },
  planPricePer: { fontSize: 13 },
  discountChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 4 },
  discountChipText: { fontSize: 10, fontWeight: '800' },
  savingsText:  { fontSize: 11, fontWeight: '700', color: '#10B981', paddingHorizontal: 14, marginTop: 2 },

  trialChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginHorizontal: 14, marginTop: 8,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5,
  },
  trialChipText: { fontSize: 12, fontWeight: '700' },

  featureList: { padding: 14, gap: 7 },
  featureRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  featureText: { fontSize: 12, flex: 1, lineHeight: 17 },

  // Dots
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingBottom: 14 },
  dot:     { width: 8, height: 8, borderRadius: 4 },

  // Action panel
  radioCircle2: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  radioDot2:    { width: 10, height: 10, borderRadius: 5 },

  trialActionBox: { borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  trialActionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  trialActionTitle:{ fontSize: 14, fontWeight: '700', flex: 1 },
  trialActionSub:  { fontSize: 12, marginTop: 4, lineHeight: 17, flex: 1 },

  upgradeBox:        { borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  upgradeBoxTop:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  upgradeBoxTopText: { fontSize: 13, fontWeight: '700', color: '#fff', flex: 1 },
  upgradeTag:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.25)' },
  upgradeTagText:    { fontSize: 10, fontWeight: '700', color: '#fff' },
  upgradeModeRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  upgradeModeTitle:  { fontSize: 13, fontWeight: '600' },
  upgradeModeDesc:   { fontSize: 11, marginTop: 2, lineHeight: 16 },

  pmLabel: { fontSize: 11, fontWeight: '700' },
  pmGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pmCard:  { flex: 1, minWidth: '44%', borderRadius: 10, padding: 10, alignItems: 'center', gap: 3 },
  pmCardLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  pmCardPhone: { fontSize: 10, textAlign: 'center' },

  transferInfo:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 10, borderWidth: 1, padding: 10 },
  transferInfoText: { flex: 1, fontSize: 12, lineHeight: 17 },

  urgentNote: { borderRadius: 10, borderWidth: 1, padding: 10 },

  bigBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 14 },
  bigBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Suspended / code
  codeInput: {
    borderRadius: 10, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 18, fontWeight: '800', letterSpacing: 4, textAlign: 'center',
    backgroundColor: '#fff', marginBottom: 10, color: '#111',
  },
  helpBox:  { borderRadius: 8, borderWidth: 1, padding: 10, marginTop: 10 },
  helpText: { fontSize: 12, lineHeight: 17 },

  // Pending request
  reqRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, padding: 10, margin: 12, marginTop: 0 },
  reqPlan:   { fontSize: 13, fontWeight: '700' },
  reqDate:   { fontSize: 11, marginTop: 2 },
  alertBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: 8, borderWidth: 1, padding: 10, marginHorizontal: 12, marginBottom: 4 },
  alertText: { fontSize: 12, flex: 1, lineHeight: 17 },
  reqActions:   { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  proofBtn:     { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10 },
  proofBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  cancelBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, borderWidth: 1, paddingVertical: 10 },
  cancelBtnText: { fontSize: 12, fontWeight: '600' },

  proofForm:      { borderTopWidth: 1, padding: 12, gap: 6 },
  proofFormTitle: { fontSize: 14, fontWeight: '800' },
  proofFormSub:   { fontSize: 12, lineHeight: 17 },
  inputLabel:     { fontSize: 11, fontWeight: '600', marginTop: 4 },
  input:          { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  receiptPicker:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 12, paddingHorizontal: 14 },
  receiptPickerText: { fontSize: 13 },
  proofBtns:      { flexDirection: 'row', gap: 8, marginTop: 4 },
  proofCancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  proofCancelText:{ fontSize: 13, fontWeight: '600' },
  proofSubmitBtn: { flex: 2, borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  proofSubmitText:{ color: '#fff', fontSize: 13, fontWeight: '800' },

  // Tabs
  tabRow:    { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  tabBtn:    { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnText:{ fontSize: 13, fontWeight: '700' },

  // History
  histStats:     { flexDirection: 'row', padding: 12, borderBottomWidth: 1, gap: 4 },
  histStat:      { flex: 1, alignItems: 'center', gap: 2 },
  histStatVal:   { fontWeight: '800' },
  histStatLabel: { fontSize: 9, textAlign: 'center' },
  histSection:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  histItem:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 4, borderRadius: 8, padding: 10 },
  histItemTitle: { fontSize: 13, fontWeight: '700' },
  histItemSub:   { fontSize: 11, marginTop: 2 },
  histItemNote:  { fontSize: 10, marginTop: 2, fontStyle: 'italic' },
  histItemDate:  { fontSize: 11, fontWeight: '600' },
  histItemAmount:{ fontSize: 11, fontWeight: '700', marginTop: 2 },

  emptyText: { fontSize: 13 },
});
