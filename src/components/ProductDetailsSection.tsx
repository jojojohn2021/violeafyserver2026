import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ProductDetails } from '../types';
import {
  PRODUCT_DETAILS_TEXT_FIELDS,
  ProductDetailsApiError,
  ProductDetailsTextField,
  createProductDetails,
  deleteProductCertificate,
  deleteProductDetailImage,
  fetchProductDetails,
  newClientId,
  updateProductDetails,
  uploadProductCertificateImage,
  uploadProductDetailImage,
  validateDetailImage,
} from '../utils/productDetailsApi';

/**
 * "Product Details" section embedded in the existing Create Product / Edit Product forms.
 * Persists to the separate `product_details/{productId}` collection via the server API.
 * The parent form calls `save(productId)` only after its own product save succeeded.
 */

export interface ProductDetailsSaveResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface ProductDetailsSectionHandle {
  save: (productId: string) => Promise<ProductDetailsSaveResult>;
  hasContent: () => boolean;
  isBusy: () => boolean;
  reset: () => void;
}

interface Props {
  mode: 'create' | 'edit';
  /** Firestore document ID of the product (edit mode). */
  productId?: string | null;
  disabled?: boolean;
}

interface CertDraft {
  certificateId: string;
  certificateName: string;
  certificateNumber: string;
  issuingAuthority: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  certificateImageUrl: string;
  certificateStoragePath: string;
  /** Metadata exists on the server. */
  remote: boolean;
  pendingFile?: File;
  previewUrl?: string;
  progress?: number;
  error?: string;
}

interface ImageDraft {
  imageId: string;
  imageUrl: string;
  storagePath: string;
  isActive: boolean;
  /** Image record exists on the server. */
  uploaded: boolean;
  pendingFile?: File;
  previewUrl?: string;
  progress?: number;
  error?: string;
}

const LABELS: Record<ProductDetailsTextField, { label: string; multiline: boolean; placeholder: string; max: number }> = {
  whyShopFromLeafyearth: { label: 'Why shop from Leafyearth?', multiline: true, placeholder: 'Reasons to buy this product from Leafyearth…', max: 5000 },
  idealForMaking: { label: 'Ideal for making', multiline: true, placeholder: 'Recipes or uses this product is ideal for…', max: 5000 },
  shelfLife: { label: 'Shelf Life', multiline: false, placeholder: 'e.g. 12 months from packaging', max: 200 },
  fssaiNumber: { label: 'FSSAI Number', multiline: false, placeholder: 'e.g. 10012345000123', max: 50 },
  marketedManufacturedBy: { label: 'Marketed & Manufactured By', multiline: true, placeholder: 'Company name and address…', max: 2000 },
  allergenInformation: { label: 'Allergen Information', multiline: true, placeholder: 'Allergen declarations…', max: 2000 },
  storageConditions: { label: 'Storage Conditions', multiline: true, placeholder: 'How to store this product…', max: 2000 },
};

const emptyText = (): Record<ProductDetailsTextField, string> =>
  PRODUCT_DETAILS_TEXT_FIELDS.reduce((acc, f) => ({ ...acc, [f]: '' }), {} as Record<ProductDetailsTextField, string>);

const inputCls = 'w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60';
const labelCls = 'block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider';
const smallBtn = 'px-2 py-1 rounded-md text-[10px] font-bold border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const ProductDetailsSection = forwardRef<ProductDetailsSectionHandle, Props>(({ mode, productId, disabled }, ref) => {
  const [text, setText] = useState(emptyText);
  const [certs, setCerts] = useState<CertDraft[]>([]);
  const [images, setImages] = useState<ImageDraft[]>([]);
  const [removedCertIds, setRemovedCertIds] = useState<string[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [remoteExists, setRemoteExists] = useState(false);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(mode === 'create' ? 'loaded' : 'idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const objectUrls = useRef<Set<string>>(new Set());

  useEffect(() => () => { objectUrls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const preview = (file: File) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    return url;
  };

  const applyServer = useCallback((d: ProductDetails | null) => {
    setRemovedCertIds([]);
    setRemovedImageIds([]);
    if (!d) {
      setRemoteExists(false);
      setText(emptyText());
      setCerts([]);
      setImages([]);
      return;
    }
    setRemoteExists(true);
    setText(PRODUCT_DETAILS_TEXT_FIELDS.reduce((acc, f) => ({ ...acc, [f]: d[f] || '' }), {} as Record<ProductDetailsTextField, string>));
    setCerts((d.certifications || []).map(c => ({
      certificateId: c.certificateId,
      certificateName: c.certificateName || '',
      certificateNumber: c.certificateNumber || '',
      issuingAuthority: c.issuingAuthority || '',
      validFrom: c.validFrom || '',
      validUntil: c.validUntil || '',
      isActive: c.isActive !== false,
      certificateImageUrl: c.certificateImageUrl || '',
      certificateStoragePath: c.certificateStoragePath || '',
      remote: true,
    })));
    setImages((d.productImageUrls || []).map(i => ({
      imageId: i.imageId, imageUrl: i.imageUrl, storagePath: i.storagePath, isActive: i.isActive !== false, uploaded: true,
    })));
  }, []);

  const load = useCallback(async () => {
    if (mode !== 'edit' || !productId) return;
    setLoadState('loading');
    setLoadError(null);
    try {
      applyServer(await fetchProductDetails(productId));
      setLoadState('loaded');
    } catch (e) {
      // Never fall back to empty values on failure — saving is blocked until a successful load.
      setLoadError(errMsg(e));
      setLoadState('error');
    }
  }, [mode, productId, applyServer]);

  useEffect(() => { load(); }, [load]);

  const hasContent = useCallback(
    () => PRODUCT_DETAILS_TEXT_FIELDS.some(f => text[f].trim() !== '') || certs.length > 0 || images.length > 0,
    [text, certs, images],
  );

  const reset = useCallback(() => {
    applyServer(null);
    setSaveError(null);
    setFieldError(null);
  }, [applyServer]);

  const buildPayload = (uploadedImageIds: Set<string>) => ({
    ...text,
    certifications: certs.map(c => ({
      certificateId: c.certificateId,
      certificateName: c.certificateName.trim(),
      certificateNumber: c.certificateNumber.trim(),
      issuingAuthority: c.issuingAuthority.trim(),
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      isActive: c.isActive,
    })),
    productImageUrls: images
      .filter(i => i.uploaded || uploadedImageIds.has(i.imageId))
      .map(i => ({ imageId: i.imageId, isActive: i.isActive })),
  });

  const save = useCallback(async (pid: string): Promise<ProductDetailsSaveResult> => {
    if (!pid) return { ok: false, error: 'Missing product ID for Product Details.' };
    if (mode === 'edit' && loadState !== 'loaded') {
      const error = 'Product Details could not be loaded. Retry loading before saving so existing details are not overwritten.';
      setSaveError(error);
      return { ok: false, error };
    }
    if (!remoteExists && !hasContent()) return { ok: true, skipped: true };

    for (const [i, c] of certs.entries()) {
      if (!c.certificateName.trim()) {
        const error = `Certification #${i + 1} needs a name.`;
        setFieldError(error);
        return { ok: false, error };
      }
      if (c.validFrom && c.validUntil && c.validFrom > c.validUntil) {
        const error = `Certification "${c.certificateName}": Valid From must be on or before Valid Until.`;
        setFieldError(error);
        return { ok: false, error };
      }
    }
    setFieldError(null);
    setSaving(true);
    setSaveError(null);

    try {
      const uploadedNow = new Set<string>();

      // 1. Ensure the details document exists (idempotent: 409 means it already exists).
      if (!remoteExists) {
        try {
          await createProductDetails({ ...buildPayload(uploadedNow), productImageUrls: undefined, productId: pid });
        } catch (e) {
          if (!(e instanceof ProductDetailsApiError && e.status === 409)) throw e;
        }
        setRemoteExists(true);
      }

      // 2. Explicit removals (server deletes Storage objects that are no longer referenced).
      for (const id of removedImageIds) await deleteProductDetailImage(pid, id);
      setRemovedImageIds([]);
      for (const id of removedCertIds) await deleteProductCertificate(pid, id);
      setRemovedCertIds([]);

      // 3. Text + certification metadata + order of already-stored images.
      await updateProductDetails(pid, buildPayload(uploadedNow));
      setCerts(prev => prev.map(c => ({ ...c, remote: true })));

      // 4. Uploads — failures keep existing images and leave the item pending for retry.
      const failures: string[] = [];
      for (const c of certs.filter(x => x.pendingFile)) {
        try {
          const saved = await uploadProductCertificateImage(pid, c.certificateId, c.pendingFile!, pct =>
            setCerts(prev => prev.map(x => x.certificateId === c.certificateId ? { ...x, progress: pct } : x)));
          setCerts(prev => prev.map(x => x.certificateId === c.certificateId ? {
            ...x, certificateImageUrl: saved.certificateImageUrl, certificateStoragePath: saved.certificateStoragePath,
            pendingFile: undefined, previewUrl: undefined, progress: undefined, error: undefined,
          } : x));
        } catch (e) {
          failures.push(`Certificate "${c.certificateName}": ${errMsg(e)}`);
          setCerts(prev => prev.map(x => x.certificateId === c.certificateId ? { ...x, progress: undefined, error: errMsg(e) } : x));
        }
      }
      for (const img of images.filter(x => x.pendingFile)) {
        try {
          const saved = await uploadProductDetailImage(pid, img.imageId, img.pendingFile!, pct =>
            setImages(prev => prev.map(x => x.imageId === img.imageId ? { ...x, progress: pct } : x)));
          uploadedNow.add(img.imageId);
          setImages(prev => prev.map(x => x.imageId === img.imageId ? {
            ...x, imageUrl: saved.imageUrl, storagePath: saved.storagePath, uploaded: true,
            pendingFile: undefined, previewUrl: undefined, progress: undefined, error: undefined,
          } : x));
        } catch (e) {
          failures.push(`Picture: ${errMsg(e)}`);
          setImages(prev => prev.map(x => x.imageId === img.imageId ? { ...x, progress: undefined, error: errMsg(e) } : x));
        }
      }

      // 5. Persist final picture order once new uploads are registered.
      if (uploadedNow.size > 0) await updateProductDetails(pid, buildPayload(uploadedNow));

      if (failures.length) throw new Error(`Some uploads failed: ${failures.join('; ')}`);

      const fresh = await fetchProductDetails(pid);
      applyServer(fresh);
      if (mode === 'edit') setLoadState('loaded');
      return { ok: true };
    } catch (e) {
      const error = errMsg(e);
      setSaveError(error);
      return { ok: false, error };
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, loadState, remoteExists, hasContent, certs, images, text, removedCertIds, removedImageIds, applyServer]);

  useImperativeHandle(ref, () => ({ save, hasContent, isBusy: () => saving || loadState === 'loading', reset }), [save, hasContent, saving, loadState, reset]);

  // --- Editors -------------------------------------------------------------
  const locked = disabled || saving || loadState === 'loading' || loadState === 'error';

  const addCert = () => setCerts(prev => [...prev, {
    certificateId: newClientId('cert'), certificateName: '', certificateNumber: '', issuingAuthority: '',
    validFrom: '', validUntil: '', isActive: true, certificateImageUrl: '', certificateStoragePath: '', remote: false,
  }]);

  const updateCert = (id: string, patch: Partial<CertDraft>) => setCerts(prev => prev.map(c => c.certificateId === id ? { ...c, ...patch } : c));

  const removeCert = (c: CertDraft) => {
    if (c.remote) setRemovedCertIds(prev => [...prev, c.certificateId]);
    setCerts(prev => prev.filter(x => x.certificateId !== c.certificateId));
  };

  const pickCertFile = (id: string, file?: File | null) => {
    if (!file) return;
    const problem = validateDetailImage(file);
    if (problem) return updateCert(id, { error: problem });
    updateCert(id, { pendingFile: file, previewUrl: preview(file), error: undefined });
  };

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const next: ImageDraft[] = [];
    const problems: string[] = [];
    Array.from(files).forEach(file => {
      const problem = validateDetailImage(file);
      if (problem) problems.push(`${file.name}: ${problem}`);
      else next.push({ imageId: newClientId('img'), imageUrl: '', storagePath: '', isActive: true, uploaded: false, pendingFile: file, previewUrl: preview(file) });
    });
    setFieldError(problems.length ? problems.join(' ') : null);
    setImages(prev => [...prev, ...next]);
  };

  const replaceImage = (id: string, file?: File | null) => {
    if (!file) return;
    const problem = validateDetailImage(file);
    setImages(prev => prev.map(i => i.imageId === id ? (problem ? { ...i, error: problem } : { ...i, pendingFile: file, previewUrl: preview(file), error: undefined }) : i));
  };

  const removeImage = (img: ImageDraft) => {
    if (img.uploaded) setRemovedImageIds(prev => [...prev, img.imageId]);
    setImages(prev => prev.filter(i => i.imageId !== img.imageId));
  };

  return (
    <section
      id={`product-details-section-${mode}`}
      aria-labelledby={`product-details-heading-${mode}`}
      className="mt-4 rounded-2xl border border-emerald-500/30 bg-[#0d0d10] p-4 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 id={`product-details-heading-${mode}`} className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Product Details</h4>
          <p className="text-[10px] text-slate-500">Optional. Shown on the public product page only when populated.</p>
        </div>
        {saving && <span className="text-[10px] font-bold text-emerald-300 animate-pulse">Saving details…</span>}
      </div>

      {loadState === 'loading' && <p className="text-xs text-slate-400">Loading product details…</p>}
      {loadState === 'error' && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
          <span>Could not load Product Details: {loadError}. Existing details are preserved and will not be overwritten.</span>
          <button type="button" id="product-details-retry-load" onClick={load} className={smallBtn}>Retry</button>
        </div>
      )}
      {saveError && (
        <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
          Product Details were not fully saved: {saveError}
        </div>
      )}
      {fieldError && <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">{fieldError}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PRODUCT_DETAILS_TEXT_FIELDS.map(field => {
          const cfg = LABELS[field];
          const id = `pd-${mode}-${field}`;
          return (
            <div key={field} className={cfg.multiline ? 'sm:col-span-2' : ''}>
              <label htmlFor={id} className={labelCls}>{cfg.label}</label>
              {cfg.multiline ? (
                <textarea id={id} rows={3} maxLength={cfg.max} disabled={locked} placeholder={cfg.placeholder}
                  value={text[field]} onChange={e => setText(prev => ({ ...prev, [field]: e.target.value }))}
                  className={`${inputCls} resize-y`} />
              ) : (
                <input id={id} type="text" maxLength={cfg.max} disabled={locked} placeholder={cfg.placeholder}
                  value={text[field]} onChange={e => setText(prev => ({ ...prev, [field]: e.target.value }))}
                  className={inputCls} />
              )}
            </div>
          );
        })}
      </div>

      {/* Certifications */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Certifications</span>
          <button type="button" id={`pd-${mode}-add-cert`} onClick={addCert} disabled={locked}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 cursor-pointer">
            + Add certification
          </button>
        </div>
        {certs.length === 0 && <p className="text-[11px] text-slate-500">No certifications added.</p>}
        {certs.map((c, index) => {
          const img = c.previewUrl || c.certificateImageUrl;
          return (
            <div key={c.certificateId} className="rounded-xl border border-slate-800 bg-[#141418] p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400">#{index + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Move certification up" className={smallBtn} disabled={locked || index === 0} onClick={() => setCerts(prev => move(prev, index, -1))}>↑</button>
                  <button type="button" aria-label="Move certification down" className={smallBtn} disabled={locked || index === certs.length - 1} onClick={() => setCerts(prev => move(prev, index, 1))}>↓</button>
                  <label className="flex items-center gap-1 text-[10px] text-slate-300 px-2">
                    <input type="checkbox" checked={c.isActive} disabled={locked} onChange={e => updateCert(c.certificateId, { isActive: e.target.checked })} /> Active
                  </label>
                  <button type="button" className={`${smallBtn} text-rose-300 border-rose-500/40`} disabled={locked} onClick={() => removeCert(c)}>Remove</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[96px_1fr] gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="h-24 w-24 rounded-lg border border-slate-800 bg-black/40 overflow-hidden flex items-center justify-center">
                    {img ? <img src={img} alt={c.certificateName || 'Certificate'} className="h-full w-full object-contain" /> : <span className="text-[10px] text-slate-600">No image</span>}
                  </div>
                  <label className={`${smallBtn} text-center w-full`}>
                    {img ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={locked}
                      onChange={e => { pickCertFile(c.certificateId, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {c.pendingFile && c.progress === undefined && <span className="text-[9px] text-amber-300">Pending upload</span>}
                  {c.progress !== undefined && <progress max={100} value={c.progress} className="w-full h-1" />}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input aria-label="Certificate name" placeholder="Certificate name *" className={inputCls} disabled={locked} maxLength={200}
                    value={c.certificateName} onChange={e => updateCert(c.certificateId, { certificateName: e.target.value })} />
                  <input aria-label="Certificate number" placeholder="Certificate number (optional)" className={inputCls} disabled={locked} maxLength={100}
                    value={c.certificateNumber} onChange={e => updateCert(c.certificateId, { certificateNumber: e.target.value })} />
                  <input aria-label="Issuing authority" placeholder="Issuing authority (optional)" className={`${inputCls} sm:col-span-2`} disabled={locked} maxLength={200}
                    value={c.issuingAuthority} onChange={e => updateCert(c.certificateId, { issuingAuthority: e.target.value })} />
                  <label className="text-[10px] text-slate-400">Valid from
                    <input type="date" className={inputCls} disabled={locked} value={c.validFrom} onChange={e => updateCert(c.certificateId, { validFrom: e.target.value })} />
                  </label>
                  <label className="text-[10px] text-slate-400">Valid until
                    <input type="date" className={inputCls} disabled={locked} value={c.validUntil} onChange={e => updateCert(c.certificateId, { validUntil: e.target.value })} />
                  </label>
                </div>
              </div>
              {c.error && <p role="alert" className="text-[10px] text-rose-300">{c.error}</p>}
            </div>
          );
        })}
      </div>

      {/* Additional product pictures */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Additional Product Pictures</span>
          <label className={`px-3 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer ${locked ? 'opacity-40 pointer-events-none' : ''}`}>
            + Add pictures
            <input id={`pd-${mode}-add-images`} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" disabled={locked}
              onChange={e => { addImages(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        <p className="text-[10px] text-slate-500">JPEG, PNG or WebP · up to 10MB each.</p>
        {images.length === 0 && <p className="text-[11px] text-slate-500">No additional pictures.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {images.map((img, index) => (
            <div key={img.imageId} className={`rounded-xl border bg-[#141418] p-2 space-y-1 ${img.isActive ? 'border-slate-800' : 'border-slate-800 opacity-60'}`}>
              <div className="aspect-square rounded-lg overflow-hidden bg-black/40">
                <img src={img.previewUrl || img.imageUrl} alt={`Product picture ${index + 1}`} className="h-full w-full object-cover" />
              </div>
              {img.pendingFile && img.progress === undefined && <span className="text-[9px] text-amber-300">Pending upload</span>}
              {img.progress !== undefined && <progress max={100} value={img.progress} className="w-full h-1" />}
              <div className="flex flex-wrap gap-1">
                <button type="button" aria-label="Move picture left" className={smallBtn} disabled={locked || index === 0} onClick={() => setImages(prev => move(prev, index, -1))}>←</button>
                <button type="button" aria-label="Move picture right" className={smallBtn} disabled={locked || index === images.length - 1} onClick={() => setImages(prev => move(prev, index, 1))}>→</button>
                <label className={smallBtn}>
                  Replace
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={locked}
                    onChange={e => { replaceImage(img.imageId, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <button type="button" className={`${smallBtn} text-rose-300 border-rose-500/40`} disabled={locked} onClick={() => removeImage(img)}>✕</button>
              </div>
              <label className="flex items-center gap-1 text-[10px] text-slate-300">
                <input type="checkbox" checked={img.isActive} disabled={locked}
                  onChange={e => setImages(prev => prev.map(i => i.imageId === img.imageId ? { ...i, isActive: e.target.checked } : i))} /> Active
              </label>
              {img.error && <p role="alert" className="text-[10px] text-rose-300">{img.error}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

ProductDetailsSection.displayName = 'ProductDetailsSection';
export default ProductDetailsSection;
