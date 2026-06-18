import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated, Dimensions,
  TouchableWithoutFeedback, PanResponder,
} from 'react-native';
import CachedImage from './CachedImage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import apiClient from '../config/api';
import Toast from 'react-native-toast-message';

const SHEET_HEIGHT = 480;

export default function PhotoProfileModal({ visible, onClose }) {
  const { colors } = useTheme();
  const { seller, updateSeller } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [modalMounted, setModalMounted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Monte le Modal avant d'animer
  useEffect(() => {
    if (visible) {
      setModalMounted(true);
    }
  }, [visible]);

  // Anime quand monté
  useEffect(() => {
    if (modalMounted && visible) {
      slideAnim.setValue(SHEET_HEIGHT);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 68,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [modalMounted, visible]);

  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalMounted(false);
      cb?.();
    });
  };

  const handleClose = () => dismiss(() => { setPreview(null); onClose(); });

  // Swipe down to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) slideAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 1) {
          handleClose();
        } else {
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const sellerId = seller?.id || seller?._id;
  const currentLogo = seller?.logo;
  const initial = (seller?.storeName || seller?.name || 'V').charAt(0).toUpperCase();

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée', 'Accès à la galerie requis.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) setPreview(result.assets[0]);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée', 'Accès à la caméra requis.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) setPreview(result.assets[0]);
  };

  const uploadPhoto = async () => {
    if (!preview || !sellerId) return;
    setUploading(true);
    try {
      const uri = preview.uri;
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const formData = new FormData();
      formData.append('image', { uri, name: `profile.${ext}`, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
      const res = await apiClient.put(`/setImage/${sellerId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newLogo = res.data?.logo || res.data?.data?.logo || res.data?.seller?.logo;
      if (newLogo) {
        await updateSeller({ logo: newLogo });
        Toast.show({ type: 'success', text1: 'Photo mise à jour !' });
      }
      dismiss(() => { setPreview(null); onClose(); });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erreur', text2: e.response?.data?.message || e.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      visible={modalMounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.bgCard, paddingBottom: insets.bottom + 16 },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Titre */}
        <Text style={[styles.title, { color: colors.text }]}>
          {currentLogo ? 'Modifier la photo' : 'Ajouter une photo'}
        </Text>

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {(preview?.uri || currentLogo)
            ? <CachedImage uri={preview?.uri || currentLogo} style={[styles.avatarImg, { borderColor: colors.primary }]} contentFit="cover" />
            : <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
          }
          {preview && (
            <View style={[styles.badge, { backgroundColor: colors.bgSuccess }]}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={[styles.badgeText, { color: colors.successText }]}>Aperçu prêt</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]} onPress={pickImage} activeOpacity={0.75}>
            <Ionicons name="images-outline" size={22} color={colors.primary} />
            <Text style={[styles.actionLabel, { color: colors.text }]}>Galerie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.bgHover, borderColor: colors.border }]} onPress={takePhoto} activeOpacity={0.75}>
            <Ionicons name="camera-outline" size={22} color={colors.primary} />
            <Text style={[styles.actionLabel, { color: colors.text }]}>Caméra</Text>
          </TouchableOpacity>
        </View>

        {preview && (
          <TouchableOpacity style={[styles.saveBtn, uploading && { opacity: 0.5 }]} onPress={uploadPhoto} disabled={uploading} activeOpacity={0.85}>
            {uploading
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={styles.saveBtnText}>Enregistrer la photo</Text></>
            }
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={handleClose} activeOpacity={0.75}>
          <Text style={[styles.cancelText, { color: colors.textMuted }]}>Annuler</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
  },
  handleArea: { alignItems: 'center', paddingTop: 14, paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 20 },
  avatarWrap: { alignItems: 'center', gap: 10, marginBottom: 24 },
  avatarImg: { width: 90, height: 90, borderRadius: 45, borderWidth: 3 },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 36, fontWeight: '800', color: '#fff' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  actionBtn: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 18, borderRadius: 16, borderWidth: 1 },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  saveBtn: { backgroundColor: '#30A08B', borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { paddingVertical: 13, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
