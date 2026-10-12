import { adminDb } from '../firebase-admin';

export interface MigrationSummary {
  totalProcessed: number;
  legacyDocumentsCount: number;
  groupedParentDocumentsCount: number;
  totalChildItemsCount: number;
  conflicts: any[];
  dryRun: boolean;
}

/**
 * Migrates flat shipment_brand_owner_fulfilment documents into grouped parent documents per sales_orders.id.
 * Non-destructive: Does not delete legacy flat documents unless explicitly instructed after verification.
 */
export async function migrateFulfilmentGrouping(dryRun: boolean = true): Promise<MigrationSummary> {
  const db = adminDb;
  const snapshot = await db.collection('shipment_brand_owner_fulfilment').get();
  
  const rawDocs: any[] = [];
  snapshot.forEach((d) => rawDocs.push({ id: d.id, ...d.data() }));

  const summary: MigrationSummary = {
    totalProcessed: rawDocs.length,
    legacyDocumentsCount: 0,
    groupedParentDocumentsCount: 0,
    totalChildItemsCount: 0,
    conflicts: [],
    dryRun,
  };

  const groupedBySalesOrder = new Map<string, any>();

  for (const doc of rawDocs) {
    if (!doc) continue;
    const salesOrderId = String(doc.salesOrderId || doc.orderNo || doc.orderId || doc.id || '').trim();
    if (!salesOrderId) {
      summary.conflicts.push({ type: 'MISSING_SALES_ORDER_ID', docId: doc.id });
      continue;
    }

    if (Array.isArray(doc.items)) {
      // Already a parent document
      if (!groupedBySalesOrder.has(salesOrderId)) {
        groupedBySalesOrder.set(salesOrderId, {
          id: doc.id || `fulfil_${salesOrderId}`,
          salesOrderId,
          orderNumber: doc.orderNumber || doc.orderNo || salesOrderId,
          customerId: doc.customerId || '',
          customerName: doc.customerName || '',
          customerMobile: doc.customerMobile || '',
          deliveryStatus: doc.deliveryStatus || doc.deliverystatus || 'PACKING',
          status: doc.status || 'ASSIGNED',
          createdAt: doc.createdAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || new Date().toISOString(),
          items: [...doc.items],
        });
      } else {
        const existingParent = groupedBySalesOrder.get(salesOrderId);
        for (const item of doc.items) {
          const matchIdx = existingParent.items.findIndex(
            (it: any) =>
              (it.orderItemId && item.orderItemId && String(it.orderItemId) === String(item.orderItemId)) ||
              (it.productId && item.productId && String(it.productId) === String(item.productId)) ||
              (it.id && item.id && String(it.id) === String(item.id))
          );
          if (matchIdx >= 0) {
            existingParent.items[matchIdx] = { ...existingParent.items[matchIdx], ...item };
          } else {
            existingParent.items.push(item);
          }
        }
      }
    } else {
      // Legacy flat record representing a single product item
      summary.legacyDocumentsCount++;
      if (!groupedBySalesOrder.has(salesOrderId)) {
        groupedBySalesOrder.set(salesOrderId, {
          id: `fulfil_${salesOrderId}`,
          salesOrderId,
          orderNumber: doc.orderNumber || doc.orderNo || salesOrderId,
          customerId: doc.customerId || '',
          customerName: doc.customerName || '',
          customerMobile: doc.customerMobile || doc.contactNo || '',
          deliveryStatus: doc.deliveryStatus || doc.deliverystatus || doc.outstatus || 'PACKING',
          status: doc.status || 'ASSIGNED',
          createdAt: doc.createdAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || new Date().toISOString(),
          items: [],
        });
      }

      const parent = groupedBySalesOrder.get(salesOrderId);
      const matchIdx = parent.items.findIndex(
        (it: any) =>
          (it.orderItemId && doc.orderItemId && String(it.orderItemId) === String(doc.orderItemId)) ||
          (it.productId && doc.productId && String(it.productId) === String(doc.productId)) ||
          (it.id && doc.id && String(it.id) === String(doc.id))
      );

      if (matchIdx >= 0) {
        // Conflict / duplicate detection
        summary.conflicts.push({
          type: 'DUPLICATE_PRODUCT_ITEM',
          salesOrderId,
          itemId: doc.orderItemId || doc.productId || doc.id,
          existingItem: parent.items[matchIdx],
          newItem: doc,
        });
        parent.items[matchIdx] = { ...parent.items[matchIdx], ...doc };
      } else {
        parent.items.push(doc);
      }
    }
  }

  summary.groupedParentDocumentsCount = groupedBySalesOrder.size;
  for (const parent of groupedBySalesOrder.values()) {
    summary.totalChildItemsCount += parent.items.length;
  }

  if (!dryRun) {
    const batch = db.batch();
    for (const [sId, parentDoc] of groupedBySalesOrder.entries()) {
      const docRef = db.collection('shipment_brand_owner_fulfilment').doc(parentDoc.id);
      batch.set(docRef, parentDoc, { merge: true });
    }
    await batch.commit();
  }

  return summary;
}
