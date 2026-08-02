import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Dimensions, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: W, height: H } = Dimensions.get('window');

// ─── Context ──────────────────────────────────────────────────────────────────
const TourContext = createContext(null);

export function useTour() {
  return useContext(TourContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function TourProvider({ children, steps, onFinish }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepLayouts, setStepLayouts] = useState({});
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, []);

  const stop = useCallback(() => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setActive(false);
      setStepIndex(0);
      onFinish?.();
    });
  }, [onFinish]);

  const next = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(i => i + 1);
    } else {
      stop();
    }
  }, [stepIndex, steps.length, stop]);

  const registerStep = useCallback((key, layout) => {
    setStepLayouts(prev => ({ ...prev, [key]: layout }));
  }, []);

  const currentStep = active ? steps[stepIndex] : null;
  const currentLayout = currentStep ? stepLayouts[currentStep.key] : null;

  return (
    <TourContext.Provider value={{ start, stop, registerStep, active }}>
      {children}

      {active && (
        <Modal transparent visible animationType="none" statusBarTranslucent>
          <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>

            {/* Highlight hole */}
            {currentLayout && (
              <View
                style={[styles.highlight, {
                  top:    currentLayout.py - 8,
                  left:   currentLayout.px - 8,
                  width:  currentLayout.width + 16,
                  height: currentLayout.height + 16,
                }]}
                pointerEvents="none"
              />
            )}

            {/* Tip card — positionnée sous le highlight si possible, sinon au-dessus */}
            <TipCard
              step={currentStep}
              stepIndex={stepIndex}
              total={steps.length}
              layout={currentLayout}
              onNext={next}
              onSkip={stop}
              fadeAnim={fadeAnim}
            />
          </Animated.View>
        </Modal>
      )}
    </TourContext.Provider>
  );
}

// ─── TipCard ──────────────────────────────────────────────────────────────────
function TipCard({ step, stepIndex, total, layout, onNext, onSkip, fadeAnim }) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const isLast = stepIndex === total - 1;

  useEffect(() => {
    slideAnim.setValue(20);
    Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
  }, [stepIndex]);

  const cardTop = (() => {
    if (!layout) return H / 2 - 80;
    const below = layout.py + layout.height + 24;
    if (below + 180 < H) return below;
    return layout.py - 200;
  })();

  return (
    <Animated.View style={[
      styles.tipCard,
      { top: cardTop, transform: [{ translateY: slideAnim }] },
    ]}>
      {/* Header */}
      <View style={styles.tipHeader}>
        <View style={styles.tipBadge}>
          <Text style={styles.tipBadgeText}>{stepIndex + 1}/{total}</Text>
        </View>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color="#888" />
        </TouchableOpacity>
      </View>

      {/* Icône + titre */}
      <View style={styles.tipTitleRow}>
        {step.icon && <Text style={styles.tipIcon}>{step.icon}</Text>}
        <Text style={styles.tipTitle}>{step.title}</Text>
      </View>

      <Text style={styles.tipDesc}>{step.desc}</Text>

      {/* Boutons */}
      <View style={styles.tipFooter}>
        <TouchableOpacity style={styles.tipSkipBtn} onPress={onSkip} activeOpacity={0.7}>
          <Text style={styles.tipSkipText}>Passer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tipNextBtn} onPress={onNext} activeOpacity={0.85}>
          <Text style={styles.tipNextText}>{isLast ? 'Terminer' : 'Suivant'}</Text>
          <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={14} color="#fff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── HOC pour enregistrer la position d'un élément ───────────────────────────
export function TourStep({ stepKey, children }) {
  const ctx = useContext(TourContext);
  const viewRef = useRef(null);

  const measure = useCallback(() => {
    if (!viewRef.current || !ctx) return;
    viewRef.current.measureInWindow((px, py, width, height) => {
      ctx.registerStep(stepKey, { px, py, width, height });
    });
  }, [stepKey, ctx]);

  return (
    <View ref={viewRef} onLayout={measure} collapsable={false}>
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  highlight: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: '#30A08B',
    backgroundColor: 'rgba(48,160,139,0.08)',
  },
  tipCard: {
    position: 'absolute',
    left: 20, right: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    elevation: 14,
    gap: 10,
  },
  tipHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  tipBadge: {
    backgroundColor: '#e8f8f5', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  tipBadgeText: { fontSize: 11, fontWeight: '800', color: '#30A08B' },

  tipTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipIcon: { fontSize: 22 },
  tipTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a1a', flex: 1 },
  tipDesc: { fontSize: 14, color: '#555', lineHeight: 20 },

  tipFooter: { flexDirection: 'row', gap: 10, marginTop: 4 },
  tipSkipBtn: {
    flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    justifyContent: 'center', alignItems: 'center',
  },
  tipSkipText: { fontSize: 13, fontWeight: '600', color: '#888' },
  tipNextBtn: {
    flex: 2, height: 42, borderRadius: 10, backgroundColor: '#30A08B',
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  tipNextText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
