/**
 * AgentsScreen — gestion des agents caissier
 *
 * Accessible depuis PlusScreen (plan Pro ou Business uniquement).
 * Permet de créer, activer/désactiver et supprimer des agents.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Animated, TouchableWithoutFeedback, Dimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../stores/authStore';
import apiClient from '../config/api';
import { getMeta, setMeta } from '../db/database';
import { mutationQueue } from '../services/mutationQueue';
import { useSync } from '../hooks/useSync';
import Toast from 'react-native-toast-message';

const { height: H } = Dimensions.get('window');

// ─── Quota libellés ───────────────────────────────────────────────────────────
const PLAN_QUOTA = { Starter: 0, Pro: 2, Business: 6 };

// ─── Pays téléphone (identique à LoginScreen) ─────────────────────────────────
const COUNTRIES = [
  { code: 'NE', name: 'Niger',         dial: '+227', flag: '🇳🇪', format: 'XX XX XX XX',    digits: 8 },
  { code: 'BJ', name: 'Bénin',         dial: '+229', flag: '🇧🇯', format: 'XX XX XX XX',    digits: 8 },
  { code: 'BF', name: 'Burkina Faso',  dial: '+226', flag: '🇧🇫', format: 'XX XX XX XX',    digits: 8 },
  { code: 'ML', name: 'Mali',          dial: '+223', flag: '🇲🇱', format: 'XX XX XX XX',    digits: 8 },
  { code: 'SN', name: 'Sénégal',       dial: '+221', flag: '🇸🇳', format: 'XX XXX XX XX',   digits: 9 },
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225', flag: '🇨🇮', format: 'XX XX XX XX XX', digits: 10 },
  { code: 'TG', name: 'Togo',          dial: '+228', flag: '🇹🇬', format: 'XX XX XX XX',    digits: 8 },
  { code: 'GN', name: 'Guinée',        dial: '+224', flag: '🇬🇳', format: 'XXX XX XX XX',   digits: 9 },
  { code: 'CM', name: 'Cameroun',      dial: '+237', flag: '🇨🇲', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'MR', name: 'Mauritanie',    dial: '+222', flag: '🇲🇷', format: 'XX XX XX XX',    digits: 8 },
  { code: 'GH', name: 'Ghana',         dial: '+233', flag: '🇬🇭', format: 'XX XXX XXXX',    digits: 9 },
  { code: 'NG', name: 'Nigeria',       dial: '+234', flag: '🇳🇬', format: 'XXX XXX XXXX',   digits: 10 },
  { code: 'FR', name: 'France',        dial: '+33',  flag: '🇫🇷', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'MA', name: 'Maroc',         dial: '+212', flag: '🇲🇦', format: 'X XX XX XX XX',  digits: 9 },
  { code: 'DZ', name: 'Algérie',       dial: '+213', flag: '🇩🇿', format: 'XXX XX XX XX',   digits: 9 },
  { code: 'US', name: 'États-Unis',    dial: '+1',   flag: '🇺🇸', format: 'XXX XXX XXXX',   digits: 10 },
];

const formatPhone = (raw, pattern) => {
  const digits = raw.replace(/\D/g, '');
  let res = '', di = 0;
  for (let i = 0; i < pattern.length && di < digits.length; i++) {
    if (pattern[i] === 'X') res += digits[di++];
    else if (di > 0) res += pattern[i];
  }
  return res;
};
const strip = (s) => s.replace(/\D/g, '');

// ─── Picker indicatif pays ────────────────────────────────────────────────────
function CountryPicker({ value, onChange, colors }) {
  const insets                = useSafeAreaInsets();
  const [open, setOpen]       = useState(false);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch]   = useState('');
  const slideAnim = useRef(new Animated.Value(H * 0.72)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (open) setMounted(true); }, [open]);
  useEffect(() => {
    if (!mounted) return;
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.timing(bgAnim,    { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [mounted]);

  const dismiss = (cb) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: H * 0.72, duration: 220, useNativeDriver: true }),
      Animated.timing(bgAnim,    { toValue: 0,        duration: 220, useNativeDriver: true }),
    ]).start(() => { setMounted(false); setOpen(false); cb?.(); });
  };

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search)
  );

  return (
    <>
      <TouchableOpacity style={p.dialBtn} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={p.dialFlag}>{value.flag}</Text>
        <Text style={[p.dialCode, { color: colors.text }]}>{value.dial}</Text>
        <Ionicons name="chevron-down" size={11} color={colors.textMuted} />
      </TouchableOpacity>

      {mounted && (
        <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss()}>
          <TouchableWithoutFeedback onPress={() => dismiss()}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: bgAnim }]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[p.pickerSheet, {
            backgroundColor: colors.bgCard,
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: H * 0.72,
            paddingBottom: insets.bottom + 12,
            transform: [{ translateY: slideAnim }],
          }]}>
            <View style={p.sheetHandle}><View style={[p.handle, { backgroundColor: colors.border }]} /></View>
            <Text style={[p.sheetTitle, { color: colors.text }]}>Indicatif téléphonique</Text>
            <View style={[p.searchWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={[p.searchInput, { color: colors.text }]}
                placeholder="Rechercher..."
                placeholderTextColor={colors.textDisabled}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={i => i.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[p.sheetRow, item.code === value.code && { backgroundColor: colors.primary + '18' }]}
                  onPress={() => { dismiss(() => onChange(item)); setSearch(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 22, marginRight: 12 }}>{item.flag}</Text>
                  <Text style={[p.sheetRowLabel, { color: colors.text }, item.code === value.code && { color: colors.primary, fontWeight: '800' }]}>
                    {item.name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 13 }}>{item.dial}</Text>
                  {item.code === value.code && <Ionicons name="checkmark" size={16} color={colors.primary} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              )}
            />
          </Animated.View>
        </Modal>
      )}
    </>
  );
}

// ─── Carte d'un agent ─────────────────────────────────────────────────────────
function AgentCard({ agent, onToggle, onDelete, onResetPin, colors }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={[styles.agentAvatar, { backgroundColor: colors.primary + '18' }]}>
        {agent.photo ? (
          <Image source={{ uri: agent.photo }} style={{ width: 44, height: 44, borderRadius: 12 }} />
        ) : (
          <Ionicons name="person-outline" size={20} color={colors.primary} />
        )}
      </View>
      <View style={styles.agentInfo}>
        <Text style={[styles.agentName, { color: colors.text }]}>{agent.name}</Text>
        <Text style={[styles.agentPhone, { color: colors.textMuted }]}>{agent.phone}</Text>
        <View style={[
          styles.badge,
          { backgroundColor: agent.isActive ? '#10B98118' : '#EF444418' },
        ]}>
          <Text style={[styles.badgeText, { color: agent.isActive ? '#10B981' : '#EF4444' }]}>
            {agent.isActive ? 'Actif' : 'Désactivé'}
          </Text>
        </View>
      </View>
      <View style={styles.agentActions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#F59E0B18' }]}
          onPress={() => onResetPin(agent)}
          activeOpacity={0.7}
        >
          <Ionicons name="key-outline" size={18} color="#F59E0B" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: agent.isActive ? '#EF444418' : '#10B98118' }]}
          onPress={() => onToggle(agent)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={agent.isActive ? 'pause-circle-outline' : 'play-circle-outline'}
            size={20}
            color={agent.isActive ? '#EF4444' : '#10B981'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#EF444418' }]}
          onPress={() => onDelete(agent)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function AgentsScreen() {
  const { colors }     = useTheme();
  const { token, subscription } = useAuthStore();
  const { isOffline }  = useSync();

  const planType = subscription?.planName || 'Starter';
  const quota    = PLAN_QUOTA[planType] ?? 0;

  const [agents,      setAgents]      = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');

  // Formulaire création
  const [newName,    setNewName]    = useState('');
  const [phoneRaw,   setPhoneRaw]   = useState('');
  const [country,    setCountry]    = useState(COUNTRIES[0]);
  const [newPin,     setNewPin]     = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const fetchAgents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get('/api/agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { agents: list, activeCount: ac } = res.data.data;
      setAgents(list);
      setActiveCount(ac);
      setMeta('agents_cache', { agents: list, activeCount: ac }).catch(() => {});
    } catch (e) {
      if (!silent) console.error('Agents fetch error:', e.response?.data || e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    getMeta('agents_cache').then(cached => {
      if (cached) {
        setAgents(cached.agents);
        setActiveCount(cached.activeCount);
        fetchAgents(true);
      } else {
        fetchAgents(false);
      }
    }).catch(() => fetchAgents(false));
  }, []);

  const resetForm = () => {
    setNewName(''); setPhoneRaw(''); setCountry(COUNTRIES[0]);
    setNewPin(''); setPinConfirm(''); setFormError('');
  };

  const handleCreate = async () => {
    setFormError('');
    const digits = strip(phoneRaw);
    if (!newName.trim() || !digits || !newPin) {
      return setFormError('Tous les champs sont requis');
    }
    if (digits.length < country.digits) {
      return setFormError(`Numéro incomplet — ${country.digits} chiffres requis pour ${country.name}`);
    }
    if (!/^\d{4}$/.test(newPin)) {
      return setFormError('Le PIN doit être composé de 4 chiffres');
    }
    if (newPin !== pinConfirm) {
      return setFormError('Les deux PIN ne correspondent pas');
    }

    const phone = `${country.dial}${digits}`;

    setSaving(true);
    try {
      await apiClient.post('/api/agents', {
        name: newName.trim(), phone, pin: newPin,
      }, { headers: { Authorization: `Bearer ${token}` } });

      setShowModal(false);
      resetForm();
      fetchAgents();
    } catch (e) {
      setFormError(e.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (agent) => {
    const action = agent.isActive ? 'désactiver' : 'activer';
    Alert.alert(
      `${agent.isActive ? 'Désactiver' : 'Activer'} l'agent`,
      `Voulez-vous ${action} ${agent.name} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: agent.isActive ? 'Désactiver' : 'Activer',
          style: agent.isActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await apiClient.patch(`/api/agents/${agent._id}`, {
                isActive: !agent.isActive,
              }, { headers: { Authorization: `Bearer ${token}` } });
              fetchAgents();
            } catch (e) {
              Alert.alert('Erreur', e.response?.data?.message || 'Impossible de modifier l\'agent');
            }
          },
        },
      ]
    );
  };

  const handleDelete = (agent) => {
    Alert.alert(
      'Supprimer l\'agent',
      `Êtes-vous sûr de vouloir supprimer ${agent.name} ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/api/agents/${agent._id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              fetchAgents();
            } catch (e) {
              Alert.alert('Erreur', e.response?.data?.message || 'Impossible de supprimer l\'agent');
            }
          },
        },
      ]
    );
  };

  const [resetPinAgent, setResetPinAgent] = useState(null);
  const [newPinReset,   setNewPinReset]   = useState('');
  const [pinResetConfirm, setPinResetConfirm] = useState('');
  const [resetPinError,   setResetPinError]   = useState('');
  const [resetPinSaving,  setResetPinSaving]  = useState(false);

  const handleResetPin = async () => {
    setResetPinError('');
    if (!/^\d{4}$/.test(newPinReset)) return setResetPinError('Le PIN doit être 4 chiffres');
    if (newPinReset !== pinResetConfirm) return setResetPinError('Les deux PIN ne correspondent pas');
    setResetPinSaving(true);
    const agentName = resetPinAgent.name;
    const agentId   = String(resetPinAgent._id || resetPinAgent.id);
    try {
      if (isOffline) throw Object.assign(new Error('offline'), { isOffline: true });
      await apiClient.patch(`/api/agents/${agentId}/reset-pin`, { pin: newPinReset }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResetPinAgent(null);
      setNewPinReset('');
      setPinResetConfirm('');
      Toast.show({ type: 'success', text1: 'PIN réinitialisé', text2: `Nouveau PIN de ${agentName} enregistré.` });
    } catch (e) {
      if (e.isOffline || !e.response) {
        // Offline : enfile dans la mutation queue, sera appliqué à la reconnexion
        await mutationQueue.push('RESET_AGENT_PIN', { agentId, pin: newPinReset });
        setResetPinAgent(null);
        setNewPinReset('');
        setPinResetConfirm('');
        Toast.show({ type: 'info', text1: 'Hors ligne', text2: `PIN de ${agentName} sera mis à jour à la reconnexion.` });
      } else {
        setResetPinError(e.response?.data?.message || 'Erreur lors de la réinitialisation');
      }
    } finally {
      setResetPinSaving(false);
    }
  };

  const canAdd = activeCount < quota;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* Quota banner */}
      <View style={[styles.quotaBanner, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.quotaTitle, { color: colors.text }]}>
            Agents caissier — Plan {planType}
          </Text>
          <Text style={[styles.quotaDesc, { color: colors.textMuted }]}>
            {activeCount} / {quota} agent{quota > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: canAdd ? colors.primary : colors.bgHover }]}
          onPress={() => canAdd && setShowModal(true)}
          disabled={!canAdd}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color={canAdd ? '#fff' : colors.textDisabled} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : agents.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={colors.textDisabled} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Aucun agent pour le moment
          </Text>
          {quota > 0 && (
            <Text style={[styles.emptyHint, { color: colors.textDisabled }]}>
              Vous pouvez créer jusqu'à {quota} agent{quota > 1 ? 's' : ''} caissier
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={a => String(a._id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <AgentCard
              agent={item}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onResetPin={(a) => { setResetPinAgent(a); setNewPinReset(''); setPinResetConfirm(''); setResetPinError(''); }}
              colors={colors}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal reset PIN */}
      <Modal
        visible={!!resetPinAgent}
        transparent
        animationType="slide"
        onRequestClose={() => setResetPinAgent(null)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setResetPinAgent(null)} />
            <View style={[styles.modalContent, { backgroundColor: colors.bgCard }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F59E0B18', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="key-outline" size={18} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { textAlign: 'left', marginBottom: 0, fontSize: 16 }]}>Réinitialiser le PIN</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{resetPinAgent?.name}</Text>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={[styles.modalForm, { marginTop: 10 }]}>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSub }]}>Nouveau PIN (4 chiffres)</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                      <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="XXXX"
                        placeholderTextColor={colors.textDisabled}
                        value={newPinReset}
                        onChangeText={v => setNewPinReset(v.replace(/\D/g, '').slice(0, 4))}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                      />
                    </View>
                  </View>
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSub }]}>Confirmer le nouveau PIN</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                      <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="XXXX"
                        placeholderTextColor={colors.textDisabled}
                        value={pinResetConfirm}
                        onChangeText={v => setPinResetConfirm(v.replace(/\D/g, '').slice(0, 4))}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                      />
                    </View>
                  </View>

                  {resetPinError ? (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle-outline" size={14} color={colors.danger || '#EF4444'} />
                      <Text style={[styles.formError, { color: colors.danger || '#EF4444' }]}>{resetPinError}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: resetPinSaving ? colors.bgHover : '#F59E0B' }]}
                    onPress={handleResetPin}
                    disabled={resetPinSaving}
                    activeOpacity={0.85}
                  >
                    {resetPinSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <Ionicons name="key-outline" size={16} color="#fff" />
                          <Text style={styles.saveBtnText}>Réinitialiser le PIN</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal création */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowModal(false); resetForm(); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              onPress={() => { setShowModal(false); resetForm(); }}
            />
            <View style={[styles.modalContent, { backgroundColor: colors.bgCard }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Nouvel agent caissier</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.modalForm}>

                  {/* Nom */}
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSub }]}>Nom complet</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                      <Ionicons name="person-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="Prénom Nom"
                        placeholderTextColor={colors.textDisabled}
                        value={newName}
                        onChangeText={setNewName}
                      />
                    </View>
                  </View>

                  {/* Téléphone avec picker indicatif */}
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSub }]}>Numéro de téléphone</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                      <CountryPicker value={country} onChange={(c) => { setCountry(c); setPhoneRaw(''); }} colors={colors} />
                      <View style={[styles.phoneDivider, { backgroundColor: colors.border }]} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder={country.format.replace(/X/g, '0')}
                        placeholderTextColor={colors.textDisabled}
                        value={phoneRaw}
                        onChangeText={(v) => setPhoneRaw(formatPhone(v, country.format))}
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>

                  {/* PIN */}
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSub }]}>PIN (4 chiffres)</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                      <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="XXXX"
                        placeholderTextColor={colors.textDisabled}
                        value={newPin}
                        onChangeText={v => setNewPin(v.replace(/\D/g, '').slice(0, 4))}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                      />
                    </View>
                  </View>

                  {/* Confirmer PIN */}
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.textSub }]}>Confirmer le PIN</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                      <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="XXXX"
                        placeholderTextColor={colors.textDisabled}
                        value={pinConfirm}
                        onChangeText={v => setPinConfirm(v.replace(/\D/g, '').slice(0, 4))}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                      />
                    </View>
                  </View>

                  {formError ? (
                    <View style={styles.errorRow}>
                      <Ionicons name="alert-circle-outline" size={14} color={colors.danger || '#EF4444'} />
                      <Text style={[styles.formError, { color: colors.danger || '#EF4444' }]}>{formError}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: saving ? colors.bgHover : colors.primary }]}
                    onPress={handleCreate}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <Ionicons name="person-add-outline" size={16} color="#fff" />
                          <Text style={styles.saveBtnText}>Créer l'agent</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles picker (statiques — couleur dynamiques passées en prop) ───────────
const p = StyleSheet.create({
  dialBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4 },
  dialFlag:     { fontSize: 20 },
  dialCode:     { fontSize: 14, fontWeight: '700', minWidth: 38 },
  pickerSheet:  { borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, elevation: 30 },
  sheetHandle:  { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handle:       { width: 40, height: 4, borderRadius: 2 },
  sheetTitle:   { fontSize: 16, fontWeight: '900', paddingHorizontal: 20, paddingBottom: 10 },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput:  { flex: 1, fontSize: 14 },
  sheetRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13 },
  sheetRowLabel:{ flex: 1, fontSize: 14, fontWeight: '600' },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },

  quotaBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 16, padding: 16, borderRadius: 16, borderWidth: 1,
  },
  quotaTitle: { fontSize: 15, fontWeight: '700' },
  quotaDesc:  { fontSize: 13, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },

  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 32 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  agentAvatar: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  agentInfo:   { flex: 1, gap: 3 },
  agentName:   { fontSize: 14, fontWeight: '700' },
  agentPhone:  { fontSize: 12 },
  badge:       { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText:   { fontSize: 11, fontWeight: '700' },
  agentActions:{ flexDirection: 'row', gap: 8 },
  actionBtn:   { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingBottom: 60 },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },

  // Modal
  modalOverlay:  { flex: 1, justifyContent: 'flex-end' },
  modalContent:  { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 12, maxHeight: '90%' },
  modalHandle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle:    { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  modalForm:     { gap: 14 },
  field:         { gap: 6 },
  fieldLabel:    { fontSize: 13, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, minHeight: 52, overflow: 'hidden',
  },
  inputIcon:    { marginLeft: 12 },
  input:        { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 14 },
  phoneDivider: { width: 1, height: 22, marginVertical: 6 },
  errorRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  formError:    { fontSize: 13, fontWeight: '600', flex: 1 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
