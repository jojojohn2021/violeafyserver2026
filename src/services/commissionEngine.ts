import { adminDb } from "../../firebase-admin";
import {
  resolveReferralChainAuthoritative,
  findCustomerInCollections,
  ResolvedChainResult,
  ChainMember,
} from "./referralChainService";

export interface CommissionItemCalculation {
  productId: string;
  orderItemId: string;
  beneficiaryCustomerId: string;
  beneficiaryCustomerName?: string;
  level: number;
  commissionRate: number;
  commissionBaseAmount: number;
  commissionAmount: number;
  ruleId: string;
  ruleSource: string;
}

export interface CommissionPreviewResult {
  success: boolean;
  orderId?: string;
  customerId?: string;
  customerType?: 'ORGANIC' | 'REFERRED';
  commissions: CommissionItemCalculation[];
  totalCommission: number;
  error?: string;
}

export interface CommissionProcessResult {
  success: boolean;
  orderId?: string;
  count: number;
  transactions: any[];
  totalCommissionPosted: number;
  error?: string;
}

export const MAX_REFERRAL_LEVEL = 5;

/**
 * Resolves transaction-relative referral chain starting from buyer customer up to L6.
 * L1 = Transaction Customer (Primary)
 * L2 = Immediate Upline
 * L3 = Second Upline
 * L4 = Third Upline
 * L5 = Fourth Upline
 * L6 = Fifth Upline (Termination Boundary - 0 Commission)
 * L7 = NEVER generated!
 */
export async function resolveReferralChain(
  buyerCustomerId: string,
  getDocsFn: (collection: string) => Promise<any[]>
): Promise<Array<{ level: number; customer: any }>> {
  const result: ResolvedChainResult = await resolveReferralChainAuthoritative(
    buyerCustomerId,
    getDocsFn
  );

  return result.chain.map((member: ChainMember) => ({
    level: member.level,
    customer: member.customer,
  }));
}

/**
 * Resolves effective commission rate for a product, beneficiary, and level.
 * Level 6 is the termination boundary and receives NO commission (0%).
 */
export async function resolveEffectiveCommissionRate(
  productId: string,
  beneficiaryCustomerId: string,
  level: number,
  getDocsFn: (collection: string) => Promise<any[]>
): Promise<{ rate: number; ruleId: string; source: string }> {
  // L6 is termination boundary - no commission
  if (level >= 6) {
    return {
      rate: 0,
      ruleId: `termination_boundary_l${level}`,
      source: "Termination Boundary (No Commission)",
    };
  }

  const rules = await getDocsFn("commission_rules");
  const activeRules = rules.filter(
    (r: any) => r.status === "Active" && Number(r.level) === level
  );

  // 1. Partner + Product Specific Override
  const partnerProductOverride = activeRules.find(
    (r: any) => r.partner_id === beneficiaryCustomerId && r.product_id === productId
  );
  if (partnerProductOverride) {
    return {
      rate: Number(partnerProductOverride.commission_value || 0),
      ruleId: partnerProductOverride.id,
      source: "Partner Override",
    };
  }

  // 2. Product Level Rule
  const productRule = activeRules.find(
    (r: any) => r.product_id === productId && (!r.partner_id || r.partner_id === null)
  );
  if (productRule) {
    return {
      rate: Number(productRule.commission_value || 0),
      ruleId: productRule.id,
      source: "Product Rule",
    };
  }

  // 3. System Default Rule
  const defaultRule = activeRules.find(
    (r: any) =>
      (!r.product_id || r.product_id === null) &&
      (!r.partner_id || r.partner_id === null) &&
      r.source === "Default"
  );
  if (defaultRule) {
    return {
      rate: Number(defaultRule.commission_value || 0),
      ruleId: defaultRule.id,
      source: "System Default",
    };
  }

  // 4. Dynamic Fallback: if no default rule exists in commission_rules collection
  return {
    rate: 0,
    ruleId: `system_fallback_l${level}`,
    source: "System Default (No Active Rule)",
  };
}

/**
 * Calculates pre-GST product base amount per item, excluding GST, delivery charges, shipping, and taxes.
 */
export function calculatePreGstBaseAmount(item: any): number {
  let unitPricePreGst = Number(item.priceBeforeGst || item.basePrice || 0);

  if (!unitPricePreGst) {
    const fullPrice = Number(item.price || item.unitPrice || item.totalValue || 0);
    const gstRate = Number(item.gstRate || item.taxRate || 0);
    if (gstRate > 0) {
      unitPricePreGst = fullPrice / (1 + gstRate / 100);
    } else {
      unitPricePreGst = fullPrice;
    }
  }

  const qty = Number(item.quantity || 1);
  return Math.round(unitPricePreGst * qty * 100) / 100;
}

/**
 * Server-authoritative commission calculation / preview.
 * Computes commissions that would apply without persisting them to database.
 */
export async function calculateCommissionPreviewInternal(
  orderIdOrDetails: { orderId?: string; customerId?: string; products?: any[] },
  getDocsFn: (collection: string) => Promise<any[]>
): Promise<CommissionPreviewResult> {
  try {
    let order: any = null;
    let customerId: string = orderIdOrDetails.customerId || "";
    let products: any[] = orderIdOrDetails.products || [];

    if (orderIdOrDetails.orderId) {
      const orders = await getDocsFn("sales_orders");
      order = orders.find(
        (o: any) =>
          String(o.id) === String(orderIdOrDetails.orderId) ||
          String(o.orderNumber) === String(orderIdOrDetails.orderId)
      );

      if (!order) {
        return {
          success: false,
          commissions: [],
          totalCommission: 0,
          error: `Order ${orderIdOrDetails.orderId} not found`,
        };
      }

      customerId = order.customerId || order.referralCode || customerId;
      products = Array.isArray(order.products) ? order.products : products;
    }

    if (!customerId) {
      return {
        success: false,
        commissions: [],
        totalCommission: 0,
        error: "Customer identity could not be resolved from transaction",
      };
    }

    const resolved = await resolveReferralChainAuthoritative(customerId, getDocsFn);
    if (resolved.chain.length === 0) {
      return {
        success: true,
        orderId: order?.id || orderIdOrDetails.orderId,
        customerId,
        customerType: resolved.customerType,
        commissions: [],
        totalCommission: 0,
      };
    }

    const calculations: CommissionItemCalculation[] = [];
    let totalCommission = 0;

    for (const member of resolved.chain) {
      // L6 is termination boundary - no commission
      if (member.level >= 6) continue;

      const beneficiary = member.customer;
      const beneficiaryId = member.customerId;

      for (let idx = 0; idx < products.length; idx++) {
        const item = products[idx];
        const productId = item.productId || item.id || `item_${idx}`;
        const orderItemId = `${order?.id || "preview"}_${productId}`;
        const baseAmount = calculatePreGstBaseAmount(item);

        const { rate, ruleId, source } = await resolveEffectiveCommissionRate(
          productId,
          beneficiaryId,
          member.level,
          getDocsFn
        );

        if (rate <= 0) continue;

        const commAmount = Math.round(((baseAmount * rate) / 100) * 100) / 100;

        calculations.push({
          productId,
          orderItemId,
          beneficiaryCustomerId: beneficiaryId,
          beneficiaryCustomerName: member.customerName,
          level: member.level,
          commissionRate: rate,
          commissionBaseAmount: baseAmount,
          commissionAmount: commAmount,
          ruleId,
          ruleSource: source,
        });

        totalCommission += commAmount;
      }
    }

    return {
      success: true,
      orderId: order?.id || orderIdOrDetails.orderId,
      customerId,
      customerType: resolved.customerType,
      commissions: calculations,
      totalCommission: Math.round(totalCommission * 100) / 100,
    };
  } catch (err: any) {
    console.error("[COMMISSION ENGINE] Error calculating commission preview:", err);
    return {
      success: false,
      commissions: [],
      totalCommission: 0,
      error: err?.message || "Failed to calculate commission preview",
    };
  }
}

/**
 * Evaluates and updates partner level performance rank based on sales amount thresholds.
 */
export async function evaluatePartnerLevelInternal(
  partnerId: string,
  getDocsFn: (collection: string) => Promise<any[]>,
  saveDocFn: (collection: string, doc: any) => Promise<void>
) {
  try {
    const partner = await findCustomerInCollections(partnerId, getDocsFn);
    if (!partner) return;

    const orders = await getDocsFn("sales_orders");
    const partnerOrders = orders.filter(
      (o: any) =>
        o.referralCode === partner.referralCode ||
        o.referralCode === partner.referralId ||
        o.customerId === partner.id ||
        o.customerId === partner.customerId
    );

    const totalSales = partnerOrders.reduce(
      (sum: number, o: any) => sum + Number(o.totalValue || 0),
      0
    );
    const levels = await getDocsFn("performance_levels");

    const activeLevels = levels
      .filter((l: any) => l.status === "Active")
      .sort((a: any, b: any) => Number(b.sales_amount) - Number(a.sales_amount));

    const qualifiedLevel = activeLevels.find((l: any) => totalSales >= Number(l.sales_amount));

    if (qualifiedLevel && partner.partnerLevelId !== qualifiedLevel.id) {
      const customers = await getDocsFn("customers");
      const targetCol = customers.some((c: any) => c.id === partner.id)
        ? "customers"
        : "referrals";

      await saveDocFn(targetCol, {
        ...partner,
        totalSales,
        partnerLevelId: qualifiedLevel.id,
        partnerLevelName: qualifiedLevel.level_name,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn("[COMMISSION ENGINE] Evaluation of partner level failed:", err);
  }
}

/**
 * Server-authoritative commission processing & posting.
 * Enforces transaction existence, pre-GST base, L1-L5 commission eligibility, L6 boundary, idempotency, atomic persistence.
 */
export async function processOrderCommissionsAuthoritative(
  orderId: string,
  processedByAdminId: string | undefined,
  getDocsFn: (collection: string) => Promise<any[]>,
  saveDocFn: (collection: string, doc: any) => Promise<void>
): Promise<CommissionProcessResult> {
  try {
    const orders = await getDocsFn("sales_orders");
    const order = orders.find(
      (o: any) => String(o.id) === String(orderId) || String(o.orderNumber) === String(orderId)
    );

    if (!order) {
      return {
        success: false,
        count: 0,
        transactions: [],
        totalCommissionPosted: 0,
        error: `Order ${orderId} not found`,
      };
    }

    if (order.deliveryStatus === "Cancelled" || order.paymentStatus === "Refunded") {
      return {
        success: false,
        count: 0,
        transactions: [],
        totalCommissionPosted: 0,
        error: `Order ${orderId} is cancelled or refunded`,
      };
    }

    // Resolve purchasing customer
    const buyerCustomer = await findCustomerInCollections(
      order.customerId || order.referralCode || order.contactNo,
      getDocsFn
    );

    if (!buyerCustomer) {
      return {
        success: true,
        count: 0,
        transactions: [],
        totalCommissionPosted: 0,
        error: "No purchasing customer found for order",
      };
    }

    const buyerId = String(
      buyerCustomer.id || buyerCustomer.customerId || buyerCustomer.referralCode
    );

    const resolved = await resolveReferralChainAuthoritative(buyerId, getDocsFn);

    if (resolved.chain.length === 0) {
      return { success: true, count: 0, transactions: [], totalCommissionPosted: 0 };
    }

    const existingTxs = await getDocsFn("commission_transactions");
    const newTransactions: any[] = [];
    let totalPosted = 0;

    const products = Array.isArray(order.products) ? order.products : [];

    for (const member of resolved.chain) {
      // L6 is termination boundary - no commission
      if (member.level >= 6) continue;

      const beneficiary = member.customer;
      const beneficiaryId = member.customerId;

      for (let idx = 0; idx < products.length; idx++) {
        const item = products[idx];
        const productId = item.productId || item.id || `item_${idx}`;
        const orderItemId = `${order.id}_${productId}`;

        // IDEMPOTENCY CHECK: Ensure unique business transaction key has not already been processed
        const isDuplicate = existingTxs.some(
          (tx: any) =>
            String(tx.order_id) === String(order.id) &&
            String(tx.order_item_id) === String(orderItemId) &&
            String(tx.beneficiary_partner_id || tx.beneficiary_customer_id) === beneficiaryId &&
            Number(tx.level) === member.level &&
            tx.status !== "REVERSED"
        );

        if (isDuplicate) {
          console.info(
            `[COMMISSION ENGINE] Idempotency guard: skipping existing commission for Order ${order.id}, Item ${productId}, Beneficiary ${beneficiaryId}, Level ${member.level}`
          );
          continue;
        }

        const { rate, ruleId } = await resolveEffectiveCommissionRate(
          productId,
          beneficiaryId,
          member.level,
          getDocsFn
        );

        if (rate <= 0) continue;

        const baseAmount = calculatePreGstBaseAmount(item);
        const commissionAmount = Math.round(((baseAmount * rate) / 100) * 100) / 100;

        const txnId = `comm_${order.id}_${productId}_${beneficiaryId}_L${member.level}`;
        const txn = {
          id: txnId,
          order_id: order.id,
          order_item_id: orderItemId,
          buyer_partner_id: buyerId,
          buyer_customer_id: buyerId,
          beneficiary_partner_id: beneficiaryId,
          beneficiary_customer_id: beneficiaryId,
          level: member.level,
          commission_rate: rate,
          commission_base_amount: baseAmount,
          commission_amount: commissionAmount,
          status: order.paymentStatus === "Paid" ? "CONFIRMED" : "PENDING",
          rule_id: ruleId,
          processed_by_admin_id: processedByAdminId || null,
          created_at: new Date().toISOString(),
          confirmed_at: order.paymentStatus === "Paid" ? new Date().toISOString() : undefined,
        };

        // ATOMIC POSTING: Persist commission transaction
        await saveDocFn("commission_transactions", txn);
        newTransactions.push(txn);
        totalPosted += commissionAmount;

        // ATOMIC WALLET / EARNINGS UPDATE
        const currentEarned = Number(beneficiary.commissionEarned || 0) + commissionAmount;
        const currentPayable = Number(beneficiary.commissionPayable || 0) + commissionAmount;

        const customers = await getDocsFn("customers");
        const targetCollection = customers.some((c: any) => c.id === beneficiary.id)
          ? "customers"
          : "referrals";

        await saveDocFn(targetCollection, {
          ...beneficiary,
          commissionEarned: Math.round(currentEarned * 100) / 100,
          commissionPayable: Math.round(currentPayable * 100) / 100,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (buyerId) {
      await evaluatePartnerLevelInternal(buyerId, getDocsFn, saveDocFn);
    }

    return {
      success: true,
      orderId: order.id,
      count: newTransactions.length,
      transactions: newTransactions,
      totalCommissionPosted: Math.round(totalPosted * 100) / 100,
    };
  } catch (error: any) {
    console.error("[COMMISSION ENGINE] Error processing order commissions:", error);
    return {
      success: false,
      count: 0,
      transactions: [],
      totalCommissionPosted: 0,
      error: error?.message || "Failed to process commission",
    };
  }
}

/**
 * Reverses commissions for refunded or cancelled orders.
 */
export async function refundOrderCommissionsAuthoritative(
  orderId: string,
  reason: string = "Order Refunded",
  processedByAdminId: string | undefined,
  getDocsFn: (collection: string) => Promise<any[]>,
  saveDocFn: (collection: string, doc: any) => Promise<void>
): Promise<{ success: boolean; reversedCount: number; error?: string }> {
  try {
    const txs = await getDocsFn("commission_transactions");
    const orderTxs = txs.filter((t: any) => String(t.order_id) === String(orderId));
    const customers = await getDocsFn("customers");
    const referrals = await getDocsFn("referrals");

    let reversedCount = 0;

    for (const tx of orderTxs) {
      if (tx.status === "REVERSED") continue;

      const beneficiaryId = tx.beneficiary_customer_id || tx.beneficiary_partner_id;

      if (tx.status === "PAID" || tx.status === "CONFIRMED") {
        const revTxId = `rev_${tx.id}_${Date.now()}`;
        const reversalTx = {
          id: revTxId,
          order_id: tx.order_id,
          order_item_id: tx.order_item_id,
          buyer_partner_id: tx.buyer_partner_id,
          buyer_customer_id: tx.buyer_customer_id,
          beneficiary_partner_id: beneficiaryId,
          beneficiary_customer_id: beneficiaryId,
          level: tx.level,
          commission_rate: tx.commission_rate,
          commission_base_amount: -Math.abs(tx.commission_base_amount),
          commission_amount: -Math.abs(tx.commission_amount),
          status: "REVERSED",
          rule_id: tx.rule_id,
          processed_by_admin_id: processedByAdminId || null,
          created_at: new Date().toISOString(),
          reversal_info: {
            reversed_at: new Date().toISOString(),
            reason,
            original_transaction_id: tx.id,
            processed_by_admin_id: processedByAdminId || null,
          },
        };
        await saveDocFn("commission_transactions", reversalTx);
      }

      await saveDocFn("commission_transactions", {
        ...tx,
        status: "REVERSED",
        updated_at: new Date().toISOString(),
        reversal_info: {
          reversed_at: new Date().toISOString(),
          reason,
          processed_by_admin_id: processedByAdminId || null,
        },
      });

      // Deduct payable balance from customer
      let beneficiary = customers.find((c: any) => c.id === beneficiaryId || c.customerId === beneficiaryId);
      let col = "customers";
      if (!beneficiary) {
        beneficiary = referrals.find((r: any) => r.id === beneficiaryId || r.referralId === beneficiaryId);
        col = "referrals";
      }

      if (beneficiary) {
        const payable = Math.max(0, Number(beneficiary.commissionPayable || 0) - Number(tx.commission_amount));
        await saveDocFn(col, {
          ...beneficiary,
          commissionPayable: Math.round(payable * 100) / 100,
          updated_at: new Date().toISOString(),
        });
      }
      reversedCount++;
    }

    return { success: true, reversedCount };
  } catch (err: any) {
    console.error("[COMMISSION ENGINE] Refund reversal error:", err);
    return { success: false, reversedCount: 0, error: err?.message || "Failed to refund commissions" };
  }
}
