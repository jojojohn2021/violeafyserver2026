import { auth } from '../firebase';
import { apiFetch } from './apiFetch';
import type { ProductCertification, ProductDetails, ProductDetailsImage } from '../types';

/** Client for the server-side `/api/product-details` API (no direct Firestore/Storage writes). */

export class ProductDetailsApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export const PRODUCT_DETAILS_TEXT_FIELDS = [
  'whyShopFromLeafyearth',
  'idealForMaking',
  'shelfLife',
  'fssaiNumber',
  'marketedManufacturedBy',
  'allergenInformation',
  'storageConditions',
] as const;
export type ProductDetailsTextField = typeof PRODUCT_DETAILS_TEXT_FIELDS[number];

export const ALLOWED_DETAIL_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_DETAIL_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateDetailImage(file: File): string | null {
  if (!ALLOWED_DETAIL_IMAGE_TYPES.includes(file.type)) return 'Only JPEG, PNG and WebP images are allowed.';
  if (file.size > MAX_DETAIL_IMAGE_BYTES) return 'Image exceeds the 10MB limit.';
  return null;
}

export function newClientId(prefix: 'cert' | 'img'): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now()}_${rand}`;
}

async function parse<T>(res: Response): Promise<T> {
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || body?.success === false) {
    throw new ProductDetailsApiError(body?.error || `Request failed (${res.status})`, res.status, body?.code);
  }
  return body as T;
}

const enc = encodeURIComponent;

export interface ProductDetailsPayload {
  productId?: string;
  whyShopFromLeafyearth: string;
  idealForMaking: string;
  shelfLife: string;
  fssaiNumber: string;
  marketedManufacturedBy: string;
  allergenInformation: string;
  storageConditions: string;
  certifications: Array<Pick<ProductCertification,
    'certificateId' | 'certificateName' | 'certificateNumber' | 'issuingAuthority' | 'validFrom' | 'validUntil' | 'isActive'>>;
  productImageUrls?: Array<Pick<ProductDetailsImage, 'imageId' | 'isActive'>>;
}

/** Returns `null` when no details exist (404); throws on any other failure. */
export async function fetchProductDetails(productId: string): Promise<ProductDetails | null> {
  const res = await apiFetch(`/api/product-details/${enc(productId)}`);
  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    if (body?.notFound) return null;
    throw new ProductDetailsApiError(body?.error || 'Product details service unavailable', 404);
  }
  return (await parse<{ details: ProductDetails }>(res)).details;
}

export async function createProductDetails(payload: ProductDetailsPayload & { productId: string }): Promise<ProductDetails> {
  const res = await apiFetch('/api/product-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await parse<{ details: ProductDetails }>(res)).details;
}

export async function updateProductDetails(productId: string, payload: ProductDetailsPayload): Promise<ProductDetails> {
  const res = await apiFetch(`/api/product-details/${enc(productId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, productId }),
  });
  return (await parse<{ details: ProductDetails }>(res)).details;
}

export async function deleteProductCertificate(productId: string, certificateId: string): Promise<void> {
  const res = await apiFetch(`/api/product-details/${enc(productId)}/certificates/${enc(certificateId)}`, { method: 'DELETE' });
  if (res.status === 404) return; // already removed — idempotent
  await parse(res);
}

export async function deleteProductDetailImage(productId: string, imageId: string): Promise<void> {
  const res = await apiFetch(`/api/product-details/${enc(productId)}/images/${enc(imageId)}`, { method: 'DELETE' });
  if (res.status === 404) return;
  await parse(res);
}

/** Multipart upload with progress reporting (XHR is required for upload progress events). */
async function uploadWithProgress<T>(url: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  const user = auth?.currentUser;
  if (!user || user.isAnonymous) throw new ProductDetailsApiError('Authentication required', 401);
  const token = await user.getIdToken();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new ProductDetailsApiError('Network error during upload', 0));
    xhr.onload = () => {
      let body: any = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300 && body?.success !== false) resolve(body as T);
      else reject(new ProductDetailsApiError(body?.error || `Upload failed (${xhr.status})`, xhr.status, body?.code));
    };
    xhr.send(form);
  });
}

export async function uploadProductCertificateImage(productId: string, certificateId: string, file: File, onProgress?: (pct: number) => void) {
  const fd = new FormData();
  fd.append('certificateId', certificateId);
  fd.append('file', file);
  return (await uploadWithProgress<{ certificate: ProductCertification }>(`/api/product-details/${enc(productId)}/certificates`, fd, onProgress)).certificate;
}

export async function uploadProductDetailImage(productId: string, imageId: string, file: File, onProgress?: (pct: number) => void) {
  const fd = new FormData();
  fd.append('imageId', imageId);
  fd.append('file', file);
  return (await uploadWithProgress<{ image: ProductDetailsImage }>(`/api/product-details/${enc(productId)}/images`, fd, onProgress)).image;
}
