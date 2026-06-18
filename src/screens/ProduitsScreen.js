import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Animated,
  TouchableWithoutFeedback, PanResponder, Dimensions,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStore } from '../stores/syncStore';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { syncService } from '../services/syncService';
import apiClient from '../config/api';
import SUBSCRIPTION_CONFIG from '../config/subscriptionConfig';

const W = Dimensions.get('window').width;

// ─── Statuts (identiques au web) ─────────────────────────────────────────────
const STATUS = {
  Published:   { label: 'Publié',    bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
  UnPublished: { label: 'Non publié',bg: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
  Attente:     { label: 'En attente',bg: '#FFFBEB', color: '#92400E', dot: '#F59E0B' },
  Refuser:     { label: 'Refusé',    bg: '#FEF2F2', color: '#B91C1C', dot: '#EF4444' },
};
const STATUS_FILTERS = ['All', 'Published', 'UnPublished', 'Attente', 'Refuser'];
const STATUS_LABELS = { All: 'Tous', Published: 'Publié', UnPublished: 'Non publié', Attente: 'En attente', Refuser: 'Refusé' };

function fmt(n) { return Number(n || 0).toLocaleString('fr-FR'); }

// ─── Badge statut ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.UnPublished;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Card produit (mode grille) ───────────────────────────────────────────────
function ProduitCard({ produit, onPress, colors }) {
  const hasPromo = produit.prixPromo > 0;
  const stock = produit.variants?.length
    ? produit.variants.reduce((s, v) => s + (v.stock || 0), 0)
    : (produit.quantite ?? 0);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
      onPress={() => onPress(produit)}
      activeOpacity={0.85}
    >
      {/* Image */}
      <View style={[styles.cardImgWrap, { backgroundColor: colors.bgHover }]}>
        {produit.image1
          ? <CachedImage uri={produit.image1} style={styles.cardImg} contentFit="cover" />
          : <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
        }
        <View style={styles.cardStatusPos}>
          <StatusBadge status={produit.isPublished} />
        </View>
      </View>

      {/* Infos */}
      <View style={styles.cardBody}>
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={2}>{produit.name}</Text>
        {produit.marque ? (
          <Text style={[styles.cardBrand, { color: colors.textMuted }]} numberOfLines={1}>{produit.marque}</Text>
        ) : null}
        <View style={styles.cardFooter}>
          <View>
            {hasPromo ? (
              <>
                <Text style={[styles.cardPrixOld, { color: colors.textMuted }]}>{fmt(produit.prix)} ₣</Text>
                <Text style={[styles.cardPrix, { color: '#EF4444' }]}>{fmt(produit.prixPromo)} ₣</Text>
              </>
            ) : (
              <Text style={[styles.cardPrix, { color: colors.primary }]}>{fmt(produit.prix)} ₣</Text>
            )}
          </View>
          <View style={[styles.stockBadge, { backgroundColor: stock < 5 ? '#FEF2F2' : colors.bgHover }]}>
            <Text style={[styles.stockText, { color: stock < 5 ? '#B91C1C' : colors.textMuted }]}>
              {stock} en stock
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Ligne produit (mode liste) ───────────────────────────────────────────────
function ProduitRow({ produit, onPress, colors }) {
  const hasPromo = produit.prixPromo > 0;
  const stock = produit.variants?.length
    ? produit.variants.reduce((s, v) => s + (v.stock || 0), 0)
    : (produit.quantite ?? 0);

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={() => onPress(produit)}
      activeOpacity={0.85}
    >
      <View style={[styles.rowImg, { backgroundColor: colors.bgHover }]}>
        {produit.image1
          ? <CachedImage uri={produit.image1} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
        }
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{produit.name}</Text>
        <Text style={[styles.rowBrand, { color: colors.textMuted }]} numberOfLines={1}>
          {produit.marque || 'Sans marque'}
        </Text>
        <StatusBadge status={produit.isPublished} />
      </View>
      <View style={styles.rowRight}>
        {hasPromo ? (
          <>
            <Text style={[styles.rowPrixOld, { color: colors.textMuted }]}>{fmt(produit.prix)} ₣</Text>
            <Text style={[styles.rowPrix, { color: '#EF4444' }]}>{fmt(produit.prixPromo)} ₣</Text>
          </>
        ) : (
          <Text style={[styles.rowPrix, { color: colors.primary }]}>{fmt(produit.prix)} ₣</Text>
        )}
        <Text style={[styles.rowStock, { color: stock < 5 ? '#EF4444' : colors.textMuted }]}>
          {stock} en stock
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  );
}

// ─── Modal détail produit ─────────────────────────────────────────────────────
const DETAIL_H = Dimensions.get('window').height * 0.85;

function ProduitDetailModal({ produit, visible, onClose, onEdit, colors }) {
  const slideAnim = useRef(new Animated.Value(DETAIL_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      slideAnim.setValue(DETAIL_H);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [mounted, visible]);

  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: DETAIL_H, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => { setMounted(false); setActiveImg(0); setActiveTab('details'); cb?.(); });
  };

  const handleClose = () => dismiss(onClose);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 100 || g.vy > 1) handleClose();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  if (!mounted || !produit) return null;

  const images = [produit.image1, produit.image2, produit.image3].filter(Boolean);
  const hasPromo = produit.prixPromo > 0;
  const stock = produit.variants?.length
    ? produit.variants.reduce((s, v) => s + (v.stock || 0), 0)
    : (produit.quantite ?? 0);

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.detailSheet, { backgroundColor: colors.bgCard, transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.detailTopRow}>
          <View {...panResponder.panHandlers} style={[styles.handleArea, { flex: 1 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          <TouchableOpacity
            style={[styles.editBtn, { backgroundColor: colors.primaryLight }]}
            onPress={() => { dismiss(() => { onClose(); onEdit(produit); }); }}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={[styles.editBtnText, { color: colors.primary }]}>Modifier</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={[{ key: 'content' }]}
          renderItem={() => (
            <View>
              {/* Galerie images */}
              <View style={[styles.detailImgContainer, { backgroundColor: colors.bgHover }]}>
                {images.length > 0
                  ? <CachedImage uri={images[activeImg]} style={styles.detailMainImg} contentFit="contain" />
                  : <Ionicons name="cube-outline" size={64} color={colors.textMuted} />
                }
              </View>
              {images.length > 1 && (
                <View style={styles.detailThumbs}>
                  {images.map((img, i) => (
                    <TouchableOpacity key={i} onPress={() => setActiveImg(i)} activeOpacity={0.8}>
                      <CachedImage
                        uri={img}
                        style={[styles.detailThumb, { borderColor: i === activeImg ? colors.primary : colors.border }]}
                        contentFit="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Nom + Statut */}
              <View style={styles.detailHeader}>
                <View style={styles.detailTitleRow}>
                  <Text style={[styles.detailName, { color: colors.text }]} numberOfLines={2}>{produit.name}</Text>
                  <StatusBadge status={produit.isPublished} />
                </View>
                {produit.marque ? (
                  <Text style={[styles.detailBrand, { color: colors.textMuted }]}>{produit.marque}</Text>
                ) : null}
                <View style={styles.detailPrixRow}>
                  {hasPromo ? (
                    <>
                      <Text style={[styles.detailPrix, { color: '#EF4444' }]}>{fmt(produit.prixPromo)} ₣</Text>
                      <Text style={[styles.detailPrixOld, { color: colors.textMuted }]}>{fmt(produit.prix)} ₣</Text>
                    </>
                  ) : (
                    <Text style={[styles.detailPrix, { color: colors.primary }]}>{fmt(produit.prix)} ₣</Text>
                  )}
                </View>
              </View>

              {/* Tabs */}
              <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
                {['details', 'livraison'].map(tab => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  >
                    <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textMuted, fontWeight: activeTab === tab ? '700' : '500' }]}>
                      {tab === 'details' ? 'Détails' : 'Livraison'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Contenu tab Détails */}
              {activeTab === 'details' && (
                <View style={styles.tabContent}>
                  <InfoRow label="Stock" value={`${stock} unités`} colors={colors} icon="cube-outline" />
                  {produit.quantite !== undefined && !produit.variants?.length && (
                    <InfoRow label="Quantité" value={`${produit.quantite} unités`} colors={colors} icon="layers-outline" />
                  )}
                  {produit.description ? (
                    <View style={styles.descBlock}>
                      <Text style={[styles.descLabel, { color: colors.textMuted }]}>Description</Text>
                      <Text style={[styles.descText, { color: colors.text }]}>
                        {produit.description?.replace(/<[^>]*>/g, '') || '—'}
                      </Text>
                    </View>
                  ) : null}

                  {/* Variantes */}
                  {produit.variants?.length > 0 && (
                    <View style={styles.variantesBlock}>
                      <Text style={[styles.variantesTitle, { color: colors.text }]}>Variantes</Text>
                      <View style={styles.variantesGrid}>
                        {produit.variants.map((v, i) => (
                          <View key={i} style={[styles.varianteCard, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
                            {v.imageUrl
                              ? <CachedImage uri={v.imageUrl} style={styles.varianteImg} contentFit="cover" />
                              : null
                            }
                            <View style={[styles.varianteDot, { backgroundColor: v.color || '#9CA3AF' }]} />
                            <Text style={[styles.varianteStock, { color: colors.text }]}>{v.stock} en stock</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Contenu tab Livraison */}
              {activeTab === 'livraison' && (
                <View style={styles.tabContent}>
                  {produit.shipping?.weight ? (
                    <InfoRow label="Poids" value={`${produit.shipping.weight} kg`} colors={colors} icon="scale-outline" />
                  ) : null}
                  {produit.shipping?.origine ? (
                    <InfoRow label="Origine" value={produit.shipping.origine} colors={colors} icon="location-outline" />
                  ) : null}
                  {!produit.shipping?.weight && !produit.shipping?.origine && (
                    <Text style={[styles.emptyText, { color: colors.textMuted }]}>Aucune info de livraison</Text>
                  )}
                </View>
              )}
            </View>
          )}
          keyExtractor={item => item.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </Animated.View>
    </Modal>
  );
}

function InfoRow({ label, value, colors, icon }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name={icon} size={14} color={colors.primary} />
      </View>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function ProduitsScreen({ navigation }) {
  const { colors } = useTheme();
  const { seller, subscription } = useAuthStore();
  const produits = useSyncStore((s) => s.produits) ?? [];
  const produitsStats = useSyncStore((s) => s.produitsStats);
  const { triggerSync, isSyncing, isOffline } = useSync();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [selectedProduit, setSelectedProduit] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [serverResults, setServerResults] = useState(null); // null = utilise SQLite local
  const searchTimeout = useRef(null);

  const sellerId = seller?._id || seller?.id;

  // ── Recherche avec debounce ─────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (search.trim().length === 0) {
      setServerResults(null);
      return;
    }
    if (search.trim().length < 2) return;

    searchTimeout.current = setTimeout(async () => {
      if (isOffline) {
        // Offline → recherche locale dans le store
        setServerResults(null);
        return;
      }
      setLoading(true);
      try {
        const res = await apiClient.get(`/searchProductByNameBySeller/${encodeURIComponent(search.trim())}/${sellerId}?limit=30`);
        const d = res.data;
        setServerResults(d?.products || d?.data || []);
      } catch (_) {
        setServerResults(null);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(searchTimeout.current);
  }, [search, isOffline]);

  // ── Chargement page suivante ────────────────────────────────────────────────
  const loadNextPage = useCallback(async () => {
    if (loading || !hasMore || isOffline) return;
    setLoading(true);
    try {
      const more = await syncService.fetchNextProduitsPage();
      setHasMore(more);
      setPage(p => p + 1);
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [loading, hasMore, isOffline]);

  // Initialise hasMore depuis produitsStats
  useEffect(() => {
    setHasMore(produitsStats?.hasMore ?? false);
  }, [produitsStats]);

  // ── Données à afficher ──────────────────────────────────────────────────────
  const displayData = (() => {
    let base = serverResults !== null ? serverResults : produits;

    // Déduplication — un produit local (local_xxx) et son équivalent serveur
    // peuvent coexister brièvement pendant la sync. On garde uniquement le serveur.
    const seenNames = new Map(); // nom+prix → index
    const deduped = [];
    for (const p of base) {
      const isLocal = String(p._id).startsWith('local_');
      const key = `${p.name?.toLowerCase()}_${p.prix}`;
      if (isLocal) {
        // Produit local : ajouter seulement si pas déjà un produit serveur avec même nom+prix
        if (!seenNames.has(key)) {
          seenNames.set(key, deduped.length);
          deduped.push(p);
        }
      } else {
        // Produit serveur : s'il y avait un local avec même key, le remplacer
        if (seenNames.has(key)) {
          deduped[seenNames.get(key)] = p;
        } else {
          seenNames.set(key, deduped.length);
          deduped.push(p);
        }
      }
    }
    base = deduped;

    // Filtre par statut
    if (statusFilter !== 'All') {
      base = base.filter(p => p.isPublished === statusFilter);
    }

    // Recherche locale si offline
    if (search.trim().length >= 2 && serverResults === null) {
      const q = search.toLowerCase();
      base = base.filter(p => p.name?.toLowerCase().includes(q) || p.marque?.toLowerCase().includes(q));
    }

    return base;
  })();

  const onPressProduit = (p) => {
    setSelectedProduit(p);
    setDetailVisible(true);
  };

  const numCols = viewMode === 'grid' ? 2 : 1;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
        {/* Barre de recherche */}
        <View style={[styles.searchWrap, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Rechercher un produit..."
            placeholderTextColor={colors.textPlaceholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setServerResults(null); }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filtres statut + vue */}
        <View style={styles.toolbarRow}>
          <View style={styles.statusFilters}>
            {STATUS_FILTERS.map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setStatusFilter(f)}
                style={[
                  styles.filterChip,
                  { backgroundColor: colors.bgHover, borderColor: colors.border },
                  statusFilter === f && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text style={[styles.filterChipText, { color: statusFilter === f ? '#fff' : colors.textSub }]}>
                  {STATUS_LABELS[f]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              onPress={() => setViewMode('grid')}
              style={[styles.viewBtn, viewMode === 'grid' && { backgroundColor: colors.primary }]}
            >
              <Ionicons name="grid-outline" size={16} color={viewMode === 'grid' ? '#fff' : colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              style={[styles.viewBtn, viewMode === 'list' && { backgroundColor: colors.primary }]}
            >
              <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? '#fff' : colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Text style={[styles.statsText, { color: colors.textMuted }]}>
            {displayData.length} produit(s)
            {produitsStats?.totalPublished !== undefined ? ` · ${produitsStats.totalPublished} publié(s)` : ''}
          </Text>
          {isOffline && (
            <View style={[styles.offlineBadge, { backgroundColor: colors.bgWarning }]}>
              <Ionicons name="cloud-offline-outline" size={11} color={colors.warningText} />
              <Text style={[styles.offlineBadgeText, { color: colors.warningText }]}>Hors ligne</Text>
            </View>
          )}
        </View>
      </View>

      {/* Liste */}
      <FlatList
        key={viewMode}
        data={displayData}
        keyExtractor={p => String(p._id)}
        numColumns={numCols}
        columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
        contentContainerStyle={[styles.listContent, displayData.length === 0 && { flex: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={() => { triggerSync(); setPage(1); setHasMore(produitsStats?.hasMore ?? false); }}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) =>
          viewMode === 'grid'
            ? <ProduitCard produit={item} onPress={onPressProduit} colors={colors} />
            : <ProduitRow produit={item} onPress={onPressProduit} colors={colors} />
        }
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loading ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.footerText, { color: colors.textMuted }]}>Chargement...</Text>
            </View>
          ) : hasMore && !loading ? (
            <TouchableOpacity style={[styles.loadMoreBtn, { borderColor: colors.border }]} onPress={loadNextPage}>
              <Text style={[styles.loadMoreText, { color: colors.primary }]}>Charger plus</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          !isSyncing && (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {search.length > 0 ? 'Aucun résultat' : 'Aucun produit'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {search.length > 0 ? `Aucun produit pour "${search}"` : 'Vos produits apparaîtront ici'}
              </Text>
            </View>
          )
        }
      />

      {/* FAB — nouveau produit */}
      {(() => {
        const planName = subscription?.planName || 'Starter';
        const limit = SUBSCRIPTION_CONFIG.getPlan(planName)?.productLimit ?? -1;
        const total = produits.length;
        const atLimit = limit !== -1 && total >= limit;
        return (
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: atLimit ? '#9CA3AF' : colors.primary }]}
            onPress={() => {
              if (atLimit) { navigation.navigate('Abonnement'); return; }
              navigation.navigate('ProduitUpdate', { produit: null });
            }}
            activeOpacity={0.85}
          >
            <Ionicons name={atLimit ? 'lock-closed' : 'add'} size={atLimit ? 20 : 26} color="#fff" />
          </TouchableOpacity>
        );
      })()}

      {/* Modal détail */}
      <ProduitDetailModal
        produit={selectedProduit}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        onEdit={(p) => navigation.navigate('ProduitUpdate', { produit: p })}
        colors={colors}
      />
    </View>
  );
}

const CARD_W = (W - 32 - 10) / 2;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Toolbar
  toolbar: { borderBottomWidth: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 10 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusFilters: { flexDirection: 'row', gap: 6, flexWrap: 'nowrap' },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  filterChipText: { fontSize: 11, fontWeight: '600' },
  viewToggle: { flexDirection: 'row', gap: 4 },
  viewBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsText: { fontSize: 11 },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  offlineBadgeText: { fontSize: 10, fontWeight: '600' },

  // Liste
  listContent: { padding: 12, paddingBottom: 32 },
  gridRow: { gap: 10, marginBottom: 10 },

  // Card grille
  card: { width: CARD_W, borderRadius: 14, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2 },
  cardImgWrap: { width: '100%', height: CARD_W * 0.85, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  cardImg: { width: '100%', height: '100%' },
  cardStatusPos: { position: 'absolute', top: 8, left: 8 },
  cardBody: { padding: 10, gap: 4 },
  cardName: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardBrand: { fontSize: 11 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 },
  cardPrix: { fontSize: 14, fontWeight: '800' },
  cardPrixOld: { fontSize: 11, textDecorationLine: 'line-through' },
  stockBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  stockText: { fontSize: 10, fontWeight: '600' },

  // Row liste
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, gap: 12, marginBottom: 2 },
  rowImg: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  rowInfo: { flex: 1, gap: 3 },
  rowName: { fontSize: 14, fontWeight: '700' },
  rowBrand: { fontSize: 12 },
  rowRight: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  rowPrix: { fontSize: 14, fontWeight: '800' },
  rowPrixOld: { fontSize: 11, textDecorationLine: 'line-through' },
  rowStock: { fontSize: 11 },

  // Status badge
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },

  // Footer list
  footerLoader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  footerText: { fontSize: 12 },
  loadMoreBtn: { marginHorizontal: 16, marginVertical: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  loadMoreText: { fontSize: 14, fontWeight: '600' },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center' },

  // FAB
  fab: { position: 'absolute', bottom: 20, right: 20, width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, elevation: 8 },

  // Modal backdrop + sheet
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  detailSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: DETAIL_H, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, elevation: 24,
    overflow: 'hidden',
  },
  detailTopRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 4 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  editBtnText: { fontSize: 13, fontWeight: '700' },
  handleArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 6 },
  handle: { width: 40, height: 4, borderRadius: 2 },

  // Détail produit
  detailImgContainer: { height: 240, justifyContent: 'center', alignItems: 'center', marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
  detailMainImg: { width: '100%', height: '100%' },
  detailThumbs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  detailThumb: { width: 52, height: 52, borderRadius: 10, borderWidth: 2 },
  detailHeader: { paddingHorizontal: 16, paddingTop: 14, gap: 4 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  detailName: { fontSize: 18, fontWeight: '800', flex: 1 },
  detailBrand: { fontSize: 13 },
  detailPrixRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  detailPrix: { fontSize: 22, fontWeight: '800' },
  detailPrixOld: { fontSize: 14, textDecorationLine: 'line-through' },
  tabRow: { flexDirection: 'row', marginTop: 16, marginHorizontal: 16, borderBottomWidth: 1 },
  tab: { paddingVertical: 10, paddingHorizontal: 16, marginBottom: -1 },
  tabText: { fontSize: 14 },
  tabContent: { paddingHorizontal: 16, paddingTop: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, gap: 12 },
  infoIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600' },
  descBlock: { paddingVertical: 12, gap: 6 },
  descLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  descText: { fontSize: 13, lineHeight: 20 },
  variantesBlock: { paddingVertical: 12, gap: 10 },
  variantesTitle: { fontSize: 14, fontWeight: '700' },
  variantesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  varianteCard: { width: 72, alignItems: 'center', gap: 4, padding: 8, borderRadius: 12, borderWidth: 1 },
  varianteImg: { width: 44, height: 44, borderRadius: 8 },
  varianteDot: { width: 16, height: 16, borderRadius: 8 },
  varianteStock: { fontSize: 10, fontWeight: '600' },
});
