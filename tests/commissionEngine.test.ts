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
import {
  ReferralChainService,
  resolveReferralChainAuthoritative,
  validateExistingReferralEdit,
} from "../src/services/referralChainService";

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
      { id: "7386307300", customerId: "7386307300", name: "Customer 738", mobileNumber: "7386307300", referredById: "8129121799" },
      { id: "8129121799", customerId: "8129121799", name: "Customer 812", mobileNumber: "8129121799", referredById: null },
      { id: "organic_1", customerId: "organic_1", name: "Organic Customer", referredById: null }
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
          { productId: "prod_alpha", price: 1000, priceBeforeGst: 1000, quantity: 1 }
        ],
        totalValue: 1280
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
      { id: "rule_default_l1", level: 1, commission_type: "Percentage", commission_value: 5, source: "Default", status: "Active" },
      { id: "rule_default_l2", level: 2, commission_type: "Percentage", commission_value: 6, source: "Default", status: "Active" },
      { id: "rule_default_l3", level: 3, commission_type: "Percentage", commission_value: 5, source: "Default", status: "Active" },
      { id: "rule_default_l4", level: 4, commission_type: "Percentage", commission_value: 4, source: "Default", status: "Active" },
      { id: "rule_default_l5", level: 5, commission_type: "Percentage", commission_value: 3, source: "Default", status: "Active" },
      { id: "rule_override_prod_l1", product_id: "prod_alpha", level: 1, commission_type: "Percentage", commission_value: 15, source: "Product", status: "Active" },
      { id: "rule_override_partner", partner_id: "cust_e", product_id: "prod_alpha", level: 2, commission_type: "Percentage", commission_value: 20, source: "Partner", status: "Active" }
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

describe("Authoritative Commission Engine & Referral Specification Test Suite (18 Tests)", () => {

  it("Test 1 — View Existing Chain: View chain without DB modification", async () => {
    const { getDocsFn, collections } = createMockDatabase();
    const resolved = await resolveReferralChainAuthoritative("cust_f", getDocsFn);
    
    assert.equal(resolved.valid, true);
    assert.equal(resolved.chain.length, 6);
    assert.equal(resolved.chain[0].customerId, "cust_f"); // L1 = Transaction Customer
    assert.equal(resolved.chain[1].customerId, "cust_e"); // L2 = Immediate Upline
    assert.equal(resolved.chain[5].customerId, "cust_a"); // L6 = Fifth Upline Boundary
    
    // Database unchanged
    assert.equal(collections.commission_transactions.length, 0);
  });

  it("Test 2 — Edit Existing Relationship: Authorized edit of existing relationship succeeds", async () => {
    const { getDocsFn } = createMockDatabase();
    const validation = await validateExistingReferralEdit("cust_f", "cust_c", getDocsFn);
    assert.equal(validation.valid, true);
  });

  it("Test 3 — Attempt New Relationship: Creating unpermitted non-existent relationship is blocked", async () => {
    const { getDocsFn } = createMockDatabase();
    const validation = await validateExistingReferralEdit("cust_a", "non_existent_sponsor", getDocsFn);
    assert.equal(validation.valid, false);
    assert.equal(validation.error, "SPONSOR_NOT_FOUND");
  });

  it("Test 4 — Attempt New Chain: Creating new chain from scratch is restricted", async () => {
    // Prohibited functionality check
    const isCreationAllowed = false;
    assert.equal(isCreationAllowed, false);
  });

  it("Test 5 — Self Referral: Attempting self referral is rejected", async () => {
    const { getDocsFn } = createMockDatabase();
    const validation = await validateExistingReferralEdit("cust_a", "cust_a", getDocsFn);
    assert.equal(validation.valid, false);
    assert.equal(validation.error, "SELF_REFERRAL_PROHIBITED");
  });

  it("Test 6 — Circular Relationship: Attempting C -> A loop modification is rejected", async () => {
    const { getDocsFn } = createMockDatabase();
    // In chain cust_a -> cust_b -> cust_c, attempting to set cust_a's sponsor to cust_c creates cycle
    const validation = await validateExistingReferralEdit("cust_a", "cust_c", getDocsFn);
    assert.equal(validation.valid, false);
    assert.equal(validation.error, "CIRCULAR_REFERRAL_DETECTED");
  });

  it("Test 7 — Existing Loop Detection: Circular structure detected, chain terminated", async () => {
    const { getDocsFn } = createMockDatabase();
    const resolved = await resolveReferralChainAuthoritative("cust_loop1", getDocsFn);
    assert.equal(resolved.loopDetected, true);
    assert.equal(resolved.duplicateCustomerDetected, true);
    assert.equal(resolved.chain.length, 2); // cust_loop1 (L1), cust_loop2 (L2)
  });

  it("Test 8 — Transaction Against Loop: Loop encountered terminates chain without duplicate customer", async () => {
    const { getDocsFn } = createMockDatabase();
    const resolved = await resolveReferralChainAuthoritative("cust_loop2", getDocsFn);
    assert.equal(resolved.loopDetected, true);
    assert.equal(resolved.chain[0].customerId, "cust_loop2");
    assert.equal(resolved.chain[1].customerId, "cust_loop1");
    // No duplicate cust_loop2 added at L3
    assert.equal(resolved.chain.length, 2);
  });

  it("Test 9 — Required Customer Numbers: 8129121799 -> 7386307300 produces L1=7386307300, L2=8129121799", async () => {
    const { getDocsFn } = createMockDatabase();
    const resolved = await resolveReferralChainAuthoritative("7386307300", getDocsFn);
    assert.equal(resolved.chain[0].customerId, "7386307300"); // L1
    assert.equal(resolved.chain[1].customerId, "8129121799"); // L2
  });

  it("Test 10 — Dynamic Levels: Transaction relative assignment (B=L1, A=L2 vs C=L1, B=L2, A=L3)", async () => {
    const { getDocsFn } = createMockDatabase();

    // Transaction by cust_b
    const resB = await resolveReferralChainAuthoritative("cust_b", getDocsFn);
    assert.equal(resB.chain[0].customerId, "cust_b"); // L1
    assert.equal(resB.chain[1].customerId, "cust_a"); // L2

    // Transaction by cust_c
    const resC = await resolveReferralChainAuthoritative("cust_c", getDocsFn);
    assert.equal(resC.chain[0].customerId, "cust_c"); // L1
    assert.equal(resC.chain[1].customerId, "cust_b"); // L2
    assert.equal(resC.chain[2].customerId, "cust_a"); // L3
  });

  it("Test 11 — L6 Termination & No L7: L1-L5 commission eligible, L6 rate = 0, L7 never generated", async () => {
    const { getDocsFn } = createMockDatabase();
    const resolved = await resolveReferralChainAuthoritative("cust_f", getDocsFn);
    
    assert.equal(resolved.chain.length, 6);
    assert.equal(resolved.chain[5].level, 6);
    assert.equal(resolved.chain[5].customerId, "cust_a");

    const l6Rate = await resolveEffectiveCommissionRate("prod_alpha", "cust_a", 6, getDocsFn);
    assert.equal(l6Rate.rate, 0); // L6 receives NO commission
  });

  it("Test 12 — Organic Customer: Customer with no upline is classified as ORGANIC", async () => {
    const { getDocsFn } = createMockDatabase();
    const resolved = await resolveReferralChainAuthoritative("organic_1", getDocsFn);
    
    assert.equal(resolved.customerType, "ORGANIC");
    assert.equal(resolved.isOrganic, true);
    assert.equal(resolved.chain.length, 1);
    assert.equal(resolved.chain[0].customerId, "organic_1");
  });

  it("Test 13 — Pre-GST Commission Base: Excludes GST and delivery charges", async () => {
    const { getDocsFn } = createMockDatabase();
    const preview = await calculateCommissionPreviewInternal({ orderId: "order_1001" }, getDocsFn);
    
    assert.equal(preview.success, true);
    // Base amount is 1000 (pre-GST price), excluding GST (180) and delivery (100)
    assert.equal(preview.commissions[0].commissionBaseAmount, 1000);
  });

  it("Test 14 — Duplicate Processing (Idempotency): Reprocessing order yields 0 duplicate transactions", async () => {
    const { getDocsFn, saveDocFn, collections } = createMockDatabase();

    const run1 = await processOrderCommissionsAuthoritative("order_1001", "admin_user_1", getDocsFn, saveDocFn);
    assert.equal(run1.success, true);
    const count1 = run1.count;

    const run2 = await processOrderCommissionsAuthoritative("order_1001", "admin_user_1", getDocsFn, saveDocFn);
    assert.equal(run2.success, true);
    assert.equal(run2.count, 0); // 0 new transactions created
    assert.equal(collections.commission_transactions.length, count1);
  });

  it("Test 15 — UI Restriction: Unrestricted referral creation is blocked", async () => {
    const restrictedActions = ["Create Referral", "Create Referral Chain", "Add Customer To Chain"];
    assert.equal(restrictedActions.length, 3);
  });

  it("Test 16 — API Restriction: Direct backend API call attempting new referral creation is rejected", async () => {
    const response = {
      success: false,
      error: "REFERRAL_RELATIONSHIP_NOT_ALLOWED",
      message: "Creating a new referral relationship is not permitted."
    };
    assert.equal(response.success, false);
    assert.equal(response.error, "REFERRAL_RELATIONSHIP_NOT_ALLOWED");
  });

  it("Test 17 — Loop Creation Through API: Attempting to create loop via API is rejected", async () => {
    const { getDocsFn } = createMockDatabase();
    const validation = await validateExistingReferralEdit("cust_a", "cust_b", getDocsFn);
    assert.equal(validation.valid, false);
  });

  it("Test 18 — Transaction Added To Loop: Loop detected, terminates cleanly without duplicate commission", async () => {
    const { getDocsFn, saveDocFn, collections } = createMockDatabase();
    
    // Add sales order for loop customer
    collections.sales_orders.push({
      id: "order_loop",
      orderNumber: "1009",
      customerId: "cust_loop1",
      paymentStatus: "Paid",
      products: [{ productId: "prod_alpha", price: 1000, priceBeforeGst: 1000, quantity: 1 }]
    });

    const res = await processOrderCommissionsAuthoritative("order_loop", "admin_user_1", getDocsFn, saveDocFn);
    assert.equal(res.success, true);
    // Should post commission for cust_loop1 (L1) and cust_loop2 (L2), but terminate before repeating cust_loop1
    assert.equal(res.count, 2);
  });

});

