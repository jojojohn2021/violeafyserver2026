/**
 * Direct Firestore/Storage fallback for Product Details.
 * Used only when `/api/product-details` is not available (static Firebase Hosting).
 * Mirrors the validation/merge semantics of `services/productDetailsRoutes.ts`.
 */
import { auth, db, storage } from '../firebase';
import { doc, getDoc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import type { ProductCertification, ProductDetails, ProductDetailsImage } from '../types';

const COL = 'product_details';
const TEXT_LIMITS: Record<string, number> = {
  whyShopFromLeafyearth: 5000, idealForMaking: 5000, shelfLife: 200, fssaiNumber: 50,
  marketedManufacturedBy: 2000, allergenInformation: 2000, storageConditions: 2000,
};
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

class DirectError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

function requireDb() {
  if (!db) throw new DirectError('Database not initialised', 503);
  return db;
}

function requireUid(): string {
  const u = auth?.currentUser;
  if (!u || u.isAnonymous) throw new DirectError('Authentication required', 401, 'UNAUTHENTICATED');
  return u.uid;
}

function text(body: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [f, max] of Object.entries(TEXT_LIMITS)) {
    const v = typeof body?.[f] === 'string' ? body[f].trim() : '';
    if (v.toLowerCase().startsWith('data:')) throw new DirectError(`${f} must not contain embedded media`, 400);
    if (v.length > max) throw new DirectError(`${f} exceeds ${max} characters`, 400);
    out[f] = v;
  }
  return out;
}

function certs(input: any[] | undefined, existing: any[] = []): any[] {
  if (!Array.isArray(input)) return [];
  const byId = new Map(existing.map((c: any) => [c.certificateId, c]));
  return input.map((raw: any, i: number) => {
    const name = String(raw?.certificateName || '').trim();
    if (!name) throw new DirectError(`certifications[${i}].certificateName is required`, 400);
    const prev: any = byId.get(raw.certificateId);
    return {
      certificateId: raw.certificateId,
      certificateName: name.slice(0, 200),
      certificateNumber: String(raw.certificateNumber || '').trim().slice(0, 100),
      issuingAuthority: String(raw.issuingAuthority || '').trim().slice(0, 200),
      certificateImageUrl: prev?.certificateImageUrl || '',
      certificateStoragePath: prev?.certificateStoragePath || '',
      validFrom: String(raw.validFrom || ''),
      validUntil: String(raw.validUntil || ''),
      displayOrder: i,
      isActive: raw.isActive !== false,
    };
  });
}

function images(input: any[] | undefined, existing: any[]): any[] {
  if (!Array.isArray(input)) return existing;
  const byId = new Map(existing.map((x: any) => [x.imageId, x]));
  return input.flatMap((raw: any, i: number) => {
    const prev = byId.get(raw?.imageId);
    return prev ? [{ ...prev, displayOrder: i, isActive: raw.isActive !== false }] : [];
  });
}

function serialize(id: string, data: any): ProductDetails {
  const ts = (v: any) => (v instanceof Timestamp ? v.toDate().toISOString() : v ?? null);
  const byOrder = (a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  return {
    ...data,
    productId: data.productId || id,
    certifications: [...(data.certifications || [])].sort(byOrder),
    productImageUrls: [...(data.productImageUrls || [])].sort(byOrder),
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  } as ProductDetails;
}

async function removeObjects(productId: string, paths: string[]) {
  if (!storage) return;
  const prefix = `${COL}/${productId}/`;
  for (const p of paths) {
    if (!p || !p.startsWith(prefix) || p.includes('..')) continue;
    try { await deleteObject(sRef(storage, p)); } catch (e) { console.warn('[product-details] orphan delete failed', p, e); }
  }
}

const refPaths = (d: any) => new Set<string>([
  ...(d?.certifications || []).map((c: any) => c.certificateStoragePath).filter(Boolean),
  ...(d?.productImageUrls || []).map((i: any) => i.storagePath).filter(Boolean),
]);

export async function directFetch(productId: string): Promise<ProductDetails | null> {
  const snap = await getDoc(doc(requireDb(), COL, productId));
  return snap.exists() ? serialize(snap.id, snap.data()) : null;
}

export async function directCreate(payload: any): Promise<ProductDetails> {
  const uid = requireUid();
  const d = requireDb();
  const productId = payload.productId;
  const ref = doc(d, COL, productId);
  await runTransaction(d, async tx => {
    if ((await tx.get(ref)).exists()) throw new DirectError('Product details already exist for this product', 409, 'ALREADY_EXISTS');
    tx.set(ref, {
      productId, ...text(payload), certifications: certs(payload.certifications), productImageUrls: [],
      isActive: payload.isActive !== false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      createdBy: uid, updatedBy: uid,
    });
  });
  return (await directFetch(productId))!;
}

export async function directUpdate(productId: string, payload: any): Promise<ProductDetails> {
  const uid = requireUid();
  const d = requireDb();
  const ref = doc(d, COL, productId);
  let orphaned: string[] = [];
  await runTransaction(d, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new DirectError('No product details found; create them first', 404, 'NOT_FOUND');
    const cur: any = snap.data();
    const next = {
      certifications: certs(payload.certifications, cur.certifications || []),
      productImageUrls: images(payload.productImageUrls, cur.productImageUrls || []),
    };
    const keep = refPaths(next);
    orphaned = [...refPaths(cur)].filter(p => !keep.has(p));
    tx.update(ref, { ...text(payload), ...next, updatedAt: serverTimestamp(), updatedBy: uid });
  });
  await removeObjects(productId, orphaned);
  return (await directFetch(productId))!;
}

async function mutateList(productId: string, key: 'certifications' | 'productImageUrls', fn: (list: any[]) => { list: any[]; removed?: string; item?: any }) {
  const uid = requireUid();
  const d = requireDb();
  const ref = doc(d, COL, productId);
  let removed = '';
  let item: any = null;
  let after = new Set<string>();
  await runTransaction(d, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new DirectError('No product details found; save the details first', 404, 'NOT_FOUND');
    const data: any = snap.data();
    const r = fn([...(data[key] || [])]);
    removed = r.removed || '';
    item = r.item;
    after = refPaths({ ...data, [key]: r.list });
    tx.update(ref, { [key]: r.list, updatedAt: serverTimestamp(), updatedBy: uid });
  });
  if (removed && !after.has(removed)) await removeObjects(productId, [removed]);
  return item;
}

export async function directDeleteCertificate(productId: string, certificateId: string) {
  await mutateList(productId, 'certifications', list => {
    const t = list.find(c => c.certificateId === certificateId);
    return { list: list.filter(c => c.certificateId !== certificateId).map((c, i) => ({ ...c, displayOrder: i })), removed: t?.certificateStoragePath };
  });
}

export async function directDeleteImage(productId: string, imageId: string) {
  await mutateList(productId, 'productImageUrls', list => {
    const t = list.find(x => x.imageId === imageId);
    return { list: list.filter(x => x.imageId !== imageId).map((x, i) => ({ ...x, displayOrder: i })), removed: t?.storagePath };
  });
}

async function upload(path: string, file: File, onProgress?: (p: number) => void) {
  if (!storage) throw new DirectError('Storage not initialised', 503);
  requireUid();
  const r = sRef(storage, path);
  onProgress?.(10);
  await uploadBytes(r, file, { contentType: file.type });
  onProgress?.(100);
  return getDownloadURL(r);
}

const fname = (f: File) => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${EXT[f.type] || 'jpg'}`;

export async function directUploadCertificate(productId: string, certificateId: string, file: File, onProgress?: (p: number) => void): Promise<ProductCertification> {
  const path = `${COL}/${productId}/certificates/${certificateId}/${fname(file)}`;
  const url = await upload(path, file, onProgress);
  try {
    return await mutateList(productId, 'certifications', list => {
      const idx = list.findIndex(c => c.certificateId === certificateId);
      if (idx >= 0) {
        const removed = list[idx].certificateStoragePath;
        list[idx] = { ...list[idx], certificateImageUrl: url, certificateStoragePath: path };
        return { list, removed, item: list[idx] };
      }
      const item = { certificateId, certificateName: 'Certificate', certificateNumber: '', issuingAuthority: '', certificateImageUrl: url, certificateStoragePath: path, validFrom: '', validUntil: '', displayOrder: list.length, isActive: true };
      return { list: [...list, item], item };
    });
  } catch (e) { await removeObjects(productId, [path]); throw e; }
}

export async function directUploadImage(productId: string, imageId: string, file: File, onProgress?: (p: number) => void): Promise<ProductDetailsImage> {
  const path = `${COL}/${productId}/images/${imageId}/${fname(file)}`;
  const url = await upload(path, file, onProgress);
  try {
    return await mutateList(productId, 'productImageUrls', list => {
      const base = { imageUrl: url, storagePath: path, fileName: file.name.slice(0, 200), contentType: file.type, fileSize: file.size };
      const idx = list.findIndex(x => x.imageId === imageId);
      if (idx >= 0) {
        const removed = list[idx].storagePath;
        list[idx] = { ...list[idx], ...base };
        return { list, removed, item: list[idx] };
      }
      const item = { imageId, ...base, displayOrder: list.length, isActive: true };
      return { list: [...list, item], item };
    });
  } catch (e) { await removeObjects(productId, [path]); throw e; }
}
