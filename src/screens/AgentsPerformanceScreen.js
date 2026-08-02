/**
 * AgentsPerformanceScreen — performances des agents de caisse POS du vendeur
 *
 * - Sélecteur périodes : Auj. / 7j / 30j / 90j (pills)
 * - Cache SQLite hydraté au montage pour chaque période
 * - Fetch réseau silencieux si cache disponible, bloquant sinon
 * - Stats globales boutique (CA, ventes, panier moyen, annulations)
 * - Top articles (scroll horizontal)
 * - Liste agents triée par CA décroissant avec barre de progression relative
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { useSync } from '../hooks/useSync';
import apiClient from '../config/api';
import { setAgentStatsCache, getAgentStatsCache } from '../db/database';

// ─── Constantes couleurs ──────────────────────────────────────────────────────
const PRIMARY   = '#30A08B';
const SECONDARY = '#B17236';
const DANGER    = '#EF4444';
const SUCCESS   = '#10B981';
const WARN      = '#F59E0B';

// ─── Périodes ─────────────────────────────────────────────────────────────────
const PERIODES = [
  { label: 'Auj.', value: 1  },
  { label: '7j',   value: 7  },
  { label: '30j',  value: 30 },
  { label: '90j',  value: 90 },
];

// ─── Helpers formatage ────────────────────────────────────────────────────────
function fmtMoney(n) {
  return new Intl.NumberFormat('fr-FR').format(n ?? 0) + ' ₣';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

// ─── StatCard — tile stats globales ──────────────────────────────────────────
function StatCard({ label, value, color, colors }) {
  return (
    <View style={[statStyles.tile, { backgroundColor: colors.bgCard, borderColor: `${color}25` }]}>
      <Text style={[statStyles.tileValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[statStyles.tileLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tileValue: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});

// ─── AgentCard ────────────────────────────────────────────────────────────────
function AgentCard({ agent, globalCA, colors }) {
  const ratio    = globalCA > 0 ? Math.min(1, agent.totalCA / globalCA) : 0;
  const isActive = agent.isActive;

  return (
    <View style={[styles.agentCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      {/* Bande couleur top — actif = vert, inactif = gris */}
      <View style={[styles.agentCardAccent, { backgroundColor: isActive ? SUCCESS : '#6B7280' }]} />

      {/* Header card */}
      <View style={styles.agentCardHeader}>
        <View style={[styles.agentAvatar, { backgroundColor: isActive ? PRIMARY + '18' : '#6B728018' }]}>
          <Text style={[styles.agentAvatarText, { color: isActive ? PRIMARY : '#6B7280' }]}>
            {(agent.nom || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.agentNom, { color: colors.text }]} numberOfLines={1}>
            {agent.nom}
          </Text>
          {!!agent.telephone && (
            <Text style={[styles.agentTel, { color: colors.textMuted }]} numberOfLines={1}>
              {agent.telephone}
            </Text>
          )}
        </View>
        <View style={[
          styles.agentStatusBadge,
          { backgroundColor: isActive ? SUCCESS + '18' : '#6B7280' + '18' },
        ]}>
          <View style={[
            styles.agentStatusDot,
            { backgroundColor: isActive ? SUCCESS : '#6B7280' },
          ]} />
          <Text style={[styles.agentStatusText, { color: isActive ? SUCCESS : '#6B7280' }]}>
            {isActive ? 'Actif' : 'Inactif'}
          </Text>
        </View>
      </View>

      {/* Stats ou message aucune vente */}
      {agent.totalCA > 0 ? (
        <>
          {/* Stats en grille 2×2 */}
          <View style={styles.agentStats}>
            <View style={[styles.agentStatItem, { backgroundColor: colors.bgHover, borderRadius: 10 }]}>
              <Text style={[styles.agentStatValue, { color: PRIMARY }]} numberOfLines={1} adjustsFontSizeToFit>
                {fmtMoney(agent.totalCA)}
              </Text>
              <Text style={[styles.agentStatLabel, { color: colors.textMuted }]}>CA</Text>
            </View>
            <View style={[styles.agentStatItem, { backgroundColor: colors.bgHover, borderRadius: 10 }]}>
              <Text style={[styles.agentStatValue, { color: colors.text }]}>{agent.nombreVentes}</Text>
              <Text style={[styles.agentStatLabel, { color: colors.textMuted }]}>Ventes</Text>
            </View>
            <View style={[styles.agentStatItem, { backgroundColor: colors.bgHover, borderRadius: 10 }]}>
              <Text style={[styles.agentStatValue, { color: SECONDARY }]} numberOfLines={1} adjustsFontSizeToFit>
                {fmtMoney(agent.panierMoyen)}
              </Text>
              <Text style={[styles.agentStatLabel, { color: colors.textMuted }]}>Panier moy.</Text>
            </View>
            <View style={[styles.agentStatItem, { backgroundColor: colors.bgHover, borderRadius: 10 }]}>
              <Text style={[styles.agentStatValue, { color: DANGER }]}>{agent.nombreAnnul}</Text>
              <Text style={[styles.agentStatLabel, { color: colors.textMuted }]}>Annulations</Text>
            </View>
          </View>

          {/* Barre de progression relative */}
          <View style={{ marginTop: 12, gap: 5 }}>
            <View style={[styles.progressBar, { backgroundColor: colors.bgHover }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(2, Math.round(ratio * 100))}%`,
                    backgroundColor: PRIMARY,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
              {Math.round(ratio * 100)}% du CA boutique
            </Text>
          </View>

          {/* Dernière vente */}
          {!!agent.derniereVente && (
            <View style={styles.derniereVenteRow}>
              <Ionicons name="time-outline" size={11} color={colors.textMuted} />
              <Text style={[styles.derniereVente, { color: colors.textMuted }]}>
                Dernière vente : {fmtDate(agent.derniereVente)}
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={[styles.noVenteWrap, { backgroundColor: colors.bgHover }]}>
          <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.noVente, { color: colors.textMuted }]}>
            Aucune vente sur cette période
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function AgentsPerformanceScreen({ navigation }) {
  const { colors }    = useTheme();
  const { seller }    = useAuthStore();
  const { isOffline } = useSync(); // utilisé pour le rechargement auto à la reconnexion
  const sellerId      = seller?._id || seller?.id;
  const storeName     = seller?.storeName || seller?.name || 'Ma boutique';
  const insets        = useSafeAreaInsets();

  const [periode,    setPeriode]    = useState(7);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Cache mémoire { [nbJours]: { global, agents } }
  const dataCache = useRef({});

  // ─── Fetch toutes les périodes en un seul appel ───────────────────────────
  const fetchAll = useCallback(async () => {
    if (!sellerId) return;
    const res = await apiClient.get('/api/pos/seller/agents-stats/all-periods');
    return res.data?.data ?? null; // { 1: {...}, 7: {...}, 30: {...}, 90: {...} }
  }, [sellerId]);

  // ─── Fetch réseau avec cache (utilisé aussi pour le refresh) ─────────────
  const fetchData = useCallback(async (nbJours, silent = false) => {
    if (!sellerId) return;
    if (!silent) setLoading(true);
    try {
      const byPeriod = await fetchAll();
      if (byPeriod) {
        for (const p of PERIODES) {
          const d = byPeriod[p.value];
          if (d) {
            dataCache.current[p.value] = d;
            await setAgentStatsCache(`seller_agents_${sellerId}_${p.value}`, d);
          }
        }
        if (dataCache.current[nbJours]) setData(dataCache.current[nbJours]);
      }
    } catch (e) {
      if (!e.response && dataCache.current[nbJours]) {
        setData(dataCache.current[nbJours]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sellerId, fetchAll]);

  // ─── Hydratation SQLite + fetch unique au montage ─────────────────────────
  useEffect(() => {
    if (!sellerId) return;
    async function hydrateAndFetch() {
      // 1. Lire SQLite pour toutes les périodes
      for (const p of PERIODES) {
        const cached = await getAgentStatsCache(`seller_agents_${sellerId}_${p.value}`);
        if (cached?.data) dataCache.current[p.value] = cached.data;
      }
      // 2. Afficher la période active depuis cache si dispo
      if (dataCache.current[periode]) {
        setData(dataCache.current[periode]);
      } else {
        setLoading(true);
      }
      // 3. Un seul appel réseau pour toutes les périodes
      try {
        const byPeriod = await fetchAll();
        if (byPeriod) {
          for (const p of PERIODES) {
            const d = byPeriod[p.value];
            if (d) {
              dataCache.current[p.value] = d;
              await setAgentStatsCache(`seller_agents_${sellerId}_${p.value}`, d);
            }
          }
          if (dataCache.current[periode]) setData(dataCache.current[periode]);
        }
      } catch { /* silencieux — cache déjà affiché */ }
      finally { setLoading(false); }
    }
    hydrateAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  // ─── Reconnexion : recharge si offline → online ───────────────────────────
  const isOfflineRef = useRef(isOffline);
  useEffect(() => {
    const wasOffline = isOfflineRef.current;
    isOfflineRef.current = isOffline;
    if (wasOffline && !isOffline) fetchData(periode, !!dataCache.current[periode]);
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Changement de période ─────────────────────────────────────────────────
  const handlePeriodeChange = useCallback((nbJours) => {
    setPeriode(nbJours);
    if (dataCache.current[nbJours]) {
      setData(dataCache.current[nbJours]);
      fetchData(nbJours, true);
    } else {
      setData(null);
      fetchData(nbJours, false);
    }
  }, [fetchData]);

  // ─── Données extraites ─────────────────────────────────────────────────────
  const global  = data?.global;
  const agents  = data?.agents || [];
  const topArts = global?.topArticles?.slice(0, 5) || [];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>

      {/* Sélecteur de périodes */}
      <View style={[styles.periodeBar, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <View style={styles.periodeWrap}>
          {PERIODES.map(p => {
            const isActive = periode === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                onPress={() => handlePeriodeChange(p.value)}
                activeOpacity={0.75}
                style={[
                  styles.periodeBtn,
                  {
                    backgroundColor: isActive ? PRIMARY : colors.bgHover,
                    borderColor:     isActive ? PRIMARY : colors.border,
                  },
                ]}
              >
                <Text style={[
                  styles.periodeBtnText,
                  { color: isActive ? '#fff' : colors.textMuted },
                ]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {loading && (
            <ActivityIndicator size="small" color={PRIMARY} style={{ marginLeft: 6 }} />
          )}
        </View>

        {/* Sous-titre boutique */}
        <Text style={[styles.storeSub, { color: colors.textMuted }]} numberOfLines={1}>
          {storeName}
        </Text>
      </View>

      {/* Contenu scrollable */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData(periode, false);
            }}
            colors={[PRIMARY]}
            tintColor={PRIMARY}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >

        {/* ── Stats globales boutique ─────────────────────────────────────── */}
        {global && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="storefront-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                BOUTIQUE — CAISSE POS
              </Text>
            </View>
            <View style={styles.statsRow}>
              <StatCard
                label="CA Total"
                value={fmtMoney(global.totalCA)}
                color={PRIMARY}
                colors={colors}
              />
              <StatCard
                label="Ventes"
                value={String(global.nombreVentes)}
                color="#2563EB"
                colors={colors}
              />
            </View>
            <View style={[styles.statsRow, { marginTop: 8 }]}>
              <StatCard
                label="Panier moy."
                value={fmtMoney(global.panierMoyen)}
                color={SECONDARY}
                colors={colors}
              />
              <StatCard
                label="Annulations"
                value={String(global.nombreAnnulations)}
                color={DANGER}
                colors={colors}
              />
            </View>

            {/* Répartition paiements */}
            {(global.totalEspeces > 0 || global.totalMobile > 0) && (
              <View style={[styles.paiementRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <View style={styles.paiementItem}>
                  <Ionicons name="cash-outline" size={14} color={WARN} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paiementLabel, { color: colors.textMuted }]}>Espèces</Text>
                    <Text style={[styles.paiementValue, { color: WARN }]}>
                      {fmtMoney(global.totalEspeces)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.paiementDivider, { backgroundColor: colors.border }]} />
                <View style={styles.paiementItem}>
                  <Ionicons name="phone-portrait-outline" size={14} color={PRIMARY} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paiementLabel, { color: colors.textMuted }]}>Mobile Money</Text>
                    <Text style={[styles.paiementValue, { color: PRIMARY }]}>
                      {fmtMoney(global.totalMobile)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Top articles ────────────────────────────────────────────────── */}
        {topArts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="podium-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                TOP ARTICLES
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -16 }}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
            >
              {topArts.map((a, i) => {
                const rankColors = [WARN, '#9CA3AF', SECONDARY, colors.textMuted, colors.textMuted];
                const rankColor  = rankColors[i] || colors.textMuted;
                return (
                  <View
                    key={i}
                    style={[
                      styles.topArticleCard,
                      { backgroundColor: colors.bgCard, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.topArticleRank, { color: rankColor }]}>
                      #{i + 1}
                    </Text>
                    <Text
                      style={[styles.topArticleNom, { color: colors.text }]}
                      numberOfLines={2}
                    >
                      {a.nom}
                    </Text>
                    <Text style={[styles.topArticleCa, { color: PRIMARY }]}>
                      {fmtMoney(a.ca)}
                    </Text>
                    <View style={[styles.topArticleQteBadge, { backgroundColor: colors.bgHover }]}>
                      <Text style={[styles.topArticleQte, { color: colors.textMuted }]}>
                        {a.qte} vte{a.qte > 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Liste agents ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              AGENTS ({agents.length})
            </Text>
          </View>

          {loading && agents.length === 0 && !data ? (
            <View style={styles.emptyBlock}>
              <ActivityIndicator size="large" color={PRIMARY} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Chargement des agents…
              </Text>
            </View>
          ) : agents.length === 0 ? (
            <View style={[styles.emptyBlock, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.bgHover }]}>
                <Ionicons name="people-outline" size={36} color={colors.textDisabled} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Aucun agent actif
              </Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Aucune vente agent sur cette période
              </Text>
            </View>
          ) : (
            agents.map(agent => (
              <AgentCard
                key={agent.agentId}
                agent={agent}
                globalCA={global?.totalCA || 0}
                colors={colors}
              />
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // ── Barre de périodes ──────────────────────────────────────────────────────
  periodeBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  periodeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 4,
    elevation: 0,
  },
  periodeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  storeSub: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 2,
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scrollContent: {
    padding: 16,
    gap: 20,
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Stats globales ─────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },

  // ── Répartition paiements ──────────────────────────────────────────────────
  paiementRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
    gap: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  paiementItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  paiementDivider: {
    width: 1,
    marginVertical: 4,
  },
  paiementLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  paiementValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },

  // ── Top article card (horizontale) ─────────────────────────────────────────
  topArticleCard: {
    width: 130,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topArticleRank: {
    fontSize: 12,
    fontWeight: '900',
  },
  topArticleNom: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    minHeight: 32,
  },
  topArticleCa: {
    fontSize: 13,
    fontWeight: '800',
  },
  topArticleQteBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  topArticleQte: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Agent card ─────────────────────────────────────────────────────────────
  agentCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  agentCardAccent: {
    height: 3,
  },
  agentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingBottom: 10,
  },
  agentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentAvatarText: {
    fontSize: 18,
    fontWeight: '900',
  },
  agentNom: {
    fontSize: 15,
    fontWeight: '800',
  },
  agentTel: {
    fontSize: 12,
    fontWeight: '500',
  },
  agentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  agentStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  agentStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Stats 2×2 grid
  agentStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  agentStatItem: {
    width: '47%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 2,
  },
  agentStatValue: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  agentStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Barre de progression
  progressBar: {
    marginHorizontal: 14,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginHorizontal: 14,
    marginTop: 2,
  },

  // Dernière vente
  derniereVenteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 12,
  },
  derniereVente: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Aucune vente
  noVenteWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
  },
  noVente: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
  },

  // ── État vide ──────────────────────────────────────────────────────────────
  emptyBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
