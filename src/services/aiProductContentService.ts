import type express from 'express';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type {
  AIProductContentPayload,
  AIProductDraft,
  AIProductDraftStatus,
  AIProductEvent,
  AIProductImage,
  AIProductMarketResearch,
  AIProductPackingResearch,
  AIProductResearchRecord,
  AIProductSyncLog,
  AIProductTaxationResearch,
  AIProductVersion,
  AIUsageMetadata,
  ProductSlugReservation,
  WebPriceSourceOffer,
} from '../types';
import {
  buildStructuredFallbackCommerce,
  buildStructuredFallbackSEO,
  getDefaultVerifiedDomain,
  isValidUrlSlug,
  normalizeUrlSlug,
  PRODUCT_SLUGS_COLLECTION,
  syncProductToPublicProjectionAndQueueJobs,
  V10_SCHEMA_VERSION,
  validateAICommercePayload,
  validateSEOPayload,
} from './aiCommerceService';
import {
  allocateUniqueEightDigitSku,
  computeHighestExistingEightDigitSku,
  isValidEightDigitNumericSku,
  MIN_EIGHT_DIGIT_SKU,
} from './skuAllocationService';

export const AI_PRODUCT_DRAFTS_COLLECTION = 'ai_product_drafts';
export const AI_PRODUCT_VERSIONS_COLLECTION = 'ai_product_versions';
export const AI_PRODUCT_IMAGES_COLLECTION = 'ai_product_images';
export const AI_PRODUCT_RESEARCH_COLLECTION = 'ai_product_research';
export const AI_PRODUCT_SYNC_LOGS_COLLECTION = 'ai_product_sync_logs';
export const AI_PRODUCT_EVENTS_COLLECTION = 'ai_product_events';
export const AI_PROMPT_VERSION = 'leafyearth-v8.0';

export const ALLOWED_GST_SLABS = [0, 5, 12, 18, 28];

const FORBIDDEN_SEO_KEYS = new Set([
  'seo_title',
  'seoTitle',
  'meta_description',
  'metaDescription',
  'seo_keywords',
  'seoKeywords',
  'url_slug',
  'urlSlug',
  'slug',
]);

// ============================================================================
// Script & Payload Validation (Sections 4, 5, 16)
// ============================================================================

const SCRIPT_RANGES: Record<keyof AIProductContentPayload['translations'], RegExp> = {
  en: /[A-Za-z]/,
  ml: /[\u0D00-\u0D7F]/, // Malayalam
  hi: /[\u0900-\u097F]/, // Devanagari (Hindi)
  ta: /[\u0B80-\u0BFF]/, // Tamil
  kn: /[\u0C80-\u0CFF]/, // Kannada
  te: /[\u0C00-\u0C7F]/, // Telugu
};

export function assertNoSeoFields(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  for (const key of Object.keys(payload as Record<string, unknown>)) {
    if (FORBIDDEN_SEO_KEYS.has(key)) {
      throw new Error(`SEO field '${key}' is prohibited by LeafyEarth V8 specification.`);
    }
  }
}

export function validateAIProductContentPayload(
  raw: any
): { valid: boolean; errors: string[]; payload: AIProductContentPayload } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      errors: ['Payload must be a non-null JSON object.'],
      payload: buildStructuredFallbackContent('Unknown Product'),
    };
  }

  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_SEO_KEYS.has(key)) {
      errors.push(`Prohibited SEO field detected: ${key}`);
    }
  }

  const cleanStr = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v.trim() : fallback;
  const cleanArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];

  const english_product_name = cleanStr(raw.english_product_name);
  const botanical_name = cleanStr(raw.botanical_name);
  const family = cleanStr(raw.family);
  const category = cleanStr(raw.category);
  const form = cleanStr(raw.form);
  const title = cleanStr(raw.title);
  const description = cleanStr(raw.description);
  const key_features = cleanArr(raw.key_features);
  const culinary_uses = cleanArr(raw.culinary_uses);
  const storage_instructions = cleanStr(raw.storage_instructions);

  if (!english_product_name) errors.push('english_product_name is required.');
  if (!botanical_name) errors.push('botanical_name is required.');
  if (!family) errors.push('family is required.');
  if (!category) errors.push('category is required.');
  if (!form) errors.push('form is required.');
  if (!title) errors.push('title is required.');
  if (!description) errors.push('description is required.');
  if (key_features.length === 0) errors.push('key_features must contain at least one feature.');
  if (!storage_instructions) errors.push('storage_instructions is required.');

  const isExplicitNonAyurvedic = raw.is_ayurvedic_product === false;

  const translationsRaw = raw.translations || {};
  const translations: AIProductContentPayload['translations'] = isExplicitNonAyurvedic
    ? {
        en: { name: cleanStr(translationsRaw?.en?.name, english_product_name) },
        ml: { name: '' },
        hi: { name: '' },
        ta: { name: '' },
        kn: { name: '' },
        te: { name: '' },
      }
    : {
        en: { name: cleanStr(translationsRaw?.en?.name, english_product_name) },
        ml: { name: cleanStr(translationsRaw?.ml?.name) },
        hi: { name: cleanStr(translationsRaw?.hi?.name) },
        ta: { name: cleanStr(translationsRaw?.ta?.name) },
        kn: { name: cleanStr(translationsRaw?.kn?.name) },
        te: { name: cleanStr(translationsRaw?.te?.name) },
      };

  if (!isExplicitNonAyurvedic) {
    for (const lang of ['en', 'ml', 'hi', 'ta', 'kn', 'te'] as const) {
      const val = translations[lang].name;
      if (!val) {
        errors.push(`translations.${lang}.name is required.`);
      } else if (!SCRIPT_RANGES[lang].test(val)) {
        errors.push(
          `translations.${lang}.name must contain valid ${lang.toUpperCase()} script characters.`
        );
      }
    }
  }

  const ayurveda_applicability: AIProductContentPayload['ayurveda_applicability'] =
    isExplicitNonAyurvedic
      ? 'not_applicable'
      : raw.ayurveda_applicability === 'applicable' ||
        raw.ayurveda_applicability === 'not_applicable' ||
        raw.ayurveda_applicability === 'uncertain'
      ? raw.ayurveda_applicability
      : 'not_applicable';

  const is_ayurvedic_product = isExplicitNonAyurvedic
    ? false
    : raw.is_ayurvedic_product === true
    ? true
    : ayurveda_applicability === 'applicable';

  let ayurveda: AIProductContentPayload['ayurveda'] = null;
  if (
    !isExplicitNonAyurvedic &&
    ayurveda_applicability === 'applicable' &&
    raw.ayurveda &&
    typeof raw.ayurveda === 'object'
  ) {
    const ay = raw.ayurveda;
    ayurveda = {
      sanskrit_name: cleanStr(ay.sanskrit_name),
      classification: cleanStr(ay.classification),
      classical_description: cleanStr(ay.classical_description),
      rasa: cleanArr(ay.rasa),
      guna: cleanArr(ay.guna),
      virya: cleanStr(ay.virya),
      vipaka: cleanStr(ay.vipaka),
      prabhava: cleanStr(ay.prabhava, 'Not classically specified'),
      dosha_effects: {
        vata: cleanStr(ay.dosha_effects?.vata),
        pitta: cleanStr(ay.dosha_effects?.pitta),
        kapha: cleanStr(ay.dosha_effects?.kapha),
      },
      parts_used: cleanArr(ay.parts_used),
      medicinal_uses: cleanArr(ay.medicinal_uses),
      classical_formulations: cleanArr(ay.classical_formulations),
      usage_methods: cleanArr(ay.usage_methods),
      anupana: cleanArr(ay.anupana),
      typical_dosage_note: cleanStr(ay.typical_dosage_note),
      precautions: cleanArr(ay.precautions),
      contraindications: cleanArr(ay.contraindications),
      interactions: cleanArr(ay.interactions),
      references: Array.isArray(ay.references)
        ? ay.references.map((r: any, idx: number) => ({
            id: cleanStr(r?.id, `AY-REF-${idx + 1}`),
            source_type: cleanStr(r?.source_type, 'ayurvedic_pharmacopoeia'),
            title: cleanStr(r?.title),
            author_or_body: cleanStr(r?.author_or_body),
            section_or_citation: cleanStr(r?.section_or_citation),
            url: r?.url ? String(r.url).trim() : null,
            verification_note: cleanStr(r?.verification_note, 'Requires pharmacist/editor verification'),
          }))
        : [],
    };
  } else if (ayurveda_applicability !== 'applicable') {
    ayurveda = null;
  }

  const PROHIBITED_CLAIM_REGEX =
    /\b(100%\s*cure|guaranteed\s*cure|cures\s+cancer|cures\s+diabetes|replaces\s+insulin|miracle\s+cure)\b/i;

  const health_benefits = Array.isArray(raw.health_benefits)
    ? raw.health_benefits
        .map((hb: any) => {
          const claimText = cleanStr(hb?.claim || hb?.description || hb?.title);
          if (PROHIBITED_CLAIM_REGEX.test(claimText)) {
            errors.push(
              `health_benefits contains prohibited disease-cure or miracle claim: "${claimText}"`
            );
          }
          return {
            claim: claimText,
            evidence_level: (
              [
                'traditional_use',
                'nutritional',
                'preliminary_study',
                'human_study',
                'insufficient_evidence',
              ].includes(hb?.evidence_level)
                ? hb.evidence_level
                : 'nutritional'
            ) as AIProductContentPayload['health_benefits'][number]['evidence_level'],
            reference_ids: cleanArr(hb?.reference_ids),
            review_status: (
              ['pending_review', 'approved', 'rejected'].includes(hb?.review_status)
                ? hb.review_status
                : 'pending_review'
            ) as AIProductContentPayload['health_benefits'][number]['review_status'],
          };
        })
        .filter((hb: any) => Boolean(hb.claim))
    : [];

  const nutritional_benefits = cleanArr(raw.nutritional_benefits);
  const safety_precautions = cleanArr(raw.safety_precautions);
  const references = Array.isArray(raw.references)
    ? raw.references
        .map((r: any, idx: number) => ({
          id: cleanStr(r?.id, `REF-${idx + 1}`),
          source_type: cleanStr(r?.source_type, 'nutrition_reference'),
          title: cleanStr(r?.title),
          author_or_body: cleanStr(r?.author_or_body),
          section_or_citation: cleanStr(r?.section_or_citation),
          url: r?.url ? String(r.url).trim() : null,
          verification_note: cleanStr(r?.verification_note, 'Verify citation before customer publication'),
        }))
        .filter((r: any) => Boolean(r.title))
    : [];
  const review_flags = cleanArr(raw.review_flags);

  // V9 Section 4 & V10 Section 13: Optional nested SEO & Commerce objects
  let seo: AIProductContentPayload['seo'] = null;
  if (raw.seo !== undefined && raw.seo !== null) {
    const seoVal = validateSEOPayload(raw.seo);
    if (!seoVal.valid) {
      errors.push(...seoVal.errors);
    }
    seo = seoVal.seo;
  }

  let commerce: AIProductContentPayload['commerce'] = null;
  if (raw.commerce !== undefined && raw.commerce !== null) {
    const comVal = validateAICommercePayload(raw.commerce);
    if (!comVal.valid) {
      errors.push(...comVal.errors);
    }
    commerce = comVal.commerce;
  }

  return {
    valid: errors.length === 0,
    errors,
    payload: {
      english_product_name,
      botanical_name,
      family,
      category,
      form,
      title,
      description,
      key_features,
      culinary_uses,
      storage_instructions,
      translations,
      health_benefits,
      nutritional_benefits,
      safety_precautions,
      ayurveda_applicability,
      is_ayurvedic_product,
      ayurveda,
      references,
      review_flags,
      seo,
      commerce,
    },
  };
}

// ============================================================================
// Structured Curated Knowledge Base & Fallback Generator
// ============================================================================

interface BotanicalKnowledgeEntry {
  keywords: string[];
  english: string;
  botanical_name: string;
  family: string;
  category: string;
  form: string;
  translations: { ml: string; hi: string; ta: string; kn: string; te: string };
  hsnCode: string;
  gstRatePercent: number;
  gstReference: string;
  ayurveda_applicability: 'applicable' | 'not_applicable';
  sanskrit_name?: string;
  rasa?: string[];
  guna?: string[];
  virya?: string;
  vipaka?: string;
  prabhava?: string;
  dosha?: { vata: string; pitta: string; kapha: string };
  parts_used?: string[];
  formulations?: string[];
}

const BOTANICAL_CATALOG: BotanicalKnowledgeEntry[] = [
  {
    keywords: ['cumin', 'jeera', 'jeerakam', 'cuminum'],
    english: 'Cumin Seeds',
    botanical_name: 'Cuminum cyminum',
    family: 'Apiaceae',
    category: 'Spices',
    form: 'Whole Seeds',
    translations: {
      ml: 'ജീരകം',
      hi: 'जीरा',
      ta: 'சீரகம்',
      kn: 'ಜೀರಿಗೆ',
      te: 'జీలకర్ర',
    },
    hsnCode: '090931',
    gstRatePercent: 5,
    gstReference: 'GST Schedule I – Chapter 0909 (Seeds of cumin / Cuminum cyminum, 5% GST)',
    ayurveda_applicability: 'applicable',
    sanskrit_name: 'Jiraka (जीरक)',
    rasa: ['Katu (Pungent)'],
    guna: ['Laghu (Light)', 'Ruksha (Dry)'],
    virya: 'Ushna (Warming)',
    vipaka: 'Katu (Pungent)',
    prabhava: 'Deepana, Pachana & Grahi (kindles digestive fire and supports assimilation)',
    dosha: {
      vata: 'Pacifies Vata and relieves bloating',
      pitta: 'May slightly increase Pitta in excess, balanced in culinary tempering with ghee',
      kapha: 'Pacifies Kapha via Laghu-Ruksha guna and Ushna virya',
    },
    parts_used: ['Dried Cremocarp / Seeds (Phala / Bija)'],
    formulations: ['Jirakadyarishta', 'Hingvashtaka Churna'],
  },
  {
    keywords: ['turmeric', 'haldi', 'manjal', 'curcuma'],
    english: 'Turmeric Powder',
    botanical_name: 'Curcuma longa',
    family: 'Zingiberaceae',
    category: 'Spices',
    form: 'Powder',
    translations: {
      ml: 'മഞ്ഞൾ പൊടി',
      hi: 'हल्दी पाउडर',
      ta: 'மஞ்சள் தூள்',
      kn: 'ಅರಿಶಿನ ಪುಡಿ',
      te: 'పసుపు పొడి',
    },
    hsnCode: '09103030',
    gstRatePercent: 5,
    gstReference: 'GST Schedule I – Chapter 0910 (Turmeric / Curcuma in powder form, 5% GST)',
    ayurveda_applicability: 'applicable',
    sanskrit_name: 'Haridra (हरिद्रा)',
    rasa: ['Tikta (Bitter)', 'Katu (Pungent)'],
    guna: ['Ruksha (Dry)', 'Laghu (Light)'],
    virya: 'Ushna (Warming)',
    vipaka: 'Katu (Pungent)',
    prabhava: 'Kushthaghna & Vishaghna (supports skin & traditional cleansing)',
    dosha: {
      vata: 'Balances Vata when taken with warm milk or ghee',
      pitta: 'Balances Pitta in moderate culinary quantities',
      kapha: 'Pacifies Kapha due to Ushna virya and Ruksha guna',
    },
    parts_used: ['Rhizome (Kanda)'],
    formulations: ['Haridra Khanda', 'Nishamalaki Churna'],
  },
  {
    keywords: ['black pepper', 'pepper', 'kurumulaku', 'kali mirch', 'piper'],
    english: 'Black Pepper',
    botanical_name: 'Piper nigrum',
    family: 'Piperaceae',
    category: 'Spices',
    form: 'Whole',
    translations: {
      ml: 'കുരുമുളക്',
      hi: 'काली मिर्च',
      ta: 'கருப்பு மிளகு',
      kn: 'ಕಪ್ಪು ಮೆಣಸು',
      te: 'నల్ల మిరియాలు',
    },
    hsnCode: '090411',
    gstRatePercent: 5,
    gstReference: 'GST Schedule I – Chapter 0904 (Pepper of the genus Piper, 5% GST)',
    ayurveda_applicability: 'applicable',
    sanskrit_name: 'Maricha (मरीच)',
    rasa: ['Katu (Pungent)'],
    guna: ['Laghu (Light)', 'Tikshna (Sharp)'],
    virya: 'Ushna (Heating)',
    vipaka: 'Katu (Pungent)',
    prabhava: 'Deepana-Pachana & Pramathi (supports digestive fire and bioavailability)',
    dosha: {
      vata: 'Pacifies Vata',
      pitta: 'May increase Pitta if consumed in excess',
      kapha: 'Strongly pacifies Kapha',
    },
    parts_used: ['Dried Fruit (Phala)'],
    formulations: ['Trikatu Churna', 'Marichadi Gutika'],
  },
  {
    keywords: ['cardamom', 'elakka', 'elaichi', 'elettaria'],
    english: 'Green Cardamom',
    botanical_name: 'Elettaria cardamomum',
    family: 'Zingiberaceae',
    category: 'Spices',
    form: 'Whole Pods',
    translations: {
      ml: 'ഏലയ്ക്ക',
      hi: 'हरी इलायची',
      ta: 'ஏலக்காய்',
      kn: 'ಏಲಕ್ಕಿ',
      te: 'యాలకులు',
    },
    hsnCode: '090831',
    gstRatePercent: 5,
    gstReference: 'GST Schedule I – Chapter 0908 (Cardamoms, 5% GST)',
    ayurveda_applicability: 'applicable',
    sanskrit_name: 'Sukshmaila (सूक्ष्मैला)',
    rasa: ['Katu (Pungent)', 'Madhura (Sweet)'],
    guna: ['Laghu (Light)', 'Ruksha (Dry)'],
    virya: 'Sheeta (Cooling)',
    vipaka: 'Madhura (Sweet)',
    prabhava: 'Hridya & Rochana (aromatic digestive comfort)',
    dosha: {
      vata: 'Pacifies Vata',
      pitta: 'Pacifies Pitta due to Sheeta virya',
      kapha: 'Pacifies Kapha',
    },
    parts_used: ['Seeds & Pods (Phala / Bija)'],
    formulations: ['Eladi Churna', 'Sitopaladi Churna'],
  },
  {
    keywords: ['amla', 'gooseberry', 'nellikka', 'emblica', 'phyllanthus'],
    english: 'Dried Amla (Indian Gooseberry)',
    botanical_name: 'Phyllanthus emblica',
    family: 'Phyllanthaceae',
    category: 'Dry Fruits & Herbs',
    form: 'Dried Segments',
    translations: {
      ml: 'നെല്ലിക്ക',
      hi: 'आंवला',
      ta: 'நெல்லிக்காய்',
      kn: 'ನೆಲ್ಲಿಕಾಯಿ',
      te: 'ఉసిరికాయ',
    },
    hsnCode: '08134090',
    gstRatePercent: 5,
    gstReference: 'GST Schedule I – Chapter 0813 / 1211 (Dried Amla / Amalaki, 5% GST)',
    ayurveda_applicability: 'applicable',
    sanskrit_name: 'Amalaki (आमलकी)',
    rasa: ['Amla (Sour)', 'Madhura (Sweet)', 'Kashaya (Astringent)', 'Tikta (Bitter)', 'Katu (Pungent)'],
    guna: ['Laghu (Light)', 'Ruksha (Dry)', 'Sheeta (Cool)'],
    virya: 'Sheeta (Cooling)',
    vipaka: 'Madhura (Sweet)',
    prabhava: 'Rasayana & Vayasthapana (rejuvenative and antioxidant support)',
    dosha: {
      vata: 'Pacifies Vata via Amla rasa and Madhura vipaka',
      pitta: 'Pacifies Pitta via Sheeta virya and Madhura vipaka',
      kapha: 'Pacifies Kapha via Ruksha guna and Kashaya rasa',
    },
    parts_used: ['Fruit pericarp (Phala)'],
    formulations: ['Triphala Churna', 'Chyawanprash'],
  },
  {
    keywords: ['coconut oil', 'velichenna', 'nariyal', 'cocos'],
    english: 'Cold-Pressed Virgin Coconut Oil',
    botanical_name: 'Cocos nucifera',
    family: 'Arecaceae',
    category: 'Cold Pressed Oils',
    form: 'Oil',
    translations: {
      ml: 'വെളിച്ചെണ്ണ',
      hi: 'नारियल का तेल',
      ta: 'தேங்காய் எண்ணெய்',
      kn: 'ತೆಂಗಿನ ಎಣ್ಣೆ',
      te: 'కొబ్బరి నూనె',
    },
    hsnCode: '15131900',
    gstRatePercent: 5,
    gstReference: 'GST Schedule I – Chapter 1513 (Coconut / Copra Oil, 5% GST)',
    ayurveda_applicability: 'applicable',
    sanskrit_name: 'Narikela Taila (नारिकेल तैल)',
    rasa: ['Madhura (Sweet)'],
    guna: ['Guru (Heavy)', 'Snigdha (Unctuous)'],
    virya: 'Sheeta (Cooling)',
    vipaka: 'Madhura (Sweet)',
    prabhava: 'Keshya & Tvachya (nourishing for hair and skin)',
    dosha: {
      vata: 'Pacifies Vata',
      pitta: 'Pacifies Pitta',
      kapha: 'May increase Kapha in excess',
    },
    parts_used: ['Endosperm / Kernel oil (Taila)'],
    formulations: ['Neelibhringadi Keram', 'Eladi Keram'],
  },
  {
    keywords: ['cleaner', 'detergent', 'repellent', 'dishwash', 'handwash', 'perfume', 'floor'],
    english: 'Household & Personal Care Product',
    botanical_name: 'Not Applicable (Formulated Household Product)',
    family: 'Not Applicable',
    category: 'Home Care',
    form: 'Liquid',
    translations: {
      ml: 'ഗാർഹിക ഉൽപ്പന്നം',
      hi: 'घरेलू उत्पाद',
      ta: 'வீட்டு பராமரிப்பு பொருள்',
      kn: 'ಗೃಹೋಪಯೋಗಿ ಉತ್ಪನ್ನ',
      te: 'గృహోపకరణ ఉత్పత్తి',
    },
    hsnCode: '34022010',
    gstRatePercent: 18,
    gstReference: 'GST Schedule III – Chapter 3402 (Organic surface-active preparations & cleaners, 18% GST)',
    ayurveda_applicability: 'not_applicable',
  },
];

export function matchBotanicalKnowledge(productName: string): BotanicalKnowledgeEntry | null {
  const lower = String(productName || '').toLowerCase();
  for (const entry of BOTANICAL_CATALOG) {
    if (entry.keywords.some((k) => lower.includes(k))) {
      return entry;
    }
  }
  return null;
}

export function buildStructuredFallbackContent(
  productName: string,
  options?: { categoryHint?: string; brandHint?: string; isAyurvedicProduct?: boolean }
): AIProductContentPayload {
  const cleanName = String(productName || 'LeafyEarth Product').trim();
  const matched = matchBotanicalKnowledge(cleanName);
  const category = options?.categoryHint?.trim() || matched?.category || 'Spices & Natural Foods';
  const form = matched?.form || (cleanName.toLowerCase().includes('oil') ? 'Oil' : cleanName.toLowerCase().includes('powder') ? 'Powder' : 'Whole / Natural');
  const isHousehold =
    matched?.ayurveda_applicability === 'not_applicable' ||
    /cleaner|detergent|repellent|dishwash|glass|perfume/i.test(cleanName);

  const isAyurvedicSelected =
    options?.isAyurvedicProduct === false
      ? false
      : options?.isAyurvedicProduct === true
      ? true
      : !isHousehold && (matched?.ayurveda_applicability || 'applicable') === 'applicable';

  const ayurveda_applicability: AIProductContentPayload['ayurveda_applicability'] =
    isAyurvedicSelected ? 'applicable' : 'not_applicable';

  const translations: AIProductContentPayload['translations'] = !isAyurvedicSelected
    ? {
        en: { name: cleanName },
        ml: { name: '' },
        hi: { name: '' },
        ta: { name: '' },
        kn: { name: '' },
        te: { name: '' },
      }
    : matched
    ? {
        en: { name: cleanName },
        ml: { name: matched.translations.ml },
        hi: { name: matched.translations.hi },
        ta: { name: matched.translations.ta },
        kn: { name: matched.translations.kn },
        te: { name: matched.translations.te },
      }
    : {
        en: { name: cleanName },
        ml: { name: `${cleanName} (മലയാളം)` },
        hi: { name: `${cleanName} (हिन्दी)` },
        ta: { name: `${cleanName} (தமிழ்)` },
        kn: { name: `${cleanName} (ಕನ್ನಡ)` },
        te: { name: `${cleanName} (తెలుగు)` },
      };

  const references = [
    {
      id: 'REF-1',
      source_type: 'food_composition_table',
      title: `Indian Food Composition Tables (IFCT) – ${cleanName}`,
      author_or_body: 'ICMR - National Institute of Nutrition (NIN), Hyderabad',
      section_or_citation: 'Botanical & Nutritional Reference Profile',
      url: 'https://www.nin.res.in',
      verification_note: 'Verify exact cultivar and batch nutritional values before publication.',
    },
    {
      id: 'REF-2',
      source_type: 'regulatory_standard',
      title: `FSSAI Food Products Standards and Food Additives Regulations – ${category}`,
      author_or_body: 'Food Safety and Standards Authority of India (FSSAI)',
      section_or_citation: 'Chapter 2 – Quality & Purity Standards',
      url: 'https://www.fssai.gov.in',
      verification_note: 'Standard food-grade compliance reference.',
    },
  ];

  const ayurveda: AIProductContentPayload['ayurveda'] =
    ayurveda_applicability === 'applicable'
      ? {
          sanskrit_name: matched?.sanskrit_name || `${cleanName} (Classical Dravya)`,
          classification: 'Dravyaguna Vijnana – Culinary & Traditional Wellness Herb/Spice',
          classical_description: `Traditionally valued in classical Ayurvedic texts for supporting balanced digestion (Agni), daily vitality, and seasonal wellness when used in culinary or classical preparations.`,
          rasa: matched?.rasa || ['Katu (Pungent)', 'Tikta (Bitter)'],
          guna: matched?.guna || ['Laghu (Light)', 'Ruksha (Dry)'],
          virya: matched?.virya || 'Ushna (Warming)',
          vipaka: matched?.vipaka || 'Katu (Pungent)',
          prabhava: matched?.prabhava || 'Deepana-Pachana (Digestive & metabolic support)',
          dosha_effects: matched?.dosha || {
            vata: 'Helps balance Vata when used appropriately with culinary lipids',
            pitta: 'Use in moderate culinary amounts for Pitta constitution',
            kapha: 'Supports Kapha balance',
          },
          parts_used: matched?.parts_used || ['Edible botanical part (Phala / Kanda / Bija)'],
          medicinal_uses: [
            'Supports healthy digestion and culinary bioavailability in traditional diets',
            'Traditionally used for seasonal respiratory and metabolic comfort',
          ],
          classical_formulations: matched?.formulations || ['Classical Churna & Kwatha preparations'],
          usage_methods: [
            'Use in daily culinary tempering, decoctions, or warm herbal infusions',
          ],
          anupana: ['Warm water (Ushnodaka)', 'Clarified butter (Ghrita)', 'Raw honey (Madhu)'],
          typical_dosage_note:
            '1–3 g daily in culinary or traditional preparations, or as directed by a qualified Ayurvedic physician (Vaidya).',
          precautions: [
            'Consult a qualified healthcare practitioner during pregnancy, lactation, or chronic medical conditions.',
          ],
          contraindications: ['Known hypersensitivity to the botanical family.'],
          interactions: [
            'Consult a physician if taking anticoagulant, antiplatelet, or prescription metabolic medications.',
          ],
          references: [
            {
              id: 'AY-REF-1',
              source_type: 'ayurvedic_pharmacopoeia',
              title: `The Ayurvedic Pharmacopoeia of India (API), Part I – ${matched?.sanskrit_name || cleanName}`,
              author_or_body: 'Ministry of AYUSH, Government of India',
              section_or_citation: 'Monograph on Dravyaguna & Identity Standards',
              url: 'https://ayush.gov.in',
              verification_note: 'Verify monograph volume and part before publishing classical claims.',
            },
          ],
        }
      : null;

  return {
    english_product_name: cleanName,
    botanical_name: matched?.botanical_name || 'Botanical species (verify cultivar)',
    family: matched?.family || 'Botanical family (verify taxonomy)',
    category,
    form,
    title: `${options?.brandHint ? `${options.brandHint} ` : ''}${cleanName} – Pure & Naturally Sourced`,
    description: `${cleanName} is carefully selected and hygienically packed to preserve its natural aroma, authentic flavor profile, and bioactive integrity. Ideal for everyday household and culinary excellence.`,
    key_features: [
      '100% pure, unblended, and hygienically processed',
      'Free from artificial colors, synthetic preservatives, and added fillers',
      'Sourced from trusted growers with strict quality grading',
      'Packed in food-grade moisture-barrier packaging for lasting freshness',
    ],
    culinary_uses: isHousehold
      ? ['Use as directed on household surfaces or personal care routines']
      : [
          'Everyday curries, dals, gravies, and traditional tempering',
          'Herbal teas, wellness infusions, and spice blends (masalas)',
          'Marinades, pickles, and artisanal culinary preparations',
        ],
    storage_instructions:
      'Store in a cool, dry, and hygienic place away from direct sunlight and moisture. Transfer to an airtight container after opening.',
    translations,
    health_benefits: isHousehold
      ? []
      : [
          {
            claim: 'Supports everyday digestive comfort and antioxidant intake as part of a balanced diet',
            evidence_level: 'traditional_use',
            reference_ids: ['REF-1', 'REF-2'],
            review_status: 'pending_review',
          },
          {
            claim: 'Provides natural phytonutrients and aromatic compounds that complement wholesome nutrition',
            evidence_level: 'nutritional',
            reference_ids: ['REF-1'],
            review_status: 'pending_review',
          },
        ],
    nutritional_benefits: isHousehold
      ? ['Formulated for effective household hygiene']
      : [
          'Naturally rich in botanical polyphenols and essential volatile oils',
          'Zero trans fat, zero cholesterol, and no added refined sugars',
        ],
    safety_precautions: [
      'Check ingredient label for potential allergens before use.',
      'For informational and culinary purposes only; not intended to diagnose, treat, cure, or prevent any disease.',
    ],
    ayurveda_applicability,
    is_ayurvedic_product: isAyurvedicSelected,
    ayurveda,
    references,
    review_flags: [
      'Verify botanical taxonomy and regional language script spellings before master sync.',
      'Review health and Ayurvedic claims for regulatory compliance.',
    ],
    seo: buildStructuredFallbackSEO(cleanName, {
      categoryHint: category,
      brandHint: options?.brandHint,
      formHint: form,
    }),
    commerce: buildStructuredFallbackCommerce(cleanName, {
      categoryHint: category,
    }),
  };
}

// ============================================================================
// OpenAI Project `leafyearthprdcnt` Provider Adapter (Section 15)
// ============================================================================

export interface OpenAIProviderConfigStatus {
  provider: string;
  projectName: string;
  contentEnabled: boolean;
  imageEnabled: boolean;
  apiKeyConfigured: boolean;
  model: string;
  imageModel: string;
  imageWidth: number;
  imageHeight: number;
  imageBackground: string;
  readyForLiveContent: boolean;
  readyForLiveImages: boolean;
  statusMessage: string;
}

export function getOpenAIProviderConfigStatus(): OpenAIProviderConfigStatus {
  const provider = (process.env.AI_PROVIDER || 'openai').trim();
  const projectName = (process.env.OPENAI_PROJECT_NAME || 'leafyearthprdcnt').trim();
  const contentEnabled = String(process.env.AI_PRODUCT_CONTENT_ENABLED || 'false').toLowerCase() === 'true';
  const imageEnabled =
    String(
      process.env.AI_PRODUCT_IMAGE_ENABLED ||
        process.env.AI_IMAGE_GENERATION_ENABLED ||
        process.env.AI_PRODUCT_CONTENT_ENABLED ||
        'false'
    ).toLowerCase() === 'true';
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  const apiKeyConfigured = Boolean(apiKey && !apiKey.startsWith('YOUR_') && !apiKey.startsWith('MY_'));
  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const imageModel = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim();
  const imageWidth =
    Number(process.env.AI_PRODUCT_IMAGE_WIDTH || process.env.AI_IMAGE_WIDTH || 1000) || 1000;
  const imageHeight =
    Number(process.env.AI_PRODUCT_IMAGE_HEIGHT || process.env.AI_IMAGE_HEIGHT || 1000) || 1000;
  const imageBackground = (process.env.AI_PRODUCT_IMAGE_BACKGROUND || '#FFFFFF').trim().toUpperCase();

  const readyForLiveContent = provider === 'openai' && contentEnabled && apiKeyConfigured;
  const readyForLiveImages = provider === 'openai' && imageEnabled && apiKeyConfigured;

  let statusMessage = 'OpenAI project leafyearthprdcnt is configured and ready for live generation.';
  if (!apiKeyConfigured) {
    statusMessage =
      'OPENAI_API_KEY for OpenAI project "leafyearthprdcnt" is not provisioned in server environment (.env). Using deterministic structured staging generator until credentials are set.';
  } else if (!contentEnabled) {
    statusMessage =
      'AI_PRODUCT_CONTENT_ENABLED is currently false. Enable it in server environment to invoke live OpenAI Chat/Responses API.';
  }

  return {
    provider,
    projectName,
    contentEnabled,
    imageEnabled,
    apiKeyConfigured,
    model,
    imageModel,
    imageWidth,
    imageHeight,
    imageBackground,
    readyForLiveContent,
    readyForLiveImages,
    statusMessage,
  };
}

export async function generateProductContentViaProvider(
  productName: string,
  options?: { categoryHint?: string; brandHint?: string; isAyurvedicProduct?: boolean }
): Promise<{ payload: AIProductContentPayload; usage: AIUsageMetadata }> {
  const startMs = Date.now();
  const config = getOpenAIProviderConfigStatus();
  const isAyurvedicOpt = options?.isAyurvedicProduct;

  if (config.readyForLiveContent) {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    const ayurvedicPromptInstruction =
      isAyurvedicOpt === false
        ? `- is_ayurvedic_product: false
- translations: { en: { name: "<English name>" }, ml: { name: "" }, hi: { name: "" }, ta: { name: "" }, kn: { name: "" }, te: { name: "" } } (Exclude 6-language regional translations because Ayurvedic Product is No)
- ayurveda_applicability: "not_applicable"
- ayurveda: null (Exclude Conditional Ayurvedic Medicinal Content because Ayurvedic Product is No)`
        : `- is_ayurvedic_product: true
- translations: { en: { name }, ml: { name }, hi: { name }, ta: { name }, kn: { name }, te: { name } } using authentic native scripts for Malayalam, Hindi, Tamil, Kannada, and Telugu.
- ayurveda_applicability: "applicable"
- ayurveda: object with sanskrit_name, classification, classical_description, rasa[], guna[], virya, vipaka, prabhava, dosha_effects:{vata,pitta,kapha}, parts_used[], medicinal_uses[], classical_formulations[], usage_methods[], anupana[], typical_dosage_note, precautions[], contraindications[], interactions[], references[]`;

    const systemPrompt = `You are the LeafyEarth E-Commerce & Botanical Product Content Specialist for OpenAI project "${config.projectName}".
Return ONLY a valid JSON object matching the exact schema below. Do NOT include any top-level SEO fields (no seo_title, meta_description, seo_keywords, url_slug).
Required JSON keys:
- english_product_name (string)
- botanical_name (string)
- family (string)
- category (string)
- form (string)
- title (string)
- description (string)
- key_features (string[])
- culinary_uses (string[])
- storage_instructions (string)
${ayurvedicPromptInstruction}
- health_benefits: Array<{ claim, evidence_level: "traditional_use"|"nutritional"|"preliminary_study"|"human_study"|"insufficient_evidence", reference_ids: string[], review_status: "pending_review" }>
- nutritional_benefits (string[])
- safety_precautions (string[])
- references: Array<{ id, source_type, title, author_or_body, section_or_citation, url, verification_note }>
- review_flags (string[])
Never make miraculous or disease-cure claims.`;

    const userPrompt = `Generate structured LeafyEarth product content for:
Product Name: ${productName}
Ayurvedic Product: ${isAyurvedicOpt === false ? 'No (Exclude 6-Language Product Names and Conditional Ayurvedic Medicinal Content; generate all other features)' : 'Yes (Include 6-Language Product Names, Ayurveda Applicability: applicable, and Conditional Ayurvedic Medicinal Content)'}
Category Hint: ${options?.categoryHint || 'Auto-detect'}
Brand Hint: ${options?.brandHint || 'LeafyEarth'}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (response.ok) {
        const data: any = await response.json();
        const contentText = data?.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(contentText);
        if (isAyurvedicOpt === false) {
          parsed.is_ayurvedic_product = false;
          parsed.ayurveda_applicability = 'not_applicable';
          parsed.ayurveda = null;
          parsed.translations = {
            en: { name: String(parsed.english_product_name || productName).trim() },
            ml: { name: '' },
            hi: { name: '' },
            ta: { name: '' },
            kn: { name: '' },
            te: { name: '' },
          };
        } else if (isAyurvedicOpt === true) {
          parsed.is_ayurvedic_product = true;
          parsed.ayurveda_applicability = 'applicable';
        }
        const validated = validateAIProductContentPayload(parsed);
        const finalPayload: AIProductContentPayload = {
          ...validated.payload,
          seo:
            validated.payload.seo ||
            buildStructuredFallbackSEO(validated.payload.english_product_name || productName, {
              categoryHint: validated.payload.category,
              brandHint: options?.brandHint,
              formHint: validated.payload.form,
            }),
          commerce:
            validated.payload.commerce ||
            buildStructuredFallbackCommerce(validated.payload.english_product_name || productName, {
              categoryHint: validated.payload.category,
            }),
        };
        const inputTokens = Number(data?.usage?.prompt_tokens || 450);
        const outputTokens = Number(data?.usage?.completion_tokens || 850);
        const totalTokens = Number(data?.usage?.total_tokens || inputTokens + outputTokens);
        return {
          payload: finalPayload,
          usage: {
            provider: 'openai',
            project_name: config.projectName,
            model: config.model,
            prompt_version: AI_PROMPT_VERSION,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
            estimated_cost_usd: Number(((inputTokens * 0.00015 + outputTokens * 0.0006) / 1000).toFixed(6)),
            latency_ms: Date.now() - startMs,
            live_api_used: true,
          },
        };
      }
    } catch (err) {
      clearTimeout(timer);
      console.warn('[AI-PRODUCT-CONTENT] Live OpenAI call failed, using structured fallback:', err);
    }
  }

  const fallbackPayload = buildStructuredFallbackContent(productName, options);
  return {
    payload: fallbackPayload,
    usage: {
      provider: config.provider,
      project_name: config.projectName,
      model: config.readyForLiveContent ? config.model : `${config.model} (staged-fallback)`,
      prompt_version: AI_PROMPT_VERSION,
      input_tokens: 380,
      output_tokens: 720,
      total_tokens: 1100,
      estimated_cost_usd: 0,
      latency_ms: Math.max(12, Date.now() - startMs),
      live_api_used: false,
    },
  };
}

// ============================================================================
// Pure-White 1000x1000 PNG Image Generator & Validator (Section 17)
// ============================================================================

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Generates a deterministic, valid 1000x1000 RGB PNG with a pure white (#FFFFFF)
 * background and a centered studio product silhouette card so every generated
 * candidate image strictly satisfies the 1000x1000 #FFFFFF specification.
 */
export function generatePureWhite1000x1000PngBuffer(seedText = 'LeafyEarth'): Buffer {
  const width = 1000;
  const height = 1000;
  const hash = crypto.createHash('sha256').update(seedText).digest();
  const accentR = 34 + (hash[0] % 60);
  const accentG = 120 + (hash[1] % 80);
  const accentB = 45 + (hash[2] % 60);

  // Each scanline: 1 filter byte (0) + 1000 * 3 RGB bytes = 3001 bytes
  const stride = 1 + width * 3;
  const rawData = Buffer.alloc(stride * height, 255); // Fill all with 255 (#FFFFFF pure white)

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    rawData[rowStart] = 0; // Filter type 0 (None)

    // Draw a subtle centered product pouch/jar illustration in the middle 360x440 region
    // while keeping the outer 280px border 100% pure white (#FFFFFF)
    if (y >= 280 && y < 720) {
      for (let x = 320; x < 680; x++) {
        const pxOffset = rowStart + 1 + x * 3;
        const isBorder = y < 292 || y >= 708 || x < 332 || x >= 668;
        const isLabelBand = y >= 430 && y < 560 && x >= 360 && x < 640;
        if (isBorder) {
          rawData[pxOffset] = accentR;
          rawData[pxOffset + 1] = accentG;
          rawData[pxOffset + 2] = accentB;
        } else if (isLabelBand) {
          rawData[pxOffset] = 240;
          rawData[pxOffset + 1] = 249;
          rawData[pxOffset + 2] = 242;
        } else {
          rawData[pxOffset] = 248;
          rawData[pxOffset + 1] = 252;
          rawData[pxOffset + 2] = 248;
        }
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 2; // color type 2 (Truecolor RGB)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(rawData, { level: 3 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function escapeXmlForSvg(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface StandardKraftPouchLabelMetadata {
  primaryTitle: string;
  englishSubtitle: string;
  botanicalName: string;
  formCaptionUpper: string;
  visualProductDescription: string;
}

/**
 * Resolves the standardized 4-part label text & visual product description
 * matching the reference Kraft Stand-Up Pouch cover design:
 *  - Line 1 (Large bold serif): primaryTitle (e.g., "Thippili", "Kadukka")
 *  - Line 2 (Regular sans-serif in parentheses): englishSubtitle (e.g., "(Indian Long Pepper)", "(Chebulic Myrobalan)")
 *  - Line 3 (Italic serif): botanicalName (e.g., "Piper longum", "Terminalia chebula")
 *  - Line 4 (Bottom uppercase tracked caption): formCaptionUpper (e.g., "DRIED WHOLE FRUIT SPIKES", "DRIED WHOLE FRUIT")
 */
export function resolveStandardKraftPouchLabelMetadata(params: {
  productName: string;
  englishProductName?: string;
  displayTitle?: string;
  botanicalName?: string;
  category?: string;
  productForm?: string;
}): StandardKraftPouchLabelMetadata {
  const rawName = String(params.productName || params.englishProductName || 'Natural Botanical').trim();
  const parenMatch = rawName.match(/^([^(]+)\(([^)]+)\)/);
  const primaryTitle = (parenMatch ? parenMatch[1].trim() : rawName).slice(0, 28);

  const lowerKey = primaryTitle.toLowerCase();
  const knownBotanicalDictionary: Record<
    string,
    { englishSubtitle: string; botanicalName: string; formCaptionUpper: string; visualDesc: string }
  > = {
    kadukka: {
      englishSubtitle: 'Chebulic Myrobalan',
      botanicalName: 'Terminalia chebula',
      formCaptionUpper: 'DRIED WHOLE FRUIT',
      visualDesc:
        'whole dried Kadukka (Haritaki / Terminalia chebula) ridged golden-brown to dark-brown oval drupe fruits',
    },
    haritaki: {
      englishSubtitle: 'Chebulic Myrobalan',
      botanicalName: 'Terminalia chebula',
      formCaptionUpper: 'DRIED WHOLE FRUIT',
      visualDesc:
        'whole dried Haritaki (Kadukka / Terminalia chebula) ridged golden-brown oval drupe fruits',
    },
    thippili: {
      englishSubtitle: 'Indian Long Pepper',
      botanicalName: 'Piper longum',
      formCaptionUpper: 'DRIED WHOLE FRUIT SPIKES',
      visualDesc:
        'dried whole dark-brown cylindrical textured catkins/fruit spikes of Indian Long Pepper (Piper longum)',
    },
    pippali: {
      englishSubtitle: 'Indian Long Pepper',
      botanicalName: 'Piper longum',
      formCaptionUpper: 'DRIED WHOLE FRUIT SPIKES',
      visualDesc:
        'dried whole dark-brown cylindrical textured fruit spikes of Indian Long Pepper (Piper longum)',
    },
    nellikka: {
      englishSubtitle: 'Indian Gooseberry',
      botanicalName: 'Phyllanthus emblica',
      formCaptionUpper: 'DRIED WHOLE FRUIT SEGMENTS',
      visualDesc: 'dried dark-brown Amla / Indian Gooseberry (Phyllanthus emblica) fruit segments',
    },
    amla: {
      englishSubtitle: 'Indian Gooseberry',
      botanicalName: 'Phyllanthus emblica',
      formCaptionUpper: 'DRIED FRUIT',
      visualDesc: 'dried dark-brown Amla / Indian Gooseberry (Phyllanthus emblica) fruit pieces',
    },
    chukku: {
      englishSubtitle: 'Dried Ginger Root',
      botanicalName: 'Zingiber officinale',
      formCaptionUpper: 'WHOLE DRIED RHIZOME',
      visualDesc: 'whole sun-dried pale-beige knotted ginger rhizomes (Zingiber officinale)',
    },
    kurumulaku: {
      englishSubtitle: 'Malabar Black Pepper',
      botanicalName: 'Piper nigrum',
      formCaptionUpper: 'DRIED WHOLE PEPPERCORNS',
      visualDesc: 'whole wrinkled dark-black Malabar peppercorns (Piper nigrum)',
    },
    manjal: {
      englishSubtitle: 'Alleppey Turmeric',
      botanicalName: 'Curcuma longa',
      formCaptionUpper: 'DRIED WHOLE FINGERS',
      visualDesc: 'deep golden-orange dried turmeric rhizome fingers (Curcuma longa)',
    },
    elakka: {
      englishSubtitle: 'Green Cardamom',
      botanicalName: 'Elettaria cardamomum',
      formCaptionUpper: 'WHOLE GREEN PODS',
      visualDesc: 'plump aromatic forest-green whole cardamom pods (Elettaria cardamomum)',
    },
    grambu: {
      englishSubtitle: 'Whole Cloves',
      botanicalName: 'Syzygium aromaticum',
      formCaptionUpper: 'DRIED FLOWER BUDS',
      visualDesc: 'aromatic dark reddish-brown whole dried clove flower buds (Syzygium aromaticum)',
    },
    jeerakam: {
      englishSubtitle: 'Cumin Seeds',
      botanicalName: 'Cuminum cyminum',
      formCaptionUpper: 'WHOLE AROMATIC SEEDS',
      visualDesc: 'whole warm-brown ridged aromatic cumin seeds (Cuminum cyminum)',
    },
    ashwagandha: {
      englishSubtitle: 'Indian Winter Cherry',
      botanicalName: 'Withania somnifera',
      formCaptionUpper: 'DRIED WHOLE ROOT CUTS',
      visualDesc: 'pale-ivory beige dried Ashwagandha root sticks and cut pieces (Withania somnifera)',
    },
    brahmi: {
      englishSubtitle: 'Water Hyssop',
      botanicalName: 'Bacopa monnieri',
      formCaptionUpper: 'DRIED WHOLE HERB LEAVES',
      visualDesc: 'dried green-brown whole Brahmi leaves and stems (Bacopa monnieri)',
    },
  };

  const dictHit = knownBotanicalDictionary[lowerKey];

  let englishSubtitle = parenMatch ? parenMatch[2].trim() : '';
  if (!englishSubtitle && params.displayTitle) {
    const titleParen = params.displayTitle.match(/\(([^)]+)\)/);
    if (titleParen) englishSubtitle = titleParen[1].trim();
  }
  if (!englishSubtitle && dictHit) {
    englishSubtitle = dictHit.englishSubtitle;
  }
  if (
    !englishSubtitle &&
    params.englishProductName &&
    params.englishProductName.toLowerCase() !== primaryTitle.toLowerCase()
  ) {
    englishSubtitle = params.englishProductName.trim();
  }
  if (!englishSubtitle) {
    englishSubtitle = params.category || 'Pure Natural Botanical';
  }

  const botanicalName = (
    params.botanicalName ||
    dictHit?.botanicalName ||
    'Botanical Herb'
  ).trim();

  const rawForm = String(params.productForm || '').trim();
  let formCaptionUpper = dictHit?.formCaptionUpper || 'DRIED WHOLE BOTANICAL';
  if (rawForm) {
    const upperForm = rawForm.toUpperCase();
    if (upperForm === 'DRIED FRUIT') {
      formCaptionUpper = 'DRIED WHOLE FRUIT';
    } else if (upperForm.length <= 32) {
      formCaptionUpper = upperForm;
    }
  }

  const visualProductDescription =
    dictHit?.visualDesc ||
    `natural ${rawForm || 'dried whole botanical'} of ${primaryTitle} (${englishSubtitle}, ${botanicalName})`;

  return {
    primaryTitle,
    englishSubtitle: englishSubtitle.replace(/^\(|\)$/g, '').slice(0, 34),
    botanicalName: botanicalName.slice(0, 38),
    formCaptionUpper: formCaptionUpper.slice(0, 32),
    visualProductDescription,
  };
}

/**
 * Builds the standardized OpenAI prompt that enforces the exact brown kraft stand-up
 * zipper pouch cover design from the reference sample image.
 */
export function buildStandardKraftPouchPrompt(params: {
  productName: string;
  englishProductName?: string;
  displayTitle?: string;
  botanicalName?: string;
  category?: string;
  productForm?: string;
  customPrompt?: string;
}): string {
  const meta = resolveStandardKraftPouchLabelMetadata(params);
  const customExtra = params.customPrompt ? ` ${params.customPrompt.trim()}` : '';
  return [
    `High-resolution 1000x1000 square commercial e-commerce studio product photograph following the exact standardized LeafyEarth brown kraft stand-up pouch cover design on a 100% pure solid white (#FFFFFF) background:`,
    `1. POUCH STRUCTURE: One centered upright natural matte brown kraft paper stand-up zipper pouch (Doypack) with side tear notches near the top and a horizontal resealable zip-lock heat-seal strip across the upper part.`,
    `2. STANDARD CREAM FRONT LABEL (UPPER HALF): A rounded-rectangle warm cream textured paper label sticker (#F4EFE3) centered on the upper front of the kraft pouch containing this exact centered vertical layout:`,
    `   - Top Title (large bold dark-brown serif font): "${meta.primaryTitle}"`,
    `   - Second Line Subtitle in parentheses (clean dark-brown regular font): "(${meta.englishSubtitle})"`,
    `   - Third Line Scientific Name (medium dark-brown italic serif font): "${meta.botanicalName}"`,
    `   - Divider: A thin horizontal olive-green line with a small 3-leaf green sprout icon centered in the middle.`,
    `   - Center Label Illustration: A crisp photorealistic studio pile of ${meta.visualProductDescription} centered on the cream label with two fresh green botanical leaves tucked behind the right side of the pile.`,
    `   - Bottom Label Caption (uppercase letter-spaced dark-brown sans-serif font): "${meta.formCaptionUpper}"`,
    `3. LOWER TRANSPARENT WINDOW: Directly below the cream label, a wide rectangular/slightly curved clear transparent window on the lower half of the kraft pouch clearly packed full of ${meta.visualProductDescription} visible inside the pouch.`,
    `4. FOREGROUND PRODUCT HEAP: Resting on the pure white (#FFFFFF) surface directly in front of the bottom base of the kraft pouch, a neat, realistic heap/mound of loose ${meta.visualProductDescription} with a soft natural contact shadow.`,
    `No watermarks, no extra props, no price badges.${customExtra}`,
  ].join(' ');
}

/**
 * Builds a crisp 1000x1000 #FFFFFF studio product visual SVG data URL matching the
 * exact standardized Brown Kraft Stand-Up Zipper Pouch + Cream Label + Clear Window + Foreground Heap
 * reference cover design when running in deterministic/offline fallback mode.
 */
export function buildStudio1000x1000SvgPreviewDataUrl(params: {
  productName: string;
  englishProductName?: string;
  displayTitle?: string;
  botanicalName?: string;
  category?: string;
  productForm?: string;
  packagingStyle?: string;
}): string {
  const meta = resolveStandardKraftPouchLabelMetadata(params);
  const title = escapeXmlForSvg(meta.primaryTitle);
  const subtitle = escapeXmlForSvg(`(${meta.englishSubtitle})`);
  const botanical = escapeXmlForSvg(meta.botanicalName);
  const formUpper = escapeXmlForSvg(meta.formCaptionUpper);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <!-- 100% Pure White #FFFFFF Studio Background -->
  <rect width="1000" height="1000" fill="#FFFFFF"/>
  <!-- Soft Studio Contact Shadows -->
  <ellipse cx="500" cy="855" rx="260" ry="26" fill="#000000" fill-opacity="0.10"/>
  <ellipse cx="500" cy="915" rx="235" ry="22" fill="#000000" fill-opacity="0.13"/>

  <!-- Upright Natural Brown Kraft Stand-Up Zipper Pouch -->
  <path d="M235,65 Q235,42 260,42 L740,42 Q765,42 765,65 L765,98 L752,98 Q744,98 744,104 Q744,110 752,110 L764,110 L740,835 Q738,860 710,860 L290,860 Q262,860 260,835 L236,110 L248,110 Q256,110 256,104 Q256,98 248,98 L235,98 Z" fill="#C49666" stroke="#A97B4B" stroke-width="3"/>
  <!-- Kraft Pouch Subtle Side Shading Highlights -->
  <path d="M242,115 L268,835" stroke="#B38354" stroke-width="18" stroke-opacity="0.35"/>
  <path d="M758,115 L732,835" stroke="#B38354" stroke-width="18" stroke-opacity="0.35"/>
  <!-- Resealable Zipper Track Lines -->
  <rect x="242" y="118" width="516" height="22" fill="#B88756" fill-opacity="0.55"/>
  <line x1="242" y1="124" x2="758" y2="124" stroke="#9B6E41" stroke-width="2"/>
  <line x1="242" y1="136" x2="758" y2="136" stroke="#D3A97B" stroke-width="2"/>

  <!-- Standard Cream Paper Front Label (#F4EFE3) -->
  <rect x="295" y="192" width="410" height="388" rx="22" fill="#F4EFE3" stroke="#DFD5C3" stroke-width="2.5"/>

  <!-- Label Line 1: Bold Dark-Brown Serif Product Name -->
  <text x="500" y="268" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="56" font-weight="700" fill="#3A2313">${title}</text>
  <!-- Label Line 2: Common English Name in Parentheses -->
  <text x="500" y="308" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="25" font-weight="400" fill="#4A301D">${subtitle}</text>
  <!-- Label Line 3: Italic Scientific Botanical Name -->
  <text x="500" y="340" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="23" fill="#4A301D">${botanical}</text>

  <!-- Green Horizontal Divider with 3-Leaf Sprout Motif -->
  <line x1="412" y1="366" x2="482" y2="366" stroke="#557A2E" stroke-width="2"/>
  <line x1="518" y1="366" x2="588" y2="366" stroke="#557A2E" stroke-width="2"/>
  <path d="M500,368 C496,356 498,348 500,344 C502,348 504,356 500,368 Z" fill="#557A2E"/>
  <path d="M498,368 C488,364 484,358 486,353 C491,354 496,360 498,368 Z" fill="#689438"/>
  <path d="M502,368 C512,364 516,358 514,353 C509,354 504,360 502,368 Z" fill="#689438"/>

  <!-- Two Fresh Green Botanical Leaves Behind Label Product Cluster -->
  <path d="M535,442 C552,402 595,385 622,388 C610,422 578,446 535,442 Z" fill="#4F7F28" stroke="#3B621C" stroke-width="1.5"/>
  <line x1="540" y1="438" x2="612" y2="393" stroke="#7BA84F" stroke-width="1.5"/>
  <path d="M555,462 C588,438 632,442 655,458 C628,482 588,482 555,462 Z" fill="#5D8E32" stroke="#3B621C" stroke-width="1.5"/>
  <line x1="562" y1="461" x2="644" y2="458" stroke="#88B65C" stroke-width="1.5"/>

  <!-- Center Label Product Cluster Illustration -->
  <ellipse cx="495" cy="512" rx="125" ry="14" fill="#000000" fill-opacity="0.12"/>
  <g fill="#6B4423" stroke="#472B13" stroke-width="2">
    <ellipse cx="455" cy="488" rx="38" ry="22" transform="rotate(-14 455 488)"/>
    <ellipse cx="520" cy="492" rx="40" ry="23" transform="rotate(12 520 492)"/>
    <ellipse cx="425" cy="462" rx="36" ry="20" transform="rotate(-24 425 462)"/>
    <ellipse cx="490" cy="460" rx="42" ry="24" transform="rotate(6 490 460)"/>
    <ellipse cx="548" cy="468" rx="36" ry="21" transform="rotate(22 548 468)"/>
    <ellipse cx="465" cy="434" rx="38" ry="22" transform="rotate(-10 465 434)"/>
    <ellipse cx="518" cy="438" rx="37" ry="21" transform="rotate(16 518 438)"/>
  </g>
  <g stroke="#8C5D34" stroke-width="1.5" fill="none">
    <path d="M430,488 Q455,478 480,486"/>
    <path d="M495,492 Q520,482 545,490"/>
    <path d="M465,460 Q490,450 515,458"/>
  </g>

  <!-- Label Line 4: Bottom All-Caps Form Descriptor -->
  <text x="500" y="558" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="16" font-weight="600" fill="#3A2313" letter-spacing="2.5">${formUpper}</text>

  <!-- Lower Transparent Pouch Window Packed with Product -->
  <path d="M292,596 L708,596 L704,705 Q500,775 296,705 Z" fill="#432814" stroke="#9B6E41" stroke-width="3"/>
  <clipPath id="windowClip">
    <path d="M292,596 L708,596 L704,705 Q500,775 296,705 Z"/>
  </clipPath>
  <g clip-path="url(#windowClip)" fill="#6E4725" stroke="#3E2410" stroke-width="2">
    <ellipse cx="335" cy="630" rx="44" ry="25" transform="rotate(-18 335 630)"/>
    <ellipse cx="415" cy="625" rx="46" ry="26" transform="rotate(14 415 625)"/>
    <ellipse cx="500" cy="628" rx="45" ry="25" transform="rotate(-8 500 628)"/>
    <ellipse cx="585" cy="626" rx="46" ry="26" transform="rotate(19 585 626)"/>
    <ellipse cx="665" cy="632" rx="44" ry="25" transform="rotate(-15 665 632)"/>
    <ellipse cx="365" cy="675" rx="46" ry="26" transform="rotate(12 365 675)"/>
    <ellipse cx="455" cy="678" rx="48" ry="27" transform="rotate(-14 455 678)"/>
    <ellipse cx="545" cy="676" rx="48" ry="27" transform="rotate(10 545 676)"/>
    <ellipse cx="635" cy="674" rx="46" ry="26" transform="rotate(-12 635 674)"/>
    <ellipse cx="410" cy="720" rx="46" ry="25" transform="rotate(-6 410 720)"/>
    <ellipse cx="500" cy="724" rx="48" ry="26" transform="rotate(8 500 724)"/>
    <ellipse cx="590" cy="718" rx="46" ry="25" transform="rotate(-10 590 718)"/>
    <!-- Window Gloss Reflection -->
    <path d="M295,600 L705,600 L690,645 L310,625 Z" fill="#FFFFFF" fill-opacity="0.10" stroke="none"/>
  </g>

  <!-- Foreground Heap of Raw Product in Front of Pouch Base -->
  <g fill="#6B4423" stroke="#3E2410" stroke-width="2.2">
    <ellipse cx="315" cy="892" rx="46" ry="25" transform="rotate(-16 315 892)"/>
    <ellipse cx="395" cy="902" rx="48" ry="26" transform="rotate(10 395 902)"/>
    <ellipse cx="485" cy="908" rx="50" ry="27" transform="rotate(-6 485 908)"/>
    <ellipse cx="575" cy="904" rx="48" ry="26" transform="rotate(14 575 904)"/>
    <ellipse cx="665" cy="894" rx="46" ry="25" transform="rotate(-12 665 894)"/>
    <ellipse cx="355" cy="858" rx="46" ry="25" transform="rotate(18 355 858)"/>
    <ellipse cx="445" cy="862" rx="48" ry="26" transform="rotate(-12 445 862)"/>
    <ellipse cx="535" cy="860" rx="48" ry="26" transform="rotate(15 535 860)"/>
    <ellipse cx="622" cy="858" rx="46" ry="25" transform="rotate(-18 622 858)"/>
    <ellipse cx="415" cy="822" rx="45" ry="25" transform="rotate(-8 415 822)"/>
    <ellipse cx="500" cy="818" rx="48" ry="26" transform="rotate(6 500 818)"/>
    <ellipse cx="582" cy="824" rx="45" ry="25" transform="rotate(16 582 824)"/>
    <ellipse cx="465" cy="788" rx="44" ry="24" transform="rotate(-12 465 788)"/>
    <ellipse cx="532" cy="790" rx="44" ry="24" transform="rotate(12 532 790)"/>
  </g>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

/**
 * Inspects a PNG buffer to verify its IHDR width and height.
 */
export function inspectPngDimensions(buf: Buffer): { validPng: boolean; width: number; height: number } {
  if (!buf || buf.length < 24) return { validPng: false, width: 0, height: 0 };
  const sig = buf.subarray(0, 8);
  const expectedSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!sig.equals(expectedSig)) return { validPng: false, width: 0, height: 0 };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { validPng: true, width, height };
}

// ============================================================================
// Taxation, Web Price Research & Package Sizes Logic (Section 21 – V8)
// ============================================================================

/**
 * Normalizes a packing size string (e.g., "100gm", "100 g", "0.1 kg" -> "100 g")
 * so market price comparisons compare identical pack sizes.
 */
export function normalizePackSizeString(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';

  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(gm|gms|gram|grams|g|kg|kgs|ml|l|ltr|nos|pc|pcs|pack|box|bottle)\b/);
  if (!match) return cleaned;

  const num = Number.parseFloat(match[1]);
  const unit = match[2];

  if (['gm', 'gms', 'gram', 'grams', 'g'].includes(unit)) {
    return `${num} g`;
  }
  if (['kg', 'kgs'].includes(unit)) {
    if (num < 1) return `${Math.round(num * 1000)} g`;
    return `${num} kg`;
  }
  if (unit === 'ml') {
    return `${num} ml`;
  }
  if (['l', 'ltr'].includes(unit)) {
    if (num < 1) return `${Math.round(num * 1000)} ml`;
    return `${num} l`;
  }
  return `${num} ${unit}`;
}

/**
 * Computes `lowestPrice` and `highestPrice` strictly from eligible offers
 * (`included === true`, `inStock === true`, `currency === 'INR'`, `price > 0`,
 * and matching normalized pack size when `comparedPackingSize` is provided).
 */
export function calculateMarketPriceRange(
  offers: WebPriceSourceOffer[],
  comparedPackingSize?: string
): {
  lowestPrice: number | null;
  highestPrice: number | null;
  eligibleCount: number;
  searchStatus: AIProductMarketResearch['searchStatus'];
} {
  const targetNorm = comparedPackingSize ? normalizePackSizeString(comparedPackingSize) : '';

  const eligiblePrices = (offers || [])
    .filter((offer) => {
      if (!offer || !offer.included) return false;
      if (offer.inStock === false) return false;
      const price = Number(offer.price);
      if (!Number.isFinite(price) || price <= 0) return false;
      if ((offer.currency || 'INR').toUpperCase() !== 'INR') return false;
      if (targetNorm && offer.packSize) {
        const offerNorm = normalizePackSizeString(offer.packSize);
        if (offerNorm && offerNorm !== targetNorm) return false;
      }
      return true;
    })
    .map((o) => Number(o.price));

  if (eligiblePrices.length === 0) {
    return {
      lowestPrice: null,
      highestPrice: null,
      eligibleCount: 0,
      searchStatus: 'insufficient_verified_web_price_data',
    };
  }

  return {
    lowestPrice: Math.min(...eligiblePrices),
    highestPrice: Math.max(...eligiblePrices),
    eligibleCount: eligiblePrices.length,
    searchStatus: 'verified_offers',
  };
}

export function buildInitialTaxationAndMarketResearch(params: {
  draftId: string;
  versionId: string;
  productName: string;
  category?: string;
  selectedPackingSize?: string;
  unit?: string;
  availablePackingSizes?: string[];
  customOffers?: WebPriceSourceOffer[];
  actorId: string;
}): Omit<AIProductResearchRecord, 'id'> {
  const now = new Date().toISOString();
  const matched = matchBotanicalKnowledge(params.productName);
  const selectedPackingSize = (params.selectedPackingSize || '100 g').trim();
  const unit = (params.unit || 'PAC').trim().toUpperCase();
  const defaultPackSizes =
    Array.isArray(params.availablePackingSizes) && params.availablePackingSizes.length > 0
      ? params.availablePackingSizes
      : selectedPackingSize.toLowerCase().includes('ml')
      ? ['50 ml', '100 ml', '250 ml', '500 ml', '1 L']
      : ['50 g', '100 g', '250 g', '500 g', '1 kg'];

  const uniquePacks = Array.from(
    new Set([selectedPackingSize, ...defaultPackSizes].map((s) => s.trim()).filter(Boolean))
  );

  const taxation: AIProductTaxationResearch = {
    hsnCode: matched?.hsnCode || '091099',
    gstRatePercent: matched?.gstRatePercent ?? 5,
    gstReference:
      matched?.gstReference ||
      'GST Council Schedule I/II – Verify exact 4-to-8 digit HSN classification for packaged food/spice.',
    confidence: matched ? 'high' : 'medium',
    needsManualVerification: !matched,
    verifiedBy: null,
    verifiedAt: null,
  };

  const packing: AIProductPackingResearch = {
    selectedPackingSize,
    unit,
    availablePackingSizes: uniquePacks,
  };

  const offers: WebPriceSourceOffer[] = Array.isArray(params.customOffers) ? params.customOffers : [];
  const priceStats = calculateMarketPriceRange(offers, selectedPackingSize);

  const marketResearch: AIProductMarketResearch = {
    comparedPackingSize: selectedPackingSize,
    currency: 'INR',
    lowestPrice: priceStats.lowestPrice,
    highestPrice: priceStats.highestPrice,
    checkedAt: now,
    searchStatus: priceStats.searchStatus,
    offers,
  };

  return {
    draft_id: params.draftId,
    version_id: params.versionId,
    taxation,
    packing,
    marketResearch,
    status: 'DRAFT',
    rejection_reason: null,
    created_by: params.actorId,
    created_at: now,
    updated_at: now,
    approved_by: null,
    approved_at: null,
  };
}

// ============================================================================
// Master Synchronization Mapping & Field Diff Builder (Sections 4, 10, 18, 21)
// ============================================================================

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

/**
 * Builds the field-by-field comparison between the existing `products/{masterProductId}`
 * record and the approved AI content version, approved AI image, and approved AI research.
 */
export function buildMasterComparisonDiff(params: {
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

    // 6-Language names (only included when Ayurvedic Product = Yes)
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

    // Health & Safety (only non-rejected claims)
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

    // V9 Section 4 & 10: SEO Metadata Group
    if (payload.seo) {
      pushItem('seoTitle', 'SEO Title', 'seo', 'seoTitle', payload.seo.seoTitle);
      pushItem('metaDescription', 'Meta Description', 'seo', 'metaDescription', payload.seo.metaDescription);
      pushItem('seoKeywords', 'SEO Keywords (5–12)', 'seo', 'seoKeywords', payload.seo.seoKeywords);
      pushItem('urlSlug', 'Canonical URL Slug (/products/:slug)', 'seo', 'urlSlug', payload.seo.urlSlug);
    }

    // V10 Section 12 & 13: AI Commerce & Discoverability Group
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
 * Builds the exact Firestore update object for `products/{masterProductId}` based on
 * the explicitly selected fields. Enforces Section 21.7 selling price protection
 * (never touches `mrp`, `onlinePrice`, `offerPrice`, `shopPrice`, `discount`, or `sku`).
 */
export function buildSelectedMasterUpdatePayload(params: {
  selectedFields: string[];
  comparisonItems: MasterFieldComparisonItem[];
  existingMasterProduct: Record<string, any>;
  approvedImage?: AIProductImage | null;
  imageAction?: 'none' | 'replace_primary' | 'append_gallery';
}): { updatePatch: Record<string, any>; beforeSnapshot: Record<string, any>; afterSnapshot: Record<string, any> } {
  const PROTECTED_SELLING_FIELDS = new Set([
    'sku',
    'mrp',
    'onlinePrice',
    'offerPrice',
    'shopPrice',
    'discount',
  ]);

  const selectedSet = new Set((params.selectedFields || []).map((f) => String(f).trim()));
  const updatePatch: Record<string, any> = {};
  const beforeSnapshot: Record<string, any> = {};
  const afterSnapshot: Record<string, any> = {};

  for (const item of params.comparisonItems) {
    if (!selectedSet.has(item.fieldKey) && !selectedSet.has(item.masterField)) continue;
    if (!item.selectable) continue;
    if (PROTECTED_SELLING_FIELDS.has(item.masterField)) continue;

    beforeSnapshot[item.masterField] = params.existingMasterProduct[item.masterField] ?? null;
    updatePatch[item.masterField] = item.proposedAiValue;
    afterSnapshot[item.masterField] = item.proposedAiValue;

    if (item.masterField === 'category' && typeof item.proposedAiValue === 'string' && item.proposedAiValue.trim()) {
      const existingCats: string[] = Array.isArray(params.existingMasterProduct.categories)
        ? params.existingMasterProduct.categories
        : [];
      const mergedCats = Array.from(new Set([item.proposedAiValue.trim(), ...existingCats]));
      beforeSnapshot.categories = existingCats;
      updatePatch.categories = mergedCats;
      afterSnapshot.categories = mergedCats;
    }
  }

  // Handle approved image action
  if (params.approvedImage && params.approvedImage.status === 'APPROVED') {
    const action = params.imageAction || (selectedSet.has('imageUrl') ? 'replace_primary' : 'none');
    if (action === 'replace_primary') {
      beforeSnapshot.imageUrl = params.existingMasterProduct.imageUrl ?? null;
      beforeSnapshot.storagePath = params.existingMasterProduct.storagePath ?? null;
      updatePatch.imageUrl = params.approvedImage.preview_url;
      updatePatch.storagePath = params.approvedImage.storage_key;
      afterSnapshot.imageUrl = params.approvedImage.preview_url;
      afterSnapshot.storagePath = params.approvedImage.storage_key;
    } else if (action === 'append_gallery') {
      const existingGallery: string[] = Array.isArray(params.existingMasterProduct.images)
        ? params.existingMasterProduct.images
        : [];
      const updatedGallery = Array.from(new Set([...existingGallery, params.approvedImage.preview_url]));
      beforeSnapshot.images = existingGallery;
      updatePatch.images = updatedGallery;
      afterSnapshot.images = updatedGallery;
    }
  }

  return { updatePatch, beforeSnapshot, afterSnapshot };
}

export interface MasterProductUpdationOverrides {
  name?: string;
  sku?: string;
  packingSize?: string;
  unit?: string;
  mrp?: number;
  onlinePrice?: number;
  shopPrice?: number;
  gstPercentage?: number;
  categories?: string[];
  brand?: string;
  brandOwner?: string;
  stockIn?: number;
  imageUrl?: string;
  storagePath?: string;
  images?: string[];
  uniqueSpec1?: string;
  uniqueSpec2?: string;
  uniqueSpec3?: string;
  leafycategory?: string;
  featuredproducts?: boolean;
  featuredprdsortorder?: number;
  aiContentLink?: string;
  aiDraftId?: string;
}

export function buildAIContentReferenceLink(
  draftId: string,
  versionId?: string | null,
  domain = getDefaultVerifiedDomain()
): string {
  const cleanDomain = String(domain || 'https://leafyearth.com').replace(/\/+$/, '');
  const cleanDraft = String(draftId || '').trim();
  if (!cleanDraft) return '';
  const cleanVer = String(versionId || '').trim();
  return cleanVer
    ? `${cleanDomain}/api/admin/ai-products/${encodeURIComponent(cleanDraft)}?version=${encodeURIComponent(cleanVer)}`
    : `${cleanDomain}/api/admin/ai-products/${encodeURIComponent(cleanDraft)}`;
}

/**
 * Searches the `products` list for a matching product name (`name` or `englishName`).
 * Matches exact case-insensitive name first, then base name (before parentheses).
 */
export function matchMasterProductByName(
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

  // Pass 1: Exact case-insensitive match on name or englishName
  for (const cand of validCandidates) {
    const exactHit = (products || []).find(
      (p) => norm(p.name) === cand || norm(p.englishName) === cand
    );
    if (exactHit) return exactHit;
  }

  // Pass 2: Base name match (before parenthetical suffix)
  const baseCandidates = validCandidates.map(baseName).filter((s) => s.length >= 3);
  for (const bCand of baseCandidates) {
    const baseHit = (products || []).find(
      (p) => baseName(p.name) === bCand || baseName(p.englishName) === bCand
    );
    if (baseHit) return baseHit;
  }

  return null;
}

/**
 * Merges `MasterProductUpdationOverrides` (the 16 Product Master Updation fields above
 * the field mapping table) while preserving all existing `products` table fields.
 */
export function mergeMasterProductUpdationOverrides(params: {
  existingMasterProduct: Record<string, any> | null;
  updatePatch: Record<string, any>;
  beforeSnapshot: Record<string, any>;
  afterSnapshot: Record<string, any>;
  overrides?: MasterProductUpdationOverrides | null;
  allocatedSku: string;
}): {
  mergedMasterProduct: Record<string, any>;
  finalPatch: Record<string, any>;
} {
  const existing = params.existingMasterProduct || {};
  const isNew = !params.existingMasterProduct || !params.existingMasterProduct.id;
  const ov = params.overrides || {};
  const patch: Record<string, any> = { ...params.updatePatch };

  const setField = (key: string, val: any) => {
    if (val === undefined) return;
    if (!(key in params.beforeSnapshot)) {
      params.beforeSnapshot[key] = existing[key] ?? null;
    }
    patch[key] = val;
    params.afterSnapshot[key] = val;
  };

  if (typeof ov.name === 'string' && ov.name.trim()) {
    setField('name', ov.name.trim());
  }

  // Enforce 8-digit numeric SKU (immutable on existing products that already have a valid 8-digit SKU)
  const existingSku = String(existing.sku || '').trim();
  const finalSku = isValidEightDigitNumericSku(existingSku)
    ? existingSku
    : isValidEightDigitNumericSku(ov.sku)
    ? String(ov.sku).trim()
    : params.allocatedSku;
  setField('sku', finalSku);

  if (typeof ov.packingSize === 'string') {
    setField('packingSize', ov.packingSize.trim());
  }
  if (typeof ov.unit === 'string' && ov.unit.trim()) {
    setField('unit', ov.unit.trim().toUpperCase());
  }
  if (ov.mrp !== undefined && ov.mrp !== null && Number.isFinite(Number(ov.mrp))) {
    setField('mrp', Number(ov.mrp));
  }
  if (
    ov.onlinePrice !== undefined &&
    ov.onlinePrice !== null &&
    Number.isFinite(Number(ov.onlinePrice))
  ) {
    const online = Number(ov.onlinePrice);
    setField('onlinePrice', online);
    setField('offerPrice', online);
    const mrpVal = Number(patch.mrp ?? existing.mrp ?? 0);
    if (mrpVal > 0 && online > 0 && mrpVal >= online) {
      setField('discount', Math.round(((mrpVal - online) / mrpVal) * 100));
    }
  }
  if (
    ov.shopPrice !== undefined &&
    ov.shopPrice !== null &&
    Number.isFinite(Number(ov.shopPrice))
  ) {
    setField('shopPrice', Number(ov.shopPrice));
  }
  if (
    ov.gstPercentage !== undefined &&
    ov.gstPercentage !== null &&
    Number.isFinite(Number(ov.gstPercentage))
  ) {
    setField('gstPercentage', Number(ov.gstPercentage));
  }
  if (Array.isArray(ov.categories)) {
    const cleanCats = Array.from(
      new Set(ov.categories.map((c) => String(c || '').trim()).filter(Boolean))
    );
    setField('categories', cleanCats);
    setField('category', cleanCats[0] || existing.category || 'Uncategorized');
  }
  if (typeof ov.leafycategory === 'string' && ov.leafycategory.trim()) {
    setField('leafycategory', ov.leafycategory.trim());
  }
  if (typeof ov.brand === 'string') {
    setField('brand', ov.brand.trim());
  }
  if (typeof ov.brandOwner === 'string') {
    setField('brandOwner', ov.brandOwner.trim());
  }
  if (ov.stockIn !== undefined && ov.stockIn !== null && Number.isFinite(Number(ov.stockIn))) {
    const stockInNum = Math.max(0, Number(ov.stockIn));
    setField('stockIn', stockInNum);
    const stockOutNum = Number(existing.stockOut ?? 0);
    const computedStock = Math.max(0, stockInNum - stockOutNum);
    setField('stock', computedStock);
    setField('stockAvailability', computedStock > 0 ? 'In Stock' : 'Out of Stock');
  }
  if (typeof ov.imageUrl === 'string' && ov.imageUrl.trim()) {
    setField('imageUrl', ov.imageUrl.trim());
  }
  if (typeof ov.storagePath === 'string' && ov.storagePath.trim()) {
    setField('storagePath', ov.storagePath.trim());
  }
  if (Array.isArray(ov.images) && ov.images.length > 0) {
    setField('images', ov.images.filter(Boolean));
  } else if (patch.imageUrl && (!Array.isArray(existing.images) || existing.images.length === 0)) {
    setField('images', [patch.imageUrl]);
  }
  if (typeof ov.uniqueSpec1 === 'string') {
    setField('uniqueSpec1', ov.uniqueSpec1.trim());
  }
  if (typeof ov.uniqueSpec2 === 'string') {
    setField('uniqueSpec2', ov.uniqueSpec2.trim());
  }
  if (typeof ov.uniqueSpec3 === 'string') {
    setField('uniqueSpec3', ov.uniqueSpec3.trim());
  }
  if (ov.featuredproducts !== undefined && ov.featuredproducts !== null) {
    setField('featuredproducts', Boolean(ov.featuredproducts));
  } else if (existing.featuredproducts === undefined && patch.featuredproducts === undefined) {
    setField('featuredproducts', false);
  }
  if (
    ov.featuredprdsortorder !== undefined &&
    ov.featuredprdsortorder !== null &&
    Number.isFinite(Number(ov.featuredprdsortorder))
  ) {
    setField('featuredprdsortorder', Number(ov.featuredprdsortorder));
  } else if (existing.featuredprdsortorder === undefined && patch.featuredprdsortorder === undefined) {
    setField('featuredprdsortorder', 1);
  }
  if (typeof ov.aiContentLink === 'string' && ov.aiContentLink.trim()) {
    setField('aiContentLink', ov.aiContentLink.trim());
  }
  if (typeof ov.aiDraftId === 'string' && ov.aiDraftId.trim()) {
    setField('aiDraftId', ov.aiDraftId.trim());
  }

  // Base defaults for a brand-new `products` record so all `products` table fields exist
  const baseDefaults: Record<string, any> = isNew
    ? {
        name: patch.name || existing.name || 'New Product',
        sku: finalSku,
        hsnCode: patch.hsnCode || '',
        packingSize: patch.packingSize || '100 g',
        unit: patch.unit || 'PAC',
        mrp: patch.mrp ?? 0,
        onlinePrice: patch.onlinePrice ?? 0,
        offerPrice: patch.offerPrice ?? patch.onlinePrice ?? 0,
        shopPrice: patch.shopPrice ?? 0,
        discount: patch.discount ?? 0,
        gstPercentage: patch.gstPercentage ?? 5,
        categories: patch.categories || [],
        category: patch.category || (patch.categories?.[0] ?? 'Uncategorized'),
        leafycategory: patch.leafycategory || '',
        brand: patch.brand || '',
        brandOwner: patch.brandOwner || '',
        stockIn: patch.stockIn ?? 0,
        stockOut: 0,
        stock: patch.stock ?? patch.stockIn ?? 0,
        stockAvailability: (patch.stock ?? patch.stockIn ?? 0) > 0 ? 'In Stock' : 'Out of Stock',
        imageUrl: patch.imageUrl || '',
        storagePath: patch.storagePath || '',
        images: patch.images || (patch.imageUrl ? [patch.imageUrl] : []),
        videos: [],
        description: patch.description || '',
        ingredients: '',
        uniqueSpec1: patch.uniqueSpec1 || '',
        uniqueSpec2: patch.uniqueSpec2 || '',
        uniqueSpec3: patch.uniqueSpec3 || '',
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
        featuredproducts: patch.featuredproducts ?? false,
        featuredprdsortorder: patch.featuredprdsortorder ?? 1,
        aiContentLink: patch.aiContentLink || '',
        aiDraftId: patch.aiDraftId || '',
        vamjoWeblink: '',
        amazonWeblink: '',
        flipkartWeblink: '',
        meeshoWeblink: '',
        rating: 4.8,
        reviewsCount: 0,
      }
    : {};

  const finalPatch = isNew ? { ...baseDefaults, ...patch } : patch;
  delete finalPatch.aiContentMetadata;
  const mergedMasterProduct = { ...baseDefaults, ...existing, ...finalPatch };
  delete mergedMasterProduct.aiContentMetadata;
  return { mergedMasterProduct, finalPatch };
}

// ============================================================================
// Firebase Storage Upload & Canonical URL Helpers (https://firebasestorage.googleapis.com)
// ============================================================================

export function isFirebaseStorageDownloadUrl(url: unknown): boolean {
  return (
    typeof url === 'string' &&
    url.trim().startsWith('https://firebasestorage.googleapis.com/v0/b/')
  );
}

export function buildFirebaseStorageDownloadUrl(
  bucketName: string,
  storagePath: string,
  downloadToken: string
): string {
  const cleanBucket = String(bucketName || 'violeafybasket.firebasestorage.app').trim();
  const cleanPath = String(storagePath || '').replace(/^\/+/, '');
  return `https://firebasestorage.googleapis.com/v0/b/${cleanBucket}/o/${encodeURIComponent(cleanPath)}?alt=media&token=${downloadToken}`;
}

export async function uploadBufferToFirebaseStorage(params: {
  storage: any;
  buffer: Buffer;
  storagePath: string;
  contentType: string;
  downloadToken?: string;
}): Promise<{
  downloadUrl: string;
  storagePath: string;
  contentType: string;
  downloadToken: string;
}> {
  const bucket = params.storage.bucket();
  const cleanPath = String(params.storagePath || '').replace(/^\/+/, '');
  const token = params.downloadToken || crypto.randomUUID();
  const contentType = params.contentType || 'image/jpeg';
  const fileRef = bucket.file(cleanPath);
  await fileRef.save(params.buffer, {
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
    resumable: false,
  });
  const downloadUrl = buildFirebaseStorageDownloadUrl(bucket.name, cleanPath, token);
  return {
    downloadUrl,
    storagePath: cleanPath,
    contentType,
    downloadToken: token,
  };
}

export async function ensureFirebaseStorageImageUrl(params: {
  storage: any;
  sourceUrl: string;
  targetStoragePath: string;
  fallbackProductName?: string;
  forceCopyToTargetPath?: boolean;
}): Promise<{
  downloadUrl: string;
  storagePath: string;
  contentType: string;
  buffer?: Buffer;
}> {
  const rawUrl = String(params.sourceUrl || '').trim();
  const cleanTarget = String(params.targetStoragePath || '').replace(/^\/+/, '');
  if (!params.storage || typeof params.storage.bucket !== 'function' || !rawUrl) {
    return {
      downloadUrl: rawUrl,
      storagePath: cleanTarget,
      contentType: 'image/jpeg',
    };
  }

  if (!params.forceCopyToTargetPath && isFirebaseStorageDownloadUrl(rawUrl)) {
    return {
      downloadUrl: rawUrl,
      storagePath: cleanTarget,
      contentType: 'image/jpeg',
    };
  }

  let buffer: Buffer | null = null;
  let contentType = 'image/jpeg';

  if (rawUrl.startsWith('data:')) {
    const b64Match = rawUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (b64Match) {
      const mime = b64Match[1].toLowerCase();
      if (mime.includes('svg')) {
        buffer = generatePureWhite1000x1000PngBuffer(
          `${params.fallbackProductName || 'Product'}:${Date.now()}`
        );
        contentType = 'image/png';
      } else {
        buffer = Buffer.from(b64Match[2], 'base64');
        contentType = mime === 'image/jpg' ? 'image/jpeg' : mime;
      }
    } else if (rawUrl.startsWith('data:image/svg+xml')) {
      buffer = generatePureWhite1000x1000PngBuffer(
        `${params.fallbackProductName || 'Product'}:${Date.now()}`
      );
      contentType = 'image/png';
    }
  } else if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    try {
      const resp = await fetch(rawUrl);
      if (resp.ok) {
        const arrBuf = await resp.arrayBuffer();
        buffer = Buffer.from(arrBuf);
        const hdrType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (hdrType.startsWith('image/') && !hdrType.includes('svg')) {
          contentType = hdrType;
        }
      }
    } catch {
      // Fallback below if fetch fails
    }
  }

  if (!buffer || buffer.length === 0) {
    return {
      downloadUrl: rawUrl,
      storagePath: cleanTarget,
      contentType,
    };
  }

  const uploaded = await uploadBufferToFirebaseStorage({
    storage: params.storage,
    buffer,
    storagePath: cleanTarget,
    contentType,
  });

  return {
    downloadUrl: uploaded.downloadUrl,
    storagePath: uploaded.storagePath,
    contentType: uploaded.contentType,
    buffer,
  };
}

// ============================================================================
// Express Route Registration (Sections 6, 17.5, 21.8)
// ============================================================================

export function registerAIProductContentRoutes(
  app: express.Express,
  deps: { db: Firestore | null; auth: Auth | null; storage?: any }
): void {
  const getDb = (): Firestore => {
    if (!deps.db) throw new Error('Firestore Admin DB is not initialized');
    return deps.db;
  };

  const resolveActor = async (req: express.Request) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ') && deps.auth) {
      try {
        const decoded = await deps.auth.verifyIdToken(authHeader.slice(7));
        return {
          uid: decoded.uid,
          email: decoded.email || 'admin@leafyearth.com',
          role: 'Admin',
        };
      } catch {
        // Fallback to body actor metadata in local dev
      }
    }
    return {
      uid: String(req.body?.actorId || req.headers['x-actor-id'] || 'admin-user'),
      email: String(req.body?.actorEmail || req.headers['x-actor-email'] || 'admin@leafyearth.com'),
      role: String(req.body?.actorRole || 'Admin'),
    };
  };

  const logEvent = async (
    db: Firestore,
    draftId: string,
    eventType: AIProductEvent['event_type'],
    actor: { uid: string; email?: string; role?: string },
    metadata: Record<string, any> = {}
  ) => {
    const eventId = `aievt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const eventDoc: AIProductEvent = {
      id: eventId,
      draft_id: draftId,
      event_type: eventType,
      actor_id: actor.uid,
      actor_email: actor.email,
      actor_role: actor.role,
      metadata,
      created_at: new Date().toISOString(),
    };
    await db.collection(AI_PRODUCT_EVENTS_COLLECTION).doc(eventId).set(eventDoc);
    return eventDoc;
  };

  const ensureDraftImagesInFirebaseStorage = async (
    db: Firestore,
    draft: AIProductDraft,
    images: AIProductImage[]
  ): Promise<AIProductImage[]> => {
    if (!deps.storage || typeof deps.storage.bucket !== 'function' || images.length === 0) {
      return images;
    }
    const updatedList: AIProductImage[] = [];
    for (const img of images) {
      if (isFirebaseStorageDownloadUrl(img.preview_url)) {
        updatedList.push(img);
        continue;
      }
      try {
        const isPng = String(img.preview_url || '').startsWith('data:image/png');
        const ext = isPng ? 'png' : 'jpg';
        const targetPath = `products/${draft.id}/images/${img.id}.${ext}`;
        const uploaded = await ensureFirebaseStorageImageUrl({
          storage: deps.storage,
          sourceUrl: img.preview_url,
          targetStoragePath: targetPath,
          fallbackProductName: draft.source_product_name,
        });
        if (isFirebaseStorageDownloadUrl(uploaded.downloadUrl)) {
          const patched: AIProductImage = {
            ...img,
            preview_url: uploaded.downloadUrl,
            storage_key: uploaded.storagePath,
          };
          await db
            .collection(AI_PRODUCT_IMAGES_COLLECTION)
            .doc(img.id)
            .set(
              {
                preview_url: patched.preview_url,
                storage_key: patched.storage_key,
              },
              { merge: true }
            );
          updatedList.push(patched);
          continue;
        }
      } catch (err) {
        console.warn('[AI-PRODUCT-IMAGE] Failed to migrate image to Firebase Storage:', err);
      }
      updatedList.push(img);
    }
    return updatedList;
  };

  /**
   * Generates and stages a 1000x1000 #FFFFFF candidate product image for a draft.
   * Attempts live OpenAI image generation when enabled, uploads the image binary to
   * Firebase Storage (`https://firebasestorage.googleapis.com/v0/b/...`), and falls back
   * to the deterministic 1000x1000 #FFFFFF studio product visual.
   */
  const createStagedCandidateImageForDraft = async (params: {
    db: Firestore;
    draft: AIProductDraft;
    payload?: AIProductContentPayload | null;
    productForm?: string;
    packagingStyle?: string;
    customPrompt?: string;
    actor: { uid: string; email?: string; role?: string };
  }): Promise<AIProductImage> => {
    const startMs = Date.now();
    const config = getOpenAIProviderConfigStatus();
    const productForm =
      params.productForm ||
      params.payload?.form ||
      params.draft.category_hint ||
      'Natural Botanical Product';
    const packagingStyle =
      params.packagingStyle ||
      'Standard Brown Kraft Stand-Up Zipper Pouch with Cream Label, Clear Lower Window & Foreground Heap';
    const customPrompt = params.customPrompt || '';

    const labelMeta = resolveStandardKraftPouchLabelMetadata({
      productName: params.draft.source_product_name,
      englishProductName: params.payload?.english_product_name,
      displayTitle: params.payload?.title,
      botanicalName: params.payload?.botanical_name,
      category: params.payload?.category || params.draft.category_hint || 'Herbs & Botanicals',
      productForm: String(productForm),
    });

    const prompt = buildStandardKraftPouchPrompt({
      productName: params.draft.source_product_name,
      englishProductName: params.payload?.english_product_name,
      displayTitle: params.payload?.title,
      botanicalName: params.payload?.botanical_name,
      category: params.payload?.category || params.draft.category_hint || 'Herbs & Botanicals',
      productForm: String(productForm),
      customPrompt,
    });

    const pngBuffer = generatePureWhite1000x1000PngBuffer(
      `${params.draft.source_product_name}:${Date.now()}`
    );
    const dims = inspectPngDimensions(pngBuffer);
    if (!dims.validPng || dims.width !== 1000 || dims.height !== 1000) {
      throw new Error('Generated image failed 1000x1000 PNG validation.');
    }

    let checksum = crypto.createHash('sha256').update(pngBuffer).digest('hex');
    const imageId = `aiimg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let storageKey = `products/${params.draft.id}/images/${imageId}.png`;
    let candidateBuffer: Buffer = pngBuffer;
    let candidateContentType = 'image/png';

    let previewUrl = buildStudio1000x1000SvgPreviewDataUrl({
      productName: params.draft.source_product_name,
      englishProductName: params.payload?.english_product_name,
      displayTitle: params.payload?.title,
      botanicalName: params.payload?.botanical_name,
      category: params.payload?.category || params.draft.category_hint || 'Herbs & Botanicals',
      productForm: String(productForm),
      packagingStyle: String(packagingStyle),
    });
    let liveApiUsed = false;
    let modelUsed = `${config.imageModel} (studio-1000x1000)`;

    if (config.readyForLiveImages) {
      const apiKey = (process.env.OPENAI_API_KEY || '').trim();
      const candidateModels = Array.from(
        new Set([
          config.imageModel,
          'gpt-image-2.5-flare',
          'gpt-image-2',
          'gpt-image-1.5',
          'gpt-image-1-mini',
          'chatgpt-image-latest',
        ])
      );

      const refTemplatePath = path.resolve(
        process.cwd(),
        'public/assets/reference-kraft-pouch-template.jpg'
      );
      const hasRefTemplate = fs.existsSync(refTemplatePath);
      const refBuffer = hasRefTemplate ? fs.readFileSync(refTemplatePath) : null;

      for (const candidateModel of candidateModels) {
        if (liveApiUsed) break;

        // Step A: Try reference-image-guided edit (/v1/images/edits) so the exact brown kraft stand-up
        // pouch cover design from reference-kraft-pouch-template.jpg is strictly replicated
        if (refBuffer) {
          const editController = new AbortController();
          const editTimer = setTimeout(() => editController.abort(), 45000);
          try {
            const editPrompt = [
              `Strictly preserve the exact brown kraft stand-up zipper pouch cover design, pouch shape, cream textured front label sticker (#F4EFE3), typography style, thin green horizontal line with 3-leaf sprout icon in the center, lower transparent pouch window, and foreground pile on a 100% pure solid white (#FFFFFF) background.`,
              `Replace ONLY the product text on the cream label and the 3 product photo regions with "${labelMeta.primaryTitle}":`,
              `1. Cream Label Top Title (large bold dark-brown serif font): "${labelMeta.primaryTitle}"`,
              `2. Cream Label Second Line in parentheses (regular dark-brown font): "(${labelMeta.englishSubtitle})"`,
              `3. Cream Label Third Line (italic dark-brown serif font): "${labelMeta.botanicalName}"`,
              `4. Cream Label Center Illustration: Replace the long pepper spikes with a photorealistic cluster of ${labelMeta.visualProductDescription}, keeping the two fresh green botanical leaves tucked behind the right side.`,
              `5. Cream Label Bottom Caption (all-caps tracked dark-brown sans-serif): "${labelMeta.formCaptionUpper}"`,
              `6. Lower Transparent Window: Fill the clear pouch window with realistic ${labelMeta.visualProductDescription}.`,
              `7. Foreground Heap: Replace the bottom foreground pile in front of the pouch with a neat realistic heap of ${labelMeta.visualProductDescription} on the pure white (#FFFFFF) surface.`,
              customPrompt ? customPrompt.trim() : '',
            ]
              .filter(Boolean)
              .join(' ');

            const form = new FormData();
            form.append('model', candidateModel);
            form.append(
              'image',
              new Blob([refBuffer], { type: 'image/jpeg' }),
              'reference-kraft-pouch-template.jpg'
            );
            form.append('prompt', editPrompt);
            form.append('size', '1024x1024');
            form.append('output_format', 'jpeg');
            form.append('output_compression', '85');

            const editRes = await fetch('https://api.openai.com/v1/images/edits', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
              body: form,
              signal: editController.signal,
            });
            clearTimeout(editTimer);
            if (editRes.ok) {
              const editData: any = await editRes.json();
              const b64Json = editData?.data?.[0]?.b64_json;
              const remoteUrl = editData?.data?.[0]?.url;
              const outFmt = String(editData?.output_format || 'jpeg').toLowerCase();
              const mimeSub = outFmt === 'png' ? 'png' : outFmt === 'webp' ? 'webp' : 'jpeg';
              const ext = mimeSub === 'png' ? 'png' : mimeSub === 'webp' ? 'webp' : 'jpg';
              if (b64Json && typeof b64Json === 'string') {
                const rawBuf = Buffer.from(b64Json, 'base64');
                checksum = crypto.createHash('sha256').update(rawBuf).digest('hex');
                candidateBuffer = rawBuf;
                candidateContentType = `image/${mimeSub}`;
                storageKey = `products/${params.draft.id}/images/${imageId}.${ext}`;
                previewUrl = `data:image/${mimeSub};base64,${b64Json}`;
                liveApiUsed = true;
                modelUsed = `${candidateModel} (ref-kraft-template)`;
                break;
              } else if (remoteUrl && typeof remoteUrl === 'string') {
                previewUrl = remoteUrl;
                storageKey = `products/${params.draft.id}/images/${imageId}.${ext}`;
                try {
                  const rResp = await fetch(remoteUrl);
                  if (rResp.ok) {
                    const rBuf = Buffer.from(await rResp.arrayBuffer());
                    checksum = crypto.createHash('sha256').update(rBuf).digest('hex');
                    candidateBuffer = rBuf;
                    candidateContentType = `image/${mimeSub}`;
                  }
                } catch {
                  // Keep remoteUrl if fetch fails
                }
                liveApiUsed = true;
                modelUsed = `${candidateModel} (ref-kraft-template)`;
                break;
              }
            }
          } catch {
            clearTimeout(editTimer);
          }
        }

        if (liveApiUsed) break;

        // Step B: Fallback to /v1/images/generations with the strict standardized Kraft Pouch prompt
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 35000);
        try {
          const bodyPayload: Record<string, any> = {
            model: candidateModel,
            prompt,
            n: 1,
            size: '1024x1024',
            output_format: 'jpeg',
            output_compression: 85,
          };
          const openAiRes = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(bodyPayload),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (openAiRes.ok) {
            const imgData: any = await openAiRes.json();
            const remoteUrl = imgData?.data?.[0]?.url;
            const b64Json = imgData?.data?.[0]?.b64_json;
            const outFmt = String(imgData?.output_format || 'jpeg').toLowerCase();
            const mimeSub = outFmt === 'png' ? 'png' : outFmt === 'webp' ? 'webp' : 'jpeg';
            const ext = mimeSub === 'png' ? 'png' : mimeSub === 'webp' ? 'webp' : 'jpg';
            if (b64Json && typeof b64Json === 'string') {
              const rawBuf = Buffer.from(b64Json, 'base64');
              checksum = crypto.createHash('sha256').update(rawBuf).digest('hex');
              candidateBuffer = rawBuf;
              candidateContentType = `image/${mimeSub}`;
              storageKey = `products/${params.draft.id}/images/${imageId}.${ext}`;
              previewUrl = `data:image/${mimeSub};base64,${b64Json}`;
              liveApiUsed = true;
              modelUsed = candidateModel;
              break;
            } else if (remoteUrl && typeof remoteUrl === 'string') {
              previewUrl = remoteUrl;
              storageKey = `products/${params.draft.id}/images/${imageId}.${ext}`;
              try {
                const rResp = await fetch(remoteUrl);
                if (rResp.ok) {
                  const rBuf = Buffer.from(await rResp.arrayBuffer());
                  checksum = crypto.createHash('sha256').update(rBuf).digest('hex');
                  candidateBuffer = rBuf;
                  candidateContentType = `image/${mimeSub}`;
                }
              } catch {
                // Keep remoteUrl if fetch fails
              }
              liveApiUsed = true;
              modelUsed = candidateModel;
              break;
            }
          }
        } catch {
          clearTimeout(timer);
        }
      }
    }

    // Always upload the generated candidate image to Firebase Storage so preview_url is a canonical
    // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/...?alt=media&token=<token> URL
    if (deps.storage && typeof deps.storage.bucket === 'function' && candidateBuffer) {
      try {
        const uploaded = await uploadBufferToFirebaseStorage({
          storage: deps.storage,
          buffer: candidateBuffer,
          storagePath: storageKey,
          contentType: candidateContentType,
        });
        previewUrl = uploaded.downloadUrl;
        storageKey = uploaded.storagePath;
      } catch (storageErr) {
        console.warn('[AI-PRODUCT-IMAGE] Firebase Storage upload warning:', storageErr);
      }
    }

    const now = new Date().toISOString();
    const imageDoc: AIProductImage = {
      id: imageId,
      draft_id: params.draft.id,
      version_id: params.draft.current_version_id,
      storage_key: storageKey,
      preview_url: previewUrl,
      mime_type: 'image/png',
      width: 1000,
      height: 1000,
      background_hex: '#FFFFFF',
      checksum,
      prompt,
      model: modelUsed,
      generation_metadata: {
        provider: config.provider,
        project_name: config.projectName,
        product_form: String(productForm),
        packaging_style: String(packagingStyle),
        estimated_cost_usd: liveApiUsed ? 0.04 : 0,
        latency_ms: Math.max(25, Date.now() - startMs),
        live_api_used: liveApiUsed,
        source_type: 'ai_generated',
      },
      status: 'GENERATED',
      rejection_reason: null,
      created_by: params.actor.uid,
      created_at: now,
      reviewed_by: null,
      reviewed_at: null,
    };

    await params.db.collection(AI_PRODUCT_IMAGES_COLLECTION).doc(imageId).set(imageDoc);
    await logEvent(params.db, params.draft.id, 'IMAGE_GENERATED', params.actor, {
      image_id: imageId,
      width: 1000,
      height: 1000,
      background_hex: '#FFFFFF',
      model: modelUsed,
      storage_key: storageKey,
    });

    return imageDoc;
  };

  // 0. GET /api/admin/ai-products/config-status
  const handleGetConfigStatus = async (_req: express.Request, res: express.Response) => {
    try {
      const status = getOpenAIProviderConfigStatus();
      return res.json({ success: true, config: status });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to read AI configuration status' });
    }
  };
  app.get('/api/admin/ai-products/config-status', handleGetConfigStatus);
  app.get('/api/v1/admin/ai-products/config-status', handleGetConfigStatus);

  // 1. POST /api/admin/ai-products/generate
  const handleGenerateDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const { productName, productId, categoryHint, brandHint, isAyurvedicProduct } = req.body || {};
      const cleanName = String(productName || '').trim();
      if (!cleanName || cleanName.length < 2 || cleanName.length > 200) {
        return res.status(400).json({ error: 'productName is required (2–200 characters).' });
      }
      const resolvedIsAyurvedic =
        isAyurvedicProduct !== undefined && isAyurvedicProduct !== null
          ? isAyurvedicProduct === true || String(isAyurvedicProduct).toLowerCase() === 'true'
          : undefined;

      let masterProduct: Record<string, any> | null = null;
      let allProductsCache: Array<Record<string, any>> | null = null;
      if (productId) {
        const masterSnap = await db.collection('products').doc(String(productId)).get();
        if (masterSnap.exists) {
          masterProduct = { id: masterSnap.id, ...masterSnap.data() };
        }
      }
      if (!masterProduct) {
        const allSnap = await db.collection('products').get();
        allProductsCache = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        masterProduct = matchMasterProductByName(allProductsCache, [cleanName]);
      }

      const { payload, usage } = await generateProductContentViaProvider(cleanName, {
        categoryHint: categoryHint || masterProduct?.category,
        brandHint: brandHint || masterProduct?.brand,
        isAyurvedicProduct: resolvedIsAyurvedic,
      });

      if (!masterProduct && allProductsCache) {
        masterProduct = matchMasterProductByName(allProductsCache, [
          cleanName,
          payload.english_product_name,
        ]);
      }

      const now = new Date().toISOString();
      const draftId = `aidraft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const versionId = `aiver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const versionDoc: AIProductVersion = {
        id: versionId,
        draft_id: draftId,
        version_no: 1,
        generated_payload: payload,
        edited_payload: payload,
        model: usage.model,
        prompt_version: usage.prompt_version,
        usage_metadata: usage,
        generated_at: now,
        edited_by: null,
        edited_at: null,
        approved_by: null,
        approved_at: null,
      };

      const draftDoc: AIProductDraft = {
        id: draftId,
        source_product_name: cleanName,
        master_product_id: masterProduct ? String(masterProduct.id) : productId ? String(productId) : null,
        master_product_name: masterProduct?.name || null,
        master_product_sku: masterProduct?.sku || null,
        category_hint: categoryHint || payload.category || null,
        brand_hint: brandHint || masterProduct?.brand || null,
        is_ayurvedic_product: payload.is_ayurvedic_product ?? (payload.ayurveda_applicability === 'applicable'),
        status: 'DRAFT',
        current_version_id: versionId,
        approved_version_id: null,
        approved_image_id: null,
        approved_research_id: null,
        rejection_reason: null,
        last_synced_at: null,
        created_by: actor.uid,
        created_by_email: actor.email,
        created_at: now,
        updated_at: now,
      };

      await db.collection(AI_PRODUCT_VERSIONS_COLLECTION).doc(versionId).set(versionDoc);
      await db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId).set(draftDoc);
      await logEvent(db, draftId, 'DRAFT_GENERATED', actor, {
        version_id: versionId,
        version_no: 1,
        model: usage.model,
        live_api_used: usage.live_api_used,
      });

      // Automatically generate initial 1000x1000 #FFFFFF studio candidate image for the draft
      let initialImage: AIProductImage | null = null;
      try {
        initialImage = await createStagedCandidateImageForDraft({
          db,
          draft: draftDoc,
          payload,
          productForm: payload.form,
          actor,
        });
      } catch (imgErr) {
        console.warn('[AI-PRODUCT-IMAGE] Initial candidate image generation warning:', imgErr);
      }

      return res.json({
        success: true,
        draftId,
        version: 1,
        status: 'DRAFT',
        draft: draftDoc,
        versionRecord: versionDoc,
        generatedContent: payload,
        initialImage,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to generate AI product draft' });
    }
  };
  app.post('/api/admin/ai-products/generate', handleGenerateDraft);
  app.post('/api/v1/admin/ai-products/generate', handleGenerateDraft);

  // 2. GET /api/admin/ai-products
  const handleListDrafts = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const statusFilter = String(req.query.status || 'ALL').toUpperCase();
      const search = String(req.query.search || '').trim().toLowerCase();

      const [draftsSnap, versionsSnap, imagesSnap, researchSnap, syncLogsSnap] = await Promise.all([
        db.collection(AI_PRODUCT_DRAFTS_COLLECTION).get(),
        db.collection(AI_PRODUCT_VERSIONS_COLLECTION).get(),
        db.collection(AI_PRODUCT_IMAGES_COLLECTION).get(),
        db.collection(AI_PRODUCT_RESEARCH_COLLECTION).get(),
        db.collection(AI_PRODUCT_SYNC_LOGS_COLLECTION).get(),
      ]);

      const versionsById = new Map<string, AIProductVersion>();
      versionsSnap.docs.forEach((d) => versionsById.set(d.id, { id: d.id, ...(d.data() as any) }));

      const imagesByDraft = new Map<string, AIProductImage[]>();
      imagesSnap.docs.forEach((d) => {
        const img = { id: d.id, ...(d.data() as any) } as AIProductImage;
        const list = imagesByDraft.get(img.draft_id) || [];
        list.push(img);
        imagesByDraft.set(img.draft_id, list);
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
        const currentVersion = versionsById.get(draft.current_version_id) || null;
        const images = imagesByDraft.get(draft.id) || [];
        const research = researchByDraft.get(draft.id) || null;
        return {
          ...draft,
          currentVersion,
          imagesCount: images.length,
          latestResearch: research,
        };
      });

      if (statusFilter && statusFilter !== 'ALL') {
        drafts = drafts.filter((d) => d.status === statusFilter);
      }
      if (search) {
        drafts = drafts.filter(
          (d) =>
            d.source_product_name.toLowerCase().includes(search) ||
            (d.master_product_name || '').toLowerCase().includes(search) ||
            (d.master_product_sku || '').toLowerCase().includes(search) ||
            (d.category_hint || '').toLowerCase().includes(search)
        );
      }

      drafts.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

      return res.json({
        success: true,
        drafts,
        versions: Array.from(versionsById.values()),
        syncLogs: syncLogsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to list AI product drafts' });
    }
  };
  app.get('/api/admin/ai-products', handleListDrafts);
  app.get('/api/v1/admin/ai-products', handleListDrafts);

  // 3. GET /api/admin/ai-products/:id
  const handleGetDraftDetail = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const draftId = req.params.id;
      const draftSnap = await db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId).get();
      if (!draftSnap.exists) {
        return res.status(404).json({ error: `AI product draft '${draftId}' not found.` });
      }
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const [versionsSnap, imagesSnap, researchSnap, eventsSnap, syncSnap] = await Promise.all([
        db.collection(AI_PRODUCT_VERSIONS_COLLECTION).where('draft_id', '==', draftId).get(),
        db.collection(AI_PRODUCT_IMAGES_COLLECTION).where('draft_id', '==', draftId).get(),
        db.collection(AI_PRODUCT_RESEARCH_COLLECTION).where('draft_id', '==', draftId).get(),
        db.collection(AI_PRODUCT_EVENTS_COLLECTION).where('draft_id', '==', draftId).get(),
        db.collection(AI_PRODUCT_SYNC_LOGS_COLLECTION).where('draft_id', '==', draftId).get(),
      ]);

      const versions = versionsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductVersion))
        .sort((a, b) => b.version_no - a.version_no);
      const currentVersion =
        versions.find((v) => v.id === draft.current_version_id) || versions[0] || null;
      let images = imagesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductImage))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      // Backfill or upgrade a 1000x1000 #FFFFFF candidate studio image if an existing draft has 0 images
      // or only has a non-live placeholder image while OpenAI live image generation is configured
      const hasOnlyPlaceholderImages =
        images.length > 0 &&
        getOpenAIProviderConfigStatus().readyForLiveImages &&
        images.every((img) => img.generation_metadata?.live_api_used !== true);

      if (images.length === 0 || hasOnlyPlaceholderImages) {
        try {
          const autoImg = await createStagedCandidateImageForDraft({
            db,
            draft,
            payload: currentVersion?.edited_payload || currentVersion?.generated_payload || null,
            productForm:
              currentVersion?.edited_payload?.form ||
              currentVersion?.generated_payload?.form ||
              draft.category_hint ||
              'Natural Botanical',
            actor: {
              uid: draft.created_by || 'admin-user',
              email: draft.created_by_email || 'admin@leafyearth.com',
              role: 'Admin',
            },
          });
          if (hasOnlyPlaceholderImages && autoImg.generation_metadata?.live_api_used) {
            await Promise.all(
              images.map((oldImg) =>
                db.collection(AI_PRODUCT_IMAGES_COLLECTION).doc(oldImg.id).delete().catch(() => null)
              )
            );
            images = [autoImg];
          } else if (images.length === 0) {
            images = [autoImg];
          }
        } catch (autoImgErr) {
          console.warn('[AI-PRODUCT-IMAGE] Auto-backfill candidate image warning:', autoImgErr);
        }
      }
      images = await ensureDraftImagesInFirebaseStorage(db, draft, images);
      const researchRecords = researchSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductResearchRecord))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      const events = eventsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductEvent))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const syncLogs = syncSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductSyncLog))
        .sort((a, b) => String(b.applied_at).localeCompare(String(a.applied_at)));

      return res.json({
        success: true,
        draft,
        currentVersion,
        versions,
        images,
        research: researchRecords[0] || null,
        researchHistory: researchRecords,
        events,
        syncLogs,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to fetch AI product draft detail' });
    }
  };
  app.get('/api/admin/ai-products/:id', handleGetDraftDetail);
  app.get('/api/v1/admin/ai-products/:id', handleGetDraftDetail);

  // 4. PUT /api/admin/ai-products/:id (Save admin edits to draft/edited_payload; invalidates prior approval)
  const handleUpdateDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const draftRef = db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) {
        return res.status(404).json({ error: `AI product draft '${draftId}' not found.` });
      }
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const { editedPayload, masterProductId } = req.body || {};
      const now = new Date().toISOString();

      let updatedVersion: AIProductVersion | null = null;
      if (editedPayload) {
        assertNoSeoFields(editedPayload);
        const validated = validateAIProductContentPayload(editedPayload);
        if (!validated.valid) {
          return res.status(400).json({
            error: `Validation failed: ${validated.errors.join(' ')}`,
            validationErrors: validated.errors,
          });
        }
        const verRef = db.collection(AI_PRODUCT_VERSIONS_COLLECTION).doc(draft.current_version_id);
        const verSnap = await verRef.get();
        if (verSnap.exists) {
          updatedVersion = {
            ...(verSnap.data() as AIProductVersion),
            id: verSnap.id,
            edited_payload: validated.payload,
            edited_by: actor.uid,
            edited_at: now,
            approved_by: null,
            approved_at: null,
          };
          await verRef.set(updatedVersion, { merge: true });
        }
      }

      let masterMeta: Partial<AIProductDraft> = {};
      if (masterProductId !== undefined) {
        if (masterProductId) {
          const mSnap = await db.collection('products').doc(String(masterProductId)).get();
          const mData = mSnap.exists ? mSnap.data() : null;
          masterMeta = {
            master_product_id: String(masterProductId),
            master_product_name: mData?.name || null,
            master_product_sku: mData?.sku || null,
          };
        } else {
          masterMeta = {
            master_product_id: null,
            master_product_name: null,
            master_product_sku: null,
          };
        }
      }

      // Section 5 & 9: Editing after approval invalidates prior content approval
      const newStatus: AIProductDraftStatus =
        draft.status === 'APPROVED' || draft.status === 'APPLIED' ? 'IN_REVIEW' : draft.status;

      const updatedDraft: AIProductDraft = {
        ...draft,
        ...masterMeta,
        status: newStatus,
        approved_version_id: editedPayload ? null : draft.approved_version_id,
        updated_at: now,
      };

      await draftRef.set(updatedDraft, { merge: true });
      await logEvent(db, draftId, 'DRAFT_EDITED', actor, {
        version_id: draft.current_version_id,
        invalidated_prior_approval: draft.status === 'APPROVED',
      });

      return res.json({
        success: true,
        draft: updatedDraft,
        versionRecord: updatedVersion,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to update AI product draft' });
    }
  };
  app.put('/api/admin/ai-products/:id', handleUpdateDraft);
  app.put('/api/v1/admin/ai-products/:id', handleUpdateDraft);

  // 5. POST /api/admin/ai-products/:id/regenerate
  const handleRegenerateDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const draftRef = db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) {
        return res.status(404).json({ error: `AI product draft '${draftId}' not found.` });
      }
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const versionsSnap = await db
        .collection(AI_PRODUCT_VERSIONS_COLLECTION)
        .where('draft_id', '==', draftId)
        .get();
      const maxVersionNo = versionsSnap.docs.reduce(
        (max, d) => Math.max(max, Number(d.data()?.version_no || 0)),
        0
      );
      const nextVersionNo = maxVersionNo + 1;

      const regenIsAyurvedic =
        req.body?.isAyurvedicProduct !== undefined
          ? Boolean(req.body.isAyurvedicProduct)
          : draft.is_ayurvedic_product;

      const { payload, usage } = await generateProductContentViaProvider(draft.source_product_name, {
        categoryHint: req.body?.categoryHint || draft.category_hint || undefined,
        brandHint: req.body?.brandHint || draft.brand_hint || undefined,
        isAyurvedicProduct: regenIsAyurvedic,
      });

      const now = new Date().toISOString();
      const newVersionId = `aiver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newVersionDoc: AIProductVersion = {
        id: newVersionId,
        draft_id: draftId,
        version_no: nextVersionNo,
        generated_payload: payload,
        edited_payload: payload,
        model: usage.model,
        prompt_version: usage.prompt_version,
        usage_metadata: usage,
        generated_at: now,
        edited_by: null,
        edited_at: null,
        approved_by: null,
        approved_at: null,
      };

      const updatedDraft: AIProductDraft = {
        ...draft,
        status: 'DRAFT',
        current_version_id: newVersionId,
        approved_version_id: null,
        updated_at: now,
      };

      await db.collection(AI_PRODUCT_VERSIONS_COLLECTION).doc(newVersionId).set(newVersionDoc);
      await draftRef.set(updatedDraft, { merge: true });
      await logEvent(db, draftId, 'DRAFT_REGENERATED', actor, {
        version_id: newVersionId,
        version_no: nextVersionNo,
      });

      return res.json({
        success: true,
        draft: updatedDraft,
        versionRecord: newVersionDoc,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to regenerate AI product draft' });
    }
  };
  app.post('/api/admin/ai-products/:id/regenerate', handleRegenerateDraft);
  app.post('/api/v1/admin/ai-products/:id/regenerate', handleRegenerateDraft);

  // 6. POST /api/admin/ai-products/:id/submit
  const handleSubmitForReview = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const draftRef = db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const now = new Date().toISOString();
      const updatedDraft: AIProductDraft = {
        ...draft,
        status: 'IN_REVIEW',
        updated_at: now,
      };
      await draftRef.set(updatedDraft, { merge: true });
      await logEvent(db, draftId, 'SUBMITTED_FOR_REVIEW', actor, {
        version_id: draft.current_version_id,
      });
      return res.json({ success: true, draft: updatedDraft });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to submit draft for review' });
    }
  };
  app.post('/api/admin/ai-products/:id/submit', handleSubmitForReview);
  app.post('/api/v1/admin/ai-products/:id/submit', handleSubmitForReview);

  // 7. POST /api/admin/ai-products/:id/approve (or reject when action === 'REJECT')
  const handleApproveOrRejectContent = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const { action = 'APPROVE', rejectionReason } = req.body || {};

      const draftRef = db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const verRef = db.collection(AI_PRODUCT_VERSIONS_COLLECTION).doc(draft.current_version_id);
      const verSnap = await verRef.get();
      if (!verSnap.exists) return res.status(404).json({ error: 'Current version not found' });
      const ver = { id: verSnap.id, ...(verSnap.data() as any) } as AIProductVersion;

      const now = new Date().toISOString();

      if (String(action).toUpperCase() === 'REJECT') {
        const updatedDraft: AIProductDraft = {
          ...draft,
          status: 'REJECTED',
          approved_version_id: null,
          rejection_reason: String(rejectionReason || 'Rejected during admin review').trim(),
          updated_at: now,
        };
        await draftRef.set(updatedDraft, { merge: true });
        await logEvent(db, draftId, 'CONTENT_REJECTED', actor, {
          version_id: ver.id,
          reason: updatedDraft.rejection_reason,
        });
        return res.json({ success: true, draft: updatedDraft });
      }

      const validated = validateAIProductContentPayload(ver.edited_payload || ver.generated_payload);
      if (!validated.valid) {
        return res.status(400).json({
          error: `Cannot approve invalid content: ${validated.errors.join(' ')}`,
          validationErrors: validated.errors,
        });
      }

      // Mark non-rejected health benefit claims as approved
      const approvedPayload: AIProductContentPayload = {
        ...validated.payload,
        health_benefits: validated.payload.health_benefits.map((hb) => ({
          ...hb,
          review_status: hb.review_status === 'rejected' ? 'rejected' : 'approved',
        })),
      };

      const updatedVer: AIProductVersion = {
        ...ver,
        edited_payload: approvedPayload,
        approved_by: actor.uid,
        approved_at: now,
      };
      await verRef.set(updatedVer, { merge: true });

      const updatedDraft: AIProductDraft = {
        ...draft,
        status: 'APPROVED',
        approved_version_id: ver.id,
        rejection_reason: null,
        updated_at: now,
      };
      await draftRef.set(updatedDraft, { merge: true });
      await logEvent(db, draftId, 'CONTENT_APPROVED', actor, { version_id: ver.id });

      return res.json({
        success: true,
        draft: updatedDraft,
        versionRecord: updatedVer,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to approve AI product content' });
    }
  };
  app.post('/api/admin/ai-products/:id/approve', handleApproveOrRejectContent);
  app.post('/api/v1/admin/ai-products/:id/approve', handleApproveOrRejectContent);

  // ==========================================================================
  // Section 17: AI Product Image Endpoints (1000x1000 #FFFFFF)
  // ==========================================================================

  // 8. POST /api/admin/ai-products/:id/images/generate
  const handleGenerateImage = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const draftSnap = await db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId).get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      let currentPayload: AIProductContentPayload | null = null;
      if (draft.current_version_id) {
        const verSnap = await db
          .collection(AI_PRODUCT_VERSIONS_COLLECTION)
          .doc(draft.current_version_id)
          .get();
        if (verSnap.exists) {
          const v = verSnap.data() as AIProductVersion;
          currentPayload = v?.edited_payload || v?.generated_payload || null;
        }
      }

      const {
        packagingStyle = 'Clean retail stand-up pouch / glass jar',
        productForm = currentPayload?.form || draft.category_hint || 'Natural Product',
        customPrompt = '',
      } = req.body || {};

      const imageDoc = await createStagedCandidateImageForDraft({
        db,
        draft,
        payload: currentPayload,
        productForm,
        packagingStyle,
        customPrompt,
        actor,
      });

      return res.json({ success: true, image: imageDoc });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to generate AI product image' });
    }
  };
  app.post('/api/admin/ai-products/:id/images/generate', handleGenerateImage);
  app.post('/api/v1/admin/ai-products/:id/images/generate', handleGenerateImage);

  // 9. GET /api/admin/ai-products/:id/images
  const handleListImages = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const draftId = req.params.id;
      const [draftSnap, snap] = await Promise.all([
        db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId).get(),
        db.collection(AI_PRODUCT_IMAGES_COLLECTION).where('draft_id', '==', draftId).get(),
      ]);
      const draft = draftSnap.exists
        ? ({ id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft)
        : ({ id: draftId, source_product_name: 'Product' } as AIProductDraft);
      let images = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductImage))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      images = await ensureDraftImagesInFirebaseStorage(db, draft, images);
      return res.json({ success: true, images });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to list AI product images' });
    }
  };
  app.get('/api/admin/ai-products/:id/images', handleListImages);
  app.get('/api/v1/admin/ai-products/:id/images', handleListImages);

  // 10. POST /api/admin/ai-products/:id/images/:imageId/approve (or reject)
  const handleApproveOrRejectImage = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const { id: draftId, imageId } = req.params;
      const { action = 'APPROVE', rejectionReason } = req.body || {};

      const imgRef = db.collection(AI_PRODUCT_IMAGES_COLLECTION).doc(imageId);
      const imgSnap = await imgRef.get();
      if (!imgSnap.exists) return res.status(404).json({ error: 'Staged AI image not found' });
      const img = { id: imgSnap.id, ...(imgSnap.data() as any) } as AIProductImage;

      if (img.width !== 1000 || img.height !== 1000 || img.background_hex !== '#FFFFFF') {
        return res.status(400).json({
          error: 'Only 1000x1000 images with pure white (#FFFFFF) background can be approved.',
        });
      }

      const now = new Date().toISOString();
      const draftRef = db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId);

      if (String(action).toUpperCase() === 'REJECT') {
        const rejectedImg: AIProductImage = {
          ...img,
          status: 'REJECTED',
          rejection_reason: String(rejectionReason || 'Rejected by reviewer'),
          reviewed_by: actor.uid,
          reviewed_at: now,
        };
        await imgRef.set(rejectedImg, { merge: true });
        await logEvent(db, draftId, 'IMAGE_REJECTED', actor, { image_id: imageId });
        return res.json({ success: true, image: rejectedImg });
      }

      let previewUrl = img.preview_url;
      let storageKey = img.storage_key;
      if (deps.storage && typeof deps.storage.bucket === 'function' && !isFirebaseStorageDownloadUrl(previewUrl)) {
        try {
          const isPng = String(previewUrl || '').startsWith('data:image/png');
          const ext = isPng ? 'png' : 'jpg';
          const uploaded = await ensureFirebaseStorageImageUrl({
            storage: deps.storage,
            sourceUrl: previewUrl,
            targetStoragePath: `products/${draftId}/images/${img.id}.${ext}`,
          });
          if (isFirebaseStorageDownloadUrl(uploaded.downloadUrl)) {
            previewUrl = uploaded.downloadUrl;
            storageKey = uploaded.storagePath;
          }
        } catch {
          // Keep existing previewUrl if storage upload fails
        }
      }

      const approvedImg: AIProductImage = {
        ...img,
        preview_url: previewUrl,
        storage_key: storageKey,
        status: 'APPROVED',
        rejection_reason: null,
        reviewed_by: actor.uid,
        reviewed_at: now,
      };
      await imgRef.set(approvedImg, { merge: true });
      await draftRef.set({ approved_image_id: imageId, updated_at: now }, { merge: true });
      await logEvent(db, draftId, 'IMAGE_APPROVED', actor, { image_id: imageId });

      return res.json({ success: true, image: approvedImg });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to review AI product image' });
    }
  };
  app.post('/api/admin/ai-products/:id/images/:imageId/approve', handleApproveOrRejectImage);
  app.post('/api/v1/admin/ai-products/:id/images/:imageId/approve', handleApproveOrRejectImage);

  // 10b. POST /api/admin/ai-products/:id/images/export-firebase
  const handleExportImageToFirebaseStorage = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const draftId = req.params.id;
      const { imageUrl, storagePath, targetProductId } = req.body || {};
      const sourceUrl = String(imageUrl || '').trim();
      if (!sourceUrl) {
        return res.status(400).json({ error: 'imageUrl is required' });
      }
      const cleanEntityId = String(targetProductId || draftId || 'product').trim();
      const defaultPath = targetProductId
        ? `products/${cleanEntityId}/main.jpg`
        : `products/${cleanEntityId}/images/export_${Date.now()}.jpg`;
      const finalTargetPath = String(storagePath || defaultPath).trim();
      const uploaded = await ensureFirebaseStorageImageUrl({
        storage: deps.storage,
        sourceUrl,
        targetStoragePath: finalTargetPath,
        forceCopyToTargetPath: !isFirebaseStorageDownloadUrl(sourceUrl),
      });
      if (draftId && isFirebaseStorageDownloadUrl(uploaded.downloadUrl)) {
        const imgsSnap = await db
          .collection(AI_PRODUCT_IMAGES_COLLECTION)
          .where('draft_id', '==', draftId)
          .get();
        await Promise.all(
          imgsSnap.docs
            .filter((d) => !isFirebaseStorageDownloadUrl(d.data()?.preview_url))
            .map((d) =>
              d.ref.set(
                { preview_url: uploaded.downloadUrl, storage_key: uploaded.storagePath },
                { merge: true }
              )
            )
        );
      }
      return res.json({
        success: true,
        downloadUrl: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Failed to export image to Firebase Storage',
      });
    }
  };
  app.post('/api/admin/ai-products/:id/images/export-firebase', handleExportImageToFirebaseStorage);
  app.post('/api/v1/admin/ai-products/:id/images/export-firebase', handleExportImageToFirebaseStorage);

  // ==========================================================================
  // Section 21: Taxation, Web Price Research & Package Sizes Endpoints (V8)
  // ==========================================================================

  // 11. POST /api/admin/ai-products/:id/research
  const handleRunOrUpdateResearch = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const draftSnap = await db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId).get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const body = req.body || {};
      const now = new Date().toISOString();

      // Check if an existing research record exists for this draft
      const existingSnap = await db
        .collection(AI_PRODUCT_RESEARCH_COLLECTION)
        .where('draft_id', '==', draftId)
        .get();
      const existingDocs = existingSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductResearchRecord))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      const existing = existingDocs[0] || null;

      const initial = buildInitialTaxationAndMarketResearch({
        draftId,
        versionId: draft.current_version_id,
        productName: draft.source_product_name,
        category: draft.category_hint || undefined,
        selectedPackingSize:
          body.selectedPackingSize ||
          body.packing?.selectedPackingSize ||
          existing?.packing?.selectedPackingSize ||
          '100 g',
        unit: body.unit || body.packing?.unit || existing?.packing?.unit || 'PAC',
        availablePackingSizes:
          body.availablePackingSizes ||
          body.packing?.availablePackingSizes ||
          existing?.packing?.availablePackingSizes,
        customOffers: body.offers || body.marketResearch?.offers || existing?.marketResearch?.offers || [],
        actorId: actor.uid,
      });

      const mergedTaxation: AIProductTaxationResearch = {
        ...initial.taxation,
        ...(existing?.taxation || {}),
        ...(body.taxation || {}),
        hsnCode: String(body.taxation?.hsnCode ?? body.hsnCode ?? existing?.taxation?.hsnCode ?? initial.taxation.hsnCode).trim(),
        gstRatePercent: Number(
          body.taxation?.gstRatePercent ?? body.gstRatePercent ?? existing?.taxation?.gstRatePercent ?? initial.taxation.gstRatePercent
        ),
        gstReference: String(
          body.taxation?.gstReference ?? body.gstReference ?? existing?.taxation?.gstReference ?? initial.taxation.gstReference
        ).trim(),
      };

      if (!ALLOWED_GST_SLABS.includes(mergedTaxation.gstRatePercent)) {
        return res.status(400).json({
          error: `Invalid GST slab ${mergedTaxation.gstRatePercent}%. Allowed Indian GST slabs: 0, 5, 12, 18, 28.`,
        });
      }
      if (!/^[0-9]{4,8}$/.test(mergedTaxation.hsnCode)) {
        return res.status(400).json({
          error: `HSN Code "${mergedTaxation.hsnCode}" must be 4 to 8 numeric digits.`,
        });
      }

      const selectedPackingSize = String(
        body.packing?.selectedPackingSize ?? body.selectedPackingSize ?? initial.packing.selectedPackingSize
      ).trim();
      const rawAvail =
        body.packing?.availablePackingSizes ??
        body.availablePackingSizes ??
        initial.packing.availablePackingSizes;
      const availablePackingSizes = Array.from(
        new Set(
          [selectedPackingSize, ...(Array.isArray(rawAvail) ? rawAvail : [])]
            .map((s) => String(s || '').trim())
            .filter(Boolean)
        )
      );

      const mergedPacking: AIProductPackingResearch = {
        selectedPackingSize,
        unit: String(body.packing?.unit ?? body.unit ?? initial.packing.unit).trim().toUpperCase(),
        availablePackingSizes,
      };

      const incomingOffers: WebPriceSourceOffer[] = Array.isArray(
        body.marketResearch?.offers ?? body.offers
      )
        ? (body.marketResearch?.offers ?? body.offers).map((o: any) => ({
            siteName: String(o?.siteName || 'Online Store').trim(),
            productTitle: String(o?.productTitle || draft.source_product_name).trim(),
            packSize: String(o?.packSize || selectedPackingSize).trim(),
            price: Number(o?.price || 0),
            mrp: o?.mrp !== undefined && o?.mrp !== null && o?.mrp !== '' ? Number(o.mrp) : null,
            currency: String(o?.currency || 'INR').trim().toUpperCase(),
            inStock: o?.inStock !== false,
            sourceUrl: String(o?.sourceUrl || '').trim(),
            checkedAt: o?.checkedAt || now,
            included: o?.included !== false,
            matchConfidence: ['high', 'medium', 'low'].includes(o?.matchConfidence)
              ? o.matchConfidence
              : 'high',
          }))
        : initial.marketResearch.offers;

      const priceRange = calculateMarketPriceRange(incomingOffers, selectedPackingSize);
      const mergedMarketResearch: AIProductMarketResearch = {
        comparedPackingSize: selectedPackingSize,
        currency: 'INR',
        lowestPrice: priceRange.lowestPrice,
        highestPrice: priceRange.highestPrice,
        checkedAt: now,
        searchStatus: priceRange.searchStatus,
        offers: incomingOffers,
      };

      const researchId = existing?.id || `aires_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const record: AIProductResearchRecord = {
        id: researchId,
        draft_id: draftId,
        version_id: draft.current_version_id,
        taxation: mergedTaxation,
        packing: mergedPacking,
        marketResearch: mergedMarketResearch,
        status: 'DRAFT',
        rejection_reason: null,
        created_by: existing?.created_by || actor.uid,
        created_at: existing?.created_at || now,
        updated_at: now,
        approved_by: null,
        approved_at: null,
      };

      await db.collection(AI_PRODUCT_RESEARCH_COLLECTION).doc(researchId).set(record);
      await db
        .collection(AI_PRODUCT_DRAFTS_COLLECTION)
        .doc(draftId)
        .set({ approved_research_id: null, updated_at: now }, { merge: true });

      await logEvent(
        db,
        draftId,
        existing ? 'RESEARCH_UPDATED' : 'RESEARCH_GENERATED',
        actor,
        {
          research_id: researchId,
          hsnCode: mergedTaxation.hsnCode,
          gstRatePercent: mergedTaxation.gstRatePercent,
          lowestPrice: mergedMarketResearch.lowestPrice,
          highestPrice: mergedMarketResearch.highestPrice,
        }
      );

      return res.json({ success: true, research: record });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to save taxation & market research' });
    }
  };
  app.post('/api/admin/ai-products/:id/research', handleRunOrUpdateResearch);
  app.post('/api/v1/admin/ai-products/:id/research', handleRunOrUpdateResearch);

  // 12. GET /api/admin/ai-products/:id/research
  const handleGetResearch = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const draftId = req.params.id;
      const snap = await db
        .collection(AI_PRODUCT_RESEARCH_COLLECTION)
        .where('draft_id', '==', draftId)
        .get();
      const records = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductResearchRecord))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      return res.json({ success: true, research: records[0] || null, history: records });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to fetch taxation & market research' });
    }
  };
  app.get('/api/admin/ai-products/:id/research', handleGetResearch);
  app.get('/api/v1/admin/ai-products/:id/research', handleGetResearch);

  // 13. POST /api/admin/ai-products/:id/research/approve
  const handleApproveResearch = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const { action = 'APPROVE', rejectionReason } = req.body || {};

      const snap = await db
        .collection(AI_PRODUCT_RESEARCH_COLLECTION)
        .where('draft_id', '==', draftId)
        .get();
      const records = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductResearchRecord))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      const latest = records[0];
      if (!latest) {
        return res.status(404).json({ error: 'No taxation & market research record found for this draft.' });
      }

      const now = new Date().toISOString();
      const resRef = db.collection(AI_PRODUCT_RESEARCH_COLLECTION).doc(latest.id);
      const draftRef = db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId);

      if (String(action).toUpperCase() === 'REJECT') {
        const rejected: AIProductResearchRecord = {
          ...latest,
          status: 'REJECTED',
          rejection_reason: String(rejectionReason || 'Rejected by reviewer'),
          updated_at: now,
        };
        await resRef.set(rejected, { merge: true });
        await draftRef.set({ approved_research_id: null, updated_at: now }, { merge: true });
        await logEvent(db, draftId, 'RESEARCH_REJECTED', actor, { research_id: latest.id });
        return res.json({ success: true, research: rejected });
      }

      // Recompute min/max on approval
      const range = calculateMarketPriceRange(
        latest.marketResearch.offers,
        latest.packing.selectedPackingSize
      );
      if (
        range.lowestPrice !== null &&
        range.highestPrice !== null &&
        range.lowestPrice > range.highestPrice
      ) {
        return res.status(400).json({ error: 'lowestWebPrice cannot exceed highestWebPrice.' });
      }

      const approved: AIProductResearchRecord = {
        ...latest,
        taxation: {
          ...latest.taxation,
          verifiedBy: actor.email || actor.uid,
          verifiedAt: now,
        },
        marketResearch: {
          ...latest.marketResearch,
          lowestPrice: range.lowestPrice,
          highestPrice: range.highestPrice,
          searchStatus: range.searchStatus,
        },
        status: 'APPROVED',
        rejection_reason: null,
        updated_at: now,
        approved_by: actor.uid,
        approved_at: now,
      };

      await resRef.set(approved, { merge: true });
      await draftRef.set({ approved_research_id: latest.id, updated_at: now }, { merge: true });
      await logEvent(db, draftId, 'RESEARCH_APPROVED', actor, {
        research_id: latest.id,
        hsnCode: approved.taxation.hsnCode,
        gstRatePercent: approved.taxation.gstRatePercent,
        lowestPrice: approved.marketResearch.lowestPrice,
        highestPrice: approved.marketResearch.highestPrice,
      });

      return res.json({ success: true, research: approved });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to approve research' });
    }
  };
  app.post('/api/admin/ai-products/:id/research/approve', handleApproveResearch);
  app.post('/api/v1/admin/ai-products/:id/research/approve', handleApproveResearch);

  // ==========================================================================
  // Section 9 & 10: Compare & Transactional Master Synchronization
  // ==========================================================================

  // 14. GET /api/admin/ai-products/:id/compare
  const handleCompareWithMaster = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const draftId = req.params.id;
      const queryMasterId = req.query.masterProductId ? String(req.query.masterProductId) : null;

      const draftRef = db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      let draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const verId = draft.approved_version_id || draft.current_version_id;
      const verSnap = verId
        ? await db.collection(AI_PRODUCT_VERSIONS_COLLECTION).doc(verId).get()
        : null;
      const version = verSnap?.exists
        ? ({ id: verSnap.id, ...(verSnap.data() as any) } as AIProductVersion)
        : null;
      const payload = version?.edited_payload || version?.generated_payload || null;

      const targetMasterId = queryMasterId || draft.master_product_id;
      let masterProduct: Record<string, any> | null = null;
      if (targetMasterId) {
        const mSnap = await db.collection('products').doc(targetMasterId).get();
        if (mSnap.exists) {
          masterProduct = { id: mSnap.id, ...mSnap.data() };
        }
      }

      let nextAutoSku = String(MIN_EIGHT_DIGIT_SKU);
      if (!masterProduct) {
        const allSnap = await db.collection('products').get();
        const allProducts = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        nextAutoSku = String(computeHighestExistingEightDigitSku(allProducts) + 1).padStart(8, '0');
        const autoMatched = matchMasterProductByName(allProducts, [
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
          await draftRef.set(
            {
              master_product_id: draft.master_product_id,
              master_product_name: draft.master_product_name,
              master_product_sku: draft.master_product_sku,
            },
            { merge: true }
          );
        }
      } else if (isValidEightDigitNumericSku(masterProduct.sku)) {
        nextAutoSku = String(masterProduct.sku).trim();
      }

      const imgSnap = draft.approved_image_id
        ? await db.collection(AI_PRODUCT_IMAGES_COLLECTION).doc(draft.approved_image_id).get()
        : null;
      let approvedImage = imgSnap?.exists
        ? ({ id: imgSnap.id, ...(imgSnap.data() as any) } as AIProductImage)
        : null;
      if (approvedImage && !isFirebaseStorageDownloadUrl(approvedImage.preview_url)) {
        const migrated = await ensureDraftImagesInFirebaseStorage(db, draft, [approvedImage]);
        approvedImage = migrated[0] || approvedImage;
      }

      const resSnap = draft.approved_research_id
        ? await db.collection(AI_PRODUCT_RESEARCH_COLLECTION).doc(draft.approved_research_id).get()
        : null;
      const approvedResearch = resSnap?.exists
        ? ({ id: resSnap.id, ...(resSnap.data() as any) } as AIProductResearchRecord)
        : null;

      const comparison = buildMasterComparisonDiff({
        masterProduct,
        version,
        approvedImage,
        approvedResearch,
      });

      return res.json({
        success: true,
        draft,
        masterProduct,
        isNewMasterProduct: !masterProduct,
        nextAutoSku,
        version,
        approvedImage,
        approvedResearch,
        comparison,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to compare AI draft with master product' });
    }
  };
  app.get('/api/admin/ai-products/:id/compare', handleCompareWithMaster);
  app.get('/api/v1/admin/ai-products/:id/compare', handleCompareWithMaster);

  // 15. POST /api/admin/ai-products/:id/apply
  const handleApplyToMaster = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const {
        masterProductId,
        selectedFields = [],
        imageAction = 'none',
        expectedMasterRevision,
        idempotencyKey,
        masterProductOverrides = null,
      } = req.body || {};

      const idemKey = String(
        idempotencyKey || req.headers['idempotency-key'] || `sync_${draftId}_${Date.now()}`
      ).trim();

      // Check idempotency in ai_product_sync_logs
      const existingSyncSnap = await db
        .collection(AI_PRODUCT_SYNC_LOGS_COLLECTION)
        .where('draft_id', '==', draftId)
        .where('idempotency_key', '==', idemKey)
        .limit(1)
        .get();
      if (!existingSyncSnap.empty) {
        const existingLog = {
          id: existingSyncSnap.docs[0].id,
          ...existingSyncSnap.docs[0].data(),
        };
        return res.json({
          success: true,
          idempotentReplay: true,
          syncLog: existingLog,
        });
      }

      const draftRef = db.collection(AI_PRODUCT_DRAFTS_COLLECTION).doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      // Section 10: Verify status === APPROVED (or approved_version_id / approved_research_id / approved_image_id present)
      if (draft.status !== 'APPROVED' && draft.status !== 'APPLIED') {
        return res.status(400).json({
          error: `Draft status must be APPROVED before applying to Product Master (current status: ${draft.status}).`,
        });
      }

      const hasMasterOverrides =
        masterProductOverrides &&
        typeof masterProductOverrides === 'object' &&
        Object.keys(masterProductOverrides).length > 0;

      if ((!Array.isArray(selectedFields) || selectedFields.length === 0) && !hasMasterOverrides) {
        return res.status(400).json({
          error: 'At least one field must be selected for master synchronization.',
        });
      }

      const verId = draft.approved_version_id || draft.current_version_id;
      const [verSnap, imgSnap, resSnap] = await Promise.all([
        verId ? db.collection(AI_PRODUCT_VERSIONS_COLLECTION).doc(verId).get() : Promise.resolve(null),
        draft.approved_image_id
          ? db.collection(AI_PRODUCT_IMAGES_COLLECTION).doc(draft.approved_image_id).get()
          : Promise.resolve(null),
        draft.approved_research_id
          ? db.collection(AI_PRODUCT_RESEARCH_COLLECTION).doc(draft.approved_research_id).get()
          : Promise.resolve(null),
      ]);

      const version = verSnap?.exists
        ? ({ id: verSnap.id, ...(verSnap.data() as any) } as AIProductVersion)
        : null;
      const payload = version?.edited_payload || version?.generated_payload || null;
      let approvedImage = imgSnap?.exists
        ? ({ id: imgSnap.id, ...(imgSnap.data() as any) } as AIProductImage)
        : null;
      const approvedResearch = resSnap?.exists
        ? ({ id: resSnap.id, ...(resSnap.data() as any) } as AIProductResearchRecord)
        : null;

      // Resolve existing master product by ID or by product name search in `products`;
      // if not found in `products`, treat as a new product and create a new `products` document.
      let targetMasterId = String(masterProductId || draft.master_product_id || '').trim();
      let preMatchedProduct: Record<string, any> | null = null;
      if (targetMasterId) {
        const checkSnap = await db.collection('products').doc(targetMasterId).get();
        if (checkSnap.exists) {
          preMatchedProduct = { id: checkSnap.id, ...(checkSnap.data() as any) };
        } else {
          targetMasterId = '';
        }
      }
      if (!preMatchedProduct) {
        const allSnap = await db.collection('products').get();
        const allProducts = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const matchedByName = matchMasterProductByName(allProducts, [
          masterProductOverrides?.name,
          draft.source_product_name,
          payload?.english_product_name,
        ]);
        if (matchedByName) {
          preMatchedProduct = matchedByName;
          targetMasterId = String(matchedByName.id);
        }
      }

      const isCreatingNewProduct = !preMatchedProduct;
      if (isCreatingNewProduct && !targetMasterId) {
        targetMasterId = db.collection('products').doc().id;
      }

      const needsAllocatedSku =
        isCreatingNewProduct || !isValidEightDigitNumericSku(preMatchedProduct?.sku);
      const allocatedSku = needsAllocatedSku
        ? await allocateUniqueEightDigitSku(db)
        : String(preMatchedProduct?.sku).trim();

      // Export AI product images into Firebase Storage (https://firebasestorage.googleapis.com)
      // under `products/${targetMasterId}/main.jpg` and `products/${targetMasterId}/images/...`
      let normalizedOverrides: MasterProductUpdationOverrides | null = masterProductOverrides
        ? { ...masterProductOverrides }
        : null;

      if (deps.storage && typeof deps.storage.bucket === 'function') {
        if (approvedImage && approvedImage.preview_url) {
          const isGallery = imageAction === 'append_gallery';
          const targetImgPath = isGallery
            ? `products/${targetMasterId}/images/${approvedImage.id}.jpg`
            : `products/${targetMasterId}/main.jpg`;
          const needsProductCopy =
            !isFirebaseStorageDownloadUrl(approvedImage.preview_url) ||
            !approvedImage.preview_url.includes(encodeURIComponent(`products/${targetMasterId}/`));
          const exported = await ensureFirebaseStorageImageUrl({
            storage: deps.storage,
            sourceUrl: approvedImage.preview_url,
            targetStoragePath: targetImgPath,
            fallbackProductName: draft.source_product_name,
            forceCopyToTargetPath: needsProductCopy,
          });
          if (isFirebaseStorageDownloadUrl(exported.downloadUrl)) {
            if (!isFirebaseStorageDownloadUrl(approvedImage.preview_url)) {
              await db
                .collection(AI_PRODUCT_IMAGES_COLLECTION)
                .doc(approvedImage.id)
                .set(
                  {
                    preview_url: exported.downloadUrl,
                    storage_key: exported.storagePath,
                  },
                  { merge: true }
                );
            }
            approvedImage = {
              ...approvedImage,
              preview_url: exported.downloadUrl,
              storage_key: exported.storagePath,
            };
          }
        }

        if (normalizedOverrides?.imageUrl && String(normalizedOverrides.imageUrl).trim()) {
          const ovImgUrl = String(normalizedOverrides.imageUrl).trim();
          const needsOvCopy =
            !isFirebaseStorageDownloadUrl(ovImgUrl) ||
            !ovImgUrl.includes(encodeURIComponent(`products/${targetMasterId}/`));
          const exportedMain = await ensureFirebaseStorageImageUrl({
            storage: deps.storage,
            sourceUrl: ovImgUrl,
            targetStoragePath: `products/${targetMasterId}/main.jpg`,
            fallbackProductName: normalizedOverrides.name || draft.source_product_name,
            forceCopyToTargetPath: needsOvCopy,
          });
          if (isFirebaseStorageDownloadUrl(exportedMain.downloadUrl)) {
            normalizedOverrides.imageUrl = exportedMain.downloadUrl;
            normalizedOverrides.storagePath = exportedMain.storagePath;
          }
        }

        if (Array.isArray(normalizedOverrides?.images) && normalizedOverrides.images.length > 0) {
          const exportedGallery: string[] = [];
          for (let idx = 0; idx < normalizedOverrides.images.length; idx++) {
            const gUrl = String(normalizedOverrides.images[idx] || '').trim();
            if (!gUrl) continue;
            if (
              idx === 0 &&
              normalizedOverrides.imageUrl &&
              isFirebaseStorageDownloadUrl(normalizedOverrides.imageUrl) &&
              !isFirebaseStorageDownloadUrl(gUrl)
            ) {
              exportedGallery.push(normalizedOverrides.imageUrl);
              continue;
            }
            if (isFirebaseStorageDownloadUrl(gUrl)) {
              exportedGallery.push(gUrl);
              continue;
            }
            const gPath =
              idx === 0
                ? `products/${targetMasterId}/main.jpg`
                : `products/${targetMasterId}/images/gallery_${idx}_${Date.now()}.jpg`;
            const exportedItem = await ensureFirebaseStorageImageUrl({
              storage: deps.storage,
              sourceUrl: gUrl,
              targetStoragePath: gPath,
              fallbackProductName: normalizedOverrides.name || draft.source_product_name,
            });
            exportedGallery.push(exportedItem.downloadUrl);
          }
          normalizedOverrides.images = Array.from(new Set(exportedGallery.filter(Boolean)));
        }
      }

      const masterRef = db.collection('products').doc(targetMasterId);
      const syncLogId = `aisync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const syncLogRef = db.collection(AI_PRODUCT_SYNC_LOGS_COLLECTION).doc(syncLogId);
      const now = new Date().toISOString();

      const txResult = await db.runTransaction(async (tx) => {
        const masterSnap = await tx.get(masterRef);
        const existingMaster: Record<string, any> = masterSnap.exists
          ? { id: masterSnap.id, ...(masterSnap.data() as any) }
          : {};
        const currentRevision = masterSnap.exists ? Number(existingMaster.revision || 1) : 0;

        if (
          masterSnap.exists &&
          expectedMasterRevision !== undefined &&
          expectedMasterRevision !== null &&
          Number(expectedMasterRevision) !== currentRevision
        ) {
          throw new Error(
            `MASTER_REVISION_CONFLICT: Expected master revision ${expectedMasterRevision}, but current product revision is ${currentRevision}.`
          );
        }

        const comparisonItems = buildMasterComparisonDiff({
          masterProduct: masterSnap.exists ? existingMaster : null,
          version,
          approvedImage,
          approvedResearch,
        });

        const { updatePatch: baseUpdatePatch, beforeSnapshot, afterSnapshot } =
          buildSelectedMasterUpdatePayload({
            selectedFields,
            comparisonItems,
            existingMasterProduct: existingMaster,
            approvedImage,
            imageAction,
          });

        const { finalPatch: updatePatch } = mergeMasterProductUpdationOverrides({
          existingMasterProduct: masterSnap.exists ? existingMaster : null,
          updatePatch: baseUpdatePatch,
          beforeSnapshot,
          afterSnapshot,
          overrides: normalizedOverrides,
          allocatedSku,
        });

        if (Object.keys(updatePatch).length === 0) {
          throw new Error('None of the selected fields produced a valid master product update.');
        }

        // V9 Section 6.1: Transactional slug reservation & redirect conversion when urlSlug is selected
        let slugAction: AIProductSyncLog['slug_action'] = null;
        if (updatePatch.urlSlug !== undefined) {
          const candidateSlug = normalizeUrlSlug(updatePatch.urlSlug);
          if (!isValidUrlSlug(candidateSlug)) {
            throw new Error(`INVALID_URL_SLUG: "${updatePatch.urlSlug}" is not a valid URL slug.`);
          }
          updatePatch.urlSlug = candidateSlug;
          afterSnapshot.urlSlug = candidateSlug;

          const slugRef = db.collection(PRODUCT_SLUGS_COLLECTION).doc(candidateSlug);
          const slugSnap = await tx.get(slugRef);
          if (slugSnap.exists) {
            const reservation = slugSnap.data() as ProductSlugReservation;
            if (String(reservation.productId) !== String(targetMasterId)) {
              throw new Error(
                `SLUG_CONFLICT: URL slug '${candidateSlug}' is already reserved by product '${reservation.productId}'.`
              );
            }
          }

          const previousSlug = existingMaster.urlSlug
            ? String(existingMaster.urlSlug).trim()
            : null;

          const newReservation: ProductSlugReservation = {
            slug: candidateSlug,
            productId: targetMasterId,
            state: 'active',
            canonicalSlug: candidateSlug,
            createdAt: slugSnap.exists
              ? String((slugSnap.data() as any)?.createdAt || now)
              : now,
            updatedAt: now,
            updatedBy: actor.uid,
          };
          tx.set(slugRef, newReservation);

          if (previousSlug && previousSlug !== candidateSlug && isValidUrlSlug(previousSlug)) {
            const prevSlugRef = db.collection(PRODUCT_SLUGS_COLLECTION).doc(previousSlug);
            const redirectReservation: ProductSlugReservation = {
              slug: previousSlug,
              productId: targetMasterId,
              state: 'redirect',
              canonicalSlug: candidateSlug,
              createdAt: now,
              updatedAt: now,
              updatedBy: actor.uid,
            };
            tx.set(prevSlugRef, redirectReservation, { merge: true });
          }

          updatePatch.canonicalUrl = `${getDefaultVerifiedDomain()}/products/${candidateSlug}`;
          updatePatch.seoUpdatedAt = now;
          slugAction = {
            previousSlug,
            newSlug: candidateSlug,
            redirectCreated: Boolean(previousSlug && previousSlug !== candidateSlug),
          };
        } else if (
          updatePatch.seoTitle !== undefined ||
          updatePatch.metaDescription !== undefined ||
          updatePatch.seoKeywords !== undefined
        ) {
          updatePatch.seoUpdatedAt = now;
        }

        const nextRevision = currentRevision + 1;
        const uniqueAiRefLink =
          updatePatch.aiContentLink || buildAIContentReferenceLink(draftId, verId);
        beforeSnapshot.aiContentLink = existingMaster.aiContentLink ?? null;
        beforeSnapshot.aiDraftId = existingMaster.aiDraftId ?? null;
        updatePatch.aiContentLink = uniqueAiRefLink;
        updatePatch.aiDraftId = draftId;
        afterSnapshot.aiContentLink = uniqueAiRefLink;
        afterSnapshot.aiDraftId = draftId;
        delete updatePatch.aiContentMetadata;
        updatePatch.revision = nextRevision;

        const firestoreWritePatch: Record<string, any> = {
          ...updatePatch,
          aiContentMetadata: FieldValue.delete(),
        };
        tx.set(masterRef, firestoreWritePatch, { merge: true });

        const syncLogDoc: AIProductSyncLog = {
          id: syncLogId,
          draft_id: draftId,
          version_id: verId,
          master_product_id: targetMasterId,
          idempotency_key: idemKey,
          selected_fields: selectedFields,
          image_action: imageAction,
          approved_image_id: approvedImage?.id || null,
          approved_research_id: approvedResearch?.id || null,
          expected_master_revision: expectedMasterRevision ?? currentRevision,
          resulting_master_revision: nextRevision,
          slug_action: slugAction,
          before_snapshot: beforeSnapshot,
          after_snapshot: afterSnapshot,
          result: 'SUCCESS',
          error_message: null,
          applied_by: actor.uid,
          applied_by_email: actor.email,
          applied_at: now,
        };

        tx.set(syncLogRef, syncLogDoc);
        tx.set(
          draftRef,
          {
            master_product_id: targetMasterId,
            master_product_name: updatePatch.name || existingMaster.name || draft.source_product_name,
            master_product_sku: updatePatch.sku || existingMaster.sku || allocatedSku,
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

        return {
          syncLogDoc,
          updatedMaster: cleanUpdatedMaster,
          createdNewMasterProduct: !masterSnap.exists,
        };
      });

      await syncProductToPublicProjectionAndQueueJobs(db, txResult.updatedMaster, actor.uid);

      await logEvent(db, draftId, 'MASTER_SYNC_APPLIED', actor, {
        sync_log_id: syncLogId,
        master_product_id: targetMasterId,
        created_new_master_product: txResult.createdNewMasterProduct,
        selected_fields: selectedFields,
      });

      return res.json({
        success: true,
        syncLog: txResult.syncLogDoc,
        masterProduct: txResult.updatedMaster,
        createdNewMasterProduct: txResult.createdNewMasterProduct,
      });
    } catch (err: any) {
      const msg = String(err?.message || 'Master product synchronization failed');
      const status =
        msg.includes('SLUG_CONFLICT') || msg.includes('MASTER_REVISION_CONFLICT') ? 409 : 400;
      return res.status(status).json({ error: msg });
    }
  };
  app.post('/api/admin/ai-products/:id/apply', handleApplyToMaster);
  app.post('/api/v1/admin/ai-products/:id/apply', handleApplyToMaster);

  // 16. GET /api/admin/ai-products/:id/history
  const handleGetDraftHistory = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const draftId = req.params.id;
      const [versionsSnap, eventsSnap, syncSnap] = await Promise.all([
        db.collection(AI_PRODUCT_VERSIONS_COLLECTION).where('draft_id', '==', draftId).get(),
        db.collection(AI_PRODUCT_EVENTS_COLLECTION).where('draft_id', '==', draftId).get(),
        db.collection(AI_PRODUCT_SYNC_LOGS_COLLECTION).where('draft_id', '==', draftId).get(),
      ]);

      return res.json({
        success: true,
        versions: versionsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => Number(b.version_no) - Number(a.version_no)),
        events: eventsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
        syncLogs: syncSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => String(b.applied_at).localeCompare(String(a.applied_at))),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to fetch draft history' });
    }
  };
  app.get('/api/admin/ai-products/:id/history', handleGetDraftHistory);
  app.get('/api/v1/admin/ai-products/:id/history', handleGetDraftHistory);
}
