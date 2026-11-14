import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Leaf, Scale, Sparkles } from 'lucide-react';
import type { ProductPerformance } from '../types';

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

  return (
    <div className="mt-4 bg-[#111115] border border-slate-800 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-4 py-3 flex items-center justify-between text-left bg-[#15151a] hover:bg-[#191920] transition cursor-pointer"
        id={`${idPrefix}-v8-section-toggle`}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
            Botanical, 6-Language Names, Health/Ayurvedic Monograph & Market Intelligence (V8)
          </span>
          {value.isAyurvedicProduct && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-700">
              Ayurvedic Enabled
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
                  placeholder="e.g. Curcuma longa"
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
                  placeholder="e.g. Zingiberaceae"
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
                  placeholder="e.g. Fine Powder / Whole"
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

          {/* 3. Conditional Ayurvedic Toggle & 21 Fields (Section 18.2 & 18.3) */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  Is Ayurvedic Product? (Section 18.3 Conditional Monograph)
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
