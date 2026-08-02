/**
 * DashboardTour — tour guidé avec spotlight SVG-like (4 rectangles noirs autour de la cible)
 *
 * Chaque étape reçoit soit :
 *  - target: { x, y, width, height } mesuré via measureInWindow (précis)
 *  - zone: 'top' | 'bottom' | 'middle' | 'full' (fallback positionnel)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const PAD = 8; // padding autour du highlight

// ─── Définition des étapes ────────────────────────────────────────────────────
// targetKey → clé dans `targets` prop (mesuré depuis le parent)
// zone      → fallback si la mesure échoue
// tipPos    → 'above' | 'below' | 'center' — où placer la bulle
// posOnly   → true = étape affichée seulement si hasPosAccess
const ALL_STEPS = [
  {
    key: 'welcome',
    icon: '👋',
    title: 'Bienvenue dans votre tableau de bord',
    desc: "Voici un tour rapide pour prendre en main votre espace vendeur. Vous pouvez le quitter à tout moment.",
    targetKey: null,
    tipPos: 'center',
  },
  {
    key: 'viewSelector',
    icon: '📊',
    title: 'POS · Marketplace',
    desc: "Basculez entre votre caisse physique (POS) et vos ventes en ligne (Marketplace) en appuyant sur ces onglets.",
    targetKey: 'viewSelector',
    tipPos: 'below',
    posOnly: true,
  },
  {
    key: 'periodBtn',
    icon: '📅',
    title: 'Changer la période',
    desc: "Appuyez ici pour choisir la période de vos statistiques : Aujourd'hui, 7 jours, 30 jours ou une plage personnalisée.",
    targetKey: 'periodBtn',
    tipPos: 'below',
  },
  {
    key: 'tabProduits',
    icon: '📦',
    title: 'Vos produits',
    desc: "Onglet Produits — ajoutez, modifiez vos articles et gérez vos stocks depuis ici.",
    targetKey: 'tabProduits',
    tipPos: 'above',
  },
  {
    key: 'tabVente',
    icon: '🏪',
    title: 'Caisse Physique',
    desc: "Onglet Caisse — encaissez vos clients en boutique, même sans internet. Reçu QR généré automatiquement.",
    targetKey: 'tabVente',
    tipPos: 'above',
    posOnly: true,
  },
  {
    key: 'tabPortefeuille',
    icon: '💰',
    title: 'Votre portefeuille',
    desc: "Onglet Portefeuille — consultez vos gains, l'historique de vos transactions et demandez un retrait.",
    targetKey: 'tabPortefeuille',
    tipPos: 'above',
  },
  {
    key: 'tabPlus',
    icon: '⚙️',
    title: 'Paramètres & Plus',
    desc: "Onglet Paramètres — votre profil, vos modules, abonnement, synchronisation et bien plus.",
    targetKey: 'tabPlus',
    tipPos: 'above',
  },
  {
    key: 'done',
    icon: '🚀',
    title: "C'est parti !",
    desc: "Vous pouvez relancer ce tutoriel à tout moment depuis Paramètres → AIDE → Revoir le tutoriel.",
    targetKey: null,
    tipPos: 'center',
  },
];

const TIP_H     = 210; // hauteur estimée de la bulle
const TIP_PAD   = 16;  // espace entre highlight et bulle

// ─── Calcule la position de la bulle (toujours en `top`) ─────────────────────
function getTipStyle(highlight, tipPos, H) {
  if (!highlight || tipPos === 'center') {
    return { top: H / 2 - TIP_H / 2 };
  }
  const highlightTop    = highlight.y - PAD;
  const highlightBottom = highlight.y + highlight.height + PAD;

  if (tipPos === 'above') {
    const top = highlightTop - TIP_PAD - TIP_H;
    // Si ça sort en haut, mettre en dessous
    if (top < 8) return { top: highlightBottom + TIP_PAD };
    return { top };
  }
  // below
  const top = highlightBottom + TIP_PAD;
  // Si ça sort en bas, mettre en dessus
  if (top + TIP_H > H - 8) return { top: Math.max(8, highlightTop - TIP_PAD - TIP_H) };
  return { top };
}

// ─── Spotlight (4 rectangles noirs autour du highlight) ──────────────────────
function Spotlight({ highlight }) {
  if (!highlight) {
    // Pas de highlight → overlay plein
    return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.78)' }]} pointerEvents="none" />;
  }

  const { x, y, width, height } = highlight;
  const hx = x - PAD;
  const hy = y - PAD;
  const hw = width  + PAD * 2;
  const hh = height + PAD * 2;

  return (
    <>
      {/* Haut */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(0, hy), backgroundColor: 'rgba(0,0,0,0.78)' }} pointerEvents="none" />
      {/* Bas */}
      <View style={{ position: 'absolute', top: hy + hh, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.78)' }} pointerEvents="none" />
      {/* Gauche */}
      <View style={{ position: 'absolute', top: hy, left: 0, width: Math.max(0, hx), height: hh, backgroundColor: 'rgba(0,0,0,0.78)' }} pointerEvents="none" />
      {/* Droite */}
      <View style={{ position: 'absolute', top: hy, left: hx + hw, right: 0, height: hh, backgroundColor: 'rgba(0,0,0,0.78)' }} pointerEvents="none" />
      {/* Bordure highlight */}
      <View style={{
        position: 'absolute',
        top: hy, left: hx, width: hw, height: hh,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#30A08B',
      }} pointerEvents="none" />
      {/* Coin decoratifs */}
      {[
        { top: hy - 2,      left: hx - 2       },
        { top: hy - 2,      left: hx + hw - 10 },
        { top: hy + hh - 8, left: hx - 2       },
        { top: hy + hh - 8, left: hx + hw - 10 },
      ].map((pos, i) => (
        <View key={i} style={[styles.corner, pos]} pointerEvents="none" />
      ))}
    </>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function DashboardTour({ onDone, targets = {}, onRemeasure, hasPosAccess = true }) {
  const insets          = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();

  // Filtre les étapes selon le plan — les étapes posOnly sont exclues pour Starter
  const STEPS = ALL_STEPS.filter(s => !s.posOnly || hasPosAccess);

  const [stepIndex, setStepIndex] = useState(0);
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const tipAnim     = useRef(new Animated.Value(20)).current;
  const hlAnim      = useRef(new Animated.Value(0)).current;


  // Entrée
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(tipAnim,  { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  const animateToStep = useCallback((nextIdx) => {
    Animated.parallel([
      Animated.timing(tipAnim, { toValue: 15, duration: 150, useNativeDriver: true }),
      Animated.timing(hlAnim,  { toValue: 0,  duration: 120, useNativeDriver: false }),
    ]).start(() => {
      setStepIndex(nextIdx);
      tipAnim.setValue(15);
      hlAnim.setValue(0);
      // Re-mesure après le changement d'étape (les éléments peuvent avoir bougé)
      setTimeout(() => {
        onRemeasure?.();
        Animated.parallel([
          Animated.spring(tipAnim, { toValue: 0, tension: 80, friction: 14, useNativeDriver: true }),
          Animated.timing(hlAnim,  { toValue: 1, duration: 250, useNativeDriver: false }),
        ]).start();
      }, 80);
    });
  }, [onRemeasure]);

  const next = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      animateToStep(stepIndex + 1);
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(onDone);
    }
  }, [stepIndex]);

  const prev = useCallback(() => {
    if (stepIndex > 0) animateToStep(stepIndex - 1);
  }, [stepIndex]);

  const skip = useCallback(() => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(onDone);
  }, [onDone]);

  const step    = STEPS[stepIndex];
  const isLast  = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;

  // Les onglets (tabXxx) sont mesurés via MeasurableTabButton dans la tab bar :
  // measureInWindow y inclut déjà la status bar → pas de correction.
  // Les éléments du dashboard (viewSelector, periodBtn) sont dans un View normal :
  // measureInWindow y est depuis sous la status bar → on ajoute insets.top.
  const rawHighlight = (() => {
    if (!step.targetKey) return null;
    const t = targets[step.targetKey];
    if (!t) return null;
    if (step.targetKey.startsWith('tab')) return t;
    return { ...t, y: t.y + insets.top };
  })();

  const highlight = rawHighlight;
  const tipStyle = getTipStyle(highlight, step.tipPos, H);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim }]}>

        {/* Spotlight */}
        <Spotlight highlight={highlight} />

        {/* Bulle */}
        <Animated.View style={[styles.tip, tipStyle, { transform: [{ translateY: tipAnim }] }]}>

          {/* Barre de progression */}
          <View style={styles.progress}>
            {STEPS.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => i !== stepIndex && animateToStep(i)}>
                <View style={[
                  styles.progressSeg,
                  { backgroundColor: i < stepIndex ? '#30A08B' : i === stepIndex ? '#30A08B' : '#e0e0e0' },
                  i === stepIndex && { opacity: 1 },
                  i < stepIndex  && { opacity: 0.5 },
                ]} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Header bulle */}
          <View style={styles.tipHeader}>
            <View style={styles.tipBadge}>
              <Text style={styles.tipBadgeText}>{stepIndex + 1} / {STEPS.length}</Text>
            </View>
            <TouchableOpacity onPress={skip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={18} color="#bbb" />
            </TouchableOpacity>
          </View>

          {/* Corps */}
          <View style={styles.tipBody}>
            <Text style={styles.tipIcon}>{step.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.tipTitle}>{step.title}</Text>
              <Text style={styles.tipDesc}>{step.desc}</Text>
            </View>
          </View>

          {/* Boutons */}
          <View style={styles.tipFooter}>
            {!isFirst && (
              <TouchableOpacity style={styles.prevBtn} onPress={prev} activeOpacity={0.7}>
                <Ionicons name="arrow-back" size={15} color="#666" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, isFirst && { flex: 1 }]}
              onPress={next}
              activeOpacity={0.85}
            >
              <Text style={styles.nextText}>{isLast ? 'Terminer' : 'Suivant'}</Text>
              <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={15} color="#fff" />
            </TouchableOpacity>
          </View>

        </Animated.View>

      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    width: 10, height: 10,
    borderColor: '#30A08B',
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
  },

  tip: {
    position: 'absolute',
    left: 16, right: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    elevation: 20,
    gap: 12,
  },

  progress: { flexDirection: 'row', gap: 3 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2 },

  tipHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tipBadge: {
    backgroundColor: '#e8f8f5', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  tipBadgeText: { fontSize: 11, fontWeight: '800', color: '#30A08B' },

  tipBody:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tipIcon:  { fontSize: 28, lineHeight: 34 },
  tipTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a', marginBottom: 5 },
  tipDesc:  { fontSize: 13, color: '#555', lineHeight: 19 },

  tipFooter: { flexDirection: 'row', gap: 10 },
  prevBtn: {
    width: 42, height: 42, borderRadius: 12,
    borderWidth: 1, borderColor: '#e8e8e8',
    justifyContent: 'center', alignItems: 'center',
  },
  nextBtn: {
    flex: 1, height: 42, borderRadius: 12,
    backgroundColor: '#30A08B',
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  nextText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
