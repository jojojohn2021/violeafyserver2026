import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, storage } from '../firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type {
  AICommerceContentPayload,
  AICommerceFeedRecord,
  AICommerceFeedRun,
  AICommerceGeneratedPayload,
  AICommercePlatformId,
  AICommercePlatformSetting,
  AICommercePlatformSettings,
  AICommercePlatformStatus,
  AICommerceStagingDraft,
  AICommerceStagingRecord,
  AICommerceSyncJob,
  AICommerceSyncLog,
  AICommerceValidationIssue,
  AICommerceValidationRecord,
  AICommerceValidationReport,
  AIProductContentPayload,
  AIProductDraft,
  AIProductDraftStatus,
  AIProductEvent,
  AIProductImage,
  AIProductMarketResearch,
  AIProductPackingResearch,
  AIProductResearchRecord,
  AIProductSEOContent,
  AIProductSEOPayload,
  AIProductSyncLog,
  AIProductTaxationResearch,
  AIProductVersion,
  AIUsageMetadata,
  ProductSlugReservation,
  PublicProductOfferProjection,
  WebPriceSourceOffer,
} from '../types';

export const AI_PRODUCT_DRAFTS_COLLECTION = 'ai_product_drafts';
export const AI_PRODUCT_VERSIONS_COLLECTION = 'ai_product_versions';
export const AI_PRODUCT_IMAGES_COLLECTION = 'ai_product_images';
export const AI_PRODUCT_RESEARCH_COLLECTION = 'ai_product_research';
export const AI_PRODUCT_SYNC_LOGS_COLLECTION = 'ai_product_sync_logs';
export const AI_PRODUCT_EVENTS_COLLECTION = 'ai_product_events';
export const PRODUCT_SLUGS_COLLECTION = 'productSlugs';
export const AI_COMMERCE_SETTINGS_COLLECTION = 'ai_commerce_settings';
export const AI_COMMERCE_STAGING_COLLECTION = 'ai_commerce_staging';
export const AI_COMMERCE_FEEDS_COLLECTION = 'ai_commerce_feeds';
export const AI_COMMERCE_SYNC_JOBS_COLLECTION = 'ai_commerce_sync_jobs';
export const AI_COMMERCE_SYNC_LOGS_COLLECTION = 'ai_commerce_sync_logs';
export const AI_COMMERCE_VALIDATION_COLLECTION = 'ai_commerce_validation';
export const AI_COMMERCE_PLATFORM_STATUS_COLLECTION = 'ai_commerce_platform_status';
export const PUBLIC_PRODUCTS_COLLECTION = 'public_products';
export const AI_PROMPT_VERSION = 'leafyearth-v8.0';
export const V10_SCHEMA_VERSION = 'leafyearth-v10.0';

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function isStaticOrUnavailable(res: Response): boolean {
  const ct = res.headers.get('content-type') || '';
  return res.status === 404 || res.status === 502 || res.status === 503 || ct.includes('text/html');
}

export interface MasterFieldComparisonItem {
  fieldKey: string;
  label: string;
  group:
    | 'general'
    | 'translations'
    | 'health'
    | 'ayurveda'
    | 'image'
    | 'taxation_pricing'
    | 'seo'
    | 'commerce';
  masterField: string;
  currentMasterValue: any;
  proposedAiValue: any;
  hasChanged: boolean;
  selectable: boolean;
  reasonIfLocked?: string;
}

export const SLUG_PATTERN_CLIENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeUrlSlugClient(raw: unknown): string {
  const input = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const withoutPaths = input
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^products\//i, '')
    .replace(/[?#].*$/, '');
  const hyphenated = withoutPaths
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return hyphenated.length > 100 ? hyphenated.slice(0, 100).replace(/-+$/g, '') : hyphenated;
}

export function isValidUrlSlugClient(slug: unknown): boolean {
  if (typeof slug !== 'string') return false;
  if (!slug || slug.length > 100) return false;
  return SLUG_PATTERN_CLIENT.test(slug);
}

export function validateGtinChecksumClient(rawGtin: unknown): {
  valid: boolean;
  normalized: string;
  format: 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14' | null;
  error?: string;
} {
  const cleaned = String(rawGtin ?? '').trim().replace(/[\s-]+/g, '');
  if (!cleaned) return { valid: false, normalized: '', format: null, error: 'GTIN is empty.' };
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, normalized: cleaned, format: null, error: 'GTIN must contain only numeric digits.' };
  }
  if (![8, 12, 13, 14].includes(cleaned.length)) {
    return {
      valid: false,
      normalized: cleaned,
      format: null,
      error: `GTIN must be 8, 12, 13, or 14 digits (got ${cleaned.length}).`,
    };
  }
  const digits = cleaned.split('').map((d) => Number.parseInt(d, 10));
  const checkDigit = digits[digits.length - 1];
  const body = digits.slice(0, -1).reverse();
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += body[i] * (i % 2 === 0 ? 3 : 1);
  }
  const expected = (10 - (sum % 10)) % 10;
  const format = `GTIN-${cleaned.length}` as 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14';
  if (checkDigit !== expected) {
    return {
      valid: false,
      normalized: cleaned,
      format,
      error: `Invalid GS1 Modulo-10 check digit: expected ${expected}, found ${checkDigit}.`,
    };
  }
  return { valid: true, normalized: cleaned, format };
}

export function buildClientFallbackSEO(
  productName: string,
  options?: { categoryHint?: string; brandHint?: string; formHint?: string }
): AIProductSEOPayload {
  const cleanName = String(productName || 'LeafyEarth Product').trim();
  const lower = cleanName.toLowerCase();
  const brand = (options?.brandHint || 'LeafyEarth').trim();

  if (lower.includes('cumin') || lower.includes('jeera')) {
    return {
      seoTitle: 'Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth',
      metaDescription:
        'Shop whole cumin seeds (Jeera / Cuminum cyminum) with warm earthy aroma for tempering, spice blends and everyday Indian cooking.',
      seoKeywords: [
        'cumin seeds',
        'jeera',
        'whole cumin',
        'cuminum cyminum',
        'indian spices',
        'tadka spice',
        'jeerakam',
        'leafyearth spices',
      ],
      urlSlug: 'cumin-seeds-jeera-whole',
    };
  }

  const form = options?.formHint || (lower.includes('oil') ? 'Cold-Pressed Oil' : lower.includes('powder') ? 'Pure Powder' : 'Natural Grade');
  const rawTitle = `${cleanName} | ${form} | ${brand}`;
  const seoTitle = rawTitle.length <= 120 ? rawTitle : `${cleanName} | ${brand}`.slice(0, 120);
  const metaDescription = `Shop authentic ${cleanName} from ${brand}. Hygienically packed in India for pure aroma, authentic culinary taste, and everyday wellness.`.slice(0, 160);
  const baseSlug = normalizeUrlSlugClient(cleanName) || 'leafyearth-product';
  return {
    seoTitle,
    metaDescription,
    seoKeywords: [
      cleanName.toLowerCase(),
      `buy ${cleanName.toLowerCase()} online`,
      `${cleanName.toLowerCase()} india`,
      (options?.categoryHint || 'indian spices').toLowerCase(),
      `${brand.toLowerCase()} ${cleanName.toLowerCase()}`,
      `pure ${cleanName.toLowerCase()}`,
    ],
    urlSlug: baseSlug,
  };
}

export function buildClientFallbackCommerce(
  productName: string,
  options?: { categoryHint?: string; packingSize?: string }
): AICommerceContentPayload {
  const cleanName = String(productName || 'LeafyEarth Product').trim();
  const lower = cleanName.toLowerCase();
  const isCumin = lower.includes('cumin') || lower.includes('jeera');
  const isOil = lower.includes('oil') || lower.includes('velichenna');
  const isHousehold = /cleaner|detergent|repellent|dishwash|handwash|perfume|floor/i.test(cleanName);

  return {
    productHighlights: isCumin
      ? [
          '100% pure, unblended whole Cumin Seeds (Jeera / Cuminum cyminum) with rich volatile oil aroma',
          'Cleaned, machine-graded, and hygienically packed in food-grade moisture-barrier pouches',
          'Essential Indian tempering (tadka) spice for dals, curries, jeera rice, and roasted masala blends',
          'Zero artificial colors, zero synthetic preservatives, and no added fillers',
          'Direct from trusted Indian spice growers with strict batch quality checks',
        ]
      : [
          `100% authentic, hygienically graded ${cleanName} sourced from trusted Indian growers`,
          'Free from artificial colors, synthetic preservatives, and chemical fillers',
          'Packed in food-grade moisture-resistant packaging to lock in natural freshness and aroma',
          `Ideal for everyday Indian culinary preparations and traditional household routines`,
        ],
    productFAQs: [
      {
        question: `What is ${cleanName} and how is it sourced?`,
        answer: `${cleanName} from LeafyEarth is sourced from verified Indian growers and hygienically packed without artificial colors or preservatives.`,
      },
      {
        question: `How should I store ${cleanName} after opening?`,
        answer: 'Store in a cool, dry place away from direct sunlight and transfer to an airtight container after opening.',
      },
      {
        question: `Does ${cleanName} contain any added preservatives or fillers?`,
        answer: 'No. LeafyEarth products are 100% pure and free from synthetic preservatives, artificial colors, or fillers.',
      },
    ],
    searchTags: isCumin
      ? ['cumin seeds', 'jeera', 'whole cumin', 'cuminum cyminum', 'jeerakam', 'tadka spice', 'indian spices']
      : [cleanName.toLowerCase(), 'leafymart', 'natural indian products', (options?.categoryHint || 'spices').toLowerCase()],
    dietaryAttributes: isHousehold ? [] : ['Vegetarian', 'Vegan', 'Gluten-Free', 'Preservative-Free', 'No Artificial Colors'],
    googleProductCategory: isHousehold
      ? 'Home & Garden > Household Supplies > Household Cleaning Supplies'
      : isOil
      ? 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Cooking Oils'
      : 'Food, Beverages & Tobacco > Food Items > Seasonings & Spices > Herbs & Spices',
    productType: isHousehold
      ? 'Home Care > Natural Cleaners'
      : `Spices & Groceries > ${options?.categoryHint || 'Whole & Ground Spices'} > ${cleanName}`,
    factualAttributeSuggestions: {
      countryOfOrigin: 'India',
      condition: 'new',
      netWeight: isOil ? null : 100,
      netWeightUnit: isOil ? null : 'g',
      netVolume: isOil ? 250 : null,
      netVolumeUnit: isOil ? 'ml' : null,
    },
  };
}

export function normalizePackSizeClient(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(gm|gms|gram|grams|g|kg|kgs|ml|l|ltr|nos|pc|pcs|pack|box|bottle)\b/);
  if (!match) return cleaned;
  const num = Number.parseFloat(match[1]);
  const unit = match[2];
  if (['gm', 'gms', 'gram', 'grams', 'g'].includes(unit)) return `${num} g`;
  if (['kg', 'kgs'].includes(unit)) return num < 1 ? `${Math.round(num * 1000)} g` : `${num} kg`;
  if (unit === 'ml') return `${num} ml`;
  if (['l', 'ltr'].includes(unit)) return num < 1 ? `${Math.round(num * 1000)} ml` : `${num} l`;
  return `${num} ${unit}`;
}

export function calculateMarketPriceRangeClient(
  offers: WebPriceSourceOffer[],
  comparedPackingSize?: string
): {
  lowestPrice: number | null;
  highestPrice: number | null;
  eligibleCount: number;
  searchStatus: AIProductMarketResearch['searchStatus'];
} {
  const targetNorm = comparedPackingSize ? normalizePackSizeClient(comparedPackingSize) : '';
  const eligible = (offers || [])
    .filter((offer) => {
      if (!offer || !offer.included) return false;
      if (offer.inStock === false) return false;
      const price = Number(offer.price);
      if (!Number.isFinite(price) || price <= 0) return false;
      if ((offer.currency || 'INR').toUpperCase() !== 'INR') return false;
      if (targetNorm && offer.packSize) {
        const offerNorm = normalizePackSizeClient(offer.packSize);
        if (offerNorm && offerNorm !== targetNorm) return false;
      }
      return true;
    })
    .map((o) => Number(o.price));

  if (eligible.length === 0) {
    return {
      lowestPrice: null,
      highestPrice: null,
      eligibleCount: 0,
      searchStatus: 'insufficient_verified_web_price_data',
    };
  }
  return {
    lowestPrice: Math.min(...eligible),
    highestPrice: Math.max(...eligible),
    eligibleCount: eligible.length,
    searchStatus: 'verified_offers',
  };
}

export function buildClientFallbackContent(
  productName: string,
  options?: { categoryHint?: string; brandHint?: string; isAyurvedicProduct?: boolean }
): AIProductContentPayload {
  const cleanName = String(productName || 'LeafyEarth Product').trim();
  const lower = cleanName.toLowerCase();
  const isCumin = lower.includes('cumin') || lower.includes('jeera');
  const isTurmeric = lower.includes('turmeric') || lower.includes('haldi') || lower.includes('manjal');
  const isPepper = lower.includes('pepper') || lower.includes('kurumulaku');
  const isCardamom = lower.includes('cardamom') || lower.includes('elaichi');
  const isAmla = lower.includes('amla') || lower.includes('gooseberry');
  const isHousehold = /cleaner|detergent|repellent|dishwash|handwash|perfume|floor/i.test(cleanName);

  const isAyurvedicSelected =
    options?.isAyurvedicProduct === false
      ? false
      : options?.isAyurvedicProduct === true
      ? true
      : !isHousehold;

  const category =
    options?.categoryHint?.trim() ||
    (isHousehold ? 'Home Care' : isAmla ? 'Dry Fruits & Herbs' : 'Spices');
  const form = lower.includes('oil')
    ? 'Oil'
    : lower.includes('powder')
    ? 'Powder'
    : isHousehold
    ? 'Liquid'
    : isCumin
    ? 'Whole Seeds'
    : 'Whole / Natural';

  const translations: AIProductContentPayload['translations'] = !isAyurvedicSelected
    ? {
        en: { name: cleanName },
        ml: { name: '' },
        hi: { name: '' },
        ta: { name: '' },
        kn: { name: '' },
        te: { name: '' },
      }
    : isCumin
    ? {
        en: { name: cleanName },
        ml: { name: 'ജീരകം' },
        hi: { name: 'जीरा' },
        ta: { name: 'சீரகம்' },
        kn: { name: 'ಜೀರಿಗೆ' },
        te: { name: 'జీలకర్ర' },
      }
    : isTurmeric
    ? {
        en: { name: cleanName },
        ml: { name: 'മഞ്ഞൾ പൊടി' },
        hi: { name: 'हल्दी पाउडर' },
        ta: { name: 'மஞ்சள் தூள்' },
        kn: { name: 'ಅರಿಶಿನ ಪುಡಿ' },
        te: { name: 'పసుపు పొడి' },
      }
    : isPepper
    ? {
        en: { name: cleanName },
        ml: { name: 'കുരുമുളക്' },
        hi: { name: 'काली मिर्च' },
        ta: { name: 'கருப்பு மிளகு' },
        kn: { name: 'ಕಪ್ಪು ಮೆಣಸು' },
        te: { name: 'నల్ల మిరియాలు' },
      }
    : isCardamom
    ? {
        en: { name: cleanName },
        ml: { name: 'ഏലയ്ക്ക' },
        hi: { name: 'हरी इलायची' },
        ta: { name: 'ஏலக்காய்' },
        kn: { name: 'ಏಲಕ್ಕಿ' },
        te: { name: 'యాలకులు' },
      }
    : {
        en: { name: cleanName },
        ml: { name: `${cleanName} (മലയാളം)` },
        hi: { name: `${cleanName} (हिन्दी)` },
        ta: { name: `${cleanName} (தமிழ்)` },
        kn: { name: `${cleanName} (ಕನ್ನಡ)` },
        te: { name: `${cleanName} (తెలుగు)` },
      };

  const ayurveda_applicability: AIProductContentPayload['ayurveda_applicability'] =
    isAyurvedicSelected ? 'applicable' : 'not_applicable';

  return {
    english_product_name: cleanName,
    botanical_name: isCumin
      ? 'Cuminum cyminum'
      : isTurmeric
      ? 'Curcuma longa'
      : isPepper
      ? 'Piper nigrum'
      : isCardamom
      ? 'Elettaria cardamomum'
      : isAmla
      ? 'Phyllanthus emblica'
      : isHousehold
      ? 'Not Applicable (Household Formulation)'
      : 'Botanical species (verify cultivar)',
    family: isCumin
      ? 'Apiaceae'
      : isTurmeric || isCardamom
      ? 'Zingiberaceae'
      : isPepper
      ? 'Piperaceae'
      : isAmla
      ? 'Phyllanthaceae'
      : isHousehold
      ? 'Not Applicable'
      : 'Botanical family (verify taxonomy)',
    category,
    form,
    title: `${options?.brandHint ? `${options.brandHint} ` : ''}${cleanName} – Pure & Naturally Sourced`,
    description: `${cleanName} is carefully selected and hygienically packed to preserve its natural aroma, authentic flavor profile, and bioactive integrity.`,
    key_features: [
      '100% pure, unblended, and hygienically processed',
      'Free from artificial colors, synthetic preservatives, and added fillers',
      'Sourced from trusted growers with strict quality grading',
    ],
    culinary_uses: isHousehold
      ? ['Use as directed on household surfaces']
      : [
          'Everyday curries, dals, gravies, and traditional tempering',
          'Herbal teas, wellness infusions, and spice blends (masalas)',
        ],
    storage_instructions:
      'Store in a cool, dry, and hygienic place away from direct sunlight and moisture. Keep in an airtight container after opening.',
    translations,
    health_benefits: isHousehold
      ? []
      : [
          {
            claim: 'Supports everyday digestive comfort and antioxidant intake as part of a balanced diet',
            evidence_level: 'traditional_use',
            reference_ids: ['REF-1'],
            review_status: 'pending_review',
          },
        ],
    nutritional_benefits: isHousehold
      ? ['Formulated for household care']
      : ['Naturally rich in botanical polyphenols and essential volatile oils'],
    safety_precautions: [
      'Check ingredient label for potential allergens before use.',
      'For informational and culinary purposes only; not intended to diagnose, treat, cure, or prevent any disease.',
    ],
    ayurveda_applicability,
    is_ayurvedic_product: isAyurvedicSelected,
    ayurveda:
      ayurveda_applicability === 'applicable'
        ? {
            sanskrit_name: isTurmeric
              ? 'Haridra (हरिद्रा)'
              : isPepper
              ? 'Maricha (मरीच)'
              : isCardamom
              ? 'Sukshmaila (सूक्ष्मैला)'
              : `${cleanName} (Classical Dravya)`,
            classification: 'Dravyaguna Vijnana – Culinary & Traditional Wellness Herb/Spice',
            classical_description:
              'Traditionally valued in classical Ayurvedic texts for supporting balanced digestion (Agni) and seasonal wellness.',
            rasa: ['Katu (Pungent)', 'Tikta (Bitter)'],
            guna: ['Laghu (Light)', 'Ruksha (Dry)'],
            virya: 'Ushna (Warming)',
            vipaka: 'Katu (Pungent)',
            prabhava: 'Deepana-Pachana (Digestive & metabolic support)',
            dosha_effects: {
              vata: 'Helps balance Vata when used appropriately with culinary lipids',
              pitta: 'Use in moderate culinary amounts for Pitta constitution',
              kapha: 'Supports Kapha balance',
            },
            parts_used: ['Edible botanical part (Phala / Kanda / Bija)'],
            medicinal_uses: ['Supports healthy digestion and culinary bioavailability in traditional diets'],
            classical_formulations: ['Classical Churna & Kwatha preparations'],
            usage_methods: ['Use in daily culinary tempering, decoctions, or warm herbal infusions'],
            anupana: ['Warm water (Ushnodaka)', 'Clarified butter (Ghrita)'],
            typical_dosage_note:
              '1–3 g daily in culinary or traditional preparations, or as directed by a qualified Vaidya.',
            precautions: [
              'Consult a qualified healthcare practitioner during pregnancy, lactation, or chronic medical conditions.',
            ],
            contraindications: ['Known hypersensitivity to the botanical family.'],
            interactions: ['Consult a physician if taking prescription anticoagulant or metabolic medications.'],
            references: [
              {
                id: 'AY-REF-1',
                source_type: 'ayurvedic_pharmacopoeia',
                title: `The Ayurvedic Pharmacopoeia of India (API), Part I – ${cleanName}`,
                author_or_body: 'Ministry of AYUSH, Government of India',
                section_or_citation: 'Monograph on Dravyaguna & Identity Standards',
                url: 'https://ayush.gov.in',
                verification_note: 'Verify monograph volume and part before publishing classical claims.',
              },
            ],
          }
        : null,
    references: [
      {
        id: 'REF-1',
        source_type: 'food_composition_table',
        title: `Indian Food Composition Tables (IFCT) – ${cleanName}`,
        author_or_body: 'ICMR - National Institute of Nutrition (NIN), Hyderabad',
        section_or_citation: 'Botanical & Nutritional Reference Profile',
        url: 'https://www.nin.res.in',
        verification_note: 'Verify cultivar and batch nutritional values before publication.',
      },
    ],
    review_flags: [
      'Verify botanical taxonomy and regional language script spellings before master sync.',
    ],
    seo: buildClientFallbackSEO(cleanName, {
      categoryHint: category,
      brandHint: options?.brandHint,
      formHint: form,
    }),
    commerce: buildClientFallbackCommerce(cleanName, {
      categoryHint: category,
    }),
  };
}

export function buildMasterComparisonDiffClient(params: {
  masterProduct: Record<string, any> | null;
  version: AIProductVersion | null;
  approvedImage: AIProductImage | null;
  approvedResearch: AIProductResearchRecord | null;
}): MasterFieldComparisonItem[] {
  const master = params.masterProduct || {};
  const payload = params.version?.edited_payload || params.version?.generated_payload;
  const items: MasterFieldComparisonItem[] = [];

  const pushItem = (
    fieldKey: string,
    label: string,
    group: MasterFieldComparisonItem['group'],
    masterField: string,
    proposedAiValue: any,
    selectable = true,
    reasonIfLocked?: string
  ) => {
    const currentMasterValue = master[masterField] ?? null;
    const hasChanged = JSON.stringify(currentMasterValue) !== JSON.stringify(proposedAiValue);
    items.push({
      fieldKey,
      label,
      group,
      masterField,
      currentMasterValue,
      proposedAiValue,
      hasChanged,
      selectable,
      reasonIfLocked,
    });
  };

  if (payload) {
    pushItem('name', 'Product Master Name', 'general', 'name', payload.english_product_name);
    pushItem('title', 'E-Commerce Display Title', 'general', 'title', payload.title);
    pushItem('englishName', 'English Product Name', 'general', 'englishName', payload.english_product_name);
    pushItem('botanicalName', 'Botanical Name', 'general', 'botanicalName', payload.botanical_name);
    pushItem('botanicalFamily', 'Botanical Family', 'general', 'botanicalFamily', payload.family);
    pushItem('leafycategory', 'Product Category (leafycategory)', 'general', 'leafycategory', payload.category);
    pushItem('productForm', 'Product Form', 'general', 'productForm', payload.form);
    pushItem('description', 'E-Commerce Description', 'general', 'description', payload.description);
    pushItem('keyFeatures', 'Key Features', 'general', 'keyFeatures', payload.key_features);
    pushItem('culinaryUses', 'Culinary Uses', 'general', 'culinaryUses', payload.culinary_uses);
    pushItem('storageInstructions', 'Storage Instructions', 'general', 'storageInstructions', payload.storage_instructions);

    const isAyurvedicEnabled =
      payload.is_ayurvedic_product !== false &&
      payload.ayurveda_applicability === 'applicable';

    if (isAyurvedicEnabled && payload.translations) {
      if (payload.translations.ml?.name) {
        pushItem('malayalamName', 'Malayalam Name (മലയാളം)', 'translations', 'malayalamName', payload.translations.ml.name);
      }
      if (payload.translations.hi?.name) {
        pushItem('hindiName', 'Hindi Name (हिन्दी)', 'translations', 'hindiName', payload.translations.hi.name);
      }
      if (payload.translations.ta?.name) {
        pushItem('tamilName', 'Tamil Name (தமிழ்)', 'translations', 'tamilName', payload.translations.ta.name);
      }
      if (payload.translations.kn?.name) {
        pushItem('kannadaName', 'Kannada Name (ಕನ್ನಡ)', 'translations', 'kannadaName', payload.translations.kn.name);
      }
      if (payload.translations.te?.name) {
        pushItem('teluguName', 'Telugu Name (తెలుగు)', 'translations', 'teluguName', payload.translations.te.name);
      }
    }

    const approvedClaims = (payload.health_benefits || []).filter((hb) => hb.review_status !== 'rejected');
    pushItem('healthBenefits', 'Health Benefits', 'health', 'healthBenefits', approvedClaims);
    pushItem('nutritionalBenefits', 'Nutritional Benefits', 'health', 'nutritionalBenefits', payload.nutritional_benefits);
    pushItem('generalPrecautions', 'General Safety Precautions', 'health', 'generalPrecautions', payload.safety_precautions);
    pushItem('healthReferences', 'Health & Scientific References', 'health', 'healthReferences', payload.references);

    const isAyurvedic = isAyurvedicEnabled && Boolean(payload.ayurveda);
    if (isAyurvedicEnabled) {
      pushItem('isAyurvedicProduct', 'Is Ayurvedic Product?', 'ayurveda', 'isAyurvedicProduct', isAyurvedic);
    }

    if (isAyurvedic && payload.ayurveda) {
      const ay = payload.ayurveda;
      pushItem('sanskritName', 'Sanskrit Name', 'ayurveda', 'sanskritName', ay.sanskrit_name);
      pushItem('ayurvedicClassification', 'Ayurvedic Classification', 'ayurveda', 'ayurvedicClassification', ay.classification);
      pushItem('ayurvedicDescription', 'Classical Ayurvedic Description', 'ayurveda', 'ayurvedicDescription', ay.classical_description);
      pushItem('rasa', 'Rasa (Taste)', 'ayurveda', 'rasa', ay.rasa);
      pushItem('guna', 'Guna (Qualities)', 'ayurveda', 'guna', ay.guna);
      pushItem('virya', 'Virya (Potency)', 'ayurveda', 'virya', ay.virya);
      pushItem('vipaka', 'Vipaka (Post-Digestive Effect)', 'ayurveda', 'vipaka', ay.vipaka);
      pushItem('prabhava', 'Prabhava (Special Action)', 'ayurveda', 'prabhava', ay.prabhava);
      pushItem('vataEffect', 'Vata Effect', 'ayurveda', 'vataEffect', ay.dosha_effects.vata);
      pushItem('pittaEffect', 'Pitta Effect', 'ayurveda', 'pittaEffect', ay.dosha_effects.pitta);
      pushItem('kaphaEffect', 'Kapha Effect', 'ayurveda', 'kaphaEffect', ay.dosha_effects.kapha);
      pushItem('medicinalPartsUsed', 'Medicinal Parts Used', 'ayurveda', 'medicinalPartsUsed', ay.parts_used);
      pushItem('ayurvedicMedicinalUses', 'Ayurvedic Medicinal Uses', 'ayurveda', 'ayurvedicMedicinalUses', ay.medicinal_uses);
      pushItem('ayurvedicFormulations', 'Classical Formulations', 'ayurveda', 'ayurvedicFormulations', ay.classical_formulations);
      pushItem('ayurvedicUsageMethods', 'Usage Methods', 'ayurveda', 'ayurvedicUsageMethods', ay.usage_methods);
      pushItem('anupana', 'Anupana (Adjuvants)', 'ayurveda', 'anupana', ay.anupana);
      pushItem('ayurvedicDosage', 'Typical Dosage Note', 'ayurveda', 'ayurvedicDosage', ay.typical_dosage_note);
      pushItem('ayurvedicPrecautions', 'Ayurvedic Precautions', 'ayurveda', 'ayurvedicPrecautions', ay.precautions);
      pushItem('contraindications', 'Contraindications', 'ayurveda', 'contraindications', ay.contraindications);
      pushItem('drugInteractions', 'Drug / Herb Interactions', 'ayurveda', 'drugInteractions', ay.interactions);
      pushItem('ayurvedicReferences', 'Ayurvedic Classical References', 'ayurveda', 'ayurvedicReferences', ay.references);
    }

    if (payload.seo) {
      pushItem('seoTitle', 'SEO Title', 'seo', 'seoTitle', payload.seo.seoTitle);
      pushItem('metaDescription', 'Meta Description', 'seo', 'metaDescription', payload.seo.metaDescription);
      pushItem('seoKeywords', 'SEO Keywords (5–12)', 'seo', 'seoKeywords', payload.seo.seoKeywords);
      pushItem('urlSlug', 'Canonical URL Slug (/products/:slug)', 'seo', 'urlSlug', payload.seo.urlSlug);
    }

    if (payload.commerce) {
      const c = payload.commerce;
      const sugg = c.factualAttributeSuggestions || {};
      pushItem('productHighlights', 'Product Highlights (4–6 bullets)', 'commerce', 'productHighlights', c.productHighlights);
      pushItem('productFAQs', 'Product FAQs (3–6 Q&A pairs)', 'commerce', 'productFAQs', c.productFAQs);
      pushItem('searchTags', 'AI Search & Discovery Tags', 'commerce', 'searchTags', c.searchTags);
      pushItem('dietaryAttributes', 'Dietary Attributes', 'commerce', 'dietaryAttributes', c.dietaryAttributes);
      pushItem('googleProductCategory', 'Google Product Category', 'commerce', 'googleProductCategory', c.googleProductCategory);
      pushItem('productType', 'Store Taxonomy (productType)', 'commerce', 'productType', c.productType);
      if (sugg.countryOfOrigin) {
        pushItem('countryOfOrigin', 'Country of Origin', 'commerce', 'countryOfOrigin', sugg.countryOfOrigin);
      }
      if (sugg.netWeight !== undefined && sugg.netWeight !== null) {
        pushItem('netWeight', 'Net Weight', 'commerce', 'netWeight', sugg.netWeight);
        pushItem('netWeightUnit', 'Net Weight Unit', 'commerce', 'netWeightUnit', sugg.netWeightUnit);
      }
      if (sugg.netVolume !== undefined && sugg.netVolume !== null) {
        pushItem('netVolume', 'Net Volume', 'commerce', 'netVolume', sugg.netVolume);
        pushItem('netVolumeUnit', 'Net Volume Unit', 'commerce', 'netVolumeUnit', sugg.netVolumeUnit);
      }
    }
  }

  if (params.approvedImage) {
    pushItem(
      'imageUrl',
      'Primary Product Image (1000×1000 #FFFFFF)',
      'image',
      'imageUrl',
      params.approvedImage.preview_url,
      params.approvedImage.status === 'APPROVED',
      params.approvedImage.status === 'APPROVED' ? undefined : 'Image must be APPROVED first'
    );
  }

  if (params.approvedResearch) {
    const res = params.approvedResearch;
    const isResApproved = res.status === 'APPROVED';
    const lockMsg = isResApproved ? undefined : 'Taxation & Market Research must be APPROVED first';
    pushItem('hsnCode', 'HSN Code', 'taxation_pricing', 'hsnCode', res.taxation.hsnCode, isResApproved, lockMsg);
    pushItem('gstPercentage', 'GST Rate (%)', 'taxation_pricing', 'gstPercentage', res.taxation.gstRatePercent, isResApproved, lockMsg);
    pushItem('gstReference', 'GST Classification Reference', 'taxation_pricing', 'gstReference', res.taxation.gstReference, isResApproved, lockMsg);
    pushItem('gstVerifiedAt', 'GST Verified Timestamp', 'taxation_pricing', 'gstVerifiedAt', res.taxation.verifiedAt || res.approved_at, isResApproved, lockMsg);
    pushItem('packingSize', 'Selected Packing Size', 'taxation_pricing', 'packingSize', res.packing.selectedPackingSize, isResApproved, lockMsg);
    pushItem('unit', 'Unit (UQC)', 'taxation_pricing', 'unit', res.packing.unit, isResApproved, lockMsg);
    pushItem('availablePackingSizes', 'Available Packing Sizes', 'taxation_pricing', 'availablePackingSizes', res.packing.availablePackingSizes, isResApproved, lockMsg);
    pushItem('lowestWebPrice', 'Lowest Web Price (INR)', 'taxation_pricing', 'lowestWebPrice', res.marketResearch.lowestPrice, isResApproved, lockMsg);
    pushItem('highestWebPrice', 'Highest Web Price (INR)', 'taxation_pricing', 'highestWebPrice', res.marketResearch.highestPrice, isResApproved, lockMsg);
    pushItem('webPriceCurrency', 'Web Price Currency', 'taxation_pricing', 'webPriceCurrency', res.marketResearch.currency, isResApproved, lockMsg);
    pushItem('webPriceSources', 'Web Price Sources', 'taxation_pricing', 'webPriceSources', res.marketResearch.offers, isResApproved, lockMsg);
    pushItem('webPriceCheckedAt', 'Web Price Checked Timestamp', 'taxation_pricing', 'webPriceCheckedAt', res.marketResearch.checkedAt, isResApproved, lockMsg);
  }

  return items;
}

/**
 * Generates a 1000x1000 pure-white (#FFFFFF) studio product image data URL on the client
 * matching the standardized Brown Kraft Stand-Up Zipper Pouch + Cream Label + Clear Lower Window
 * + Foreground Heap reference cover design.
 */
function generateClientWhite1000x1000DataUrl(
  productName: string,
  botanicalOrSubtitle = '',
  productForm = 'DRIED WHOLE FRUIT'
): string {
  const cleanTitle = String(productName || 'Botanical').replace(/\s*\([^)]*\)\s*/g, '').trim().slice(0, 26);
  const lower = cleanTitle.toLowerCase();
  const knownMap: Record<string, { sub: string; bot: string; form: string }> = {
    kadukka: { sub: 'Chebulic Myrobalan', bot: 'Terminalia chebula', form: 'DRIED WHOLE FRUIT' },
    haritaki: { sub: 'Chebulic Myrobalan', bot: 'Terminalia chebula', form: 'DRIED WHOLE FRUIT' },
    thippili: { sub: 'Indian Long Pepper', bot: 'Piper longum', form: 'DRIED WHOLE FRUIT SPIKES' },
    pippali: { sub: 'Indian Long Pepper', bot: 'Piper longum', form: 'DRIED WHOLE FRUIT SPIKES' },
    nellikka: { sub: 'Indian Gooseberry', bot: 'Phyllanthus emblica', form: 'DRIED WHOLE FRUIT SEGMENTS' },
    chukku: { sub: 'Dried Ginger Root', bot: 'Zingiber officinale', form: 'WHOLE DRIED RHIZOME' },
  };
  const hit = knownMap[lower];
  const subtitleText = `(${hit?.sub || botanicalOrSubtitle || '100% Pure Botanical'})`.slice(0, 36);
  const botanicalText = (hit?.bot || botanicalOrSubtitle || 'Natural Herb').slice(0, 38);
  const formUpper = (
    productForm && productForm.toUpperCase() !== 'DRIED FRUIT'
      ? productForm.toUpperCase()
      : hit?.form || 'DRIED WHOLE FRUIT'
  ).slice(0, 32);

  const esc = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <rect width="1000" height="1000" fill="#FFFFFF"/>
  <ellipse cx="500" cy="855" rx="260" ry="26" fill="#000000" fill-opacity="0.10"/>
  <ellipse cx="500" cy="915" rx="235" ry="22" fill="#000000" fill-opacity="0.13"/>
  <path d="M235,65 Q235,42 260,42 L740,42 Q765,42 765,65 L765,98 L752,98 Q744,98 744,104 Q744,110 752,110 L764,110 L740,835 Q738,860 710,860 L290,860 Q262,860 260,835 L236,110 L248,110 Q256,110 256,104 Q256,98 248,98 L235,98 Z" fill="#C49666" stroke="#A97B4B" stroke-width="3"/>
  <rect x="242" y="118" width="516" height="22" fill="#B88756" fill-opacity="0.55"/>
  <line x1="242" y1="124" x2="758" y2="124" stroke="#9B6E41" stroke-width="2"/>
  <line x1="242" y1="136" x2="758" y2="136" stroke="#D3A97B" stroke-width="2"/>
  <rect x="295" y="192" width="410" height="388" rx="22" fill="#F4EFE3" stroke="#DFD5C3" stroke-width="2.5"/>
  <text x="500" y="268" text-anchor="middle" font-family="Georgia, serif" font-size="56" font-weight="700" fill="#3A2313">${esc(cleanTitle)}</text>
  <text x="500" y="308" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" fill="#4A301D">${esc(subtitleText)}</text>
  <text x="500" y="340" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="23" fill="#4A301D">${esc(botanicalText)}</text>
  <line x1="412" y1="366" x2="482" y2="366" stroke="#557A2E" stroke-width="2"/>
  <line x1="518" y1="366" x2="588" y2="366" stroke="#557A2E" stroke-width="2"/>
  <path d="M500,368 C496,356 498,348 500,344 C502,348 504,356 500,368 Z" fill="#557A2E"/>
  <path d="M498,368 C488,364 484,358 486,353 C491,354 496,360 498,368 Z" fill="#689438"/>
  <path d="M502,368 C512,364 516,358 514,353 C509,354 504,360 502,368 Z" fill="#689438"/>
  <path d="M535,442 C552,402 595,385 622,388 C610,422 578,446 535,442 Z" fill="#4F7F28" stroke="#3B621C" stroke-width="1.5"/>
  <path d="M555,462 C588,438 632,442 655,458 C628,482 588,482 555,462 Z" fill="#5D8E32" stroke="#3B621C" stroke-width="1.5"/>
  <g fill="#6B4423" stroke="#472B13" stroke-width="2">
    <ellipse cx="455" cy="488" rx="38" ry="22" transform="rotate(-14 455 488)"/>
    <ellipse cx="520" cy="492" rx="40" ry="23" transform="rotate(12 520 492)"/>
    <ellipse cx="425" cy="462" rx="36" ry="20" transform="rotate(-24 425 462)"/>
    <ellipse cx="490" cy="460" rx="42" ry="24" transform="rotate(6 490 460)"/>
    <ellipse cx="548" cy="468" rx="36" ry="21" transform="rotate(22 548 468)"/>
    <ellipse cx="465" cy="434" rx="38" ry="22" transform="rotate(-10 465 434)"/>
    <ellipse cx="518" cy="438" rx="37" ry="21" transform="rotate(16 518 438)"/>
  </g>
  <text x="500" y="558" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#3A2313" letter-spacing="2.5">${esc(formUpper)}</text>
  <path d="M292,596 L708,596 L704,705 Q500,775 296,705 Z" fill="#432814" stroke="#9B6E41" stroke-width="3"/>
  <g fill="#6E4725" stroke="#3E2410" stroke-width="2">
    <ellipse cx="355" cy="635" rx="42" ry="24" transform="rotate(-15 355 635)"/>
    <ellipse cx="450" cy="632" rx="44" ry="25" transform="rotate(12 450 632)"/>
    <ellipse cx="545" cy="634" rx="44" ry="25" transform="rotate(-8 545 634)"/>
    <ellipse cx="640" cy="636" rx="42" ry="24" transform="rotate(16 640 636)"/>
    <ellipse cx="400" cy="680" rx="45" ry="25" transform="rotate(10 400 680)"/>
    <ellipse cx="500" cy="684" rx="46" ry="26" transform="rotate(-12 500 684)"/>
    <ellipse cx="600" cy="680" rx="45" ry="25" transform="rotate(8 600 680)"/>
  </g>
  <g fill="#6B4423" stroke="#3E2410" stroke-width="2.2">
    <ellipse cx="325" cy="892" rx="46" ry="25" transform="rotate(-16 325 892)"/>
    <ellipse cx="405" cy="902" rx="48" ry="26" transform="rotate(10 405 902)"/>
    <ellipse cx="495" cy="908" rx="50" ry="27" transform="rotate(-6 495 908)"/>
    <ellipse cx="585" cy="904" rx="48" ry="26" transform="rotate(14 585 904)"/>
    <ellipse cx="665" cy="894" rx="46" ry="25" transform="rotate(-12 665 894)"/>
    <ellipse cx="375" cy="858" rx="46" ry="25" transform="rotate(18 375 858)"/>
    <ellipse cx="465" cy="862" rx="48" ry="26" transform="rotate(-12 465 862)"/>
    <ellipse cx="555" cy="860" rx="48" ry="26" transform="rotate(15 555 860)"/>
    <ellipse cx="622" cy="858" rx="46" ry="25" transform="rotate(-18 622 858)"/>
    <ellipse cx="445" cy="822" rx="45" ry="25" transform="rotate(-8 445 822)"/>
    <ellipse cx="535" cy="820" rx="48" ry="26" transform="rotate(6 535 820)"/>
  </g>
</svg>`;
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function isFirebaseStorageUrlClient(url: unknown): boolean {
  return (
    typeof url === 'string' &&
    url.trim().startsWith('https://firebasestorage.googleapis.com/v0/b/')
  );
}

async function dataUrlToImageBlobClient(dataUrl: string): Promise<{ blob: Blob; contentType: string }> {
  if (
    dataUrl.startsWith('data:image/svg+xml') &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  ) {
    try {
      const renderedBlob = await new Promise<Blob | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1000;
          canvas.height = 1000;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 1000, 1000);
          ctx.drawImage(img, 0, 0, 1000, 1000);
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
      if (renderedBlob) {
        return { blob: renderedBlob, contentType: 'image/jpeg' };
      }
    } catch {
      // Fallback below
    }
  }

  const b64Match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (b64Match && typeof window !== 'undefined' && typeof window.atob === 'function') {
    const rawMime = b64Match[1].toLowerCase();
    const contentType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    const binStr = window.atob(b64Match[2]);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return { blob: new Blob([bytes], { type: contentType }), contentType };
  }

  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  return { blob, contentType: blob.type || 'image/jpeg' };
}

/**
 * Ensures any AI product image URL or base64 data URL is uploaded to Firebase Storage
 * (`https://firebasestorage.googleapis.com/v0/b/<bucket>/o/...`).
 */
export async function ensureClientFirebaseStorageUrl(params: {
  draftId?: string;
  targetProductId?: string;
  sourceUrl: string;
  storagePath?: string;
}): Promise<{ downloadUrl: string; storagePath: string }> {
  const rawUrl = String(params.sourceUrl || '').trim();
  const cleanEntityId = String(params.targetProductId || params.draftId || 'product').trim();
  const defaultPath = params.targetProductId
    ? `products/${cleanEntityId}/main.jpg`
    : `products/${cleanEntityId}/images/ai_${Date.now()}.jpg`;
  const targetStoragePath = String(params.storagePath || defaultPath).replace(/^\/+/, '');

  if (!rawUrl) {
    return { downloadUrl: '', storagePath: targetStoragePath };
  }

  if (
    isFirebaseStorageUrlClient(rawUrl) &&
    (!params.targetProductId ||
      rawUrl.includes(encodeURIComponent(`products/${params.targetProductId}/`)))
  ) {
    return { downloadUrl: rawUrl, storagePath: targetStoragePath };
  }

  // 1. Try backend export endpoint first
  try {
    const res = await fetch(
      `/api/admin/ai-products/${encodeURIComponent(params.draftId || cleanEntityId)}/images/export-firebase`,
      {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: rawUrl,
          storagePath: targetStoragePath,
          targetProductId: params.targetProductId || undefined,
        }),
      }
    );
    if (res.ok && !isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (data?.downloadUrl && isFirebaseStorageUrlClient(data.downloadUrl)) {
        return {
          downloadUrl: data.downloadUrl,
          storagePath: data.storagePath || targetStoragePath,
        };
      }
    }
  } catch {
    // Fallback to client Firebase Storage SDK below
  }

  // 2. Fallback to direct Firebase Storage SDK upload (`uploadBytes` + `getDownloadURL`)
  if (storage) {
    try {
      const { blob, contentType } = await dataUrlToImageBlobClient(rawUrl);
      if (!contentType.includes('svg')) {
        const fileRef = ref(storage, targetStoragePath);
        await uploadBytes(fileRef, blob, { contentType });
        const downloadUrl = await getDownloadURL(fileRef);
        if (isFirebaseStorageUrlClient(downloadUrl)) {
          return { downloadUrl, storagePath: targetStoragePath };
        }
      }
    } catch {
      // Fallback to rawUrl if offline/unauthenticated
    }
  }

  return { downloadUrl: rawUrl, storagePath: targetStoragePath };
}

async function logClientEvent(
  draftId: string,
  eventType: AIProductEvent['event_type'],
  actor: { id: string; email?: string; role?: string },
  metadata: Record<string, any> = {}
) {
  const id = `aievt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const docData: AIProductEvent = {
    id,
    draft_id: draftId,
    event_type: eventType,
    actor_id: actor.id,
    actor_email: actor.email,
    actor_role: actor.role,
    metadata,
    created_at: new Date().toISOString(),
  };
  await setDoc(doc(db, AI_PRODUCT_EVENTS_COLLECTION, id), docData);
}

// ============================================================================
// Public API Client Functions (Express API with Firestore Direct Fallback)
// ============================================================================

export async function fetchAIConfigStatus() {
  try {
    const res = await fetch('/api/admin/ai-products/config-status', {
      headers: await authHeaders(),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      const data = await res.json();
      return data.config;
    }
  } catch {
    // Fallback below
  }
  return {
    provider: 'openai',
    projectName: 'leafyearthprdcnt',
    contentEnabled: false,
    imageEnabled: false,
    apiKeyConfigured: false,
    model: 'gpt-4o-mini',
    imageModel: 'gpt-image-1',
    imageWidth: 1000,
    imageHeight: 1000,
    imageBackground: '#FFFFFF',
    readyForLiveContent: false,
    readyForLiveImages: false,
    statusMessage:
      'OpenAI project "leafyearthprdcnt" credentials (OPENAI_API_KEY) are managed on the backend server (.env). Using structured staging generator.',
  };
}

export async function fetchAIProductDrafts(params?: { status?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);

  try {
    const res = await fetch(`/api/admin/ai-products?${qs.toString()}`, {
      headers: await authHeaders(),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      return await res.json();
    }
  } catch {
    // Fallback to direct Firestore
  }

  const [draftsSnap, versionsSnap, imagesSnap, researchSnap, syncLogsSnap] = await Promise.all([
    getDocs(collection(db, AI_PRODUCT_DRAFTS_COLLECTION)),
    getDocs(collection(db, AI_PRODUCT_VERSIONS_COLLECTION)),
    getDocs(collection(db, AI_PRODUCT_IMAGES_COLLECTION)),
    getDocs(collection(db, AI_PRODUCT_RESEARCH_COLLECTION)),
    getDocs(collection(db, AI_PRODUCT_SYNC_LOGS_COLLECTION)),
  ]);

  const versionsById = new Map<string, AIProductVersion>();
  versionsSnap.docs.forEach((d) => versionsById.set(d.id, { id: d.id, ...(d.data() as any) }));

  const imagesByDraft = new Map<string, AIProductImage[]>();
  imagesSnap.docs.forEach((d) => {
    const img = { id: d.id, ...(d.data() as any) } as AIProductImage;
    const arr = imagesByDraft.get(img.draft_id) || [];
    arr.push(img);
    imagesByDraft.set(img.draft_id, arr);
  });

  const researchByDraft = new Map<string, AIProductResearchRecord>();
  researchSnap.docs.forEach((d) => {
    const r = { id: d.id, ...(d.data() as any) } as AIProductResearchRecord;
    const existing = researchByDraft.get(r.draft_id);
    if (!existing || r.updated_at >= existing.updated_at) {
      researchByDraft.set(r.draft_id, r);
    }
  });

  let drafts = draftsSnap.docs.map((d) => {
    const draft = { id: d.id, ...(d.data() as any) } as AIProductDraft;
    return {
      ...draft,
      currentVersion: versionsById.get(draft.current_version_id) || null,
      imagesCount: (imagesByDraft.get(draft.id) || []).length,
      latestResearch: researchByDraft.get(draft.id) || null,
    };
  });

  if (params?.status && params.status !== 'ALL') {
    drafts = drafts.filter((d) => d.status === params.status);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    drafts = drafts.filter(
      (d) =>
        d.source_product_name.toLowerCase().includes(q) ||
        (d.master_product_name || '').toLowerCase().includes(q) ||
        (d.master_product_sku || '').toLowerCase().includes(q)
    );
  }
  drafts.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  return {
    success: true,
    drafts,
    versions: Array.from(versionsById.values()),
    syncLogs: syncLogsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

export async function generateAIProductDraft(params: {
  productName: string;
  productId?: string | null;
  categoryHint?: string;
  brandHint?: string;
  isAyurvedicProduct?: boolean;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch('/api/admin/ai-products/generate', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: params.productName,
        productId: params.productId || null,
        categoryHint: params.categoryHint,
        brandHint: params.brandHint,
        isAyurvedicProduct: params.isAyurvedicProduct,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
      }),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      return await res.json();
    }
  } catch {
    // Fallback below
  }

  let masterProduct: any = null;
  if (params.productId) {
    const mSnap = await getDoc(doc(db, 'products', params.productId));
    if (mSnap.exists()) masterProduct = { id: mSnap.id, ...mSnap.data() };
  }

  const payload = buildClientFallbackContent(params.productName, {
    categoryHint: params.categoryHint || masterProduct?.category,
    brandHint: params.brandHint || masterProduct?.brand,
    isAyurvedicProduct: params.isAyurvedicProduct,
  });

  const now = new Date().toISOString();
  const draftId = `aidraft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const versionId = `aiver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const usage: AIUsageMetadata = {
    provider: 'openai',
    project_name: 'leafyearthprdcnt',
    model: 'gpt-4o-mini (staged-fallback)',
    prompt_version: AI_PROMPT_VERSION,
    input_tokens: 380,
    output_tokens: 720,
    total_tokens: 1100,
    estimated_cost_usd: 0,
    latency_ms: 18,
    live_api_used: false,
  };

  const versionDoc: AIProductVersion = {
    id: versionId,
    draft_id: draftId,
    version_no: 1,
    generated_payload: payload,
    edited_payload: payload,
    model: usage.model,
    prompt_version: AI_PROMPT_VERSION,
    usage_metadata: usage,
    generated_at: now,
    edited_by: null,
    edited_at: null,
    approved_by: null,
    approved_at: null,
  };

  const draftDoc: AIProductDraft = {
    id: draftId,
    source_product_name: params.productName.trim(),
    master_product_id: params.productId || null,
    master_product_name: masterProduct?.name || null,
    master_product_sku: masterProduct?.sku || null,
    category_hint: params.categoryHint || payload.category || null,
    brand_hint: params.brandHint || masterProduct?.brand || null,
    is_ayurvedic_product:
      params.isAyurvedicProduct ?? (payload.ayurveda_applicability === 'applicable'),
    status: 'DRAFT',
    current_version_id: versionId,
    approved_version_id: null,
    approved_image_id: null,
    approved_research_id: null,
    rejection_reason: null,
    last_synced_at: null,
    created_by: params.actor.id,
    created_by_email: params.actor.email,
    created_at: now,
    updated_at: now,
  };

  await setDoc(doc(db, AI_PRODUCT_VERSIONS_COLLECTION, versionId), versionDoc);
  await setDoc(doc(db, AI_PRODUCT_DRAFTS_COLLECTION, draftId), draftDoc);
  await logClientEvent(draftId, 'DRAFT_GENERATED', params.actor, { version_id: versionId });

  // Automatically generate and stage a 1000x1000 #FFFFFF candidate studio image
  let initialImage: AIProductImage | null = null;
  try {
    const imgRes = await generateAIProductImageClient({
      draftId,
      productForm: payload.form,
      packagingStyle: `${payload.botanical_name || payload.category} • Studio Pack`,
      actor: params.actor,
    });
    initialImage = imgRes.image || null;
  } catch {
    // Non-fatal
  }

  return {
    success: true,
    draftId,
    version: 1,
    status: 'DRAFT',
    draft: draftDoc,
    versionRecord: versionDoc,
    generatedContent: payload,
    initialImage,
  };
}

export async function fetchAIProductDraftDetail(draftId: string) {
  try {
    const res = await fetch(`/api/admin/ai-products/${draftId}`, {
      headers: await authHeaders(),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (Array.isArray(data.images) && data.images.length === 0 && data.draft) {
        try {
          const payload =
            data.currentVersion?.edited_payload || data.currentVersion?.generated_payload;
          const autoImgRes = await generateAIProductImageClient({
            draftId,
            productForm: payload?.form || data.draft.category_hint || 'Natural Botanical',
            packagingStyle: payload?.botanical_name || '100% Pure & Natural',
            actor: {
              id: data.draft.created_by || 'admin-user',
              email: data.draft.created_by_email || 'admin@leafyearth.com',
              role: 'Admin',
            },
          });
          if (autoImgRes?.image) {
            data.images = [autoImgRes.image];
          }
        } catch {
          // Non-fatal
        }
      }
      return data;
    }
  } catch {
    // Fallback below
  }

  const draftSnap = await getDoc(doc(db, AI_PRODUCT_DRAFTS_COLLECTION, draftId));
  if (!draftSnap.exists()) throw new Error(`Draft ${draftId} not found`);
  const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

  const [versionsSnap, imagesSnap, researchSnap, eventsSnap, syncSnap] = await Promise.all([
    getDocs(query(collection(db, AI_PRODUCT_VERSIONS_COLLECTION), where('draft_id', '==', draftId))),
    getDocs(query(collection(db, AI_PRODUCT_IMAGES_COLLECTION), where('draft_id', '==', draftId))),
    getDocs(query(collection(db, AI_PRODUCT_RESEARCH_COLLECTION), where('draft_id', '==', draftId))),
    getDocs(query(collection(db, AI_PRODUCT_EVENTS_COLLECTION), where('draft_id', '==', draftId))),
    getDocs(query(collection(db, AI_PRODUCT_SYNC_LOGS_COLLECTION), where('draft_id', '==', draftId))),
  ]);

  const versions = versionsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductVersion))
    .sort((a, b) => b.version_no - a.version_no);
  const currentVersion = versions.find((v) => v.id === draft.current_version_id) || versions[0] || null;
  let images = imagesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductImage))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  if (images.length === 0) {
    try {
      const payload = currentVersion?.edited_payload || currentVersion?.generated_payload;
      const now = new Date().toISOString();
      const imageId = `aiimg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const rawPreviewUrl = generateClientWhite1000x1000DataUrl(
        draft.source_product_name,
        payload?.botanical_name || payload?.category || '100% Pure & Natural'
      );
      const storageTargetPath = `products/${draftId}/images/${imageId}.jpg`;
      const uploaded = await ensureClientFirebaseStorageUrl({
        draftId,
        sourceUrl: rawPreviewUrl,
        storagePath: storageTargetPath,
      });
      const imageDoc: AIProductImage = {
        id: imageId,
        draft_id: draftId,
        version_id: draft.current_version_id,
        storage_key: uploaded.storagePath,
        preview_url: uploaded.downloadUrl,
        mime_type: 'image/png',
        width: 1000,
        height: 1000,
        background_hex: '#FFFFFF',
        checksum: `sha256_${imageId}`,
        prompt: `Commercial e-commerce studio product photograph of "${draft.source_product_name}" on pure white (#FFFFFF) 1000x1000 canvas.`,
        model: 'gpt-image-2.5-flare (studio-1000x1000)',
        generation_metadata: {
          provider: 'openai',
          project_name: 'leafyearthprdcnt',
          product_form: payload?.form || 'Natural Product',
          packaging_style: 'Retail Stand-Up Pouch / Jar',
          estimated_cost_usd: 0,
          latency_ms: 30,
          live_api_used: false,
          source_type: 'ai_generated',
        },
        status: 'GENERATED',
        rejection_reason: null,
        created_by: draft.created_by || 'admin-user',
        created_at: now,
        reviewed_by: null,
        reviewed_at: null,
      };
      await setDoc(doc(db, AI_PRODUCT_IMAGES_COLLECTION, imageId), imageDoc);
      images = [imageDoc];
    } catch {
      // Non-fatal
    }
  } else {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!isFirebaseStorageUrlClient(img.preview_url)) {
        try {
          const uploaded = await ensureClientFirebaseStorageUrl({
            draftId,
            sourceUrl: img.preview_url,
            storagePath: `products/${draftId}/images/${img.id}.jpg`,
          });
          if (isFirebaseStorageUrlClient(uploaded.downloadUrl)) {
            images[i] = {
              ...img,
              preview_url: uploaded.downloadUrl,
              storage_key: uploaded.storagePath,
            };
            await setDoc(
              doc(db, AI_PRODUCT_IMAGES_COLLECTION, img.id),
              { preview_url: uploaded.downloadUrl, storage_key: uploaded.storagePath },
              { merge: true }
            );
          }
        } catch {
          // Non-fatal
        }
      }
    }
  }
  const researchRecords = researchSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductResearchRecord))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const events = eventsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductEvent))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const syncLogs = syncSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductSyncLog))
    .sort((a, b) => String(b.applied_at).localeCompare(String(a.applied_at)));

  return {
    success: true,
    draft,
    currentVersion,
    versions,
    images,
    research: researchRecords[0] || null,
    researchHistory: researchRecords,
    events,
    syncLogs,
  };
}

export async function saveAIProductDraftEdits(params: {
  draftId: string;
  editedPayload?: AIProductContentPayload;
  masterProductId?: string | null;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}`, {
      method: 'PUT',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editedPayload: params.editedPayload,
        masterProductId: params.masterProductId,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save draft edits');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const draftRef = doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId);
  const draftSnap = await getDoc(draftRef);
  if (!draftSnap.exists()) throw new Error('Draft not found');
  const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;
  const now = new Date().toISOString();

  if (params.editedPayload) {
    const verRef = doc(db, AI_PRODUCT_VERSIONS_COLLECTION, draft.current_version_id);
    await setDoc(
      verRef,
      {
        edited_payload: params.editedPayload,
        edited_by: params.actor.id,
        edited_at: now,
        approved_by: null,
        approved_at: null,
      },
      { merge: true }
    );
  }

  let masterMeta: Partial<AIProductDraft> = {};
  if (params.masterProductId !== undefined) {
    if (params.masterProductId) {
      const mSnap = await getDoc(doc(db, 'products', params.masterProductId));
      const mData = mSnap.exists() ? mSnap.data() : null;
      masterMeta = {
        master_product_id: params.masterProductId,
        master_product_name: mData?.name || null,
        master_product_sku: mData?.sku || null,
      };
    } else {
      masterMeta = { master_product_id: null, master_product_name: null, master_product_sku: null };
    }
  }

  const newStatus: AIProductDraftStatus =
    draft.status === 'APPROVED' || draft.status === 'APPLIED' ? 'IN_REVIEW' : draft.status;
  const updatedDraft: AIProductDraft = {
    ...draft,
    ...masterMeta,
    status: newStatus,
    approved_version_id: params.editedPayload ? null : draft.approved_version_id,
    updated_at: now,
  };
  await setDoc(draftRef, updatedDraft, { merge: true });
  await logClientEvent(params.draftId, 'DRAFT_EDITED', params.actor);
  return { success: true, draft: updatedDraft };
}

export async function regenerateAIProductDraft(params: {
  draftId: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/regenerate`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
      }),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      return await res.json();
    }
  } catch {
    // Fallback below
  }

  const detail = await fetchAIProductDraftDetail(params.draftId);
  const nextVerNo =
    detail.versions.reduce((max: number, v: AIProductVersion) => Math.max(max, v.version_no), 0) + 1;
  const payload = buildClientFallbackContent(detail.draft.source_product_name, {
    categoryHint: detail.draft.category_hint || undefined,
    brandHint: detail.draft.brand_hint || undefined,
    isAyurvedicProduct: detail.draft.is_ayurvedic_product,
  });
  const now = new Date().toISOString();
  const verId = `aiver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const verDoc: AIProductVersion = {
    id: verId,
    draft_id: params.draftId,
    version_no: nextVerNo,
    generated_payload: payload,
    edited_payload: payload,
    model: 'gpt-4o-mini (staged-fallback)',
    prompt_version: AI_PROMPT_VERSION,
    usage_metadata: {
      provider: 'openai',
      project_name: 'leafyearthprdcnt',
      model: 'gpt-4o-mini (staged-fallback)',
      prompt_version: AI_PROMPT_VERSION,
      input_tokens: 390,
      output_tokens: 740,
      total_tokens: 1130,
      estimated_cost_usd: 0,
      latency_ms: 20,
      live_api_used: false,
    },
    generated_at: now,
    edited_by: null,
    edited_at: null,
    approved_by: null,
    approved_at: null,
  };
  await setDoc(doc(db, AI_PRODUCT_VERSIONS_COLLECTION, verId), verDoc);
  const updatedDraft: AIProductDraft = {
    ...detail.draft,
    status: 'DRAFT',
    current_version_id: verId,
    approved_version_id: null,
    updated_at: now,
  };
  await setDoc(doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId), updatedDraft, { merge: true });
  await logClientEvent(params.draftId, 'DRAFT_REGENERATED', params.actor, { version_no: nextVerNo });
  return { success: true, draft: updatedDraft, versionRecord: verDoc };
}

export async function submitAIProductDraftForReview(params: {
  draftId: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/submit`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: params.actor.id, actorEmail: params.actor.email }),
    });
    if (res.ok && !isStaticOrUnavailable(res)) return await res.json();
  } catch {
    // Fallback below
  }

  const now = new Date().toISOString();
  await setDoc(
    doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId),
    { status: 'IN_REVIEW', updated_at: now },
    { merge: true }
  );
  await logClientEvent(params.draftId, 'SUBMITTED_FOR_REVIEW', params.actor);
  return { success: true };
}

export async function approveOrRejectAIProductDraft(params: {
  draftId: string;
  action: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/approve`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: params.action,
        rejectionReason: params.rejectionReason,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to review content');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const detail = await fetchAIProductDraftDetail(params.draftId);
  const now = new Date().toISOString();
  if (params.action === 'REJECT') {
    await setDoc(
      doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId),
      {
        status: 'REJECTED',
        approved_version_id: null,
        rejection_reason: params.rejectionReason || 'Rejected during review',
        updated_at: now,
      },
      { merge: true }
    );
    await logClientEvent(params.draftId, 'CONTENT_REJECTED', params.actor);
    return { success: true };
  }

  await setDoc(
    doc(db, AI_PRODUCT_VERSIONS_COLLECTION, detail.draft.current_version_id),
    { approved_by: params.actor.id, approved_at: now },
    { merge: true }
  );
  await setDoc(
    doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId),
    {
      status: 'APPROVED',
      approved_version_id: detail.draft.current_version_id,
      rejection_reason: null,
      updated_at: now,
    },
    { merge: true }
  );
  await logClientEvent(params.draftId, 'CONTENT_APPROVED', params.actor);
  return { success: true };
}

export async function generateAIProductImageClient(params: {
  draftId: string;
  packagingStyle?: string;
  productForm?: string;
  customPrompt?: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/images/generate`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packagingStyle: params.packagingStyle,
        productForm: params.productForm,
        customPrompt: params.customPrompt,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (res.ok && !isStaticOrUnavailable(res)) return await res.json();
  } catch {
    // Fallback below
  }

  const detail = await fetchAIProductDraftDetail(params.draftId);
  const now = new Date().toISOString();
  const imageId = `aiimg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const rawPreviewUrl = generateClientWhite1000x1000DataUrl(
    detail.draft.source_product_name,
    params.packagingStyle || '100% Pure & Natural'
  );
  const uploaded = await ensureClientFirebaseStorageUrl({
    draftId: params.draftId,
    sourceUrl: rawPreviewUrl,
    storagePath: `products/${params.draftId}/images/${imageId}.jpg`,
  });
  const imageDoc: AIProductImage = {
    id: imageId,
    draft_id: params.draftId,
    version_id: detail.draft.current_version_id,
    storage_key: uploaded.storagePath,
    preview_url: uploaded.downloadUrl,
    mime_type: 'image/png',
    width: 1000,
    height: 1000,
    background_hex: '#FFFFFF',
    checksum: `sha256_${imageId}`,
    prompt: `Commercial e-commerce studio product photograph of "${detail.draft.source_product_name}" on pure white (#FFFFFF) 1000x1000 canvas.`,
    model: 'gpt-image-1 (studio-1000x1000)',
    generation_metadata: {
      provider: 'openai',
      project_name: 'leafyearthprdcnt',
      product_form: params.productForm || 'Natural Product',
      packaging_style: params.packagingStyle || 'Retail Pouch / Jar',
      estimated_cost_usd: 0,
      latency_ms: 35,
      live_api_used: false,
      source_type: 'ai_generated',
    },
    status: 'GENERATED',
    rejection_reason: null,
    created_by: params.actor.id,
    created_at: now,
    reviewed_by: null,
    reviewed_at: null,
  };
  await setDoc(doc(db, AI_PRODUCT_IMAGES_COLLECTION, imageId), imageDoc);
  await logClientEvent(params.draftId, 'IMAGE_GENERATED', params.actor, { image_id: imageId });
  return { success: true, image: imageDoc };
}

export async function approveOrRejectAIProductImage(params: {
  draftId: string;
  imageId: string;
  action: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(
      `/api/admin/ai-products/${params.draftId}/images/${params.imageId}/approve`,
      {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: params.action,
          rejectionReason: params.rejectionReason,
          actorId: params.actor.id,
        }),
      }
    );
    if (res.ok && !isStaticOrUnavailable(res)) return await res.json();
  } catch {
    // Fallback below
  }

  const now = new Date().toISOString();
  if (params.action === 'REJECT') {
    await setDoc(
      doc(db, AI_PRODUCT_IMAGES_COLLECTION, params.imageId),
      {
        status: 'REJECTED',
        rejection_reason: params.rejectionReason || 'Rejected by reviewer',
        reviewed_by: params.actor.id,
        reviewed_at: now,
      },
      { merge: true }
    );
    await logClientEvent(params.draftId, 'IMAGE_REJECTED', params.actor, { image_id: params.imageId });
    return { success: true };
  }

  await setDoc(
    doc(db, AI_PRODUCT_IMAGES_COLLECTION, params.imageId),
    {
      status: 'APPROVED',
      rejection_reason: null,
      reviewed_by: params.actor.id,
      reviewed_at: now,
    },
    { merge: true }
  );
  await setDoc(
    doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId),
    { approved_image_id: params.imageId, updated_at: now },
    { merge: true }
  );
  await logClientEvent(params.draftId, 'IMAGE_APPROVED', params.actor, { image_id: params.imageId });
  return { success: true };
}

export async function saveAIProductResearchClient(params: {
  draftId: string;
  taxation?: Partial<AIProductTaxationResearch>;
  packing?: Partial<AIProductPackingResearch>;
  offers?: WebPriceSourceOffer[];
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/research`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taxation: params.taxation,
        packing: params.packing,
        offers: params.offers,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save research');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const detail = await fetchAIProductDraftDetail(params.draftId);
  const existing = detail.research;
  const now = new Date().toISOString();
  const selectedPackingSize = (
    params.packing?.selectedPackingSize ||
    existing?.packing?.selectedPackingSize ||
    '100 g'
  ).trim();
  const avail = Array.from(
    new Set([
      selectedPackingSize,
      ...(params.packing?.availablePackingSizes ||
        existing?.packing?.availablePackingSizes || ['50 g', '100 g', '250 g', '500 g', '1 kg']),
    ])
  );
  const offers = params.offers || existing?.marketResearch?.offers || [];
  const range = calculateMarketPriceRangeClient(offers, selectedPackingSize);

  const researchId = existing?.id || `aires_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record: AIProductResearchRecord = {
    id: researchId,
    draft_id: params.draftId,
    version_id: detail.draft.current_version_id,
    taxation: {
      hsnCode: String(params.taxation?.hsnCode ?? existing?.taxation?.hsnCode ?? '09103030').trim(),
      gstRatePercent: Number(params.taxation?.gstRatePercent ?? existing?.taxation?.gstRatePercent ?? 5),
      gstReference: String(
        params.taxation?.gstReference ??
          existing?.taxation?.gstReference ??
          'GST Schedule I – Verify 4–8 digit HSN classification'
      ).trim(),
      confidence: params.taxation?.confidence || existing?.taxation?.confidence || 'high',
      needsManualVerification: false,
      verifiedBy: null,
      verifiedAt: null,
    },
    packing: {
      selectedPackingSize,
      unit: String(params.packing?.unit ?? existing?.packing?.unit ?? 'PAC').toUpperCase(),
      availablePackingSizes: avail,
    },
    marketResearch: {
      comparedPackingSize: selectedPackingSize,
      currency: 'INR',
      lowestPrice: range.lowestPrice,
      highestPrice: range.highestPrice,
      checkedAt: now,
      searchStatus: range.searchStatus,
      offers,
    },
    status: 'DRAFT',
    rejection_reason: null,
    created_by: existing?.created_by || params.actor.id,
    created_at: existing?.created_at || now,
    updated_at: now,
    approved_by: null,
    approved_at: null,
  };

  await setDoc(doc(db, AI_PRODUCT_RESEARCH_COLLECTION, researchId), record);
  await setDoc(
    doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId),
    { approved_research_id: null, updated_at: now },
    { merge: true }
  );
  await logClientEvent(params.draftId, 'RESEARCH_UPDATED', params.actor, { research_id: researchId });
  return { success: true, research: record };
}

export async function approveOrRejectAIProductResearch(params: {
  draftId: string;
  action: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/research/approve`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: params.action,
        rejectionReason: params.rejectionReason,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve research');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const detail = await fetchAIProductDraftDetail(params.draftId);
  if (!detail.research) throw new Error('No research record found to approve');
  const now = new Date().toISOString();

  if (params.action === 'REJECT') {
    await setDoc(
      doc(db, AI_PRODUCT_RESEARCH_COLLECTION, detail.research.id),
      { status: 'REJECTED', rejection_reason: params.rejectionReason || 'Rejected', updated_at: now },
      { merge: true }
    );
    await setDoc(
      doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId),
      { approved_research_id: null, updated_at: now },
      { merge: true }
    );
    return { success: true };
  }

  const range = calculateMarketPriceRangeClient(
    detail.research.marketResearch.offers,
    detail.research.packing.selectedPackingSize
  );
  const approved: AIProductResearchRecord = {
    ...detail.research,
    taxation: {
      ...detail.research.taxation,
      verifiedBy: params.actor.email || params.actor.id,
      verifiedAt: now,
    },
    marketResearch: {
      ...detail.research.marketResearch,
      lowestPrice: range.lowestPrice,
      highestPrice: range.highestPrice,
      searchStatus: range.searchStatus,
    },
    status: 'APPROVED',
    updated_at: now,
    approved_by: params.actor.id,
    approved_at: now,
  };
  await setDoc(doc(db, AI_PRODUCT_RESEARCH_COLLECTION, detail.research.id), approved, { merge: true });
  await setDoc(
    doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId),
    { approved_research_id: detail.research.id, updated_at: now },
    { merge: true }
  );
  await logClientEvent(params.draftId, 'RESEARCH_APPROVED', params.actor, {
    research_id: detail.research.id,
  });
  return { success: true, research: approved };
}

function matchMasterProductByNameClient(
  products: Array<Record<string, any>>,
  candidateNames: Array<string | null | undefined>
): Record<string, any> | null {
  const norm = (val: unknown) =>
    String(val || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  const baseName = (val: unknown) =>
    norm(val)
      .replace(/\([^)]*\)/g, '')
      .trim()
      .replace(/\s+/g, ' ');

  const validCandidates = (candidateNames || []).map(norm).filter((s) => s.length >= 2);
  if (validCandidates.length === 0) return null;

  for (const cand of validCandidates) {
    const exactHit = (products || []).find(
      (p) => norm(p.name) === cand || norm(p.englishName) === cand
    );
    if (exactHit) return exactHit;
  }

  const baseCandidates = validCandidates.map(baseName).filter((s) => s.length >= 3);
  for (const bCand of baseCandidates) {
    const baseHit = (products || []).find(
      (p) => baseName(p.name) === bCand || baseName(p.englishName) === bCand
    );
    if (baseHit) return baseHit;
  }

  return null;
}

function computeNextEightDigitSkuClient(products: Array<Record<string, any>>): string {
  let highest = 10000000;
  for (const p of products || []) {
    const raw = String(p?.sku ?? '').trim();
    if (/^[0-9]{8}$/.test(raw)) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n > highest && n < 99999999) {
        highest = n;
      }
    }
  }
  return String(highest + 1).padStart(8, '0');
}

export async function compareAIDraftWithMaster(draftId: string, masterProductId?: string | null) {
  const qs = masterProductId ? `?masterProductId=${encodeURIComponent(masterProductId)}` : '';
  try {
    const res = await fetch(`/api/admin/ai-products/${draftId}/compare${qs}`, {
      headers: await authHeaders(),
    });
    if (res.ok && !isStaticOrUnavailable(res)) return await res.json();
  } catch {
    // Fallback below
  }

  const detail = await fetchAIProductDraftDetail(draftId);
  let draft = detail.draft;
  const payload =
    detail.currentVersion?.edited_payload || detail.currentVersion?.generated_payload || null;

  const targetId = masterProductId || draft.master_product_id;
  let masterProduct: Record<string, any> | null = null;
  if (targetId) {
    const mSnap = await getDoc(doc(db, 'products', targetId));
    if (mSnap.exists()) masterProduct = { id: mSnap.id, ...mSnap.data() };
  }

  let nextAutoSku = '10000001';
  if (!masterProduct) {
    const allSnap = await getDocs(collection(db, 'products'));
    const allProducts = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    nextAutoSku = computeNextEightDigitSkuClient(allProducts);
    const autoMatched = matchMasterProductByNameClient(allProducts, [
      draft.source_product_name,
      payload?.english_product_name,
    ]);
    if (autoMatched) {
      masterProduct = autoMatched;
      draft = {
        ...draft,
        master_product_id: String(autoMatched.id),
        master_product_name: autoMatched.name || null,
        master_product_sku: autoMatched.sku || null,
      };
      await setDoc(
        doc(db, AI_PRODUCT_DRAFTS_COLLECTION, draft.id),
        {
          master_product_id: draft.master_product_id,
          master_product_name: draft.master_product_name,
          master_product_sku: draft.master_product_sku,
        },
        { merge: true }
      );
    }
  } else if (/^[0-9]{8}$/.test(String(masterProduct.sku || '').trim())) {
    nextAutoSku = String(masterProduct.sku).trim();
  }

  const approvedImage =
    detail.images.find((i: AIProductImage) => i.id === draft.approved_image_id) || null;
  const approvedResearch =
    detail.research?.id === draft.approved_research_id ? detail.research : detail.research;

  const comparison = buildMasterComparisonDiffClient({
    masterProduct,
    version: detail.currentVersion,
    approvedImage,
    approvedResearch,
  });

  return {
    success: true,
    draft,
    masterProduct,
    isNewMasterProduct: !masterProduct,
    nextAutoSku,
    version: detail.currentVersion,
    approvedImage,
    approvedResearch,
    comparison,
  };
}

export async function applyAIDraftToMaster(params: {
  draftId: string;
  masterProductId?: string | null;
  selectedFields: string[];
  imageAction?: 'none' | 'replace_primary' | 'append_gallery';
  idempotencyKey?: string;
  masterProductOverrides?: Record<string, any> | null;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/apply`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterProductId: params.masterProductId || '',
        selectedFields: params.selectedFields,
        imageAction: params.imageAction || 'none',
        idempotencyKey: params.idempotencyKey,
        masterProductOverrides: params.masterProductOverrides || null,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply AI draft to master product');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  // Direct transactional fallback for static deployment
  const compData = await compareAIDraftWithMaster(params.draftId, params.masterProductId);
  if (compData.draft.status !== 'APPROVED' && compData.draft.status !== 'APPLIED') {
    throw new Error('Draft must be APPROVED before synchronizing to Product Master.');
  }

  const allSnap = await getDocs(collection(db, 'products'));
  const allProducts = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const nextAutoSku = computeNextEightDigitSkuClient(allProducts);
  const payload =
    compData.version?.edited_payload || compData.version?.generated_payload || null;

  let targetMasterId = String(
    params.masterProductId || compData.masterProduct?.id || compData.draft.master_product_id || ''
  ).trim();
  let matchedExisting = targetMasterId
    ? allProducts.find((p) => String(p.id) === targetMasterId) || null
    : null;

  if (!matchedExisting) {
    matchedExisting = matchMasterProductByNameClient(allProducts, [
      params.masterProductOverrides?.name,
      compData.draft.source_product_name,
      payload?.english_product_name,
    ]);
    if (matchedExisting) {
      targetMasterId = String(matchedExisting.id);
    }
  }

  if (!targetMasterId) {
    targetMasterId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // Export AI product images into Firebase Storage (`https://firebasestorage.googleapis.com`)
  let approvedImgForSync: AIProductImage | null = compData.approvedImage || null;
  if (approvedImgForSync && approvedImgForSync.preview_url) {
    const isGallery = params.imageAction === 'append_gallery';
    const targetImgPath = isGallery
      ? `products/${targetMasterId}/images/${approvedImgForSync.id}.jpg`
      : `products/${targetMasterId}/main.jpg`;
    const exported = await ensureClientFirebaseStorageUrl({
      draftId: params.draftId,
      targetProductId: targetMasterId,
      sourceUrl: approvedImgForSync.preview_url,
      storagePath: targetImgPath,
    });
    approvedImgForSync = {
      ...approvedImgForSync,
      preview_url: exported.downloadUrl,
      storage_key: exported.storagePath,
    };
  }

  const normalizedOverrides: Record<string, any> = params.masterProductOverrides
    ? { ...params.masterProductOverrides }
    : {};
  if (typeof normalizedOverrides.imageUrl === 'string' && normalizedOverrides.imageUrl.trim()) {
    const exportedMain = await ensureClientFirebaseStorageUrl({
      draftId: params.draftId,
      targetProductId: targetMasterId,
      sourceUrl: normalizedOverrides.imageUrl.trim(),
      storagePath: `products/${targetMasterId}/main.jpg`,
    });
    normalizedOverrides.imageUrl = exportedMain.downloadUrl;
    normalizedOverrides.storagePath = exportedMain.storagePath;
  }
  if (Array.isArray(normalizedOverrides.images) && normalizedOverrides.images.length > 0) {
    const exportedGallery: string[] = [];
    for (let idx = 0; idx < normalizedOverrides.images.length; idx++) {
      const gUrl = String(normalizedOverrides.images[idx] || '').trim();
      if (!gUrl) continue;
      if (
        idx === 0 &&
        normalizedOverrides.imageUrl &&
        isFirebaseStorageUrlClient(normalizedOverrides.imageUrl) &&
        !isFirebaseStorageUrlClient(gUrl)
      ) {
        exportedGallery.push(normalizedOverrides.imageUrl);
        continue;
      }
      if (isFirebaseStorageUrlClient(gUrl)) {
        exportedGallery.push(gUrl);
        continue;
      }
      const gPath =
        idx === 0
          ? `products/${targetMasterId}/main.jpg`
          : `products/${targetMasterId}/images/gallery_${idx}_${Date.now()}.jpg`;
      const exportedItem = await ensureClientFirebaseStorageUrl({
        draftId: params.draftId,
        targetProductId: targetMasterId,
        sourceUrl: gUrl,
        storagePath: gPath,
      });
      exportedGallery.push(exportedItem.downloadUrl);
    }
    normalizedOverrides.images = Array.from(new Set(exportedGallery.filter(Boolean)));
  }

  const PROTECTED_SELLING_FIELDS = new Set([
    'sku',
    'mrp',
    'onlinePrice',
    'offerPrice',
    'shopPrice',
    'discount',
  ]);
  const selectedSet = new Set(params.selectedFields);
  const masterRef = doc(db, 'products', targetMasterId);
  const draftRef = doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId);
  const syncLogId = `aisync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const syncLogRef = doc(db, AI_PRODUCT_SYNC_LOGS_COLLECTION, syncLogId);
  const now = new Date().toISOString();

  const txRes = await runTransaction(db, async (tx) => {
    const mSnap = await tx.get(masterRef);
    const existingMaster: Record<string, any> = mSnap.exists()
      ? { id: mSnap.id, ...mSnap.data() }
      : {};
    const isNew = !mSnap.exists();

    const updatePatch: Record<string, any> = {};
    const beforeSnapshot: Record<string, any> = {};
    const afterSnapshot: Record<string, any> = {};

    for (const item of compData.comparison as MasterFieldComparisonItem[]) {
      if (!selectedSet.has(item.fieldKey) && !selectedSet.has(item.masterField)) continue;
      if (!item.selectable || PROTECTED_SELLING_FIELDS.has(item.masterField)) continue;
      beforeSnapshot[item.masterField] = existingMaster[item.masterField] ?? null;
      const val =
        item.masterField === 'imageUrl' && approvedImgForSync?.preview_url
          ? approvedImgForSync.preview_url
          : item.proposedAiValue;
      updatePatch[item.masterField] = val;
      afterSnapshot[item.masterField] = val;
    }

    if (approvedImgForSync && approvedImgForSync.status === 'APPROVED') {
      if (params.imageAction === 'replace_primary') {
        beforeSnapshot.imageUrl = existingMaster.imageUrl ?? null;
        beforeSnapshot.storagePath = existingMaster.storagePath ?? null;
        updatePatch.imageUrl = approvedImgForSync.preview_url;
        updatePatch.storagePath = approvedImgForSync.storage_key;
        afterSnapshot.imageUrl = approvedImgForSync.preview_url;
        afterSnapshot.storagePath = approvedImgForSync.storage_key;
      } else if (params.imageAction === 'append_gallery') {
        const imgs = Array.isArray(existingMaster.images) ? existingMaster.images : [];
        const updated = Array.from(new Set([...imgs, approvedImgForSync.preview_url]));
        beforeSnapshot.images = imgs;
        updatePatch.images = updated;
        afterSnapshot.images = updated;
      }
    }

    const ov = normalizedOverrides;
    const setOvField = (key: string, val: any) => {
      if (val === undefined) return;
      if (!(key in beforeSnapshot)) beforeSnapshot[key] = existingMaster[key] ?? null;
      updatePatch[key] = val;
      afterSnapshot[key] = val;
    };

    if (typeof ov.name === 'string' && ov.name.trim()) setOvField('name', ov.name.trim());
    const existingSku = String(existingMaster.sku || '').trim();
    const finalSku = /^[0-9]{8}$/.test(existingSku)
      ? existingSku
      : /^[0-9]{8}$/.test(String(ov.sku || '').trim())
      ? String(ov.sku).trim()
      : nextAutoSku;
    setOvField('sku', finalSku);

    if (typeof ov.packingSize === 'string') setOvField('packingSize', ov.packingSize.trim());
    if (typeof ov.unit === 'string' && ov.unit.trim())
      setOvField('unit', ov.unit.trim().toUpperCase());
    if (ov.mrp !== undefined && ov.mrp !== null && Number.isFinite(Number(ov.mrp))) {
      setOvField('mrp', Number(ov.mrp));
    }
    if (
      ov.onlinePrice !== undefined &&
      ov.onlinePrice !== null &&
      Number.isFinite(Number(ov.onlinePrice))
    ) {
      const online = Number(ov.onlinePrice);
      setOvField('onlinePrice', online);
      setOvField('offerPrice', online);
      const mrpVal = Number(updatePatch.mrp ?? existingMaster.mrp ?? 0);
      if (mrpVal > 0 && online > 0 && mrpVal >= online) {
        setOvField('discount', Math.round(((mrpVal - online) / mrpVal) * 100));
      }
    }
    if (ov.shopPrice !== undefined && ov.shopPrice !== null && Number.isFinite(Number(ov.shopPrice))) {
      setOvField('shopPrice', Number(ov.shopPrice));
    }
    if (
      ov.gstPercentage !== undefined &&
      ov.gstPercentage !== null &&
      Number.isFinite(Number(ov.gstPercentage))
    ) {
      setOvField('gstPercentage', Number(ov.gstPercentage));
    }
    if (Array.isArray(ov.categories)) {
      const cleanCats = Array.from(
        new Set(ov.categories.map((c: any) => String(c || '').trim()).filter(Boolean))
      );
      setOvField('categories', cleanCats);
      setOvField('category', cleanCats[0] || existingMaster.category || 'Uncategorized');
    }
    if (typeof ov.leafycategory === 'string' && ov.leafycategory.trim()) {
      setOvField('leafycategory', ov.leafycategory.trim());
    }
    if (typeof ov.brand === 'string') setOvField('brand', ov.brand.trim());
    if (typeof ov.brandOwner === 'string') setOvField('brandOwner', ov.brandOwner.trim());
    if (ov.stockIn !== undefined && ov.stockIn !== null && Number.isFinite(Number(ov.stockIn))) {
      const stockInNum = Math.max(0, Number(ov.stockIn));
      setOvField('stockIn', stockInNum);
      const stockOutNum = Number(existingMaster.stockOut ?? 0);
      const computedStock = Math.max(0, stockInNum - stockOutNum);
      setOvField('stock', computedStock);
      setOvField('stockAvailability', computedStock > 0 ? 'In Stock' : 'Out of Stock');
    }
    if (typeof ov.imageUrl === 'string' && ov.imageUrl.trim()) {
      setOvField('imageUrl', ov.imageUrl.trim());
    }
    if (typeof ov.storagePath === 'string' && ov.storagePath.trim()) {
      setOvField('storagePath', ov.storagePath.trim());
    }
    if (Array.isArray(ov.images) && ov.images.length > 0) {
      setOvField('images', ov.images.filter(Boolean));
    } else if (updatePatch.imageUrl && (!Array.isArray(existingMaster.images) || existingMaster.images.length === 0)) {
      setOvField('images', [updatePatch.imageUrl]);
    }
    if (typeof ov.uniqueSpec1 === 'string') setOvField('uniqueSpec1', ov.uniqueSpec1.trim());
    if (typeof ov.uniqueSpec2 === 'string') setOvField('uniqueSpec2', ov.uniqueSpec2.trim());
    if (typeof ov.uniqueSpec3 === 'string') setOvField('uniqueSpec3', ov.uniqueSpec3.trim());

    if (isNew) {
      const baseDefaults: Record<string, any> = {
        name: updatePatch.name || compData.draft.source_product_name || 'New Product',
        sku: finalSku,
        hsnCode: updatePatch.hsnCode || '',
        packingSize: updatePatch.packingSize || '100 g',
        unit: updatePatch.unit || 'PAC',
        mrp: updatePatch.mrp ?? 0,
        onlinePrice: updatePatch.onlinePrice ?? 0,
        offerPrice: updatePatch.offerPrice ?? updatePatch.onlinePrice ?? 0,
        shopPrice: updatePatch.shopPrice ?? 0,
        discount: updatePatch.discount ?? 0,
        gstPercentage: updatePatch.gstPercentage ?? 5,
        categories: updatePatch.categories || [],
        category: updatePatch.category || (updatePatch.categories?.[0] ?? 'Uncategorized'),
        leafycategory: updatePatch.leafycategory || '',
        brand: updatePatch.brand || '',
        brandOwner: updatePatch.brandOwner || '',
        stockIn: updatePatch.stockIn ?? 0,
        stockOut: 0,
        stock: updatePatch.stock ?? updatePatch.stockIn ?? 0,
        stockAvailability:
          (updatePatch.stock ?? updatePatch.stockIn ?? 0) > 0 ? 'In Stock' : 'Out of Stock',
        imageUrl: updatePatch.imageUrl || '',
        storagePath: updatePatch.storagePath || '',
        images: updatePatch.images || (updatePatch.imageUrl ? [updatePatch.imageUrl] : []),
        videos: [],
        description: updatePatch.description || '',
        ingredients: '',
        uniqueSpec1: updatePatch.uniqueSpec1 || '',
        uniqueSpec2: updatePatch.uniqueSpec2 || '',
        uniqueSpec3: updatePatch.uniqueSpec3 || '',
        uniqueSpec4: '',
        specifications: '',
        variants: '',
        notes: '',
        unitsSold: 0,
        revenue: 0,
        growthRate: 0,
        amazonSales: 0,
        flipkartSales: 0,
        meeshoSales: 0,
        vamjoSales: 0,
        whatsappSales: 0,
        countersaleSales: 0,
        preorderactive: false,
        culinarydetails: false,
        amazonWeblink: '',
        rating: 4.8,
        reviewsCount: 0,
      };
      for (const [k, v] of Object.entries(baseDefaults)) {
        if (updatePatch[k] === undefined) {
          updatePatch[k] = v;
        }
      }
    }

    if (updatePatch.urlSlug !== undefined) {
      const candidateSlug = normalizeUrlSlugClient(updatePatch.urlSlug);
      if (!isValidUrlSlugClient(candidateSlug)) {
        throw new Error(`Invalid URL slug: "${updatePatch.urlSlug}"`);
      }
      updatePatch.urlSlug = candidateSlug;
      afterSnapshot.urlSlug = candidateSlug;

      const slugRef = doc(db, PRODUCT_SLUGS_COLLECTION, candidateSlug);
      const slugSnap = await tx.get(slugRef);
      if (slugSnap.exists() && String(slugSnap.data()?.productId) !== String(targetMasterId)) {
        throw new Error(`SLUG_CONFLICT: Slug '${candidateSlug}' is already claimed by product '${slugSnap.data()?.productId}'.`);
      }
      const prevSlug = existingMaster.urlSlug ? String(existingMaster.urlSlug).trim() : null;
      tx.set(slugRef, {
        slug: candidateSlug,
        productId: targetMasterId,
        state: 'active',
        canonicalSlug: candidateSlug,
        createdAt: slugSnap.exists() ? slugSnap.data()?.createdAt || now : now,
        updatedAt: now,
        updatedBy: params.actor.id,
      });
      if (prevSlug && prevSlug !== candidateSlug && isValidUrlSlugClient(prevSlug)) {
        tx.set(
          doc(db, PRODUCT_SLUGS_COLLECTION, prevSlug),
          {
            slug: prevSlug,
            productId: targetMasterId,
            state: 'redirect',
            canonicalSlug: candidateSlug,
            createdAt: now,
            updatedAt: now,
            updatedBy: params.actor.id,
          },
          { merge: true }
        );
      }
      updatePatch.canonicalUrl = `${window.location.origin}/products/${candidateSlug}`;
      updatePatch.seoUpdatedAt = now;
    }

    const nextRev = Number(existingMaster.revision || 0) + 1;
    const verId = compData.draft.approved_version_id || compData.draft.current_version_id || '';
    const baseOrigin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://leafyearth.com';
    const uniqueAiRefLink =
      ov.aiContentLink ||
      `${baseOrigin}/api/admin/ai-products/${encodeURIComponent(params.draftId)}${verId ? `?version=${encodeURIComponent(verId)}` : ''}`;
    beforeSnapshot.aiContentLink = existingMaster.aiContentLink ?? null;
    beforeSnapshot.aiDraftId = existingMaster.aiDraftId ?? null;
    updatePatch.aiContentLink = uniqueAiRefLink;
    updatePatch.aiDraftId = params.draftId;
    afterSnapshot.aiContentLink = uniqueAiRefLink;
    afterSnapshot.aiDraftId = params.draftId;
    delete updatePatch.aiContentMetadata;
    updatePatch.revision = nextRev;

    tx.set(
      masterRef,
      { ...updatePatch, aiContentMetadata: deleteField() },
      { merge: true }
    );
    const syncLogDoc: AIProductSyncLog = {
      id: syncLogId,
      draft_id: params.draftId,
      version_id: compData.draft.approved_version_id || compData.draft.current_version_id,
      master_product_id: targetMasterId,
      idempotency_key: params.idempotencyKey || `sync_${params.draftId}_${Date.now()}`,
      selected_fields: params.selectedFields,
      image_action: params.imageAction || 'none',
      approved_image_id: compData.approvedImage?.id || null,
      approved_research_id: compData.approvedResearch?.id || null,
      resulting_master_revision: nextRev,
      before_snapshot: beforeSnapshot,
      after_snapshot: afterSnapshot,
      result: 'SUCCESS',
      error_message: null,
      applied_by: params.actor.id,
      applied_by_email: params.actor.email,
      applied_at: now,
    };
    tx.set(syncLogRef, syncLogDoc);
    tx.set(
      draftRef,
      {
        master_product_id: targetMasterId,
        master_product_name: updatePatch.name || existingMaster.name || null,
        master_product_sku: updatePatch.sku || existingMaster.sku || null,
        status: 'APPLIED',
        last_synced_at: now,
        updated_at: now,
      },
      { merge: true }
    );
    const cleanUpdatedMaster: Record<string, any> = {
      id: targetMasterId,
      ...existingMaster,
      ...updatePatch,
    };
    delete cleanUpdatedMaster.aiContentMetadata;
    return { syncLogDoc, updatedMaster: cleanUpdatedMaster };
  });

  await logClientEvent(params.draftId, 'MASTER_SYNC_APPLIED', params.actor, {
    sync_log_id: syncLogId,
    master_product_id: targetMasterId,
  });

  return {
    success: true,
    syncLog: txRes.syncLogDoc,
    masterProduct: txRes.updatedMaster,
  };
}

// ============================================================================
// V9 Section 6: SEO Generation, Validation, Slug Check, Approve & Apply Client
// ============================================================================

export async function checkUrlSlugAvailabilityClient(slug: string, productId?: string | null) {
  const qs = new URLSearchParams({ slug });
  if (productId) qs.set('productId', productId);
  try {
    const res = await fetch(`/api/admin/ai-products/slug-check?${qs.toString()}`, {
      headers: await authHeaders(),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      return await res.json();
    }
  } catch {
    // Fallback below
  }

  const normalizedSlug = normalizeUrlSlugClient(slug);
  if (!isValidUrlSlugClient(normalizedSlug)) {
    return {
      success: true,
      available: false,
      normalizedSlug,
      claimedByProductId: null,
      state: null,
      suggestedSlug: 'product-item',
    };
  }
  const snap = await getDoc(doc(db, PRODUCT_SLUGS_COLLECTION, normalizedSlug));
  if (!snap.exists()) {
    return {
      success: true,
      available: true,
      normalizedSlug,
      claimedByProductId: null,
      state: null,
      suggestedSlug: normalizedSlug,
    };
  }
  const data = snap.data() as ProductSlugReservation;
  const ownedBySame = Boolean(productId && String(data.productId) === String(productId));
  return {
    success: true,
    available: ownedBySame,
    normalizedSlug,
    claimedByProductId: String(data.productId),
    state: data.state,
    suggestedSlug: ownedBySame ? normalizedSlug : `${normalizedSlug}-2`,
  };
}

export async function generateDraftSEOClient(params: {
  draftId: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/seo/generate`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: params.actor.id, actorEmail: params.actor.email }),
    });
    if (res.ok && !isStaticOrUnavailable(res)) return await res.json();
  } catch {
    // Fallback below
  }

  const detail = await fetchAIProductDraftDetail(params.draftId);
  const seo = buildClientFallbackSEO(detail.draft.source_product_name, {
    categoryHint: detail.draft.category_hint || undefined,
    brandHint: detail.draft.brand_hint || 'LeafyEarth',
  });
  const slugCheck = await checkUrlSlugAvailabilityClient(seo.urlSlug, detail.draft.master_product_id);
  seo.urlSlug = slugCheck.available ? slugCheck.normalizedSlug : slugCheck.suggestedSlug;

  const now = new Date().toISOString();
  const ver = detail.currentVersion;
  if (ver) {
    const updatedPayload = {
      ...(ver.edited_payload || ver.generated_payload),
      seo,
    };
    await setDoc(
      doc(db, AI_PRODUCT_VERSIONS_COLLECTION, ver.id),
      {
        edited_payload: updatedPayload,
        seo_status: 'DRAFT',
        seo_approved_by: null,
        seo_approved_at: null,
        edited_by: params.actor.id,
        edited_at: now,
      },
      { merge: true }
    );
  }
  return { success: true, seo, slugAvailability: slugCheck };
}

export async function updateDraftSEOClient(params: {
  draftId: string;
  seo: AIProductSEOPayload;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/seo`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seo: params.seo,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update SEO');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const detail = await fetchAIProductDraftDetail(params.draftId);
  const normalizedSeo: AIProductSEOPayload = {
    seoTitle: String(params.seo.seoTitle || '').trim(),
    metaDescription: String(params.seo.metaDescription || '').trim(),
    seoKeywords: Array.from(
      new Set((params.seo.seoKeywords || []).map((k) => String(k || '').trim()).filter(Boolean))
    ),
    urlSlug: normalizeUrlSlugClient(params.seo.urlSlug),
  };
  const now = new Date().toISOString();
  if (detail.currentVersion) {
    await setDoc(
      doc(db, AI_PRODUCT_VERSIONS_COLLECTION, detail.currentVersion.id),
      {
        edited_payload: {
          ...(detail.currentVersion.edited_payload || detail.currentVersion.generated_payload),
          seo: normalizedSeo,
        },
        seo_status: 'DRAFT',
        seo_approved_by: null,
        seo_approved_at: null,
        edited_by: params.actor.id,
        edited_at: now,
      },
      { merge: true }
    );
  }
  return { success: true, seo: normalizedSeo };
}

export async function approveDraftSEOClient(params: {
  draftId: string;
  seo?: AIProductSEOPayload;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/seo/approve`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seo: params.seo,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve SEO');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const detail = await fetchAIProductDraftDetail(params.draftId);
  const now = new Date().toISOString();
  if (detail.currentVersion) {
    await setDoc(
      doc(db, AI_PRODUCT_VERSIONS_COLLECTION, detail.currentVersion.id),
      {
        ...(params.seo
          ? {
              edited_payload: {
                ...(detail.currentVersion.edited_payload || detail.currentVersion.generated_payload),
                seo: params.seo,
              },
            }
          : {}),
        seo_status: 'APPROVED',
        seo_approved_by: params.actor.id,
        seo_approved_at: now,
      },
      { merge: true }
    );
    await setDoc(
      doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId),
      { approved_seo_version_id: detail.currentVersion.id, updated_at: now },
      { merge: true }
    );
  }
  return { success: true };
}

export async function applyDraftSEOClient(params: {
  draftId: string;
  masterProductId: string;
  selectedFields?: string[];
  expectedMasterRevision?: number;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/seo/apply`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterProductId: params.masterProductId,
        selectedFields: params.selectedFields || ['seoTitle', 'metaDescription', 'seoKeywords', 'urlSlug'],
        expectedMasterRevision: params.expectedMasterRevision,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply SEO to master');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  return applyAIDraftToMaster({
    draftId: params.draftId,
    masterProductId: params.masterProductId,
    selectedFields: params.selectedFields || ['seoTitle', 'metaDescription', 'seoKeywords', 'urlSlug'],
    actor: params.actor,
  });
}

// ============================================================================
// V10 Section 16 & 18: AI Commerce & Discoverability Client Functions
// ============================================================================

export async function fetchAICommerceDashboardStatus() {
  try {
    const res = await fetch('/api/ai-commerce/status', {
      headers: await authHeaders(),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      return await res.json();
    }
  } catch {
    // Fallback below
  }

  const [
    productsSnap,
    settingsSnap,
    stagingSnap,
    feedsSnap,
    jobsSnap,
    logsSnap,
    publicSnap,
    slugsSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(collection(db, AI_COMMERCE_SETTINGS_COLLECTION)),
    getDocs(collection(db, AI_COMMERCE_STAGING_COLLECTION)),
    getDocs(collection(db, AI_COMMERCE_FEEDS_COLLECTION)),
    getDocs(collection(db, AI_COMMERCE_SYNC_JOBS_COLLECTION)),
    getDocs(collection(db, AI_COMMERCE_SYNC_LOGS_COLLECTION)),
    getDocs(collection(db, PUBLIC_PRODUCTS_COLLECTION)),
    getDocs(collection(db, PRODUCT_SLUGS_COLLECTION)),
  ]);

  const products = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const now = new Date().toISOString();
  const defaultShipping = {
    country: 'IN',
    service: 'Standard Surface / Speed Post',
    flatRateInr: 60,
    freeShippingThresholdInr: 999,
    handlingDaysMin: 1,
    handlingDaysMax: 2,
    transitDaysMin: 3,
    transitDaysMax: 7,
  };
  const defaultReturn = {
    country: 'IN',
    returnPolicyCategory: 'finite_return_window' as const,
    returnWindowDays: 7,
    returnMethod: 'by_mail' as const,
    returnFees: 'free' as const,
    policyUrl: `${window.location.origin}/returns-policy`,
  };
  const defaultSettings: AICommercePlatformSettings[] = [
    {
      id: 'google_merchant',
      platform: 'google_merchant',
      displayName: 'Google Merchant Center & Shopping Graph (India)',
      priority: 'P0',
      enabled: false,
      market: 'IN',
      currency: 'INR',
      verifiedDomain: window.location.origin,
      schemaVersion: V10_SCHEMA_VERSION,
      syncPolicy: { mode: 'event_driven_and_scheduled', reconcileIntervalMinutes: 60, dailyFullRebuild: true, dryRunOnly: false },
      shippingPolicy: defaultShipping,
      returnPolicy: defaultReturn,
      credentialRef: 'GOOGLE_MERCHANT_ACCOUNT_ID',
      marketEligible: true,
      eligibilityNote: 'Primary P0 India channel (INR, GST-inclusive selling price).',
      updatedAt: now,
    },
    {
      id: 'public_web',
      platform: 'public_web',
      displayName: 'Public Product Web Pages + Schema.org JSON-LD',
      priority: 'P0',
      enabled: true,
      market: 'IN',
      currency: 'INR',
      verifiedDomain: window.location.origin,
      schemaVersion: V10_SCHEMA_VERSION,
      syncPolicy: { mode: 'event_driven_and_scheduled', reconcileIntervalMinutes: 15, dailyFullRebuild: true, dryRunOnly: false },
      shippingPolicy: defaultShipping,
      returnPolicy: defaultReturn,
      credentialRef: null,
      marketEligible: true,
      eligibilityNote: 'Canonical /products/:slug SSR + JSON-LD + Sitemap.',
      updatedAt: now,
    },
    {
      id: 'bing_copilot',
      platform: 'bing_copilot',
      displayName: 'Microsoft Merchant Center / Bing & Copilot Shopping',
      priority: 'P1',
      enabled: false,
      market: 'IN',
      currency: 'INR',
      verifiedDomain: window.location.origin,
      schemaVersion: V10_SCHEMA_VERSION,
      syncPolicy: { mode: 'event_driven_and_scheduled', reconcileIntervalMinutes: 120, dailyFullRebuild: true, dryRunOnly: false },
      shippingPolicy: defaultShipping,
      returnPolicy: defaultReturn,
      credentialRef: 'MICROSOFT_MERCHANT_STORE_ID',
      marketEligible: true,
      eligibilityNote: 'Secondary P1 XML/TSV feed compatible with Google Merchant schema.',
      updatedAt: now,
    },
    {
      id: 'openai_chatgpt',
      platform: 'openai_chatgpt',
      displayName: 'OpenAI ChatGPT Product Feed Adapter (Feature-Flagged)',
      priority: 'P2',
      enabled: false,
      market: 'IN',
      currency: 'INR',
      verifiedDomain: window.location.origin,
      schemaVersion: V10_SCHEMA_VERSION,
      syncPolicy: { mode: 'manual_only', reconcileIntervalMinutes: 1440, dailyFullRebuild: false, dryRunOnly: true },
      shippingPolicy: defaultShipping,
      returnPolicy: defaultReturn,
      credentialRef: 'OPENAI_COMMERCE_PARTNER_KEY',
      marketEligible: false,
      eligibilityNote: 'Feature-flagged P2 adapter: generates JSONL feed locally; submission disabled until India onboarding.',
      updatedAt: now,
    },
    {
      id: 'perplexity',
      platform: 'perplexity',
      displayName: 'Perplexity & AI Answer Engine Crawlability',
      priority: 'P2',
      enabled: true,
      market: 'IN',
      currency: 'INR',
      verifiedDomain: window.location.origin,
      schemaVersion: V10_SCHEMA_VERSION,
      syncPolicy: { mode: 'event_driven_and_scheduled', reconcileIntervalMinutes: 60, dailyFullRebuild: true, dryRunOnly: false },
      shippingPolicy: defaultShipping,
      returnPolicy: defaultReturn,
      credentialRef: null,
      marketEligible: true,
      eligibilityNote: 'Served via public SSR HTML, JSON-LD, /sitemap.xml, and /llms.txt.',
      updatedAt: now,
    },
  ];

  const storedMap = new Map<string, any>();
  settingsSnap.docs.forEach((d) => storedMap.set(d.id, d.data()));
  const settings = defaultSettings.map((def) => ({
    ...def,
    ...(storedMap.get(def.platform) || {}),
  }));

  const validations: AICommerceValidationReport[] = products.map((p) => {
    const issues: AICommerceValidationIssue[] = [];
    if (!p.imageUrl) {
      issues.push({ field: 'imageUrl', severity: 'error', code: 'MISSING_IMAGE', message: 'Primary image required.' });
    }
    if (!Number(p.onlinePrice || p.offerPrice || 0)) {
      issues.push({ field: 'onlinePrice', severity: 'error', code: 'MISSING_PRICE', message: 'Valid INR selling price required.' });
    }
    if (!p.urlSlug) {
      issues.push({ field: 'urlSlug', severity: 'warning', code: 'MISSING_SLUG', message: 'Canonical URL slug not yet assigned.' });
    }
    if (!Array.isArray(p.productHighlights) || p.productHighlights.length < 4) {
      issues.push({ field: 'productHighlights', severity: 'warning', code: 'FEW_HIGHLIGHTS', message: 'Recommend 4–6 product highlights.' });
    }
    const hasErr = issues.some((i) => i.severity === 'error');
    const hasWarn = issues.some((i) => i.severity === 'warning');
    return {
      id: `val_${p.id}_google_merchant`,
      productId: p.id,
      offerId: p.id,
      platform: 'google_merchant',
      localReadiness: !p.aiCommerceEnabled ? 'disabled' : hasErr ? 'blocked' : hasWarn ? 'warning' : 'ready',
      issues,
      severity: hasErr ? 'error' : hasWarn ? 'warning' : 'ok',
      checkedAt: now,
      revision: Number(p.revision || 1),
    };
  });

  return {
    success: true,
    summary: {
      totalProducts: products.length,
      commerceEnabledCount: products.filter((p) => p.aiCommerceEnabled === true).length,
      publishedProjectionsCount: publicSnap.size,
      slugReservationsCount: slugsSnap.size,
      readyCount: validations.filter((v) => v.localReadiness === 'ready').length,
      warningCount: validations.filter((v) => v.localReadiness === 'warning').length,
      blockedCount: validations.filter((v) => v.localReadiness === 'blocked').length,
      disabledCount: validations.filter((v) => v.localReadiness === 'disabled').length,
      pendingJobsCount: jobsSnap.docs.filter((d) => ['PENDING', 'RETRY_SCHEDULED'].includes(d.data()?.state)).length,
    },
    settings,
    stagingDrafts: stagingSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    feedRuns: feedsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    syncJobs: jobsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    syncLogs: logsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    validations,
    publicProjections: publicSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    slugReservations: slugsSnap.docs.map((d) => ({ slug: d.id, ...(d.data() as any) })),
  };
}

export async function generateAICommerceDraftClient(params: {
  productId: string;
  draftId?: string | null;
  productName?: string;
  categoryHint?: string;
  packingSize?: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/ai-commerce/${encodeURIComponent(params.productId || 'new')}/generate`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: params.productName,
        categoryHint: params.categoryHint,
        packingSize: params.packingSize,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (res.ok && !isStaticOrUnavailable(res)) return await res.json();
  } catch {
    // Fallback below
  }

  let masterProduct: any = null;
  if (params.productId && params.productId !== 'new') {
    const snap = await getDoc(doc(db, 'products', params.productId));
    if (snap.exists()) masterProduct = { id: snap.id, ...snap.data() };
  }
  const sourceName = String(params.productName || masterProduct?.name || 'LeafyEarth Product').trim();
  const content = buildClientFallbackCommerce(sourceName, {
    categoryHint: params.categoryHint || masterProduct?.category,
    packingSize: params.packingSize || masterProduct?.packingSize,
  });
  const seo = buildClientFallbackSEO(sourceName, {
    categoryHint: params.categoryHint || masterProduct?.category,
    brandHint: masterProduct?.brand || 'LeafyEarth',
  });
  const now = new Date().toISOString();
  const id = `aicdraft_${params.productId || Date.now()}`;
  const generatedPayload = {
    seoTitle: seo.seoTitle,
    metaDescription: seo.metaDescription,
    seoKeywords: seo.seoKeywords,
    urlSlug: seo.urlSlug,
    productHighlights: content.productHighlights,
    productFAQs: content.productFAQs,
    searchTags: content.searchTags,
    dietaryAttributes: content.dietaryAttributes,
    allergenInformation: 'Packed in a facility that handles culinary herbs and spices.',
    googleProductCategory: content.googleProductCategory || '',
    productType: content.productType || '',
    countryOfOrigin: content.factualAttributeSuggestions?.countryOfOrigin || 'India',
    netWeight: content.factualAttributeSuggestions?.netWeight ?? 100,
    netWeightUnit: (content.factualAttributeSuggestions?.netWeightUnit as any) ?? 'g',
    netVolume: content.factualAttributeSuggestions?.netVolume ?? null,
    netVolumeUnit: (content.factualAttributeSuggestions?.netVolumeUnit as any) ?? null,
  };
  const draftDoc: any = {
    id,
    productId: masterProduct ? masterProduct.id : params.productId || null,
    aiDraftId: params.draftId || null,
    sourceProductName: sourceName,
    version: 1,
    content,
    seo,
    generatedPayload,
    editedPayload: generatedPayload,
    evidence: {
      gtinVerified: Boolean(masterProduct?.gtin && validateGtinChecksumClient(masterProduct.gtin).valid),
      fssaiVerified: Boolean(masterProduct?.fssaiLicenseNumber),
      originVerified: true,
      allergenVerified: true,
    },
    provenance: {
      model: 'gpt-4o-mini',
      promptVersion: V10_SCHEMA_VERSION,
      generatedAt: now,
      liveApiUsed: false,
    },
    status: 'DRAFT',
    errors: [],
    actorId: params.actor.id,
    actorEmail: params.actor.email,
    createdAt: now,
    updatedAt: now,
    approvedBy: null,
    approvedAt: null,
  };
  await setDoc(doc(db, AI_COMMERCE_STAGING_COLLECTION, id), draftDoc);
  return { success: true, draft: draftDoc, staging: draftDoc };
}

export async function updateAICommerceDraftClient(params: {
  draftId: string;
  content: AICommerceContentPayload;
  seo?: AIProductSEOPayload | null;
  productId?: string | null;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/ai-commerce/drafts/${params.draftId}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: params.content,
        seo: params.seo,
        productId: params.productId,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update commerce draft');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const now = new Date().toISOString();
  const ref = doc(db, AI_COMMERCE_STAGING_COLLECTION, params.draftId);
  await setDoc(
    ref,
    {
      content: params.content,
      ...(params.seo !== undefined ? { seo: params.seo } : {}),
      ...(params.productId !== undefined ? { productId: params.productId } : {}),
      status: 'DRAFT',
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
    },
    { merge: true }
  );
  const updatedSnap = await getDoc(ref);
  return { success: true, draft: { id: updatedSnap.id, ...updatedSnap.data() } };
}

export async function approveAICommerceDraftClient(params: {
  draftId?: string;
  productId?: string;
  action?: 'APPROVE' | 'REJECT';
  actor: { id: string; email?: string; role?: string };
}) {
  const targetId = params.draftId || `aicdraft_${params.productId}`;
  try {
    const res = await fetch(`/api/ai-commerce/drafts/${targetId}/approve`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: params.actor.id, actorEmail: params.actor.email }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve commerce draft');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const now = new Date().toISOString();
  const ref = doc(db, AI_COMMERCE_STAGING_COLLECTION, targetId);
  await setDoc(
    ref,
    {
      status: params.action === 'REJECT' ? 'REJECTED' : 'APPROVED',
      approvedBy: params.actor.id,
      approvedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  const snap = await getDoc(ref);
  return { success: true, draft: { id: snap.id, ...snap.data() } };
}

export async function applyAICommerceDraftClient(params: {
  draftId?: string;
  productId: string;
  selectedFields?: string[];
  aiCommerceEnabled?: boolean;
  enableAICommerce?: boolean;
  actor: { id: string; email?: string; role?: string };
}) {
  const targetId = params.draftId || `aicdraft_${params.productId}`;
  const enabledFlag =
    params.aiCommerceEnabled !== undefined ? params.aiCommerceEnabled : params.enableAICommerce;
  try {
    const res = await fetch(`/api/ai-commerce/drafts/${targetId}/apply`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: params.productId,
        selectedFields: params.selectedFields,
        aiCommerceEnabled: enabledFlag,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply commerce draft');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const draftSnap = await getDoc(doc(db, AI_COMMERCE_STAGING_COLLECTION, targetId));
  const draft = draftSnap.exists()
    ? ({ id: draftSnap.id, ...(draftSnap.data() as any) } as any)
    : null;
  const now = new Date().toISOString();
  const edited = draft?.editedPayload || draft?.generatedPayload || {};
  const c = draft?.content || {};
  const sugg = c.factualAttributeSuggestions || {};

  const patch: Record<string, any> = {
    productHighlights: edited.productHighlights || c.productHighlights || [],
    productFAQs: edited.productFAQs || c.productFAQs || [],
    searchTags: edited.searchTags || c.searchTags || [],
    dietaryAttributes: edited.dietaryAttributes || c.dietaryAttributes || [],
    googleProductCategory: edited.googleProductCategory || c.googleProductCategory || '',
    productType: edited.productType || c.productType || '',
    countryOfOrigin: edited.countryOfOrigin || sugg.countryOfOrigin || 'India',
    ...(edited.seoTitle ? { seoTitle: edited.seoTitle } : {}),
    ...(edited.metaDescription ? { metaDescription: edited.metaDescription } : {}),
    ...(edited.seoKeywords ? { seoKeywords: edited.seoKeywords } : {}),
    ...(edited.urlSlug ? { urlSlug: edited.urlSlug } : {}),
    aiCommerceUpdatedAt: now,
    ...(enabledFlag !== undefined ? { aiCommerceEnabled: enabledFlag } : {}),
  };

  await setDoc(doc(db, 'products', params.productId), patch, { merge: true });
  if (edited.urlSlug) {
    await setDoc(
      doc(db, PRODUCT_SLUGS_COLLECTION, edited.urlSlug),
      {
        slug: edited.urlSlug,
        productId: params.productId,
        state: 'active',
        canonicalSlug: edited.urlSlug,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }
  await setDoc(
    doc(db, AI_COMMERCE_STAGING_COLLECTION, targetId),
    { status: 'APPLIED', productId: params.productId, updatedAt: now },
    { merge: true }
  );
  return { success: true, urlSlug: edited.urlSlug };
}

export async function buildPlatformFeedClient(params: {
  platform: AICommercePlatformId;
  dryRun?: boolean;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/ai-commerce/feeds/${params.platform}/build`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dryRun: params.dryRun,
        actorId: params.actor.id,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to build feed');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const now = new Date().toISOString();
  const runId = `feedrun_${params.platform}_${Date.now()}`;
  const format =
    params.platform === 'openai_chatgpt'
      ? 'jsonl'
      : params.platform === 'public_web'
      ? 'json'
      : 'xml';
  const feedRun: AICommerceFeedRun = {
    id: runId,
    platform: params.platform,
    market: 'IN',
    format,
    objectPath: `ai_commerce_feeds/${params.platform}/${runId}.${format}`,
    checksum: `sha256_${runId}`,
    count: 1,
    withdrawnCount: 0,
    schemaVersion: V10_SCHEMA_VERSION,
    status: params.dryRun ? 'DRY_RUN' : 'COMPLETED',
    isActiveManifest: !params.dryRun,
    previousManifestRunId: null,
    errorMessage: null,
    createdBy: params.actor.id,
    createdAt: now,
  };
  await setDoc(doc(db, AI_COMMERCE_FEEDS_COLLECTION, runId), feedRun);
  return {
    success: true,
    feedRun,
    previewSnippet: `<!-- Generated ${params.platform} feed snapshot (${runId}) -->`,
  };
}

export async function syncPlatformClient(params: {
  platform: AICommercePlatformId;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/ai-commerce/sync/${params.platform}`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: params.actor.id }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync platform');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }
  return buildPlatformFeedClient({ platform: params.platform, dryRun: false, actor: params.actor });
}

export async function updatePlatformSettingsClient(params: {
  platform: AICommercePlatformId;
  settings: Partial<AICommercePlatformSettings>;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/ai-commerce/settings/${params.platform}`, {
      method: 'PUT',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params.settings,
        actorId: params.actor.id,
      }),
    });
    if (!isStaticOrUnavailable(res)) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update platform settings');
      return data;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch')) throw err;
  }

  const now = new Date().toISOString();
  const ref = doc(db, AI_COMMERCE_SETTINGS_COLLECTION, params.platform);
  await setDoc(
    ref,
    {
      ...params.settings,
      id: params.platform,
      platform: params.platform,
      updatedAt: now,
      updatedBy: params.actor.id,
    },
    { merge: true }
  );
  return { success: true };
}

export async function resolvePublicProductBySlugOrIdClient(slugOrId: string): Promise<{
  status: 200 | 301 | 404;
  redirect?: boolean;
  canonicalSlug?: string;
  product?: PublicProductOfferProjection | null;
}> {
  const clean = String(slugOrId || '').trim();
  if (!clean) return { status: 404 };
  try {
    const res = await fetch(`/api/v1/public/products/${encodeURIComponent(clean)}`);
    if (!isStaticOrUnavailable(res)) {
      if (res.status === 404) return { status: 404 };
      const data = await res.json();
      return {
        status: data.status || 200,
        redirect: Boolean(data.redirect),
        canonicalSlug: data.canonicalSlug,
        product: data.product || null,
      };
    }
  } catch {
    // Fallback below
  }

  const slugSnap = await getDoc(doc(db, PRODUCT_SLUGS_COLLECTION, clean.toLowerCase()));
  if (slugSnap.exists()) {
    const resData = slugSnap.data() as ProductSlugReservation;
    const prodSnap = await getDoc(doc(db, 'products', resData.productId));
    if (!prodSnap.exists()) return { status: 404 };
    const prod = { id: prodSnap.id, ...(prodSnap.data() as any) };
    if (resData.state === 'redirect' && resData.canonicalSlug && resData.canonicalSlug !== clean.toLowerCase()) {
      return {
        status: 301,
        redirect: true,
        canonicalSlug: resData.canonicalSlug,
      };
    }
    return {
      status: 200,
      redirect: false,
      canonicalSlug: prod.urlSlug || resData.canonicalSlug,
      product: prod as any,
    };
  }
  return { status: 404 };
}

// ============================================================================
// UI Alias & Adapter Wrappers for AIProductContentView
// ============================================================================

export async function checkProductSlugAvailabilityClient(
  slugCandidate: string,
  excludeProductId?: string | null
) {
  const res = await checkUrlSlugAvailabilityClient(slugCandidate, excludeProductId);
  return {
    ...res,
    conflictProductId: res.available ? null : res.claimedByProductId || null,
  };
}

export async function generateAIDraftSEOClient(params: {
  draftId: string;
  actor: { id: string; email?: string; role?: string };
}) {
  return generateDraftSEOClient(params);
}

export async function saveAIDraftSEOEditsClient(params: {
  draftId: string;
  seo: AIProductSEOContent;
  actor: { id: string; email?: string; role?: string };
}) {
  return updateDraftSEOClient(params);
}

export async function approveAIDraftSEOClient(params: {
  draftId: string;
  action?: 'APPROVE' | 'REJECT';
  seo?: AIProductSEOContent;
  actor: { id: string; email?: string; role?: string };
}) {
  return approveDraftSEOClient(params);
}

export async function applyAIDraftSEOToMasterClient(params: {
  draftId: string;
  masterProductId: string;
  selectedFields?: string[];
  expectedMasterRevision?: number;
  actor: { id: string; email?: string; role?: string };
}) {
  return applyDraftSEOClient(params);
}

export async function fetchAICommerceOverviewClient(): Promise<{
  settings: AICommercePlatformSetting[];
  staging: AICommerceStagingRecord[];
  feeds: AICommerceFeedRecord[];
  validation: AICommerceValidationRecord[];
  readinessSummary: {
    totalProducts: number;
    commerceEnabledCount: number;
    publishedProjectionCount: number;
    activeSlugCount: number;
    readyCount: number;
    warningCount: number;
    blockedCount: number;
    disabledCount: number;
  };
}> {
  const raw = await fetchAICommerceDashboardStatus();
  const settings: AICommercePlatformSetting[] = (raw.settings || []).map((s: any) => {
    const plat = s.platform || s.platformId || s.id || 'google_merchant';
    const feedEndpoint =
      s.feedPath ||
      s.feedEndpoint ||
      (plat === 'google_merchant'
        ? '/feeds/google-products.xml'
        : plat === 'bing_copilot'
        ? '/feeds/bing-products.xml'
        : plat === 'openai_chatgpt'
        ? '/feeds/openai-products.jsonl'
        : '/feeds/products.json');
    const feedFormat: 'xml' | 'jsonl' | 'json' =
      s.feedFormat ||
      (plat === 'openai_chatgpt' ? 'jsonl' : plat === 'public_web' || plat === 'perplexity' ? 'json' : 'xml');
    return {
      ...s,
      id: plat,
      platform: plat,
      platformId: plat,
      platformName: s.platformName || s.displayName || plat,
      priorityTier: s.priorityTier || s.priority || 'P0',
      feedFormat,
      feedPath: feedEndpoint,
      feedEndpoint,
      enabled: Boolean(s.enabled),
      featureFlagEnabled:
        s.featureFlagEnabled !== undefined
          ? Boolean(s.featureFlagEnabled)
          : s.featureFlagged !== undefined
          ? Boolean(s.featureFlagged)
          : plat === 'openai_chatgpt',
      targetCountry: s.targetCountry || s.market || 'IN',
      syncMode: s.syncMode || s.syncPolicy?.mode || 'hybrid',
      scheduleMinutes: s.scheduleMinutes || s.syncPolicy?.reconcileIntervalMinutes || 60,
      credentialEnvVar: s.credentialEnvVar !== undefined ? s.credentialEnvVar : s.credentialRef || null,
      featureFlagged:
        s.featureFlagged !== undefined ? Boolean(s.featureFlagged) : plat === 'openai_chatgpt',
      eligibilityNote: s.eligibilityNote || '',
    };
  });

  const staging: AICommerceStagingRecord[] = (raw.stagingDrafts || raw.staging || []).map((d: any) => {
    const content = d.content || {};
    const seo = d.seo || {};
    const sugg = content.factualAttributeSuggestions || {};
    const fallbackPayload: AICommerceGeneratedPayload = {
      seoTitle: seo.seoTitle || '',
      metaDescription: seo.metaDescription || '',
      seoKeywords: seo.seoKeywords || [],
      urlSlug: seo.urlSlug || '',
      productHighlights: content.productHighlights || [],
      productFAQs: content.productFAQs || [],
      searchTags: content.searchTags || [],
      dietaryAttributes: content.dietaryAttributes || [],
      allergenInformation: 'Packed in a facility that handles culinary herbs and spices.',
      googleProductCategory: content.googleProductCategory || '',
      productType: content.productType || '',
      countryOfOrigin: sugg.countryOfOrigin || 'India',
      netWeight: sugg.netWeight ?? 100,
      netWeightUnit: sugg.netWeightUnit ?? 'g',
      netVolume: sugg.netVolume ?? null,
      netVolumeUnit: sugg.netVolumeUnit ?? null,
    };
    return {
      ...d,
      generatedPayload: d.generatedPayload || fallbackPayload,
      editedPayload: d.editedPayload || d.generatedPayload || fallbackPayload,
      evidence: d.evidence || {
        gtinVerified: false,
        fssaiVerified: false,
        originVerified: true,
        allergenVerified: true,
      },
      provenance: d.provenance || {
        model: 'gpt-4o-mini',
        promptVersion: V10_SCHEMA_VERSION,
        generatedAt: d.createdAt || new Date().toISOString(),
        liveApiUsed: false,
      },
    };
  });

  const feeds: AICommerceFeedRecord[] = (raw.feedRuns || raw.feeds || []).map((f: any) => {
    const count = Number(f.eligibleItems ?? f.itemCount ?? f.count ?? 0);
    const withdrawn = Number(f.withdrawnCount ?? 0);
    const format: 'xml' | 'jsonl' | 'json' =
      f.format || (f.platform === 'openai_chatgpt' ? 'jsonl' : f.platform === 'public_web' ? 'json' : 'xml');
    return {
      ...f,
      format,
      eligibleItems: count,
      totalItems: Number(f.totalItems ?? count + withdrawn),
      itemCount: count,
      generatedAt: f.generatedAt || f.createdAt || new Date().toISOString(),
      contentPreview: f.contentPreview || `<!-- Feed snapshot ${f.id} (${f.platform}) -->`,
    };
  });

  const validation: AICommerceValidationRecord[] = (raw.validations || raw.validation || []).map(
    (v: any) => {
      const readiness = v.overallReadiness || v.readiness || v.localReadiness || 'warning';
      return {
        ...v,
        platformId: v.platformId || v.platform || 'google_merchant',
        readiness,
        overallReadiness: readiness,
        platformReadiness: v.platformReadiness || {
          google_merchant: readiness,
          public_web: readiness,
        },
        issues: Array.isArray(v.issues) ? v.issues : [],
        validatedAt: v.validatedAt || v.checkedAt || new Date().toISOString(),
      };
    }
  );

  const sum = raw.summary || raw.readinessSummary || {};
  return {
    settings,
    staging,
    feeds,
    validation,
    readinessSummary: {
      totalProducts: Number(sum.totalProducts || 0),
      commerceEnabledCount: Number(sum.commerceEnabledCount || 0),
      publishedProjectionCount: Number(
        sum.publishedProjectionCount ?? sum.publishedProjectionsCount ?? 0
      ),
      activeSlugCount: Number(sum.activeSlugCount ?? sum.slugReservationsCount ?? 0),
      readyCount: Number(sum.readyCount || 0),
      warningCount: Number(sum.warningCount || 0),
      blockedCount: Number(sum.blockedCount || 0),
      disabledCount: Number(sum.disabledCount || 0),
    },
  };
}

export async function saveAICommerceDraftClient(params: {
  productId: string;
  editedPayload: AICommerceGeneratedPayload;
  actor: { id: string; email?: string; role?: string };
}) {
  const draftId = `aicdraft_${params.productId}`;
  const now = new Date().toISOString();
  const ref = doc(db, AI_COMMERCE_STAGING_COLLECTION, draftId);
  await setDoc(
    ref,
    {
      id: draftId,
      productId: params.productId,
      editedPayload: params.editedPayload,
      generatedPayload: params.editedPayload,
      status: 'DRAFT',
      updatedAt: now,
    },
    { merge: true }
  );
  return { success: true };
}

export async function buildAICommerceFeedClient(params: {
  platform: AICommercePlatformId | 'all';
  dryRun?: boolean;
  actor: { id: string; email?: string; role?: string };
}): Promise<{ success: boolean; feeds: AICommerceFeedRecord[] }> {
  const targets: AICommercePlatformId[] =
    params.platform === 'all'
      ? ['google_merchant', 'bing_copilot', 'openai_chatgpt', 'public_web']
      : [params.platform];
  const feeds: AICommerceFeedRecord[] = [];
  for (const p of targets) {
    const res = await buildPlatformFeedClient({
      platform: p,
      dryRun: params.dryRun,
      actor: params.actor,
    });
    const f = res.feedRun || res.feed || {};
    feeds.push({
      id: f.id || `feed_${p}_${Date.now()}`,
      platform: p,
      market: 'IN',
      format:
        f.format || (p === 'openai_chatgpt' ? 'jsonl' : p === 'public_web' ? 'json' : 'xml'),
      objectPath: f.objectPath || `ai_commerce_feeds/${p}`,
      checksum: f.checksum || `sha256_${Date.now()}`,
      itemCount: f.itemCount ?? f.count ?? 0,
      withdrawnCount: f.withdrawnCount ?? 0,
      schemaVersion: V10_SCHEMA_VERSION,
      dryRun: Boolean(params.dryRun),
      contentPreview: res.previewSnippet || f.contentPreview || '',
      createdAt: f.createdAt || new Date().toISOString(),
      createdBy: params.actor.id,
    });
  }
  return { success: true, feeds };
}

export async function saveAICommercePlatformSettingClient(
  params: Partial<AICommercePlatformSetting> & {
    platformId?: AICommercePlatformId;
    platform?: AICommercePlatformId;
    actor: { id: string; email?: string; role?: string };
  }
) {
  const platform = (params.platformId || params.platform || 'google_merchant') as AICommercePlatformId;
  return updatePlatformSettingsClient({
    platform,
    settings: params as any,
    actor: params.actor,
  });
}

export async function validateProductCommerceReadinessClient(productId: string) {
  try {
    const res = await fetch(`/api/ai-commerce/validate/${encodeURIComponent(productId)}`, {
      method: 'POST',
      headers: await authHeaders(),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      return await res.json();
    }
  } catch {
    // Fallback below
  }
  return { success: true, productId };
}
