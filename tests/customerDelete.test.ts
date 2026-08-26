import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Helper function implementing authoritative customer cascade delete logic
export async function executeCascadingCustomerDelete(
  id: string,
  collections: {
    customers: any[];
    customer_delivery_addresses: any[];
    referrals: any[];
    referral_links: any[];
    customer_indexes: any[];
    audit_logs: any[];
  }
) {
  const targetCustomer = collections.customers.find((c) => c.id === id);
  if (!targetCustomer) return;

  const customerIdVal = targetCustomer.customerId || id;
  const refCodeVal = targetCustomer.referralCode || "";
  const mobileVal = targetCustomer.mobileNumber || "";
  const emailVal = targetCustomer.email || "";
  const nameVal = targetCustomer.name || "";

  // 1. Delete linked delivery addresses
  collections.customer_delivery_addresses = collections.customer_delivery_addresses.filter(
    (addr) =>
      !(
        addr.customerId === id ||
        addr.customerId === customerIdVal ||
        addr.userId === id ||
        (mobileVal && addr.mobileNumber === mobileVal)
      )
  );

  // 2. Delete linked referral link records from referrals and referral_links
  collections.referrals = collections.referrals.filter(
    (r) =>
      !(
        r.id === id ||
        r.referralId === id ||
        r.referralId === customerIdVal ||
        (refCodeVal && r.referralId === refCodeVal) ||
        r.userId === id ||
        (mobileVal && r.mobileNumber === mobileVal) ||
        (emailVal && r.email === emailVal)
      )
  );

  collections.referral_links = collections.referral_links.filter(
    (link) =>
      !(
        link.id === id ||
        link.customerId === id ||
        link.customerId === customerIdVal ||
        (refCodeVal && link.referralCode === refCodeVal) ||
        (mobileVal && link.mobileNumber === mobileVal)
      )
  );

  // 3. Delete linked index table entries
  collections.customer_indexes = collections.customer_indexes.filter(
    (idx) =>
      !(
        idx.id === id ||
        idx.customerId === id ||
        idx.customerId === customerIdVal ||
        (refCodeVal && idx.referralCode === refCodeVal) ||
        (mobileVal && idx.mobileNumber === mobileVal)
      )
  );

  // 4. Update corresponding referral ID and referral name to empty ("") in remaining customers & referrals
  collections.customers = collections.customers
    .filter((c) => c.id !== id)
    .map((c) => {
      const updated = { ...c };
      if (
        c.referredById === id ||
        c.referredById === customerIdVal ||
        (refCodeVal && c.referredById === refCodeVal)
      ) {
        updated.referredById = "";
      }
      if (
        c.parentId === id ||
        c.parentId === customerIdVal ||
        (refCodeVal && c.parentId === refCodeVal)
      ) {
        updated.parentId = "";
      }
      if (
        c.partnerName &&
        (c.partnerName === nameVal ||
          (targetCustomer.partnerName && c.partnerName === targetCustomer.partnerName))
      ) {
        updated.partnerName = "";
      }
      return updated;
    });

  collections.referrals = collections.referrals.map((r) => {
    const updated = { ...r };
    if (
      r.referredById === id ||
      r.referredById === customerIdVal ||
      (refCodeVal && r.referredById === refCodeVal)
    ) {
      updated.referredById = "";
    }
    if (
      r.parentId === id ||
      r.parentId === customerIdVal ||
      (refCodeVal && r.parentId === refCodeVal)
    ) {
      updated.parentId = "";
    }
    return updated;
  });

  // 5. Add audit log
  collections.audit_logs.push({
    timestamp: new Date().toISOString(),
    user: "System",
    action: "CUSTOMER_PURGED",
    details: `Deleted customer ${nameVal} (${id})`,
    status: "success",
  });
}

describe("Customer Cascading Deletion Unit Test Suite", () => {
  it("1. Verifies linked delivery address records are deleted when customer is deleted", async () => {
    const collections = {
      customers: [
        { id: "cust_101", customerId: "CUST101", name: "Alice", mobileNumber: "9876543210" },
        { id: "cust_102", customerId: "CUST102", name: "Bob", mobileNumber: "9876543211" },
      ],
      customer_delivery_addresses: [
        { id: "addr_1", customerId: "cust_101", addressLine: "Address Line 1" },
        { id: "addr_2", customerId: "CUST101", addressLine: "Address Line 2" },
        { id: "addr_3", customerId: "cust_102", addressLine: "Address Line 3" },
      ],
      referrals: [],
      referral_links: [],
      customer_indexes: [],
      audit_logs: [],
    };

    await executeCascadingCustomerDelete("cust_101", collections);

    assert.equal(collections.customers.length, 1);
    assert.equal(collections.customers[0].id, "cust_102");
    assert.equal(collections.customer_delivery_addresses.length, 1);
    assert.equal(collections.customer_delivery_addresses[0].id, "addr_3");
  });

  it("2. Verifies linked referral link table entries and index tables are deleted", async () => {
    const collections = {
      customers: [
        { id: "cust_201", customerId: "CUST201", name: "Charlie", referralCode: "REF201", mobileNumber: "9998887770" },
      ],
      customer_delivery_addresses: [],
      referrals: [
        { id: "ref_rec_1", referralId: "REF201", name: "Charlie Partner Link" },
        { id: "ref_rec_2", referralId: "REF999", name: "Other Partner Link" },
      ],
      referral_links: [
        { id: "link_1", customerId: "CUST201", referralCode: "REF201" },
      ],
      customer_indexes: [
        { id: "idx_1", customerId: "CUST201", referralCode: "REF201" },
        { id: "idx_2", customerId: "CUST999", referralCode: "REF999" },
      ],
      audit_logs: [],
    };

    await executeCascadingCustomerDelete("cust_201", collections);

    assert.equal(collections.customers.length, 0);
    assert.equal(collections.referrals.length, 1);
    assert.equal(collections.referrals[0].id, "ref_rec_2");
    assert.equal(collections.referral_links.length, 0);
    assert.equal(collections.customer_indexes.length, 1);
    assert.equal(collections.customer_indexes[0].id, "idx_2");
  });

  it("3. Verifies corresponding referral ID and referral name change to empty in downlines", async () => {
    const collections = {
      customers: [
        { id: "cust_sponsor", customerId: "SPONSOR1", name: "Sponsor Partner", referralCode: "REF_SPONSOR" },
        { id: "cust_child1", customerId: "CHILD1", name: "Downline 1", referredById: "SPONSOR1", parentId: "cust_sponsor", partnerName: "Sponsor Partner" },
        { id: "cust_child2", customerId: "CHILD2", name: "Downline 2", referredById: "REF_SPONSOR", parentId: "SPONSOR1", partnerName: "Sponsor Partner" },
      ],
      customer_delivery_addresses: [],
      referrals: [
        { id: "ref_child", referralId: "REF_CHILD", name: "Child Partner", referredById: "SPONSOR1", parentId: "cust_sponsor" },
      ],
      referral_links: [],
      customer_indexes: [],
      audit_logs: [],
    };

    await executeCascadingCustomerDelete("cust_sponsor", collections);

    assert.equal(collections.customers.length, 2);
    const child1 = collections.customers.find(c => c.id === "cust_child1");
    const child2 = collections.customers.find(c => c.id === "cust_child2");
    const refChild = collections.referrals.find(r => r.id === "ref_child");

    assert.equal(child1.referredById, "");
    assert.equal(child1.parentId, "");
    assert.equal(child1.partnerName, "");

    assert.equal(child2.referredById, "");
    assert.equal(child2.parentId, "");
    assert.equal(child2.partnerName, "");

    assert.equal(refChild.referredById, "");
    assert.equal(refChild.parentId, "");
  });
});
