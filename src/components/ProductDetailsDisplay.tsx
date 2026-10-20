import React, { useEffect, useState } from 'react';
import type { ProductDetails } from '../types';
import { fetchProductDetails } from '../utils/productDetailsApi';

/**
 * Read-only Product Details for the public product page. Renders nothing when no
 * details record exists (or the read fails), so existing page behaviour is preserved.
 * Only populated sections and active certifications/pictures are shown.
 */
const SECTIONS: Array<[keyof ProductDetails, string]> = [
  ['whyShopFromLeafyearth', 'Why shop from Leafyearth?'],
  ['idealForMaking', 'Ideal for making'],
  ['shelfLife', 'Shelf Life'],
  ['fssaiNumber', 'FSSAI Number'],
  ['marketedManufacturedBy', 'Marketed & Manufactured By'],
  ['allergenInformation', 'Allergen Information'],
  ['storageConditions', 'Storage Conditions'],
];

const ProductDetailsDisplay: React.FC<{ productId: string }> = ({ productId }) => {
  const [details, setDetails] = useState<ProductDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    if (!productId) return;
    fetchProductDetails(productId)
      .then(d => { if (!cancelled) setDetails(d && d.isActive !== false ? d : null); })
      .catch(err => console.warn('[ProductDetails] Could not load product details:', err));
    return () => { cancelled = true; };
  }, [productId]);

  if (!details) return null;

  const textSections = SECTIONS.filter(([key]) => typeof details[key] === 'string' && (details[key] as string).trim());
  const certs = (details.certifications || []).filter(c => c.isActive !== false && c.certificateName);
  const pictures = (details.productImageUrls || []).filter(i => i.isActive !== false && i.imageUrl);
  if (!textSections.length && !certs.length && !pictures.length) return null;

  return (
    <div className="border-t pt-4 dark:border-slate-800 space-y-4" id="public-product-details">
      {textSections.map(([key, title]) => (
        <section key={key}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#22C55E] mb-1">{title}</h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">{details[key] as string}</p>
        </section>
      ))}

      {certs.length > 0 && (
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#22C55E] mb-2">Certifications</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {certs.map(c => (
              <figure key={c.certificateId} className="rounded-xl border dark:border-slate-800 p-2 text-center">
                {c.certificateImageUrl && (
                  <img src={c.certificateImageUrl} alt={c.certificateName} loading="lazy" className="h-20 w-full object-contain mb-1" />
                )}
                <figcaption className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{c.certificateName}</figcaption>
                {c.certificateNumber && <p className="text-[10px] text-slate-500">No. {c.certificateNumber}</p>}
                {c.issuingAuthority && <p className="text-[10px] text-slate-500">{c.issuingAuthority}</p>}
                {c.validUntil && <p className="text-[10px] text-slate-500">Valid until {c.validUntil}</p>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {pictures.length > 0 && (
        <section>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#22C55E] mb-2">More pictures</h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {pictures.map((p, i) => (
              <img key={p.imageId} src={p.imageUrl} alt={`Product picture ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-lg object-cover border dark:border-slate-800" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductDetailsDisplay;
