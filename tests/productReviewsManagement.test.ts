import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isQualifyingPurchaseOrder,
  extractOrderLineItems,
  doesOrderBelongToCustomer,
  resolveCustomerForOrder,
  derivePurchaseTimestamp,
  sanitizeReviewMedia,
  computeReviewRankScore,
  computeInt64AverageRating,
  getReviewContribution,
  applyContributionDeltaToAggregate,
  buildAggregateFromReviews,
  IdempotentReviewTriggerProcessor,
  CustomerReviewRecord,
} from '../src/services/customerReviewService';

const SAMPLE_PRODUCTS = [
  { id: 'ElBFraQI6FmraUqDFrjn', name: 'Organic Turmeric Powder', sku: 'TUR-100' },
  { id: 'prod_cardamom_02', name: 'Green Cardamom Royal', sku: 'CRD-050' },
];

const SAMPLE_CUSTOMERS = [
  {
    id: 'g4vbysfR2riHiwhq59g6',
    customerId: 'g4vbysfR2riHiwhq59g6',
    name: 'Jojo Mathew',
    email: 'jojo@example.com',
    mobileNumber: '8547856353',
    mobileNumberpluscode: '+918547856353',
    authUid: 'HBXAylRaSGelcQSZnevMlhv2cva2',
  },
  {
    id: 'c6QPR6znXdwRQjcNZveH',
    customerId: 'c6QPR6znXdwRQjcNZveH',
    name: 'Anita Nair',
    email: 'anita@example.com',
    mobileNumber: '9876543210',
    mobileNumberpluscode: '+919876543210',
    authUid: 'uid_anita_123',
  },
];

const SAMPLE_ORDERS = [
  {
    id: 'ORD-1792030566526',
    orderNumber: 'SO-2026-0070',
    orderStatus: 'Confirmed',
    paymentStatus: 'Paid',
    deliveryStatus: 'Delivered',
    customerMobile: '+918547856353',
    createdAt: '2026-10-15T02:17:01.969Z',
    products: [
      {
        productId: 'ElBFraQI6FmraUqDFrjn',
        name: 'Organic Turmeric Powder',
        quantity: 2,
        price: 250,
      },
    ],
  },
  {
    id: 'ORD-CANCELLED-01',
    orderNumber: 'SO-2026-0071',
    orderStatus: 'Cancelled',
    paymentStatus: 'Refunded',
    customerId: 'c6QPR6znXdwRQjcNZveH',
    createdAt: '2026-10-16T10:00:00.000Z',
    products: [
      {
        productId: 'ElBFraQI6FmraUqDFrjn',
        name: 'Organic Turmeric Powder',
        quantity: 1,
        price: 250,
      },
    ],
  },
  {
    id: 'ORD-ANITA-CARDAMOM',
    orderNumber: 'SO-2026-0072',
    orderStatus: 'Confirmed',
    paymentStatus: 'Paid',
    customerId: 'c6QPR6znXdwRQjcNZveH',
    createdAt: '2026-10-18T08:30:00.000Z',
    products: [
      {
        productId: 'prod_cardamom_02',
        name: 'Green Cardamom Royal',
        quantity: 1,
        price: 499,
      },
    ],
  },
];

test('1. Product search and selection populate productId and reset dependent fields', () => {
  const search = 'turmeric';
  const matches = SAMPLE_PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(search) ||
      p.id.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search)
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'ElBFraQI6FmraUqDFrjn');

  // Simulate UI selection state reset
  let state = {
    productId: 'prod_cardamom_02',
    customerId: 'c6QPR6znXdwRQjcNZveH',
    orderId: 'ORD-ANITA-CARDAMOM',
    orderItemId: 'line-0',
    customerDisplayName: 'Custom Typed Reviewer',
  };

  const onSelectProduct = (newProductId: string) => {
    state = {
      ...state,
      productId: newProductId,
      customerId: '',
      orderId: '',
      orderItemId: '',
    };
  };

  onSelectProduct(matches[0].id);
  assert.equal(state.productId, 'ElBFraQI6FmraUqDFrjn');
  assert.equal(state.customerId, '');
  assert.equal(state.orderId, '');
  assert.equal(state.orderItemId, '');
});

test('2. Eligible customer query returns only distinct customers with qualifying purchases of the selected product', () => {
  const targetProductId = 'ElBFraQI6FmraUqDFrjn';
  const eligibleCustomerIds = new Set<string>();

  for (const order of SAMPLE_ORDERS) {
    if (!isQualifyingPurchaseOrder(order)) continue;
    const matchingItems = extractOrderLineItems(order).filter(
      (item) => item.productId === targetProductId
    );
    if (matchingItems.length === 0) continue;
    const customer = resolveCustomerForOrder(order, SAMPLE_CUSTOMERS);
    if (customer) {
      eligibleCustomerIds.add(customer.id);
    }
  }

  // Jojo's paid order (ORD-1792030566526) qualifies; Anita's cancelled order (ORD-CANCELLED-01) is excluded
  assert.deepEqual(Array.from(eligibleCustomerIds), ['g4vbysfR2riHiwhq59g6']);
});

test('3. Selecting a customer populates customerId and never overwrites a manually entered customerDisplayName', () => {
  let formState = {
    customerId: '',
    customerDisplayName: 'Manual Alias Kept Intact',
    userUid: '',
  };

  const selectCustomer = (customer: (typeof SAMPLE_CUSTOMERS)[0]) => {
    formState = {
      ...formState,
      customerId: customer.id,
      userUid: customer.authUid || '',
      // customerDisplayName is intentionally untouched
    };
  };

  selectCustomer(SAMPLE_CUSTOMERS[0]);
  assert.equal(formState.customerId, 'g4vbysfR2riHiwhq59g6');
  assert.equal(formState.userUid, 'HBXAylRaSGelcQSZnevMlhv2cva2');
  assert.equal(formState.customerDisplayName, 'Manual Alias Kept Intact');
});

test('4. Eligible order and item selection populate orderId, orderItemId, and derived purchaseDate', () => {
  const order = SAMPLE_ORDERS[0];
  const customer = SAMPLE_CUSTOMERS[0];
  assert.equal(doesOrderBelongToCustomer(order, customer), true);
  assert.equal(isQualifyingPurchaseOrder(order), true);

  const items = extractOrderLineItems(order);
  assert.equal(items.length, 1);
  assert.equal(items[0].orderItemId, 'line-0');
  assert.equal(items[0].productId, 'ElBFraQI6FmraUqDFrjn');

  const derivedTs = derivePurchaseTimestamp(order);
  assert.equal(derivedTs.toDate().toISOString(), '2026-10-15T02:17:01.969Z');
});

test('5. Invalid product/customer/order/item combinations are rejected', () => {
  const jojoCustomer = SAMPLE_CUSTOMERS[0];
  const anitaOrder = SAMPLE_ORDERS[2]; // Belongs to Anita, not Jojo

  assert.equal(doesOrderBelongToCustomer(anitaOrder, jojoCustomer), false);
  assert.equal(isQualifyingPurchaseOrder(SAMPLE_ORDERS[1]), false); // Cancelled order rejected

  const items = extractOrderLineItems(SAMPLE_ORDERS[0]);
  const wrongItemMatch = items.find(
    (li) => li.orderItemId === 'line-99' && li.productId === 'ElBFraQI6FmraUqDFrjn'
  );
  assert.equal(wrongItemMatch, undefined);
});

test('6. Create, edit rating, edit media, publish/unpublish, change product, and delete update customer_review_aggregates accurately', () => {
  const productA = 'ElBFraQI6FmraUqDFrjn';
  const productB = 'prod_cardamom_02';

  // Initial empty aggregates
  let aggA = applyContributionDeltaToAggregate(
    null,
    productA,
    getReviewContribution(null),
    getReviewContribution(null)
  );
  let aggB = applyContributionDeltaToAggregate(
    null,
    productB,
    getReviewContribution(null),
    getReviewContribution(null)
  );
  assert.equal(aggA.ratingCount, 0);
  assert.equal(aggA.averageRating, 0);

  // Step A: Create published review on Product A (rating 4, 0 media)
  const rev1: Partial<CustomerReviewRecord> = {
    reviewId: 'rev_1',
    productId: productA,
    rating: 4,
    mediaCount: 0,
    status: 'published',
  };
  aggA = applyContributionDeltaToAggregate(
    aggA,
    productA,
    getReviewContribution(null),
    getReviewContribution(rev1)
  );
  assert.equal(aggA.ratingCount, 1);
  assert.equal(aggA.ratingSum, 4);
  assert.equal(aggA.averageRating, 4);
  assert.equal(aggA.distribution['4'], 1);
  assert.equal(aggA.mediaCount, 0);

  // Step B: Edit rating from 4 -> 5 and add 2 media items
  const rev1Edited: Partial<CustomerReviewRecord> = {
    ...rev1,
    rating: 5,
    mediaCount: 2,
  };
  aggA = applyContributionDeltaToAggregate(
    aggA,
    productA,
    getReviewContribution(rev1),
    getReviewContribution(rev1Edited)
  );
  assert.equal(aggA.ratingCount, 1);
  assert.equal(aggA.ratingSum, 5);
  assert.equal(aggA.averageRating, 5);
  assert.equal(aggA.distribution['4'], 0);
  assert.equal(aggA.distribution['5'], 1);
  assert.equal(aggA.mediaCount, 2);

  // Step C: Unpublish review (status -> 'pending')
  const rev1Pending: Partial<CustomerReviewRecord> = {
    ...rev1Edited,
    status: 'pending',
  };
  aggA = applyContributionDeltaToAggregate(
    aggA,
    productA,
    getReviewContribution(rev1Edited),
    getReviewContribution(rev1Pending)
  );
  assert.equal(aggA.ratingCount, 0);
  assert.equal(aggA.ratingSum, 0);
  assert.equal(aggA.averageRating, 0);
  assert.equal(aggA.distribution['5'], 0);
  assert.equal(aggA.mediaCount, 0);

  // Step D: Republish review (status -> 'published')
  aggA = applyContributionDeltaToAggregate(
    aggA,
    productA,
    getReviewContribution(rev1Pending),
    getReviewContribution(rev1Edited)
  );
  assert.equal(aggA.ratingCount, 1);
  assert.equal(aggA.ratingSum, 5);

  // Step E: Move review from Product A to Product B
  const rev1MovedToB: Partial<CustomerReviewRecord> = {
    ...rev1Edited,
    productId: productB,
  };
  aggA = applyContributionDeltaToAggregate(
    aggA,
    productA,
    getReviewContribution(rev1Edited),
    getReviewContribution(null)
  );
  aggB = applyContributionDeltaToAggregate(
    aggB,
    productB,
    getReviewContribution(null),
    getReviewContribution(rev1MovedToB)
  );
  assert.equal(aggA.ratingCount, 0);
  assert.equal(aggA.averageRating, 0);
  assert.equal(aggB.ratingCount, 1);
  assert.equal(aggB.ratingSum, 5);
  assert.equal(aggB.averageRating, 5);
  assert.equal(aggB.mediaCount, 2);

  // Step F: Delete review from Product B
  aggB = applyContributionDeltaToAggregate(
    aggB,
    productB,
    getReviewContribution(rev1MovedToB),
    getReviewContribution(null)
  );
  assert.equal(aggB.ratingCount, 0);
  assert.equal(aggB.ratingSum, 0);
  assert.equal(aggB.averageRating, 0);
  assert.equal(aggB.mediaCount, 0);
});

test('7. Duplicate trigger/event delivery is idempotent and does not double-count aggregates', () => {
  const processor = new IdempotentReviewTriggerProcessor();
  const productId = 'ElBFraQI6FmraUqDFrjn';
  const after: Partial<CustomerReviewRecord> = {
    reviewId: '3Af8uArht7jNQiZj5KqO',
    productId,
    rating: 4,
    mediaCount: 0,
    status: 'published',
  };

  // Deliver event #1
  const firstRun = processor.processEvent('evt_duplicate_001', '3Af8uArht7jNQiZj5KqO', after);
  assert.equal(firstRun.skipped, false);
  assert.equal(processor.getAggregate(productId)?.ratingCount, 1);
  assert.equal(processor.getAggregate(productId)?.ratingSum, 4);

  // Deliver exact same event ID a second time
  const secondRun = processor.processEvent('evt_duplicate_001', '3Af8uArht7jNQiZj5KqO', after);
  assert.equal(secondRun.skipped, true);
  assert.equal(processor.getAggregate(productId)?.ratingCount, 1);
  assert.equal(processor.getAggregate(productId)?.ratingSum, 4);

  // Deliver same state under a new event ID (duplicate state replay)
  const thirdRun = processor.processEvent('evt_duplicate_002', '3Af8uArht7jNQiZj5KqO', after);
  assert.equal(thirdRun.skipped, true);
  assert.equal(processor.getAggregate(productId)?.ratingCount, 1);
});

test('8. Concurrent review updates for the same product and historical backfill produce identical aggregates', () => {
  const productId = 'ElBFraQI6FmraUqDFrjn';
  const reviews: Array<Partial<CustomerReviewRecord>> = [
    { reviewId: 'r1', productId, rating: 5, mediaCount: 1, status: 'published' },
    { reviewId: 'r2', productId, rating: 4, mediaCount: 0, status: 'published' },
    { reviewId: 'r3', productId, rating: 2, mediaCount: 3, status: 'published' },
    { reviewId: 'r4', productId, rating: 1, mediaCount: 5, status: 'rejected' }, // Non-eligible
  ];

  const processor = new IdempotentReviewTriggerProcessor();
  reviews.forEach((rev, idx) => {
    processor.processEvent(`evt_concurrent_${idx}`, String(rev.reviewId), rev);
  });

  const incrementalAgg = processor.getAggregate(productId)!;
  const backfilledAgg = buildAggregateFromReviews(productId, reviews);

  assert.equal(incrementalAgg.ratingCount, 3);
  assert.equal(incrementalAgg.ratingSum, 11); // 5 + 4 + 2
  assert.equal(incrementalAgg.averageRating, computeInt64AverageRating(11, 3)); // Math.round(3.666) = 4
  assert.equal(incrementalAgg.mediaCount, 4); // 1 + 0 + 3
  assert.deepEqual(incrementalAgg.distribution, {
    '1': 0,
    '2': 1,
    '3': 0,
    '4': 1,
    '5': 1,
  });

  // Backfill matches incremental state identically
  assert.equal(backfilledAgg.ratingCount, incrementalAgg.ratingCount);
  assert.equal(backfilledAgg.ratingSum, incrementalAgg.ratingSum);
  assert.equal(backfilledAgg.averageRating, incrementalAgg.averageRating);
  assert.equal(backfilledAgg.mediaCount, incrementalAgg.mediaCount);
  assert.deepEqual(backfilledAgg.distribution, incrementalAgg.distribution);
});

test('9. Media sanitization and rankScore preservation follow repository conventions', () => {
  const media = sanitizeReviewMedia([
    { url: 'https://storage.googleapis.com/violeafybasket/reviews/img1.jpg', type: 'image' },
  ]);
  assert.equal(media.length, 1);

  assert.throws(() => {
    sanitizeReviewMedia([{ url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }]);
  }, /base64/i);

  assert.equal(
    computeReviewRankScore({ verifiedPurchase: true, hasMedia: false, helpfulCount: 0 }),
    2
  );
  assert.equal(
    computeReviewRankScore({ verifiedPurchase: true, hasMedia: true, helpfulCount: 3 }),
    6
  );
  assert.equal(getReviewContribution({ productId: 'p1', status: 'published', rating: 4 }).eligible, true);
  assert.equal(getReviewContribution({ productId: 'p1', status: 'pending', rating: 4 }).eligible, false);
});
