import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  ExternalLink,
  FileCheck,
  FileText,
  GitCompare,
  Globe,
  History,
  Image as ImageIcon,
  Leaf,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useCRM } from '../store';
import {
  buildStructuredHealthBenefits,
  buildStructuredNutritionalInformation,
  buildStructuredSafetyPrecautionsText,
  formatSafetyPrecautionsArrayToText,
  safetyPrecautionsTextToLines,
} from '../utils/healthNutritionTemplates';
import type {
  AIAyurvedaApplicability,
  AICommerceFeedRecord,
  AICommerceGeneratedPayload,
  AICommercePlatformId,
  AICommercePlatformSetting,
  AICommerceStagingRecord,
  AICommerceValidationRecord,
  AIEvidenceLevel,
  AIHealthBenefit,
  AIProductContentPayload,
  AIProductDraft,
  AIProductDraftStatus,
  AIProductEvent,
  AIProductImage,
  AIProductResearchRecord,
  AIProductSEOContent,
  AIProductSubmenuId,
  AIProductSyncLog,
  AIProductVersion,
  AIReviewStatus,
  ProductFAQItem,
  WebPriceSourceOffer,
} from '../types';
import {
  applyAICommerceDraftClient,
  applyAIDraftSEOToMasterClient,
  applyAIDraftToMaster,
  approveAICommerceDraftClient,
  approveAIDraftSEOClient,
  approveOrRejectAIProductDraft,
  approveOrRejectAIProductImage,
  approveOrRejectAIProductResearch,
  buildAICommerceFeedClient,
  calculateMarketPriceRangeClient,
  checkProductSlugAvailabilityClient,
  compareAIDraftWithMaster,
  ensureClientFirebaseStorageUrl,
  fetchAICommerceOverviewClient,
  fetchAIConfigStatus,
  fetchAIProductDraftDetail,
  fetchAIProductDrafts,
  generateAICommerceDraftClient,
  generateAIDraftSEOClient,
  generateAIProductDraft,
  generateAIProductImageClient,
  isFirebaseStorageUrlClient,
  MasterFieldComparisonItem,
  normalizeUrlSlugClient,
  regenerateAIProductDraft,
  saveAICommerceDraftClient,
  saveAICommercePlatformSettingClient,
  saveAIDraftSEOEditsClient,
  saveAIProductDraftEdits,
  saveAIProductResearchClient,
  submitAIProductDraftForReview,
  validateProductCommerceReadinessClient,
} from '../utils/aiProductContentApi';

interface AIProductContentViewProps {
  activeSubmenu: AIProductSubmenuId;
  onSubmenuChange: (submenu: AIProductSubmenuId) => void;
}

const SUBMENU_TABS: Array<{
  id: AIProductSubmenuId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'generate', label: 'Generate Product Content', shortLabel: 'Generate', icon: Sparkles },
  { id: 'drafts', label: 'AI Generated Content', shortLabel: 'Drafts Grid', icon: FileText },
  { id: 'review', label: 'Review & Edit Content', shortLabel: 'Review & Edit', icon: Edit3 },
  { id: 'images', label: 'AI Product Images', shortLabel: 'Images (1000×1000)', icon: ImageIcon },
  { id: 'research', label: 'Taxation & Market Research', shortLabel: 'Tax & Web Price', icon: Scale },
  { id: 'commerce', label: 'AI Commerce & Discoverability', shortLabel: 'AI Commerce (V10)', icon: Globe },
  { id: 'sync', label: 'Update Product Master', shortLabel: 'Master Sync', icon: GitCompare },
  { id: 'history', label: 'Generation History', shortLabel: 'History & Audit', icon: History },
  { id: 'usage', label: 'AI Usage & Cost', shortLabel: 'Usage & Cost', icon: DollarSign },
  { id: 'config', label: 'AI Configuration', shortLabel: 'AI Config', icon: Settings },
];

const STATUS_BADGE_STYLES: Record<AIProductDraftStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-800 border-amber-200',
  IN_REVIEW: 'bg-blue-50 text-blue-800 border-blue-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200',
  APPLIED: 'bg-purple-50 text-purple-800 border-purple-200',
  FAILED: 'bg-red-100 text-red-900 border-red-300',
};

const ALLOWED_GST_SLABS = [0, 5, 12, 18, 28];

function formatArrayAsLines(arr?: string[] | null): string {
  return Array.isArray(arr) ? arr.join('\n') : '';
}

function parseLinesToArray(text: string): string[] {
  return String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const AIProductContentView: React.FC<AIProductContentViewProps> = ({
  activeSubmenu,
  onSubmenuChange,
}) => {
  const {
    products,
    units,
    categories,
    customCategories,
    brands,
    customBrands,
    brandOwners,
    customBrandOwners,
    currentUser,
    reloadFirestoreData,
  } = useCRM();

  const allCategoryRecords = useMemo(() => {
    const list = Array.isArray(categories) ? categories : [];
    const seen = new Set<string>();
    return list
      .filter((c: any) => {
        const nm = String(c?.name || '').trim();
        if (!nm || seen.has(nm.toLowerCase())) return false;
        seen.add(nm.toLowerCase());
        return true;
      })
      .sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [categories]);

  const allBrandRecords = useMemo(() => {
    const list = Array.isArray(brands) ? brands : [];
    const seen = new Set<string>();
    return list
      .filter((b: any) => {
        const nm = String(b?.name || '').trim();
        if (!nm || seen.has(nm.toLowerCase())) return false;
        seen.add(nm.toLowerCase());
        return true;
      })
      .sort((a: any, b: any) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [brands]);

  const computeNextEightDigitSku = useCallback(() => {
    let highest = 10000000;
    for (const p of products || []) {
      const raw = String(p?.sku ?? '').trim();
      if (/^[0-9]{8}$/.test(raw)) {
        const num = Number.parseInt(raw, 10);
        if (Number.isFinite(num) && num > highest && num < 99999999) {
          highest = num;
        }
      }
    }
    return String(highest + 1).padStart(8, '0');
  }, [products]);

  const findMatchingProductByName = useCallback(
    (candidateNames: Array<string | null | undefined>) => {
      const norm = (v: unknown) =>
        String(v || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
      const base = (v: unknown) =>
        norm(v)
          .replace(/\([^)]*\)/g, '')
          .trim()
          .replace(/\s+/g, ' ');

      const valid = (candidateNames || []).map(norm).filter((s) => s.length >= 2);
      for (const cand of valid) {
        const exact = (products || []).find(
          (p) => norm(p.name) === cand || norm(p.englishName) === cand
        );
        if (exact) return exact;
      }
      const baseValid = valid.map(base).filter((s) => s.length >= 3);
      for (const bCand of baseValid) {
        const hit = (products || []).find(
          (p) => base(p.name) === bCand || base(p.englishName) === bCand
        );
        if (hit) return hit;
      }
      return null;
    },
    [products]
  );

  const actor = useMemo(
    () => ({
      id: currentUser?.id || 'admin_user',
      email: currentUser?.email || 'admin@leafymart.com',
      role: currentUser?.role || 'Administrator',
    }),
    [currentUser]
  );

  // List & global state
  const [draftsList, setDraftsList] = useState<
    Array<
      AIProductDraft & {
        currentVersion?: AIProductVersion | null;
        imagesCount?: number;
        latestResearch?: AIProductResearchRecord | null;
      }
    >
  >([]);
  const [allVersions, setAllVersions] = useState<AIProductVersion[]>([]);
  const [allSyncLogs, setAllSyncLogs] = useState<AIProductSyncLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loadingList, setLoadingList] = useState<boolean>(false);

  // Selected draft detail state
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftDetail, setDraftDetail] = useState<{
    draft: AIProductDraft;
    currentVersion: AIProductVersion | null;
    versions: AIProductVersion[];
    images: AIProductImage[];
    research: AIProductResearchRecord | null;
    events: AIProductEvent[];
    syncLogs: AIProductSyncLog[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Banner notifications
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(
    null
  );

  // 1. Generate form state
  const [genProductName, setGenProductName] = useState<string>('');
  const [genIsAyurvedicProduct, setGenIsAyurvedicProduct] = useState<boolean>(false);
  const [genMasterProductId, setGenMasterProductId] = useState<string>('');
  const [genCategoryHint, setGenCategoryHint] = useState<string>('');
  const [genBrandHint, setGenBrandHint] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // 3. Review & Edit form state
  const [editedPayload, setEditedPayload] = useState<AIProductContentPayload | null>(null);
  const [linkedMasterId, setLinkedMasterId] = useState<string>('');
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [savingReview, setSavingReview] = useState<boolean>(false);

  // 4. Image generation state
  const [imgProductForm, setImgProductForm] = useState<string>('Dried Whole Fruit');
  const [imgPackagingStyle, setImgPackagingStyle] = useState<string>(
    'Standard Brown Kraft Stand-Up Zipper Pouch with Cream Label, Clear Lower Window & Foreground Heap'
  );
  const [imgCustomPrompt, setImgCustomPrompt] = useState<string>('');
  const [generatingImage, setGeneratingImage] = useState<boolean>(false);

  // 5. Taxation & Market Research state
  const [taxHsnCode, setTaxHsnCode] = useState<string>('09103030');
  const [taxGstRate, setTaxGstRate] = useState<number>(5);
  const [taxGstReference, setTaxGstReference] = useState<string>(
    'GST Schedule I – Verify 4–8 digit HSN classification'
  );
  const [resSelectedPackingSize, setResSelectedPackingSize] = useState<string>('100 g');
  const [resUnit, setResUnit] = useState<string>('PAC');
  const [resAvailableSizesText, setResAvailableSizesText] = useState<string>(
    '50 g, 100 g, 250 g, 500 g, 1 kg'
  );
  const [resOffers, setResOffers] = useState<WebPriceSourceOffer[]>([]);
  const [savingResearch, setSavingResearch] = useState<boolean>(false);

  // 6. Master Sync Comparison & 16-Field Product Master Updation state
  const [comparisonItems, setComparisonItems] = useState<MasterFieldComparisonItem[]>([]);
  const [selectedSyncFields, setSelectedSyncFields] = useState<Set<string>>(new Set());
  const [syncTargetMasterId, setSyncTargetMasterId] = useState<string>('');
  const [isNewMasterProduct, setIsNewMasterProduct] = useState<boolean>(false);
  const [syncImageAction, setSyncImageAction] = useState<'none' | 'replace_primary' | 'append_gallery'>(
    'replace_primary'
  );
  const [loadingCompare, setLoadingCompare] = useState<boolean>(false);
  const [applyingSync, setApplyingSync] = useState<boolean>(false);
  const [customCategoryInput, setCustomCategoryInput] = useState<string>('');
  const [masterUpdationForm, setMasterUpdationForm] = useState<{
    name: string;
    sku: string;
    packingSize: string;
    unit: string;
    mrp: number;
    onlinePrice: number;
    shopPrice: number;
    gstPercentage: number;
    categories: string[];
    leafycategory: string;
    brand: string;
    brandOwner: string;
    stockIn: number;
    imageUrl: string;
    images: string[];
    uniqueSpec1: string;
    uniqueSpec2: string;
    uniqueSpec3: string;
    isAyurvedicProduct: boolean;
    culinarydetails: boolean;
    aiContentLink: string;
    aiDraftId: string;
  }>({
    name: '',
    sku: '10000001',
    packingSize: '100 g',
    unit: 'PAC',
    mrp: 0,
    onlinePrice: 0,
    shopPrice: 0,
    gstPercentage: 5,
    categories: [],
    leafycategory: '',
    brand: 'LeafyMart',
    brandOwner: 'Vio Nature Science',
    stockIn: 0,
    imageUrl: '',
    images: [],
    uniqueSpec1: '',
    uniqueSpec2: '',
    uniqueSpec3: '',
    isAyurvedicProduct: false,
    culinarydetails: false,
    aiContentLink: '',
    aiDraftId: '',
  });

  // 9. Config status
  const [aiConfig, setAiConfig] = useState<any>(null);

  // V9 SEO state (Review & Edit panel)
  const [seoForm, setSeoForm] = useState<AIProductSEOContent>({
    seoTitle: '',
    metaDescription: '',
    seoKeywords: [],
    urlSlug: '',
  });
  const [seoKeywordsInput, setSeoKeywordsInput] = useState<string>('');
  const [slugCheckState, setSlugCheckState] = useState<{
    checking: boolean;
    available?: boolean;
    normalizedSlug?: string;
    conflictProductId?: string | null;
    suggestedSlug?: string;
    error?: string;
  }>({ checking: false });
  const [savingSeo, setSavingSeo] = useState<boolean>(false);

  // V10 AI Commerce & Discoverability state
  const [commerceOverview, setCommerceOverview] = useState<{
    settings: AICommercePlatformSetting[];
    staging: AICommerceStagingRecord[];
    feeds: AICommerceFeedRecord[];
    validation: AICommerceValidationRecord[];
    readinessSummary: {
      totalProducts: number;
      commerceEnabledCount: number;
      publishedProjectionCount: number;
      activeSlugCount: number;
      readyCount: number;
      warningCount: number;
      blockedCount: number;
      disabledCount: number;
    };
  } | null>(null);
  const [loadingCommerce, setLoadingCommerce] = useState<boolean>(false);
  const [selectedCommerceProductId, setSelectedCommerceProductId] = useState<string>('');
  const [commerceForm, setCommerceForm] = useState<AICommerceGeneratedPayload>({
    seoTitle: '',
    metaDescription: '',
    seoKeywords: [],
    urlSlug: '',
    productHighlights: [],
    productFAQs: [],
    searchTags: [],
    dietaryAttributes: [],
    allergenInformation: '',
    googleProductCategory: 'Food, Beverages & Tobacco > Food Items > Seasonings & Spices > Herbs & Spices',
    productType: 'Spices & Botanicals',
    countryOfOrigin: 'India',
    netWeight: 100,
    netWeightUnit: 'g',
    netVolume: null,
    netVolumeUnit: null,
  });
  const [enableCommerceOnApply, setEnableCommerceOnApply] = useState<boolean>(true);
  const [busyCommerceAction, setBusyCommerceAction] = useState<boolean>(false);
  const [feedPreviewModal, setFeedPreviewModal] = useState<{
    title: string;
    format: string;
    content: string;
  } | null>(null);

  const loadDraftsList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetchAIProductDrafts({
        status: statusFilter,
        search: searchQuery,
      });
      const list = res.drafts || [];
      setDraftsList(list);
      if (res.versions) setAllVersions(res.versions);
      if (res.syncLogs) setAllSyncLogs(res.syncLogs);
      if (!selectedDraftId && list.length > 0) {
        setSelectedDraftId(list[0].id);
      }
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to load AI product drafts' });
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter, searchQuery, selectedDraftId]);

  const populateMasterUpdationForm = useCallback(
    (params: {
      draft: AIProductDraft;
      payload: AIProductContentPayload | null;
      research: AIProductResearchRecord | null;
      images: AIProductImage[];
      matchedMaster: Record<string, any> | null;
      nextAutoSku?: string;
    }) => {
      const { draft, payload, research, images, matchedMaster } = params;
      const autoSku = params.nextAutoSku || computeNextEightDigitSku();
      const existingSku = String(matchedMaster?.sku || '').trim();
      const resolvedSku = /^[0-9]{8}$/.test(existingSku) ? existingSku : autoSku;
      const approvedOrFirstImg =
        (images || []).find((i) => i.status === 'APPROVED') || (images || [])[0] || null;
      const resolvedImgUrl =
        matchedMaster?.imageUrl || approvedOrFirstImg?.preview_url || '';
      const resolvedCategories: string[] =
        Array.isArray(matchedMaster?.categories) && matchedMaster.categories.length > 0
          ? matchedMaster.categories
          : matchedMaster?.category
          ? [String(matchedMaster.category)]
          : payload?.category
          ? [String(payload.category)]
          : [];

      const brandVal = matchedMaster?.brand || draft.brand_hint || 'LeafyMart';
      const knownBrandObj = (brands || []).find(
        (b: any) => String(b?.name || '').toLowerCase() === String(brandVal).toLowerCase()
      );
      const brandOwnerVal =
        matchedMaster?.brandOwner || (knownBrandObj as any)?.owner || 'Vio Nature Science';

      setMasterUpdationForm({
        name:
          matchedMaster?.name ||
          payload?.english_product_name ||
          draft.source_product_name ||
          '',
        sku: resolvedSku,
        packingSize:
          matchedMaster?.packingSize || research?.packing?.selectedPackingSize || '100 g',
        unit: matchedMaster?.unit || research?.packing?.unit || 'PAC',
        mrp: Number(
          matchedMaster?.mrp ??
            research?.marketResearch?.highestPrice ??
            research?.marketResearch?.lowestPrice ??
            0
        ),
        onlinePrice: Number(
          matchedMaster?.onlinePrice ??
            matchedMaster?.offerPrice ??
            research?.marketResearch?.lowestPrice ??
            0
        ),
        shopPrice: Number(
          matchedMaster?.shopPrice ??
            research?.marketResearch?.lowestPrice ??
            0
        ),
        gstPercentage: Number(
          matchedMaster?.gstPercentage ?? research?.taxation?.gstRatePercent ?? 5
        ),
        categories: resolvedCategories,
        leafycategory:
          payload?.category || matchedMaster?.leafycategory || draft.category_hint || '',
        brand: brandVal,
        brandOwner: brandOwnerVal,
        stockIn: Number(matchedMaster?.stockIn ?? matchedMaster?.stock ?? 0),
        imageUrl: resolvedImgUrl,
        images:
          Array.isArray(matchedMaster?.images) && matchedMaster.images.length > 0
            ? matchedMaster.images
            : resolvedImgUrl
            ? [resolvedImgUrl]
            : [],
        uniqueSpec1: matchedMaster?.uniqueSpec1 || payload?.key_features?.[0] || '',
        uniqueSpec2: matchedMaster?.uniqueSpec2 || payload?.key_features?.[1] || '',
        uniqueSpec3: matchedMaster?.uniqueSpec3 || payload?.key_features?.[2] || '',
        isAyurvedicProduct:
          matchedMaster?.ayurvedicproduct !== undefined
            ? Boolean(matchedMaster.ayurvedicproduct)
            : matchedMaster?.isAyurvedicProduct !== undefined
            ? Boolean(matchedMaster.isAyurvedicProduct)
            : draft.is_ayurvedic_product !== undefined
            ? Boolean(draft.is_ayurvedic_product)
            : payload?.ayurveda_applicability === 'applicable',
        culinarydetails: matchedMaster?.culinarydetails === true,
        aiContentLink: (() => {
          const verId = draft.approved_version_id || draft.current_version_id || '';
          const baseOrigin =
            typeof window !== 'undefined' && window.location?.origin
              ? window.location.origin
              : 'https://www.leafymart.com';
          return (
            matchedMaster?.aiContentLink ||
            `${baseOrigin}/api/admin/ai-products/${encodeURIComponent(draft.id)}${verId ? `?version=${encodeURIComponent(verId)}` : ''}`
          );
        })(),
        aiDraftId: draft.id || matchedMaster?.aiDraftId || '',
      });

      if (resolvedImgUrl && !isFirebaseStorageUrlClient(resolvedImgUrl)) {
        ensureClientFirebaseStorageUrl({
          draftId: draft.id,
          targetProductId: matchedMaster?.id ? String(matchedMaster.id) : undefined,
          sourceUrl: resolvedImgUrl,
        })
          .then((uploaded) => {
            if (isFirebaseStorageUrlClient(uploaded.downloadUrl)) {
              setMasterUpdationForm((prev) => ({
                ...prev,
                imageUrl: uploaded.downloadUrl,
                images: Array.from(
                  new Set([
                    uploaded.downloadUrl,
                    ...prev.images.filter((u) => isFirebaseStorageUrlClient(u)),
                  ])
                ),
              }));
            }
          })
          .catch(() => null);
      }
    },
    [brands, computeNextEightDigitSku]
  );

  const loadSelectedDraftDetail = useCallback(
    async (draftId: string) => {
      setLoadingDetail(true);
      try {
        const res = await fetchAIProductDraftDetail(draftId);
        const payload: AIProductContentPayload | null =
          res.currentVersion?.edited_payload || res.currentVersion?.generated_payload || null;

        // Auto-search product name in `products` table: link if available, otherwise treat as new product
        let matchedMaster = res.draft.master_product_id
          ? products.find((p) => p.id === res.draft.master_product_id) || null
          : null;
        if (!matchedMaster) {
          matchedMaster = findMatchingProductByName([
            res.draft.source_product_name,
            payload?.english_product_name,
          ]);
        }

        const resolvedMasterId = matchedMaster ? matchedMaster.id : '';
        setIsNewMasterProduct(!matchedMaster);
        setLinkedMasterId(resolvedMasterId);
        setSyncTargetMasterId(resolvedMasterId);

        setDraftDetail({
          draft: {
            ...res.draft,
            master_product_id: resolvedMasterId || null,
            master_product_name: matchedMaster?.name || null,
            master_product_sku: matchedMaster?.sku || null,
          },
          currentVersion: res.currentVersion,
          versions: res.versions || [],
          images: res.images || [],
          research: res.research || null,
          events: res.events || [],
          syncLogs: res.syncLogs || [],
        });

        populateMasterUpdationForm({
          draft: res.draft,
          payload,
          research: res.research || null,
          images: res.images || [],
          matchedMaster,
        });

        if (payload) {
          setEditedPayload(JSON.parse(JSON.stringify(payload)));
          if (payload.form) setImgProductForm(payload.form);
          const seoSource: AIProductSEOContent =
            res.currentVersion?.seo_edited ||
            res.currentVersion?.seo_generated ||
            payload.seo || {
              seoTitle: `${payload.english_product_name} | LeafyMart`,
              metaDescription: (payload.description || '').slice(0, 155),
              seoKeywords: [
                payload.english_product_name.toLowerCase(),
                (payload.category || 'natural products').toLowerCase(),
                'leafymart',
                'pure quality',
                'buy online india',
              ],
              urlSlug: normalizeUrlSlugClient(payload.english_product_name),
            };
          setSeoForm({
            seoTitle: seoSource.seoTitle || '',
            metaDescription: seoSource.metaDescription || '',
            seoKeywords: Array.isArray(seoSource.seoKeywords) ? seoSource.seoKeywords : [],
            urlSlug: seoSource.urlSlug || '',
          });
          setSeoKeywordsInput((seoSource.seoKeywords || []).join(', '));
        } else {
          setEditedPayload(null);
        }

        if (res.research) {
          setTaxHsnCode(res.research.taxation?.hsnCode || '09103030');
          setTaxGstRate(Number(res.research.taxation?.gstRatePercent ?? 5));
          setTaxGstReference(res.research.taxation?.gstReference || '');
          setResSelectedPackingSize(res.research.packing?.selectedPackingSize || '100 g');
          setResUnit(res.research.packing?.unit || 'PAC');
          setResAvailableSizesText(
            (
              res.research.packing?.availablePackingSizes || ['50 g', '100 g', '250 g', '500 g', '1 kg']
            ).join(', ')
          );
          setResOffers(res.research.marketResearch?.offers || []);
        } else {
          const defaultPack = matchedMaster?.packingSize || '100 g';
          setTaxHsnCode(matchedMaster?.hsnCode || '09103030');
          setTaxGstRate(Number(matchedMaster?.gstPercentage ?? 5));
          setTaxGstReference(
            matchedMaster?.gstReference ||
              'GST Schedule I – Verify 4–8 digit HSN classification against official CBIC tariff'
          );
          setResSelectedPackingSize(defaultPack);
          setResUnit(matchedMaster?.unit || 'PAC');
          setResAvailableSizesText(
            (matchedMaster?.availablePackingSizes || ['50 g', '100 g', '250 g', '500 g', '1 kg']).join(
              ', '
            )
          );
          setResOffers(matchedMaster?.webPriceSources || []);
        }
      } catch (err: any) {
        setBanner({ type: 'error', message: err?.message || 'Failed to load draft details' });
      } finally {
        setLoadingDetail(false);
      }
    },
    [products, findMatchingProductByName, populateMasterUpdationForm]
  );

  useEffect(() => {
    loadDraftsList();
    fetchAIConfigStatus().then(setAiConfig).catch(() => {});
  }, [loadDraftsList]);

  useEffect(() => {
    if (selectedDraftId) {
      loadSelectedDraftDetail(selectedDraftId);
    }
  }, [selectedDraftId, loadSelectedDraftDetail]);

  const loadComparison = useCallback(
    async (draftId: string, targetMasterId?: string) => {
      setLoadingCompare(true);
      try {
        const res = await compareAIDraftWithMaster(draftId, targetMasterId || syncTargetMasterId);
        const items: MasterFieldComparisonItem[] = res.comparison || [];
        setComparisonItems(items);
        if (res.masterProduct?.id) {
          setSyncTargetMasterId(String(res.masterProduct.id));
          setLinkedMasterId(String(res.masterProduct.id));
          setIsNewMasterProduct(false);
        } else {
          setSyncTargetMasterId('');
          setIsNewMasterProduct(true);
        }
        const payload =
          res.version?.edited_payload || res.version?.generated_payload || editedPayload || null;
        populateMasterUpdationForm({
          draft: res.draft || draftDetail?.draft,
          payload,
          research: res.approvedResearch || draftDetail?.research || null,
          images: draftDetail?.images || (res.approvedImage ? [res.approvedImage] : []),
          matchedMaster: res.masterProduct || null,
          nextAutoSku: res.nextAutoSku,
        });
        const autoSelected = new Set<string>();
        items.forEach((item) => {
          if (item.selectable && item.hasChanged) {
            autoSelected.add(item.fieldKey);
          }
        });
        setSelectedSyncFields(autoSelected);
      } catch (err: any) {
        setBanner({ type: 'error', message: err?.message || 'Failed to compare with master product' });
      } finally {
        setLoadingCompare(false);
      }
    },
    [syncTargetMasterId, editedPayload, draftDetail, populateMasterUpdationForm]
  );

  useEffect(() => {
    if (activeSubmenu === 'sync' && selectedDraftId) {
      loadComparison(selectedDraftId, syncTargetMasterId);
    }
  }, [activeSubmenu, selectedDraftId, syncTargetMasterId, loadComparison]);

  const liveMarketRange = useMemo(
    () => calculateMarketPriceRangeClient(resOffers, resSelectedPackingSize),
    [resOffers, resSelectedPackingSize]
  );

  const handleGenerateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genProductName.trim()) {
      setBanner({ type: 'error', message: 'Please enter a product name to generate content.' });
      return;
    }
    setIsGenerating(true);
    setBanner(null);
    try {
      const res = await generateAIProductDraft({
        productName: genProductName.trim(),
        productId: genMasterProductId || null,
        categoryHint: genCategoryHint.trim() || undefined,
        brandHint: genBrandHint.trim() || undefined,
        isAyurvedicProduct: genIsAyurvedicProduct,
        actor,
      });
      await loadDraftsList();
      if (res.draftId) {
        setSelectedDraftId(res.draftId);
        await loadSelectedDraftDetail(res.draftId);
      }
      setBanner({
        type: 'success',
        message: `AI Draft v${res.version || 1} generated for "${genProductName.trim()}". Review and edit below before approving.`,
      });
      onSubmenuChange('review');
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to generate AI draft' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraftEdits = async () => {
    if (!selectedDraftId || !editedPayload) return;
    setSavingReview(true);
    setBanner(null);
    try {
      await saveAIProductDraftEdits({
        draftId: selectedDraftId,
        editedPayload,
        masterProductId: linkedMasterId || null,
        actor,
      });
      await loadSelectedDraftDetail(selectedDraftId);
      await loadDraftsList();
      setBanner({
        type: 'success',
        message: 'Draft edits saved to staging (ai_product_versions). Master product remains untouched.',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to save draft edits' });
    } finally {
      setSavingReview(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!selectedDraftId) return;
    setSavingReview(true);
    try {
      if (editedPayload) {
        await saveAIProductDraftEdits({
          draftId: selectedDraftId,
          editedPayload,
          masterProductId: linkedMasterId || null,
          actor,
        });
      }
      await submitAIProductDraftForReview({ draftId: selectedDraftId, actor });
      await loadSelectedDraftDetail(selectedDraftId);
      await loadDraftsList();
      setBanner({ type: 'success', message: 'Draft status updated to IN_REVIEW.' });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to submit draft for review' });
    } finally {
      setSavingReview(false);
    }
  };

  const handleApproveOrRejectContent = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedDraftId) return;
    setSavingReview(true);
    setBanner(null);
    try {
      if (action === 'APPROVE' && editedPayload) {
        await saveAIProductDraftEdits({
          draftId: selectedDraftId,
          editedPayload,
          masterProductId: linkedMasterId || null,
          actor,
        });
      }
      await approveOrRejectAIProductDraft({
        draftId: selectedDraftId,
        action,
        rejectionReason: rejectionReasonInput || undefined,
        actor,
      });
      await loadSelectedDraftDetail(selectedDraftId);
      await loadDraftsList();
      setBanner({
        type: action === 'APPROVE' ? 'success' : 'info',
        message:
          action === 'APPROVE'
            ? 'AI Product Content APPROVED. You can now synchronize selected fields to Product Master.'
            : 'AI Product Content marked as REJECTED.',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || `Failed to ${action.toLowerCase()} draft` });
    } finally {
      setSavingReview(false);
    }
  };

  const handleRegenerateVersion = async () => {
    if (!selectedDraftId) return;
    setSavingReview(true);
    setBanner(null);
    try {
      const res = await regenerateAIProductDraft({ draftId: selectedDraftId, actor });
      await loadSelectedDraftDetail(selectedDraftId);
      await loadDraftsList();
      setBanner({
        type: 'success',
        message: `Generated new version v${res.versionRecord?.version_no || ''}. Previous versions are preserved in Generation History.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to regenerate version' });
    } finally {
      setSavingReview(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!selectedDraftId) return;
    setGeneratingImage(true);
    setBanner(null);
    try {
      await generateAIProductImageClient({
        draftId: selectedDraftId,
        productForm: imgProductForm,
        packagingStyle: imgPackagingStyle,
        customPrompt: imgCustomPrompt || undefined,
        actor,
      });
      await loadSelectedDraftDetail(selectedDraftId);
      await loadDraftsList();
      setBanner({
        type: 'success',
        message: '1000 × 1000 px pure-white (#FFFFFF) studio candidate image generated and staged.',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to generate 1000×1000 image' });
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleImageDecision = async (imageId: string, action: 'APPROVE' | 'REJECT') => {
    if (!selectedDraftId) return;
    try {
      await approveOrRejectAIProductImage({
        draftId: selectedDraftId,
        imageId,
        action,
        actor,
      });
      await loadSelectedDraftDetail(selectedDraftId);
      await loadDraftsList();
      setBanner({
        type: action === 'APPROVE' ? 'success' : 'info',
        message:
          action === 'APPROVE'
            ? '1000×1000 studio image APPROVED for optional Master synchronization.'
            : 'Candidate image marked as REJECTED.',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to update image status' });
    }
  };

  const handleSaveResearch = async (approveAfterSave = false) => {
    if (!selectedDraftId) return;
    setSavingResearch(true);
    setBanner(null);
    try {
      const availSizes = resAvailableSizesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await saveAIProductResearchClient({
        draftId: selectedDraftId,
        taxation: {
          hsnCode: taxHsnCode.trim(),
          gstRatePercent: Number(taxGstRate),
          gstReference: taxGstReference.trim(),
          confidence: 'high',
          needsManualVerification: false,
        },
        packing: {
          selectedPackingSize: (resSelectedPackingSize || '').trim(),
          unit: String(resUnit || 'PAC').trim().toUpperCase(),
          availablePackingSizes: availSizes,
        },
        offers: resOffers,
        actor,
      });

      if (approveAfterSave) {
        await approveOrRejectAIProductResearch({
          draftId: selectedDraftId,
          action: 'APPROVE',
          actor,
        });
      }

      await loadSelectedDraftDetail(selectedDraftId);
      await loadDraftsList();
      setBanner({
        type: 'success',
        message: approveAfterSave
          ? 'Taxation (HSN/GST), Packing Sizes & Web Price Research verified and APPROVED.'
          : 'Taxation & Market Research saved to staging (ai_product_research).',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to save taxation & market research' });
    } finally {
      setSavingResearch(false);
    }
  };

  const handleApplyToProductMaster = async () => {
    if (!selectedDraftId) return;
    setApplyingSync(true);
    setBanner(null);
    try {
      const ALWAYS_EXCLUDED_SET = new Set([
        'meeshoSales',
        'webPriceCheckedAt',
        'webPriceCurrency',
        'webPriceSources',
        'gstVerifiedAt',
        'gtin',
        'availablePackingSizes',
      ]);
      const NON_AYURVEDIC_EXCLUDED_SET = new Set([
        'anupana',
        'availablePackingSizes',
        'ayurvedicClassification',
        'ayurvedicDescription',
        'ayurvedicDosage',
        'ayurvedicFormulations',
        'ayurvedicMedicinalUses',
        'ayurvedicPrecautions',
        'ayurvedicReferences',
        'ayurvedicUsageMethods',
        'hindiName',
        'kannadaName',
        'kaphaEffect',
        'malayalamName',
        'manufacturerName',
        'medicinalPartsUsed',
        'mpn',
        'prabhava',
        'rasa',
        'sanskritName',
        'tamilName',
        'teluguName',
        'variants',
        'vataEffect',
        'vipaka',
        'virya',
      ]);
      const effectiveSelectedFields = Array.from(selectedSyncFields).filter((key) => {
        const compItem = comparisonItems.find((it) => it.fieldKey === key);
        const masterField = compItem?.masterField || '';
        if (ALWAYS_EXCLUDED_SET.has(key) || (masterField && ALWAYS_EXCLUDED_SET.has(masterField))) {
          return false;
        }
        if (!masterUpdationForm.isAyurvedicProduct) {
          if (NON_AYURVEDIC_EXCLUDED_SET.has(key)) return false;
          if (masterField && NON_AYURVEDIC_EXCLUDED_SET.has(masterField)) return false;
        }
        return true;
      });

      // Link selected Brand Owner from product_brand_owners -> export fssailicensenumber & certificate storage paths
      const matchedBrandOwnerDoc = (brandOwners || []).find(
        (bo: any) =>
          String(bo?.name || '').trim().toLowerCase() ===
          String(masterUpdationForm.brandOwner || '').trim().toLowerCase()
      );
      const linkedFssaiLicenseNumber = String(
        (matchedBrandOwnerDoc as any)?.fssailicensenumber ||
          (matchedBrandOwnerDoc as any)?.fssaiRegNo ||
          ''
      ).trim();
      const linkedCertifications = Array.isArray((matchedBrandOwnerDoc as any)?.certifications)
        ? (matchedBrandOwnerDoc as any).certifications
        : [];
      const linkedCertificateStoragePaths: string[] = Array.from(
        new Set(
          linkedCertifications
            .map((c: any) => String(c?.storagePath || '').trim())
            .filter(Boolean)
        )
      );

      const res = await applyAIDraftToMaster({
        draftId: selectedDraftId,
        masterProductId: syncTargetMasterId || null,
        selectedFields: effectiveSelectedFields,
        imageAction: syncImageAction,
        idempotencyKey: `sync_${selectedDraftId}_${Date.now()}`,
        masterProductOverrides: {
          ...masterUpdationForm,
          ...(linkedFssaiLicenseNumber ? { fssaiLicenseNumber: linkedFssaiLicenseNumber } : {}),
          ...(linkedCertificateStoragePaths.length > 0
            ? {
                certificateStoragePaths: linkedCertificateStoragePaths,
                certifications: linkedCertifications,
              }
            : {}),
          leafycategory:
            editedPayload?.category ||
            masterUpdationForm.leafycategory ||
            draftDetail?.draft.category_hint ||
            '',
        },
        actor,
      });
      const updatedMasterId = res.masterProduct?.id || syncTargetMasterId || '';
      if (updatedMasterId) {
        setSyncTargetMasterId(updatedMasterId);
        setLinkedMasterId(updatedMasterId);
        setIsNewMasterProduct(false);
      }
      await reloadFirestoreData();
      await loadSelectedDraftDetail(selectedDraftId);
      await loadDraftsList();
      await loadComparison(selectedDraftId, updatedMasterId);
      setBanner({
        type: 'success',
        message: res.createdNewMasterProduct
          ? `Created new Product Master record "${res.masterProduct?.name || masterUpdationForm.name}" (SKU: ${res.masterProduct?.sku || masterUpdationForm.sku}) and synchronized all selected AI & Product Master fields.`
          : `Synchronized Product Master "${res.masterProduct?.name || masterUpdationForm.name}" (SKU: ${res.masterProduct?.sku || masterUpdationForm.sku}) with all Product Master Updation fields and ${selectedSyncFields.size} selected AI field(s).`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to synchronize with Product Master' });
    } finally {
      setApplyingSync(false);
    }
  };

  const handleExportProductsTable = async (format: 'csv' | 'json') => {
    let exportedImageUrl = masterUpdationForm.imageUrl;
    let exportedStoragePath =
      (products.find((p) => p.id === syncTargetMasterId) as any)?.storagePath || '';
    if (exportedImageUrl && !isFirebaseStorageUrlClient(exportedImageUrl)) {
      try {
        const up = await ensureClientFirebaseStorageUrl({
          draftId: selectedDraftId || undefined,
          targetProductId: syncTargetMasterId || undefined,
          sourceUrl: exportedImageUrl,
        });
        if (isFirebaseStorageUrlClient(up.downloadUrl)) {
          exportedImageUrl = up.downloadUrl;
          exportedStoragePath = up.storagePath;
          setMasterUpdationForm((prev) => ({
            ...prev,
            imageUrl: up.downloadUrl,
            images: Array.from(
              new Set([up.downloadUrl, ...prev.images.filter((u) => isFirebaseStorageUrlClient(u))])
            ),
          }));
        }
      } catch {
        // Keep current imageUrl if export fails
      }
    }

    const exportedGalleryUrls = Array.from(
      new Set(
        [
          ...(exportedImageUrl ? [exportedImageUrl] : []),
          ...(masterUpdationForm.images || []).filter((u) => isFirebaseStorageUrlClient(u)),
        ].filter(Boolean)
      )
    );

    // Merge current draft's masterUpdationForm preview into the exported list so all existing
    // `products` table fields and new fields (including `leafycategory`) are kept updated when exporting
    const currentPreviewRecord: Record<string, any> = {
      ...(products.find((p) => p.id === syncTargetMasterId) || {}),
      id: syncTargetMasterId || `new_${selectedDraftId || 'product'}`,
      name: masterUpdationForm.name,
      sku: masterUpdationForm.sku,
      packingSize: masterUpdationForm.packingSize,
      unit: masterUpdationForm.unit,
      mrp: masterUpdationForm.mrp,
      onlinePrice: masterUpdationForm.onlinePrice,
      offerPrice: masterUpdationForm.onlinePrice,
      shopPrice: masterUpdationForm.shopPrice,
      gstPercentage: masterUpdationForm.gstPercentage,
      categories: masterUpdationForm.categories,
      category: masterUpdationForm.categories[0] || 'Uncategorized',
      leafycategory:
        editedPayload?.category ||
        masterUpdationForm.leafycategory ||
        draftDetail?.draft.category_hint ||
        '',
      brand: masterUpdationForm.brand,
      brandOwner: masterUpdationForm.brandOwner,
      stockIn: masterUpdationForm.stockIn,
      imageUrl: exportedImageUrl,
      storagePath:
        exportedStoragePath ||
        `products/${syncTargetMasterId || selectedDraftId || 'product'}/main.jpg`,
      images: exportedGalleryUrls,
      uniqueSpec1: masterUpdationForm.uniqueSpec1,
      uniqueSpec2: masterUpdationForm.uniqueSpec2,
      uniqueSpec3: masterUpdationForm.uniqueSpec3,
      isAyurvedicProduct: masterUpdationForm.isAyurvedicProduct,
      culinarydetails: masterUpdationForm.culinarydetails,
      aiContentLink: masterUpdationForm.aiContentLink,
      aiDraftId: masterUpdationForm.aiDraftId || selectedDraftId || '',
    };
    delete currentPreviewRecord.aiContentMetadata;
    comparisonItems.forEach((item) => {
      if (selectedSyncFields.has(item.fieldKey) && item.selectable) {
        if (item.masterField === 'imageUrl' && isFirebaseStorageUrlClient(exportedImageUrl)) {
          currentPreviewRecord.imageUrl = exportedImageUrl;
        } else {
          currentPreviewRecord[item.masterField] = item.proposedAiValue;
        }
      }
    });

    const rawExportList: Array<Record<string, any>> = products.map((p) =>
      p.id === syncTargetMasterId ? { ...p, ...currentPreviewRecord } : { ...p }
    );
    if (!syncTargetMasterId && masterUpdationForm.name) {
      rawExportList.unshift(currentPreviewRecord);
    }
    const exportList: Array<Record<string, any>> = rawExportList.map((row) => {
      const { aiContentMetadata: _omitAiMetadata, ...cleanRow } = row || {};
      return cleanRow;
    });

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(exportList, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_master_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Collect every existing `products` table column key + new fields so no column is ever dropped
    const standardColumns = [
      'id',
      'name',
      'sku',
      'hsnCode',
      'packingSize',
      'unit',
      'mrp',
      'onlinePrice',
      'offerPrice',
      'shopPrice',
      'discount',
      'gstPercentage',
      'categories',
      'category',
      'leafycategory',
      'brand',
      'brandOwner',
      'stockIn',
      'stockOut',
      'stock',
      'stockAvailability',
      'imageUrl',
      'storagePath',
      'images',
      'uniqueSpec1',
      'uniqueSpec2',
      'uniqueSpec3',
      'uniqueSpec4',
      'title',
      'englishName',
      'botanicalName',
      'botanicalFamily',
      'productForm',
      'description',
      'keyFeatures',
      'culinaryUses',
      'storageInstructions',
      'malayalamName',
      'hindiName',
      'tamilName',
      'kannadaName',
      'teluguName',
      'isAyurvedicProduct',
      'sanskritName',
      'lowestWebPrice',
      'highestWebPrice',
      'availablePackingSizes',
      'seoTitle',
      'metaDescription',
      'seoKeywords',
      'urlSlug',
      'googleProductCategory',
      'productType',
      'unitsSold',
      'revenue',
      'growthRate',
      'amazonSales',
      'flipkartSales',
      'meeshoSales',
      'vamjoSales',
      'whatsappSales',
      'countersaleSales',
      'preorderactive',
      'aiContentLink',
      'aiDraftId',
      'amazonWeblink',
      'notes',
    ];
    const dynamicKeys = new Set<string>(standardColumns);
    exportList.forEach((row) => {
      Object.keys(row || {}).forEach((k) => {
        if (k !== 'aiContentMetadata') {
          dynamicKeys.add(k);
        }
      });
    });
    const headers = Array.from(dynamicKeys);
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvLines = [
      headers.join(','),
      ...exportList.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_master_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // V9 SEO Handlers
  // =========================================================================
  const handleCheckSlugAvailability = useCallback(
    async (slugCandidate: string) => {
      const normalized = normalizeUrlSlugClient(slugCandidate);
      if (!normalized) {
        setSlugCheckState({ checking: false, available: false, error: 'Enter a valid URL slug.' });
        return;
      }
      setSlugCheckState({ checking: true });
      try {
        const res = await checkProductSlugAvailabilityClient(
          normalized,
          linkedMasterId || draftDetail?.draft.master_product_id || undefined
        );
        setSlugCheckState({
          checking: false,
          available: res.available,
          normalizedSlug: res.normalizedSlug || normalized,
          conflictProductId: res.conflictProductId || null,
          suggestedSlug: res.suggestedSlug || normalized,
        });
      } catch (err: any) {
        setSlugCheckState({
          checking: false,
          available: false,
          error: err?.message || 'Failed to check slug availability',
        });
      }
    },
    [linkedMasterId, draftDetail]
  );

  const handleGenerateSEOForDraft = async () => {
    if (!selectedDraftId) return;
    setSavingSeo(true);
    setBanner(null);
    try {
      const res = await generateAIDraftSEOClient({ draftId: selectedDraftId, actor });
      if (res.seo) {
        setSeoForm(res.seo);
        setSeoKeywordsInput((res.seo.seoKeywords || []).join(', '));
        if (editedPayload) {
          setEditedPayload({ ...editedPayload, seo: res.seo });
        }
        await handleCheckSlugAvailability(res.seo.urlSlug);
      }
      await loadSelectedDraftDetail(selectedDraftId);
      setBanner({
        type: 'success',
        message: 'Generated V9 SEO metadata (SEO Title, Meta Description, Keywords & Canonical Slug) in staging.',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to generate V9 SEO metadata' });
    } finally {
      setSavingSeo(false);
    }
  };

  const handleSaveSEOEdits = async (approveAfterSave = false) => {
    if (!selectedDraftId) return;
    setSavingSeo(true);
    setBanner(null);
    try {
      const normalizedKeywords = Array.from(
        new Set(
          seoKeywordsInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((k) => k.slice(0, 80))
        )
      );
      const nextSeo: AIProductSEOContent = {
        seoTitle: seoForm.seoTitle.trim(),
        metaDescription: seoForm.metaDescription.trim(),
        seoKeywords: normalizedKeywords,
        urlSlug: normalizeUrlSlugClient(seoForm.urlSlug || seoForm.seoTitle),
      };
      setSeoForm(nextSeo);
      setSeoKeywordsInput(normalizedKeywords.join(', '));

      await saveAIDraftSEOEditsClient({
        draftId: selectedDraftId,
        seo: nextSeo,
        actor,
      });

      if (approveAfterSave) {
        await approveAIDraftSEOClient({
          draftId: selectedDraftId,
          action: 'APPROVE',
          actor,
        });
      }

      await loadSelectedDraftDetail(selectedDraftId);
      setBanner({
        type: 'success',
        message: approveAfterSave
          ? 'V9 SEO Metadata validated and APPROVED for Product Master synchronization.'
          : 'V9 SEO Metadata saved to staging (ai_product_versions.seo_edited).',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to save V9 SEO metadata' });
    } finally {
      setSavingSeo(false);
    }
  };

  const handleApplyApprovedSEOToMaster = async () => {
    if (!selectedDraftId) return;
    const targetMaster = linkedMasterId || draftDetail?.draft.master_product_id || '';
    if (!targetMaster) {
      setBanner({
        type: 'error',
        message: 'Link a target Master Product before applying approved SEO metadata.',
      });
      return;
    }
    setSavingSeo(true);
    setBanner(null);
    try {
      await handleSaveSEOEdits(true);
      const res = await applyAIDraftSEOToMasterClient({
        draftId: selectedDraftId,
        masterProductId: targetMaster,
        selectedFields: ['seoTitle', 'metaDescription', 'seoKeywords', 'urlSlug'],
        actor,
      });
      await reloadFirestoreData();
      await loadSelectedDraftDetail(selectedDraftId);
      setBanner({
        type: 'success',
        message: `Published V9 SEO & canonical slug (/products/${res.urlSlug || seoForm.urlSlug}) to Master Product with transactional productSlugs reservation.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to apply SEO to Master Product' });
    } finally {
      setSavingSeo(false);
    }
  };

  // =========================================================================
  // V10 AI Commerce & Discoverability Handlers
  // =========================================================================
  const loadCommerceOverview = useCallback(async () => {
    setLoadingCommerce(true);
    try {
      const res = await fetchAICommerceOverviewClient();
      setCommerceOverview({
        settings: res.settings || [],
        staging: res.staging || [],
        feeds: res.feeds || [],
        validation: res.validation || [],
        readinessSummary: res.readinessSummary || {
          totalProducts: products.length,
          commerceEnabledCount: 0,
          publishedProjectionCount: 0,
          activeSlugCount: 0,
          readyCount: 0,
          warningCount: 0,
          blockedCount: 0,
          disabledCount: 0,
        },
      });
      if (!selectedCommerceProductId && products.length > 0) {
        setSelectedCommerceProductId(products[0].id);
      }
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to load AI Commerce overview' });
    } finally {
      setLoadingCommerce(false);
    }
  }, [products, selectedCommerceProductId]);

  useEffect(() => {
    if (activeSubmenu === 'commerce') {
      loadCommerceOverview();
    }
  }, [activeSubmenu, loadCommerceOverview]);

  useEffect(() => {
    if (!selectedCommerceProductId) return;
    const stagingDoc = commerceOverview?.staging.find((s) => s.productId === selectedCommerceProductId);
    const prod = products.find((p) => p.id === selectedCommerceProductId);
    const sourcePayload = stagingDoc?.editedPayload || stagingDoc?.generatedPayload;
    if (sourcePayload) {
      setCommerceForm(JSON.parse(JSON.stringify(sourcePayload)));
    } else if (prod) {
      setCommerceForm({
        seoTitle: prod.seoTitle || `${prod.name} | LeafyMart`,
        metaDescription:
          prod.metaDescription ||
          (prod.description || `${prod.name} by ${prod.brand || 'LeafyMart'}.`).slice(0, 155),
        seoKeywords:
          Array.isArray(prod.seoKeywords) && prod.seoKeywords.length >= 5
            ? prod.seoKeywords
            : [prod.name.toLowerCase(), (prod.category || 'spices').toLowerCase(), 'leafymart', 'india', 'natural'],
        urlSlug: prod.urlSlug || normalizeUrlSlugClient(prod.name),
        productHighlights: Array.isArray(prod.productHighlights)
          ? prod.productHighlights
          : Array.isArray(prod.keyFeatures)
          ? prod.keyFeatures.slice(0, 6)
          : [],
        productFAQs: Array.isArray(prod.productFAQs) ? prod.productFAQs : [],
        searchTags: Array.isArray(prod.searchTags) ? prod.searchTags : [],
        dietaryAttributes: Array.isArray(prod.dietaryAttributes)
          ? prod.dietaryAttributes
          : ['100% Natural', 'Vegetarian'],
        allergenInformation: Array.isArray(prod.allergenInformation)
          ? prod.allergenInformation.join(', ')
          : prod.allergenInformation || 'Packed in a facility that handles culinary herbs and spices.',
        googleProductCategory:
          prod.googleProductCategory ||
          'Food, Beverages & Tobacco > Food Items > Seasonings & Spices > Herbs & Spices',
        productType: prod.productType || `Home & Kitchen > Grocery > ${prod.category || 'Botanicals'}`,
        countryOfOrigin: prod.countryOfOrigin || 'India',
        netWeight: prod.netWeight ?? 100,
        netWeightUnit: (prod.netWeightUnit as any) ?? 'g',
        netVolume: prod.netVolume ?? null,
        netVolumeUnit: (prod.netVolumeUnit as any) ?? null,
      });
    }
  }, [selectedCommerceProductId, commerceOverview, products]);

  const handleGenerateCommerceForProduct = async () => {
    if (!selectedCommerceProductId) return;
    setBusyCommerceAction(true);
    setBanner(null);
    try {
      const res = await generateAICommerceDraftClient({
        productId: selectedCommerceProductId,
        draftId: selectedDraftId,
        actor,
      });
      if (res.staging?.editedPayload || res.staging?.generatedPayload) {
        setCommerceForm(res.staging.editedPayload || res.staging.generatedPayload);
      }
      await loadCommerceOverview();
      setBanner({
        type: 'success',
        message: 'Generated V10 AI Commerce draft (Highlights, FAQs, Google Category, Structured Attributes & SEO).',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to generate V10 AI Commerce draft' });
    } finally {
      setBusyCommerceAction(false);
    }
  };

  const handleSaveAndApproveCommerce = async (approveAfterSave = false) => {
    if (!selectedCommerceProductId) return;
    setBusyCommerceAction(true);
    setBanner(null);
    try {
      await saveAICommerceDraftClient({
        productId: selectedCommerceProductId,
        editedPayload: commerceForm,
        actor,
      });
      if (approveAfterSave) {
        await approveAICommerceDraftClient({
          productId: selectedCommerceProductId,
          action: 'APPROVE',
          actor,
        });
      }
      await loadCommerceOverview();
      setBanner({
        type: 'success',
        message: approveAfterSave
          ? 'V10 AI Commerce draft validated and APPROVED.'
          : 'V10 AI Commerce draft saved to staging (ai_commerce_staging).',
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to save V10 AI Commerce draft' });
    } finally {
      setBusyCommerceAction(false);
    }
  };

  const handleApplyCommerceToMaster = async () => {
    if (!selectedCommerceProductId) return;
    setBusyCommerceAction(true);
    setBanner(null);
    try {
      await saveAICommerceDraftClient({
        productId: selectedCommerceProductId,
        editedPayload: commerceForm,
        actor,
      });
      await approveAICommerceDraftClient({
        productId: selectedCommerceProductId,
        action: 'APPROVE',
        actor,
      });
      const res = await applyAICommerceDraftClient({
        productId: selectedCommerceProductId,
        enableAICommerce: enableCommerceOnApply,
        actor,
      });
      await reloadFirestoreData();
      await loadCommerceOverview();
      setBanner({
        type: 'success',
        message: `Applied V10 AI Commerce fields to Master Product & published allowlisted projection (/products/${res.urlSlug || commerceForm.urlSlug}).`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to apply AI Commerce to Master' });
    } finally {
      setBusyCommerceAction(false);
    }
  };

  const handleValidateCommerceProduct = async (productId: string) => {
    setBusyCommerceAction(true);
    try {
      await validateProductCommerceReadinessClient(productId);
      await loadCommerceOverview();
      setBanner({
        type: 'success',
        message: `Platform readiness validation completed for product ${productId}.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Validation failed' });
    } finally {
      setBusyCommerceAction(false);
    }
  };

  const handleBuildCommerceFeeds = async (dryRun: boolean, platform: AICommercePlatformId | 'all' = 'all') => {
    setBusyCommerceAction(true);
    setBanner(null);
    try {
      const res = await buildAICommerceFeedClient({
        platform,
        dryRun,
        actor,
      });
      await loadCommerceOverview();
      const firstFeed = res.feeds?.[0];
      if (firstFeed && firstFeed.contentPreview) {
        setFeedPreviewModal({
          title: `${firstFeed.platform} (${dryRun ? 'Dry-Run Preview' : 'Published Snapshot'})`,
          format: firstFeed.format,
          content: firstFeed.contentPreview,
        });
      }
      setBanner({
        type: 'success',
        message: dryRun
          ? `Dry-run feed build succeeded (${res.feeds?.length || 0} feed(s) validated).`
          : `Published ${res.feeds?.length || 0} feed snapshot(s) to ai_commerce_feeds.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Feed generation failed' });
    } finally {
      setBusyCommerceAction(false);
    }
  };

  const handleTogglePlatformSetting = async (
    setting: AICommercePlatformSetting,
    patch: Partial<AICommercePlatformSetting>
  ) => {
    setBusyCommerceAction(true);
    try {
      await saveAICommercePlatformSettingClient({
        ...setting,
        ...patch,
        actor,
      });
      await loadCommerceOverview();
      setBanner({
        type: 'success',
        message: `Updated platform configuration for ${setting.platformName}.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err?.message || 'Failed to update platform setting' });
    } finally {
      setBusyCommerceAction(false);
    }
  };

  const originalGeneratedPayload: AIProductContentPayload | null =
    draftDetail?.currentVersion?.generated_payload || null;

  return (
    <div id="ai-product-content-module" className="space-y-6">
      {/* Top Module Header */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 border border-emerald-200">
                AI Product Content • V8
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                OpenAI Project: {aiConfig?.projectName || 'leafyearthprdcnt'}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                Draft → Review → Master Sync
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[#2E7D32]" />
              AI Product Content & Market Intelligence
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Staged e-commerce content, 6-language native translations, conditional Ayurvedic monograph,
              1000×1000 #FFFFFF studio imagery, and HSN/GST & web price research. Never writes to{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">products</code> without
              explicit approval and field selection.
            </p>
          </div>

          {/* Active Draft Quick Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[260px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Active Staged Draft
              </label>
              <select
                value={selectedDraftId || ''}
                onChange={(e) => setSelectedDraftId(e.target.value || null)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2E7D32]"
              >
                <option value="">-- Select an AI Draft ({draftsList.length}) --</option>
                {draftsList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.source_product_name} [{d.status}] {d.master_product_sku ? `• SKU ${d.master_product_sku}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                loadDraftsList();
                if (selectedDraftId) loadSelectedDraftDetail(selectedDraftId);
              }}
              className="mt-4 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList || loadingDetail ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* 9 Submenu Horizontal Navigation Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto pb-1">
          {SUBMENU_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubmenu === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSubmenuChange(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-[#2E7D32] text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Banner */}
      {banner && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : banner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : banner.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-bold underline opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =====================================================================
          SUBMENU 1: GENERATE PRODUCT CONTENT
         ===================================================================== */}
      {activeSubmenu === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#2E7D32]" />
              Generate Staged AI Product Content
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter a product name and optional existing Master Product link. Generated content is saved
              exclusively as a <span className="font-bold text-amber-700">DRAFT</span> in{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded">ai_product_drafts</code> and{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded">ai_product_versions</code>.
            </p>

            <form onSubmit={handleGenerateDraft} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={genProductName}
                  onChange={(e) => setGenProductName(e.target.value)}
                  placeholder="e.g., Wayanad Lakadong Turmeric Powder, Brahmi Hair Oil, Cardamom Green 8mm..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7D32]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Ayurvedic Product <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      genIsAyurvedicProduct
                        ? 'border-[#2E7D32] bg-emerald-50 text-[#2E7D32] shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="genIsAyurvedicProduct"
                      checked={genIsAyurvedicProduct === true}
                      onChange={() => setGenIsAyurvedicProduct(true)}
                      className="accent-[#2E7D32]"
                    />
                    Yes
                  </label>
                  <label
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      !genIsAyurvedicProduct
                        ? 'border-[#2E7D32] bg-emerald-50 text-[#2E7D32] shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="genIsAyurvedicProduct"
                      checked={genIsAyurvedicProduct === false}
                      onChange={() => setGenIsAyurvedicProduct(false)}
                      className="accent-[#2E7D32]"
                    />
                    No
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {genIsAyurvedicProduct
                      ? 'Includes 6-Language Product Names, Ayurveda Applicability: applicable & 4. Conditional Ayurvedic Medicinal Content (Sections 16 & 18.2).'
                      : 'Excludes 6-Language Product Names, Ayurveda Applicability: applicable & 4. Conditional Ayurvedic Medicinal Content; generates all other features.'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Associate Existing Master Product (Optional)
                  </label>
                  <select
                    value={genMasterProductId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setGenMasterProductId(pid);
                      const found = products.find((p) => p.id === pid);
                      if (found) {
                        if (!genProductName.trim()) setGenProductName(found.name);
                        if (found.category) setGenCategoryHint(found.category);
                        if (found.brand) setGenBrandHint(found.brand);
                        if (found.isAyurvedicProduct !== undefined) {
                          setGenIsAyurvedicProduct(Boolean(found.isAyurvedicProduct));
                        }
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                  >
                    <option value="">-- Unlinked (Link Later Before Sync) --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (SKU: {p.sku || 'N/A'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Category Hint (Optional)
                  </label>
                  <input
                    type="text"
                    value={genCategoryHint}
                    onChange={(e) => setGenCategoryHint(e.target.value)}
                    placeholder="e.g., Spices & Botanicals, Ayurvedic Wellness, Cakes..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Brand / Origin Hint (Optional)
                </label>
                <input
                  type="text"
                  value={genBrandHint}
                  onChange={(e) => setGenBrandHint(e.target.value)}
                  placeholder="e.g., LeafyMart / Vio Nature Science / Wayanad Single-Origin"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="px-6 py-3 rounded-xl bg-[#2E7D32] hover:bg-[#256628] disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating Staged Draft...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Structured Draft (V8 / V9 / V10)
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Scope & Safeguards Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
              <ShieldCheck className="w-4 h-4" />
              V8–V10 Isolation &amp; Safety Guarantees
            </div>
            <ul className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Zero Direct Master Writes:</strong> Generation writes only to{' '}
                  <code>ai_product_drafts</code> and <code>ai_product_versions</code>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>6-Language Native Scripts:</strong> English, മലയാളം, हिन्दी, தமிழ், ಕನ್ನಡ, and
                  తెలుగు validated for native script characters.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>SEO &amp; Cross-Platform Deep Links (Flutter Android, Web &amp; iOS):</strong>{' '}
                  Generates <code>seoTitle</code>, <code>metaDescription</code>,{' '}
                  <code>seoKeywords</code> (5–12), and globally unique <code>urlSlug</code> (
                  <code>/products/:slug</code>) with Android App Links &amp; iOS Universal Links.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Conditional Ayurveda:</strong> Classical Rasa/Guna/Virya/Vipaka/Dosha monograph
                  generated only when botanical/Ayurvedic applicability is confirmed.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Selling Price Protection:</strong> Web price research never alters{' '}
                  <code>mrp</code>, <code>onlinePrice</code>, <code>offerPrice</code>, or existing{' '}
                  <code>sku</code>.
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBMENU 2: AI GENERATED CONTENT (DRAFTS GRID)
         ===================================================================== */}
      {activeSubmenu === 'drafts' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    statusFilter === st
                      ? 'bg-[#2E7D32] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-[260px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search product name or SKU..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => onSubmenuChange('generate')}
                className="px-3.5 py-2 rounded-xl bg-[#2E7D32] text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                New Draft
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-3">Source Product & Botanical</th>
                  <th className="py-3 px-3">Linked Master & SKU</th>
                  <th className="py-3 px-3">Ver</th>
                  <th className="py-3 px-3">Ayurveda</th>
                  <th className="py-3 px-3">Content Status</th>
                  <th className="py-3 px-3">1000×1000 Image</th>
                  <th className="py-3 px-3">HSN / GST / Web Price</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {draftsList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No AI product drafts match the current filter. Click "New Draft" to generate one.
                    </td>
                  </tr>
                ) : (
                  draftsList.map((d) => {
                    const payload =
                      d.currentVersion?.edited_payload || d.currentVersion?.generated_payload;
                    const res = d.latestResearch;
                    return (
                      <tr
                        key={d.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          selectedDraftId === d.id ? 'bg-emerald-50/40' : ''
                        }`}
                      >
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-900">{d.source_product_name}</div>
                          <div className="text-[11px] text-slate-500 italic">
                            {payload?.botanical_name || d.category_hint || 'General Botanical'}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          {d.master_product_id ? (
                            <div>
                              <div className="font-semibold text-slate-800">
                                {d.master_product_name || d.master_product_id}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500">
                                SKU: {d.master_product_sku || 'N/A'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unlinked</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-700">
                          v{d.currentVersion?.version_no || 1}
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              payload?.ayurveda_applicability === 'applicable'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {payload?.ayurveda_applicability || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                              STATUS_BADGE_STYLES[d.status] || 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          {d.approved_image_id ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Approved (1000×1000)
                            </span>
                          ) : (d.imagesCount || 0) > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              {d.imagesCount} Candidate(s)
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">None</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          {res ? (
                            <div className="text-[11px]">
                              <span className="font-mono font-bold text-slate-800">
                                HSN {res.taxation?.hsnCode} ({res.taxation?.gstRatePercent}%)
                              </span>
                              <div className="text-[10px] text-slate-500">
                                {res.marketResearch?.lowestPrice !== null
                                  ? `₹${res.marketResearch.lowestPrice} – ₹${res.marketResearch.highestPrice} (${res.packing?.selectedPackingSize})`
                                  : 'No verified web prices'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Not researched</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDraftId(d.id);
                                onSubmenuChange('review');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px]"
                            >
                              Review & Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDraftId(d.id);
                                onSubmenuChange('research');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-[11px]"
                            >
                              Tax & Price
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDraftId(d.id);
                                onSubmenuChange('sync');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px]"
                            >
                              Master Sync
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBMENU 3: REVIEW & EDIT CONTENT
         ===================================================================== */}
      {activeSubmenu === 'review' && (
        <div className="space-y-6">
          {!draftDetail || !editedPayload ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-slate-500">
              Select a draft from the top dropdown or generate a new product draft first.
            </div>
          ) : (
            <>
              {/* Review Action Bar */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black border ${
                      STATUS_BADGE_STYLES[draftDetail.draft.status]
                    }`}
                  >
                    {draftDetail.draft.status}
                  </span>
                  <div>
                    <div className="text-sm font-black text-slate-900">
                      {draftDetail.draft.source_product_name} • Version v
                      {draftDetail.currentVersion?.version_no || 1}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Prompt: {draftDetail.currentVersion?.prompt_version} • Model:{' '}
                      {draftDetail.currentVersion?.model}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                        syncTargetMasterId
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      {syncTargetMasterId ? 'Auto-Linked Existing' : 'New Product'}
                    </span>
                    <input
                      type="text"
                      readOnly
                      value={
                        syncTargetMasterId
                          ? `${
                              products.find((p) => p.id === syncTargetMasterId)?.name ||
                              masterUpdationForm.name
                            } (SKU: ${
                              products.find((p) => p.id === syncTargetMasterId)?.sku ||
                              masterUpdationForm.sku
                            })`
                          : `${masterUpdationForm.name || draftDetail.draft.source_product_name} (New • Auto SKU: ${masterUpdationForm.sku})`
                      }
                      className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-slate-100 text-slate-800 min-w-[260px] cursor-not-allowed"
                      title="Target Master Product is automatically matched by product name in the products table (non-editable)"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={handleSaveDraftEdits}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Draft Edits
                  </button>

                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={handleSubmitForReview}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit for Review
                  </button>

                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={() => handleApproveOrRejectContent('APPROVE')}
                    className="px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#256628] text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve Content
                  </button>

                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={() => handleApproveOrRejectContent('REJECT')}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>

                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={handleRegenerateVersion}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                </div>
              </div>

              {/* Side-by-Side Original AI Output vs Admin Editable Form */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Left Column: Read-Only Original AI Generated Snapshot */}
                <div className="xl:col-span-4 bg-slate-50 rounded-3xl border border-slate-200 p-5 space-y-4 max-h-[850px] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Original AI Output (Read-Only v{draftDetail.currentVersion?.version_no})
                    </h3>
                    <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                      Immutable Snapshot
                    </span>
                  </div>

                  {originalGeneratedPayload && (
                    <div className="space-y-3 text-xs">
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">
                          Product & Botanical Identity
                        </div>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {originalGeneratedPayload.english_product_name}
                        </div>
                        <div className="text-slate-600 italic">
                          {originalGeneratedPayload.botanical_name || '—'} (
                          {originalGeneratedPayload.family || '—'})
                        </div>
                        <div className="text-slate-500 mt-1">
                          Category: {originalGeneratedPayload.category} • Form:{' '}
                          {originalGeneratedPayload.form}
                        </div>
                      </div>

                      {originalGeneratedPayload.is_ayurvedic_product !== false &&
                        originalGeneratedPayload.ayurveda_applicability === 'applicable' && (
                          <div className="bg-white p-3 rounded-xl border border-slate-200">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                              6-Language Product Names
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                              <div>
                                <span className="text-slate-400">EN:</span>{' '}
                                {originalGeneratedPayload.translations.en.name}
                              </div>
                              <div>
                                <span className="text-slate-400">ML:</span>{' '}
                                {originalGeneratedPayload.translations.ml.name}
                              </div>
                              <div>
                                <span className="text-slate-400">HI:</span>{' '}
                                {originalGeneratedPayload.translations.hi.name}
                              </div>
                              <div>
                                <span className="text-slate-400">TA:</span>{' '}
                                {originalGeneratedPayload.translations.ta.name}
                              </div>
                              <div>
                                <span className="text-slate-400">KN:</span>{' '}
                                {originalGeneratedPayload.translations.kn.name}
                              </div>
                              <div>
                                <span className="text-slate-400">TE:</span>{' '}
                                {originalGeneratedPayload.translations.te.name}
                              </div>
                            </div>
                          </div>
                        )}

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">
                          Display Title
                        </div>
                        <p className="text-slate-700 leading-relaxed">
                          {originalGeneratedPayload.title}
                        </p>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">
                          Description
                        </div>
                        <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                          {originalGeneratedPayload.description}
                        </p>
                      </div>

                      {originalGeneratedPayload.is_ayurvedic_product !== false &&
                        originalGeneratedPayload.ayurveda_applicability === 'applicable' && (
                          <div className="bg-white p-3 rounded-xl border border-slate-200">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                              Ayurveda Applicability: {originalGeneratedPayload.ayurveda_applicability}
                            </div>
                            {originalGeneratedPayload.ayurveda && (
                              <div className="text-[11px] text-slate-600 space-y-1">
                                <div>
                                  <strong>Sanskrit:</strong>{' '}
                                  {originalGeneratedPayload.ayurveda.sanskrit_name}
                                </div>
                                <div>
                                  <strong>Classical:</strong>{' '}
                                  {originalGeneratedPayload.ayurveda.classical_description}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  )}
                </div>

                {/* Right Column: Editable Admin Form */}
                <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
                  {/* Section A: General Product Identity */}
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">
                      1. General E-Commerce & Botanical Fields (Section 4 & 18.1)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          English Product Name
                        </label>
                        <input
                          type="text"
                          value={editedPayload.english_product_name}
                          onChange={(e) =>
                            setEditedPayload({
                              ...editedPayload,
                              english_product_name: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Category
                        </label>
                        <input
                          type="text"
                          value={editedPayload.category}
                          onChange={(e) =>
                            setEditedPayload({ ...editedPayload, category: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Display Title
                        </label>
                        <input
                          type="text"
                          value={editedPayload.title}
                          onChange={(e) =>
                            setEditedPayload({ ...editedPayload, title: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Botanical Name
                        </label>
                        <input
                          type="text"
                          value={editedPayload.botanical_name || ''}
                          onChange={(e) =>
                            setEditedPayload({
                              ...editedPayload,
                              botanical_name: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs italic"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Botanical Family
                        </label>
                        <input
                          type="text"
                          value={editedPayload.family || ''}
                          onChange={(e) =>
                            setEditedPayload({
                              ...editedPayload,
                              family: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Product Form
                        </label>
                        <input
                          type="text"
                          value={editedPayload.form}
                          onChange={(e) =>
                            setEditedPayload({ ...editedPayload, form: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          E-Commerce Description
                        </label>
                        <textarea
                          rows={3}
                          value={editedPayload.description}
                          onChange={(e) =>
                            setEditedPayload({ ...editedPayload, description: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Storage Instructions
                        </label>
                        <textarea
                          rows={3}
                          value={editedPayload.storage_instructions}
                          onChange={(e) =>
                            setEditedPayload({
                              ...editedPayload,
                              storage_instructions: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Key Features (One per line)
                      </label>
                      <textarea
                        rows={4}
                        value={formatArrayAsLines(editedPayload.key_features)}
                        onChange={(e) =>
                          setEditedPayload({
                            ...editedPayload,
                            key_features: parseLinesToArray(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                          Culinary Uses (One per line)
                        </label>
                        <p className="text-[10px] text-slate-500 mb-1.5">
                          Used only if the product is used in kitchen, cooking, or bakery.
                        </p>
                        <textarea
                          id="review-culinary-uses-textarea"
                          rows={4}
                          placeholder="e.g. Curries, spice blends, bakery items, marinades (leave empty if non-culinary)"
                          value={formatArrayAsLines(editedPayload.culinary_uses)}
                          onChange={(e) =>
                            setEditedPayload({
                              ...editedPayload,
                              culinary_uses: parseLinesToArray(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs resize-y"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-800 mb-0.5">
                          Practical Uses (One per line)
                        </label>
                        <p className="text-[10px] text-slate-500 mb-1.5">
                          For Ayurvedic products &amp; how to use (some products may use both).
                        </p>
                        <textarea
                          id="review-practical-uses-textarea"
                          rows={4}
                          placeholder="e.g. Prepared as a decoction (Kashayam), warm water infusion, or fine churna..."
                          value={formatArrayAsLines(editedPayload.practical_uses)}
                          onChange={(e) =>
                            setEditedPayload({
                              ...editedPayload,
                              practical_uses: parseLinesToArray(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs resize-y"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section B: 6-Language Native Script Product Names (Only when Ayurvedic Product = Yes) */}
                  {(editedPayload.is_ayurvedic_product !== undefined
                    ? editedPayload.is_ayurvedic_product
                    : draftDetail.draft.is_ayurvedic_product) !== false &&
                    editedPayload.ayurveda_applicability === 'applicable' && (
                      <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">
                          2. Multilingual Product Names (6 Required Native Scripts — Section 4)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {(
                            [
                              { code: 'en', label: 'English (en)' },
                              { code: 'ml', label: 'Malayalam (മലയാളം - ml)' },
                              { code: 'hi', label: 'Hindi (हिन्दी - hi)' },
                              { code: 'ta', label: 'Tamil (தமிழ் - ta)' },
                              { code: 'kn', label: 'Kannada (ಕನ್ನಡ - kn)' },
                              { code: 'te', label: 'Telugu (తెలుగు - te)' },
                            ] as const
                          ).map((lang) => (
                            <div key={lang.code}>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                {lang.label} <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={editedPayload.translations[lang.code]?.name || ''}
                                onChange={(e) =>
                                  setEditedPayload({
                                    ...editedPayload,
                                    translations: {
                                      ...editedPayload.translations,
                                      [lang.code]: { name: e.target.value },
                                    },
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Section C: Health Benefits, Nutritional Information & Safety Precautions */}
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                        3. Health Benefits, Nutrition & Safety Precautions (Section 16)
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const prodName =
                              editedPayload.english_product_name ||
                              draftDetail?.draft.source_product_name ||
                              'Product';
                            const safetyText = buildStructuredSafetyPrecautionsText(prodName);
                            setEditedPayload({
                              ...editedPayload,
                              health_benefits: buildStructuredHealthBenefits(prodName),
                              nutritional_information:
                                buildStructuredNutritionalInformation(prodName),
                              safety_precautions_text: safetyText,
                              safety_precautions: safetyPrecautionsTextToLines(safetyText),
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          title="Populate structured 6-point Health Benefits, Nutritional Information table, and Safety Precautions template"
                        >
                          <Sparkles className="w-3 h-3" /> Apply Structured Template
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextItem: AIHealthBenefit = {
                              claim:
                                'Traditional wellness use: Traditionally used to support everyday digestive comfort and general vitality.',
                              evidence_level: 'traditional_use',
                              reference_ids: ['REF-1'],
                              review_status: 'approved',
                            };
                            setEditedPayload({
                              ...editedPayload,
                              health_benefits: [...(editedPayload.health_benefits || []), nextItem],
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Add Health Benefit Claim
                        </button>
                      </div>
                    </div>

                    {/* 1. Health Benefits (Numbered Structured Points: Title: Description) */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                          1. Health Benefits
                        </h4>
                        <span className="text-[10px] font-semibold text-slate-500">
                          Format: <code className="text-slate-700">Title: Description</code> (numbered automatically)
                        </span>
                      </div>
                      <div className="space-y-3">
                        {(editedPayload.health_benefits || []).map((hb, idx) => (
                          <div
                            key={idx}
                            className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 grid grid-cols-1 md:grid-cols-12 gap-3 items-start"
                          >
                            <div className="md:col-span-7">
                              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-black mr-1.5">
                                  {idx + 1}
                                </span>
                                Responsible Non-Deceptive Wellness Claim (Title: Description)
                              </label>
                              <textarea
                                rows={2}
                                value={hb.claim}
                                onChange={(e) => {
                                  const list = [...editedPayload.health_benefits];
                                  list[idx] = { ...list[idx], claim: e.target.value };
                                  setEditedPayload({ ...editedPayload, health_benefits: list });
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white leading-relaxed resize-y"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500">
                                Evidence Level
                              </label>
                              <select
                                value={hb.evidence_level}
                                onChange={(e) => {
                                  const list = [...editedPayload.health_benefits];
                                  list[idx] = {
                                    ...list[idx],
                                    evidence_level: e.target.value as AIEvidenceLevel,
                                  };
                                  setEditedPayload({ ...editedPayload, health_benefits: list });
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white mt-0.5"
                              >
                                <option value="traditional_use">traditional_use</option>
                                <option value="nutritional">nutritional</option>
                                <option value="preliminary_study">preliminary_study</option>
                                <option value="human_study">human_study</option>
                                <option value="insufficient_evidence">insufficient_evidence</option>
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500">
                                Claim Approval
                              </label>
                              <select
                                value={hb.review_status || 'pending_review'}
                                onChange={(e) => {
                                  const list = [...editedPayload.health_benefits];
                                  list[idx] = {
                                    ...list[idx],
                                    review_status: e.target.value as AIReviewStatus,
                                  };
                                  setEditedPayload({ ...editedPayload, health_benefits: list });
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white mt-0.5 font-bold"
                              >
                                <option value="approved">Approved</option>
                                <option value="pending_review">Pending Review</option>
                                <option value="rejected">Rejected</option>
                              </select>
                            </div>
                            <div className="md:col-span-1 pt-5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  const list = editedPayload.health_benefits.filter(
                                    (_, i) => i !== idx
                                  );
                                  setEditedPayload({ ...editedPayload, health_benefits: list });
                                }}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2. Nutritional Information (Dedicated Multi-Line Box) */}
                    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <label className="block text-xs font-black text-slate-900 uppercase tracking-wide">
                            Nutritional Information
                          </label>
                          <p className="text-[11px] text-slate-500">
                            Intro note, tab-separated <code>Nutrient</code> &amp;{' '}
                            <code>Nutritional contribution</code> rows, and closing{' '}
                            <code>Important:</code> note (exported to{' '}
                            <code>products.nutritionalInformation</code>).
                          </p>
                        </div>
                      </div>
                      <textarea
                        rows={11}
                        value={
                          editedPayload.nutritional_information ??
                          buildStructuredNutritionalInformation(
                            editedPayload.english_product_name ||
                              draftDetail?.draft.source_product_name ||
                              'Product'
                          )
                        }
                        onChange={(e) =>
                          setEditedPayload({
                            ...editedPayload,
                            nutritional_information: e.target.value,
                          })
                        }
                        placeholder={
                          'The exact nutritional composition depends on the drying method, sugar coating and recipe.\nNutrient\tNutritional contribution\nCarbohydrates\tNaturally present sugars and added sugar\nDietary fibre\tSupports digestive health\nVitamin C\tMay be present, but reduced by processing\nPolyphenols\tAntioxidant compounds\nCalcium\tSmall amounts\nIron\tSmall amounts\nPotassium\tNaturally present\n\nImportant: ...'
                        }
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono leading-relaxed resize-y"
                      />

                      <div className="pt-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-600">
                            Nutritional Benefits Summary Tags (Comma-separated, min 3 points)
                          </label>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              (editedPayload.nutritional_benefits?.length || 0) >= 3
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {editedPayload.nutritional_benefits?.length || 0} / min 3
                          </span>
                        </div>
                        <textarea
                          rows={2}
                          placeholder="Point 1, Point 2, Point 3"
                          value={(editedPayload.nutritional_benefits || []).join(', ')}
                          onChange={(e) =>
                            setEditedPayload({
                              ...editedPayload,
                              nutritional_benefits: e.target.value
                                .split(/[,\n]+/)
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs resize-y"
                        />
                      </div>
                    </div>

                    {/* 3. Safety Precautions (Dedicated Multi-Line Box) */}
                    <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/30 space-y-2">
                      <div>
                        <label className="block text-xs font-black text-slate-900 uppercase tracking-wide">
                          Safety Precautions
                        </label>
                        <p className="text-[11px] text-slate-500">
                          <code>Important</code> heading, bulleted <code>- Topic: Detail</code>{' '}
                          precautions, and closing note (exported to{' '}
                          <code>products.safetyPrecautions</code> &amp;{' '}
                          <code>products.generalPrecautions</code>).
                        </p>
                      </div>
                      <textarea
                        rows={11}
                        value={
                          editedPayload.safety_precautions_text ??
                          formatSafetyPrecautionsArrayToText(
                            editedPayload.safety_precautions,
                            editedPayload.english_product_name ||
                              draftDetail?.draft.source_product_name ||
                              'Product'
                          )
                        }
                        onChange={(e) =>
                          setEditedPayload({
                            ...editedPayload,
                            safety_precautions_text: e.target.value,
                            safety_precautions: safetyPrecautionsTextToLines(e.target.value),
                          })
                        }
                        placeholder={
                          'Important\n- Diabetes: ...\n- Excessive consumption: ...\n- Blood-thinning medicines: ...\n- Blood sugar medication: ...\n- Dental health: ...\n- Pregnancy and breastfeeding: ...\nThese precautions are particularly relevant to concentrated extracts and supplements, not necessarily occasional food consumption'
                        }
                        className="w-full px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-xs leading-relaxed resize-y"
                      />
                    </div>
                  </div>

                  {/* Section D: Conditional Ayurvedic Medicinal Monograph (Section 16.3 & 18.2) — Only when Ayurvedic Product = Yes */}
                  {(editedPayload.is_ayurvedic_product !== undefined
                    ? editedPayload.is_ayurvedic_product
                    : draftDetail.draft.is_ayurvedic_product) !== false &&
                    editedPayload.ayurveda_applicability === 'applicable' && (
                  <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/30 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-emerald-950 flex items-center gap-2">
                          <Leaf className="w-4 h-4 text-[#2E7D32]" />
                          4. Conditional Ayurvedic Medicinal Content (Sections 16 & 18.2)
                        </h3>
                        <p className="text-[11px] text-slate-600">
                          When set to <code>applicable</code>, maps <code>isAyurvedicProduct = true</code>{' '}
                          and unlocks all 21 Ayurvedic master fields.
                        </p>
                      </div>

                      <select
                        value={editedPayload.ayurveda_applicability}
                        onChange={(e) => {
                          const nextApp = e.target.value as AIAyurvedaApplicability;
                          setEditedPayload({
                            ...editedPayload,
                            ayurveda_applicability: nextApp,
                            ayurveda:
                              nextApp === 'applicable'
                                ? editedPayload.ayurveda || {
                                    sanskrit_name: editedPayload.english_product_name,
                                    classification: 'Dravyaguna Botanical',
                                    classical_description: '',
                                    rasa: ['Tikta (Bitter)', 'Katu (Pungent)'],
                                    guna: ['Laghu (Light)', 'Ruksha (Dry)'],
                                    virya: 'Ushna (Warming)',
                                    vipaka: 'Katu (Pungent)',
                                    prabhava: 'Deepana-Pachana',
                                    dosha_effects: {
                                      vata: 'Balances Vata',
                                      pitta: 'Use in moderation for Pitta',
                                      kapha: 'Pacifies Kapha',
                                    },
                                    parts_used: ['Whole botanical / Root / Leaf'],
                                    medicinal_uses: [],
                                    classical_formulations: [],
                                    usage_methods: [],
                                    anupana: ['Warm water', 'Honey'],
                                    typical_dosage_note:
                                      '1–3 g daily or as directed by a qualified Vaidya.',
                                    precautions: [],
                                    contraindications: [],
                                    interactions: [],
                                    references: [],
                                  }
                                : editedPayload.ayurveda,
                          });
                        }}
                        className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-black text-emerald-900"
                      >
                        <option value="applicable">applicable (Is Ayurvedic Product = Yes)</option>
                        <option value="not_applicable">
                          not_applicable (Is Ayurvedic Product = No)
                        </option>
                        <option value="uncertain">uncertain (Requires Botanical Verification)</option>
                      </select>
                    </div>

                    {editedPayload.ayurveda_applicability === 'applicable' && editedPayload.ayurveda && (
                      <div className="space-y-4 pt-2 border-t border-emerald-200/60">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Sanskrit Name
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.sanskrit_name}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    sanskrit_name: e.target.value,
                                  },
                                })
                              }
                              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Ayurvedic Classification
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.classification}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    classification: e.target.value,
                                  },
                                })
                              }
                              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Classical Description
                          </label>
                          <textarea
                            rows={2}
                            value={editedPayload.ayurveda.classical_description}
                            onChange={(e) =>
                              setEditedPayload({
                                ...editedPayload,
                                ayurveda: {
                                  ...editedPayload.ayurveda!,
                                  classical_description: e.target.value,
                                },
                              })
                            }
                            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Rasa (Comma-sep)
                            </label>
                            <input
                              type="text"
                              value={(editedPayload.ayurveda.rasa || []).join(', ')}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    rasa: e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Guna (Comma-sep)
                            </label>
                            <input
                              type="text"
                              value={(editedPayload.ayurveda.guna || []).join(', ')}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    guna: e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Virya (Potency)
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.virya}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: { ...editedPayload.ayurveda!, virya: e.target.value },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Vipaka (Post-Digestive)
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.vipaka}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: { ...editedPayload.ayurveda!, vipaka: e.target.value },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Prabhava (Special Action)
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.prabhava || ''}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    prabhava: e.target.value,
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Dosha Effect — Vata
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.dosha_effects?.vata || ''}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    dosha_effects: {
                                      ...editedPayload.ayurveda!.dosha_effects,
                                      vata: e.target.value,
                                    },
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Dosha Effect — Pitta
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.dosha_effects?.pitta || ''}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    dosha_effects: {
                                      ...editedPayload.ayurveda!.dosha_effects,
                                      pitta: e.target.value,
                                    },
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Dosha Effect — Kapha
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.dosha_effects?.kapha || ''}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    dosha_effects: {
                                      ...editedPayload.ayurveda!.dosha_effects,
                                      kapha: e.target.value,
                                    },
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[10px] font-bold text-slate-600">
                                Medicinal Uses (Comma-separated, min 4 points)
                              </label>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  (editedPayload.ayurveda.medicinal_uses?.length || 0) >= 4
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {editedPayload.ayurveda.medicinal_uses?.length || 0} / min 4
                              </span>
                            </div>
                            <textarea
                              rows={4}
                              placeholder="Use 1, Use 2, Use 3, Use 4"
                              value={(editedPayload.ayurveda.medicinal_uses || []).join(', ')}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    medicinal_uses: e.target.value
                                      .split(/[,\n]+/)
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white resize-y"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[10px] font-bold text-slate-600">
                                Usage Methods (Comma-separated, min 3 points)
                              </label>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  (editedPayload.ayurveda.usage_methods?.length || 0) >= 3
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {editedPayload.ayurveda.usage_methods?.length || 0} / min 3
                              </span>
                            </div>
                            <textarea
                              rows={4}
                              placeholder="Method 1, Method 2, Method 3"
                              value={(editedPayload.ayurveda.usage_methods || []).join(', ')}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    usage_methods: e.target.value
                                      .split(/[,\n]+/)
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white resize-y"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Typical Dosage Note
                            </label>
                            <input
                              type="text"
                              value={editedPayload.ayurveda.typical_dosage_note}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    typical_dosage_note: e.target.value,
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Classical Formulations (Comma-sep)
                            </label>
                            <input
                              type="text"
                              value={(editedPayload.ayurveda.classical_formulations || []).join(', ')}
                              onChange={(e) =>
                                setEditedPayload({
                                  ...editedPayload,
                                  ayurveda: {
                                    ...editedPayload.ayurveda!,
                                    classical_formulations: e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  },
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Section E: V9 SEO Metadata, Canonical Public Slug & SERP Preview (Sections 4–7) */}
                  <div className="p-5 rounded-2xl border border-indigo-200 bg-indigo-50/30 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-indigo-950 flex items-center gap-2">
                          <Globe className="w-4 h-4 text-indigo-700" />
                          5. SEO Metadata, Canonical URL Slug & SERP Preview (V9 Override — Sections 4–7)
                        </h3>
                        <p className="text-[11px] text-slate-600">
                          Editorial targets: SEO Title <strong>50–60 chars</strong> (max 120), Meta Description{' '}
                          <strong>140–160 chars</strong> (max 320), <strong>5–12</strong> deduplicated keywords,
                          and unique <code>productSlugs/{'{slug}'}</code> reservation.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            draftDetail.currentVersion?.seo_review_status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          SEO: {draftDetail.currentVersion?.seo_review_status || 'pending_review'}
                        </span>
                        <button
                          type="button"
                          disabled={savingSeo}
                          onClick={handleGenerateSEOForDraft}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Generate V9 SEO
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700">
                            SEO Title (Target 50–60, Max 120)
                          </label>
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              seoForm.seoTitle.length >= 50 && seoForm.seoTitle.length <= 60
                                ? 'bg-emerald-100 text-emerald-800'
                                : seoForm.seoTitle.length > 0 && seoForm.seoTitle.length <= 120
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {seoForm.seoTitle.length} / 120 chars
                          </span>
                        </div>
                        <input
                          type="text"
                          value={seoForm.seoTitle}
                          onChange={(e) => {
                            const nextSeo = { ...seoForm, seoTitle: e.target.value };
                            setSeoForm(nextSeo);
                            setEditedPayload({ ...editedPayload, seo: nextSeo });
                          }}
                          placeholder="e.g., Cumin Seeds (Jeera) | Whole Cumin | LeafyMart"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700">
                            Canonical URL Slug (<code>^[a-z0-9]+(?:-[a-z0-9]+)*$</code>)
                          </label>
                          <button
                            type="button"
                            onClick={() => handleCheckSlugAvailability(seoForm.urlSlug || seoForm.seoTitle)}
                            className="text-[10px] font-bold text-indigo-700 hover:underline flex items-center gap-1"
                          >
                            <Link2 className="w-3 h-3" /> Check Availability
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={seoForm.urlSlug}
                            onChange={(e) => {
                              const nextSeo = { ...seoForm, urlSlug: e.target.value.toLowerCase() };
                              setSeoForm(nextSeo);
                              setEditedPayload({ ...editedPayload, seo: nextSeo });
                            }}
                            onBlur={() => {
                              const norm = normalizeUrlSlugClient(seoForm.urlSlug || seoForm.seoTitle);
                              const nextSeo = { ...seoForm, urlSlug: norm };
                              setSeoForm(nextSeo);
                              setEditedPayload({ ...editedPayload, seo: nextSeo });
                              if (norm) handleCheckSlugAvailability(norm);
                            }}
                            placeholder="e.g., cumin-seeds-jeera-whole"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-mono"
                          />
                        </div>
                        {slugCheckState.available !== undefined && (
                          <div className="mt-1 flex items-center justify-between text-[10px]">
                            {slugCheckState.available ? (
                              <span className="text-emerald-700 font-bold">
                                ✓ Slug available: /products/{slugCheckState.normalizedSlug || seoForm.urlSlug}
                              </span>
                            ) : (
                              <span className="text-rose-700 font-bold">
                                ✗ Conflict with product {slugCheckState.conflictProductId}.{' '}
                                {slugCheckState.suggestedSlug && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextSeo = {
                                        ...seoForm,
                                        urlSlug: slugCheckState.suggestedSlug!,
                                      };
                                      setSeoForm(nextSeo);
                                      setEditedPayload({ ...editedPayload, seo: nextSeo });
                                      handleCheckSlugAvailability(slugCheckState.suggestedSlug!);
                                    }}
                                    className="underline ml-1 text-indigo-800"
                                  >
                                    Use {slugCheckState.suggestedSlug}
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-700">
                          Meta Description (Target 140–160, Max 320)
                        </label>
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            seoForm.metaDescription.length >= 140 &&
                            seoForm.metaDescription.length <= 160
                              ? 'bg-emerald-100 text-emerald-800'
                              : seoForm.metaDescription.length > 0 &&
                                seoForm.metaDescription.length <= 320
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {seoForm.metaDescription.length} / 320 chars
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={seoForm.metaDescription}
                        onChange={(e) => {
                          const nextSeo = { ...seoForm, metaDescription: e.target.value };
                          setSeoForm(nextSeo);
                          setEditedPayload({ ...editedPayload, seo: nextSeo });
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-700">
                          SEO Keywords (Comma-separated, 5–12 deduplicated terms, max 80 chars each)
                        </label>
                        <span className="text-[10px] font-mono font-bold text-slate-600">
                          {
                            seoKeywordsInput
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean).length
                          }{' '}
                          / 12 terms
                        </span>
                      </div>
                      <input
                        type="text"
                        value={seoKeywordsInput}
                        onChange={(e) => {
                          setSeoKeywordsInput(e.target.value);
                          const kw = Array.from(
                            new Set(
                              e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean)
                            )
                          );
                          const nextSeo = { ...seoForm, seoKeywords: kw };
                          setSeoForm(nextSeo);
                          setEditedPayload({ ...editedPayload, seo: nextSeo });
                        }}
                        placeholder="cumin seeds, jeera whole, cuminum cyminum, indian spices, leafymart"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                      />
                    </div>

                    {/* Google SERP Live Preview */}
                    <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Google Search & AI Snippet Preview
                      </div>
                      <div className="text-xs text-emerald-800 font-mono truncate">
                        https://www.leafymart.com/products/{seoForm.urlSlug || 'product-slug'}
                      </div>
                      <div className="text-sm font-bold text-blue-800 truncate">
                        {seoForm.seoTitle || editedPayload.title || editedPayload.english_product_name}
                      </div>
                      <div className="text-xs text-slate-600 line-clamp-2">
                        {seoForm.metaDescription || editedPayload.description}
                      </div>
                    </div>

                    {/* SEO Action Bar */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={savingSeo}
                        onClick={() => handleSaveSEOEdits(false)}
                        className="px-3.5 py-2 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-900 text-xs font-bold flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save SEO Draft
                      </button>
                      <button
                        type="button"
                        disabled={savingSeo}
                        onClick={() => handleSaveSEOEdits(true)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve SEO
                      </button>
                      <button
                        type="button"
                        disabled={savingSeo || !linkedMasterId}
                        onClick={handleApplyApprovedSEOToMaster}
                        className="px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#256628] disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        Publish Approved SEO & Slug to Master
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          SUBMENU 4: AI PRODUCT IMAGES (1000 x 1000 #FFFFFF)
         ===================================================================== */}
      {activeSubmenu === 'images' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-[#2E7D32]" />
              Generate 1000×1000 Studio Product Image
            </h2>
            <p className="text-xs text-slate-500">
              Section 17 compliance: Exact <strong>1000 × 1000 px</strong> square PNG on pure white{' '}
              <strong>#FFFFFF</strong> background, occupying 75–85% of the frame with no watermarks or
              price badges.
            </p>

            <div className="p-3 rounded-2xl border border-amber-200 bg-amber-50/50 flex items-center gap-3">
              <img
                src="/assets/reference-kraft-pouch-template.jpg"
                alt="Standard Kraft Pouch Cover Reference"
                className="w-16 h-16 rounded-xl border border-amber-200 object-contain bg-white shrink-0"
              />
              <div className="text-[11px] text-slate-700 leading-snug">
                <div className="font-black text-amber-900 uppercase tracking-wider text-[10px]">
                  Default Cover Design Pattern (Enforced)
                </div>
                Brown Kraft Stand-Up Zipper Pouch • Cream Label (Bold Serif Name, English Subtitle,{' '}
                <em>Italic Botanical Name</em>, 3-Leaf Divider, Product + 2 Leaves, Uppercase Form) •
                Clear Lower Window • Foreground Heap on <strong>#FFFFFF</strong>.
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product Form</label>
                <input
                  type="text"
                  value={imgProductForm}
                  onChange={(e) => setImgProductForm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Packaging / Presentation Style
                </label>
                <input
                  type="text"
                  value={imgPackagingStyle}
                  onChange={(e) => setImgPackagingStyle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Studio Prompt Override (Optional)
                </label>
                <textarea
                  rows={3}
                  value={imgCustomPrompt}
                  onChange={(e) => setImgCustomPrompt(e.target.value)}
                  placeholder="Optional lighting/angle notes..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <button
                type="button"
                disabled={!selectedDraftId || generatingImage}
                onClick={handleGenerateImage}
                className="w-full py-2.5 rounded-xl bg-[#2E7D32] hover:bg-[#256628] disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"
              >
                {generatingImage ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Rendering 1000×1000 PNG...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate 1000×1000 #FFFFFF Image
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">
              Staged Candidate Images ({draftDetail?.images.length || 0})
            </h3>
            {!draftDetail || draftDetail.images.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No candidate images generated for this draft yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {draftDetail.images.map((img) => (
                  <div
                    key={img.id}
                    className={`rounded-2xl border p-4 space-y-3 ${
                      img.status === 'APPROVED'
                        ? 'border-emerald-300 bg-emerald-50/30'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="aspect-square w-full bg-white rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center">
                      {img.preview_url ? (
                        <img
                          src={img.preview_url}
                          alt={draftDetail.draft.source_product_name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">1000×1000 PNG</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-slate-700">
                        {img.width} × {img.height} px • {img.background_hex}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          img.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : img.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {img.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      Checksum: {img.checksum}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleImageDecision(img.id, 'APPROVE')}
                        className="flex-1 py-1.5 rounded-lg bg-[#2E7D32] text-white text-xs font-bold"
                      >
                        Approve 1000×1000
                      </button>
                      <button
                        type="button"
                        onClick={() => handleImageDecision(img.id, 'REJECT')}
                        className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBMENU 5: TAXATION & MARKET RESEARCH (SECTION 21)
         ===================================================================== */}
      {activeSubmenu === 'research' && (
        <div className="space-y-6">
          {!draftDetail ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-slate-500">
              Select a draft from the top dropdown first.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: HSN, GST & Packing Sizes */}
              <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Scale className="w-5 h-5 text-[#2E7D32]" />
                    HSN, GST & Package Sizes
                  </h2>
                  {draftDetail.research?.status && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                        draftDetail.research.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {draftDetail.research.status}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      HSN Code (4–8 Digits) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={taxHsnCode}
                      onChange={(e) => setTaxHsnCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
                      placeholder="e.g., 09103030"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      GST Slab (%) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={taxGstRate}
                      onChange={(e) => setTaxGstRate(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                    >
                      {ALLOWED_GST_SLABS.map((slab) => (
                        <option key={slab} value={slab}>
                          {slab}% GST
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    GST Classification Basis / Reference Note
                  </label>
                  <input
                    type="text"
                    value={taxGstReference}
                    onChange={(e) => setTaxGstReference(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Selected Packing Size <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={resSelectedPackingSize}
                      onChange={(e) => setResSelectedPackingSize(e.target.value)}
                      placeholder="e.g., 100 g, 250 ml, 1 kg"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Master Unit <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={resUnit}
                      onChange={(e) => setResUnit(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.uqc}>
                          {u.uqc} {u.desc ? `(${u.desc})` : ''}
                        </option>
                      ))}
                      {!units.some((u) => u.uqc === resUnit) && (
                        <option value={resUnit}>{resUnit}</option>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Available Packing Sizes (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={resAvailableSizesText}
                    onChange={(e) => setResAvailableSizesText(e.target.value)}
                    placeholder="50 g, 100 g, 250 g, 500 g, 1 kg"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div className="pt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingResearch}
                    onClick={() => handleSaveResearch(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Research Draft
                  </button>
                  <button
                    type="button"
                    disabled={savingResearch}
                    onClick={() => handleSaveResearch(true)}
                    className="px-4 py-2.5 rounded-xl bg-[#2E7D32] hover:bg-[#256628] text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verify & Approve Tax / Price Research
                  </button>
                </div>
              </div>

              {/* Right: Web Price Research & Deterministic Min/Max Calculator */}
              <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Web Market Price Research (Comparable Pack: {resSelectedPackingSize})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Backend deterministically computes <code>lowestWebPrice</code> and{' '}
                      <code>highestWebPrice</code> from included in-stock INR offers matching{' '}
                      <strong>{resSelectedPackingSize}</strong>. Never modifies LeafyMart selling prices.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextOffer: WebPriceSourceOffer = {
                        siteName: 'Amazon India / BigBasket / 1mg',
                        productTitle: `${draftDetail.draft.source_product_name} (${resSelectedPackingSize})`,
                        sourceUrl: 'https://www.amazon.in/',
                        packSize: resSelectedPackingSize,
                        price: 199,
                        mrp: 249,
                        currency: 'INR',
                        inStock: true,
                        included: true,
                        checkedAt: new Date().toISOString(),
                        matchConfidence: 'high',
                      };
                      setResOffers([...resOffers, nextOffer]);
                    }}
                    className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Verified Web Offer
                  </button>
                </div>

                {/* Live Calculated Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      Lowest Web Price (INR)
                    </div>
                    <div className="text-xl font-black text-emerald-700 mt-1">
                      {liveMarketRange.lowestPrice !== null
                        ? `₹${liveMarketRange.lowestPrice.toFixed(2)}`
                        : 'null (Insufficient)'}
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      Highest Web Price (INR)
                    </div>
                    <div className="text-xl font-black text-slate-900 mt-1">
                      {liveMarketRange.highestPrice !== null
                        ? `₹${liveMarketRange.highestPrice.toFixed(2)}`
                        : 'null (Insufficient)'}
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      Eligible Comparable Offers
                    </div>
                    <div className="text-sm font-black text-slate-800 mt-1">
                      {liveMarketRange.eligibleCount} offer(s)
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {liveMarketRange.searchStatus}
                    </div>
                  </div>
                </div>

                {/* Offers List */}
                <div className="space-y-3">
                  {resOffers.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                      No web price offers recorded yet. Status is{' '}
                      <code>insufficient_verified_web_price_data</code> (lowest/highest = null). Click "Add
                      Verified Web Offer" to add comparable listings.
                    </div>
                  ) : (
                    resOffers.map((offer, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center text-xs"
                      >
                        <div className="md:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-400">
                            Store / Marketplace
                          </label>
                          <input
                            type="text"
                            value={offer.siteName}
                            onChange={(e) => {
                              const next = [...resOffers];
                              next[idx] = { ...next[idx], siteName: e.target.value };
                              setResOffers(next);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-400">
                            Source URL
                          </label>
                          <input
                            type="text"
                            value={offer.sourceUrl}
                            onChange={(e) => {
                              const next = [...resOffers];
                              next[idx] = { ...next[idx], sourceUrl: e.target.value };
                              setResOffers(next);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono text-[11px]"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400">Pack Size</label>
                          <input
                            type="text"
                            value={offer.packSize}
                            onChange={(e) => {
                              const next = [...resOffers];
                              next[idx] = { ...next[idx], packSize: e.target.value };
                              setResOffers(next);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400">
                            Price (INR)
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={offer.price}
                            onChange={(e) => {
                              const next = [...resOffers];
                              next[idx] = { ...next[idx], price: Number(e.target.value) };
                              setResOffers(next);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold"
                          />
                        </div>
                        <div className="md:col-span-2 flex items-center justify-end gap-2 pt-3">
                          <label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={offer.included}
                              onChange={(e) => {
                                const next = [...resOffers];
                                next[idx] = { ...next[idx], included: e.target.checked };
                                setResOffers(next);
                              }}
                            />
                            Include
                          </label>
                          <button
                            type="button"
                            onClick={() => setResOffers(resOffers.filter((_, i) => i !== idx))}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUBMENU 5B: AI COMMERCE & PRODUCT DISCOVERABILITY (V10 — SECTIONS 12–21)
         ===================================================================== */}
      {activeSubmenu === 'commerce' && (
        <div className="space-y-6">
          {/* 1. Readiness Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {[
              {
                label: 'Master Products',
                value: commerceOverview?.readinessSummary.totalProducts ?? products.length,
                tone: 'bg-white border-slate-200 text-slate-900',
              },
              {
                label: 'Commerce Enabled',
                value: commerceOverview?.readinessSummary.commerceEnabledCount ?? 0,
                tone: 'bg-emerald-50 border-emerald-200 text-emerald-900',
              },
              {
                label: 'Public Projections',
                value: commerceOverview?.readinessSummary.publishedProjectionCount ?? 0,
                tone: 'bg-indigo-50 border-indigo-200 text-indigo-900',
              },
              {
                label: 'Slug Reservations',
                value: commerceOverview?.readinessSummary.activeSlugCount ?? 0,
                tone: 'bg-blue-50 border-blue-200 text-blue-900',
              },
              {
                label: 'Ready (Pass)',
                value: commerceOverview?.readinessSummary.readyCount ?? 0,
                tone: 'bg-emerald-50 border-emerald-200 text-emerald-800',
              },
              {
                label: 'Warnings',
                value: commerceOverview?.readinessSummary.warningCount ?? 0,
                tone: 'bg-amber-50 border-amber-200 text-amber-800',
              },
              {
                label: 'Blocked (Errors)',
                value: commerceOverview?.readinessSummary.blockedCount ?? 0,
                tone: 'bg-rose-50 border-rose-200 text-rose-800',
              },
              {
                label: 'Opted-Out / Disabled',
                value: commerceOverview?.readinessSummary.disabledCount ?? 0,
                tone: 'bg-slate-50 border-slate-200 text-slate-600',
              },
            ].map((card) => (
              <div key={card.label} className={`p-3.5 rounded-2xl border ${card.tone}`}>
                <div className="text-[10px] font-black uppercase tracking-wider opacity-75">
                  {card.label}
                </div>
                <div className="text-xl font-black mt-1">{card.value}</div>
              </div>
            ))}
          </div>

          {/* 2. Live Public Feeds, Sitemap, Robots & LLMs Bar */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#2E7D32]" />
                Multi-Platform Commerce Feeds, Sitemap & Structured Discovery Endpoints
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Reads strictly from allowlisted <code>public_products</code> projections. Never exposes
                competitor research prices or internal stock counts.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: 'Google XML', href: '/feeds/google-products.xml' },
                { label: 'Bing XML', href: '/feeds/bing-products.xml' },
                { label: 'OpenAI JSONL', href: '/feeds/openai-products.jsonl' },
                { label: 'Public JSON', href: '/feeds/products.json' },
                { label: 'Sitemap.xml', href: '/sitemap.xml' },
                { label: 'Robots.txt', href: '/robots.txt' },
                { label: 'LLMs.txt', href: '/llms.txt' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-bold flex items-center gap-1"
                >
                  <span>{link.label}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              ))}

              <button
                type="button"
                disabled={busyCommerceAction}
                onClick={() => handleBuildCommerceFeeds(true, 'all')}
                className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-bold"
              >
                Dry-Run Feed Build
              </button>
              <button
                type="button"
                disabled={busyCommerceAction}
                onClick={() => handleBuildCommerceFeeds(false, 'all')}
                className="px-3.5 py-1.5 rounded-xl bg-[#2E7D32] hover:bg-[#256628] text-white text-xs font-black shadow-sm"
              >
                Publish Feed Snapshots
              </button>
            </div>
          </div>

          {/* 3. Main Grid: Left = V10 Commerce Staging Editor, Right = Platform Settings & Validation */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left: V10 AI Commerce Staging & Editor */}
            <div className="xl:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#2E7D32]" />
                    V10 AI Commerce Staging & Structured Attribute Editor
                  </h2>
                  <p className="text-xs text-slate-500">
                    Generates & stages Product Highlights (4–6), Product FAQs (3–6 Q&A pairs), Google
                    Product Category, Dietary Attributes & Canonical URL Slug. Never fabricates GTIN, MPN,
                    FSSAI, prices, or reviews.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedCommerceProductId}
                    onChange={(e) => setSelectedCommerceProductId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-slate-50"
                  >
                    <option value="">-- Select Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku || p.id})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedCommerceProductId || busyCommerceAction}
                    onClick={handleGenerateCommerceForProduct}
                    className="px-3.5 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#256628] disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate V10 Draft
                  </button>
                </div>
              </div>

              {/* SEO + Slug Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    SEO Title ({commerceForm.seoTitle.length}/120 chars)
                  </label>
                  <input
                    type="text"
                    value={commerceForm.seoTitle}
                    onChange={(e) =>
                      setCommerceForm({ ...commerceForm, seoTitle: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Canonical URL Slug (<code>/products/{commerceForm.urlSlug || '...'}</code>)
                  </label>
                  <input
                    type="text"
                    value={commerceForm.urlSlug}
                    onChange={(e) =>
                      setCommerceForm({
                        ...commerceForm,
                        urlSlug: normalizeUrlSlugClient(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Meta Description ({commerceForm.metaDescription.length}/320 chars)
                </label>
                <textarea
                  rows={2}
                  value={commerceForm.metaDescription}
                  onChange={(e) =>
                    setCommerceForm({ ...commerceForm, metaDescription: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              {/* Google Product Category & Store Product Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Google Product Category (Taxonomy Path)
                  </label>
                  <input
                    type="text"
                    value={commerceForm.googleProductCategory}
                    onChange={(e) =>
                      setCommerceForm({
                        ...commerceForm,
                        googleProductCategory: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Store Product Type
                  </label>
                  <input
                    type="text"
                    value={commerceForm.productType}
                    onChange={(e) =>
                      setCommerceForm({ ...commerceForm, productType: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              {/* Weight vs Volume Separation */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    Net Weight (Mass)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={commerceForm.netWeight ?? ''}
                    onChange={(e) =>
                      setCommerceForm({
                        ...commerceForm,
                        netWeight: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    Mass Unit (g/kg/mg)
                  </label>
                  <select
                    value={commerceForm.netWeightUnit || 'g'}
                    onChange={(e) =>
                      setCommerceForm({
                        ...commerceForm,
                        netWeightUnit: e.target.value as 'g' | 'kg' | 'mg',
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white font-bold"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="mg">mg</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    Net Volume (Liquid)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={commerceForm.netVolume ?? ''}
                    onChange={(e) =>
                      setCommerceForm({
                        ...commerceForm,
                        netVolume: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    Volume Unit (ml/l)
                  </label>
                  <select
                    value={commerceForm.netVolumeUnit || ''}
                    onChange={(e) =>
                      setCommerceForm({
                        ...commerceForm,
                        netVolumeUnit: e.target.value ? (e.target.value as 'ml' | 'l') : null,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white font-bold"
                  >
                    <option value="">None (Solid)</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                  </select>
                </div>
              </div>

              {/* Product Highlights (4-6 bullets) & Search/Dietary Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Product Highlights (4–6 Factual Bullets, One per line)
                  </label>
                  <textarea
                    rows={4}
                    value={formatArrayAsLines(commerceForm.productHighlights)}
                    onChange={(e) =>
                      setCommerceForm({
                        ...commerceForm,
                        productHighlights: parseLinesToArray(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Dietary Attributes (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={(commerceForm.dietaryAttributes || []).join(', ')}
                      onChange={(e) =>
                        setCommerceForm({
                          ...commerceForm,
                          dietaryAttributes: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Search Tags (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={(commerceForm.searchTags || []).join(', ')}
                      onChange={(e) =>
                        setCommerceForm({
                          ...commerceForm,
                          searchTags: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Product FAQs (3-6 Q&A pairs) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700">
                    Structured Product FAQs (3–6 Q&A Pairs for AI Shopping Assistants & FAQ Schema)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const nextFaq: ProductFAQItem = {
                        question: 'How should this product be stored in Indian climate conditions?',
                        answer:
                          'Store in a cool, dry place inside an airtight container away from direct sunlight and moisture.',
                      };
                      setCommerceForm({
                        ...commerceForm,
                        productFAQs: [...(commerceForm.productFAQs || []), nextFaq],
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add FAQ Pair
                  </button>
                </div>

                {(commerceForm.productFAQs || []).map((faq, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 grid grid-cols-1 md:grid-cols-12 gap-2 items-start"
                  >
                    <div className="md:col-span-5">
                      <input
                        type="text"
                        value={faq.question}
                        onChange={(e) => {
                          const next = [...commerceForm.productFAQs];
                          next[idx] = { ...next[idx], question: e.target.value };
                          setCommerceForm({ ...commerceForm, productFAQs: next });
                        }}
                        placeholder="Question..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white font-semibold"
                      />
                    </div>
                    <div className="md:col-span-6">
                      <input
                        type="text"
                        value={faq.answer}
                        onChange={(e) => {
                          const next = [...commerceForm.productFAQs];
                          next[idx] = { ...next[idx], answer: e.target.value };
                          setCommerceForm({ ...commerceForm, productFAQs: next });
                        }}
                        placeholder="Factual answer..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                      />
                    </div>
                    <div className="md:col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const next = commerceForm.productFAQs.filter((_, i) => i !== idx);
                          setCommerceForm({ ...commerceForm, productFAQs: next });
                        }}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Commerce Staging Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableCommerceOnApply}
                    onChange={(e) => setEnableCommerceOnApply(e.target.checked)}
                    className="rounded border-slate-300 text-[#2E7D32]"
                  />
                  <span>Enable AI Commerce & Feed Syndication (aiCommerceEnabled = true) on Apply</span>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyCommerceAction || !selectedCommerceProductId}
                    onClick={() => handleSaveAndApproveCommerce(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={busyCommerceAction || !selectedCommerceProductId}
                    onClick={() => handleSaveAndApproveCommerce(true)}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve Commerce
                  </button>
                  <button
                    type="button"
                    disabled={busyCommerceAction || !selectedCommerceProductId}
                    onClick={handleApplyCommerceToMaster}
                    className="px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#256628] text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    Apply to Master & Publish Projection
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Platform Settings Matrix & Feed Snapshot History */}
            <div className="xl:col-span-5 space-y-6">
              {/* Platform Eligibility & Settings Matrix */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Platform Adapters & Feature Flags (ai_commerce_settings)
                  </h3>
                  <p className="text-xs text-slate-500">
                    All platforms default to disabled until explicitly enabled by an Administrator.
                  </p>
                </div>

                <div className="space-y-3">
                  {(commerceOverview?.settings || []).map((st) => (
                    <div
                      key={st.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-black text-slate-900">
                            {st.platformName || st.displayName || st.id}
                          </span>
                          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200 text-slate-800">
                            {st.priorityTier || st.priority || 'P0'} •{' '}
                            {String(st.feedFormat || 'xml').toUpperCase()}
                          </span>
                        </div>
                        <label className="inline-flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(st.enabled)}
                            onChange={(e) =>
                              handleTogglePlatformSetting(st, { enabled: e.target.checked })
                            }
                            className="rounded border-slate-300 text-[#2E7D32]"
                          />
                          <span>{st.enabled ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span className="font-mono">{st.feedPath || (st as any).feedEndpoint || '/feeds/products.json'}</span>
                        {st.id === 'openai_chatgpt' && (
                          <label className="inline-flex items-center gap-1 font-bold text-indigo-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(st.featureFlagEnabled)}
                              onChange={(e) =>
                                handleTogglePlatformSetting(st, {
                                  featureFlagEnabled: e.target.checked,
                                })
                              }
                            />
                            <span>P2 Adapter Feature Flag</span>
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feed Snapshot History */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Feed Snapshot History (ai_commerce_feeds)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {(commerceOverview?.feeds || []).length} snapshot(s)
                  </span>
                </div>

                {(commerceOverview?.feeds || []).length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No feed snapshots built yet. Click "Publish Feed Snapshots" above.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
                    {(commerceOverview?.feeds || []).slice(0, 8).map((fd) => (
                      <div
                        key={fd.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {fd.platform} ({String(fd.format || 'xml').toUpperCase()})
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            Eligible: {fd.eligibleItems ?? fd.itemCount ?? fd.count ?? 0}/
                            {fd.totalItems ?? fd.itemCount ?? fd.count ?? 0} • Checksum: {fd.checksum}
                          </div>
                        </div>
                        {fd.contentPreview && (
                          <button
                            type="button"
                            onClick={() =>
                              setFeedPreviewModal({
                                title: `${fd.platform} (${fd.generatedAt})`,
                                format: fd.format,
                                content: fd.contentPreview || '',
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                          >
                            Inspect
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Per-Product Platform Readiness & Validation Diagnostics Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Per-Product Platform Readiness & Validation Diagnostics (ai_commerce_validation)
                </h3>
                <p className="text-xs text-slate-500">
                  Strictly separates local readiness validation (<code>localReadiness</code>) from remote
                  platform confirmation (<code>remoteStatus: not_configured</code> when external API
                  credentials are not provisioned).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3">Product & SKU</th>
                    <th className="py-3 px-3">Canonical URL Slug</th>
                    <th className="py-3 px-3">Opt-In</th>
                    <th className="py-3 px-3">Overall Readiness</th>
                    <th className="py-3 px-3">Google Merchant (P0)</th>
                    <th className="py-3 px-3">Public Web (P0)</th>
                    <th className="py-3 px-3">Diagnostics / Issues</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {products.map((prod) => {
                    const val = commerceOverview?.validation.find((v) => v.productId === prod.id);
                    return (
                      <tr key={prod.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{prod.name}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            SKU: {prod.sku || 'N/A'} • ₹{prod.offerPrice || prod.onlinePrice || prod.mrp || 0}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          {prod.urlSlug ? (
                            <a
                              href={`/products/${prod.urlSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-700 hover:underline flex items-center gap-1"
                            >
                              <span>/products/{prod.urlSlug}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-amber-700">Not assigned</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              prod.aiCommerceEnabled
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {prod.aiCommerceEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              val?.overallReadiness === 'ready'
                                ? 'bg-emerald-100 text-emerald-800'
                                : val?.overallReadiness === 'warning'
                                ? 'bg-amber-100 text-amber-800'
                                : val?.overallReadiness === 'blocked'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {val?.overallReadiness || 'unvalidated'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[11px] font-mono">
                          {val?.platformReadiness?.google_merchant || '—'}
                        </td>
                        <td className="py-3 px-3 text-[11px] font-mono">
                          {val?.platformReadiness?.public_web || '—'}
                        </td>
                        <td className="py-3 px-3 max-w-[280px]">
                          {val?.issues && val.issues.length > 0 ? (
                            <div className="space-y-0.5">
                              {val.issues.slice(0, 2).map((iss, i) => (
                                <div
                                  key={i}
                                  className={`text-[10px] truncate ${
                                    iss.severity === 'error'
                                      ? 'text-rose-700 font-bold'
                                      : 'text-amber-700'
                                  }`}
                                  title={iss.message}
                                >
                                  • [{iss.field}] {iss.message}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-emerald-700">No blocking issues</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedCommerceProductId(prod.id)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px]"
                            >
                              Edit V10
                            </button>
                            <button
                              type="button"
                              disabled={busyCommerceAction}
                              onClick={() => handleValidateCommerceProduct(prod.id)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-[11px]"
                            >
                              Validate
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Feed Preview Modal */}
          {feedPreviewModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl border border-slate-200 max-w-4xl w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-900">{feedPreviewModal.title}</h3>
                    <p className="text-xs text-slate-500">Format: {feedPreviewModal.format}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeedPreviewModal(null)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                  >
                    Close
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-900 text-emerald-300 text-[11px] font-mono overflow-x-auto max-h-[460px] overflow-y-auto whitespace-pre-wrap">
                  {feedPreviewModal.content}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUBMENU 6: UPDATE PRODUCT MASTER (DIFF & TRANSACTIONAL SYNC)
         ===================================================================== */}
      {activeSubmenu === 'sync' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          {!draftDetail ? (
            <div className="py-10 text-center text-slate-500">
              Select a draft from the top dropdown to compare with Product Master.
            </div>
          ) : (
            <>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <GitCompare className="w-5 h-5 text-[#2E7D32]" />
                    Compare & Synchronize Approved Fields to Product Master
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select specific approved fields to synchronize into <code>products</code> inside a
                    single atomic transaction. Unchecked fields, selling prices (MRP/Online/Offer), and
                    existing 8-digit SKUs are never overwritten.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 ${
                        syncTargetMasterId
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      {syncTargetMasterId ? 'Linked Existing Product' : 'New Product (Auto-Create)'}
                    </span>
                    <input
                      type="text"
                      readOnly
                      value={
                        syncTargetMasterId
                          ? `${
                              products.find((p) => p.id === syncTargetMasterId)?.name ||
                              masterUpdationForm.name
                            } (SKU: ${
                              products.find((p) => p.id === syncTargetMasterId)?.sku ||
                              masterUpdationForm.sku
                            })`
                          : `${
                              masterUpdationForm.name || draftDetail.draft.source_product_name
                            } — New Product (Auto SKU: ${masterUpdationForm.sku})`
                      }
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-slate-100 text-slate-800 min-w-[300px] cursor-not-allowed"
                      title="Automatically matched by product name in products table (non-editable)"
                    />
                  </div>

                  <select
                    value={syncImageAction}
                    onChange={(e) =>
                      setSyncImageAction(e.target.value as 'none' | 'replace_primary' | 'append_gallery')
                    }
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                  >
                    <option value="none">Image Action: Do Not Sync Image</option>
                    <option value="replace_primary">
                      Image Action: Replace Primary Image (Requires Approved 1000×1000)
                    </option>
                    <option value="append_gallery">
                      Image Action: Append to Gallery (Requires Approved 1000×1000)
                    </option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleExportProductsTable('csv')}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5"
                    title="Export full products table (including existing fields, Product Master Updation fields, and leafycategory) as CSV"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-600" />
                    Export Products CSV
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportProductsTable('json')}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5"
                    title="Export full products table as JSON"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                    Export JSON
                  </button>

                  <button
                    type="button"
                    disabled={
                      applyingSync ||
                      (draftDetail.draft.status !== 'APPROVED' &&
                        draftDetail.draft.status !== 'APPLIED')
                    }
                    onClick={handleApplyToProductMaster}
                    className="px-5 py-2.5 rounded-xl bg-[#2E7D32] hover:bg-[#256628] disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm"
                  >
                    {applyingSync ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Applying to Master...
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-4 h-4" />
                        {syncTargetMasterId
                          ? `Apply Selected (${selectedSyncFields.size}) & Update Master`
                          : `Create New Product & Apply (${selectedSyncFields.size})`}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {draftDetail.draft.status !== 'APPROVED' && draftDetail.draft.status !== 'APPLIED' && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-between">
                  <span>
                    This draft is currently <strong>{draftDetail.draft.status}</strong>. You must approve
                    the content in "Review & Edit Content" before synchronizing to Product Master.
                  </span>
                  <button
                    type="button"
                    onClick={() => onSubmenuChange('review')}
                    className="px-3 py-1.5 rounded-lg bg-amber-800 text-white text-xs font-bold"
                  >
                    Go to Review & Approve
                  </button>
                </div>
              )}

              {/* =================================================================
                  DEDICATED SECTION JUST ABOVE FIELD MAPPING:
                  PRODUCT MASTER UPDATION FIELDS (16 CORE FIELDS + LEAFYCATEGORY)
                 ================================================================= */}
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/30 p-6 space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-emerald-200/80 pb-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#2E7D32] text-white">
                        Product Master Updation
                      </span>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                        Core Product Master Fields (`products` Table)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {syncTargetMasterId ? (
                        <>
                          Matched existing product <strong>{masterUpdationForm.name}</strong> in{' '}
                          <code>products</code> table. Updating will preserve all existing{' '}
                          <code>products</code> fields and apply the values below.
                        </>
                      ) : (
                        <>
                          No matching product name found in <code>products</code> table — treated as a{' '}
                          <strong>New Product</strong> with auto-allocated 8-digit SKU{' '}
                          <code>{masterUpdationForm.sku}</code> and all standard <code>products</code>{' '}
                          table fields initialized.
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-2xl border border-emerald-200 shadow-2xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      AI Category (<code>products.leafycategory</code>):
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-black">
                      {editedPayload?.category ||
                        masterUpdationForm.leafycategory ||
                        draftDetail.draft.category_hint ||
                        'Herbs & Botanicals'}
                    </span>
                  </div>
                </div>

                {/* Row 1: PROD NAME, SKU (8-DIGIT AUTO), PACKING SIZE, UNIT (UQC) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      PROD NAME:
                    </label>
                    <input
                      type="text"
                      value={masterUpdationForm.name}
                      onChange={(e) => {
                        const nextName = e.target.value;
                        const matched = findMatchingProductByName([nextName]);
                        if (matched) {
                          setSyncTargetMasterId(matched.id);
                          setLinkedMasterId(matched.id);
                          setIsNewMasterProduct(false);
                          setMasterUpdationForm((prev) => ({
                            ...prev,
                            name: nextName,
                            sku: /^[0-9]{8}$/.test(String(matched.sku || ''))
                              ? String(matched.sku)
                              : prev.sku,
                          }));
                        } else {
                          setSyncTargetMasterId('');
                          setLinkedMasterId('');
                          setIsNewMasterProduct(true);
                          setMasterUpdationForm((prev) => ({
                            ...prev,
                            name: nextName,
                            sku: computeNextEightDigitSku(),
                          }));
                        }
                      }}
                      placeholder="Enter product name..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      SKU (8-DIGIT AUTO):
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={masterUpdationForm.sku}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-xs font-mono font-black text-slate-700 cursor-not-allowed"
                      title="8-digit numeric SKU is automatically allocated and immutable once assigned"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      PACKING SIZE:
                    </label>
                    <input
                      type="text"
                      value={masterUpdationForm.packingSize}
                      onChange={(e) =>
                        setMasterUpdationForm((prev) => ({
                          ...prev,
                          packingSize: e.target.value,
                        }))
                      }
                      placeholder="e.g., 100 g, 250 g, 1 kg"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      UNIT (UQC):
                    </label>
                    <select
                      value={masterUpdationForm.unit}
                      onChange={(e) =>
                        setMasterUpdationForm((prev) => ({
                          ...prev,
                          unit: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                    >
                      {(units && units.length > 0
                        ? units
                        : [
                            { id: '1', uqc: 'PAC', desc: 'PACKS' },
                            { id: '2', uqc: 'NOS', desc: 'NUMBERS' },
                            { id: '3', uqc: 'GMS', desc: 'GRAMS' },
                            { id: '4', uqc: 'KGS', desc: 'KILOGRAMS' },
                            { id: '5', uqc: 'BTL', desc: 'BOTTLES' },
                            { id: '6', uqc: 'BOX', desc: 'BOX' },
                          ]
                      ).map((u: any) => (
                        <option key={u.id || u.uqc} value={u.uqc}>
                          {u.uqc} — {u.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 2: MRP (₹), ONLINE PRICE (₹), SHOP PRICE (₹), GST RATE (%) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      MRP (₹):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={masterUpdationForm.mrp}
                      onChange={(e) =>
                        setMasterUpdationForm((prev) => ({
                          ...prev,
                          mrp: Number(e.target.value || 0),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      ONLINE PRICE (₹):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={masterUpdationForm.onlinePrice}
                      onChange={(e) =>
                        setMasterUpdationForm((prev) => ({
                          ...prev,
                          onlinePrice: Number(e.target.value || 0),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-emerald-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      SHOP PRICE (₹):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={masterUpdationForm.shopPrice}
                      onChange={(e) =>
                        setMasterUpdationForm((prev) => ({
                          ...prev,
                          shopPrice: Number(e.target.value || 0),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      GST RATE (%):
                    </label>
                    <select
                      value={masterUpdationForm.gstPercentage}
                      onChange={(e) =>
                        setMasterUpdationForm((prev) => ({
                          ...prev,
                          gstPercentage: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                    >
                      {ALLOWED_GST_SLABS.map((slab) => (
                        <option key={slab} value={slab}>
                          {slab}% GST
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 3: CATEGORIES (SELECT MULTIPLE), BRAND, BRAND OWNER, Stock In (Qty Received) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      CATEGORIES (SELECT MULTIPLE):
                    </label>
                    <div className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                        {masterUpdationForm.categories.length === 0 ? (
                          <span className="text-[11px] text-slate-400 italic">
                            No categories selected — choose from product_categories below
                          </span>
                        ) : (
                          masterUpdationForm.categories.map((cat) => (
                            <span
                              key={cat}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900"
                            >
                              <span>{cat}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setMasterUpdationForm((prev) => ({
                                    ...prev,
                                    categories: prev.categories.filter((c) => c !== cat),
                                  }))
                                }
                                className="text-emerald-700 hover:text-rose-600 font-black cursor-pointer"
                                title="Remove category"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <select
                        id="master-update-categories-select"
                        value=""
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (!val) return;
                          setMasterUpdationForm((prev) => ({
                            ...prev,
                            categories: Array.from(new Set([...prev.categories, val])),
                          }));
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 font-semibold text-slate-800 cursor-pointer"
                      >
                        <option value="">
                          + Select Category from product_categories ({allCategoryRecords.length})...
                        </option>
                        {allCategoryRecords.map((catDoc: any) => {
                          const alreadySelected = masterUpdationForm.categories.some(
                            (c) => c.toLowerCase() === String(catDoc.name).toLowerCase()
                          );
                          return (
                            <option key={catDoc.id} value={catDoc.name} disabled={alreadySelected}>
                              {catDoc.name}
                              {catDoc.categoryId ? ` (${catDoc.categoryId})` : ''}
                              {alreadySelected ? ' ✓ Selected' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      BRAND:
                    </label>
                    <select
                      id="master-update-brand-select"
                      value={masterUpdationForm.brand}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matchedBrand = allBrandRecords.find(
                          (b: any) => String(b?.name || '').toLowerCase() === val.toLowerCase()
                        );
                        setMasterUpdationForm((prev) => ({
                          ...prev,
                          brand: val,
                          brandOwner: matchedBrand ? String((matchedBrand as any).owner || '') : '',
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 cursor-pointer"
                    >
                      <option value="">-- Select Brand --</option>
                      {masterUpdationForm.brand &&
                        !allBrandRecords.some(
                          (b: any) =>
                            String(b?.name || '').toLowerCase() ===
                            masterUpdationForm.brand.toLowerCase()
                        ) && (
                          <option value={masterUpdationForm.brand}>
                            {masterUpdationForm.brand}
                          </option>
                        )}
                      {allBrandRecords.map((b: any) => (
                        <option key={b.id} value={b.name}>
                          {b.name}
                          {b.brandId ? ` (${b.brandId})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      BRAND OWNER (AUTO FROM BRAND):
                    </label>
                    <input
                      id="master-update-brand-owner-input"
                      type="text"
                      readOnly
                      value={masterUpdationForm.brandOwner}
                      placeholder="Auto-filled from selected Brand"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-100 text-xs font-bold text-slate-700 cursor-not-allowed"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                      Stock In (Qty Received):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={masterUpdationForm.stockIn}
                      onChange={(e) =>
                        setMasterUpdationForm((prev) => ({
                          ...prev,
                          stockIn: Math.max(0, Number(e.target.value || 0)),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>

                {/* Row 4: PRODUCT PHOTO / IMAGE DETAILS & UNIQUE SPEC 1, 2, 3 */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  <div className="lg:col-span-5 p-3.5 rounded-2xl border border-slate-200 bg-white flex items-center gap-3.5">
                    <div className="w-20 h-20 rounded-xl border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden">
                      {masterUpdationForm.imageUrl ? (
                        <img
                          src={masterUpdationForm.imageUrl}
                          alt={masterUpdationForm.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="w-7 h-7 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">
                          PRODUCT PHOTO / IMAGE DETAILS:
                        </label>
                        <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          1000×1000 #FFFFFF
                        </span>
                      </div>
                      <input
                        type="text"
                        value={masterUpdationForm.imageUrl}
                        onChange={(e) => {
                          const url = e.target.value;
                          setMasterUpdationForm((prev) => ({
                            ...prev,
                            imageUrl: url,
                            images: url ? Array.from(new Set([url, ...prev.images])) : prev.images,
                          }));
                        }}
                        placeholder="https://firebasestorage.googleapis.com/v0/b/..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-mono"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {draftDetail.images.length > 0 && (
                          <button
                            type="button"
                            onClick={async () => {
                              const bestImg =
                                draftDetail.images.find((i) => i.status === 'APPROVED') ||
                                draftDetail.images[0];
                              if (bestImg?.preview_url) {
                                let resolvedUrl = bestImg.preview_url;
                                if (!isFirebaseStorageUrlClient(resolvedUrl)) {
                                  const up = await ensureClientFirebaseStorageUrl({
                                    draftId: draftDetail.draft.id,
                                    targetProductId: syncTargetMasterId || undefined,
                                    sourceUrl: resolvedUrl,
                                  });
                                  resolvedUrl = up.downloadUrl;
                                }
                                setMasterUpdationForm((prev) => ({
                                  ...prev,
                                  imageUrl: resolvedUrl,
                                  images: Array.from(
                                    new Set([
                                      resolvedUrl,
                                      ...prev.images.filter((u) => isFirebaseStorageUrlClient(u)),
                                    ])
                                  ),
                                }));
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold"
                          >
                            Use Staged AI 1000×1000 Kraft Image (Firebase Storage)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSubmenuChange('images')}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
                        >
                          Manage AI Images ({draftDetail.images.length})
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                        UNIQUE SPEC 1:
                      </label>
                      <textarea
                        rows={3}
                        value={masterUpdationForm.uniqueSpec1}
                        onChange={(e) =>
                          setMasterUpdationForm((prev) => ({
                            ...prev,
                            uniqueSpec1: e.target.value,
                          }))
                        }
                        placeholder="Unique specification 1..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                        UNIQUE SPEC 2:
                      </label>
                      <textarea
                        rows={3}
                        value={masterUpdationForm.uniqueSpec2}
                        onChange={(e) =>
                          setMasterUpdationForm((prev) => ({
                            ...prev,
                            uniqueSpec2: e.target.value,
                          }))
                        }
                        placeholder="Unique specification 2..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                        UNIQUE SPEC 3:
                      </label>
                      <textarea
                        rows={3}
                        value={masterUpdationForm.uniqueSpec3}
                        onChange={(e) =>
                          setMasterUpdationForm((prev) => ({
                            ...prev,
                            uniqueSpec3: e.target.value,
                          }))
                        }
                        placeholder="Unique specification 3..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
                      />
                    </div>

                    {/* Below UNIQUE SPEC 1 & 2: Ayurvedic Product (Yes/No) & Culinary Uses (Yes/No) */}
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-1.5">
                        AYURVEDIC PRODUCT:
                      </label>
                      <div className="flex items-center gap-2" role="radiogroup" aria-label="Ayurvedic Product">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={masterUpdationForm.isAyurvedicProduct}
                          id="master-update-ayurvedic-yes"
                          onClick={() =>
                            setMasterUpdationForm((prev) => ({
                              ...prev,
                              isAyurvedicProduct: true,
                            }))
                          }
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition ${
                            masterUpdationForm.isAyurvedicProduct
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={!masterUpdationForm.isAyurvedicProduct}
                          id="master-update-ayurvedic-no"
                          onClick={() =>
                            setMasterUpdationForm((prev) => ({
                              ...prev,
                              isAyurvedicProduct: false,
                            }))
                          }
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition ${
                            !masterUpdationForm.isAyurvedicProduct
                              ? 'bg-slate-700 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-1.5">
                        CULINARY USES:
                      </label>
                      <div className="flex items-center gap-2" role="radiogroup" aria-label="Culinary Uses">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={masterUpdationForm.culinarydetails}
                          id="master-update-culinary-yes"
                          onClick={() =>
                            setMasterUpdationForm((prev) => ({
                              ...prev,
                              culinarydetails: true,
                            }))
                          }
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition ${
                            masterUpdationForm.culinarydetails
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={!masterUpdationForm.culinarydetails}
                          id="master-update-culinary-no"
                          onClick={() =>
                            setMasterUpdationForm((prev) => ({
                              ...prev,
                              culinarydetails: false,
                            }))
                          }
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition ${
                            !masterUpdationForm.culinarydetails
                              ? 'bg-slate-700 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 5: Unique AI Content Reference Link (`products.aiContentLink` & `products.aiDraftId`) */}
                <div className="p-3.5 rounded-2xl border border-emerald-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link2 className="w-3.5 h-3.5 text-emerald-700" />
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">
                        AI CONTENT UNIQUE REFERENCE LINK (products.aiContentLink):
                      </label>
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        Draft ID: {masterUpdationForm.aiDraftId || draftDetail.draft.id}
                      </span>
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={masterUpdationForm.aiContentLink}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-mono text-slate-700 cursor-default"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={masterUpdationForm.aiContentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Reference Link
                    </a>
                    <button
                      type="button"
                      onClick={() => onSubmenuChange('history')}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <History className="w-3.5 h-3.5" />
                      View AI Version History
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const all = new Set<string>();
                      comparisonItems.forEach((i) => {
                        if (i.selectable) all.add(i.fieldKey);
                      });
                      setSelectedSyncFields(all);
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
                  >
                    Select All Eligible
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSyncFields(new Set())}
                    className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
                  >
                    Clear Selection
                  </button>
                </div>
                <span className="text-slate-500">
                  Showing {comparisonItems.length} mapped master fields
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-3 w-10">Sync</th>
                      <th className="py-3 px-3">Group</th>
                      <th className="py-3 px-3">Master Field</th>
                      <th className="py-3 px-3">Current Master Value</th>
                      <th className="py-3 px-3">Approved AI Value</th>
                      <th className="py-3 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {comparisonItems.map((item) => {
                      const checked = selectedSyncFields.has(item.fieldKey);
                      return (
                        <tr
                          key={item.fieldKey}
                          className={`${checked ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}`}
                        >
                          <td className="py-3 px-3">
                            <input
                              type="checkbox"
                              disabled={!item.selectable}
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set(selectedSyncFields);
                                if (e.target.checked) next.add(item.fieldKey);
                                else next.delete(item.fieldKey);
                                setSelectedSyncFields(next);
                              }}
                              className="rounded border-slate-300 text-[#2E7D32]"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                              {item.group}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-800">{item.label}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              products.{item.masterField}
                            </div>
                          </td>
                          <td
                            className="py-3 px-3 max-w-[260px] truncate text-slate-500 font-mono text-[11px]"
                            title={
                              item.currentMasterValue === null || item.currentMasterValue === undefined
                                ? ''
                                : typeof item.currentMasterValue === 'object'
                                ? JSON.stringify(item.currentMasterValue, null, 2)
                                : String(item.currentMasterValue)
                            }
                          >
                            {item.currentMasterValue === null || item.currentMasterValue === undefined
                              ? '—'
                              : typeof item.currentMasterValue === 'object'
                              ? JSON.stringify(item.currentMasterValue)
                              : String(item.currentMasterValue)}
                          </td>
                          <td
                            className="py-3 px-3 max-w-[300px] truncate text-slate-900 font-semibold text-[11px]"
                            title={
                              item.proposedAiValue === null || item.proposedAiValue === undefined
                                ? ''
                                : typeof item.proposedAiValue === 'object'
                                ? JSON.stringify(item.proposedAiValue, null, 2)
                                : String(item.proposedAiValue)
                            }
                          >
                            {item.proposedAiValue === null || item.proposedAiValue === undefined
                              ? '—'
                              : typeof item.proposedAiValue === 'object'
                              ? JSON.stringify(item.proposedAiValue)
                              : String(item.proposedAiValue)}
                          </td>
                          <td className="py-3 px-3">
                            {!item.selectable ? (
                              <span className="text-[10px] font-bold text-amber-700">
                                {item.reasonIfLocked || 'Approval required'}
                              </span>
                            ) : item.hasChanged ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                                Changed
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Identical</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          SUBMENU 7: GENERATION HISTORY & SYNC AUDIT LOGS
         ===================================================================== */}
      {activeSubmenu === 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-[#2E7D32]" />
              Master Synchronization Audit Logs (ai_product_sync_logs)
            </h2>
            {(draftDetail?.syncLogs || allSyncLogs).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No master synchronization events recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {(draftDetail?.syncLogs || allSyncLogs).map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        Master Product ID: {log.master_product_id}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{log.applied_at}</span>
                    </div>
                    <div className="text-slate-600">
                      Applied By: <strong>{log.applied_by_email || log.applied_by}</strong> • Image Action:{' '}
                      <code>{log.image_action || 'none'}</code>
                    </div>
                    <div className="text-[11px] text-emerald-800 font-mono">
                      Fields Synchronized ({log.selected_fields?.length || 0}):{' '}
                      {(log.selected_fields || []).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#2E7D32]" />
              Draft Event Timeline (ai_product_events)
            </h2>
            {!draftDetail || draftDetail.events.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Select a draft to inspect its version and approval timeline.
              </div>
            ) : (
              <div className="space-y-2.5">
                {draftDetail.events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-black text-slate-800">{ev.event_type}</span>
                      <span className="text-slate-500 ml-2">
                        by {ev.actor_email || ev.actor_id}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{ev.created_at}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBMENU 8: AI USAGE & COST
         ===================================================================== */}
      {activeSubmenu === 'usage' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#2E7D32]" />
              AI Token Usage, Latency & Cost Telemetry
            </h2>
            <p className="text-xs text-slate-500">
              Recorded per version in <code>ai_product_versions.usage_metadata</code> for OpenAI project{' '}
              <code>leafyearthprdcnt</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-black uppercase text-slate-400">Total Versions</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{allVersions.length}</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-black uppercase text-slate-400">Total Tokens</div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {allVersions
                  .reduce((sum, v) => sum + (v.usage_metadata?.total_tokens || 0), 0)
                  .toLocaleString()}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-black uppercase text-slate-400">Estimated Cost (USD)</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                $
                {allVersions
                  .reduce((sum, v) => sum + (v.usage_metadata?.estimated_cost_usd || 0), 0)
                  .toFixed(4)}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-black uppercase text-slate-400">OpenAI Project</div>
              <div className="text-lg font-mono font-black text-slate-800 mt-1">leafyearthprdcnt</div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBMENU 9: AI CONFIGURATION (SECTION 15)
         ===================================================================== */}
      {activeSubmenu === 'config' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#2E7D32]" />
                OpenAI Provider & Environment Configuration (Section 15)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Server-side environment variables only. API keys are never exposed to the browser or stored
                in database tables.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
              Project: {aiConfig?.projectName || 'leafyearthprdcnt'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold uppercase text-slate-400">AI_PROVIDER</div>
              <div className="font-mono font-bold text-slate-900 mt-1">
                {aiConfig?.provider || 'openai'}
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold uppercase text-slate-400">OPENAI_PROJECT_NAME</div>
              <div className="font-mono font-bold text-slate-900 mt-1">
                {aiConfig?.projectName || 'leafyearthprdcnt'}
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold uppercase text-slate-400">OPENAI_API_KEY Status</div>
              <div className="font-mono font-bold mt-1">
                {aiConfig?.apiKeyConfigured ? (
                  <span className="text-emerald-700">Configured on Server (Masked)</span>
                ) : (
                  <span className="text-amber-700">
                    Not yet provisioned in .env (Using Deterministic Structured Generator)
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold uppercase text-slate-400">OPENAI_MODEL</div>
              <div className="font-mono font-bold text-slate-900 mt-1">
                {aiConfig?.model || 'gpt-4o-mini'}
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold uppercase text-slate-400">OPENAI_IMAGE_MODEL</div>
              <div className="font-mono font-bold text-slate-900 mt-1">
                {aiConfig?.imageModel || 'gpt-image-1'}
              </div>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Studio Image Specification
              </div>
              <div className="font-mono font-bold text-slate-900 mt-1">
                1000 × 1000 px • PNG • #FFFFFF
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 text-slate-200 text-xs font-mono space-y-1">
            <div className="text-emerald-400 font-bold mb-1">
              # Required Server .env Variables (Section 15.3):
            </div>
            <div>AI_PROVIDER=openai</div>
            <div>AI_PRODUCT_CONTENT_ENABLED=true</div>
            <div>OPENAI_PROJECT_NAME=leafyearthprdcnt</div>
            <div>OPENAI_API_KEY=&lt;provided-via-secret-manager-or-env&gt;</div>
            <div>OPENAI_MODEL=&lt;configured-text-model&gt;</div>
            <div>AI_PRODUCT_IMAGE_ENABLED=true</div>
            <div>OPENAI_IMAGE_MODEL=&lt;configured-image-model&gt;</div>
            <div>AI_PRODUCT_IMAGE_WIDTH=1000</div>
            <div>AI_PRODUCT_IMAGE_HEIGHT=1000</div>
            <div>AI_PRODUCT_IMAGE_BACKGROUND=#FFFFFF</div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AIProductContentView;
