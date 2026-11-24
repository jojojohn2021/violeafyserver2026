import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoSeoFields,
  buildAIContentReferenceLink,
  buildFirebaseStorageDownloadUrl,
  buildMasterComparisonDiff,
  buildSelectedMasterUpdatePayload,
  buildStructuredFallbackContent,
  calculateMarketPriceRange,
  ensureFirebaseStorageImageUrl,
  generatePureWhite1000x1000PngBuffer,
  inspectPngDimensions,
  isFirebaseStorageDownloadUrl,
  matchMasterProductByName,
  mergeMasterProductUpdationOverrides,
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
      verifiedBy: 'admin@leafymart.com',
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
  // Only the non-rejected health benefit claim must be included, with review_status = 'approved'
  // and without evidence_level or reference_ids; healthReferences must never be exported
  assert.equal(updatePatch.healthBenefits.length, 1);
  assert.equal(
    updatePatch.healthBenefits[0].claim,
    'Traditionally supports balanced digestion and antioxidant intake.'
  );
  assert.equal(updatePatch.healthBenefits[0].review_status, 'approved');
  assert.equal('evidence_level' in updatePatch.healthBenefits[0], false);
  assert.equal('reference_ids' in updatePatch.healthBenefits[0], false);
  assert.equal('healthReferences' in updatePatch, false);
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

test('Product Master Updation: AI category maps to leafycategory, auto-links by product name, and preserves existing products fields', () => {
  const payload = buildStructuredFallbackContent('Kadukka');
  const version: AIProductVersion = {
    id: 'aiver_kadukka_1',
    draft_id: 'aidraft_kadukka_1',
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

  const diff = buildMasterComparisonDiff({
    masterProduct: null,
    version,
    approvedImage: null,
    approvedResearch: null,
  });

  // Verify AI category is mapped to `leafycategory` (`products.leafycategory`) instead of `products.category`
  const leafyCategoryRow = diff.find((item) => item.fieldKey === 'leafycategory');
  assert.ok(leafyCategoryRow, 'Field mapping must contain leafycategory');
  assert.equal(leafyCategoryRow?.masterField, 'leafycategory');
  assert.equal(diff.find((item) => item.fieldKey === 'category'), undefined);

  // Verify product name auto-matching in `products` table
  const existingProducts = [
    { id: 'prod_existing_1', name: 'Thippili', sku: '10000015', unitsSold: 42, revenue: 8400 },
    { id: 'prod_existing_2', name: 'Cumin Seeds (Jeera)', sku: '10000016', unitsSold: 18, revenue: 3600 },
  ];

  const matchedExisting = matchMasterProductByName(existingProducts, ['Thippili']);
  assert.equal(matchedExisting?.id, 'prod_existing_1');

  const matchedByBaseName = matchMasterProductByName(existingProducts, ['Cumin Seeds']);
  assert.equal(matchedByBaseName?.id, 'prod_existing_2');

  const unmatchedNew = matchMasterProductByName(existingProducts, ['Kadukka']);
  assert.equal(unmatchedNew, null, 'Unmatched product name must be treated as a new product');

  // Verify merging the 16 Product Master Updation fields preserves existing `products` fields
  const beforeSnapshot: Record<string, any> = {};
  const afterSnapshot: Record<string, any> = {};
  const { mergedMasterProduct, finalPatch } = mergeMasterProductUpdationOverrides({
    existingMasterProduct: existingProducts[0],
    updatePatch: { leafycategory: 'Ayurvedic Raw Herbs & Single Dravyas' },
    beforeSnapshot,
    afterSnapshot,
    allocatedSku: '10000099',
    overrides: {
      name: 'Thippili',
      sku: '99999999', // Existing 8-digit SKU '10000015' must be preserved!
      packingSize: '100 g',
      unit: 'PAC',
      mrp: 220,
      onlinePrice: 185,
      shopPrice: 190,
      gstPercentage: 5,
      categories: ['Spices', 'Ayurvedic Herbs'],
      leafycategory: 'Ayurvedic Raw Herbs & Single Dravyas',
      brand: 'LeafyMart',
      brandOwner: 'Vio Nature Science',
      stockIn: 50,
      imageUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      uniqueSpec1: 'Sun-dried whole spikes',
      uniqueSpec2: 'Rich in piperine',
      uniqueSpec3: 'Hygienically packed',
      aiContentLink: buildAIContentReferenceLink(
        'aidraft_1794667880146_8fjlx',
        'aiver_1794667880146_5nkxj',
        'https://violeafybasket.web.app'
      ),
      aiDraftId: 'aidraft_1794667880146_8fjlx',
    },
  });

  assert.equal(finalPatch.sku, '10000015', 'Existing 8-digit SKU must be preserved');
  assert.equal(finalPatch.leafycategory, 'Ayurvedic Raw Herbs & Single Dravyas');
  assert.deepEqual(finalPatch.categories, ['Spices', 'Ayurvedic Herbs']);
  assert.equal(finalPatch.category, 'Spices');
  assert.equal(finalPatch.mrp, 220);
  assert.equal(finalPatch.onlinePrice, 185);
  assert.equal(finalPatch.shopPrice, 190);
  assert.equal(finalPatch.stockIn, 50);
  assert.equal(finalPatch.uniqueSpec1, 'Sun-dried whole spikes');
  assert.equal('featuredproducts' in finalPatch, false, 'featuredproducts must be removed');
  assert.equal('featuredprdsortorder' in finalPatch, false, 'featuredprdsortorder must be removed');
  assert.equal('vamjoWeblink' in finalPatch, false, 'vamjoWeblink must be removed');
  assert.equal('flipkartWeblink' in finalPatch, false, 'flipkartWeblink must be removed');
  assert.equal('meeshoWeblink' in finalPatch, false, 'meeshoWeblink must be removed');
  assert.equal(
    finalPatch.aiContentLink,
    'https://violeafybasket.web.app/api/admin/ai-products/aidraft_1794667880146_8fjlx?version=aiver_1794667880146_5nkxj'
  );
  assert.equal(finalPatch.aiDraftId, 'aidraft_1794667880146_8fjlx');
  assert.equal('aiContentMetadata' in finalPatch, false, 'aiContentMetadata must not be in products');
  assert.equal(
    'aiContentMetadata' in mergedMasterProduct,
    false,
    'aiContentMetadata must not be in mergedMasterProduct'
  );
  // Existing `products` table metrics (`unitsSold`, `revenue`) must be preserved
  assert.equal(mergedMasterProduct.unitsSold, 42);
  assert.equal(mergedMasterProduct.revenue, 8400);
});

test('Firebase Storage Export: AI product images export to https://firebasestorage.googleapis.com/v0/b/...', async () => {
  const url = buildFirebaseStorageDownloadUrl(
    'violeafybasket.firebasestorage.app',
    'products/5r5w8ZL4Lo9jI3GWBnIJ/main.jpg',
    'token-123'
  );
  assert.equal(
    url,
    'https://firebasestorage.googleapis.com/v0/b/violeafybasket.firebasestorage.app/o/products%2F5r5w8ZL4Lo9jI3GWBnIJ%2Fmain.jpg?alt=media&token=token-123'
  );
  assert.equal(isFirebaseStorageDownloadUrl(url), true);
  assert.equal(isFirebaseStorageDownloadUrl('data:image/jpeg;base64,/9j/4AAQ'), false);
  assert.equal(
    isFirebaseStorageDownloadUrl('https://storage.googleapis.com/violeafybasket/img.jpg'),
    false
  );

  // Mock Storage bucket to verify base64 data URL is uploaded and converted to firebasestorage.googleapis.com
  let savedMetadata: any = null;
  const mockStorage = {
    bucket: () => ({
      name: 'violeafybasket.firebasestorage.app',
      file: (_path: string) => ({
        save: async (_buf: Buffer, opts: any) => {
          savedMetadata = opts?.metadata;
        },
      }),
    }),
  };

  const exported = await ensureFirebaseStorageImageUrl({
    storage: mockStorage,
    sourceUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    targetStoragePath: 'products/prod_kadukka/main.jpg',
  });

  assert.equal(isFirebaseStorageDownloadUrl(exported.downloadUrl), true);
  assert.ok(
    exported.downloadUrl.startsWith(
      'https://firebasestorage.googleapis.com/v0/b/violeafybasket.firebasestorage.app/o/products%2Fprod_kadukka%2Fmain.jpg?alt=media&token='
    )
  );
  assert.equal(exported.storagePath, 'products/prod_kadukka/main.jpg');
  assert.equal(savedMetadata?.contentType, 'image/jpeg');
  assert.ok(savedMetadata?.metadata?.firebaseStorageDownloadTokens);
});

test('Ayurvedic Product Option (Yes vs No): Excludes 6-Language Names & Section 4 Ayurveda when No, includes when Yes', () => {
  const nonAyurvedic = buildStructuredFallbackContent(
    'Banana Chips (Roasted to perfection in coconut oil)',
    { categoryHint: 'Kerala Roasted Delights', brandHint: 'Bhadram', isAyurvedicProduct: false }
  );
  assert.equal(nonAyurvedic.is_ayurvedic_product, false);
  assert.equal(nonAyurvedic.ayurveda_applicability, 'not_applicable');
  assert.equal(nonAyurvedic.ayurveda, null);
  assert.equal(nonAyurvedic.translations.ml.name, '');
  assert.equal(nonAyurvedic.translations.hi.name, '');
  assert.ok(nonAyurvedic.seo?.seoTitle, 'Other features (SEO, commerce, health) must still be generated');
  assert.ok(nonAyurvedic.commerce?.productHighlights.length);

  const nonAyurvedicValidation = validateAIProductContentPayload(nonAyurvedic);
  assert.equal(
    nonAyurvedicValidation.valid,
    true,
    `Non-Ayurvedic payload must pass validation: ${nonAyurvedicValidation.errors.join('; ')}`
  );

  const nonAyurvedicDiff = buildMasterComparisonDiff({
    masterProduct: null,
    version: {
      id: 'v1',
      draft_id: 'd1',
      version_no: 1,
      generated_payload: nonAyurvedic,
      edited_payload: nonAyurvedic,
      model: 'gpt-4o-mini',
      prompt_version: 'v8',
      usage_metadata: {
        provider: 'openai',
        project_name: 'leafyearthprdcnt',
        model: 'gpt-4o-mini',
        prompt_version: 'v8',
        input_tokens: 100,
        output_tokens: 100,
        total_tokens: 200,
        estimated_cost_usd: 0,
        latency_ms: 10,
        live_api_used: false,
      },
      generated_at: new Date().toISOString(),
      edited_by: null,
      edited_at: null,
      approved_by: null,
      approved_at: null,
    },
    approvedImage: null,
    approvedResearch: null,
  });

  assert.equal(
    nonAyurvedicDiff.some((i) => i.group === 'translations'),
    false,
    '6-language translations must be excluded from comparison diff when Ayurvedic Product = No'
  );
  assert.equal(
    nonAyurvedicDiff.some((i) => i.group === 'ayurveda'),
    false,
    'Ayurvedic fields must be excluded from comparison diff when Ayurvedic Product = No'
  );
  assert.equal(
    nonAyurvedicDiff.some((i) => i.group === 'general'),
    true,
    'General e-commerce fields must still be included'
  );
  assert.equal(
    nonAyurvedicDiff.some((i) => i.group === 'seo'),
    true,
    'SEO fields must still be included'
  );
});
