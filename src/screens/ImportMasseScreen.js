import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import { useSyncStore } from '../stores/syncStore';
import { useSync } from '../hooks/useSync';
import { syncService } from '../services/syncService';
import { upsertMany, getLocalProductNames } from '../db/database';
import apiClient from '../config/api';

// ── Bottom sheet ──────────────────────────────────────────────────────────────
function BottomSheet({ visible, onClose, title, colors, children, maxHeight = '75%' }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={[bs.sheet, { backgroundColor: colors.bgCard, maxHeight, paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity activeOpacity={1} style={bs.handleArea} onPress={onClose}>
            <View style={[bs.handle, { backgroundColor: colors.border }]} />
          </TouchableOpacity>
          {title ? <Text style={[bs.title, { color: colors.text }]}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}
const bs = StyleSheet.create({
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8 },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 14, marginTop: 2 },
});

// ── Templates ─────────────────────────────────────────────────────────────────
const TEMPLATES = {
  commercant: {
    label: 'Commerçant / Revendeur', icon: '🏪',
    description: 'Produits avec codes-barres existants',
    accent: '#2563EB', borderColor: '#BFDBFE', bgColor: '#EFF6FF',
    cols: ['nom','prix','stock','prix_promo','marque','barcode','poids_kg','description','image_url'],
    colsMeta: [
      { col: 'nom', req: true }, { col: 'prix', req: true }, { col: 'stock', req: false },
      { col: 'prix_promo', req: false }, { col: 'marque', req: false },
      { col: 'barcode', req: false, note: 'EAN-13' }, { col: 'poids_kg', req: false },
      { col: 'description', req: false }, { col: 'image_url', req: false },
    ],
    example: [
      ['Riz parfumé 5kg','3500','50','3200',"Uncle Ben's",'6111234567890','5','Riz parfumé de qualité premium.',''],
      ['Huile végétale 1L','1500','100','','Lesieur','3029330003533','1','',''],
      ['Savon Omo 500g','800','200','750','Omo','8710908523304','0.5','',''],
    ],
    filename: 'modele_import_commercant.csv',
  },
  createur: {
    label: 'Artisan / Créateur', icon: '🎨',
    description: 'Produits faits main, 3 photos',
    accent: '#D97706', borderColor: '#FDE68A', bgColor: '#FFFBEB',
    cols: ['nom','prix','stock','prix_promo','marque','poids_kg','description','image_url','image2_url','image3_url'],
    colsMeta: [
      { col: 'nom', req: true }, { col: 'prix', req: true }, { col: 'stock', req: false },
      { col: 'prix_promo', req: false }, { col: 'marque', req: false }, { col: 'poids_kg', req: false },
      { col: 'description', req: false }, { col: 'image_url', req: false },
      { col: 'image2_url', req: false }, { col: 'image3_url', req: false },
    ],
    example: [
      ['Boubou brodé bleu','25000','5','22000','','0.4','Boubou fait main, tissu bazin riche.','https://exemple.com/img1.jpg','',''],
      ['Collier perles rouges','8000','12','','Awa Bijoux','0.1','Collier artisanal en perles importées.','','',''],
      ['Sac en cuir naturel','35000','3','30000','','0.6','Cuir tanné localement, cousu main.','https://exemple.com/sac.jpg','',''],
    ],
    filename: 'modele_import_createur.csv',
  },
  hybride: {
    label: 'Hybride', icon: '🔄',
    description: 'Tous les champs disponibles',
    accent: '#0D9488', borderColor: '#99F6E4', bgColor: '#F0FDFA',
    cols: ['nom','prix','stock','prix_promo','marque','barcode','poids_kg','description','image_url','image2_url','image3_url'],
    colsMeta: [
      { col: 'nom', req: true }, { col: 'prix', req: true }, { col: 'stock', req: false },
      { col: 'prix_promo', req: false }, { col: 'marque', req: false },
      { col: 'barcode', req: false, note: 'EAN-13' }, { col: 'poids_kg', req: false },
      { col: 'description', req: false }, { col: 'image_url', req: false },
      { col: 'image2_url', req: false }, { col: 'image3_url', req: false },
    ],
    example: [
      ['Tissu wax 6 yards','15000','20','13000','','','0.8','Wax 100% coton, motif baobab.','https://exemple.com/tissu.jpg','',''],
      ['Fil à coudre Coats','500','500','','Coats','6281099988888','0.05','','','',''],
    ],
    filename: 'modele_import_hybride.csv',
  },
};

const MAX_BATCH = 50;
const BATCH_SIZE = 20;

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').replace(/^﻿/, '').toLowerCase());
  return lines.slice(1).map((line, idx) => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = { _rowIndex: idx + 2 };
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function validateRow(row, { existingNames = new Set(), seenInCsv = new Set() } = {}) {
  const errors = [];
  const nom = (row.nom || row.name || '').trim();
  if (!nom)                                  errors.push('Nom manquant');
  if (!row.prix && !row.price)               errors.push('Prix manquant');
  if (row.prix && isNaN(Number(row.prix)))   errors.push('Prix invalide');
  if (row.stock && isNaN(Number(row.stock))) errors.push('Stock invalide');
  if (nom && existingNames.has(nom.toLowerCase()))
    errors.push('Produit déjà dans votre boutique');
  if (nom && seenInCsv.has(nom.toLowerCase()))
    errors.push('Doublon dans le fichier CSV');
  return errors;
}

async function saveOrShareTemplate(profile = 'hybride') {
  const tpl = TEMPLATES[profile] || TEMPLATES.hybride;
  // ﻿ = BOM UTF-8 pour Excel
  const csv = '﻿' + [tpl.cols, ...tpl.example].map(r => r.join(',')).join('\n');

  if (Platform.OS === 'android') {
    // Android : StorageAccessFramework → l'utilisateur choisit le dossier (ex : Téléchargements)
    const perms = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perms.granted) return; // annulé par l'utilisateur
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      perms.directoryUri, tpl.filename, 'text/csv'
    );
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert('Enregistré ✓', `"${tpl.filename}" sauvegardé dans le dossier sélectionné.`);
  } else {
    // iOS : écrire dans le cache puis partager → "Enregistrer dans Fichiers" disponible
    const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!base) throw new Error('Répertoire indisponible');
    const path = base + tpl.filename;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    const ok = await Sharing.isAvailableAsync();
    if (ok) await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    else Alert.alert('Info', "Le partage n'est pas disponible sur cet appareil.");
  }
}

// ── Stepper indicator ─────────────────────────────────────────────────────────
const STEPS = ['Préparer', 'Vérifier', 'Résultat'];
const STEP_MAP = { upload: 0, preview: 1, importing: 1, done: 2 };

function Stepper({ step, colors }) {
  const current = STEP_MAP[step] ?? 0;
  return (
    <View style={[stepperS.wrap, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <View style={stepperS.step}>
              <View style={[stepperS.dot, {
                backgroundColor: done ? '#10B981' : active ? colors.primary : colors.bgHover,
                borderWidth: active ? 0 : 2,
                borderColor: done ? '#10B981' : active ? colors.primary : colors.border,
              }]}>
                {done
                  ? <Ionicons name="checkmark" size={12} color="#fff" />
                  : <Text style={[stepperS.dotNum, { color: active ? '#fff' : colors.textMuted }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[stepperS.label, {
                color: active ? colors.primary : done ? '#10B981' : colors.textMuted,
                fontWeight: active ? '700' : '500',
              }]}>{label}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[stepperS.line, { backgroundColor: i < current ? '#10B981' : colors.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
const stepperS = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1 },
  step: { alignItems: 'center', gap: 4 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotNum: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 11 },
  line: { flex: 1, height: 2, marginHorizontal: 6, marginBottom: 16, borderRadius: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function ImportMasseScreen({ navigation }) {
  const { colors } = useTheme();
  const { seller } = useAuthStore();
  const { isOffline, triggerSync } = useSync();
  const sellerId = seller?._id || seller?.id;
  const insets = useSafeAreaInsets();

  const [step, setStep]                   = useState('upload');
  const [businessProfile, setBusinessProfile] = useState('hybride');
  const [loadingProfile, setLoadingProfile]   = useState(true);
  const [selectedTypeId, setSelectedTypeId]   = useState('');
  const [selectedTypeName, setSelectedTypeName] = useState('');
  const [showTypeSheet, setShowTypeSheet]     = useState(false);
  const [openCats, setOpenCats]               = useState({});
  const [showCols, setShowCols]               = useState(false);
  const [rows, setRows]                       = useState([]);
  const [fileName, setFileName]               = useState('');
  const [importProgress, setImportProgress]   = useState(0);
  const [importResult, setImportResult]       = useState(null);
  const [downloadingTpl, setDownloadingTpl]   = useState(false);

  const storeTypes      = useSyncStore(s => s.types)      ?? [];
  const storeCategories = useSyncStore(s => s.categories) ?? [];
  const activeTpl   = TEMPLATES[businessProfile] || TEMPLATES.hybride;

  // Noms existants dans la boutique — chargés depuis SQLite (tous les produits, pas juste la page 1)
  const [existingNames, setExistingNames] = useState(new Set());

  // Validation avec contexte doublon
  const rowsWithErrors = useMemo(() => {
    const seenInCsv = new Set();
    return rows.map(r => {
      const nom = (r.nom || r.name || '').trim().toLowerCase();
      const errors = validateRow(r, { existingNames, seenInCsv });
      if (nom) seenInCsv.add(nom); // enregistre après validation pour détecter le 2ème
      return { row: r, errors };
    });
  }, [rows, existingNames]);

  const validRows   = rowsWithErrors.filter(({ errors }) => errors.length === 0).map(({ row }) => row);
  const invalidRows = rowsWithErrors.filter(({ errors }) => errors.length > 0).map(({ row }) => row);

  useEffect(() => {
    if (!sellerId) { setLoadingProfile(false); return; }
    const p1 = storeTypes.length === 0 ? syncService.fetchOne('types').catch(() => {}) : Promise.resolve();
    if (storeCategories.length === 0) syncService.fetchOne('categories').catch(() => {});
    // Si businessProfile déjà en session (chargé par authStore), on évite le fetch réseau
    const cachedProfile = seller?.businessProfile;
    const p2 = cachedProfile
      ? Promise.resolve(null)
      : apiClient.get(`/getSeller/${sellerId}`).catch(() => ({ data: {} }));
    // Charge tous les noms depuis SQLite — couvre les produits au-delà de la page 1
    const p3 = getLocalProductNames().then(names => setExistingNames(names)).catch(() => {});
    Promise.all([p1, p2, p3]).then(([, res]) => {
      const prof = cachedProfile || res?.data?.businessProfile || res?.data?.data?.businessProfile || 'hybride';
      setBusinessProfile(TEMPLATES[prof] ? prof : 'hybride');
    }).finally(() => setLoadingProfile(false));
  }, [sellerId]);

  const handleDownloadTemplate = async () => {
    setDownloadingTpl(true);
    try { await saveOrShareTemplate(businessProfile); }
    catch (err) {
      console.error('[ImportMasse] shareTemplateCsv:', err);
      Alert.alert('Erreur', err?.message || 'Impossible de générer le modèle.');
    }
    finally { setDownloadingTpl(false); }
  };

  const handlePickFile = async () => {
    if (!selectedTypeId) {
      Alert.alert('Type requis', "Choisissez un type de produit avant d'importer.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.name.endsWith('.csv') && !asset.name.endsWith('.txt')) {
        Alert.alert('Format invalide', 'Seuls les fichiers CSV sont acceptés.');
        return;
      }
      setFileName(asset.name);
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      let parsed = parseCsv(text);
      if (parsed.length > MAX_BATCH) {
        Alert.alert(`Tronqué à ${MAX_BATCH} lignes`, `Max ${MAX_BATCH} produits par import.`);
        parsed = parsed.slice(0, MAX_BATCH);
      }
      if (parsed.length === 0) { Alert.alert('Fichier vide', 'Aucune ligne de données trouvée.'); return; }
      setRows(parsed);
      setStep('preview');
    } catch (_) { Alert.alert('Erreur', 'Impossible de lire le fichier.'); }
  };

  const handleImport = async () => {
    if (validRows.length === 0) { Alert.alert('Aucun produit valide', "Corrigez les erreurs avant d'importer."); return; }
    const products = validRows.map(r => ({
      nom: r.nom || r.name, prix: Number(r.prix || r.price || 0),
      stock: Number(r.stock || r.quantite || 1), prixPromo: Number(r.prix_promo || 0),
      marque: r.marque || r.brand || '', barcode: r.barcode || '',
      poids_kg: Number(r.poids_kg || 0.5), description: r.description || '',
      image_url: r.image_url || '', image2_url: r.image2_url || '',
      image3_url: r.image3_url || '', ClefType: selectedTypeId || undefined,
    }));
    setStep('importing'); setImportProgress(0);

    if (isOffline) {
      try {
        await syncService.queueMutation('BULK_IMPORT_PRODUCTS', { products, sellerId });

        // Insertion locale immédiate — même pattern que la création individuelle
        const now = Date.now();
        const localProducts = products.map((p, i) => ({
          _id: `local_${now}_${i}`,
          name: p.nom,
          prix: p.prix,
          prixPromo: p.prixPromo || 0,
          quantite: p.stock,
          marque: p.marque || '',
          description: p.description || '',
          image1: p.image_url || null,
          image2: p.image2_url || null,
          image3: p.image3_url || null,
          ClefType: p.ClefType || null,
          isPublished: p.image_url ? 'Attente' : 'UnPublished',
          _pendingSync: true,
          updatedAt: now,
        }));
        await upsertMany('produits', localProducts, p => String(p._id)).catch(() => {});

        // Mise à jour du store mémoire → produits visibles immédiatement dans "Mes produits"
        const current = useSyncStore.getState().produits ?? [];
        useSyncStore.getState().setStoreData('produits', [...localProducts, ...current]);
        useSyncStore.getState().setPendingCount(
          (useSyncStore.getState().pendingCount || 0) + 1
        );
      } catch (_) {
        Alert.alert('Erreur', "Impossible de mettre en file.");
        setStep('preview');
        return;
      }
      setImportResult({ created: 0, errors: 0, skipped: invalidRows.length, queued: products.length });
      setStep('done'); return;
    }

    const batches = [];
    for (let i = 0; i < products.length; i += BATCH_SIZE) batches.push(products.slice(i, i + BATCH_SIZE));
    let totalCreated = 0, totalErrors = 0;
    const errorDetails = []; // { nom, reason }

    try {
      for (let b = 0; b < batches.length; b++) {
        const res = await apiClient.post('/Products/bulk-create', { products: batches[b] });
        const d = res.data;
        const batchCreated = d?.created ?? batches[b].length;
        const batchErrors  = d?.errors  ?? 0;
        totalCreated += batchCreated;
        totalErrors  += batchErrors;
        if (Array.isArray(d?.failedProducts) && d.failedProducts.length > 0) {
          d.failedProducts.forEach(fp => {
            errorDetails.push({ nom: fp.nom || `Produit ?`, reason: fp.reason || 'Erreur inconnue' });
          });
        } else if (batchErrors > 0) {
          // Le backend a compté des erreurs mais sans détail (succès partiel 201)
          // On signale le nombre sans nom précis
          for (let e = 0; e < batchErrors; e++) {
            errorDetails.push({ nom: `Produit #${totalCreated + e + 1}`, reason: 'Rejeté par le serveur (doublon ou données invalides)' });
          }
        }
        setImportProgress(Math.round(((b + 1) / batches.length) * 100));
      }
      triggerSync();
      setImportResult({ created: totalCreated, errors: totalErrors, skipped: invalidRows.length, queued: 0, errorDetails });
    } catch (err) {
      const d = err?.response?.data;
      // Essaye d'extraire un message lisible depuis la réponse serveur
      const serverMsg = d?.message || d?.error || d?.msg
        || (typeof d === 'string' ? d : null)
        || err?.message
        || 'Une erreur est survenue';
      const failedDetails = Array.isArray(d?.failedProducts)
        ? d.failedProducts.map(fp => ({ nom: fp.nom || 'Produit ?', reason: fp.reason || 'Erreur inconnue' }))
        : [];
      setImportResult({
        created: d?.created || totalCreated,
        errors: d?.errors || (products.length - totalCreated),
        skipped: invalidRows.length,
        queued: 0,
        message: serverMsg,
        errorDetails: [...errorDetails, ...failedDetails],
      });
    }
    setStep('done');
  };

  const resetAll = () => {
    setRows([]); setFileName(''); setImportResult(null);
    setImportProgress(0); setSelectedTypeId(''); setSelectedTypeName(''); setStep('upload');
  };

  if (loadingProfile) {
    return (
      <View style={[S.screen, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[S.screen, { backgroundColor: colors.bg }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={[S.headerSafe, { backgroundColor: colors.bgCard, borderBottomColor: colors.border }]}>
        <View style={S.headerRow}>
          <TouchableOpacity onPress={() => step === 'preview' ? setStep('upload') : navigation.goBack()} style={S.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[S.headerTitle, { color: colors.text }]}>Import en masse</Text>
            <Text style={[S.headerSub, { color: colors.textMuted }]}>
              Profil : {activeTpl.icon} {activeTpl.label}
            </Text>
          </View>
          {isOffline && (
            <View style={S.offlinePill}>
              <Ionicons name="cloud-offline-outline" size={11} color="#D97706" />
              <Text style={S.offlinePillText}>Hors ligne</Text>
            </View>
          )}
        </View>
        <Stepper step={step} colors={colors} />
      </SafeAreaView>

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE 1 : upload
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'upload' && (
        <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>

          {/* ① Télécharger le modèle */}
          <View style={[S.stepCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={S.stepCardHeader}>
              <View style={[S.stepNum, { backgroundColor: activeTpl.bgColor, borderColor: activeTpl.borderColor }]}>
                <Text style={[S.stepNumText, { color: activeTpl.accent }]}>1</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.stepCardTitle, { color: colors.text }]}>Téléchargez le modèle CSV</Text>
                <Text style={[S.stepCardSub, { color: colors.textMuted }]}>Remplissez-le dans Excel ou Google Sheets</Text>
              </View>
            </View>

            {/* Badge profil */}
            <View style={[S.profileBadge, { borderColor: activeTpl.borderColor, backgroundColor: activeTpl.bgColor }]}>
              <Text style={S.profileBadgeIcon}>{activeTpl.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.profileBadgeLabel, { color: activeTpl.accent }]}>{activeTpl.label}</Text>
                <Text style={[S.profileBadgeDesc, { color: colors.textMuted }]}>{activeTpl.description}</Text>
              </View>
            </View>

            {/* Colonnes — collapsible */}
            <TouchableOpacity
              style={[S.colsToggle, { borderColor: colors.border }]}
              onPress={() => setShowCols(v => !v)}
              activeOpacity={0.8}
            >
              <Ionicons name="list-outline" size={14} color={colors.textMuted} />
              <Text style={[S.colsToggleText, { color: colors.textMuted }]}>
                {showCols ? 'Masquer les colonnes' : `Voir les ${activeTpl.colsMeta.length} colonnes du modèle`}
              </Text>
              <Ionicons name={showCols ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textMuted} />
            </TouchableOpacity>

            {showCols && (
              <View style={S.colsWrap}>
                {activeTpl.colsMeta.map(({ col, req, note }) => (
                  <View key={col} style={[S.colChip, {
                    backgroundColor: req ? '#EFF6FF' : colors.bgHover,
                    borderColor:     req ? '#BFDBFE' : colors.border,
                  }]}>
                    <Text style={[S.colChipText, { color: req ? '#1D4ED8' : colors.textMuted }]}>
                      {col}{req ? ' *' : ''}{note ? ` (${note})` : ''}
                    </Text>
                  </View>
                ))}
                <Text style={[S.colsNote, { color: colors.textMuted }]}>* = obligatoire</Text>
              </View>
            )}

            <TouchableOpacity
              style={[S.downloadBtn, { borderColor: activeTpl.borderColor, backgroundColor: activeTpl.bgColor }]}
              onPress={handleDownloadTemplate}
              disabled={downloadingTpl}
              activeOpacity={0.8}
            >
              {downloadingTpl
                ? <ActivityIndicator size="small" color={activeTpl.accent} />
                : <Ionicons name="download-outline" size={18} color={activeTpl.accent} />
              }
              <Text style={[S.downloadBtnText, { color: activeTpl.accent }]}>
                {downloadingTpl ? 'Génération...' : 'Télécharger le modèle'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ② Choisir un type */}
          <View style={[S.stepCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={S.stepCardHeader}>
              <View style={[S.stepNum, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Text style={[S.stepNumText, { color: '#2563EB' }]}>2</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.stepCardTitle, { color: colors.text }]}>Choisissez un type
                  <Text style={{ color: '#EF4444' }}> *</Text>
                </Text>
                <Text style={[S.stepCardSub, { color: colors.textMuted }]}>
                  Tous les produits importés recevront ce type
                </Text>
              </View>
            </View>

            {storeTypes.length === 0 ? (
              <View style={S.warnInline}>
                <Ionicons name="warning-outline" size={14} color="#D97706" />
                <Text style={S.warnInlineText}>Aucun type trouvé. Créez-en un depuis vos paramètres.</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[S.typeBtn, {
                  borderColor: selectedTypeId ? colors.primary : colors.border,
                  backgroundColor: selectedTypeId ? colors.primaryLight ?? '#EFF6FF' : colors.bgHover,
                }]}
                onPress={() => setShowTypeSheet(true)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={selectedTypeId ? 'pricetag' : 'pricetag-outline'}
                  size={18}
                  color={selectedTypeId ? colors.primary : colors.textMuted}
                />
                <Text style={[S.typeBtnText, { color: selectedTypeId ? colors.primary : colors.textMuted }]} numberOfLines={1}>
                  {selectedTypeName || '— Sélectionner un type —'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={selectedTypeId ? colors.primary : colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* ③ Importer le fichier */}
          <View style={[S.stepCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={S.stepCardHeader}>
              <View style={[S.stepNum, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                <Text style={[S.stepNumText, { color: '#16A34A' }]}>3</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.stepCardTitle, { color: colors.text }]}>Importez votre fichier</Text>
                <Text style={[S.stepCardSub, { color: colors.textMuted }]}>Format CSV — max {MAX_BATCH} lignes</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[S.dropZone, {
                borderColor:     selectedTypeId ? colors.primary : colors.border,
                backgroundColor: selectedTypeId ? (colors.primaryLight ?? '#F0FDF4') : colors.bgHover,
                opacity:         selectedTypeId ? 1 : 0.45,
              }]}
              onPress={handlePickFile}
              disabled={!selectedTypeId}
              activeOpacity={0.85}
            >
              <View style={[S.dropZoneIconWrap, { backgroundColor: selectedTypeId ? colors.primary : colors.border }]}>
                <Ionicons name="cloud-upload-outline" size={28} color="#fff" />
              </View>
              <Text style={[S.dropZoneTitle, { color: selectedTypeId ? colors.text : colors.textMuted }]}>
                {selectedTypeId ? 'Appuyez pour choisir votre CSV' : 'Choisissez d\'abord un type (étape 2)'}
              </Text>
              <Text style={[S.dropZoneSub, { color: colors.textMuted }]}>
                {selectedTypeId ? 'Excel → Enregistrer sous → CSV' : '↑ Complétez l\'étape 2 pour continuer'}
              </Text>
              {selectedTypeId && (
                <View style={[S.dropZonePill, { backgroundColor: colors.primary }]}>
                  <Text style={S.dropZonePillText}>Sélectionner le fichier</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {isOffline && (
            <View style={S.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color="#D97706" />
              <Text style={S.offlineBannerText}>
                Hors ligne — l'import sera envoyé automatiquement à la reconnexion
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE 2 : preview
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'preview' && (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[S.scroll, { paddingBottom: 110 }]} showsVerticalScrollIndicator={false}>

            {/* Fichier + type */}
            <View style={[S.fileBanner, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={[S.fileBannerIcon, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="document-text" size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.fileBannerName, { color: colors.text }]} numberOfLines={1}>{fileName}</Text>
                <Text style={[S.fileBannerType, { color: colors.textMuted }]}>{selectedTypeName}</Text>
              </View>
              <TouchableOpacity onPress={() => { setStep('upload'); setRows([]); setFileName(''); }} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* 3 tuiles résumé */}
            <View style={S.summaryRow}>
              <View style={[S.summaryTile, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[S.summaryBig, { color: colors.text }]}>{rows.length}</Text>
                <Text style={[S.summaryLabel, { color: colors.textMuted }]}>Lignes</Text>
              </View>
              <View style={[S.summaryTile, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                <Text style={[S.summaryBig, { color: '#16A34A' }]}>{validRows.length}</Text>
                <Text style={[S.summaryLabel, { color: '#15803D' }]}>Valides</Text>
              </View>
              <View style={[S.summaryTile, {
                backgroundColor: invalidRows.length > 0 ? '#FEF2F2' : colors.bgCard,
                borderColor:     invalidRows.length > 0 ? '#FCA5A5' : colors.border,
              }]}>
                <Text style={[S.summaryBig, { color: invalidRows.length > 0 ? '#DC2626' : colors.textMuted }]}>{invalidRows.length}</Text>
                <Text style={[S.summaryLabel, { color: invalidRows.length > 0 ? '#B91C1C' : colors.textMuted }]}>Erreurs</Text>
              </View>
            </View>

            {/* Avertissement lignes ignorées */}
            {invalidRows.length > 0 && (
              <View style={[S.warnBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <Ionicons name="warning-outline" size={14} color="#D97706" />
                <Text style={S.warnBoxText}>
                  {invalidRows.length} ligne(s) en erreur seront ignorées — {validRows.length} seront importées.
                </Text>
              </View>
            )}

            {/* Tableau */}
            <View style={[S.tableWrap, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={[S.tableHead, { backgroundColor: colors.bgHover, borderBottomColor: colors.border }]}>
                    <Text style={[S.th, S.cLigne,   { color: colors.textMuted }]}>#</Text>
                    <Text style={[S.th, S.cNom,     { color: colors.textMuted }]}>Nom</Text>
                    <Text style={[S.th, S.cPrix,    { color: colors.textMuted }]}>Prix</Text>
                    <Text style={[S.th, S.cStock,   { color: colors.textMuted }]}>Stock</Text>
                    {businessProfile !== 'createur' && <Text style={[S.th, S.cBarcode, { color: colors.textMuted }]}>Barcode</Text>}
                    <Text style={[S.th, S.cImage,   { color: colors.textMuted }]}>Image</Text>
                    <Text style={[S.th, S.cStatut,  { color: colors.textMuted }]}>Statut</Text>
                  </View>
                  {rowsWithErrors.map(({ row, errors }, i) => {
                    const bad = errors.length > 0;
                    const imgs   = [row.image_url, row.image2_url, row.image3_url].filter(Boolean).length;
                    return (
                      <View key={i} style={[S.tableRow, {
                        backgroundColor: bad ? '#FFF1F2' : i % 2 === 0 ? colors.bgCard : colors.bgHover,
                        borderBottomColor: colors.border,
                      }]}>
                        <Text style={[S.td, S.cLigne,  { color: colors.textMuted }]}>{row._rowIndex}</Text>
                        <Text style={[S.td, S.cNom,    { color: bad ? '#B91C1C' : colors.text }]} numberOfLines={1}>
                          {row.nom || row.name || '—'}
                        </Text>
                        <Text style={[S.td, S.cPrix,   { color: bad ? '#B91C1C' : '#16A34A', fontWeight: '700' }]}>
                          {row.prix ? `${Number(row.prix).toLocaleString('fr-FR')}F` : '—'}
                        </Text>
                        <Text style={[S.td, S.cStock,  { color: colors.text }]}>{row.stock || '1'}</Text>
                        {businessProfile !== 'createur' && (
                          <Text style={[S.td, S.cBarcode, { color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]} numberOfLines={1}>
                            {row.barcode || '—'}
                          </Text>
                        )}
                        <Text style={[S.td, S.cImage, { color: imgs > 0 ? '#2563EB' : colors.textMuted }]}>
                          {imgs > 0 ? `✓ ${imgs}` : '—'}
                        </Text>
                        <View style={[S.td, S.cStatut, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                          <View style={[S.badge, { backgroundColor: bad ? '#FEE2E2' : '#DCFCE7' }]}>
                            <Text style={[S.badgeText, { color: bad ? '#DC2626' : '#16A34A' }]}>
                              {bad ? '✕ Ignoré' : '✓ OK'}
                            </Text>
                          </View>
                          {bad && errors.map((e, ei) => (
                            <Text key={ei} style={{ fontSize: 9, color: '#DC2626', marginTop: 1 }} numberOfLines={2}>{e}</Text>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            <View style={[S.photoNote, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <Text style={S.photoNoteText}>
                📷 Produits sans image → enregistrés comme <Text style={{ fontWeight: '800' }}>Non publiés</Text>.
                Ajoutez les photos depuis "Mes produits".
              </Text>
            </View>
          </ScrollView>

          {/* Barre d'action fixe */}
          <View style={[S.fixedBar, { backgroundColor: colors.bgCard, borderTopColor: colors.border, paddingBottom: insets.bottom || 16 }]}>
            <TouchableOpacity
              style={[S.barBtnOutline, { borderColor: colors.border }]}
              onPress={() => { setStep('upload'); setRows([]); setFileName(''); setSelectedTypeId(''); setSelectedTypeName(''); }}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back-outline" size={16} color={colors.textMuted} />
              <Text style={[S.barBtnOutlineText, { color: colors.textMuted }]}>Recommencer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.barBtnPrimary, { backgroundColor: validRows.length > 0 ? colors.primary : '#D1D5DB' }]}
              onPress={handleImport}
              disabled={validRows.length === 0}
              activeOpacity={0.85}
            >
              <Ionicons name={isOffline ? 'time-outline' : 'cloud-upload-outline'} size={16} color="#fff" />
              <Text style={S.barBtnPrimaryText}>
                {isOffline ? `Mettre en file (${validRows.length})` : `Importer ${validRows.length} produit${validRows.length > 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE : importing
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'importing' && (
        <View style={S.centerBox}>
          <View style={[S.importingCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={[S.importingIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
            <Text style={[S.importingTitle, { color: colors.text }]}>Import en cours…</Text>
            <Text style={[S.importingPct, { color: colors.primary }]}>{importProgress}%</Text>
            <View style={[S.progressTrack, { backgroundColor: colors.bgHover }]}>
              <View style={[S.progressFill, { width: `${importProgress}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[S.importingNote, { color: colors.textMuted }]}>Ne fermez pas cette page</Text>
          </View>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE : done
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'done' && importResult && (() => {
        const isQueued  = (importResult.queued || 0) > 0;
        const isSuccess = !isQueued && importResult.created > 0;
        const iconName  = isQueued ? 'time' : isSuccess ? 'checkmark-circle' : 'alert-circle';
        const iconColor = isQueued ? '#2563EB' : isSuccess ? '#10B981' : '#EF4444';
        const iconBg    = isQueued ? '#EFF6FF'  : isSuccess ? '#ECFDF5' : '#FEF2F2';
        return (
          <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>
            <View style={[S.doneCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={[S.doneIconCircle, { backgroundColor: iconBg }]}>
                <Ionicons name={iconName} size={48} color={iconColor} />
              </View>
              <Text style={[S.doneTitle, { color: colors.text }]}>
                {isQueued ? 'En attente de sync' : isSuccess ? 'Import réussi !' : "Échec de l'import"}
              </Text>
              {importResult.message
                ? <Text style={[S.doneSub, { color: colors.textMuted }]}>{importResult.message}</Text>
                : null
              }

              {!isQueued && (
                <View style={S.doneStats}>
                  <View style={[S.doneStatTile, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <Text style={[S.doneStatNum, { color: '#16A34A' }]}>{importResult.created}</Text>
                    <Text style={[S.doneStatLbl, { color: '#15803D' }]}>Créés</Text>
                  </View>
                  <View style={[S.doneStatTile, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                    <Text style={[S.doneStatNum, { color: '#DC2626' }]}>{importResult.errors}</Text>
                    <Text style={[S.doneStatLbl, { color: '#B91C1C' }]}>Erreurs</Text>
                  </View>
                  <View style={[S.doneStatTile, { backgroundColor: colors.bgHover, borderColor: colors.border }]}>
                    <Text style={[S.doneStatNum, { color: colors.textMuted }]}>{importResult.skipped}</Text>
                    <Text style={[S.doneStatLbl, { color: colors.textMuted }]}>Ignorés</Text>
                  </View>
                </View>
              )}

              {/* Message d'erreur serveur global */}
              {!isQueued && importResult.message && !isSuccess && (
                <View style={[S.errorMsgBox, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                  <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
                  <Text style={S.errorMsgText}>{importResult.message}</Text>
                </View>
              )}

              {/* Détail ligne par ligne des produits en erreur */}
              {!isQueued && importResult.errorDetails?.length > 0 && (
                <View style={[S.errorDetailBox, { backgroundColor: colors.bgCard, borderColor: '#FCA5A5' }]}>
                  <View style={S.errorDetailHeader}>
                    <Ionicons name="warning-outline" size={14} color="#DC2626" />
                    <Text style={S.errorDetailTitle}>Détail des erreurs</Text>
                  </View>
                  {importResult.errorDetails.map((e, i) => (
                    <View key={i} style={[S.errorDetailRow, { borderTopColor: '#FEE2E2' }]}>
                      <View style={S.errorDetailLeft}>
                        <Text style={S.errorDetailNom} numberOfLines={1}>{e.nom || `Produit ${i + 1}`}</Text>
                        <Text style={S.errorDetailReason}>{e.reason || e.message || e.error || 'Erreur inconnue'}</Text>
                      </View>
                      <View style={S.errorDetailBadge}>
                        <Text style={S.errorDetailBadgeText}>✗</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {isQueued && (
                <View style={[S.photoNote, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', width: '100%' }]}>
                  <Text style={S.photoNoteText}>
                    {importResult.queued} produit{importResult.queued > 1 ? 's' : ''} seront créés automatiquement à la reconnexion.
                  </Text>
                </View>
              )}

              {!isQueued && isSuccess && (
                <View style={[S.photoNote, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', width: '100%' }]}>
                  <Text style={S.photoNoteText}>
                    📷 Les produits sans image sont <Text style={{ fontWeight: '800' }}>Non publiés</Text>. Ajoutez leur photo depuis "Mes produits".
                  </Text>
                </View>
              )}

              <View style={S.doneActions}>
                <TouchableOpacity style={[S.doneOutline, { borderColor: colors.primary }]} onPress={resetAll} activeOpacity={0.8}>
                  <Text style={[S.doneOutlineText, { color: colors.primary }]}>Nouvel import</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.donePrimary, { backgroundColor: colors.primary }]} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                  <Ionicons name="cube-outline" size={16} color="#fff" />
                  <Text style={S.donePrimaryText}>Mes produits</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        );
      })()}

      {/* ── Bottom sheet type ─────────────────────────────────────────────── */}
      <BottomSheet visible={showTypeSheet} onClose={() => setShowTypeSheet(false)} title="Type de produit" colors={colors}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {(() => {
            const catMap = Object.fromEntries(storeCategories.map(c => [String(c._id), c.name || c.nom]));
            const grouped = {};
            storeTypes.forEach(t => {
              const key   = String(t.clefCategories || t.ClefCategorie || 'autres');
              const label = catMap[key] || 'Autres';
              if (!grouped[label]) grouped[label] = [];
              grouped[label].push(t);
            });
            return Object.entries(grouped).map(([catLabel, catTypes]) => {
              const isOpen      = !!openCats[catLabel];
              const hasSelected = catTypes.some(t => String(t._id) === selectedTypeId);
              return (
                <View key={catLabel} style={[S.accordion, { borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={[S.accordionHead, { backgroundColor: isOpen ? (colors.primaryLight ?? '#EFF6FF') : colors.bgHover }]}
                    onPress={() => setOpenCats(p => ({ ...p, [catLabel]: !p[catLabel] }))}
                    activeOpacity={0.75}
                  >
                    <Text style={[S.accordionHeadText, { color: isOpen ? colors.primary : colors.text }]}>{catLabel}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {hasSelected && !isOpen && <View style={[S.accordionDot, { backgroundColor: colors.primary }]} />}
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={isOpen ? colors.primary : colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                  {isOpen && catTypes.map(t => {
                    const active = String(t._id) === selectedTypeId;
                    return (
                      <TouchableOpacity
                        key={String(t._id)}
                        style={[S.accordionItem, { borderTopColor: colors.border, backgroundColor: active ? (colors.primaryLight ?? '#EFF6FF') : 'transparent' }]}
                        onPress={() => {
                          setSelectedTypeId(String(t._id));
                          setSelectedTypeName(`${t.nom || t.name} → ${catLabel}`);
                          setShowTypeSheet(false);
                          setOpenCats({});
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={[S.accordionItemText, { color: active ? colors.primary : colors.text }]}>{t.nom || t.name}</Text>
                        {active && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            });
          })()}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  headerSafe: { borderBottomWidth: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 1 },
  offlinePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: '#FFFBEB' },
  offlinePillText: { fontSize: 10, fontWeight: '700', color: '#D97706' },

  scroll: { padding: 16, gap: 14, paddingBottom: 40 },

  // Step cards (étape upload)
  stepCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  stepCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: { width: 32, height: 32, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText: { fontSize: 15, fontWeight: '900' },
  stepCardTitle: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  stepCardSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  // Profile badge dans step card 1
  profileBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  profileBadgeIcon: { fontSize: 26 },
  profileBadgeLabel: { fontSize: 13, fontWeight: '700' },
  profileBadgeDesc: { fontSize: 11, marginTop: 2, lineHeight: 15 },

  // Colonnes toggle
  colsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  colsToggleText: { flex: 1, fontSize: 12, fontWeight: '600' },
  colsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  colChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  colChipText: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  colsNote: { fontSize: 10, width: '100%' },

  // Download button
  downloadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  downloadBtnText: { fontSize: 14, fontWeight: '700' },

  // Type button
  warnInline: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FFFBEB' },
  warnInlineText: { fontSize: 12, color: '#92400E', flex: 1, lineHeight: 17 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
  typeBtnText: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Drop zone
  dropZone: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 18, padding: 28, alignItems: 'center', gap: 10 },
  dropZoneIconWrap: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  dropZoneTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  dropZoneSub: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  dropZonePill: { marginTop: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  dropZonePillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Offline banner
  offlineBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, backgroundColor: '#FFFBEB' },
  offlineBannerText: { fontSize: 12, fontWeight: '600', color: '#92400E', flex: 1, lineHeight: 18 },

  // Preview — file banner
  fileBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  fileBannerIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  fileBannerName: { fontSize: 13, fontWeight: '700' },
  fileBannerType: { fontSize: 11, marginTop: 2 },

  // Preview — summary
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryTile: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
  summaryBig: { fontSize: 26, fontWeight: '900' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  // Warn box
  warnBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  warnBoxText: { fontSize: 12, color: '#92400E', flex: 1, lineHeight: 17 },

  // Table
  tableWrap: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, alignItems: 'center' },
  th: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  td: { fontSize: 12 },
  cLigne:  { width: 30 }, cNom: { width: 130 }, cPrix: { width: 72 },
  cStock:  { width: 44 }, cBarcode: { width: 86 }, cImage: { width: 48 }, cStatut: { width: 60 },
  badge: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  // Photo note
  photoNote: { flexDirection: 'row', padding: 12, borderRadius: 14, borderWidth: 1 },
  photoNoteText: { fontSize: 12, color: '#1D4ED8', lineHeight: 17, flex: 1 },

  // Fixed action bar (preview)
  fixedBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  barBtnOutline: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  barBtnOutlineText: { fontSize: 13, fontWeight: '700' },
  barBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  barBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Importing
  centerBox: { flex: 1, justifyContent: 'center', padding: 24 },
  importingCard: { borderRadius: 24, borderWidth: 1, padding: 32, alignItems: 'center', gap: 10 },
  importingIconWrap: { width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  importingTitle: { fontSize: 18, fontWeight: '800' },
  importingPct: { fontSize: 28, fontWeight: '900' },
  progressTrack: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  importingNote: { fontSize: 12, marginTop: 4 },

  // Done
  doneCard: { borderRadius: 24, borderWidth: 1, padding: 24, alignItems: 'center', gap: 14 },
  doneIconCircle: { width: 90, height: 90, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  doneTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  doneSub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  doneStats: { flexDirection: 'row', gap: 10, width: '100%' },
  doneStatTile: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
  doneStatNum: { fontSize: 24, fontWeight: '900' },
  doneStatLbl: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  doneActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },

  // Erreurs détaillées
  errorMsgBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, width: '100%' },
  errorMsgText: { flex: 1, fontSize: 13, color: '#B91C1C', lineHeight: 18, fontWeight: '600' },
  errorDetailBox: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', width: '100%' },
  errorDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FEF2F2' },
  errorDetailTitle: { fontSize: 12, fontWeight: '800', color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.4 },
  errorDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  errorDetailLeft: { flex: 1 },
  errorDetailNom: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  errorDetailReason: { fontSize: 11, color: '#DC2626', marginTop: 2, lineHeight: 15 },
  errorDetailBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  errorDetailBadgeText: { fontSize: 12, fontWeight: '900', color: '#DC2626' },
  doneOutline: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  doneOutlineText: { fontSize: 14, fontWeight: '700' },
  donePrimary: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  donePrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Accordéon types
  accordion: { borderWidth: 1, borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  accordionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  accordionHeadText: { fontSize: 14, fontWeight: '700' },
  accordionDot: { width: 8, height: 8, borderRadius: 4 },
  accordionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1 },
  accordionItemText: { fontSize: 14 },
});
