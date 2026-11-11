import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCRM } from '../store';
import {
  fetchAdminPreorders,
  fetchAdminPreorderDetail,
  convertPreorderToSalesOrder,
  PreorderFilterStatus,
  PreorderGridRow,
  PreorderDetailResponse,
  ConvertPreorderResponse,
} from '../utils/preorderManagementApi';
import {
  Search,
  RefreshCw,
  Eye,
  ArrowRightCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  X,
  FileText,
  Package,
  User,
  CreditCard,
  Truck,
  Calendar,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Activity,
  Gift,
  MessageSquare,
  Loader2,
  Ban,
} from 'lucide-react';

interface PreOrderManagementViewProps {
  onOpenSalesOrder?: (salesOrderId: string) => void;
}

function formatCurrency(value: number | undefined | null): string {
  const num = Number(value || 0);
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function generateIdempotencyKey(preorderId: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return `conv_${preorderId}_${rand}`.slice(0, 120);
}

export const PreOrderManagementView: React.FC<PreOrderManagementViewProps> = ({
  onOpenSalesOrder,
}) => {
  const { hasAccess, reloadFirestoreData } = useCRM();

  const canRead = hasAccess('Pre-Order Management', 'read');
  const canConvertPerm =
    hasAccess('Pre-Order Management', 'create') || hasAccess('Pre-Order Management', 'edit');

  // Filter / Search / Sort / Pagination State
  const [statusFilter, setStatusFilter] = useState<PreorderFilterStatus>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);

  // Server Data State
  const [records, setRecords] = useState<PreorderGridRow[]>([]);
  const [counts, setCounts] = useState({
    ALL: 0,
    PARTIALLY_PAID: 0,
    FULLY_PAID: 0,
    PROCESSED: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalRecords: 0,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
    nextCursor: null as string | null,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Details Modal State
  const [selectedPreorderId, setSelectedPreorderId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<PreorderDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Conversion Confirmation Modal State
  const [convertTarget, setConvertTarget] = useState<PreorderGridRow | null>(null);
  const [convertIdempotencyKey, setConvertIdempotencyKey] = useState<string>('');
  const [convertNotes, setConvertNotes] = useState<string>('');
  const [converting, setConverting] = useState<boolean>(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<ConvertPreorderResponse | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPreorders = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAdminPreorders({
        status: statusFilter,
        search: debouncedSearch,
        sortBy,
        sortOrder,
        page,
        limit,
      });
      setRecords(response.records || []);
      setCounts(
        response.counts || {
          ALL: 0,
          PARTIALLY_PAID: 0,
          FULLY_PAID: 0,
          PROCESSED: 0,
        }
      );
      setPagination(
        response.pagination || {
          page: 1,
          limit,
          totalRecords: 0,
          totalPages: 1,
          hasPrevious: false,
          hasNext: false,
          nextCursor: null,
        }
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to load pre-order records from server.');
    } finally {
      setLoading(false);
    }
  }, [canRead, statusFilter, debouncedSearch, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    loadPreorders();
  }, [loadPreorders]);

  const openDetailsModal = useCallback(async (preorderId: string) => {
    setSelectedPreorderId(preorderId);
    setDetailData(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetchAdminPreorderDetail(preorderId);
      setDetailData(res);
    } catch (err: any) {
      setDetailError(err?.message || 'Failed to load pre-order details.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetailsModal = () => {
    setSelectedPreorderId(null);
    setDetailData(null);
    setDetailError(null);
  };

  const openConvertModal = (row: PreorderGridRow) => {
    if (!row.canConvertToSalesOrder || !canConvertPerm) return;
    setConvertTarget(row);
    setConvertIdempotencyKey(generateIdempotencyKey(row.preorderId));
    setConvertNotes('');
    setConvertError(null);
    setConvertSuccess(null);
  };

  const closeConvertModal = () => {
    if (converting) return;
    setConvertTarget(null);
    setConvertIdempotencyKey('');
    setConvertNotes('');
    setConvertError(null);
    setConvertSuccess(null);
  };

  const handleConfirmConversion = async () => {
    if (!convertTarget || !convertIdempotencyKey || converting) return;
    setConverting(true);
    setConvertError(null);
    try {
      const res = await convertPreorderToSalesOrder({
        preorderId: convertTarget.preorderId,
        idempotencyKey: convertIdempotencyKey,
        expectedTotalProductValue: convertTarget.totalProductValue,
        expectedVerifiedAmountPaid: convertTarget.verifiedAmountPaid,
        notes: convertNotes.trim(),
      });
      setConvertSuccess(res);
      await loadPreorders();
      if (selectedPreorderId === convertTarget.preorderId) {
        const refreshedDetail = await fetchAdminPreorderDetail(convertTarget.preorderId).catch(
          () => null
        );
        if (refreshedDetail) setDetailData(refreshedDetail);
      }
      if (typeof reloadFirestoreData === 'function') {
        reloadFirestoreData().catch(() => {});
      }
    } catch (err: any) {
      const reasonList = Array.isArray(err?.details?.reasons)
        ? ` (${err.details.reasons.join('; ')})`
        : '';
      setConvertError(
        `${err?.message || 'Failed to convert pre-order to sales order.'}${reasonList}`
      );
    } finally {
      setConverting(false);
    }
  };

  if (!canRead) {
    return (
      <div className="p-8 text-center bg-[#F9FBF9] border border-[#D9E2DA] rounded-2xl">
        <Ban className="w-10 h-10 text-[#D32F2F] mx-auto mb-2" />
        <h3 className="text-sm font-black uppercase text-[#1F2933]">Access Restricted</h3>
        <p className="text-xs text-[#5F6B63] mt-1">
          Your role does not have permission to view Pre-Order Management.
        </p>
      </div>
    );
  }

  const filterButtons: Array<{
    key: PreorderFilterStatus;
    label: string;
    count: number;
    badgeColor: string;
  }> = [
    {
      key: 'ALL',
      label: 'ALL',
      count: counts.ALL,
      badgeColor: 'bg-[#EEF6EE] text-[#1F2933] border-[#D9E2DA]',
    },
    {
      key: 'PARTIALLY_PAID',
      label: 'Partially Paid',
      count: counts.PARTIALLY_PAID,
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      key: 'FULLY_PAID',
      label: 'Fully Paid',
      count: counts.FULLY_PAID,
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    {
      key: 'PROCESSED',
      label: 'Processed',
      count: counts.PROCESSED,
      badgeColor: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    },
  ];

  const renderVerificationBadge = (row: PreorderGridRow) => {
    if (row.paymentsVerificationStatus === 'VERIFIED_FULL') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="w-3 h-3" />
          VERIFIED FULL ({row.paymentsTransactions.filter((t) => t.verifiedInPaymentsTable).length}{' '}
          TXN)
        </span>
      );
    }
    if (row.paymentsVerificationStatus === 'VERIFIED_PARTIAL') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" />
          VERIFIED PARTIAL ({row.paymentsTransactions.filter((t) => t.verifiedInPaymentsTable).length}{' '}
          TXN)
        </span>
      );
    }
    if (row.paymentsVerificationStatus === 'REFUNDED_OR_DISPUTED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="w-3 h-3" />
          REFUND / DISPUTE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gray-100 text-gray-700 border border-gray-300">
        <AlertTriangle className="w-3 h-3" />
        UNVERIFIED IN PAYMENTS
      </span>
    );
  };

  const renderBucketBadge = (bucket: PreorderGridRow['derivedFilterBucket']) => {
    if (bucket === 'PROCESSED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
          <CheckCircle2 className="w-3 h-3" />
          Processed
        </span>
      );
    }
    if (bucket === 'FULLY_PAID') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
          <CheckCircle2 className="w-3 h-3" />
          Fully Paid
        </span>
      );
    }
    if (bucket === 'PARTIALLY_PAID') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
          <Clock className="w-3 h-3" />
          Partially Paid
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gray-100 text-gray-600 border border-gray-200 uppercase">
        Pending / Other
      </span>
    );
  };

  return (
    <div className="space-y-4" id="preorder-management-module">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#D9E2DA]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-[#2E7D32] text-white text-[10px] font-black uppercase tracking-wider">
              Operations
            </span>
            <h2 className="text-lg font-black text-[#1F2933] tracking-tight uppercase">
              Pre-Order Management
            </h2>
          </div>
          <p className="text-xs text-[#5F6B63] mt-0.5">
            Server-verified pre-order ledger reconciled against{' '}
            <code className="font-mono text-[11px] bg-[#EEF6EE] px-1 py-0.5 rounded">
              payment_allocations
            </code>{' '}
            and{' '}
            <code className="font-mono text-[11px] bg-[#EEF6EE] px-1 py-0.5 rounded">payments</code>.
            Only verified Fully Paid bookings can be converted into Sales Orders.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadPreorders}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#EEF6EE] hover:bg-[#E0EFE0] text-[#1F2933] border border-[#D9E2DA] text-xs font-bold transition cursor-pointer disabled:opacity-50"
            id="preorder-refresh-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2E7D32]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
        role="tablist"
        aria-label="Pre-Order Status Filter"
      >
        {filterButtons.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                active
                  ? 'bg-[#2E7D32] text-white border-[#1B5E20] shadow-xs'
                  : 'bg-[#F9FBF9] hover:bg-[#EEF6EE] text-[#1F2933] border-[#D9E2DA]'
              }`}
              id={`preorder-filter-${tab.key.toLowerCase()}`}
            >
              <span className="text-xs font-extrabold uppercase tracking-wider">{tab.label}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                  active ? 'bg-white text-[#2E7D32] border-white' : tab.badgeColor
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Sort Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-[#F9FBF9] p-3 rounded-xl border border-[#D9E2DA]">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#5F6B63] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search booking ref, customer name/ID/phone, product name/SKU, payment ref (ORD-/BAL-/pay_), or sales order..."
            className="w-full pl-9 pr-8 py-2 bg-white border border-[#D9E2DA] rounded-xl text-xs text-[#1F2933] placeholder-[#5F6B63]/70 focus:outline-none focus:border-[#2E7D32]"
            id="preorder-search-input"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5F6B63] hover:text-[#1F2933] cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[10px] font-bold uppercase text-[#5F6B63]">Sort By:</label>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-2 bg-white border border-[#D9E2DA] rounded-xl text-xs font-semibold text-[#1F2933] focus:outline-none focus:border-[#2E7D32]"
            id="preorder-sort-by"
          >
            <option value="createdAt">Booking Date</option>
            <option value="updatedAt">Last Updated</option>
            <option value="totalProductValue">Total Product Value</option>
            <option value="verifiedAmountPaid">Verified Paid Amount</option>
            <option value="outstandingBalance">Outstanding Balance</option>
            <option value="expectedDeliveryDate">Requested Delivery Date</option>
            <option value="bookingReference">Booking Reference</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as 'asc' | 'desc');
              setPage(1);
            }}
            className="px-2.5 py-2 bg-white border border-[#D9E2DA] rounded-xl text-xs font-semibold text-[#1F2933] focus:outline-none focus:border-[#2E7D32]"
            id="preorder-sort-order"
          >
            <option value="desc">Newest / Highest First</option>
            <option value="asc">Oldest / Lowest First</option>
          </select>

          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="px-2.5 py-2 bg-white border border-[#D9E2DA] rounded-xl text-xs font-semibold text-[#1F2933] focus:outline-none focus:border-[#2E7D32]"
            id="preorder-page-size"
          >
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-red-800 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadPreorders}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Pre-Order Grid */}
      <div className="bg-white border border-[#D9E2DA] rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EEF6EE] border-b border-[#D9E2DA] text-[10px] font-black uppercase text-[#1F2933] tracking-wider">
                <th className="py-3 px-3">Booking Ref & Date</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Product & SKU</th>
                <th className="py-3 px-3 text-center">Qty</th>
                <th className="py-3 px-3 text-right">Total Value</th>
                <th className="py-3 px-3 text-right">Verified Paid</th>
                <th className="py-3 px-3 text-right">Outstanding</th>
                <th className="py-3 px-3">Payments Table Verification</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Delivery & Courier</th>
                <th className="py-3 px-3">Sales Order Ref</th>
                <th className="py-3 px-3">Last Updated</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E2DA] text-xs">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-[#5F6B63]">
                    <Loader2 className="w-6 h-6 animate-spin text-[#2E7D32] mx-auto mb-2" />
                    <p className="text-xs font-bold">
                      Loading and verifying pre-order records from server...
                    </p>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-[#5F6B63]">
                    <Package className="w-8 h-8 text-[#5F6B63]/50 mx-auto mb-2" />
                    <p className="text-xs font-bold text-[#1F2933]">
                      No pre-order records match the current filter.
                    </p>
                    <p className="text-[11px] text-[#5F6B63] mt-0.5">
                      Try switching status filters or clearing your search query.
                    </p>
                  </td>
                </tr>
              ) : (
                records.map((row) => (
                  <tr
                    key={row.preorderId}
                    className="hover:bg-[#F9FBF9] transition align-top"
                    data-testid={`preorder-row-${row.preorderId}`}
                  >
                    {/* Booking Reference & Date/Time */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-mono font-extrabold text-[#1F2933] text-xs">
                        {row.bookingReference}
                      </div>
                      <div className="text-[10px] text-[#5F6B63] mt-0.5">
                        {formatDateTime(row.bookingDateTime)}
                      </div>
                      {row.checkoutReference && (
                        <div className="text-[10px] font-mono text-[#5F6B63] mt-0.5">
                          Ref: {row.checkoutReference}
                        </div>
                      )}
                      {row.balanceCheckoutReference && (
                        <div className="text-[10px] font-mono text-[#2E7D32] mt-0.5">
                          Bal: {row.balanceCheckoutReference}
                        </div>
                      )}
                    </td>

                    {/* Customer Name or ID */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#1F2933]">{row.customerName}</div>
                      <div className="text-[10px] font-mono text-[#5F6B63]">
                        ID: {row.customerId || '—'}
                      </div>
                      {row.customerPhone && (
                        <div className="text-[10px] text-[#5F6B63]">{row.customerPhone}</div>
                      )}
                    </td>

                    {/* Product Name & SKU */}
                    <td className="py-3 px-3 max-w-[200px]">
                      <div className="font-bold text-[#1F2933] truncate" title={row.productName}>
                        {row.productName}
                      </div>
                      <div className="text-[10px] font-mono text-[#5F6B63]">
                        SKU: {row.productSku || row.productId}
                      </div>
                      <div className="text-[10px] text-[#5F6B63] uppercase">
                        Mode: {row.paymentType}
                      </div>
                    </td>

                    {/* Quantity */}
                    <td className="py-3 px-3 text-center font-extrabold text-[#1F2933]">
                      {row.quantity}
                    </td>

                    {/* Total Product Value */}
                    <td className="py-3 px-3 text-right font-mono font-extrabold text-[#1F2933] whitespace-nowrap">
                      {formatCurrency(row.totalProductValue)}
                      <div className="text-[10px] font-normal text-[#5F6B63]">
                        @{formatCurrency(row.originalUnitPrice)}/u
                      </div>
                    </td>

                    {/* Verified Amount Paid */}
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                      <div className="font-extrabold text-[#2E7D32]">
                        {formatCurrency(row.verifiedAmountPaid)}
                      </div>
                      <div className="text-[10px] text-[#5F6B63]">
                        Adv: {formatCurrency(row.advancePaid)}
                      </div>
                      {row.subsequentVerifiedPaid > 0 && (
                        <div className="text-[10px] text-[#2E7D32]">
                          +Bal: {formatCurrency(row.subsequentVerifiedPaid)}
                        </div>
                      )}
                    </td>

                    {/* Outstanding Balance */}
                    <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                      <span
                        className={`font-extrabold ${
                          row.outstandingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(row.outstandingBalance)}
                      </span>
                    </td>

                    {/* Payments Table Verification Details */}
                    <td className="py-3 px-3">
                      {renderVerificationBadge(row)}
                      <div className="mt-1 space-y-0.5">
                        {row.paymentsTransactions.length === 0 ? (
                          <div className="text-[10px] text-red-600 font-medium">
                            No linked record in payments table
                          </div>
                        ) : (
                          row.paymentsTransactions.map((tx, idx) => (
                            <div
                              key={`${tx.paymentDocId || tx.checkoutReference}_${idx}`}
                              className="text-[10px] font-mono text-[#5F6B63] flex items-center gap-1"
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  tx.verifiedInPaymentsTable ? 'bg-emerald-600' : 'bg-red-500'
                                }`}
                              />
                              <span className="truncate max-w-[160px]" title={tx.paymentDocId}>
                                {tx.paymentStage.toUpperCase()}: {formatCurrency(tx.allocatedAmount)}{' '}
                                ({tx.paymentTableStatus || 'MISSING'})
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Payment Status & Processing Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div>{renderBucketBadge(row.derivedFilterBucket)}</div>
                      <div className="text-[10px] text-[#5F6B63] mt-1">
                        Pay: <strong className="uppercase">{row.paymentStatus}</strong> • Proc:{' '}
                        <strong className="uppercase">{row.processingStatus}</strong>
                      </div>
                    </td>

                    {/* Requested Delivery Date & Preferred Courier */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="text-xs font-semibold text-[#1F2933]">
                        {row.requestedDeliveryDate || '—'}
                      </div>
                      <div className="text-[10px] text-[#5F6B63]">
                        Courier: <strong>{row.preferredCourier || '—'}</strong>
                      </div>
                      {row.giftWrap && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded mt-0.5">
                          <Gift className="w-2.5 h-2.5" /> Gift Wrap
                        </span>
                      )}
                    </td>

                    {/* Sales-Order Reference */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.salesOrderId ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[11px] font-bold">
                            {row.salesOrderNumber || row.salesOrderId}
                          </span>
                          {onOpenSalesOrder && (
                            <button
                              type="button"
                              onClick={() => onOpenSalesOrder(row.salesOrderId!)}
                              className="block text-[10px] font-bold text-[#2E7D32] hover:underline mt-0.5 cursor-pointer"
                            >
                              Open in Invoices →
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#5F6B63]">—</span>
                      )}
                    </td>

                    {/* Last Updated */}
                    <td className="py-3 px-3 whitespace-nowrap text-[11px] text-[#5F6B63]">
                      {formatDateTime(row.lastUpdated)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetailsModal(row.preorderId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EEF6EE] hover:bg-[#DCE9DE] text-[#1F2933] border border-[#D9E2DA] text-[11px] font-bold transition cursor-pointer"
                          data-testid={`view-details-${row.preorderId}`}
                        >
                          <Eye className="w-3.5 h-3.5 text-[#2E7D32]" />
                          <span>View Details</span>
                        </button>

                        {row.canConvertToSalesOrder && canConvertPerm && (
                          <button
                            type="button"
                            onClick={() => openConvertModal(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-[11px] font-extrabold shadow-2xs transition cursor-pointer"
                            data-testid={`convert-btn-${row.preorderId}`}
                          >
                            <ArrowRightCircle className="w-3.5 h-3.5" />
                            <span>Convert to Sales Order</span>
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

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-[#F9FBF9] border-t border-[#D9E2DA] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#5F6B63]">
          <div>
            Showing{' '}
            <strong className="text-[#1F2933]">
              {records.length === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-[#1F2933]">
              {Math.min(pagination.page * pagination.limit, pagination.totalRecords)}
            </strong>{' '}
            of <strong className="text-[#1F2933]">{pagination.totalRecords}</strong> pre-orders
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!pagination.hasPrevious || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D9E2DA] text-xs font-bold text-[#1F2933] hover:bg-[#EEF6EE] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <span className="px-2.5 py-1 font-mono text-xs font-bold text-[#1F2933]">
              Page {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={!pagination.hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#D9E2DA] text-xs font-bold text-[#1F2933] hover:bg-[#EEF6EE] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          PRE-ORDER DETAILS MODAL (Section 4)
         ===================================================================== */}
      {selectedPreorderId && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preorder-detail-modal-title"
        >
          <div className="bg-white border border-[#D9E2DA] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-[#173F1B] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#81C784]" />
                <div>
                  <h3
                    id="preorder-detail-modal-title"
                    className="text-sm font-black uppercase tracking-wider"
                  >
                    Pre-Order Details • {selectedPreorderId}
                  </h3>
                  <p className="text-[10px] text-[#DCE9DE]">
                    Authoritative Booking Snapshot, Payments Table Verification & Audit Trail
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetailsModal}
                className="p-1.5 rounded-lg bg-[#245B2A] hover:bg-[#2E7D32] text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {detailLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-7 h-7 animate-spin text-[#2E7D32] mx-auto mb-2" />
                  <p className="text-xs font-bold text-[#5F6B63]">
                    Fetching authoritative booking & payment details...
                  </p>
                </div>
              ) : detailError ? (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between">
                  <span>{detailError}</span>
                  <button
                    type="button"
                    onClick={() => openDetailsModal(selectedPreorderId)}
                    className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold"
                  >
                    Retry
                  </button>
                </div>
              ) : detailData ? (
                <>
                  {/* Top Summary Banner */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F9FBF9] p-3.5 rounded-xl border border-[#D9E2DA]">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#5F6B63]">
                        Total Product Value
                      </span>
                      <div className="text-base font-black font-mono text-[#1F2933] mt-0.5">
                        {formatCurrency(detailData.paymentSummary.authoritativeTotalProductValue)}
                      </div>
                      <span className="text-[10px] text-[#5F6B63]">
                        {detailData.paymentSummary.quantity} ×{' '}
                        {formatCurrency(detailData.paymentSummary.originalOnlineUnitPrice)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#5F6B63]">
                        Verified Net Paid
                      </span>
                      <div className="text-base font-black font-mono text-[#2E7D32] mt-0.5">
                        {formatCurrency(detailData.paymentSummary.verifiedNetPaid)}
                      </div>
                      <span className="text-[10px] text-[#5F6B63]">
                        Adv: {formatCurrency(detailData.paymentSummary.advancePaid)} | Bal:{' '}
                        {formatCurrency(detailData.paymentSummary.subsequentVerifiedPaid)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#5F6B63]">
                        Remaining Balance
                      </span>
                      <div
                        className={`text-base font-black font-mono mt-0.5 ${
                          detailData.paymentSummary.outstandingBalance > 0
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(detailData.paymentSummary.outstandingBalance)}
                      </div>
                      <span className="text-[10px] text-[#5F6B63]">
                        Refunds: {formatCurrency(detailData.paymentSummary.refundedAmount)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#5F6B63]">
                        Status & Sales Order
                      </span>
                      <div className="mt-1">
                        {renderBucketBadge(detailData.preorder.derivedFilterBucket)}
                      </div>
                      {detailData.preorder.salesOrderId ? (
                        <div className="text-[11px] font-mono font-bold text-indigo-700 mt-1">
                          SO: {detailData.preorder.salesOrderId}
                        </div>
                      ) : (
                        <div className="text-[10px] text-[#5F6B63] mt-1">Not yet converted</div>
                      )}
                    </div>
                  </div>

                  {/* Product & Customer Snapshots */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Product Snapshot */}
                    <div className="p-3.5 rounded-xl border border-[#D9E2DA] bg-white space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#1F2933] border-b border-[#D9E2DA] pb-1.5">
                        <Package className="w-4 h-4 text-[#2E7D32]" />
                        <span>Product Snapshot</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-[#5F6B63] block">Product Name:</span>
                          <strong className="text-[#1F2933]">
                            {detailData.snapshots.product.productName}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#5F6B63] block">Product ID / SKU:</span>
                          <strong className="font-mono text-[#1F2933]">
                            {detailData.snapshots.product.productId} (
                            {detailData.snapshots.product.sku})
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#5F6B63] block">Original Online Price:</span>
                          <strong className="font-mono text-[#1F2933]">
                            {formatCurrency(detailData.snapshots.product.originalOnlineUnitPrice)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#5F6B63] block">Quantity Booked:</span>
                          <strong className="text-[#1F2933]">
                            {detailData.snapshots.product.quantity}{' '}
                            {detailData.snapshots.product.unit}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#5F6B63] block">Brand / Owner:</span>
                          <strong className="text-[#1F2933]">
                            {detailData.snapshots.product.brand || '—'} /{' '}
                            {detailData.snapshots.product.brandOwner || '—'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#5F6B63] block">Packing Size / GST:</span>
                          <strong className="text-[#1F2933]">
                            {detailData.snapshots.product.packingSize || '—'} (
                            {detailData.snapshots.product.gstRate ?? 0}% GST)
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Customer Snapshot */}
                    <div className="p-3.5 rounded-xl border border-[#D9E2DA] bg-white space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#1F2933] border-b border-[#D9E2DA] pb-1.5">
                        <User className="w-4 h-4 text-[#2E7D32]" />
                        <span>Customer Snapshot</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-[#5F6B63] block">Customer Name:</span>
                          <strong className="text-[#1F2933]">
                            {detailData.snapshots.customer.customerName}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#5F6B63] block">Customer ID:</span>
                          <strong className="font-mono text-[#1F2933]">
                            {detailData.snapshots.customer.customerId || '—'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#5F6B63] block">Phone:</span>
                          <strong className="text-[#1F2933]">
                            {detailData.snapshots.customer.customerPhone || '—'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#5F6B63] block">Email:</span>
                          <strong className="text-[#1F2933] break-all">
                            {detailData.snapshots.customer.customerEmail || '—'}
                          </strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[#5F6B63] block">Shipping Address:</span>
                          <strong className="text-[#1F2933]">
                            {detailData.snapshots.customer.shippingAddress || '—'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Booking Preferences & Timestamps */}
                  <div className="p-3.5 rounded-xl border border-[#D9E2DA] bg-white space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#1F2933] border-b border-[#D9E2DA] pb-1.5">
                      <Truck className="w-4 h-4 text-[#2E7D32]" />
                      <span>Booking Preferences, Status & Delivery Metadata</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                      <div>
                        <span className="text-[#5F6B63] block">Payment Type:</span>
                        <strong className="uppercase text-[#1F2933]">
                          {detailData.preorder.paymentType}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#5F6B63] block">Booking / Payment Status:</span>
                        <strong className="uppercase text-[#1F2933]">
                          {detailData.preorder.bookingStatus} / {detailData.preorder.paymentStatus}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#5F6B63] block">Processing Status:</span>
                        <strong className="uppercase text-[#1F2933]">
                          {detailData.preorder.processingStatus}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#5F6B63] block">Expected Delivery Date:</span>
                        <strong className="text-[#1F2933]">
                          {detailData.preorder.requestedDeliveryDate || '—'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#5F6B63] block">Preferred Courier:</span>
                        <strong className="text-[#1F2933]">
                          {detailData.preorder.preferredCourier || '—'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#5F6B63] block">Gift Wrap:</span>
                        <strong className="text-[#1F2933]">
                          {detailData.preorder.giftWrap ? 'Yes' : 'No'}
                        </strong>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#5F6B63] block">Special Suggestion:</span>
                        <strong className="text-[#1F2933]">
                          {detailData.preorder.specialSuggestion || 'None'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#5F6B63] block">Created At:</span>
                        <strong className="text-[#1F2933]">
                          {formatDateTime(detailData.preorder.bookingDateTime)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#5F6B63] block">Last Updated:</span>
                        <strong className="text-[#1F2933]">
                          {formatDateTime(detailData.preorder.lastUpdated)}
                        </strong>
                      </div>
                      {detailData.preorder.salesOrderId && (
                        <div className="col-span-2">
                          <span className="text-[#5F6B63] block">Linked Sales Order ID:</span>
                          <strong className="font-mono text-indigo-700">
                            {detailData.preorder.salesOrderId} (Converted{' '}
                            {formatDateTime(detailData.preorder.convertedAt)})
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Authoritative `payments` Table Verification Breakdown */}
                  <div className="p-3.5 rounded-xl border border-[#D9E2DA] bg-white space-y-2.5">
                    <div className="flex items-center justify-between border-b border-[#D9E2DA] pb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#1F2933]">
                        <CreditCard className="w-4 h-4 text-[#2E7D32]" />
                        <span>Authoritative Payments Table & Allocation Verification</span>
                      </div>
                      {renderVerificationBadge(detailData.preorder)}
                    </div>

                    {detailData.paymentSummary.transactions.length === 0 ? (
                      <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                        No payment records found in the{' '}
                        <code className="font-mono">payments</code> or{' '}
                        <code className="font-mono">payment_allocations</code> collections for this
                        pre-order.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="bg-[#EEF6EE] text-[#1F2933] font-bold uppercase text-[10px]">
                              <th className="py-2 px-2.5">Stage</th>
                              <th className="py-2 px-2.5">Payment Doc ID</th>
                              <th className="py-2 px-2.5">Checkout Reference</th>
                              <th className="py-2 px-2.5">Gateway & Txn ID</th>
                              <th className="py-2 px-2.5 text-right">Allocated Amount</th>
                              <th className="py-2 px-2.5">Payments Table Status</th>
                              <th className="py-2 px-2.5">Verification</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#D9E2DA]">
                            {detailData.paymentSummary.transactions.map((tx, i) => (
                              <tr key={`${tx.paymentDocId || tx.checkoutReference}_${i}`}>
                                <td className="py-2 px-2.5 font-extrabold uppercase">
                                  {tx.paymentStage}
                                </td>
                                <td className="py-2 px-2.5 font-mono">
                                  {tx.paymentDocId || '—'}
                                </td>
                                <td className="py-2 px-2.5 font-mono">
                                  {tx.checkoutReference || '—'}
                                </td>
                                <td className="py-2 px-2.5">
                                  <div className="font-semibold">{tx.paymentGateway || '—'}</div>
                                  <div className="font-mono text-[10px] text-[#5F6B63]">
                                    {tx.providerPaymentId || '—'}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-right font-mono font-bold">
                                  {formatCurrency(tx.allocatedAmount)}
                                </td>
                                <td className="py-2 px-2.5 font-bold uppercase">
                                  {tx.paymentTableStatus || 'MISSING'}
                                </td>
                                <td className="py-2 px-2.5">
                                  {tx.verifiedInPaymentsTable ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Verified
                                    </span>
                                  ) : (
                                    <span
                                      className="inline-flex items-center gap-1 text-red-600 font-bold"
                                      title={tx.verificationReason}
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      {tx.verificationReason}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Conversion Eligibility Banner */}
                    <div
                      className={`p-3 rounded-lg border text-xs ${
                        detailData.conversionEligibility.eligible
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="font-extrabold uppercase text-[10px] mb-0.5">
                        Conversion Eligibility:{' '}
                        {detailData.conversionEligibility.eligible
                          ? 'ELIGIBLE FOR SALES ORDER CONVERSION'
                          : 'NOT ELIGIBLE FOR CONVERSION'}
                      </div>
                      {detailData.conversionEligibility.eligible ? (
                        <p className="text-[11px]">
                          100% of the authoritative product value (
                          {formatCurrency(
                            detailData.conversionEligibility.authoritativeTotalProductValue
                          )}
                          ) is verified in the <code className="font-mono">payments</code> table and
                          outstanding balance is ₹0.00.
                        </p>
                      ) : (
                        <ul className="list-disc list-inside text-[11px] space-y-0.5">
                          {detailData.conversionEligibility.reasons.map((r, idx) => (
                            <li key={idx}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Chronological Pre-Order Audit Events */}
                  <div className="p-3.5 rounded-xl border border-[#D9E2DA] bg-white space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#1F2933] border-b border-[#D9E2DA] pb-1.5">
                      <Activity className="w-4 h-4 text-[#2E7D32]" />
                      <span>Chronological Pre-Order Audit Events ({detailData.events.length})</span>
                    </div>
                    {detailData.events.length === 0 ? (
                      <p className="text-[11px] text-[#5F6B63]">No events recorded yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {detailData.events.map((evt, idx) => (
                          <div
                            key={evt.eventId || evt.id || idx}
                            className="p-2.5 rounded-lg bg-[#F9FBF9] border border-[#D9E2DA] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]"
                          >
                            <div>
                              <span className="font-mono font-extrabold text-[#2E7D32]">
                                {evt.eventType}
                              </span>
                              {evt.message && (
                                <span className="text-[#1F2933] ml-2">{evt.message}</span>
                              )}
                              <div className="text-[10px] text-[#5F6B63] mt-0.5">
                                Actor: {evt.actorEmail || evt.actorId || 'system'} (
                                {evt.actorRole || 'system'})
                                {evt.salesOrderId ? ` • Sales Order: ${evt.salesOrderId}` : ''}
                                {evt.reasonCodes && evt.reasonCodes.length > 0
                                  ? ` • Reasons: ${evt.reasonCodes.join(', ')}`
                                  : ''}
                              </div>
                            </div>
                            <div className="font-mono text-[10px] text-[#5F6B63] shrink-0">
                              {formatDateTime(evt.occurredAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-[#F9FBF9] border-t border-[#D9E2DA] flex items-center justify-between">
              <div>
                {detailData?.preorder.salesOrderId && onOpenSalesOrder && (
                  <button
                    type="button"
                    onClick={() => {
                      const soId = detailData.preorder.salesOrderId!;
                      closeDetailsModal();
                      onOpenSalesOrder(soId);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Sales Order {detailData.preorder.salesOrderId}</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {detailData?.preorder.canConvertToSalesOrder && canConvertPerm && (
                  <button
                    type="button"
                    onClick={() => openConvertModal(detailData.preorder)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-xs font-extrabold transition cursor-pointer"
                  >
                    <ArrowRightCircle className="w-4 h-4" />
                    <span>Convert to Sales Order</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeDetailsModal}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-[#EEF6EE] text-[#1F2933] border border-[#D9E2DA] text-xs font-bold transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CONVERT TO SALES ORDER CONFIRMATION MODAL (Section 5 & 7)
         ===================================================================== */}
      {convertTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="convert-modal-title"
        >
          <div className="bg-white border border-[#D9E2DA] rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#173F1B] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightCircle className="w-5 h-5 text-[#81C784]" />
                <h3 id="convert-modal-title" className="text-sm font-black uppercase tracking-wider">
                  Convert Pre-Order to Sales Order
                </h3>
              </div>
              <button
                type="button"
                onClick={closeConvertModal}
                disabled={converting}
                className="p-1 rounded-lg bg-[#245B2A] hover:bg-[#2E7D32] text-white cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {convertSuccess ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1.5">
                    <div className="flex items-center gap-2 font-black text-sm text-emerald-800">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>
                        {convertSuccess.idempotentReplay
                          ? 'Sales Order Already Created (Idempotent Replay)'
                          : 'Pre-Order Converted to Sales Order'}
                      </span>
                    </div>
                    <p className="text-xs">
                      Pre-order <strong className="font-mono">{convertSuccess.preorderId}</strong> is
                      now marked <strong>Processed</strong> and linked to Sales Order{' '}
                      <strong className="font-mono">{convertSuccess.salesOrderId}</strong> (
                      <strong className="font-mono">{convertSuccess.salesOrderNumber}</strong>).
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    {onOpenSalesOrder && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetOrderId = convertSuccess.salesOrderId;
                          closeConvertModal();
                          onOpenSalesOrder(targetOrderId);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View Sales Order {convertSuccess.salesOrderId}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeConvertModal}
                      className="px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-xs font-bold transition cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-[#1F2933]">
                    Please verify the authoritative pre-order details below before converting this
                    booking into a regular Sales Order for downstream fulfillment.
                  </p>

                  <div className="bg-[#F9FBF9] p-3.5 rounded-xl border border-[#D9E2DA] space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#5F6B63]">Booking Reference:</span>
                      <strong className="font-mono text-[#1F2933]">
                        {convertTarget.bookingReference}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5F6B63]">Customer:</span>
                      <strong className="text-[#1F2933]">
                        {convertTarget.customerName} ({convertTarget.customerId})
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5F6B63]">Product & Qty:</span>
                      <strong className="text-[#1F2933]">
                        {convertTarget.productName} × {convertTarget.quantity}
                      </strong>
                    </div>
                    <div className="flex justify-between border-t border-[#D9E2DA] pt-2">
                      <span className="text-[#5F6B63]">Authoritative Total Value:</span>
                      <strong className="font-mono text-[#1F2933]">
                        {formatCurrency(convertTarget.totalProductValue)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5F6B63]">
                        Verified Net Paid (<code className="font-mono">payments</code> table):
                      </span>
                      <strong className="font-mono text-[#2E7D32]">
                        {formatCurrency(convertTarget.verifiedAmountPaid)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5F6B63]">Outstanding Balance:</span>
                      <strong className="font-mono text-emerald-700">
                        {formatCurrency(convertTarget.outstandingBalance)}
                      </strong>
                    </div>
                    <div className="flex justify-between border-t border-[#D9E2DA] pt-2">
                      <span className="text-[#5F6B63]">Expected Action:</span>
                      <strong className="text-[#1F2933] text-right">
                        Create Sales Order <span className="font-mono">ORD-PO-{convertTarget.preorderId}</span> &
                        mark Pre-Order <span className="uppercase">Processed</span>
                      </strong>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-[#5F6B63] mb-1">
                      Conversion Notes (Optional)
                    </label>
                    <input
                      type="text"
                      value={convertNotes}
                      onChange={(e) => setConvertNotes(e.target.value)}
                      placeholder="Optional remarks for audit log..."
                      className="w-full px-3 py-2 bg-white border border-[#D9E2DA] rounded-xl text-xs text-[#1F2933] focus:outline-none focus:border-[#2E7D32]"
                    />
                  </div>

                  {convertError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{convertError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D9E2DA]">
                    <button
                      type="button"
                      onClick={closeConvertModal}
                      disabled={converting}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-[#EEF6EE] text-[#1F2933] border border-[#D9E2DA] text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmConversion}
                      disabled={converting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-xs font-extrabold shadow-sm transition cursor-pointer disabled:opacity-50"
                      id="confirm-convert-preorder-btn"
                    >
                      {converting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Verifying & Converting...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirm & Convert to Sales Order</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreOrderManagementView;
