import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BannerHttpError,
  buildBannerStoragePath,
  buildLegacyHomeBannerMainVideoPayload,
  checkBannerUploadRateLimit,
  detectMediaSignature,
  getBannerLifecycleStatus,
  resolvePublicBanners,
  validateBannerAssetUpload,
  validateBannerWriteInput,
  validateInternalBannerRoute,
  validatePageTargeting,
} from '../src/services/bannerManagementService';
import {
  FULL_DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissionRule,
  SECURITY_MODULES_CATALOG,
} from '../src/utils/securityCatalog';
import type { BannerRecord } from '../src/types';

test('Section 2 & 8: Banner Management is registered in Security Catalog with proper RBAC permissions', () => {
  const entry = SECURITY_MODULES_CATALOG.find((m) => m.module === 'Banner Management');
  assert.ok(entry, 'Banner Management must exist in SECURITY_MODULES_CATALOG');
  assert.equal(entry.menuId, 'banner_management');
  assert.deepEqual(entry.submenus, [
    'All Banners',
    'Home Page',
    'Category Pages',
    'Product Pages',
    'Other Pages',
  ]);

  const adminPerm = getEffectivePermissionRule(FULL_DEFAULT_ROLE_PERMISSIONS, 'Admin', 'Banner Management');
  assert.equal(adminPerm.read, true);
  assert.equal(adminPerm.create, true);
  assert.equal(adminPerm.edit, true);
  assert.equal(adminPerm.delete, true);

  const marketingPerm = getEffectivePermissionRule(FULL_DEFAULT_ROLE_PERMISSIONS, 'Marketing', 'Banner Management');
  assert.equal(marketingPerm.read, true);
  assert.equal(marketingPerm.create, true);
  assert.equal(marketingPerm.edit, true);

  const referralPerm = getEffectivePermissionRule(FULL_DEFAULT_ROLE_PERMISSIONS, 'Referral Team', 'Banner Management');
  assert.equal(referralPerm.read, false);
  assert.equal(referralPerm.create, false);
  assert.equal(referralPerm.edit, false);
  assert.equal(referralPerm.delete, false);
});

test('Section 3 & 8: Validates page targeting and restricts CTA routes to approved internal paths', () => {
  assert.deepEqual(validatePageTargeting('home', null), { pageType: 'home', pageId: null });
  assert.deepEqual(validatePageTargeting('category', 'Spices'), { pageType: 'category', pageId: 'Spices' });
  assert.deepEqual(validatePageTargeting('product', 'prod_123'), { pageType: 'product', pageId: 'prod_123' });
  assert.deepEqual(validatePageTargeting('other', '/offers'), { pageType: 'other', pageId: '/offers' });
  assert.deepEqual(validatePageTargeting('other', 'preorders'), { pageType: 'other', pageId: '/preorders' });

  assert.throws(
    () => validatePageTargeting('invalid_page', null),
    (err: any) => err instanceof BannerHttpError && err.code === 'INVALID_PAGE_TYPE'
  );
  assert.throws(
    () => validatePageTargeting('other', '/unapproved-admin-backdoor'),
    (err: any) => err instanceof BannerHttpError && err.code === 'UNAPPROVED_OTHER_PAGE_ROUTE'
  );

  // Safe internal CTA routes
  assert.equal(validateInternalBannerRoute('/products'), '/products');
  assert.equal(validateInternalBannerRoute('/products/wayanad-turmeric'), '/products/wayanad-turmeric');
  assert.equal(validateInternalBannerRoute('/categories/Spices'), '/categories/Spices');
  assert.equal(validateInternalBannerRoute('/offers'), '/offers');

  // Prohibited external, script, or traversal routes
  for (const unsafeRoute of [
    'javascript:alert(1)',
    'JAVASCRIPT:evil()',
    'data:text/html,<script>alert(1)</script>',
    'https://evil.example.com/phish',
    'http://evil.example.com',
    '//evil.example.com/path',
    '/products/../../etc/passwd',
    '/unknown-unapproved-route',
  ]) {
    assert.throws(
      () => validateInternalBannerRoute(unsafeRoute, false),
      /CTA route/,
      `Expected route '${unsafeRoute}' to be rejected`
    );
  }
});

test('Section 5 & 8: Builds canonical Firebase Storage hierarchy and blocks path traversal', () => {
  const desktopPath = buildBannerStoragePath({
    pageType: 'home',
    pageId: null,
    bannerId: 'bnr_101',
    variant: 'desktop',
    fileName: 'hero_desktop.mp4',
  });
  assert.equal(desktopPath, 'banners/home/global/bnr_101/desktop/hero_desktop.mp4');

  const mobileCatPath = buildBannerStoragePath({
    pageType: 'category',
    pageId: 'Spices & Herbs',
    bannerId: 'bnr_202',
    variant: 'mobile',
    fileName: 'hero_mobile.mp4',
  });
  assert.equal(mobileCatPath, 'banners/category/Spices___Herbs/bnr_202/mobile/hero_mobile.mp4');

  const posterPath = buildBannerStoragePath({
    pageType: 'product',
    pageId: 'prod_99',
    bannerId: 'bnr_303',
    variant: 'desktopPoster',
    fileName: 'poster.webp',
  });
  assert.equal(posterPath, 'banners/product/prod_99/bnr_303/posters/desktop_poster.webp');

  assert.throws(
    () =>
      buildBannerStoragePath({
        pageType: 'home',
        pageId: null,
        bannerId: '../evil',
        variant: 'desktop',
        fileName: 'hero.mp4',
      }),
    (err: any) => err instanceof BannerHttpError && err.code === 'INVALID_BANNER_ID'
  );
});

test('Section 4 & 8: Validates binary magic-byte file signatures, MIME spoofing, and upload size limits', () => {
  // 1. Valid MP4 H.264 header (size + "ftyp" + "isom")
  const validMp4Buf = Buffer.alloc(64);
  validMp4Buf.writeUInt32BE(24, 0);
  validMp4Buf.write('ftyp', 4, 'ascii');
  validMp4Buf.write('isom', 8, 'ascii');

  const mp4Sig = detectMediaSignature(validMp4Buf);
  assert.equal(mp4Sig.valid, true);
  assert.equal(mp4Sig.detectedMimeType, 'video/mp4');
  assert.equal(mp4Sig.canonicalExt, 'mp4');

  const checkedMp4 = validateBannerAssetUpload({
    buffer: validMp4Buf,
    declaredMimeType: 'video/mp4',
    variant: 'desktop',
    bannerMediaType: 'video',
  });
  assert.equal(checkedMp4.mimeType, 'video/mp4');

  // 2. Valid PNG header with IHDR 1920x720
  const validPngBuf = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(validPngBuf, 0);
  validPngBuf.write('IHDR', 12, 'ascii');
  validPngBuf.writeUInt32BE(1920, 16);
  validPngBuf.writeUInt32BE(720, 20);

  const checkedPoster = validateBannerAssetUpload({
    buffer: validPngBuf,
    declaredMimeType: 'image/png',
    variant: 'desktopPoster',
    bannerMediaType: 'video',
  });
  assert.equal(checkedPoster.mimeType, 'image/png');
  assert.equal(checkedPoster.width, 1920);
  assert.equal(checkedPoster.height, 720);

  // 3. Valid WebP header ("RIFF" .... "WEBP")
  const validWebpBuf = Buffer.alloc(24);
  validWebpBuf.write('RIFF', 0, 'ascii');
  validWebpBuf.write('WEBP', 8, 'ascii');
  const webpSig = detectMediaSignature(validWebpBuf);
  assert.equal(webpSig.valid, true);
  assert.equal(webpSig.detectedMimeType, 'image/webp');

  // 4. Reject spoofed HTML/script buffer claiming to be video/mp4
  const spoofedBuf = Buffer.from('<html><script>alert("xss")</script></html>', 'utf-8');
  assert.throws(
    () =>
      validateBannerAssetUpload({
        buffer: spoofedBuf,
        declaredMimeType: 'video/mp4',
        variant: 'desktop',
        bannerMediaType: 'video',
      }),
    (err: any) => err instanceof BannerHttpError && err.code === 'INVALID_FILE_SIGNATURE'
  );

  // 5. Reject PNG uploaded as video primary asset when declaredMimeType is video/mp4
  assert.throws(
    () =>
      validateBannerAssetUpload({
        buffer: validPngBuf,
        declaredMimeType: 'video/mp4',
        variant: 'desktop',
        bannerMediaType: 'video',
      }),
    (err: any) => err instanceof BannerHttpError && err.code === 'MIME_SIGNATURE_MISMATCH'
  );

  // 6. Reject file exceeding configured placement size limit
  const oversizedImage = Buffer.alloc(2 * 1024 * 1024); // 2 MB
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(oversizedImage, 0);
  assert.throws(
    () =>
      validateBannerAssetUpload({
        buffer: oversizedImage,
        declaredMimeType: 'image/jpeg',
        variant: 'desktopPoster',
        bannerMediaType: 'video',
        placementSpec: { maxImageSizeMb: 1 }, // 1 MB limit
      }),
    (err: any) => err instanceof BannerHttpError && err.code === 'FILE_TOO_LARGE'
  );
});

test('Section 3, 6 & 7: Public API filters inactive/out-of-window banners, enforces exact pageId -> fallback precedence, and syncs home_banners/main_video', () => {
  const nowMs = Date.parse('2026-11-18T12:00:00Z');

  const makeBanner = (overrides: Partial<BannerRecord>): BannerRecord => ({
    id: 'bnr_default',
    pageType: 'category',
    pageId: null,
    placement: 'hero',
    title: 'Default Category Banner',
    subtitle: 'Generic fallback',
    mediaType: 'video',
    sortOrder: 1,
    isActive: true,
    carouselEnabled: false,
    mobile: {
      storagePath: 'banners/category/global/bnr_default/mobile/m.mp4',
      url: 'https://firebasestorage.googleapis.com/v0/b/violeafybasket.firebasestorage.app/o/m.mp4',
      mimeType: 'video/mp4',
    },
    desktop: {
      storagePath: 'banners/category/global/bnr_default/desktop/d.mp4',
      url: 'https://firebasestorage.googleapis.com/v0/b/violeafybasket.firebasestorage.app/o/d.mp4',
      mimeType: 'video/mp4',
    },
    mobilePoster: null,
    desktopPoster: null,
    cta: { label: 'Shop Category', route: '/categories' },
    autoplay: true,
    loop: true,
    startsAt: null,
    endsAt: null,
    createdAt: '2026-11-10T00:00:00Z',
    updatedAt: '2026-11-10T00:00:00Z',
    createdBy: 'admin_1',
    updatedBy: 'admin_1',
    ...overrides,
  });

  const banners: BannerRecord[] = [
    // Generic category fallback (sortOrder 1)
    makeBanner({
      id: 'bnr_cat_generic',
      pageType: 'category',
      pageId: null,
      sortOrder: 1,
      title: 'Generic Category Fallback Hero',
    }),
    // Specific category=123 banner with lower priority (sortOrder 2)
    makeBanner({
      id: 'bnr_cat_123_second',
      pageType: 'category',
      pageId: '123',
      sortOrder: 2,
      title: 'Category 123 Hero #2',
    }),
    // Specific category=123 banner with higher priority (sortOrder 1)
    makeBanner({
      id: 'bnr_cat_123_first',
      pageType: 'category',
      pageId: '123',
      sortOrder: 1,
      title: 'Category 123 Hero #1',
    }),
    // Disabled banner for category=123 (must be excluded)
    makeBanner({
      id: 'bnr_cat_123_disabled',
      pageType: 'category',
      pageId: '123',
      sortOrder: 0,
      isActive: false,
      title: 'Disabled Category 123 Banner',
    }),
    // Future scheduled banner for category=123 (must be excluded)
    makeBanner({
      id: 'bnr_cat_123_future',
      pageType: 'category',
      pageId: '123',
      sortOrder: 0,
      startsAt: '2026-12-01T00:00:00Z',
      title: 'Future Scheduled Banner',
    }),
    // Expired banner for category=123 (must be excluded)
    makeBanner({
      id: 'bnr_cat_123_expired',
      pageType: 'category',
      pageId: '123',
      sortOrder: 0,
      endsAt: '2026-11-01T00:00:00Z',
      title: 'Expired Banner',
    }),
    // Home hero banner (for legacy home_banners/main_video sync test)
    makeBanner({
      id: 'bnr_home_hero_1',
      pageType: 'home',
      pageId: null,
      placement: 'hero',
      sortOrder: 1,
      title: 'Freshness Rooted in Nature',
      cta: { label: 'Shop Now', route: '/products' },
    }),
  ];

  // 1. Exact pageId match (category=123) wins over generic fallback, sorted by sortOrder ascending
  const cat123Result = resolvePublicBanners(banners, {
    pageType: 'category',
    pageId: '123',
    placement: 'hero',
    nowMs,
  });
  assert.equal(cat123Result.matchedScope, 'exact_page_id');
  assert.deepEqual(
    cat123Result.banners.map((b) => b.id),
    ['bnr_cat_123_first', 'bnr_cat_123_second']
  );
  // Single hero default when carouselEnabled is false
  assert.equal(cat123Result.carouselEnabled, false);
  assert.equal(cat123Result.effectiveBanners.length, 1);
  assert.equal(cat123Result.effectiveBanners[0].id, 'bnr_cat_123_first');

  // 2. Category without specific banner (category=999) falls back to generic category banner (pageId: null)
  const cat999Result = resolvePublicBanners(banners, {
    pageType: 'category',
    pageId: '999',
    placement: 'hero',
    nowMs,
  });
  assert.equal(cat999Result.matchedScope, 'page_generic_fallback');
  assert.equal(cat999Result.banners.length, 1);
  assert.equal(cat999Result.banners[0].id, 'bnr_cat_generic');

  // 3. Lifecycle status classification
  assert.equal(getBannerLifecycleStatus(banners[3], nowMs), 'disabled');
  assert.equal(getBannerLifecycleStatus(banners[4], nowMs), 'scheduled');
  assert.equal(getBannerLifecycleStatus(banners[5], nowMs), 'expired');

  // 4. Legacy home_banners/main_video synchronization payload
  const legacyDoc = buildLegacyHomeBannerMainVideoPayload(banners, nowMs);
  assert.equal(legacyDoc.id, 'main_video');
  assert.equal(legacyDoc.bannerId, 'bnr_home_hero_1');
  assert.equal(legacyDoc.title, 'Freshness Rooted in Nature');
  assert.equal(legacyDoc.isActive, true);
  assert.ok(legacyDoc.videoUrl.includes('firebasestorage.googleapis.com'));
});

test('Section 5 & 6: Validates write payload schedule windows and upload rate limiting', () => {
  assert.throws(
    () =>
      validateBannerWriteInput({
        pageType: 'home',
        placement: 'hero',
        title: 'Invalid Schedule Window',
        mediaType: 'video',
        startsAt: '2026-11-25T10:00:00Z',
        endsAt: '2026-11-20T10:00:00Z',
      }),
    (err: any) => err instanceof BannerHttpError && err.code === 'INVALID_SCHEDULE_WINDOW'
  );

  const testUid = `rate_test_user_${Date.now()}`;
  const baseNow = Date.now();
  for (let i = 0; i < 30; i++) {
    assert.equal(checkBannerUploadRateLimit(testUid, baseNow), true);
  }
  // 31st upload within the same 60-second window must be rate-limited
  assert.equal(checkBannerUploadRateLimit(testUid, baseNow + 1000), false);
  // After 61 seconds, window resets
  assert.equal(checkBannerUploadRateLimit(testUid, baseNow + 61_000), true);
});

test('Homepage Slider Settings: Supports multiple video and image slides with configurable slider interval time (slideDurationSec)', () => {
  const validated = validateBannerWriteInput({
    pageType: 'home',
    placement: 'hero',
    title: 'Homepage Multi-Media Slider',
    mediaType: 'video',
    slideDurationSec: 8,
    slides: [
      {
        id: 'slide_1',
        mediaType: 'video',
        sortOrder: 1,
        slideDurationSec: 8,
        desktop: {
          storagePath: 'banners/home/global/bnr_1/desktop/slide1.mp4',
          url: 'https://firebasestorage.googleapis.com/v0/b/violeafybasket.firebasestorage.app/o/slide1.mp4',
          mimeType: 'video/mp4',
        },
        mobile: {
          storagePath: 'banners/home/global/bnr_1/mobile/slide1.mp4',
          url: 'https://firebasestorage.googleapis.com/v0/b/violeafybasket.firebasestorage.app/o/slide1.mp4',
          mimeType: 'video/mp4',
        },
      },
      {
        id: 'slide_2',
        mediaType: 'image',
        sortOrder: 2,
        slideDurationSec: 8,
        desktop: {
          storagePath: 'banners/home/global/bnr_1/desktop/slide2.webp',
          url: 'https://firebasestorage.googleapis.com/v0/b/violeafybasket.firebasestorage.app/o/slide2.webp',
          mimeType: 'image/webp',
        },
        mobile: {
          storagePath: 'banners/home/global/bnr_1/mobile/slide2.webp',
          url: 'https://firebasestorage.googleapis.com/v0/b/violeafybasket.firebasestorage.app/o/slide2.webp',
          mimeType: 'image/webp',
        },
      },
    ],
  });

  assert.equal(validated.carouselEnabled, true);
  assert.equal(validated.slideDurationSec, 8);
  assert.equal(validated.slides.length, 2);
  assert.equal(validated.slides[0].mediaType, 'video');
  assert.equal(validated.slides[1].mediaType, 'image');

  // Reject out-of-range slider duration (< 2s or > 120s)
  assert.throws(
    () =>
      validateBannerWriteInput({
        pageType: 'home',
        placement: 'hero',
        title: 'Too Fast Slider',
        mediaType: 'video',
        slideDurationSec: 0.5,
      }),
    (err: any) => err instanceof BannerHttpError && err.code === 'INVALID_SLIDE_DURATION'
  );
});

