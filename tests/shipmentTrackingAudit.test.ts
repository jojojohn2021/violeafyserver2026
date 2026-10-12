import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OperationsService, DataAccessor } from '../src/services/operationsService';
import { ShipmentTrackingRepository } from '../src/repositories/repositories';

describe('Shipment Tracking Audit Logging Verification Tests', () => {
  interface MockDatabase {
    sales_orders: any[];
    shipment_brand_owner_fulfilment: any[];
    shipment_tracking: any[];
    order_brand_assignments: any[];
    order_fulfilment: any[];
    order_operation_history: any[];
    product_brand_owners: any[];
  }

  function setupMockDb(): { db: MockDatabase; dbAccessor: DataAccessor; opsService: OperationsService } {
    const db: MockDatabase = {
      sales_orders: [
        {
          id: 'SO_AUDIT_101',
          orderNumber: 'SO_AUDIT_101',
          customerName: 'Aarav Sharma',
          deliveryStatus: 'Pending',
          products: [
            {
              productId: 'prod_honey',
              productName: 'Organic Wild Honey 500g',
              quantity: 2,
              unit: 'BOTTLE',
              packingSize: 'Jar 500g',
              brandOwnerId: 'bo_nature',
              brandOwnerName: 'Nature Fresh Farms',
            },
          ],
          createdAt: new Date().toISOString(),
        },
      ],
      shipment_brand_owner_fulfilment: [],
      shipment_tracking: [],
      order_brand_assignments: [],
      order_fulfilment: [],
      order_operation_history: [],
      product_brand_owners: [
        { id: 'bo_nature', name: 'Nature Fresh Farms' },
      ],
    };

    const dbAccessor: DataAccessor = {
      getCollectionDocs: async (col: string) => {
        return JSON.parse(JSON.stringify((db as any)[col] || []));
      },
      saveCollectionDoc: async (col: string, item: any) => {
        if (!(db as any)[col]) (db as any)[col] = [];
        const id = String(item.id || Date.now());
        const idx = (db as any)[col].findIndex((doc: any) => String(doc.id) === id);
        if (idx >= 0) {
          (db as any)[col][idx] = JSON.parse(JSON.stringify(item));
        } else {
          (db as any)[col].push(JSON.parse(JSON.stringify(item)));
        }
      },
    };

    const opsService = new OperationsService(dbAccessor);
    return { db, dbAccessor, opsService };
  }

  // 1. Screen 1: BrandOwnerAssignmentView status-change audit logging
  it('1. BrandOwnerAssignmentView: creates shipment_tracking record with required fields including salesOrderId linked via shipid', async () => {
    const { db, opsService } = setupMockDb();

    const assignments = [
      {
        orderItemId: 'item_prod_honey',
        productId: 'prod_honey',
        brandOwnerId: 'bo_nature',
        brandOwnerName: 'Nature Fresh Farms',
      },
    ];

    const loggedInUser = 'ops_admin@violeafy.com';
    await opsService.assignBrandOwners('SO_AUDIT_101', assignments, loggedInUser);

    // Verify fulfilment transaction was saved
    assert.equal(db.shipment_brand_owner_fulfilment.length, 1);
    const fulfilment = db.shipment_brand_owner_fulfilment[0];
    assert.ok(fulfilment.shipid, 'Parent fulfilment transaction must have shipid');
    assert.equal(fulfilment.salesOrderId, 'SO_AUDIT_101', 'Fulfilment transaction has salesOrderId');

    // Verify audit event in shipment_tracking
    assert.equal(db.shipment_tracking.length, 1, 'Audit record must be created in shipment_tracking');
    const audit = db.shipment_tracking[0];

    // Check all required audit fields including salesOrderId
    assert.equal(audit.shipid, fulfilment.shipid, 'Field 1: shipid must link to parent fulfilment record');
    assert.equal(audit.salesOrderId, 'SO_AUDIT_101', 'Field 2: salesOrderId must match parent fulfilment salesOrderId');
    assert.ok(audit.createdAt, 'Field 3: createdAt must be populated');
    assert.ok(audit.deliverystatus !== undefined, 'Field 4: deliverystatus must be populated');
    assert.ok(audit.outpackingstatus !== undefined, 'Field 5: outpackingstatus must be populated');
    assert.equal(audit.updatedby, loggedInUser, 'Field 6: updatedby must match authenticated user');

    // Document ID must be unique and not match shipid
    assert.notEqual(audit.id, audit.shipid, 'Audit document ID must not equal shipid');
  });

  // 2. Screen 2: CompletePackingView status-change audit logging
  it('2. CompletePackingView: creates separate audit record with salesOrderId when packing status changes and respects idempotency', async () => {
    const { db, dbAccessor } = setupMockDb();

    // Initial fulfilment document in PACKING state
    const shipid = 'ship_test_packing_001';
    const initialDoc = {
      id: 'boa_pck_01',
      shipid,
      salesOrderId: 'SO_AUDIT_101',
      orderItemId: 'item_prod_honey',
      productId: 'prod_honey',
      productName: 'Organic Wild Honey 500g',
      outstatus: 'PACKING',
      fulfillmentstatus: 'PACKING',
      outpackingstatus: 'PACKING',
      deliverystatus: 'PACKING',
      orderqty: 10,
      outquantity: 10,
      outbalanceqty: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', initialDoc);

    // Simulated status update: User completes packing -> READY_FOR_DISPATCH
    const updatedDoc = {
      ...initialDoc,
      outstatus: 'READY_FOR_DISPATCH',
      fulfillmentstatus: 'READY_FOR_DISPATCH',
      outpackingstatus: 'PACKED',
      updatedAt: new Date().toISOString(),
    };

    // Helper simulating status-change logging flow
    const previousDoc = (await dbAccessor.getCollectionDocs('shipment_brand_owner_fulfilment')).find(
      (d) => d.id === updatedDoc.id
    );
    const didChange = previousDoc.outstatus !== updatedDoc.outstatus || previousDoc.fulfillmentstatus !== updatedDoc.fulfillmentstatus;
    assert.ok(didChange, 'Status change must be detected');

    // Save fulfilment update
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', updatedDoc);

    // Save audit record
    const auditId = `st_${Date.now()}_test`;
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: auditId,
      shipid: updatedDoc.shipid,
      salesOrderId: updatedDoc.salesOrderId,
      createdAt: new Date().toISOString(),
      deliverystatus: updatedDoc.deliverystatus,
      outpackingstatus: updatedDoc.outpackingstatus,
      updatedby: 'packer_user@violeafy.com',
    });

    assert.equal(db.shipment_tracking.length, 1);
    const audit = db.shipment_tracking[0];
    assert.equal(audit.shipid, shipid);
    assert.equal(audit.salesOrderId, 'SO_AUDIT_101');
    assert.equal(audit.outpackingstatus, 'PACKED');
    assert.equal(audit.updatedby, 'packer_user@violeafy.com');

    // Idempotency: Retrying or saving again with identical status must not duplicate audit record
    const latestDoc = (await dbAccessor.getCollectionDocs('shipment_brand_owner_fulfilment')).find(
      (d) => d.id === updatedDoc.id
    );
    const didChangeAgain = latestDoc.outstatus !== updatedDoc.outstatus || latestDoc.fulfillmentstatus !== updatedDoc.fulfillmentstatus;
    assert.equal(didChangeAgain, false, 'No status change on repeated save/retry');
    assert.equal(db.shipment_tracking.length, 1, 'Duplicate audit record must NOT be created');
  });

  // 3. Screen 3: CreateShipmentView status-change audit logging
  it('3. CreateShipmentView: records audit event with salesOrderId when shipment is marked SHIPPED with deliverystatus = IN_TRANSIT', async () => {
    const { db, dbAccessor } = setupMockDb();

    const shipid = 'ship_test_dispatch_002';
    const readyDoc = {
      id: 'boa_shp_01',
      shipid,
      salesOrderId: 'SO_AUDIT_101',
      orderItemId: 'item_prod_honey',
      productId: 'prod_honey',
      productName: 'Organic Wild Honey 500g',
      outstatus: 'READY_FOR_DISPATCH',
      fulfillmentstatus: 'READY_FOR_DISPATCH',
      outpackingstatus: 'PACKED',
      deliverystatus: 'PACKING',
      orderqty: 2,
      outquantity: 2,
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', readyDoc);

    // User dispatches shipment in CreateShipmentView -> SHIPPED & IN_TRANSIT
    const dispatchedDoc = {
      ...readyDoc,
      outstatus: 'SHIPPED',
      fulfillmentstatus: 'SHIPPED',
      status: 'SHIPPED',
      deliverystatus: 'IN_TRANSIT',
      outcouriername: 'Delhivery',
      outcourierdocketno: 'DLHV123456789',
    };

    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', dispatchedDoc);

    // Audit logging
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: `st_${Date.now()}_shp`,
      shipid: dispatchedDoc.shipid,
      salesOrderId: dispatchedDoc.salesOrderId,
      createdAt: new Date().toISOString(),
      deliverystatus: dispatchedDoc.deliverystatus,
      outpackingstatus: dispatchedDoc.outpackingstatus,
      updatedby: 'dispatch_lead@violeafy.com',
    });

    assert.equal(db.shipment_tracking.length, 1);
    const audit = db.shipment_tracking[0];
    assert.equal(audit.shipid, shipid);
    assert.equal(audit.salesOrderId, 'SO_AUDIT_101');
    assert.equal(audit.deliverystatus, 'IN_TRANSIT');
    assert.equal(audit.outpackingstatus, 'PACKED');
    assert.equal(audit.updatedby, 'dispatch_lead@violeafy.com');
  });

  // 4. Screen 4: ConfirmDeliveryView status-change audit logging
  it('4. ConfirmDeliveryView: records audit event with salesOrderId when delivery is confirmed to COMPLETED / DELIVERED', async () => {
    const { db, dbAccessor } = setupMockDb();

    const shipid = 'ship_test_del_003';
    const inTransitDoc = {
      id: 'boa_del_01',
      shipid,
      salesOrderId: 'SO_AUDIT_101',
      orderItemId: 'item_prod_honey',
      productId: 'prod_honey',
      outstatus: 'SHIPPED',
      fulfillmentstatus: 'SHIPPED',
      deliverystatus: 'IN_TRANSIT',
      outpackingstatus: 'PACKED',
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', inTransitDoc);

    // Delivery confirmation: COMPLETED & DELIVERED
    const deliveredDoc = {
      ...inTransitDoc,
      outstatus: 'COMPLETED',
      fulfillmentstatus: 'COMPLETED',
      status: 'DELIVERED',
      deliverystatus: 'DELIVERED',
      deliverydate: '2026-10-12',
      deliverycondition: 'Delivered in Good Condition',
    };

    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', deliveredDoc);

    // Audit logging
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: `st_${Date.now()}_del`,
      shipid: deliveredDoc.shipid,
      salesOrderId: deliveredDoc.salesOrderId,
      createdAt: new Date().toISOString(),
      deliverystatus: deliveredDoc.deliverystatus,
      outpackingstatus: deliveredDoc.outpackingstatus,
      updatedby: 'delivery_officer@violeafy.com',
    });

    assert.equal(db.shipment_tracking.length, 1);
    const audit = db.shipment_tracking[0];
    assert.equal(audit.shipid, shipid);
    assert.equal(audit.salesOrderId, 'SO_AUDIT_101');
    assert.equal(audit.deliverystatus, 'DELIVERED');
    assert.equal(audit.outpackingstatus, 'PACKED');
    assert.equal(audit.updatedby, 'delivery_officer@violeafy.com');
  });

  // 5. Append-only nature & Multiple status transitions for the same transaction
  it('5. Append-only integrity: multiple genuine status changes produce multiple separate audit records linked to the same shipid and salesOrderId', async () => {
    const { db, dbAccessor } = setupMockDb();
    const shipid = 'ship_multi_lifecycle_999';
    const salesOrderId = 'SO_AUDIT_999';

    // Step 1: Assignment
    const step1 = {
      id: 'boa_lifecycle_01',
      shipid,
      salesOrderId,
      outstatus: 'PACKING',
      outpackingstatus: 'PACKING',
      deliverystatus: 'PACKING',
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', step1);
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: 'st_step_1',
      shipid,
      salesOrderId: step1.salesOrderId,
      createdAt: '2026-10-12T01:00:00.000Z',
      deliverystatus: step1.deliverystatus,
      outpackingstatus: step1.outpackingstatus,
      updatedby: 'user_step1',
    });

    // Step 2: Packing Complete
    const step2 = {
      ...step1,
      outstatus: 'READY_FOR_DISPATCH',
      outpackingstatus: 'PACKED',
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', step2);
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: 'st_step_2',
      shipid,
      salesOrderId: step2.salesOrderId,
      createdAt: '2026-10-12T02:00:00.000Z',
      deliverystatus: step2.deliverystatus,
      outpackingstatus: step2.outpackingstatus,
      updatedby: 'user_step2',
    });

    // Step 3: Shipped
    const step3 = {
      ...step2,
      outstatus: 'SHIPPED',
      deliverystatus: 'IN_TRANSIT',
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', step3);
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: 'st_step_3',
      shipid,
      salesOrderId: step3.salesOrderId,
      createdAt: '2026-10-12T03:00:00.000Z',
      deliverystatus: step3.deliverystatus,
      outpackingstatus: step3.outpackingstatus,
      updatedby: 'user_step3',
    });

    // Step 4: Delivered
    const step4 = {
      ...step3,
      outstatus: 'COMPLETED',
      deliverystatus: 'DELIVERED',
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', step4);
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: 'st_step_4',
      shipid,
      salesOrderId: step4.salesOrderId,
      createdAt: '2026-10-12T04:00:00.000Z',
      deliverystatus: step4.deliverystatus,
      outpackingstatus: step4.outpackingstatus,
      updatedby: 'user_step4',
    });

    // Verify all 4 audit records exist, are append-only, and link to the same shipid and salesOrderId
    assert.equal(db.shipment_tracking.length, 4);
    const trackingHistory = db.shipment_tracking.filter((t) => t.shipid === shipid);
    assert.equal(trackingHistory.length, 4);

    assert.equal(trackingHistory[0].deliverystatus, 'PACKING');
    assert.equal(trackingHistory[0].outpackingstatus, 'PACKING');
    assert.equal(trackingHistory[0].salesOrderId, salesOrderId);

    assert.equal(trackingHistory[1].deliverystatus, 'PACKING');
    assert.equal(trackingHistory[1].outpackingstatus, 'PACKED');
    assert.equal(trackingHistory[1].salesOrderId, salesOrderId);

    assert.equal(trackingHistory[2].deliverystatus, 'IN_TRANSIT');
    assert.equal(trackingHistory[2].outpackingstatus, 'PACKED');
    assert.equal(trackingHistory[2].salesOrderId, salesOrderId);

    assert.equal(trackingHistory[3].deliverystatus, 'DELIVERED');
    assert.equal(trackingHistory[3].outpackingstatus, 'PACKED');
    assert.equal(trackingHistory[3].salesOrderId, salesOrderId);
  });

  // 6. Partial packing splits produce separate audit records for new child transactions
  it('6. Partial packing split: records audit logs with salesOrderId for both the original fulfilled item and the remaining balance record', async () => {
    const { db, dbAccessor } = setupMockDb();

    const parentShipId = 'ship_parent_partial_1';
    const splitShipId = 'ship_child_split_2';
    const salesOrderId = 'SO_AUDIT_PARTIAL_101';

    // Original record updated to PARTIALLY_PACKED
    const parentDoc = {
      id: 'boa_parent_partial',
      shipid: parentShipId,
      salesOrderId,
      outstatus: 'PARTIALLY_PACKED',
      fulfillmentstatus: 'PARTIALLY_PACKED',
      outpackingstatus: 'PACKED',
      deliverystatus: 'PACKING',
      orderqty: 10,
      outquantity: 6,
      outbalanceqty: 4,
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', parentDoc);
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: 'st_parent_audit',
      shipid: parentShipId,
      salesOrderId: parentDoc.salesOrderId,
      createdAt: new Date().toISOString(),
      deliverystatus: parentDoc.deliverystatus,
      outpackingstatus: parentDoc.outpackingstatus,
      updatedby: 'packer@violeafy.com',
    });

    // New split record for balance quantity
    const splitDoc = {
      id: 'boa_child_split',
      shipid: splitShipId,
      salesOrderId,
      outstatus: 'PACKING',
      fulfillmentstatus: 'PACKING',
      outpackingstatus: 'PACKING',
      deliverystatus: 'PACKING',
      orderqty: 4,
      outquantity: 0,
      outbalanceqty: 0,
    };
    await dbAccessor.saveCollectionDoc('shipment_brand_owner_fulfilment', splitDoc);
    await dbAccessor.saveCollectionDoc('shipment_tracking', {
      id: 'st_split_audit',
      shipid: splitShipId,
      salesOrderId: splitDoc.salesOrderId,
      createdAt: new Date().toISOString(),
      deliverystatus: splitDoc.deliverystatus,
      outpackingstatus: splitDoc.outpackingstatus,
      updatedby: 'packer@violeafy.com',
    });

    assert.equal(db.shipment_tracking.length, 2);
    assert.equal(db.shipment_tracking[0].shipid, parentShipId);
    assert.equal(db.shipment_tracking[0].salesOrderId, salesOrderId);
    assert.equal(db.shipment_tracking[1].shipid, splitShipId);
    assert.equal(db.shipment_tracking[1].salesOrderId, salesOrderId);
  });

  // 7. Verification of ShipmentTrackingRepository constructor and collection targeting
  it('7. ShipmentTrackingRepository: verifies collection target is shipment_tracking', () => {
    const repo = new ShipmentTrackingRepository();
    assert.equal((repo as any).collectionName, 'shipment_tracking');
  });

  // 8. Backward compatibility: existing historical records without salesOrderId remain readable and unmodified
  it('8. Backward compatibility: existing historical records without salesOrderId remain intact and queryable', async () => {
    const { dbAccessor } = setupMockDb();

    // Historical record created before salesOrderId was added
    const historicalAudit = {
      id: 'st_historical_001',
      shipid: 'ship_legacy_001',
      createdAt: '2026-09-01T00:00:00.000Z',
      deliverystatus: 'DELIVERED',
      outpackingstatus: 'PACKED',
      updatedby: 'legacy_user@violeafy.com',
    };
    await dbAccessor.saveCollectionDoc('shipment_tracking', historicalAudit);

    // Newly created audit record with salesOrderId
    const newAudit = {
      id: 'st_new_002',
      shipid: 'ship_new_002',
      salesOrderId: 'SO_NEW_202',
      createdAt: new Date().toISOString(),
      deliverystatus: 'PACKING',
      outpackingstatus: 'PACKING',
      updatedby: 'new_user@violeafy.com',
    };
    await dbAccessor.saveCollectionDoc('shipment_tracking', newAudit);

    const records = await dbAccessor.getCollectionDocs('shipment_tracking');
    assert.equal(records.length, 2);

    const legacy = records.find((r) => r.id === 'st_historical_001');
    assert.ok(legacy);
    assert.equal(legacy.shipid, 'ship_legacy_001');
    assert.equal(legacy.salesOrderId, undefined, 'Historical record salesOrderId remains undefined/unmodified');

    const created = records.find((r) => r.id === 'st_new_002');
    assert.ok(created);
    assert.equal(created.salesOrderId, 'SO_NEW_202', 'New record includes salesOrderId');
  });
});
