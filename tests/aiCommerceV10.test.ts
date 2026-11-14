import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyApprovedSEOAndReserveSlugTransaction,
  buildProductJsonLdObject,
  buildPublicProductOfferProjection,
  buildStructuredFallbackCommerce,
  buildStructuredFallbackSEO,
  checkSlugAvailability,
  deduplicateAndCleanKeywords,
  generateBingMerchantXmlFeed,
  generateGoogleMerchantXmlFeed,
  generateLlmsTxt,
  generateOpenAIProductsJsonlFeed,
  generateRobotsTxt,
  generateSitemapXml,
  getDefaultPlatformSettingsCatalog,
  isValidUrlSlug,
  normalizeUrlSlug,
  renderServerProductLandingHtml,
  validateAICommercePayload,
  validateFssaiLicenseNumber,
  validateGtinChecksum,
  validateProductForPlatform,
  validateSEOPayload,
  validateWeightAndVolumeSeparation,
} from '../src/services/aiCommerceService';
import {
  buildMasterComparisonDiff,
  buildStructuredFallbackContent,
  validateAIProductContentPayload,
} from '../src/services/aiProductContentService';

// Lightweight in-memory Firestore mock for transactional slug reservation tests
function createMockFirestore(initialCollections: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Map<string, any>> = {};
  for (const [colName, docs] of Object.entries(initialCollections)) {
    store[colName] = new Map(Object.entries(docs).map(([id, data]) => [id, { ...data }]));
  }
  const ensureCol = (name: string) => {
    if (!store[name]) store[name] = new Map();
    return store[name];
  };

  const makeDocRef = (colName: string, docId: string) => ({
    id: docId,
    path: `${colName}/${docId}`,
    async get() {
      const col = ensureCol(colName);
      const data = col.get(docId);
      return {
        exists: data !== undefined,
        id: docId,
        data: () => (data !== undefined ? { ...data } : undefined),
      };
    },
    async set(data: any, options?: { merge?: boolean }) {
      const col = ensureCol(colName);
      if (options?.merge && col.has(docId)) {
        col.set(docId, { ...col.get(docId), ...data });
      } else {
        col.set(docId, { ...data });
      }
    },
  });

  const db: any = {
    _store: store,
    collection(colName: string) {
      return {
        doc(docId?: string) {
          const resolvedId = docId || `doc_${Math.random().toString(36).slice(2, 9)}`;
          return makeDocRef(colName, resolvedId);
        },
        async get() {
          const col = ensureCol(colName);
          const docs = Array.from(col.entries()).map(([id, data]) => ({
            id,
            exists: true,
            data: () => ({ ...data }),
          }));
          return {
            empty: docs.length === 0,
            size: docs.length,
            docs,
          };
        },
      };
    },
    async runTransaction(fn: (tx: any) => Promise<any>) {
      const tx = {
        async get(ref: any) {
          return ref.get();
        },
        set(ref: any, data: any, options?: { merge?: boolean }) {
          return ref.set(data, options);
        },
      };
      return fn(tx);
    },
  };

  return db;
}

describe('LeafyEarth V9 SEO & V10 AI Commerce & Product Discoverability Suite', () => {
  it('1. V9 Section 4.1: Generates canonical Cumin Seeds (Jeera) SEO metadata & URL slug', () => {
    const seo = buildStructuredFallbackSEO('Cumin Seeds (Jeera)');
    assert.equal(seo.seoTitle, 'Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth');
    assert.equal(seo.urlSlug, 'cumin-seeds-jeera-whole');
    assert.ok(seo.metaDescription.length >= 120 && seo.metaDescription.length <= 160);
    assert.ok(seo.seoKeywords.includes('cumin seeds'));
    assert.ok(seo.seoKeywords.includes('jeera'));
    assert.ok(seo.seoKeywords.length >= 5 && seo.seoKeywords.length <= 12);

    const validation = validateSEOPayload(seo);
    assert.equal(validation.valid, true, `Unexpected errors: ${validation.errors.join('; ')}`);

    // Also verify V8/V9/V10 unified fallback includes Cumin Seeds (Cuminum cyminum)
    const fullFallback = buildStructuredFallbackContent('Cumin Seeds (Jeera)');
    assert.equal(fullFallback.botanical_name, 'Cuminum cyminum');
    assert.equal(fullFallback.seo?.urlSlug, 'cumin-seeds-jeera-whole');
    const fullCheck = validateAIProductContentPayload(fullFallback);
    assert.equal(fullCheck.valid, true, `Full payload errors: ${fullCheck.errors.join('; ')}`);
  });

  it('2. V9 Section 4 & 6.2: Enforces SEO character limits, keyword deduplication (5–12), and slug format', () => {
    const dedup = deduplicateAndCleanKeywords([
      'Cumin Seeds',
      'cumin seeds',
      '  JEERA ',
      'jeera',
      'Whole Cumin',
      'Jeerakam',
      'Indian Spices',
    ]);
    assert.deepEqual(dedup.keywords, [
      'Cumin Seeds',
      'JEERA',
      'Whole Cumin',
      'Jeerakam',
      'Indian Spices',
    ]);

    // Rejects invalid slugs (slashes, query strings, uppercase, leading/trailing hyphens)
    assert.equal(isValidUrlSlug('cumin-seeds-jeera-whole'), true);
    assert.equal(isValidUrlSlug('Cumin-Seeds'), false);
    assert.equal(isValidUrlSlug('-cumin-seeds'), false);
    assert.equal(isValidUrlSlug('cumin-seeds-'), false);
    assert.equal(isValidUrlSlug('cumin/seeds'), false);
    assert.equal(isValidUrlSlug('cumin?seeds=1'), false);

    assert.equal(normalizeUrlSlug('  Cumin Seeds (Jeera) — Whole 100g! '), 'cumin-seeds-jeera-whole-100g');

    // Rejects >120 char seoTitle, >320 char metaDescription, <5 keywords, and prohibited claims
    const invalidSeo = validateSEOPayload({
      seoTitle: 'A'.repeat(125),
      metaDescription: 'B'.repeat(330),
      seoKeywords: ['one', 'two'],
      urlSlug: 'Invalid/Slug?bad=1',
    });
    assert.equal(invalidSeo.valid, false);
    assert.ok(invalidSeo.errors.some((e) => e.includes('120')));
    assert.ok(invalidSeo.errors.some((e) => e.includes('320')));
    assert.ok(invalidSeo.errors.some((e) => e.includes('at least 5')));
  });

  it('3. V9 Section 6.1: Transactional slug reservation, collision suffix suggestion & redirect alias creation on slug change', async () => {
    const db = createMockFirestore({
      products: {
        prod_1: {
          id: 'prod_1',
          name: 'Cumin Seeds',
          sku: '10000001',
          revision: 1,
        },
        prod_2: {
          id: 'prod_2',
          name: 'Cumin Seeds Premium',
          sku: '10000002',
          revision: 1,
        },
      },
      productSlugs: {},
    });

    // Reserve slug for prod_1
    const res1 = await applyApprovedSEOAndReserveSlugTransaction({
      db,
      draftId: 'draft_1',
      versionId: 'ver_1',
      productId: 'prod_1',
      seo: {
        seoTitle: 'Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth',
        metaDescription:
          'Discover aromatic whole cumin seeds (Jeera) for curries, dals, rice and spice blends. Add warm, earthy flavour to your everyday cooking.',
        seoKeywords: ['cumin seeds', 'jeera', 'whole cumin', 'jeerakam', 'Indian spices'],
        urlSlug: 'cumin-seeds-jeera-whole',
      },
      selectedFields: ['seoTitle', 'metaDescription', 'seoKeywords', 'urlSlug'],
      expectedMasterRevision: 1,
      idempotencyKey: 'idem_seo_1',
      actor: { uid: 'admin_1', email: 'admin@leafyearth.com', role: 'Administrator' },
    });

    assert.equal(res1.updatedProduct.urlSlug, 'cumin-seeds-jeera-whole');
    assert.equal(res1.updatedProduct.revision, 2);
    assert.equal(res1.slugReservation?.state, 'active');

    // Check collision for prod_2 attempting the same slug
    const availability = await checkSlugAvailability(db, 'cumin-seeds-jeera-whole', 'prod_2');
    assert.equal(availability.available, false);
    assert.equal(availability.claimedByProductId, 'prod_1');
    assert.equal(availability.suggestedSlug, 'cumin-seeds-jeera-whole-2');

    // Attempt concurrent slug hijack from prod_2 -> must throw conflict error
    await assert.rejects(
      () =>
        applyApprovedSEOAndReserveSlugTransaction({
          db,
          productId: 'prod_2',
          seo: {
            seoTitle: 'Cumin Seeds Premium | LeafyEarth',
            metaDescription:
              'Discover premium whole cumin seeds (Jeera) for curries, dals, rice and spice blends. Add warm, earthy flavour to your everyday cooking.',
            seoKeywords: ['cumin seeds', 'jeera', 'whole cumin', 'jeerakam', 'Indian spices'],
            urlSlug: 'cumin-seeds-jeera-whole',
          },
          selectedFields: ['urlSlug'],
          idempotencyKey: 'idem_seo_conflict',
          actor: { uid: 'admin_1' },
        }),
      /already reserved/i
    );

    // Update prod_1 to a new slug -> old slug becomes a 'redirect' alias pointing to the new canonicalSlug
    const resRename = await applyApprovedSEOAndReserveSlugTransaction({
      db,
      productId: 'prod_1',
      seo: {
        seoTitle: 'Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth',
        metaDescription:
          'Discover aromatic whole cumin seeds (Jeera) for curries, dals, rice and spice blends. Add warm, earthy flavour to your everyday cooking.',
        seoKeywords: ['cumin seeds', 'jeera', 'whole cumin', 'jeerakam', 'Indian spices'],
        urlSlug: 'wayanad-cumin-seeds-jeera',
      },
      selectedFields: ['urlSlug'],
      expectedMasterRevision: 2,
      idempotencyKey: 'idem_seo_rename',
      actor: { uid: 'admin_1' },
    });

    assert.equal(resRename.updatedProduct.urlSlug, 'wayanad-cumin-seeds-jeera');
    const oldSlugDoc = db._store.productSlugs.get('cumin-seeds-jeera-whole');
    assert.equal(oldSlugDoc.state, 'redirect');
    assert.equal(oldSlugDoc.canonicalSlug, 'wayanad-cumin-seeds-jeera');
  });

  it('4. V10 Section 13 & 14: Validates GS1 Modulo-10 GTIN checksums (8, 12, 13, 14 digits), 14-digit FSSAI, and Weight vs Volume separation', () => {
    // Valid GTIN-13 (with leading 890 India prefix: 8901030865275 -> check digit calc)
    // Let's verify a known valid GTIN-13: 4006381333931 and GTIN-12 with leading zero: 012345678905
    const valid13 = validateGtinChecksum('4006381333931');
    assert.equal(valid13.valid, true);
    assert.equal(valid13.type, 'GTIN-13');

    const valid12LeadingZero = validateGtinChecksum('012345678905');
    assert.equal(valid12LeadingZero.valid, true);
    assert.equal(valid12LeadingZero.normalized, '012345678905');
    assert.equal(valid12LeadingZero.type, 'GTIN-12');

    // Tampered check digit fails
    const badCheck = validateGtinChecksum('4006381333932');
    assert.equal(badCheck.valid, false);
    assert.ok(badCheck.error?.includes('check digit'));

    // Invalid length fails
    const badLen = validateGtinChecksum('123456789');
    assert.equal(badLen.valid, false);

    // 14-digit FSSAI validation
    assert.equal(validateFssaiLicenseNumber('10020043001234').valid, true);
    assert.equal(validateFssaiLicenseNumber('12345').valid, false);

    // Weight vs Volume separation (ml/l rejected on netWeightUnit; g/kg rejected on netVolumeUnit)
    assert.equal(
      validateWeightAndVolumeSeparation({ netWeight: 100, netWeightUnit: 'g' }).valid,
      true
    );
    assert.equal(
      validateWeightAndVolumeSeparation({ netVolume: 250, netVolumeUnit: 'ml' }).valid,
      true
    );
    const badWeightUnit = validateWeightAndVolumeSeparation({
      netWeight: 250,
      netWeightUnit: 'ml',
    });
    assert.equal(badWeightUnit.valid, false);
    assert.ok(badWeightUnit.errors[0].includes('liquid volume unit'));
  });

  it('5. V10 Section 13 & 15: Prevents AI fabrication of GTIN, MPN, FSSAI, prices, stock, and reviews', () => {
    const fabricated = validateAICommercePayload({
      productHighlights: ['Pure Cumin Seeds', 'Hygienically packed'],
      productFAQs: [{ question: 'How to store?', answer: 'Store in an airtight jar.' }],
      gtin: '4006381333931',
      fssaiLicenseNumber: '10020043001234',
      price: 199,
      reviews: [{ rating: 5 }],
    });
    assert.equal(fabricated.valid, false);
    assert.ok(fabricated.errors.some((e) => e.includes('"gtin"')));
    assert.ok(fabricated.errors.some((e) => e.includes('"fssaiLicenseNumber"')));
    assert.ok(fabricated.errors.some((e) => e.includes('"price"')));
    assert.ok(fabricated.errors.some((e) => e.includes('"reviews"')));
  });

  it('6. V10 Section 14 & 15: Allowlisted public_products projection uses genuine selling price and never leaks competitor web prices or stock integers', () => {
    const masterProduct = {
      id: 'prod_cumin_1',
      sku: '09093100',
      name: 'Cumin Seeds (Jeera)',
      title: 'Cumin Seeds (Jeera) – Whole Culinary Spice',
      description: 'Whole aromatic Cumin Seeds (Jeera) hygienically packed for everyday Indian cooking.',
      urlSlug: 'cumin-seeds-jeera-whole',
      seoTitle: 'Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth',
      metaDescription:
        'Discover aromatic whole cumin seeds (Jeera) for curries, dals, rice and spice blends.',
      seoKeywords: ['cumin seeds', 'jeera', 'whole cumin', 'jeerakam', 'Indian spices'],
      brand: 'LeafyEarth',
      category: 'Spices & Botanicals',
      mrp: 160,
      onlinePrice: 140,
      offerPrice: 125,
      // Competitor researched prices that MUST NOT be used as selling prices or exposed
      lowestWebPrice: 85,
      highestWebPrice: 310,
      webPriceSources: [{ siteName: 'Competitor', price: 85 }],
      // Internal stock integer that MUST NOT be exposed as a raw number
      stock: 47,
      imageUrl: 'https://violeafybasket.web.app/images/cumin-1000.png',
      packingSize: '100 g',
      netWeight: 100,
      netWeightUnit: 'g',
      productHighlights: ['100% pure whole cumin', 'Hygienically packed in India'],
      productFAQs: [{ question: 'How to store?', answer: 'Keep in a dry airtight jar.' }],
      aiContentMetadata: {
        title: { source: 'ai_approved', model: 'gpt-4o-mini', promptVersion: 'v10' },
      },
      aiCommerceEnabled: true,
      revision: 3,
    };

    const projection = buildPublicProductOfferProjection(masterProduct, {
      verifiedDomain: 'https://leafyearth.com',
    });

    assert.equal(projection.price, 160); // base MRP
    assert.equal(projection.salePrice, 125); // genuine offerPrice
    assert.notEqual(projection.price, 85);
    assert.notEqual(projection.salePrice, 85);
    assert.equal(projection.availability, 'in_stock');
    assert.equal((projection as any).stock, undefined);
    assert.equal((projection as any).lowestWebPrice, undefined);
    assert.equal((projection as any).highestWebPrice, undefined);
    assert.equal((projection as any).webPriceSources, undefined);
    assert.equal(projection.canonicalUrl, 'https://leafyearth.com/products/cumin-seeds-jeera-whole');
    assert.equal(projection.aiGeneratedContentDisclosure, true);
  });

  it('7. V9 & V10 Sections 8, 9, 17, 18: Generates Google Merchant XML (with structured AI title/description), Bing XML, OpenAI JSONL, Sitemap, Robots & SSR HTML with JSON-LD', () => {
    const settingsCatalog = getDefaultPlatformSettingsCatalog('https://leafyearth.com');
    const googleSettings = settingsCatalog.find((s) => s.id === 'google_merchant')!;
    const openaiSettings = settingsCatalog.find((s) => s.id === 'openai_chatgpt')!;

    // Verify all external merchant platforms default to enabled: false until owner enables them
    assert.equal(googleSettings.enabled, false);
    assert.equal(openaiSettings.enabled, false);
    assert.equal(openaiSettings.marketEligible, false);

    const projection = buildPublicProductOfferProjection(
      {
        id: 'prod_cumin_1',
        sku: '09093100',
        name: 'Cumin Seeds (Jeera)',
        title: 'Cumin Seeds (Jeera) – Whole Culinary Spice',
        description:
          'Whole aromatic Cumin Seeds (Jeera) hygienically packed for everyday Indian cooking.',
        urlSlug: 'cumin-seeds-jeera-whole',
        seoTitle: 'Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth',
        metaDescription:
          'Discover aromatic whole cumin seeds (Jeera) for curries, dals, rice and spice blends.',
        seoKeywords: ['cumin seeds', 'jeera', 'whole cumin', 'jeerakam', 'Indian spices'],
        brand: 'LeafyEarth',
        category: 'Spices',
        mrp: 150,
        onlinePrice: 135,
        offerPrice: 120,
        stock: 15,
        imageUrl: 'https://leafyearth.com/images/cumin.png',
        packingSize: '100 g',
        productHighlights: ['Whole cumin seeds', 'No artificial colors'],
        productFAQs: [{ question: 'How to store?', answer: 'Airtight container.' }],
        aiContentMetadata: {
          title: { source: 'ai_approved', model: 'gpt-4o-mini' },
        },
        aiCommerceEnabled: true,
      },
      { verifiedDomain: 'https://leafyearth.com' }
    );

    // Google Merchant XML Feed
    const googleXml = generateGoogleMerchantXmlFeed([projection], googleSettings);
    assert.ok(googleXml.includes('<g:structured_title>'));
    assert.ok(googleXml.includes('<g:digital_source_type>trained_algorithmic_media</g:digital_source_type>'));
    assert.ok(googleXml.includes('<g:price>150.00 INR</g:price>'));
    assert.ok(googleXml.includes('<g:sale_price>120.00 INR</g:sale_price>'));
    assert.ok(googleXml.includes('<g:identifier_exists>no</g:identifier_exists>'));

    // Bing XML Feed
    const bingXml = generateBingMerchantXmlFeed([projection], googleSettings);
    assert.ok(bingXml.includes('LeafyEarth Microsoft Merchant Catalog'));

    // OpenAI JSONL Feed
    const jsonl = generateOpenAIProductsJsonlFeed([projection], openaiSettings);
    const parsedJsonl = JSON.parse(jsonl);
    assert.equal(parsedJsonl.currency, 'INR');
    assert.equal(parsedJsonl.price, 120);
    assert.equal(parsedJsonl.submission_enabled, false);

    // Sitemap, Robots & llms.txt
    const sitemap = generateSitemapXml([projection], 'https://leafyearth.com');
    assert.ok(sitemap.includes('<loc>https://leafyearth.com/products/cumin-seeds-jeera-whole</loc>'));

    const robots = generateRobotsTxt('https://leafyearth.com');
    assert.ok(robots.includes('User-agent: OAI-SearchBot'));
    assert.ok(robots.includes('User-agent: PerplexityBot'));
    assert.ok(robots.includes('Disallow: /api/admin/'));
    assert.ok(robots.includes('Sitemap: https://leafyearth.com/sitemap.xml'));

    const llms = generateLlmsTxt([projection], 'https://leafyearth.com');
    assert.ok(llms.includes('https://leafyearth.com/products/cumin-seeds-jeera-whole'));

    // SSR Product Landing HTML + JSON-LD (no fabricated AggregateRating when reviewsCount === 0)
    const jsonLd = buildProductJsonLdObject(projection);
    assert.equal(jsonLd['@type'], 'Product');
    assert.equal(jsonLd.offers.priceCurrency, 'INR');
    assert.equal(jsonLd.offers.price, '120.00');
    assert.equal(jsonLd.aggregateRating, undefined);

    const ssrHtml = renderServerProductLandingHtml(projection);
    assert.ok(ssrHtml.includes('<title>Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth</title>'));
    assert.ok(
      ssrHtml.includes('<link rel="canonical" href="https://leafyearth.com/products/cumin-seeds-jeera-whole" />')
    );
    assert.ok(ssrHtml.includes('application/ld+json'));

    // Master comparison diff includes V9 'seo' and V10 'commerce' groups
    const fallbackPayload = buildStructuredFallbackContent('Cumin Seeds (Jeera)');
    const diff = buildMasterComparisonDiff(
      { id: 'prod_cumin_1', name: 'Cumin Seeds' },
      fallbackPayload,
      null,
      'APPROVED',
      'approved',
      'approved'
    );
    assert.ok(diff.some((d) => d.group === 'seo' && d.fieldKey === 'urlSlug' && d.selectable));
    assert.ok(diff.some((d) => d.group === 'commerce' && d.fieldKey === 'productHighlights' && d.selectable));

    // Platform readiness validation
    const readiness = validateProductForPlatform(
      {
        id: 'prod_cumin_1',
        sku: '09093100',
        name: 'Cumin Seeds (Jeera)',
        title: 'Cumin Seeds (Jeera) – Whole Culinary Spice',
        description:
          'Whole aromatic Cumin Seeds (Jeera) hygienically packed for everyday Indian cooking.',
        urlSlug: 'cumin-seeds-jeera-whole',
        seoTitle: 'Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth',
        metaDescription:
          'Discover aromatic whole cumin seeds (Jeera) for curries, dals, rice and spice blends.',
        onlinePrice: 135,
        imageUrl: 'https://leafyearth.com/images/cumin.png',
        aiCommerceEnabled: true,
      },
      'google_merchant',
      googleSettings
    );
    assert.equal(readiness.localReadiness, 'ready');
  });
});
