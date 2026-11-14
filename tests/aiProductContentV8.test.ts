import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoSeoFields,
  buildMasterComparisonDiff,
  buildSelectedMasterUpdatePayload,
  buildStructuredFallbackContent,
  calculateMarketPriceRange,
  generatePureWhite1000x1000PngBuffer,
  inspectPngDimensions,
  normalizePackSizeString,
  validateAIProductContentPayload,
} from '../src/services/aiProductContentService';
import {
  computeHighestExistingEightDigitSku,
  enforceSkuImmutabilityOnUpdate,
  isValidEightDigitNumericSku,
  MIN_EIGHT_DIGIT_SKU,
} from '../src/services/skuAllocationService';
import { SECURITY_MODULES_CATALOG } from '../src/utils/securityCatalog';
import type { AIProductImage, AIProductResearchRecord, AIProductVersion } from '../src/types';

test('Section 4 & 12: Rejects forbidden SEO fields and validates 6 native language scripts', () => {
  assert.throws(
    () => assertNoSeoFields({ english_product_name: 'Turmeric', seo_title: 'Buy Turmeric' }),
    /SEO field 'seo_title' is prohibited/
  );

  const payload = buildStructuredFallbackContent('Wayanad Lakadong Turmeric Powder');
  const validResult = validateAIProductContentPayload(payload);
  assert.equal(validResult.valid, true, `Validation errors: ${validResult.errors.join('; ')}`);

  // Native script validation for all 6 languages
  assert.ok(payload.translations.en.name.length > 0);
  assert.match(payload.translations.ml.name, /[\u0D00-\u0D7F]/, 'Malayalam must use native script');
  assert.match(payload.translations.hi.name, /[\u0900-\u097F]/, 'Hindi must use Devanagari script');
  assert.match(payload.translations.ta.name, /[\u0B80-\u0BFF]/, 'Tamil must use Tamil script');
  assert.match(payload.translations.kn.name, /[\u0C80-\u0CFF]/, 'Kannada must use Kannada script');
  assert.match(payload.translations.te.name, /[\u0C00-\u0C7F]/, 'Telugu must use Telugu script');

  // Corrupting Malayalam to Latin characters must fail native script validation
  const invalidMl = {
    ...payload,
    translations: {
      ...payload.translations,
      ml: { name: 'Manjal Latin Only' },
    },
  };
  const invalidResult = validateAIProductContentPayload(invalidMl);
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.errors.some((e) => e.includes('translations.ml.name')));
});

test('Section 16.9: Conditional Ayurvedic applicability and medical claim guardrails', () => {
  const turmericPayload = buildStructuredFallbackContent('Organic Turmeric Powder');
  assert.equal(turmericPayload.ayurveda_applicability, 'applicable');
  assert.ok(turmericPayload.ayurveda !== null);
  assert.equal(turmericPayload.ayurveda?.sanskrit_name, 'Haridra (हरिद्रा)');

  const nonAyurvedicPayload = buildStructuredFallbackContent('Lavender Floor Cleaner');
  assert.equal(nonAyurvedicPayload.ayurveda_applicability, 'not_applicable');
  assert.equal(nonAyurvedicPayload.ayurveda, null);

  // Deceptive cure claims must be rejected by validator
  const deceptivePayload = {
    ...turmericPayload,
    health_benefits: [
      {
        claim: 'This product is a 100% cure for diabetes and cures cancer.',
        evidence_level: 'traditional_use' as const,
        reference_ids: ['REF-1'],
        review_status: 'pending_review' as const,
      },
    ],
  };
  const val = validateAIProductContentPayload(deceptivePayload);
  assert.equal(val.valid, false);
  assert.ok(val.errors.some((e) => e.includes('prohibited disease-cure')));
});

test('Section 17.8: Generates exact 1000x1000 PNG studio buffer on #FFFFFF background', () => {
  const pngBuffer = generatePureWhite1000x1000PngBuffer('Turmeric Powder');
  const dims = inspectPngDimensions(pngBuffer);
  assert.equal(dims.validPng, true, 'Generated buffer must have valid PNG signature and IHDR');
  assert.equal(dims.width, 1000);
  assert.equal(dims.height, 1000);
});

test('Section 18.8 & 12: Selective Master Sync maps V5 General + 21 Ayurvedic fields and protects selling prices/SKU', () => {
  const payload = buildStructuredFallbackContent('Organic Turmeric Powder');
  // Mark one health benefit as approved and one as rejected to verify only approved claims sync
  payload.health_benefits = [
    {
      claim: 'Traditionally supports balanced digestion and antioxidant intake.',
      evidence_level: 'traditional_use',
      reference_ids: ['REF-1'],
      review_status: 'approved',
    },
    {
      claim: 'Rejected unverified secondary claim.',
      evidence_level: 'preliminary_study',
      reference_ids: [],
      review_status: 'rejected',
    },
  ];

  const version: AIProductVersion = {
    id: 'aiver_test_1',
    draft_id: 'aidraft_test_1',
    version_no: 1,
    generated_payload: payload,
    edited_payload: payload,
    model: 'gpt-4o-mini',
    prompt_version: 'leafyearth-v8.0',
    usage_metadata: {
      provider: 'openai',
      project_name: 'leafyearthprdcnt',
      model: 'gpt-4o-mini',
      prompt_version: 'leafyearth-v8.0',
      input_tokens: 100,
      output_tokens: 200,
      total_tokens: 300,
      estimated_cost_usd: 0,
      latency_ms: 10,
      live_api_used: false,
    },
    generated_at: new Date().toISOString(),
    edited_by: null,
    edited_at: null,
    approved_by: 'admin_1',
    approved_at: new Date().toISOString(),
  };

  const approvedImage: AIProductImage = {
    id: 'aiimg_test_1',
    draft_id: 'aidraft_test_1',
    version_id: 'aiver_test_1',
    storage_key: 'ai_products/aidraft_test_1/images/aiimg_test_1.png',
    preview_url: 'data:image/png;base64,iVBORw0KGgo=',
    mime_type: 'image/png',
    width: 1000,
    height: 1000,
    background_hex: '#FFFFFF',
    checksum: 'sha256_abc',
    prompt: 'Studio photo',
    model: 'gpt-image-1',
    generation_metadata: {
      provider: 'openai',
      project_name: 'leafyearthprdcnt',
      product_form: 'Powder',
      packaging_style: 'Pouch',
      estimated_cost_usd: 0,
      latency_ms: 10,
      live_api_used: false,
      source_type: 'ai_generated',
    },
    status: 'APPROVED',
    created_by: 'admin_1',
    created_at: new Date().toISOString(),
  };

  const approvedResearch: AIProductResearchRecord = {
    id: 'aires_test_1',
    draft_id: 'aidraft_test_1',
    version_id: 'aiver_test_1',
    taxation: {
      hsnCode: '09103030',
      gstRatePercent: 5,
      gstReference: 'GST Schedule I',
      confidence: 'high',
      needsManualVerification: false,
      verifiedBy: 'admin@leafyearth.com',
      verifiedAt: '2026-11-14T00:00:00.000Z',
    },
    packing: {
      selectedPackingSize: '100 g',
      unit: 'PAC',
      availablePackingSizes: ['50 g', '100 g', '250 g'],
    },
    marketResearch: {
      comparedPackingSize: '100 g',
      currency: 'INR',
      lowestPrice: 145,
      highestPrice: 185,
      checkedAt: '2026-11-14T00:00:00.000Z',
      searchStatus: 'verified_offers',
      offers: [],
    },
    status: 'APPROVED',
    created_by: 'admin_1',
    created_at: '2026-11-14T00:00:00.000Z',
    updated_at: '2026-11-14T00:00:00.000Z',
    approved_by: 'admin_1',
    approved_at: '2026-11-14T00:00:00.000Z',
  };

  const existingMaster = {
    id: 'prod_1',
    name: 'Legacy Turmeric',
    sku: '60005121',
    mrp: 299,
    onlinePrice: 249,
    offerPrice: 229,
    shopPrice: 260,
    discount: 23,
    category: 'Unassigned',
  };

  const diff = buildMasterComparisonDiff({
    masterProduct: existingMaster,
    version,
    approvedImage,
    approvedResearch,
  });

  const { updatePatch } = buildSelectedMasterUpdatePayload({
    existingMasterProduct: existingMaster,
    comparisonItems: diff,
    selectedFields: [
      'botanicalName',
      'malayalamName',
      'healthBenefits',
      'isAyurvedicProduct',
      'sanskritName',
      'lowestWebPrice',
      'highestWebPrice',
      // Attempt to pass protected fields to verify they are ignored:
      'mrp',
      'onlinePrice',
      'sku',
    ],
    approvedImage,
    imageAction: 'replace_primary',
  });

  assert.equal(updatePatch.botanicalName, 'Curcuma longa');
  assert.equal(updatePatch.malayalamName, 'മഞ്ഞൾ പൊടി');
  assert.equal(updatePatch.isAyurvedicProduct, true);
  assert.equal(updatePatch.sanskritName, 'Haridra (हरिद्रा)');
  assert.equal(updatePatch.lowestWebPrice, 145);
  assert.equal(updatePatch.highestWebPrice, 185);
  // Only the approved health benefit claim must be included
  assert.equal(updatePatch.healthBenefits.length, 1);
  assert.equal(
    updatePatch.healthBenefits[0].claim,
    'Traditionally supports balanced digestion and antioxidant intake.'
  );
  // Unselected field (category) must not be in updatePatch
  assert.equal('category' in updatePatch, false);
  // Protected selling price & SKU fields must never be in updatePatch
  assert.equal('mrp' in updatePatch, false);
  assert.equal('onlinePrice' in updatePatch, false);
  assert.equal('offerPrice' in updatePatch, false);
  assert.equal('shopPrice' in updatePatch, false);
  assert.equal('sku' in updatePatch, false);
});

test('Section 19.7: Automatic 8-digit numeric SKU allocator & immutability enforcement', () => {
  assert.equal(isValidEightDigitNumericSku('10000001'), true);
  assert.equal(isValidEightDigitNumericSku('60005121'), true);
  assert.equal(isValidEightDigitNumericSku('19703005121'), false, '11-digit legacy SKU ignored');
  assert.equal(isValidEightDigitNumericSku('SKU-1001'), false, 'Alphanumeric SKU rejected');

  const highest = computeHighestExistingEightDigitSku([
    { sku: '19059010' },
    { sku: '60005121' },
    { sku: '19705005121' }, // 11-digit legacy ignored
    { sku: 'HC-LGC-005' },
  ]);
  assert.equal(highest, 60005121);

  const emptyHighest = computeHighestExistingEightDigitSku([]);
  assert.equal(emptyHighest, MIN_EIGHT_DIGIT_SKU - 1);

  // SKU immutability on existing products
  const guarded = enforceSkuImmutabilityOnUpdate(
    { sku: '60005121' },
    { name: 'Updated Name', sku: '99999999' },
    true
  );
  assert.equal(guarded.allowed, false);
  assert.equal(guarded.sanitizedPatch.sku, '60005121');
});

test('Section 20.6: Security catalog registers AI Product Content module', () => {
  const aiModule = SECURITY_MODULES_CATALOG.find((m) => m.module === 'AI Product Content');
  assert.ok(aiModule, 'AI Product Content module must exist in SECURITY_MODULES_CATALOG');
});

test('Section 21.11: Pack size normalization and backend deterministic min/max web price calculation', () => {
  assert.equal(normalizePackSizeString('100gm'), '100 g');
  assert.equal(normalizePackSizeString('100 Grams'), '100 g');
  assert.equal(normalizePackSizeString('0.5 kg'), '500 g');
  assert.equal(normalizePackSizeString('250 ML'), '250 ml');

  const range = calculateMarketPriceRange(
    [
      {
        siteName: 'Store A',
        productTitle: 'Turmeric 100g',
        sourceUrl: 'https://example.com/a',
        packSize: '100 gm',
        price: 185,
        mrp: 210,
        currency: 'INR',
        inStock: true,
        included: true,
        checkedAt: '2026-11-14T00:00:00Z',
        matchConfidence: 'high',
      },
      {
        siteName: 'Store B',
        productTitle: 'Turmeric 100 grams',
        sourceUrl: 'https://example.com/b',
        packSize: '100 grams',
        price: 145,
        mrp: 175,
        currency: 'INR',
        inStock: true,
        included: true,
        checkedAt: '2026-11-14T00:00:00Z',
        matchConfidence: 'high',
      },
      {
        siteName: 'Store C (Different Pack 500g - Excluded)',
        productTitle: 'Turmeric 500g',
        sourceUrl: 'https://example.com/c',
        packSize: '500 g',
        price: 650,
        mrp: 750,
        currency: 'INR',
        inStock: true,
        included: true,
        checkedAt: '2026-11-14T00:00:00Z',
        matchConfidence: 'high',
      },
      {
        siteName: 'Store D (Out of stock - Excluded)',
        productTitle: 'Turmeric 100g',
        sourceUrl: 'https://example.com/d',
        packSize: '100 g',
        price: 99,
        mrp: 120,
        currency: 'INR',
        inStock: false,
        included: true,
        checkedAt: '2026-11-14T00:00:00Z',
        matchConfidence: 'low',
      },
    ],
    '100 g'
  );

  assert.equal(range.lowestPrice, 145);
  assert.equal(range.highestPrice, 185);
  assert.equal(range.eligibleCount, 2);
  assert.equal(range.searchStatus, 'verified_offers');

  const emptyRange = calculateMarketPriceRange([], '100 g');
  assert.equal(emptyRange.lowestPrice, null);
  assert.equal(emptyRange.highestPrice, null);
  assert.equal(emptyRange.searchStatus, 'insufficient_verified_web_price_data');
});
