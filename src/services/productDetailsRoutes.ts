/**
 * Product Details API (`product_details/{productId}`).
 *
 * One-to-one extension of a `products` document. The `products` schema is never
 * modified here. All writes go through the existing Firebase Admin connection,
 * and all images go through the existing Firebase Storage bucket.
 */
import type express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';

export const PRODUCT_DETAILS_COLLECTION = 'product_details';

export const PRODUCT_DETAILS_TEXT_FIELDS: Record<string, number> = {
  whyShopFromLeafyearth: 5000,
  idealForMaking: 5000,
  shelfLife: 200,
  fssaiNumber: 50,
  marketedManufacturedBy: 2000,
  allergenInformation: 2000,
  storageConditions: 2000,
};

const IMAGE_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
export const MAX_PRODUCT_DETAILS_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CERTIFICATES = 50;
const MAX_IMAGES = 30;
const SUB_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNED_URL_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000; // matches existing product image convention

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR') {
    super(message);
  }
}

interface DetailsUser { uid: string; email?: string }

export interface Certification {
  certificateId: string;
  certificateName: string;
  certificateNumber: string;
  issuingAuthority: string;
  certificateImageUrl: string;
  certificateStoragePath: string;
  validFrom: string;
  validUntil: string;
  displayOrder: number;
  isActive: boolean;
}

export interface ProductImage {
  imageId: string;
  imageUrl: string;
  storagePath: string;
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  displayOrder: number;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Pure validation helpers (exported for unit tests)
// ---------------------------------------------------------------------------

export function isValidProductId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const v = id.trim();
  return v.length > 0 && v.length <= 200 && v === id && !v.includes('/') && v !== '.' && v !== '..' && !/^__.*__$/.test(v);
}

export function isValidSubId(id: unknown): id is string {
  return typeof id === 'string' && SUB_ID_RE.test(id);
}

export function generateSubId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

export function validateTextFields(body: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, max] of Object.entries(PRODUCT_DETAILS_TEXT_FIELDS)) {
    const raw = body?.[field];
    if (raw === undefined || raw === null) { out[field] = ''; continue; }
    if (typeof raw !== 'string') throw new HttpError(400, `${field} must be a string`, 'VALIDATION');
    if (raw.trim().toLowerCase().startsWith('data:')) throw new HttpError(400, `${field} must not contain embedded media`, 'VALIDATION');
    const value = raw.trim();
    if (value.length > max) throw new HttpError(400, `${field} exceeds ${max} characters`, 'VALIDATION');
    out[field] = value;
  }
  return out;
}

function optionalString(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`, 'VALIDATION');
  const v = value.trim();
  if (v.length > max) throw new HttpError(400, `${field} exceeds ${max} characters`, 'VALIDATION');
  return v;
}

function optionalDate(value: unknown, field: string): string {
  const v = optionalString(value, field, 10);
  if (!v) return '';
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new HttpError(400, `${field} must be a valid date (YYYY-MM-DD)`, 'VALIDATION');
  }
  return v;
}

/**
 * Validates client certification metadata. Image fields are NEVER accepted from the
 * client; they are carried over from the stored record (server-managed via uploads).
 */
export function sanitizeCertifications(input: unknown, existing: Certification[] = []): Certification[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new HttpError(400, 'certifications must be an array', 'VALIDATION');
  if (input.length > MAX_CERTIFICATES) throw new HttpError(400, `A maximum of ${MAX_CERTIFICATES} certifications is allowed`, 'VALIDATION');
  const byId = new Map(existing.map(c => [c.certificateId, c]));
  const seen = new Set<string>();
  return input.map((raw: any, index: number) => {
    if (!raw || typeof raw !== 'object') throw new HttpError(400, `certifications[${index}] is invalid`, 'VALIDATION');
    const certificateId = raw.certificateId;
    if (!isValidSubId(certificateId)) throw new HttpError(400, `certifications[${index}].certificateId is invalid`, 'VALIDATION');
    if (seen.has(certificateId)) throw new HttpError(400, `Duplicate certificateId '${certificateId}'`, 'DUPLICATE_CERTIFICATE');
    seen.add(certificateId);
    const certificateName = optionalString(raw.certificateName, `certifications[${index}].certificateName`, 200);
    if (!certificateName) throw new HttpError(400, `certifications[${index}].certificateName is required`, 'VALIDATION');
    const validFrom = optionalDate(raw.validFrom, `certifications[${index}].validFrom`);
    const validUntil = optionalDate(raw.validUntil, `certifications[${index}].validUntil`);
    if (validFrom && validUntil && validFrom > validUntil) {
      throw new HttpError(400, `certifications[${index}]: validFrom must be on or before validUntil`, 'VALIDATION');
    }
    const prev = byId.get(certificateId);
    return {
      certificateId,
      certificateName,
      certificateNumber: optionalString(raw.certificateNumber, `certifications[${index}].certificateNumber`, 100),
      issuingAuthority: optionalString(raw.issuingAuthority, `certifications[${index}].issuingAuthority`, 200),
      certificateImageUrl: prev?.certificateImageUrl || '',
      certificateStoragePath: prev?.certificateStoragePath || '',
      validFrom,
      validUntil,
      displayOrder: index,
      isActive: raw.isActive !== false,
    };
  });
}

/** Reorders/toggles stored images by client-supplied order. Unknown IDs are rejected. */
export function applyImageOrder(input: unknown, existing: ProductImage[]): ProductImage[] {
  if (input === undefined || input === null) return existing;
  if (!Array.isArray(input)) throw new HttpError(400, 'productImageUrls must be an array', 'VALIDATION');
  const byId = new Map(existing.map(i => [i.imageId, i]));
  const seen = new Set<string>();
  return input.map((raw: any, index: number) => {
    const imageId = raw?.imageId;
    if (!isValidSubId(imageId)) throw new HttpError(400, `productImageUrls[${index}].imageId is invalid`, 'VALIDATION');
    if (seen.has(imageId)) throw new HttpError(400, `Duplicate imageId '${imageId}'`, 'VALIDATION');
    seen.add(imageId);
    const prev = byId.get(imageId);
    if (!prev) throw new HttpError(400, `Image '${imageId}' does not exist; upload it first`, 'VALIDATION');
    return { ...prev, displayOrder: index, isActive: raw.isActive !== false };
  });
}

export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export function validateImageFile(file: { mimetype: string; size: number; buffer: Buffer } | undefined) {
  if (!file) throw new HttpError(400, 'Missing image file (field "file")', 'VALIDATION');
  if (!IMAGE_TYPES.has(file.mimetype)) throw new HttpError(415, 'Only JPEG, PNG and WebP images are allowed', 'UNSUPPORTED_TYPE');
  if (file.size > MAX_PRODUCT_DETAILS_IMAGE_BYTES) throw new HttpError(413, 'Image exceeds the 10MB limit', 'FILE_TOO_LARGE');
  if (detectImageMime(file.buffer) !== file.mimetype) throw new HttpError(415, 'File content does not match its declared image type', 'UNSUPPORTED_TYPE');
}

export function collectReferencedPaths(data: DocumentData | undefined): Set<string> {
  const paths = new Set<string>();
  for (const c of (data?.certifications || []) as Certification[]) if (c?.certificateStoragePath) paths.add(c.certificateStoragePath);
  for (const i of (data?.productImageUrls || []) as ProductImage[]) if (i?.storagePath) paths.add(i.storagePath);
  return paths;
}

function serialize(id: string, data: DocumentData) {
  const ts = (v: any) => (v instanceof Timestamp ? v.toDate().toISOString() : v ?? null);
  return {
    ...data,
    productId: data.productId || id,
    certifications: [...(data.certifications || [])].sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    productImageUrls: [...(data.productImageUrls || [])].sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export interface ProductDetailsDeps {
  db: Firestore;
  auth: Auth;
  storage: Storage;
}

export function registerProductDetailsRoutes(app: express.Express, deps: ProductDetailsDeps) {
  const { db, auth, storage } = deps;
  const col = () => db.collection(PRODUCT_DETAILS_COLLECTION);
  const uploader = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PRODUCT_DETAILS_IMAGE_BYTES, files: 1 } });

  const send = (res: express.Response, error: any, fallback: string) => {
    if (error instanceof HttpError) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    console.error(`[PRODUCT-DETAILS] ${fallback}:`, error);
    return res.status(500).json({ success: false, error: error?.message || fallback, code: 'SERVER_ERROR' });
  };

  /** Administrator gate: verified, non-anonymous Firebase identity (admin-panel accounts). */
  const requireAdmin: express.RequestHandler = async (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
    try {
      const decoded = await auth.verifyIdToken(header.slice(7));
      const provider = (decoded as any).firebase?.sign_in_provider;
      if (provider === 'anonymous' || decoded.admin === false) {
        return res.status(403).json({ success: false, error: 'Administrator access required', code: 'FORBIDDEN' });
      }
      (req as any).detailsUser = { uid: decoded.uid, email: decoded.email } as DetailsUser;
      next();
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid authentication token', code: 'UNAUTHENTICATED' });
    }
  };

  const singleFile: express.RequestHandler = (req, res, next) => {
    uploader.single('file')(req, res, (err: any) => {
      if (!err) return next();
      if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: 'Image exceeds the 10MB limit', code: 'FILE_TOO_LARGE' });
      return res.status(400).json({ success: false, error: err?.message || 'Invalid upload', code: 'VALIDATION' });
    });
  };

  const userOf = (req: express.Request): DetailsUser => (req as any).detailsUser;

  const requireProductId = (raw: unknown): string => {
    if (!isValidProductId(raw)) throw new HttpError(400, 'Invalid productId', 'VALIDATION');
    return raw;
  };

  const assertProductExists = async (productId: string) => {
    const snap = await db.collection('products').doc(productId).get();
    if (!snap.exists) throw new HttpError(404, `Product '${productId}' does not exist`, 'PRODUCT_NOT_FOUND');
  };

  const deleteStorageObjects = async (productId: string, paths: Iterable<string>) => {
    const prefix = `${PRODUCT_DETAILS_COLLECTION}/${productId}/`;
    for (const p of paths) {
      if (!p || !p.startsWith(prefix) || p.includes('..')) continue; // never touch files outside this product's folder
      try {
        await storage.bucket().file(p).delete({ ignoreNotFound: true });
      } catch (err) {
        console.warn(`[PRODUCT-DETAILS] Could not delete orphaned Storage object ${p}:`, err);
      }
    }
  };

  const uploadImage = async (storagePath: string, file: Express.Multer.File) => {
    const ref = storage.bucket().file(storagePath);
    await ref.save(file.buffer, { metadata: { contentType: file.mimetype }, resumable: false });
    const [url] = await ref.getSignedUrl({ action: 'read', expires: new Date(Date.now() + SIGNED_URL_TTL_MS) });
    return url;
  };

  const uniqueFileName = (mime: string) => `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${IMAGE_TYPES.get(mime)}`;

  // GET — public read (product page) and admin form load.
  app.get('/api/product-details/:productId', async (req, res) => {
    try {
      const productId = requireProductId(req.params.productId);
      const snap = await col().doc(productId).get();
      if (!snap.exists) return res.status(404).json({ success: false, notFound: true, error: 'No product details found', code: 'NOT_FOUND' });
      return res.json({ success: true, details: serialize(snap.id, snap.data()!) });
    } catch (error) {
      return send(res, error, 'Failed to load product details');
    }
  });

  // POST — create (duplicate-safe via transactional create).
  app.post('/api/product-details', requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const productId = requireProductId(body.productId);
      const text = validateTextFields(body);
      const certifications = sanitizeCertifications(body.certifications, []);
      await assertProductExists(productId);
      const user = userOf(req);
      const ref = col().doc(productId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists) throw new HttpError(409, 'Product details already exist for this product', 'ALREADY_EXISTS');
        tx.create(ref, {
          productId,
          ...text,
          certifications,
          productImageUrls: [],
          isActive: body.isActive !== false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
        });
      });
      const saved = await ref.get();
      return res.status(201).json({ success: true, details: serialize(saved.id, saved.data()!) });
    } catch (error) {
      return send(res, error, 'Failed to create product details');
    }
  });

  // PUT — update; preserves createdAt/createdBy and server-managed image fields.
  app.put('/api/product-details/:productId', requireAdmin, async (req, res) => {
    try {
      const productId = requireProductId(req.params.productId);
      const body = req.body || {};
      if (body.productId !== undefined && body.productId !== productId) {
        throw new HttpError(400, 'productId in body does not match the URL', 'PRODUCT_ID_MISMATCH');
      }
      const text = validateTextFields(body);
      await assertProductExists(productId);
      const user = userOf(req);
      const ref = col().doc(productId);
      let orphaned: string[] = [];
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'No product details found; create them first', 'NOT_FOUND');
        const current = snap.data()!;
        const certifications = sanitizeCertifications(body.certifications, current.certifications || []);
        const productImageUrls = applyImageOrder(body.productImageUrls, current.productImageUrls || []);
        const next = { certifications, productImageUrls };
        const stillReferenced = collectReferencedPaths(next);
        orphaned = [...collectReferencedPaths(current)].filter(p => !stillReferenced.has(p));
        tx.update(ref, {
          ...text,
          certifications,
          productImageUrls,
          isActive: body.isActive === undefined ? current.isActive !== false : body.isActive !== false,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        });
      });
      await deleteStorageObjects(productId, orphaned);
      const saved = await ref.get();
      return res.json({ success: true, details: serialize(saved.id, saved.data()!) });
    } catch (error) {
      return send(res, error, 'Failed to update product details');
    }
  });

  // POST certificate image (create a certification or replace its image).
  app.post('/api/product-details/:productId/certificates', requireAdmin, singleFile, async (req, res) => {
    let uploadedPath = '';
    try {
      const productId = requireProductId(req.params.productId);
      const file = req.file;
      validateImageFile(file);
      const certificateId = req.body?.certificateId ? String(req.body.certificateId) : generateSubId('cert');
      if (!isValidSubId(certificateId)) throw new HttpError(400, 'Invalid certificateId', 'VALIDATION');
      await assertProductExists(productId);
      const ref = col().doc(productId);
      const pre = await ref.get();
      if (!pre.exists) throw new HttpError(404, 'No product details found; create them first', 'NOT_FOUND');

      uploadedPath = `${PRODUCT_DETAILS_COLLECTION}/${productId}/certificates/${certificateId}/${uniqueFileName(file!.mimetype)}`;
      const url = await uploadImage(uploadedPath, file!);
      const user = userOf(req);
      let replacedPath = '';
      let referencedAfter = new Set<string>();
      let certificate: Certification | null = null;

      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'No product details found', 'NOT_FOUND');
        const data = snap.data()!;
        const certs: Certification[] = [...(data.certifications || [])];
        const idx = certs.findIndex(c => c.certificateId === certificateId);
        if (idx >= 0) {
          replacedPath = certs[idx].certificateStoragePath || '';
          certs[idx] = { ...certs[idx], certificateImageUrl: url, certificateStoragePath: uploadedPath };
          certificate = certs[idx];
        } else {
          if (certs.length >= MAX_CERTIFICATES) throw new HttpError(400, `A maximum of ${MAX_CERTIFICATES} certifications is allowed`, 'VALIDATION');
          const [meta] = sanitizeCertifications([{ ...req.body, certificateId }], []);
          certificate = { ...meta, certificateImageUrl: url, certificateStoragePath: uploadedPath, displayOrder: certs.length };
          certs.push(certificate);
        }
        referencedAfter = collectReferencedPaths({ ...data, certifications: certs });
        tx.update(ref, { certifications: certs, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
      });
      uploadedPath = ''; // committed — no longer an orphan candidate
      if (replacedPath && !referencedAfter.has(replacedPath)) await deleteStorageObjects(productId, [replacedPath]);
      return res.status(201).json({ success: true, certificate });
    } catch (error) {
      if (uploadedPath) await deleteStorageObjects(String(req.params.productId), [uploadedPath]);
      return send(res, error, 'Failed to upload certificate image');
    }
  });

  app.delete('/api/product-details/:productId/certificates/:certificateId', requireAdmin, async (req, res) => {
    try {
      const productId = requireProductId(req.params.productId);
      const certificateId = req.params.certificateId;
      if (!isValidSubId(certificateId)) throw new HttpError(400, 'Invalid certificateId', 'VALIDATION');
      const ref = col().doc(productId);
      const user = userOf(req);
      let removedPath = '';
      let referencedAfter = new Set<string>();
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'No product details found', 'NOT_FOUND');
        const data = snap.data()!;
        const certs: Certification[] = data.certifications || [];
        const target = certs.find(c => c.certificateId === certificateId);
        if (!target) throw new HttpError(404, 'Certification not found', 'NOT_FOUND');
        removedPath = target.certificateStoragePath || '';
        const remaining = certs.filter(c => c.certificateId !== certificateId).map((c, i) => ({ ...c, displayOrder: i }));
        referencedAfter = collectReferencedPaths({ ...data, certifications: remaining });
        tx.update(ref, { certifications: remaining, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
      });
      if (removedPath && !referencedAfter.has(removedPath)) await deleteStorageObjects(productId, [removedPath]);
      return res.json({ success: true });
    } catch (error) {
      return send(res, error, 'Failed to remove certification');
    }
  });

  // POST additional product image (append, or replace when imageId already exists).
  app.post('/api/product-details/:productId/images', requireAdmin, singleFile, async (req, res) => {
    let uploadedPath = '';
    try {
      const productId = requireProductId(req.params.productId);
      const file = req.file;
      validateImageFile(file);
      const imageId = req.body?.imageId ? String(req.body.imageId) : generateSubId('img');
      if (!isValidSubId(imageId)) throw new HttpError(400, 'Invalid imageId', 'VALIDATION');
      await assertProductExists(productId);
      const ref = col().doc(productId);
      const pre = await ref.get();
      if (!pre.exists) throw new HttpError(404, 'No product details found; create them first', 'NOT_FOUND');

      uploadedPath = `${PRODUCT_DETAILS_COLLECTION}/${productId}/images/${imageId}/${uniqueFileName(file!.mimetype)}`;
      const url = await uploadImage(uploadedPath, file!);
      const user = userOf(req);
      let replacedPath = '';
      let referencedAfter = new Set<string>();
      let image: ProductImage | null = null;

      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'No product details found', 'NOT_FOUND');
        const data = snap.data()!;
        const images: ProductImage[] = [...(data.productImageUrls || [])];
        const idx = images.findIndex(i => i.imageId === imageId);
        const base = { imageUrl: url, storagePath: uploadedPath, fileName: file!.originalname.slice(0, 200), contentType: file!.mimetype, fileSize: file!.size };
        if (idx >= 0) {
          replacedPath = images[idx].storagePath || '';
          images[idx] = { ...images[idx], ...base };
          image = images[idx];
        } else {
          if (images.length >= MAX_IMAGES) throw new HttpError(400, `A maximum of ${MAX_IMAGES} images is allowed`, 'VALIDATION');
          image = { imageId, ...base, displayOrder: images.length, isActive: true };
          images.push(image);
        }
        referencedAfter = collectReferencedPaths({ ...data, productImageUrls: images });
        tx.update(ref, { productImageUrls: images, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
      });
      uploadedPath = '';
      if (replacedPath && !referencedAfter.has(replacedPath)) await deleteStorageObjects(productId, [replacedPath]);
      return res.status(201).json({ success: true, image });
    } catch (error) {
      if (uploadedPath) await deleteStorageObjects(String(req.params.productId), [uploadedPath]);
      return send(res, error, 'Failed to upload product image');
    }
  });

  app.delete('/api/product-details/:productId/images/:imageId', requireAdmin, async (req, res) => {
    try {
      const productId = requireProductId(req.params.productId);
      const imageId = req.params.imageId;
      if (!isValidSubId(imageId)) throw new HttpError(400, 'Invalid imageId', 'VALIDATION');
      const ref = col().doc(productId);
      const user = userOf(req);
      let removedPath = '';
      let referencedAfter = new Set<string>();
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'No product details found', 'NOT_FOUND');
        const data = snap.data()!;
        const images: ProductImage[] = data.productImageUrls || [];
        const target = images.find(i => i.imageId === imageId);
        if (!target) throw new HttpError(404, 'Image not found', 'NOT_FOUND');
        removedPath = target.storagePath || '';
        const remaining = images.filter(i => i.imageId !== imageId).map((i, n) => ({ ...i, displayOrder: n }));
        referencedAfter = collectReferencedPaths({ ...data, productImageUrls: remaining });
        tx.update(ref, { productImageUrls: remaining, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
      });
      if (removedPath && !referencedAfter.has(removedPath)) await deleteStorageObjects(productId, [removedPath]);
      return res.json({ success: true });
    } catch (error) {
      return send(res, error, 'Failed to remove product image');
    }
  });
}
