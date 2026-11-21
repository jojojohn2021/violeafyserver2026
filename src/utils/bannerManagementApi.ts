/**
 * LeafyServer | Banner Management Client API & Direct Firebase Fallback Utility
 *
 * Calls the Node.js /api/admin/banners & /api/public/banners endpoints first,
 * and seamlessly falls back to direct Cloud Firestore + Firebase Storage operations
 * when running on static Firebase Hosting (e.g. www.vionaturescience.in), while
 * enforcing identical binary signature (magic-byte) validation, route allowlists,
 * storage path hierarchy, orphan asset cleanup, and `home_banners/main_video` sync.
 */
import { auth, db, storage } from '../firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import type {
  BannerAssetMetadata,
  BannerAssetVariant,
  BannerCTA,
  BannerMediaType,
  BannerPageType,
  BannerPlacement,
  BannerPlacementSpec,
  BannerRecord,
  BannerSlideItem,
  LegacyHomeBannerMainVideo,
  PublicBannerDeliveryItem,
} from '../types';

export const BANNERS_COLLECTION = 'banners';
export const HOME_BANNERS_COLLECTION = 'home_banners';
export const LEGACY_MAIN_VIDEO_DOC_ID = 'main_video';

export const APPROVED_OTHER_PAGE_ROUTES: string[] = [
  '/offers',
  '/deals',
  '/preorders',
  '/referrals',
  '/about',
  '/contact',
  '/support',
  '/account',
  '/cart',
  '/wishlist',
  '/products',
  '/categories',
];

export const APPROVED_CTA_ROUTE_PREFIXES: string[] = [
  '/',
  '/products',
  '/categories',
  '/offers',
  '/deals',
  '/preorders',
  '/referrals',
  '/cart',
  '/wishlist',
  '/account',
  '/support',
  '/about',
  '/contact',
];

export const BANNER_PLACEMENTS_CATALOG: {
  id: BannerPlacement;
  label: string;
  desktopSpec: string;
  mobileSpec: string;
  defaultDesktopRatio: string;
  defaultMobileRatio: string;
}[] = [
  {
    id: 'hero',
    label: 'Hero Banner (Primary Top)',
    desktopSpec: '1920 × 720 px (8:3) • MP4 H.264 6–12s (2–5 MB) or WebP/JPEG/PNG',
    mobileSpec: '1080 × 1350 px (4:5) or 720 × 900 • MP4 H.264 (1–3 MB) or WebP/JPEG/PNG',
    defaultDesktopRatio: '8:3',
    defaultMobileRatio: '4:5',
  },
  {
    id: 'secondary',
    label: 'Secondary Promotional Banner',
    desktopSpec: '1600 × 600 px (8:3) or 1200 × 450 px',
    mobileSpec: '1080 × 1080 px (1:1) or 1080 × 1350 px (4:5)',
    defaultDesktopRatio: '8:3',
    defaultMobileRatio: '1:1',
  },
  {
    id: 'strip',
    label: 'Mid-Page Strip Banner',
    desktopSpec: '1920 × 320 px (6:1)',
    mobileSpec: '1080 × 360 px (3:1)',
    defaultDesktopRatio: '6:1',
    defaultMobileRatio: '3:1',
  },
  {
    id: 'spotlight',
    label: 'Featured Spotlight Card',
    desktopSpec: '1200 × 675 px (16:9)',
    mobileSpec: '1080 × 1350 px (4:5)',
    defaultDesktopRatio: '16:9',
    defaultMobileRatio: '4:5',
  },
  {
    id: 'footer_promo',
    label: 'Footer Promotional Banner',
    desktopSpec: '1920 × 480 px (4:1)',
    mobileSpec: '1080 × 600 px (9:5)',
    defaultDesktopRatio: '4:1',
    defaultMobileRatio: '9:5',
  },
];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // ignore
    }
  }
  return headers;
}

export function sanitizeClientPathSegment(value: string, fallback = 'global'): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '')
    .replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : fallback;
}

export function buildClientBannerStoragePath(params: {
  pageType: BannerPageType;
  pageId: string | null;
  bannerId: string;
  variant: BannerAssetVariant;
  fileName: string;
}): string {
  const { pageType, pageId, bannerId, variant, fileName } = params;
  const pageIdOrGlobal = pageId && String(pageId).trim() ? sanitizeClientPathSegment(pageId) : 'global';
  const folder =
    variant === 'mobile'
      ? 'mobile'
      : variant === 'desktop'
        ? 'desktop'
        : 'posters';
  const prefix =
    variant === 'mobilePoster'
      ? 'mobile_'
      : variant === 'desktopPoster'
        ? 'desktop_'
        : '';
  const base = String(fileName || 'asset')
    .replace(/\\/g, '/')
    .split('/')
    .pop() || 'asset';
  const extMatch = base.match(/\.([A-Za-z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
  const cleanName =
    base
      .replace(/\.[^.]+$/, '')
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .slice(0, 60) || 'asset';
  return `banners/${pageType}/${pageIdOrGlobal}/${bannerId}/${folder}/${prefix}${cleanName}_${Date.now()}.${ext}`;
}

export function validateClientInternalCtaRoute(route: string, allowEmpty = true): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = String(route || '').trim();
  if (!trimmed) {
    return allowEmpty
      ? { valid: true, normalized: '' }
      : { valid: false, normalized: '', error: 'CTA route is required when CTA label is provided.' };
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('//') ||
    trimmed.includes('..') ||
    trimmed.includes('\\')
  ) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'External URLs, javascript:, and path traversal ("..") are prohibited. Use an internal route starting with "/".',
    };
  }
  if (!trimmed.startsWith('/')) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Internal CTA route must start with "/" (e.g., /products or /categories/Spices).',
    };
  }
  const pathOnly = trimmed.split('?')[0].split('#')[0];
  const isApproved = APPROVED_CTA_ROUTE_PREFIXES.some((prefix) => {
    if (prefix === '/') return pathOnly === '/';
    return pathOnly === prefix || pathOnly.startsWith(`${prefix}/`);
  });
  if (!isApproved) {
    return {
      valid: false,
      normalized: trimmed,
      error: `Route "${pathOnly}" is not in the approved internal route list (${APPROVED_CTA_ROUTE_PREFIXES.join(', ')}).`,
    };
  }
  return { valid: true, normalized: trimmed };
}

/**
 * Inspects file magic bytes in the browser (`File.slice(0, 32).arrayBuffer()`)
 * and extracts video/image dimensions & duration before uploading.
 */
export async function inspectAndValidateClientMediaFile(params: {
  file: File;
  variant: BannerAssetVariant;
  bannerMediaType: BannerMediaType;
  placementSpec?: BannerPlacementSpec | null;
}): Promise<{
  valid: boolean;
  detectedMimeType?: string;
  canonicalExt?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  advisoryWarnings: string[];
  error?: string;
}> {
  const { file, variant, bannerMediaType, placementSpec } = params;
  const advisoryWarnings: string[] = [];

  if (!file || file.size < 12) {
    return { valid: false, advisoryWarnings, error: 'Selected file is empty or corrupted.' };
  }

  const headerBuf = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  let detectedMime: string | null = null;
  let canonicalExt: string | null = null;

  // PNG
  if (
    headerBuf[0] === 0x89 &&
    headerBuf[1] === 0x50 &&
    headerBuf[2] === 0x4e &&
    headerBuf[3] === 0x47
  ) {
    detectedMime = 'image/png';
    canonicalExt = 'png';
  } else if (headerBuf[0] === 0xff && headerBuf[1] === 0xd8 && headerBuf[2] === 0xff) {
    // JPEG
    detectedMime = 'image/jpeg';
    canonicalExt = 'jpg';
  } else if (
    String.fromCharCode(headerBuf[0], headerBuf[1], headerBuf[2], headerBuf[3]) === 'RIFF' &&
    String.fromCharCode(headerBuf[8], headerBuf[9], headerBuf[10], headerBuf[11]) === 'WEBP'
  ) {
    // WebP
    detectedMime = 'image/webp';
    canonicalExt = 'webp';
  } else if (
    String.fromCharCode(headerBuf[4], headerBuf[5], headerBuf[6], headerBuf[7]) === 'ftyp'
  ) {
    // MP4
    detectedMime = 'video/mp4';
    canonicalExt = 'mp4';
  }

  if (!detectedMime || !canonicalExt) {
    return {
      valid: false,
      advisoryWarnings,
      error: 'Unsupported file signature. Only MP4 (H.264) videos and WebP, JPEG, or PNG images are allowed.',
    };
  }

  const isPoster = variant === 'mobilePoster' || variant === 'desktopPoster';
  const maxVideoMb = placementSpec?.maxVideoSizeMb || 15;
  const maxImageMb = placementSpec?.maxImageSizeMb || 10;

  if (isPoster || bannerMediaType === 'image') {
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(detectedMime)) {
      return {
        valid: false,
        advisoryWarnings,
        error: `${isPoster ? 'Poster' : 'Image banner'} asset must be WebP, JPEG, or PNG (detected ${detectedMime}).`,
      };
    }
    if (file.size > maxImageMb * 1024 * 1024) {
      return {
        valid: false,
        advisoryWarnings,
        error: `Image file (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the ${maxImageMb} MB limit.`,
      };
    }
  } else {
    if (detectedMime !== 'video/mp4') {
      return {
        valid: false,
        advisoryWarnings,
        error: `Video banner asset must be an MP4 H.264 file (detected ${detectedMime}).`,
      };
    }
    if (file.size > maxVideoMb * 1024 * 1024) {
      return {
        valid: false,
        advisoryWarnings,
        error: `Video file (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the ${maxVideoMb} MB limit.`,
      };
    }
    const targetMaxMb = variant === 'mobile' ? 3 : 5;
    if (file.size > targetMaxMb * 1024 * 1024) {
      advisoryWarnings.push(
        `File size is ${(file.size / (1024 * 1024)).toFixed(2)} MB (recommended target is ≤ ${targetMaxMb} MB for fast playback).`
      );
    }
  }

  // Probe dimensions & duration in browser when DOM APIs are available
  let width: number | undefined;
  let height: number | undefined;
  let durationSec: number | undefined;

  if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
    const objectUrl = URL.createObjectURL(file);
    try {
      if (detectedMime === 'video/mp4') {
        const meta = await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.muted = true;
          const timer = setTimeout(() => reject(new Error('timeout')), 4000);
          v.onloadedmetadata = () => {
            clearTimeout(timer);
            resolve({
              width: v.videoWidth || 0,
              height: v.videoHeight || 0,
              duration: Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : 0,
            });
          };
          v.onerror = () => {
            clearTimeout(timer);
            reject(new Error('video metadata error'));
          };
          v.src = objectUrl;
        });
        width = meta.width || undefined;
        height = meta.height || undefined;
        durationSec = meta.duration || undefined;

        if (durationSec && (durationSec < 4 || durationSec > 20)) {
          advisoryWarnings.push(
            `Video duration is ${durationSec}s (recommended hero loop window is 6–12 seconds).`
          );
        }
      } else {
        const meta = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          const timer = setTimeout(() => reject(new Error('timeout')), 3000);
          img.onload = () => {
            clearTimeout(timer);
            resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
          };
          img.onerror = () => {
            clearTimeout(timer);
            reject(new Error('image metadata error'));
          };
          img.src = objectUrl;
        });
        width = meta.width || undefined;
        height = meta.height || undefined;
      }
    } catch {
      // Non-fatal metadata probe fallback
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return {
    valid: true,
    detectedMimeType: detectedMime,
    canonicalExt,
    width,
    height,
    durationSec,
    advisoryWarnings,
  };
}

function normalizeClientTimestamp(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const ms = Date.parse(val);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  if (typeof val?.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  if (typeof val?._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString();
  }
  return null;
}

function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (
    value instanceof Date ||
    value instanceof Timestamp ||
    typeof (value as any)?.toDate === 'function' ||
    typeof (value as any)?.isEqual === 'function'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function normalizeClientBannerDoc(id: string, data: Record<string, any>): BannerRecord {
  const slideDurationSec =
    Number.isFinite(Number(data.slideDurationSec)) && Number(data.slideDurationSec) >= 2
      ? Number(data.slideDurationSec)
      : 6;
  const slides: BannerSlideItem[] = Array.isArray(data.slides)
    ? data.slides.map((s: any, idx: number) => ({
        id: String(s?.id || `slide_${idx + 1}`),
        mediaType: s?.mediaType === 'image' ? 'image' : 'video',
        title: s?.title ? String(s.title) : '',
        subtitle: s?.subtitle ? String(s.subtitle) : '',
        sortOrder: Number.isFinite(Number(s?.sortOrder)) ? Number(s.sortOrder) : idx + 1,
        slideDurationSec:
          Number.isFinite(Number(s?.slideDurationSec)) && Number(s?.slideDurationSec) >= 2
            ? Number(s.slideDurationSec)
            : slideDurationSec,
        desktop: s?.desktop || null,
        mobile: s?.mobile || null,
        desktopPoster: s?.desktopPoster || null,
        mobilePoster: s?.mobilePoster || null,
        cta:
          s?.cta && s.cta.route
            ? { label: String(s.cta.label || 'Shop Now'), route: String(s.cta.route) }
            : null,
      }))
    : [];

  return {
    id,
    pageType: ['home', 'category', 'product', 'other'].includes(data.pageType) ? data.pageType : 'home',
    pageId:
      data.pageId !== undefined && data.pageId !== null && String(data.pageId).trim() !== ''
        ? String(data.pageId).trim()
        : null,
    placement: String(data.placement || 'hero').trim(),
    title: String(data.title || ''),
    subtitle: String(data.subtitle || ''),
    mediaType: data.mediaType === 'image' ? 'image' : 'video',
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 1,
    isActive: data.isActive !== false,
    carouselEnabled: data.carouselEnabled === true || slides.length > 0,
    slideDurationSec,
    slides,
    mobile: data.mobile || null,
    desktop: data.desktop || null,
    mobilePoster: data.mobilePoster || null,
    desktopPoster: data.desktopPoster || null,
    cta:
      data.cta && data.cta.route
        ? { label: String(data.cta.label || 'Shop Now'), route: String(data.cta.route) }
        : null,
    autoplay: data.autoplay !== false,
    loop: data.loop !== false,
    placementSpec: data.placementSpec || null,
    startsAt: normalizeClientTimestamp(data.startsAt),
    endsAt: normalizeClientTimestamp(data.endsAt),
    createdAt: normalizeClientTimestamp(data.createdAt) || new Date().toISOString(),
    updatedAt: normalizeClientTimestamp(data.updatedAt) || new Date().toISOString(),
    createdBy: String(data.createdBy || 'admin'),
    updatedBy: String(data.updatedBy || 'admin'),
  };
}

export function getClientBannerStatus(
  banner: BannerRecord,
  nowMs = Date.now()
): 'active' | 'scheduled' | 'expired' | 'disabled' {
  if (!banner.isActive) return 'disabled';
  if (banner.startsAt) {
    const s = Date.parse(banner.startsAt);
    if (!Number.isNaN(s) && s > nowMs) return 'scheduled';
  }
  if (banner.endsAt) {
    const e = Date.parse(banner.endsAt);
    if (!Number.isNaN(e) && e < nowMs) return 'expired';
  }
  return 'active';
}

export function compareClientBanners(a: BannerRecord, b: BannerRecord): number {
  const s = (a.sortOrder ?? 1) - (b.sortOrder ?? 1);
  if (s !== 0) return s;
  const tA = Date.parse(a.createdAt || '') || 0;
  const tB = Date.parse(b.createdAt || '') || 0;
  if (tA !== tB) return tA - tB;
  return a.id.localeCompare(b.id);
}

export function resolveClientPublicBanners(
  allBanners: BannerRecord[],
  query: {
    pageType: BannerPageType;
    pageId?: string | null;
    placement?: string | null;
    nowMs?: number;
    includeFallback?: boolean;
  }
): {
  banners: PublicBannerDeliveryItem[];
  effectiveBanners: PublicBannerDeliveryItem[];
  carouselEnabled: boolean;
  matchedScope: 'exact_page_id' | 'page_generic_fallback' | 'none';
} {
  const nowMs = query.nowMs ?? Date.now();
  const placement = String(query.placement || 'hero').trim().toLowerCase();
  const requestedPageId =
    query.pageId !== undefined && query.pageId !== null && String(query.pageId).trim() !== ''
      ? String(query.pageId).trim()
      : null;

  const eligible = allBanners.filter((b) => {
    if (b.pageType !== query.pageType) return false;
    if (placement && b.placement.toLowerCase() !== placement) return false;
    if (getClientBannerStatus(b, nowMs) !== 'active') return false;
    const hasPrimary = Boolean(
      b.desktop?.url || b.mobile?.url || b.desktopPoster?.url || b.mobilePoster?.url
    );
    const hasSlides =
      Array.isArray(b.slides) && b.slides.some((s) => Boolean(s.desktop?.url || s.mobile?.url));
    return hasPrimary || hasSlides;
  });

  const exactMatches = requestedPageId
    ? eligible
        .filter((b) => b.pageId !== null && b.pageId.toLowerCase() === requestedPageId.toLowerCase())
        .sort(compareClientBanners)
    : [];

  const genericFallbacks = eligible
    .filter((b) => b.pageId === null)
    .sort(compareClientBanners);

  let selected: BannerRecord[] = [];
  let matchedScope: 'exact_page_id' | 'page_generic_fallback' | 'none' = 'none';

  if (requestedPageId && exactMatches.length > 0) {
    matchedScope = 'exact_page_id';
    selected = query.includeFallback ? [...exactMatches, ...genericFallbacks] : exactMatches;
  } else if (genericFallbacks.length > 0) {
    matchedScope = 'page_generic_fallback';
    selected = genericFallbacks;
  }

  const publicItems: PublicBannerDeliveryItem[] = selected.map((banner) => {
    const desktopAsset = banner.desktop?.url
      ? {
          url: banner.desktop.url,
          mimeType: banner.desktop.mimeType,
          width: banner.desktop.width,
          height: banner.desktop.height,
          durationSec: banner.desktop.durationSec,
        }
      : banner.mobile?.url
        ? {
            url: banner.mobile.url,
            mimeType: banner.mobile.mimeType,
            width: banner.mobile.width,
            height: banner.mobile.height,
            durationSec: banner.mobile.durationSec,
          }
        : null;

    const mobileAsset = banner.mobile?.url
      ? {
          url: banner.mobile.url,
          mimeType: banner.mobile.mimeType,
          width: banner.mobile.width,
          height: banner.mobile.height,
          durationSec: banner.mobile.durationSec,
        }
      : desktopAsset;

    const desktopPoster = banner.desktopPoster?.url
      ? { url: banner.desktopPoster.url, mimeType: banner.desktopPoster.mimeType }
      : banner.mobilePoster?.url
        ? { url: banner.mobilePoster.url, mimeType: banner.mobilePoster.mimeType }
        : null;

    const mobilePoster = banner.mobilePoster?.url
      ? { url: banner.mobilePoster.url, mimeType: banner.mobilePoster.mimeType }
      : desktopPoster;

    const slideDurationSec =
      Number.isFinite(Number(banner.slideDurationSec)) && Number(banner.slideDurationSec) >= 2
        ? Number(banner.slideDurationSec)
        : 6;

    return {
      id: banner.id,
      pageType: banner.pageType,
      pageId: banner.pageId,
      placement: banner.placement,
      title: banner.title,
      subtitle: banner.subtitle,
      mediaType: banner.mediaType,
      sortOrder: banner.sortOrder,
      carouselEnabled: Boolean(banner.carouselEnabled || (banner.slides && banner.slides.length > 0)),
      slideDurationSec,
      slides: banner.slides || [],
      mobile: mobileAsset,
      desktop: desktopAsset,
      mobilePoster,
      desktopPoster,
      cta: banner.cta,
      playback: {
        autoplay: banner.autoplay !== false,
        loop: banner.loop !== false,
        muted: true,
        pauseOffScreen: true,
        respectReducedMotion: true,
        slideDurationSec,
      },
      startsAt: banner.startsAt,
      endsAt: banner.endsAt,
    };
  });

  const carouselEnabled = publicItems.some((item) => item.carouselEnabled === true);
  const effectiveBanners = carouselEnabled ? publicItems : publicItems.slice(0, 1);

  return {
    banners: publicItems,
    effectiveBanners,
    carouselEnabled,
    matchedScope,
  };
}

async function syncClientLegacyHomeBannerMainVideo(): Promise<void> {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, BANNERS_COLLECTION));
    const allBanners = snap.docs.map((d) => normalizeClientBannerDoc(d.id, d.data() || {}));
    const resolved = resolveClientPublicBanners(allBanners, {
      pageType: 'home',
      placement: 'hero',
    });
    const top = resolved.banners[0] || null;
    const nowIso = new Date().toISOString();
    const payload: LegacyHomeBannerMainVideo = top
      ? {
          id: LEGACY_MAIN_VIDEO_DOC_ID,
          bannerId: top.id,
          title: top.title,
          subtitle: top.subtitle,
          mediaType: top.mediaType,
          videoUrl: top.desktop?.url || top.mobile?.url || '',
          mobileVideoUrl: top.mobile?.url || top.desktop?.url || '',
          desktopVideoUrl: top.desktop?.url || top.mobile?.url || '',
          posterUrl: top.desktopPoster?.url || top.mobilePoster?.url || '',
          mobilePosterUrl: top.mobilePoster?.url || top.desktopPoster?.url || '',
          desktopPosterUrl: top.desktopPoster?.url || top.mobilePoster?.url || '',
          cta: top.cta,
          isActive: true,
          autoplay: top.playback.autoplay,
          loop: top.playback.loop,
          carouselEnabled: resolved.carouselEnabled,
          slideDurationSec: top.slideDurationSec,
          slides: top.slides || [],
          updatedAt: nowIso,
        }
      : {
          id: LEGACY_MAIN_VIDEO_DOC_ID,
          bannerId: null,
          title: '',
          subtitle: '',
          mediaType: 'video',
          videoUrl: '',
          mobileVideoUrl: '',
          desktopVideoUrl: '',
          posterUrl: '',
          mobilePosterUrl: '',
          desktopPosterUrl: '',
          cta: null,
          isActive: false,
          autoplay: true,
          loop: true,
          carouselEnabled: false,
          slideDurationSec: 6,
          slides: [],
          updatedAt: nowIso,
        };
    await setDoc(
      doc(db, HOME_BANNERS_COLLECTION, LEGACY_MAIN_VIDEO_DOC_ID),
      stripUndefinedDeep({
        ...payload,
        updatedAtTimestamp: Timestamp.now(),
      }),
      { merge: true }
    );
  } catch (err) {
    console.warn('[BANNERS] Non-fatal warning syncing home_banners/main_video:', err);
  }
}

async function safeDeleteClientStoragePath(path?: string | null): Promise<void> {
  if (!storage || !path || !path.startsWith('banners/') || path.includes('..')) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch {
    // Ignore if already deleted
  }
}

// ============================================================================
// Admin & Public API Calls (Backend API -> Firestore/Storage Fallback)
// ============================================================================

export async function listAdminBannersClient(filters?: {
  pageType?: string;
  pageId?: string;
  placement?: string;
  status?: string;
  mediaType?: string;
  search?: string;
}): Promise<BannerRecord[]> {
  try {
    const headers = await getAuthHeaders();
    const qs = new URLSearchParams();
    if (filters?.pageType) qs.set('pageType', filters.pageType);
    if (filters?.pageId) qs.set('pageId', filters.pageId);
    if (filters?.placement) qs.set('placement', filters.placement);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.mediaType) qs.set('mediaType', filters.mediaType);
    if (filters?.search) qs.set('search', filters.search);

    const res = await fetch(`/api/admin/banners?${qs.toString()}`, { headers });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data.banners)) return data.banners;
    }
  } catch {
    // Fallback to direct Firestore query below
  }

  if (!db) return [];
  const snap = await getDocs(collection(db, BANNERS_COLLECTION));
  let items = snap.docs.map((d) => normalizeClientBannerDoc(d.id, d.data() || {}));

  if (filters?.pageType && filters.pageType !== 'all') {
    items = items.filter((b) => b.pageType === filters.pageType);
  }
  if (filters?.pageId) {
    if (filters.pageId === 'global' || filters.pageId === 'null') {
      items = items.filter((b) => b.pageId === null);
    } else {
      items = items.filter((b) => (b.pageId || '').toLowerCase() === filters.pageId!.toLowerCase());
    }
  }
  if (filters?.placement && filters.placement !== 'all') {
    items = items.filter((b) => b.placement.toLowerCase() === filters.placement!.toLowerCase());
  }
  if (filters?.mediaType && filters.mediaType !== 'all') {
    items = items.filter((b) => b.mediaType === filters.mediaType);
  }
  if (filters?.status && filters.status !== 'all') {
    items = items.filter((b) => getClientBannerStatus(b) === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    items = items.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.subtitle.toLowerCase().includes(q) ||
        (b.pageId || '').toLowerCase().includes(q) ||
        b.placement.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
    );
  }

  items.sort(compareClientBanners);
  return items;
}

export async function createAdminBannerClient(
  payload: Partial<BannerRecord>
): Promise<BannerRecord> {
  if (!payload.title || !payload.title.trim()) {
    throw new Error('Banner title is required.');
  }
  if (payload.cta && (payload.cta.label || payload.cta.route)) {
    const check = validateClientInternalCtaRoute(payload.cta.route, false);
    if (!check.valid) throw new Error(check.error);
  }
  if (payload.startsAt && payload.endsAt) {
    if (Date.parse(payload.startsAt) > Date.parse(payload.endsAt)) {
      throw new Error('Schedule Start Time cannot be after End Time.');
    }
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/banners', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create banner');
      if (data.banner) return data.banner;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('Unexpected token')) {
      throw err;
    }
  }

  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const bannerId =
    payload.id && /^[A-Za-z0-9_-]{1,128}$/.test(payload.id)
      ? payload.id
      : `bnr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const actorUid = auth?.currentUser?.uid || 'admin';
  const nowTs = Timestamp.now();

  const docData = {
    pageType: payload.pageType || 'home',
    pageId: payload.pageId && String(payload.pageId).trim() ? String(payload.pageId).trim() : null,
    placement: String(payload.placement || 'hero').trim().toLowerCase(),
    title: payload.title.trim(),
    subtitle: String(payload.subtitle || '').trim(),
    mediaType: payload.mediaType === 'image' ? 'image' : 'video',
    sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 1,
    isActive: payload.isActive !== false,
    carouselEnabled: payload.carouselEnabled === true || (Array.isArray(payload.slides) && payload.slides.length > 0),
    slideDurationSec:
      Number.isFinite(Number(payload.slideDurationSec)) && Number(payload.slideDurationSec) >= 2
        ? Number(payload.slideDurationSec)
        : 6,
    slides: Array.isArray(payload.slides) ? payload.slides : [],
    mobile: payload.mobile || null,
    desktop: payload.desktop || null,
    mobilePoster: payload.mobilePoster || null,
    desktopPoster: payload.desktopPoster || null,
    cta:
      payload.cta && payload.cta.route
        ? { label: payload.cta.label || 'Shop Now', route: payload.cta.route.trim() }
        : null,
    autoplay: payload.autoplay !== false,
    loop: payload.loop !== false,
    placementSpec: payload.placementSpec || null,
    startsAt: payload.startsAt ? Timestamp.fromMillis(Date.parse(payload.startsAt)) : null,
    endsAt: payload.endsAt ? Timestamp.fromMillis(Date.parse(payload.endsAt)) : null,
    createdAt: nowTs,
    updatedAt: nowTs,
    createdBy: actorUid,
    updatedBy: actorUid,
  };

  await setDoc(doc(db, BANNERS_COLLECTION, bannerId), stripUndefinedDeep(docData));
  if (docData.pageType === 'home') {
    await syncClientLegacyHomeBannerMainVideo();
  }
  return normalizeClientBannerDoc(bannerId, docData);
}

export async function updateAdminBannerClient(
  bannerId: string,
  updates: Partial<BannerRecord>
): Promise<BannerRecord> {
  if (updates.cta && (updates.cta.label || updates.cta.route)) {
    const check = validateClientInternalCtaRoute(updates.cta.route, false);
    if (!check.valid) throw new Error(check.error);
  }
  if (updates.startsAt && updates.endsAt) {
    if (Date.parse(updates.startsAt) > Date.parse(updates.endsAt)) {
      throw new Error('Schedule Start Time cannot be after End Time.');
    }
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/banners/${encodeURIComponent(bannerId)}`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update banner');
      if (data.banner) return data.banner;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('Unexpected token')) {
      throw err;
    }
  }

  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const docRef = doc(db, BANNERS_COLLECTION, bannerId);
  const existingSnap = await getDoc(docRef);
  if (!existingSnap.exists()) throw new Error('Banner not found.');
  const existing = normalizeClientBannerDoc(bannerId, existingSnap.data() || {});

  const actorUid = auth?.currentUser?.uid || 'admin';
  const merged: Record<string, any> = {
    pageType: updates.pageType ?? existing.pageType,
    pageId:
      updates.pageId !== undefined
        ? updates.pageId && String(updates.pageId).trim()
          ? String(updates.pageId).trim()
          : null
        : existing.pageId,
    placement: String(updates.placement ?? existing.placement).trim().toLowerCase(),
    title: String(updates.title ?? existing.title).trim(),
    subtitle: String(updates.subtitle ?? existing.subtitle).trim(),
    mediaType: updates.mediaType ?? existing.mediaType,
    sortOrder: Number.isFinite(Number(updates.sortOrder)) ? Number(updates.sortOrder) : existing.sortOrder,
    isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : existing.isActive,
    carouselEnabled:
      updates.carouselEnabled !== undefined ? Boolean(updates.carouselEnabled) : Boolean(existing.carouselEnabled),
    slideDurationSec:
      updates.slideDurationSec !== undefined
        ? Math.max(2, Math.min(120, Number(updates.slideDurationSec) || 6))
        : existing.slideDurationSec || 6,
    slides: updates.slides !== undefined ? updates.slides : existing.slides || [],
    mobile: updates.mobile !== undefined ? updates.mobile : existing.mobile,
    desktop: updates.desktop !== undefined ? updates.desktop : existing.desktop,
    mobilePoster: updates.mobilePoster !== undefined ? updates.mobilePoster : existing.mobilePoster,
    desktopPoster: updates.desktopPoster !== undefined ? updates.desktopPoster : existing.desktopPoster,
    cta: updates.cta !== undefined ? updates.cta : existing.cta,
    autoplay: updates.autoplay !== undefined ? Boolean(updates.autoplay) : existing.autoplay,
    loop: updates.loop !== undefined ? Boolean(updates.loop) : existing.loop,
    placementSpec: updates.placementSpec !== undefined ? updates.placementSpec : existing.placementSpec,
    startsAt:
      updates.startsAt !== undefined
        ? updates.startsAt
          ? Timestamp.fromMillis(Date.parse(updates.startsAt))
          : null
        : existing.startsAt
          ? Timestamp.fromMillis(Date.parse(existing.startsAt))
          : null,
    endsAt:
      updates.endsAt !== undefined
        ? updates.endsAt
          ? Timestamp.fromMillis(Date.parse(updates.endsAt))
          : null
        : existing.endsAt
          ? Timestamp.fromMillis(Date.parse(existing.endsAt))
          : null,
    updatedAt: Timestamp.now(),
    updatedBy: actorUid,
  };

  await setDoc(docRef, stripUndefinedDeep(merged), { merge: true });
  if (existing.pageType === 'home' || merged.pageType === 'home') {
    await syncClientLegacyHomeBannerMainVideo();
  }
  const updatedSnap = await getDoc(docRef);
  return normalizeClientBannerDoc(bannerId, updatedSnap.data() || {});
}

export async function deleteAdminBannerClient(bannerId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/banners/${encodeURIComponent(bannerId)}`, {
      method: 'DELETE',
      headers,
    });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete banner');
      return;
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('Failed to fetch') && !err.message.includes('Unexpected token')) {
      throw err;
    }
  }

  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const docRef = doc(db, BANNERS_COLLECTION, bannerId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const banner = normalizeClientBannerDoc(bannerId, snap.data() || {});
    for (const variant of ['mobile', 'desktop', 'mobilePoster', 'desktopPoster'] as BannerAssetVariant[]) {
      const oldPath = banner[variant]?.storagePath;
      if (oldPath) {
        await safeDeleteClientStoragePath(oldPath);
      }
    }
    await deleteDoc(docRef);
    if (banner.pageType === 'home') {
      await syncClientLegacyHomeBannerMainVideo();
    }
  }
}

export async function uploadBannerAssetClient(params: {
  banner: BannerRecord;
  variant: BannerAssetVariant;
  file: File;
  onProgress?: (percent: number) => void;
  registerCancel?: (cancelFn: () => void) => void;
}): Promise<{ asset: BannerAssetMetadata; banner: BannerRecord }> {
  const { banner, variant, file, onProgress, registerCancel } = params;

  const inspection = await inspectAndValidateClientMediaFile({
    file,
    variant,
    bannerMediaType: banner.mediaType,
    placementSpec: banner.placementSpec,
  });
  if (!inspection.valid || !inspection.detectedMimeType || !inspection.canonicalExt) {
    throw new Error(inspection.error || 'Media file validation failed.');
  }

  // Prefer direct resumable upload to Firebase Storage for real-time progress & large video streaming,
  // or multipart POST /api/admin/banners/:id/assets if client Storage SDK is unavailable.
  if (storage && db) {
    const safeFileName = file.name.replace(/\.[^.]+$/, '') + '.' + inspection.canonicalExt;
    const targetPath = buildClientBannerStoragePath({
      pageType: banner.pageType,
      pageId: banner.pageId,
      bannerId: banner.id,
      variant,
      fileName: safeFileName,
    });
    const fileRef = storageRef(storage, targetPath);
    const uploadTask = uploadBytesResumable(fileRef, file, {
      contentType: inspection.detectedMimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    if (registerCancel) {
      registerCancel(() => uploadTask.cancel());
    }

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes > 0) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(pct);
          }
        },
        (error) => {
          if ((error as any)?.code === 'storage/canceled') {
            reject(new Error('Upload cancelled by user.'));
          } else {
            reject(error);
          }
        },
        () => resolve()
      );
    });

    const downloadUrl = await getDownloadURL(fileRef);
    const assetMeta: BannerAssetMetadata = {
      storagePath: targetPath,
      url: downloadUrl,
      mimeType: inspection.detectedMimeType,
      fileName: file.name,
      sizeBytes: file.size,
      ...(inspection.width ? { width: inspection.width } : {}),
      ...(inspection.height ? { height: inspection.height } : {}),
      ...(inspection.durationSec ? { durationSec: inspection.durationSec } : {}),
    };

    const previousPath = banner[variant]?.storagePath;

    let updatedBanner: BannerRecord;
    try {
      updatedBanner = await updateAdminBannerClient(banner.id, {
        [variant]: assetMeta,
      } as Partial<BannerRecord>);
    } catch (saveErr) {
      // Roll back the newly uploaded Storage file so no orphaned file is saved if Firestore fails
      await safeDeleteClientStoragePath(targetPath);
      throw saveErr;
    }

    if (previousPath && previousPath !== targetPath) {
      await safeDeleteClientStoragePath(previousPath);
    }

    if (onProgress) onProgress(100);
    return { asset: assetMeta, banner: updatedBanner };
  }

  // Fallback to multipart backend upload
  const headers = await getAuthHeaders();
  const form = new FormData();
  form.append('variant', variant);
  form.append('file', file);
  if (inspection.width) form.append('width', String(inspection.width));
  if (inspection.height) form.append('height', String(inspection.height));
  if (inspection.durationSec) form.append('durationSec', String(inspection.durationSec));

  if (onProgress) onProgress(25);
  const res = await fetch(`/api/admin/banners/${encodeURIComponent(banner.id)}/assets`, {
    method: 'POST',
    headers,
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to upload banner asset');
  if (onProgress) onProgress(100);
  return { asset: data.asset, banner: data.banner };
}

export async function deleteBannerAssetClient(
  banner: BannerRecord,
  variant: BannerAssetVariant
): Promise<BannerRecord> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `/api/admin/banners/${encodeURIComponent(banner.id)}/assets/${encodeURIComponent(variant)}`,
      {
        method: 'DELETE',
        headers,
      }
    );
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove asset');
      if (data.banner) return data.banner;
    }
  } catch {
    // Fallback below
  }

  const oldPath = banner[variant]?.storagePath;
  if (oldPath) {
    await safeDeleteClientStoragePath(oldPath);
  }
  return updateAdminBannerClient(banner.id, {
    [variant]: null,
  } as Partial<BannerRecord>);
}

export async function fetchPublicBannersClient(params: {
  pageType: BannerPageType;
  pageId?: string | null;
  placement?: string;
}): Promise<{
  banners: PublicBannerDeliveryItem[];
  effectiveBanners: PublicBannerDeliveryItem[];
  carouselEnabled: boolean;
  matchedScope: 'exact_page_id' | 'page_generic_fallback' | 'none';
}> {
  try {
    const qs = new URLSearchParams();
    qs.set('pageType', params.pageType);
    if (params.pageId) qs.set('pageId', params.pageId);
    qs.set('placement', params.placement || 'hero');

    const res = await fetch(`/api/public/banners?${qs.toString()}`);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data.banners)) {
        return {
          banners: data.banners,
          effectiveBanners: data.effectiveBanners || data.banners.slice(0, 1),
          carouselEnabled: Boolean(data.carouselEnabled),
          matchedScope: data.matchedScope || 'none',
        };
      }
    }
  } catch {
    // Fallback to direct Firestore read below
  }

  if (!db) {
    return {
      banners: [],
      effectiveBanners: [],
      carouselEnabled: false,
      matchedScope: 'none',
    };
  }

  try {
    const snap = await getDocs(collection(db, BANNERS_COLLECTION));
    const allBanners = snap.docs.map((d) => normalizeClientBannerDoc(d.id, d.data() || {}));
    return resolveClientPublicBanners(allBanners, {
      pageType: params.pageType,
      pageId: params.pageId,
      placement: params.placement || 'hero',
    });
  } catch {
    return {
      banners: [],
      effectiveBanners: [],
      carouselEnabled: false,
      matchedScope: 'none',
    };
  }
}

/**
 * Uploads a single video (MP4) or image (WebP/JPEG/PNG) file as a slide item in `banner.slides[]`.
 * Automatically detects whether the file is a video or an image from its binary signature.
 */
export async function uploadBannerSlideItemClient(params: {
  banner: BannerRecord;
  file: File;
  slideTitle?: string;
  slideDurationSec?: number;
  onProgress?: (percent: number) => void;
}): Promise<{ slide: BannerSlideItem; banner: BannerRecord }> {
  const { banner, file, slideTitle, slideDurationSec, onProgress } = params;

  const isVideoHint = file.type.startsWith('video/') || /\.mp4$/i.test(file.name);
  const mediaKind: BannerMediaType = isVideoHint ? 'video' : 'image';

  const inspection = await inspectAndValidateClientMediaFile({
    file,
    variant: 'desktop',
    bannerMediaType: mediaKind,
    placementSpec: banner.placementSpec,
  });
  if (!inspection.valid || !inspection.detectedMimeType || !inspection.canonicalExt) {
    throw new Error(inspection.error || 'Slide file signature validation failed.');
  }

  const detectedMediaType: BannerMediaType =
    inspection.detectedMimeType === 'video/mp4' ? 'video' : 'image';

  if (!storage || !db) {
    throw new Error('Firebase Storage and Firestore must be initialized to upload slider items.');
  }

  const slideId = `slide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const safeFileName = `slide_${file.name.replace(/\.[^.]+$/, '')}.${inspection.canonicalExt}`;
  const targetPath = buildClientBannerStoragePath({
    pageType: banner.pageType,
    pageId: banner.pageId,
    bannerId: banner.id,
    variant: 'desktop',
    fileName: safeFileName,
  });

  const fileRef = storageRef(storage, targetPath);
  const uploadTask = uploadBytesResumable(fileRef, file, {
    contentType: inspection.detectedMimeType,
    cacheControl: 'public, max-age=31536000, immutable',
  });

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (err) => reject(err),
      () => resolve()
    );
  });

  const downloadUrl = await getDownloadURL(fileRef);
  const assetMeta: BannerAssetMetadata = {
    storagePath: targetPath,
    url: downloadUrl,
    mimeType: inspection.detectedMimeType,
    fileName: file.name,
    sizeBytes: file.size,
    ...(inspection.width ? { width: inspection.width } : {}),
    ...(inspection.height ? { height: inspection.height } : {}),
    ...(inspection.durationSec ? { durationSec: inspection.durationSec } : {}),
  };

  const existingSlides = Array.isArray(banner.slides) ? [...banner.slides] : [];
  const duration =
    Number.isFinite(Number(slideDurationSec)) && Number(slideDurationSec) >= 2
      ? Number(slideDurationSec)
      : banner.slideDurationSec || 6;

  const newSlide: BannerSlideItem = {
    id: slideId,
    mediaType: detectedMediaType,
    title: slideTitle || banner.title || '',
    subtitle: banner.subtitle || '',
    sortOrder: existingSlides.length + 1,
    slideDurationSec: duration,
    desktop: assetMeta,
    mobile: assetMeta,
    desktopPoster: null,
    mobilePoster: null,
    cta: banner.cta || null,
  };

  const nextSlides = [...existingSlides, newSlide];
  const patch: Partial<BannerRecord> = {
    slides: nextSlides,
    carouselEnabled: true,
    slideDurationSec: duration,
  };
  // Also populate primary desktop/mobile if empty so the banner always has a primary asset
  if (!banner.desktop?.url) {
    patch.desktop = assetMeta;
    patch.mediaType = detectedMediaType;
  }
  if (!banner.mobile?.url) {
    patch.mobile = assetMeta;
  }

  let updatedBanner: BannerRecord;
  try {
    updatedBanner = await updateAdminBannerClient(banner.id, patch);
  } catch (saveErr) {
    // Roll back the newly uploaded Storage file so no orphaned file is saved when an error occurs
    await safeDeleteClientStoragePath(targetPath);
    throw saveErr;
  }
  if (onProgress) onProgress(100);
  return { slide: newSlide, banner: updatedBanner };
}

export async function removeBannerSlideItemClient(
  banner: BannerRecord,
  slideId: string
): Promise<BannerRecord> {
  const existingSlides = Array.isArray(banner.slides) ? banner.slides : [];
  const target = existingSlides.find((s) => s.id === slideId);
  if (target?.desktop?.storagePath && target.desktop.storagePath !== banner.desktop?.storagePath) {
    await safeDeleteClientStoragePath(target.desktop.storagePath);
  }
  if (
    target?.mobile?.storagePath &&
    target.mobile.storagePath !== target?.desktop?.storagePath &&
    target.mobile.storagePath !== banner.mobile?.storagePath
  ) {
    await safeDeleteClientStoragePath(target.mobile.storagePath);
  }
  const remaining = existingSlides
    .filter((s) => s.id !== slideId)
    .map((s, idx) => ({ ...s, sortOrder: idx + 1 }));

  return updateAdminBannerClient(banner.id, {
    slides: remaining,
  });
}

export async function updateHomepageSliderSettingsClient(params: {
  carouselEnabled: boolean;
  slideDurationSec: number;
}): Promise<void> {
  const duration = Math.max(2, Math.min(120, Number(params.slideDurationSec) || 6));
  const homeBanners = await listAdminBannersClient({ pageType: 'home' });
  for (const b of homeBanners) {
    const updatedSlides = Array.isArray(b.slides)
      ? b.slides.map((s) => ({ ...s, slideDurationSec: duration }))
      : [];
    await updateAdminBannerClient(b.id, {
      carouselEnabled: params.carouselEnabled,
      slideDurationSec: duration,
      slides: updatedSlides,
    });
  }
  await syncClientLegacyHomeBannerMainVideo();
}

