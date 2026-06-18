import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl,
  Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import CachedImage from '../components/CachedImage';
import { useSyncStore } from '../stores/syncStore';
import { useSync } from '../hooks/useSync';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../context/ThemeContext';
import { syncService } from '../services/syncService';

const W          = Dimensions.get('window').width;
const PRIMARY    = '#30A08B';
const CHUNK_SIZE = 20; // produits chargés par tranche (comme ProduitsScreen)

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

// ── Calcul stock d'un produit (identique ProduitsScreen) ──────────────────────
function getStock(p) {
  if (p.variants?.length) return p.variants.reduce((s, v) => s + (v.stock || 0), 0);
  return p.stockPrincipal ?? p.stockTotal ?? p.quantite ?? 0;
}

// ── Statut stock ──────────────────────────────────────────────────────────────
function getStockStatus(stock, threshold) {
  if (stock === 0)             return 'outOfStock';
  if (stock <= threshold)      return 'low';
  return 'ok';
}

// ── Badge statut ──────────────────────────────────────────────────────────────
function StockBadge({ stock, threshold }) {
  const status = getStockStatus(stock, threshold);
  if (status === 'outOfStock') return (
    <View style={[styles.badge, { backgroundColor: '#FEF2F2' }]}>
      <Ionicons name="close-circle" size={11} color="#EF4444" />
      <Text style={[styles.badgeText, { color: '#B91C1C' }]}>Rupture</Text>
    </View>
  );
  if (status === 'low') return (
    <View style={[styles.badge, { backgroundColor: '#FFFBEB' }]}>
      <Ionicons name="warning" size={11} color="#F59E0B" />
      <Text style={[styles.badgeText, { color: '#92400E' }]}>Stock bas</Text>
    </View>
  );
  return (
    <View style={[styles.badge, { backgroundColor: '#ECFDF5' }]}>
      <Ionicons name="checkmark-circle" size={11} color="#10B981" />
      <Text style={[styles.badgeText, { color: '#065F46' }]}>OK</Text>
    </View>
  );
}

// ── Éditeur de stock inline ────────────────────────────────────────────────────
function StockEditor({ currentStock, onSave, onCancel, colors }) {
  const [val, setVal] = useState(String(currentStock));
  return (
    <View style={styles.editorWrap}>
      <TextInput
        style={[styles.editorInput, { borderColor: PRIMARY, color: colors.text, backgroundColor: colors.bgInput }]}
        value={val}
        onChangeText={setVal}
        keyboardType="numeric"
        autoFocus
        selectTextOnFocus
      />
      <TouchableOpacity onPress={() => onSave(parseInt(val) || 0)} style={styles.editorBtn}>
        <Ionicons name="checkmark" size={17} color={PRIMARY} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={styles.editorBtn}>
        <Ionicons name="close" size={17} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  );
}

// ── Ligne produit ─────────────────────────────────────────────────────────────
function ProductRow({ product, threshold, onAdjust, colors, isPendingSync }) {
  const [expanded, setExpanded] = useState(false);
  const [editingMain, setEditingMain] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);

  const stock = getStock(product);
  const hasVariants = product.variants?.length > 0;

  const handleSaveMain = async (newStock) => {
    setEditingMain(false);
    await onAdjust(product._id, newStock, null);
  };

  const handleSaveVariant = async (variantId, newStock) => {
    setEditingVariant(null);
    await onAdjust(product._id, newStock, variantId);
  };

  return (
    <View style={[
      styles.productCard,
      { backgroundColor: colors.bgCard, borderColor: colors.border },
      isPendingSync && styles.cardPending,
    ]}>
      {/* Ligne principale */}
      <View style={styles.productRow}>
        {/* Badge offline en attente */}
        {isPendingSync && (
          <View style={styles.pendingDot}>
            <Ionicons name="cloud-upload-outline" size={10} color="#F59E0B" />
          </View>
        )}

        {/* Image */}
        <View style={[styles.productImg, { backgroundColor: colors.bgHover }]}>
          {(product.picture || product.image1)
            ? <CachedImage
                uri={product.picture || product.image1}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            : <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
          }
        </View>

        {/* Infos */}
        <View style={styles.productInfo}>
          <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={[styles.productPrice, { color: colors.textMuted }]}>
            {fmt(product.prix)} FCFA
          </Text>
          {product.marque ? (
            <Text style={[styles.productBrand, { color: colors.textMuted }]} numberOfLines={1}>
              {product.marque}
            </Text>
          ) : null}
        </View>

        {/* Stock + Statut */}
        <View style={styles.productRight}>
          <StockBadge stock={stock} threshold={threshold} />
          <View style={styles.stockArea}>
            {hasVariants ? (
              <Text style={[styles.stockNum, { color: colors.text }]}>{stock}</Text>
            ) : editingMain ? (
              <StockEditor
                currentStock={product.stockPrincipal ?? product.quantite ?? 0}
                onSave={handleSaveMain}
                onCancel={() => setEditingMain(false)}
                colors={colors}
              />
            ) : (
              <View style={styles.stockNumRow}>
                <Text style={[styles.stockNum, { color: colors.text }]}>
                  {product.stockPrincipal ?? product.quantite ?? 0}
                </Text>
                <TouchableOpacity onPress={() => setEditingMain(true)} style={styles.editIcon}>
                  <Ionicons name="create-outline" size={15} color={PRIMARY} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Bouton variantes */}
      {hasVariants && (
        <TouchableOpacity
          style={[styles.variantsToggle, { borderTopColor: colors.border }]}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <Ionicons name="color-palette-outline" size={13} color={PRIMARY} />
          <Text style={[styles.variantsToggleText, { color: PRIMARY }]}>
            {product.variants.length} variante(s)
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={PRIMARY} />
        </TouchableOpacity>
      )}

      {/* Variantes dépliées */}
      {expanded && product.variants.map((v, i) => {
        const vStock = v.stock ?? 0;
        return (
          <View
            key={v._id || i}
            style={[styles.variantRow, { borderTopColor: colors.border, backgroundColor: colors.bgHover }]}
          >
            <View style={styles.variantLeft}>
              {v.imageUrl
                ? <CachedImage uri={v.imageUrl} style={styles.variantImg} contentFit="cover" />
                : <View style={[styles.colorDot, { backgroundColor: v.colorCode || v.color || '#9CA3AF' }]} />
              }
              <View style={styles.variantTexts}>
                <Text style={[styles.variantColor, { color: colors.text }]}>{v.color || `Variante ${i + 1}`}</Text>
                {v.sizes?.length > 0 && (
                  <Text style={[styles.variantSizes, { color: colors.textMuted }]}>{v.sizes.join(', ')}</Text>
                )}
              </View>
            </View>
            <View style={styles.variantRight}>
              <StockBadge stock={vStock} threshold={threshold} />
              {editingVariant === (v._id || i) ? (
                <StockEditor
                  currentStock={vStock}
                  onSave={(s) => handleSaveVariant(v._id, s)}
                  onCancel={() => setEditingVariant(null)}
                  colors={colors}
                />
              ) : (
                <View style={styles.stockNumRow}>
                  <Text style={[styles.stockNum, { color: colors.text }]}>{vStock}</Text>
                  <TouchableOpacity onPress={() => setEditingVariant(v._id || i)} style={styles.editIcon}>
                    <Ionicons name="create-outline" size={15} color={PRIMARY} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Écran principal ────────────────────────────────────────────────────────────
export default function InventaireScreen() {
  const { colors } = useTheme();
  const { seller } = useAuthStore();
  const produits = useSyncStore((s) => s.produits) ?? [];
  const { triggerSync, isSyncing, isOffline } = useSync();

  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [threshold, setThreshold]   = useState(5);
  const [saving, setSaving]         = useState(false);
  const [exporting, setExporting]   = useState(false);
  // Pagination locale — on tranche le tableau filtré (données déjà en store)
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);
  // Map des ajustements optimistes en attente (produitId -> { newStock, variantId })
  const [pendingAdjusts, setPendingAdjusts] = useState({});

  // ── Calcul des stats directement depuis le store (offline inclus) ──────────
  const stats = useMemo(() => {
    let total = 0, outOfStock = 0, lowStock = 0, ok = 0;
    produits.forEach(p => {
      total++;
      const stock = getStock(p);
      const status = getStockStatus(stock, threshold);
      if (status === 'outOfStock') outOfStock++;
      else if (status === 'low')   lowStock++;
      else                         ok++;
    });
    return { total, outOfStock, lowStock, ok };
  }, [produits, threshold]);

  // ── Vue enrichie avec stockPrincipal + isLow + isOutOfStock calculés ────────
  const enrichedProduits = useMemo(() => {
    return produits.map(p => {
      const pendingKey = p._id;
      const pending = pendingAdjusts[pendingKey];
      // Appliquer l'ajustement optimiste si existant
      let base = p;
      if (pending && !pending.variantId) {
        base = { ...p, stockPrincipal: pending.newStock, quantite: pending.newStock };
      } else if (pending && pending.variantId) {
        base = {
          ...p,
          variants: p.variants?.map(v =>
            String(v._id) === String(pending.variantId)
              ? { ...v, stock: pending.newStock }
              : v
          ),
        };
      }
      const stock = getStock(base);
      return {
        ...base,
        _computedStock: stock,
        isOutOfStock: stock === 0,
        isLow: stock > 0 && stock <= threshold,
      };
    });
  }, [produits, threshold, pendingAdjusts]);

  // ── Filtrage complet (toute la liste — pour stats PDF et compteurs) ─────────
  const filtered = useMemo(() => {
    return enrichedProduits.filter(p => {
      const matchSearch = !search.trim() || p.name?.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === 'all' ||
        (filter === 'outOfStock' && p.isOutOfStock) ||
        (filter === 'low'        && p.isLow && !p.isOutOfStock) ||
        (filter === 'ok'         && !p.isLow && !p.isOutOfStock);
      return matchSearch && matchFilter;
    });
  }, [enrichedProduits, search, filter]);

  // Reset la tranche dès que le filtre ou la recherche change
  useEffect(() => { setVisibleCount(CHUNK_SIZE); }, [search, filter, threshold]);

  // Tranche visible — ce que la FlatList affiche réellement
  const displayData = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const hasMore = visibleCount < filtered.length;

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setVisibleCount(prev => Math.min(prev + CHUNK_SIZE, filtered.length));
  }, [hasMore, filtered.length]);

  // ── Ajustement stock — offline-first ──────────────────────────────────────
  const handleAdjust = useCallback(async (produitId, newStock, variantId) => {
    // 1. Mise à jour optimiste du store local
    const pendingKey = produitId;
    setPendingAdjusts(prev => ({ ...prev, [pendingKey]: { newStock, variantId } }));

    // 2. Mise à jour optimiste dans le syncStore (produits en mémoire)
    const store = useSyncStore.getState();
    store.setStoreData('produits', (store.produits ?? []).map(p => {
      if (String(p._id) !== String(produitId)) return p;
      if (variantId) {
        return {
          ...p,
          variants: p.variants?.map(v =>
            String(v._id) === String(variantId)
              ? { ...v, stock: newStock }
              : v
          ),
        };
      }
      return { ...p, stockPrincipal: newStock, quantite: newStock };
    }));

    // 3. Queue la mutation
    setSaving(true);
    try {
      if (isOffline) {
        // Offline → queue seulement, pas d'appel réseau
        await syncService.queueMutation('ADJUST_STOCK', { produitId, stock: newStock, variantId: variantId || null });
      } else {
        // Online → PATCH direct + invalide le cache produits
        await syncService.queueMutation('ADJUST_STOCK', { produitId, stock: newStock, variantId: variantId || null });
        // Flush immédiat de la queue pour envoyer au serveur
        await syncService.pushPendingMutations();
      }
    } catch (e) {
      console.error('Adjust stock error:', e);
    } finally {
      setSaving(false);
      // Retire du pendingAdjusts car le store est déjà à jour
      setPendingAdjusts(prev => {
        const next = { ...prev };
        delete next[pendingKey];
        return next;
      });
    }
  }, [isOffline]);

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    setExporting(true);
    try {
      const storeName = seller?.storeName || seller?.name || 'Ma boutique';
      const today = new Date().toLocaleDateString('fr-FR', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      const rows = filtered.map(p => {
        const isOutOfStock = p.isOutOfStock;
        const isLow = p.isLow;
        const statusLabel = isOutOfStock ? 'Rupture' : isLow ? 'Stock bas' : 'OK';
        const statusColor = isOutOfStock ? '#dc2626' : isLow ? '#d97706' : '#16a34a';

        if (p.variants?.length > 0) {
          return p.variants.map(v => {
            const vStock = v.stock ?? 0;
            const vOOS = vStock === 0;
            const vLow = vStock > 0 && vStock <= threshold;
            const vLabel = vOOS ? 'Rupture' : vLow ? 'Stock bas' : 'OK';
            const vColor = vOOS ? '#dc2626' : vLow ? '#d97706' : '#16a34a';
            return `<tr>
              <td>${p.name}</td>
              <td>${v.sizes?.length ? `${v.color} / ${v.sizes.join(', ')}` : (v.color || '—')}</td>
              <td class="c">${vStock}</td>
              <td class="r">${fmt(p.prix)} FCFA</td>
              <td class="c" style="color:${vColor};font-weight:700">${vLabel}</td>
            </tr>`;
          }).join('');
        }
        const s = p.stockPrincipal ?? p.quantite ?? 0;
        return `<tr>
          <td>${p.name}</td><td>—</td>
          <td class="c">${s}</td>
          <td class="r">${fmt(p.prix)} FCFA</td>
          <td class="c" style="color:${statusColor};font-weight:700">${statusLabel}</td>
        </tr>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:10px;color:#111;margin:0;padding:0}
  .hdr{background:#30A08B;color:#fff;padding:16px 20px}
  .hdr h1{margin:0;font-size:17px}
  .hdr p{margin:3px 0 0;font-size:10px;opacity:.85}
  .stats{display:flex;border-bottom:1px solid #e2e8f0}
  .stat{flex:1;padding:10px 16px;border-right:1px solid #e2e8f0}
  .stat:last-child{border-right:none}
  .stat b{display:block;font-size:20px}
  .stat span{font-size:9px;color:#64748b}
  table{width:100%;border-collapse:collapse}
  th{background:#30A08B;color:#fff;padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:9.5px}
  tr:nth-child(even) td{background:#f5fdf9}
  .c{text-align:center}.r{text-align:right}
  .footer{padding:10px 20px;font-size:8px;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:12px}
  .offline{background:#FFFBEB;padding:6px 16px;font-size:9px;color:#92400E}
</style>
</head><body>
<div class="hdr">
  <h1>Inventaire — ${storeName}</h1>
  <p>${today} · Seuil d'alerte : ${threshold} unités</p>
</div>
<div class="stats">
  <div class="stat"><b style="color:#30A08B">${stats.total}</b><span>Total</span></div>
  <div class="stat"><b style="color:#ef4444">${stats.outOfStock}</b><span>Rupture</span></div>
  <div class="stat"><b style="color:#f59e0b">${stats.lowStock}</b><span>Stock bas</span></div>
  <div class="stat"><b style="color:#22c55e">${stats.ok}</b><span>OK</span></div>
</div>
<table>
  <thead><tr>
    <th>Produit</th><th>Variante</th><th class="c">Stock</th>
    <th class="r">Prix</th><th class="c">Statut</th>
  </tr></thead>
  <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#9CA3AF">Aucun produit</td></tr>'}</tbody>
</table>
<div class="footer">Généré par IhamBaobab · ${today}</div>
</body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: "Exporter l'inventaire",
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (e) {
      console.error('Export PDF error:', e);
    } finally {
      setExporting(false);
    }
  };

  // ── Config filtres + stats ─────────────────────────────────────────────────
  const FILTER_TABS = [
    { id: 'all',        label: 'Tous',      count: stats.total,      dot: PRIMARY },
    { id: 'outOfStock', label: 'Rupture',   count: stats.outOfStock, dot: '#EF4444' },
    { id: 'low',        label: 'Stock bas', count: stats.lowStock,   dot: '#F59E0B' },
    { id: 'ok',         label: 'OK',        count: stats.ok,         dot: '#10B981' },
  ];

  const STATS_CARDS = [
    { label: 'Total',        value: stats.total,      color: PRIMARY,    bg: '#e6f5f2' },
    { label: 'Rupture',      value: stats.outOfStock, color: '#EF4444',  bg: '#FEF2F2' },
    { label: 'Stock bas',    value: stats.lowStock,   color: '#F59E0B',  bg: '#FFFBEB' },
    { label: 'Bien stockés', value: stats.ok,         color: '#10B981',  bg: '#ECFDF5' },
  ];

  const hasPendingSync = Object.keys(pendingAdjusts).length > 0 || saving;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>

      {/* Bannière offline */}
      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.bgWarning }]}>
          <Ionicons name="cloud-offline-outline" size={13} color={colors.warningText} />
          <Text style={[styles.offlineText, { color: colors.warningText }]}>
            Hors ligne — les modifications seront synchronisées automatiquement
          </Text>
        </View>
      )}

      {/* Bannière "enregistrement en cours" */}
      {saving && !isOffline && (
        <View style={[styles.savingBanner, { backgroundColor: `${PRIMARY}18` }]}>
          <ActivityIndicator size="small" color={PRIMARY} />
          <Text style={[styles.savingText, { color: PRIMARY }]}>Enregistrement...</Text>
        </View>
      )}

      <FlatList
        data={displayData}
        keyExtractor={p => String(p._id)}
        contentContainerStyle={[styles.listContent, filtered.length === 0 && styles.listEmpty]}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={() => triggerSync()}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Grille 2×2 stats */}
            <View style={styles.statsGrid}>
              {STATS_CARDS.map(s => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <Text style={[styles.statValue, { color: isSyncing ? colors.textMuted : s.color }]}>
                    {isSyncing ? '—' : s.value}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Panel filtres + recherche + seuil */}
            <View style={[styles.filtersPanel, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              {/* Onglets filtre */}
              <View style={styles.filterTabs}>
                {FILTER_TABS.map(f => (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setFilter(f.id)}
                    style={[
                      styles.filterChip,
                      filter === f.id
                        ? { backgroundColor: PRIMARY }
                        : { backgroundColor: colors.bgHover },
                    ]}
                    activeOpacity={0.8}
                  >
                    {filter !== f.id && (
                      <View style={[styles.filterDot, { backgroundColor: f.dot }]} />
                    )}
                    <Text style={[
                      styles.filterChipText,
                      { color: filter === f.id ? '#fff' : colors.textSub },
                    ]}>
                      {f.label} ({f.count})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Recherche + seuil */}
              <View style={styles.searchRow}>
                <View style={[styles.searchWrap, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                  <Ionicons name="search-outline" size={14} color={colors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Rechercher un produit..."
                    placeholderTextColor={colors.textPlaceholder}
                    value={search}
                    onChangeText={setSearch}
                    returnKeyType="search"
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Ionicons name="close-circle" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.thresholdWrap}>
                  <Text style={[styles.thresholdLabel, { color: colors.textMuted }]}>Seuil :</Text>
                  <TextInput
                    style={[styles.thresholdInput, {
                      borderColor: colors.border,
                      color: colors.text,
                      backgroundColor: colors.bgInput,
                    }]}
                    value={String(threshold)}
                    onChangeText={t => { const n = parseInt(t); if (!isNaN(n) && n > 0) setThreshold(n); }}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                </View>
              </View>
            </View>

            {/* Résumé */}
            {filtered.length > 0 && (
              <View style={styles.resultRow}>
                <Text style={[styles.resultText, { color: colors.textMuted }]}>
                  {displayData.length}/{filtered.length} · {filter !== 'all' ? FILTER_TABS.find(f => f.id === filter)?.label : 'Tous'}
                </Text>
                {hasPendingSync && (
                  <View style={styles.pendingBadge}>
                    <Ionicons name="cloud-upload-outline" size={11} color="#F59E0B" />
                    <Text style={styles.pendingBadgeText}>
                      {isOffline ? 'En attente de sync' : 'Sync...'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            threshold={threshold}
            onAdjust={handleAdjust}
            colors={colors}
            isPendingSync={!!pendingAdjusts[item._id]}
          />
        )}
        ListEmptyComponent={
          !isSyncing ? (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={52} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Aucun produit trouvé</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {search.length > 0
                  ? `Aucun résultat pour "${search}"`
                  : produits.length === 0
                    ? 'Votre inventaire apparaîtra après la synchronisation'
                    : 'Aucun produit ne correspond au filtre sélectionné'}
              </Text>
              {produits.length === 0 && !isOffline && (
                <TouchableOpacity
                  style={[styles.syncBtn, { backgroundColor: PRIMARY }]}
                  onPress={() => triggerSync()}
                >
                  <Ionicons name="sync-outline" size={14} color="#fff" />
                  <Text style={styles.syncBtnText}>Synchroniser</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          isSyncing && filtered.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : hasMore ? (
            <TouchableOpacity
              style={[styles.loadMoreBtn, { borderColor: colors.border }]}
              onPress={loadMore}
              activeOpacity={0.8}
            >
              <Text style={[styles.loadMoreText, { color: PRIMARY }]}>
                Charger plus · {filtered.length - visibleCount} restant(s)
              </Text>
            </TouchableOpacity>
          ) : filtered.length > 0 ? (
            <Text style={[styles.tipText, { color: colors.textMuted }]}>
              {filtered.length} produit(s) affiché(s){'\n'}
              Appuyez sur ✏ pour modifier un stock.{'\n'}
              {isOffline ? '⚡ Hors ligne — synchro à la reconnexion.' : ''}
            </Text>
          ) : null
        }
      />

      {/* FAB Export PDF */}
      <TouchableOpacity
        style={[styles.exportFab, { opacity: exporting || isSyncing ? 0.65 : 1 }]}
        onPress={exportPDF}
        disabled={exporting || isSyncing}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={[PRIMARY, '#267a6b']}
          style={styles.exportFabGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {exporting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="document-outline" size={18} color="#fff" />
          }
          <Text style={styles.exportFabText}>{exporting ? 'Export...' : 'PDF'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const CARD_GAP = 10;
const STAT_W = (W - 24 - CARD_GAP) / 2;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Bannières
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  offlineText: { fontSize: 12, fontWeight: '600', flex: 1 },
  savingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  savingText: { fontSize: 12, fontWeight: '600' },

  // Liste
  listContent: { padding: 12, paddingBottom: 90 },
  listEmpty: { flex: 1 },

  // Stats 2×2
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: CARD_GAP },
  statCard: {
    width: STAT_W, borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12, gap: 3,
  },
  statValue: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  statLabel: { fontSize: 11 },

  // Panel filtres
  filtersPanel: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10, marginBottom: CARD_GAP },
  filterTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
  },
  filterDot: { width: 7, height: 7, borderRadius: 4 },
  filterChipText: { fontSize: 12, fontWeight: '700' },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  thresholdWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  thresholdLabel: { fontSize: 12 },
  thresholdInput: {
    width: 46, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 6, fontSize: 13, textAlign: 'center',
  },

  // Résumé
  resultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, paddingHorizontal: 2,
  },
  resultText: { fontSize: 11 },
  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFBEB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  pendingBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400E' },

  // Carte produit
  productCard: { borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  cardPending: { borderColor: '#F59E0B', borderStyle: 'dashed' },
  pendingDot: { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  productRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  productImg: {
    width: 48, height: 48, borderRadius: 12, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  productInfo: { flex: 1, gap: 2 },
  productName: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  productPrice: { fontSize: 12 },
  productBrand: { fontSize: 11 },
  productRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  stockArea: { alignItems: 'flex-end' },
  stockNumRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stockNum: { fontSize: 18, fontWeight: '800' },
  editIcon: { padding: 3 },

  // Éditeur inline
  editorWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  editorInput: {
    width: 54, borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 4, fontSize: 14, textAlign: 'center',
  },
  editorBtn: { padding: 4 },

  // Toggle variantes
  variantsToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1,
  },
  variantsToggleText: { fontSize: 12, fontWeight: '600', flex: 1 },

  // Ligne variante
  variantRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1,
  },
  variantLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  colorDot: { width: 18, height: 18, borderRadius: 9, flexShrink: 0 },
  variantImg: { width: 36, height: 36, borderRadius: 8, flexShrink: 0 },
  variantTexts: { gap: 1 },
  variantColor: { fontSize: 12, fontWeight: '600' },
  variantSizes: { fontSize: 11 },
  variantRight: { alignItems: 'flex-end', gap: 5 },

  // Badge statut
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },

  // Vide / chargement
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 60, paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 6,
  },
  syncBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  loadMoreBtn: {
    marginHorizontal: 16, marginVertical: 12, paddingVertical: 13,
    borderRadius: 14, borderWidth: 1, alignItems: 'center',
  },
  loadMoreText: { fontSize: 14, fontWeight: '600' },
  tipText: { fontSize: 11, textAlign: 'center', paddingVertical: 10, lineHeight: 17 },

  // FAB export
  exportFab: {
    position: 'absolute', bottom: 20, right: 16,
    borderRadius: 26,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, elevation: 8,
  },
  exportFabGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 18, paddingVertical: 13, borderRadius: 26,
  },
  exportFabText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
