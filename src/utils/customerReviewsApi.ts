import { auth, db, storage } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { apiFetch } from './apiFetch';

export interface ProductOption {
  productId: string;
  name: string;
  sku: string;
  category: string;
  imageUrl: string;
}

export interface EligibleCustomerOption {
  customerId: string;
  name: string;
  email: string;
  mobileNumber: string;
  userUid: string;
  qualifyingOrderCount: number;
}

export interface EligibleOrderLineItem {
  orderItemId: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
  variantLabel: string;
}

export interface EligibleOrderOption {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  purchaseDate: string;
  lineItems: EligibleOrderLineItem[];
}

export interface ReviewMediaItem {
  id: string;
  mediaId?: string;
  url: string;
  storagePath?: string;
  type: 'image' | 'video';
  fileName?: string;
}

export interface CustomerReviewRecord {
  reviewId: string;
  productId: string;
  customerId: string;
  customerDisplayName: string;
  userUid: string;
  orderId: string;
  orderItemId: string;
  purchaseDate: string | null;
  verifiedPurchase: boolean;
  rating: number;
  title: string;
  reviewText: string;
  status: 'published' | 'pending' | 'rejected' | 'hidden';
  media: ReviewMediaItem[];
  hasMedia: boolean;
  mediaCount: number;
  helpfulCount: number;
  rankScore: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProductAggregateRecord {
  productId: string;
  averageRating: number;
  distribution: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
  mediaCount: number;
  ratingCount: number;
  ratingSum: number;
  updatedAt: string | null;
}

export interface SaveReviewPayload {
  productId: string;
  customerId: string;
  customerDisplayName: string;
  orderId: string;
  orderItemId: string;
  rating: number;
  title: string;
  reviewText: string;
  status: CustomerReviewRecord['status'];
  media: ReviewMediaItem[];
}

const REVIEWS_COL = 'customer_reviews';
const AGGREGATES_COL = 'customer_review_aggregates';
const PRODUCTS_COL = 'products';
const CUSTOMERS_COL = 'customers';
const ORDERS_COL = 'sales_orders';

const DISQUALIFIED_ORDER_STATUSES = new Set([
  'cancelled',
  'canceled',
  'rejected',
  'failed',
  'void',
  'voided',
  'draft',
]);

const DISQUALIFIED_PAYMENT_STATUSES = new Set([
  'unpaid',
  'failed',
  'cancelled',
  'canceled',
  'refunded',
  'voided',
]);

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

function normalizePhone10(value: unknown): string {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function isQualifyingPurchaseOrder(order: any): boolean {
  if (!order || typeof order !== 'object') return false;
  const orderStatus = String(order.orderStatus ?? order.status ?? '').trim().toLowerCase();
  const paymentStatus = String(order.paymentStatus ?? '').trim().toLowerCase();
  const deliveryStatus = String(order.deliveryStatus ?? '').trim().toLowerCase();

  if (orderStatus && DISQUALIFIED_ORDER_STATUSES.has(orderStatus)) return false;
  if (paymentStatus && DISQUALIFIED_PAYMENT_STATUSES.has(paymentStatus)) return false;
  if (deliveryStatus === 'cancelled' || deliveryStatus === 'canceled') return false;
  return true;
}

function extractOrderLineItems(order: any): EligibleOrderLineItem[] {
  const rawItems = Array.isArray(order?.products)
    ? order.products
    : Array.isArray(order?.items)
    ? order.items
    : [];

  return rawItems.map((line: any, idx: number) => {
    const productId = String(line?.productId ?? line?.id ?? line?.product_id ?? '').trim();
    const explicitItemId = String(line?.orderItemId ?? line?.itemId ?? line?.lineItemId ?? '').trim();
    const unit = String(line?.unit || order?.unit || '').trim();
    const packingSize = String(line?.packingSize || order?.packingSize || '').trim();
    return {
      orderItemId: explicitItemId || `line-${idx}`,
      productId,
      name: String(line?.name ?? line?.productName ?? 'Product').trim(),
      quantity: Number(line?.quantity ?? line?.orderqty ?? 1) || 1,
      price: Number(line?.price ?? line?.unitPrice ?? 0) || 0,
      variantLabel: [packingSize, unit].filter(Boolean).join(' • '),
    };
  });
}

function doesOrderBelongToCustomer(order: any, customer: any): boolean {
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
    [
      customer.mobileNumber,
      customer.mobileNumberpluscode,
      customer.phone,
      customer.mobilenumberwithcountrycode,
    ]
      .map(normalizePhone10)
      .filter(Boolean)
  );

  const orderPhones = [
    order.customerMobile,
    order.shippingAddress?.mobileNumber,
    order.contactNo,
  ]
    .map(normalizePhone10)
    .filter(Boolean);

  for (const p of orderPhones) {
    if (custPhones.has(p)) return true;
  }

  return false;
}

function resolveCustomerForOrder(order: any, customers: any[]): any | null {
  if (!order || !Array.isArray(customers)) return null;
  for (const c of customers) {
    const custIds = new Set(
      [c.id, c.customerId, c.authUid].map((x) => String(x || '').trim()).filter(Boolean)
    );
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

function toIsoString(val: any): string | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (typeof val?._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString();
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  const ms = Date.parse(String(val));
  if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  return null;
}

function derivePurchaseTimestamp(order: any): Timestamp {
  const raw = order?.createdAt ?? order?.invoiceDate ?? order?.orderDate;
  if (!raw) return Timestamp.now();
  if (raw instanceof Timestamp) return raw;
  if (typeof raw?.toDate === 'function') return Timestamp.fromDate(raw.toDate());
  if (typeof raw?._seconds === 'number') {
    return new Timestamp(raw._seconds, raw._nanoseconds || 0);
  }
  if (typeof raw?.seconds === 'number') {
    return new Timestamp(raw.seconds, raw.nanoseconds || 0);
  }
  const ms = Date.parse(String(raw));
  if (!Number.isNaN(ms)) return Timestamp.fromMillis(ms);
  return Timestamp.now();
}

function serializeReviewDoc(id: string, data: any): CustomerReviewRecord {
  const rawMedia = Array.isArray(data?.media) ? data.media : [];
  const media: ReviewMediaItem[] = rawMedia.map((m: any, idx: number) => ({
    id: String(m?.mediaId || m?.id || `media_${idx}`),
    mediaId: String(m?.mediaId || m?.id || `media_${idx}`),
    url: String(m?.url || m?.downloadUrl || ''),
    storagePath: m?.storagePath ? String(m.storagePath) : '',
    type: String(m?.type || '').toLowerCase() === 'video' ? 'video' : 'image',
    fileName: m?.fileName ? String(m.fileName) : undefined,
  }));

  return {
    reviewId: String(data?.reviewId || id),
    productId: String(data?.productId || ''),
    customerId: String(data?.customerId || ''),
    customerDisplayName: String(data?.customerDisplayName || ''),
    userUid: String(data?.userUid || ''),
    orderId: String(data?.orderId || ''),
    orderItemId: String(data?.orderItemId || ''),
    purchaseDate: toIsoString(data?.purchaseDate),
    verifiedPurchase: Boolean(data?.verifiedPurchase),
    rating: Number(data?.rating) || 0,
    title: String(data?.title || ''),
    reviewText: String(data?.reviewText || ''),
    status: (data?.status as CustomerReviewRecord['status']) || 'published',
    media,
    hasMedia: media.length > 0,
    mediaCount: media.length,
    helpfulCount: Number(data?.helpfulCount) || 0,
    rankScore: Number(data?.rankScore) || 0,
    createdAt: toIsoString(data?.createdAt),
    updatedAt: toIsoString(data?.updatedAt),
  };
}

function emptyAggregate(productId: string): ProductAggregateRecord {
  return {
    productId,
    averageRating: 0,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    mediaCount: 0,
    ratingCount: 0,
    ratingSum: 0,
    updatedAt: null,
  };
}

function serializeAggregateDoc(productId: string, data: any): ProductAggregateRecord {
  if (!data) return emptyAggregate(productId);
  return {
    productId: String(data.productId || productId),
    averageRating: Number(data.averageRating) || 0,
    distribution: {
      '1': Number(data.distribution?.['1']) || 0,
      '2': Number(data.distribution?.['2']) || 0,
      '3': Number(data.distribution?.['3']) || 0,
      '4': Number(data.distribution?.['4']) || 0,
      '5': Number(data.distribution?.['5']) || 0,
    },
    mediaCount: Number(data.mediaCount) || 0,
    ratingCount: Number(data.ratingCount) || 0,
    ratingSum: Number(data.ratingSum) || 0,
    updatedAt: toIsoString(data.updatedAt),
  };
}

interface ReviewContribution {
  eligible: boolean;
  productId: string;
  rating: number;
  mediaCount: number;
}

function getContribution(rev: any): ReviewContribution {
  if (!rev || !rev.productId) {
    return { eligible: false, productId: '', rating: 0, mediaCount: 0 };
  }
  const status = String(rev.status || '').trim().toLowerCase();
  const rating = Number(rev.rating);
  const eligible = status === 'published' && Number.isInteger(rating) && rating >= 1 && rating <= 5;
  const mediaCount = Array.isArray(rev.media)
    ? rev.media.length
    : Math.max(0, Math.trunc(Number(rev.mediaCount) || 0));
  return {
    eligible,
    productId: String(rev.productId).trim(),
    rating: eligible ? rating : 0,
    mediaCount: eligible ? mediaCount : 0,
  };
}

function applyDelta(
  current: any | null,
  targetProductId: string,
  before: ReviewContribution,
  after: ReviewContribution,
  nowTs: Timestamp
) {
  const base = serializeAggregateDoc(targetProductId, current);
  if (before.eligible && before.productId === targetProductId) {
    base.ratingCount = Math.max(0, base.ratingCount - 1);
    base.ratingSum = Math.max(0, base.ratingSum - before.rating);
    base.mediaCount = Math.max(0, base.mediaCount - before.mediaCount);
    const k = String(before.rating) as '1' | '2' | '3' | '4' | '5';
    if (base.distribution[k] !== undefined) {
      base.distribution[k] = Math.max(0, base.distribution[k] - 1);
    }
  }
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
  base.averageRating = base.ratingCount > 0 ? Math.round(base.ratingSum / base.ratingCount) : 0;

  return {
    productId: targetProductId,
    averageRating: base.averageRating,
    distribution: base.distribution,
    mediaCount: base.mediaCount,
    ratingCount: base.ratingCount,
    ratingSum: base.ratingSum,
    updatedAt: nowTs,
  };
}

// ============================================================================
// Public API with automatic Static Firebase Hosting fallback
// ============================================================================

export async function fetchReviewProducts(searchQuery: string): Promise<ProductOption[]> {
  const res = await apiFetch(
    `/api/admin/reviews/products?search=${encodeURIComponent(searchQuery.trim())}&limit=100`
  );
  if (!(await isStatic(res))) {
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to load products');
    }
    return Array.isArray(data.products) ? data.products : [];
  }

  // Direct Firestore fallback
  const snap = await getDocs(collection(requireDb(), PRODUCTS_COL));
  const q = searchQuery.trim().toLowerCase();
  const list: ProductOption[] = snap.docs.map((d) => {
    const raw: any = d.data();
    return {
      productId: String(raw?.id || d.id),
      name: String(raw?.name || 'Unnamed Product'),
      sku: String(raw?.sku || ''),
      category: String(raw?.category || ''),
      imageUrl: String(raw?.imageUrl || ''),
    };
  });

  const filtered = q
    ? list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.productId.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
      )
    : list;

  return filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);
}

export async function fetchEligibleCustomersForProduct(
  productId: string
): Promise<EligibleCustomerOption[]> {
  if (!productId) return [];
  const res = await apiFetch(
    `/api/admin/reviews/eligible-customers?productId=${encodeURIComponent(productId)}`
  );
  if (!(await isStatic(res))) {
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to load eligible customers');
    }
    return Array.isArray(data.customers) ? data.customers : [];
  }

  // Direct Firestore fallback
  const d = requireDb();
  const [ordersSnap, custSnap] = await Promise.all([
    getDocs(collection(d, ORDERS_COL)),
    getDocs(collection(d, CUSTOMERS_COL)),
  ]);

  const customers = custSnap.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  }));

  const byCustomerId = new Map<string, EligibleCustomerOption>();

  for (const ordDoc of ordersSnap.docs) {
    const order: any = { ...ordDoc.data(), id: ordDoc.id };
    if (!isQualifyingPurchaseOrder(order)) continue;
    const matchingItems = extractOrderLineItems(order).filter(
      (item) => item.productId === productId
    );
    if (matchingItems.length === 0) continue;

    const matchedCust: any = resolveCustomerForOrder(order, customers);
    if (!matchedCust) continue;

    const cid = String(matchedCust.id || matchedCust.customerId).trim();
    if (!cid) continue;

    const existing = byCustomerId.get(cid);
    if (existing) {
      existing.qualifyingOrderCount += 1;
    } else {
      byCustomerId.set(cid, {
        customerId: cid,
        name: String(
          matchedCust.name ||
            matchedCust.customerName ||
            order.customerName ||
            order.shippingAddress?.name ||
            cid
        ).trim(),
        email: String(matchedCust.email || '').trim(),
        mobileNumber: String(
          matchedCust.mobileNumberpluscode ||
            matchedCust.mobileNumber ||
            order.customerMobile ||
            ''
        ).trim(),
        userUid: String(matchedCust.authUid || matchedCust.userUid || '').trim(),
        qualifyingOrderCount: 1,
      });
    }
  }

  return Array.from(byCustomerId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchEligibleOrdersForProductAndCustomer(
  productId: string,
  customerId: string
): Promise<EligibleOrderOption[]> {
  if (!productId || !customerId) return [];
  const res = await apiFetch(
    `/api/admin/reviews/eligible-orders?productId=${encodeURIComponent(
      productId
    )}&customerId=${encodeURIComponent(customerId)}`
  );
  if (!(await isStatic(res))) {
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to load qualifying customer orders');
    }
    return Array.isArray(data.orders) ? data.orders : [];
  }

  // Direct Firestore fallback
  const d = requireDb();
  const [custDocSnap, ordersSnap] = await Promise.all([
    getDoc(doc(d, CUSTOMERS_COL, customerId)),
    getDocs(collection(d, ORDERS_COL)),
  ]);

  let customerRecord: any = custDocSnap.exists()
    ? { ...custDocSnap.data(), id: custDocSnap.id }
    : null;

  if (!customerRecord) {
    const allCustSnap = await getDocs(collection(d, CUSTOMERS_COL));
    for (const cDoc of allCustSnap.docs) {
      const cData: any = cDoc.data();
      if (String(cData?.customerId || cDoc.id) === customerId) {
        customerRecord = { ...cData, id: cDoc.id };
        break;
      }
    }
  }
  if (!customerRecord) return [];

  const results: EligibleOrderOption[] = [];
  for (const ordDoc of ordersSnap.docs) {
    const order: any = { ...ordDoc.data(), id: ordDoc.id };
    if (!isQualifyingPurchaseOrder(order)) continue;
    if (!doesOrderBelongToCustomer(order, customerRecord)) continue;

    const matchingItems = extractOrderLineItems(order).filter(
      (item) => item.productId === productId
    );
    if (matchingItems.length === 0) continue;

    const purchaseTs = derivePurchaseTimestamp(order);
    results.push({
      orderId: String(order.id || ordDoc.id),
      orderNumber: String(order.orderNumber || order.id || ordDoc.id),
      orderStatus: String(order.orderStatus || order.status || 'Confirmed'),
      paymentStatus: String(order.paymentStatus || 'Paid'),
      deliveryStatus: String(order.deliveryStatus || ''),
      purchaseDate: purchaseTs.toDate().toISOString(),
      lineItems: matchingItems,
    });
  }

  return results.sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
}

export async function fetchProductAggregate(
  productId: string
): Promise<ProductAggregateRecord | null> {
  if (!productId) return null;
  const res = await apiFetch(`/api/admin/reviews/aggregates/${encodeURIComponent(productId)}`);
  if (!(await isStatic(res))) {
    const data = await res.json().catch(() => null);
    if (res.ok && data?.aggregate) return data.aggregate;
    return emptyAggregate(productId);
  }

  const snap = await getDoc(doc(requireDb(), AGGREGATES_COL, productId));
  return snap.exists() ? serializeAggregateDoc(productId, snap.data()) : emptyAggregate(productId);
}

export async function fetchCustomerReviews(
  productIdFilter?: string
): Promise<CustomerReviewRecord[]> {
  const query = productIdFilter ? `?productId=${encodeURIComponent(productIdFilter)}` : '';
  const res = await apiFetch(`/api/admin/reviews${query}`);
  if (!(await isStatic(res))) {
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to load customer reviews');
    }
    return Array.isArray(data.reviews) ? data.reviews : [];
  }

  const snap = await getDocs(collection(requireDb(), REVIEWS_COL));
  const list = snap.docs.map((d) => serializeReviewDoc(d.id, d.data()));
  const filtered = productIdFilter
    ? list.filter((r) => r.productId === productIdFilter)
    : list;

  return filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function uploadReviewMediaFile(
  file: File,
  productId: string
): Promise<ReviewMediaItem> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetProd = productId || 'general';
  const storagePath = `reviews/${targetProd}/${Date.now()}_${safeName}`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('storagePath', storagePath);

  const res = await apiFetch('/api/uploads', {
    method: 'POST',
    body: formData,
  });

  if (!(await isStatic(res))) {
    const data = await res.json();
    if (!res.ok || !data?.file?.downloadUrl) {
      throw new Error(data?.error || 'Failed to upload review media');
    }
    return {
      id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      url: data.file.downloadUrl,
      storagePath: data.file.storagePath,
      type: file.type.startsWith('video/') ? 'video' : 'image',
      fileName: data.file.fileName || file.name,
    };
  }

  // Direct Firebase Storage upload fallback for static hosting
  if (!storage) throw new Error('Firebase Storage is not initialized.');
  const fileRef = sRef(storage, storagePath);
  await uploadBytes(fileRef, file, { contentType: file.type });
  const downloadUrl = await getDownloadURL(fileRef);

  return {
    id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    url: downloadUrl,
    storagePath,
    type: file.type.startsWith('video/') ? 'video' : 'image',
    fileName: file.name,
  };
}

export async function saveCustomerReview(
  payload: SaveReviewPayload,
  editingReviewId: string | null
): Promise<CustomerReviewRecord> {
  const url = editingReviewId
    ? `/api/admin/reviews/${encodeURIComponent(editingReviewId)}`
    : '/api/admin/reviews';
  const method = editingReviewId ? 'PATCH' : 'POST';

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!(await isStatic(res))) {
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to save customer review');
    }
    return data.review;
  }

  // Direct Firestore transactional fallback for static deployment
  const d = requireDb();
  const [prodSnap, custSnap, orderSnap] = await Promise.all([
    getDoc(doc(d, PRODUCTS_COL, payload.productId)),
    getDoc(doc(d, CUSTOMERS_COL, payload.customerId)),
    getDoc(doc(d, ORDERS_COL, payload.orderId)),
  ]);

  if (!prodSnap.exists()) {
    throw new Error(`Product '${payload.productId}' does not exist.`);
  }
  if (!custSnap.exists()) {
    throw new Error(`Customer '${payload.customerId}' does not exist.`);
  }
  if (!orderSnap.exists()) {
    throw new Error(`Sales order '${payload.orderId}' does not exist.`);
  }

  const customerData: any = { ...custSnap.data(), id: custSnap.id };
  const orderData: any = { ...orderSnap.data(), id: orderSnap.id };

  if (!isQualifyingPurchaseOrder(orderData)) {
    throw new Error(`Order '${payload.orderId}' is cancelled or unpaid and does not qualify.`);
  }
  if (!doesOrderBelongToCustomer(orderData, customerData)) {
    throw new Error(
      `Order '${payload.orderId}' does not belong to customer '${payload.customerId}'.`
    );
  }

  const matchingLineItem = extractOrderLineItems(orderData).find(
    (li) => li.orderItemId === payload.orderItemId && li.productId === payload.productId
  );
  if (!matchingLineItem) {
    throw new Error(
      `Order line item '${payload.orderItemId}' for product '${payload.productId}' was not found in order '${payload.orderId}'.`
    );
  }

  const reviewRef = editingReviewId
    ? doc(d, REVIEWS_COL, editingReviewId)
    : doc(collection(d, REVIEWS_COL));
  const reviewId = reviewRef.id;
  const purchaseTimestamp = derivePurchaseTimestamp(orderData);
  const nowTs = Timestamp.now();

  const normalizedMedia = (payload.media || []).map((m, idx) => ({
    mediaId: String(m.mediaId || m.id || `media_${idx}`),
    url: String(m.url || '').trim(),
    storagePath: String(m.storagePath || '').trim(),
    type: m.type === 'video' ? 'video' : 'image',
    ...(m.fileName ? { fileName: m.fileName } : {}),
  }));
  const mediaCount = normalizedMedia.length;
  const hasMedia = mediaCount > 0;
  const userUid = String(
    customerData.authUid || customerData.userUid || auth?.currentUser?.uid || ''
  ).trim();

  await runTransaction(d, async (tx) => {
    const existingRevSnap = await tx.get(reviewRef);
    if (editingReviewId && !existingRevSnap.exists()) {
      throw new Error(`Review '${editingReviewId}' does not exist.`);
    }

    const beforeData: any = existingRevSnap.exists() ? existingRevSnap.data() : null;
    const oldProductId = beforeData?.productId ? String(beforeData.productId).trim() : '';
    const newProductId = payload.productId;

    const newAggRef = doc(d, AGGREGATES_COL, newProductId);
    const newAggSnap = await tx.get(newAggRef);
    const oldAggRef =
      oldProductId && oldProductId !== newProductId ? doc(d, AGGREGATES_COL, oldProductId) : null;
    const oldAggSnap = oldAggRef ? await tx.get(oldAggRef) : null;

    const helpfulCount = beforeData ? Math.max(0, Math.trunc(Number(beforeData.helpfulCount) || 0)) : 0;
    const rankScore = 2 + (hasMedia ? 1 : 0) + helpfulCount;

    const reviewDocData = {
      createdAt: beforeData?.createdAt || nowTs,
      customerDisplayName: payload.customerDisplayName.trim(),
      customerId: payload.customerId,
      hasMedia,
      helpfulCount,
      media: normalizedMedia,
      mediaCount,
      orderId: payload.orderId,
      orderItemId: payload.orderItemId,
      productId: payload.productId,
      purchaseDate: purchaseTimestamp,
      rankScore,
      rating: Math.trunc(payload.rating),
      reviewId,
      reviewText: payload.reviewText.trim(),
      status: payload.status,
      title: payload.title.trim(),
      updatedAt: nowTs,
      userUid,
      verifiedPurchase: true,
    };

    const beforeContrib = getContribution(beforeData);
    const afterContrib = getContribution(reviewDocData);

    tx.set(reviewRef, reviewDocData);

    if (oldAggRef && oldProductId) {
      const updatedOldAgg = applyDelta(
        oldAggSnap?.exists() ? oldAggSnap.data() : null,
        oldProductId,
        beforeContrib,
        afterContrib,
        nowTs
      );
      tx.set(oldAggRef, updatedOldAgg);
    }

    const updatedNewAgg = applyDelta(
      newAggSnap.exists() ? newAggSnap.data() : null,
      newProductId,
      beforeContrib,
      afterContrib,
      nowTs
    );
    tx.set(newAggRef, updatedNewAgg);
  });

  const savedSnap = await getDoc(reviewRef);
  return serializeReviewDoc(reviewId, savedSnap.data());
}

export async function deleteCustomerReview(targetReviewId: string): Promise<void> {
  const res = await apiFetch(`/api/admin/reviews/${encodeURIComponent(targetReviewId)}`, {
    method: 'DELETE',
  });
  if (!(await isStatic(res))) {
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to delete review');
    }
    return;
  }

  // Direct Firestore transactional delete + aggregate update
  const d = requireDb();
  const reviewRef = doc(d, REVIEWS_COL, targetReviewId);
  const nowTs = Timestamp.now();

  await runTransaction(d, async (tx) => {
    const revSnap = await tx.get(reviewRef);
    if (!revSnap.exists()) return;
    const revData: any = revSnap.data();
    const pid = String(revData?.productId || '').trim();
    const aggRef = pid ? doc(d, AGGREGATES_COL, pid) : null;
    const aggSnap = aggRef ? await tx.get(aggRef) : null;

    tx.delete(reviewRef);

    if (aggRef && pid) {
      const updatedAgg = applyDelta(
        aggSnap?.exists() ? aggSnap.data() : null,
        pid,
        getContribution(revData),
        getContribution(null),
        nowTs
      );
      tx.set(aggRef, updatedAgg);
    }
  });
}

export async function reconcileReviewAggregates(productId?: string): Promise<{
  totalProductsChecked: number;
}> {
  const res = await apiFetch('/api/admin/reviews/reconcile-aggregates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productId ? { productId } : {}),
  });

  if (!(await isStatic(res))) {
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to reconcile aggregates');
    }
    return {
      totalProductsChecked: Number(data.productsUpdated ?? data.totalProductsChecked ?? 1),
    };
  }

  // Direct Firestore reconciliation fallback
  const d = requireDb();
  const [revSnap, aggSnap] = await Promise.all([
    getDocs(collection(d, REVIEWS_COL)),
    getDocs(collection(d, AGGREGATES_COL)),
  ]);

  const reviews = revSnap.docs.map((docSnap) => docSnap.data());
  const productIds = new Set<string>();
  if (productId) {
    productIds.add(productId);
  } else {
    reviews.forEach((r: any) => {
      if (r?.productId) productIds.add(String(r.productId).trim());
    });
    aggSnap.docs.forEach((aDoc) => productIds.add(aDoc.id));
  }

  const nowTs = Timestamp.now();
  for (const pid of productIds) {
    const agg = emptyAggregate(pid);
    for (const r of reviews) {
      if (String(r?.productId || '').trim() !== pid) continue;
      const c = getContribution(r);
      if (!c.eligible) continue;
      agg.ratingCount += 1;
      agg.ratingSum += c.rating;
      agg.mediaCount += c.mediaCount;
      const k = String(c.rating) as '1' | '2' | '3' | '4' | '5';
      agg.distribution[k] = (agg.distribution[k] || 0) + 1;
    }
    agg.averageRating = agg.ratingCount > 0 ? Math.round(agg.ratingSum / agg.ratingCount) : 0;

    await runTransaction(d, async (tx) => {
      tx.set(doc(d, AGGREGATES_COL, pid), {
        productId: pid,
        averageRating: agg.averageRating,
        distribution: agg.distribution,
        mediaCount: agg.mediaCount,
        ratingCount: agg.ratingCount,
        ratingSum: agg.ratingSum,
        updatedAt: nowTs,
      });
    });
  }

  return { totalProductsChecked: productIds.size };
}
