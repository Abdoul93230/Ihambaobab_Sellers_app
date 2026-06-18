import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TextInput, TouchableOpacity,
  StyleSheet, PanResponder, Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const W = Dimensions.get('window').width;
const CANVAS = W - 80;
const SLIDER_H = 22;

// ─── Conversions couleur ──────────────────────────────────────────────────────
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r, g, b;
  if (h < 60)       [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  const clean = (hex || '#000000').replace('#', '');
  if (clean.length < 6) return [0, 0, 0];
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else                h = ((r - g) / d + 4) * 60;
  }
  return [h, s, v];
}

function hueToHex(h) {
  const [r, g, b] = hsvToRgb(h, 1, 1);
  return rgbToHex(r, g, b);
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ColorPickerModal({ visible, initialHex = '#30A08B', onSave, onClose, colors }) {
  const insets = useSafeAreaInsets();

  const [hue, setHue]     = useState(0);
  const [sat, setSat]     = useState(1);
  const [val, setVal]     = useState(1);
  const [hexStr, setHexStr] = useState(initialHex);
  const [rStr, setRStr]   = useState('48');
  const [gStr, setGStr]   = useState('160');
  const [bStr, setBStr]   = useState('139');

  // Initialise depuis la couleur d'entrée
  useEffect(() => {
    if (!visible) return;
    const [r, g, b] = hexToRgb(initialHex);
    const [h, s, v] = rgbToHsv(r, g, b);
    setHue(h); setSat(s); setVal(v);
    setHexStr(rgbToHex(r, g, b));
    setRStr(String(r)); setGStr(String(g)); setBStr(String(b));
  }, [visible, initialHex]);

  const syncAll = (h, s, v) => {
    const [r, g, b] = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    setHexStr(hex);
    setRStr(String(r)); setGStr(String(g)); setBStr(String(b));
  };

  // ── Canvas gradient (saturation / luminosité) ─────────────────────────────
  const canvasPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => moveCanvas(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onPanResponderMove:  (e) => moveCanvas(e.nativeEvent.locationX, e.nativeEvent.locationY),
  })).current;

  const moveCanvas = (x, y) => {
    const s = Math.max(0, Math.min(1, x / CANVAS));
    const v = Math.max(0, Math.min(1, 1 - y / CANVAS));
    setSat(s); setVal(v);
    syncAll(hue, s, v);
  };

  // ── Slider teinte ─────────────────────────────────────────────────────────
  const huePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => moveHue(e.nativeEvent.locationX),
    onPanResponderMove:  (e) => moveHue(e.nativeEvent.locationX),
  })).current;

  const moveHue = (x) => {
    const h = Math.max(0, Math.min(360, (x / CANVAS) * 360));
    setHue(h);
    syncAll(h, sat, val);
  };

  // ── Inputs hex / RGB ──────────────────────────────────────────────────────
  const onHexChange = (v) => {
    setHexStr(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      const [r, g, b] = hexToRgb(v);
      const [h, s, vv] = rgbToHsv(r, g, b);
      setHue(h); setSat(s); setVal(vv);
      setRStr(String(r)); setGStr(String(g)); setBStr(String(b));
    }
  };

  const onRgbChange = (ch, txt) => {
    if (ch === 'r') setRStr(txt);
    if (ch === 'g') setGStr(txt);
    if (ch === 'b') setBStr(txt);
    const n = Math.max(0, Math.min(255, parseInt(txt) || 0));
    const nr = ch === 'r' ? n : (parseInt(rStr) || 0);
    const ng = ch === 'g' ? n : (parseInt(gStr) || 0);
    const nb = ch === 'b' ? n : (parseInt(bStr) || 0);
    const [h, s, v] = rgbToHsv(nr, ng, nb);
    setHue(h); setSat(s); setVal(v);
    setHexStr(rgbToHex(nr, ng, nb));
  };

  const [cr, cg, cb] = hsvToRgb(hue, sat, val);
  const currentHex   = rgbToHex(cr, cg, cb);
  const hueHex       = hueToHex(hue);
  const cursorX      = sat * CANVAS;
  const cursorY      = (1 - val) * CANVAS;
  const hueThumbX    = (hue / 360) * CANVAS;
  const lightCursor  = val > 0.6 && sat < 0.4;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { backgroundColor: colors.bgCard, paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Sélecteur de couleur</Text>

          {/* ── Canvas saturation / luminosité ───────────────────────── */}
          <View
            style={[styles.canvas, { width: CANVAS, height: CANVAS }]}
            {...canvasPan.panHandlers}
          >
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: hueHex }]} />
            <LinearGradient
              colors={['#FFFFFF', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={['transparent', '#000000']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Curseur */}
            <View style={[
              styles.cursor,
              { left: cursorX - 10, top: cursorY - 10, borderColor: lightCursor ? '#555' : '#fff' },
            ]} />
          </View>

          {/* ── Slider teinte ────────────────────────────────────────── */}
          <View
            style={[styles.hueSlider, { width: CANVAS }]}
            {...huePan.panHandlers}
          >
            <LinearGradient
              colors={['#FF0000','#FFFF00','#00FF00','#00FFFF','#0000FF','#FF00FF','#FF0000']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.hueThumb, { left: hueThumbX - 13, backgroundColor: hueHex }]} />
          </View>

          {/* ── Aperçu + Hex ─────────────────────────────────────────── */}
          <View style={[styles.row, { width: CANVAS, marginTop: 14 }]}>
            <View style={[styles.preview, { backgroundColor: currentHex, borderColor: colors.border }]} />
            <TextInput
              style={[styles.hexInput, { flex: 1, borderColor: colors.border, backgroundColor: colors.bgInput, color: colors.text }]}
              value={hexStr}
              onChangeText={onHexChange}
              autoCapitalize="none"
              maxLength={7}
              placeholder="#000000"
              placeholderTextColor={colors.textPlaceholder}
            />
          </View>

          {/* ── Inputs R G B ─────────────────────────────────────────── */}
          <View style={[styles.row, { width: CANVAS, marginTop: 10, gap: 8 }]}>
            {[['R', rStr, 'r'], ['G', gStr, 'g'], ['B', bStr, 'b']].map(([label, v, ch]) => (
              <View key={ch} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                <TextInput
                  style={[styles.rgbInput, { borderColor: colors.border, backgroundColor: colors.bgInput, color: colors.text }]}
                  value={v}
                  onChangeText={(t) => onRgbChange(ch, t)}
                  keyboardType="numeric"
                  maxLength={3}
                  textAlign="center"
                />
                <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '700' }}>{label}</Text>
              </View>
            ))}
          </View>

          {/* ── Bouton valider ────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.okBtn, { backgroundColor: currentHex, width: CANVAS, marginTop: 16 }]}
            onPress={() => onSave(currentHex)}
            activeOpacity={0.85}
          >
            <Text style={[styles.okBtnText, { color: lightCursor ? '#111' : '#fff' }]}>
              Choisir cette couleur
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, alignItems: 'center', paddingHorizontal: 20, paddingTop: 0, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, elevation: 24 },
  handleArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 10 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 14 },

  canvas: { borderRadius: 10, overflow: 'hidden' },
  cursor: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, backgroundColor: 'transparent' },

  hueSlider: { height: SLIDER_H, borderRadius: SLIDER_H / 2, marginTop: 14, overflow: 'hidden', position: 'relative' },
  hueThumb: { position: 'absolute', top: -3, width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.35, elevation: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preview: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, flexShrink: 0 },
  hexInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  rgbInput: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, fontSize: 14, width: '100%' },

  okBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  okBtnText: { fontSize: 15, fontWeight: '800' },
});
