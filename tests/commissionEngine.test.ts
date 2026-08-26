import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveReferralChain,
  resolveEffectiveCommissionRate,
  calculateCommissionPreviewInternal,
  processOrderCommissionsAuthoritative,
  refundOrderCommissionsAuthoritative,
  MAX_REFERRAL_LEVEL,
} from "../src/services/commissionEngine";

// Mock Database Generator for Unit & Integration Testing
function createMockDatabase() {
  const collections: Record<string, any[]> = {
    customers: [
      { id: "cust_f", customerId: "cust_f", name: "Customer F", referredById: "cust_e", commissionEarned: 0, commissionPayable: 0 },
      { id: "cust_e", customerId: "cust_e", name: "Customer E", referredById: "cust_d", commissionEarned: 0, commissionPayable: 0 },
      { id: "cust_d", customerId: "cust_d", name: "Customer D", referredById: "cust_c", commissionEarned: 0, commissionPayable: 0 },
      { id: "cust_c", customerId: "cust_c", name: "Customer C", referredById: "cust_b", commissionEarned: 0, commissionPayable: 0 },
      { id: "cust_b", customerId: "cust_b", name: "Customer B", referredById: "cust_a", commissionEarned: 0, commissionPayable: 0 },
      { id: "cust_a", customerId: "cust_a", name: "Customer A", referredById: null, commissionEarned: 0, commissionPayable: 0 },
      { id: "cust_loop1", customerId: "cust_loop1", name: "Loop Customer 1", referredById: "cust_loop2", commissionEarned: 0, commissionPayable: 0 },
      { id: "cust_loop2", customerId: "cust_loop2", name: "Loop Customer 2", referredById: "cust_loop1", commissionEarned: 0, commissionPayable: 0 },
    ],
    users: [
      { id: "admin_user_1", name: "Admin Manager", role: "SuperAdmin" }
    ],
    referrals: [],
    sales_orders: [
      {
        id: "order_1001",
        orderNumber: "1001",
        customerId: "cust_f",
        paymentStatus: "Paid",
        deliveryStatus: "Delivered",
        products: [
          { productId: "prod_alpha", price: 1000, quantity: 1 }
        ],
        totalValue: 1000
      },
      {
        id: "order_cancelled",
        orderNumber: "1002",
        customerId: "cust_f",
        paymentStatus: "Pending",
        deliveryStatus: "Cancelled",
        products: [
          { productId: "prod_alpha", price: 500, quantity: 1 }
        ],
        totalValue: 500
      }
    ],
    commission_rules: [
      { id: "rule_default_l1", level: 1, commission_type: "Percentage", commission_value: 10, source: "Default", status: "Active" },
      { id: "rule_default_l2", level: 2, commission_type: "Percentage", commission_value: 8, source: "Default", status: "Active" },
      { id: "rule_default_l3", level: 3, commission_type: "Percentage", commission_value: 6, source: "Default", status: "Active" },
      { id: "rule_default_l4", level: 4, commission_type: "Percentage", commission_value: 4, source: "Default", status: "Active" },
      { id: "rule_default_l5", level: 5, commission_type: "Percentage", commission_value: 2, source: "Default", status: "Active" },
      { id: "rule_override_prod_l1", product_id: "prod_alpha", level: 1, commission_type: "Percentage", commission_value: 15, source: "Product", status: "Active" },
      { id: "rule_override_partner", partner_id: "cust_e", product_id: "prod_alpha", level: 1, commission_type: "Percentage", commission_value: 20, source: "Partner", status: "Active" }
    ],
    commission_transactions: [],
    performance_levels: []
  };

  const getDocsFn = async (collection: string) => collections[collection] || [];
  const saveDocFn = async (collection: string, doc: any) => {
    const list = collections[collection] || [];
    const idx = list.findIndex((item) => String(item.id) === String(doc.id));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...doc };
    } else {
      list.push(doc);
    }
    collections[collection] = list;
  };

  return { collections, getDocsFn, saveDocFn };
}

describe("Authoritative Commission Engine Test Suite", () => {

  it("1. Customer Identity & Domain Separation: CUSTOMERS is single source of truth", async () => {
    const { getDocsFn } = createMockDatabase();
    const chain = await resolveReferralChain("cust_f", getDocsFn);
    
    assert.equal(chain.length, 5);
    assert.equal(chain[0].customer.id, "cust_e");
    assert.equal(chain[1].customer.id, "cust_d");
    assert.equal(chain[2].customer.id, "cust_c");
    assert.equal(chain[3].customer.id, "cust_b");
    assert.equal(chain[4].customer.id, "cust_a");

    // Admin user cannot be used as customer
    const adminChain = await resolveReferralChain("admin_user_1", getDocsFn);
    assert.equal(adminChain.length, 0);
  });

  it("2. Maximum 5-Level Referral Traversal & Circular Protection", async () => {
    const { getDocsFn } = createMockDatabase();
    
    // Test MAX_REFERRAL_LEVEL constant
    assert.equal(MAX_REFERRAL_LEVEL, 5);

    // Test loop protection
    const loopChain = await resolveReferralChain("cust_loop1", getDocsFn);
    assert.equal(loopChain.length, 1);
    assert.equal(loopChain[0].customer.id, "cust_loop2");
  });

  it("3. Authoritative Rule Hierarchy: Partner Override > Product Rule > Default Rule", async () => {
    const { getDocsFn } = createMockDatabase();

    // Level 1 for cust_e on prod_alpha (Partner override = 20%)
    const rate1 = await resolveEffectiveCommissionRate("prod_alpha", "cust_e", 1, getDocsFn);
    assert.equal(rate1.rate, 20);
    assert.equal(rate1.source, "Partner Override");

    // Level 1 for another customer on prod_alpha (Product rule = 15%)
    const rate2 = await resolveEffectiveCommissionRate("prod_alpha", "cust_d", 1, getDocsFn);
    assert.equal(rate2.rate, 15);
    assert.equal(rate2.source, "Product Rule");

    // Level 2 for any customer on prod_alpha (System default L2 = 8%)
    const rate3 = await resolveEffectiveCommissionRate("prod_alpha", "cust_d", 2, getDocsFn);
    assert.equal(rate3.rate, 8);
    assert.equal(rate3.source, "System Default");
  });

  it("4. Commission Preview Endpoint Logic: Server calculates without persisting", async () => {
    const { getDocsFn, collections } = createMockDatabase();
    
    const preview = await calculateCommissionPreviewInternal({ orderId: "order_1001" }, getDocsFn);

    assert.equal(preview.success, true);
    assert.equal(preview.orderId, "order_1001");
    assert.equal(preview.commissions.length, 5);
    
    // Confirm nothing was written to commission_transactions
    assert.equal(collections.commission_transactions.length, 0);
  });

  it("5. Idempotency: Processing same order twice yields no duplicate commissions", async () => {
    const { getDocsFn, saveDocFn, collections } = createMockDatabase();

    // First processing run
    const run1 = await processOrderCommissionsAuthoritative("order_1001", "admin_user_1", getDocsFn, saveDocFn);
    assert.equal(run1.success, true);
    assert.equal(run1.count, 5);
    assert.equal(collections.commission_transactions.length, 5);

    // Second processing run on same order
    const run2 = await processOrderCommissionsAuthoritative("order_1001", "admin_user_1", getDocsFn, saveDocFn);
    assert.equal(run2.success, true);
    assert.equal(run2.count, 0); // Idempotency check prevented duplicate insertion!
    assert.equal(collections.commission_transactions.length, 5);
  });

  it("6. Invalid & Cancelled Orders are Rejected", async () => {
    const { getDocsFn, saveDocFn } = createMockDatabase();

    const cancelledRun = await processOrderCommissionsAuthoritative("order_cancelled", undefined, getDocsFn, saveDocFn);
    assert.equal(cancelledRun.success, false);
    assert.match(cancelledRun.error || "", /cancelled or refunded/);

    const nonExistentRun = await processOrderCommissionsAuthoritative("order_9999", undefined, getDocsFn, saveDocFn);
    assert.equal(nonExistentRun.success, false);
    assert.match(nonExistentRun.error || "", /not found/);
  });

  it("7. Atomic Wallet Balance Updating & Refund Reversal", async () => {
    const { getDocsFn, saveDocFn, collections } = createMockDatabase();

    // Process order 1001
    await processOrderCommissionsAuthoritative("order_1001", "admin_user_1", getDocsFn, saveDocFn);

    // Check Level 1 beneficiary (cust_e) wallet updated
    const custE = collections.customers.find((c) => c.id === "cust_e");
    assert.ok(custE.commissionEarned > 0);
    assert.ok(custE.commissionPayable > 0);

    const initialPayable = custE.commissionPayable;

    // Refund order 1001
    const refundRes = await refundOrderCommissionsAuthoritative("order_1001", "Order returned by customer", "admin_user_1", getDocsFn, saveDocFn);
    assert.equal(refundRes.success, true);
    assert.equal(refundRes.reversedCount, 5);

    // Check Level 1 beneficiary wallet deducted
    const custERefunded = collections.customers.find((c) => c.id === "cust_e");
    assert.equal(custERefunded.commissionPayable, 0);
  });
});
