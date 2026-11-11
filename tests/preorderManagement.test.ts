import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  registerPreorderManagementRoutes,
  PreorderManagementService,
  PREORDERS_COLLECTION,
  PREORDER_IDEMPOTENCY_COLLECTION,
  PREORDER_EVENTS_COLLECTION,
  PAYMENT_ALLOCATIONS_COLLECTION,
  PAYMENTS_COLLECTION,
  SALES_ORDERS_COLLECTION,
} from '../src/services/preorderManagementService';

// ---------------------------------------------------------------------------
// In-Memory Firestore & Auth Test Harness
// ---------------------------------------------------------------------------

class FakeDocSnapshot {
  constructor(
    public id: string,
    private rawData: Record<string, any> | undefined
  ) {}

  get exists(): boolean {
    return this.rawData !== undefined;
  }

  data(): Record<string, any> | undefined {
    return this.rawData ? structuredClone(this.rawData) : undefined;
  }

  get ref(): FakeDocRef {
    return new FakeDocRef(this.collectionMap, this.id);
  }

  private collectionMap!: Map<string, Record<string, any>>;
  bindCollection(map: Map<string, Record<string, any>>) {
    this.collectionMap = map;
    return this;
  }
}

class FakeDocRef {
  constructor(
    private collectionMap: Map<string, Record<string, any>>,
    public id: string
  ) {}

  async get(): Promise<FakeDocSnapshot> {
    const snap = new FakeDocSnapshot(this.id, this.collectionMap.get(this.id));
    snap.bindCollection(this.collectionMap);
    return snap;
  }

  async set(data: Record<string, any>, options?: { merge?: boolean }): Promise<void> {
    if (options?.merge && this.collectionMap.has(this.id)) {
      const existing = this.collectionMap.get(this.id) || {};
      this.collectionMap.set(this.id, { ...structuredClone(existing), ...structuredClone(data) });
    } else {
      this.collectionMap.set(this.id, structuredClone(data));
    }
  }

  _applySet(data: Record<string, any>, options?: { merge?: boolean }) {
    if (options?.merge && this.collectionMap.has(this.id)) {
      const existing = this.collectionMap.get(this.id) || {};
      this.collectionMap.set(this.id, { ...structuredClone(existing), ...structuredClone(data) });
    } else {
      this.collectionMap.set(this.id, structuredClone(data));
    }
  }
}

class FakeCollectionRef {
  constructor(private collectionMap: Map<string, Record<string, any>>) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.collectionMap, id);
  }

  async get(): Promise<{ docs: FakeDocSnapshot[] }> {
    const docs: FakeDocSnapshot[] = [];
    for (const [id, value] of this.collectionMap.entries()) {
      const snap = new FakeDocSnapshot(id, value);
      snap.bindCollection(this.collectionMap);
      docs.push(snap);
    }
    return { docs };
  }
}

class FakeFirestore {
  private collections = new Map<string, Map<string, Record<string, any>>>();
  public simulateTransactionFailure = false;

  constructor(seed: Record<string, Record<string, any>[]> = {}) {
    for (const [colName, docs] of Object.entries(seed)) {
      const map = new Map<string, Record<string, any>>();
      for (const doc of docs) {
        const id = String(doc.id || doc.eventId || `doc_${map.size + 1}`);
        map.set(id, structuredClone(doc));
      }
      this.collections.set(colName, map);
    }
  }

  collection(name: string): FakeCollectionRef {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return new FakeCollectionRef(this.collections.get(name)!);
  }

  dumpCollection(name: string): Record<string, any>[] {
    const map = this.collections.get(name);
    if (!map) return [];
    return Array.from(map.entries()).map(([id, data]) => ({ id, ...structuredClone(data) }));
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    // Snapshot state for atomic rollback on error
    const backup = new Map<string, Map<string, Record<string, any>>>();
    for (const [col, map] of this.collections.entries()) {
      const copy = new Map<string, Record<string, any>>();
      for (const [k, v] of map.entries()) {
        copy.set(k, structuredClone(v));
      }
      backup.set(col, copy);
    }

    const pendingWrites: Array<() => void> = [];
    const tx = {
      get: async (target: FakeDocRef | FakeCollectionRef) => {
        return target.get();
      },
      set: (docRef: FakeDocRef, data: Record<string, any>, options?: { merge?: boolean }) => {
        pendingWrites.push(() => {
          if (this.simulateTransactionFailure) {
            throw new Error('SIMULATED_FIRESTORE_WRITE_FAILURE');
          }
          docRef._applySet(data, options);
        });
      },
      update: (docRef: FakeDocRef, data: Record<string, any>) => {
        pendingWrites.push(() => {
          if (this.simulateTransactionFailure) {
            throw new Error('SIMULATED_FIRESTORE_WRITE_FAILURE');
          }
          docRef._applySet(data, { merge: true });
        });
      },
    };

    try {
      const result = await fn(tx);
      for (const writeOp of pendingWrites) {
        writeOp();
      }
      return result;
    } catch (err) {
      this.collections = backup;
      throw err;
    }
  }
}

function createFakeAuth() {
  const tokens: Record<string, { uid: string; email: string; name: string; admin?: boolean }> = {
    'admin-token': {
      uid: 'admin_uid_1',
      email: 'vamjosales@gmail.com',
      name: 'Vio Sales Admin',
      admin: true,
    },
    'sales-token': {
      uid: 'sales_uid_1',
      email: 'sales@vamjo.com',
      name: 'Sales Agent',
      admin: false,
    },
    'marketing-token': {
      uid: 'mkt_uid_1',
      email: 'review@vamjo.com',
      name: 'Review Marketing',
      admin: false,
    },
    'customer-token': {
      uid: 'cust_uid_99',
      email: 'buyer@example.com',
      name: 'Customer Buyer',
      admin: false,
    },
  };

  return {
    verifyIdToken: async (token: string) => {
      const found = tokens[token];
      if (!found) throw new Error('Invalid token');
      return found;
    },
  };
}

function buildSeedData() {
  return {
    users: [
      {
        id: 'admin_uid_1',
        name: 'Vio Sales Admin',
        email: 'vamjosales@gmail.com',
        role: 'Admin',
      },
      {
        id: 'sales_uid_1',
        name: 'Sales Agent',
        email: 'sales@vamjo.com',
        role: 'Sales',
      },
      {
        id: 'mkt_uid_1',
        name: 'Review Marketing',
        email: 'review@vamjo.com',
        role: 'Marketing',
      },
    ],
    customers: [
      {
        id: 'g4vbysfR2riHiwhq59g6',
        customerId: 'g4vbysfR2riHiwhq59g6',
        name: 'Jojo Mathew',
        email: 'jojo@example.com',
        mobileNumber: '8547856353',
        address: 'Kochi, Kerala - 682001',
        state: 'Kerala',
      },
    ],
    products: [
      {
        id: 'prod_shoes_01',
        name: ' Running Shoes for Men',
        sku: 'SHOE-MEN-01',
        price: 1699,
        onlinePrice: 1699,
        gstRate: 18,
        brand: 'Vamjo',
        brandOwner: 'Vamjo Brands Ltd',
        unit: 'NOS',
        packingSize: '1 Pair',
      },
    ],
    preorders: [
      // 1. Fully Paid via 2 stages (Advance + Balance), verified in payments table
      {
        id: 'po_full_two_stage',
        preorderId: 'po_full_two_stage',
        customerId: 'g4vbysfR2riHiwhq59g6',
        customerPhone: '+918547856353',
        productId: 'prod_shoes_01',
        productName: ' Running Shoes for Men',
        productImage: 'https://example.com/shoe.jpg',
        quantity: 1,
        originalOnlinePrice: 1699,
        totalProductValue: 1699,
        paymentType: 'partial',
        bookingAdvance: 1699,
        remainingBalance: 0,
        giftWrap: true,
        specialSuggestion: 'Deliver in morning',
        expectedDeliveryDate: '2026-11-26',
        preferredCourierAgent: 'DTDC',
        bookingStatus: 'confirmed',
        paymentStatus: 'paid',
        processingStatus: 'unprocessed',
        checkoutReference: 'ORD-ADV-1001',
        balanceCheckoutReference: 'BAL-po_full_two_stage-1002',
        createdAt: '2026-11-11T08:00:00.000Z',
        updatedAt: '2026-11-11T09:00:00.000Z',
      },
      // 2. Partially Paid (10% advance verified, balance still remaining)
      {
        id: 'po_partial_only',
        preorderId: 'po_partial_only',
        customerId: 'g4vbysfR2riHiwhq59g6',
        customerPhone: '+918547856353',
        productId: 'prod_shoes_01',
        productName: ' Running Shoes for Men',
        productImage: 'https://example.com/shoe.jpg',
        quantity: 1,
        originalOnlinePrice: 1699,
        totalProductValue: 1699,
        paymentType: 'partial',
        bookingAdvance: 169.9,
        remainingBalance: 1529.1,
        giftWrap: false,
        specialSuggestion: 'Call before delivery',
        expectedDeliveryDate: '2026-11-28',
        preferredCourierAgent: 'BlueDart',
        bookingStatus: 'confirmed',
        paymentStatus: 'partially_paid',
        processingStatus: 'unprocessed',
        checkoutReference: 'ORD-PARTIAL-2001',
        createdAt: '2026-11-11T09:30:00.000Z',
        updatedAt: '2026-11-11T09:30:00.000Z',
      },
      // 3. Unverified Paid Claim (preorder doc says paid, but payments table record is missing)
      {
        id: 'po_unverified_claim',
        preorderId: 'po_unverified_claim',
        customerId: 'g4vbysfR2riHiwhq59g6',
        customerPhone: '+918547856353',
        productId: 'prod_shoes_01',
        productName: ' Running Shoes for Men',
        quantity: 1,
        originalOnlinePrice: 1699,
        totalProductValue: 1699,
        paymentType: 'full',
        bookingAdvance: 1699,
        remainingBalance: 0,
        bookingStatus: 'confirmed',
        paymentStatus: 'paid',
        processingStatus: 'unprocessed',
        checkoutReference: 'ORD-UNVERIFIED-3001',
        createdAt: '2026-11-11T07:00:00.000Z',
        updatedAt: '2026-11-11T07:00:00.000Z',
      },
      // 4. Refunded Pre-Order (payment was refunded in payments table)
      {
        id: 'po_refunded_01',
        preorderId: 'po_refunded_01',
        customerId: 'g4vbysfR2riHiwhq59g6',
        customerPhone: '+918547856353',
        productId: 'prod_shoes_01',
        productName: ' Running Shoes for Men',
        quantity: 1,
        originalOnlinePrice: 1699,
        totalProductValue: 1699,
        paymentType: 'full',
        bookingAdvance: 1699,
        remainingBalance: 0,
        bookingStatus: 'confirmed',
        paymentStatus: 'paid',
        processingStatus: 'unprocessed',
        checkoutReference: 'ORD-REFUNDED-4001',
        createdAt: '2026-11-11T06:00:00.000Z',
        updatedAt: '2026-11-11T06:00:00.000Z',
      },
      // 5. Cancelled Pre-Order
      {
        id: 'po_cancelled_01',
        preorderId: 'po_cancelled_01',
        customerId: 'g4vbysfR2riHiwhq59g6',
        customerPhone: '+918547856353',
        productId: 'prod_shoes_01',
        productName: ' Running Shoes for Men',
        quantity: 1,
        originalOnlinePrice: 1699,
        totalProductValue: 1699,
        paymentType: 'full',
        bookingAdvance: 1699,
        remainingBalance: 0,
        bookingStatus: 'cancelled',
        paymentStatus: 'paid',
        processingStatus: 'unprocessed',
        checkoutReference: 'ORD-CANCELLED-5001',
        createdAt: '2026-11-11T05:00:00.000Z',
        updatedAt: '2026-11-11T05:00:00.000Z',
      },
    ],
    payment_allocations: [
      {
        id: 'pa_1001',
        allocationId: 'pa_1001',
        checkoutReference: 'ORD-ADV-1001',
        targetType: 'preorder',
        targetId: 'po_full_two_stage',
        allocatedAmount: 169.9,
        paymentStage: 'advance',
        status: 'allocated',
        createdAt: '2026-11-11T08:00:00.000Z',
      },
      {
        id: 'pa_1002',
        allocationId: 'pa_1002',
        checkoutReference: 'BAL-po_full_two_stage-1002',
        targetType: 'preorder',
        targetId: 'po_full_two_stage',
        allocatedAmount: 1529.1,
        paymentStage: 'balance',
        status: 'allocated',
        createdAt: '2026-11-11T09:00:00.000Z',
      },
      {
        id: 'pa_2001',
        allocationId: 'pa_2001',
        checkoutReference: 'ORD-PARTIAL-2001',
        targetType: 'preorder',
        targetId: 'po_partial_only',
        allocatedAmount: 169.9,
        paymentStage: 'advance',
        status: 'allocated',
        createdAt: '2026-11-11T09:30:00.000Z',
      },
      {
        id: 'pa_4001',
        allocationId: 'pa_4001',
        checkoutReference: 'ORD-REFUNDED-4001',
        targetType: 'preorder',
        targetId: 'po_refunded_01',
        allocatedAmount: 1699,
        paymentStage: 'full',
        status: 'allocated',
        createdAt: '2026-11-11T06:00:00.000Z',
      },
      {
        id: 'pa_5001',
        allocationId: 'pa_5001',
        checkoutReference: 'ORD-CANCELLED-5001',
        targetType: 'preorder',
        targetId: 'po_cancelled_01',
        allocatedAmount: 1699,
        paymentStage: 'full',
        status: 'allocated',
        createdAt: '2026-11-11T05:00:00.000Z',
      },
    ],
    payments: [
      {
        id: 'pay_adv_1001',
        orderId: 'ORD-ADV-1001',
        amountPaid: 169.9,
        status: 'Paid',
        paymentGateway: 'Razorpay',
        paymentMethod: 'ONLINE',
        providerPaymentId: 'pay_RzpAdv1001',
        providerOrderId: 'order_RzpAdv1001',
        verifiedAt: '2026-11-11T08:00:05.000Z',
        logs: [{ status: 'VERIFIED_SUCCESS', details: 'Signature verified' }],
      },
      {
        id: 'pay_bal_1002',
        orderId: 'BAL-po_full_two_stage-1002',
        amountPaid: 1529.1,
        status: 'Paid',
        paymentGateway: 'Razorpay',
        paymentMethod: 'ONLINE',
        providerPaymentId: 'pay_RzpBal1002',
        providerOrderId: 'order_RzpBal1002',
        verifiedAt: '2026-11-11T09:00:05.000Z',
        logs: [{ status: 'VERIFIED_SUCCESS', details: 'Signature verified' }],
      },
      {
        id: 'pay_part_2001',
        orderId: 'ORD-PARTIAL-2001',
        amountPaid: 169.9,
        status: 'Paid',
        paymentGateway: 'Razorpay',
        paymentMethod: 'ONLINE',
        providerPaymentId: 'pay_RzpPart2001',
        providerOrderId: 'order_RzpPart2001',
        verifiedAt: '2026-11-11T09:30:05.000Z',
        logs: [{ status: 'VERIFIED_SUCCESS', details: 'Signature verified' }],
      },
      {
        id: 'pay_ref_4001',
        orderId: 'ORD-REFUNDED-4001',
        amountPaid: 1699,
        status: 'Refunded',
        paymentGateway: 'Razorpay',
        paymentMethod: 'ONLINE',
        providerPaymentId: 'pay_RzpRef4001',
        providerOrderId: 'order_RzpRef4001',
        verifiedAt: '2026-11-11T06:00:05.000Z',
        logs: [{ status: 'VERIFIED_SUCCESS', details: 'Signature verified' }],
      },
      {
        id: 'pay_canc_5001',
        orderId: 'ORD-CANCELLED-5001',
        amountPaid: 1699,
        status: 'Paid',
        paymentGateway: 'Razorpay',
        paymentMethod: 'ONLINE',
        providerPaymentId: 'pay_RzpCanc5001',
        providerOrderId: 'order_RzpCanc5001',
        verifiedAt: '2026-11-11T05:00:05.000Z',
        logs: [{ status: 'VERIFIED_SUCCESS', details: 'Signature verified' }],
      },
    ],
    preorder_events: [
      {
        id: 'poe_seed_1',
        eventId: 'poe_seed_1',
        preorderId: 'po_full_two_stage',
        actorId: 'g4vbysfR2riHiwhq59g6',
        actorRole: 'customer',
        eventType: 'created',
        paymentStatus: 'partially_paid',
        occurredAt: '2026-11-11T08:00:00.000Z',
      },
      {
        id: 'poe_seed_2',
        eventId: 'poe_seed_2',
        preorderId: 'po_full_two_stage',
        actorId: 'g4vbysfR2riHiwhq59g6',
        actorRole: 'customer',
        eventType: 'balance_payment_completed',
        paymentStatus: 'paid',
        occurredAt: '2026-11-11T09:00:00.000Z',
      },
    ],
    sales_orders: [],
  };
}

async function withTestServer(
  fn: (ctx: {
    baseUrl: string;
    db: FakeFirestore;
    syncedOrderIds: string[];
  }) => Promise<void>
) {
  const db = new FakeFirestore(buildSeedData());
  const auth = createFakeAuth();
  const syncedOrderIds: string[] = [];

  const app = express();
  app.use(express.json());
  registerPreorderManagementRoutes(app, {
    db: db as any,
    auth: auth as any,
    onSalesOrderCreated: async (orderId) => {
      syncedOrderIds.push(orderId);
    },
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn({ baseUrl, db, syncedOrderIds });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// ---------------------------------------------------------------------------
// Acceptance Tests (Section 10)
// ---------------------------------------------------------------------------

test('1 & 2. Authentication (401) and Role Authorization (403) on all Pre-Order Admin endpoints', async () => {
  await withTestServer(async ({ baseUrl }) => {
    // 1. Unauthenticated -> 401
    const unauthList = await fetch(`${baseUrl}/api/admin/preorders`);
    assert.equal(unauthList.status, 401);
    const unauthBody = await unauthList.json();
    assert.equal(unauthBody.code, 'UNAUTHENTICATED');

    const unauthConvert = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage/convert-to-sales-order`,
      { method: 'POST' }
    );
    assert.equal(unauthConvert.status, 401);

    // 2. Non-admin customer token -> 403
    const custRes = await fetch(`${baseUrl}/api/admin/preorders`, {
      headers: { Authorization: 'Bearer customer-token' },
    });
    assert.equal(custRes.status, 403);
    const custBody = await custRes.json();
    assert.equal(custBody.code, 'FORBIDDEN');

    // 3. Marketing role (no Pre-Order Management / Sales Orders access) -> 403
    const mktRes = await fetch(`${baseUrl}/api/admin/preorders`, {
      headers: { Authorization: 'Bearer marketing-token' },
    });
    assert.equal(mktRes.status, 403);
    const mktConvertRes = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage/convert-to-sales-order`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer marketing-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem_mkt_test_001',
        },
        body: JSON.stringify({ idempotencyKey: 'idem_mkt_test_001' }),
      }
    );
    assert.equal(mktConvertRes.status, 403);
  });
});

test('3 & 4. Filter tabs (ALL, PARTIALLY_PAID, FULLY_PAID, PROCESSED), search, sorting, and pagination', async () => {
  await withTestServer(async ({ baseUrl }) => {
    const headers = { Authorization: 'Bearer admin-token' };

    // ALL filter returns all 5 seeded preorders
    const allRes = await fetch(`${baseUrl}/api/admin/preorders?status=ALL`, { headers });
    assert.equal(allRes.status, 200);
    const allData = await allRes.json();
    assert.equal(allData.counts.ALL, 5);
    assert.equal(allData.counts.PARTIALLY_PAID, 1);
    assert.equal(allData.counts.FULLY_PAID, 1);
    assert.equal(allData.counts.PROCESSED, 0);

    // PARTIALLY_PAID filter returns only po_partial_only
    const partialRes = await fetch(`${baseUrl}/api/admin/preorders?status=PARTIALLY_PAID`, {
      headers,
    });
    const partialData = await partialRes.json();
    assert.equal(partialData.records.length, 1);
    assert.equal(partialData.records[0].preorderId, 'po_partial_only');
    assert.equal(partialData.records[0].verifiedAmountPaid, 169.9);
    assert.equal(partialData.records[0].outstandingBalance, 1529.1);
    assert.equal(partialData.records[0].canConvertToSalesOrder, false);

    // FULLY_PAID filter returns only po_full_two_stage (since po_unverified_claim, po_refunded_01, po_cancelled_01 are excluded)
    const fullRes = await fetch(`${baseUrl}/api/admin/preorders?status=FULLY_PAID`, { headers });
    const fullData = await fullRes.json();
    assert.equal(fullData.records.length, 1);
    assert.equal(fullData.records[0].preorderId, 'po_full_two_stage');
    assert.equal(fullData.records[0].advancePaid, 169.9);
    assert.equal(fullData.records[0].subsequentVerifiedPaid, 1529.1);
    assert.equal(fullData.records[0].verifiedAmountPaid, 1699);
    assert.equal(fullData.records[0].outstandingBalance, 0);
    assert.equal(fullData.records[0].paymentsTableVerified, true);
    assert.equal(fullData.records[0].canConvertToSalesOrder, true);

    // Search by balance checkout reference
    const searchRes = await fetch(
      `${baseUrl}/api/admin/preorders?status=ALL&search=BAL-po_full_two_stage-1002`,
      { headers }
    );
    const searchData = await searchRes.json();
    assert.equal(searchData.records.length, 1);
    assert.equal(searchData.records[0].preorderId, 'po_full_two_stage');

    // Search by customer name
    const custSearchRes = await fetch(
      `${baseUrl}/api/admin/preorders?status=ALL&search=Jojo%20Mathew`,
      { headers }
    );
    const custSearchData = await custSearchRes.json();
    assert.equal(custSearchData.records.length, 5);

    // Invalid filter returns 400 INVALID_FILTER
    const badFilterRes = await fetch(`${baseUrl}/api/admin/preorders?status=BOGUS`, { headers });
    assert.equal(badFilterRes.status, 400);
    const badFilterData = await badFilterRes.json();
    assert.equal(badFilterData.code, 'INVALID_FILTER');
  });
});

test('5 & 6. Partially Paid, Unverified in payments table, Refunded, and Cancelled pre-orders cannot be converted', async () => {
  await withTestServer(async ({ baseUrl, db }) => {
    const headers = {
      Authorization: 'Bearer admin-token',
      'Content-Type': 'application/json',
    };

    // 5. Partially paid conversion rejected -> 422 NOT_FULLY_PAID
    const partialConv = await fetch(
      `${baseUrl}/api/admin/preorders/po_partial_only/convert-to-sales-order`,
      {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': 'idem_partial_001' },
        body: JSON.stringify({ idempotencyKey: 'idem_partial_001' }),
      }
    );
    assert.equal(partialConv.status, 422);
    const partialConvBody = await partialConv.json();
    assert.equal(partialConvBody.code, 'NOT_FULLY_PAID');

    // 6a. Unverified payment claim (missing in payments table) -> 422 PAYMENT_UNVERIFIED
    const unverifiedConv = await fetch(
      `${baseUrl}/api/admin/preorders/po_unverified_claim/convert-to-sales-order`,
      {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': 'idem_unverified_001' },
        body: JSON.stringify({ idempotencyKey: 'idem_unverified_001' }),
      }
    );
    assert.equal(unverifiedConv.status, 422);
    const unverifiedBody = await unverifiedConv.json();
    assert.equal(unverifiedBody.code, 'PAYMENT_UNVERIFIED');

    // 6b. Refunded pre-order -> 409 CONVERSION_CONFLICT
    const refundedConv = await fetch(
      `${baseUrl}/api/admin/preorders/po_refunded_01/convert-to-sales-order`,
      {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': 'idem_refunded_001' },
        body: JSON.stringify({ idempotencyKey: 'idem_refunded_001' }),
      }
    );
    assert.equal(refundedConv.status, 409);
    const refundedBody = await refundedConv.json();
    assert.equal(refundedBody.code, 'CONVERSION_CONFLICT');

    // 6c. Cancelled pre-order -> 409 CONVERSION_CONFLICT
    const cancelledConv = await fetch(
      `${baseUrl}/api/admin/preorders/po_cancelled_01/convert-to-sales-order`,
      {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': 'idem_cancelled_001' },
        body: JSON.stringify({ idempotencyKey: 'idem_cancelled_001' }),
      }
    );
    assert.equal(cancelledConv.status, 409);
    const cancelledBody = await cancelledConv.json();
    assert.equal(cancelledBody.code, 'CONVERSION_CONFLICT');

    // Verify zero sales_orders were created
    assert.equal(db.dumpCollection(SALES_ORDERS_COLLECTION).length, 0);
  });
});

test('7 & 8 & 10. Eligible Fully Paid pre-order converts atomically, is idempotent, and logs audit events', async () => {
  await withTestServer(async ({ baseUrl, db, syncedOrderIds }) => {
    const headers = {
      Authorization: 'Bearer admin-token',
      'Content-Type': 'application/json',
    };

    // Check details & eligibility before conversion
    const detailBeforeRes = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage`,
      { headers: { Authorization: 'Bearer admin-token' } }
    );
    assert.equal(detailBeforeRes.status, 200);
    const detailBefore = await detailBeforeRes.json();
    assert.equal(detailBefore.conversionEligibility.eligible, true);
    assert.equal(detailBefore.paymentSummary.verifiedNetPaid, 1699);
    assert.equal(detailBefore.paymentSummary.outstandingBalance, 0);

    // 7a. Reject client-supplied paymentStatus / salesTotal with 400 UNKNOWN_FIELDS
    const badBodyRes = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage/convert-to-sales-order`,
      {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': 'idem_bad_body_001' },
        body: JSON.stringify({
          idempotencyKey: 'idem_bad_body_001',
          paymentStatus: 'Paid',
          salesTotal: 100,
        }),
      }
    );
    assert.equal(badBodyRes.status, 400);
    const badBodyData = await badBodyRes.json();
    assert.equal(badBodyData.code, 'UNKNOWN_FIELDS');

    // 7b. Convert to Sales Order with valid body
    const convertRes = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage/convert-to-sales-order`,
      {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': 'idem_convert_success_001' },
        body: JSON.stringify({
          idempotencyKey: 'idem_convert_success_001',
          notes: 'Verified full payment in payments table',
        }),
      }
    );
    assert.equal(convertRes.status, 200);
    const convertData = await convertRes.json();
    assert.equal(convertData.success, true);
    assert.equal(convertData.salesOrderId, 'ORD-PO-po_full_two_stage');
    assert.equal(convertData.idempotentReplay, false);
    assert.equal(syncedOrderIds.includes('ORD-PO-po_full_two_stage'), true);

    // Verify sales_orders document
    const salesOrders = db.dumpCollection(SALES_ORDERS_COLLECTION);
    assert.equal(salesOrders.length, 1);
    assert.equal(salesOrders[0].id, 'ORD-PO-po_full_two_stage');
    assert.equal(salesOrders[0].sourcePreorderId, 'po_full_two_stage');
    assert.equal(salesOrders[0].totalAmount, 1699);
    assert.equal(salesOrders[0].paymentStatus, 'Paid');

    // 8a. Replay with same Idempotency-Key returns 200 idempotentReplay: true and does not duplicate sales_orders
    const replayRes = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage/convert-to-sales-order`,
      {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': 'idem_convert_success_001' },
        body: JSON.stringify({ idempotencyKey: 'idem_convert_success_001' }),
      }
    );
    assert.equal(replayRes.status, 200);
    const replayData = await replayRes.json();
    assert.equal(replayData.idempotentReplay, true);
    assert.equal(replayData.salesOrderId, 'ORD-PO-po_full_two_stage');
    assert.equal(db.dumpCollection(SALES_ORDERS_COLLECTION).length, 1);

    // 8b. Attempt conversion again with a different Idempotency-Key returns 409 ALREADY_PROCESSED
    const secondAttemptRes = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage/convert-to-sales-order`,
      {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': 'idem_convert_second_002' },
        body: JSON.stringify({ idempotencyKey: 'idem_convert_second_002' }),
      }
    );
    assert.equal(secondAttemptRes.status, 409);
    const secondAttemptData = await secondAttemptRes.json();
    assert.equal(secondAttemptData.code, 'ALREADY_PROCESSED');
    assert.equal(db.dumpCollection(SALES_ORDERS_COLLECTION).length, 1);

    // Verify PROCESSED filter now contains po_full_two_stage and FULLY_PAID is 0
    const processedRes = await fetch(`${baseUrl}/api/admin/preorders?status=PROCESSED`, {
      headers: { Authorization: 'Bearer admin-token' },
    });
    const processedData = await processedRes.json();
    assert.equal(processedData.counts.PROCESSED, 1);
    assert.equal(processedData.counts.FULLY_PAID, 0);
    assert.equal(processedData.records[0].preorderId, 'po_full_two_stage');
    assert.equal(processedData.records[0].salesOrderId, 'ORD-PO-po_full_two_stage');
    assert.equal(processedData.records[0].canConvertToSalesOrder, false);

    // 10. Verify preorder_events audit trail
    const eventsRes = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage/events`,
      { headers: { Authorization: 'Bearer admin-token' } }
    );
    assert.equal(eventsRes.status, 200);
    const eventsData = await eventsRes.json();
    const eventTypes = eventsData.events.map((e: any) => e.eventType);
    assert.ok(eventTypes.includes('preorder.conversion_requested'));
    assert.ok(eventTypes.includes('preorder.conversion_succeeded'));
    assert.ok(eventTypes.includes('preorder.conversion_rejected'));
  });
});

test('9. Simulated sales-order creation failure leaves pre-order unprocessed and creates no sales_order', async () => {
  await withTestServer(async ({ baseUrl, db }) => {
    db.simulateTransactionFailure = true;

    const failRes = await fetch(
      `${baseUrl}/api/admin/preorders/po_full_two_stage/convert-to-sales-order`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-token',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem_fail_tx_001',
        },
        body: JSON.stringify({ idempotencyKey: 'idem_fail_tx_001' }),
      }
    );
    assert.equal(failRes.status, 500);
    const failData = await failRes.json();
    assert.equal(failData.code, 'CONVERSION_FAILED');

    // Verify no sales order was created and preorder remains unprocessed
    assert.equal(db.dumpCollection(SALES_ORDERS_COLLECTION).length, 0);
    const preorders = db.dumpCollection(PREORDERS_COLLECTION);
    const target = preorders.find((p) => p.id === 'po_full_two_stage')!;
    assert.equal(target.processingStatus, 'unprocessed');
    assert.equal(target.salesOrderId, undefined);

    // Verify preorder.conversion_failed event was logged
    const events = db
      .dumpCollection(PREORDER_EVENTS_COLLECTION)
      .filter((e) => e.preorderId === 'po_full_two_stage');
    assert.ok(events.some((e) => e.eventType === 'preorder.conversion_failed'));
  });
});
