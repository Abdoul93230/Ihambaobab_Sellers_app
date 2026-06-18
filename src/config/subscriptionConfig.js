/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║        SOURCE UNIQUE DE VÉRITÉ — PLANS ABONNEMENTS          ║
 * ║  Modifier ICI uniquement. Tout le backend et le frontend     ║
 * ║  lisent ces valeurs. Ne pas dupliquer dans d'autres fichiers.║
 * ╚══════════════════════════════════════════════════════════════╝
 * Miroir de : secoure/src/config/subscriptionConfig.js
 *          et Sellers/src/config/subscriptionConfig.js
 */

const SUBSCRIPTION_CONFIG = {

  PLANS: {
    Starter: {
      name: 'Starter',
      description: "Idéal pour débuter. 2 mois d'essai gratuit, aucun paiement requis.",
      pricing: {
        monthly: 2000,
        annual: 21600,      // 2000 * 12 - 10%
        trialMonths: 2,
        annualDiscount: 0.10,
      },
      commission: 3.0,
      productLimit: 20,
      features: {
        pos: false,
        productManagement: {
          maxProducts: 20,
          maxVariants: 3,
          maxCategories: 5,
          catalogImport: false,
        },
        paymentOptions: {
          manualPayment: true,
          mobileMoney: true,
          cardPayment: false,
          customPayment: false,
        },
        support: {
          responseTime: 48,
          channels: ['email'],
          onboarding: 'standard',
        },
        marketing: {
          marketplaceVisibility: 'standard',
          maxActiveCoupons: 1,
          emailMarketing: false,
          abandonedCartRecovery: false,
        },
      },
    },

    Pro: {
      name: 'Pro',
      description: "Pour les vendeurs réguliers. 1 mois d'essai gratuit, aucun paiement requis.",
      pricing: {
        monthly: 5000,
        annual: 54000,      // 5000 * 12 - 10%
        trialMonths: 1,
        annualDiscount: 0.10,
      },
      commission: 2.5,
      productLimit: -1,
      features: {
        pos: true,
        productManagement: {
          maxProducts: -1,
          maxVariants: 10,
          maxCategories: 20,
          catalogImport: true,
        },
        paymentOptions: {
          manualPayment: true,
          mobileMoney: true,
          cardPayment: true,
          customPayment: false,
        },
        support: {
          responseTime: 24,
          channels: ['email', 'chat'],
          onboarding: 'personnalisé',
        },
        marketing: {
          marketplaceVisibility: 'prioritaire',
          maxActiveCoupons: 5,
          emailMarketing: true,
          abandonedCartRecovery: false,
        },
      },
    },

    Business: {
      name: 'Business',
      description: "Pour les vendeurs établis à fort volume. 1 mois d'essai gratuit, aucun paiement requis.",
      pricing: {
        monthly: 10000,
        annual: 108000,     // 10000 * 12 - 10%
        trialMonths: 1,
        annualDiscount: 0.10,
      },
      commission: 2.0,
      productLimit: -1,
      features: {
        pos: true,
        productManagement: {
          maxProducts: -1,
          maxVariants: -1,
          maxCategories: -1,
          catalogImport: true,
        },
        paymentOptions: {
          manualPayment: true,
          mobileMoney: true,
          cardPayment: true,
          customPayment: true,
        },
        support: {
          responseTime: 4,
          channels: ['email', 'chat', 'phone'],
          onboarding: 'dédié',
        },
        marketing: {
          marketplaceVisibility: 'premium',
          maxActiveCoupons: -1,
          emailMarketing: true,
          abandonedCartRecovery: true,
          customMarketing: true,
        },
      },
    },
  },

  DEFAULT_COMMISSION: 3.0,

  PAYMENT_METHODS: {
    mynita:       { phone: '+22790123456', name: 'iHambaObab Mynita',       active: true },
    aman:         { phone: '+22798765432', name: 'iHambaObab Aman',         active: true },
    airtel_money: { phone: '+22787654321', name: 'iHambaObab Airtel Money', active: true },
    orange_money: { phone: '+22776543210', name: 'iHambaObab Orange Money', active: true },
  },

  SUBSCRIPTION_STATUSES: {
    ACTIVE:    'active',
    EXPIRED:   'expired',
    SUSPENDED: 'suspended',
    CANCELLED: 'cancelled',
    PENDING:   'pending',
    TRIAL:     'trial',
  },

  REQUEST_STATUSES: {
    PENDING_PAYMENT:   'pending_payment',
    PAYMENT_SUBMITTED: 'payment_submitted',
    PAYMENT_VERIFIED:  'payment_verified',
    ACTIVATED:         'activated',
    REJECTED:          'rejected',
    CANCELLED:         'cancelled',
  },

  GRACE_PERIOD_DAYS:       7,
  PAYMENT_DEADLINE_HOURS:  24,
  RENEWAL_REMINDER_DAYS:   [7, 3, 1],

  // ─── Utilitaires ──────────────────────────────────────────────

  getPlan(planName) {
    return SUBSCRIPTION_CONFIG.PLANS[planName] || null;
  },

  getPlanPrice(planName, billingCycle = 'monthly') {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.pricing[billingCycle] : null;
  },

  getPlanCommission(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.commission : SUBSCRIPTION_CONFIG.DEFAULT_COMMISSION;
  },

  calculateAnnualSavings(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    if (!plan) return 0;
    return (plan.pricing.monthly * 12) - plan.pricing.annual;
  },

  getPlanFeatures(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.features : null;
  },

  hasPosAccess(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    return plan ? plan.features.pos === true : false;
  },

  toPlanDefaults(planName) {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    if (!plan) return null;
    return {
      price:        { monthly: plan.pricing.monthly, annual: plan.pricing.annual },
      commission:   plan.commission,
      productLimit: plan.productLimit,
      trialMonths:  plan.pricing.trialMonths,
      features:     plan.features,
    };
  },

  /**
   * Génère une liste de fonctionnalités riches à partir des valeurs brutes du plan.
   * Chaque entrée : { name: string, included: boolean, highlight?: boolean }
   */
  generateFeatureList(planName, billingCycle = 'monthly') {
    const plan = SUBSCRIPTION_CONFIG.PLANS[planName];
    if (!plan) return [];

    const f   = plan.features;
    const pm  = f.productManagement;
    const po  = f.paymentOptions;
    const mkt = f.marketing;
    const sup = f.support;
    const list = [];

    // Produits
    if (pm.maxProducts === -1) {
      list.push({ name: 'Produits & variantes illimités', included: true });
    } else {
      list.push({ name: `Jusqu'à ${pm.maxProducts} produits (${pm.maxVariants} variantes/produit)`, included: true });
    }
    if (pm.catalogImport) {
      list.push({ name: 'Import catalogue CSV / Excel', included: true });
    } else {
      list.push({ name: 'Import catalogue CSV / Excel', included: false });
    }

    // Paiements
    const payMethods = [];
    if (po.mobileMoney)   payMethods.push('Mobile Money');
    if (po.cardPayment)   payMethods.push('Carte bancaire');
    if (po.customPayment) payMethods.push('Paiement personnalisé');
    if (payMethods.length > 0) {
      list.push({ name: `Paiements : ${payMethods.join(', ')}`, included: true });
    } else {
      list.push({ name: 'Paiement manuel uniquement', included: true });
    }

    // Caisse POS
    if (f.pos) {
      list.push({ name: 'Caisse POS — 0% commission ventes physiques', included: true, highlight: true });
    } else {
      list.push({ name: 'Caisse POS (ventes physiques)', included: false });
    }

    // Commission marketplace
    list.push({ name: `Commission marketplace : ${plan.commission}% par vente`, included: true });

    // Marketing
    if (mkt.marketplaceVisibility === 'prioritaire') {
      list.push({ name: 'Visibilité prioritaire marketplace', included: true });
    } else if (mkt.marketplaceVisibility === 'premium') {
      list.push({ name: 'Visibilité premium + sponsoring boutique', included: true, highlight: true });
    } else {
      list.push({ name: 'Visibilité standard marketplace', included: true });
    }

    if (mkt.maxActiveCoupons === -1) {
      list.push({ name: 'Coupons promotionnels illimités', included: true });
    } else if (mkt.maxActiveCoupons > 1) {
      list.push({ name: `${mkt.maxActiveCoupons} coupons promotionnels actifs`, included: true });
    } else {
      list.push({ name: '1 coupon promotionnel actif', included: true });
    }

    if (mkt.emailMarketing) {
      list.push({ name: 'Campagnes email marketing', included: true });
    } else {
      list.push({ name: 'Email marketing', included: false });
    }

    if (mkt.abandonedCartRecovery) {
      list.push({ name: 'Relance automatique paniers abandonnés', included: true });
    } else {
      list.push({ name: 'Relance paniers abandonnés', included: false });
    }

    // Support
    const channelLabels = { email: 'email', chat: 'chat live', phone: 'téléphone' };
    const channelStr = (sup.channels || []).map(c => channelLabels[c] || c).join(', ');
    list.push({ name: `Support ${sup.onboarding} (< ${sup.responseTime}h) — ${channelStr}`, included: true });

    // Essai gratuit
    if (plan.pricing.trialMonths > 0) {
      list.push({ name: `${plan.pricing.trialMonths} mois d'essai gratuit inclus`, included: true, highlight: true });
    }

    return list;
  },
};

export default SUBSCRIPTION_CONFIG;
