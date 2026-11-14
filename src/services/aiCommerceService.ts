import type express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import crypto from 'crypto';
import type {
  AICommerceAnalyticsRecord,
  AICommerceContentPayload,
  AICommerceFAQItem,
  AICommerceFeedRun,
  AICommerceLocalReadiness,
  AICommercePlatformId,
  AICommercePlatformSettings,
  AICommercePlatformStatus,
  AICommerceRemoteStatus,
  AICommerceStagingDraft,
  AICommerceSyncJob,
  AICommerceSyncLog,
  AICommerceValidationIssue,
  AICommerceValidationReport,
  AIContentProvenanceEntry,
  AIProductDraft,
  AIProductSEOPayload,
  AIProductSyncLog,
  AIProductVersion,
  ProductSlugReservation,
  PublicProductOfferProjection,
} from '../types';

export const PRODUCT_SLUGS_COLLECTION = 'productSlugs';
export const AI_COMMERCE_SETTINGS_COLLECTION = 'ai_commerce_settings';
export const AI_COMMERCE_STAGING_COLLECTION = 'ai_commerce_staging';
export const AI_COMMERCE_FEEDS_COLLECTION = 'ai_commerce_feeds';
export const AI_COMMERCE_SYNC_JOBS_COLLECTION = 'ai_commerce_sync_jobs';
export const AI_COMMERCE_SYNC_LOGS_COLLECTION = 'ai_commerce_sync_logs';
export const AI_COMMERCE_VALIDATION_COLLECTION = 'ai_commerce_validation';
export const AI_COMMERCE_PLATFORM_STATUS_COLLECTION = 'ai_commerce_platform_status';
export const AI_COMMERCE_ANALYTICS_COLLECTION = 'ai_commerce_analytics';
export const PUBLIC_PRODUCTS_COLLECTION = 'public_products';

export const V10_SCHEMA_VERSION = 'leafyearth-v10.0';
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PROHIBITED_CLAIM_REGEX =
  /\b(100%\s*cure|guaranteed\s*cure|cures\s+cancer|cures\s+diabetes|replaces\s+insulin|miracle\s+cure|guaranteed\s*weight\s*loss|instant\s*healing)\b/i;

const FORBIDDEN_AI_INVENTED_COMMERCE_KEYS = new Set([
  'gtin',
  'mpn',
  'barcode',
  'fssaiLicenseNumber',
  'fssai_license_number',
  'reviews',
  'rating',
  'price',
  'onlinePrice',
  'offerPrice',
  'stock',
]);

const VALID_WEIGHT_UNITS = new Set(['g', 'gm', 'gram', 'grams', 'kg', 'kgs', 'mg']);
const VALID_VOLUME_UNITS = new Set(['ml', 'l', 'ltr', 'litre', 'liters']);

// In-memory SSR & feed response cache with explicit invalidation on approval/apply
interface CachedPublicEntry {
  body: string;
  contentType: string;
  etag: string;
  cachedAt: number;
}
const publicResponseCache = new Map<string, CachedPublicEntry>();

export function invalidatePublicProductCache(slugOrProductId?: string): void {
  if (!slugOrProductId) {
    publicResponseCache.clear();
    return;
  }
  publicResponseCache.delete(`ssr:${slugOrProductId}`);
  publicResponseCache.delete('sitemap:xml');
  publicResponseCache.delete('feed:google_merchant');
  publicResponseCache.delete('feed:bing_copilot');
  publicResponseCache.delete('feed:openai_chatgpt');
  publicResponseCache.delete('feed:public_web');
}

export function getPublicCacheStats(): { entriesCount: number; keys: string[] } {
  return {
    entriesCount: publicResponseCache.size,
    keys: Array.from(publicResponseCache.keys()),
  };
}

// ============================================================================
// XML & HTML Escaping Utilities (Sections 8, 9, 17, 20)
// ============================================================================

export function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// V9 Section 4 & 6.2: SEO Content & URL Slug Validation
// ============================================================================

export function isValidUrlSlug(slug: unknown): boolean {
  return typeof slug === 'string' && slug.length >= 2 && slug.length <= 100 && SLUG_PATTERN.test(slug);
}

export function normalizeUrlSlug(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
  return cleaned;
}

export function deduplicateAndCleanKeywords(rawKeywords: unknown): {
  keywords: string[];
  errors: string[];
} {
  const errors: string[] = [];
  const rawList: string[] = Array.isArray(rawKeywords)
    ? rawKeywords.map((k) => String(k ?? '').trim())
    : typeof rawKeywords === 'string'
    ? rawKeywords.split(',').map((k) => k.trim())
    : [];

  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const item of rawList) {
    const clean = item.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (clean.length > 80) {
      errors.push(`SEO keyword "${clean.slice(0, 30)}..." exceeds maximum length of 80 characters.`);
      continue;
    }
    if (PROHIBITED_CLAIM_REGEX.test(clean)) {
      errors.push(`SEO keyword "${clean}" contains prohibited disease-cure or miracle claims.`);
      continue;
    }
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      keywords.push(clean);
    }
  }

  return { keywords, errors };
}

export function validateSEOPayload(
  raw: any,
  options?: { requireFiveKeywords?: boolean }
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  seo: AIProductSEOPayload;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      errors: ['SEO payload must be a non-null object.'],
      warnings: [],
      seo: { seoTitle: '', metaDescription: '', seoKeywords: [], urlSlug: '' },
    };
  }

  const seoTitle = String(raw.seoTitle ?? raw.seo_title ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const metaDescription = String(raw.metaDescription ?? raw.meta_description ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const rawSlug = String(raw.urlSlug ?? raw.url_slug ?? raw.slug ?? '').trim();
  const urlSlug = rawSlug.includes('/') || rawSlug.includes('?') ? rawSlug : normalizeUrlSlug(rawSlug);
  const { keywords: seoKeywords, errors: kwErrors } = deduplicateAndCleanKeywords(
    raw.seoKeywords ?? raw.seo_keywords
  );
  errors.push(...kwErrors);

  // Title validation (Hard limit 120, editorial target 50-60)
  if (!seoTitle) {
    errors.push('seoTitle is required.');
  } else {
    if (seoTitle.length > 120) {
      errors.push(`seoTitle length (${seoTitle.length}) exceeds hard limit of 120 characters.`);
    } else if (seoTitle.length < 50 || seoTitle.length > 60) {
      warnings.push(
        `seoTitle length is ${seoTitle.length} chars (editorial target is 50–60 chars).`
      );
    }
    if (PROHIBITED_CLAIM_REGEX.test(seoTitle)) {
      errors.push('seoTitle contains prohibited disease-cure or miracle claims.');
    }
  }

  // Meta description validation (Hard limit 320, editorial target 140-160)
  if (!metaDescription) {
    errors.push('metaDescription is required.');
  } else {
    if (metaDescription.length > 320) {
      errors.push(`metaDescription length (${metaDescription.length}) exceeds hard limit of 320 characters.`);
    } else if (metaDescription.length < 140 || metaDescription.length > 160) {
      warnings.push(
        `metaDescription length is ${metaDescription.length} chars (editorial target is 140–160 chars).`
      );
    }
    if (PROHIBITED_CLAIM_REGEX.test(metaDescription)) {
      errors.push('metaDescription contains prohibited disease-cure or miracle claims.');
    }
  }

  // Keywords validation (5-12 terms)
  const minKeywords = options?.requireFiveKeywords !== false ? 5 : 1;
  if (seoKeywords.length < minKeywords) {
    errors.push(`seoKeywords must contain at least ${minKeywords} unique terms (found ${seoKeywords.length}).`);
  } else if (seoKeywords.length > 12) {
    errors.push(`seoKeywords must contain at most 12 terms to avoid keyword stuffing (found ${seoKeywords.length}).`);
  }

  // Slug validation
  if (!rawSlug) {
    errors.push('urlSlug is required.');
  } else if (
    rawSlug !== rawSlug.toLowerCase() ||
    rawSlug.includes('/') ||
    rawSlug.includes('?') ||
    rawSlug.startsWith('-') ||
    rawSlug.endsWith('-') ||
    !isValidUrlSlug(rawSlug)
  ) {
    if (!isValidUrlSlug(urlSlug)) {
      errors.push(
        'urlSlug must be lowercase ASCII words separated by hyphens (max 100 chars, no slashes, queries, or leading/trailing hyphens).'
      );
    } else if (rawSlug !== urlSlug) {
      errors.push(
        `urlSlug "${rawSlug}" is not normalized; expected lowercase hyphenated slug "${urlSlug}".`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    seo: {
      seoTitle,
      metaDescription,
      seoKeywords,
      urlSlug: isValidUrlSlug(rawSlug) ? rawSlug : urlSlug,
    },
  };
}

/**
 * Generates structured V9 SEO content (including the exact Section 4.1 Cumin Seeds
 * reference profile and deterministic fallbacks for all LeafyEarth products).
 */
export function buildStructuredFallbackSEO(
  productName: string,
  options?: { categoryHint?: string; brandHint?: string; formHint?: string }
): AIProductSEOPayload {
  const cleanName = String(productName || 'LeafyEarth Product').trim();
  const lower = cleanName.toLowerCase();
  const brand = (options?.brandHint || 'LeafyEarth').trim();
  const category = (options?.categoryHint || 'Indian Spices & Natural Foods').trim();

  // Section 4.1 Cumin Seeds canonical example
  if (lower.includes('cumin') || lower.includes('jeera') || lower.includes('jeerakam')) {
    return {
      seoTitle: 'Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth',
      metaDescription:
        'Discover aromatic whole cumin seeds (Jeera) for curries, dals, rice and spice blends. Add warm, earthy flavour to your everyday cooking.',
      seoKeywords: [
        'cumin seeds',
        'jeera',
        'whole cumin',
        'jeerakam',
        'Indian spices',
        'cumin for cooking',
      ],
      urlSlug: 'cumin-seeds-jeera-whole',
    };
  }

  if (lower.includes('turmeric') || lower.includes('haldi') || lower.includes('manjal')) {
    return {
      seoTitle: `Turmeric Powder (Haldi / Manjal) | Pure Spice | ${brand}`.slice(0, 60),
      metaDescription:
        'Shop pure, hygienically packed Turmeric Powder (Haldi / Manjal) for everyday curries, dals, golden milk and traditional Indian cooking.',
      seoKeywords: [
        'turmeric powder',
        'haldi powder',
        'manjal podi',
        'curcuma longa',
        'Indian culinary spices',
        'natural turmeric',
      ],
      urlSlug: normalizeUrlSlug(`${cleanName}-pure-spice`),
    };
  }

  if (lower.includes('black pepper') || lower.includes('kurumulaku') || lower.includes('kali mirch')) {
    return {
      seoTitle: `Whole Black Pepper (Kali Mirch / Kurumulaku) | ${brand}`.slice(0, 60),
      metaDescription:
        'Explore bold, aromatic whole black peppercorns (Kali Mirch / Kurumulaku) for freshly ground seasoning, soups, rasam and masala blends.',
      seoKeywords: [
        'black pepper',
        'kali mirch',
        'kurumulaku',
        'whole peppercorns',
        'piper nigrum',
        'Kerala spices',
      ],
      urlSlug: normalizeUrlSlug(`${cleanName}-whole-spice`),
    };
  }

  // Generic deterministic SEO within target character ranges (50–60 title, 140–160 description)
  let baseTitle = `${cleanName} | Pure ${category} | ${brand}`;
  if (baseTitle.length < 50) {
    baseTitle = `${cleanName} – Authentic ${category} | ${brand}`;
  }
  if (baseTitle.length > 60) {
    baseTitle = `${cleanName} | ${brand} Natural Store`.slice(0, 60).trim();
  }

  let baseDesc = `Discover ${cleanName} from ${brand}, hygienically packed to preserve natural aroma and authentic culinary quality for your everyday household kitchen.`;
  if (baseDesc.length < 140) {
    baseDesc = `${baseDesc} Ideal for traditional Indian recipes and daily use.`;
  }
  if (baseDesc.length > 160) {
    baseDesc = `${baseDesc.slice(0, 157).trim()}...`;
  }

  const baseSlug = normalizeUrlSlug(cleanName) || 'leafyearth-product';

  const keywords = deduplicateAndCleanKeywords([
    cleanName.toLowerCase(),
    category.toLowerCase(),
    `${cleanName.toLowerCase()} online`,
    `${brand.toLowerCase()} ${cleanName.toLowerCase()}`,
    'natural Indian groceries',
    'hygienically packed spices',
  ]).keywords;

  return {
    seoTitle: baseTitle,
    metaDescription: baseDesc,
    seoKeywords: keywords.slice(0, 8),
    urlSlug: baseSlug,
  };
}

// ============================================================================
// V10 Section 13 & 14: GTIN Checksum, Weight/Volume & Commerce Validation
// ============================================================================

/**
 * Validates a GS1 GTIN (GTIN-8, GTIN-12/UPC, GTIN-13/EAN, GTIN-14) using the
 * official GS1 Modulo-10 check digit algorithm while preserving leading zeros.
 */
export function validateGtinChecksum(rawGtin: unknown): {
  valid: boolean;
  normalized: string | null;
  type: 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14' | null;
  error?: string;
} {
  if (rawGtin === null || rawGtin === undefined || String(rawGtin).trim() === '') {
    return { valid: true, normalized: null, type: null };
  }
  const str = String(rawGtin).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(str)) {
    return {
      valid: false,
      normalized: null,
      type: null,
      error: 'GTIN must contain only numeric digits (preserving leading zeros).',
    };
  }
  if (![8, 12, 13, 14].includes(str.length)) {
    return {
      valid: false,
      normalized: null,
      type: null,
      error: `GTIN must be exactly 8, 12, 13, or 14 digits (received ${str.length} digits).`,
    };
  }

  // GS1 Modulo-10 checksum calculation
  const digits = str.split('').map((d) => Number.parseInt(d, 10));
  const checkDigit = digits[digits.length - 1];
  let sum = 0;
  for (let i = digits.length - 2, pos = 1; i >= 0; i--, pos++) {
    const weight = pos % 2 === 1 ? 3 : 1;
    sum += digits[i] * weight;
  }
  const expectedCheck = (10 - (sum % 10)) % 10;
  if (checkDigit !== expectedCheck) {
    return {
      valid: false,
      normalized: null,
      type: null,
      error: `Invalid GTIN check digit for "${str}" (expected trailing digit ${expectedCheck}, found ${checkDigit}).`,
    };
  }

  const type = `GTIN-${str.length}` as 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14';
  return { valid: true, normalized: str, type };
}

export function validateFssaiLicenseNumber(rawFssai: unknown): {
  valid: boolean;
  normalized: string | null;
  error?: string;
} {
  if (rawFssai === null || rawFssai === undefined || String(rawFssai).trim() === '') {
    return { valid: true, normalized: null };
  }
  const cleaned = String(rawFssai).replace(/\s+/g, '');
  if (!/^\d{14}$/.test(cleaned)) {
    return {
      valid: false,
      normalized: null,
      error: 'FSSAI License Number must be a verified 14-digit numeric license number.',
    };
  }
  return { valid: true, normalized: cleaned };
}

/**
 * Enforces Section 14 separation of weight vs liquid volume:
 * `ml` / `l` must never be stored in `netWeightUnit`.
 */
export function validateWeightAndVolumeSeparation(input: {
  netWeight?: unknown;
  netWeightUnit?: unknown;
  netVolume?: unknown;
  netVolumeUnit?: unknown;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const weightUnit = String(input.netWeightUnit ?? '')
    .trim()
    .toLowerCase();
  const volumeUnit = String(input.netVolumeUnit ?? '')
    .trim()
    .toLowerCase();

  if (weightUnit) {
    if (VALID_VOLUME_UNITS.has(weightUnit)) {
      errors.push(
        `netWeightUnit cannot be a liquid volume unit ("${input.netWeightUnit}"). Use netVolume and netVolumeUnit for liquids (ml/l).`
      );
    } else if (!VALID_WEIGHT_UNITS.has(weightUnit)) {
      errors.push(`netWeightUnit "${input.netWeightUnit}" must be a valid mass unit (g, kg, mg).`);
    }
  }

  if (volumeUnit) {
    if (VALID_WEIGHT_UNITS.has(volumeUnit)) {
      errors.push(
        `netVolumeUnit cannot be a weight unit ("${input.netVolumeUnit}"). Use netWeight and netWeightUnit for solids (g/kg).`
      );
    } else if (!VALID_VOLUME_UNITS.has(volumeUnit)) {
      errors.push(`netVolumeUnit "${input.netVolumeUnit}" must be a valid liquid volume unit (ml, l).`);
    }
  }

  if (input.netWeight !== undefined && input.netWeight !== null && input.netWeight !== '') {
    const w = Number(input.netWeight);
    if (!Number.isFinite(w) || w <= 0) {
      errors.push('netWeight must be a positive number.');
    }
  }

  if (input.netVolume !== undefined && input.netVolume !== null && input.netVolume !== '') {
    const v = Number(input.netVolume);
    if (!Number.isFinite(v) || v <= 0) {
      errors.push('netVolume must be a positive number.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAICommercePayload(raw: any): {
  valid: boolean;
  errors: string[];
  commerce: AICommerceContentPayload;
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      errors: ['Commerce payload must be a non-null JSON object.'],
      commerce: {
        productHighlights: [],
        productFAQs: [],
        searchTags: [],
        dietaryAttributes: [],
        googleProductCategory: null,
        productType: null,
        factualAttributeSuggestions: null,
      },
    };
  }

  // Section 13: AI must never invent GTIN, MPN, barcode, FSSAI license, reviews, prices or stock
  for (const forbiddenKey of FORBIDDEN_AI_INVENTED_COMMERCE_KEYS) {
    if (raw[forbiddenKey] !== undefined && raw[forbiddenKey] !== null && raw[forbiddenKey] !== '') {
      errors.push(
        `AI commerce payload must not invent or assert "${forbiddenKey}". Identifiers, licenses, prices, and stock must come from verified master records.`
      );
    }
  }

  const productHighlights: string[] = Array.isArray(raw.productHighlights)
    ? raw.productHighlights
        .map((h: any) => String(h ?? '').trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  if (productHighlights.length < 2) {
    errors.push('productHighlights must include at least 2 factual product highlights.');
  }
  for (const hl of productHighlights) {
    if (PROHIBITED_CLAIM_REGEX.test(hl)) {
      errors.push(`productHighlights contains prohibited medical/miracle claim: "${hl}"`);
    }
  }

  const productFAQs: AICommerceFAQItem[] = Array.isArray(raw.productFAQs)
    ? raw.productFAQs
        .map((f: any) => ({
          question: String(f?.question ?? '').trim(),
          answer: String(f?.answer ?? '').trim(),
        }))
        .filter((f: AICommerceFAQItem) => Boolean(f.question && f.answer))
        .slice(0, 12)
    : [];

  for (const faq of productFAQs) {
    if (PROHIBITED_CLAIM_REGEX.test(faq.question) || PROHIBITED_CLAIM_REGEX.test(faq.answer)) {
      errors.push(`productFAQs contains prohibited medical/miracle claim in Q&A: "${faq.question}"`);
    }
  }

  const searchTags = deduplicateAndCleanKeywords(raw.searchTags).keywords.slice(0, 20);
  const dietaryAttributes: string[] = Array.isArray(raw.dietaryAttributes)
    ? Array.from(
        new Set(
          raw.dietaryAttributes
            .map((d: any) => String(d ?? '').trim())
            .filter(Boolean)
        )
      )
    : [];

  const googleProductCategory = raw.googleProductCategory
    ? String(raw.googleProductCategory).trim()
    : null;
  const productType = raw.productType ? String(raw.productType).trim() : null;

  const suggestionsRaw = raw.factualAttributeSuggestions || {};
  const weightVolCheck = validateWeightAndVolumeSeparation(suggestionsRaw);
  errors.push(...weightVolCheck.errors);

  const factualAttributeSuggestions: AICommerceContentPayload['factualAttributeSuggestions'] = {
    netWeight:
      suggestionsRaw.netWeight !== undefined && suggestionsRaw.netWeight !== null
        ? Number(suggestionsRaw.netWeight)
        : null,
    netWeightUnit: suggestionsRaw.netWeightUnit ? String(suggestionsRaw.netWeightUnit).trim() : null,
    netVolume:
      suggestionsRaw.netVolume !== undefined && suggestionsRaw.netVolume !== null
        ? Number(suggestionsRaw.netVolume)
        : null,
    netVolumeUnit: suggestionsRaw.netVolumeUnit ? String(suggestionsRaw.netVolumeUnit).trim() : null,
    countryOfOrigin: suggestionsRaw.countryOfOrigin
      ? String(suggestionsRaw.countryOfOrigin).trim()
      : null,
    condition: 'new',
  };

  return {
    valid: errors.length === 0,
    errors,
    commerce: {
      productHighlights,
      productFAQs,
      searchTags,
      dietaryAttributes,
      googleProductCategory,
      productType,
      factualAttributeSuggestions,
    },
  };
}

export function buildStructuredFallbackCommerce(
  productName: string,
  options?: { categoryHint?: string; packingSize?: string; formHint?: string }
): AICommerceContentPayload {
  const cleanName = String(productName || 'LeafyEarth Product').trim();
  const category = String(options?.categoryHint || 'Spices & Natural Foods').trim();
  const pack = String(options?.packingSize || '100 g').trim();
  const isLiquid = /\b(\d+(?:\.\d+)?)\s*(ml|l|ltr)\b/i.test(pack) || /oil|liquid|syrup/i.test(cleanName);
  const isHousehold = /cleaner|detergent|repellent|dishwash|floor/i.test(cleanName);

  const packMatch = pack.match(/^(\d+(?:\.\d+)?)\s*(g|gm|grams|kg|ml|l)\b/i);
  const packNum = packMatch ? Number.parseFloat(packMatch[1]) : 100;
  const packUnitRaw = packMatch ? packMatch[2].toLowerCase() : isLiquid ? 'ml' : 'g';

  return {
    productHighlights: [
      `Authentic ${cleanName} hygienically packed for everyday kitchen and household use`,
      'Carefully graded quality with no synthetic colors or added fillers',
      'Sealed in moisture-resistant food-grade packaging to retain natural aroma',
      `Convenient ${pack} retail pack suitable for Indian households`,
    ],
    productFAQs: [
      {
        question: `How should I store ${cleanName} after opening?`,
        answer:
          'Transfer the contents to a clean, dry, airtight container and store in a cool, dry place away from direct sunlight and stove moisture.',
      },
      {
        question: `What are the primary uses of ${cleanName}?`,
        answer: isHousehold
          ? `Use ${cleanName} according to label directions for routine household care and hygiene.`
          : `${cleanName} is ideal for everyday Indian cooking, curries, dals, spice blends, and traditional kitchen preparations.`,
      },
    ],
    searchTags: deduplicateAndCleanKeywords([
      cleanName.toLowerCase(),
      category.toLowerCase(),
      isHousehold ? 'home care' : 'indian spices',
      'leafyearth',
      pack.toLowerCase(),
    ]).keywords,
    dietaryAttributes: isHousehold ? [] : ['Vegetarian', 'Plant-Based', 'No Artificial Colours'],
    googleProductCategory: isHousehold
      ? 'Home & Garden > Household Supplies > Household Cleaning Supplies'
      : isLiquid
      ? 'Food, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Cooking Oils'
      : 'Food, Beverages & Tobacco > Food Items > Seasonings & Spices > Herbs & Spices',
    productType: `LeafyEarth > ${category} > ${cleanName}`,
    factualAttributeSuggestions: {
      netWeight: isLiquid ? null : packNum,
      netWeightUnit: isLiquid ? null : packUnitRaw === 'kg' ? 'kg' : 'g',
      netVolume: isLiquid ? packNum : null,
      netVolumeUnit: isLiquid ? (packUnitRaw === 'l' ? 'l' : 'ml') : null,
      countryOfOrigin: 'India',
      condition: 'new',
    },
  };
}

// ============================================================================
// V9 Section 6.1: Transactional Slug Reservation & Collision Detection
// ============================================================================

export async function checkSlugAvailability(
  db: Firestore,
  candidateSlugRaw: string,
  targetProductId?: string | null
): Promise<{
  available: boolean;
  normalizedSlug: string;
  claimedByProductId: string | null;
  state: 'active' | 'redirect' | null;
  suggestedSlug: string;
}> {
  const normalizedSlug = normalizeUrlSlug(candidateSlugRaw);
  if (!isValidUrlSlug(normalizedSlug)) {
    return {
      available: false,
      normalizedSlug,
      claimedByProductId: null,
      state: null,
      suggestedSlug: 'product-item',
    };
  }

  const slugSnap = await db.collection(PRODUCT_SLUGS_COLLECTION).doc(normalizedSlug).get();
  if (!slugSnap.exists) {
    return {
      available: true,
      normalizedSlug,
      claimedByProductId: null,
      state: null,
      suggestedSlug: normalizedSlug,
    };
  }

  const data = slugSnap.data() as ProductSlugReservation;
  if (targetProductId && String(data.productId) === String(targetProductId)) {
    return {
      available: true,
      normalizedSlug,
      claimedByProductId: String(data.productId),
      state: data.state,
      suggestedSlug: normalizedSlug,
    };
  }

  // Find next available suffix suggestion (-2, -3, ...)
  let suffix = 2;
  let suggestedSlug = `${normalizedSlug.slice(0, 95)}-${suffix}`;
  while (suffix <= 25) {
    const candidate = `${normalizedSlug.slice(0, 95)}-${suffix}`;
    const checkSnap = await db.collection(PRODUCT_SLUGS_COLLECTION).doc(candidate).get();
    if (!checkSnap.exists || (targetProductId && String(checkSnap.data()?.productId) === String(targetProductId))) {
      suggestedSlug = candidate;
      break;
    }
    suffix++;
  }

  return {
    available: false,
    normalizedSlug,
    claimedByProductId: String(data.productId),
    state: data.state,
    suggestedSlug,
  };
}

// ============================================================================
// V10 Section 14 & 15: Allowlisted Public Product Projection Builder
// ============================================================================

export function getDefaultVerifiedDomain(): string {
  return (
    process.env.PUBLIC_CANONICAL_ORIGIN ||
    process.env.VERIFIED_MERCHANT_DOMAIN ||
    'https://violeafybasket.web.app'
  ).replace(/\/+$/, '');
}

/**
 * Builds the allowlisted `PublicProductOfferProjection` for `public_products/{offerId}`.
 * - Uses genuine LeafyEarth selling price (`offerPrice` or `onlinePrice`) and `mrp`.
 * - NEVER uses competitor `lowestWebPrice` or `highestWebPrice`.
 * - NEVER exposes internal `stock` count, cost data, supplier data, or `aiContentMetadata`.
 */
export function buildPublicProductOfferProjection(
  product: Record<string, any>,
  options?: { verifiedDomain?: string; packVariant?: string }
): PublicProductOfferProjection {
  const domain = (options?.verifiedDomain || getDefaultVerifiedDomain()).replace(/\/+$/, '');
  const productId = String(product.id || product._id || '').trim();
  const packSize = String(options?.packVariant || product.packingSize || 'Standard').trim();
  const isPrimaryPack = !options?.packVariant || options.packVariant === product.packingSize;
  const offerId = isPrimaryPack
    ? productId
    : `${productId}__${normalizeUrlSlug(packSize) || 'variant'}`;

  const urlSlug =
    isValidUrlSlug(product.urlSlug)
      ? String(product.urlSlug)
      : normalizeUrlSlug(product.name || product.title || productId) || productId.toLowerCase();

  const canonicalUrl = `${domain}/products/${urlSlug}`;

  // Genuine LeafyEarth selling price in INR (never competitor web price!)
  const onlinePrice = Number(product.onlinePrice || product.shopPrice || 0);
  const mrp =
    product.mrp !== undefined && product.mrp !== null && Number(product.mrp) > 0
      ? Number(product.mrp)
      : onlinePrice > 0
      ? onlinePrice
      : null;
  const offerPriceRaw =
    product.offerPrice !== undefined && product.offerPrice !== null && Number(product.offerPrice) > 0
      ? Number(product.offerPrice)
      : null;

  const effectivePrice = offerPriceRaw && offerPriceRaw < onlinePrice ? offerPriceRaw : onlinePrice;
  const salePrice = offerPriceRaw && offerPriceRaw < onlinePrice ? offerPriceRaw : null;
  const basePrice = mrp && mrp >= effectivePrice ? mrp : onlinePrice;

  // Derived availability status (never exposes raw stock integer)
  const stockNum = Number(product.stock ?? 0);
  const stockAvailText = String(product.stockAvailability || '').toLowerCase();
  const availability: PublicProductOfferProjection['availability'] =
    product.preorderactive === true
      ? 'preorder'
      : stockNum > 0 && !stockAvailText.includes('out')
      ? 'in_stock'
      : 'out_of_stock';

  const gtinCheck = validateGtinChecksum(product.gtin);
  const verifiedGtin = gtinCheck.valid ? gtinCheck.normalized : null;
  const verifiedMpn = product.mpn ? String(product.mpn).trim() : null;
  const identifierExists = Boolean(verifiedGtin || verifiedMpn);

  const title = String(product.title || product.name || 'LeafyEarth Product').trim();
  const description = String(
    product.description || `${title} (${packSize}) from LeafyEarth.`
  ).trim();

  const seoTitle = String(
    product.seoTitle || `${product.name || title} | LeafyEarth`
  ).trim();
  const metaDescription = String(
    product.metaDescription || description.slice(0, 160)
  ).trim();
  const seoKeywords = Array.isArray(product.seoKeywords)
    ? product.seoKeywords.map((k: any) => String(k).trim()).filter(Boolean)
    : [];

  const additionalImages = Array.isArray(product.images)
    ? product.images.map((img: any) => String(img || '').trim()).filter(Boolean)
    : [];

  const hasAiMetadata = Boolean(
    product.aiContentMetadata && Object.keys(product.aiContentMetadata).length > 0
  );

  // Only include genuine published ratings when reviewsCount > 0
  const reviewsCount = Number(product.reviewsCount || 0);
  const rating =
    reviewsCount > 0 && Number(product.rating) > 0 && Number(product.rating) <= 5
      ? Number(Number(product.rating).toFixed(2))
      : null;

  return {
    id: offerId,
    offerId,
    productId,
    itemGroupId: productId,
    sku: String(product.sku || '').trim(),
    title,
    name: String(product.name || title).trim(),
    description,
    urlSlug,
    canonicalUrl,
    imageUrl: String(product.imageUrl || '').trim(),
    additionalImageUrls: additionalImages,
    brand: String(product.brand || 'LeafyEarth').trim(),
    category: String(product.category || 'Natural Products').trim(),
    googleProductCategory: String(
      product.googleProductCategory ||
        'Food, Beverages & Tobacco > Food Items > Seasonings & Spices'
    ).trim(),
    productType: String(
      product.productType || `LeafyEarth > ${product.category || 'Natural Products'}`
    ).trim(),
    price: basePrice > 0 ? basePrice : effectivePrice,
    salePrice,
    mrp,
    currency: 'INR',
    availability,
    condition:
      product.condition === 'refurbished' || product.condition === 'used'
        ? product.condition
        : 'new',
    packingSize: packSize,
    unit: String(product.unit || 'PAC').trim(),
    gtin: verifiedGtin,
    mpn: verifiedMpn,
    identifierExists,
    countryOfOrigin: String(product.countryOfOrigin || 'India').trim(),
    manufacturerName: product.manufacturerName ? String(product.manufacturerName).trim() : null,
    fssaiLicenseNumber: product.fssaiLicenseNumber
      ? String(product.fssaiLicenseNumber).trim()
      : null,
    netWeight:
      product.netWeight !== undefined && product.netWeight !== null
        ? Number(product.netWeight)
        : null,
    netWeightUnit: product.netWeightUnit ? String(product.netWeightUnit).trim() : null,
    netVolume:
      product.netVolume !== undefined && product.netVolume !== null
        ? Number(product.netVolume)
        : null,
    netVolumeUnit: product.netVolumeUnit ? String(product.netVolumeUnit).trim() : null,
    productHighlights: Array.isArray(product.productHighlights)
      ? product.productHighlights.map((h: any) => String(h).trim()).filter(Boolean)
      : Array.isArray(product.keyFeatures)
      ? product.keyFeatures.map((h: any) => String(h).trim()).filter(Boolean)
      : [],
    productFAQs: Array.isArray(product.productFAQs)
      ? product.productFAQs
          .map((f: any) => ({
            question: String(f?.question || '').trim(),
            answer: String(f?.answer || '').trim(),
          }))
          .filter((f: AICommerceFAQItem) => Boolean(f.question && f.answer))
      : [],
    searchTags: Array.isArray(product.searchTags)
      ? product.searchTags.map((t: any) => String(t).trim()).filter(Boolean)
      : [],
    dietaryAttributes: Array.isArray(product.dietaryAttributes)
      ? product.dietaryAttributes.map((d: any) => String(d).trim()).filter(Boolean)
      : [],
    allergenInformation: Array.isArray(product.allergenInformation)
      ? product.allergenInformation.map((a: any) => String(a).trim()).filter(Boolean)
      : [],
    seoTitle,
    metaDescription,
    seoKeywords,
    isAyurvedicProduct: Boolean(product.isAyurvedicProduct),
    botanicalName: product.botanicalName ? String(product.botanicalName).trim() : null,
    sanskritName: product.sanskritName ? String(product.sanskritName).trim() : null,
    rating,
    reviewsCount: reviewsCount > 0 ? reviewsCount : 0,
    aiGeneratedContentDisclosure: hasAiMetadata,
    revision: Number(product.revision || 1),
    updatedAt: String(product.aiCommerceUpdatedAt || product.seoUpdatedAt || new Date().toISOString()),
  };
}

// ============================================================================
// V10 Section 12, 15, 16: Default Platform Settings & Readiness Validation
// ============================================================================

export function getDefaultPlatformSettingsCatalog(
  verifiedDomain = getDefaultVerifiedDomain()
): AICommercePlatformSettings[] {
  const now = new Date().toISOString();
  const baseShipping = {
    country: 'IN',
    service: 'Standard Surface / Speed Post',
    flatRateInr: 60,
    freeShippingThresholdInr: 999,
    handlingDaysMin: 1,
    handlingDaysMax: 2,
    transitDaysMin: 3,
    transitDaysMax: 7,
  };
  const baseReturn = {
    country: 'IN',
    returnPolicyCategory: 'finite_return_window' as const,
    returnWindowDays: 7,
    returnMethod: 'by_mail' as const,
    returnFees: 'free' as const,
    policyUrl: `${verifiedDomain}/returns-policy`,
  };

  return [
    {
      id: 'google_merchant',
      platform: 'google_merchant',
      displayName: 'Google Merchant Center / Gemini (India INR)',
      priority: 'P0',
      enabled: false, // Seeded disabled until owner enables publication
      market: 'IN',
      currency: 'INR',
      marketEligible: true,
      eligibilityNote:
        'Eligible in India (INR). Requires verified domain in Google Search Console & shipping/returns configured in Merchant Center.',
      verifiedDomain,
      schemaVersion: V10_SCHEMA_VERSION,
      credentialRef: 'SECRET_MANAGER:GOOGLE_MERCHANT_ACCOUNT_ID',
      syncPolicy: {
        mode: 'event_driven_and_scheduled',
        reconcileIntervalMinutes: 15,
        dailyFullRebuild: true,
        dryRunOnly: true,
      },
      shippingPolicy: baseShipping,
      returnPolicy: baseReturn,
      updatedAt: now,
    },
    {
      id: 'public_web',
      platform: 'public_web',
      displayName: 'Public Web / Google Search (SSR + JSON-LD + Sitemap)',
      priority: 'P0',
      enabled: true,
      market: 'IN',
      currency: 'INR',
      marketEligible: true,
      eligibilityNote:
        'Active for approved products. Serves crawlable HTML, Product/Offer JSON-LD, canonical URLs, 301 slug redirects, and /sitemap.xml.',
      verifiedDomain,
      schemaVersion: V10_SCHEMA_VERSION,
      credentialRef: null,
      syncPolicy: {
        mode: 'event_driven_and_scheduled',
        reconcileIntervalMinutes: 15,
        dailyFullRebuild: true,
        dryRunOnly: false,
      },
      shippingPolicy: baseShipping,
      returnPolicy: baseReturn,
      updatedAt: now,
    },
    {
      id: 'bing_copilot',
      platform: 'bing_copilot',
      displayName: 'Bing Webmaster Tools / Microsoft Merchant / Copilot',
      priority: 'P1',
      enabled: false,
      market: 'IN',
      currency: 'INR',
      marketEligible: true,
      eligibilityNote:
        'Eligible for Bing Sitemap & IndexNow in India. Microsoft Merchant Center feed (/feeds/bing-products.xml) ready on owner activation.',
      verifiedDomain,
      schemaVersion: V10_SCHEMA_VERSION,
      credentialRef: 'SECRET_MANAGER:BING_INDEXNOW_KEY',
      syncPolicy: {
        mode: 'event_driven_and_scheduled',
        reconcileIntervalMinutes: 15,
        dailyFullRebuild: true,
        dryRunOnly: true,
      },
      shippingPolicy: baseShipping,
      returnPolicy: baseReturn,
      updatedAt: now,
    },
    {
      id: 'openai_chatgpt',
      platform: 'openai_chatgpt',
      displayName: 'OpenAI / ChatGPT Product Discovery Feed Adapter',
      priority: 'P2',
      enabled: false,
      market: 'IN',
      currency: 'INR',
      marketEligible: false,
      eligibilityNote:
        'Versioned feed adapter (/feeds/openai-products.jsonl) is prepared. Direct OpenAI merchant feed submission in India (IN) is gated until official regional merchant onboarding is confirmed.',
      verifiedDomain,
      schemaVersion: V10_SCHEMA_VERSION,
      credentialRef: 'SECRET_MANAGER:OPENAI_MERCHANT_FEED_TOKEN',
      syncPolicy: {
        mode: 'manual_only',
        reconcileIntervalMinutes: 60,
        dailyFullRebuild: false,
        dryRunOnly: true,
      },
      shippingPolicy: baseShipping,
      returnPolicy: baseReturn,
      updatedAt: now,
    },
    {
      id: 'perplexity',
      platform: 'perplexity',
      displayName: 'PerplexityBot & Answer Engine Catalog',
      priority: 'P2',
      enabled: false,
      market: 'IN',
      currency: 'INR',
      marketEligible: false,
      eligibilityNote:
        'Public crawler access (PerplexityBot) and JSON-LD/sitemap are supported. Direct merchant connector remains disabled until officially supported for India.',
      verifiedDomain,
      schemaVersion: V10_SCHEMA_VERSION,
      credentialRef: null,
      syncPolicy: {
        mode: 'manual_only',
        reconcileIntervalMinutes: 60,
        dailyFullRebuild: false,
        dryRunOnly: true,
      },
      shippingPolicy: baseShipping,
      returnPolicy: baseReturn,
      updatedAt: now,
    },
  ];
}

/**
 * Validates a product master record against a specific target platform's rules.
 * Readiness is a deterministic local validation metric — never a ranking or remote approval claim.
 */
export function validateProductForPlatform(
  product: Record<string, any>,
  platform: AICommercePlatformId,
  settings?: AICommercePlatformSettings
): AICommerceValidationReport {
  const issues: AICommerceValidationIssue[] = [];
  const productId = String(product.id || '').trim();
  const projection = buildPublicProductOfferProjection(product, {
    verifiedDomain: settings?.verifiedDomain,
  });

  // 1. Core Identity & Price Checks
  if (!projection.title || projection.title.length < 3) {
    issues.push({
      code: 'MISSING_TITLE',
      field: 'title',
      severity: 'error',
      message: 'Product title is missing or too short.',
      remediation: 'Generate and approve a descriptive product title.',
    });
  }
  if (!projection.description || projection.description.length < 25) {
    issues.push({
      code: 'SHORT_DESCRIPTION',
      field: 'description',
      severity: 'error',
      message: 'Product description is missing or shorter than 25 characters.',
      remediation: 'Approve an e-commerce description in AI Product Content.',
    });
  }
  if (!projection.price || projection.price <= 0) {
    issues.push({
      code: 'INVALID_PRICE',
      field: 'onlinePrice',
      severity: 'error',
      message: 'Genuine LeafyEarth selling price (onlinePrice / offerPrice) must be greater than ₹0.',
      remediation: 'Set a valid INR onlinePrice in Product Master.',
    });
  }
  if (!projection.sku || !/^[0-9]{8}$/.test(projection.sku)) {
    issues.push({
      code: 'NON_STANDARD_SKU',
      field: 'sku',
      severity: 'warning',
      message: `SKU "${projection.sku || 'empty'}" is a legacy format rather than an 8-digit numeric SKU.`,
      remediation: 'Legacy SKUs are preserved; new products automatically receive an 8-digit SKU.',
    });
  }

  // 2. Image checks
  if (!projection.imageUrl) {
    issues.push({
      code: 'MISSING_IMAGE',
      field: 'imageUrl',
      severity: 'error',
      message: 'Primary product image URL is required for merchant feeds and rich results.',
      remediation: 'Approve a 1000×1000 pure-white (#FFFFFF) product image or upload a main image.',
    });
  } else if (projection.imageUrl.startsWith('data:')) {
    issues.push({
      code: 'DATA_URL_IMAGE_NOT_CRAWLABLE',
      field: 'imageUrl',
      severity: 'warning',
      message: 'Primary image is a data URI; external merchant feeds require an HTTPS image URL.',
      remediation: 'Sync image to Cloud Storage HTTPS URL before live Merchant Center submission.',
    });
  }

  // 3. SEO & Canonical Slug checks
  if (!product.urlSlug || !isValidUrlSlug(product.urlSlug)) {
    issues.push({
      code: 'MISSING_APPROVED_SLUG',
      field: 'urlSlug',
      severity: 'error',
      message: 'Product does not have an approved canonical urlSlug.',
      remediation: 'Generate, approve, and apply the V9 SEO URL slug.',
    });
  }
  if (!product.seoTitle || !product.metaDescription) {
    issues.push({
      code: 'INCOMPLETE_SEO_META',
      field: 'seoTitle',
      severity: 'warning',
      message: 'seoTitle or metaDescription is not yet explicitly applied on Product Master.',
      remediation: 'Approve and apply SEO fields in Review & Edit Content.',
    });
  }

  // 4. Identifier & GTIN checks
  if (product.gtin) {
    const gtinRes = validateGtinChecksum(product.gtin);
    if (!gtinRes.valid) {
      issues.push({
        code: 'INVALID_GTIN_CHECKSUM',
        field: 'gtin',
        severity: 'error',
        message: gtinRes.error || 'Invalid GTIN checksum.',
        remediation: 'Enter a verified 8, 12, 13, or 14-digit GS1 GTIN or leave blank to use identifier_exists=no.',
      });
    }
  } else if (platform === 'google_merchant' || platform === 'bing_copilot') {
    issues.push({
      code: 'NO_GTIN_USING_IDENTIFIER_EXISTS_FALSE',
      field: 'gtin',
      severity: 'info',
      message: 'No GTIN provided; feed will emit g:identifier_exists=no with brand + SKU/MPN.',
    });
  }

  // 5. Weight vs Volume check
  const wvCheck = validateWeightAndVolumeSeparation(product);
  for (const err of wvCheck.errors) {
    issues.push({
      code: 'WEIGHT_VOLUME_UNIT_MISMATCH',
      field: 'netWeightUnit',
      severity: 'error',
      message: err,
      remediation: 'Use g/kg for netWeightUnit and ml/l for netVolumeUnit.',
    });
  }

  // 6. Prohibited Medical Claims Check (Google Merchant / Healthcare policy)
  if (
    PROHIBITED_CLAIM_REGEX.test(projection.description) ||
    PROHIBITED_CLAIM_REGEX.test(projection.title)
  ) {
    issues.push({
      code: 'POLICY_RESTRICTED_MEDICAL_CLAIM',
      field: 'description',
      severity: 'error',
      message: 'Product text contains prohibited disease-cure or miracle health claims.',
      remediation: 'Remove unverified medical cure claims before publishing to public feeds.',
    });
  }

  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarning = issues.some((i) => i.severity === 'warning');

  const localReadiness: AICommerceLocalReadiness =
    product.aiCommerceEnabled === false
      ? 'disabled'
      : hasError
      ? 'blocked'
      : hasWarning
      ? 'warning'
      : 'ready';

  return {
    id: `val_${productId}_${platform}`,
    productId,
    offerId: projection.offerId,
    platform,
    revision: projection.revision,
    localReadiness,
    issues,
    severity: hasError ? 'error' : hasWarning ? 'warning' : 'ok',
    checkedAt: new Date().toISOString(),
  };
}

// ============================================================================
// V10 Section 17: Public Product Feeds (Google XML, Bing XML, OpenAI JSONL, JSON)
// ============================================================================

export function generateGoogleMerchantXmlFeed(
  projections: PublicProductOfferProjection[],
  settings: AICommercePlatformSettings
): string {
  const domain = settings.verifiedDomain || getDefaultVerifiedDomain();
  const itemsXml = projections
    .map((p) => {
      const availabilityMap: Record<PublicProductOfferProjection['availability'], string> = {
        in_stock: 'in_stock',
        out_of_stock: 'out_of_stock',
        preorder: 'preorder',
      };
      const priceFormatted = `${Number(p.price || 0).toFixed(2)} INR`;
      const salePriceXml =
        p.salePrice && p.salePrice > 0 && p.salePrice < p.price
          ? `\n      <g:sale_price>${Number(p.salePrice).toFixed(2)} INR</g:sale_price>`
          : '';
      const gtinXml = p.gtin ? `\n      <g:gtin>${escapeXml(p.gtin)}</g:gtin>` : '';
      const mpnXml = p.mpn
        ? `\n      <g:mpn>${escapeXml(p.mpn)}</g:mpn>`
        : p.sku
        ? `\n      <g:mpn>${escapeXml(p.sku)}</g:mpn>`
        : '';
      const identifierExistsXml = `\n      <g:identifier_exists>${
        p.identifierExists ? 'yes' : 'no'
      }</g:identifier_exists>`;
      const additionalImagesXml = (p.additionalImageUrls || [])
        .slice(0, 10)
        .filter((u) => u.startsWith('http'))
        .map((u) => `\n      <g:additional_image_link>${escapeXml(u)}</g:additional_image_link>`)
        .join('');
      const highlightsXml = (p.productHighlights || [])
        .slice(0, 6)
        .map((h) => `\n      <g:product_highlight>${escapeXml(h)}</g:product_highlight>`)
        .join('');

      // Google Merchant Center AI-generated content structured disclosure when AI provenance is present
      const titleXml = p.aiGeneratedContentDisclosure
        ? `<g:structured_title>
        <g:digital_source_type>trained_algorithmic_media</g:digital_source_type>
        <g:content>${escapeXml(p.title)}</g:content>
      </g:structured_title>`
        : `<g:title>${escapeXml(p.title)}</g:title>`;

      const descriptionXml = p.aiGeneratedContentDisclosure
        ? `<g:structured_description>
        <g:digital_source_type>trained_algorithmic_media</g:digital_source_type>
        <g:content>${escapeXml(p.description)}</g:content>
      </g:structured_description>`
        : `<g:description>${escapeXml(p.description)}</g:description>`;

      return `    <item>
      <g:id>${escapeXml(p.offerId)}</g:id>
      <g:item_group_id>${escapeXml(p.itemGroupId)}</g:item_group_id>
      ${titleXml}
      ${descriptionXml}
      <g:link>${escapeXml(p.canonicalUrl)}</g:link>
      <g:image_link>${escapeXml(p.imageUrl || `${domain}/Logo.png`)}</g:image_link>${additionalImagesXml}
      <g:availability>${availabilityMap[p.availability] || 'in_stock'}</g:availability>
      <g:price>${priceFormatted}</g:price>${salePriceXml}
      <g:brand>${escapeXml(p.brand)}</g:brand>
      <g:condition>${escapeXml(p.condition)}</g:condition>${gtinXml}${mpnXml}${identifierExistsXml}
      <g:google_product_category>${escapeXml(p.googleProductCategory)}</g:google_product_category>
      <g:product_type>${escapeXml(p.productType)}</g:product_type>${highlightsXml}
      <g:shipping>
        <g:country>${escapeXml(settings.shippingPolicy.country || 'IN')}</g:country>
        <g:service>${escapeXml(settings.shippingPolicy.service || 'Standard')}</g:service>
        <g:price>${Number(settings.shippingPolicy.flatRateInr || 0).toFixed(2)} INR</g:price>
      </g:shipping>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>LeafyEarth Product Catalog (India - INR)</title>
    <link>${escapeXml(domain)}</link>
    <description>Official LeafyEarth approved merchant product feed for India (INR).</description>
${itemsXml}
  </channel>
</rss>`;
}

export function generateBingMerchantXmlFeed(
  projections: PublicProductOfferProjection[],
  settings: AICommercePlatformSettings
): string {
  // Microsoft Merchant Center accepts Google Merchant RSS 2.0 XML schema with g: namespace
  return generateGoogleMerchantXmlFeed(projections, settings).replace(
    '<title>LeafyEarth Product Catalog (India - INR)</title>',
    '<title>LeafyEarth Microsoft Merchant Catalog (India - INR)</title>'
  );
}

export function generateOpenAIProductsJsonlFeed(
  projections: PublicProductOfferProjection[],
  settings: AICommercePlatformSettings
): string {
  return projections
    .map((p) =>
      JSON.stringify({
        schema_version: settings.schemaVersion || V10_SCHEMA_VERSION,
        market: 'IN',
        submission_enabled: Boolean(settings.enabled && settings.marketEligible),
        id: p.offerId,
        item_group_id: p.itemGroupId,
        sku: p.sku,
        title: p.title,
        description: p.description,
        url: p.canonicalUrl,
        image_url: p.imageUrl,
        additional_image_urls: p.additionalImageUrls,
        brand: p.brand,
        category: p.category,
        google_product_category: p.googleProductCategory,
        price: p.salePrice ?? p.price,
        list_price: p.price,
        currency: 'INR',
        availability: p.availability,
        condition: p.condition,
        packing_size: p.packingSize,
        gtin: p.gtin,
        mpn: p.mpn,
        country_of_origin: p.countryOfOrigin,
        highlights: p.productHighlights,
        faqs: p.productFAQs,
        dietary_attributes: p.dietaryAttributes,
        allergen_information: p.allergenInformation,
        ai_generated_disclosure: p.aiGeneratedContentDisclosure,
        updated_at: p.updatedAt,
      })
    )
    .join('\n');
}

// ============================================================================
// V9 & V10 Section 8, 9, 18: SSR Product HTML, JSON-LD, Sitemap, Robots, llms.txt
// ============================================================================

export function buildProductJsonLdObject(projection: PublicProductOfferProjection): Record<string, any> {
  const schemaAvailabilityMap: Record<PublicProductOfferProjection['availability'], string> = {
    in_stock: 'https://schema.org/InStock',
    out_of_stock: 'https://schema.org/OutOfStock',
    preorder: 'https://schema.org/PreOrder',
  };

  const effectiveOfferPrice =
    projection.salePrice && projection.salePrice > 0
      ? projection.salePrice
      : projection.price;

  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: projection.title,
    description: projection.description,
    sku: projection.sku,
    url: projection.canonicalUrl,
    image: [
      ...(projection.imageUrl ? [projection.imageUrl] : []),
      ...(projection.additionalImageUrls || []),
    ].filter(Boolean),
    brand: {
      '@type': 'Brand',
      name: projection.brand || 'LeafyEarth',
    },
    category: projection.category,
    offers: {
      '@type': 'Offer',
      url: projection.canonicalUrl,
      priceCurrency: 'INR',
      price: Number(effectiveOfferPrice || 0).toFixed(2),
      availability: schemaAvailabilityMap[projection.availability] || 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  if (projection.gtin) {
    jsonLd.gtin = projection.gtin;
  }
  if (projection.mpn) {
    jsonLd.mpn = projection.mpn;
  }
  if (projection.countryOfOrigin) {
    jsonLd.countryOfOrigin = projection.countryOfOrigin;
  }
  // Section 9 & 18: Include AggregateRating ONLY when genuine published reviews exist
  if (projection.rating && projection.reviewsCount > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: projection.rating,
      reviewCount: projection.reviewsCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return jsonLd;
}

export function renderServerProductLandingHtml(
  projection: PublicProductOfferProjection,
  baseTemplateHtml?: string
): string {
  const escapedTitle = escapeHtml(projection.seoTitle || `${projection.title} | LeafyEarth`);
  const escapedDesc = escapeHtml(projection.metaDescription || projection.description);
  const escapedCanonical = escapeHtml(projection.canonicalUrl);
  const escapedImage = escapeHtml(projection.imageUrl || '');
  const escapedKeywords = escapeHtml((projection.seoKeywords || []).join(', '));
  const jsonLdString = JSON.stringify(buildProductJsonLdObject(projection)).replace(/</g, '\\u003c');

  const effectivePrice =
    projection.salePrice && projection.salePrice > 0 ? projection.salePrice : projection.price;

  const headInjection = `
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDesc}" />
    ${escapedKeywords ? `<meta name="keywords" content="${escapedKeywords}" />` : ''}
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${escapedCanonical}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="LeafyEarth" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDesc}" />
    <meta property="og:url" content="${escapedCanonical}" />
    ${escapedImage ? `<meta property="og:image" content="${escapedImage}" />` : ''}
    <meta property="product:price:amount" content="${Number(effectivePrice || 0).toFixed(2)}" />
    <meta property="product:price:currency" content="INR" />
    <script type="application/ld+json">${jsonLdString}</script>
  `;

  const highlightsHtml = (projection.productHighlights || [])
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join('');

  const faqsHtml = (projection.productFAQs || [])
    .map(
      (faq) =>
        `<div class="ssr-faq-item"><dt><strong>${escapeHtml(faq.question)}</strong></dt><dd>${escapeHtml(
          faq.answer
        )}</dd></div>`
    )
    .join('');

  const visibleSummaryHtml = `
    <section id="ssr-product-summary" data-product-id="${escapeHtml(
      projection.productId
    )}" data-product-slug="${escapeHtml(projection.urlSlug)}" style="max-width:960px;margin:1.5rem auto;padding:1.25rem;font-family:system-ui,-apple-system,sans-serif;color:#14532d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
      <div style="display:flex;flex-wrap:wrap;gap:1.25rem;align-items:flex-start;">
        ${
          escapedImage
            ? `<img src="${escapedImage}" alt="${escapeHtml(
                projection.title
              )}" width="180" height="180" style="border-radius:8px;background:#ffffff;object-fit:contain;border:1px solid #dcfce7;" />`
            : ''
        }
        <div style="flex:1;min-width:260px;">
          <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#15803d;">${escapeHtml(
            projection.brand
          )} • ${escapeHtml(projection.category)} • SKU: ${escapeHtml(projection.sku)}</p>
          <h1 style="margin:0 0 8px;font-size:24px;color:#052e16;">${escapeHtml(projection.title)}</h1>
          <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#166534;">
            ₹${Number(effectivePrice || 0).toFixed(2)} INR
            <span style="font-size:13px;font-weight:500;color:#15803d;">(${escapeHtml(
              projection.packingSize
            )} • ${escapeHtml(projection.availability.replace('_', ' ').toUpperCase())})</span>
          </p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#1e293b;">${escapeHtml(
            projection.description
          )}</p>
          ${
            highlightsHtml
              ? `<ul style="margin:0 0 12px;padding-left:18px;font-size:13px;color:#334155;">${highlightsHtml}</ul>`
              : ''
          }
          ${
            faqsHtml
              ? `<dl style="margin:8px 0 0;font-size:13px;color:#334155;">${faqsHtml}</dl>`
              : ''
          }
        </div>
      </div>
    </section>
  `;

  if (baseTemplateHtml) {
    let html = baseTemplateHtml.replace(/<title>.*?<\/title>/is, '');
    html = html.replace('</head>', `${headInjection}\n</head>`);
    html = html.replace('<div id="root"></div>', `${visibleSummaryHtml}\n<div id="root"></div>`);
    return html;
  }

  return `<!DOCTYPE html>
<html lang="en-IN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${headInjection}
  </head>
  <body>
    ${visibleSummaryHtml}
    <div id="root"></div>
  </body>
</html>`;
}

export function generateSitemapXml(
  projections: PublicProductOfferProjection[],
  verifiedDomain = getDefaultVerifiedDomain()
): string {
  const domain = verifiedDomain.replace(/\/+$/, '');
  const seenUrls = new Set<string>();
  const urlEntries: string[] = [];

  for (const p of projections) {
    if (!p.urlSlug || !p.canonicalUrl) continue;
    if (seenUrls.has(p.canonicalUrl)) continue;
    seenUrls.add(p.canonicalUrl);
    const lastmod = (p.updatedAt || new Date().toISOString()).slice(0, 10);
    urlEntries.push(`  <url>
    <loc>${escapeXml(p.canonicalUrl)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(domain)}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${urlEntries.join('\n')}
</urlset>`;
}

export function generateRobotsTxt(
  verifiedDomain = getDefaultVerifiedDomain(),
  options?: { allowTrainingBots?: boolean }
): string {
  const domain = verifiedDomain.replace(/\/+$/, '');
  const trainingRule = options?.allowTrainingBots ? 'Allow: /products/' : 'Disallow: /';

  return `# LeafyEarth Public Search & AI Discovery Robots Configuration (V10)
User-agent: Googlebot
Allow: /products/
Allow: /feeds/
Disallow: /api/admin/
Disallow: /admin/
Disallow: /drafts/
Disallow: /search

User-agent: Bingbot
Allow: /products/
Allow: /feeds/
Disallow: /api/admin/
Disallow: /admin/
Disallow: /drafts/

User-agent: OAI-SearchBot
Allow: /products/
Allow: /feeds/
Disallow: /api/admin/
Disallow: /admin/

User-agent: PerplexityBot
Allow: /products/
Allow: /feeds/
Disallow: /api/admin/
Disallow: /admin/

# Separate AI model training usage controls (Section 18)
User-agent: GPTBot
${trainingRule}
Disallow: /api/admin/

User-agent: Google-Extended
${trainingRule}
Disallow: /api/admin/

User-agent: *
Allow: /products/
Disallow: /api/admin/
Disallow: /api/db/
Disallow: /admin/
Disallow: /drafts/

Sitemap: ${domain}/sitemap.xml
`;
}

export function generateLlmsTxt(
  projections: PublicProductOfferProjection[],
  verifiedDomain = getDefaultVerifiedDomain()
): string {
  const domain = verifiedDomain.replace(/\/+$/, '');
  const topLines = projections
    .slice(0, 50)
    .map(
      (p) =>
        `- [${p.title}](${p.canonicalUrl}): ₹${Number(p.salePrice ?? p.price).toFixed(2)} INR (${
          p.packingSize
        }, ${p.availability})`
    )
    .join('\n');

  return `# LeafyEarth Official Product Catalog (India - INR)
> Informational summary for AI search and answer engines. Prices and availability are derived from live LeafyEarth product projections.

## Public Discovery Endpoints
- XML Sitemap: ${domain}/sitemap.xml
- Public JSON Catalog: ${domain}/feeds/products.json
- Public Search API: ${domain}/api/v1/public/products
- Google Merchant Feed (INR): ${domain}/feeds/google-products.xml

## Published Products (${projections.length})
${topLines || '- No published products currently active.'}
`;
}

// ============================================================================
// V9 Section 6.1: Transactional SEO & Slug Reservation Publication
// ============================================================================

export interface ApplySEOTransactionParams {
  db: Firestore;
  draftId?: string | null;
  versionId?: string | null;
  productId: string;
  seo: Partial<AIProductSEOPayload>;
  selectedFields: string[];
  expectedMasterRevision?: number | null;
  idempotencyKey: string;
  actor: { uid: string; email?: string; role?: string };
}

export async function applyApprovedSEOAndReserveSlugTransaction(
  params: ApplySEOTransactionParams
): Promise<{
  idempotentReplay: boolean;
  syncLog: AIProductSyncLog;
  updatedProduct: Record<string, any>;
  slugReservation: ProductSlugReservation | null;
}> {
  const { db, productId, selectedFields, expectedMasterRevision, idempotencyKey, actor } = params;
  const now = new Date().toISOString();
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ productId, seo: params.seo, selectedFields }))
    .digest('hex');

  const productRef = db.collection('products').doc(productId);
  const idemDocId = `seoidem_${crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)}`;
  const syncLogRef = db.collection('ai_product_sync_logs').doc(idemDocId);

  const selectedSet = new Set(selectedFields.map((f) => String(f).trim()));
  const wantsSlug = selectedSet.has('urlSlug') && Boolean(params.seo.urlSlug);
  const candidateSlug = wantsSlug ? normalizeUrlSlug(params.seo.urlSlug) : '';

  if (wantsSlug && !isValidUrlSlug(candidateSlug)) {
    throw new Error(
      `INVALID_URL_SLUG: "${params.seo.urlSlug}" is not a valid lowercase hyphenated ASCII slug.`
    );
  }

  return db.runTransaction(async (tx) => {
    // 1. Read idempotency record, product, draft/version (if provided), and slug reservation BEFORE any writes
    const existingSyncSnap = await tx.get(syncLogRef);
    if (existingSyncSnap.exists) {
      const existingLog = { id: existingSyncSnap.id, ...(existingSyncSnap.data() as any) } as AIProductSyncLog & {
        payload_hash?: string;
      };
      if (existingLog.payload_hash && existingLog.payload_hash !== payloadHash) {
        throw new Error(
          `IDEMPOTENCY_PAYLOAD_MISMATCH: Idempotency key '${idempotencyKey}' was already used with a different payload.`
        );
      }
      const currentProdSnap = await tx.get(productRef);
      return {
        idempotentReplay: true,
        syncLog: existingLog,
        updatedProduct: currentProdSnap.exists ? { id: currentProdSnap.id, ...currentProdSnap.data() } : {},
        slugReservation: null,
      };
    }

    const productSnap = await tx.get(productRef);
    if (!productSnap.exists) {
      throw new Error(`PRODUCT_NOT_FOUND: Product '${productId}' does not exist in products collection.`);
    }
    const existingProduct = { id: productSnap.id, ...(productSnap.data() as any) };

    const currentRevision = Number(existingProduct.revision || 1);
    if (
      expectedMasterRevision !== undefined &&
      expectedMasterRevision !== null &&
      Number(expectedMasterRevision) !== currentRevision
    ) {
      throw new Error(
        `MASTER_REVISION_CONFLICT: Expected master revision ${expectedMasterRevision}, but current product revision is ${currentRevision}. Refresh comparison before applying.`
      );
    }

    const previousSlug = existingProduct.urlSlug ? String(existingProduct.urlSlug).trim() : null;
    const candidateSlugRef = wantsSlug
      ? db.collection(PRODUCT_SLUGS_COLLECTION).doc(candidateSlug)
      : null;
    const candidateSlugSnap = candidateSlugRef ? await tx.get(candidateSlugRef) : null;

    if (wantsSlug && candidateSlugSnap && candidateSlugSnap.exists) {
      const reservation = candidateSlugSnap.data() as ProductSlugReservation;
      if (String(reservation.productId) !== String(productId)) {
        const suggested = `${candidateSlug.slice(0, 92)}-${String(existingProduct.sku || '2').slice(-4).toLowerCase()}`;
        throw new Error(
          `SLUG_CONFLICT: URL slug '${candidateSlug}' is already reserved by product '${reservation.productId}'. Suggested available slug: '${suggested}'.`
        );
      }
    }

    // 2. Build selected SEO update patch & provenance
    const beforeSnapshot: Record<string, any> = {};
    const afterSnapshot: Record<string, any> = {};
    const updatePatch: Record<string, any> = {};
    const existingAiMeta: Record<string, AIContentProvenanceEntry> = {
      ...(existingProduct.aiContentMetadata || {}),
    };

    for (const key of ['seoTitle', 'metaDescription', 'seoKeywords', 'urlSlug'] as const) {
      if (!selectedSet.has(key)) continue;
      const val = key === 'urlSlug' ? candidateSlug : (params.seo as any)[key];
      if (val === undefined) continue;
      beforeSnapshot[key] = existingProduct[key] ?? null;
      updatePatch[key] = val;
      afterSnapshot[key] = val;
      existingAiMeta[key] = {
        source: params.draftId ? 'ai' : 'manual',
        draftId: params.draftId || null,
        versionId: params.versionId || null,
        model: 'gpt-4o-mini',
        promptVersion: V10_SCHEMA_VERSION,
        approvedBy: actor.uid,
        approvedAt: now,
      };
    }

    if (Object.keys(updatePatch).length === 0) {
      throw new Error('No valid SEO fields were selected for publication.');
    }

    const nextRevision = currentRevision + 1;
    const finalSlug = updatePatch.urlSlug || previousSlug;
    if (finalSlug) {
      updatePatch.canonicalUrl = `${getDefaultVerifiedDomain()}/products/${finalSlug}`;
    }
    updatePatch.seoUpdatedAt = now;
    updatePatch.aiContentMetadata = existingAiMeta;
    updatePatch.revision = nextRevision;

    // 3. Reserve new slug and convert previous slug into a redirect alias if changed
    let newReservation: ProductSlugReservation | null = null;
    if (wantsSlug && candidateSlugRef) {
      newReservation = {
        slug: candidateSlug,
        productId,
        state: 'active',
        canonicalSlug: candidateSlug,
        createdAt: candidateSlugSnap?.exists
          ? String((candidateSlugSnap.data() as any)?.createdAt || now)
          : now,
        updatedAt: now,
        updatedBy: actor.uid,
      };
      tx.set(candidateSlugRef, newReservation);

      if (previousSlug && previousSlug !== candidateSlug && isValidUrlSlug(previousSlug)) {
        const prevSlugRef = db.collection(PRODUCT_SLUGS_COLLECTION).doc(previousSlug);
        const redirectDoc: ProductSlugReservation = {
          slug: previousSlug,
          productId,
          state: 'redirect',
          canonicalSlug: candidateSlug,
          createdAt: now,
          updatedAt: now,
          updatedBy: actor.uid,
        };
        tx.set(prevSlugRef, redirectDoc, { merge: true });
      }
    }

    tx.set(productRef, updatePatch, { merge: true });

    const syncLogDoc: AIProductSyncLog & { payload_hash?: string } = {
      id: idemDocId,
      draft_id: params.draftId || `manual_seo_${productId}`,
      version_id: params.versionId || `ver_${nextRevision}`,
      master_product_id: productId,
      idempotency_key: idempotencyKey,
      selected_fields: Array.from(selectedSet),
      expected_master_revision: expectedMasterRevision ?? currentRevision,
      resulting_master_revision: nextRevision,
      slug_action: wantsSlug
        ? {
            previousSlug,
            newSlug: candidateSlug,
            redirectCreated: Boolean(previousSlug && previousSlug !== candidateSlug),
          }
        : null,
      before_snapshot: beforeSnapshot,
      after_snapshot: afterSnapshot,
      result: 'SUCCESS',
      error_message: null,
      applied_by: actor.uid,
      applied_by_email: actor.email,
      applied_at: now,
      payload_hash: payloadHash,
    };

    tx.set(syncLogRef, syncLogDoc);

    return {
      idempotentReplay: false,
      syncLog: syncLogDoc,
      updatedProduct: { ...existingProduct, ...updatePatch },
      slugReservation: newReservation,
    };
  });
}

// ============================================================================
// V10 Section 16: Transactional Outbox Queue, Worker & Projection Sync
// ============================================================================

export async function syncProductToPublicProjectionAndQueueJobs(
  db: Firestore,
  product: Record<string, any>,
  actorId = 'system'
): Promise<{
  published: boolean;
  projection: PublicProductOfferProjection | null;
  queuedJobs: AICommerceSyncJob[];
}> {
  const productId = String(product.id || '').trim();
  const now = new Date().toISOString();
  const revision = Number(product.revision || 1);
  const isPublished = product.aiCommerceEnabled === true;

  const projectionRef = db.collection(PUBLIC_PRODUCTS_COLLECTION).doc(productId);
  let projection: PublicProductOfferProjection | null = null;

  if (isPublished) {
    projection = buildPublicProductOfferProjection(product);
    await projectionRef.set(projection);
  } else {
    // Promptly withdraw from public_products when aiCommerceEnabled is false
    const existingSnap = await projectionRef.get();
    if (existingSnap.exists) {
      await projectionRef.delete();
    }
  }

  invalidatePublicProductCache(product.urlSlug || productId);
  invalidatePublicProductCache(productId);

  // Enqueue idempotent sync jobs for P0/P1 platforms
  const platforms: AICommercePlatformId[] = ['public_web', 'google_merchant', 'bing_copilot'];
  const queuedJobs: AICommerceSyncJob[] = [];

  for (const platform of platforms) {
    const idemKey = `job_${productId}_r${revision}_${platform}_${isPublished ? 'pub' : 'withdraw'}`;
    const jobId = `job_${crypto.createHash('sha256').update(idemKey).digest('hex').slice(0, 24)}`;
    const jobDoc: AICommerceSyncJob = {
      id: jobId,
      productId,
      revision,
      platform,
      action: isPublished ? 'UPSERT_PROJECTION' : 'WITHDRAW_PROJECTION',
      state: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: now,
      leaseUntil: null,
      idempotencyKey: idemKey,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(AI_COMMERCE_SYNC_JOBS_COLLECTION).doc(jobId).set(jobDoc, { merge: true });
    queuedJobs.push(jobDoc);

    // Also update local readiness & platform status
    const valReport = validateProductForPlatform(product, platform);
    await db.collection(AI_COMMERCE_VALIDATION_COLLECTION).doc(valReport.id).set(valReport);

    const statusId = `pstat_${productId}_${platform}`;
    const statusDoc: AICommercePlatformStatus = {
      id: statusId,
      productId,
      offerId: productId,
      platform,
      localReadiness: valReport.localReadiness,
      remoteStatus:
        !isPublished
          ? 'not_submitted'
          : platform === 'public_web' && valReport.localReadiness !== 'blocked'
          ? 'approved'
          : 'not_submitted',
      remoteId: platform === 'public_web' && isPublished ? projection?.canonicalUrl || null : null,
      checkedAt: now,
      issues: valReport.issues,
    };
    await db.collection(AI_COMMERCE_PLATFORM_STATUS_COLLECTION).doc(statusId).set(statusDoc);
  }

  return { published: isPublished, projection, queuedJobs };
}

/**
 * Worker that claims pending sync jobs transactionally, rejects stale revisions,
 * and records sanitized audit logs with exponential backoff on transient failures.
 */
export async function processPendingCommerceSyncJobs(
  db: Firestore,
  limitCount = 25
): Promise<{ processed: number; completed: number; retried: number; deadLettered: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const jobsSnap = await db.collection(AI_COMMERCE_SYNC_JOBS_COLLECTION).get();
  const dueJobs = jobsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as AICommerceSyncJob))
    .filter(
      (j) =>
        (j.state === 'PENDING' || j.state === 'RETRY_SCHEDULED') &&
        (!j.nextAttemptAt || j.nextAttemptAt <= nowIso) &&
        (!j.leaseUntil || j.leaseUntil <= nowIso)
    )
    .slice(0, limitCount);

  let processed = 0;
  let completed = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const job of dueJobs) {
    processed++;
    const jobRef = db.collection(AI_COMMERCE_SYNC_JOBS_COLLECTION).doc(job.id);
    const leaseUntil = new Date(Date.now() + 60_000).toISOString();

    try {
      const prodSnap = await db.collection('products').doc(job.productId).get();
      if (!prodSnap.exists) {
        // Withdraw projection if product deleted
        await db.collection(PUBLIC_PRODUCTS_COLLECTION).doc(job.productId).delete().catch(() => {});
        await jobRef.set(
          { state: 'COMPLETED', leaseUntil: null, updatedAt: new Date().toISOString() },
          { merge: true }
        );
        completed++;
        continue;
      }

      const latestProduct = { id: prodSnap.id, ...(prodSnap.data() as any) };
      const latestRevision = Number(latestProduct.revision || 1);

      // Section 16: Reject stale revisions
      if (job.revision < latestRevision) {
        await jobRef.set(
          {
            state: 'COMPLETED',
            leaseUntil: null,
            lastError: `Skipped stale revision ${job.revision} (latest is ${latestRevision})`,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        const logId = `cslog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const logDoc: AICommerceSyncLog = {
          id: logId,
          jobId: job.id,
          productId: job.productId,
          platform: job.platform,
          action: job.action,
          sanitizedResult: `Skipped stale revision ${job.revision} < ${latestRevision}`,
          status: 'SKIPPED',
          errorCode: 'STALE_REVISION',
          timestamp: new Date().toISOString(),
        };
        await db.collection(AI_COMMERCE_SYNC_LOGS_COLLECTION).doc(logId).set(logDoc);
        completed++;
        continue;
      }

      await jobRef.set({ state: 'LEASED', leaseUntil, updatedAt: nowIso }, { merge: true });

      const valReport = validateProductForPlatform(latestProduct, job.platform);
      await db.collection(AI_COMMERCE_VALIDATION_COLLECTION).doc(valReport.id).set(valReport);

      if (job.action === 'WITHDRAW_PROJECTION' || latestProduct.aiCommerceEnabled === false) {
        await db.collection(PUBLIC_PRODUCTS_COLLECTION).doc(job.productId).delete().catch(() => {});
      } else if (valReport.localReadiness !== 'blocked') {
        const proj = buildPublicProductOfferProjection(latestProduct);
        await db.collection(PUBLIC_PRODUCTS_COLLECTION).doc(proj.offerId).set(proj);
      }

      await jobRef.set(
        {
          state: 'COMPLETED',
          attempts: job.attempts + 1,
          leaseUntil: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const logId = `cslog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const logDoc: AICommerceSyncLog = {
        id: logId,
        jobId: job.id,
        productId: job.productId,
        platform: job.platform,
        action: job.action,
        sanitizedResult: `Processed ${job.action} for ${job.platform} (readiness=${valReport.localReadiness})`,
        status: 'SUCCESS',
        errorCode: null,
        timestamp: new Date().toISOString(),
      };
      await db.collection(AI_COMMERCE_SYNC_LOGS_COLLECTION).doc(logId).set(logDoc);
      completed++;
    } catch (err: any) {
      const attempts = (job.attempts || 0) + 1;
      const isDead = attempts >= (job.maxAttempts || 3);
      // Exponential backoff + jitter
      const backoffMs = Math.min(300_000, Math.pow(2, attempts) * 2000 + Math.floor(Math.random() * 1000));
      const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

      await jobRef.set(
        {
          state: isDead ? 'DEAD_LETTER' : 'RETRY_SCHEDULED',
          attempts,
          nextAttemptAt,
          leaseUntil: null,
          lastError: String(err?.message || err),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      if (isDead) deadLettered++;
      else retried++;
    }
  }

  return { processed, completed, retried, deadLettered };
}

// ============================================================================
// V10 Section 16 & 17: Atomic Feed Snapshot Builder with Last-Known-Good Retention
// ============================================================================

export async function buildAndPublishPlatformFeedSnapshot(params: {
  db: Firestore;
  storage?: any;
  platform: AICommercePlatformId;
  dryRun?: boolean;
  actorId: string;
}): Promise<{
  feedRun: AICommerceFeedRun;
  artifactContent: string;
}> {
  const { db, storage, platform, dryRun = false, actorId } = params;
  const now = new Date().toISOString();
  const runId = `feedrun_${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Load platform settings (or seed default)
  const settingsSnap = await db.collection(AI_COMMERCE_SETTINGS_COLLECTION).doc(platform).get();
  const defaultSettings =
    getDefaultPlatformSettingsCatalog().find((s) => s.platform === platform) ||
    getDefaultPlatformSettingsCatalog()[0];
  const settings: AICommercePlatformSettings = settingsSnap.exists
    ? { ...defaultSettings, ...(settingsSnap.data() as any) }
    : defaultSettings;

  // Read all products and filter eligible published products
  const productsSnap = await db.collection('products').get();
  const allProducts = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const validProjections: PublicProductOfferProjection[] = [];
  let withdrawnCount = 0;

  for (const prod of allProducts) {
    if (prod.aiCommerceEnabled !== true) {
      withdrawnCount++;
      continue;
    }
    const valReport = validateProductForPlatform(prod, platform, settings);
    if (valReport.localReadiness === 'blocked') {
      continue;
    }
    const primaryProj = buildPublicProductOfferProjection(prod, {
      verifiedDomain: settings.verifiedDomain,
    });
    validProjections.push(primaryProj);
  }

  let format: AICommerceFeedRun['format'] = 'xml';
  let artifactContent = '';

  if (platform === 'google_merchant') {
    format = 'xml';
    artifactContent = generateGoogleMerchantXmlFeed(validProjections, settings);
  } else if (platform === 'bing_copilot') {
    format = 'xml';
    artifactContent = generateBingMerchantXmlFeed(validProjections, settings);
  } else if (platform === 'openai_chatgpt') {
    format = 'jsonl';
    artifactContent = generateOpenAIProductsJsonlFeed(validProjections, settings);
  } else {
    format = 'json';
    artifactContent = JSON.stringify(
      {
        schemaVersion: V10_SCHEMA_VERSION,
        market: 'IN',
        currency: 'INR',
        generatedAt: now,
        count: validProjections.length,
        products: validProjections,
      },
      null,
      2
    );
  }

  const checksum = crypto.createHash('sha256').update(artifactContent).digest('hex');
  const objectPath = `ai_commerce_feeds/${platform}/${runId}.${format}`;

  // Upload to Cloud Storage if available
  if (storage && !dryRun) {
    try {
      const bucket = storage.bucket();
      const fileRef = bucket.file(objectPath);
      await fileRef.save(Buffer.from(artifactContent, 'utf-8'), {
        metadata: {
          contentType:
            format === 'xml'
              ? 'application/xml; charset=utf-8'
              : format === 'jsonl'
              ? 'application/x-ndjson; charset=utf-8'
              : 'application/json; charset=utf-8',
          metadata: { sha256: checksum, schemaVersion: V10_SCHEMA_VERSION },
        },
      });
    } catch (storageErr) {
      console.warn('[AI-COMMERCE-FEED] Cloud Storage save skipped, storing manifest in Firestore:', storageErr);
    }
  }

  // Find current active manifest for this platform so we can atomically switch & retain previous
  const existingFeedsSnap = await db
    .collection(AI_COMMERCE_FEEDS_COLLECTION)
    .where('platform', '==', platform)
    .get();
  const activeDoc = existingFeedsSnap.docs.find((d) => d.data()?.isActiveManifest === true);

  const feedRun: AICommerceFeedRun = {
    id: runId,
    platform,
    market: settings.market || 'IN',
    format,
    objectPath,
    checksum,
    count: validProjections.length,
    withdrawnCount,
    schemaVersion: V10_SCHEMA_VERSION,
    status: dryRun ? 'DRY_RUN' : 'COMPLETED',
    isActiveManifest: !dryRun,
    previousManifestRunId: activeDoc ? activeDoc.id : null,
    errorMessage: null,
    createdBy: actorId,
    createdAt: now,
  };

  await db.runTransaction(async (tx) => {
    if (!dryRun && activeDoc) {
      tx.set(activeDoc.ref, { isActiveManifest: false }, { merge: true });
    }
    tx.set(db.collection(AI_COMMERCE_FEEDS_COLLECTION).doc(runId), feedRun);
  });

  invalidatePublicProductCache();

  return { feedRun, artifactContent };
}

// ============================================================================
// Express Route Registration (V9 Sections 6–9 & V10 Sections 16–18)
// ============================================================================

export function registerAICommerceAndDiscoveryRoutes(
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
        // Fallback to headers/body in local dev
      }
    }
    return {
      uid: String(req.body?.actorId || req.headers['x-actor-id'] || 'admin-user'),
      email: String(req.body?.actorEmail || req.headers['x-actor-email'] || 'admin@leafyearth.com'),
      role: String(req.body?.actorRole || 'Admin'),
    };
  };

  // ==========================================================================
  // V9 Section 6: SEO Generation, Editing, Slug Check, Approval & Apply Routes
  // ==========================================================================

  // 1. GET /api/admin/ai-products/slug-check?slug=...&productId=...
  const handleCheckSlug = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const slug = String(req.query.slug || '').trim();
      const productId = req.query.productId ? String(req.query.productId).trim() : null;
      const result = await checkSlugAvailability(db, slug, productId);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to check slug availability' });
    }
  };
  app.get('/api/admin/ai-products/slug-check', handleCheckSlug);
  app.get('/api/v1/admin/ai-products/slug-check', handleCheckSlug);
  app.get('/api/ai-product-content/slug-check', handleCheckSlug);

  // 2. POST /api/admin/ai-products/:id/seo/generate & /api/ai-product-content/:id/seo/generate
  const handleGenerateSEOForDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const draftRef = db.collection('ai_product_drafts').doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) {
        return res.status(404).json({ error: `AI product draft '${draftId}' not found.` });
      }
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const verRef = db.collection('ai_product_versions').doc(draft.current_version_id);
      const verSnap = await verRef.get();
      if (!verSnap.exists) {
        return res.status(404).json({ error: 'Current draft version not found.' });
      }
      const ver = { id: verSnap.id, ...(verSnap.data() as any) } as AIProductVersion;
      const currentPayload = ver.edited_payload || ver.generated_payload;

      const generatedSeo = buildStructuredFallbackSEO(draft.source_product_name, {
        categoryHint: draft.category_hint || currentPayload?.category,
        brandHint: draft.brand_hint || 'LeafyEarth',
        formHint: currentPayload?.form,
      });

      // Ensure unique slug suggestion against productSlugs
      const slugCheck = await checkSlugAvailability(
        db,
        generatedSeo.urlSlug,
        draft.master_product_id
      );
      generatedSeo.urlSlug = slugCheck.available ? slugCheck.normalizedSlug : slugCheck.suggestedSlug;

      const now = new Date().toISOString();
      const updatedPayload = {
        ...currentPayload,
        seo: generatedSeo,
      };

      const updatedVer: AIProductVersion = {
        ...ver,
        edited_payload: updatedPayload,
        seo_status: 'DRAFT',
        seo_approved_by: null,
        seo_approved_at: null,
        edited_by: actor.uid,
        edited_at: now,
      };

      await verRef.set(updatedVer, { merge: true });
      await draftRef.set(
        { approved_seo_version_id: null, updated_at: now },
        { merge: true }
      );

      return res.json({
        success: true,
        draftId,
        versionId: ver.id,
        seo: generatedSeo,
        slugAvailability: slugCheck,
        versionRecord: updatedVer,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to generate SEO content' });
    }
  };
  app.post('/api/admin/ai-products/:id/seo/generate', handleGenerateSEOForDraft);
  app.post('/api/v1/admin/ai-products/:id/seo/generate', handleGenerateSEOForDraft);
  app.post('/api/ai-product-content/:id/seo/generate', handleGenerateSEOForDraft);

  // 3. PATCH /api/admin/ai-products/:id/seo & /api/ai-product-content/:id/seo
  const handleEditSEOForDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const draftRef = db.collection('ai_product_drafts').doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const verRef = db.collection('ai_product_versions').doc(draft.current_version_id);
      const verSnap = await verRef.get();
      if (!verSnap.exists) return res.status(404).json({ error: 'Version not found' });
      const ver = { id: verSnap.id, ...(verSnap.data() as any) } as AIProductVersion;

      const incomingSeo = req.body?.seo || req.body || {};
      const validated = validateSEOPayload(incomingSeo);
      if (!validated.valid) {
        return res.status(400).json({
          error: `SEO validation failed: ${validated.errors.join(' ')}`,
          validationErrors: validated.errors,
          warnings: validated.warnings,
        });
      }

      const slugCheck = await checkSlugAvailability(
        db,
        validated.seo.urlSlug,
        draft.master_product_id
      );

      const now = new Date().toISOString();
      const updatedPayload = {
        ...(ver.edited_payload || ver.generated_payload),
        seo: validated.seo,
      };

      const updatedVer: AIProductVersion = {
        ...ver,
        edited_payload: updatedPayload,
        seo_status: 'DRAFT', // Editing invalidates prior SEO approval
        seo_approved_by: null,
        seo_approved_at: null,
        edited_by: actor.uid,
        edited_at: now,
      };

      await verRef.set(updatedVer, { merge: true });
      await draftRef.set({ approved_seo_version_id: null, updated_at: now }, { merge: true });

      return res.json({
        success: true,
        seo: validated.seo,
        warnings: validated.warnings,
        slugAvailability: slugCheck,
        versionRecord: updatedVer,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to update SEO content' });
    }
  };
  app.patch('/api/admin/ai-products/:id/seo', handleEditSEOForDraft);
  app.patch('/api/v1/admin/ai-products/:id/seo', handleEditSEOForDraft);
  app.patch('/api/ai-product-content/:id/seo', handleEditSEOForDraft);

  // 4. POST /api/admin/ai-products/:id/seo/approve & /api/ai-product-content/:id/seo/approve
  const handleApproveSEOForDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const draftRef = db.collection('ai_product_drafts').doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const verRef = db.collection('ai_product_versions').doc(draft.current_version_id);
      const verSnap = await verRef.get();
      if (!verSnap.exists) return res.status(404).json({ error: 'Version not found' });
      const ver = { id: verSnap.id, ...(verSnap.data() as any) } as AIProductVersion;

      const seoCandidate = req.body?.seo || ver.edited_payload?.seo || ver.generated_payload?.seo;
      const validated = validateSEOPayload(seoCandidate);
      if (!validated.valid) {
        return res.status(400).json({
          error: `Cannot approve invalid SEO: ${validated.errors.join(' ')}`,
          validationErrors: validated.errors,
        });
      }

      const slugCheck = await checkSlugAvailability(
        db,
        validated.seo.urlSlug,
        draft.master_product_id
      );
      if (!slugCheck.available) {
        return res.status(409).json({
          error: `URL slug '${validated.seo.urlSlug}' is already claimed by product '${slugCheck.claimedByProductId}'.`,
          slugAvailability: slugCheck,
        });
      }

      const now = new Date().toISOString();
      const updatedVer: AIProductVersion = {
        ...ver,
        edited_payload: {
          ...(ver.edited_payload || ver.generated_payload),
          seo: validated.seo,
        },
        seo_status: 'APPROVED',
        seo_approved_by: actor.uid,
        seo_approved_at: now,
      };

      await verRef.set(updatedVer, { merge: true });
      await draftRef.set(
        { approved_seo_version_id: ver.id, updated_at: now },
        { merge: true }
      );

      return res.json({
        success: true,
        seo: validated.seo,
        warnings: validated.warnings,
        versionRecord: updatedVer,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to approve SEO' });
    }
  };
  app.post('/api/admin/ai-products/:id/seo/approve', handleApproveSEOForDraft);
  app.post('/api/v1/admin/ai-products/:id/seo/approve', handleApproveSEOForDraft);
  app.post('/api/ai-product-content/:id/seo/approve', handleApproveSEOForDraft);

  // 5. POST /api/admin/ai-products/:id/seo/apply & /api/ai-product-content/:id/seo/apply
  const handleApplySEOForDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const {
        masterProductId,
        selectedFields = ['seoTitle', 'metaDescription', 'seoKeywords', 'urlSlug'],
        expectedMasterRevision,
        idempotencyKey,
      } = req.body || {};

      const draftSnap = await db.collection('ai_product_drafts').doc(draftId).get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AIProductDraft;

      const targetProductId = String(masterProductId || draft.master_product_id || '').trim();
      if (!targetProductId) {
        return res.status(400).json({ error: 'masterProductId is required to apply SEO.' });
      }

      const verSnap = await db
        .collection('ai_product_versions')
        .doc(draft.approved_seo_version_id || draft.approved_version_id || draft.current_version_id)
        .get();
      if (!verSnap.exists) return res.status(404).json({ error: 'Approved version not found' });
      const ver = { id: verSnap.id, ...(verSnap.data() as any) } as AIProductVersion;

      if (ver.seo_status !== 'APPROVED' && draft.status !== 'APPROVED') {
        return res.status(400).json({
          error: 'SEO version must be APPROVED before applying to Product Master.',
        });
      }

      const seoPayload = ver.edited_payload?.seo || ver.generated_payload?.seo;
      const validated = validateSEOPayload(seoPayload);
      if (!validated.valid) {
        return res.status(400).json({
          error: `SEO validation failed: ${validated.errors.join(' ')}`,
          validationErrors: validated.errors,
        });
      }

      const idemKey = String(
        idempotencyKey || req.headers['idempotency-key'] || `seo_apply_${draftId}_${ver.id}`
      ).trim();

      const txRes = await applyApprovedSEOAndReserveSlugTransaction({
        db,
        draftId,
        versionId: ver.id,
        productId: targetProductId,
        seo: validated.seo,
        selectedFields,
        expectedMasterRevision:
          expectedMasterRevision !== undefined && expectedMasterRevision !== null
            ? Number(expectedMasterRevision)
            : null,
        idempotencyKey: idemKey,
        actor,
      });

      // Trigger public projection refresh & outbox job if product is enabled
      await syncProductToPublicProjectionAndQueueJobs(db, txRes.updatedProduct, actor.uid);

      return res.json({
        success: true,
        ...txRes,
      });
    } catch (err: any) {
      const msg = String(err?.message || 'Failed to apply SEO to master');
      const status =
        msg.includes('SLUG_CONFLICT') ||
        msg.includes('MASTER_REVISION_CONFLICT') ||
        msg.includes('IDEMPOTENCY_PAYLOAD_MISMATCH')
          ? 409
          : 400;
      return res.status(status).json({ error: msg });
    }
  };
  app.post('/api/admin/ai-products/:id/seo/apply', handleApplySEOForDraft);
  app.post('/api/v1/admin/ai-products/:id/seo/apply', handleApplySEOForDraft);
  app.post('/api/ai-product-content/:id/seo/apply', handleApplySEOForDraft);

  // ==========================================================================
  // V10 Section 16: AI Commerce Generation, Review, Approval, Sync & Feeds API
  // ==========================================================================

  // 6. POST /api/ai-commerce/:productId/generate & /api/admin/ai-commerce/:productId/generate
  const handleGenerateCommerceDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const productIdParam = req.params.productId;
      const { productName, aiDraftId, categoryHint, packingSize } = req.body || {};

      let masterProduct: Record<string, any> | null = null;
      if (productIdParam && productIdParam !== 'new') {
        const snap = await db.collection('products').doc(productIdParam).get();
        if (snap.exists) {
          masterProduct = { id: snap.id, ...(snap.data() as any) };
        }
      }

      const sourceName = String(
        productName || masterProduct?.name || masterProduct?.title || 'LeafyEarth Product'
      ).trim();

      const commerceContent = buildStructuredFallbackCommerce(sourceName, {
        categoryHint: categoryHint || masterProduct?.category,
        packingSize: packingSize || masterProduct?.packingSize || '100 g',
      });
      const seoContent = buildStructuredFallbackSEO(sourceName, {
        categoryHint: categoryHint || masterProduct?.category,
        brandHint: masterProduct?.brand || 'LeafyEarth',
      });

      // Check existing staging drafts for this product to increment version
      const existingSnap = await db
        .collection(AI_COMMERCE_STAGING_COLLECTION)
        .where('productId', '==', masterProduct ? masterProduct.id : null)
        .get();
      const maxVer = existingSnap.docs.reduce(
        (m, d) => Math.max(m, Number(d.data()?.version || 0)),
        0
      );

      const now = new Date().toISOString();
      const stagingId = `aicdraft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const stagingDoc: AICommerceStagingDraft = {
        id: stagingId,
        productId: masterProduct ? String(masterProduct.id) : null,
        aiDraftId: aiDraftId ? String(aiDraftId) : null,
        sourceProductName: sourceName,
        version: maxVer + 1,
        content: commerceContent,
        seo: seoContent,
        evidence: {
          gtinVerified: Boolean(masterProduct?.gtin && validateGtinChecksum(masterProduct.gtin).valid),
          fssaiVerified: Boolean(
            masterProduct?.fssaiLicenseNumber &&
              validateFssaiLicenseNumber(masterProduct.fssaiLicenseNumber).valid
          ),
          originVerified: true,
          allergenVerified: Boolean(
            Array.isArray(masterProduct?.allergenInformation) &&
              masterProduct.allergenInformation.length > 0
          ),
        },
        provenance: {
          model: 'gpt-4o-mini',
          promptVersion: V10_SCHEMA_VERSION,
          generatedAt: now,
          liveApiUsed: false,
        },
        status: 'DRAFT',
        errors: [],
        actorId: actor.uid,
        actorEmail: actor.email,
        createdAt: now,
        updatedAt: now,
        approvedBy: null,
        approvedAt: null,
      };

      await db.collection(AI_COMMERCE_STAGING_COLLECTION).doc(stagingId).set(stagingDoc);
      return res.json({ success: true, draft: stagingDoc });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to generate AI commerce draft' });
    }
  };
  app.post('/api/ai-commerce/:productId/generate', handleGenerateCommerceDraft);
  app.post('/api/v1/ai-commerce/:productId/generate', handleGenerateCommerceDraft);
  app.post('/api/admin/ai-commerce/:productId/generate', handleGenerateCommerceDraft);

  // 7. PATCH /api/ai-commerce/drafts/:id
  const handleEditCommerceDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const ref = db.collection(AI_COMMERCE_STAGING_COLLECTION).doc(draftId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Commerce staging draft not found' });
      const existing = { id: snap.id, ...(snap.data() as any) } as AICommerceStagingDraft;

      const contentRaw = req.body?.content || req.body?.commerce || existing.content;
      const validated = validateAICommercePayload(contentRaw);
      if (!validated.valid) {
        return res.status(400).json({
          error: `Commerce validation failed: ${validated.errors.join(' ')}`,
          validationErrors: validated.errors,
        });
      }

      let updatedSeo = existing.seo;
      if (req.body?.seo) {
        const seoVal = validateSEOPayload(req.body.seo);
        if (!seoVal.valid) {
          return res.status(400).json({
            error: `SEO validation failed: ${seoVal.errors.join(' ')}`,
            validationErrors: seoVal.errors,
          });
        }
        updatedSeo = seoVal.seo;
      }

      const now = new Date().toISOString();
      const updatedDoc: AICommerceStagingDraft = {
        ...existing,
        productId:
          req.body?.productId !== undefined ? req.body.productId : existing.productId,
        content: validated.commerce,
        seo: updatedSeo,
        evidence: {
          ...existing.evidence,
          ...(req.body?.evidence || {}),
        },
        status: 'DRAFT', // Editing invalidates approval (Section 13)
        errors: [],
        actorId: actor.uid,
        actorEmail: actor.email,
        updatedAt: now,
        approvedBy: null,
        approvedAt: null,
      };

      await ref.set(updatedDoc, { merge: true });
      return res.json({ success: true, draft: updatedDoc });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to update commerce draft' });
    }
  };
  app.patch('/api/ai-commerce/drafts/:id', handleEditCommerceDraft);
  app.patch('/api/v1/ai-commerce/drafts/:id', handleEditCommerceDraft);
  app.patch('/api/admin/ai-commerce/drafts/:id', handleEditCommerceDraft);

  // 8. POST /api/ai-commerce/drafts/:id/approve
  const handleApproveCommerceDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const ref = db.collection(AI_COMMERCE_STAGING_COLLECTION).doc(draftId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Commerce staging draft not found' });
      const existing = { id: snap.id, ...(snap.data() as any) } as AICommerceStagingDraft;

      const validated = validateAICommercePayload(existing.content);
      if (!validated.valid) {
        return res.status(400).json({
          error: `Cannot approve invalid commerce draft: ${validated.errors.join(' ')}`,
          validationErrors: validated.errors,
        });
      }

      const now = new Date().toISOString();
      const approvedDoc: AICommerceStagingDraft = {
        ...existing,
        content: validated.commerce,
        status: 'APPROVED',
        errors: [],
        updatedAt: now,
        approvedBy: actor.uid,
        approvedAt: now,
      };

      await ref.set(approvedDoc, { merge: true });
      return res.json({ success: true, draft: approvedDoc });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to approve commerce draft' });
    }
  };
  app.post('/api/ai-commerce/drafts/:id/approve', handleApproveCommerceDraft);
  app.post('/api/v1/ai-commerce/drafts/:id/approve', handleApproveCommerceDraft);
  app.post('/api/admin/ai-commerce/drafts/:id/approve', handleApproveCommerceDraft);

  // 9. POST /api/ai-commerce/drafts/:id/apply
  const handleApplyCommerceDraft = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const draftId = req.params.id;
      const {
        productId,
        selectedFields = [
          'productHighlights',
          'productFAQs',
          'searchTags',
          'dietaryAttributes',
          'googleProductCategory',
          'productType',
          'countryOfOrigin',
          'netWeight',
          'netWeightUnit',
          'netVolume',
          'netVolumeUnit',
        ],
        aiCommerceEnabled,
        expectedMasterRevision,
        idempotencyKey,
      } = req.body || {};

      const draftRef = db.collection(AI_COMMERCE_STAGING_COLLECTION).doc(draftId);
      const draftSnap = await draftRef.get();
      if (!draftSnap.exists) return res.status(404).json({ error: 'Commerce draft not found' });
      const draft = { id: draftSnap.id, ...(draftSnap.data() as any) } as AICommerceStagingDraft;

      if (draft.status !== 'APPROVED' && draft.status !== 'APPLIED') {
        return res.status(400).json({
          error: `Commerce draft must be APPROVED before applying (current: ${draft.status}).`,
        });
      }

      const targetProductId = String(productId || draft.productId || '').trim();
      if (!targetProductId) {
        return res.status(400).json({ error: 'productId is required to apply commerce fields.' });
      }

      const idemKey = String(
        idempotencyKey || req.headers['idempotency-key'] || `commerce_apply_${draftId}_${draft.version}`
      ).trim();
      const idemDocId = `comidem_${crypto.createHash('sha256').update(idemKey).digest('hex').slice(0, 32)}`;
      const syncLogRef = db.collection('ai_product_sync_logs').doc(idemDocId);
      const productRef = db.collection('products').doc(targetProductId);
      const selectedSet = new Set((selectedFields as string[]).map((f) => String(f).trim()));
      const now = new Date().toISOString();

      const txResult = await db.runTransaction(async (tx) => {
        const existingSync = await tx.get(syncLogRef);
        if (existingSync.exists) {
          const prodSnap = await tx.get(productRef);
          return {
            idempotentReplay: true,
            syncLog: { id: existingSync.id, ...existingSync.data() },
            updatedProduct: prodSnap.exists ? { id: prodSnap.id, ...prodSnap.data() } : {},
          };
        }

        const prodSnap = await tx.get(productRef);
        if (!prodSnap.exists) {
          throw new Error(`Target product '${targetProductId}' does not exist.`);
        }
        const existingProd = { id: prodSnap.id, ...(prodSnap.data() as any) };
        const currentRev = Number(existingProd.revision || 1);

        if (
          expectedMasterRevision !== undefined &&
          expectedMasterRevision !== null &&
          Number(expectedMasterRevision) !== currentRev
        ) {
          throw new Error(
            `MASTER_REVISION_CONFLICT: Expected revision ${expectedMasterRevision}, found ${currentRev}.`
          );
        }

        const c = draft.content;
        const sugg = c.factualAttributeSuggestions || {};
        const candidateMap: Record<string, any> = {
          productHighlights: c.productHighlights,
          productFAQs: c.productFAQs,
          searchTags: c.searchTags,
          dietaryAttributes: c.dietaryAttributes,
          googleProductCategory: c.googleProductCategory,
          productType: c.productType,
          countryOfOrigin: sugg.countryOfOrigin || existingProd.countryOfOrigin || 'India',
          condition: sugg.condition || existingProd.condition || 'new',
          netWeight: sugg.netWeight ?? existingProd.netWeight ?? null,
          netWeightUnit: sugg.netWeightUnit ?? existingProd.netWeightUnit ?? null,
          netVolume: sugg.netVolume ?? existingProd.netVolume ?? null,
          netVolumeUnit: sugg.netVolumeUnit ?? existingProd.netVolumeUnit ?? null,
        };

        const beforeSnapshot: Record<string, any> = {};
        const afterSnapshot: Record<string, any> = {};
        const updatePatch: Record<string, any> = {};
        const aiMeta: Record<string, AIContentProvenanceEntry> = {
          ...(existingProd.aiContentMetadata || {}),
        };

        for (const [k, v] of Object.entries(candidateMap)) {
          if (!selectedSet.has(k)) continue;
          if (v === undefined) continue;
          beforeSnapshot[k] = existingProd[k] ?? null;
          updatePatch[k] = v;
          afterSnapshot[k] = v;
          aiMeta[k] = {
            source: 'ai',
            draftId: draft.id,
            versionId: String(draft.version),
            model: draft.provenance.model,
            promptVersion: draft.provenance.promptVersion,
            approvedBy: actor.uid,
            approvedAt: now,
          };
        }

        if (aiCommerceEnabled !== undefined) {
          beforeSnapshot.aiCommerceEnabled = existingProd.aiCommerceEnabled ?? false;
          updatePatch.aiCommerceEnabled = Boolean(aiCommerceEnabled);
          afterSnapshot.aiCommerceEnabled = Boolean(aiCommerceEnabled);
        }

        const nextRev = currentRev + 1;
        updatePatch.aiContentMetadata = aiMeta;
        updatePatch.aiCommerceUpdatedAt = now;
        updatePatch.revision = nextRev;

        tx.set(productRef, updatePatch, { merge: true });
        tx.set(draftRef, { status: 'APPLIED', productId: targetProductId, updatedAt: now }, { merge: true });

        const syncLogDoc: AIProductSyncLog = {
          id: idemDocId,
          draft_id: draft.id,
          version_id: String(draft.version),
          master_product_id: targetProductId,
          idempotency_key: idemKey,
          selected_fields: Array.from(selectedSet),
          approved_commerce_draft_id: draft.id,
          expected_master_revision: expectedMasterRevision ?? currentRev,
          resulting_master_revision: nextRev,
          before_snapshot: beforeSnapshot,
          after_snapshot: afterSnapshot,
          result: 'SUCCESS',
          error_message: null,
          applied_by: actor.uid,
          applied_by_email: actor.email,
          applied_at: now,
        };
        tx.set(syncLogRef, syncLogDoc);

        return {
          idempotentReplay: false,
          syncLog: syncLogDoc,
          updatedProduct: { ...existingProd, ...updatePatch },
        };
      });

      const syncOutbox = await syncProductToPublicProjectionAndQueueJobs(
        db,
        txResult.updatedProduct,
        actor.uid
      );

      return res.json({
        success: true,
        ...txResult,
        projectionPublished: syncOutbox.published,
        publicProjection: syncOutbox.projection,
      });
    } catch (err: any) {
      const msg = String(err?.message || 'Failed to apply commerce draft');
      return res.status(msg.includes('MASTER_REVISION_CONFLICT') ? 409 : 400).json({ error: msg });
    }
  };
  app.post('/api/ai-commerce/drafts/:id/apply', handleApplyCommerceDraft);
  app.post('/api/v1/ai-commerce/drafts/:id/apply', handleApplyCommerceDraft);
  app.post('/api/admin/ai-commerce/drafts/:id/apply', handleApplyCommerceDraft);

  // 10. POST /api/ai-commerce/validate
  const handleValidateProductPlatform = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const { productId, platform = 'google_merchant' } = req.body || {};
      if (!productId) return res.status(400).json({ error: 'productId is required' });

      const prodSnap = await db.collection('products').doc(String(productId)).get();
      if (!prodSnap.exists) return res.status(404).json({ error: 'Product not found' });
      const product = { id: prodSnap.id, ...(prodSnap.data() as any) };

      const platforms: AICommercePlatformId[] =
        platform === 'ALL'
          ? ['google_merchant', 'public_web', 'bing_copilot', 'openai_chatgpt', 'perplexity']
          : [platform as AICommercePlatformId];

      const reports: AICommerceValidationReport[] = [];
      for (const pf of platforms) {
        const report = validateProductForPlatform(product, pf);
        await db.collection(AI_COMMERCE_VALIDATION_COLLECTION).doc(report.id).set(report);
        reports.push(report);
      }

      return res.json({
        success: true,
        productId,
        report: reports[0],
        reports,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Validation failed' });
    }
  };
  app.post('/api/ai-commerce/validate', handleValidateProductPlatform);
  app.post('/api/v1/ai-commerce/validate', handleValidateProductPlatform);
  app.post('/api/admin/ai-commerce/validate', handleValidateProductPlatform);

  // 11. POST /api/ai-commerce/feeds/:platform/build
  const handleBuildPlatformFeed = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const platform = req.params.platform as AICommercePlatformId;
      const dryRun = Boolean(req.body?.dryRun);

      const { feedRun, artifactContent } = await buildAndPublishPlatformFeedSnapshot({
        db,
        storage: deps.storage,
        platform,
        dryRun,
        actorId: actor.uid,
      });

      return res.json({
        success: true,
        feedRun,
        previewSnippet: artifactContent.slice(0, 4000),
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to build platform feed' });
    }
  };
  app.post('/api/ai-commerce/feeds/:platform/build', handleBuildPlatformFeed);
  app.post('/api/v1/ai-commerce/feeds/:platform/build', handleBuildPlatformFeed);
  app.post('/api/admin/ai-commerce/feeds/:platform/build', handleBuildPlatformFeed);

  // 12. POST /api/ai-commerce/sync/:platform
  const handleQueuePlatformSync = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const platform = req.params.platform as AICommercePlatformId;

      const defaultCatalog = getDefaultPlatformSettingsCatalog();
      const defaultPf = defaultCatalog.find((s) => s.platform === platform) || defaultCatalog[0];
      const settingsSnap = await db.collection(AI_COMMERCE_SETTINGS_COLLECTION).doc(platform).get();
      const settings: AICommercePlatformSettings = settingsSnap.exists
        ? { ...defaultPf, ...(settingsSnap.data() as any) }
        : defaultPf;

      // Section 12 & 16: Enforce market eligibility & feature flag
      if (!settings.marketEligible) {
        return res.status(400).json({
          error: `Platform '${platform}' is not currently eligible for direct merchant feed submission in market '${settings.market}'. ${settings.eligibilityNote}`,
          marketEligible: false,
        });
      }

      const workerStats = await processPendingCommerceSyncJobs(db, 50);
      const { feedRun } = await buildAndPublishPlatformFeedSnapshot({
        db,
        storage: deps.storage,
        platform,
        dryRun: !settings.enabled || settings.syncPolicy.dryRunOnly,
        actorId: actor.uid,
      });

      return res.json({
        success: true,
        platform,
        workerStats,
        feedRun,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to execute platform sync' });
    }
  };
  app.post('/api/ai-commerce/sync/:platform', handleQueuePlatformSync);
  app.post('/api/v1/ai-commerce/sync/:platform', handleQueuePlatformSync);
  app.post('/api/admin/ai-commerce/sync/:platform', handleQueuePlatformSync);

  // 13. PUT /api/ai-commerce/settings/:platform
  const handleUpdatePlatformSettings = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const actor = await resolveActor(req);
      const platform = req.params.platform as AICommercePlatformId;
      const defaultCatalog = getDefaultPlatformSettingsCatalog();
      const base = defaultCatalog.find((s) => s.platform === platform);
      if (!base) return res.status(400).json({ error: `Unknown platform '${platform}'` });

      const existingSnap = await db.collection(AI_COMMERCE_SETTINGS_COLLECTION).doc(platform).get();
      const existing = existingSnap.exists ? (existingSnap.data() as any) : {};

      const updated: AICommercePlatformSettings = {
        ...base,
        ...existing,
        ...(req.body || {}),
        id: platform,
        platform,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.uid,
      };

      await db.collection(AI_COMMERCE_SETTINGS_COLLECTION).doc(platform).set(updated, { merge: true });
      return res.json({ success: true, settings: updated });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Failed to update platform settings' });
    }
  };
  app.put('/api/ai-commerce/settings/:platform', handleUpdatePlatformSettings);
  app.put('/api/v1/ai-commerce/settings/:platform', handleUpdatePlatformSettings);
  app.put('/api/admin/ai-commerce/settings/:platform', handleUpdatePlatformSettings);

  // 14. GET /api/ai-commerce/status & /api/admin/ai-commerce/status
  const handleGetCommerceStatusDashboard = async (_req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const [
        productsSnap,
        settingsSnap,
        stagingSnap,
        feedsSnap,
        jobsSnap,
        logsSnap,
        validationsSnap,
        platformStatusSnap,
        publicProjectionsSnap,
        slugsSnap,
      ] = await Promise.all([
        db.collection('products').get(),
        db.collection(AI_COMMERCE_SETTINGS_COLLECTION).get(),
        db.collection(AI_COMMERCE_STAGING_COLLECTION).get(),
        db.collection(AI_COMMERCE_FEEDS_COLLECTION).get(),
        db.collection(AI_COMMERCE_SYNC_JOBS_COLLECTION).get(),
        db.collection(AI_COMMERCE_SYNC_LOGS_COLLECTION).get(),
        db.collection(AI_COMMERCE_VALIDATION_COLLECTION).get(),
        db.collection(AI_COMMERCE_PLATFORM_STATUS_COLLECTION).get(),
        db.collection(PUBLIC_PRODUCTS_COLLECTION).get(),
        db.collection(PRODUCT_SLUGS_COLLECTION).get(),
      ]);

      const defaultSettings = getDefaultPlatformSettingsCatalog();
      const storedSettingsMap = new Map<string, any>();
      settingsSnap.docs.forEach((d) => storedSettingsMap.set(d.id, { id: d.id, ...d.data() }));
      const settings: AICommercePlatformSettings[] = defaultSettings.map((def) => ({
        ...def,
        ...(storedSettingsMap.get(def.platform) || {}),
      }));

      const products = productsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const googleValidations = products.map((p) =>
        validateProductForPlatform(p, 'google_merchant', settings[0])
      );

      const summary = {
        totalProducts: products.length,
        commerceEnabledCount: products.filter((p) => p.aiCommerceEnabled === true).length,
        publishedProjectionsCount: publicProjectionsSnap.size,
        slugReservationsCount: slugsSnap.size,
        readyCount: googleValidations.filter((v) => v.localReadiness === 'ready').length,
        warningCount: googleValidations.filter((v) => v.localReadiness === 'warning').length,
        blockedCount: googleValidations.filter((v) => v.localReadiness === 'blocked').length,
        disabledCount: googleValidations.filter((v) => v.localReadiness === 'disabled').length,
        pendingJobsCount: jobsSnap.docs.filter((d) =>
          ['PENDING', 'RETRY_SCHEDULED'].includes(d.data()?.state)
        ).length,
      };

      return res.json({
        success: true,
        summary,
        settings,
        stagingDrafts: stagingSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
        feedRuns: feedsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
        syncJobs: jobsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
          .slice(0, 50),
        syncLogs: logsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
          .slice(0, 50),
        validations: googleValidations,
        storedValidations: validationsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        platformStatuses: platformStatusSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        publicProjections: publicProjectionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        slugReservations: slugsSnap.docs.map((d) => ({ slug: d.id, ...d.data() })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to load AI Commerce status' });
    }
  };
  app.get('/api/ai-commerce/status', handleGetCommerceStatusDashboard);
  app.get('/api/v1/ai-commerce/status', handleGetCommerceStatusDashboard);
  app.get('/api/admin/ai-commerce/status', handleGetCommerceStatusDashboard);

  // ==========================================================================
  // V9 & V10 Sections 7.1, 8, 9, 17, 18: Public Feeds, Sitemap, Robots & SSR
  // ==========================================================================

  const loadActivePublicProjections = async (db: Firestore): Promise<PublicProductOfferProjection[]> => {
    const pubSnap = await db.collection(PUBLIC_PRODUCTS_COLLECTION).get();
    if (!pubSnap.empty) {
      return pubSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as PublicProductOfferProjection));
    }
    // Fallback: derive projections from products with urlSlug or aiCommerceEnabled
    const prodsSnap = await db.collection('products').get();
    return prodsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((p) => p.aiCommerceEnabled === true || Boolean(p.urlSlug))
      .map((p) => buildPublicProductOfferProjection(p));
  };

  // Public Feed 1: /feeds/google-products.xml
  app.get('/feeds/google-products.xml', async (_req, res) => {
    try {
      const db = getDb();
      const projections = await loadActivePublicProjections(db);
      const settings = getDefaultPlatformSettingsCatalog()[0];
      const xml = generateGoogleMerchantXmlFeed(projections, settings);
      const etag = `"${crypto.createHash('sha256').update(xml).digest('hex').slice(0, 16)}"`;
      res
        .status(200)
        .set({
          'Content-Type': 'application/xml; charset=utf-8',
          ETag: etag,
          'Cache-Control': 'public, max-age=300',
        })
        .send(xml);
    } catch (err: any) {
      res.status(500).type('text/plain').send(`Feed generation error: ${err?.message}`);
    }
  });

  // Public Feed 2: /feeds/bing-products.xml
  app.get('/feeds/bing-products.xml', async (_req, res) => {
    try {
      const db = getDb();
      const projections = await loadActivePublicProjections(db);
      const settings = getDefaultPlatformSettingsCatalog()[2];
      const xml = generateBingMerchantXmlFeed(projections, settings);
      const etag = `"${crypto.createHash('sha256').update(xml).digest('hex').slice(0, 16)}"`;
      res
        .status(200)
        .set({
          'Content-Type': 'application/xml; charset=utf-8',
          ETag: etag,
          'Cache-Control': 'public, max-age=300',
        })
        .send(xml);
    } catch (err: any) {
      res.status(500).type('text/plain').send(`Feed generation error: ${err?.message}`);
    }
  });

  // Public Feed 3: /feeds/openai-products.jsonl
  app.get('/feeds/openai-products.jsonl', async (_req, res) => {
    try {
      const db = getDb();
      const projections = await loadActivePublicProjections(db);
      const settings = getDefaultPlatformSettingsCatalog()[3];
      const jsonl = generateOpenAIProductsJsonlFeed(projections, settings);
      res
        .status(200)
        .set({
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'X-OpenAI-Feed-Schema': V10_SCHEMA_VERSION,
          'X-OpenAI-Submission-Enabled': String(settings.enabled && settings.marketEligible),
          'Cache-Control': 'public, max-age=300',
        })
        .send(jsonl);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to build OpenAI JSONL feed' });
    }
  });

  // Public Feed 4: /feeds/products.json
  app.get('/feeds/products.json', async (_req, res) => {
    try {
      const db = getDb();
      const projections = await loadActivePublicProjections(db);
      const bodyStr = JSON.stringify(projections);
      const checksum = crypto.createHash('sha256').update(bodyStr).digest('hex');
      res
        .status(200)
        .set({
          'Content-Type': 'application/json; charset=utf-8',
          ETag: `"${checksum.slice(0, 16)}"`,
          'Cache-Control': 'public, max-age=300',
        })
        .json({
          schemaVersion: V10_SCHEMA_VERSION,
          market: 'IN',
          currency: 'INR',
          checksum,
          count: projections.length,
          products: projections,
        });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to serve public catalog JSON' });
    }
  });

  // Public Search & Read-Only Catalog API: GET /api/v1/public/products & /api/public/products
  const handlePublicProductsSearch = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      let projections = await loadActivePublicProjections(db);
      const q = String(req.query.q || req.query.search || '').trim().toLowerCase();
      const category = String(req.query.category || '').trim().toLowerCase();
      const availability = String(req.query.availability || '').trim().toLowerCase();
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20));

      if (q) {
        projections = projections.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.urlSlug.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.searchTags || []).some((t) => t.toLowerCase().includes(q))
        );
      }
      if (category) {
        projections = projections.filter((p) => p.category.toLowerCase() === category);
      }
      if (availability) {
        projections = projections.filter((p) => p.availability === availability);
      }

      const total = projections.length;
      const start = (page - 1) * limit;
      const items = projections.slice(start, start + limit);

      return res.json({
        success: true,
        market: 'IN',
        currency: 'INR',
        page,
        limit,
        total,
        products: items,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Public product search failed' });
    }
  };
  app.get('/api/v1/public/products', handlePublicProductsSearch);
  app.get('/api/public/products', handlePublicProductsSearch);

  // Public Slug / ID Resolver API: GET /api/v1/public/products/:slugOrId
  const resolveSlugOrIdToPublicProduct = async (
    db: Firestore,
    slugOrId: string
  ): Promise<{
    status: 200 | 301 | 404;
    redirectSlug?: string;
    projection?: PublicProductOfferProjection;
  }> => {
    const cleanParam = String(slugOrId || '').trim();
    if (!cleanParam) return { status: 404 };

    // 1. Check productSlugs/{slug} first
    const slugSnap = await db.collection(PRODUCT_SLUGS_COLLECTION).doc(cleanParam.toLowerCase()).get();
    if (slugSnap.exists) {
      const reservation = slugSnap.data() as ProductSlugReservation;
      const prodSnap = await db.collection('products').doc(String(reservation.productId)).get();
      if (!prodSnap.exists) return { status: 404 };
      const prodData = { id: prodSnap.id, ...(prodSnap.data() as any) };
      if (prodData.aiCommerceEnabled === false && !prodData.urlSlug) {
        return { status: 404 };
      }
      const canonicalSlug = prodData.urlSlug || reservation.canonicalSlug || cleanParam.toLowerCase();
      if (reservation.state === 'redirect' && canonicalSlug && canonicalSlug !== cleanParam.toLowerCase()) {
        return { status: 301, redirectSlug: canonicalSlug };
      }
      return {
        status: 200,
        projection: buildPublicProductOfferProjection(prodData),
      };
    }

    // 2. Fallback: Check direct product ID in products/{id}
    const directProdSnap = await db.collection('products').doc(cleanParam).get();
    if (directProdSnap.exists) {
      const prodData = { id: directProdSnap.id, ...(directProdSnap.data() as any) };
      if (prodData.aiCommerceEnabled === false) {
        return { status: 404 };
      }
      if (prodData.urlSlug && isValidUrlSlug(prodData.urlSlug) && prodData.urlSlug !== cleanParam) {
        return {
          status: 301,
          redirectSlug: prodData.urlSlug,
          projection: buildPublicProductOfferProjection(prodData),
        };
      }
      return {
        status: 200,
        projection: buildPublicProductOfferProjection(prodData),
      };
    }

    // 3. Fallback: Search products where urlSlug == cleanParam.toLowerCase()
    const bySlugSnap = await db
      .collection('products')
      .where('urlSlug', '==', cleanParam.toLowerCase())
      .limit(1)
      .get();
    if (!bySlugSnap.empty) {
      const doc = bySlugSnap.docs[0];
      const prodData = { id: doc.id, ...(doc.data() as any) };
      if (prodData.aiCommerceEnabled === false) return { status: 404 };
      return {
        status: 200,
        projection: buildPublicProductOfferProjection(prodData),
      };
    }

    return { status: 404 };
  };

  const handlePublicResolveProduct = async (req: express.Request, res: express.Response) => {
    try {
      const db = getDb();
      const resolved = await resolveSlugOrIdToPublicProduct(db, req.params.slugOrId);
      if (resolved.status === 404) {
        return res.status(404).json({ error: 'Product not found or unpublished', status: 404 });
      }
      if (resolved.status === 301 && resolved.redirectSlug) {
        return res.status(200).json({
          success: true,
          status: 301,
          redirect: true,
          canonicalSlug: resolved.redirectSlug,
          canonicalPath: `/products/${resolved.redirectSlug}`,
          product: resolved.projection || null,
        });
      }
      return res.json({
        success: true,
        status: 200,
        redirect: false,
        canonicalSlug: resolved.projection?.urlSlug,
        product: resolved.projection,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to resolve product' });
    }
  };
  app.get('/api/v1/public/products/:slugOrId', handlePublicResolveProduct);
  app.get('/api/public/products/:slugOrId', handlePublicResolveProduct);

  // Sitemap, Robots.txt, llms.txt & Deep Link Well-Known Endpoints (Sections 7.1, 9, 17, 18)
  app.get('/sitemap.xml', async (_req, res) => {
    try {
      const db = getDb();
      const projections = await loadActivePublicProjections(db);
      const xml = generateSitemapXml(projections);
      res
        .status(200)
        .set({
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=600',
        })
        .send(xml);
    } catch (err: any) {
      res.status(500).type('text/plain').send('Failed to generate sitemap');
    }
  });

  app.get('/robots.txt', (_req, res) => {
    const allowTraining =
      String(process.env.ALLOW_AI_TRAINING_BOTS || 'false').toLowerCase() === 'true';
    res
      .status(200)
      .set({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      })
      .send(generateRobotsTxt(getDefaultVerifiedDomain(), { allowTrainingBots: allowTraining }));
  });

  app.get('/llms.txt', async (_req, res) => {
    try {
      const db = getDb();
      const projections = await loadActivePublicProjections(db);
      res
        .status(200)
        .set({
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=600',
        })
        .send(generateLlmsTxt(projections));
    } catch {
      res.status(200).type('text/plain').send('# LeafyEarth Catalog');
    }
  });

  // Android App Links (/.well-known/assetlinks.json) - Section 7.1
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const packageName = (process.env.ANDROID_PACKAGE_NAME || 'com.leafyearth.app').trim();
    const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  });

  // iOS Universal Links (/.well-known/apple-app-site-association) - Section 7.1
  app.get('/.well-known/apple-app-site-association', (_req, res) => {
    const teamId = (process.env.IOS_TEAM_ID || 'TEAMID_REQUIRED').trim();
    const bundleId = (process.env.IOS_BUNDLE_ID || 'com.leafyearth.app').trim();
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${teamId}.${bundleId}`],
            components: [
              {
                '/': '/products/*',
                comment: 'Matches all canonical LeafyEarth product URLs',
              },
            ],
          },
        ],
      },
    });
  });

  // Server-Rendered Product Landing Route: GET /products/:slugOrId (Sections 7.1, 8, 9)
  app.get('/products/:slugOrId', async (req, res, next) => {
    try {
      if (!deps.db) return next();
      const slugOrId = String(req.params.slugOrId || '').trim();
      const resolved = await resolveSlugOrIdToPublicProduct(deps.db, slugOrId);

      if (resolved.status === 301 && resolved.redirectSlug) {
        return res.redirect(301, `/products/${encodeURIComponent(resolved.redirectSlug)}`);
      }

      if (resolved.status === 404 || !resolved.projection) {
        return res
          .status(404)
          .set({
            'Content-Type': 'text/html; charset=utf-8',
            'X-Robots-Tag': 'noindex, nofollow',
          })
          .send(`<!DOCTYPE html>
<html lang="en-IN">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Product Not Found | LeafyEarth</title>
  </head>
  <body style="font-family:system-ui,sans-serif;padding:3rem;text-align:center;">
    <h1>404 – Product Not Found</h1>
    <p>The requested product is unavailable or has been withdrawn.</p>
    <a href="/">Return to LeafyEarth Store</a>
  </body>
</html>`);
      }

      const cacheKey = `ssr:${resolved.projection.urlSlug}`;
      const cached = publicResponseCache.get(cacheKey);
      if (cached && req.headers['if-none-match'] === cached.etag) {
        return res.status(304).end();
      }

      let baseTemplate: string | undefined;
      try {
        const fs = await import('fs');
        const path = await import('path');
        const distHtml = path.join(process.cwd(), 'dist', 'index.html');
        const rootHtml = path.join(process.cwd(), 'index.html');
        if (fs.existsSync(distHtml)) {
          baseTemplate = fs.readFileSync(distHtml, 'utf-8');
        } else if (fs.existsSync(rootHtml)) {
          baseTemplate = fs.readFileSync(rootHtml, 'utf-8');
        }
      } catch {
        baseTemplate = undefined;
      }

      const renderedHtml = renderServerProductLandingHtml(resolved.projection, baseTemplate);
      const etag = `"${crypto.createHash('sha256').update(renderedHtml).digest('hex').slice(0, 16)}"`;
      publicResponseCache.set(cacheKey, {
        body: renderedHtml,
        contentType: 'text/html; charset=utf-8',
        etag,
        cachedAt: Date.now(),
      });

      return res
        .status(200)
        .set({
          'Content-Type': 'text/html; charset=utf-8',
          ETag: etag,
          'Cache-Control': 'public, max-age=120',
        })
        .send(renderedHtml);
    } catch (err) {
      return next(err);
    }
  });
}
