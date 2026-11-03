/**
 * Product Review Management & Aggregate Synchronization Service
 *
 * Collections:
 * - `customer_reviews/{reviewId}` (document ID === `reviewId`)
 * - `customer_review_aggregates/{productId}` (document ID === `productId`)
 * - `products/{productId}`
 * - `customers/{customerId}`
 * - `sales_orders/{orderId}`
 *
 * `averageRating` Encoding Convention:
 * - Stored as an `int64` integer in `customer_review_aggregates.averageRating`.
 * - Confirmed from live Firestore document `customer_review_aggregates/ElBFraQI6FmraUqDFrjn`:
 *   `ratingCount > 0 ? Math.round(ratingSum / ratingCount) : 0`.
 * - For zero eligible reviews: `ratingCount = 0`, `ratingSum = 0`,
 *   `distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }`,
 *   `mediaCount = 0`, `averageRating = 0`.
 */

import type express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';

export const CUSTOMER_REVIEWS_COLLECTION = 'customer_reviews';
export const CUSTOMER_REVIEW_AGGREGATES_COLLECTION = 'customer_review_aggregates';
export const REVIEW_CONTRIBUTION_LEDGER_COLLECTION = '_customer_review_ledger';

export type ReviewStatus = 'published' | 'pending' | 'rejected' | 'hidden';
export const ALLOWED_REVIEW_STATUSES: readonly ReviewStatus[] = ['published', 'pending', 'rejected', 'hidden'];

export interface ReviewMediaItem {
  mediaId: string;
  url: string;
  storagePath: string;
  type: 'image' | 'video';
  contentType?: string;
  fileName?: string;
  fileSize?: number;
}

export interface CustomerReviewRecord {
  reviewId: string;
  productId: string;
  customerId: string;
  customerDisplayName: string;
  userUid: string;
  orderId: string;
  orderItemId: string;
  purchaseDate: Timestamp | string | any;
  verifiedPurchase: boolean;
  rating: number;
  title: string;
  reviewText: string;
  status: ReviewStatus;
  media: ReviewMediaItem[];
  mediaCount: number;
  hasMedia: boolean;
  helpfulCount: number;
  rankScore: number;
  createdAt: Timestamp | string | any;
  updatedAt: Timestamp | string | any;
}

export interface CustomerReviewAggregateRecord {
  productId: string;
  averageRating: number; // int64 rounded integer: ratingCount > 0 ? Math.round(ratingSum / ratingCount) : 0
  ratingCount: number;   // int64
  ratingSum: number;     // int64
  mediaCount: number;    // int64
  distribution: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
  updatedAt: Timestamp | string | any;
}

export interface ReviewContribution {
  eligible: boolean;
  productId: string;
  rating: number;
  mediaCount: number;
}

export class ReviewHttpError extends Error {
  constructor(public status: number, message: string, public code = 'REVIEW_ERROR') {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Pure Helpers & Eligibility Rules (Exported for Unit Tests)
// ---------------------------------------------------------------------------

export function cleanDigits(val: unknown): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

export function normalizePhone10(val: unknown): string {
  const digits = cleanDigits(val);
  if (digits.length < 7) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Checks whether a sales order is eligible as a verified purchase.
 * Excludes cancelled/rejected/refunded orders and explicitly failed/unpaid online orders.
 * Note: COD orders with Confirmed/COMPLETED/SHIPPED status or Paid orders are eligible.
 */
export function isQualifyingPurchaseOrder(order: any): boolean {
  if (!order || typeof order !== 'object') return false;

  const orderStatus = String(order.orderStatus || order.status || '').trim().toUpperCase();
  const deliveryStatus = String(order.deliveryStatus || '').trim().toUpperCase();
  const paymentStatus = String(order.paymentStatus || '').trim().toUpperCase();
  const paymentMethod = String(order.paymentMethod || '').trim().toUpperCase();

  const cancelledStatuses = new Set(['CANCELLED', 'CANCELED', 'REJECTED', 'VOID', 'FAILED', 'RETURNED', 'REFUNDED']);
  if (cancelledStatuses.has(orderStatus) || cancelledStatuses.has(deliveryStatus)) {
    return false;
  }

  const invalidPaymentStatuses = new Set(['FAILED', 'CANCELLED', 'CANCELED', 'REFUNDED', 'UNPAID']);
  if (invalidPaymentStatuses.has(paymentStatus)) {
    return false;
  }

  // Online pre-paid orders with PENDING payment that are not yet confirmed/dispatched/completed are excluded
  if (
    paymentStatus === 'PENDING' &&
    paymentMethod !== 'COD' &&
    orderStatus !== 'CONFIRMED' &&
    deliveryStatus !== 'COMPLETED' &&
    deliveryStatus !== 'DELIVERED' &&
    deliveryStatus !== 'SHIPPED'
  ) {
    return false;
  }

  return true;
}

/**
 * Extracts normalized line items from a `sales_orders` document.
 * Supports `order.products` (primary Violeafy schema) and `order.items` (fallback).
 */
export interface NormalizedOrderLineItem {
  orderItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  unit: string;
  packingSize: string;
  lineIndex: number;
}

export function extractOrderLineItems(order: any): NormalizedOrderLineItem[] {
  if (!order || typeof order !== 'object') return [];
  const rawLines = Array.isArray(order.products)
    ? order.products
    : Array.isArray(order.items)
    ? order.items
    : [];

  return rawLines.map((line: any, idx: number) => {
    const productId = String(line?.productId || line?.id || '').trim();
    const orderItemId = String(line?.orderItemId || line?.itemId || `line-${idx}`).trim();
    return {
      orderItemId,
      productId,
      productName: String(line?.productName || line?.name || 'Product'),
      quantity: Number(line?.quantity ?? line?.orderqty ?? 1) || 1,
      price: Number(line?.price ?? line?.unitPrice ?? 0) || 0,
      unit: String(line?.unit || order.unit || 'Nos'),
      packingSize: String(line?.packingSize || order.packingSize || ''),
      lineIndex: idx,
    };
  });
}

/**
 * Matches a `sales_orders` document to a `customers` record using:
 * 1. Direct ID match (`order.customerId === customer.id` or `customer.customerId`)
 * 2. Firebase Auth UID match (`order.customerId === customer.authUid` or `order.shippingAddress.userId === customer.authUid`)
 * 3. Normalized 10-digit mobile number match (`order.customerMobile` / `shippingAddress.mobileNumber` vs `customer.mobileNumber`)
 */
export function doesOrderBelongToCustomer(order: any, customer: any): boolean {
  if (!order || !customer) return false;

  const custIds = new Set(
    [customer.id, customer.customerId, customer.authUid]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  );

  const orderCustCandidates = [
    order.customerId,
    order.shippingAddress?.customerId,
    order.shippingAddress?.userId,
    order.userUid,
    order.userId,
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean);

  for (const cand of orderCustCandidates) {
    if (custIds.has(cand)) return true;
  }

  const custPhones = new Set(
    [customer.mobileNumber, customer.mobileNumberpluscode, customer.phone, customer.mobilenumberwithcountrycode]
      .map(normalizePhone10)
      .filter(Boolean)
  );

  const orderPhones = [order.customerMobile, order.shippingAddress?.mobileNumber, order.contactNo]
    .map(normalizePhone10)
    .filter(Boolean);

  for (const p of orderPhones) {
    if (custPhones.has(p)) return true;
  }

  return false;
}

/**
 * Resolves the canonical customer document from `customers` for a given `sales_orders` record.
 */
export function resolveCustomerForOrder(order: any, customers: any[]): any | null {
  if (!order || !Array.isArray(customers)) return null;
  // Prefer direct ID/authUid match first, then phone match
  for (const c of customers) {
    const custIds = new Set([c.id, c.customerId, c.authUid].map((x) => String(x || '').trim()).filter(Boolean));
    const orderCustCandidates = [
      order.customerId,
      order.shippingAddress?.customerId,
      order.shippingAddress?.userId,
    ]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    if (orderCustCandidates.some((id) => custIds.has(id))) {
      return c;
    }
  }
  for (const c of customers) {
    if (doesOrderBelongToCustomer(order, c)) return c;
  }
  return null;
}

/**
 * Parses an order's purchase date into a Firestore `Timestamp`.
 * Source of truth: `order.createdAt` -> `order.invoiceDate` -> `order.orderDate`.
 */
export function derivePurchaseTimestamp(order: any): Timestamp {
  const raw = order?.createdAt ?? order?.invoiceDate ?? order?.orderDate;
  if (!raw) return Timestamp.now();
  if (raw instanceof Timestamp) return raw;
  if (typeof raw?._seconds === 'number') {
    return new Timestamp(raw._seconds, raw._nanoseconds || 0);
  }
  if (typeof raw?.seconds === 'number') {
    return new Timestamp(raw.seconds, raw.nanoseconds || 0);
  }
  if (typeof raw?.toDate === 'function') {
    return Timestamp.fromDate(raw.toDate());
  }
  const ms = Date.parse(String(raw));
  if (!Number.isNaN(ms)) {
    return Timestamp.fromMillis(ms);
  }
  return Timestamp.now();
}

/**
 * Validates and normalizes the `media` array on a review.
 */
export function sanitizeReviewMedia(rawMedia: unknown): ReviewMediaItem[] {
  if (!rawMedia) return [];
  if (!Array.isArray(rawMedia)) {
    throw new ReviewHttpError(400, 'media must be an array', 'INVALID_MEDIA');
  }
  if (rawMedia.length > 20) {
    throw new ReviewHttpError(400, 'A maximum of 20 media items is allowed per review', 'TOO_MANY_MEDIA');
  }

  return rawMedia.map((item: any, idx: number) => {
    if (typeof item === 'string') {
      const url = item.trim();
      if (!url || url.toLowerCase().startsWith('data:')) {
        throw new ReviewHttpError(400, `media[${idx}] must be a valid storage URL (base64 data URLs are not allowed)`, 'INVALID_MEDIA');
      }
      const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
      return {
        mediaId: `media_${idx}_${crypto.randomBytes(3).toString('hex')}`,
        url,
        storagePath: '',
        type: isVideo ? 'video' : 'image',
      };
    }

    if (!item || typeof item !== 'object') {
      throw new ReviewHttpError(400, `media[${idx}] must be an object`, 'INVALID_MEDIA');
    }

    const url = String(item.url || item.downloadUrl || item.imageUrl || '').trim();
    if (!url || url.toLowerCase().startsWith('data:')) {
      throw new ReviewHttpError(400, `media[${idx}].url is required and must not be base64`, 'INVALID_MEDIA');
    }

    const rawType = String(item.type || item.contentType || '').toLowerCase();
    const type: 'image' | 'video' = rawType.includes('video') ? 'video' : 'image';

    return {
      mediaId: String(item.mediaId || item.id || `media_${idx}_${crypto.randomBytes(3).toString('hex')}`).trim(),
      url,
      storagePath: String(item.storagePath || '').trim(),
      type,
      ...(item.contentType ? { contentType: String(item.contentType) } : {}),
      ...(item.fileName ? { fileName: String(item.fileName).slice(0, 200) } : {}),
      ...(typeof item.fileSize === 'number' ? { fileSize: item.fileSize } : {}),
    };
  });
}

/**
 * Deterministic integer `rankScore` matching existing live review convention:
 * - `verifiedPurchase`: +2
 * - `hasMedia`: +1
 * - `helpfulCount`: +helpfulCount
 * (Live review `3Af8uArht7jNQiZj5KqO` has verifiedPurchase=true, hasMedia=false, helpfulCount=0 => rankScore=2).
 */
export function computeReviewRankScore(params: {
  verifiedPurchase: boolean;
  hasMedia: boolean;
  helpfulCount: number;
}): number {
  const base = (params.verifiedPurchase ? 2 : 0) + (params.hasMedia ? 1 : 0) + Math.max(0, Math.trunc(params.helpfulCount || 0));
  return Math.trunc(base);
}

/**
 * Determines whether a review counts toward `customer_review_aggregates`.
 * Only `status === 'published'` reviews with integer rating 1..5 are eligible.
 */
export function getReviewContribution(review: Partial<CustomerReviewRecord> | null | undefined): ReviewContribution {
  if (!review || !review.productId) {
    return { eligible: false, productId: '', rating: 0, mediaCount: 0 };
  }
  const status = String(review.status || '').trim().toLowerCase();
  const rating = Number(review.rating);
  const isValidRating = Number.isInteger(rating) && rating >= 1 && rating <= 5;
  const eligible = status === 'published' && isValidRating;
  const mediaCount = Array.isArray(review.media)
    ? review.media.length
    : Math.max(0, Math.trunc(Number(review.mediaCount) || 0));

  return {
    eligible,
    productId: String(review.productId).trim(),
    rating: eligible ? rating : 0,
    mediaCount: eligible ? mediaCount : 0,
  };
}

/**
 * Creates an empty zeroed `customer_review_aggregates` object for a product.
 * Follows the confirmed `int64` `averageRating = 0` convention when `ratingCount === 0`.
 */
export function emptyReviewAggregate(productId: string, updatedAt: any = null): CustomerReviewAggregateRecord {
  return {
    productId,
    averageRating: 0,
    ratingCount: 0,
    ratingSum: 0,
    mediaCount: 0,
    distribution: {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    },
    updatedAt,
  };
}

/**
 * Computes `averageRating` as an `int64` integer from `ratingSum` and `ratingCount`.
 */
export function computeInt64AverageRating(ratingSum: number, ratingCount: number): number {
  if (!ratingCount || ratingCount <= 0) return 0;
  return Math.round(ratingSum / ratingCount);
}

/**
 * Pure function that computes a `CustomerReviewAggregateRecord` from a list of reviews for a product.
 * Used both for full product recalculation/backfill and unit testing.
 */
export function buildAggregateFromReviews(
  productId: string,
  reviews: Array<Partial<CustomerReviewRecord>>,
  updatedAt: any = null
): CustomerReviewAggregateRecord {
  const agg = emptyReviewAggregate(productId, updatedAt);

  for (const rev of reviews) {
    if (String(rev?.productId || '').trim() !== productId) continue;
    const contrib = getReviewContribution(rev);
    if (!contrib.eligible) continue;

    agg.ratingCount += 1;
    agg.ratingSum += contrib.rating;
    agg.mediaCount += contrib.mediaCount;
    const key = String(contrib.rating) as '1' | '2' | '3' | '4' | '5';
    agg.distribution[key] = (agg.distribution[key] || 0) + 1;
  }

  agg.averageRating = computeInt64AverageRating(agg.ratingSum, agg.ratingCount);
  return agg;
}

/**
 * Applies a before -> after contribution delta to an existing aggregate document for `targetProductId`.
 * Guarantees non-negative integer counts and recomputes `averageRating` (`int64`).
 */
export function applyContributionDeltaToAggregate(
  current: CustomerReviewAggregateRecord | null | undefined,
  targetProductId: string,
  before: ReviewContribution,
  after: ReviewContribution,
  updatedAt: any = null
): CustomerReviewAggregateRecord {
  const base = current
    ? {
        productId: targetProductId,
        averageRating: Number(current.averageRating) || 0,
        ratingCount: Number(current.ratingCount) || 0,
        ratingSum: Number(current.ratingSum) || 0,
        mediaCount: Number(current.mediaCount) || 0,
        distribution: {
          '1': Number(current.distribution?.['1']) || 0,
          '2': Number(current.distribution?.['2']) || 0,
          '3': Number(current.distribution?.['3']) || 0,
          '4': Number(current.distribution?.['4']) || 0,
          '5': Number(current.distribution?.['5']) || 0,
        },
        updatedAt,
      }
    : emptyReviewAggregate(targetProductId, updatedAt);

  // Subtract `before` if it belonged to `targetProductId` and was eligible
  if (before.eligible && before.productId === targetProductId) {
    base.ratingCount = Math.max(0, base.ratingCount - 1);
    base.ratingSum = Math.max(0, base.ratingSum - before.rating);
    base.mediaCount = Math.max(0, base.mediaCount - before.mediaCount);
    const k = String(before.rating) as '1' | '2' | '3' | '4' | '5';
    if (base.distribution[k] !== undefined) {
      base.distribution[k] = Math.max(0, base.distribution[k] - 1);
    }
  }

  // Add `after` if it belongs to `targetProductId` and is eligible
  if (after.eligible && after.productId === targetProductId) {
    base.ratingCount += 1;
    base.ratingSum += after.rating;
    base.mediaCount += after.mediaCount;
    const k = String(after.rating) as '1' | '2' | '3' | '4' | '5';
    if (base.distribution[k] !== undefined) {
      base.distribution[k] += 1;
    }
  }

  if (base.ratingCount === 0) {
    base.ratingSum = 0;
    base.mediaCount = 0;
    base.distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  }

  base.averageRating = computeInt64AverageRating(base.ratingSum, base.ratingCount);
  base.updatedAt = updatedAt;
  return base;
}

/**
 * In-memory / transactional idempotency helper for duplicate trigger event deliveries.
 */
export class IdempotentReviewTriggerProcessor {
  private ledger = new Map<string, ReviewContribution>();
  private processedEvents = new Set<string>();
  private aggregates = new Map<string, CustomerReviewAggregateRecord>();

  constructor(initialAggregates?: Record<string, CustomerReviewAggregateRecord>) {
    if (initialAggregates) {
      for (const [pid, agg] of Object.entries(initialAggregates)) {
        this.aggregates.set(pid, structuredClone(agg));
      }
    }
  }

  public processEvent(
    eventId: string,
    reviewId: string,
    afterReview: Partial<CustomerReviewRecord> | null,
    timestamp: any = new Date().toISOString()
  ): { skipped: boolean; touchedProducts: string[] } {
    if (eventId && this.processedEvents.has(eventId)) {
      return { skipped: true, touchedProducts: [] };
    }

    const beforeContrib = this.ledger.get(reviewId) || {
      eligible: false,
      productId: '',
      rating: 0,
      mediaCount: 0,
    };
    const afterContrib = getReviewContribution(afterReview);

    // If the state matches the durable ledger (e.g. duplicate event with a different eventId), no-op!
    if (
      beforeContrib.eligible === afterContrib.eligible &&
      beforeContrib.productId === afterContrib.productId &&
      beforeContrib.rating === afterContrib.rating &&
      beforeContrib.mediaCount === afterContrib.mediaCount
    ) {
      if (eventId) this.processedEvents.add(eventId);
      return { skipped: true, touchedProducts: [] };
    }

    const productIds = Array.from(
      new Set([beforeContrib.productId, afterContrib.productId].filter(Boolean))
    );

    for (const pid of productIds) {
      const currentAgg = this.aggregates.get(pid);
      const nextAgg = applyContributionDeltaToAggregate(currentAgg, pid, beforeContrib, afterContrib, timestamp);
      this.aggregates.set(pid, nextAgg);
    }

    if (afterReview) {
      this.ledger.set(reviewId, afterContrib);
    } else {
      this.ledger.delete(reviewId);
    }

    if (eventId) this.processedEvents.add(eventId);
    return { skipped: false, touchedProducts: productIds };
  }

  public getAggregate(productId: string): CustomerReviewAggregateRecord {
    return this.aggregates.get(productId) || emptyReviewAggregate(productId, null);
  }
}

// ---------------------------------------------------------------------------
// Serialization Helper
// ---------------------------------------------------------------------------

export function serializeTimestamp(val: any): string | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val?._seconds === 'number') return new Date(val._seconds * 1000 + Math.round((val._nanoseconds || 0) / 1e6)).toISOString();
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000 + Math.round((val.nanoseconds || 0) / 1e6)).toISOString();
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return String(val);
}

export function serializeReviewDoc(id: string, data: any): any {
  const media = Array.isArray(data?.media) ? data.media : [];
  return {
    reviewId: String(data?.reviewId || id),
    productId: String(data?.productId || ''),
    customerId: String(data?.customerId || ''),
    customerDisplayName: String(data?.customerDisplayName || ''),
    userUid: String(data?.userUid || ''),
    orderId: String(data?.orderId || ''),
    orderItemId: String(data?.orderItemId || ''),
    purchaseDate: serializeTimestamp(data?.purchaseDate),
    verifiedPurchase: Boolean(data?.verifiedPurchase),
    rating: Number(data?.rating) || 0,
    title: String(data?.title || ''),
    reviewText: String(data?.reviewText || ''),
    status: String(data?.status || 'published'),
    media,
    mediaCount: typeof data?.mediaCount === 'number' ? data.mediaCount : media.length,
    hasMedia: typeof data?.hasMedia === 'boolean' ? data.hasMedia : media.length > 0,
    helpfulCount: Number(data?.helpfulCount) || 0,
    rankScore: Number(data?.rankScore) || 0,
    createdAt: serializeTimestamp(data?.createdAt),
    updatedAt: serializeTimestamp(data?.updatedAt),
  };
}

export function serializeAggregateDoc(id: string, data: any): any {
  if (!data) return emptyReviewAggregate(id, null);
  return {
    productId: String(data.productId || id),
    averageRating: Number(data.averageRating) || 0,
    ratingCount: Number(data.ratingCount) || 0,
    ratingSum: Number(data.ratingSum) || 0,
    mediaCount: Number(data.mediaCount) || 0,
    distribution: {
      '1': Number(data.distribution?.['1']) || 0,
      '2': Number(data.distribution?.['2']) || 0,
      '3': Number(data.distribution?.['3']) || 0,
      '4': Number(data.distribution?.['4']) || 0,
      '5': Number(data.distribution?.['5']) || 0,
    },
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Authoritative Firestore Aggregate Reconciler
// ---------------------------------------------------------------------------

/**
 * Recomputes and writes `customer_review_aggregates/{productId}` from all reviews
 * for `productId` in `customer_reviews`. Also syncs `products/{productId}` rating & reviewsCount.
 */
export async function recomputeProductAggregate(
  db: Firestore,
  productId: string
): Promise<CustomerReviewAggregateRecord> {
  const cleanProductId = String(productId || '').trim();
  if (!cleanProductId) {
    throw new ReviewHttpError(400, 'productId is required to recompute aggregate');
  }

  const snap = await db
    .collection(CUSTOMER_REVIEWS_COLLECTION)
    .where('productId', '==', cleanProductId)
    .get();

  const reviews = snap.docs.map((d) => ({ reviewId: d.id, ...(d.data() as any) }));
  const nowTs = FieldValue.serverTimestamp();
  const computed = buildAggregateFromReviews(cleanProductId, reviews, nowTs);

  await db.collection(CUSTOMER_REVIEW_AGGREGATES_COLLECTION).doc(cleanProductId).set(computed);

  // Sync summary fields onto `products/{productId}` if the product exists
  try {
    const prodRef = db.collection('products').doc(cleanProductId);
    const prodSnap = await prodRef.get();
    if (prodSnap.exists) {
      await prodRef.set(
        {
          rating: computed.averageRating,
          reviewsCount: computed.ratingCount,
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn(`[REVIEWS] Warning syncing rating to products/${cleanProductId}:`, err);
  }

  const savedSnap = await db.collection(CUSTOMER_REVIEW_AGGREGATES_COLLECTION).doc(cleanProductId).get();
  return serializeAggregateDoc(cleanProductId, savedSnap.data());
}

/**
 * Reconciles all `customer_review_aggregates` across all products and reviews in the database.
 */
export async function reconcileAllReviewAggregates(db: Firestore): Promise<{
  totalReviewsScanned: number;
  eligiblePublishedReviews: number;
  productsUpdated: number;
  aggregates: any[];
}> {
  const [reviewsSnap, aggsSnap] = await Promise.all([
    db.collection(CUSTOMER_REVIEWS_COLLECTION).get(),
    db.collection(CUSTOMER_REVIEW_AGGREGATES_COLLECTION).get(),
  ]);

  const allReviews = reviewsSnap.docs.map((d) => ({ reviewId: d.id, ...(d.data() as any) }));
  const productIds = new Set<string>();

  for (const r of allReviews) {
    if (r.productId) productIds.add(String(r.productId).trim());
  }
  for (const a of aggsSnap.docs) {
    productIds.add(a.id);
  }

  let eligibleCount = 0;
  for (const r of allReviews) {
    if (getReviewContribution(r).eligible) eligibleCount++;
  }

  const results: any[] = [];
  for (const pid of productIds) {
    if (!pid) continue;
    const agg = await recomputeProductAggregate(db, pid);
    results.push(agg);
  }

  return {
    totalReviewsScanned: allReviews.length,
    eligiblePublishedReviews: eligibleCount,
    productsUpdated: results.length,
    aggregates: results,
  };
}

// ---------------------------------------------------------------------------
// Express Routes Registration
// ---------------------------------------------------------------------------

export interface CustomerReviewRouteDeps {
  db: Firestore;
  auth: Auth;
  storage: Storage;
}

export function registerCustomerReviewRoutes(app: express.Express, deps: CustomerReviewRouteDeps) {
  const { db, auth, storage } = deps;
  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  const requireAdmin: express.RequestHandler = async (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' });
    }
    try {
      const decoded = await auth.verifyIdToken(header.slice(7));
      const provider = (decoded as any).firebase?.sign_in_provider;
      if (provider === 'anonymous' || decoded.admin === false) {
        return res.status(403).json({ success: false, error: 'Administrator access required', code: 'FORBIDDEN' });
      }
      (req as any).reviewAdminUser = { uid: decoded.uid, email: decoded.email };
      next();
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid authentication token', code: 'UNAUTHENTICATED' });
    }
  };

  const sendError = (res: express.Response, err: any, fallback: string) => {
    if (err instanceof ReviewHttpError) {
      return res.status(err.status).json({ success: false, error: err.message, code: err.code });
    }
    console.error(`[CUSTOMER-REVIEWS] ${fallback}:`, err);
    return res.status(500).json({ success: false, error: err?.message || fallback, code: 'SERVER_ERROR' });
  };

  // Validate relational integrity (productId, customerId, orderId, orderItemId)
  async function validateAndResolvePurchaseRelation(params: {
    productId: string;
    customerId: string;
    orderId: string;
    orderItemId?: string;
    adminUid: string;
  }) {
    const productId = String(params.productId || '').trim();
    const customerId = String(params.customerId || '').trim();
    const orderId = String(params.orderId || '').trim();
    const requestedOrderItemId = String(params.orderItemId || '').trim();

    if (!productId) throw new ReviewHttpError(400, 'productId is required', 'VALIDATION');
    if (!customerId) throw new ReviewHttpError(400, 'customerId is required', 'VALIDATION');
    if (!orderId) throw new ReviewHttpError(400, 'orderId is required', 'VALIDATION');

    const [productSnap, customerSnap, orderSnap] = await Promise.all([
      db.collection('products').doc(productId).get(),
      db.collection('customers').doc(customerId).get(),
      db.collection('sales_orders').doc(orderId).get(),
    ]);

    if (!productSnap.exists) {
      throw new ReviewHttpError(400, `Product '${productId}' does not exist`, 'INVALID_PRODUCT');
    }
    if (!customerSnap.exists) {
      throw new ReviewHttpError(400, `Customer '${customerId}' does not exist`, 'INVALID_CUSTOMER');
    }
    if (!orderSnap.exists) {
      throw new ReviewHttpError(400, `Sales order '${orderId}' does not exist`, 'INVALID_ORDER');
    }

    const productData = { id: productSnap.id, ...(productSnap.data() as any) };
    const customerData = { id: customerSnap.id, ...(customerSnap.data() as any) };
    const orderData = { id: orderSnap.id, ...(orderSnap.data() as any) };

    if (!isQualifyingPurchaseOrder(orderData)) {
      throw new ReviewHttpError(
        400,
        `Order '${orderData.orderNumber || orderId}' is cancelled or unpaid and not eligible for verified review`,
        'INELIGIBLE_ORDER'
      );
    }

    if (!doesOrderBelongToCustomer(orderData, customerData)) {
      throw new ReviewHttpError(
        400,
        `Order '${orderData.orderNumber || orderId}' does not belong to customer '${customerData.name || customerId}'`,
        'ORDER_CUSTOMER_MISMATCH'
      );
    }

    const lineItems = extractOrderLineItems(orderData);
    const matchingLines = lineItems.filter((li) => li.productId === productId);
    if (matchingLines.length === 0) {
      throw new ReviewHttpError(
        400,
        `Order '${orderData.orderNumber || orderId}' does not contain product '${productData.name || productId}'`,
        'ORDER_PRODUCT_MISMATCH'
      );
    }

    const chosenLine = requestedOrderItemId
      ? matchingLines.find((li) => li.orderItemId === requestedOrderItemId)
      : matchingLines[0];

    if (!chosenLine) {
      throw new ReviewHttpError(
        400,
        `Order line item '${requestedOrderItemId}' does not match product '${productId}' in order '${orderId}'`,
        'INVALID_ORDER_ITEM'
      );
    }

    const purchaseDate = derivePurchaseTimestamp(orderData);
    const userUid = String(
      customerData.authUid ||
        orderData.shippingAddress?.userId ||
        (orderData.customerId && orderData.customerId !== customerId ? orderData.customerId : '') ||
        params.adminUid
    ).trim();

    return {
      productId,
      customerId,
      orderId,
      orderItemId: chosenLine.orderItemId,
      purchaseDate,
      verifiedPurchase: true,
      userUid,
      productData,
      customerData,
      orderData,
    };
  }

  // Transactional review write + aggregate synchronization (atomic across old & new productId)
  async function persistReviewTransactionally(
    reviewId: string,
    buildDocFn: (existing: any | null) => Promise<{ nextDoc: CustomerReviewRecord | null }>
  ): Promise<{ review: any | null; aggregates: Record<string, any> }> {
    const reviewRef = db.collection(CUSTOMER_REVIEWS_COLLECTION).doc(reviewId);
    const ledgerRef = db.collection(REVIEW_CONTRIBUTION_LEDGER_COLLECTION).doc(reviewId);
    let savedReviewData: CustomerReviewRecord | null = null;
    const touchedProductIds = new Set<string>();

    await db.runTransaction(async (tx: Transaction) => {
      const existingSnap = await tx.get(reviewRef);
      const existingData = existingSnap.exists ? ({ reviewId: existingSnap.id, ...(existingSnap.data() as any) }) : null;

      const { nextDoc } = await buildDocFn(existingData);
      savedReviewData = nextDoc;

      const beforeContrib = getReviewContribution(existingData);
      const afterContrib = getReviewContribution(nextDoc);

      if (beforeContrib.productId) touchedProductIds.add(beforeContrib.productId);
      if (afterContrib.productId) touchedProductIds.add(afterContrib.productId);

      // Read all affected aggregate docs first (Firestore transaction rule: all reads before writes)
      const aggSnaps = new Map<string, any>();
      for (const pid of touchedProductIds) {
        const aggRef = db.collection(CUSTOMER_REVIEW_AGGREGATES_COLLECTION).doc(pid);
        const snap = await tx.get(aggRef);
        aggSnaps.set(pid, snap.exists ? snap.data() : null);
      }

      const nowTs = FieldValue.serverTimestamp();

      // Write review document (or delete)
      if (nextDoc) {
        tx.set(reviewRef, {
          ...nextDoc,
          createdAt: existingData?.createdAt || nowTs,
          updatedAt: nowTs,
        });
        tx.set(ledgerRef, {
          reviewId,
          ...afterContrib,
          updatedAt: nowTs,
        });
      } else {
        tx.delete(reviewRef);
        tx.delete(ledgerRef);
      }

      // Update aggregate document(s) for both old and new productId
      for (const pid of touchedProductIds) {
        const currentAgg = aggSnaps.get(pid);
        const updatedAgg = applyContributionDeltaToAggregate(currentAgg, pid, beforeContrib, afterContrib, nowTs);
        const aggRef = db.collection(CUSTOMER_REVIEW_AGGREGATES_COLLECTION).doc(pid);
        tx.set(aggRef, updatedAgg);
      }
    });

    // Reconcile each touched product against authoritative query to guarantee 100% consistency with historical data
    const aggregates: Record<string, any> = {};
    for (const pid of touchedProductIds) {
      aggregates[pid] = await recomputeProductAggregate(db, pid);
    }

    if (!savedReviewData) {
      return { review: null, aggregates };
    }

    const freshSnap = await reviewRef.get();
    return {
      review: serializeReviewDoc(freshSnap.id, freshSnap.data()),
      aggregates,
    };
  }

  // 1. GET /admin/reviews/products?search=&limit=
  const handleGetProducts: express.RequestHandler = async (req, res) => {
    try {
      const search = String(req.query.search || '').trim().toLowerCase();
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

      const snap = await db.collection('products').get();
      let products = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          productId: d.id,
          id: d.id,
          name: String(data.name || data.productName || d.id),
          sku: String(data.sku || ''),
          packingSize: String(data.packingSize || ''),
          unit: String(data.unit || ''),
          category: String(data.category || ''),
          imageUrl: String(data.imageUrl || ''),
        };
      });

      if (search) {
        products = products.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            p.productId.toLowerCase().includes(search) ||
            p.sku.toLowerCase().includes(search)
        );
      }

      products.sort((a, b) => a.name.localeCompare(b.name));
      return res.json({ success: true, products: products.slice(0, limit), total: products.length });
    } catch (err) {
      return sendError(res, err, 'Failed to search products');
    }
  };

  // 2. GET /admin/reviews/eligible-customers?productId=
  const handleGetEligibleCustomers: express.RequestHandler = async (req, res) => {
    try {
      const productId = String(req.query.productId || '').trim();
      if (!productId) {
        throw new ReviewHttpError(400, 'productId query parameter is required', 'VALIDATION');
      }

      const [ordersSnap, customersSnap] = await Promise.all([
        db.collection('sales_orders').get(),
        db.collection('customers').get(),
      ]);

      const customers = customersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const eligibleCustomersMap = new Map<
        string,
        {
          customerId: string;
          name: string;
          mobileNumber: string;
          email: string;
          authUid: string;
          qualifyingOrderCount: number;
        }
      >();

      for (const orderDoc of ordersSnap.docs) {
        const order = { id: orderDoc.id, ...(orderDoc.data() as any) };
        if (!isQualifyingPurchaseOrder(order)) continue;

        const lines = extractOrderLineItems(order);
        const hasProduct = lines.some((li) => li.productId === productId);
        if (!hasProduct) continue;

        const matchedCustomer = resolveCustomerForOrder(order, customers);
        if (!matchedCustomer) continue;

        const cid = String(matchedCustomer.id);
        const existing = eligibleCustomersMap.get(cid);
        if (existing) {
          existing.qualifyingOrderCount += 1;
        } else {
          eligibleCustomersMap.set(cid, {
            customerId: cid,
            name: String(matchedCustomer.name || order.customerName || cid),
            mobileNumber: String(matchedCustomer.mobileNumber || order.customerMobile || ''),
            email: String(matchedCustomer.email || order.customerEmail || ''),
            authUid: String(matchedCustomer.authUid || ''),
            qualifyingOrderCount: 1,
          });
        }
      }

      const eligibleCustomers = Array.from(eligibleCustomersMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      return res.json({ success: true, productId, customers: eligibleCustomers });
    } catch (err) {
      return sendError(res, err, 'Failed to fetch eligible customers');
    }
  };

  // 3. GET /admin/reviews/eligible-orders?productId=&customerId=
  const handleGetEligibleOrders: express.RequestHandler = async (req, res) => {
    try {
      const productId = String(req.query.productId || '').trim();
      const customerId = String(req.query.customerId || '').trim();
      if (!productId || !customerId) {
        throw new ReviewHttpError(400, 'Both productId and customerId query parameters are required', 'VALIDATION');
      }

      const [customerSnap, ordersSnap] = await Promise.all([
        db.collection('customers').doc(customerId).get(),
        db.collection('sales_orders').get(),
      ]);

      if (!customerSnap.exists) {
        throw new ReviewHttpError(404, `Customer '${customerId}' not found`, 'NOT_FOUND');
      }
      const customer = { id: customerSnap.id, ...(customerSnap.data() as any) };

      const eligibleOrders: any[] = [];

      for (const orderDoc of ordersSnap.docs) {
        const order = { id: orderDoc.id, ...(orderDoc.data() as any) };
        if (!isQualifyingPurchaseOrder(order)) continue;
        if (!doesOrderBelongToCustomer(order, customer)) continue;

        const matchingItems = extractOrderLineItems(order).filter((li) => li.productId === productId);
        if (matchingItems.length === 0) continue;

        const purchaseTs = derivePurchaseTimestamp(order);
        eligibleOrders.push({
          orderId: orderDoc.id,
          orderNumber: String(order.orderNumber || orderDoc.id),
          orderStatus: String(order.orderStatus || order.status || 'Confirmed'),
          deliveryStatus: String(order.deliveryStatus || ''),
          paymentStatus: String(order.paymentStatus || ''),
          purchaseDate: purchaseTs.toDate().toISOString(),
          lineItems: matchingItems,
        });
      }

      eligibleOrders.sort((a, b) => String(b.purchaseDate).localeCompare(String(a.purchaseDate)));

      return res.json({
        success: true,
        productId,
        customerId,
        orders: eligibleOrders,
      });
    } catch (err) {
      return sendError(res, err, 'Failed to fetch eligible orders');
    }
  };

  // 4. GET /admin/reviews
  const handleListReviews: express.RequestHandler = async (req, res) => {
    try {
      const productIdFilter = String(req.query.productId || '').trim();
      const customerIdFilter = String(req.query.customerId || '').trim();
      const statusFilter = String(req.query.status || '').trim().toLowerCase();
      const search = String(req.query.search || '').trim().toLowerCase();

      const [reviewsSnap, aggsSnap] = await Promise.all([
        db.collection(CUSTOMER_REVIEWS_COLLECTION).get(),
        db.collection(CUSTOMER_REVIEW_AGGREGATES_COLLECTION).get(),
      ]);

      let reviews = reviewsSnap.docs.map((d) => serializeReviewDoc(d.id, d.data()));

      if (productIdFilter) {
        reviews = reviews.filter((r) => r.productId === productIdFilter);
      }
      if (customerIdFilter) {
        reviews = reviews.filter((r) => r.customerId === customerIdFilter);
      }
      if (statusFilter && statusFilter !== 'all') {
        reviews = reviews.filter((r) => String(r.status).toLowerCase() === statusFilter);
      }
      if (search) {
        reviews = reviews.filter(
          (r) =>
            r.title.toLowerCase().includes(search) ||
            r.reviewText.toLowerCase().includes(search) ||
            r.customerDisplayName.toLowerCase().includes(search) ||
            r.productId.toLowerCase().includes(search) ||
            r.orderId.toLowerCase().includes(search) ||
            r.reviewId.toLowerCase().includes(search)
        );
      }

      reviews.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const aggregates: Record<string, any> = {};
      for (const doc of aggsSnap.docs) {
        aggregates[doc.id] = serializeAggregateDoc(doc.id, doc.data());
      }

      return res.json({
        success: true,
        reviews,
        aggregates,
      });
    } catch (err) {
      return sendError(res, err, 'Failed to list customer reviews');
    }
  };

  // 5. GET /admin/reviews/:reviewId
  const handleGetReviewById: express.RequestHandler = async (req, res) => {
    try {
      const reviewId = String(req.params.reviewId || '').trim();
      if (!reviewId) throw new ReviewHttpError(400, 'reviewId is required', 'VALIDATION');

      const snap = await db.collection(CUSTOMER_REVIEWS_COLLECTION).doc(reviewId).get();
      if (!snap.exists) {
        throw new ReviewHttpError(404, `Review '${reviewId}' not found`, 'NOT_FOUND');
      }

      const review = serializeReviewDoc(snap.id, snap.data());
      const aggSnap = await db.collection(CUSTOMER_REVIEW_AGGREGATES_COLLECTION).doc(review.productId).get();
      const aggregate = serializeAggregateDoc(review.productId, aggSnap.exists ? aggSnap.data() : null);

      return res.json({ success: true, review, aggregate });
    } catch (err) {
      return sendError(res, err, 'Failed to load review');
    }
  };

  // Validate common review fields (rating, title, reviewText, customerDisplayName, status, media)
  function validateReviewContentFields(body: any, existing?: any) {
    const rating = Number(body?.rating ?? existing?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ReviewHttpError(400, 'rating must be an integer between 1 and 5', 'INVALID_RATING');
    }

    const title = String(body?.title ?? existing?.title ?? '').trim();
    if (!title) {
      throw new ReviewHttpError(400, 'title is required', 'VALIDATION');
    }
    if (title.length > 300) {
      throw new ReviewHttpError(400, 'title cannot exceed 300 characters', 'VALIDATION');
    }

    const reviewText = String(body?.reviewText ?? existing?.reviewText ?? '').trim();
    if (!reviewText) {
      throw new ReviewHttpError(400, 'reviewText is required', 'VALIDATION');
    }
    if (reviewText.length > 10000) {
      throw new ReviewHttpError(400, 'reviewText cannot exceed 10000 characters', 'VALIDATION');
    }

    const customerDisplayName = String(body?.customerDisplayName ?? existing?.customerDisplayName ?? '').trim();
    if (!customerDisplayName) {
      throw new ReviewHttpError(400, 'customerDisplayName is required', 'VALIDATION');
    }
    if (customerDisplayName.length > 150) {
      throw new ReviewHttpError(400, 'customerDisplayName cannot exceed 150 characters', 'VALIDATION');
    }

    const rawStatus = String(body?.status ?? existing?.status ?? 'published').trim().toLowerCase() as ReviewStatus;
    if (!ALLOWED_REVIEW_STATUSES.includes(rawStatus)) {
      throw new ReviewHttpError(
        400,
        `status must be one of: ${ALLOWED_REVIEW_STATUSES.join(', ')}`,
        'INVALID_STATUS'
      );
    }

    const media = sanitizeReviewMedia(body?.media !== undefined ? body.media : existing?.media || []);
    const mediaCount = media.length;
    const hasMedia = mediaCount > 0;

    return {
      rating,
      title,
      reviewText,
      customerDisplayName,
      status: rawStatus,
      media,
      mediaCount,
      hasMedia,
    };
  }

  // 6. POST /admin/reviews (Create)
  const handleCreateReview: express.RequestHandler = async (req, res) => {
    try {
      const body = req.body || {};
      const adminUser = (req as any).reviewAdminUser || { uid: 'admin' };

      const content = validateReviewContentFields(body);
      const relation = await validateAndResolvePurchaseRelation({
        productId: body.productId,
        customerId: body.customerId,
        orderId: body.orderId,
        orderItemId: body.orderItemId,
        adminUid: adminUser.uid,
      });

      const reviewId = db.collection(CUSTOMER_REVIEWS_COLLECTION).doc().id;
      const helpfulCount = 0;
      const rankScore = computeReviewRankScore({
        verifiedPurchase: relation.verifiedPurchase,
        hasMedia: content.hasMedia,
        helpfulCount,
      });

      const result = await persistReviewTransactionally(reviewId, async (existing) => {
        if (existing) {
          throw new ReviewHttpError(409, `Review '${reviewId}' already exists`, 'ALREADY_EXISTS');
        }
        return {
          nextDoc: {
            reviewId,
            productId: relation.productId,
            customerId: relation.customerId,
            customerDisplayName: content.customerDisplayName,
            userUid: relation.userUid,
            orderId: relation.orderId,
            orderItemId: relation.orderItemId,
            purchaseDate: relation.purchaseDate,
            verifiedPurchase: relation.verifiedPurchase,
            rating: content.rating,
            title: content.title,
            reviewText: content.reviewText,
            status: content.status,
            media: content.media,
            mediaCount: content.mediaCount,
            hasMedia: content.hasMedia,
            helpfulCount,
            rankScore,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        };
      });

      return res.status(201).json({
        success: true,
        review: result.review,
        aggregates: result.aggregates,
      });
    } catch (err) {
      return sendError(res, err, 'Failed to create customer review');
    }
  };

  // 7. PATCH / PUT /admin/reviews/:reviewId (Edit)
  const handleUpdateReview: express.RequestHandler = async (req, res) => {
    try {
      const reviewId = String(req.params.reviewId || '').trim();
      if (!reviewId) throw new ReviewHttpError(400, 'reviewId is required', 'VALIDATION');

      const body = req.body || {};
      const adminUser = (req as any).reviewAdminUser || { uid: 'admin' };

      const existingSnap = await db.collection(CUSTOMER_REVIEWS_COLLECTION).doc(reviewId).get();
      if (!existingSnap.exists) {
        throw new ReviewHttpError(404, `Review '${reviewId}' not found`, 'NOT_FOUND');
      }
      const existingData = { reviewId: existingSnap.id, ...(existingSnap.data() as any) };

      const content = validateReviewContentFields(body, existingData);

      const nextProductId = String(body.productId ?? existingData.productId ?? '').trim();
      const nextCustomerId = String(body.customerId ?? existingData.customerId ?? '').trim();
      const nextOrderId = String(body.orderId ?? existingData.orderId ?? '').trim();
      const nextOrderItemId = String(body.orderItemId ?? existingData.orderItemId ?? '').trim();

      const relation = await validateAndResolvePurchaseRelation({
        productId: nextProductId,
        customerId: nextCustomerId,
        orderId: nextOrderId,
        orderItemId: nextOrderItemId,
        adminUid: adminUser.uid,
      });

      const helpfulCount = Math.max(0, Math.trunc(Number(existingData.helpfulCount) || 0));
      const rankScore = computeReviewRankScore({
        verifiedPurchase: relation.verifiedPurchase,
        hasMedia: content.hasMedia,
        helpfulCount,
      });

      const result = await persistReviewTransactionally(reviewId, async (cur) => {
        if (!cur) throw new ReviewHttpError(404, `Review '${reviewId}' not found`, 'NOT_FOUND');
        return {
          nextDoc: {
            reviewId,
            productId: relation.productId,
            customerId: relation.customerId,
            customerDisplayName: content.customerDisplayName,
            userUid: relation.userUid,
            orderId: relation.orderId,
            orderItemId: relation.orderItemId,
            purchaseDate: relation.purchaseDate,
            verifiedPurchase: relation.verifiedPurchase,
            rating: content.rating,
            title: content.title,
            reviewText: content.reviewText,
            status: content.status,
            media: content.media,
            mediaCount: content.mediaCount,
            hasMedia: content.hasMedia,
            helpfulCount,
            rankScore,
            createdAt: cur.createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        };
      });

      return res.json({
        success: true,
        review: result.review,
        aggregates: result.aggregates,
      });
    } catch (err) {
      return sendError(res, err, 'Failed to update customer review');
    }
  };

  // 8. DELETE /admin/reviews/:reviewId
  const handleDeleteReview: express.RequestHandler = async (req, res) => {
    try {
      const reviewId = String(req.params.reviewId || '').trim();
      if (!reviewId) throw new ReviewHttpError(400, 'reviewId is required', 'VALIDATION');

      const existingSnap = await db.collection(CUSTOMER_REVIEWS_COLLECTION).doc(reviewId).get();
      if (!existingSnap.exists) {
        throw new ReviewHttpError(404, `Review '${reviewId}' not found`, 'NOT_FOUND');
      }

      const result = await persistReviewTransactionally(reviewId, async () => ({ nextDoc: null }));
      return res.json({
        success: true,
        deletedReviewId: reviewId,
        aggregates: result.aggregates,
      });
    } catch (err) {
      return sendError(res, err, 'Failed to delete customer review');
    }
  };

  // 9. POST /admin/reviews/upload-media
  const handleUploadMedia: express.RequestHandler = async (req, res) => {
    try {
      const file = req.file;
      const productId = String(req.body?.productId || 'general').trim().replace(/[^A-Za-z0-9_-]/g, '_');
      if (!file) throw new ReviewHttpError(400, 'Missing media file', 'VALIDATION');

      const isImage = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
      const isVideo = file.mimetype.startsWith('video/');
      if (!isImage && !isVideo) {
        throw new ReviewHttpError(415, 'Only image (JPEG, PNG, WebP, GIF) and video files are supported', 'UNSUPPORTED_MEDIA');
      }
      if (isImage && file.size > 10 * 1024 * 1024) {
        throw new ReviewHttpError(413, 'Image file exceeds the 10MB limit', 'FILE_TOO_LARGE');
      }
      if (isVideo && file.size > 50 * 1024 * 1024) {
        throw new ReviewHttpError(413, 'Video file exceeds the 50MB limit', 'FILE_TOO_LARGE');
      }

      const ext = file.originalname.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || (isVideo ? 'mp4' : 'jpg');
      const mediaId = `media_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const storagePath = `reviews/${productId}/${mediaId}.${ext}`;

      const fileRef = storage.bucket().file(storagePath);
      await fileRef.save(file.buffer, {
        metadata: { contentType: file.mimetype },
        resumable: false,
      });

      const expires = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
      const [downloadUrl] = await fileRef.getSignedUrl({ action: 'read', expires });

      const mediaItem: ReviewMediaItem = {
        mediaId,
        url: downloadUrl,
        storagePath,
        type: isVideo ? 'video' : 'image',
        contentType: file.mimetype,
        fileName: file.originalname.slice(0, 200),
        fileSize: file.size,
      };

      return res.status(201).json({ success: true, media: mediaItem });
    } catch (err) {
      return sendError(res, err, 'Failed to upload review media');
    }
  };

  // 10. POST /admin/reviews/reconcile
  const handleReconcileAggregates: express.RequestHandler = async (_req, res) => {
    try {
      const report = await reconcileAllReviewAggregates(db);
      return res.json({ success: true, ...report });
    } catch (err) {
      return sendError(res, err, 'Failed to reconcile review aggregates');
    }
  };

  const prefixes = ['/api/admin/reviews', '/admin/reviews'];
  for (const prefix of prefixes) {
    app.get(`${prefix}/products`, requireAdmin, handleGetProducts);
    app.get(`${prefix}/eligible-customers`, requireAdmin, handleGetEligibleCustomers);
    app.get(`${prefix}/eligible-orders`, requireAdmin, handleGetEligibleOrders);
    app.post(`${prefix}/upload-media`, requireAdmin, uploader.single('file'), handleUploadMedia);
    app.post(`${prefix}/reconcile`, requireAdmin, handleReconcileAggregates);
    app.get(prefix, requireAdmin, handleListReviews);
    app.get(`${prefix}/:reviewId`, requireAdmin, handleGetReviewById);
    app.post(prefix, requireAdmin, handleCreateReview);
    app.patch(`${prefix}/:reviewId`, requireAdmin, handleUpdateReview);
    app.put(`${prefix}/:reviewId`, requireAdmin, handleUpdateReview);
    app.delete(`${prefix}/:reviewId`, requireAdmin, handleDeleteReview);
  }
}
