import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Globe, Leaf, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import type { ProductPerformance } from '../types';
import { normalizeUrlSlugClient, validateGtinChecksumClient } from '../utils/aiProductContentApi';

export type ProductMasterV8Fields = Pick<
  ProductPerformance,
  | 'title'
  | 'botanicalName'
  | 'botanicalFamily'
  | 'productForm'
  | 'englishName'
  | 'malayalamName'
  | 'hindiName'
  | 'tamilName'
  | 'kannadaName'
  | 'teluguName'
  | 'keyFeatures'
  | 'culinaryUses'
  | 'storageInstructions'
  | 'healthBenefits'
  | 'nutritionalBenefits'
  | 'generalPrecautions'
  | 'healthReferences'
  | 'isAyurvedicProduct'
  | 'sanskritName'
  | 'ayurvedicClassification'
  | 'ayurvedicDescription'
  | 'rasa'
  | 'guna'
  | 'virya'
  | 'vipaka'
  | 'prabhava'
  | 'vataEffect'
  | 'pittaEffect'
  | 'kaphaEffect'
  | 'medicinalPartsUsed'
  | 'ayurvedicMedicinalUses'
  | 'ayurvedicFormulations'
  | 'ayurvedicUsageMethods'
  | 'anupana'
  | 'ayurvedicDosage'
  | 'ayurvedicPrecautions'
  | 'contraindications'
  | 'drugInteractions'
  | 'ayurvedicReferences'
  | 'lowestWebPrice'
  | 'highestWebPrice'
  | 'webPriceCurrency'
  | 'webPriceSources'
  | 'webPriceCheckedAt'
  | 'availablePackingSizes'
  | 'gstReference'
  | 'gstVerifiedAt'
  | 'seoTitle'
  | 'metaDescription'
  | 'seoKeywords'
  | 'urlSlug'
  | 'seoUpdatedAt'
  | 'gtin'
  | 'mpn'
  | 'barcode'
  | 'googleProductCategory'
  | 'productType'
  | 'canonicalUrl'
  | 'condition'
  | 'countryOfOrigin'
  | 'manufacturerName'
  | 'netWeight'
  | 'netWeightUnit'
  | 'netVolume'
  | 'netVolumeUnit'
  | 'shippingWeight'
  | 'shippingWeightUnit'
  | 'productHighlights'
  | 'productFAQs'
  | 'searchTags'
  | 'dietaryAttributes'
  | 'allergenInformation'
  | 'fssaiLicenseNumber'
  | 'aiCommerceEnabled'
  | 'aiCommerceUpdatedAt'
>;

export function extractV8FieldsFromProduct(p?: Partial<ProductPerformance> | null): ProductMasterV8Fields {
  return {
    title: p?.title || '',
    botanicalName: p?.botanicalName || '',
    botanicalFamily: p?.botanicalFamily || '',
    productForm: p?.productForm || '',
    englishName: p?.englishName || p?.name || '',
    malayalamName: p?.malayalamName || '',
    hindiName: p?.hindiName || '',
    tamilName: p?.tamilName || '',
    kannadaName: p?.kannadaName || '',
    teluguName: p?.teluguName || '',
    keyFeatures: Array.isArray(p?.keyFeatures) ? p!.keyFeatures : [],
    culinaryUses: Array.isArray(p?.culinaryUses) ? p!.culinaryUses : [],
    storageInstructions: p?.storageInstructions || '',
    healthBenefits: Array.isArray(p?.healthBenefits) ? p!.healthBenefits : [],
    nutritionalBenefits: Array.isArray(p?.nutritionalBenefits) ? p!.nutritionalBenefits : [],
    generalPrecautions: Array.isArray(p?.generalPrecautions) ? p!.generalPrecautions : [],
    healthReferences: Array.isArray(p?.healthReferences) ? p!.healthReferences : [],
    isAyurvedicProduct: Boolean(p?.isAyurvedicProduct),
    sanskritName: p?.sanskritName || '',
    ayurvedicClassification: p?.ayurvedicClassification || '',
    ayurvedicDescription: p?.ayurvedicDescription || '',
    rasa: Array.isArray(p?.rasa) ? p!.rasa : [],
    guna: Array.isArray(p?.guna) ? p!.guna : [],
    virya: p?.virya || '',
    vipaka: p?.vipaka || '',
    prabhava: p?.prabhava || '',
    vataEffect: p?.vataEffect || '',
    pittaEffect: p?.pittaEffect || '',
    kaphaEffect: p?.kaphaEffect || '',
    medicinalPartsUsed: Array.isArray(p?.medicinalPartsUsed) ? p!.medicinalPartsUsed : [],
    ayurvedicMedicinalUses: Array.isArray(p?.ayurvedicMedicinalUses) ? p!.ayurvedicMedicinalUses : [],
    ayurvedicFormulations: Array.isArray(p?.ayurvedicFormulations) ? p!.ayurvedicFormulations : [],
    ayurvedicUsageMethods: Array.isArray(p?.ayurvedicUsageMethods) ? p!.ayurvedicUsageMethods : [],
    anupana: Array.isArray(p?.anupana) ? p!.anupana : [],
    ayurvedicDosage: p?.ayurvedicDosage || '',
    ayurvedicPrecautions: Array.isArray(p?.ayurvedicPrecautions) ? p!.ayurvedicPrecautions : [],
    contraindications: Array.isArray(p?.contraindications) ? p!.contraindications : [],
    drugInteractions: Array.isArray(p?.drugInteractions) ? p!.drugInteractions : [],
    ayurvedicReferences: Array.isArray(p?.ayurvedicReferences) ? p!.ayurvedicReferences : [],
    lowestWebPrice: p?.lowestWebPrice ?? null,
    highestWebPrice: p?.highestWebPrice ?? null,
    webPriceCurrency: p?.webPriceCurrency || 'INR',
    webPriceSources: Array.isArray(p?.webPriceSources) ? p!.webPriceSources : [],
    webPriceCheckedAt: p?.webPriceCheckedAt || null,
    availablePackingSizes: Array.isArray(p?.availablePackingSizes) ? p!.availablePackingSizes : [],
    gstReference: p?.gstReference || '',
    gstVerifiedAt: p?.gstVerifiedAt || null,
    // V9 SEO Fields
    seoTitle: p?.seoTitle || '',
    metaDescription: p?.metaDescription || '',
    seoKeywords: Array.isArray(p?.seoKeywords) ? p!.seoKeywords : [],
    urlSlug: p?.urlSlug || '',
    seoUpdatedAt: p?.seoUpdatedAt || null,
    // V10 AI Commerce & Product Discoverability Fields
    gtin: p?.gtin || '',
    mpn: p?.mpn || '',
    barcode: p?.barcode || '',
    googleProductCategory: p?.googleProductCategory || '',
    productType: p?.productType || '',
    canonicalUrl: p?.canonicalUrl || '',
    condition: p?.condition || 'new',
    countryOfOrigin: p?.countryOfOrigin || 'India',
    manufacturerName: p?.manufacturerName || '',
    netWeight: p?.netWeight ?? null,
    netWeightUnit: p?.netWeightUnit || 'g',
    netVolume: p?.netVolume ?? null,
    netVolumeUnit: p?.netVolumeUnit || 'ml',
    shippingWeight: p?.shippingWeight ?? null,
    shippingWeightUnit: p?.shippingWeightUnit || 'g',
    productHighlights: Array.isArray(p?.productHighlights) ? p!.productHighlights : [],
    productFAQs: Array.isArray(p?.productFAQs) ? p!.productFAQs : [],
    searchTags: Array.isArray(p?.searchTags) ? p!.searchTags : [],
    dietaryAttributes: Array.isArray(p?.dietaryAttributes) ? p!.dietaryAttributes : [],
    allergenInformation: Array.isArray(p?.allergenInformation) ? p!.allergenInformation : [],
    fssaiLicenseNumber: p?.fssaiLicenseNumber || '',
    aiCommerceEnabled: Boolean(p?.aiCommerceEnabled),
    aiCommerceUpdatedAt: p?.aiCommerceUpdatedAt || null,
  };
}

interface ProductMasterV8SectionProps {
  value: ProductMasterV8Fields;
  onChange: (next: ProductMasterV8Fields) => void;
  idPrefix?: string;
}

const joinCsv = (arr?: string[]) => (Array.isArray(arr) ? arr.join(', ') : '');
const splitCsv = (raw: string) =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const ProductMasterV8Section: React.FC<ProductMasterV8SectionProps> = ({
  value,
  onChange,
  idPrefix = 'v8',
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  const update = (patch: Partial<ProductMasterV8Fields>) => {
    onChange({ ...value, ...patch });
  };

  const gtinCheck = value.gtin ? validateGtinChecksumClient(value.gtin) : null;
  const fssaiValid = !value.fssaiLicenseNumber || /^\d{14}$/.test(String(value.fssaiLicenseNumber).trim());

  return (
    <div className="mt-4 bg-[#111115] border border-slate-800 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-4 py-3 flex items-center justify-between text-left bg-[#15151a] hover:bg-[#191920] transition cursor-pointer"
        id={`${idPrefix}-v8-section-toggle`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
            Botanical, 6-Language Names, Ayurvedic Monograph, SEO & AI Commerce (V8–V10)
          </span>
          {value.isAyurvedicProduct && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-700">
              Ayurvedic Enabled
            </span>
          )}
          {value.urlSlug && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-950 text-indigo-300 border border-indigo-700 font-mono">
              /products/{value.urlSlug}
            </span>
          )}
          {value.aiCommerceEnabled && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-cyan-950 text-cyan-300 border border-cyan-700">
              AI Commerce Active
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-5 border-t border-slate-800 text-xs">
          {/* 1. Botanical & 6-Language Native Names */}
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-3">
              1. Botanical Identity & 6-Language Product Names (Section 18.1)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Display Title
                </label>
                <input
                  type="text"
                  value={value.title || ''}
                  onChange={(e) => update({ title: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Botanical Name
                </label>
                <input
                  type="text"
                  value={value.botanicalName || ''}
                  onChange={(e) => update({ botanicalName: e.target.value })}
                  placeholder="e.g. Cuminum cyminum"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg italic"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Botanical Family
                </label>
                <input
                  type="text"
                  value={value.botanicalFamily || ''}
                  onChange={(e) => update({ botanicalFamily: e.target.value })}
                  placeholder="e.g. Apiaceae"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Product Form
                </label>
                <input
                  type="text"
                  value={value.productForm || ''}
                  onChange={(e) => update({ productForm: e.target.value })}
                  placeholder="e.g. Whole Seeds / Powder"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Name (English - en)
                </label>
                <input
                  type="text"
                  value={value.englishName || ''}
                  onChange={(e) => update({ englishName: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Name (Malayalam - മലയാളം)
                </label>
                <input
                  type="text"
                  value={value.malayalamName || ''}
                  onChange={(e) => update({ malayalamName: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Name (Hindi - हिन्दी)
                </label>
                <input
                  type="text"
                  value={value.hindiName || ''}
                  onChange={(e) => update({ hindiName: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Name (Tamil - தமிழ்)
                </label>
                <input
                  type="text"
                  value={value.tamilName || ''}
                  onChange={(e) => update({ tamilName: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Name (Kannada - ಕನ್ನಡ)
                </label>
                <input
                  type="text"
                  value={value.kannadaName || ''}
                  onChange={(e) => update({ kannadaName: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Name (Telugu - తెలుగు)
                </label>
                <input
                  type="text"
                  value={value.teluguName || ''}
                  onChange={(e) => update({ teluguName: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Key Features (Comma-separated)
                </label>
                <input
                  type="text"
                  value={joinCsv(value.keyFeatures)}
                  onChange={(e) => update({ keyFeatures: splitCsv(e.target.value) })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Culinary / Practical Uses (Comma-sep)
                </label>
                <input
                  type="text"
                  value={joinCsv(value.culinaryUses)}
                  onChange={(e) => update({ culinaryUses: splitCsv(e.target.value) })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Storage Instructions
                </label>
                <input
                  type="text"
                  value={value.storageInstructions || ''}
                  onChange={(e) => update({ storageInstructions: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Nutritional Benefits (Comma-separated)
                </label>
                <input
                  type="text"
                  value={joinCsv(value.nutritionalBenefits)}
                  onChange={(e) => update({ nutritionalBenefits: splitCsv(e.target.value) })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  General Safety Precautions (Comma-separated)
                </label>
                <input
                  type="text"
                  value={joinCsv(value.generalPrecautions)}
                  onChange={(e) => update({ generalPrecautions: splitCsv(e.target.value) })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* 2. V8 Taxation, Package Sizes & Web Price Research */}
          <div className="pt-3 border-t border-slate-800">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-sky-400 mb-3 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              2. V8 Taxation Reference, Available Packing Sizes & Web Market Price Range (Section 21)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Available Packing Sizes (Comma-sep)
                </label>
                <input
                  type="text"
                  value={joinCsv(value.availablePackingSizes)}
                  onChange={(e) => update({ availablePackingSizes: splitCsv(e.target.value) })}
                  placeholder="50 g, 100 g, 250 g, 500 g, 1 kg"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  GST Classification Reference Note
                </label>
                <input
                  type="text"
                  value={value.gstReference || ''}
                  onChange={(e) => update({ gstReference: e.target.value })}
                  placeholder="GST Schedule / HSN basis"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Lowest Verified Web Price (₹)
                </label>
                <input
                  type="number"
                  value={value.lowestWebPrice ?? ''}
                  onChange={(e) =>
                    update({
                      lowestWebPrice: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Read from AI Research"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-emerald-300 font-mono rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Highest Verified Web Price (₹)
                </label>
                <input
                  type="number"
                  value={value.highestWebPrice ?? ''}
                  onChange={(e) =>
                    update({
                      highestWebPrice: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Read from AI Research"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-amber-300 font-mono rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* 3. V9 Approved SEO Metadata & Canonical Slug (Sections 4–8) */}
          <div className="pt-3 border-t border-slate-800 space-y-3" id={`${idPrefix}-v9-seo-section`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                3. Approved SEO Metadata & Canonical Public URL (V9 Sections 4–8)
              </h4>
              {value.seoUpdatedAt && (
                <span className="text-[10px] text-slate-500">
                  Last SEO Sync: {new Date(value.seoUpdatedAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    SEO Title (Target 50–60 chars, Max 120)
                  </label>
                  <span
                    className={`text-[10px] font-mono ${
                      (value.seoTitle?.length || 0) > 120
                        ? 'text-rose-400'
                        : (value.seoTitle?.length || 0) >= 50 && (value.seoTitle?.length || 0) <= 60
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {value.seoTitle?.length || 0}/120
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={120}
                  value={value.seoTitle || ''}
                  onChange={(e) => update({ seoTitle: e.target.value })}
                  placeholder="e.g. Cumin Seeds (Jeera) | Whole Cumin | LeafyEarth"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                  id={`${idPrefix}-seo-title-input`}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    URL Slug (Lowercase ASCII, Max 100)
                  </label>
                  <span className="text-[10px] font-mono text-indigo-300">
                    /products/{value.urlSlug || 'slug'}
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={100}
                  value={value.urlSlug || ''}
                  onChange={(e) => update({ urlSlug: normalizeUrlSlugClient(e.target.value) })}
                  placeholder="e.g. cumin-seeds-jeera-whole"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-indigo-300 font-mono rounded-lg"
                  id={`${idPrefix}-url-slug-input`}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Meta Description (Target 140–160 chars, Max 320)
                  </label>
                  <span
                    className={`text-[10px] font-mono ${
                      (value.metaDescription?.length || 0) > 320
                        ? 'text-rose-400'
                        : (value.metaDescription?.length || 0) >= 140 &&
                          (value.metaDescription?.length || 0) <= 160
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {value.metaDescription?.length || 0}/320
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={320}
                  value={value.metaDescription || ''}
                  onChange={(e) => update({ metaDescription: e.target.value })}
                  placeholder="Shop whole cumin seeds (Jeera / Cuminum cyminum) with warm earthy aroma..."
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                  id={`${idPrefix}-meta-desc-input`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  SEO Keywords (5–12 Comma-separated terms)
                </label>
                <textarea
                  rows={2}
                  value={joinCsv(value.seoKeywords)}
                  onChange={(e) => update({ seoKeywords: splitCsv(e.target.value) })}
                  placeholder="cumin seeds, jeera, whole cumin, cuminum cyminum, indian spices"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                  id={`${idPrefix}-seo-keywords-input`}
                />
              </div>
            </div>
          </div>

          {/* 4. V10 AI Commerce, Identifiers (GTIN/MPN/FSSAI) & Merchant Attributes */}
          <div className="pt-3 border-t border-slate-800 space-y-3" id={`${idPrefix}-v10-commerce-section`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-cyan-300">
                  4. AI Commerce, GS1 Identifiers & Feed Discoverability (V10 Sections 12–15)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  Publish to Public Feeds & AI Discovery:
                </span>
                <button
                  type="button"
                  onClick={() => update({ aiCommerceEnabled: !value.aiCommerceEnabled })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
                    value.aiCommerceEnabled
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                  id={`${idPrefix}-ai-commerce-toggle`}
                >
                  {value.aiCommerceEnabled ? 'Enabled (Published)' : 'Disabled (Draft Only)'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Verified GTIN (8/12/13/14 digits)
                  </label>
                  {gtinCheck && (
                    <span
                      className={`text-[9px] font-bold ${
                        gtinCheck.valid ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {gtinCheck.valid ? `✓ ${gtinCheck.format}` : 'Invalid Checksum'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={value.gtin || ''}
                  onChange={(e) => update({ gtin: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="Manufacturer GS1 barcode only"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 font-mono rounded-lg"
                  id={`${idPrefix}-gtin-input`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  MPN (Manufacturer Part No.)
                </label>
                <input
                  type="text"
                  value={value.mpn || ''}
                  onChange={(e) => update({ mpn: e.target.value })}
                  placeholder="Optional verified MPN"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 font-mono rounded-lg"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    FSSAI License No. (14 digits)
                  </label>
                  {value.fssaiLicenseNumber && (
                    <span className={`text-[9px] font-bold ${fssaiValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fssaiValid ? '✓ 14-digit FSSAI' : 'Must be 14 digits'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={14}
                  value={value.fssaiLicenseNumber || ''}
                  onChange={(e) => update({ fssaiLicenseNumber: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="14-digit FSSAI number"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 font-mono rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Country of Origin
                </label>
                <input
                  type="text"
                  value={value.countryOfOrigin || 'India'}
                  onChange={(e) => update({ countryOfOrigin: e.target.value })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Google Product Category
                </label>
                <input
                  type="text"
                  value={value.googleProductCategory || ''}
                  onChange={(e) => update({ googleProductCategory: e.target.value })}
                  placeholder="Food, Beverages & Tobacco > Food Items > Seasonings & Spices"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Store Product Type (Taxonomy)
                </label>
                <input
                  type="text"
                  value={value.productType || ''}
                  onChange={(e) => update({ productType: e.target.value })}
                  placeholder="Spices & Groceries > Whole Spices"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                    Net Weight (Mass)
                  </label>
                  <input
                    type="number"
                    value={value.netWeight ?? ''}
                    onChange={(e) =>
                      update({ netWeight: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    placeholder="100"
                    className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                    Mass Unit
                  </label>
                  <select
                    value={value.netWeightUnit || 'g'}
                    onChange={(e) => update({ netWeightUnit: e.target.value })}
                    className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="mg">mg</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                    Net Volume (Liquid)
                  </label>
                  <input
                    type="number"
                    value={value.netVolume ?? ''}
                    onChange={(e) =>
                      update({ netVolume: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    placeholder="250"
                    className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                    Volume Unit
                  </label>
                  <select
                    value={value.netVolumeUnit || 'ml'}
                    onChange={(e) => update({ netVolumeUnit: e.target.value })}
                    className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                  >
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Product Highlights (Comma-separated, 4–6 bullets)
                </label>
                <input
                  type="text"
                  value={joinCsv(value.productHighlights)}
                  onChange={(e) => update({ productHighlights: splitCsv(e.target.value) })}
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Dietary Attributes (Comma-separated)
                </label>
                <input
                  type="text"
                  value={joinCsv(value.dietaryAttributes)}
                  onChange={(e) => update({ dietaryAttributes: splitCsv(e.target.value) })}
                  placeholder="Vegetarian, Vegan, Gluten-Free"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                  Allergen Information (Comma-separated)
                </label>
                <input
                  type="text"
                  value={joinCsv(value.allergenInformation)}
                  onChange={(e) => update({ allergenInformation: splitCsv(e.target.value) })}
                  placeholder="Packed in a facility handling tree nuts"
                  className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* 5. Conditional Ayurvedic Toggle & 21 Fields (Section 18.2 & 18.3) */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  5. Is Ayurvedic Product? (Section 18.3 Conditional Monograph)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => update({ isAyurvedicProduct: true })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    value.isAyurvedicProduct
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                  id={`${idPrefix}-ayurvedic-yes`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => update({ isAyurvedicProduct: false })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    !value.isAyurvedicProduct
                      ? 'bg-rose-700 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                  id={`${idPrefix}-ayurvedic-no`}
                >
                  No
                </button>
              </div>
            </div>

            {value.isAyurvedicProduct && (
              <div
                className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/50 space-y-3"
                id={`${idPrefix}-ayurvedic-fields-panel`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-300 mb-1 uppercase">
                      Sanskrit Name
                    </label>
                    <input
                      type="text"
                      value={value.sanskritName || ''}
                      onChange={(e) => update({ sanskritName: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-emerald-300 mb-1 uppercase">
                      Ayurvedic Classification
                    </label>
                    <input
                      type="text"
                      value={value.ayurvedicClassification || ''}
                      onChange={(e) => update({ ayurvedicClassification: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-emerald-300 mb-1 uppercase">
                    Classical Ayurvedic Description
                  </label>
                  <textarea
                    rows={2}
                    value={value.ayurvedicDescription || ''}
                    onChange={(e) => update({ ayurvedicDescription: e.target.value })}
                    className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Rasa (Comma-sep)
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.rasa)}
                      onChange={(e) => update({ rasa: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Guna (Comma-sep)
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.guna)}
                      onChange={(e) => update({ guna: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Virya
                    </label>
                    <input
                      type="text"
                      value={value.virya || ''}
                      onChange={(e) => update({ virya: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Vipaka
                    </label>
                    <input
                      type="text"
                      value={value.vipaka || ''}
                      onChange={(e) => update({ vipaka: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Prabhava
                    </label>
                    <input
                      type="text"
                      value={value.prabhava || ''}
                      onChange={(e) => update({ prabhava: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Vata Effect
                    </label>
                    <input
                      type="text"
                      value={value.vataEffect || ''}
                      onChange={(e) => update({ vataEffect: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Pitta Effect
                    </label>
                    <input
                      type="text"
                      value={value.pittaEffect || ''}
                      onChange={(e) => update({ pittaEffect: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Kapha Effect
                    </label>
                    <input
                      type="text"
                      value={value.kaphaEffect || ''}
                      onChange={(e) => update({ kaphaEffect: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Medicinal Parts Used (Comma-sep)
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.medicinalPartsUsed)}
                      onChange={(e) => update({ medicinalPartsUsed: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Medicinal Uses (Comma-sep)
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.ayurvedicMedicinalUses)}
                      onChange={(e) => update({ ayurvedicMedicinalUses: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Classical Formulations (Comma-sep)
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.ayurvedicFormulations)}
                      onChange={(e) => update({ ayurvedicFormulations: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Usage Methods (Comma-sep)
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.ayurvedicUsageMethods)}
                      onChange={(e) => update({ ayurvedicUsageMethods: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Anupana / Adjuvants (Comma-sep)
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.anupana)}
                      onChange={(e) => update({ anupana: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Typical Dosage Note
                    </label>
                    <input
                      type="text"
                      value={value.ayurvedicDosage || ''}
                      onChange={(e) => update({ ayurvedicDosage: e.target.value })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Ayurvedic Precautions
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.ayurvedicPrecautions)}
                      onChange={(e) => update({ ayurvedicPrecautions: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Contraindications
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.contraindications)}
                      onChange={(e) => update({ contraindications: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                      Drug / Herb Interactions
                    </label>
                    <input
                      type="text"
                      value={joinCsv(value.drugInteractions)}
                      onChange={(e) => update({ drugInteractions: splitCsv(e.target.value) })}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default ProductMasterV8Section;
