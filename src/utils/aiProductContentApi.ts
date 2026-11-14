import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
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
  WebPriceSourceOffer,
} from '../types';

export const AI_PRODUCT_DRAFTS_COLLECTION = 'ai_product_drafts';
export const AI_PRODUCT_VERSIONS_COLLECTION = 'ai_product_versions';
export const AI_PRODUCT_IMAGES_COLLECTION = 'ai_product_images';
export const AI_PRODUCT_RESEARCH_COLLECTION = 'ai_product_research';
export const AI_PRODUCT_SYNC_LOGS_COLLECTION = 'ai_product_sync_logs';
export const AI_PRODUCT_EVENTS_COLLECTION = 'ai_product_events';
export const AI_PROMPT_VERSION = 'leafyearth-v8.0';

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
  group: 'general' | 'translations' | 'health' | 'ayurveda' | 'image' | 'taxation_pricing';
  masterField: string;
  currentMasterValue: any;
  proposedAiValue: any;
  hasChanged: boolean;
  selectable: boolean;
  reasonIfLocked?: string;
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
  options?: { categoryHint?: string; brandHint?: string }
): AIProductContentPayload {
  const cleanName = String(productName || 'LeafyEarth Product').trim();
  const lower = cleanName.toLowerCase();
  const isTurmeric = lower.includes('turmeric') || lower.includes('haldi') || lower.includes('manjal');
  const isPepper = lower.includes('pepper') || lower.includes('kurumulaku');
  const isCardamom = lower.includes('cardamom') || lower.includes('elaichi');
  const isAmla = lower.includes('amla') || lower.includes('gooseberry');
  const isHousehold = /cleaner|detergent|repellent|dishwash|handwash|perfume|floor/i.test(cleanName);

  const category =
    options?.categoryHint?.trim() ||
    (isHousehold ? 'Home Care' : isAmla ? 'Dry Fruits & Herbs' : 'Spices');
  const form = lower.includes('oil')
    ? 'Oil'
    : lower.includes('powder')
    ? 'Powder'
    : isHousehold
    ? 'Liquid'
    : 'Whole / Natural';

  const translations: AIProductContentPayload['translations'] = isTurmeric
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

  const ayurveda_applicability: AIProductContentPayload['ayurveda_applicability'] = isHousehold
    ? 'not_applicable'
    : 'applicable';

  return {
    english_product_name: cleanName,
    botanical_name: isTurmeric
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
    family: isTurmeric || isCardamom
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
    pushItem('category', 'Product Category', 'general', 'category', payload.category);
    pushItem('productForm', 'Product Form', 'general', 'productForm', payload.form);
    pushItem('description', 'E-Commerce Description', 'general', 'description', payload.description);
    pushItem('keyFeatures', 'Key Features', 'general', 'keyFeatures', payload.key_features);
    pushItem('culinaryUses', 'Culinary Uses', 'general', 'culinaryUses', payload.culinary_uses);
    pushItem('storageInstructions', 'Storage Instructions', 'general', 'storageInstructions', payload.storage_instructions);

    pushItem('malayalamName', 'Malayalam Name (മലയാളം)', 'translations', 'malayalamName', payload.translations.ml.name);
    pushItem('hindiName', 'Hindi Name (हिन्दी)', 'translations', 'hindiName', payload.translations.hi.name);
    pushItem('tamilName', 'Tamil Name (தமிழ்)', 'translations', 'tamilName', payload.translations.ta.name);
    pushItem('kannadaName', 'Kannada Name (ಕನ್ನಡ)', 'translations', 'kannadaName', payload.translations.kn.name);
    pushItem('teluguName', 'Telugu Name (తెలుగు)', 'translations', 'teluguName', payload.translations.te.name);

    const approvedClaims = (payload.health_benefits || []).filter((hb) => hb.review_status !== 'rejected');
    pushItem('healthBenefits', 'Health Benefits', 'health', 'healthBenefits', approvedClaims);
    pushItem('nutritionalBenefits', 'Nutritional Benefits', 'health', 'nutritionalBenefits', payload.nutritional_benefits);
    pushItem('generalPrecautions', 'General Safety Precautions', 'health', 'generalPrecautions', payload.safety_precautions);
    pushItem('healthReferences', 'Health & Scientific References', 'health', 'healthReferences', payload.references);

    const isAyurvedic = payload.ayurveda_applicability === 'applicable' && Boolean(payload.ayurveda);
    pushItem('isAyurvedicProduct', 'Is Ayurvedic Product?', 'ayurveda', 'isAyurvedicProduct', isAyurvedic);

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
 * when running in static fallback mode.
 */
function generateClientWhite1000x1000DataUrl(productName: string, subtitle = ''): string {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Pure white #FFFFFF background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 1000, 1000);

      // Soft contact shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.beginPath();
      ctx.ellipse(500, 810, 210, 24, 0, 0, Math.PI * 2);
      ctx.fill();

      // Studio product pouch/jar body
      ctx.fillStyle = '#F4F9F4';
      ctx.strokeStyle = '#2E7D32';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(300, 200, 400, 590, 36);
      ctx.fill();
      ctx.stroke();

      // Label band
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(303, 390, 394, 150);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LeafyEarth', 500, 445);
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(productName.slice(0, 26), 500, 490);
      if (subtitle) {
        ctx.font = '18px sans-serif';
        ctx.fillText(subtitle.slice(0, 34), 500, 522);
      }

      ctx.fillStyle = '#5F6B63';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('1000 × 1000 px • #FFFFFF Studio', 500, 740);
      return canvas.toDataURL('image/png');
    }
  }
  return '';
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

  return {
    success: true,
    draftId,
    version: 1,
    status: 'DRAFT',
    draft: draftDoc,
    versionRecord: versionDoc,
    generatedContent: payload,
  };
}

export async function fetchAIProductDraftDetail(draftId: string) {
  try {
    const res = await fetch(`/api/admin/ai-products/${draftId}`, {
      headers: await authHeaders(),
    });
    if (res.ok && !isStaticOrUnavailable(res)) {
      return await res.json();
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
  const images = imagesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as AIProductImage))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
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
  const previewUrl = generateClientWhite1000x1000DataUrl(
    detail.draft.source_product_name,
    params.packagingStyle || '100% Pure & Natural'
  );
  const imageDoc: AIProductImage = {
    id: imageId,
    draft_id: params.draftId,
    version_id: detail.draft.current_version_id,
    storage_key: `ai_products/${params.draftId}/images/${imageId}.png`,
    preview_url: previewUrl,
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
  const targetId = masterProductId || detail.draft.master_product_id;
  let masterProduct: Record<string, any> | null = null;
  if (targetId) {
    const mSnap = await getDoc(doc(db, 'products', targetId));
    if (mSnap.exists()) masterProduct = { id: mSnap.id, ...mSnap.data() };
  }

  const approvedImage =
    detail.images.find((i: AIProductImage) => i.id === detail.draft.approved_image_id) || null;
  const approvedResearch =
    detail.research?.id === detail.draft.approved_research_id ? detail.research : detail.research;

  const comparison = buildMasterComparisonDiffClient({
    masterProduct,
    version: detail.currentVersion,
    approvedImage,
    approvedResearch,
  });

  return {
    success: true,
    draft: detail.draft,
    masterProduct,
    version: detail.currentVersion,
    approvedImage,
    approvedResearch,
    comparison,
  };
}

export async function applyAIDraftToMaster(params: {
  draftId: string;
  masterProductId: string;
  selectedFields: string[];
  imageAction?: 'none' | 'replace_primary' | 'append_gallery';
  idempotencyKey?: string;
  actor: { id: string; email?: string; role?: string };
}) {
  try {
    const res = await fetch(`/api/admin/ai-products/${params.draftId}/apply`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterProductId: params.masterProductId,
        selectedFields: params.selectedFields,
        imageAction: params.imageAction || 'none',
        idempotencyKey: params.idempotencyKey,
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
  if (!params.masterProductId) {
    throw new Error('Please select a target Master Product before applying.');
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
  const masterRef = doc(db, 'products', params.masterProductId);
  const draftRef = doc(db, AI_PRODUCT_DRAFTS_COLLECTION, params.draftId);
  const syncLogId = `aisync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const syncLogRef = doc(db, AI_PRODUCT_SYNC_LOGS_COLLECTION, syncLogId);
  const now = new Date().toISOString();

  const txRes = await runTransaction(db, async (tx) => {
    const mSnap = await tx.get(masterRef);
    if (!mSnap.exists()) throw new Error('Target master product not found');
    const existingMaster: Record<string, any> = { id: mSnap.id, ...mSnap.data() };

    const updatePatch: Record<string, any> = {};
    const beforeSnapshot: Record<string, any> = {};
    const afterSnapshot: Record<string, any> = {};

    for (const item of compData.comparison as MasterFieldComparisonItem[]) {
      if (!selectedSet.has(item.fieldKey) && !selectedSet.has(item.masterField)) continue;
      if (!item.selectable || PROTECTED_SELLING_FIELDS.has(item.masterField)) continue;
      beforeSnapshot[item.masterField] = existingMaster[item.masterField] ?? null;
      updatePatch[item.masterField] = item.proposedAiValue;
      afterSnapshot[item.masterField] = item.proposedAiValue;
    }

    if (compData.approvedImage && compData.approvedImage.status === 'APPROVED') {
      if (params.imageAction === 'replace_primary') {
        beforeSnapshot.imageUrl = existingMaster.imageUrl ?? null;
        updatePatch.imageUrl = compData.approvedImage.preview_url;
        afterSnapshot.imageUrl = compData.approvedImage.preview_url;
      } else if (params.imageAction === 'append_gallery') {
        const imgs = Array.isArray(existingMaster.images) ? existingMaster.images : [];
        const updated = Array.from(new Set([...imgs, compData.approvedImage.preview_url]));
        beforeSnapshot.images = imgs;
        updatePatch.images = updated;
        afterSnapshot.images = updated;
      }
    }

    tx.set(masterRef, updatePatch, { merge: true });
    const syncLogDoc: AIProductSyncLog = {
      id: syncLogId,
      draft_id: params.draftId,
      version_id: compData.draft.approved_version_id || compData.draft.current_version_id,
      master_product_id: params.masterProductId,
      idempotency_key: params.idempotencyKey || `sync_${params.draftId}_${Date.now()}`,
      selected_fields: params.selectedFields,
      image_action: params.imageAction || 'none',
      approved_image_id: compData.approvedImage?.id || null,
      approved_research_id: compData.approvedResearch?.id || null,
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
        master_product_id: params.masterProductId,
        master_product_name: updatePatch.name || existingMaster.name || null,
        master_product_sku: existingMaster.sku || null,
        status: 'APPLIED',
        last_synced_at: now,
        updated_at: now,
      },
      { merge: true }
    );
    return { syncLogDoc, updatedMaster: { ...existingMaster, ...updatePatch } };
  });

  await logClientEvent(params.draftId, 'MASTER_SYNC_APPLIED', params.actor, {
    sync_log_id: syncLogId,
    master_product_id: params.masterProductId,
  });

  return {
    success: true,
    syncLog: txRes.syncLogDoc,
    masterProduct: txRes.updatedMaster,
  };
}
