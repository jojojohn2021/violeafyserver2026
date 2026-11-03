import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Star,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Upload,
  X,
  UserCheck,
  ShoppingBag,
  ShieldCheck,
  Image as ImageIcon,
  Award,
  BarChart3,
} from 'lucide-react';
import {
  fetchReviewProducts,
  fetchEligibleCustomersForProduct,
  fetchEligibleOrdersForProductAndCustomer,
  fetchProductAggregate,
  fetchCustomerReviews,
  uploadReviewMediaFile,
  saveCustomerReview,
  deleteCustomerReview,
  reconcileReviewAggregates,
  ProductOption,
  EligibleCustomerOption,
  EligibleOrderLineItem,
  EligibleOrderOption,
  ReviewMediaItem,
  CustomerReviewRecord,
  ProductAggregateRecord,
} from '../utils/customerReviewsApi';

const ALLOWED_STATUSES: Array<CustomerReviewRecord['status']> = [
  'published',
  'pending',
  'rejected',
  'hidden',
];

export const ProductReviewsManagementView: React.FC = () => {
  // Product search & combobox state
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Eligible customers & orders state
  const [eligibleCustomers, setEligibleCustomers] = useState<EligibleCustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrderOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Reviews list & aggregate state
  const [reviews, setReviews] = useState<CustomerReviewRecord[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [filterProductOnly, setFilterProductOnly] = useState(false);
  const [productAggregate, setProductAggregate] = useState<ProductAggregateRecord | null>(null);
  const [reconciling, setReconciling] = useState(false);

  // Form state (Create / Edit mode)
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerDisplayName, setCustomerDisplayName] = useState('');
  const [orderId, setOrderId] = useState('');
  const [orderItemId, setOrderItemId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  const [verifiedPurchase, setVerifiedPurchase] = useState<boolean>(false);
  const [userUid, setUserUid] = useState<string>('');
  const [rating, setRating] = useState<number>(5);
  const [title, setTitle] = useState<string>('');
  const [reviewText, setReviewText] = useState<string>('');
  const [status, setStatus] = useState<CustomerReviewRecord['status']>('published');
  const [media, setMedia] = useState<ReviewMediaItem[]>([]);
  const [helpfulCount, setHelpfulCount] = useState<number>(0);
  const [rankScore, setRankScore] = useState<number>(2);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Media upload state
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Feedback banner state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Derived read-only fields
  const mediaCount = media.length;
  const hasMedia = mediaCount > 0;
  const previewRankScore = useMemo(() => {
    return (verifiedPurchase ? 2 : 0) + (hasMedia ? 1 : 0) + Math.max(0, Math.trunc(helpfulCount || 0));
  }, [verifiedPurchase, hasMedia, helpfulCount]);

  const selectedProductObj = useMemo(
    () => products.find((p) => p.productId === productId) || null,
    [products, productId]
  );

  const selectedCustomerObj = useMemo(
    () => eligibleCustomers.find((c) => c.customerId === customerId) || null,
    [eligibleCustomers, customerId]
  );

  const selectedOrderObj = useMemo(
    () => eligibleOrders.find((o) => o.orderId === orderId) || null,
    [eligibleOrders, orderId]
  );

  // Fetch products with server-side search (with direct Firestore fallback on static hosting)
  const loadProducts = useCallback(async (searchQuery: string) => {
    setLoadingProducts(true);
    try {
      const list = await fetchReviewProducts(searchQuery);
      setProducts(list);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts(productSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [productSearch, loadProducts]);

  // Fetch eligible customers and product aggregate whenever productId changes
  const loadEligibleCustomersAndAggregate = useCallback(async (targetProductId: string) => {
    if (!targetProductId) {
      setEligibleCustomers([]);
      setProductAggregate(null);
      return;
    }
    setLoadingCustomers(true);
    try {
      const [custList, agg] = await Promise.all([
        fetchEligibleCustomersForProduct(targetProductId),
        fetchProductAggregate(targetProductId),
      ]);
      setEligibleCustomers(custList);
      setProductAggregate(agg);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load eligible customers for product');
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  useEffect(() => {
    loadEligibleCustomersAndAggregate(productId);
  }, [productId, loadEligibleCustomersAndAggregate]);

  // Fetch qualifying orders whenever both productId and customerId are selected
  const loadEligibleOrders = useCallback(
    async (targetProductId: string, targetCustomerId: string) => {
      if (!targetProductId || !targetCustomerId) {
        setEligibleOrders([]);
        return;
      }
      setLoadingOrders(true);
      try {
        const ordList = await fetchEligibleOrdersForProductAndCustomer(
          targetProductId,
          targetCustomerId
        );
        setEligibleOrders(ordList);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Failed to load qualifying customer orders');
      } finally {
        setLoadingOrders(false);
      }
    },
    []
  );

  useEffect(() => {
    loadEligibleOrders(productId, customerId);
  }, [productId, customerId, loadEligibleOrders]);

  // Fetch reviews list
  const loadReviews = useCallback(async () => {
    setLoadingReviews(true);
    try {
      const list = await fetchCustomerReviews(
        filterProductOnly && productId ? productId : undefined
      );
      setReviews(list);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load customer reviews');
    } finally {
      setLoadingReviews(false);
    }
  }, [filterProductOnly, productId]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Product selection handler: writes productId and clears customer, order, and order-item selections
  const handleProductSelect = (newProductId: string) => {
    setProductId(newProductId);
    setCustomerId('');
    setOrderId('');
    setOrderItemId('');
    setPurchaseDate('');
    setVerifiedPurchase(false);
    setUserUid('');
  };

  // Customer selection handler: sets customerId & userUid, clears order/orderItem, NEVER overwrites customerDisplayName
  const handleCustomerSelect = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    const matched = eligibleCustomers.find((c) => c.customerId === newCustomerId);
    setUserUid(matched?.userUid || '');
    setOrderId('');
    setOrderItemId('');
    setPurchaseDate('');
    setVerifiedPurchase(false);
  };

  // Explicit "Use customer name" button action
  const handleUseCustomerName = () => {
    if (selectedCustomerObj?.name) {
      setCustomerDisplayName(selectedCustomerObj.name);
    }
  };

  // Order selection handler: sets orderId, auto-selects first matching line item if only 1 exists, and derives purchaseDate
  const handleOrderSelect = (newOrderId: string) => {
    setOrderId(newOrderId);
    const matchedOrder = eligibleOrders.find((o) => o.orderId === newOrderId);
    if (!matchedOrder) {
      setOrderItemId('');
      setPurchaseDate('');
      setVerifiedPurchase(false);
      return;
    }
    setPurchaseDate(matchedOrder.purchaseDate || '');
    if (matchedOrder.lineItems.length === 1) {
      setOrderItemId(matchedOrder.lineItems[0].orderItemId);
      setVerifiedPurchase(true);
    } else {
      setOrderItemId('');
      setVerifiedPurchase(false);
    }
  };

  // Order line item selection handler
  const handleOrderItemSelect = (newOrderItemId: string) => {
    setOrderItemId(newOrderItemId);
    if (selectedOrderObj && newOrderItemId) {
      setPurchaseDate(selectedOrderObj.purchaseDate || '');
      setVerifiedPurchase(true);
    } else {
      setVerifiedPurchase(false);
    }
  };

  // Reset form to Create mode
  const resetForm = () => {
    setEditingReviewId(null);
    setProductId('');
    setCustomerId('');
    setCustomerDisplayName('');
    setOrderId('');
    setOrderItemId('');
    setPurchaseDate('');
    setVerifiedPurchase(false);
    setUserUid('');
    setRating(5);
    setTitle('');
    setReviewText('');
    setStatus('published');
    setMedia([]);
    setHelpfulCount(0);
    setRankScore(2);
    setCreatedAt(null);
    setUpdatedAt(null);
    setErrorMsg(null);
  };

  // Load existing review into Edit mode
  const handleEditReview = (review: CustomerReviewRecord) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingReviewId(review.reviewId);
    setProductId(review.productId);
    setCustomerId(review.customerId);
    setCustomerDisplayName(review.customerDisplayName || '');
    setOrderId(review.orderId);
    setOrderItemId(review.orderItemId);
    setPurchaseDate(review.purchaseDate || '');
    setVerifiedPurchase(Boolean(review.verifiedPurchase));
    setUserUid(review.userUid || '');
    setRating(Number(review.rating) || 5);
    setTitle(review.title || '');
    setReviewText(review.reviewText || '');
    setStatus(review.status || 'published');
    setMedia(Array.isArray(review.media) ? review.media : []);
    setHelpfulCount(Number(review.helpfulCount) || 0);
    setRankScore(Number(review.rankScore) || 0);
    setCreatedAt(review.createdAt || null);
    setUpdatedAt(review.updatedAt || null);
  };

  // Upload media file to /api/uploads or direct Firebase Storage under reviews/ storage root
  const handleMediaFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploadingMedia(true);
    setErrorMsg(null);
    try {
      const mediaItem = await uploadReviewMediaFile(file, productId);
      setMedia((prev) => [...prev, mediaItem]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Media upload failed');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleRemoveMedia = (id: string) => {
    setMedia((prev) => prev.filter((item) => item.id !== id));
  };

  // Submit Create or Edit review
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!productId) return setErrorMsg('Please select a product.');
    if (!customerId) return setErrorMsg('Please select an eligible customer.');
    if (!customerDisplayName.trim()) {
      return setErrorMsg('Please enter a Customer Display Name (or click "Use customer name").');
    }
    if (!orderId) return setErrorMsg('Please select a qualifying sales order.');
    if (!orderItemId) return setErrorMsg('Please select the matching order line item.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return setErrorMsg('Rating must be an integer between 1 and 5.');
    }
    if (!title.trim()) return setErrorMsg('Review title is required.');
    if (!reviewText.trim()) return setErrorMsg('Review text is required.');

    setSubmitting(true);
    try {
      const savedReview = await saveCustomerReview(
        {
          productId,
          customerId,
          customerDisplayName: customerDisplayName.trim(),
          orderId,
          orderItemId,
          rating,
          title: title.trim(),
          reviewText: reviewText.trim(),
          status,
          media,
        },
        editingReviewId
      );

      setSuccessMsg(
        editingReviewId
          ? `Review ${editingReviewId} updated and product aggregate synchronized.`
          : `Review ${savedReview?.reviewId || ''} created and product aggregate synchronized.`
      );

      if (savedReview) {
        handleEditReview(savedReview);
      }
      await Promise.all([loadReviews(), loadEligibleCustomersAndAggregate(productId)]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save review');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete review
  const handleDeleteReview = async (targetReviewId: string) => {
    if (!window.confirm(`Delete review "${targetReviewId}" and update product aggregates?`)) {
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await deleteCustomerReview(targetReviewId);
      if (editingReviewId === targetReviewId) {
        resetForm();
      }
      setSuccessMsg(`Deleted review ${targetReviewId} and synchronized aggregate.`);
      await Promise.all([loadReviews(), loadEligibleCustomersAndAggregate(productId)]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete review');
    }
  };

  // Reconcile all aggregates across Firestore
  const handleReconcileAggregates = async () => {
    setReconciling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const data = await reconcileReviewAggregates(productId || undefined);
      if (productId) {
        await loadEligibleCustomersAndAggregate(productId);
      }
      setSuccessMsg(
        productId
          ? `Synchronized aggregate for product ${productId}.`
          : `Reconciled ${data.totalProductsChecked || 0} product aggregates.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Aggregate reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-emerald-100">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white">
              <Star className="w-5 h-5 fill-current" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Product Review Management</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Verified purchase review management with transactional{' '}
            <code className="text-emerald-700 font-mono">customer_reviews</code> &amp;{' '}
            <code className="text-emerald-700 font-mono">customer_review_aggregates</code> synchronization
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition"
          >
            <Plus className="w-4 h-4" />
            New Review
          </button>
          <button
            type="button"
            onClick={handleReconcileAggregates}
            disabled={reconciling}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${reconciling ? 'animate-spin' : ''}`} />
            {reconciling ? 'Reconciling...' : 'Audit & Reconcile Aggregates'}
          </button>
        </div>
      </div>

      {/* Status Alerts */}
      {errorMsg && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Center Column: Review Create / Edit Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {editingReviewId ? `Edit Review (${editingReviewId})` : 'Create Verified Product Review'}
              </h2>
              <p className="text-xs text-slate-500">
                Select product, eligible purchaser, and qualifying sales order line item
              </p>
            </div>
            {editingReviewId && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                Edit Mode
              </span>
            )}
          </div>

          {/* 1. Product Combobox & Read-only productId */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                1. Product Combobox *
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name, SKU, or product ID..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                />
              </div>
              <select
                value={productId}
                onChange={(e) => handleProductSelect(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                required
              >
                <option value="">
                  {loadingProducts ? 'Loading products...' : '-- Select Product --'}
                </option>
                {products.map((prod) => (
                  <option key={prod.productId} value={prod.productId}>
                    {prod.name} {prod.sku ? `(${prod.sku})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Product ID (Read-Only)
              </label>
              <input
                type="text"
                value={productId}
                readOnly
                placeholder="Auto-populated on selection"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed"
              />
              {selectedProductObj && (
                <div className="text-[11px] text-emerald-700 font-medium truncate">
                  Selected: {selectedProductObj.name}
                </div>
              )}
            </div>
          </div>

          {/* 2. Eligible Customer Combobox, Read-only customerId & Manual customerDisplayName */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Eligible Customer (Purchased Selected Product) *
                </label>
                <select
                  value={customerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  disabled={!productId || loadingCustomers}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  <option value="">
                    {!productId
                      ? 'Select a product first'
                      : loadingCustomers
                      ? 'Finding qualifying purchasers...'
                      : eligibleCustomers.length === 0
                      ? 'No customers with qualifying purchases found'
                      : '-- Select Qualifying Customer --'}
                  </option>
                  {eligibleCustomers.map((cust) => (
                    <option key={cust.customerId} value={cust.customerId}>
                      {cust.name}{' '}
                      {cust.mobileNumber ? `• ${cust.mobileNumber}` : ''}{' '}
                      {cust.qualifyingOrderCount
                        ? `(${cust.qualifyingOrderCount} qualifying order${
                            cust.qualifyingOrderCount > 1 ? 's' : ''
                          })`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Customer ID (Read-Only)
                </label>
                <input
                  type="text"
                  value={customerId}
                  readOnly
                  placeholder="Auto-populated"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Manually entered customerDisplayName with explicit "Use customer name" action */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-2 border-t border-slate-200/60">
              <div className="md:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Customer Display Name (Manual Input) *
                  </label>
                  {selectedCustomerObj && (
                    <button
                      type="button"
                      onClick={handleUseCustomerName}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Use customer name ({selectedCustomerObj.name})
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={customerDisplayName}
                  onChange={(e) => setCustomerDisplayName(e.target.value)}
                  placeholder="Type reviewer display name (never overwritten automatically)..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Linked Auth userUid (Read-Only)
                </label>
                <input
                  type="text"
                  value={userUid}
                  readOnly
                  placeholder="Derived from customer"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* 3. Customer Qualifying Order & Line Item Selection */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  3. Qualifying Sales Order *
                </label>
                <select
                  value={orderId}
                  onChange={(e) => handleOrderSelect(e.target.value)}
                  disabled={!productId || !customerId || loadingOrders}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  <option value="">
                    {!customerId
                      ? 'Select an eligible customer first'
                      : loadingOrders
                      ? 'Loading qualifying orders...'
                      : eligibleOrders.length === 0
                      ? 'No qualifying orders found'
                      : '-- Select Qualifying Order --'}
                  </option>
                  {eligibleOrders.map((ord) => (
                    <option key={ord.orderId} value={ord.orderId}>
                      {ord.orderNumber || ord.orderId} •{' '}
                      {ord.purchaseDate ? new Date(ord.purchaseDate).toLocaleDateString() : 'No date'}{' '}
                      • {ord.orderStatus}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  4. Matching Order Line Item *
                </label>
                <select
                  value={orderItemId}
                  onChange={(e) => handleOrderItemSelect(e.target.value)}
                  disabled={!orderId || !selectedOrderObj}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  <option value="">
                    {!orderId ? 'Select an order first' : '-- Select Matching Line Item --'}
                  </option>
                  {selectedOrderObj?.lineItems.map((item) => (
                    <option key={item.orderItemId} value={item.orderItemId}>
                      [{item.orderItemId}] {item.name} • Qty: {item.quantity}{' '}
                      {item.variantLabel ? `(${item.variantLabel})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Derived Order & Verification Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-200/60">
              <div>
                <span className="block text-[11px] font-semibold uppercase text-slate-400">
                  Order ID (Read-Only)
                </span>
                <span className="text-xs font-mono text-slate-800">{orderId || '—'}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase text-slate-400">
                  Order Item ID (Read-Only)
                </span>
                <span className="text-xs font-mono text-slate-800">{orderItemId || '—'}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase text-slate-400">
                  Derived Purchase Date
                </span>
                <span className="text-xs font-mono text-slate-800">
                  {purchaseDate ? new Date(purchaseDate).toLocaleString() : '—'}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase text-slate-400">
                  Verified Purchase
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold ${
                    verifiedPurchase ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {verifiedPurchase ? 'true (Server-Verified)' : 'false'}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Review Content & Rating */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Rating (1–5 Integer) *
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {[1, 2, 3, 4, 5].map((starVal) => (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRating(starVal)}
                    className={`p-2 rounded-lg border transition shrink-0 ${
                      rating >= starVal
                        ? 'bg-amber-50 border-amber-300 text-amber-500'
                        : 'bg-slate-50 border-slate-200 text-slate-300'
                    }`}
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ))}
                <span className="ml-2 text-sm font-bold text-slate-800">{rating} / 5</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Status *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CustomerReviewRecord['status'])}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  {ALLOWED_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st} {st === 'published' ? '(Counts in Aggregate)' : '(Excluded from Aggregate)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Review ID (Read-Only)
                </label>
                <input
                  type="text"
                  value={editingReviewId || 'Auto-generated on create'}
                  readOnly
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 bg-slate-100 text-slate-600 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Review Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter review headline..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Review Text *
              </label>
              <textarea
                rows={4}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Write customer review content..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          {/* 5. Media Upload & Derived Read-Only Metrics */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Review Media Attachments
                </h3>
                <p className="text-[11px] text-slate-500">
                  Uploads directly to Firebase Storage (<code className="font-mono">reviews/</code>) and derives{' '}
                  <code className="font-mono">hasMedia</code> and <code className="font-mono">mediaCount</code>
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {uploadingMedia ? 'Uploading...' : 'Upload Image / Video'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  onChange={handleMediaFileUpload}
                  disabled={uploadingMedia}
                  className="hidden"
                />
              </label>
            </div>

            {media.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {media.map((item) => (
                  <div
                    key={item.id}
                    className="relative group rounded-lg overflow-hidden border border-slate-200 bg-white p-1.5"
                  >
                    {item.type === 'video' ? (
                      <video src={item.url} className="w-full h-20 object-cover rounded" controls />
                    ) : (
                      <img
                        src={item.url}
                        alt={item.fileName || 'Review media'}
                        className="w-full h-20 object-cover rounded"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveMedia(item.id)}
                      className="absolute top-2 right-2 p-1 rounded-full bg-red-600 text-white opacity-90 hover:opacity-100"
                      title="Remove media"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Read-only derived review metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200/60 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="block text-[10px] font-bold uppercase text-slate-400">hasMedia</span>
                <span className="font-mono font-bold text-slate-800">{String(hasMedia)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="block text-[10px] font-bold uppercase text-slate-400">mediaCount</span>
                <span className="font-mono font-bold text-slate-800">{mediaCount}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="block text-[10px] font-bold uppercase text-slate-400">
                  helpfulCount (Preserved)
                </span>
                <span className="font-mono font-bold text-slate-800">{helpfulCount}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="block text-[10px] font-bold uppercase text-slate-400">
                  rankScore (Server-Derived)
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  {editingReviewId ? rankScore : previewRankScore}
                </span>
              </div>
            </div>
          </div>

          {/* Submit & Reset Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="text-[11px] text-slate-400 space-x-3">
              {createdAt && <span>Created: {new Date(createdAt).toLocaleString()}</span>}
              {updatedAt && <span>Updated: {new Date(updatedAt).toLocaleString()}</span>}
            </div>
            <div className="flex items-center gap-3">
              {editingReviewId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition"
              >
                {submitting
                  ? 'Saving & Syncing Aggregate...'
                  : editingReviewId
                  ? 'Update Review'
                  : 'Create Verified Review'}
              </button>
            </div>
          </div>
        </form>

        {/* Right Column: Live Product Aggregate Summary Card */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  customer_review_aggregates
                </h3>
              </div>
              {productId && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {productId}
                </span>
              )}
            </div>

            {!productId ? (
              <div className="text-xs text-slate-500 py-8 text-center">
                Select a product in the combobox to inspect its live{' '}
                <code className="font-mono">customer_review_aggregates</code> document.
              </div>
            ) : !productAggregate ? (
              <div className="text-xs text-slate-500 py-6 text-center">
                Loading aggregate state...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
                    <span className="block text-[10px] font-bold uppercase text-amber-800">
                      averageRating (int64)
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-2xl font-extrabold text-amber-600">
                        {productAggregate.averageRating}
                      </span>
                      <span className="text-xs text-amber-700">/ 5</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                    <span className="block text-[10px] font-bold uppercase text-emerald-800">
                      ratingCount (int64)
                    </span>
                    <div className="text-2xl font-extrabold text-emerald-700 mt-1">
                      {productAggregate.ratingCount}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="block text-[10px] font-bold uppercase text-slate-500">
                      ratingSum (int64)
                    </span>
                    <div className="text-lg font-bold text-slate-800 mt-0.5">
                      {productAggregate.ratingSum}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="block text-[10px] font-bold uppercase text-slate-500">
                      mediaCount (int64)
                    </span>
                    <div className="text-lg font-bold text-slate-800 mt-0.5">
                      {productAggregate.mediaCount}
                    </div>
                  </div>
                </div>

                {/* Rating Distribution 1..5 */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="block text-[11px] font-bold uppercase text-slate-600">
                    Rating Distribution Map (&quot;1&quot;..&quot;5&quot;)
                  </span>
                  {(['5', '4', '3', '2', '1'] as const).map((starKey) => {
                    const count = Number(productAggregate.distribution?.[starKey] || 0);
                    const pct =
                      productAggregate.ratingCount > 0
                        ? Math.round((count / productAggregate.ratingCount) * 100)
                        : 0;
                    return (
                      <div key={starKey} className="flex items-center gap-2 text-xs">
                        <span className="w-6 font-mono font-bold text-slate-700">{starKey}★</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-slate-600">{count}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 space-y-1">
                  <div>
                    Convention: <code className="font-mono">Math.round(ratingSum / ratingCount)</code>{' '}
                    (0 when count=0)
                  </div>
                  {productAggregate.updatedAt && (
                    <div>Updated: {new Date(productAggregate.updatedAt).toLocaleString()}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Existing Customer Reviews Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Customer Reviews ({reviews.length})
            </h2>
            <p className="text-xs text-slate-500">
              Click Edit to load a review into the form and revalidate relational fields
            </p>
          </div>

          <div className="flex items-center gap-3">
            {productId && (
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterProductOnly}
                  onChange={(e) => setFilterProductOnly(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Filter by selected product ({productId})
              </label>
            )}
            <button
              type="button"
              onClick={loadReviews}
              disabled={loadingReviews}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingReviews ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {loadingReviews ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No customer reviews found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-3 px-4">Review ID / Product</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Order / Line Item</th>
                  <th className="py-3 px-4">Rating &amp; Title</th>
                  <th className="py-3 px-4">Media / Rank</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {reviews.map((rev) => (
                  <tr
                    key={rev.reviewId}
                    className={`hover:bg-slate-50/80 transition ${
                      editingReviewId === rev.reviewId ? 'bg-emerald-50/50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 align-top">
                      <div className="font-mono font-bold text-slate-800">{rev.reviewId}</div>
                      <div className="font-mono text-[11px] text-emerald-700">
                        Product: {rev.productId}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-semibold text-slate-900">{rev.customerDisplayName}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        ID: {rev.customerId}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-mono text-slate-800">{rev.orderId}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        Item: {rev.orderItemId}
                      </div>
                      {rev.purchaseDate && (
                        <div className="text-[10px] text-slate-400">
                          Purchased: {new Date(rev.purchaseDate).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top max-w-xs">
                      <div className="flex items-center gap-1 text-amber-500 font-bold">
                        <span>{rev.rating}★</span>
                        <span className="text-slate-900 font-semibold ml-1 truncate">
                          {rev.title}
                        </span>
                      </div>
                      <p className="text-slate-600 line-clamp-2 mt-0.5">{rev.reviewText}</p>
                    </td>
                    <td className="py-3 px-4 align-top font-mono text-[11px]">
                      <div>
                        mediaCount: <strong>{rev.mediaCount}</strong> ({String(rev.hasMedia)})
                      </div>
                      <div>
                        rankScore: <strong>{rev.rankScore}</strong> • helpful: {rev.helpfulCount}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          rev.status === 'published'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rev.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {rev.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 align-top text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditReview(rev)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                          title="Edit review"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteReview(rev.reviewId)}
                          className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                          title="Delete review"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default ProductReviewsManagementView;
