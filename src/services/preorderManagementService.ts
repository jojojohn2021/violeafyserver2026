/**
 * LeafyEarth | Pre-Order Backend Operations Module
 *
 * Isolated administrator-facing backend service & Express routes for Pre-Order Management.
 *
 * Collections owned/read:
 * - `preorders` (read all authorized records; write minimal additive conversion fields only upon verified conversion)
 * - `preorder_idempotency` (duplicate prevention & safe retries namespaced for admin conversions)
 * - `preorder_events` (append audit events; read chronological booking history)
 * - `payment_allocations` (authoritative per-checkout allocation records; linked to converted salesOrderId on conversion)
 * - `payments` (authoritative payment gateway transaction table; cross-checked for every payment allocation)
 * - `order_refunds` (refund/reversal cross-check)
 * - `sales_orders` (write only after explicit, authorized, verified Fully Paid conversion)
 */

import type express from 'express';
import crypto from 'crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import {
  getEffectivePermissionRule,
  mergeRolePermissionsFromDocs,
} from '../utils/securityCatalog';
import type { UserRole } from '../types';

export const PREORDERS_COLLECTION = 'preorders';
export const PREORDER_IDEMPOTENCY_COLLECTION = 'preorder_idempotency';
export const PREORDER_EVENTS_COLLECTION = 'preorder_events';
export const PAYMENT_ALLOCATIONS_COLLECTION = 'payment_allocations';
export const PAYMENTS_COLLECTION = 'payments';
export const SALES_ORDERS_COLLECTION = 'sales_orders';
export const ORDER_REFUNDS_COLLECTION = 'order_refunds';
export const CUSTOMERS_COLLECTION = 'customers';
export const PRODUCTS_COLLECTION = 'products';
export const USERS_COLLECTION = 'users';
export const PERMISSIONS_COLLECTION = 'permissions';
export const ORDER_FULFILMENT_COLLECTION = 'order_fulfilment';
export const ORDER_OPERATION_HISTORY_COLLECTION = 'order_operation_history';

export type PreorderFilterStatus = 'ALL' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSED';

export type PreorderErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_FILTER'
  | 'INVALID_PAGE_SIZE'
  | 'INVALID_SORT'
  | 'INVALID_ID'
  | 'UNKNOWN_FIELDS'
  | 'MISSING_IDEMPOTENCY_KEY'
  | 'NOT_FULLY_PAID'
  | 'ALREADY_PROCESSED'
  | 'PAYMENT_UNVERIFIED'
  | 'CONVERSION_CONFLICT'
  | 'CONVERSION_FAILED';

export type PreorderConversionReasonCode =
  | 'ELIGIBLE'
  | 'ALREADY_PROCESSED'
  | 'NOT_FULLY_PAID'
  | 'PAYMENT_UNVERIFIED'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_REVERSED'
  | 'PAYMENT_DISPUTED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_INVALID'
  | 'PRODUCT_INVALID';

export class PreorderHttpError extends Error {
  constructor(
    public status: number,
    public code: PreorderErrorCode,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
  }
}

export interface PaymentsTableTransactionSummary {
  paymentDocId: string;
  txnid: string;
  checkoutReference: string;
  paymentReference: string;
  providerPaymentId?: string;
  gatewayOrderId: string;
  providerOrderId?: string;
  gateway: string;
  paymentGateway?: string;
  paymentMethod: string;
  paymentStage: 'advance' | 'balance' | 'full';
  paymentStageLabel: string;
  allocatedAmount: number;
  paymentTableAmount: number;
  currency: string;
  status: string;
  paymentTableStatus?: string;
  allocationStatus: string;
  existsInPaymentsTable: boolean;
  verifiedInPaymentsTable: boolean;
  isRefunded: boolean;
  isReversed: boolean;
  isDisputed: boolean;
  verifiedAt: string | null;
  createdAt: string | null;
  verificationNote: string;
  verificationReason?: string;
}

export interface PreorderPaymentReconciliation {
  preorderId: string;
  authoritativeTotalProductValue: number;
  unitOnlinePrice: number;
  quantity: number;
  additionalCharges: number;
  advancePaid: number;
  subsequentVerifiedPaid: number;
  unverifiedOrPendingAmount: number;
  refundedAmount: number;
  verifiedGrossPaid: number;
  verifiedNetPaid: number;
  outstandingBalance: number;
  paymentsTableVerified: boolean;
  paymentsTableTransactionCount: number;
  verifiedTransactionCount: number;
  paymentsTableTransactions: PaymentsTableTransactionSummary[];
  refundRecords: Array<{
    refundId: string;
    amount: number;
    reason: string;
    status: string;
    createdAt: string;
  }>;
  hasRefundOrReversal: boolean;
  hasDispute: boolean;
  hasUnverifiedClaimedPayment: boolean;
  derivedPaymentStatus: 'Fully Paid' | 'Partially Paid' | 'Pending' | 'Refunded' | 'Failed' | 'Disputed' | 'Unverified';
  derivedProcessingStatus: 'Processed' | 'Eligible for Conversion' | 'Awaiting Full Payment' | 'Awaiting Payment Verification' | 'Cancelled' | 'Refunded' | 'Disputed';
  filterBucket: 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSED' | 'OTHER';
}

export interface PreorderConversionEligibility {
  preorderId: string;
  eligible: boolean;
  advisoryOnly: boolean;
  reasonCodes: PreorderConversionReasonCode[];
  reasons: string[];
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  paymentReconciliation: PreorderPaymentReconciliation;
}

export interface PreorderGridRow {
  id: string;
  preorderId: string;
  bookingReference: string;
  bookingDateTime: string;
  customerId: string;
  userId: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  productId: string;
  productName: string;
  sku: string;
  packingSize: string;
  imageUrl: string;
  quantity: number;
  onlinePriceSnapshot: number;
  totalProductValue: number;
  advancePaid: number;
  subsequentVerifiedPaid: number;
  refundedAmount: number;
  verifiedAmountPaid: number;
  outstandingBalance: number;
  currency: string;
  paymentType: string;
  paymentTypeLabel: string;
  paymentStatus: string;
  rawPaymentStatus: string;
  bookingStatus: string;
  processingStatus: string;
  requestedDeliveryDate: string;
  preferredCourier: string;
  giftWrap: boolean;
  specialSuggestion: string;
  checkoutReference: string;
  balanceCheckoutReference: string;
  paymentReference: string;
  balancePaymentReference: string;
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  processedAt: string | null;
  processedBy: string | null;
  lastUpdated: string;
  paymentsTableVerified: boolean;
  paymentsTableTransactions: PaymentsTableTransactionSummary[];
  filterBucket: 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSED' | 'OTHER';
  canConvertToSalesOrder: boolean;
  conversionEligibility: {
    eligible: boolean;
    reasonCodes: PreorderConversionReasonCode[];
    reasons: string[];
  };
}

export interface AuthenticatedAdminActor {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  canReadPreorders: boolean;
  canConvertPreorders: boolean;
}

// ---------------------------------------------------------------------------
// Utility & Sanitization Helpers
// ---------------------------------------------------------------------------

export function roundCurrency(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function normalizeTimestampString(val: any): string {
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

export function maskSensitiveValue(value: string, type: 'email' | 'phone', role: UserRole): string {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (role === 'Admin' || role === 'Sales' || role === 'Support') {
    return clean;
  }
  if (type === 'email') {
    const [local, domain] = clean.split('@');
    if (!domain) return '***';
    return `${local.slice(0, 2)}***@${domain}`;
  }
  const digits = clean.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `******${digits.slice(-4)}`;
}

const SENSITIVE_PAYMENT_KEYS = new Set([
  'merchant_salt',
  'merchantsalt',
  'salt',
  'secret',
  'key_secret',
  'webhook_secret',
  'hash',
  'card_token',
  'cardtoken',
  'card_number',
  'cardnumber',
  'cvv',
  'pin',
  'password',
  'access_token',
  'refresh_token',
]);

export function stripSensitiveSecrets<T = any>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => stripSensitiveSecrets(item)) as unknown as T;
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    if (SENSITIVE_PAYMENT_KEYS.has(k.toLowerCase())) continue;
    clean[k] = stripSensitiveSecrets(v);
  }
  return clean as T;
}

export function parsePreorderFilterStatus(raw: unknown): PreorderFilterStatus {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 'ALL';
  const normalized = String(raw).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'ALL') return 'ALL';
  if (normalized === 'PARTIALLY_PAID' || normalized === 'PARTIAL') return 'PARTIALLY_PAID';
  if (normalized === 'FULLY_PAID' || normalized === 'FULL_PAID') return 'FULLY_PAID';
  if (normalized === 'PROCESSED' || normalized === 'CONVERTED') return 'PROCESSED';
  throw new PreorderHttpError(
    400,
    'INVALID_FILTER',
    `Invalid status filter '${String(raw)}'. Allowed values: ALL, Partially Paid, Fully Paid, Processed.`
  );
}

export function validatePreorderIdParam(rawId: unknown): string {
  const id = String(rawId || '').trim();
  if (!id || id.length > 128 || /[\/\\?#\s]/.test(id) || id.includes('..')) {
    throw new PreorderHttpError(400, 'INVALID_ID', `Malformed pre-order identifier '${String(rawId || '')}'.`);
  }
  return id;
}

const SETTLED_PAYMENT_STATUSES = new Set([
  'PAID',
  'COMPLETED',
  'SUCCESS',
  'SETTLED',
  'CAPTURED',
  'VERIFIED',
]);

const UNSETTLED_OR_INVALID_PAYMENT_STATUSES = new Set([
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

// ---------------------------------------------------------------------------
// Authoritative Payment Verification & Reconciliation Engine
// ---------------------------------------------------------------------------

/**
 * Evaluates a single `payments` collection document and optional `payment_allocations`
 * document for a specific `preorderId`.
 */
export function evaluatePaymentTransactionForPreorder(
  preorder: any,
  paymentDoc: any | null,
  allocationDoc: any | null,
  checkoutRefHint?: string
): PaymentsTableTransactionSummary {
  const preorderId = String(preorder.preorderId || preorder.id || '').trim();
  const totalProductValue = roundCurrency(
    preorder.totalProductValue ??
      roundCurrency(
        Number(preorder.quantity || 1) *
          Number(preorder.onlinePriceSnapshot ?? preorder.originalOnlinePrice ?? preorder.price ?? 0)
      )
  );

  // Find matching allocation entry inside allocationDoc.allocations
  const allocEntry = Array.isArray(allocationDoc?.allocations)
    ? allocationDoc.allocations.find((a: any) => String(a?.preorderId || '').trim() === preorderId)
    : null;

  // Find matching product entry inside paymentDoc.orderPayload.products
  const prodEntry = Array.isArray(paymentDoc?.orderPayload?.products)
    ? paymentDoc.orderPayload.products.find(
        (p: any) =>
          String(p?.preorderId || '').trim() === preorderId ||
          (p?.isPreorder && String(p?.productId || '').trim() === String(preorder.productId || '').trim())
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

  // Determine stage ('advance' | 'balance' | 'full')
  const isBalanceStage =
    checkoutReference.startsWith('BAL-') ||
    checkoutReference === String(preorder.balanceCheckoutReference || '').trim() ||
    Boolean(paymentDoc?.orderPayload?.isPreorderBalancePayment) ||
    String(prodEntry?.paymentType || allocEntry?.paymentType || '').toLowerCase() === 'balance';

  // Determine allocated amount for this specific preorder in this checkout
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
  } else if (!isBalanceStage && checkoutReference === String(preorder.checkoutReference || '').trim()) {
    // Fallback to initial advance if no balance checkout has overwritten bookingAdvance
    const rawAdvance = roundCurrency(preorder.bookingAdvance || 0);
    allocatedAmount = rawAdvance;
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

  const paymentStageLabel =
    paymentStage === 'balance'
      ? 'Remaining Balance Payment'
      : paymentStage === 'full'
      ? '100% Full Advance Payment'
      : 'Initial Booking Advance';

  const existsInPaymentsTable = Boolean(paymentDoc && (paymentDoc.id || paymentDoc.orderId || paymentDoc.txnid));
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
      ''
  ).trim();

  const paymentMethod = String(
    paymentDoc?.paymentMethod ||
      paymentDoc?.orderPayload?.paymentMethod ||
      gateway ||
      ''
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

  // Check statusHistory / logs for server-side verification evidence
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
    !UNSETTLED_OR_INVALID_PAYMENT_STATUSES.has(upperStatus) &&
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

  // Find verified timestamp
  let verifiedAt: string | null = null;
  if (existsInPaymentsTable) {
    const paidHistory = Array.isArray(paymentDoc.statusHistory)
      ? paymentDoc.statusHistory.find((h: any) =>
          SETTLED_PAYMENT_STATUSES.has(String(h?.status || '').trim().toUpperCase())
        )
      : null;
    const verifiedLog = Array.isArray(paymentDoc.logs)
      ? paymentDoc.logs.find((l: any) => /VERIFIED_SUCCESS/i.test(String(l?.action || '')))
      : null;
    verifiedAt =
      normalizeTimestampString(
        paidHistory?.timestamp ||
          verifiedLog?.timestamp ||
          paymentDoc.verifiedAt ||
          (verifiedInPaymentsTable ? paymentDoc.updatedAt : null)
      ) || null;
  }

  let verificationNote = 'Verified against payments table';
  if (!existsInPaymentsTable) {
    verificationNote = 'Missing transaction record in payments table';
  } else if (isDisputed) {
    verificationNote = 'Payment is under dispute / chargeback';
  } else if (isReversed) {
    verificationNote = 'Payment was reversed / voided';
  } else if (isRefunded) {
    verificationNote = 'Payment was refunded';
  } else if (!statusIsSettled) {
    verificationNote = `Payment status in payments table is '${rawPaymentStatus}' (not settled)`;
  } else if (!allocStatusIsSettled) {
    verificationNote = `Allocation status is '${rawAllocStatus}' (not settled)`;
  } else if (!hasTrustedProviderRef) {
    verificationNote = 'Missing provider payment reference / verification log in payments table';
  } else if (!amountCoversAllocation) {
    verificationNote = `Payments table amount (₹${paymentTableAmount}) is less than allocated amount (₹${allocatedAmount})`;
  }

  return {
    paymentDocId: String(paymentDoc?.id || paymentDoc?.orderId || checkoutReference || ''),
    txnid: String(paymentDoc?.txnid || paymentDoc?.orderId || paymentDoc?.id || checkoutReference || ''),
    checkoutReference,
    paymentReference,
    providerPaymentId: paymentReference,
    gatewayOrderId,
    providerOrderId: gatewayOrderId,
    gateway: gateway || 'Online',
    paymentGateway: gateway || 'Online',
    paymentMethod: paymentMethod || 'Online',
    paymentStage,
    paymentStageLabel,
    allocatedAmount,
    paymentTableAmount,
    currency: String(paymentDoc?.currency || preorder.currency || 'INR'),
    status: rawPaymentStatus,
    paymentTableStatus: rawPaymentStatus,
    allocationStatus: rawAllocStatus,
    existsInPaymentsTable,
    verifiedInPaymentsTable,
    isRefunded,
    isReversed,
    isDisputed,
    verifiedAt,
    createdAt:
      normalizeTimestampString(paymentDoc?.createdAt || allocationDoc?.createdAt || null) || null,
    verificationNote,
    verificationReason: verificationNote,
  };
}

/**
 * Reconciles all payment allocations, `payments` table records, refund records,
 * and `preorder_events` for a single `preorder` document.
 */
export function reconcilePreorderPayments(params: {
  preorder: any;
  paymentAllocations: any[];
  payments: any[];
  refunds?: any[];
  events?: any[];
  salesOrdersMap?: Map<string, any>;
}): PreorderPaymentReconciliation {
  const { preorder, paymentAllocations, payments, refunds = [], events = [], salesOrdersMap } = params;
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

  // Index payments by id / orderId / txnid and by paymentReference
  const paymentsByCheckoutRef = new Map<string, any>();
  const paymentsByProviderRef = new Map<string, any>();
  const matchedPaymentDocs: any[] = [];

  for (const p of payments || []) {
    if (!p || typeof p !== 'object') continue;
    const keys = [p.id, p.orderId, p.txnid].map((k) => String(k || '').trim()).filter(Boolean);
    for (const k of keys) {
      paymentsByCheckoutRef.set(k, p);
    }
    const provRefs = [p.razorpayPaymentId, p.transactionReference, p.paymentReference, p.mihpayid]
      .map((k) => String(k || '').trim())
      .filter(Boolean);
    for (const r of provRefs) {
      paymentsByProviderRef.set(r, p);
    }

    const linksPreorder =
      (Array.isArray(p.preorderIds) && p.preorderIds.some((id: any) => String(id).trim() === preorderId)) ||
      String(p.orderPayload?.preorderId || '').trim() === preorderId ||
      String(p.orderPayload?.orderNumber || '').trim() === preorderId ||
      (Array.isArray(p.orderPayload?.products) &&
        p.orderPayload.products.some((prod: any) => String(prod?.preorderId || '').trim() === preorderId));

    if (linksPreorder) {
      matchedPaymentDocs.push(p);
    }
  }

  // Find all payment_allocations for this preorder
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

    if (hasPreorderId || matchesRef) {
      matchedAllocations.push(alloc);
    }
  }

  // Collect unique checkout references in chronological order
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
    if (ref) {
      checkoutRefSet.add(ref);
    }
  }
  if (preorder.checkoutReference) {
    checkoutRefSet.add(String(preorder.checkoutReference).trim());
  }
  if (preorder.balanceCheckoutReference) {
    checkoutRefSet.add(String(preorder.balanceCheckoutReference).trim());
  }

  const transactions: PaymentsTableTransactionSummary[] = [];
  const seenPaymentDocIds = new Set<string>();

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
      paymentDoc = paymentsByProviderRef.get(String(preorder.balancePaymentReference).trim()) || null;
    }

    const summary = evaluatePaymentTransactionForPreorder(
      preorder,
      paymentDoc,
      allocDoc,
      checkoutRef
    );

    const dedupeKey = summary.paymentDocId || summary.checkoutReference;
    if (dedupeKey && seenPaymentDocIds.has(dedupeKey)) continue;
    if (dedupeKey) seenPaymentDocIds.add(dedupeKey);

    transactions.push(summary);
  }

  // Sort transactions chronologically (advance first, then balance)
  transactions.sort((a, b) => {
    if (a.paymentStage !== b.paymentStage) {
      if (a.paymentStage === 'advance') return -1;
      if (b.paymentStage === 'advance') return 1;
    }
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });

  // Compute advancePaid, subsequentVerifiedPaid, unverifiedOrPendingAmount
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

  // Check if the preorder doc claims a payment/advance that has no transaction at all
  const claimedPaidOnDoc =
    String(preorder.paymentStatus || '').toLowerCase() === 'paid'
      ? authoritativeTotalProductValue
      : roundCurrency(preorder.bookingAdvance || 0);

  const hasUnverifiedClaimedPayment =
    (claimedPaidOnDoc > verifiedGrossPaid + 0.01 && transactions.length === 0) ||
    unverifiedOrPendingAmount > 0;

  // Evaluate refunds & reversals
  const refundRecords: Array<{
    refundId: string;
    amount: number;
    reason: string;
    status: string;
    createdAt: string;
  }> = [];

  let refundedAmount = 0;

  // 1. Check explicit order_refunds collection
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

  // 2. Check refunded / reversed transactions in payments table
  for (const tx of transactions) {
    if (tx.isRefunded || tx.isReversed) {
      const alreadyRecorded = refundRecords.some((r) => r.refundId === tx.paymentDocId);
      if (!alreadyRecorded && tx.allocatedAmount > 0) {
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

  // 3. Check explicit refund fields on preorder doc
  if (Number(preorder.refundedAmount || preorder.refundAmount || 0) > refundedAmount) {
    const docRefund = roundCurrency(preorder.refundedAmount ?? preorder.refundAmount ?? 0);
    refundedAmount = docRefund;
  }

  // 4. Check preorder_events for refund/reversal/dispute events
  const preorderEventsForBooking = (events || []).filter(
    (e: any) => String(e?.preorderId || '').trim() === preorderId
  );
  const hasRefundEvent = preorderEventsForBooking.some((e: any) =>
    /refund|reversed|reversal/i.test(String(e?.eventType || '') + ' ' + String(e?.paymentStatus || ''))
  );
  const hasDisputeEvent = preorderEventsForBooking.some((e: any) =>
    /disput|chargeback/i.test(String(e?.eventType || '') + ' ' + String(e?.paymentStatus || ''))
  );

  const rawPreorderPayStatus = String(preorder.paymentStatus || '').trim().toUpperCase();
  const rawBookingStatus = String(preorder.bookingStatus || preorder.status || '').trim().toUpperCase();

  const hasRefundOrReversal =
    refundedAmount > 0 ||
    REFUNDED_STATUSES.has(rawPreorderPayStatus) ||
    REVERSED_STATUSES.has(rawPreorderPayStatus) ||
    rawBookingStatus === 'REFUNDED' ||
    rawBookingStatus === 'REVERSED' ||
    transactions.some((t) => t.isRefunded || t.isReversed) ||
    hasRefundEvent;

  const hasDispute =
    DISPUTED_STATUSES.has(rawPreorderPayStatus) ||
    rawBookingStatus === 'DISPUTED' ||
     preorder.paymentDisputed === true ||
    transactions.some((t) => t.isDisputed) ||
    hasDisputeEvent;

  // If the whole booking is marked refunded/reversed but no numeric refund was recorded, treat net paid as 0
  if (
    (REFUNDED_STATUSES.has(rawPreorderPayStatus) ||
      REVERSED_STATUSES.has(rawPreorderPayStatus) ||
      rawBookingStatus === 'REFUNDED' ||
      rawBookingStatus === 'REVERSED') &&
    refundedAmount === 0 &&
    verifiedGrossPaid > 0
  ) {
    refundedAmount = verifiedGrossPaid;
  }

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

  // Check if processed
  const salesOrderId = String(preorder.salesOrderId || '').trim() || null;
  const isProcessed = Boolean(
    salesOrderId &&
      (String(preorder.processingStatus || '').toLowerCase() === 'processed' ||
        String(preorder.conversionStatus || '').toUpperCase() === 'CONVERTED' ||
        !salesOrdersMap ||
        salesOrdersMap.has(salesOrderId))
  );

  const isBookingCancelled = CANCELLED_BOOKING_STATUSES.has(rawBookingStatus);

  // Derive Payment Status label
  let derivedPaymentStatus: PreorderPaymentReconciliation['derivedPaymentStatus'] = 'Pending';
  if (hasDispute) {
    derivedPaymentStatus = 'Disputed';
  } else if (hasRefundOrReversal && verifiedNetPaid === 0) {
    derivedPaymentStatus = 'Refunded';
  } else if (rawPreorderPayStatus === 'FAILED') {
    derivedPaymentStatus = 'Failed';
  } else if (
    paymentsTableVerified &&
    verifiedNetPaid >= authoritativeTotalProductValue - 0.01 &&
    outstandingBalance === 0
  ) {
    derivedPaymentStatus = 'Fully Paid';
  } else if (verifiedNetPaid > 0 && verifiedNetPaid < authoritativeTotalProductValue - 0.01) {
    derivedPaymentStatus = 'Partially Paid';
  } else if (hasUnverifiedClaimedPayment) {
    derivedPaymentStatus = 'Unverified';
  } else {
    derivedPaymentStatus = 'Pending';
  }

  // Derive Processing Status label
  let derivedProcessingStatus: PreorderPaymentReconciliation['derivedProcessingStatus'] =
    'Awaiting Full Payment';
  if (isProcessed) {
    derivedProcessingStatus = 'Processed';
  } else if (isBookingCancelled) {
    derivedProcessingStatus = 'Cancelled';
  } else if (hasDispute) {
    derivedProcessingStatus = 'Disputed';
  } else if (hasRefundOrReversal && verifiedNetPaid < authoritativeTotalProductValue - 0.01) {
    derivedProcessingStatus = 'Refunded';
  } else if (
    paymentsTableVerified &&
    verifiedNetPaid >= authoritativeTotalProductValue - 0.01 &&
    outstandingBalance === 0
  ) {
    derivedProcessingStatus = 'Eligible for Conversion';
  } else if (hasUnverifiedClaimedPayment) {
    derivedProcessingStatus = 'Awaiting Payment Verification';
  } else {
    derivedProcessingStatus = 'Awaiting Full Payment';
  }

  // Determine strict server-side filter bucket (Section 3):
  // - PROCESSED: Successfully converted to a sales order; has an immutable sales-order reference.
  // - FULLY_PAID: Verified net payment received covers entire authoritative total product value, outstanding balance == 0, not processed.
  // - PARTIALLY_PAID: Verified net payment received > 0 and < authoritative total product value; not processed.
  // - OTHER: Pending (0 verified paid), cancelled, failed, refunded, disputed, etc. (included in ALL).
  let filterBucket: PreorderPaymentReconciliation['filterBucket'] = 'OTHER';
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

  return {
    preorderId,
    authoritativeTotalProductValue,
    unitOnlinePrice,
    originalOnlineUnitPrice: unitOnlinePrice,
    quantity,
    additionalCharges,
    advancePaid,
    subsequentVerifiedPaid,
    unverifiedOrPendingAmount,
    refundedAmount,
    verifiedGrossPaid,
    verifiedNetPaid,
    outstandingBalance,
    paymentsTableVerified,
    paymentsTableTransactionCount: transactions.length,
    verifiedTransactionCount,
    paymentsTableTransactions: transactions,
    transactions,
    refundRecords,
    hasRefundOrReversal,
    hasDispute,
    hasUnverifiedClaimedPayment,
    derivedPaymentStatus,
    derivedProcessingStatus,
    filterBucket,
  } as any;
}

/**
 * Evaluates authoritative conversion eligibility and reason codes (Section 5).
 */
export function evaluateConversionEligibility(params: {
  preorder: any;
  reconciliation: PreorderPaymentReconciliation;
  salesOrdersMap?: Map<string, any>;
}): PreorderConversionEligibility {
  const { preorder, reconciliation, salesOrdersMap } = params;
  const preorderId = String(preorder.preorderId || preorder.id || '').trim();
  const reasonCodes: PreorderConversionReasonCode[] = [];
  const reasons: string[] = [];

  const salesOrderId = String(preorder.salesOrderId || '').trim() || null;
  const existingSalesOrder =
    salesOrderId && salesOrdersMap ? salesOrdersMap.get(salesOrderId) : null;
  const salesOrderNumber =
    String(preorder.salesOrderNumber || existingSalesOrder?.orderNumber || '').trim() || null;

  // 1. Already processed check
  if (
    salesOrderId ||
    String(preorder.processingStatus || '').toLowerCase() === 'processed' ||
    String(preorder.conversionStatus || '').toUpperCase() === 'CONVERTED'
  ) {
    reasonCodes.push('ALREADY_PROCESSED');
    reasons.push(
      `Pre-order '${preorderId}' has already been converted to Sales Order '${salesOrderNumber || salesOrderId}'.`
    );
  }

  // 2. Booking status check (cancelled / invalidated / failed)
  const rawBookingStatus = String(preorder.bookingStatus || preorder.status || '')
    .trim()
    .toUpperCase();
  if (CANCELLED_BOOKING_STATUSES.has(rawBookingStatus)) {
    reasonCodes.push('BOOKING_CANCELLED');
    reasons.push(
      `Pre-order booking status is '${preorder.bookingStatus || preorder.status}', which is not eligible for fulfillment.`
    );
  }

  // 3. Product & quantity validity
  if (
    !preorder.productId ||
    reconciliation.quantity <= 0 ||
    reconciliation.authoritativeTotalProductValue <= 0
  ) {
    reasonCodes.push('PRODUCT_INVALID');
    reasons.push(
      'Pre-order is missing a valid product snapshot, positive quantity, or positive authoritative product value.'
    );
  }

  // 4. Dispute check
  if (reconciliation.hasDispute) {
    reasonCodes.push('PAYMENT_DISPUTED');
    reasons.push('Pre-order has a disputed or chargeback payment record and cannot be converted.');
  }

  // 5. Reversal / Refund check
  if (reconciliation.hasRefundOrReversal) {
    const isReversed = reconciliation.paymentsTableTransactions.some((t) => t.isReversed);
    reasonCodes.push(isReversed ? 'PAYMENT_REVERSED' : 'PAYMENT_REFUNDED');
    reasons.push(
      isReversed
        ? 'One or more pre-order payments were reversed/voided.'
        : `Pre-order has refunded payments (₹${reconciliation.refundedAmount}) and does not have full verified net payment.`
    );
  }

  // 6. Payments table verification check
  if (!reconciliation.paymentsTableVerified) {
    if (
      reconciliation.hasUnverifiedClaimedPayment ||
      reconciliation.paymentsTableTransactions.some(
        (t) => !t.verifiedInPaymentsTable && !t.isRefunded && !t.isReversed
      ) ||
      (String(preorder.paymentStatus || '').toLowerCase() === 'paid' &&
        reconciliation.verifiedTransactionCount === 0)
    ) {
      reasonCodes.push('PAYMENT_UNVERIFIED');
      reasons.push(
        'One or more payment allocations could not be verified as settled in the authoritative payments table.'
      );
    }
  }

  // 7. Full payment & zero outstanding balance check
  if (
    reconciliation.verifiedNetPaid < reconciliation.authoritativeTotalProductValue - 0.01 ||
    reconciliation.outstandingBalance > 0.01
  ) {
    reasonCodes.push('NOT_FULLY_PAID');
    reasons.push(
      `Verified net paid amount (₹${reconciliation.verifiedNetPaid.toFixed(2)}) is less than the authoritative total product value (₹${reconciliation.authoritativeTotalProductValue.toFixed(2)}). Outstanding balance: ₹${reconciliation.outstandingBalance.toFixed(2)}.`
    );
  }

  const eligible =
    reasonCodes.length === 0 &&
    reconciliation.paymentsTableVerified &&
    reconciliation.verifiedNetPaid >= reconciliation.authoritativeTotalProductValue - 0.01 &&
    reconciliation.outstandingBalance === 0;

  if (eligible) {
    reasonCodes.push('ELIGIBLE');
    reasons.push(
      `Full product value (₹${reconciliation.authoritativeTotalProductValue.toFixed(2)}) is verified in the payments table with ₹0.00 outstanding balance.`
    );
  }

  return {
    preorderId,
    eligible,
    advisoryOnly: true,
    reasonCodes,
    reasons,
    salesOrderId,
    salesOrderNumber,
    paymentReconciliation: reconciliation,
  };
}

/**
 * Builds a normalized `PreorderGridRow` for the Admin Grid & Details API.
 */
export function buildPreorderGridRow(params: {
  preorder: any;
  reconciliation: PreorderPaymentReconciliation;
  eligibility: PreorderConversionEligibility;
  customer?: any;
  product?: any;
  salesOrder?: any;
  actorRole: UserRole;
  canConvert: boolean;
}): PreorderGridRow {
  const { preorder, reconciliation, eligibility, customer, product, salesOrder, actorRole, canConvert } = params;
  const preorderId = String(preorder.preorderId || preorder.id || '').trim();

  const rawCustomerName = String(
    preorder.customerDisplayName ||
      preorder.customerName ||
      customer?.name ||
      reconciliation.paymentsTableTransactions[0]?.checkoutReference ||
      'Customer'
  ).trim();
  const rawMobile = String(
    preorder.customerMobile ||
      customer?.mobileNumberpluscode ||
      customer?.mobileNumber ||
      customer?.phone ||
      ''
  ).trim();
  const rawEmail = String(preorder.customerEmail || customer?.email || '').trim();

  const salesOrderId = String(preorder.salesOrderId || salesOrder?.id || '').trim() || null;
  const salesOrderNumber =
    String(preorder.salesOrderNumber || salesOrder?.orderNumber || salesOrderId || '').trim() || null;

  return {
    id: preorderId,
    preorderId,
    bookingReference: preorderId,
    bookingDateTime: normalizeTimestampString(preorder.createdAt),
    customerId: String(preorder.customerId || customer?.id || ''),
    userId: String(preorder.userId || customer?.authUid || ''),
    customerName: rawCustomerName,
    customerMobile: maskSensitiveValue(rawMobile, 'phone', actorRole),
    customerEmail: maskSensitiveValue(rawEmail, 'email', actorRole),
    productId: String(preorder.productId || product?.id || ''),
    productName: String(
      preorder.productNameSnapshot || preorder.productName || product?.name || 'Product'
    ),
    sku: String(preorder.skuSnapshot || preorder.sku || product?.sku || product?.hsnCode || ''),
    packingSize: String(preorder.packingSizeSnapshot || product?.packingSize || ''),
    imageUrl: String(preorder.imageUrlSnapshot || product?.imageUrl || ''),
    quantity: reconciliation.quantity,
    onlinePriceSnapshot: reconciliation.unitOnlinePrice,
    totalProductValue: reconciliation.authoritativeTotalProductValue,
    advancePaid: reconciliation.advancePaid,
    subsequentVerifiedPaid: reconciliation.subsequentVerifiedPaid,
    refundedAmount: reconciliation.refundedAmount,
    verifiedAmountPaid: reconciliation.verifiedNetPaid,
    outstandingBalance: reconciliation.outstandingBalance,
    currency: String(preorder.currency || 'INR'),
    paymentType: String(preorder.paymentType || 'partial'),
    paymentTypeLabel: String(
      preorder.paymentTypeLabel ||
        (String(preorder.paymentType || '').toLowerCase() === 'full'
          ? 'Full Payment'
          : 'Partial Payment')
    ),
    paymentStatus: reconciliation.derivedPaymentStatus,
    rawPaymentStatus: String(preorder.paymentStatus || ''),
    bookingStatus: String(preorder.bookingStatus || preorder.status || 'confirmed'),
    processingStatus: reconciliation.derivedProcessingStatus,
    requestedDeliveryDate: String(preorder.expectedDeliveryDate || ''),
    preferredCourier: String(preorder.preferredCourierAgent || ''),
    giftWrap: Boolean(preorder.giftWrap),
    specialSuggestion: String(preorder.specialSuggestion || ''),
    checkoutReference: String(preorder.checkoutReference || ''),
    balanceCheckoutReference: String(preorder.balanceCheckoutReference || ''),
    paymentReference: String(preorder.paymentReference || ''),
    balancePaymentReference: String(preorder.balancePaymentReference || ''),
    salesOrderId,
    salesOrderNumber,
    processedAt: normalizeTimestampString(preorder.processedAt) || null,
    processedBy: preorder.processedBy ? String(preorder.processedBy) : null,
    lastUpdated: normalizeTimestampString(preorder.updatedAt || preorder.createdAt),
    paymentsTableVerified: reconciliation.paymentsTableVerified,
    paymentsVerificationStatus:
      reconciliation.hasDispute || reconciliation.hasRefundOrReversal
        ? 'REFUNDED_OR_DISPUTED'
        : reconciliation.paymentsTableVerified
        ? 'VERIFIED_FULL'
        : reconciliation.verifiedNetPaid > 0
        ? 'VERIFIED_PARTIAL'
        : 'UNVERIFIED',
    paymentsTableTransactions: reconciliation.paymentsTableTransactions,
    paymentsTransactions: reconciliation.paymentsTableTransactions,
    filterBucket: reconciliation.filterBucket,
    derivedFilterBucket: reconciliation.filterBucket,
    customerPhone: maskSensitiveValue(rawMobile, 'phone', actorRole),
    productSku: String(preorder.skuSnapshot || preorder.sku || product?.sku || product?.hsnCode || ''),
    originalUnitPrice: reconciliation.unitOnlinePrice,
    convertedAt: normalizeTimestampString(preorder.processedAt) || null,
    convertedBy: preorder.processedBy ? String(preorder.processedBy) : null,
    canViewDetails: true,
    canConvertToSalesOrder: Boolean(eligibility.eligible && canConvert),
    conversionEligibility: {
      eligible: eligibility.eligible,
      reasonCodes: eligibility.reasonCodes,
      reasons: eligibility.reasons,
      authoritativeTotalProductValue: reconciliation.authoritativeTotalProductValue,
    } as any,
  } as any;
}

/**
 * Builds the validated `sales_orders` payload from an authoritative `preorder` record
 * and its verified payment transactions without re-charging the customer or duplicating tax/capture.
 */
export function buildSalesOrderFromPreorder(params: {
  preorder: any;
  reconciliation: PreorderPaymentReconciliation;
  customer?: any;
  product?: any;
  primaryPaymentDoc?: any;
  existingSalesOrderCount: number;
  actor: AuthenticatedAdminActor;
  nowIso: string;
}): any {
  const {
    preorder,
    reconciliation,
    customer,
    product,
    primaryPaymentDoc,
    existingSalesOrderCount,
    actor,
    nowIso,
  } = params;

  const preorderId = String(preorder.preorderId || preorder.id || '').trim();
  const salesOrderId = `ORD-PO-${preorderId}`;
  const year = new Date(nowIso).getUTCFullYear();
  const seq = String(existingSalesOrderCount + 1).padStart(4, '0');
  const orderNumber = `SO-${year}-${seq}`;

  const quantity = reconciliation.quantity;
  const unitPrice = reconciliation.unitOnlinePrice;
  const totalValue = reconciliation.authoritativeTotalProductValue;
  const gstRate = Number(preorder.gstPercentageSnapshot ?? product?.gstPercentage ?? 0) || 0;
  const hsnCode = String(preorder.skuSnapshot || product?.hsnCode || product?.sku || '').trim();

  // Standard GST-inclusive calculation used across sales_orders in Violeafy
  const taxableValue =
    gstRate > 0 ? roundCurrency(totalValue / (1 + gstRate / 100)) : totalValue;
  const gstAmount = roundCurrency(totalValue - taxableValue);

  const shippingFromPayment = primaryPaymentDoc?.orderPayload?.shippingAddress || null;
  const customerId = String(
    preorder.customerId || customer?.id || customer?.customerId || preorder.userId || ''
  ).trim();
  const customerName = String(
    customer?.name ||
      preorder.customerDisplayName ||
      primaryPaymentDoc?.customerName ||
      shippingFromPayment?.name ||
      'Customer'
  ).trim();
  const customerEmail = String(
    customer?.email ||
      primaryPaymentDoc?.customerEmail ||
      shippingFromPayment?.email ||
      ''
  ).trim();
  const customerMobile = String(
    customer?.mobileNumberpluscode ||
      customer?.mobileNumber ||
      primaryPaymentDoc?.customerMobile ||
      primaryPaymentDoc?.phone ||
      shippingFromPayment?.mobileNumber ||
      ''
  ).trim();

  const shippingAddress = shippingFromPayment || {
    id: `addr_po_${preorderId}`,
    customerId,
    userId: String(preorder.userId || customer?.authUid || customerId),
    name: customerName,
    mobileNumber: customerMobile,
    email: customerEmail,
    addressLine: String(customer?.address || primaryPaymentDoc?.deliveryAddress || ''),
    city: String(customer?.district || ''),
    district: String(customer?.district || ''),
    state: String(customer?.state || 'Kerala'),
    pincode: String(customer?.pincode || ''),
    isDefault: true,
  };

  const productLine = {
    orderItemId: `item_${preorder.productId || '0'}`,
    productId: String(preorder.productId || product?.id || ''),
    productName: String(preorder.productNameSnapshot || product?.name || 'Product'),
    imageUrl: String(preorder.imageUrlSnapshot || product?.imageUrl || ''),
    quantity,
    price: unitPrice,
    unitPrice,
    gstPercentage: gstRate,
    hsnCode,
    taxableValue,
    gstAmount,
    gstInclusiveAmount: totalValue,
    category: String(product?.category || (Array.isArray(product?.categories) ? product.categories[0] : '') || 'Pre-Order'),
    categories: Array.isArray(product?.categories)
      ? product.categories
      : product?.category
      ? [product.category]
      : ['Pre-Order'],
    brand: String(product?.brand || 'Vio Nature Science'),
    brandOwner: String(product?.brandOwner || 'Vio Nature Science'),
    unit: String(product?.unit || preorder.packingSizeSnapshot || 'Nos'),
    packingSize: String(preorder.packingSizeSnapshot || product?.packingSize || ''),
    giftWrap: Boolean(preorder.giftWrap),
    specialSuggestion: String(preorder.specialSuggestion || ''),
    isPreorderConverted: true,
    sourcePreorderId: preorderId,
  };

  const hsnSummaryEntry = {
    hsnCode: hsnCode || 'NA',
    gstRate,
    taxableValue,
    gstAmount,
    totalAmount: totalValue,
  };

  const checkoutReferences = reconciliation.paymentsTableTransactions
    .map((t) => t.checkoutReference)
    .filter(Boolean);
  const paymentReferences = reconciliation.paymentsTableTransactions
    .map((t) => t.paymentReference)
    .filter(Boolean);
  const paymentDocIds = reconciliation.paymentsTableTransactions
    .map((t) => t.paymentDocId)
    .filter(Boolean);

  const primaryGateway =
    reconciliation.paymentsTableTransactions[0]?.gateway ||
    primaryPaymentDoc?.paymentGateway ||
    'Razorpay';

  return {
    id: salesOrderId,
    orderNumber,
    sourceType: 'PREORDER_CONVERSION',
    sourcePreorderId: preorderId,
    preorderBookingReference: preorderId,
    preorderCheckoutReferences: checkoutReferences,
    preorderPaymentReferences: paymentReferences,
    preorderPaymentDocIds: paymentDocIds,
    customerId,
    userId: String(preorder.userId || customer?.authUid || ''),
    customerName,
    customerEmail,
    customerMobile,
    contactNo: customerMobile,
    customerCompany: String(customer?.company || ''),
    shippingAddress,
    products: [productLine],
    subtotal: totalValue,
    deliveryFee: 0,
    courierCharges: 0,
    salesTotal: totalValue,
    totalAmount: totalValue,
    totalValue,
    totalTaxableValue: taxableValue,
    totalGstAmount: gstAmount,
    hsnGstSummary: [hsnSummaryEntry],
    gstByHsn: [hsnSummaryEntry],
    paymentMethod: primaryGateway,
    paymentStatus: 'Paid',
    paymentAlreadyCaptured: true,
    verifiedAmountPaid: reconciliation.verifiedNetPaid,
    outstandingBalance: 0,
    orderStatus: 'Confirmed',
    deliveryStatus: 'Pending',
    salesPlatform: String(primaryPaymentDoc?.salesPlatform || 'webleafyearth'),
    assignedTo: 'Logistics',
    courierAgency: String(preorder.preferredCourierAgent || 'DTDC'),
    expectedDeliveryDate: String(preorder.expectedDeliveryDate || ''),
    pickupDate: String(preorder.expectedDeliveryDate || nowIso.split('T')[0]),
    invoiceId: String(
      preorder.invoiceId ||
        `INV-${nowIso.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    ),
    invoiceDate: nowIso,
    unit: productLine.unit,
    packingSize: productLine.packingSize,
    brandOwner: productLine.brandOwner,
    giftWrap: Boolean(preorder.giftWrap),
    specialSuggestion: String(preorder.specialSuggestion || ''),
    convertedFromPreorderAt: nowIso,
    convertedByAdminId: actor.uid,
    convertedByAdminEmail: actor.email,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

// ---------------------------------------------------------------------------
// PreorderManagementService Class
// ---------------------------------------------------------------------------

export class PreorderManagementService {
  constructor(
    private deps: {
      db: Firestore;
      auth: Auth;
      onSalesOrderCreated?: (salesOrderId: string) => Promise<void>;
    }
  ) {}

  private async getCollectionDocs(collectionName: string): Promise<any[]> {
    const snap = await this.deps.db.collection(collectionName).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Resolves the authenticated administrator's role and granular permissions
   * from Firestore (`users` and `permissions` collections).
   */
  async resolveAuthenticatedAdmin(req: express.Request): Promise<AuthenticatedAdminActor> {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
      throw new PreorderHttpError(
        401,
        'UNAUTHENTICATED',
        'Authentication required. Provide a valid Bearer ID token.'
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new PreorderHttpError(401, 'UNAUTHENTICATED', 'Missing Bearer token.');
    }

    let decoded: { uid: string; email?: string; name?: string; admin?: boolean };
    try {
      decoded = await this.deps.auth.verifyIdToken(token);
    } catch {
      throw new PreorderHttpError(
        401,
        'UNAUTHENTICATED',
        'Invalid or expired Firebase authentication token.'
      );
    }

    const [usersDocs, permDocs] = await Promise.all([
      this.getCollectionDocs(USERS_COLLECTION).catch(() => []),
      this.getCollectionDocs(PERMISSIONS_COLLECTION).catch(() => []),
    ]);

    const emailLower = String(decoded.email || '').trim().toLowerCase();
    const matchedUser = usersDocs.find(
      (u: any) =>
        String(u.id || '').trim() === decoded.uid ||
        (emailLower && String(u.email || '').trim().toLowerCase() === emailLower)
    );

    // If users collection is populated and this user is neither in `users` nor has custom claim `admin: true`,
    // check if they are an unprivileged customer account.
    if (usersDocs.length > 0 && !matchedUser && decoded.admin !== true) {
      throw new PreorderHttpError(
        403,
        'FORBIDDEN',
        'Access denied. Account is not registered as an administrative user.'
      );
    }

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
      uid: decoded.uid,
      email: String(decoded.email || matchedUser?.email || ''),
      name: String(matchedUser?.name || decoded.name || decoded.email || decoded.uid),
      role,
      canReadPreorders,
      canConvertPreorders,
    };
  }

  /**
   * Appends an audit event to `preorder_events`.
   */
  async appendPreorderEvent(event: {
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
  }): Promise<any> {
    const eventId = `poe_${crypto.randomBytes(12).toString('hex')}`;
    const occurredAt = new Date().toISOString();
    const payload: Record<string, any> = {
      eventId,
      preorderId: event.preorderId,
      actorId: event.actorId,
      actorEmail: event.actorEmail || '',
      actorRole: event.actorRole,
      eventType: event.eventType,
      oldStatus: event.oldStatus ?? null,
      newStatus: event.newStatus ?? null,
      paymentStatus: event.paymentStatus || '',
      conversionStatus: event.conversionStatus || '',
      salesOrderId: event.salesOrderId || null,
      salesOrderNumber: event.salesOrderNumber || null,
      reasonCodes: event.reasonCodes || [],
      message: event.message || '',
      ...(event.verifiedNetPaid !== undefined ? { verifiedNetPaid: event.verifiedNetPaid } : {}),
      ...(event.outstandingBalance !== undefined
        ? { outstandingBalance: event.outstandingBalance }
        : {}),
      ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {}),
      occurredAt,
    };

    await this.deps.db.collection(PREORDER_EVENTS_COLLECTION).doc(eventId).set(payload);
    return payload;
  }

  /**
   * Lists pre-orders with server-side search, filter, sort, and pagination (Section 3 & 7).
   */
  async listPreorders(
    actor: AuthenticatedAdminActor,
    query: {
      status?: unknown;
      search?: unknown;
      sortBy?: unknown;
      sortOrder?: unknown;
      page?: unknown;
      limit?: unknown;
      cursor?: unknown;
    }
  ): Promise<{
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
  }> {
    if (!actor.canReadPreorders) {
      throw new PreorderHttpError(
        403,
        'FORBIDDEN',
        'Your role does not have permission to view Pre-Order Management.'
      );
    }

    const filterStatus = parsePreorderFilterStatus(query.status);

    // Validate page size & page number
    const rawLimit = query.limit !== undefined && query.limit !== '' ? Number(query.limit) : 20;
    if (!Number.isFinite(rawLimit) || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
      throw new PreorderHttpError(
        400,
        'INVALID_PAGE_SIZE',
        `Invalid page limit '${String(query.limit)}'. Page size must be an integer between 1 and 100.`
      );
    }
    const limit = rawLimit;

    const rawPage = query.page !== undefined && query.page !== '' ? Number(query.page) : 1;
    if (!Number.isFinite(rawPage) || !Number.isInteger(rawPage) || rawPage < 1) {
      throw new PreorderHttpError(
        400,
        'INVALID_PAGE_SIZE',
        `Invalid page number '${String(query.page)}'. Page must be a positive integer.`
      );
    }
    const page = rawPage;

    const allowedSortFields = new Set([
      'createdAt',
      'updatedAt',
      'totalProductValue',
      'verifiedAmountPaid',
      'outstandingBalance',
      'expectedDeliveryDate',
      'bookingReference',
    ]);
    const sortBy = query.sortBy ? String(query.sortBy).trim() : 'createdAt';
    if (!allowedSortFields.has(sortBy)) {
      throw new PreorderHttpError(
        400,
        'INVALID_SORT',
        `Invalid sortBy field '${sortBy}'. Allowed: ${Array.from(allowedSortFields).join(', ')}.`
      );
    }

    const rawSortOrder = query.sortOrder ? String(query.sortOrder).trim().toLowerCase() : 'desc';
    if (rawSortOrder !== 'asc' && rawSortOrder !== 'desc') {
      throw new PreorderHttpError(
        400,
        'INVALID_SORT',
        `Invalid sortOrder '${rawSortOrder}'. Allowed: asc, desc.`
      );
    }
    const sortOrder: 'asc' | 'desc' = rawSortOrder;
    const search = String(query.search || '').trim();
    const searchLower = search.toLowerCase();

    const [preorders, paymentAllocations, payments, refunds, events, customers, products, salesOrders] =
      await Promise.all([
        this.getCollectionDocs(PREORDERS_COLLECTION),
        this.getCollectionDocs(PAYMENT_ALLOCATIONS_COLLECTION),
        this.getCollectionDocs(PAYMENTS_COLLECTION),
        this.getCollectionDocs(ORDER_REFUNDS_COLLECTION).catch(() => []),
        this.getCollectionDocs(PREORDER_EVENTS_COLLECTION).catch(() => []),
        this.getCollectionDocs(CUSTOMERS_COLLECTION).catch(() => []),
        this.getCollectionDocs(PRODUCTS_COLLECTION).catch(() => []),
        this.getCollectionDocs(SALES_ORDERS_COLLECTION).catch(() => []),
      ]);

    const customersMap = new Map<string, any>();
    for (const c of customers) {
      if (c.id) customersMap.set(String(c.id), c);
      if (c.customerId) customersMap.set(String(c.customerId), c);
      if (c.authUid) customersMap.set(String(c.authUid), c);
    }

    const productsMap = new Map<string, any>();
    for (const p of products) {
      if (p.id) productsMap.set(String(p.id), p);
    }

    const salesOrdersMap = new Map<string, any>();
    for (const so of salesOrders) {
      if (so.id) salesOrdersMap.set(String(so.id), so);
      if (so.orderNumber) salesOrdersMap.set(String(so.orderNumber), so);
    }

    const allRows: PreorderGridRow[] = preorders.map((preorder) => {
      const reconciliation = reconcilePreorderPayments({
        preorder,
        paymentAllocations,
        payments,
        refunds,
        events,
        salesOrdersMap,
      });
      const eligibility = evaluateConversionEligibility({
        preorder,
        reconciliation,
        salesOrdersMap,
      });
      const customer =
        customersMap.get(String(preorder.customerId || '')) ||
        customersMap.get(String(preorder.userId || ''));
      const product = productsMap.get(String(preorder.productId || ''));
      const salesOrder = preorder.salesOrderId
        ? salesOrdersMap.get(String(preorder.salesOrderId))
        : undefined;

      return buildPreorderGridRow({
        preorder,
        reconciliation,
        eligibility,
        customer,
        product,
        salesOrder,
        actorRole: actor.role,
        canConvert: actor.canConvertPreorders,
      });
    });

    // Server-side search across booking ref, customer name/ID, product name/SKU, checkout/payment ref, sales-order ref
    const searchFiltered = allRows.filter((row) => {
      if (!searchLower) return true;
      const haystacks = [
        row.bookingReference,
        row.preorderId,
        row.customerName,
        row.customerId,
        row.userId,
        row.customerMobile,
        row.productName,
        row.sku,
        row.productId,
        row.checkoutReference,
        row.balanceCheckoutReference,
        row.paymentReference,
        row.balancePaymentReference,
        row.salesOrderId || '',
        row.salesOrderNumber || '',
        ...row.paymentsTableTransactions.flatMap((t) => [
          t.paymentDocId,
          t.txnid,
          t.checkoutReference,
          t.paymentReference,
          t.gatewayOrderId,
        ]),
      ];
      return haystacks.some((val) => String(val || '').toLowerCase().includes(searchLower));
    });

    // Compute counts across all 4 filter tabs (post-search)
    const counts = {
      ALL: searchFiltered.length,
      PARTIALLY_PAID: searchFiltered.filter((r) => r.filterBucket === 'PARTIALLY_PAID').length,
      FULLY_PAID: searchFiltered.filter((r) => r.filterBucket === 'FULLY_PAID').length,
      PROCESSED: searchFiltered.filter((r) => r.filterBucket === 'PROCESSED').length,
    };

    // Apply server-side status filter
    const statusFiltered = searchFiltered.filter((row) => {
      if (filterStatus === 'ALL') return true;
      return row.filterBucket === filterStatus;
    });

    // Apply server-side sorting (newest first by default)
    statusFiltered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'totalProductValue') {
        cmp = a.totalProductValue - b.totalProductValue;
      } else if (sortBy === 'verifiedAmountPaid') {
        cmp = a.verifiedAmountPaid - b.verifiedAmountPaid;
      } else if (sortBy === 'outstandingBalance') {
        cmp = a.outstandingBalance - b.outstandingBalance;
      } else if (sortBy === 'expectedDeliveryDate') {
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
      if (cmp === 0) {
        cmp = String(a.preorderId).localeCompare(String(b.preorderId));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Apply cursor or page pagination
    let startIndex = (page - 1) * limit;
    if (query.cursor && String(query.cursor).trim()) {
      const cursorStr = String(query.cursor).trim();
      const cursorIdx = statusFiltered.findIndex((r) => r.preorderId === cursorStr);
      if (cursorIdx >= 0) {
        startIndex = cursorIdx + 1;
      }
    }

    const totalRecords = statusFiltered.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const records = statusFiltered.slice(startIndex, startIndex + limit);
    const hasNext = startIndex + limit < totalRecords;
    const nextCursor = hasNext && records.length > 0 ? records[records.length - 1].preorderId : null;

    return {
      records,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasPrevious: page > 1,
        hasNext,
        nextCursor,
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

  /**
   * Retrieves complete authorized booking detail, product & customer snapshots,
   * verified `payments` table breakdown, conversion eligibility, and chronological events (Section 4).
   */
  async getPreorderDetails(
    actor: AuthenticatedAdminActor,
    rawId: unknown
  ): Promise<{
    preorder: PreorderGridRow;
    snapshots: {
      product: Record<string, any>;
      customer: Record<string, any>;
    };
    paymentSummary: PreorderPaymentReconciliation;
    conversionEligibility: PreorderConversionEligibility;
    linkedSalesOrder: Record<string, any> | null;
    events: any[];
  }> {
    if (!actor.canReadPreorders) {
      throw new PreorderHttpError(
        403,
        'FORBIDDEN',
        'Your role does not have permission to view pre-order details.'
      );
    }

    const preorderId = validatePreorderIdParam(rawId);
    const preorderSnap = await this.deps.db.collection(PREORDERS_COLLECTION).doc(preorderId).get();
    if (!preorderSnap.exists) {
      throw new PreorderHttpError(404, 'NOT_FOUND', `Pre-order '${preorderId}' not found.`);
    }
    const preorder: any = { id: preorderSnap.id, ...preorderSnap.data() };

    const [paymentAllocations, payments, refunds, allEvents, customers, products, salesOrders] =
      await Promise.all([
        this.getCollectionDocs(PAYMENT_ALLOCATIONS_COLLECTION),
        this.getCollectionDocs(PAYMENTS_COLLECTION),
        this.getCollectionDocs(ORDER_REFUNDS_COLLECTION).catch(() => []),
        this.getCollectionDocs(PREORDER_EVENTS_COLLECTION).catch(() => []),
        this.getCollectionDocs(CUSTOMERS_COLLECTION).catch(() => []),
        this.getCollectionDocs(PRODUCTS_COLLECTION).catch(() => []),
        this.getCollectionDocs(SALES_ORDERS_COLLECTION).catch(() => []),
      ]);

    const salesOrdersMap = new Map<string, any>();
    for (const so of salesOrders) {
      if (so.id) salesOrdersMap.set(String(so.id), so);
    }

    const reconciliation = reconcilePreorderPayments({
      preorder,
      paymentAllocations,
      payments,
      refunds,
      events: allEvents,
      salesOrdersMap,
    });

    const eligibility = evaluateConversionEligibility({
      preorder,
      reconciliation,
      salesOrdersMap,
    });

    const customer = customers.find(
      (c: any) =>
        String(c.id) === String(preorder.customerId) ||
        String(c.customerId) === String(preorder.customerId) ||
        String(c.authUid) === String(preorder.userId)
    );
    const product = products.find((p: any) => String(p.id) === String(preorder.productId));
    const linkedSalesOrder = preorder.salesOrderId
      ? salesOrdersMap.get(String(preorder.salesOrderId)) || null
      : null;

    const row = buildPreorderGridRow({
      preorder,
      reconciliation,
      eligibility,
      customer,
      product,
      salesOrder: linkedSalesOrder,
      actorRole: actor.role,
      canConvert: actor.canConvertPreorders,
    });

    const events = allEvents
      .filter((e: any) => String(e?.preorderId || '').trim() === preorderId)
      .map((e: any) => stripSensitiveSecrets(e))
      .sort((a: any, b: any) =>
        normalizeTimestampString(a.occurredAt || a.createdAt).localeCompare(
          normalizeTimestampString(b.occurredAt || b.createdAt)
        )
      );

    return {
      preorder: row,
      snapshots: {
        product: {
          productId: row.productId,
          productName: row.productName,
          productNameSnapshot: row.productName,
          sku: row.sku,
          skuSnapshot: row.sku,
          packingSize: row.packingSize,
          packingSizeSnapshot: row.packingSize,
          imageUrl: row.imageUrl,
          imageUrlSnapshot: row.imageUrl,
          originalOnlineUnitPrice: row.onlinePriceSnapshot,
          onlinePriceSnapshot: row.onlinePriceSnapshot,
          mrpSnapshot: Number(preorder.mrpSnapshot ?? product?.mrp ?? row.onlinePriceSnapshot),
          gstRate: Number(
            preorder.gstPercentageSnapshot ?? product?.gstPercentage ?? product?.gstRate ?? 0
          ),
          gstPercentageSnapshot: Number(
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
          userId: row.userId,
          customerName: row.customerName,
          customerDisplayName: row.customerName,
          customerPhone: row.customerMobile,
          customerMobile: row.customerMobile,
          customerEmail: row.customerEmail,
          shippingAddress:
            actor.role === 'Admin' || actor.role === 'Sales' || actor.role === 'Support'
              ? String(customer?.address || '')
              : '***',
          address:
            actor.role === 'Admin' || actor.role === 'Sales' || actor.role === 'Support'
              ? String(customer?.address || '')
              : '***',
          district: String(customer?.district || ''),
          state: String(customer?.state || ''),
          pincode: String(customer?.pincode || ''),
        },
      },
      paymentSummary: reconciliation,
      conversionEligibility: eligibility,
      linkedSalesOrder: linkedSalesOrder ? stripSensitiveSecrets(linkedSalesOrder) : null,
      events,
    };
  }

  /**
   * Retrieves paginated audit events (`preorder_events`) in chronological order.
   */
  async getPreorderEvents(
    actor: AuthenticatedAdminActor,
    rawId: unknown,
    query: { page?: unknown; limit?: unknown; order?: unknown }
  ): Promise<{
    preorderId: string;
    events: any[];
    pagination: {
      page: number;
      limit: number;
      totalRecords: number;
      totalPages: number;
      hasPrevious: boolean;
      hasNext: boolean;
    };
  }> {
    if (!actor.canReadPreorders) {
      throw new PreorderHttpError(
        403,
        'FORBIDDEN',
        'Your role does not have permission to view pre-order events.'
      );
    }

    const preorderId = validatePreorderIdParam(rawId);
    const preorderSnap = await this.deps.db.collection(PREORDERS_COLLECTION).doc(preorderId).get();
    if (!preorderSnap.exists) {
      throw new PreorderHttpError(404, 'NOT_FOUND', `Pre-order '${preorderId}' not found.`);
    }

    const rawLimit = query.limit !== undefined && query.limit !== '' ? Number(query.limit) : 50;
    if (!Number.isFinite(rawLimit) || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
      throw new PreorderHttpError(
        400,
        'INVALID_PAGE_SIZE',
        'Events limit must be an integer between 1 and 100.'
      );
    }
    const rawPage = query.page !== undefined && query.page !== '' ? Number(query.page) : 1;
    if (!Number.isFinite(rawPage) || !Number.isInteger(rawPage) || rawPage < 1) {
      throw new PreorderHttpError(
        400,
        'INVALID_PAGE_SIZE',
        'Events page must be a positive integer.'
      );
    }

    const order = String(query.order || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const allEvents = await this.getCollectionDocs(PREORDER_EVENTS_COLLECTION).catch(() => []);
    const matching = allEvents
      .filter((e: any) => String(e?.preorderId || '').trim() === preorderId)
      .map((e: any) => stripSensitiveSecrets(e))
      .sort((a: any, b: any) => {
        const cmp = normalizeTimestampString(a.occurredAt || a.createdAt).localeCompare(
          normalizeTimestampString(b.occurredAt || b.createdAt)
        );
        return order === 'asc' ? cmp : -cmp;
      });

    const totalRecords = matching.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / rawLimit));
    const startIndex = (rawPage - 1) * rawLimit;
    const events = matching.slice(startIndex, startIndex + rawLimit);

    return {
      preorderId,
      events,
      pagination: {
        page: rawPage,
        limit: rawLimit,
        totalRecords,
        totalPages,
        hasPrevious: rawPage > 1,
        hasNext: rawPage < totalPages,
      },
    };
  }

  /**
   * Returns authoritative conversion eligibility & reason codes (advisory endpoint).
   */
  async getConversionEligibility(
    actor: AuthenticatedAdminActor,
    rawId: unknown
  ): Promise<PreorderConversionEligibility> {
    const details = await this.getPreorderDetails(actor, rawId);
    return details.conversionEligibility;
  }

  /**
   * Executes an explicit, authorized, idempotent, atomic server-side conversion of a
   * Fully Paid pre-order into a `sales_orders` record (Sections 5, 6, 7, 8).
   */
  async convertToSalesOrder(
    actor: AuthenticatedAdminActor,
    rawId: unknown,
    body: unknown,
    headerIdempotencyKey?: string
  ): Promise<{
    preorderId: string;
    salesOrderId: string;
    salesOrderNumber: string;
    salesOrder: any;
    preorder: any;
    idempotentReplay: boolean;
    verifiedNetPaid: number;
    outstandingBalance: number;
  }> {
    if (!actor.canConvertPreorders) {
      throw new PreorderHttpError(
        403,
        'FORBIDDEN',
        'Your role does not have permission to convert pre-orders into sales orders.'
      );
    }

    const preorderId = validatePreorderIdParam(rawId);

    // Reject unknown or forbidden client-supplied authoritative fields (Section 7)
    const allowedBodyFields = new Set(['idempotencyKey', 'notes', 'bookingId', 'preorderId']);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const unknownKeys = Object.keys(body as Record<string, any>).filter(
        (k) => !allowedBodyFields.has(k)
      );
      if (unknownKeys.length > 0) {
        throw new PreorderHttpError(
          400,
          'UNKNOWN_FIELDS',
          `Unknown or forbidden fields in conversion request body: ${unknownKeys.join(', ')}. Client-supplied paymentStatus, salesTotal, or customerId are not accepted.`
        );
      }
      const bodyObj = body as Record<string, any>;
      if (bodyObj.bookingId && String(bodyObj.bookingId).trim() !== preorderId) {
        throw new PreorderHttpError(
          400,
          'INVALID_ID',
          'Body bookingId does not match URL pre-order ID.'
        );
      }
    }

    const idempotencyKey = String(
      (body as any)?.idempotencyKey || headerIdempotencyKey || ''
    ).trim();
    if (!idempotencyKey || idempotencyKey.length > 180 || /[\s\/\\]/.test(idempotencyKey)) {
      throw new PreorderHttpError(
        400,
        'MISSING_IDEMPOTENCY_KEY',
        'A valid idempotencyKey is required to convert a pre-order to a sales order.'
      );
    }

    // Namespaced idempotency key so it never collides with customer booking keys
    const adminIdemDocId = `admin_convert__${preorderId}__${actor.uid}__${idempotencyKey}`;
    const conversionLockDocId = `admin_convert_lock__${preorderId}`;

    // Append `preorder.conversion_requested` audit event first
    await this.appendPreorderEvent({
      preorderId,
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      eventType: 'preorder.conversion_requested',
      idempotencyKey,
      message: `Conversion to sales order requested by ${actor.email || actor.uid}`,
    });

    try {
      const txResult = await this.deps.db.runTransaction(async (transaction: Transaction) => {
        const preorderRef = this.deps.db.collection(PREORDERS_COLLECTION).doc(preorderId);
        const adminIdemRef = this.deps.db
          .collection(PREORDER_IDEMPOTENCY_COLLECTION)
          .doc(adminIdemDocId);
        const lockRef = this.deps.db
          .collection(PREORDER_IDEMPOTENCY_COLLECTION)
          .doc(conversionLockDocId);

        const [preorderSnap, adminIdemSnap, lockSnap] = await Promise.all([
          transaction.get(preorderRef),
          transaction.get(adminIdemRef),
          transaction.get(lockRef),
        ]);

        if (!preorderSnap.exists) {
          throw new PreorderHttpError(
            404,
            'NOT_FOUND',
            `Pre-order '${preorderId}' does not exist.`
          );
        }

        const preorderData: any = { id: preorderSnap.id, ...preorderSnap.data() };

        // 1. Check idempotent replay for this exact idempotency key
        if (adminIdemSnap.exists) {
          const idemData: any = adminIdemSnap.data() || {};
          if (idemData.salesOrderId) {
            const existingSoRef = this.deps.db
              .collection(SALES_ORDERS_COLLECTION)
              .doc(String(idemData.salesOrderId));
            const existingSoSnap = await transaction.get(existingSoRef);
            if (existingSoSnap.exists) {
              const soData: any = { id: existingSoSnap.id, ...existingSoSnap.data() };
              return {
                preorderId,
                salesOrderId: String(idemData.salesOrderId),
                salesOrderNumber: String(idemData.salesOrderNumber || soData.orderNumber || ''),
                salesOrder: soData,
                preorder: preorderData,
                idempotentReplay: true,
                verifiedNetPaid: Number(idemData.verifiedNetPaid ?? soData.totalValue ?? 0),
                outstandingBalance: 0,
              };
            }
          }
        }

        // 2. Check if already converted by another request or lock
        const existingSalesOrderId = String(
          preorderData.salesOrderId || (lockSnap.exists ? lockSnap.data()?.salesOrderId : '') || ''
        ).trim();

        if (
          existingSalesOrderId ||
          String(preorderData.processingStatus || '').toLowerCase() === 'processed' ||
          String(preorderData.conversionStatus || '').toUpperCase() === 'CONVERTED'
        ) {
          const lockKey = lockSnap.exists ? String(lockSnap.data()?.idempotencyKey || '') : '';
          // If same idempotencyKey won a concurrent race, return idempotent success
          if (lockKey && lockKey === idempotencyKey && existingSalesOrderId) {
            const existingSoRef = this.deps.db
              .collection(SALES_ORDERS_COLLECTION)
              .doc(existingSalesOrderId);
            const existingSoSnap = await transaction.get(existingSoRef);
            const soData: any = existingSoSnap.exists
              ? { id: existingSoSnap.id, ...existingSoSnap.data() }
              : { id: existingSalesOrderId };
            return {
              preorderId,
              salesOrderId: existingSalesOrderId,
              salesOrderNumber: String(
                preorderData.salesOrderNumber || soData.orderNumber || existingSalesOrderId
              ),
              salesOrder: soData,
              preorder: preorderData,
              idempotentReplay: true,
              verifiedNetPaid: Number(soData.totalValue || preorderData.totalProductValue || 0),
              outstandingBalance: 0,
            };
          }

          throw new PreorderHttpError(
            409,
            'ALREADY_PROCESSED',
            `Pre-order '${preorderId}' has already been converted to Sales Order '${preorderData.salesOrderNumber || existingSalesOrderId}'.`,
            {
              salesOrderId: existingSalesOrderId,
              salesOrderNumber: preorderData.salesOrderNumber || existingSalesOrderId,
            }
          );
        }

        // 3. Re-read authoritative collections inside the transaction
        const [allocsSnap, paymentsSnap, refundsSnap, eventsSnap, salesOrdersSnap] =
          await Promise.all([
            transaction.get(this.deps.db.collection(PAYMENT_ALLOCATIONS_COLLECTION)),
            transaction.get(this.deps.db.collection(PAYMENTS_COLLECTION)),
            transaction.get(this.deps.db.collection(ORDER_REFUNDS_COLLECTION)),
            transaction.get(this.deps.db.collection(PREORDER_EVENTS_COLLECTION)),
            transaction.get(this.deps.db.collection(SALES_ORDERS_COLLECTION)),
          ]);

        const paymentAllocations: Record<string, any>[] = allocsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        const payments: Record<string, any>[] = paymentsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        const refunds: Record<string, any>[] = refundsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        const events: Record<string, any>[] = eventsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        const salesOrders: Record<string, any>[] = salesOrdersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const salesOrdersMap = new Map<string, any>();
        for (const so of salesOrders) {
          if (so.id) salesOrdersMap.set(String(so.id), so);
        }

        // Check if deterministic sales order already exists
        const deterministicSalesOrderId = `ORD-PO-${preorderId}`;
        if (salesOrdersMap.has(deterministicSalesOrderId)) {
          throw new PreorderHttpError(
            409,
            'ALREADY_PROCESSED',
            `Sales order '${deterministicSalesOrderId}' already exists for pre-order '${preorderId}'.`,
            { salesOrderId: deterministicSalesOrderId }
          );
        }

        const reconciliation = reconcilePreorderPayments({
          preorder: preorderData,
          paymentAllocations,
          payments,
          refunds,
          events,
          salesOrdersMap,
        });

        const eligibility = evaluateConversionEligibility({
          preorder: preorderData,
          reconciliation,
          salesOrdersMap,
        });

        if (!eligibility.eligible) {
          const codes = eligibility.reasonCodes;
          const primaryReason = eligibility.reasons.join(' ');
          if (codes.includes('ALREADY_PROCESSED')) {
            throw new PreorderHttpError(409, 'ALREADY_PROCESSED', primaryReason, {
              reasonCodes: codes,
              salesOrderId: eligibility.salesOrderId,
            });
          }
          if (
            codes.includes('BOOKING_CANCELLED') ||
            codes.includes('PAYMENT_REFUNDED') ||
            codes.includes('PAYMENT_REVERSED') ||
            codes.includes('PAYMENT_DISPUTED')
          ) {
            throw new PreorderHttpError(409, 'CONVERSION_CONFLICT', primaryReason, {
              reasonCodes: codes,
            });
          }
          if (codes.includes('PAYMENT_UNVERIFIED')) {
            throw new PreorderHttpError(422, 'PAYMENT_UNVERIFIED', primaryReason, {
              reasonCodes: codes,
            });
          }
          throw new PreorderHttpError(422, 'NOT_FULLY_PAID', primaryReason, {
            reasonCodes: codes,
            verifiedNetPaid: reconciliation.verifiedNetPaid,
            outstandingBalance: reconciliation.outstandingBalance,
            totalProductValue: reconciliation.authoritativeTotalProductValue,
          });
        }

        // Fetch customer and product snapshots if available
        let customerData: any = null;
        if (preorderData.customerId) {
          const custSnap = await transaction.get(
            this.deps.db.collection(CUSTOMERS_COLLECTION).doc(String(preorderData.customerId))
          );
          if (custSnap.exists) customerData = { id: custSnap.id, ...custSnap.data() };
        }
        let productData: any = null;
        if (preorderData.productId) {
          const prodSnap = await transaction.get(
            this.deps.db.collection(PRODUCTS_COLLECTION).doc(String(preorderData.productId))
          );
          if (prodSnap.exists) productData = { id: prodSnap.id, ...prodSnap.data() };
        }

        const primaryTx = reconciliation.paymentsTableTransactions[0];
        const primaryPaymentDoc = primaryTx
          ? payments.find(
              (p: any) =>
                String(p.id) === primaryTx.paymentDocId ||
                String(p.orderId) === primaryTx.checkoutReference
            )
          : null;

        const nowIso = new Date().toISOString();
        const salesOrderPayload = buildSalesOrderFromPreorder({
          preorder: preorderData,
          reconciliation,
          customer: customerData,
          product: productData,
          primaryPaymentDoc,
          existingSalesOrderCount: salesOrders.length,
          actor,
          nowIso,
        });

        // Allow test hook to simulate downstream sales-order creation failure before commit
        if ((preorderData as any).__simulateSalesOrderFailure === true) {
          throw new Error('Simulated downstream sales_orders creation failure');
        }

        const salesOrderRef = this.deps.db
          .collection(SALES_ORDERS_COLLECTION)
          .doc(salesOrderPayload.id);
        const { id: _soId, ...salesOrderFirestoreDoc } = salesOrderPayload;
        transaction.set(salesOrderRef, salesOrderFirestoreDoc);

        // Update preorders/{preorderId} with minimal additive conversion fields
        const preorderUpdates = {
          processingStatus: 'processed',
          conversionStatus: 'CONVERTED',
          salesOrderId: salesOrderPayload.id,
          salesOrderNumber: salesOrderPayload.orderNumber,
          processedAt: nowIso,
          processedBy: actor.uid,
          processedByEmail: actor.email || '',
          updatedAt: nowIso,
        };
        transaction.update(preorderRef, preorderUpdates);

        // Record conversion lock and admin idempotency record in `preorder_idempotency`
        const idemRecord = {
          operation: 'admin_convert_to_sales_order',
          preorderId,
          salesOrderId: salesOrderPayload.id,
          salesOrderNumber: salesOrderPayload.orderNumber,
          adminUid: actor.uid,
          adminEmail: actor.email || '',
          idempotencyKey,
          verifiedNetPaid: reconciliation.verifiedNetPaid,
          status: 'COMPLETED',
          createdAt: nowIso,
        };
        transaction.set(lockRef, idemRecord);
        transaction.set(adminIdemRef, idemRecord);

        // Link payment_allocations records to the newly created salesOrderId without altering advance amounts
        for (const tx of reconciliation.paymentsTableTransactions) {
          if (!tx.checkoutReference) continue;
          const matchingAlloc = paymentAllocations.find(
            (a: any) =>
              String(a.id) === tx.checkoutReference ||
              String(a.checkoutReference) === tx.checkoutReference
          );
          if (matchingAlloc) {
            const allocRef = this.deps.db
              .collection(PAYMENT_ALLOCATIONS_COLLECTION)
              .doc(String(matchingAlloc.id));
            transaction.update(allocRef, {
              regularSalesOrderId: matchingAlloc.regularSalesOrderId || salesOrderPayload.id,
              convertedSalesOrderId: salesOrderPayload.id,
              convertedSalesOrderNumber: salesOrderPayload.orderNumber,
              convertedAt: nowIso,
              updatedAt: nowIso,
            });
          }
        }

        // Append `preorder.conversion_succeeded` audit event inside transaction
        const successEventId = `poe_${crypto.randomBytes(12).toString('hex')}`;
        const successEventRef = this.deps.db
          .collection(PREORDER_EVENTS_COLLECTION)
          .doc(successEventId);
        transaction.set(successEventRef, {
          eventId: successEventId,
          preorderId,
          actorId: actor.uid,
          actorEmail: actor.email || '',
          actorRole: actor.role,
          eventType: 'preorder.conversion_succeeded',
          oldStatus: String(preorderData.processingStatus || 'unprocessed'),
          newStatus: 'processed',
          paymentStatus: 'paid',
          conversionStatus: 'CONVERTED',
          salesOrderId: salesOrderPayload.id,
          salesOrderNumber: salesOrderPayload.orderNumber,
          verifiedNetPaid: reconciliation.verifiedNetPaid,
          outstandingBalance: 0,
          idempotencyKey,
          message: `Pre-order converted to Sales Order ${salesOrderPayload.orderNumber} (${salesOrderPayload.id})`,
          occurredAt: nowIso,
        });

        // Create initial order_fulfilment & order_operation_history records for downstream operations
        const fulfilmentRef = this.deps.db
          .collection(ORDER_FULFILMENT_COLLECTION)
          .doc(`ful_${salesOrderPayload.id}`);
        transaction.set(fulfilmentRef, {
          id: `ful_${salesOrderPayload.id}`,
          orderId: salesOrderPayload.id,
          status: 'NOT_STARTED',
          sourcePreorderId: preorderId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        const historyId = `evt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const historyRef = this.deps.db
          .collection(ORDER_OPERATION_HISTORY_COLLECTION)
          .doc(historyId);
        transaction.set(historyRef, {
          id: historyId,
          orderId: salesOrderPayload.id,
          action: 'PREORDER_CONVERTED_TO_SALES_ORDER',
          description: `Converted from fully paid Pre-Order ${preorderId} (Verified Paid: ₹${reconciliation.verifiedNetPaid.toFixed(2)})`,
          timestamp: nowIso,
          performedBy: actor.email || actor.uid,
          metadata: {
            preorderId,
            salesOrderId: salesOrderPayload.id,
            salesOrderNumber: salesOrderPayload.orderNumber,
            verifiedNetPaid: reconciliation.verifiedNetPaid,
          },
        });

        return {
          preorderId,
          salesOrderId: salesOrderPayload.id,
          salesOrderNumber: salesOrderPayload.orderNumber,
          salesOrder: salesOrderPayload,
          preorder: { ...preorderData, ...preorderUpdates },
          idempotentReplay: false,
          verifiedNetPaid: reconciliation.verifiedNetPaid,
          outstandingBalance: 0,
        };
      });

      if (!txResult.idempotentReplay && this.deps.onSalesOrderCreated) {
        await this.deps.onSalesOrderCreated(txResult.salesOrderId).catch((err) => {
          console.warn(
            `[PREORDER-CONVERT] Non-fatal post-conversion sync warning for ${txResult.salesOrderId}:`,
            err
          );
        });
      }

      return txResult;
    } catch (error: any) {
      if (error instanceof PreorderHttpError) {
        await this.appendPreorderEvent({
          preorderId,
          actorId: actor.uid,
          actorEmail: actor.email,
          actorRole: actor.role,
          eventType: 'preorder.conversion_rejected',
          conversionStatus: 'REJECTED',
          salesOrderId: error.details?.salesOrderId || null,
          reasonCodes: error.details?.reasonCodes || [error.code],
          idempotencyKey,
          message: error.message,
        }).catch(() => {});
        throw error;
      }

      await this.appendPreorderEvent({
        preorderId,
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        eventType: 'preorder.conversion_failed',
        conversionStatus: 'FAILED',
        reasonCodes: ['CONVERSION_FAILED'],
        idempotencyKey,
        message: error?.message || 'Unexpected error during sales order creation',
      }).catch(() => {});

      throw new PreorderHttpError(
        500,
        'CONVERSION_FAILED',
        `Sales order conversion failed safely; pre-order remains unprocessed and can be retried: ${error?.message || 'Unknown error'}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Express Route Registration
// ---------------------------------------------------------------------------

export function registerPreorderManagementRoutes(
  app: express.Application,
  deps: {
    db: Firestore;
    auth: Auth;
    onSalesOrderCreated?: (salesOrderId: string) => Promise<void>;
  }
): PreorderManagementService {
  const service = new PreorderManagementService(deps);

  const sendError = (res: express.Response, err: any) => {
    if (err instanceof PreorderHttpError) {
      return res.status(err.status).json({
        success: false,
        code: err.code,
        error: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }
    console.error('[PREORDER-ADMIN-API] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      code: 'CONVERSION_FAILED',
      error: err?.message || 'Internal server error in Pre-Order Management API.',
    });
  };

  // 1. GET /api/admin/preorders — Server-side paginated list (search, status, sort, page/cursor, limit)
  const handleListPreorders = async (req: express.Request, res: express.Response) => {
    try {
      const actor = await service.resolveAuthenticatedAdmin(req);
      const result = await service.listPreorders(actor, {
        status: req.query.status,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder || req.query.sortDir,
        page: req.query.page,
        limit: req.query.limit || req.query.pageSize,
        cursor: req.query.cursor,
      });
      return res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      return sendError(res, err);
    }
  };
  app.get('/api/admin/preorders', handleListPreorders);
  app.get('/api/v1/admin/preorders', handleListPreorders);

  // 2. GET /api/admin/preorders/:id — Authorized booking detail & payment summary
  const handleGetPreorderDetail = async (req: express.Request, res: express.Response) => {
    try {
      const actor = await service.resolveAuthenticatedAdmin(req);
      const result = await service.getPreorderDetails(actor, req.params.id);
      return res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      return sendError(res, err);
    }
  };
  app.get('/api/admin/preorders/:id', handleGetPreorderDetail);
  app.get('/api/v1/admin/preorders/:id', handleGetPreorderDetail);

  // 3. GET /api/admin/preorders/:id/events — Paginated audit events
  const handleGetPreorderEvents = async (req: express.Request, res: express.Response) => {
    try {
      const actor = await service.resolveAuthenticatedAdmin(req);
      const result = await service.getPreorderEvents(actor, req.params.id, {
        page: req.query.page,
        limit: req.query.limit,
        order: req.query.order,
      });
      return res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      return sendError(res, err);
    }
  };
  app.get('/api/admin/preorders/:id/events', handleGetPreorderEvents);
  app.get('/api/v1/admin/preorders/:id/events', handleGetPreorderEvents);

  // 4. GET /api/admin/preorders/:id/conversion-eligibility — Authoritative eligibility & reason codes
  const handleGetConversionEligibility = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const actor = await service.resolveAuthenticatedAdmin(req);
      const eligibility = await service.getConversionEligibility(actor, req.params.id);
      return res.json({
        success: true,
        ...eligibility,
      });
    } catch (err) {
      return sendError(res, err);
    }
  };
  app.get('/api/admin/preorders/:id/conversion-eligibility', handleGetConversionEligibility);
  app.get('/api/v1/admin/preorders/:id/conversion-eligibility', handleGetConversionEligibility);

  // 5. POST /api/admin/preorders/:id/convert-to-sales-order — Authorized, idempotent conversion
  const handleConvertToSalesOrder = async (req: express.Request, res: express.Response) => {
    try {
      const actor = await service.resolveAuthenticatedAdmin(req);
      const headerKey =
        req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || undefined;
      const resolvedHeaderKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;
      const result = await service.convertToSalesOrder(
        actor,
        req.params.id,
        req.body,
        resolvedHeaderKey
      );
      return res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      return sendError(res, err);
    }
  };
  app.post('/api/admin/preorders/:id/convert-to-sales-order', handleConvertToSalesOrder);
  app.post('/api/v1/admin/preorders/:id/convert-to-sales-order', handleConvertToSalesOrder);

  return service;
}
