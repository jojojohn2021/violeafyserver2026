import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useCRM } from '../store';
import type {
  BannerAssetVariant,
  BannerMediaType,
  BannerPageType,
  BannerPlacement,
  BannerRecord,
  BannerSubmenuId,
  PublicBannerDeliveryItem,
} from '../types';
import {
  APPROVED_CTA_ROUTE_PREFIXES,
  APPROVED_OTHER_PAGE_ROUTES,
  BANNER_PLACEMENTS_CATALOG,
  createAdminBannerClient,
  deleteAdminBannerClient,
  deleteBannerAssetClient,
  fetchPublicBannersClient,
  getClientBannerStatus,
  inspectAndValidateClientMediaFile,
  listAdminBannersClient,
  removeBannerSlideItemClient,
  updateAdminBannerClient,
  updateHomepageSliderSettingsClient,
  uploadBannerAssetClient,
  uploadBannerSlideItemClient,
  validateClientInternalCtaRoute,
} from '../utils/bannerManagementApi';
import {
  Image as ImageIcon,
  Film,
  Plus,
  Search,
  RefreshCw,
  Edit3,
  Trash2,
  Copy,
  Eye,
  Power,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUp,
  ArrowDown,
  Smartphone,
  Monitor,
  ExternalLink,
  Layers,
  ShieldCheck,
  Play,
  Pause,
  Calendar,
} from 'lucide-react';

interface BannerManagementViewProps {
  activeSubmenu?: BannerSubmenuId;
  onSubmenuChange?: (sub: BannerSubmenuId) => void;
}

const SUBMENU_TABS: { id: BannerSubmenuId; label: string; pageTypeFilter: BannerPageType | 'all'; description: string }[] = [
  {
    id: 'all',
    label: 'All Banners',
    pageTypeFilter: 'all',
    description: 'Search, filter, reorder, and manage image & video banners across all target pages.',
  },
  {
    id: 'home',
    label: 'Home Page',
    pageTypeFilter: 'home',
    description: 'Home hero banner (syncs with home_banners/main_video) and additional home placements.',
  },
  {
    id: 'category',
    label: 'Category Pages',
    pageTypeFilter: 'category',
    description: 'Category-specific banners (by categoryId) and generic category landing fallbacks.',
  },
  {
    id: 'product',
    label: 'Product Pages',
    pageTypeFilter: 'product',
    description: 'Product-specific detail banners (by productId) and generic product page fallbacks.',
  },
  {
    id: 'other',
    label: 'Other Pages',
    pageTypeFilter: 'other',
    description: 'Banners targeted to approved internal application routes (/offers, /preorders, /referrals, etc.).',
  },
];

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(val: string): string | null {
  if (!val || !val.trim()) return null;
  const ms = Date.parse(val);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function BannerManagementView({
  activeSubmenu = 'all',
  onSubmenuChange,
}: BannerManagementViewProps) {
  const { hasAccess, products, categories, addCustomAuditLog } = useCRM();

  const canCreate = hasAccess('Banner Management', 'create');
  const canEdit = hasAccess('Banner Management', 'edit');
  const canDelete = hasAccess('Banner Management', 'delete');

  const [currentSubmenu, setCurrentSubmenu] = useState<BannerSubmenuId>(activeSubmenu);
  useEffect(() => {
    setCurrentSubmenu(activeSubmenu);
  }, [activeSubmenu]);

  const handleSelectSubmenu = (sub: BannerSubmenuId) => {
    setCurrentSubmenu(sub);
    if (onSubmenuChange) onSubmenuChange(sub);
  };

  // List & filter state
  const [banners, setBanners] = useState<BannerRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [placementFilter, setPlacementFilter] = useState<string>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Editor modal state
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingBanner, setEditingBanner] = useState<BannerRecord | null>(null);
  const [savingForm, setSavingForm] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [formPageType, setFormPageType] = useState<BannerPageType>('home');
  const [formPageId, setFormPageId] = useState<string>('');
  const [formPlacement, setFormPlacement] = useState<BannerPlacement>('hero');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formSubtitle, setFormSubtitle] = useState<string>('');
  const [formMediaType, setFormMediaType] = useState<BannerMediaType>('video');
  const [formSortOrder, setFormSortOrder] = useState<number>(1);
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formCarouselEnabled, setFormCarouselEnabled] = useState<boolean>(false);
  const [formSlideDurationSec, setFormSlideDurationSec] = useState<number>(6);
  const [formAutoplay, setFormAutoplay] = useState<boolean>(true);
  const [formLoop, setFormLoop] = useState<boolean>(true);
  const [formCtaLabel, setFormCtaLabel] = useState<string>('');
  const [formCtaRoute, setFormCtaRoute] = useState<string>('');
  const [formStartsAt, setFormStartsAt] = useState<string>('');
  const [formEndsAt, setFormEndsAt] = useState<string>('');
  const [formDesktopRatio, setFormDesktopRatio] = useState<string>('8:3');
  const [formMobileRatio, setFormMobileRatio] = useState<string>('4:5');
  const [formMaxVideoMb, setFormMaxVideoMb] = useState<number>(15);
  const [formMaxImageMb, setFormMaxImageMb] = useState<number>(10);

  // Per-variant upload state inside Editor
  const [uploadingVariant, setUploadingVariant] = useState<Partial<Record<BannerAssetVariant, number>>>({});
  const [uploadCancelFns, setUploadCancelFns] = useState<Partial<Record<BannerAssetVariant, () => void>>>({});
  const [variantMessages, setVariantMessages] = useState<
    Partial<Record<BannerAssetVariant, { type: 'error' | 'warning' | 'success'; text: string }>>
  >({});
  const [dragOverVariant, setDragOverVariant] = useState<BannerAssetVariant | null>(null);

  // Delete confirmation modal state
  const [confirmDeleteBanner, setConfirmDeleteBanner] = useState<BannerRecord | null>(null);
  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<{
    banner: BannerRecord;
    variant: BannerAssetVariant;
  } | null>(null);
  const [deletingBusy, setDeletingBusy] = useState<boolean>(false);

  // Live Preview modal state
  const [previewBanner, setPreviewBanner] = useState<BannerRecord | null>(null);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [previewReducedMotion, setPreviewReducedMotion] = useState<boolean>(false);

  // Homepage Slider Settings & Multi-Media Uploader state
  const [homeSliderEnabled, setHomeSliderEnabled] = useState<boolean>(true);
  const [homeSliderTimeSec, setHomeSliderTimeSec] = useState<number>(6);
  const [savingHomeSliderSettings, setSavingHomeSliderSettings] = useState<boolean>(false);
  const [multiUploadBusy, setMultiUploadBusy] = useState<boolean>(false);
  const [multiUploadStatusText, setMultiUploadStatusText] = useState<string | null>(null);
  const [multiUploadProgressPct, setMultiUploadProgressPct] = useState<number>(0);

  // Public API Resolution Tester state
  const [testPageType, setTestPageType] = useState<BannerPageType>('home');
  const [testPageId, setTestPageId] = useState<string>('');
  const [testPlacement, setTestPlacement] = useState<string>('hero');
  const [testResult, setTestResult] = useState<{
    banners: PublicBannerDeliveryItem[];
    effectiveBanners: PublicBannerDeliveryItem[];
    carouselEnabled: boolean;
    matchedScope: string;
  } | null>(null);
  const [testingApi, setTestingApi] = useState<boolean>(false);

  const loadBanners = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const list = await listAdminBannersClient();
      setBanners(list);
      const homeHero = list.find((b) => b.pageType === 'home' && b.placement === 'hero');
      if (homeHero) {
        setHomeSliderEnabled(
          Boolean(homeHero.carouselEnabled || (homeHero.slides && homeHero.slides.length > 0))
        );
        if (homeHero.slideDurationSec && homeHero.slideDurationSec >= 2) {
          setHomeSliderTimeSec(homeHero.slideDurationSec);
        }
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBanners();
  }, [loadBanners]);

  const showToast = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => {
      setSuccessNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // Filtered banners based on active submenu & filters
  const filteredBanners = useMemo(() => {
    const activeTabConfig = SUBMENU_TABS.find((t) => t.id === currentSubmenu) || SUBMENU_TABS[0];
    return banners.filter((b) => {
      if (activeTabConfig.pageTypeFilter !== 'all' && b.pageType !== activeTabConfig.pageTypeFilter) {
        return false;
      }
      if (placementFilter !== 'all' && b.placement.toLowerCase() !== placementFilter.toLowerCase()) {
        return false;
      }
      if (mediaTypeFilter !== 'all' && b.mediaType !== mediaTypeFilter) {
        return false;
      }
      if (statusFilter !== 'all' && getClientBannerStatus(b) !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          b.title.toLowerCase().includes(q) ||
          b.subtitle.toLowerCase().includes(q) ||
          (b.pageId || '').toLowerCase().includes(q) ||
          b.placement.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [banners, currentSubmenu, placementFilter, mediaTypeFilter, statusFilter, searchQuery]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    const defaultPageType: BannerPageType =
      currentSubmenu === 'all' ? 'home' : (currentSubmenu as BannerPageType);
    setEditingBanner(null);
    setFormPageType(defaultPageType);
    setFormPageId(defaultPageType === 'other' ? '/offers' : '');
    setFormPlacement('hero');
    setFormTitle('');
    setFormSubtitle('');
    setFormMediaType('video');
    setFormSortOrder(banners.filter((b) => b.pageType === defaultPageType).length + 1);
    setFormIsActive(true);
    setFormCarouselEnabled(defaultPageType === 'home' ? homeSliderEnabled : false);
    setFormSlideDurationSec(defaultPageType === 'home' ? homeSliderTimeSec : 6);
    setFormAutoplay(true);
    setFormLoop(true);
    setFormCtaLabel('Shop Now');
    setFormCtaRoute('/products');
    setFormStartsAt('');
    setFormEndsAt('');
    setFormDesktopRatio('8:3');
    setFormMobileRatio('4:5');
    setFormMaxVideoMb(15);
    setFormMaxImageMb(10);
    setFormError(null);
    setVariantMessages({});
    setIsEditorOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (banner: BannerRecord) => {
    setEditingBanner(banner);
    setFormPageType(banner.pageType);
    setFormPageId(banner.pageId || '');
    setFormPlacement(banner.placement || 'hero');
    setFormTitle(banner.title);
    setFormSubtitle(banner.subtitle || '');
    setFormMediaType(banner.mediaType);
    setFormSortOrder(banner.sortOrder ?? 1);
    setFormIsActive(banner.isActive);
    setFormCarouselEnabled(Boolean(banner.carouselEnabled || (banner.slides && banner.slides.length > 0)));
    setFormSlideDurationSec(banner.slideDurationSec && banner.slideDurationSec >= 2 ? banner.slideDurationSec : 6);
    setFormAutoplay(banner.autoplay !== false);
    setFormLoop(banner.loop !== false);
    setFormCtaLabel(banner.cta?.label || '');
    setFormCtaRoute(banner.cta?.route || '');
    setFormStartsAt(toDatetimeLocalValue(banner.startsAt));
    setFormEndsAt(toDatetimeLocalValue(banner.endsAt));
    setFormDesktopRatio(banner.placementSpec?.desktopAspectRatio || '8:3');
    setFormMobileRatio(banner.placementSpec?.mobileAspectRatio || '4:5');
    setFormMaxVideoMb(banner.placementSpec?.maxVideoSizeMb || 15);
    setFormMaxImageMb(banner.placementSpec?.maxImageSizeMb || 10);
    setFormError(null);
    setVariantMessages({});
    setIsEditorOpen(true);
  };

  // Save Banner Metadata (Create or Update)
  const handleSaveBannerForm = async (e?: React.FormEvent, keepOpenForAssets = false): Promise<BannerRecord | null> => {
    if (e) e.preventDefault();
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError('Banner Title is required.');
      return null;
    }

    if (formCtaLabel.trim() || formCtaRoute.trim()) {
      const routeCheck = validateClientInternalCtaRoute(formCtaRoute, false);
      if (!routeCheck.valid) {
        setFormError(routeCheck.error || 'Invalid internal CTA route.');
        return null;
      }
    }

    if (formPageType === 'other' && formPageId.trim()) {
      const normalizedOther = formPageId.trim().startsWith('/')
        ? formPageId.trim()
        : `/${formPageId.trim()}`;
      if (!APPROVED_OTHER_PAGE_ROUTES.includes(normalizedOther)) {
        setFormError(`Other page route must be one of: ${APPROVED_OTHER_PAGE_ROUTES.join(', ')}`);
        return null;
      }
    }

    const startsIso = fromDatetimeLocalValue(formStartsAt);
    const endsIso = fromDatetimeLocalValue(formEndsAt);
    if (startsIso && endsIso && Date.parse(startsIso) > Date.parse(endsIso)) {
      setFormError('Schedule Start Time cannot be later than End Time.');
      return null;
    }

    setSavingForm(true);
    try {
      const payload: Partial<BannerRecord> = {
        pageType: formPageType,
        pageId: formPageType === 'home' ? null : formPageId.trim() || null,
        placement: formPlacement.trim().toLowerCase() || 'hero',
        title: formTitle.trim(),
        subtitle: formSubtitle.trim(),
        mediaType: formMediaType,
        sortOrder: Number(formSortOrder) || 1,
        isActive: formIsActive,
        carouselEnabled: formCarouselEnabled,
        slideDurationSec: Math.max(2, Math.min(120, Number(formSlideDurationSec) || 6)),
        autoplay: formAutoplay,
        loop: formLoop,
        cta:
          formCtaLabel.trim() || formCtaRoute.trim()
            ? {
                label: formCtaLabel.trim() || 'Shop Now',
                route: formCtaRoute.trim(),
              }
            : null,
        placementSpec: {
          desktopAspectRatio: formDesktopRatio || '8:3',
          mobileAspectRatio: formMobileRatio || '4:5',
          maxVideoSizeMb: Number(formMaxVideoMb) || 15,
          maxImageSizeMb: Number(formMaxImageMb) || 10,
        },
        startsAt: startsIso,
        endsAt: endsIso,
      };

      let saved: BannerRecord;
      if (editingBanner) {
        saved = await updateAdminBannerClient(editingBanner.id, payload);
        void addCustomAuditLog('BANNER_UPDATED', `Updated banner "${saved.title}" (${saved.id})`);
        showToast(`Banner "${saved.title}" updated.`);
      } else {
        saved = await createAdminBannerClient(payload);
        void addCustomAuditLog('BANNER_CREATED', `Created banner "${saved.title}" (${saved.id})`);
        showToast(`Banner "${saved.title}" created. You can now upload desktop & mobile media assets.`);
      }

      setEditingBanner(saved);
      await loadBanners();
      if (!keepOpenForAssets && editingBanner) {
        setIsEditorOpen(false);
      }
      return saved;
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save banner.');
      return null;
    } finally {
      setSavingForm(false);
    }
  };

  // Handle File Selection / Drop for an Asset Variant
  const handleAssetFileSelected = async (variant: BannerAssetVariant, file: File | null) => {
    if (!file) return;
    setVariantMessages((prev) => ({ ...prev, [variant]: undefined }));

    // Ensure the banner document exists first so we have a canonical bannerId for the Storage path
    let targetBanner = editingBanner;
    if (!targetBanner) {
      if (!formTitle.trim()) {
        setVariantMessages((prev) => ({
          ...prev,
          [variant]: {
            type: 'error',
            text: 'Please enter a Banner Title first so the banner record can be initialized before uploading media.',
          },
        }));
        return;
      }
      targetBanner = await handleSaveBannerForm(undefined, true);
      if (!targetBanner) return;
    }

    // Client-side pre-flight magic-byte & metadata inspection
    const check = await inspectAndValidateClientMediaFile({
      file,
      variant,
      bannerMediaType: formMediaType,
      placementSpec: {
        desktopAspectRatio: formDesktopRatio,
        mobileAspectRatio: formMobileRatio,
        maxVideoSizeMb: formMaxVideoMb,
        maxImageSizeMb: formMaxImageMb,
      },
    });

    if (!check.valid) {
      setVariantMessages((prev) => ({
        ...prev,
        [variant]: { type: 'error', text: check.error || 'Invalid file format or size.' },
      }));
      return;
    }

    setUploadingVariant((prev) => ({ ...prev, [variant]: 1 }));
    try {
      const { banner: updated } = await uploadBannerAssetClient({
        banner: { ...targetBanner, mediaType: formMediaType },
        variant,
        file,
        onProgress: (pct) => {
          setUploadingVariant((prev) => ({ ...prev, [variant]: Math.max(1, pct) }));
        },
        registerCancel: (cancelFn) => {
          setUploadCancelFns((prev) => ({ ...prev, [variant]: cancelFn }));
        },
      });

      setEditingBanner(updated);
      await loadBanners();

      const warningSuffix =
        check.advisoryWarnings.length > 0 ? ` (${check.advisoryWarnings.join(' ')})` : '';
      setVariantMessages((prev) => ({
        ...prev,
        [variant]: {
          type: check.advisoryWarnings.length > 0 ? 'warning' : 'success',
          text: `Uploaded ${file.name} (${formatBytes(file.size)}${
            check.width && check.height ? ` • ${check.width}×${check.height}px` : ''
          }${check.durationSec ? ` • ${check.durationSec}s` : ''}).${warningSuffix}`,
        },
      }));
    } catch (err: any) {
      setVariantMessages((prev) => ({
        ...prev,
        [variant]: { type: 'error', text: err?.message || 'Asset upload failed.' },
      }));
    } finally {
      setUploadingVariant((prev) => {
        const next = { ...prev };
        delete next[variant];
        return next;
      });
      setUploadCancelFns((prev) => {
        const next = { ...prev };
        delete next[variant];
        return next;
      });
    }
  };

  // Duplicate Banner
  const handleDuplicateBanner = async (banner: BannerRecord) => {
    if (!canCreate) return;
    try {
      const copy = await createAdminBannerClient({
        pageType: banner.pageType,
        pageId: banner.pageId,
        placement: banner.placement,
        title: `${banner.title} (Copy)`,
        subtitle: banner.subtitle,
        mediaType: banner.mediaType,
        sortOrder: banner.sortOrder + 1,
        isActive: false,
        carouselEnabled: banner.carouselEnabled,
        autoplay: banner.autoplay,
        loop: banner.loop,
        cta: banner.cta,
        placementSpec: banner.placementSpec,
        startsAt: banner.startsAt,
        endsAt: banner.endsAt,
      });
      void addCustomAuditLog('BANNER_DUPLICATED', `Duplicated banner "${banner.title}" -> "${copy.title}"`);
      showToast(`Duplicated "${banner.title}" as a disabled draft. Upload or attach assets in Edit.`);
      await loadBanners();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to duplicate banner.');
    }
  };

  // Toggle Active / Disabled
  const handleToggleActive = async (banner: BannerRecord) => {
    if (!canEdit) return;
    try {
      const updated = await updateAdminBannerClient(banner.id, {
        isActive: !banner.isActive,
      });
      void addCustomAuditLog(
        'BANNER_STATUS_TOGGLED',
        `${updated.isActive ? 'Enabled' : 'Disabled'} banner "${updated.title}" (${updated.id})`
      );
      showToast(`Banner "${updated.title}" is now ${updated.isActive ? 'Active' : 'Disabled'}.`);
      await loadBanners();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to update banner status.');
    }
  };

  // Adjust Sort Order Priority
  const handleAdjustSortOrder = async (banner: BannerRecord, delta: number) => {
    if (!canEdit) return;
    const nextOrder = Math.max(1, (banner.sortOrder || 1) + delta);
    try {
      await updateAdminBannerClient(banner.id, { sortOrder: nextOrder });
      await loadBanners();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to reorder banner.');
    }
  };

  // Confirm Delete Banner
  const handleConfirmDeleteBanner = async () => {
    if (!confirmDeleteBanner) return;
    setDeletingBusy(true);
    try {
      await deleteAdminBannerClient(confirmDeleteBanner.id);
      void addCustomAuditLog(
        'BANNER_DELETED',
        `Deleted banner "${confirmDeleteBanner.title}" (${confirmDeleteBanner.id}) and its Storage assets.`
      );
      showToast(`Deleted banner "${confirmDeleteBanner.title}" and cleaned up Storage assets.`);
      if (editingBanner?.id === confirmDeleteBanner.id) {
        setIsEditorOpen(false);
        setEditingBanner(null);
      }
      setConfirmDeleteBanner(null);
      await loadBanners();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to delete banner.');
    } finally {
      setDeletingBusy(false);
    }
  };

  // Confirm Delete Single Asset Variant
  const handleConfirmDeleteAsset = async () => {
    if (!confirmDeleteAsset) return;
    setDeletingBusy(true);
    try {
      const updated = await deleteBannerAssetClient(
        confirmDeleteAsset.banner,
        confirmDeleteAsset.variant
      );
      setEditingBanner(updated);
      setVariantMessages((prev) => ({
        ...prev,
        [confirmDeleteAsset.variant]: {
          type: 'success',
          text: `Removed ${confirmDeleteAsset.variant} asset from Firebase Storage.`,
        },
      }));
      setConfirmDeleteAsset(null);
      await loadBanners();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to remove asset.');
    } finally {
      setDeletingBusy(false);
    }
  };

  // Run Public Delivery Precedence Test
  const handleRunPublicApiTest = async () => {
    setTestingApi(true);
    try {
      const res = await fetchPublicBannersClient({
        pageType: testPageType,
        pageId: testPageId.trim() || null,
        placement: testPlacement.trim() || 'hero',
      });
      setTestResult(res);
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to run public banner delivery test');
    } finally {
      setTestingApi(false);
    }
  };

  // Save Homepage Slider Settings (Slider Enabled + Slider Interval Time in Seconds)
  const handleSaveHomepageSliderSettings = async () => {
    if (!canEdit && !canCreate) return;
    const clampedSec = Math.max(2, Math.min(120, Number(homeSliderTimeSec) || 6));
    setHomeSliderTimeSec(clampedSec);
    setSavingHomeSliderSettings(true);
    setErrorBanner(null);
    try {
      const existingHomeBanners = banners.filter((b) => b.pageType === 'home');
      if (existingHomeBanners.length === 0) {
        await createAdminBannerClient({
          pageType: 'home',
          pageId: null,
          placement: 'hero',
          title: 'Freshness Rooted in Nature',
          subtitle: '100% Pure Single-Origin Botanicals & Farm Harvests',
          mediaType: 'video',
          sortOrder: 1,
          isActive: true,
          carouselEnabled: homeSliderEnabled,
          slideDurationSec: clampedSec,
          cta: { label: 'Shop Now', route: '/products' },
        });
      } else {
        await updateHomepageSliderSettingsClient({
          carouselEnabled: homeSliderEnabled,
          slideDurationSec: clampedSec,
        });
      }
      void addCustomAuditLog(
        'HOMEPAGE_SLIDER_SETTINGS_UPDATED',
        `Updated Homepage Slider settings: slider=${homeSliderEnabled ? 'ON' : 'OFF'}, interval=${clampedSec}s`
      );
      showToast(`Homepage Slider settings saved (Interval: ${clampedSec}s per slide).`);
      await loadBanners();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to save Homepage Slider settings.');
    } finally {
      setSavingHomeSliderSettings(false);
    }
  };

  // Upload Multiple Videos & Images into a Banner Slider
  const handleMultiFilesSliderUpload = async (
    fileList: FileList | File[] | null,
    targetBannerOverride?: BannerRecord | null,
    insideModal = false
  ) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setMultiUploadBusy(true);
    setMultiUploadProgressPct(1);
    setMultiUploadStatusText(`Preparing to upload ${files.length} slider media file(s)...`);
    setErrorBanner(null);

    try {
      let targetBanner = targetBannerOverride || null;
      const effectiveDuration = insideModal
        ? Math.max(2, Math.min(120, Number(formSlideDurationSec) || 6))
        : Math.max(2, Math.min(120, Number(homeSliderTimeSec) || 6));

      if (!targetBanner) {
        if (insideModal) {
          if (!formTitle.trim()) {
            setFormTitle('Freshness Rooted in Nature');
          }
          targetBanner = await handleSaveBannerForm(undefined, true);
        } else {
          // Find or create primary homepage hero banner
          targetBanner =
            banners.find((b) => b.pageType === 'home' && b.placement === 'hero') || null;
          if (!targetBanner) {
            targetBanner = await createAdminBannerClient({
              pageType: 'home',
              pageId: null,
              placement: 'hero',
              title: 'Freshness Rooted in Nature',
              subtitle: '100% Pure Single-Origin Botanicals & Farm Harvests',
              mediaType: 'video',
              sortOrder: 1,
              isActive: true,
              carouselEnabled: true,
              slideDurationSec: effectiveDuration,
              cta: { label: 'Shop Now', route: '/products' },
            });
          }
        }
      }

      if (!targetBanner) {
        throw new Error('Could not initialize banner record for slider upload.');
      }

      let currentBanner = targetBanner;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setMultiUploadStatusText(`Uploading slide ${i + 1} of ${files.length}: ${file.name}...`);
        const { banner: updated } = await uploadBannerSlideItemClient({
          banner: currentBanner,
          file,
          slideTitle: currentBanner.title,
          slideDurationSec: effectiveDuration,
          onProgress: (filePct) => {
            const overall = Math.round(((i + filePct / 100) / files.length) * 100);
            setMultiUploadProgressPct(Math.max(1, overall));
          },
        });
        currentBanner = updated;
      }

      if (insideModal) {
        setEditingBanner(currentBanner);
        setFormCarouselEnabled(true);
      }
      setHomeSliderEnabled(true);
      await loadBanners();
      showToast(
        `Uploaded ${files.length} video/image slide(s) to "${currentBanner.title}" (${effectiveDuration}s slider interval).`
      );
    } catch (err: any) {
      if (insideModal) {
        setFormError(err?.message || 'Failed to upload slider media files.');
      } else {
        setErrorBanner(err?.message || 'Failed to upload slider media files.');
      }
    } finally {
      setMultiUploadBusy(false);
      setMultiUploadStatusText(null);
      setMultiUploadProgressPct(0);
    }
  };

  // Remove a Single Slide from a Banner's Slider
  const handleRemoveSlideItem = async (banner: BannerRecord, slideId: string, insideModal = false) => {
    try {
      const updated = await removeBannerSlideItemClient(banner, slideId);
      if (insideModal) {
        setEditingBanner(updated);
      }
      await loadBanners();
      showToast('Removed slide from slider and cleaned up Firebase Storage.');
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to remove slide.');
    }
  };

  const renderStatusBadge = (banner: BannerRecord) => {
    const status = getClientBannerStatus(banner);
    if (status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3" /> Active
        </span>
      );
    }
    if (status === 'scheduled') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
          <Clock className="w-3 h-3" /> Scheduled
        </span>
      );
    }
    if (status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 border border-rose-300">
          <AlertTriangle className="w-3 h-3" /> Expired
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-600 border border-slate-300">
        <Power className="w-3 h-3" /> Disabled
      </span>
    );
  };

  const renderThumbnail = (banner: BannerRecord) => {
    const posterUrl = banner.desktopPoster?.url || banner.mobilePoster?.url;
    const primaryUrl = banner.desktop?.url || banner.mobile?.url;

    if (banner.mediaType === 'video' && primaryUrl) {
      return (
        <div className="relative w-28 h-16 rounded-xl overflow-hidden bg-slate-900 border border-[#D9E2DA] shrink-0 group">
          <video
            src={primaryUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
            className="w-full h-full object-cover"
          />
          <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <Film className="w-2.5 h-2.5 text-emerald-400" /> MP4
          </span>
        </div>
      );
    }

    if (primaryUrl || posterUrl) {
      return (
        <div className="relative w-28 h-16 rounded-xl overflow-hidden bg-slate-100 border border-[#D9E2DA] shrink-0">
          <img
            src={primaryUrl || posterUrl}
            alt={banner.title}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <ImageIcon className="w-2.5 h-2.5 text-sky-300" /> IMG
          </span>
        </div>
      );
    }

    return (
      <div className="w-28 h-16 rounded-xl bg-[#EEF6EE] border border-dashed border-[#D9E2DA] flex flex-col items-center justify-center text-[#5F6B63] shrink-0">
        {banner.mediaType === 'video' ? <Film className="w-4 h-4 mb-0.5" /> : <ImageIcon className="w-4 h-4 mb-0.5" />}
        <span className="text-[9px] font-bold uppercase">No Asset</span>
      </div>
    );
  };

  const renderAssetUploadSlot = (params: {
    variant: BannerAssetVariant;
    title: string;
    subtitleSpec: string;
    icon: React.ReactNode;
    accept: string;
  }) => {
    const { variant, title, subtitleSpec, icon, accept } = params;
    const currentAsset = editingBanner?.[variant] || null;
    const progress = uploadingVariant[variant];
    const msg = variantMessages[variant];
    const isDragOver = dragOverVariant === variant;

    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverVariant(variant);
        }}
        onDragLeave={() => setDragOverVariant((prev) => (prev === variant ? null : prev))}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverVariant(null);
          const dropped = e.dataTransfer.files?.[0] || null;
          if (dropped) void handleAssetFileSelected(variant, dropped);
        }}
        className={`rounded-2xl border p-4 transition flex flex-col justify-between gap-3 ${
          isDragOver
            ? 'border-[#2E7D32] bg-[#EEF6EE]'
            : 'border-[#D9E2DA] bg-[#F7FAF7]'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {icon}
              <h4 className="text-xs font-extrabold text-[#1F2933] uppercase tracking-wide">{title}</h4>
            </div>
            {currentAsset?.url && (
              <span className="text-[10px] font-mono font-bold text-[#2E7D32] bg-[#EEF6EE] border border-[#2E7D32]/30 px-2 py-0.5 rounded-full">
                Uploaded
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#5F6B63] leading-relaxed">{subtitleSpec}</p>
        </div>

        {/* Inline Asset Preview */}
        {currentAsset?.url ? (
          <div className="space-y-2">
            <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-[#D9E2DA] h-36 flex items-center justify-center">
              {currentAsset.mimeType === 'video/mp4' ? (
                <video
                  src={currentAsset.url}
                  controls
                  muted
                  loop
                  playsInline
                  className="max-h-36 w-full object-contain"
                />
              ) : (
                <img
                  src={currentAsset.url}
                  alt={`${title} preview`}
                  className="max-h-36 w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
            <div className="bg-white border border-[#D9E2DA] rounded-xl p-2 text-[10px] font-mono text-[#5F6B63] space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#1F2933] truncate max-w-[180px]">
                  {currentAsset.fileName || currentAsset.storagePath.split('/').pop()}
                </span>
                <span>
                  {currentAsset.mimeType} • {formatBytes(currentAsset.sizeBytes)}
                  {currentAsset.width && currentAsset.height
                    ? ` • ${currentAsset.width}×${currentAsset.height}`
                    : ''}
                  {currentAsset.durationSec ? ` • ${currentAsset.durationSec}s` : ''}
                </span>
              </div>
              <div className="truncate text-[9px] text-slate-400" title={currentAsset.storagePath}>
                Path: {currentAsset.storagePath}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-28 rounded-xl border-2 border-dashed border-[#D9E2DA] bg-white flex flex-col items-center justify-center text-center p-3">
            <Upload className="w-5 h-5 text-[#2E7D32] mb-1" />
            <span className="text-xs font-bold text-[#1F2933]">Drag &amp; drop file here, or click below</span>
            <span className="text-[10px] text-[#5F6B63] mt-0.5">
              Server &amp; client magic-byte signature verified
            </span>
          </div>
        )}

        {/* Progress Bar & Cancel */}
        {progress !== undefined && (
          <div className="space-y-1.5 bg-white border border-[#D9E2DA] rounded-xl p-2.5">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-[#2E7D32]">Uploading to Firebase Storage... {progress}%</span>
              {uploadCancelFns[variant] && (
                <button
                  type="button"
                  onClick={() => uploadCancelFns[variant]?.()}
                  className="text-rose-600 hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="w-full h-2 bg-[#EEF6EE] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2E7D32] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Feedback Notice */}
        {msg && (
          <div
            className={`text-[11px] rounded-xl px-3 py-2 border font-medium ${
              msg.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : msg.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Upload / Replace / Delete Controls */}
        <div className="flex items-center gap-2 pt-1">
          <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#245B2A] text-white text-xs font-bold cursor-pointer transition text-center">
            <Upload className="w-3.5 h-3.5" />
            <span>{currentAsset?.url ? 'Replace Asset' : 'Choose File'}</span>
            <input
              type="file"
              accept={accept}
              className="hidden"
              disabled={progress !== undefined}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                e.currentTarget.value = '';
                if (f) void handleAssetFileSelected(variant, f);
              }}
            />
          </label>

          {currentAsset?.url && editingBanner && (
            <button
              type="button"
              onClick={() => setConfirmDeleteAsset({ banner: editingBanner, variant })}
              className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer transition"
              title="Delete asset from Firebase Storage"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const activeSubmenuConfig = SUBMENU_TABS.find((t) => t.id === currentSubmenu) || SUBMENU_TABS[0];

  return (
    <div className="space-y-6" id="banner-management-module">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#D9E2DA] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#EEF6EE] border border-[#2E7D32]/30 text-[#2E7D32] text-[10px] font-extrabold uppercase tracking-wider">
              Firebase Storage + Cloud Firestore
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold">
              home_banners/main_video Sync Active
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-[#1F2933] tracking-tight mt-1 flex items-center gap-2">
            <Film className="w-5 h-5 text-[#2E7D32]" />
            Banner Management — {activeSubmenuConfig.label}
          </h2>
          <p className="text-xs text-[#5F6B63] mt-0.5">{activeSubmenuConfig.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadBanners()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D9E2DA] bg-white hover:bg-[#EEF6EE] text-xs font-bold text-[#1F2933] cursor-pointer transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#245B2A] text-white text-xs font-extrabold uppercase tracking-wider shadow-xs cursor-pointer transition"
              id="create-banner-btn"
            >
              <Plus className="w-4 h-4" />
              Add New Banner
            </button>
          )}
        </div>
      </div>

      {/* Submenu Pill Bar (All Banners, Home Page, Category Pages, Product Pages, Other Pages) */}
      <div className="flex flex-wrap items-center gap-2 bg-[#F7FAF7] p-2 rounded-2xl border border-[#D9E2DA]">
        {SUBMENU_TABS.map((tab) => {
          const isActive = currentSubmenu === tab.id;
          const count =
            tab.pageTypeFilter === 'all'
              ? banners.length
              : banners.filter((b) => b.pageType === tab.pageTypeFilter).length;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectSubmenu(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'bg-[#2E7D32] text-white shadow-xs'
                  : 'bg-white text-[#1F2933] hover:bg-[#EEF6EE] border border-[#D9E2DA]'
              }`}
              id={`banner-tab-${tab.id}`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#EEF6EE] text-[#2E7D32]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Homepage Banner Slider Settings & Multi-Video/Image Uploader Card */}
      {(currentSubmenu === 'home' || currentSubmenu === 'all') && (
        <div
          className="bg-gradient-to-br from-[#EEF6EE] via-[#F7FAF7] to-white border border-[#2E7D32]/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs"
          id="homepage-slider-settings-panel"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#2E7D32] text-white text-[10px] font-extrabold uppercase tracking-wider">
                  Homepage Banner Slider Settings
                </span>
                <span className="text-[11px] font-mono font-bold text-[#2E7D32]">
                  Multiple Videos (MP4) + Images (WebP / JPEG / PNG)
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#1F2933]">
                Multi-Media Slider Mode, Interval Timer &amp; Batch Slide Uploader
              </h3>
              <p className="text-xs text-[#5F6B63]">
                Upload multiple videos and images to rotate automatically like a slider on the Homepage Hero banner, and set the display duration (in seconds) for each slide.
              </p>
            </div>

            {/* Slider Mode Toggle + Time Input + Presets + Save Button */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-[#D9E2DA]">
              <label className="inline-flex items-center gap-2 text-xs font-extrabold text-[#1F2933] cursor-pointer pr-2 border-r border-[#D9E2DA]">
                <input
                  type="checkbox"
                  checked={homeSliderEnabled}
                  onChange={(e) => setHomeSliderEnabled(e.target.checked)}
                  className="rounded border-[#D9E2DA] text-[#2E7D32]"
                />
                <span>Slider Mode Active</span>
              </label>

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#2E7D32]" />
                <label htmlFor="home-slider-time-input" className="text-xs font-bold text-[#1F2933]">
                  Slider Time (sec):
                </label>
                <input
                  id="home-slider-time-input"
                  type="number"
                  min={2}
                  max={120}
                  value={homeSliderTimeSec}
                  onChange={(e) => setHomeSliderTimeSec(Math.max(2, Math.min(120, Number(e.target.value) || 6)))}
                  className="w-16 px-2.5 py-1.5 rounded-xl border border-[#D9E2DA] text-xs font-mono font-extrabold text-center bg-[#F7FAF7]"
                />
              </div>

              <div className="flex items-center gap-1">
                {[3, 5, 6, 8, 10, 15].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setHomeSliderTimeSec(sec)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition cursor-pointer ${
                      homeSliderTimeSec === sec
                        ? 'bg-[#2E7D32] text-white'
                        : 'bg-[#EEF6EE] text-[#1F2933] hover:bg-[#D9E2DA]'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>

              {(canEdit || canCreate) && (
                <button
                  type="button"
                  disabled={savingHomeSliderSettings}
                  onClick={() => void handleSaveHomepageSliderSettings()}
                  className="px-3.5 py-1.5 rounded-xl bg-[#173F1B] hover:bg-[#245B2A] text-white text-xs font-extrabold cursor-pointer transition"
                >
                  {savingHomeSliderSettings ? 'Saving...' : 'Save Slider Time'}
                </button>
              )}
            </div>
          </div>

          {/* Multi-File Upload Dropzone for Homepage Slider */}
          {(canEdit || canCreate) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    void handleMultiFilesSliderUpload(e.dataTransfer.files, null, false);
                  }
                }}
                className="lg:col-span-1 rounded-2xl border-2 border-dashed border-[#2E7D32]/50 bg-white p-4 flex flex-col items-center justify-center text-center gap-2"
              >
                <div className="flex items-center gap-2 text-[#2E7D32]">
                  <Film className="w-5 h-5" />
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div className="text-xs font-extrabold text-[#1F2933]">
                  Upload Multiple Videos &amp; Images to Homepage Slider
                </div>
                <p className="text-[11px] text-[#5F6B63]">
                  Select or drag &amp; drop multiple MP4 videos and WebP/JPEG/PNG images at once. Each file becomes a slide rotating every <strong>{homeSliderTimeSec}s</strong>.
                </p>

                {multiUploadBusy && (
                  <div className="w-full space-y-1 bg-[#F7FAF7] p-2.5 rounded-xl border border-[#D9E2DA]">
                    <div className="text-[10px] font-bold text-[#2E7D32] truncate">
                      {multiUploadStatusText || 'Uploading slides...'} ({multiUploadProgressPct}%)
                    </div>
                    <div className="w-full h-2 bg-[#EEF6EE] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2E7D32] transition-all duration-200"
                        style={{ width: `${multiUploadProgressPct}%` }}
                      />
                    </div>
                  </div>
                )}

                <label className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#245B2A] text-white text-xs font-extrabold cursor-pointer transition shadow-2xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Select Multiple Videos / Images</span>
                  <input
                    type="file"
                    multiple
                    accept="video/mp4,image/webp,image/jpeg,image/png"
                    disabled={multiUploadBusy}
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        void handleMultiFilesSliderUpload(files, null, false);
                      }
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>

              {/* Active Homepage Slider Slides Strip */}
              <div className="lg:col-span-2 rounded-2xl border border-[#D9E2DA] bg-white p-4 space-y-3">
                {(() => {
                  const homeHeroBanners = banners.filter((b) => b.pageType === 'home' && b.placement === 'hero');
                  const primaryHome = homeHeroBanners[0] || null;
                  const slidesList = primaryHome?.slides || [];

                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-extrabold text-[#1F2933] uppercase tracking-wider">
                          Active Homepage Slider Sequence ({slidesList.length > 0 ? slidesList.length : homeHeroBanners.length} Slide{slidesList.length === 1 ? '' : 's'} • {homeSliderTimeSec}s Interval)
                        </div>
                        {primaryHome && (
                          <button
                            type="button"
                            onClick={() => setPreviewBanner(primaryHome)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#2E7D32] hover:underline cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Preview Slider
                          </button>
                        )}
                      </div>

                      {slidesList.length === 0 ? (
                        <div className="h-28 rounded-xl bg-[#F7FAF7] border border-[#D9E2DA] flex flex-col items-center justify-center text-center p-3 text-xs text-[#5F6B63]">
                          <span>No multi-media slides uploaded yet.</span>
                          <span className="text-[11px] mt-0.5">
                            Use &ldquo;Select Multiple Videos / Images&rdquo; on the left to upload multiple videos and images into the Homepage Slider.
                          </span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-48 overflow-y-auto pr-1">
                          {slidesList.map((slide, idx) => {
                            const url = slide.desktop?.url || slide.mobile?.url || '';
                            return (
                              <div
                                key={slide.id}
                                className="relative rounded-xl overflow-hidden border border-[#D9E2DA] bg-slate-900 group h-28 flex flex-col justify-between"
                              >
                                {slide.mediaType === 'video' && url ? (
                                  <video
                                    src={url}
                                    muted
                                    loop
                                    playsInline
                                    onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.pause();
                                      e.currentTarget.currentTime = 0;
                                    }}
                                    className="w-full h-full object-cover"
                                  />
                                ) : url ? (
                                  <img
                                    src={url}
                                    alt={slide.title || `Slide ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : null}

                                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                                  <span className="px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-mono font-bold">
                                    #{idx + 1} • {slide.mediaType === 'video' ? 'VIDEO' : 'IMG'}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-[#2E7D32]/90 text-white text-[9px] font-mono font-bold">
                                    {slide.slideDurationSec || homeSliderTimeSec}s
                                  </span>
                                </div>

                                {primaryHome && canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => void handleRemoveSlideItem(primaryHome, slide.id, false)}
                                    className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-rose-600/90 hover:bg-rose-700 text-white cursor-pointer"
                                    title="Remove slide"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {errorBanner && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3.5 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-700 font-bold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {successNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-3.5 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 font-bold hover:underline cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white p-3.5 rounded-2xl border border-[#D9E2DA]">
        <div className="lg:col-span-2 relative">
          <Search className="w-4 h-4 text-[#5F6B63] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, subtitle, pageId, placement, or ID..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D9E2DA] text-xs focus:outline-none focus:border-[#2E7D32]"
            aria-label="Search banners"
          />
        </div>

        <div>
          <select
            value={placementFilter}
            onChange={(e) => setPlacementFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] text-xs font-semibold bg-white"
            aria-label="Filter by placement"
          >
            <option value="all">All Placements</option>
            {BANNER_PLACEMENTS_CATALOG.map((p) => (
              <option key={p.id} value={p.id}>
                Placement: {p.id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={mediaTypeFilter}
            onChange={(e) => setMediaTypeFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] text-xs font-semibold bg-white"
            aria-label="Filter by media type"
          >
            <option value="all">All Media Types</option>
            <option value="video">Video (MP4 H.264)</option>
            <option value="image">Image (WebP / JPEG / PNG)</option>
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] text-xs font-semibold bg-white"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Now</option>
            <option value="scheduled">Scheduled (Future)</option>
            <option value="expired">Expired</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {/* Banners Table */}
      <div className="bg-white rounded-2xl border border-[#D9E2DA] overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F7FAF7] border-b border-[#D9E2DA] text-[10px] font-extrabold uppercase text-[#5F6B63] tracking-wider">
                <th className="py-3 px-4">Preview</th>
                <th className="py-3 px-3">Title &amp; CTA</th>
                <th className="py-3 px-3">Page &amp; Target</th>
                <th className="py-3 px-3">Placement</th>
                <th className="py-3 px-3">Media &amp; Variants</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Schedule</th>
                <th className="py-3 px-3">Modified</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E2DA] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[#5F6B63]">
                    Loading banners from Cloud Firestore...
                  </td>
                </tr>
              ) : filteredBanners.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center space-y-2">
                    <p className="text-sm font-bold text-[#1F2933]">No banners found matching the current filter.</p>
                    <p className="text-xs text-[#5F6B63]">
                      Click &ldquo;Add New Banner&rdquo; to upload desktop (1920×720) and mobile (1080×1350) hero videos or images.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBanners.map((banner) => (
                  <tr key={banner.id} className="hover:bg-[#F7FAF7]/80 transition">
                    <td className="py-3 px-4">{renderThumbnail(banner)}</td>

                    <td className="py-3 px-3 max-w-xs">
                      <div className="font-extrabold text-[#1F2933] truncate">{banner.title}</div>
                      {banner.subtitle && (
                        <div className="text-[11px] text-[#5F6B63] truncate mt-0.5">{banner.subtitle}</div>
                      )}
                      {banner.cta?.route && (
                        <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EEF6EE] text-[#2E7D32] text-[10px] font-mono">
                          <span>{banner.cta.label}</span>
                          <span>&rarr;</span>
                          <span className="font-bold">{banner.cta.route}</span>
                        </div>
                      )}
                      {banner.carouselEnabled && (
                        <div className="mt-1">
                          <span className="text-[9px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded">
                            Carousel Enabled
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-[#173F1B] text-white text-[10px] font-extrabold uppercase">
                        {banner.pageType}
                      </span>
                      <div className="text-[11px] font-mono text-[#1F2933] mt-1">
                        {banner.pageId ? (
                          <span className="font-bold text-[#2E7D32]">ID: {banner.pageId}</span>
                        ) : (
                          <span className="text-[#5F6B63]">Global / Generic Fallback</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-mono font-bold text-[#1F2933] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {banner.placement}
                      </span>
                      {banner.placementSpec?.desktopAspectRatio && (
                        <div className="text-[10px] text-[#5F6B63] mt-1 font-mono">
                          D: {banner.placementSpec.desktopAspectRatio} | M: {banner.placementSpec.mobileAspectRatio || '4:5'}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold uppercase text-[10px] text-[#1F2933] mb-1">
                        {banner.mediaType === 'video' ? '🎬 Video (MP4)' : '🖼️ Image'}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            banner.desktop?.url
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                          title="Desktop Asset"
                        >
                          Desktop {banner.desktop?.url ? '✓' : '—'}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            banner.mobile?.url
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                          title="Mobile Asset"
                        >
                          Mobile {banner.mobile?.url ? '✓' : '—'}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            banner.desktopPoster?.url || banner.mobilePoster?.url
                              ? 'bg-sky-50 border-sky-300 text-sky-800 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                          title="Poster Fallback Image"
                        >
                          Poster {banner.desktopPoster?.url || banner.mobilePoster?.url ? '✓' : '—'}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3">{renderStatusBadge(banner)}</td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-extrabold text-sm text-[#1F2933] w-6 text-center">
                          {banner.sortOrder}
                        </span>
                        {canEdit && (
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => void handleAdjustSortOrder(banner, -1)}
                              className="p-0.5 hover:bg-[#EEF6EE] rounded text-[#5F6B63] hover:text-[#1F2933] cursor-pointer"
                              title="Move higher priority (lower sortOrder)"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAdjustSortOrder(banner, 1)}
                              className="p-0.5 hover:bg-[#EEF6EE] rounded text-[#5F6B63] hover:text-[#1F2933] cursor-pointer"
                              title="Move lower priority (higher sortOrder)"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-[11px] text-[#5F6B63]">
                      {banner.startsAt || banner.endsAt ? (
                        <div className="space-y-0.5 font-mono text-[10px]">
                          {banner.startsAt && (
                            <div>From: {new Date(banner.startsAt).toLocaleString()}</div>
                          )}
                          {banner.endsAt && (
                            <div>Until: {new Date(banner.endsAt).toLocaleString()}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-emerald-700 font-semibold">Always On</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-[10px] font-mono text-[#5F6B63]">
                      <div>{new Date(banner.updatedAt).toLocaleDateString()}</div>
                      <div className="text-slate-400 truncate max-w-[90px]">{banner.updatedBy}</div>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewBanner(banner)}
                          className="p-1.5 rounded-lg bg-[#EEF6EE] hover:bg-[#2E7D32] text-[#2E7D32] hover:text-white transition cursor-pointer"
                          title="Preview Responsive Desktop & Mobile Playback"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(banner)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1F2933] transition cursor-pointer"
                            title="Edit Banner & Upload Assets"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canCreate && (
                          <button
                            type="button"
                            onClick={() => void handleDuplicateBanner(banner)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1F2933] transition cursor-pointer"
                            title="Duplicate Banner"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(banner)}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              banner.isActive
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                            }`}
                            title={banner.isActive ? 'Disable Banner' : 'Enable Banner'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteBanner(banner)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                            title="Delete Banner & Clean Storage Assets"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Public Delivery API & Deterministic Precedence Tester */}
      <div className="bg-[#F7FAF7] border border-[#D9E2DA] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1F2933] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#2E7D32]" />
              Public Delivery API &amp; Precedence Verifier (GET /api/public/banners)
            </h3>
            <p className="text-[11px] text-[#5F6B63]">
              Tests deterministic precedence: exact <code>pageId</code> match first &rarr; generic page-level fallback (<code>pageId: null</code>) &rarr; sorted by <code>sortOrder</code> ascending, then <code>createdAt</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRunPublicApiTest()}
            disabled={testingApi}
            className="px-3.5 py-2 rounded-xl bg-[#173F1B] hover:bg-[#245B2A] text-white text-xs font-bold cursor-pointer transition shrink-0"
          >
            {testingApi ? 'Resolving...' : 'Test Public Delivery Resolution'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#5F6B63] mb-1">pageType</label>
            <select
              value={testPageType}
              onChange={(e) => setTestPageType(e.target.value as BannerPageType)}
              className="w-full px-3 py-1.5 rounded-xl border border-[#D9E2DA] bg-white text-xs font-semibold"
            >
              <option value="home">home</option>
              <option value="category">category</option>
              <option value="product">product</option>
              <option value="other">other</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#5F6B63] mb-1">
              pageId (Optional — tests exact vs fallback)
            </label>
            <input
              type="text"
              value={testPageId}
              onChange={(e) => setTestPageId(e.target.value)}
              placeholder="e.g., Spices or product ID (leave blank for global)"
              className="w-full px-3 py-1.5 rounded-xl border border-[#D9E2DA] bg-white text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#5F6B63] mb-1">placement</label>
            <input
              type="text"
              value={testPlacement}
              onChange={(e) => setTestPlacement(e.target.value)}
              placeholder="hero"
              className="w-full px-3 py-1.5 rounded-xl border border-[#D9E2DA] bg-white text-xs"
            />
          </div>
        </div>

        {testResult && (
          <div className="bg-white border border-[#D9E2DA] rounded-xl p-3 text-xs space-y-1.5 font-mono">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Matched Scope:{' '}
                <strong className="text-[#2E7D32]">{testResult.matchedScope}</strong>
              </span>
              <span>
                Carousel Mode:{' '}
                <strong>{testResult.carouselEnabled ? 'Enabled (Multiple)' : 'Single Hero Default (1)'}</strong>
              </span>
              <span>
                Total Active Eligible: <strong>{testResult.banners.length}</strong> | Effective Returned:{' '}
                <strong>{testResult.effectiveBanners.length}</strong>
              </span>
            </div>
            {testResult.effectiveBanners.length > 0 && (
              <div className="text-[11px] text-[#5F6B63]">
                Primary Resolved Banner:{' '}
                <strong className="text-[#1F2933]">
                  {testResult.effectiveBanners[0].title} ({testResult.effectiveBanners[0].id})
                </strong>{' '}
                • SortOrder #{testResult.effectiveBanners[0].sortOrder}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* ADD / EDIT BANNER MODAL                                               */}
      {/* ===================================================================== */}
      {isEditorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="banner-editor-title"
        >
          <div className="bg-white border border-[#D9E2DA] rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-5 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#D9E2DA] pb-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#2E7D32] bg-[#EEF6EE] px-2.5 py-0.5 rounded-full">
                  {editingBanner ? `Editing ${editingBanner.id}` : 'New Banner Record'}
                </span>
                <h3 id="banner-editor-title" className="text-lg font-extrabold text-[#1F2933] mt-1">
                  {editingBanner ? `Edit Banner: ${editingBanner.title}` : 'Add New Page Banner'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-2 rounded-full bg-[#EEF6EE] text-[#5F6B63] hover:text-[#1F2933] cursor-pointer"
                aria-label="Close banner editor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3.5 text-xs flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSaveBannerForm(e, false)} className="space-y-6">
              {/* Section 1: Page Targeting & Placement */}
              <div className="bg-[#F7FAF7] border border-[#D9E2DA] rounded-2xl p-4 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#1F2933]">
                  1. Page Targeting &amp; Placement Precedence
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">Page Type *</label>
                    <select
                      value={formPageType}
                      onChange={(e) => {
                        const nextType = e.target.value as BannerPageType;
                        setFormPageType(nextType);
                        if (nextType === 'home') setFormPageId('');
                        else if (nextType === 'other' && !formPageId.startsWith('/')) setFormPageId('/offers');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-semibold"
                    >
                      <option value="home">Home Page (home)</option>
                      <option value="category">Category Page (category)</option>
                      <option value="product">Product Detail Page (product)</option>
                      <option value="other">Other Approved Route (other)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">
                      Target Page Identifier (pageId)
                    </label>
                    {formPageType === 'home' ? (
                      <input
                        type="text"
                        disabled
                        value="Global Home Page (null)"
                        className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-slate-100 text-xs text-[#5F6B63]"
                      />
                    ) : formPageType === 'category' ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          list="banner-category-options"
                          value={formPageId}
                          onChange={(e) => setFormPageId(e.target.value)}
                          placeholder="Leave empty for Generic Category Fallback"
                          className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs"
                        />
                        <datalist id="banner-category-options">
                          {categories.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name} ({c.id})
                            </option>
                          ))}
                        </datalist>
                      </div>
                    ) : formPageType === 'product' ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          list="banner-product-options"
                          value={formPageId}
                          onChange={(e) => setFormPageId(e.target.value)}
                          placeholder="Leave empty for Generic Product Fallback"
                          className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs"
                        />
                        <datalist id="banner-product-options">
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku || p.id})
                            </option>
                          ))}
                        </datalist>
                      </div>
                    ) : (
                      <select
                        value={formPageId}
                        onChange={(e) => setFormPageId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-semibold"
                      >
                        <option value="">-- Generic Fallback (null) --</option>
                        {APPROVED_OTHER_PAGE_ROUTES.map((route) => (
                          <option key={route} value={route}>
                            {route}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">Placement Slot *</label>
                    <select
                      value={formPlacement}
                      onChange={(e) => {
                        const nextPlacement = e.target.value;
                        setFormPlacement(nextPlacement);
                        const spec = BANNER_PLACEMENTS_CATALOG.find((p) => p.id === nextPlacement);
                        if (spec) {
                          setFormDesktopRatio(spec.defaultDesktopRatio);
                          setFormMobileRatio(spec.defaultMobileRatio);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-semibold"
                    >
                      {BANNER_PLACEMENTS_CATALOG.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} ({p.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Title, Subtitle, Media Type, CTA & Schedule */}
              <div className="bg-[#F7FAF7] border border-[#D9E2DA] rounded-2xl p-4 space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#1F2933]">
                  2. Banner Content, Validated Internal CTA &amp; Schedule Window
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">Banner Title *</label>
                    <input
                      type="text"
                      required
                      maxLength={160}
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g., Freshness Rooted in Nature"
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">Subtitle (Optional)</label>
                    <input
                      type="text"
                      maxLength={320}
                      value={formSubtitle}
                      onChange={(e) => setFormSubtitle(e.target.value)}
                      placeholder="e.g., 100% Single-Origin Wayanad Harvests & Pure Botanicals"
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">Primary Media Type *</label>
                    <select
                      value={formMediaType}
                      onChange={(e) => setFormMediaType(e.target.value as BannerMediaType)}
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-semibold"
                    >
                      <option value="video">Video (MP4 H.264 + Poster Fallbacks)</option>
                      <option value="image">Static Image (WebP / JPEG / PNG)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">CTA Button Label</label>
                    <input
                      type="text"
                      maxLength={60}
                      value={formCtaLabel}
                      onChange={(e) => setFormCtaLabel(e.target.value)}
                      placeholder="e.g., Shop Now"
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">
                      Validated Internal CTA Route
                    </label>
                    <input
                      type="text"
                      value={formCtaRoute}
                      onChange={(e) => setFormCtaRoute(e.target.value)}
                      placeholder="/products or /categories/Spices"
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-mono"
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['/products', '/categories', '/offers', '/preorders', '/referrals'].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setFormCtaRoute(r)}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#D9E2DA] hover:border-[#2E7D32] text-[#2E7D32] cursor-pointer"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Priority, Slider Time & Schedule */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t border-[#D9E2DA]">
                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">
                      Priority / Sort Order (Ascending)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={formSortOrder}
                      onChange={(e) => setFormSortOrder(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">
                      Slider Time per Slide (Seconds)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={2}
                        max={120}
                        value={formSlideDurationSec}
                        onChange={(e) =>
                          setFormSlideDurationSec(Math.max(2, Math.min(120, Number(e.target.value) || 6)))
                        }
                        className="w-20 px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-mono font-bold"
                      />
                      {[5, 8, 10].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setFormSlideDurationSec(sec)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer ${
                            formSlideDurationSec === sec
                              ? 'bg-[#2E7D32] text-white'
                              : 'bg-white border border-[#D9E2DA] text-[#1F2933]'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">
                      Schedule Start (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={formStartsAt}
                      onChange={(e) => setFormStartsAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#1F2933] mb-1">
                      Schedule End (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={formEndsAt}
                      onChange={(e) => setFormEndsAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#D9E2DA] bg-white text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="flex flex-wrap items-center gap-5 pt-2">
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-[#1F2933] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-[#D9E2DA] text-[#2E7D32]"
                    />
                    <span>Active Status (isActive)</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs font-bold text-[#1F2933] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCarouselEnabled}
                      onChange={(e) => setFormCarouselEnabled(e.target.checked)}
                      className="rounded border-[#D9E2DA] text-[#2E7D32]"
                    />
                    <span>Enable Multi-Banner Carousel (Default off = Single Hero Banner)</span>
                  </label>

                  {formMediaType === 'video' && (
                    <>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-[#1F2933] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formAutoplay}
                          onChange={(e) => setFormAutoplay(e.target.checked)}
                          className="rounded border-[#D9E2DA] text-[#2E7D32]"
                        />
                        <span>Muted Autoplay</span>
                      </label>

                      <label className="inline-flex items-center gap-2 text-xs font-bold text-[#1F2933] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formLoop}
                          onChange={(e) => setFormLoop(e.target.checked)}
                          className="rounded border-[#D9E2DA] text-[#2E7D32]"
                        />
                        <span>Loop Video</span>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Section 3: Responsive Media Assets (Desktop, Mobile, Desktop Poster, Mobile Poster) */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#1F2933]">
                      3. Responsive Media Assets (Firebase Cloud Storage)
                    </h4>
                    <p className="text-[11px] text-[#5F6B63]">
                      Canonical Storage Hierarchy:{' '}
                      <code>
                        banners/{formPageType}/{formPageId.trim() || 'global'}/{editingBanner?.id || '{bannerId}'}/&#123;mobile|desktop|posters&#125;/&#123;filename&#125;
                      </code>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#5F6B63]">
                    <span>Desktop Ratio: {formDesktopRatio}</span>
                    <span>•</span>
                    <span>Mobile Ratio: {formMobileRatio}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderAssetUploadSlot({
                    variant: 'desktop',
                    title: `Desktop ${formMediaType === 'video' ? 'Video (8:3)' : 'Image (8:3)'}`,
                    subtitleSpec:
                      formMediaType === 'video'
                        ? '1920 × 720 px (8:3) • MP4 H.264 • 24–30 fps • 6–12 s • Target 2–5 MB'
                        : '1920 × 720 px (8:3) • WebP / JPEG / PNG • Optimized for fast first paint',
                    icon: <Monitor className="w-4 h-4 text-[#2E7D32]" />,
                    accept: formMediaType === 'video' ? 'video/mp4' : 'image/webp,image/jpeg,image/png',
                  })}

                  {renderAssetUploadSlot({
                    variant: 'mobile',
                    title: `Mobile ${formMediaType === 'video' ? 'Video (4:5)' : 'Image (4:5)'}`,
                    subtitleSpec:
                      formMediaType === 'video'
                        ? '1080 × 1350 px (4:5) or 720 × 900 • MP4 H.264 • Target 1–3 MB'
                        : '1080 × 1350 px (4:5) • WebP / JPEG / PNG • Optimized for mobile first paint',
                    icon: <Smartphone className="w-4 h-4 text-[#2E7D32]" />,
                    accept: formMediaType === 'video' ? 'video/mp4' : 'image/webp,image/jpeg,image/png',
                  })}

                  {renderAssetUploadSlot({
                    variant: 'desktopPoster',
                    title: 'Desktop Poster Image (Optional Fallback)',
                    subtitleSpec:
                      '1920 × 720 px (8:3) • WebP / JPEG / PNG • Displayed while video loads or for reduced-motion users',
                    icon: <ImageIcon className="w-4 h-4 text-sky-600" />,
                    accept: 'image/webp,image/jpeg,image/png',
                  })}

                  {renderAssetUploadSlot({
                    variant: 'mobilePoster',
                    title: 'Mobile Poster Image (Optional Fallback)',
                    subtitleSpec:
                      '1080 × 1350 px (4:5) • WebP / JPEG / PNG • Displayed while mobile video loads or for reduced-motion users',
                    icon: <ImageIcon className="w-4 h-4 text-sky-600" />,
                    accept: 'image/webp,image/jpeg,image/png',
                  })}
                </div>
              </div>

              {/* Section 4: Upload Multiple Videos & Images as Slider Slides */}
              <div className="bg-[#F7FAF7] border border-[#2E7D32]/30 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#1F2933] flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#2E7D32]" />
                      4. Multi-Video &amp; Image Slider Gallery (Rotates Every {formSlideDurationSec}s)
                    </h4>
                    <p className="text-[11px] text-[#5F6B63]">
                      Upload multiple MP4 videos and WebP/JPEG/PNG images here so this banner works like an automatic slider rotating every <strong>{formSlideDurationSec} seconds</strong>.
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#245B2A] text-white text-xs font-extrabold cursor-pointer transition shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Multiple Videos &amp; Images</span>
                    <input
                      type="file"
                      multiple
                      accept="video/mp4,image/webp,image/jpeg,image/png"
                      disabled={multiUploadBusy}
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          void handleMultiFilesSliderUpload(files, editingBanner, true);
                        }
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>

                {multiUploadBusy && (
                  <div className="bg-white border border-[#D9E2DA] rounded-xl p-2.5 space-y-1">
                    <div className="text-[11px] font-bold text-[#2E7D32]">
                      {multiUploadStatusText || 'Uploading slider files...'} ({multiUploadProgressPct}%)
                    </div>
                    <div className="w-full h-2 bg-[#EEF6EE] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2E7D32] transition-all duration-200"
                        style={{ width: `${multiUploadProgressPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {editingBanner?.slides && editingBanner.slides.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
                    {editingBanner.slides.map((slide, idx) => {
                      const url = slide.desktop?.url || slide.mobile?.url || '';
                      return (
                        <div
                          key={slide.id}
                          className="relative rounded-xl overflow-hidden border border-[#D9E2DA] bg-slate-900 h-28"
                        >
                          {slide.mediaType === 'video' && url ? (
                            <video
                              src={url}
                              muted
                              loop
                              playsInline
                              onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                              onMouseLeave={(e) => {
                                e.currentTarget.pause();
                                e.currentTarget.currentTime = 0;
                              }}
                              className="w-full h-full object-cover"
                            />
                          ) : url ? (
                            <img
                              src={url}
                              alt={`Slide ${idx + 1}`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : null}

                          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-mono font-bold">
                              Slide #{idx + 1} • {slide.mediaType === 'video' ? 'VIDEO' : 'IMG'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#2E7D32]/90 text-white text-[9px] font-mono font-bold">
                              {slide.slideDurationSec || formSlideDurationSec}s
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleRemoveSlideItem(editingBanner, slide.id, true)}
                            className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-rose-600/90 hover:bg-rose-700 text-white cursor-pointer"
                            title="Remove slide"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#5F6B63] bg-white border border-dashed border-[#D9E2DA] rounded-xl p-3 text-center">
                    No extra slider items added yet. Click &ldquo;Upload Multiple Videos &amp; Images&rdquo; to select multiple video and image files for the slider.
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 border-t border-[#D9E2DA] pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#D9E2DA] bg-white hover:bg-slate-50 text-xs font-bold text-[#1F2933] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="px-5 py-2.5 rounded-xl bg-[#2E7D32] hover:bg-[#245B2A] text-white text-xs font-extrabold uppercase tracking-wider cursor-pointer transition shadow-sm"
                >
                  {savingForm ? 'Saving...' : editingBanner ? 'Save Banner Changes' : 'Create Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* RESPONSIVE LIVE PREVIEW MODAL (Desktop 8:3 / Mobile 4:5 + A11y)       */}
      {/* ===================================================================== */}
      {previewBanner && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview banner ${previewBanner.title}`}
        >
          <div className="bg-white border border-[#D9E2DA] rounded-3xl max-w-4xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9E2DA] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#1F2933]">{previewBanner.title}</h3>
                <p className="text-xs text-[#5F6B63]">
                  Page: <code>{previewBanner.pageType}</code> ({previewBanner.pageId || 'Global'}) • Placement:{' '}
                  <code>{previewBanner.placement}</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewViewport('desktop')}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                    previewViewport === 'desktop'
                      ? 'bg-[#2E7D32] text-white'
                      : 'bg-[#EEF6EE] text-[#1F2933]'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" /> Desktop (8:3)
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport('mobile')}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                    previewViewport === 'mobile'
                      ? 'bg-[#2E7D32] text-white'
                      : 'bg-[#EEF6EE] text-[#1F2933]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Mobile (4:5)
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1F2933] bg-[#F7FAF7] px-2.5 py-1.5 rounded-xl border border-[#D9E2DA] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={previewReducedMotion}
                    onChange={(e) => setPreviewReducedMotion(e.target.checked)}
                  />
                  <span>Simulate Reduced Motion</span>
                </label>
                <button
                  type="button"
                  onClick={() => setPreviewBanner(null)}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex justify-center bg-slate-950 rounded-2xl p-4 overflow-hidden">
              {(() => {
                const activeAsset =
                  previewViewport === 'mobile'
                    ? previewBanner.mobile || previewBanner.desktop
                    : previewBanner.desktop || previewBanner.mobile;
                const activePoster =
                  previewViewport === 'mobile'
                    ? previewBanner.mobilePoster || previewBanner.desktopPoster
                    : previewBanner.desktopPoster || previewBanner.mobilePoster;

                return (
                  <div
                    className={`relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 ${
                      previewViewport === 'mobile' ? 'w-[320px] aspect-[4/5]' : 'w-full aspect-[8/3]'
                    }`}
                  >
                    {previewBanner.mediaType === 'video' && activeAsset?.url && !previewReducedMotion ? (
                      <video
                        key={`${previewViewport}-${activeAsset.url}`}
                        src={activeAsset.url}
                        poster={activePoster?.url}
                        muted
                        loop={previewBanner.loop !== false}
                        autoPlay={previewBanner.autoplay !== false}
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : activePoster?.url || activeAsset?.url ? (
                      <img
                        src={activePoster?.url || activeAsset?.url}
                        alt={previewBanner.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                        No media uploaded for {previewViewport} variant
                      </div>
                    )}

                    {/* Overlay Text & CTA */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent flex flex-col justify-end p-6 text-white">
                      <h4 className="text-xl font-extrabold drop-shadow-xs">{previewBanner.title}</h4>
                      {previewBanner.subtitle && (
                        <p className="text-xs text-slate-200 mt-1 max-w-lg">{previewBanner.subtitle}</p>
                      )}
                      {previewBanner.cta?.route && (
                        <div className="mt-3">
                          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2E7D32] text-white text-xs font-extrabold shadow-md">
                            {previewBanner.cta.label} &rarr;
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CONFIRM DELETE BANNER MODAL                                           */}
      {/* ===================================================================== */}
      {confirmDeleteBanner && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#D9E2DA] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-5 h-5" />
              <h4 className="text-base font-extrabold">Delete Banner &amp; Storage Files?</h4>
            </div>
            <p className="text-xs text-[#5F6B63] leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-[#1F2933]">&ldquo;{confirmDeleteBanner.title}&rdquo;</strong> (
              <code>{confirmDeleteBanner.id}</code>)? This will delete the Firestore record and clean up all associated desktop, mobile, and poster files from Firebase Storage.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => setConfirmDeleteBanner(null)}
                className="px-3.5 py-2 rounded-xl border border-[#D9E2DA] text-xs font-bold text-[#1F2933] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => void handleConfirmDeleteBanner()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer"
              >
                {deletingBusy ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CONFIRM DELETE ASSET VARIANT MODAL                                    */}
      {/* ===================================================================== */}
      {confirmDeleteAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#D9E2DA] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-5 h-5" />
              <h4 className="text-base font-extrabold">Remove {confirmDeleteAsset.variant} Asset?</h4>
            </div>
            <p className="text-xs text-[#5F6B63] leading-relaxed">
              This will delete the <code>{confirmDeleteAsset.variant}</code> file from Firebase Storage and clear it from banner{' '}
              <strong className="text-[#1F2933]">&ldquo;{confirmDeleteAsset.banner.title}&rdquo;</strong>.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => setConfirmDeleteAsset(null)}
                className="px-3.5 py-2 rounded-xl border border-[#D9E2DA] text-xs font-bold text-[#1F2933] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => void handleConfirmDeleteAsset()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer"
              >
                {deletingBusy ? 'Removing...' : 'Remove Asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
