import { auth, db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { apiFetch } from './apiFetch';
import {
  getEffectivePermissionRule,
  mergeRolePermissionsFromDocs,
} from './securityCatalog';
import type { UserRole } from '../types';

export type PreorderFilterStatus = 'ALL' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSED';

export interface PreorderPaymentTransactionSummary {
  paymentDocId: string;
  txnid?: string;
  checkoutReference: string;
  allocationId?: string | null;
  allocationStatus: string;
  paymentStage: 'advance' | 'balance' | 'full' | 'other';
  paymentStageLabel?: string;
  allocatedAmount: number;
  paymentTableAmount?: number;
  paymentTableStatus: string;
  status?: string;
  paymentGateway: string;
  gateway?: string;
  paymentMethod: string;
  providerPaymentId: string;
  paymentReference?: string;
  providerOrderId: string;
  gatewayOrderId?: string;
  verifiedInPaymentsTable: boolean;
  existsInPaymentsTable?: boolean;
  isDisputed: boolean;
  isRefunded: boolean;
  isReversed: boolean;
  verifiedAt: string | null;
  createdAt: string | null;
  verificationReason: string;
  verificationNote?: string;
}

export interface PreorderConversionEligibility {
  preorderId: string;
  eligible: boolean;
  derivedStatusBucket?: 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSED' | 'OTHER';
  reasonCodes: string[];
  reasons: string[];
  authoritativeTotalProductValue: number;
  verifiedNetPaid: number;
  outstandingBalance: number;
  refundedAmount: number;
  paymentsTableVerified: boolean;
  verifiedTransactionCount: number;
  salesOrderId: string | null;
}

export interface PreorderShippingAddressDetails {
  id: string;
  name: string;
  mobileNumber: string;
  email: string;
  addressLine: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  formattedAddress: string;
}

export interface PreorderGridRow {
  id?: string;
  preorderId: string;
  bookingReference: string;
  checkoutReference: string;
  balanceCheckoutReference: string | null;
  bookingDateTime: string;
  customerId: string;
  userId?: string;
  customerName: string;
  customerPhone: string;
  customerMobile?: string;
  customerEmail: string;
  shippingAddress?: string;
  shippingAddressDetails?: PreorderShippingAddressDetails;
  productId: string;
  productName: string;
  productSku: string;
  sku?: string;
  productImage: string;
  imageUrl?: string;
  packingSize?: string;
  quantity: number;
  originalUnitPrice: number;
  onlinePriceSnapshot?: number;
  totalProductValue: number;
  paymentType: string;
  advancePaid: number;
  subsequentVerifiedPaid: number;
  refundedAmount: number;
  verifiedAmountPaid: number;
  outstandingBalance: number;
  paymentsTableVerified: boolean;
  paymentsVerificationStatus:
    | 'VERIFIED_FULL'
    | 'VERIFIED_PARTIAL'
    | 'UNVERIFIED'
    | 'REFUNDED_OR_DISPUTED';
  paymentsTransactions: PreorderPaymentTransactionSummary[];
  paymentsTableTransactions?: PreorderPaymentTransactionSummary[];
  paymentStatus: string;
  bookingStatus: string;
  processingStatus: string;
  derivedFilterBucket: 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSED' | 'OTHER';
  filterBucket?: 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSED' | 'OTHER';
  requestedDeliveryDate: string;
  preferredCourier: string;
  giftWrap: boolean;
  specialSuggestion: string;
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  convertedAt: string | null;
  convertedBy: string | null;
  lastUpdated: string;
  canViewDetails: boolean;
  canConvertToSalesOrder: boolean;
  conversionEligibility: PreorderConversionEligibility;
}

export interface PreorderListResponse {
  success: boolean;
  records: PreorderGridRow[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
    nextCursor: string | null;
  };
  counts: {
    ALL: number;
    PARTIALLY_PAID: number;
    FULLY_PAID: number;
    PROCESSED: number;
  };
  appliedFilters: {
    status: PreorderFilterStatus;
    search: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  };
}

export interface PreorderEventRecord {
  id?: string;
  eventId: string;
  preorderId: string;
  actorId: string;
  actorEmail?: string;
  actorRole: string;
  eventType: string;
  oldStatus?: string | null;
  newStatus?: string | null;
  paymentStatus?: string;
  conversionStatus?: string;
  salesOrderId?: string | null;
  salesOrderNumber?: string | null;
  reasonCodes?: string[];
  message?: string;
  verifiedNetPaid?: number;
  outstandingBalance?: number;
  idempotencyKey?: string;
  occurredAt: string;
}

export interface PreorderDetailResponse {
  success: boolean;
  preorder: PreorderGridRow;
  snapshots: {
    product: Record<string, any>;
    customer: Record<string, any>;
  };
  paymentSummary: {
    authoritativeTotalProductValue: number;
    originalOnlineUnitPrice: number;
    quantity: number;
    paymentType: string;
    advancePaid: number;
    subsequentVerifiedPaid: number;
    verifiedGrossPaid: number;
    refundedAmount: number;
    verifiedNetPaid: number;
    outstandingBalance: number;
    unverifiedOrPendingAmount: number;
    hasDisputedPayment: boolean;
    hasRefundOrReversal: boolean;
    hasUnverifiedClaimedPayment: boolean;
    allPaymentsVerifiedInPaymentsTable: boolean;
    transactions: PreorderPaymentTransactionSummary[];
    refundRecords: Array<{
      refundId: string;
      amount: number;
      reason: string;
      status: string;
      createdAt: string;
    }>;
  };
  conversionEligibility: PreorderConversionEligibility;
  linkedSalesOrder: Record<string, any> | null;
  events: PreorderEventRecord[];
}

export interface ConvertPreorderResponse {
  success: boolean;
  preorderId: string;
  salesOrderId: string;
  salesOrderNumber: string;
  salesOrder: Record<string, any>;
  preorder: Record<string, any>;
  idempotentReplay: boolean;
  verifiedNetPaid: number;
  outstandingBalance: number;
}

// ============================================================================
// Static Deployment Detection & Direct Firestore Fallback Helpers
// ============================================================================

const PREORDERS_COL = 'preorders';
const PREORDER_IDEMPOTENCY_COL = 'preorder_idempotency';
const PREORDER_EVENTS_COL = 'preorder_events';
const PAYMENT_ALLOCATIONS_COL = 'payment_allocations';
const PAYMENTS_COL = 'payments';
const SALES_ORDERS_COL = 'sales_orders';
const ORDER_REFUNDS_COL = 'order_refunds';
const CUSTOMERS_COL = 'customers';
const PRODUCTS_COL = 'products';
const USERS_COL = 'users';
const PERMISSIONS_COL = 'permissions';
const ORDER_FULFILMENT_COL = 'order_fulfilment';
const ORDER_OPERATION_HISTORY_COL = 'order_operation_history';

const SETTLED_PAYMENT_STATUSES = new Set([
  'PAID',
  'COMPLETED',
  'SUCCESS',
  'SETTLED',
  'CAPTURED',
  'VERIFIED',
]);

const UNSETTLED_PAYMENT_STATUSES = new Set([
  'PENDING',
  'PAYMENT_CREATED',
  'CREATED',
  'INITIATED',
  'INITIATED_COD',
  'AUTHORIZED',
  'UNPAID',
  'FAILED',
  'FAILURE',
  'CANCELLED',
  'CANCELED',
  'VOID',
  'EXPIRED',
]);

const REFUNDED_STATUSES = new Set(['REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_COMPLETED']);
const REVERSED_STATUSES = new Set(['REVERSED', 'REVERSAL', 'VOIDED']);
const DISPUTED_STATUSES = new Set(['DISPUTED', 'CHARGEBACK', 'DISPUTE_OPEN', 'FROZEN', 'ON_HOLD']);
const CANCELLED_BOOKING_STATUSES = new Set([
  'CANCELLED',
  'CANCELED',
  'FAILED',
  'REJECTED',
  'INVALIDATED',
  'VOID',
  'EXPIRED',
]);

function roundCurrency(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function normalizeTimestampString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (val instanceof Date) return isNaN(val.getTime()) ? '' : val.toISOString();
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : '';
    } catch {
      return '';
    }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  if (typeof val?._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString();
  }
  return String(val);
}

function randomHex(len = 12): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, len);
  }
  return Math.random().toString(16).slice(2, 2 + len).padEnd(len, '0');
}

async function isStatic(res: Response): Promise<boolean> {
  if (res.status === 502 || res.status === 503 || res.status === 504) return true;
  if (res.status !== 404) return false;
  const body = await res.clone().json().catch(() => null);
  return body?.code === 'STATIC_DEPLOYMENT' || !body?.notFound;
}

function requireDb() {
  if (!db) throw new Error('Firestore database is not initialized.');
  return db;
}

async function getAllDocs(colName: string): Promise<any[]> {
  try {
    const snap = await getDocs(collection(requireDb(), colName));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    try {
      const res = await apiFetch(`/api/db/${encodeURIComponent(colName)}`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch {
      // ignore secondary fallback error
    }
    console.warn(`[PreOrderManagement] Failed to load collection '${colName}':`, err);
    return [];
  }
}

async function resolveCurrentAdminActor(): Promise<{
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  canReadPreorders: boolean;
  canConvertPreorders: boolean;
}> {
  const currentUser = auth?.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    return {
      uid: 'admin',
      email: '',
      name: 'Admin',
      role: 'Admin',
      canReadPreorders: true,
      canConvertPreorders: true,
    };
  }

  const [usersDocs, permDocs] = await Promise.all([
    getAllDocs(USERS_COL),
    getAllDocs(PERMISSIONS_COL),
  ]);

  const emailLower = String(currentUser.email || '').trim().toLowerCase();
  const matchedUser = usersDocs.find(
    (u: any) =>
      String(u.id || '').trim() === currentUser.uid ||
      (emailLower && String(u.email || '').trim().toLowerCase() === emailLower)
  );

  const role: UserRole = (matchedUser?.role as UserRole) || 'Admin';
  const mergedPermissions = mergeRolePermissionsFromDocs(permDocs);
  const preorderRule = getEffectivePermissionRule(
    mergedPermissions,
    role,
    'Pre-Order Management'
  );
  const salesOrderRule = getEffectivePermissionRule(mergedPermissions, role, 'Sales Orders');

  const canReadPreorders =
    role === 'Admin' || Boolean(preorderRule.read && salesOrderRule.read);
  const canConvertPreorders =
    role === 'Admin' ||
    Boolean(
      (preorderRule.create || preorderRule.edit) &&
        (salesOrderRule.create || salesOrderRule.edit)
    );

  return {
    uid: currentUser.uid,
    email: String(currentUser.email || matchedUser?.email || ''),
    name: String(matchedUser?.name || currentUser.displayName || currentUser.email || currentUser.uid),
    role,
    canReadPreorders,
    canConvertPreorders,
  };
}

function evaluatePaymentTxClient(
  preorder: any,
  paymentDoc: any | null,
  allocationDoc: any | null,
  checkoutRefHint?: string
): PreorderPaymentTransactionSummary {
  const preorderId = String(preorder.preorderId || preorder.id || '').trim();
  const totalProductValue = roundCurrency(
    preorder.totalProductValue ??
      roundCurrency(
        Number(preorder.quantity || 1) *
          Number(preorder.onlinePriceSnapshot ?? preorder.originalOnlinePrice ?? preorder.price ?? 0)
      )
  );

  const allocEntry = Array.isArray(allocationDoc?.allocations)
    ? allocationDoc.allocations.find((a: any) => String(a?.preorderId || '').trim() === preorderId)
    : null;

  const prodEntry = Array.isArray(paymentDoc?.orderPayload?.products)
    ? paymentDoc.orderPayload.products.find(
        (p: any) =>
          String(p?.preorderId || '').trim() === preorderId ||
          (p?.isPreorder &&
            String(p?.productId || '').trim() === String(preorder.productId || '').trim())
      )
    : null;

  const checkoutReference = String(
    checkoutRefHint ||
      paymentDoc?.orderId ||
      paymentDoc?.id ||
      allocationDoc?.checkoutReference ||
      allocationDoc?.id ||
      ''
  ).trim();

  const isBalanceStage =
    checkoutReference.startsWith('BAL-') ||
    checkoutReference === String(preorder.balanceCheckoutReference || '').trim() ||
    Boolean(paymentDoc?.orderPayload?.isPreorderBalancePayment) ||
    String(prodEntry?.paymentType || allocEntry?.paymentType || '').toLowerCase() === 'balance';

  let allocatedAmount = 0;
  if (allocEntry && (allocEntry.bookingAdvance !== undefined || allocEntry.amount !== undefined)) {
    allocatedAmount = roundCurrency(allocEntry.bookingAdvance ?? allocEntry.amount);
  } else if (
    allocationDoc &&
    (allocationDoc.allocatedAmount !== undefined || allocationDoc.amount !== undefined)
  ) {
    allocatedAmount = roundCurrency(allocationDoc.allocatedAmount ?? allocationDoc.amount);
  } else if (prodEntry && (prodEntry.bookingAdvance !== undefined || prodEntry.price !== undefined)) {
    allocatedAmount = roundCurrency(prodEntry.bookingAdvance ?? prodEntry.price);
  } else if (
    allocationDoc &&
    Array.isArray(allocationDoc.preorderIds) &&
    allocationDoc.preorderIds.length === 1 &&
    String(allocationDoc.preorderIds[0]) === preorderId
  ) {
    allocatedAmount = roundCurrency(
      allocationDoc.totalPreorderAdvance ?? allocationDoc.customerGrandTotalPayable ?? 0
    );
  } else if (
    paymentDoc &&
    ((Array.isArray(paymentDoc.preorderIds) &&
      paymentDoc.preorderIds.length === 1 &&
      String(paymentDoc.preorderIds[0]) === preorderId) ||
      String(paymentDoc.orderPayload?.preorderId || '') === preorderId ||
      paymentDoc.amount !== undefined ||
      paymentDoc.amountPaid !== undefined)
  ) {
    allocatedAmount = roundCurrency(
      paymentDoc.totalPreorderBookingAdvance ??
        paymentDoc.amount ??
        paymentDoc.amountPaid ??
        paymentDoc.totalAmount ??
        paymentDoc.customerGrandTotalPayable ??
        0
    );
  } else if (
    !isBalanceStage &&
    checkoutReference === String(preorder.checkoutReference || '').trim()
  ) {
    allocatedAmount = roundCurrency(preorder.bookingAdvance || 0);
  }

  const isFullSinglePayment =
    !isBalanceStage &&
    (String(preorder.paymentType || '').toLowerCase() === 'full' ||
      (totalProductValue > 0 && Math.abs(allocatedAmount - totalProductValue) <= 0.01));

  const paymentStage: 'advance' | 'balance' | 'full' = isBalanceStage
    ? 'balance'
    : isFullSinglePayment
    ? 'full'
    : 'advance';

  const existsInPaymentsTable = Boolean(
    paymentDoc && (paymentDoc.id || paymentDoc.orderId || paymentDoc.txnid)
  );
  const paymentTableAmount = existsInPaymentsTable
    ? roundCurrency(
        paymentDoc.amount ??
          paymentDoc.amountPaid ??
          paymentDoc.totalAmount ??
          paymentDoc.customerGrandTotalPayable ??
          (typeof paymentDoc.amountPaise === 'number' ? paymentDoc.amountPaise / 100 : 0)
      )
    : 0;

  const rawPaymentStatus = existsInPaymentsTable
    ? String(paymentDoc.status || paymentDoc.paymentStatus || 'PENDING').trim()
    : 'MISSING_IN_PAYMENTS_TABLE';
  const upperStatus = rawPaymentStatus.toUpperCase();

  const rawAllocStatus = allocationDoc
    ? String(allocationDoc.paymentStatus || allocationDoc.status || 'paid').trim()
    : existsInPaymentsTable
    ? rawPaymentStatus
    : 'unverified';
  const upperAllocStatus = rawAllocStatus.toUpperCase();

  const paymentReference = String(
    paymentDoc?.razorpayPaymentId ||
      paymentDoc?.providerPaymentId ||
      paymentDoc?.transactionReference ||
      paymentDoc?.paymentReference ||
      paymentDoc?.mihpayid ||
      allocationDoc?.paymentReference ||
      (isBalanceStage ? preorder.balancePaymentReference : preorder.paymentReference) ||
      ''
  ).trim();

  const gatewayOrderId = String(
    paymentDoc?.razorpayOrderId || paymentDoc?.providerOrderId || paymentDoc?.gatewayOrderId || ''
  ).trim();

  const gateway = String(
    paymentDoc?.paymentGateway ||
      paymentDoc?.paymentAggregator ||
      paymentDoc?.gateway ||
      paymentDoc?.aggregator ||
      'Razorpay'
  ).trim();

  const paymentMethod = String(
    paymentDoc?.paymentMethod || paymentDoc?.orderPayload?.paymentMethod || gateway || 'Online'
  ).trim();

  const isRefunded =
    REFUNDED_STATUSES.has(upperStatus) ||
    REFUNDED_STATUSES.has(upperAllocStatus) ||
    paymentDoc?.refunded === true ||
    Number(paymentDoc?.refundedAmount || 0) > 0;

  const isReversed =
    REVERSED_STATUSES.has(upperStatus) ||
    REVERSED_STATUSES.has(upperAllocStatus) ||
    paymentDoc?.reversed === true;

  const isDisputed =
    DISPUTED_STATUSES.has(upperStatus) ||
    DISPUTED_STATUSES.has(upperAllocStatus) ||
    paymentDoc?.disputed === true;

  const hasVerifiedLogOrHistory =
    (Array.isArray(paymentDoc?.logs) &&
      paymentDoc.logs.some((l: any) =>
        /VERIFIED_SUCCESS|PAYMENT_VERIFIED|CAPTURED|SETTLED/i.test(
          String(l?.action || l?.status || '')
        )
      )) ||
    (Array.isArray(paymentDoc?.statusHistory) &&
      paymentDoc.statusHistory.some((h: any) =>
        SETTLED_PAYMENT_STATUSES.has(String(h?.status || '').trim().toUpperCase())
      ));

  const hasTrustedProviderRef = Boolean(
    paymentDoc?.razorpayPaymentId ||
      paymentDoc?.providerPaymentId ||
      paymentDoc?.transactionReference ||
      paymentDoc?.paymentReference ||
      paymentDoc?.mihpayid ||
      hasVerifiedLogOrHistory
  );

  const statusIsSettled =
    SETTLED_PAYMENT_STATUSES.has(upperStatus) &&
    !UNSETTLED_PAYMENT_STATUSES.has(upperStatus) &&
    String(gateway).toUpperCase() !== 'COD';

  const allocStatusIsSettled =
    !allocationDoc ||
    SETTLED_PAYMENT_STATUSES.has(upperAllocStatus) ||
    upperAllocStatus === 'ALLOCATED';

  const amountCoversAllocation =
    allocatedAmount > 0 && paymentTableAmount + 0.01 >= allocatedAmount;

  const verifiedInPaymentsTable =
    existsInPaymentsTable &&
    statusIsSettled &&
    allocStatusIsSettled &&
    hasTrustedProviderRef &&
    amountCoversAllocation &&
    !isRefunded &&
    !isReversed &&
    !isDisputed;

  let verificationReason = 'Verified against payments table';
  if (!existsInPaymentsTable) {
    verificationReason = 'Missing transaction record in payments table';
  } else if (isDisputed) {
    verificationReason = 'Payment is under dispute / chargeback';
  } else if (isReversed) {
    verificationReason = 'Payment was reversed / voided';
  } else if (isRefunded) {
    verificationReason = 'Payment was refunded';
  } else if (!statusIsSettled) {
    verificationReason = `Payment status in payments table is '${rawPaymentStatus}' (not settled)`;
  } else if (!allocStatusIsSettled) {
    verificationReason = `Allocation status is '${rawAllocStatus}' (not settled)`;
  } else if (!hasTrustedProviderRef) {
    verificationReason = 'Missing provider payment reference / verification log in payments table';
  } else if (!amountCoversAllocation) {
    verificationReason = `Payments table amount (₹${paymentTableAmount}) is less than allocated amount (₹${allocatedAmount})`;
  }

  return {
    paymentDocId: String(paymentDoc?.id || paymentDoc?.orderId || checkoutReference || ''),
    txnid: String(paymentDoc?.txnid || paymentDoc?.orderId || paymentDoc?.id || checkoutReference || ''),
    checkoutReference,
    allocationId: allocationDoc?.id ? String(allocationDoc.id) : null,
    allocationStatus: rawAllocStatus,
    paymentStage,
    allocatedAmount,
    paymentTableAmount,
    paymentTableStatus: rawPaymentStatus,
    status: rawPaymentStatus,
    paymentGateway: gateway,
    gateway,
    paymentMethod,
    providerPaymentId: paymentReference,
    paymentReference,
    providerOrderId: gatewayOrderId,
    gatewayOrderId,
    verifiedInPaymentsTable,
    existsInPaymentsTable,
    isDisputed,
    isRefunded,
    isReversed,
    verifiedAt: normalizeTimestampString(paymentDoc?.verifiedAt || paymentDoc?.updatedAt) || null,
    createdAt:
      normalizeTimestampString(paymentDoc?.createdAt || allocationDoc?.createdAt || null) || null,
    verificationReason,
    verificationNote: verificationReason,
  };
}

export function formatShippingAddressDetails(
  addr: Partial<PreorderShippingAddressDetails>
): string {
  const name = String(addr.name || '').trim();
  const mobile = String(addr.mobileNumber || '').trim();
  const addressLine = String(addr.addressLine || '').trim();
  const city = String(addr.city || '').trim();
  const district = String(addr.district || '').trim();
  const state = String(addr.state || '').trim();
  const pincode = String(addr.pincode || '').trim();

  const locationParts: string[] = [];
  for (const part of [addressLine, city, district, state]) {
    if (part && !locationParts.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
      locationParts.push(part);
    }
  }

  const recipientPrefix = name && mobile ? `${name} (${mobile})` : name || mobile || '';
  const body = locationParts.join(', ');
  const pinSuffix = pincode ? ` - ${pincode}` : '';

  if (body) {
    return `${recipientPrefix ? `${recipientPrefix}, ` : ''}${body}${pinSuffix}`;
  }
  if (addr.formattedAddress && String(addr.formattedAddress).trim()) {
    return String(addr.formattedAddress).trim();
  }
  return recipientPrefix ? `${recipientPrefix}${pinSuffix}` : '';
}

function resolveClientShippingAddress(params: {
  preorder: any;
  customer?: any;
  payments?: any[];
}): PreorderShippingAddressDetails {
  const { preorder, customer, payments = [] } = params;
  const preorderId = String(preorder?.preorderId || preorder?.id || '').trim();

  const poShipObj =
    preorder?.shippingAddress && typeof preorder.shippingAddress === 'object'
      ? preorder.shippingAddress
      : preorder?.deliveryAddress && typeof preorder.deliveryAddress === 'object'
      ? preorder.deliveryAddress
      : null;

  const poShipString =
    typeof preorder?.shippingAddress === 'string'
      ? preorder.shippingAddress.trim()
      : typeof preorder?.deliveryAddress === 'string'
      ? preorder.deliveryAddress.trim()
      : '';

  let paymentShipObj: any = null;
  let paymentShipString = '';
  for (const p of payments) {
    if (!p || typeof p !== 'object') continue;
    const matchesPreorder =
      (preorder?.checkoutReference &&
        (String(p.id || '') === String(preorder.checkoutReference) ||
          String(p.orderId || '') === String(preorder.checkoutReference))) ||
      (Array.isArray(p.preorderIds) &&
        p.preorderIds.some((id: any) => String(id).trim() === preorderId)) ||
      String(p.orderPayload?.preorderId || '').trim() === preorderId ||
      (Array.isArray(p.orderPayload?.products) &&
        p.orderPayload.products.some(
          (prod: any) => String(prod?.preorderId || '').trim() === preorderId
        ));
    if (!matchesPreorder) continue;
    const candidateObj =
      p.orderPayload?.shippingAddress ||
      p.orderPayload?.deliveryAddress ||
      (typeof p.shippingAddress === 'object' ? p.shippingAddress : null) ||
      (typeof p.deliveryAddress === 'object' ? p.deliveryAddress : null);
    if (candidateObj && typeof candidateObj === 'object') {
      paymentShipObj = candidateObj;
      break;
    }
    const candidateStr = String(
      p.customerAddress ||
        (typeof p.shippingAddress === 'string' ? p.shippingAddress : '') ||
        (typeof p.deliveryAddress === 'string' ? p.deliveryAddress : '') ||
        ''
    ).trim();
    if (candidateStr && !paymentShipString) {
      paymentShipString = candidateStr;
    }
  }

  const id = String(
    poShipObj?.id || paymentShipObj?.id || `addr_po_${preorderId || 'default'}`
  ).trim();

  const name = String(
    poShipObj?.name ||
      preorder?.deliveryAddressName ||
      paymentShipObj?.name ||
      preorder?.customerDisplayName ||
      preorder?.customerName ||
      customer?.name ||
      ''
  ).trim();

  const mobileNumber = String(
    poShipObj?.mobileNumber ||
      poShipObj?.phone ||
      preorder?.deliveryAddressMobile ||
      paymentShipObj?.mobileNumber ||
      paymentShipObj?.phone ||
      preorder?.customerMobile ||
      preorder?.customerPhone ||
      customer?.mobileNumberpluscode ||
      customer?.mobileNumber ||
      ''
  ).trim();

  const email = String(
    poShipObj?.email ||
      preorder?.deliveryAddressEmail ||
      paymentShipObj?.email ||
      preorder?.customerEmail ||
      customer?.email ||
      ''
  ).trim();

  const addressLine = String(
    poShipObj?.addressLine ||
      poShipObj?.address ||
      preorder?.deliveryAddressLine ||
      paymentShipObj?.addressLine ||
      paymentShipObj?.address ||
      poShipString ||
      paymentShipString ||
      customer?.address ||
      ''
  ).trim();

  const city = String(
    poShipObj?.city || preorder?.deliveryCity || paymentShipObj?.city || customer?.city || ''
  ).trim();

  const district = String(
    poShipObj?.district ||
      preorder?.deliveryDistrict ||
      paymentShipObj?.district ||
      customer?.district ||
      ''
  ).trim();

  const state = String(
    poShipObj?.state || preorder?.deliveryState || paymentShipObj?.state || customer?.state || ''
  ).trim();

  const pincode = String(
    poShipObj?.pincode ||
      preorder?.deliveryPincode ||
      paymentShipObj?.pincode ||
      customer?.pincode ||
      ''
  ).trim();

  const explicitFormatted = String(
    preorder?.formattedDeliveryAddress ||
      poShipObj?.formattedAddress ||
      paymentShipObj?.formattedAddress ||
      ''
  ).trim();

  const computedFormatted = formatShippingAddressDetails({
    name,
    mobileNumber,
    addressLine,
    city,
    district,
    state,
    pincode,
    formattedAddress: explicitFormatted,
  });

  const formattedAddress =
    addressLine || city || district || state || pincode
      ? computedFormatted || explicitFormatted
      : explicitFormatted;

  return {
    id,
    name,
    mobileNumber,
    email,
    addressLine,
    city,
    district,
    state,
    pincode,
    formattedAddress,
  };
}

function reconcilePreorderClient(params: {
  preorder: any;
  paymentAllocations: any[];
  payments: any[];
  refunds: any[];
  events: any[];
  salesOrdersMap: Map<string, any>;
  customers: any[];
  products: any[];
  actorRole: UserRole;
  canConvert: boolean;
}): {
  row: PreorderGridRow;
  paymentSummary: PreorderDetailResponse['paymentSummary'];
  conversionEligibility: PreorderConversionEligibility;
  snapshots: PreorderDetailResponse['snapshots'];
  linkedSalesOrder: Record<string, any> | null;
  events: PreorderEventRecord[];
} {
  const {
    preorder,
    paymentAllocations,
    payments,
    refunds,
    events,
    salesOrdersMap,
    customers,
    products,
    canConvert,
  } = params;
  const preorderId = String(preorder.preorderId || preorder.id || '').trim();
  const quantity = Math.max(0, Number(preorder.quantity ?? 1));
  const unitOnlinePrice = roundCurrency(
    preorder.onlinePriceSnapshot ?? preorder.originalOnlinePrice ?? preorder.price ?? 0
  );
  const additionalCharges = roundCurrency(
    Number(preorder.additionalCharges || 0) +
      Number(preorder.giftWrapCharge || 0) +
      Number(preorder.deliveryCharge || 0)
  );
  const computedLineTotal = roundCurrency(quantity * unitOnlinePrice + additionalCharges);
  const rawTotalValue = roundCurrency(preorder.totalProductValue ?? computedLineTotal);
  const authoritativeTotalProductValue =
    rawTotalValue > 0 ? rawTotalValue : computedLineTotal;

  const paymentsByCheckoutRef = new Map<string, any>();
  const paymentsByProviderRef = new Map<string, any>();
  const matchedPaymentDocs: any[] = [];

  for (const p of payments || []) {
    if (!p || typeof p !== 'object') continue;
    for (const k of [p.id, p.orderId, p.txnid]) {
      const clean = String(k || '').trim();
      if (clean) paymentsByCheckoutRef.set(clean, p);
    }
    for (const r of [
      p.razorpayPaymentId,
      p.providerPaymentId,
      p.transactionReference,
      p.paymentReference,
      p.mihpayid,
    ]) {
      const clean = String(r || '').trim();
      if (clean) paymentsByProviderRef.set(clean, p);
    }
    const linksPreorder =
      (Array.isArray(p.preorderIds) &&
        p.preorderIds.some((id: any) => String(id).trim() === preorderId)) ||
      String(p.orderPayload?.preorderId || '').trim() === preorderId ||
      String(p.orderPayload?.orderNumber || '').trim() === preorderId ||
      (Array.isArray(p.orderPayload?.products) &&
        p.orderPayload.products.some(
          (prod: any) => String(prod?.preorderId || '').trim() === preorderId
        ));
    if (linksPreorder) matchedPaymentDocs.push(p);
  }

  const matchedAllocations: any[] = [];
  for (const alloc of paymentAllocations || []) {
    if (!alloc || typeof alloc !== 'object') continue;
    const hasPreorderId =
      String(alloc.targetId || alloc.preorderId || '').trim() === preorderId ||
      (Array.isArray(alloc.preorderIds) &&
        alloc.preorderIds.some((id: any) => String(id).trim() === preorderId)) ||
      (Array.isArray(alloc.allocations) &&
        alloc.allocations.some((a: any) => String(a?.preorderId || '').trim() === preorderId));
    const matchesRef =
      (preorder.checkoutReference &&
        String(alloc.checkoutReference || alloc.id || '').trim() ===
          String(preorder.checkoutReference).trim()) ||
      (preorder.balanceCheckoutReference &&
        String(alloc.checkoutReference || alloc.id || '').trim() ===
          String(preorder.balanceCheckoutReference).trim());
    if (hasPreorderId || matchesRef) matchedAllocations.push(alloc);
  }

  const checkoutRefSet = new Set<string>();
  const allocByRef = new Map<string, any>();

  for (const alloc of matchedAllocations) {
    const ref = String(alloc.checkoutReference || alloc.id || '').trim();
    if (ref) {
      checkoutRefSet.add(ref);
      allocByRef.set(ref, alloc);
    }
  }
  for (const p of matchedPaymentDocs) {
    const ref = String(p.orderId || p.id || p.txnid || '').trim();
    if (ref) checkoutRefSet.add(ref);
  }
  if (preorder.checkoutReference) checkoutRefSet.add(String(preorder.checkoutReference).trim());
  if (preorder.balanceCheckoutReference) {
    checkoutRefSet.add(String(preorder.balanceCheckoutReference).trim());
  }

  const transactions: PreorderPaymentTransactionSummary[] = [];
  const seenKeys = new Set<string>();

  for (const checkoutRef of checkoutRefSet) {
    if (!checkoutRef) continue;
    const allocDoc = allocByRef.get(checkoutRef) || null;
    let paymentDoc = paymentsByCheckoutRef.get(checkoutRef) || null;
    if (!paymentDoc && allocDoc?.paymentReference) {
      paymentDoc = paymentsByProviderRef.get(String(allocDoc.paymentReference).trim()) || null;
    }
    if (
      !paymentDoc &&
      checkoutRef === String(preorder.checkoutReference || '').trim() &&
      preorder.paymentReference &&
      preorder.paymentReference !== preorder.balancePaymentReference
    ) {
      paymentDoc = paymentsByProviderRef.get(String(preorder.paymentReference).trim()) || null;
    }
    if (
      !paymentDoc &&
      checkoutRef === String(preorder.balanceCheckoutReference || '').trim() &&
      preorder.balancePaymentReference
    ) {
      paymentDoc =
        paymentsByProviderRef.get(String(preorder.balancePaymentReference).trim()) || null;
    }

    const summary = evaluatePaymentTxClient(preorder, paymentDoc, allocDoc, checkoutRef);
    const key = summary.paymentDocId || summary.checkoutReference;
    if (key && seenKeys.has(key)) continue;
    if (key) seenKeys.add(key);
    transactions.push(summary);
  }

  transactions.sort((a, b) => {
    if (a.paymentStage !== b.paymentStage) {
      if (a.paymentStage === 'advance') return -1;
      if (b.paymentStage === 'advance') return 1;
    }
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });

  let advancePaid = 0;
  let subsequentVerifiedPaid = 0;
  let unverifiedOrPendingAmount = 0;
  let verifiedGrossPaid = 0;

  for (const tx of transactions) {
    if (tx.verifiedInPaymentsTable) {
      verifiedGrossPaid = roundCurrency(verifiedGrossPaid + tx.allocatedAmount);
      if (tx.paymentStage === 'balance') {
        subsequentVerifiedPaid = roundCurrency(subsequentVerifiedPaid + tx.allocatedAmount);
      } else {
        advancePaid = roundCurrency(advancePaid + tx.allocatedAmount);
      }
    } else if (tx.allocatedAmount > 0 && !tx.isRefunded && !tx.isReversed) {
      unverifiedOrPendingAmount = roundCurrency(unverifiedOrPendingAmount + tx.allocatedAmount);
    }
  }

  const refundRecords: Array<{
    refundId: string;
    amount: number;
    reason: string;
    status: string;
    createdAt: string;
  }> = [];
  let refundedAmount = 0;

  for (const r of refunds || []) {
    if (!r || typeof r !== 'object') continue;
    const matchesPreorder =
      String(r.preorderId || '').trim() === preorderId ||
      String(r.orderId || '').trim() === preorderId ||
      checkoutRefSet.has(String(r.orderId || r.checkoutReference || '').trim());
    if (!matchesPreorder) continue;
    const rStatus = String(r.status || 'COMPLETED').toUpperCase();
    if (rStatus === 'REJECTED' || rStatus === 'CANCELLED') continue;
    const amt = roundCurrency(r.amount ?? r.refundAmount ?? authoritativeTotalProductValue);
    refundedAmount = roundCurrency(refundedAmount + amt);
    refundRecords.push({
      refundId: String(r.id || r.refundId || `ref_${refundRecords.length + 1}`),
      amount: amt,
      reason: String(r.reason || 'Pre-order refund'),
      status: rStatus,
      createdAt: normalizeTimestampString(r.createdAt || r.updatedAt || new Date().toISOString()),
    });
  }

  for (const tx of transactions) {
    if (tx.isRefunded || tx.isReversed) {
      const already = refundRecords.some((r) => r.refundId === tx.paymentDocId);
      if (!already && tx.allocatedAmount > 0) {
        refundedAmount = roundCurrency(refundedAmount + tx.allocatedAmount);
        refundRecords.push({
          refundId: tx.paymentDocId || tx.checkoutReference,
          amount: tx.allocatedAmount,
          reason: tx.isReversed ? 'Payment reversed' : 'Payment refunded in payments table',
          status: tx.isReversed ? 'REVERSED' : 'REFUNDED',
          createdAt: tx.verifiedAt || tx.createdAt || '',
        });
      }
    }
  }

  const rawPreorderPayStatus = String(preorder.paymentStatus || '').trim().toUpperCase();
  const rawBookingStatus = String(preorder.bookingStatus || preorder.status || 'confirmed')
    .trim()
    .toUpperCase();

  const hasRefundOrReversal =
    refundedAmount > 0 ||
    REFUNDED_STATUSES.has(rawPreorderPayStatus) ||
    REVERSED_STATUSES.has(rawPreorderPayStatus) ||
    transactions.some((t) => t.isRefunded || t.isReversed);

  const hasDispute =
    DISPUTED_STATUSES.has(rawPreorderPayStatus) ||
    rawBookingStatus === 'DISPUTED' ||
    transactions.some((t) => t.isDisputed);

  const verifiedNetPaid = Math.max(0, roundCurrency(verifiedGrossPaid - refundedAmount));
  const outstandingBalance = Math.max(
    0,
    roundCurrency(authoritativeTotalProductValue - verifiedNetPaid)
  );

  const verifiedTransactionCount = transactions.filter((t) => t.verifiedInPaymentsTable).length;
  const allRequiredTransactionsVerified =
    verifiedTransactionCount > 0 &&
    transactions.every((t) => t.verifiedInPaymentsTable || t.allocatedAmount === 0) &&
    !hasRefundOrReversal &&
    !hasDispute;

  const paymentsTableVerified =
    authoritativeTotalProductValue > 0 &&
    verifiedNetPaid >= authoritativeTotalProductValue - 0.01 &&
    outstandingBalance === 0 &&
    allRequiredTransactionsVerified;

  const salesOrderId = String(preorder.salesOrderId || '').trim() || null;
  const isProcessed = Boolean(
    salesOrderId &&
      (String(preorder.processingStatus || '').toLowerCase() === 'processed' ||
        String(preorder.conversionStatus || '').toUpperCase() === 'CONVERTED' ||
        salesOrdersMap.has(salesOrderId))
  );
  const isBookingCancelled = CANCELLED_BOOKING_STATUSES.has(rawBookingStatus);

  let derivedPaymentStatus = 'Pending';
  if (hasDispute) derivedPaymentStatus = 'Disputed';
  else if (hasRefundOrReversal && verifiedNetPaid === 0) derivedPaymentStatus = 'Refunded';
  else if (paymentsTableVerified && outstandingBalance === 0) derivedPaymentStatus = 'Fully Paid';
  else if (verifiedNetPaid > 0 && verifiedNetPaid < authoritativeTotalProductValue - 0.01) {
    derivedPaymentStatus = 'Partially Paid';
  }

  let derivedProcessingStatus = 'Awaiting Full Payment';
  if (isProcessed) derivedProcessingStatus = 'Processed';
  else if (isBookingCancelled) derivedProcessingStatus = 'Cancelled';
  else if (paymentsTableVerified && outstandingBalance === 0) {
    derivedProcessingStatus = 'Eligible for Conversion';
  }

  let filterBucket: 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSED' | 'OTHER' = 'OTHER';
  if (isProcessed) {
    filterBucket = 'PROCESSED';
  } else if (
    !isBookingCancelled &&
    !hasDispute &&
    !hasRefundOrReversal &&
    paymentsTableVerified &&
    authoritativeTotalProductValue > 0 &&
    verifiedNetPaid >= authoritativeTotalProductValue - 0.01 &&
    outstandingBalance === 0
  ) {
    filterBucket = 'FULLY_PAID';
  } else if (
    !isBookingCancelled &&
    !hasDispute &&
    verifiedNetPaid > 0 &&
    verifiedNetPaid < authoritativeTotalProductValue - 0.01
  ) {
    filterBucket = 'PARTIALLY_PAID';
  }

  const reasonCodes: string[] = [];
  const reasons: string[] = [];

  if (isProcessed) {
    reasonCodes.push('ALREADY_PROCESSED');
    reasons.push(`Already converted to Sales Order ${salesOrderId}.`);
  }
  if (isBookingCancelled) {
    reasonCodes.push('BOOKING_CANCELLED');
    reasons.push(`Booking status is '${preorder.bookingStatus || preorder.status}'.`);
  }
  if (hasRefundOrReversal) {
    reasonCodes.push('PAYMENT_REFUNDED');
    reasons.push('One or more payments have been refunded or reversed.');
  }
  if (hasDispute) {
    reasonCodes.push('PAYMENT_DISPUTED');
    reasons.push('Payment is under dispute.');
  }
  if (!paymentsTableVerified && verifiedNetPaid >= authoritativeTotalProductValue - 0.01) {
    reasonCodes.push('PAYMENT_UNVERIFIED');
    reasons.push('Payment has not been verified in the authoritative payments table.');
  }
  if (verifiedNetPaid < authoritativeTotalProductValue - 0.01 || outstandingBalance > 0) {
    reasonCodes.push('NOT_FULLY_PAID');
    reasons.push(
      `Verified net paid (₹${verifiedNetPaid.toFixed(2)}) is less than full product value (₹${authoritativeTotalProductValue.toFixed(2)}). Remaining balance: ₹${outstandingBalance.toFixed(2)}.`
    );
  }

  const eligible =
    reasonCodes.length === 0 &&
    paymentsTableVerified &&
    verifiedNetPaid >= authoritativeTotalProductValue - 0.01 &&
    outstandingBalance === 0;

  if (eligible) {
    reasonCodes.push('ELIGIBLE');
    reasons.push(
      `Full product value (₹${authoritativeTotalProductValue.toFixed(2)}) is verified in the payments table with ₹0.00 outstanding balance.`
    );
  }

  const customer = customers.find(
    (c: any) =>
      String(c.id) === String(preorder.customerId) ||
      String(c.customerId) === String(preorder.customerId) ||
      String(c.authUid) === String(preorder.userId)
  );
  const product = products.find((p: any) => String(p.id) === String(preorder.productId));
  const linkedSalesOrder = salesOrderId ? salesOrdersMap.get(salesOrderId) || null : null;

  const shippingAddressDetails = resolveClientShippingAddress({
    preorder,
    customer,
    payments,
  });

  const customerName = String(
    preorder.customerDisplayName ||
      preorder.customerName ||
      customer?.name ||
      shippingAddressDetails.name ||
      'Customer'
  ).trim();
  const customerPhone = String(
    preorder.customerMobile ||
      preorder.customerPhone ||
      customer?.mobileNumberpluscode ||
      customer?.mobileNumber ||
      shippingAddressDetails.mobileNumber ||
      ''
  ).trim();
  const customerEmail = String(
    preorder.customerEmail || customer?.email || shippingAddressDetails.email || ''
  ).trim();
  const productName = String(
    preorder.productNameSnapshot || preorder.productName || product?.name || 'Product'
  ).trim();
  const productSku = String(
    preorder.skuSnapshot || preorder.sku || product?.sku || product?.hsnCode || ''
  ).trim();

  const conversionEligibility: PreorderConversionEligibility = {
    preorderId,
    eligible,
    derivedStatusBucket: filterBucket,
    reasonCodes,
    reasons,
    authoritativeTotalProductValue,
    verifiedNetPaid,
    outstandingBalance,
    refundedAmount,
    paymentsTableVerified,
    verifiedTransactionCount,
    salesOrderId,
  };

  const row: PreorderGridRow = {
    id: preorderId,
    preorderId,
    bookingReference: preorderId,
    checkoutReference: String(preorder.checkoutReference || ''),
    balanceCheckoutReference: preorder.balanceCheckoutReference
      ? String(preorder.balanceCheckoutReference)
      : null,
    bookingDateTime: normalizeTimestampString(preorder.createdAt),
    customerId: String(preorder.customerId || customer?.id || ''),
    userId: String(preorder.userId || customer?.authUid || ''),
    customerName,
    customerPhone,
    customerMobile: customerPhone,
    customerEmail,
    shippingAddress: shippingAddressDetails.formattedAddress,
    shippingAddressDetails,
    productId: String(preorder.productId || product?.id || ''),
    productName,
    productSku,
    sku: productSku,
    productImage: String(
      preorder.imageUrlSnapshot || preorder.productImage || product?.imageUrl || ''
    ),
    imageUrl: String(
      preorder.imageUrlSnapshot || preorder.productImage || product?.imageUrl || ''
    ),
    packingSize: String(preorder.packingSizeSnapshot || product?.packingSize || ''),
    quantity,
    originalUnitPrice: unitOnlinePrice,
    onlinePriceSnapshot: unitOnlinePrice,
    totalProductValue: authoritativeTotalProductValue,
    paymentType: String(preorder.paymentType || 'partial'),
    advancePaid,
    subsequentVerifiedPaid,
    refundedAmount,
    verifiedAmountPaid: verifiedNetPaid,
    outstandingBalance,
    paymentsTableVerified,
    paymentsVerificationStatus:
      hasDispute || hasRefundOrReversal
        ? 'REFUNDED_OR_DISPUTED'
        : paymentsTableVerified
        ? 'VERIFIED_FULL'
        : verifiedNetPaid > 0
        ? 'VERIFIED_PARTIAL'
        : 'UNVERIFIED',
    paymentsTransactions: transactions,
    paymentsTableTransactions: transactions,
    paymentStatus: derivedPaymentStatus,
    bookingStatus: String(preorder.bookingStatus || preorder.status || 'confirmed'),
    processingStatus: derivedProcessingStatus,
    derivedFilterBucket: filterBucket,
    filterBucket,
    requestedDeliveryDate: String(preorder.expectedDeliveryDate || ''),
    preferredCourier: String(preorder.preferredCourierAgent || ''),
    giftWrap: Boolean(preorder.giftWrap),
    specialSuggestion: String(preorder.specialSuggestion || ''),
    salesOrderId,
    salesOrderNumber:
      String(preorder.salesOrderNumber || linkedSalesOrder?.orderNumber || salesOrderId || '') ||
      null,
    convertedAt: normalizeTimestampString(preorder.processedAt) || null,
    convertedBy: preorder.processedBy ? String(preorder.processedBy) : null,
    lastUpdated: normalizeTimestampString(preorder.updatedAt || preorder.createdAt),
    canViewDetails: true,
    canConvertToSalesOrder: Boolean(eligible && canConvert),
    conversionEligibility,
  };

  const preorderEvents: PreorderEventRecord[] = (events || [])
    .filter((e: any) => String(e?.preorderId || '').trim() === preorderId)
    .map((e: any) => ({
      id: String(e.id || e.eventId || ''),
      eventId: String(e.eventId || e.id || ''),
      preorderId,
      actorId: String(e.actorId || 'system'),
      actorEmail: String(e.actorEmail || ''),
      actorRole: String(e.actorRole || 'system'),
      eventType: String(e.eventType || 'event'),
      oldStatus: e.oldStatus ?? null,
      newStatus: e.newStatus ?? null,
      paymentStatus: String(e.paymentStatus || ''),
      conversionStatus: String(e.conversionStatus || ''),
      salesOrderId: e.salesOrderId || null,
      salesOrderNumber: e.salesOrderNumber || null,
      reasonCodes: Array.isArray(e.reasonCodes) ? e.reasonCodes : [],
      message: String(e.message || ''),
      occurredAt: normalizeTimestampString(e.occurredAt || e.createdAt),
    }))
    .sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')));

  return {
    row,
    paymentSummary: {
      authoritativeTotalProductValue,
      originalOnlineUnitPrice: unitOnlinePrice,
      quantity,
      paymentType: row.paymentType,
      advancePaid,
      subsequentVerifiedPaid,
      verifiedGrossPaid,
      refundedAmount,
      verifiedNetPaid,
      outstandingBalance,
      unverifiedOrPendingAmount,
      hasDisputedPayment: hasDispute,
      hasRefundOrReversal,
      hasUnverifiedClaimedPayment: unverifiedOrPendingAmount > 0,
      allPaymentsVerifiedInPaymentsTable: paymentsTableVerified,
      transactions,
      refundRecords,
    },
    conversionEligibility,
    snapshots: {
      product: {
        productId: row.productId,
        productName: row.productName,
        sku: row.productSku,
        packingSize: row.packingSize || '',
        originalOnlineUnitPrice: unitOnlinePrice,
        gstRate: Number(
          preorder.gstPercentageSnapshot ?? product?.gstPercentage ?? product?.gstRate ?? 0
        ),
        brand: String(product?.brand || ''),
        brandOwner: String(product?.brandOwner || ''),
        unit: String(product?.unit || 'NOS'),
        quantity: row.quantity,
        totalProductValue: row.totalProductValue,
      },
      customer: {
        customerId: row.customerId,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        customerEmail: row.customerEmail,
        shippingAddress:
          shippingAddressDetails.formattedAddress || String(customer?.address || ''),
        address:
          shippingAddressDetails.formattedAddress || String(customer?.address || ''),
        addressLine: shippingAddressDetails.addressLine,
        city: shippingAddressDetails.city,
        district: shippingAddressDetails.district || String(customer?.district || ''),
        state: shippingAddressDetails.state || String(customer?.state || ''),
        pincode: shippingAddressDetails.pincode || String(customer?.pincode || ''),
        shippingAddressDetails,
      },
    },
    linkedSalesOrder,
    events: preorderEvents,
  };
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) {
    const err: any = new Error(
      payload?.error || payload?.message || `Request failed with status ${res.status}`
    );
    err.status = res.status;
    err.code = payload?.code || 'API_ERROR';
    err.details = payload?.details || null;
    throw err;
  }
  return payload as T;
}

// ============================================================================
// Public Pre-Order Management API Functions (with Static Fallback)
// ============================================================================

export async function fetchAdminPreorders(params: {
  status?: PreorderFilterStatus;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  cursor?: string;
}): Promise<PreorderListResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.search && params.search.trim()) qs.set('search', params.search.trim());
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);

  const res = await apiFetch(`/api/admin/preorders?${qs.toString()}`, {
    method: 'GET',
  });
  if (!(await isStatic(res))) {
    return parseApiJson<PreorderListResponse>(res);
  }

  // Fallback for static deployment or un-restarted local Vite process
  const actor = await resolveCurrentAdminActor();
  if (!actor.canReadPreorders) {
    throw new Error('Your role does not have permission to view Pre-Order Management.');
  }

  const [preorders, paymentAllocations, payments, refunds, events, customers, products, salesOrders] =
    await Promise.all([
      getAllDocs(PREORDERS_COL),
      getAllDocs(PAYMENT_ALLOCATIONS_COL),
      getAllDocs(PAYMENTS_COL),
      getAllDocs(ORDER_REFUNDS_COL),
      getAllDocs(PREORDER_EVENTS_COL),
      getAllDocs(CUSTOMERS_COL),
      getAllDocs(PRODUCTS_COL),
      getAllDocs(SALES_ORDERS_COL),
    ]);

  const salesOrdersMap = new Map<string, any>();
  for (const so of salesOrders) {
    if (so.id) salesOrdersMap.set(String(so.id), so);
  }

  const allRows: PreorderGridRow[] = preorders.map(
    (po) =>
      reconcilePreorderClient({
        preorder: po,
        paymentAllocations,
        payments,
        refunds,
        events,
        salesOrdersMap,
        customers,
        products,
        actorRole: actor.role,
        canConvert: actor.canConvertPreorders,
      }).row
  );

  const search = String(params.search || '').trim();
  const searchLower = search.toLowerCase();
  const searchFiltered = searchLower
    ? allRows.filter((row) => {
        const haystacks = [
          row.preorderId,
          row.bookingReference,
          row.customerId,
          row.customerName,
          row.customerPhone,
          row.customerEmail,
          row.productId,
          row.productName,
          row.productSku,
          row.checkoutReference,
          row.balanceCheckoutReference || '',
          row.salesOrderId || '',
          row.salesOrderNumber || '',
          ...row.paymentsTransactions.map((t) => t.paymentDocId),
          ...row.paymentsTransactions.map((t) => t.providerPaymentId),
        ];
        return haystacks.some((h) => String(h || '').toLowerCase().includes(searchLower));
      })
    : allRows;

  const counts = {
    ALL: searchFiltered.length,
    PARTIALLY_PAID: searchFiltered.filter((r) => r.derivedFilterBucket === 'PARTIALLY_PAID').length,
    FULLY_PAID: searchFiltered.filter((r) => r.derivedFilterBucket === 'FULLY_PAID').length,
    PROCESSED: searchFiltered.filter((r) => r.derivedFilterBucket === 'PROCESSED').length,
  };

  const filterStatus: PreorderFilterStatus = params.status || 'ALL';
  const statusFiltered =
    filterStatus === 'ALL'
      ? searchFiltered
      : searchFiltered.filter((r) => r.derivedFilterBucket === filterStatus);

  const sortBy = params.sortBy || 'createdAt';
  const sortOrder: 'asc' | 'desc' = params.sortOrder === 'asc' ? 'asc' : 'desc';

  statusFiltered.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'totalProductValue') cmp = a.totalProductValue - b.totalProductValue;
    else if (sortBy === 'verifiedAmountPaid') cmp = a.verifiedAmountPaid - b.verifiedAmountPaid;
    else if (sortBy === 'outstandingBalance') cmp = a.outstandingBalance - b.outstandingBalance;
    else if (sortBy === 'expectedDeliveryDate') {
      cmp = String(a.requestedDeliveryDate || '').localeCompare(
        String(b.requestedDeliveryDate || '')
      );
    } else if (sortBy === 'bookingReference') {
      cmp = String(a.bookingReference).localeCompare(String(b.bookingReference));
    } else if (sortBy === 'updatedAt') {
      cmp = String(a.lastUpdated || '').localeCompare(String(b.lastUpdated || ''));
    } else {
      cmp = String(a.bookingDateTime || '').localeCompare(String(b.bookingDateTime || ''));
    }
    if (cmp === 0) cmp = String(a.preorderId).localeCompare(String(b.preorderId));
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.max(1, Math.min(100, Number(params.limit || 20)));
  const startIndex = (page - 1) * limit;
  const totalRecords = statusFiltered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
  const records = statusFiltered.slice(startIndex, startIndex + limit);
  const hasNext = startIndex + limit < totalRecords;

  return {
    success: true,
    records,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
      hasPrevious: page > 1,
      hasNext,
      nextCursor: hasNext && records.length > 0 ? records[records.length - 1].preorderId : null,
    },
    counts,
    appliedFilters: {
      status: filterStatus,
      search,
      sortBy,
      sortOrder,
    },
  };
}

export async function fetchAdminPreorderDetail(
  preorderId: string
): Promise<PreorderDetailResponse> {
  const res = await apiFetch(`/api/admin/preorders/${encodeURIComponent(preorderId)}`, {
    method: 'GET',
  });
  if (!(await isStatic(res))) {
    return parseApiJson<PreorderDetailResponse>(res);
  }

  const actor = await resolveCurrentAdminActor();
  if (!actor.canReadPreorders) {
    throw new Error('Your role does not have permission to view pre-order details.');
  }

  const d = requireDb();
  const poSnap = await getDoc(doc(d, PREORDERS_COL, preorderId));
  if (!poSnap.exists()) {
    throw new Error(`Pre-order '${preorderId}' not found.`);
  }
  const preorder = { id: poSnap.id, ...poSnap.data() };

  const [paymentAllocations, payments, refunds, events, customers, products, salesOrders] =
    await Promise.all([
      getAllDocs(PAYMENT_ALLOCATIONS_COL),
      getAllDocs(PAYMENTS_COL),
      getAllDocs(ORDER_REFUNDS_COL),
      getAllDocs(PREORDER_EVENTS_COL),
      getAllDocs(CUSTOMERS_COL),
      getAllDocs(PRODUCTS_COL),
      getAllDocs(SALES_ORDERS_COL),
    ]);

  const salesOrdersMap = new Map<string, any>();
  for (const so of salesOrders) {
    if (so.id) salesOrdersMap.set(String(so.id), so);
  }

  const reconciled = reconcilePreorderClient({
    preorder,
    paymentAllocations,
    payments,
    refunds,
    events,
    salesOrdersMap,
    customers,
    products,
    actorRole: actor.role,
    canConvert: actor.canConvertPreorders,
  });

  return {
    success: true,
    preorder: reconciled.row,
    snapshots: reconciled.snapshots,
    paymentSummary: reconciled.paymentSummary,
    conversionEligibility: reconciled.conversionEligibility,
    linkedSalesOrder: reconciled.linkedSalesOrder,
    events: reconciled.events,
  };
}

export async function fetchAdminPreorderEvents(
  preorderId: string,
  params: { page?: number; limit?: number; order?: 'asc' | 'desc' } = {}
): Promise<{
  success: boolean;
  preorderId: string;
  events: PreorderEventRecord[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.order) qs.set('order', params.order);

  const res = await apiFetch(
    `/api/admin/preorders/${encodeURIComponent(preorderId)}/events?${qs.toString()}`,
    {
      method: 'GET',
    }
  );
  if (!(await isStatic(res))) {
    return parseApiJson(res);
  }

  const detail = await fetchAdminPreorderDetail(preorderId);
  return {
    success: true,
    preorderId,
    events: detail.events,
    pagination: {
      page: 1,
      limit: detail.events.length || 50,
      totalRecords: detail.events.length,
      totalPages: 1,
    },
  };
}

export async function fetchPreorderConversionEligibility(
  preorderId: string
): Promise<PreorderConversionEligibility & { success: boolean }> {
  const res = await apiFetch(
    `/api/admin/preorders/${encodeURIComponent(preorderId)}/conversion-eligibility`,
    {
      method: 'GET',
    }
  );
  if (!(await isStatic(res))) {
    return parseApiJson<PreorderConversionEligibility & { success: boolean }>(res);
  }

  const detail = await fetchAdminPreorderDetail(preorderId);
  return {
    success: true,
    ...detail.conversionEligibility,
  };
}

export async function updateAdminPreorderShippingAddress(
  preorderId: string,
  shippingAddress: Partial<PreorderShippingAddressDetails>
): Promise<{
  success: boolean;
  preorderId: string;
  shippingAddress: string;
  shippingAddressDetails: PreorderShippingAddressDetails;
  updatedAt: string;
}> {
  const res = await apiFetch(
    `/api/admin/preorders/${encodeURIComponent(preorderId)}/shipping-address`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ shippingAddress }),
    }
  );
  if (!(await isStatic(res))) {
    return parseApiJson(res);
  }

  const actor = await resolveCurrentAdminActor();
  if (!actor.canConvertPreorders && actor.role !== 'Admin') {
    throw new Error('Your role does not have permission to update pre-order shipping addresses.');
  }

  const d = requireDb();
  const poRef = doc(d, PREORDERS_COL, preorderId);
  const poSnap = await getDoc(poRef);
  if (!poSnap.exists()) {
    throw new Error(`Pre-order '${preorderId}' not found.`);
  }
  const preorderData: any = { id: poSnap.id, ...poSnap.data() };
  const currentShip = resolveClientShippingAddress({ preorder: preorderData });

  const updatedDetails: PreorderShippingAddressDetails = {
    id: String(shippingAddress.id || currentShip.id || `addr_po_${preorderId}`).trim(),
    name: String(shippingAddress.name ?? currentShip.name ?? '').trim(),
    mobileNumber: String(shippingAddress.mobileNumber ?? currentShip.mobileNumber ?? '').trim(),
    email: String(shippingAddress.email ?? currentShip.email ?? '').trim(),
    addressLine: String(shippingAddress.addressLine ?? currentShip.addressLine ?? '').trim(),
    city: String(shippingAddress.city ?? currentShip.city ?? '').trim(),
    district: String(shippingAddress.district ?? currentShip.district ?? '').trim(),
    state: String(shippingAddress.state ?? currentShip.state ?? 'Kerala').trim(),
    pincode: String(shippingAddress.pincode ?? currentShip.pincode ?? '').trim(),
    formattedAddress: '',
  };
  updatedDetails.formattedAddress =
    formatShippingAddressDetails(updatedDetails) ||
    String(shippingAddress.formattedAddress || currentShip.formattedAddress || '').trim();

  const nowIso = new Date().toISOString();
  await updateDoc(poRef, {
    shippingAddress: updatedDetails,
    deliveryAddress: updatedDetails,
    formattedDeliveryAddress: updatedDetails.formattedAddress,
    deliveryAddressName: updatedDetails.name,
    deliveryAddressMobile: updatedDetails.mobileNumber,
    deliveryAddressEmail: updatedDetails.email,
    deliveryAddressLine: updatedDetails.addressLine,
    deliveryCity: updatedDetails.city,
    deliveryDistrict: updatedDetails.district,
    deliveryState: updatedDetails.state,
    deliveryPincode: updatedDetails.pincode,
    updatedAt: nowIso,
  });

  if (preorderData.salesOrderId) {
    const soRef = doc(d, SALES_ORDERS_COL, String(preorderData.salesOrderId));
    const soSnap = await getDoc(soRef).catch(() => null);
    if (soSnap && soSnap.exists()) {
      await updateDoc(soRef, {
        shippingAddress: {
          ...updatedDetails,
          customerId: String(preorderData.customerId || ''),
          userId: String(preorderData.userId || ''),
          address: updatedDetails.formattedAddress || updatedDetails.addressLine,
          isDefault: true,
        },
        updatedAt: nowIso,
      }).catch(() => {});
    }
  }

  const evtId = `poe_${randomHex(24)}`;
  await setDoc(doc(d, PREORDER_EVENTS_COL, evtId), {
    eventId: evtId,
    preorderId,
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    eventType: 'preorder.shipping_address_updated',
    message: `Shipping address updated to: ${updatedDetails.formattedAddress}`,
    occurredAt: nowIso,
  }).catch(() => {});

  return {
    success: true,
    preorderId,
    shippingAddress: updatedDetails.formattedAddress,
    shippingAddressDetails: updatedDetails,
    updatedAt: nowIso,
  };
}

export async function convertPreorderToSalesOrder(params: {
  preorderId: string;
  idempotencyKey: string;
  expectedTotalProductValue?: number;
  expectedVerifiedAmountPaid?: number;
  notes?: string;
  shippingAddress?: Partial<PreorderShippingAddressDetails>;
}): Promise<ConvertPreorderResponse> {
  const res = await apiFetch(
    `/api/admin/preorders/${encodeURIComponent(params.preorderId)}/convert-to-sales-order`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': params.idempotencyKey,
      },
      body: JSON.stringify({
        idempotencyKey: params.idempotencyKey,
        notes: params.notes || '',
        ...(params.shippingAddress ? { shippingAddress: params.shippingAddress } : {}),
      }),
    }
  );
  if (!(await isStatic(res))) {
    return parseApiJson<ConvertPreorderResponse>(res);
  }

  // Transactional Firestore conversion fallback for static deployment
  const actor = await resolveCurrentAdminActor();
  if (!actor.canConvertPreorders) {
    throw new Error('Your role does not have permission to convert pre-orders into sales orders.');
  }

  const preorderId = String(params.preorderId || '').trim();
  const idempotencyKey = String(params.idempotencyKey || '').trim();
  if (!idempotencyKey) {
    throw new Error('A valid idempotencyKey is required to convert a pre-order to a sales order.');
  }

  const d = requireDb();
  const [paymentAllocations, payments, refunds, events, customers, products, salesOrders] =
    await Promise.all([
      getAllDocs(PAYMENT_ALLOCATIONS_COL),
      getAllDocs(PAYMENTS_COL),
      getAllDocs(ORDER_REFUNDS_COL),
      getAllDocs(PREORDER_EVENTS_COL),
      getAllDocs(CUSTOMERS_COL),
      getAllDocs(PRODUCTS_COL),
      getAllDocs(SALES_ORDERS_COL),
    ]);

  const salesOrdersMap = new Map<string, any>();
  for (const so of salesOrders) {
    if (so.id) salesOrdersMap.set(String(so.id), so);
  }

  const reqEventId = `poe_${randomHex(24)}`;
  await setDoc(doc(d, PREORDER_EVENTS_COL, reqEventId), {
    eventId: reqEventId,
    preorderId,
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    eventType: 'preorder.conversion_requested',
    idempotencyKey,
    message: `Conversion to sales order requested by ${actor.email || actor.uid}`,
    occurredAt: new Date().toISOString(),
  });

  const adminIdemDocId = `admin_convert__${preorderId}__${actor.uid}__${idempotencyKey}`;
  const conversionLockDocId = `admin_convert_lock__${preorderId}`;
  const deterministicSalesOrderId = `ORD-PO-${preorderId}`;

  return runTransaction(d, async (transaction) => {
    const preorderRef = doc(d, PREORDERS_COL, preorderId);
    const adminIdemRef = doc(d, PREORDER_IDEMPOTENCY_COL, adminIdemDocId);
    const lockRef = doc(d, PREORDER_IDEMPOTENCY_COL, conversionLockDocId);
    const salesOrderRef = doc(d, SALES_ORDERS_COL, deterministicSalesOrderId);

    const [preorderSnap, adminIdemSnap, lockSnap, existingSoSnap] = await Promise.all([
      transaction.get(preorderRef),
      transaction.get(adminIdemRef),
      transaction.get(lockRef),
      transaction.get(salesOrderRef),
    ]);

    if (!preorderSnap.exists()) {
      throw new Error(`Pre-order '${preorderId}' not found.`);
    }
    const preorderData: any = { id: preorderSnap.id, ...preorderSnap.data() };

    if (adminIdemSnap.exists()) {
      const idemData: any = adminIdemSnap.data() || {};
      const existingOrderId = String(
        idemData.salesOrderId || preorderData.salesOrderId || deterministicSalesOrderId
      );
      return {
        success: true,
        preorderId,
        salesOrderId: existingOrderId,
        salesOrderNumber: String(idemData.salesOrderNumber || existingOrderId),
        salesOrder: existingSoSnap.exists()
          ? { id: existingSoSnap.id, ...existingSoSnap.data() }
          : { id: existingOrderId },
        preorder: preorderData,
        idempotentReplay: true,
        verifiedNetPaid: Number(idemData.verifiedNetPaid || preorderData.totalProductValue || 0),
        outstandingBalance: 0,
      };
    }

    if (
      lockSnap.exists() ||
      existingSoSnap.exists() ||
      (preorderData.salesOrderId &&
        String(preorderData.processingStatus || '').toLowerCase() === 'processed')
    ) {
      throw new Error(
        `Pre-order '${preorderId}' has already been converted to a Sales Order (${
          preorderData.salesOrderId || deterministicSalesOrderId
        }).`
      );
    }

    let effectivePreorderData = preorderData;
    let shippingUpdatesOnPreorder: Record<string, any> = {};
    if (params.shippingAddress && typeof params.shippingAddress === 'object') {
      const mergedShip = resolveClientShippingAddress({
        preorder: {
          ...preorderData,
          shippingAddress: {
            ...(typeof preorderData.shippingAddress === 'object'
              ? preorderData.shippingAddress
              : {}),
            ...params.shippingAddress,
          },
          deliveryAddressLine:
            params.shippingAddress.addressLine ?? preorderData.deliveryAddressLine,
          deliveryCity: params.shippingAddress.city ?? preorderData.deliveryCity,
          deliveryDistrict: params.shippingAddress.district ?? preorderData.deliveryDistrict,
          deliveryState: params.shippingAddress.state ?? preorderData.deliveryState,
          deliveryPincode: params.shippingAddress.pincode ?? preorderData.deliveryPincode,
          deliveryAddressName: params.shippingAddress.name ?? preorderData.deliveryAddressName,
          deliveryAddressMobile:
            params.shippingAddress.mobileNumber ?? preorderData.deliveryAddressMobile,
          deliveryAddressEmail: params.shippingAddress.email ?? preorderData.deliveryAddressEmail,
        },
        payments,
      });
      shippingUpdatesOnPreorder = {
        shippingAddress: mergedShip,
        deliveryAddress: mergedShip,
        formattedDeliveryAddress: mergedShip.formattedAddress,
        deliveryAddressName: mergedShip.name,
        deliveryAddressMobile: mergedShip.mobileNumber,
        deliveryAddressEmail: mergedShip.email,
        deliveryAddressLine: mergedShip.addressLine,
        deliveryCity: mergedShip.city,
        deliveryDistrict: mergedShip.district,
        deliveryState: mergedShip.state,
        deliveryPincode: mergedShip.pincode,
      };
      effectivePreorderData = {
        ...preorderData,
        ...shippingUpdatesOnPreorder,
      };
    }

    const reconciled = reconcilePreorderClient({
      preorder: effectivePreorderData,
      paymentAllocations,
      payments,
      refunds,
      events,
      salesOrdersMap,
      customers,
      products,
      actorRole: actor.role,
      canConvert: actor.canConvertPreorders,
    });

    if (!reconciled.conversionEligibility.eligible) {
      throw new Error(reconciled.conversionEligibility.reasons.join(' '));
    }

    const nowIso = new Date().toISOString();
    const year = new Date(nowIso).getUTCFullYear();
    const seq = String(salesOrders.length + 1).padStart(4, '0');
    const orderNumber = `SO-${year}-${seq}`;
    const totalValue = reconciled.paymentSummary.authoritativeTotalProductValue;
    const gstRate = Number(reconciled.snapshots.product.gstRate || 0);
    const taxableValue =
      gstRate > 0 ? roundCurrency(totalValue / (1 + gstRate / 100)) : totalValue;
    const gstAmount = roundCurrency(totalValue - taxableValue);
    const shipDetails = reconciled.row.shippingAddressDetails || {
      id: `addr_po_${preorderId}`,
      name: reconciled.row.customerName,
      mobileNumber: reconciled.row.customerPhone,
      email: reconciled.row.customerEmail,
      addressLine: reconciled.snapshots.customer.addressLine || '',
      city: reconciled.snapshots.customer.city || '',
      district: reconciled.snapshots.customer.district || '',
      state: reconciled.snapshots.customer.state || 'Kerala',
      pincode: reconciled.snapshots.customer.pincode || '',
      formattedAddress: reconciled.snapshots.customer.shippingAddress || '',
    };

    const salesOrderDoc = {
      orderNumber,
      sourceType: 'PREORDER_CONVERSION',
      sourcePreorderId: preorderId,
      preorderBookingReference: preorderId,
      preorderCheckoutReferences: reconciled.paymentSummary.transactions
        .map((t) => t.checkoutReference)
        .filter(Boolean),
      preorderPaymentReferences: reconciled.paymentSummary.transactions
        .map((t) => t.providerPaymentId)
        .filter(Boolean),
      preorderPaymentDocIds: reconciled.paymentSummary.transactions
        .map((t) => t.paymentDocId)
        .filter(Boolean),
      customerId: reconciled.row.customerId,
      userId: reconciled.row.userId || '',
      customerName: shipDetails.name || reconciled.row.customerName,
      customerEmail: shipDetails.email || reconciled.row.customerEmail,
      customerMobile: shipDetails.mobileNumber || reconciled.row.customerPhone,
      contactNo: shipDetails.mobileNumber || reconciled.row.customerPhone,
      shippingAddress: {
        id: shipDetails.id || `addr_po_${preorderId}`,
        customerId: reconciled.row.customerId,
        userId: reconciled.row.userId || '',
        name: shipDetails.name || reconciled.row.customerName,
        mobileNumber: shipDetails.mobileNumber || reconciled.row.customerPhone,
        email: shipDetails.email || reconciled.row.customerEmail,
        addressLine: shipDetails.addressLine,
        address: shipDetails.formattedAddress || shipDetails.addressLine,
        city: shipDetails.city || shipDetails.district,
        district: shipDetails.district || shipDetails.city,
        state: shipDetails.state || 'Kerala',
        pincode: shipDetails.pincode,
        formattedAddress: shipDetails.formattedAddress,
        isDefault: true,
      },
      products: [
        {
          id: reconciled.row.productId,
          productId: reconciled.row.productId,
          name: reconciled.row.productName,
          sku: reconciled.row.productSku,
          quantity: reconciled.row.quantity,
          price: reconciled.row.originalUnitPrice,
          totalPrice: totalValue,
          gstRate,
          taxableValue,
          gstAmount,
          brand: reconciled.snapshots.product.brand || 'Vio Nature Science',
          brandOwner: reconciled.snapshots.product.brandOwner || 'Vio Nature Science',
          unit: reconciled.snapshots.product.unit || 'NOS',
          packingSize: reconciled.row.packingSize || '',
          isPreorderConverted: true,
          sourcePreorderId: preorderId,
        },
      ],
      subtotal: totalValue,
      deliveryFee: 0,
      courierCharges: 0,
      salesTotal: totalValue,
      totalAmount: totalValue,
      totalValue,
      totalTaxableValue: taxableValue,
      totalGstAmount: gstAmount,
      paymentMethod: reconciled.paymentSummary.transactions[0]?.paymentGateway || 'Razorpay',
      paymentStatus: 'Paid',
      paymentAlreadyCaptured: true,
      verifiedAmountPaid: reconciled.paymentSummary.verifiedNetPaid,
      outstandingBalance: 0,
      orderStatus: 'Confirmed',
      deliveryStatus: 'Pending',
      salesPlatform: 'webleafyearth',
      assignedTo: 'Logistics',
      courierAgency: reconciled.row.preferredCourier || 'DTDC',
      expectedDeliveryDate: reconciled.row.requestedDeliveryDate || '',
      pickupDate: reconciled.row.requestedDeliveryDate || nowIso.split('T')[0],
      invoiceId: `INV-${nowIso.slice(0, 10).replace(/-/g, '')}-${randomHex(6).toUpperCase()}`,
      invoiceDate: nowIso,
      giftWrap: reconciled.row.giftWrap,
      specialSuggestion: reconciled.row.specialSuggestion,
      convertedFromPreorderAt: nowIso,
      convertedByAdminId: actor.uid,
      convertedByAdminEmail: actor.email,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    transaction.set(salesOrderRef, salesOrderDoc);

    const preorderUpdates = {
      ...shippingUpdatesOnPreorder,
      processingStatus: 'processed',
      conversionStatus: 'CONVERTED',
      salesOrderId: deterministicSalesOrderId,
      salesOrderNumber: orderNumber,
      processedAt: nowIso,
      processedBy: actor.uid,
      processedByEmail: actor.email,
      updatedAt: nowIso,
    };
    transaction.update(preorderRef, preorderUpdates);

    const idemRecord = {
      operation: 'admin_convert_to_sales_order',
      preorderId,
      salesOrderId: deterministicSalesOrderId,
      salesOrderNumber: orderNumber,
      adminUid: actor.uid,
      adminEmail: actor.email,
      idempotencyKey,
      verifiedNetPaid: reconciled.paymentSummary.verifiedNetPaid,
      status: 'COMPLETED',
      createdAt: nowIso,
    };
    transaction.set(lockRef, idemRecord);
    transaction.set(adminIdemRef, idemRecord);

    const successEvtId = `poe_${randomHex(24)}`;
    transaction.set(doc(d, PREORDER_EVENTS_COL, successEvtId), {
      eventId: successEvtId,
      preorderId,
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      eventType: 'preorder.conversion_succeeded',
      oldStatus: String(preorderData.processingStatus || 'unprocessed'),
      newStatus: 'processed',
      paymentStatus: 'paid',
      conversionStatus: 'CONVERTED',
      salesOrderId: deterministicSalesOrderId,
      salesOrderNumber: orderNumber,
      verifiedNetPaid: reconciled.paymentSummary.verifiedNetPaid,
      outstandingBalance: 0,
      idempotencyKey,
      message: `Pre-order converted to Sales Order ${orderNumber} (${deterministicSalesOrderId})`,
      occurredAt: nowIso,
    });

    transaction.set(doc(d, ORDER_FULFILMENT_COL, `ful_${deterministicSalesOrderId}`), {
      id: `ful_${deterministicSalesOrderId}`,
      orderId: deterministicSalesOrderId,
      status: 'NOT_STARTED',
      sourcePreorderId: preorderId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const histId = `evt_${Date.now()}_${randomHex(6)}`;
    transaction.set(doc(d, ORDER_OPERATION_HISTORY_COL, histId), {
      id: histId,
      orderId: deterministicSalesOrderId,
      action: 'PREORDER_CONVERTED_TO_SALES_ORDER',
      description: `Converted from fully paid Pre-Order ${preorderId} (Verified Paid: ₹${reconciled.paymentSummary.verifiedNetPaid.toFixed(2)})`,
      timestamp: nowIso,
      performedBy: actor.email || actor.uid,
    });

    return {
      success: true,
      preorderId,
      salesOrderId: deterministicSalesOrderId,
      salesOrderNumber: orderNumber,
      salesOrder: { id: deterministicSalesOrderId, ...salesOrderDoc },
      preorder: { ...preorderData, ...preorderUpdates },
      idempotentReplay: false,
      verifiedNetPaid: reconciled.paymentSummary.verifiedNetPaid,
      outstandingBalance: 0,
    };
  });
}
