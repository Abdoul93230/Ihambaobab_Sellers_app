import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  Animated, StatusBar, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

// ─── Données des slides ───────────────────────────────────────────────────────
const SLIDES = [
  {
    key: '0',
    tag: 'VOTRE BOUTIQUE NUMÉRIQUE',
    title: 'Vendez partout,\ntout le temps.',
    highlight: 'partout,',
    desc: 'En ligne, en boutique physique, avec ou sans internet — IhamBaobab s\'adapte à votre réalité.',
    gradient: ['#0d1f1c', '#0d2e28', '#0f3d35'],
    accent: '#30A08B',
    pills: ['En ligne', 'En boutique', 'Hors-ligne'],
    visual: 'globe',
    stats: [
      { value: '0%', label: 'Commission\nPOS' },
      { value: '24/7', label: 'Accessible\ntout le temps' },
      { value: '2', label: 'Apps dédiées\nvend. & achet.' },
    ],
  },
  {
    key: '1',
    tag: 'CATALOGUE INTELLIGENT',
    title: 'Vos produits,\nsans limite.',
    highlight: 'sans limite.',
    desc: 'Photos, variantes, stocks, promotions — tout se gère en quelques tapotements depuis votre téléphone.',
    gradient: ['#1a0f00', '#2e1a00', '#3d2400'],
    accent: '#B17236',
    pills: ['Photos HD', 'Variantes', 'Stocks auto'],
    visual: 'cube',
    stats: [
      { value: '∞', label: 'Produits\npossibles' },
      { value: '1 clic', label: 'Pour publier\nou dépublier' },
      { value: 'Multi', label: 'Couleurs\n& tailles' },
    ],
  },
  {
    key: '2',
    tag: 'CAISSE PHYSIQUE',
    title: 'Encaissez même\nsans internet.',
    highlight: 'sans internet.',
    desc: 'La caisse POS fonctionne en mode hors-ligne. Les ventes se synchronisent automatiquement à la reconnexion.',
    gradient: ['#061a10', '#0a2a18', '#0d3820'],
    accent: '#10B981',
    pills: ['Hors-ligne', 'QR Receipt', 'Sync auto'],
    visual: 'storefront',
    stats: [
      { value: '0%', label: 'Commission\nsur ventes POS' },
      { value: 'QR', label: 'Reçu numérique\nvérifiable' },
      { value: 'Auto', label: 'Sync dès\nreconnexion' },
    ],
  },
  {
    key: '3',
    tag: 'PORTEFEUILLE & FINANCES',
    title: 'Vos gains,\nen toute clarté.',
    highlight: 'en toute clarté.',
    desc: 'Tableau de bord, portefeuille, historique des transactions et retrait d\'argent — tout dans une seule app.',
    gradient: ['#100d1a', '#1a1228', '#221535'],
    accent: '#8B5CF6',
    pills: ['Bilan quotidien', 'Retrait rapide', 'Statistiques'],
    visual: 'wallet',
    stats: [
      { value: 'Live', label: 'Stats en\ntemps réel' },
      { value: 'CFA', label: 'Paiements\nlocaux' },
      { value: '30j', label: 'Historique\ndétaillé' },
    ],
  },
  {
    key: '4',
    tag: 'PRÊT À DÉMARRER',
    title: 'Votre succès\ncommence ici.',
    highlight: 'commence ici.',
    desc: 'Rejoignez les vendeurs qui font confiance à IhamBaobab pour développer leur commerce en Afrique de l\'Ouest.',
    gradient: ['#0d1f1c', '#0d2e28', '#0f3d35'],
    accent: '#30A08B',
    pills: ['Niger', 'Afrique de l\'Ouest', 'Marketplace local'],
    visual: 'rocket',
    stats: [
      { value: '🌱', label: 'Starter\ngratuit' },
      { value: '⚡', label: 'Pro\navancé' },
      { value: '🚀', label: 'Business\npremium' },
    ],
    isLast: true,
  },
];

// ─── Illustration vectorielle SVG-like (pure RN) ─────────────────────────────
function SlideVisual({ type, accent, anim }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1800, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 12000, useNativeDriver: true })
    ).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spinReverse = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  const icons = {
    globe:      { main: 'globe-outline',      sub1: 'wifi-outline',       sub2: 'phone-portrait-outline' },
    cube:       { main: 'cube-outline',        sub1: 'camera-outline',     sub2: 'pricetag-outline'       },
    storefront: { main: 'storefront-outline',  sub1: 'qr-code-outline',    sub2: 'receipt-outline'        },
    wallet:     { main: 'wallet-outline',      sub1: 'bar-chart-outline',  sub2: 'trending-up-outline'    },
    rocket:     { main: 'rocket-outline',      sub1: 'star-outline',       sub2: 'trophy-outline'         },
  };
  const ic = icons[type] || icons.globe;

  return (
    <Animated.View style={[styles.visualWrap, { transform: [{ scale: anim }] }]}>
      {/* Cercles décoratifs rotatifs */}
      <Animated.View style={[styles.ringOuter, { borderColor: accent + '20', transform: [{ rotate: spin }] }]} />
      <Animated.View style={[styles.ringMiddle, { borderColor: accent + '35', transform: [{ rotate: spinReverse }] }]} />

      {/* Centre */}
      <Animated.View style={[styles.visualCenter, { backgroundColor: accent + '18', transform: [{ scale: pulse }] }]}>
        <View style={[styles.visualInner, { backgroundColor: accent + '28' }]}>
          <Ionicons name={ic.main} size={52} color={accent} />
        </View>
      </Animated.View>

      {/* Orbites */}
      <View style={[styles.orbit, { top: -10, left: W * 0.15 }]}>
        <View style={[styles.orbitDot, { backgroundColor: accent }]}>
          <Ionicons name={ic.sub1} size={16} color="#fff" />
        </View>
      </View>
      <View style={[styles.orbit, { bottom: 0, right: W * 0.12 }]}>
        <View style={[styles.orbitDot, { backgroundColor: accent + 'cc' }]}>
          <Ionicons name={ic.sub2} size={16} color="#fff" />
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Carte stat ───────────────────────────────────────────────────────────────
function StatCard({ value, label, accent, delay, masterAnim }) {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener = masterAnim.addListener(({ value: v }) => {
      if (v > 0.3) {
        Animated.parallel([
          Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 14, delay, useNativeDriver: true }),
          Animated.timing(opacAnim,  { toValue: 1, duration: 350, delay, useNativeDriver: true }),
        ]).start();
        masterAnim.removeListener(listener);
      }
    });
    return () => masterAnim.removeListener(listener);
  }, []);

  return (
    <Animated.View style={[styles.statCard, {
      borderColor: accent + '30',
      backgroundColor: accent + '0f',
      transform: [{ translateY: slideAnim }],
      opacity: opacAnim,
    }]}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

// ─── Slide individuel ─────────────────────────────────────────────────────────
function Slide({ item, isCurrent }) {
  const contentAnim = useRef(new Animated.Value(0)).current;
  const titleAnim   = useRef(new Animated.Value(40)).current;
  const tagAnim     = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (isCurrent) {
      contentAnim.setValue(0);
      titleAnim.setValue(40);
      tagAnim.setValue(-20);
      Animated.parallel([
        Animated.timing(contentAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(titleAnim,   { toValue: 0, tension: 70, friction: 12, delay: 100, useNativeDriver: true }),
        Animated.spring(tagAnim,     { toValue: 0, tension: 70, friction: 12, delay: 50,  useNativeDriver: true }),
      ]).start();
    }
  }, [isCurrent]);

  // Découpe le titre pour mettre en surbrillance le mot clé
  const titleParts = item.title.split(item.highlight);

  return (
    <LinearGradient colors={item.gradient} style={styles.slide}>
      {/* Grille de fond */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.gridLine, { top: i * (H / 7) }]} />
        ))}
      </View>

      {/* Blob de lumière */}
      <View style={[styles.glowBlob, { backgroundColor: item.accent + '18' }]} pointerEvents="none" />

      <SafeAreaView style={styles.slideInner} edges={['top']}>
        <View style={styles.slideContent}>

          {/* Tag */}
          <Animated.View style={[styles.tagWrap, {
            opacity: contentAnim,
            transform: [{ translateX: tagAnim }],
          }]}>
            <View style={[styles.tagDot, { backgroundColor: item.accent }]} />
            <Text style={[styles.tagText, { color: item.accent }]}>{item.tag}</Text>
          </Animated.View>

          {/* Illustration */}
          <SlideVisual type={item.visual} accent={item.accent} anim={contentAnim} />

          {/* Titre */}
          <Animated.View style={{
            opacity: contentAnim,
            transform: [{ translateY: titleAnim }],
          }}>
            <Text style={styles.title}>
              {titleParts[0]}
              <Text style={[styles.titleHighlight, { color: item.accent }]}>
                {item.highlight}
              </Text>
              {titleParts[1]}
            </Text>
          </Animated.View>

          {/* Description */}
          <Animated.Text style={[styles.desc, { opacity: contentAnim }]}>
            {item.desc}
          </Animated.Text>

          {/* Pills */}
          <Animated.View style={[styles.pillsRow, { opacity: contentAnim }]}>
            {item.pills.map((p, i) => (
              <View key={i} style={[styles.pill, { borderColor: item.accent + '50', backgroundColor: item.accent + '12' }]}>
                <Text style={[styles.pillText, { color: item.accent }]}>{p}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Stats */}
          <View style={styles.statsRow}>
            {item.stats.map((s, i) => (
              <StatCard
                key={i}
                value={s.value}
                label={s.label}
                accent={item.accent}
                delay={i * 80}
                masterAnim={contentAnim}
              />
            ))}
          </View>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Screen principal ─────────────────────────────────────────────────────────
export default function OnboardingScreen({ onDone }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef(null);
  const scrollX   = useRef(new Animated.Value(0)).current;
  const insets    = useSafeAreaInsets();

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
      setCurrentIndex(next);
    } else {
      onDone();
    }
  };

  const isLast    = currentIndex === SLIDES.length - 1;
  const slide     = SLIDES[currentIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Slides */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={e =>
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / W))
        }
        style={{ flex: 1 }}
      >
        {SLIDES.map((item, i) => (
          <Slide key={item.key} item={item} isCurrent={i === currentIndex} />
        ))}
      </Animated.ScrollView>

      {/* Contrôles fixes */}
      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 20) }]}>

        {/* Dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
            const width = scrollX.interpolate({
              inputRange, outputRange: [6, 22, 6], extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width, opacity, backgroundColor: slide.accent }]}
              />
            );
          })}
        </View>

        {/* Boutons */}
        <View style={styles.buttonsRow}>
          {!isLast ? (
            <TouchableOpacity style={styles.skipBtn} onPress={onDone} activeOpacity={0.7}>
              <Text style={styles.skipText}>Passer</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.nextBtn,
              { backgroundColor: slide.accent },
              isLast && styles.nextBtnFull,
            ]}
            onPress={goNext}
            activeOpacity={0.88}
          >
            {isLast ? (
              <>
                <Text style={styles.nextText}>Commencer maintenant</Text>
                <View style={styles.nextArrow}>
                  <Ionicons name="arrow-forward" size={16} color={slide.accent} />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.nextText}>Suivant</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060e0c' },

  // Slide
  slide:     { width: W, flex: 1, overflow: 'hidden' },
  slideInner:{ flex: 1 },
  slideContent: {
    flex: 1, paddingHorizontal: 24,
    paddingTop: 12, paddingBottom: 160,
    justifyContent: 'center', gap: 14,
  },

  // Fond décoratif
  gridOverlay: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  gridLine:    { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  glowBlob: {
    position: 'absolute',
    width: W * 1.2, height: W * 1.2,
    borderRadius: W * 0.6,
    top: -W * 0.3, left: -W * 0.1,
  },

  // Tag
  tagWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tagDot:  { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  // Visuel
  visualWrap: {
    alignSelf: 'center',
    width: 200, height: 200,
    justifyContent: 'center', alignItems: 'center',
    marginVertical: 4,
  },
  ringOuter: {
    position: 'absolute',
    width: 190, height: 190, borderRadius: 95,
    borderWidth: 1, borderStyle: 'dashed',
  },
  ringMiddle: {
    position: 'absolute',
    width: 150, height: 150, borderRadius: 75,
    borderWidth: 1,
  },
  visualCenter: {
    width: 120, height: 120, borderRadius: 60,
    justifyContent: 'center', alignItems: 'center',
  },
  visualInner: {
    width: 90, height: 90, borderRadius: 45,
    justifyContent: 'center', alignItems: 'center',
  },
  orbit: { position: 'absolute' },
  orbitDot: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, elevation: 6,
  },

  // Titre
  title: {
    fontSize: 36, fontWeight: '900', color: '#fff',
    lineHeight: 44, letterSpacing: -0.5,
  },
  titleHighlight: { fontStyle: 'italic' },

  // Desc
  desc: {
    fontSize: 15, color: 'rgba(255,255,255,0.65)',
    lineHeight: 23,
  },

  // Pills
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  pillText: { fontSize: 11, fontWeight: '700' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 14 },

  // Contrôles
  controls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24, paddingTop: 16, gap: 14,
    backgroundColor: 'rgba(6,14,12,0.85)',
  },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, alignItems: 'center' },
  dot:     { height: 6, borderRadius: 3 },

  buttonsRow: { flexDirection: 'row', gap: 12 },
  skipBtn: {
    width: 90, height: 54, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  skipText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  nextBtn: {
    flex: 1, height: 54, borderRadius: 16,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, elevation: 8,
  },
  nextBtnFull: { flex: 1 },
  nextText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  nextArrow: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
});
