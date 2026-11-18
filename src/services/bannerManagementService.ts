/**
 * LeafyServer | Banner Management Module Service & Express Routes
 *
 * Provides:
 * - Server-side validation of banner metadata, page targeting, CTA routes, and schedule windows
 * - Binary magic-byte signature & MIME validation for MP4 (H.264) videos and WebP/JPEG/PNG images
 * - Canonical Firebase Cloud Storage object hierarchy:
 *     banners/{pageType}/{pageIdOrGlobal}/{bannerId}/{mobile|desktop|posters}/{filename}
 * - Safe asset replacement and deletion (preventing orphaned Storage objects)
 * - Deterministic public banner resolution (exact pageId match -> page-level generic fallback,
 *   sorted by sortOrder ascending, then createdAt ascending)
 * - Backward-compatible synchronization to `home_banners/main_video` for legacy Flutter clients
 */
import type express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';
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
import { uploadBufferToFirebaseStorage } from './aiProductContentService';

export const BANNERS_COLLECTION = 'banners';
export const HOME_BANNERS_COLLECTION = 'home_banners';
export const LEGACY_MAIN_VIDEO_DOC_ID = 'main_video';

export const VALID_BANNER_PAGE_TYPES: BannerPageType[] = ['home', 'category', 'product', 'other'];
export const VALID_BANNER_MEDIA_TYPES: BannerMediaType[] = ['video', 'image'];
export const VALID_BANNER_ASSET_VARIANTS: BannerAssetVariant[] = [
  'mobile',
  'desktop',
  'mobilePoster',
  'desktopPoster',
];

export const DEFAULT_BANNER_PLACEMENTS: BannerPlacement[] = [
  'hero',
  'secondary',
  'strip',
  'spotlight',
  'footer_promo',
];

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

export const ALLOWED_VIDEO_MIME_TYPES = new Set<string>(['video/mp4']);
export const ALLOWED_IMAGE_MIME_TYPES = new Set<string>([
  'image/webp',
  'image/jpeg',
  'image/png',
]);

const DEFAULT_MAX_VIDEO_MB = Number(process.env.BANNER_MAX_VIDEO_MB || 15);
const DEFAULT_MAX_IMAGE_MB = Number(process.env.BANNER_MAX_IMAGE_MB || 10);
const ABSOLUTE_MAX_VIDEO_MB = 50;
const ABSOLUTE_MAX_IMAGE_MB = 15;

export class BannerHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'BANNER_VALIDATION_ERROR'
  ) {
    super(message);
  }
}

// ============================================================================
// Pure Validation & Inspection Helpers (Exported for Unit Tests)
// ============================================================================

export function isValidBannerId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id.trim());
}

export function sanitizePathSegment(value: string, fallback = 'global'): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '')
    .replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : fallback;
}

export function sanitizeAssetFilename(originalName: string, canonicalExt: string): string {
  const base = String(originalName || 'asset')
    .replace(/\\/g, '/')
    .split('/')
    .pop() || 'asset';
  const withoutExt = base.replace(/\.[^.]+$/, '');
  const cleanBase = withoutExt
    .replace(/\.\./g, '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64) || 'asset';
  const ext = canonicalExt.replace(/^\./, '').toLowerCase();
  return `${cleanBase}_${Date.now()}.${ext}`;
}

export function buildBannerStoragePath(params: {
  pageType: BannerPageType;
  pageId: string | null;
  bannerId: string;
  variant: BannerAssetVariant;
  fileName: string;
}): string {
  const { pageType, pageId, bannerId, variant, fileName } = params;
  if (!VALID_BANNER_PAGE_TYPES.includes(pageType)) {
    throw new BannerHttpError(400, `Invalid pageType '${pageType}'`, 'INVALID_PAGE_TYPE');
  }
  if (!isValidBannerId(bannerId)) {
    throw new BannerHttpError(400, 'Invalid bannerId for storage path', 'INVALID_BANNER_ID');
  }
  if (!VALID_BANNER_ASSET_VARIANTS.includes(variant)) {
    throw new BannerHttpError(400, `Invalid asset variant '${variant}'`, 'INVALID_VARIANT');
  }
  const pageIdOrGlobal = pageId && String(pageId).trim() ? sanitizePathSegment(pageId) : 'global';
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
  const safeFile = fileName.replace(/\.\./g, '').replace(/[\\/]/g, '_');
  const fullPath = `banners/${pageType}/${pageIdOrGlobal}/${bannerId}/${folder}/${prefix}${safeFile}`;
  if (fullPath.includes('..') || !fullPath.startsWith('banners/')) {
    throw new BannerHttpError(400, 'Unsafe storage path rejected', 'PATH_TRAVERSAL');
  }
  return fullPath;
}

/**
 * Validates internal CTA route against open-redirect, XSS (`javascript:`), and unapproved paths.
 */
export function validateInternalBannerRoute(route: unknown, allowEmpty = true): string {
  if (route === undefined || route === null || String(route).trim() === '') {
    if (allowEmpty) return '';
    throw new BannerHttpError(400, 'CTA route is required when CTA label is set', 'INVALID_CTA_ROUTE');
  }
  if (typeof route !== 'string') {
    throw new BannerHttpError(400, 'CTA route must be a string', 'INVALID_CTA_ROUTE');
  }
  const trimmed = route.trim();
  if (trimmed.length > 300) {
    throw new BannerHttpError(400, 'CTA route exceeds 300 characters', 'INVALID_CTA_ROUTE');
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
    trimmed.includes('\\') ||
    /[\r\n\t]/.test(trimmed)
  ) {
    throw new BannerHttpError(
      400,
      'CTA route must be a safe internal path starting with "/" (external or script URLs are prohibited)',
      'UNSAFE_CTA_ROUTE'
    );
  }
  if (!trimmed.startsWith('/')) {
    throw new BannerHttpError(
      400,
      'CTA route must start with "/"',
      'INVALID_CTA_ROUTE'
    );
  }
  const pathOnly = trimmed.split('?')[0].split('#')[0];
  const isApproved = APPROVED_CTA_ROUTE_PREFIXES.some((prefix) => {
    if (prefix === '/') return pathOnly === '/';
    return pathOnly === prefix || pathOnly.startsWith(`${prefix}/`);
  });
  if (!isApproved) {
    throw new BannerHttpError(
      400,
      `CTA route '${pathOnly}' is not in the approved internal route allowlist`,
      'UNAPPROVED_CTA_ROUTE'
    );
  }
  if (!/^\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_%-]*)?$/.test(trimmed)) {
    throw new BannerHttpError(
      400,
      'CTA route contains invalid characters',
      'INVALID_CTA_ROUTE'
    );
  }
  return trimmed;
}

export function validatePageTargeting(
  pageType: unknown,
  pageId: unknown
): { pageType: BannerPageType; pageId: string | null } {
  if (typeof pageType !== 'string' || !VALID_BANNER_PAGE_TYPES.includes(pageType as BannerPageType)) {
    throw new BannerHttpError(
      400,
      `pageType must be one of: ${VALID_BANNER_PAGE_TYPES.join(', ')}`,
      'INVALID_PAGE_TYPE'
    );
  }
  const typedPage = pageType as BannerPageType;
  if (pageId === undefined || pageId === null || String(pageId).trim() === '') {
    return { pageType: typedPage, pageId: null };
  }
  if (typeof pageId !== 'string') {
    throw new BannerHttpError(400, 'pageId must be a string or null', 'INVALID_PAGE_ID');
  }
  const trimmedId = pageId.trim();
  if (trimmedId.length > 160 || trimmedId.includes('..') || /[\r\n\t\\]/.test(trimmedId)) {
    throw new BannerHttpError(400, 'pageId contains invalid characters', 'INVALID_PAGE_ID');
  }
  if (typedPage === 'other') {
    const normalizedRoute = trimmedId.startsWith('/') ? trimmedId : `/${trimmedId}`;
    if (!APPROVED_OTHER_PAGE_ROUTES.includes(normalizedRoute)) {
      throw new BannerHttpError(
        400,
        `Other page identifier '${trimmedId}' must be an approved route (${APPROVED_OTHER_PAGE_ROUTES.join(', ')})`,
        'UNAPPROVED_OTHER_PAGE_ROUTE'
      );
    }
    return { pageType: typedPage, pageId: normalizedRoute };
  }
  if (trimmedId.includes('/')) {
    throw new BannerHttpError(400, 'pageId for home/category/product cannot contain "/"', 'INVALID_PAGE_ID');
  }
  return { pageType: typedPage, pageId: trimmedId };
}

/**
 * Inspects binary magic bytes to detect true MIME type, canonical file extension,
 * and (when available) pixel dimensions. Never trusts client filename or declared MIME alone.
 */
export interface DetectedMediaSignature {
  valid: boolean;
  detectedMimeType: string | null;
  canonicalExt: string | null;
  width?: number;
  height?: number;
  reason?: string;
}

export function detectMediaSignature(buffer: Buffer): DetectedMediaSignature {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return {
      valid: false,
      detectedMimeType: null,
      canonicalExt: null,
      reason: 'File is empty or smaller than minimum valid header size (12 bytes)',
    };
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    let width: number | undefined;
    let height: number | undefined;
    if (buffer.length >= 24 && buffer.toString('ascii', 12, 16) === 'IHDR') {
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    }
    return {
      valid: true,
      detectedMimeType: 'image/png',
      canonicalExt: 'png',
      width,
      height,
    };
  }

  // 2. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      valid: true,
      detectedMimeType: 'image/jpeg',
      canonicalExt: 'jpg',
    };
  }

  // 3. WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return {
      valid: true,
      detectedMimeType: 'image/webp',
      canonicalExt: 'webp',
    };
  }

  // 4. MP4 (ISO Base Media File Format): bytes 4..7 == "ftyp"
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const majorBrand = buffer.toString('ascii', 8, 12);
    const allowedMp4Brands = new Set([
      'isom',
      'iso2',
      'iso4',
      'iso5',
      'iso6',
      'mp41',
      'mp42',
      'avc1',
      'M4V ',
      'M4A ',
      'dash',
      'msdh',
      'f4v ',
      'mmp4',
    ]);
    if (allowedMp4Brands.has(majorBrand) || majorBrand.startsWith('mp4') || majorBrand.startsWith('iso')) {
      return {
        valid: true,
        detectedMimeType: 'video/mp4',
        canonicalExt: 'mp4',
      };
    }
    return {
      valid: false,
      detectedMimeType: null,
      canonicalExt: null,
      reason: `Unsupported ISO container major brand '${majorBrand}' (only MP4 H.264 is permitted)`,
    };
  }

  return {
    valid: false,
    detectedMimeType: null,
    canonicalExt: null,
    reason: 'Unrecognized binary file signature (must be MP4 H.264, WebP, JPEG, or PNG)',
  };
}

export function getBannerUploadLimitsBytes(placementSpec?: BannerPlacementSpec | null): {
  maxVideoBytes: number;
  maxImageBytes: number;
} {
  const customVideoMb = Number(placementSpec?.maxVideoSizeMb);
  const customImageMb = Number(placementSpec?.maxImageSizeMb);

  const videoMb =
    Number.isFinite(customVideoMb) && customVideoMb > 0
      ? Math.min(customVideoMb, ABSOLUTE_MAX_VIDEO_MB)
      : DEFAULT_MAX_VIDEO_MB;
  const imageMb =
    Number.isFinite(customImageMb) && customImageMb > 0
      ? Math.min(customImageMb, ABSOLUTE_MAX_IMAGE_MB)
      : DEFAULT_MAX_IMAGE_MB;

  return {
    maxVideoBytes: Math.round(videoMb * 1024 * 1024),
    maxImageBytes: Math.round(imageMb * 1024 * 1024),
  };
}

export function validateBannerAssetUpload(params: {
  buffer: Buffer;
  declaredMimeType: string;
  variant: BannerAssetVariant;
  bannerMediaType: BannerMediaType;
  placementSpec?: BannerPlacementSpec | null;
}): {
  mimeType: string;
  canonicalExt: string;
  sizeBytes: number;
  width?: number;
  height?: number;
} {
  const { buffer, declaredMimeType, variant, bannerMediaType, placementSpec } = params;
  if (!VALID_BANNER_ASSET_VARIANTS.includes(variant)) {
    throw new BannerHttpError(400, `Invalid asset variant '${variant}'`, 'INVALID_VARIANT');
  }

  const sig = detectMediaSignature(buffer);
  if (!sig.valid || !sig.detectedMimeType || !sig.canonicalExt) {
    throw new BannerHttpError(
      400,
      sig.reason || 'File signature validation failed',
      'INVALID_FILE_SIGNATURE'
    );
  }

  const normalizedDeclared = String(declaredMimeType || '').trim().toLowerCase();
  if (normalizedDeclared && normalizedDeclared !== sig.detectedMimeType) {
    // Allow image/jpg alias for image/jpeg
    const isJpegAlias =
      normalizedDeclared === 'image/jpg' && sig.detectedMimeType === 'image/jpeg';
    if (!isJpegAlias) {
      throw new BannerHttpError(
        400,
        `Declared MIME type '${normalizedDeclared}' does not match binary file signature '${sig.detectedMimeType}'`,
        'MIME_SIGNATURE_MISMATCH'
      );
    }
  }

  const isPosterVariant = variant === 'mobilePoster' || variant === 'desktopPoster';
  const limits = getBannerUploadLimitsBytes(placementSpec);

  if (isPosterVariant) {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(sig.detectedMimeType)) {
      throw new BannerHttpError(
        400,
        `Poster variant '${variant}' must be a WebP, JPEG, or PNG image`,
        'INVALID_POSTER_MIME'
      );
    }
    if (buffer.length > limits.maxImageBytes) {
      throw new BannerHttpError(
        400,
        `Poster image size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the ${(limits.maxImageBytes / (1024 * 1024)).toFixed(0)} MB limit`,
        'FILE_TOO_LARGE'
      );
    }
  } else if (bannerMediaType === 'video') {
    // Primary mobile/desktop variant for a video banner must be video/mp4 (or image if admin uploads fallback image)
    if (!ALLOWED_VIDEO_MIME_TYPES.has(sig.detectedMimeType)) {
      throw new BannerHttpError(
        400,
        `Video banner asset '${variant}' must be MP4 (video/mp4), got '${sig.detectedMimeType}'`,
        'INVALID_VIDEO_MIME'
      );
    }
    if (buffer.length > limits.maxVideoBytes) {
      throw new BannerHttpError(
        400,
        `Video file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the ${(limits.maxVideoBytes / (1024 * 1024)).toFixed(0)} MB limit`,
        'FILE_TOO_LARGE'
      );
    }
  } else {
    // Image banner primary variant
    if (!ALLOWED_IMAGE_MIME_TYPES.has(sig.detectedMimeType)) {
      throw new BannerHttpError(
        400,
        `Image banner asset '${variant}' must be WebP, JPEG, or PNG, got '${sig.detectedMimeType}'`,
        'INVALID_IMAGE_MIME'
      );
    }
    if (buffer.length > limits.maxImageBytes) {
      throw new BannerHttpError(
        400,
        `Image file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the ${(limits.maxImageBytes / (1024 * 1024)).toFixed(0)} MB limit`,
        'FILE_TOO_LARGE'
      );
    }
  }

  return {
    mimeType: sig.detectedMimeType,
    canonicalExt: sig.canonicalExt,
    sizeBytes: buffer.length,
    width: sig.width,
    height: sig.height,
  };
}

function parseOptionalTimestamp(value: unknown, fieldName: string): Timestamp | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Timestamp) return value;
  if (typeof (value as any)?.toDate === 'function') {
    return Timestamp.fromDate((value as any).toDate());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (Number.isNaN(ms)) {
      throw new BannerHttpError(400, `${fieldName} must be a valid ISO date/time`, 'INVALID_SCHEDULE_DATE');
    }
    return Timestamp.fromMillis(ms);
  }
  throw new BannerHttpError(400, `${fieldName} must be a valid timestamp or null`, 'INVALID_SCHEDULE_DATE');
}

function timestampToIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  if (value instanceof Timestamp || typeof (value as any)?.toDate === 'function') {
    return (value as any).toDate().toISOString();
  }
  if (typeof (value as any)?._seconds === 'number') {
    return new Date((value as any)._seconds * 1000).toISOString();
  }
  if (typeof (value as any)?.seconds === 'number') {
    return new Date((value as any).seconds * 1000).toISOString();
  }
  return null;
}

function sanitizeAssetMetadataInput(
  raw: unknown,
  fieldName: string,
  expectedMediaKind: 'video' | 'image' | 'any'
): BannerAssetMetadata | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object') {
    throw new BannerHttpError(400, `${fieldName} must be an object or null`, 'INVALID_ASSET_METADATA');
  }
  const obj = raw as Record<string, any>;
  const storagePath = String(obj.storagePath || '').trim();
  const url = String(obj.url || '').trim();
  const mimeType = String(obj.mimeType || (expectedMediaKind === 'video' ? 'video/mp4' : 'image/webp')).trim().toLowerCase();

  if (!storagePath && !url) return null;
  if (storagePath && (storagePath.includes('..') || !storagePath.startsWith('banners/'))) {
    throw new BannerHttpError(400, `${fieldName}.storagePath must start with "banners/" and not contain ".."`, 'INVALID_STORAGE_PATH');
  }
  if (url && (url.toLowerCase().startsWith('javascript:') || url.toLowerCase().startsWith('data:'))) {
    throw new BannerHttpError(400, `${fieldName}.url cannot be a data: or javascript: URI`, 'INVALID_ASSET_URL');
  }
  if (expectedMediaKind === 'video' && !ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) {
    throw new BannerHttpError(400, `${fieldName}.mimeType must be video/mp4`, 'INVALID_VIDEO_MIME');
  }
  if (expectedMediaKind === 'image' && !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new BannerHttpError(400, `${fieldName}.mimeType must be image/webp, image/jpeg, or image/png`, 'INVALID_IMAGE_MIME');
  }

  const out: BannerAssetMetadata = {
    storagePath,
    url,
    mimeType,
  };
  if (obj.fileName) out.fileName = String(obj.fileName).trim().slice(0, 160);
  if (Number.isFinite(Number(obj.sizeBytes)) && Number(obj.sizeBytes) > 0) {
    out.sizeBytes = Number(obj.sizeBytes);
  }
  if (Number.isFinite(Number(obj.width)) && Number(obj.width) > 0) {
    out.width = Number(obj.width);
  }
  if (Number.isFinite(Number(obj.height)) && Number(obj.height) > 0) {
    out.height = Number(obj.height);
  }
  if (Number.isFinite(Number(obj.durationSec)) && Number(obj.durationSec) > 0) {
    out.durationSec = Number(obj.durationSec);
  }
  return out;
}

export const DEFAULT_SLIDE_DURATION_SEC = 6;
export const MIN_SLIDE_DURATION_SEC = 2;
export const MAX_SLIDE_DURATION_SEC = 120;

export function sanitizeSlideDurationSec(raw: unknown, fallback = DEFAULT_SLIDE_DURATION_SEC): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < MIN_SLIDE_DURATION_SEC || num > MAX_SLIDE_DURATION_SEC) {
    throw new BannerHttpError(
      400,
      `slideDurationSec must be a number between ${MIN_SLIDE_DURATION_SEC} and ${MAX_SLIDE_DURATION_SEC} seconds`,
      'INVALID_SLIDE_DURATION'
    );
  }
  return Math.round(num * 10) / 10;
}

export function sanitizeSlidesInput(rawSlides: unknown, defaultDurationSec: number): BannerSlideItem[] {
  if (rawSlides === undefined || rawSlides === null) return [];
  if (!Array.isArray(rawSlides)) {
    throw new BannerHttpError(400, 'slides must be an array of slide objects', 'INVALID_SLIDES');
  }
  return rawSlides.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw new BannerHttpError(400, `slides[${idx}] must be an object`, 'INVALID_SLIDES');
    }
    const s = raw as Record<string, any>;
    const id = String(s.id || `slide_${idx + 1}`).trim();
    const mediaType: BannerMediaType = s.mediaType === 'image' ? 'image' : 'video';
    const kind = mediaType === 'video' ? 'video' : 'image';
    const desktop = sanitizeAssetMetadataInput(s.desktop, `slides[${idx}].desktop`, kind);
    const mobile = sanitizeAssetMetadataInput(s.mobile, `slides[${idx}].mobile`, kind);
    const desktopPoster = sanitizeAssetMetadataInput(s.desktopPoster, `slides[${idx}].desktopPoster`, 'image');
    const mobilePoster = sanitizeAssetMetadataInput(s.mobilePoster, `slides[${idx}].mobilePoster`, 'image');
    let cta: BannerCTA | null = null;
    if (s.cta && typeof s.cta === 'object' && (s.cta.label || s.cta.route)) {
      const route = validateInternalBannerRoute(s.cta.route, false);
      cta = { label: String(s.cta.label || 'Shop Now').trim().slice(0, 60), route };
    }
    return {
      id,
      mediaType,
      title: s.title ? String(s.title).trim().slice(0, 160) : undefined,
      subtitle: s.subtitle ? String(s.subtitle).trim().slice(0, 320) : undefined,
      sortOrder: Number.isFinite(Number(s.sortOrder)) ? Number(s.sortOrder) : idx + 1,
      slideDurationSec: sanitizeSlideDurationSec(s.slideDurationSec, defaultDurationSec),
      desktop,
      mobile,
      desktopPoster,
      mobilePoster,
      cta,
    };
  });
}

export interface ValidatedBannerWritePayload {
  pageType: BannerPageType;
  pageId: string | null;
  placement: BannerPlacement;
  title: string;
  subtitle: string;
  mediaType: BannerMediaType;
  sortOrder: number;
  isActive: boolean;
  carouselEnabled: boolean;
  slideDurationSec: number;
  slides: BannerSlideItem[];
  mobile: BannerAssetMetadata | null;
  desktop: BannerAssetMetadata | null;
  mobilePoster: BannerAssetMetadata | null;
  desktopPoster: BannerAssetMetadata | null;
  cta: BannerCTA | null;
  autoplay: boolean;
  loop: boolean;
  placementSpec: BannerPlacementSpec | null;
  startsAt: Timestamp | null;
  endsAt: Timestamp | null;
}

export function validateBannerWriteInput(
  body: Record<string, any>,
  existing?: Partial<BannerRecord> | null
): ValidatedBannerWritePayload {
  const rawPageType = body.pageType !== undefined ? body.pageType : existing?.pageType;
  const rawPageId = body.pageId !== undefined ? body.pageId : existing?.pageId;
  const { pageType, pageId } = validatePageTargeting(rawPageType, rawPageId);

  const rawPlacement = body.placement !== undefined ? body.placement : existing?.placement ?? 'hero';
  const placement = String(rawPlacement || 'hero').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,64}$/.test(placement)) {
    throw new BannerHttpError(400, 'placement must be 2–64 alphanumeric/underscore characters', 'INVALID_PLACEMENT');
  }

  const rawTitle = body.title !== undefined ? body.title : existing?.title ?? '';
  if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
    throw new BannerHttpError(400, 'Banner title is required', 'TITLE_REQUIRED');
  }
  const title = rawTitle.trim();
  if (title.length > 160) {
    throw new BannerHttpError(400, 'Banner title cannot exceed 160 characters', 'TITLE_TOO_LONG');
  }

  const rawSubtitle = body.subtitle !== undefined ? body.subtitle : existing?.subtitle ?? '';
  const subtitle = typeof rawSubtitle === 'string' ? rawSubtitle.trim().slice(0, 320) : '';

  const rawMediaType = body.mediaType !== undefined ? body.mediaType : existing?.mediaType ?? 'video';
  if (!VALID_BANNER_MEDIA_TYPES.includes(rawMediaType as BannerMediaType)) {
    throw new BannerHttpError(400, 'mediaType must be "video" or "image"', 'INVALID_MEDIA_TYPE');
  }
  const mediaType = rawMediaType as BannerMediaType;

  const rawSortOrder = body.sortOrder !== undefined ? body.sortOrder : existing?.sortOrder ?? 1;
  const sortOrder = Number(rawSortOrder);
  if (!Number.isFinite(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    throw new BannerHttpError(400, 'sortOrder must be a number between 0 and 9999', 'INVALID_SORT_ORDER');
  }

  const isActive =
    body.isActive !== undefined
      ? body.isActive === true || String(body.isActive).toLowerCase() === 'true'
      : existing?.isActive ?? true;

  const carouselEnabled =
    body.carouselEnabled !== undefined
      ? body.carouselEnabled === true || String(body.carouselEnabled).toLowerCase() === 'true'
      : existing?.carouselEnabled ?? false;

  const slideDurationSec = sanitizeSlideDurationSec(
    body.slideDurationSec !== undefined ? body.slideDurationSec : existing?.slideDurationSec,
    DEFAULT_SLIDE_DURATION_SEC
  );

  const slides =
    body.slides !== undefined
      ? sanitizeSlidesInput(body.slides, slideDurationSec)
      : existing?.slides ?? [];

  const autoplay =
    body.autoplay !== undefined
      ? body.autoplay === true || String(body.autoplay).toLowerCase() === 'true'
      : existing?.autoplay ?? true;

  const loop =
    body.loop !== undefined
      ? body.loop === true || String(body.loop).toLowerCase() === 'true'
      : existing?.loop ?? true;

  const primaryKind = mediaType === 'video' ? 'video' : 'image';
  const mobile =
    body.mobile !== undefined
      ? sanitizeAssetMetadataInput(body.mobile, 'mobile', primaryKind)
      : existing?.mobile ?? null;
  const desktop =
    body.desktop !== undefined
      ? sanitizeAssetMetadataInput(body.desktop, 'desktop', primaryKind)
      : existing?.desktop ?? null;
  const mobilePoster =
    body.mobilePoster !== undefined
      ? sanitizeAssetMetadataInput(body.mobilePoster, 'mobilePoster', 'image')
      : existing?.mobilePoster ?? null;
  const desktopPoster =
    body.desktopPoster !== undefined
      ? sanitizeAssetMetadataInput(body.desktopPoster, 'desktopPoster', 'image')
      : existing?.desktopPoster ?? null;

  let cta: BannerCTA | null = null;
  const rawCta = body.cta !== undefined ? body.cta : existing?.cta;
  if (rawCta && typeof rawCta === 'object') {
    const label = String(rawCta.label || '').trim().slice(0, 60);
    const routeInput = String(rawCta.route || '').trim();
    if (label || routeInput) {
      const validatedRoute = validateInternalBannerRoute(routeInput, false);
      cta = {
        label: label || 'Explore Now',
        route: validatedRoute,
      };
    }
  }

  let placementSpec: BannerPlacementSpec | null = null;
  const rawSpec = body.placementSpec !== undefined ? body.placementSpec : existing?.placementSpec;
  if (rawSpec && typeof rawSpec === 'object') {
    placementSpec = {
      desktopAspectRatio: rawSpec.desktopAspectRatio ? String(rawSpec.desktopAspectRatio).trim().slice(0, 20) : undefined,
      mobileAspectRatio: rawSpec.mobileAspectRatio ? String(rawSpec.mobileAspectRatio).trim().slice(0, 20) : undefined,
      maxVideoSizeMb: Number.isFinite(Number(rawSpec.maxVideoSizeMb)) ? Number(rawSpec.maxVideoSizeMb) : undefined,
      maxImageSizeMb: Number.isFinite(Number(rawSpec.maxImageSizeMb)) ? Number(rawSpec.maxImageSizeMb) : undefined,
    };
  }

  const startsAt =
    body.startsAt !== undefined
      ? parseOptionalTimestamp(body.startsAt, 'startsAt')
      : parseOptionalTimestamp(existing?.startsAt, 'startsAt');
  const endsAt =
    body.endsAt !== undefined
      ? parseOptionalTimestamp(body.endsAt, 'endsAt')
      : parseOptionalTimestamp(existing?.endsAt, 'endsAt');

  if (startsAt && endsAt && startsAt.toMillis() > endsAt.toMillis()) {
    throw new BannerHttpError(400, 'startsAt cannot be later than endsAt', 'INVALID_SCHEDULE_WINDOW');
  }

  return {
    pageType,
    pageId,
    placement,
    title,
    subtitle,
    mediaType,
    sortOrder: Math.round(sortOrder),
    isActive,
    carouselEnabled: carouselEnabled || slides.length > 0,
    slideDurationSec,
    slides,
    mobile,
    desktop,
    mobilePoster,
    desktopPoster,
    cta,
    autoplay,
    loop,
    placementSpec,
    startsAt,
    endsAt,
  };
}

export function normalizeBannerDoc(id: string, data: Record<string, any>): BannerRecord {
  const slideDurationSec =
    Number.isFinite(Number(data.slideDurationSec)) && Number(data.slideDurationSec) >= MIN_SLIDE_DURATION_SEC
      ? Number(data.slideDurationSec)
      : DEFAULT_SLIDE_DURATION_SEC;
  const slides: BannerSlideItem[] = Array.isArray(data.slides)
    ? data.slides.map((s: any, idx: number) => ({
        id: String(s?.id || `slide_${idx + 1}`),
        mediaType: s?.mediaType === 'image' ? 'image' : 'video',
        title: s?.title ? String(s.title) : undefined,
        subtitle: s?.subtitle ? String(s.subtitle) : undefined,
        sortOrder: Number.isFinite(Number(s?.sortOrder)) ? Number(s.sortOrder) : idx + 1,
        slideDurationSec: Number.isFinite(Number(s?.slideDurationSec)) ? Number(s.slideDurationSec) : slideDurationSec,
        desktop: s?.desktop || null,
        mobile: s?.mobile || null,
        desktopPoster: s?.desktopPoster || null,
        mobilePoster: s?.mobilePoster || null,
        cta: s?.cta && s.cta.route ? { label: String(s.cta.label || 'Shop Now'), route: String(s.cta.route) } : null,
      }))
    : [];

  return {
    id,
    pageType: VALID_BANNER_PAGE_TYPES.includes(data.pageType) ? data.pageType : 'home',
    pageId: data.pageId !== undefined && data.pageId !== null && String(data.pageId).trim() !== '' ? String(data.pageId).trim() : null,
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
    cta: data.cta && data.cta.route ? { label: String(data.cta.label || 'Shop Now'), route: String(data.cta.route) } : null,
    autoplay: data.autoplay !== false,
    loop: data.loop !== false,
    placementSpec: data.placementSpec || null,
    startsAt: timestampToIso(data.startsAt),
    endsAt: timestampToIso(data.endsAt),
    createdAt: timestampToIso(data.createdAt) || new Date(0).toISOString(),
    updatedAt: timestampToIso(data.updatedAt) || new Date(0).toISOString(),
    createdBy: String(data.createdBy || 'system'),
    updatedBy: String(data.updatedBy || 'system'),
  };
}

export function isBannerCurrentlyScheduled(banner: BannerRecord, nowMs = Date.now()): boolean {
  if (!banner.isActive) return false;
  if (banner.startsAt) {
    const startMs = Date.parse(banner.startsAt);
    if (!Number.isNaN(startMs) && startMs > nowMs) return false;
  }
  if (banner.endsAt) {
    const endMs = Date.parse(banner.endsAt);
    if (!Number.isNaN(endMs) && endMs < nowMs) return false;
  }
  return true;
}

export function getBannerLifecycleStatus(
  banner: BannerRecord,
  nowMs = Date.now()
): 'active' | 'scheduled' | 'expired' | 'disabled' {
  if (!banner.isActive) return 'disabled';
  if (banner.startsAt) {
    const startMs = Date.parse(banner.startsAt);
    if (!Number.isNaN(startMs) && startMs > nowMs) return 'scheduled';
  }
  if (banner.endsAt) {
    const endMs = Date.parse(banner.endsAt);
    if (!Number.isNaN(endMs) && endMs < nowMs) return 'expired';
  }
  return 'active';
}

export function compareBannersBySortAndCreated(a: BannerRecord, b: BannerRecord): number {
  const sortDiff = (a.sortOrder ?? 1) - (b.sortOrder ?? 1);
  if (sortDiff !== 0) return sortDiff;
  const aTime = Date.parse(a.createdAt || '') || 0;
  const bTime = Date.parse(b.createdAt || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return a.id.localeCompare(b.id);
}

/**
 * Deterministic public banner resolver (Section 3 & Section 6):
 * 1. Filters to active & currently scheduled banners matching `pageType` and `placement`.
 * 2. Precedence:
 *    - When `pageId` is provided: exact `pageId` matches take precedence. If exact matches exist,
 *      returns exact matches (or exact matches followed by generic fallback when `includeFallback=true`).
 *      If no exact matches exist, falls back to page-level generic banners (`pageId === null`).
 *    - When `pageId` is omitted/null: returns page-level generic banners (`pageId === null`).
 * 3. Sorts by `sortOrder` ascending, then `createdAt` ascending.
 * 4. Maps to minimal client-safe `PublicBannerDeliveryItem` objects.
 */
export function resolvePublicBanners(
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
    if (!isBannerCurrentlyScheduled(b, nowMs)) return false;
    // Must have at least one deliverable asset URL or slide with asset URL
    const hasPrimaryAsset = Boolean(
      b.desktop?.url || b.mobile?.url || b.desktopPoster?.url || b.mobilePoster?.url
    );
    const hasSlideAsset = Array.isArray(b.slides) && b.slides.some((s) => Boolean(s.desktop?.url || s.mobile?.url));
    return hasPrimaryAsset || hasSlideAsset;
  });

  const exactMatches = requestedPageId
    ? eligible
        .filter((b) => b.pageId !== null && b.pageId.toLowerCase() === requestedPageId.toLowerCase())
        .sort(compareBannersBySortAndCreated)
    : [];

  const genericFallbacks = eligible
    .filter((b) => b.pageId === null)
    .sort(compareBannersBySortAndCreated);

  let selected: BannerRecord[] = [];
  let matchedScope: 'exact_page_id' | 'page_generic_fallback' | 'none' = 'none';

  if (requestedPageId && exactMatches.length > 0) {
    matchedScope = 'exact_page_id';
    selected = query.includeFallback ? [...exactMatches, ...genericFallbacks] : exactMatches;
  } else if (genericFallbacks.length > 0) {
    matchedScope = 'page_generic_fallback';
    selected = genericFallbacks;
  }

  const publicItems: PublicBannerDeliveryItem[] = selected.map(toPublicBannerDeliveryItem);
  const carouselEnabled = publicItems.some((item) => item.carouselEnabled === true);
  // Default to one hero banner unless carousel behavior is enabled
  const effectiveBanners = carouselEnabled ? publicItems : publicItems.slice(0, 1);

  return {
    banners: publicItems,
    effectiveBanners,
    carouselEnabled,
    matchedScope,
  };
}

export function toPublicBannerDeliveryItem(banner: BannerRecord): PublicBannerDeliveryItem {
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
    Number.isFinite(Number(banner.slideDurationSec)) && Number(banner.slideDurationSec) >= MIN_SLIDE_DURATION_SEC
      ? Number(banner.slideDurationSec)
      : DEFAULT_SLIDE_DURATION_SEC;

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
}

export function buildLegacyHomeBannerMainVideoPayload(
  allBanners: BannerRecord[],
  nowMs = Date.now()
): LegacyHomeBannerMainVideo {
  const resolved = resolvePublicBanners(allBanners, {
    pageType: 'home',
    placement: 'hero',
    nowMs,
  });
  const top = resolved.banners[0] || null;
  if (!top) {
    return {
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
      slideDurationSec: DEFAULT_SLIDE_DURATION_SEC,
      slides: [],
      updatedAt: new Date(nowMs).toISOString(),
    };
  }

  const mobileUrl = top.mobile?.url || top.desktop?.url || '';
  const desktopUrl = top.desktop?.url || top.mobile?.url || '';
  const mobilePosterUrl = top.mobilePoster?.url || top.desktopPoster?.url || '';
  const desktopPosterUrl = top.desktopPoster?.url || top.mobilePoster?.url || '';

  return {
    id: LEGACY_MAIN_VIDEO_DOC_ID,
    bannerId: top.id,
    title: top.title,
    subtitle: top.subtitle,
    mediaType: top.mediaType,
    videoUrl: desktopUrl || mobileUrl,
    mobileVideoUrl: mobileUrl,
    desktopVideoUrl: desktopUrl,
    posterUrl: desktopPosterUrl || mobilePosterUrl,
    mobilePosterUrl,
    desktopPosterUrl,
    cta: top.cta,
    isActive: true,
    autoplay: top.playback.autoplay,
    loop: top.playback.loop,
    carouselEnabled: resolved.carouselEnabled,
    slideDurationSec: top.slideDurationSec,
    slides: top.slides || [],
    updatedAt: new Date(nowMs).toISOString(),
  };
}

// ============================================================================
// Storage & Firestore Helpers
// ============================================================================

async function safeDeleteStorageObject(storage: Storage | null, storagePath?: string | null): Promise<void> {
  if (!storage || !storagePath || !storagePath.startsWith('banners/') || storagePath.includes('..')) {
    return;
  }
  try {
    const bucket = storage.bucket();
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
  } catch (err: any) {
    console.warn(`[BANNERS] Non-fatal warning deleting storage object '${storagePath}':`, err?.message || err);
  }
}

export async function syncLegacyHomeBannerMainVideo(db: Firestore): Promise<LegacyHomeBannerMainVideo> {
  const snap = await db.collection(BANNERS_COLLECTION).get();
  const allBanners = snap.docs.map((d) => normalizeBannerDoc(d.id, d.data() || {}));
  const payload = buildLegacyHomeBannerMainVideoPayload(allBanners);
  await db
    .collection(HOME_BANNERS_COLLECTION)
    .doc(LEGACY_MAIN_VIDEO_DOC_ID)
    .set(
      {
        ...payload,
        updatedAtTimestamp: Timestamp.now(),
      },
      { merge: true }
    );
  return payload;
}

async function writeBannerAuditLog(
  db: Firestore,
  action: string,
  details: string,
  actor: { uid: string; email?: string }
): Promise<void> {
  try {
    const logId = `audit_banner_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await db.collection('audit_logs').doc(logId).set({
      id: logId,
      timestamp: new Date().toISOString(),
      user: actor.email || actor.uid,
      role: 'Admin',
      action,
      details,
      status: 'success',
    });
  } catch (err) {
    console.warn('[BANNERS] Failed to write banner audit log:', err);
  }
}

// ============================================================================
// Express Route Registration
// ============================================================================

interface AuthenticatedBannerUser {
  uid: string;
  email?: string;
  admin?: boolean;
  role?: string;
}

const uploadRateBucket = new Map<string, { count: number; windowStartMs: number }>();
const UPLOAD_RATE_LIMIT_PER_MIN = Number(process.env.BANNER_UPLOAD_RATE_LIMIT_PER_MIN || 30);

export function checkBannerUploadRateLimit(uid: string, nowMs = Date.now()): boolean {
  const entry = uploadRateBucket.get(uid);
  if (!entry || nowMs - entry.windowStartMs > 60_000) {
    uploadRateBucket.set(uid, { count: 1, windowStartMs: nowMs });
    return true;
  }
  if (entry.count >= UPLOAD_RATE_LIMIT_PER_MIN) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function registerBannerManagementRoutes(params: {
  app: express.Express;
  adminDb: Firestore | null;
  adminAuth: Auth | null;
  adminStorage: Storage | null;
}): void {
  const { app, adminDb, adminAuth, adminStorage } = params;
  const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: ABSOLUTE_MAX_VIDEO_MB * 1024 * 1024 },
  });

  const requireBannerAdmin = (requiredAction: 'read' | 'create' | 'edit' | 'delete') => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!adminAuth || !adminDb) {
        return res.status(503).json({ error: 'Firebase Admin services unavailable', code: 'SERVICE_UNAVAILABLE' });
      }
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
      }
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
        if (decoded.firebase?.sign_in_provider === 'anonymous') {
          return res.status(403).json({ error: 'Anonymous users cannot manage banners', code: 'FORBIDDEN' });
        }

        let userRole = decoded.admin === true ? 'Admin' : 'Admin';
        try {
          const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
          if (userSnap.exists) {
            const uData = userSnap.data() || {};
            if (uData.role) userRole = String(uData.role);
          }
        } catch {
          // Default to authenticated non-anonymous operator if users doc not found
        }

        // Referral Team is never allowed to modify banners
        if (userRole === 'Referral Team') {
          return res.status(403).json({ error: 'Insufficient permissions for Banner Management', code: 'FORBIDDEN' });
        }
        if (
          (requiredAction === 'create' || requiredAction === 'edit' || requiredAction === 'delete') &&
          userRole !== 'Admin' &&
          userRole !== 'Marketing' &&
          decoded.admin !== true
        ) {
          return res.status(403).json({
            error: `Role '${userRole}' does not have '${requiredAction}' permission on Banner Management`,
            code: 'FORBIDDEN',
          });
        }

        (req as any).bannerUser = {
          uid: decoded.uid,
          email: decoded.email,
          admin: decoded.admin === true || userRole === 'Admin',
          role: userRole,
        } as AuthenticatedBannerUser;
        next();
      } catch {
        return res.status(401).json({ error: 'Invalid or expired authentication token', code: 'INVALID_TOKEN' });
      }
    };
  };

  // 1. GET /api/admin/banners
  const handleListAdminBanners = async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) throw new BannerHttpError(503, 'Firestore unavailable', 'DB_UNAVAILABLE');
      const snap = await adminDb.collection(BANNERS_COLLECTION).get();
      let items = snap.docs.map((d) => normalizeBannerDoc(d.id, d.data() || {}));

      const pageTypeFilter = String(req.query.pageType || '').trim().toLowerCase();
      const pageIdFilter = req.query.pageId !== undefined ? String(req.query.pageId).trim() : '';
      const placementFilter = String(req.query.placement || '').trim().toLowerCase();
      const statusFilter = String(req.query.status || '').trim().toLowerCase();
      const mediaTypeFilter = String(req.query.mediaType || '').trim().toLowerCase();
      const searchFilter = String(req.query.search || '').trim().toLowerCase();
      const nowMs = Date.now();

      if (pageTypeFilter && pageTypeFilter !== 'all') {
        items = items.filter((b) => b.pageType === pageTypeFilter);
      }
      if (pageIdFilter) {
        if (pageIdFilter === 'global' || pageIdFilter === 'null') {
          items = items.filter((b) => b.pageId === null);
        } else {
          items = items.filter((b) => (b.pageId || '').toLowerCase() === pageIdFilter.toLowerCase());
        }
      }
      if (placementFilter && placementFilter !== 'all') {
        items = items.filter((b) => b.placement.toLowerCase() === placementFilter);
      }
      if (mediaTypeFilter && mediaTypeFilter !== 'all') {
        items = items.filter((b) => b.mediaType === mediaTypeFilter);
      }
      if (statusFilter && statusFilter !== 'all') {
        items = items.filter((b) => getBannerLifecycleStatus(b, nowMs) === statusFilter);
      }
      if (searchFilter) {
        items = items.filter(
          (b) =>
            b.title.toLowerCase().includes(searchFilter) ||
            b.subtitle.toLowerCase().includes(searchFilter) ||
            (b.pageId || '').toLowerCase().includes(searchFilter) ||
            b.placement.toLowerCase().includes(searchFilter) ||
            b.id.toLowerCase().includes(searchFilter)
        );
      }

      items.sort(compareBannersBySortAndCreated);

      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
      const total = items.length;
      const startIndex = (page - 1) * limit;
      const paginated = items.slice(startIndex, startIndex + limit);

      return res.json({
        success: true,
        banners: paginated,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (err: any) {
      const status = err instanceof BannerHttpError ? err.status : 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Failed to list banners',
        code: err?.code || 'INTERNAL_ERROR',
      });
    }
  };
  app.get('/api/admin/banners', requireBannerAdmin('read'), handleListAdminBanners);
  app.get('/api/v1/admin/banners', requireBannerAdmin('read'), handleListAdminBanners);

  // 2. GET /api/admin/banners/:id
  const handleGetAdminBannerById = async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) throw new BannerHttpError(503, 'Firestore unavailable', 'DB_UNAVAILABLE');
      const id = String(req.params.id || '').trim();
      if (!isValidBannerId(id)) throw new BannerHttpError(400, 'Invalid banner ID', 'INVALID_BANNER_ID');

      const docSnap = await adminDb.collection(BANNERS_COLLECTION).doc(id).get();
      if (!docSnap.exists) {
        return res.status(404).json({ success: false, error: 'Banner not found', code: 'NOT_FOUND' });
      }
      return res.json({
        success: true,
        banner: normalizeBannerDoc(docSnap.id, docSnap.data() || {}),
      });
    } catch (err: any) {
      const status = err instanceof BannerHttpError ? err.status : 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Failed to fetch banner',
        code: err?.code || 'INTERNAL_ERROR',
      });
    }
  };
  app.get('/api/admin/banners/:id', requireBannerAdmin('read'), handleGetAdminBannerById);
  app.get('/api/v1/admin/banners/:id', requireBannerAdmin('read'), handleGetAdminBannerById);

  // 3. POST /api/admin/banners
  const handleCreateAdminBanner = async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) throw new BannerHttpError(503, 'Firestore unavailable', 'DB_UNAVAILABLE');
      const actor = (req as any).bannerUser as AuthenticatedBannerUser;
      const body = req.body || {};

      const requestedId = body.id ? String(body.id).trim() : '';
      const bannerId =
        requestedId && isValidBannerId(requestedId)
          ? requestedId
          : `bnr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const validated = validateBannerWriteInput(body, null);
      const nowTs = Timestamp.now();

      const firestoreDoc = {
        ...validated,
        createdAt: nowTs,
        updatedAt: nowTs,
        createdBy: actor.uid,
        updatedBy: actor.uid,
      };

      await adminDb.collection(BANNERS_COLLECTION).doc(bannerId).set(firestoreDoc);
      if (validated.pageType === 'home' && validated.placement === 'hero') {
        await syncLegacyHomeBannerMainVideo(adminDb);
      }
      await writeBannerAuditLog(
        adminDb,
        'BANNER_CREATED',
        `Created ${validated.mediaType} banner '${validated.title}' (${bannerId}) for ${validated.pageType}/${validated.pageId || 'global'} [${validated.placement}]`,
        actor
      );

      const created = normalizeBannerDoc(bannerId, firestoreDoc);
      return res.status(201).json({ success: true, banner: created });
    } catch (err: any) {
      const status = err instanceof BannerHttpError ? err.status : 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Failed to create banner',
        code: err?.code || 'INTERNAL_ERROR',
      });
    }
  };
  app.post('/api/admin/banners', requireBannerAdmin('create'), handleCreateAdminBanner);
  app.post('/api/v1/admin/banners', requireBannerAdmin('create'), handleCreateAdminBanner);

  // 4. PATCH /api/admin/banners/:id
  const handleUpdateAdminBanner = async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) throw new BannerHttpError(503, 'Firestore unavailable', 'DB_UNAVAILABLE');
      const actor = (req as any).bannerUser as AuthenticatedBannerUser;
      const bannerId = String(req.params.id || '').trim();
      if (!isValidBannerId(bannerId)) throw new BannerHttpError(400, 'Invalid banner ID', 'INVALID_BANNER_ID');

      const docRef = adminDb.collection(BANNERS_COLLECTION).doc(bannerId);
      const existingSnap = await docRef.get();
      if (!existingSnap.exists) {
        return res.status(404).json({ success: false, error: 'Banner not found', code: 'NOT_FOUND' });
      }
      const existingData = existingSnap.data() || {};
      const existingNormalized = normalizeBannerDoc(bannerId, existingData);
      const validated = validateBannerWriteInput(req.body || {}, existingNormalized);

      // Clean up replaced storage objects if metadata paths changed
      for (const variant of VALID_BANNER_ASSET_VARIANTS) {
        const oldPath = existingNormalized[variant]?.storagePath;
        const newPath = validated[variant]?.storagePath;
        if (oldPath && oldPath !== newPath) {
          await safeDeleteStorageObject(adminStorage, oldPath);
        }
      }

      const nowTs = Timestamp.now();
      const updatePayload = {
        ...validated,
        updatedAt: nowTs,
        updatedBy: actor.uid,
      };
      await docRef.set(updatePayload, { merge: true });

      if (
        existingNormalized.pageType === 'home' ||
        validated.pageType === 'home'
      ) {
        await syncLegacyHomeBannerMainVideo(adminDb);
      }

      await writeBannerAuditLog(
        adminDb,
        'BANNER_UPDATED',
        `Updated banner '${validated.title}' (${bannerId}) for ${validated.pageType}/${validated.pageId || 'global'}`,
        actor
      );

      const updatedSnap = await docRef.get();
      return res.json({
        success: true,
        banner: normalizeBannerDoc(bannerId, updatedSnap.data() || {}),
      });
    } catch (err: any) {
      const status = err instanceof BannerHttpError ? err.status : 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Failed to update banner',
        code: err?.code || 'INTERNAL_ERROR',
      });
    }
  };
  app.patch('/api/admin/banners/:id', requireBannerAdmin('edit'), handleUpdateAdminBanner);
  app.patch('/api/v1/admin/banners/:id', requireBannerAdmin('edit'), handleUpdateAdminBanner);

  // 5. DELETE /api/admin/banners/:id
  const handleDeleteAdminBanner = async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) throw new BannerHttpError(503, 'Firestore unavailable', 'DB_UNAVAILABLE');
      const actor = (req as any).bannerUser as AuthenticatedBannerUser;
      const bannerId = String(req.params.id || '').trim();
      if (!isValidBannerId(bannerId)) throw new BannerHttpError(400, 'Invalid banner ID', 'INVALID_BANNER_ID');

      const docRef = adminDb.collection(BANNERS_COLLECTION).doc(bannerId);
      const snap = await docRef.get();
      if (!snap.exists) {
        return res.status(404).json({ success: false, error: 'Banner not found', code: 'NOT_FOUND' });
      }
      const banner = normalizeBannerDoc(bannerId, snap.data() || {});

      // Delete all associated Storage assets to prevent orphaned files
      const deletedPaths: string[] = [];
      for (const variant of VALID_BANNER_ASSET_VARIANTS) {
        const storagePath = banner[variant]?.storagePath;
        if (storagePath) {
          await safeDeleteStorageObject(adminStorage, storagePath);
          deletedPaths.push(storagePath);
        }
      }

      await docRef.delete();
      if (banner.pageType === 'home') {
        await syncLegacyHomeBannerMainVideo(adminDb);
      }

      await writeBannerAuditLog(
        adminDb,
        'BANNER_DELETED',
        `Deleted banner '${banner.title}' (${bannerId}) and cleaned ${deletedPaths.length} storage asset(s)`,
        actor
      );

      return res.json({
        success: true,
        deletedId: bannerId,
        cleanedStoragePaths: deletedPaths,
      });
    } catch (err: any) {
      const status = err instanceof BannerHttpError ? err.status : 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Failed to delete banner',
        code: err?.code || 'INTERNAL_ERROR',
      });
    }
  };
  app.delete('/api/admin/banners/:id', requireBannerAdmin('delete'), handleDeleteAdminBanner);
  app.delete('/api/v1/admin/banners/:id', requireBannerAdmin('delete'), handleDeleteAdminBanner);

  // 6. POST /api/admin/banners/:id/assets (Multipart upload with binary magic-byte inspection & orphan cleanup)
  const handleUploadBannerAsset = async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb || !adminStorage) {
        throw new BannerHttpError(503, 'Firebase Storage or Firestore unavailable', 'SERVICE_UNAVAILABLE');
      }
      const actor = (req as any).bannerUser as AuthenticatedBannerUser;
      if (!checkBannerUploadRateLimit(actor.uid)) {
        return res.status(429).json({
          success: false,
          error: 'Upload rate limit exceeded. Please wait a minute before uploading more banner assets.',
          code: 'RATE_LIMITED',
        });
      }

      const bannerId = String(req.params.id || '').trim();
      if (!isValidBannerId(bannerId)) throw new BannerHttpError(400, 'Invalid banner ID', 'INVALID_BANNER_ID');

      const variant = String(req.body?.variant || '').trim() as BannerAssetVariant;
      if (!VALID_BANNER_ASSET_VARIANTS.includes(variant)) {
        throw new BannerHttpError(
          400,
          `variant must be one of: ${VALID_BANNER_ASSET_VARIANTS.join(', ')}`,
          'INVALID_VARIANT'
        );
      }

      const file = req.file;
      if (!file || !file.buffer) {
        throw new BannerHttpError(400, 'Missing binary file in multipart request', 'FILE_REQUIRED');
      }

      const docRef = adminDb.collection(BANNERS_COLLECTION).doc(bannerId);
      const snap = await docRef.get();
      if (!snap.exists) {
        return res.status(404).json({ success: false, error: 'Banner not found', code: 'NOT_FOUND' });
      }
      const banner = normalizeBannerDoc(bannerId, snap.data() || {});

      const verified = validateBannerAssetUpload({
        buffer: file.buffer,
        declaredMimeType: file.mimetype,
        variant,
        bannerMediaType: banner.mediaType,
        placementSpec: banner.placementSpec,
      });

      const safeFileName = sanitizeAssetFilename(file.originalname, verified.canonicalExt);
      const storagePath = buildBannerStoragePath({
        pageType: banner.pageType,
        pageId: banner.pageId,
        bannerId,
        variant,
        fileName: safeFileName,
      });

      const uploaded = await uploadBufferToFirebaseStorage({
        storage: adminStorage,
        buffer: file.buffer,
        storagePath,
        contentType: verified.mimeType,
      });

      const previousPath = banner[variant]?.storagePath;
      if (previousPath && previousPath !== uploaded.storagePath) {
        await safeDeleteStorageObject(adminStorage, previousPath);
      }

      const width = verified.width || (Number.isFinite(Number(req.body?.width)) ? Number(req.body.width) : undefined);
      const height = verified.height || (Number.isFinite(Number(req.body?.height)) ? Number(req.body.height) : undefined);
      const durationSec = Number.isFinite(Number(req.body?.durationSec)) ? Number(req.body.durationSec) : undefined;

      const assetMeta: BannerAssetMetadata = {
        storagePath: uploaded.storagePath,
        url: uploaded.downloadUrl,
        mimeType: verified.mimeType,
        fileName: safeFileName,
        sizeBytes: verified.sizeBytes,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(durationSec ? { durationSec } : {}),
      };

      await docRef.set(
        {
          [variant]: assetMeta,
          updatedAt: Timestamp.now(),
          updatedBy: actor.uid,
        },
        { merge: true }
      );

      if (banner.pageType === 'home') {
        await syncLegacyHomeBannerMainVideo(adminDb);
      }

      await writeBannerAuditLog(
        adminDb,
        'BANNER_ASSET_UPLOADED',
        `Uploaded ${variant} (${verified.mimeType}, ${(verified.sizeBytes / 1024).toFixed(1)} KB) for banner '${banner.title}' (${bannerId})`,
        actor
      );

      const updatedSnap = await docRef.get();
      return res.json({
        success: true,
        variant,
        asset: assetMeta,
        banner: normalizeBannerDoc(bannerId, updatedSnap.data() || {}),
      });
    } catch (err: any) {
      const status = err instanceof BannerHttpError ? err.status : 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Failed to upload banner asset',
        code: err?.code || 'INTERNAL_ERROR',
      });
    }
  };
  app.post(
    '/api/admin/banners/:id/assets',
    requireBannerAdmin('edit'),
    uploadMiddleware.single('file'),
    handleUploadBannerAsset
  );
  app.post(
    '/api/v1/admin/banners/:id/assets',
    requireBannerAdmin('edit'),
    uploadMiddleware.single('file'),
    handleUploadBannerAsset
  );

  // 7. DELETE /api/admin/banners/:id/assets/:variant
  const handleDeleteBannerAsset = async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) throw new BannerHttpError(503, 'Firestore unavailable', 'DB_UNAVAILABLE');
      const actor = (req as any).bannerUser as AuthenticatedBannerUser;
      const bannerId = String(req.params.id || '').trim();
      const variant = String(req.params.variant || '').trim() as BannerAssetVariant;
      if (!isValidBannerId(bannerId)) throw new BannerHttpError(400, 'Invalid banner ID', 'INVALID_BANNER_ID');
      if (!VALID_BANNER_ASSET_VARIANTS.includes(variant)) {
        throw new BannerHttpError(
          400,
          `variant must be one of: ${VALID_BANNER_ASSET_VARIANTS.join(', ')}`,
          'INVALID_VARIANT'
        );
      }

      const docRef = adminDb.collection(BANNERS_COLLECTION).doc(bannerId);
      const snap = await docRef.get();
      if (!snap.exists) {
        return res.status(404).json({ success: false, error: 'Banner not found', code: 'NOT_FOUND' });
      }
      const banner = normalizeBannerDoc(bannerId, snap.data() || {});
      const oldPath = banner[variant]?.storagePath;
      if (oldPath) {
        await safeDeleteStorageObject(adminStorage, oldPath);
      }

      await docRef.set(
        {
          [variant]: null,
          updatedAt: Timestamp.now(),
          updatedBy: actor.uid,
        },
        { merge: true }
      );

      if (banner.pageType === 'home') {
        await syncLegacyHomeBannerMainVideo(adminDb);
      }

      await writeBannerAuditLog(
        adminDb,
        'BANNER_ASSET_DELETED',
        `Removed ${variant} asset from banner '${banner.title}' (${bannerId})`,
        actor
      );

      const updatedSnap = await docRef.get();
      return res.json({
        success: true,
        variant,
        cleanedStoragePath: oldPath || null,
        banner: normalizeBannerDoc(bannerId, updatedSnap.data() || {}),
      });
    } catch (err: any) {
      const status = err instanceof BannerHttpError ? err.status : 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Failed to delete banner asset',
        code: err?.code || 'INTERNAL_ERROR',
      });
    }
  };
  app.delete('/api/admin/banners/:id/assets/:variant', requireBannerAdmin('edit'), handleDeleteBannerAsset);
  app.delete('/api/v1/admin/banners/:id/assets/:variant', requireBannerAdmin('edit'), handleDeleteBannerAsset);

  // 8. GET /api/public/banners?pageType=home&pageId=&placement=hero
  const handleGetPublicBanners = async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) throw new BannerHttpError(503, 'Firestore unavailable', 'DB_UNAVAILABLE');
      const rawPageType = String(req.query.pageType || 'home').trim().toLowerCase();
      if (!VALID_BANNER_PAGE_TYPES.includes(rawPageType as BannerPageType)) {
        throw new BannerHttpError(
          400,
          `pageType must be one of: ${VALID_BANNER_PAGE_TYPES.join(', ')}`,
          'INVALID_PAGE_TYPE'
        );
      }
      const pageType = rawPageType as BannerPageType;
      const pageId = req.query.pageId !== undefined ? String(req.query.pageId).trim() : null;
      const placement = String(req.query.placement || 'hero').trim().toLowerCase();
      const includeFallback = String(req.query.includeFallback || '').toLowerCase() === 'true';

      const snap = await adminDb.collection(BANNERS_COLLECTION).get();
      const allBanners = snap.docs.map((d) => normalizeBannerDoc(d.id, d.data() || {}));

      const resolved = resolvePublicBanners(allBanners, {
        pageType,
        pageId,
        placement,
        includeFallback,
      });

      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      return res.json({
        success: true,
        pageType,
        pageId: pageId || null,
        placement,
        matchedScope: resolved.matchedScope,
        carouselEnabled: resolved.carouselEnabled,
        banners: resolved.banners,
        effectiveBanners: resolved.effectiveBanners,
      });
    } catch (err: any) {
      const status = err instanceof BannerHttpError ? err.status : 500;
      return res.status(status).json({
        success: false,
        error: err?.message || 'Failed to resolve public banners',
        code: err?.code || 'INTERNAL_ERROR',
      });
    }
  };
  app.get('/api/public/banners', handleGetPublicBanners);
  app.get('/api/v1/public/banners', handleGetPublicBanners);
}
