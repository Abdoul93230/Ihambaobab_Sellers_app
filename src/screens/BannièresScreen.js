import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  Modal, ScrollView, Image, Alert, ActivityIndicator, Animated,
  Dimensions, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import apiClient from '../config/api';

const { width: W, height: H } = Dimensions.get('window');

const PRIMARY   = '#30A08B';
const PRIMARY_D = '#267a6b';
const SAND      = '#B2905F';

const CATEGORIES = ['Saisonnier', 'Promotions', 'Nouveautés', 'Événements', 'Personnalisé'];
const CAT_EMOJI  = {
  Saisonnier:  '🌸',
  Promotions:  '🔥',
  'Nouveautés': '✨',
  Événements:  '🎉',
  Personnalisé:'🎨',
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState({ msg: '', visible: false, type: 'success' });
  const timerRef = useRef(null);

  const notify = useCallback((msg, type = 'success') => {
    clearTimeout(timerRef.current);
    setToast({ msg, visible: true, type });
    timerRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2800);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { toast, notify };
}

function Toast({ msg, visible, type }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        type === 'error' ? styles.toastError : styles.toastSuccess,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      <Ionicons
        name={type === 'error' ? 'close-circle' : 'checkmark-circle'}
        size={16}
        color="#fff"
      />
      <Text style={styles.toastText}>{msg}</Text>
    </Animated.View>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────
function StatusBadge({ active }) {
  return (
    <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
      <View style={[styles.badgeDot, { backgroundColor: active ? '#10B981' : '#9CA3AF' }]} />
      <Text style={[styles.badgeText, { color: active ? '#065F46' : '#6B7280' }]}>
        {active ? 'Actif' : 'Inactif'}
      </Text>
    </View>
  );
}

// ─── BannerCard ───────────────────────────────────────────────────────────────
function BannerCard({ banner, isSelected, onPress, onToggle, colors }) {
  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.bgCard, borderColor: isSelected ? PRIMARY + '50' : colors.border },
        isSelected && { backgroundColor: PRIMARY + '10' },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Thumbnail */}
      <View style={styles.cardThumb}>
        {banner.image
          ? <Image source={{ uri: banner.image }} style={styles.cardThumbImg} resizeMode="cover" />
          : <Text style={{ fontSize: 22 }}>{CAT_EMOJI[banner.category] || '🖼'}</Text>
        }
        {isSelected && (
          <View style={styles.cardThumbRing} pointerEvents="none" />
        )}
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text
          style={[styles.cardName, { color: isSelected ? PRIMARY : colors.text }]}
          numberOfLines={1}
        >
          {banner.name}
        </Text>
        <View style={styles.cardTags}>
          <StatusBadge active={banner.active} />
          <View style={[styles.tag, { backgroundColor: colors.bgHover }]}>
            <Text style={[styles.tagText, { color: colors.textSub }]}>
              {CAT_EMOJI[banner.category]} {banner.category}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.bgHover }]}>
            <Text style={[styles.tagText, { color: colors.textSub }]}>
              {banner.displayLocation === 'marketplace' ? '🌐 Marketplace' : '🏪 Boutique'}
            </Text>
          </View>
        </View>
      </View>

      {/* Toggle */}
      <TouchableOpacity
        style={[
          styles.cardToggle,
          { backgroundColor: banner.active ? '#D1FAE5' : colors.bgHover },
        ]}
        onPress={() => onToggle(banner._id, banner.active)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={{ fontSize: 13, color: banner.active ? '#10B981' : colors.textSub }}>
          {banner.active ? '✓' : '○'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
function BottomSheet({ visible, onClose, title, children, colors }) {
  const anim = useRef(new Animated.Value(H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: H,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Overlay */}
      <TouchableOpacity
        style={styles.sheetOverlay}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Sheet panel */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.bgCard, transform: [{ translateY: anim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.sheetHandle}>
          <View style={[styles.sheetHandleBar, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
          <TouchableOpacity
            style={[styles.sheetClose, { backgroundColor: colors.bgHover }]}
            onPress={onClose}
          >
            <Ionicons name="close" size={16} color={colors.textSub} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          {children}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ─── Formulaire ──────────────────────────────────────────────────────────────
function BannerForm({
  mode, currentBanner,
  fName, setFName,
  fCat, setFCat,
  fLoc, setFLoc,
  imgUri, onPickImage, onClearImage,
  saving, deleting,
  onSave, onDelete, onClose,
  colors,
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Image actuelle (mode edit sans nouvelle image sélectionnée) */}
      {mode === 'edit' && currentBanner?.image && !imgUri && (
        <View style={styles.currentImgWrap}>
          <Image
            source={{ uri: currentBanner.image }}
            style={styles.currentImg}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.currentImgLabel}>Image actuelle</Text>
        </View>
      )}

      {/* Champ Nom */}
      <View style={styles.fieldWrap}>
        <Text style={[styles.fieldLabel, { color: colors.textSub }]}>
          NOM <Text style={{ color: '#EF4444' }}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.bgHover, borderColor: colors.border, color: colors.text }]}
          value={fName}
          onChangeText={setFName}
          placeholder="Ex : Promo de printemps 🌸"
          placeholderTextColor={colors.textDisabled}
          maxLength={60}
        />
      </View>

      {/* Catégorie */}
      <View style={styles.fieldWrap}>
        <Text style={[styles.fieldLabel, { color: colors.textSub }]}>
          CATÉGORIE <Text style={{ color: '#EF4444' }}>*</Text>
        </Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[
                styles.catBtn,
                fCat === c
                  ? { backgroundColor: PRIMARY }
                  : { backgroundColor: colors.bgHover, borderColor: colors.border, borderWidth: 1 },
              ]}
              onPress={() => setFCat(c)}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: 14 }}>{CAT_EMOJI[c]}</Text>
              <Text style={[styles.catBtnText, { color: fCat === c ? '#fff' : colors.text }]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Emplacement */}
      <View style={styles.fieldWrap}>
        <Text style={[styles.fieldLabel, { color: colors.textSub }]}>EMPLACEMENT</Text>
        <View style={[styles.locToggle, { backgroundColor: colors.bgHover }]}>
          {[['boutique', '🏪', 'Boutique'], ['marketplace', '🌐', 'Marketplace']].map(([val, ico, lbl]) => (
            <TouchableOpacity
              key={val}
              style={[
                styles.locBtn,
                fLoc === val && { backgroundColor: colors.bgCard },
              ]}
              onPress={() => setFLoc(val)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14 }}>{ico}</Text>
              <Text style={[styles.locBtnText, { color: fLoc === val ? PRIMARY : colors.textSub }]}>
                {lbl}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Image upload */}
      <View style={styles.fieldWrap}>
        <Text style={[styles.fieldLabel, { color: colors.textSub }]}>
          IMAGE {mode === 'create' && <Text style={{ color: '#EF4444' }}>*</Text>}
        </Text>
        {imgUri ? (
          <View style={styles.imgPreviewWrap}>
            <Image source={{ uri: imgUri }} style={styles.imgPreview} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.4)']}
              style={StyleSheet.absoluteFill}
            />
            <TouchableOpacity style={styles.imgClearBtn} onPress={onClearImage}>
              <Text style={styles.imgClearText}>✕ Retirer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.imgPickerBtn, { borderColor: colors.border, backgroundColor: colors.bgHover }]}
            onPress={onPickImage}
            activeOpacity={0.75}
          >
            <View style={[styles.imgPickerIcon, { backgroundColor: PRIMARY + '15' }]}>
              <Text style={{ fontSize: 22 }}>📷</Text>
            </View>
            <Text style={[styles.imgPickerTitle, { color: colors.text }]}>
              Choisir une image
            </Text>
            <Text style={[styles.imgPickerSub, { color: colors.textDisabled }]}>
              PNG, JPG — max 5 Mo
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BannièresScreen() {
  const { colors } = useTheme();
  const { seller } = useAuthStore();
  const storeId = seller?._id || seller?.id;
  const { toast, notify } = useToast();

  const [banners, setBanners]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [filterActive, setFilterActive] = useState(null);
  const [filterCat, setFilterCat]   = useState('');

  // Form state
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [mode, setMode]             = useState('idle'); // 'create' | 'edit'
  const [editId, setEditId]         = useState(null);
  const [fName, setFName]           = useState('');
  const [fCat, setFCat]             = useState('');
  const [fLoc, setFLoc]             = useState('boutique');
  const [imgUri, setImgUri]         = useState(null);
  const [imgFile, setImgFile]       = useState(null);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchBanners = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get('/api/marketing/banners');
      if (res.data?.success) setBanners(res.data.data || []);
    } catch {
      if (!silent) notify('Erreur de connexion', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchBanners(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBanners(true);
  }, [fetchBanners]);

  // ── Filtered ──────────────────────────────────────────────────────────────
  const filtered = banners.filter(b => {
    const matchSearch = !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.category.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterActive === null || b.active === filterActive;
    const matchCat    = !filterCat || b.category === filterCat;
    return matchSearch && matchStatus && matchCat;
  });

  const activeCount = banners.filter(b => b.active).length;

  // ── Form helpers ─────────────────────────────────────────────────────────
  function reset() {
    setFName(''); setFCat(''); setFLoc('boutique');
    setImgUri(null); setImgFile(null);
  }

  function openCreate() {
    reset(); setEditId(null); setMode('create'); setSheetOpen(true);
  }

  function openEdit(id) {
    const b = banners.find(x => x._id === id);
    if (!b) return;
    setFName(b.name);
    setFCat(b.category);
    setFLoc(b.displayLocation || 'boutique');
    setImgUri(b.image || null);
    setImgFile(null);
    setEditId(id);
    setMode('edit');
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setTimeout(() => { setMode('idle'); setEditId(null); reset(); }, 350);
  }

  // ── Image picker ─────────────────────────────────────────────────────────
  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission galerie refusée', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        notify('Image trop lourde — max 5 Mo', 'error');
        return;
      }
      setImgUri(asset.uri);
      setImgFile(asset);
    }
  }, [notify]);

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!fName.trim())         { notify('Nom requis', 'error'); return; }
    if (!fCat)                 { notify('Catégorie requise', 'error'); return; }
    if (mode === 'create' && !imgFile) { notify('Image requise', 'error'); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', fName.trim());
      fd.append('category', fCat);
      fd.append('displayLocation', fLoc);
      if (storeId) fd.append('storeId', storeId);
      if (imgFile) {
        const uri   = imgFile.uri;
        const name  = uri.split('/').pop();
        const match = /\.(\w+)$/.exec(name);
        const type  = match ? `image/${match[1]}` : 'image/jpeg';
        fd.append('image', { uri, name, type });
      }

      let res;
      if (mode === 'create') {
        res = await apiClient.post('/api/marketing/banners', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        res = await apiClient.put(`/api/marketing/banners/${editId}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      if (res.data?.success) {
        setBanners(prev =>
          mode === 'create'
            ? [...prev, res.data.data]
            : prev.map(b => b._id === editId ? res.data.data : b)
        );
        notify(mode === 'create' ? 'Bannière créée ✓' : 'Modifications enregistrées ✓');
        closeSheet();
      } else {
        notify(res.data?.message || 'Erreur', 'error');
      }
    } catch {
      notify('Erreur de connexion', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function handleDelete() {
    const b = banners.find(x => x._id === editId);
    Alert.alert(
      'Supprimer la bannière',
      `Supprimer "${b?.name || 'cette bannière'}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const res = await apiClient.delete(`/api/marketing/banners/${editId}`);
              if (res.data?.success) {
                setBanners(prev => prev.filter(b => b._id !== editId));
                notify('Bannière supprimée');
                closeSheet();
              } else {
                notify(res.data?.message || 'Erreur', 'error');
              }
            } catch {
              notify('Erreur de connexion', 'error');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  // ── Toggle ────────────────────────────────────────────────────────────────
  async function handleToggle(id, currentActive) {
    setBanners(prev => prev.map(b => b._id === id ? { ...b, active: !currentActive } : b));
    try {
      const res = await apiClient.put(`/api/marketing/banners/${id}`, { active: !currentActive });
      if (res.data?.success) {
        notify(!currentActive ? 'Activée ✓' : 'Désactivée');
      } else {
        // Revert
        setBanners(prev => prev.map(b => b._id === id ? { ...b, active: currentActive } : b));
        notify(res.data?.message || 'Erreur', 'error');
      }
    } catch {
      setBanners(prev => prev.map(b => b._id === id ? { ...b, active: currentActive } : b));
      notify('Erreur de connexion', 'error');
    }
  }

  const currentBanner = mode === 'edit' ? banners.find(b => b._id === editId) : null;
  const panelTitle    = mode === 'create' ? 'Nouvelle bannière' : 'Modifier';

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIcon, { backgroundColor: PRIMARY + '15' }]}>
          <Text style={{ fontSize: 28 }}>🖼</Text>
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          {search || filterCat ? 'Aucun résultat' : 'Aucune bannière'}
        </Text>
        <Text style={[styles.emptySub, { color: colors.textDisabled }]}>
          {search || filterCat
            ? 'Modifiez votre recherche.'
            : 'Créez votre première bannière promotionnelle.'}
        </Text>
        {!search && !filterCat && (
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: PRIMARY }]}
            onPress={openCreate}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyBtnText}>+ Créer</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderSkeleton = () => (
    <View style={{ gap: 10, paddingHorizontal: 16, paddingTop: 8 }}>
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={[styles.skeleton, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={[styles.skeletonThumb, { backgroundColor: colors.bgHover }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.skeletonLine, { width: '60%', backgroundColor: colors.bgHover }]} />
            <View style={[styles.skeletonLine, { width: '40%', backgroundColor: colors.bgHover }]} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* ── Sticky header ── */}
      <View style={[styles.stickyHeader, { backgroundColor: colors.bgCard + 'F5', borderBottomColor: colors.border }]}>

        {/* Title + count + CTA */}
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.screenTitle, { color: colors.text }]}>Bannières</Text>
            <Text style={[styles.screenSub, { color: colors.textDisabled }]}>
              {loading
                ? 'Chargement…'
                : `${banners.length} bannière${banners.length !== 1 ? 's' : ''} · ${activeCount} active${activeCount !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.newBtn, { backgroundColor: PRIMARY }]}
            onPress={openCreate}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newBtnText}>Nouvelle</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchWrap, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textDisabled} style={{ marginLeft: 10 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher..."
            placeholderTextColor={colors.textDisabled}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textDisabled} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBar}
        >
          {/* Status chips */}
          {[
            { label: 'Toutes', val: null },
            { label: '✓ Actives', val: true },
            { label: '○ Inactives', val: false },
          ].map(({ label, val }) => (
            <TouchableOpacity
              key={String(val)}
              style={[
                styles.chip,
                filterActive === val
                  ? { backgroundColor: PRIMARY }
                  : { backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setFilterActive(prev => prev === val ? null : val)}
            >
              <Text style={[styles.chipText, { color: filterActive === val ? '#fff' : colors.textSub }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Separator */}
          <View style={[styles.chipSep, { backgroundColor: colors.border }]} />

          {/* Category chips (emoji only) */}
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.chip,
                filterCat === cat
                  ? { backgroundColor: PRIMARY + '25', borderWidth: 1, borderColor: PRIMARY }
                  : { backgroundColor: colors.bgHover, borderWidth: 1, borderColor: colors.border },
              ]}
              onPress={() => setFilterCat(prev => prev === cat ? '' : cat)}
            >
              <Text style={{ fontSize: 14 }}>{CAT_EMOJI[cat]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── List ── */}
      {loading ? renderSkeleton() : (
        <FlatList
          data={filtered}
          keyExtractor={item => item._id}
          contentContainerStyle={[
            styles.listContent,
            filtered.length === 0 && { flex: 1 },
          ]}
          renderItem={({ item }) => (
            <BannerCard
              banner={item}
              isSelected={editId === item._id && sheetOpen}
              onPress={() => openEdit(item._id)}
              onToggle={handleToggle}
              colors={colors}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={PRIMARY}
              colors={[PRIMARY]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Bottom sheet ── */}
      <BottomSheet
        visible={sheetOpen}
        onClose={closeSheet}
        title={panelTitle}
        colors={colors}
      >
        <BannerForm
          mode={mode}
          currentBanner={currentBanner}
          fName={fName}        setFName={setFName}
          fCat={fCat}          setFCat={setFCat}
          fLoc={fLoc}          setFLoc={setFLoc}
          imgUri={imgUri}
          onPickImage={pickImage}
          onClearImage={() => { setImgUri(null); setImgFile(null); }}
          saving={saving}
          deleting={deleting}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={closeSheet}
          colors={colors}
        />

        {/* Footer buttons */}
        <View style={[styles.sheetFooter, { borderTopColor: colors.border, backgroundColor: colors.bgCard }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: '#fff', fontSize: 15 }}>{mode === 'create' ? '+' : '✓'}</Text>
            }
            <Text style={styles.saveBtnText}>
              {mode === 'create' ? 'Créer la bannière' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>

          <View style={styles.secondaryBtns}>
            {mode === 'edit' && (
              <TouchableOpacity
                style={[styles.deleteBtn, { borderColor: '#FECACA', backgroundColor: colors.bgCard }, deleting && { opacity: 0.6 }]}
                onPress={handleDelete}
                disabled={deleting}
                activeOpacity={0.85}
              >
                {deleting
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <Text>🗑</Text>
                }
                <Text style={styles.deleteBtnText}>
                  {deleting ? 'Suppression…' : 'Supprimer'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
              onPress={closeSheet}
              activeOpacity={0.85}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textSub }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* ── Toast ── */}
      <Toast msg={toast.msg} visible={toast.visible} type={toast.type} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  stickyHeader: {
    borderBottomWidth: 1,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  screenTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  screenSub:   { fontSize: 12, fontWeight: '500', marginTop: 1 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, elevation: 4,
  },
  newBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 12, borderWidth: 1, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, paddingHorizontal: 8 },

  // Filters
  filterBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 6, paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
  },
  chipText:  { fontSize: 12, fontWeight: '700' },
  chipSep:   { width: 1, height: 16, marginHorizontal: 2 },

  // List
  listContent: { padding: 16, paddingTop: 12 },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, borderRadius: 14, borderWidth: 1,
    gap: 10,
  },
  cardThumb: {
    width: 52, height: 40, borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center',
  },
  cardThumbImg: { width: '100%', height: '100%' },
  cardThumbRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: PRIMARY,
  },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { fontSize: 13, fontWeight: '700' },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cardToggle: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },

  // Badge
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
  },
  badgeActive:   { backgroundColor: '#D1FAE5' },
  badgeInactive: { backgroundColor: '#F3F4F6' },
  badgeDot:      { width: 6, height: 6, borderRadius: 3 },
  badgeText:     { fontSize: 10, fontWeight: '700' },

  // Tag
  tag: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
  },
  tagText: { fontSize: 10, fontWeight: '600' },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyIcon: { width: 60, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptySub:   { fontSize: 12, textAlign: 'center', maxWidth: 200, lineHeight: 18 },
  emptyBtn:   { marginTop: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Skeletons
  skeleton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 14, borderWidth: 1,
  },
  skeletonThumb: { width: 52, height: 40, borderRadius: 10 },
  skeletonLine:  { height: 10, borderRadius: 6 },

  // Bottom Sheet
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    elevation: 20,
  },
  sheetHandle:    { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  sheetHandleBar: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  sheetClose: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  sheetFooter: {
    paddingHorizontal: 20, paddingVertical: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    gap: 8,
  },

  // Form
  formContent: { paddingHorizontal: 20, paddingVertical: 16, gap: 18 },
  fieldWrap:   { gap: 8 },
  fieldLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14,
  },

  // Category grid
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, minWidth: '47%',
  },
  catBtnText: { fontSize: 13, fontWeight: '600' },

  // Location toggle
  locToggle: {
    flexDirection: 'row', borderRadius: 12, padding: 4,
  },
  locBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10,
  },
  locBtnText: { fontSize: 14, fontWeight: '700' },

  // Image picker
  imgPickerBtn: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 16,
    paddingVertical: 28, alignItems: 'center', gap: 8,
  },
  imgPickerIcon: {
    width: 50, height: 50, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  imgPickerTitle: { fontSize: 14, fontWeight: '700' },
  imgPickerSub:   { fontSize: 12 },

  // Image preview
  imgPreviewWrap: { borderRadius: 14, overflow: 'hidden', height: 140 },
  imgPreview:     { width: '100%', height: '100%' },
  imgClearBtn: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10,
  },
  imgClearText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Current image (edit mode)
  currentImgWrap: { borderRadius: 14, overflow: 'hidden', height: 110 },
  currentImg:     { width: '100%', height: '100%' },
  currentImgLabel: {
    position: 'absolute', bottom: 10, left: 12,
    fontSize: 11, fontWeight: '600', color: '#fff',
  },

  // Form buttons
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY, borderRadius: 14,
    paddingVertical: 14,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, elevation: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  secondaryBtns: { flexDirection: 'row', gap: 8 },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },

  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700' },

  // Toast
  toast: {
    position: 'absolute', bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, elevation: 8,
  },
  toastSuccess: { backgroundColor: '#111827' },
  toastError:   { backgroundColor: '#EF4444' },
  toastText:    { fontSize: 13, fontWeight: '700', color: '#fff' },
});
