import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ShipmentOperationsService, DataAccessor } from '../src/services/shipmentOperationsService';

function createMockDatabase() {
  const collections: Record<string, any[]> = {
    sales_orders: [
      {
        id: 'SO_2026_0001',
        orderNumber: 'SO-2026-0001',
        invoiceId: 'INV_2026_0001',
        invoiceNumber: 'INV-2026-0001',
        customerId: 'cust_101',
        customerName: 'Asif Zahir',
        products: [
          { productId: 'prod_cleaner', productName: 'Dining Table Surface Cleaner', quantity: 1, price: 190 },
          { productId: 'prod_spray', productName: 'Multi-Surface Glass Cleaner Spray', quantity: 2, price: 320 },
        ],
        totalValue: 830,
        paymentStatus: 'Paid',
        deliveryStatus: 'Pending',
        createdAt: '2026-10-04T10:00:00.000Z',
      },
    ],
    shipment_brand_owner_assignments: [],
    shipment_packing: [],
    shipment_shipments: [],
    shipment_deliveries: [],
    shipment_returns: [],
  };

  const dbAccessor: DataAccessor = {
    getCollectionDocs: async (col: string) => JSON.parse(JSON.stringify(collections[col] || [])),
    saveCollectionDoc: async (col: string, item: any) => {
      if (!collections[col]) collections[col] = [];
      const id = String(item.id || Date.now());
      const list = collections[col];
      const idx = list.findIndex((e) => String(e.id) === id);
      if (idx >= 0) list[idx] = JSON.parse(JSON.stringify(item));
      else list.push(JSON.parse(JSON.stringify(item)));
    },
  };

  return { collections, dbAccessor };
}

describe('Antigravity Technical Specification - Shipment Operations Integration Tests', () => {
  it('1. Should create Brand Owner Assignment linked to salesOrderId and invoiceId', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    const assignment = await service.createBrandOwnerAssignment(
      {
        salesOrderId: 'SO_2026_0001',
        itemId: 'item_prod_cleaner',
        productId: 'prod_cleaner',
        brandOwnerId: 'bo_vio_nature',
        brandOwnerName: 'Vio Nature Science',
      },
      'Ops Staff 1'
    );

    assert.equal(assignment.salesOrderId, 'SO_2026_0001');
    assert.equal(assignment.invoiceId, 'INV_2026_0001');
    assert.equal(assignment.brandOwnerId, 'bo_vio_nature');
    assert.equal(assignment.status, 'ASSIGNED');
    assert.equal(assignment.createdBy, 'Ops Staff 1');
    assert.equal(assignment.statusHistory.length, 1);
    assert.equal(assignment.statusHistory[0].toStatus, 'ASSIGNED');
  });

  it('2. Reassignment Rule: Should CANCEL previous assignment and create new ASSIGNED record without storing REASSIGNED status', async () => {
    const { dbAccessor, collections } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    // Initial assignment to BO 1
    const initial = await service.createBrandOwnerAssignment(
      {
        salesOrderId: 'SO_2026_0001',
        itemId: 'item_prod_cleaner',
        productId: 'prod_cleaner',
        brandOwnerId: 'bo_1',
        brandOwnerName: 'First Brand Owner',
      },
      'Ops Manager'
    );

    assert.equal(initial.status, 'ASSIGNED');

    // Reassign to BO 2
    const reassigned = await service.reassignBrandOwner(
      initial.id,
      {
        brandOwnerId: 'bo_2',
        brandOwnerName: 'Second Brand Owner',
      },
      'Ops Admin'
    );

    const allAssignments = collections.shipment_brand_owner_assignments;
    assert.equal(allAssignments.length, 2);

    // Old assignment must be CANCELLED
    const cancelledRecord = allAssignments.find((a) => a.id === initial.id);
    assert.equal(cancelledRecord.status, 'CANCELLED');
    assert.equal(cancelledRecord.statusHistory[cancelledRecord.statusHistory.length - 1].toStatus, 'CANCELLED');

    // New assignment must be ASSIGNED
    assert.equal(reassigned.status, 'ASSIGNED');
    assert.equal(reassigned.brandOwnerId, 'bo_2');
    assert.equal(reassigned.createdBy, 'Ops Admin');

    // Verify 'REASSIGNED' is NEVER stored as a status anywhere
    const hasReassignedStatus = allAssignments.some((a) => a.status === 'REASSIGNED');
    assert.equal(hasReassignedStatus, false, 'REASSIGNED status must not be stored');
  });

  it('3. Prerequisite Rule: Packing must fail if no active Brand Owner Assignment exists', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    await assert.rejects(
      async () => {
        await service.createPacking({ salesOrderId: 'SO_2026_0001' }, 'Packer Bob');
      },
      (err: Error) => {
        assert.match(err.message, /without a valid active Brand Owner assignment/);
        return true;
      }
    );
  });

  it('4. Prerequisite Rule: Shipment creation must fail without completed/partial packing', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    // Assign brand owner
    await service.createBrandOwnerAssignment({
      salesOrderId: 'SO_2026_0001',
      itemId: 'item_prod_cleaner',
      brandOwnerId: 'bo_vio',
    });

    // Try creating shipment without packing
    await assert.rejects(
      async () => {
        await service.createShipment({ salesOrderId: 'SO_2026_0001' }, 'Courier Sam');
      },
      (err: Error) => {
        assert.match(err.message, /requires a valid packing state/);
        return true;
      }
    );
  });

  it('5. Full Lifecycle: Brand Owner Assignment -> Packing -> Shipment -> Delivery -> Return', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    // 1. Brand Owner Assignment for item 1 and item 2
    await service.createBrandOwnerAssignment({
      salesOrderId: 'SO_2026_0001',
      itemId: 'item_prod_cleaner',
      productId: 'prod_cleaner',
      brandOwnerId: 'bo_1',
    });
    await service.createBrandOwnerAssignment({
      salesOrderId: 'SO_2026_0001',
      itemId: 'item_prod_spray',
      productId: 'prod_spray',
      brandOwnerId: 'bo_2',
    });

    // 2. Complete Packing
    const packing = await service.createPacking({ salesOrderId: 'SO_2026_0001', status: 'PACKING' }, 'Packer Alice');
    assert.equal(packing.status, 'PACKING');

    // 3. Create Shipment
    const shipment = await service.createShipment(
      { salesOrderId: 'SO_2026_0001', courierAgency: 'FedEx', trackingNumber: 'TRK998877' },
      'Logistics Supervisor'
    );
    assert.equal(shipment.status, 'SHIPPED');

    // 4. Confirm Delivery
    const delivery = await service.createDelivery(
      { salesOrderId: 'SO_2026_0001', recipientName: 'Asif Zahir' },
      'Delivery Rider'
    );
    assert.equal(delivery.status, 'DELIVERED');

    // 5. Process Return
    const ret = await service.createReturn(
      { salesOrderId: 'SO_2026_0001', reason: 'DAMAGED' },
      'Customer Care'
    );
    assert.equal(ret.status, 'RETURN_REQUESTED');

    // 6. Verify Aggregated Order Lifecycle API
    const lifecycle = await service.getOrderLifecycle('SO_2026_0001');
    assert.equal(lifecycle.salesOrderId, 'SO_2026_0001');
    assert.equal(lifecycle.summary.assignmentStatus, 'COMPLETED');
    assert.equal(lifecycle.summary.packingStatus, 'PACKING');
    assert.equal(lifecycle.summary.shipmentStatus, 'SHIPPED');
    assert.equal(lifecycle.summary.deliveryStatus, 'DELIVERED');
    assert.equal(lifecycle.summary.returnStatus, 'RETURN_REQUESTED');
    assert.equal(lifecycle.items.length, 2);
  });

  it('6. Cancellation Rule: Cancelled transactions retain audit history and status CANCELLED without physical deletion', async () => {
    const { dbAccessor, collections } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    await service.createBrandOwnerAssignment({
      salesOrderId: 'SO_2026_0001',
      itemId: 'item_prod_cleaner',
      brandOwnerId: 'bo_1',
    });
    const packing = await service.createPacking({ salesOrderId: 'SO_2026_0001' });

    // Cancel packing
    const cancelledPacking = await service.cancelOperationalRecord('packing', packing.id, 'Ops Manager', 'Item damage before load');
    assert.equal(cancelledPacking.status, 'CANCELLED');
    assert.equal(collections.shipment_packing.length, 1);

    const history = await service.getPackingHistory(packing.id);
    assert.equal(history.length, 2);
    assert.equal(history[1].toStatus, 'CANCELLED');
    assert.equal(history[1].reason, 'Item damage before load');
  });

  it('7. Search and Server-Side Pagination Test', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    // Create assignments
    for (let i = 1; i <= 15; i++) {
      await service.createBrandOwnerAssignment({
        salesOrderId: 'SO_2026_0001',
        itemId: `item_${i}`,
        productId: `prod_${i}`,
        brandOwnerId: i % 2 === 0 ? 'bo_even' : 'bo_odd',
        brandOwnerName: i % 2 === 0 ? 'Even Brand Owner' : 'Odd Brand Owner',
      });
    }

    const page1 = await service.listBrandOwnerAssignments({ page: 1, limit: 5, brandOwnerId: 'bo_even' });
    assert.equal(page1.pagination.totalRecords, 7);
    assert.equal(page1.records.length, 5);
    assert.equal(page1.pagination.hasNext, true);
    assert.equal(page1.pagination.hasPrevious, false);

    const page2 = await service.listBrandOwnerAssignments({ page: 2, limit: 5, brandOwnerId: 'bo_even' });
    assert.equal(page2.records.length, 2);
    assert.equal(page2.pagination.hasNext, false);
    assert.equal(page2.pagination.hasPrevious, true);
  });

  it('8. Sync Packing & Operational Tables: Should update sales_orders.deliveryStatus = PACKING and sync item-wise details across all 5 tables', async () => {
    const { dbAccessor, collections } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    const assignments = [
      { productId: 'prod_cleaner', brandOwnerId: 'bo_vio_nature', brandOwnerName: 'Vio Nature Science' },
      { productId: 'prod_spray', brandOwnerId: 'bo_vio_spray', brandOwnerName: 'Vio Spray Science' },
    ];

    const result = await service.syncPackingAndOperationalTables('SO_2026_0001', assignments, 'Ops Manager');
    assert.equal(result.success, true);

    // 1. Verify sales_orders deliveryStatus updated to PACKING
    const salesOrder = collections.sales_orders.find((o) => o.id === 'SO_2026_0001');
    assert.equal(salesOrder.deliveryStatus, 'PACKING');

    // 2. Verify item-wise entries created across all 5 tables
    assert.equal(collections.shipment_brand_owner_assignments.length, 2);
    assert.equal(collections.shipment_packing.length, 2);
    assert.equal(collections.shipment_shipments.length, 2);
    assert.equal(collections.shipment_deliveries.length, 2);
    assert.equal(collections.shipment_returns.length, 2);

    // Verify brand owner assignment values
    assert.equal(collections.shipment_brand_owner_assignments[0].brandOwnerName, 'Vio Nature Science');
    assert.equal(collections.shipment_brand_owner_assignments[0].status, 'ASSIGNED');

    // Verify packing status
    assert.equal(collections.shipment_packing[0].status, 'PACKING');
  });

  it('9. Sync assignments from submitted items when the sales order has no products array', async () => {
    const { dbAccessor, collections } = createMockDatabase();
    collections.sales_orders[0].products = [];
    const service = new ShipmentOperationsService(dbAccessor);

    await service.syncPackingAndOperationalTables('SO_2026_0001', [
      {
        orderItemId: 'item_custom_1',
        productId: 'prod_custom_1',
        brandOwnerId: 'bo_custom',
        brandOwnerName: 'Custom Brand Owner',
      },
    ], 'Ops Manager');

    assert.equal(collections.shipment_brand_owner_assignments.length, 1);
    assert.equal(collections.shipment_brand_owner_assignments[0].itemId, 'item_custom_1');
    assert.equal(collections.shipment_brand_owner_assignments[0].brandOwnerId, 'bo_custom');
  });

  it('10. Sync persists the supplied fulfilment status on the sales order', async () => {
    const { dbAccessor, collections } = createMockDatabase();
    const service = new ShipmentOperationsService(dbAccessor);

    await service.syncPackingAndOperationalTables('SO_2026_0001', [], 'Ops Manager', 'NOT_STARTED');

    assert.equal(collections.sales_orders[0].deliveryStatus, 'NOT_STARTED');
  });
});
