import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OperationsService, DataAccessor } from '../src/services/operationsService';

function createMockDatabase() {
  const collections: Record<string, any[]> = {
    sales_orders: [
      {
        id: 'ord_1001',
        orderNumber: 'SO-1001',
        customerId: 'cust_01',
        customerName: 'Aarav Sharma',
        customerCompany: 'VioLeafy Retail',
        products: [
          { productId: 'prod_apple', productName: 'Organic Apples', quantity: 2, price: 150, brandOwner: 'Fresh Orchard' },
          { productId: 'prod_honey', productName: 'Pure Raw Honey', quantity: 1, price: 350, brandOwner: 'BeeNatural' },
        ],
        totalValue: 650,
        paymentStatus: 'Paid',
        deliveryStatus: 'Pending',
        assignedTo: 'Manager One',
        createdAt: '2026-08-25T10:00:00.000Z',
        paymentMethod: 'UPI',
        salesChannel: 'Mobile App',
      },
      {
        id: 'ord_1002',
        orderNumber: 'SO-1002',
        customerId: 'cust_02',
        customerName: 'Priya Patel',
        customerCompany: 'Patel Enterprises',
        products: [
          { productId: 'prod_tea', productName: 'Green Tea Extract', quantity: 3, price: 200 },
        ],
        totalValue: 600,
        paymentStatus: 'Pending',
        deliveryStatus: 'Pending',
        assignedTo: 'Manager Two',
        createdAt: '2026-08-25T11:30:00.000Z',
        paymentMethod: 'Bank Transfer',
        contactNo: '+919876543210',
        salesChannel: 'Mobile App',
      },
    ],
    order_fulfilment: [],
    order_packing: [],
    order_shipments: [],
    order_delivery: [],
    order_returns: [],
    order_operation_history: [],
    order_brand_assignments: [],
    payment_reminders: [],
    whatsapp_messages: [],
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

async function prepareOrderForShipment(service: OperationsService, orderId: string) {
  const details = await service.getOrderDetails(orderId);
  await service.assignBrandOwners(orderId, (details.order.products || []).map((product: any, index: number) => ({
    orderItemId: `item_${index + 1}`,
    productId: product.productId || product.id,
    brandOwnerId: `owner_${index + 1}`,
  })));
  return service.completePacking(orderId, 'Test Packer');
}

describe('Order Operations & Fulfilment API Integration Tests', () => {

  it('1. Should list existing sales_orders combined with isolated fulfilment status', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    const orders = await service.listOrders();
    assert.equal(orders.length, 2);
    assert.equal(orders[0].id, 'ord_1001');
    assert.equal(orders[0].fulfilmentStatus, 'NOT_STARTED');
    assert.equal(orders[1].paymentStatus, 'Pending');
  });

  it('2. Should require complete assignment before packing and persist completed packing without mutating sales_orders', async () => {
    const { collections, dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    const initialSalesOrderCopy = JSON.stringify(collections.sales_orders);

    await assert.rejects(
      () => service.completePacking('ord_1001', 'Packer-Alpha'),
      /Brand owner assignment must be complete/
    );
    await service.assignBrandOwners('ord_1001', [
      { orderItemId: 'item_1', productId: 'prod_apple', brandOwnerId: 'bo_fresh' },
      { orderItemId: 'item_2', productId: 'prod_honey', brandOwnerId: 'bo_bee' },
    ]);
    const packing2 = await service.completePacking('ord_1001', 'Packer-Alpha', 'Verified seals and item counts');
    assert.equal(packing2.status, 'COMPLETED');
    assert.ok(packing2.completedAt);

    const details = await service.getOrderDetails('ord_1001');
    assert.equal(details.fulfilment.status, 'READY_FOR_DISPATCH');
    const packingStage = await service.listStageRecords('packing');
    const shipmentStage = await service.listStageRecords('shipment');
    assert.equal(packingStage.records.some((record) => record.id === 'ord_1001'), false);
    assert.equal(shipmentStage.records.some((record) => record.id === 'ord_1001'), true);

    // Verify original sales_orders records remained completely untouched
    assert.equal(JSON.stringify(collections.sales_orders), initialSalesOrderCopy);
  });

  it('2b. Should expose only the currently eligible next stage after assignment and packing', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);
    assert.equal((await service.listStageRecords('packing')).pagination.totalRecords, 0);
    assert.equal((await service.listStageRecords('shipment')).pagination.totalRecords, 0);

    await service.assignBrandOwners('ord_1001', [
      { orderItemId: 'item_1', productId: 'prod_apple', brandOwnerId: 'bo_fresh' },
      { orderItemId: 'item_2', productId: 'prod_honey', brandOwnerId: 'bo_bee' },
    ]);
    assert.equal((await service.listStageRecords('packing')).pagination.totalRecords, 1);
    assert.equal((await service.listStageRecords('shipment')).pagination.totalRecords, 0);

    await service.completePacking('ord_1001', 'Packer');
    assert.equal((await service.listStageRecords('packing')).pagination.totalRecords, 0);
    assert.equal((await service.listStageRecords('shipment')).pagination.totalRecords, 1);
  });

  it('2c. Should reject direct fulfilment transitions that skip an operation stage', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);
    await assert.rejects(
      () => service.updateStatusDirectly('ord_1001', 'DELIVERED'),
      /Direct status changes are disabled/
    );
  });

  it('3. Should assign brand owners at item level in isolated collection', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    const result = await service.assignBrandOwners('ord_1001', [
      { orderItemId: 'item_1', productId: 'prod_apple', brandOwnerId: 'bo_fresh', brandOwnerName: 'Fresh Orchard Corp' },
      { orderItemId: 'item_2', productId: 'prod_honey', brandOwnerId: 'bo_bee', brandOwnerName: 'BeeNatural Organics' },
    ]);

    assert.equal(result.assignments.length, 2);
    assert.equal(result.assignments[0].brandOwnerName, 'Fresh Orchard Corp');

    const details = await service.getOrderDetails('ord_1001');
    assert.equal(details.brandAssignments?.length, 2);
  });

  it('4. Should create shipment with server-side calculated charges', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    await assert.rejects(
      () => service.createShipment('ord_1001', { courierAgency: 'Delhivery', trackingNumber: 'EARLY' }),
      /Packing must be completed/
    );
    await prepareOrderForShipment(service, 'ord_1001');
    const shipment = await service.createShipment('ord_1001', {
      courierAgency: 'Delhivery',
      trackingNumber: 'DELHI123456',
      packageCount: 2,
      weightKg: 1.2,
      baseCharge: 100,
      handlingCharge: 20,
      additionalCharge: 15,
      otherCharge: 5,
    });

    assert.equal(shipment.courierAgency, 'Delhivery');
    assert.equal(shipment.trackingNumber, 'DELHI123456');
    assert.equal(shipment.charges.totalCharge, 140); // 100 + 20 + 15 + 5

    const details = await service.getOrderDetails('ord_1001');
    assert.equal(details.fulfilment.status, 'READY_FOR_DISPATCH');
  });

  it('5. Should dispatch shipment and enforce concurrency protection against double dispatch', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    await prepareOrderForShipment(service, 'ord_1001');
    const shipment = await service.createShipment('ord_1001', {
      courierAgency: 'FedEx',
      trackingNumber: 'FDX998877',
      baseCharge: 80,
    });

    const dispatched = await service.dispatchShipment(shipment.id, 'Logistics Lead');
    assert.equal(dispatched.status, 'DISPATCHED');

    const details = await service.getOrderDetails('ord_1001');
    assert.equal(details.fulfilment.status, 'DISPATCHED');

    const replay = await service.dispatchShipment(shipment.id, 'Second Dispatcher');
    assert.equal(replay.id, shipment.id);
    assert.equal(replay.dispatchedBy, 'Logistics Lead');
  });

  it('6. Should record permanent delivery history', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    await prepareOrderForShipment(service, 'ord_1001');
    const shipment = await service.createShipment('ord_1001', {
      courierAgency: 'Bluedart',
      trackingNumber: 'BD776655',
    });
    await service.dispatchShipment(shipment.id);

    const delivery = await service.recordDelivery(shipment.id, {
      recipientName: 'Aarav Sharma',
      remarks: 'Delivered to recipient in person',
      proofOfDeliveryUrl: 'https://storage.violeafy.com/pod/BD776655.pdf',
    });

    assert.equal(delivery.recipientName, 'Aarav Sharma');

    const details = await service.getOrderDetails('ord_1001');
    assert.equal(details.fulfilment.status, 'DELIVERED');
    assert.equal(details.delivery?.recipientName, 'Aarav Sharma');
  });

  it('7. Should process item returns and reverse logistics without overwriting outbound tracking', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    // Create outbound shipment
    await prepareOrderForShipment(service, 'ord_1001');
    const outboundShipment = await service.createShipment('ord_1001', {
      courierAgency: 'Express Courier',
      trackingNumber: 'OUTBOUND_123',
    });

    await assert.rejects(
      () => service.createReturn('ord_1001', {
        items: [{ orderItemId: 'item_1', productId: 'prod_apple', quantity: 1, reason: 'DAMAGED' }],
        reason: 'DAMAGED',
      }),
      /only available after delivery/
    );
    await service.dispatchShipment(outboundShipment.id);
    await service.recordDelivery(outboundShipment.id, { recipientName: 'Aarav Sharma' });

    // Create return
    const returnRecord = await service.createReturn('ord_1001', {
      items: [{ orderItemId: 'item_1', productId: 'prod_apple', quantity: 1, reason: 'DAMAGED' }],
      reason: 'DAMAGED',
      notes: 'Item crushed during transit',
    });

    assert.equal(returnRecord.status, 'REQUESTED');

    // Create reverse shipment with distinct tracking number
    const updatedReturn = await service.createReverseShipment(returnRecord.id, {
      courierAgency: 'Return Logistics Co',
      trackingNumber: 'REVERSE_999',
      remarks: 'Pickup scheduled',
    });

    assert.equal(updatedReturn.reverseShipment?.trackingNumber, 'REVERSE_999');

    // Outbound shipment tracking MUST remain unchanged
    const details = await service.getOrderDetails('ord_1001');
    assert.equal(details.shipments[0].trackingNumber, 'OUTBOUND_123');

    // Confirm received and resolve
    await service.confirmReturnReceived(returnRecord.id, 'Receiver Bob');
    const resolved = await service.resolveReturn(returnRecord.id, 'REFUND', 'Refund issued to wallet');
    assert.equal(resolved.status, 'REFUNDED');
  });

  it('8. Should replay completed operations from durable records without requiring process-local keys', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    await service.assignBrandOwners('ord_1001', [
      { orderItemId: 'item_1', productId: 'prod_apple', brandOwnerId: 'bo_fresh' },
      { orderItemId: 'item_2', productId: 'prod_honey', brandOwnerId: 'bo_bee' },
    ]);
    const packing1 = await service.completePacking('ord_1001', 'Packer-A', 'Notes A');
    const secondService = new OperationsService(dbAccessor);
    const packing2 = await secondService.completePacking('ord_1001', 'Packer-B', 'Notes B');

    assert.equal(packing1.id, packing2.id);
    assert.equal(packing2.packedBy, 'Packer-A');

    const shipment1 = await service.createShipment('ord_1001', { courierAgency: 'Courier', trackingNumber: 'TRACK-1' });
    const shipment2 = await secondService.createShipment('ord_1001', { courierAgency: 'Other', trackingNumber: 'TRACK-2' });
    assert.equal(shipment1.id, shipment2.id);
    assert.equal(shipment2.trackingNumber, 'TRACK-1');
  });

  it('8b. Should reject delivery before dispatch and replay a recorded delivery', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);
    await prepareOrderForShipment(service, 'ord_1001');
    const shipment = await service.createShipment('ord_1001', { courierAgency: 'Courier', trackingNumber: 'TRACK-DEL' });
    await assert.rejects(
      () => service.recordDelivery(shipment.id, { recipientName: 'Aarav Sharma' }),
      /dispatched, undelivered shipment/
    );
    await service.dispatchShipment(shipment.id);
    const first = await service.recordDelivery(shipment.id, { recipientName: 'Aarav Sharma' });
    const replay = await new OperationsService(dbAccessor).recordDelivery(shipment.id, { recipientName: 'Different Recipient' });
    assert.equal(replay.id, first.id);
    assert.equal(replay.recipientName, 'Aarav Sharma');
  });

  it('9. Should list stage-specific records with multi-field search and pagination', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    // Initial state: brand-owner-assignment stage should include ord_1001 & ord_1002
    const res1 = await service.listStageRecords('brand-owner-assignment', {
      customerName: 'Aarav',
      page: 1,
      limit: 10,
    });
    assert.equal(res1.records.length, 1);
    assert.equal(res1.records[0].customerName, 'Aarav Sharma');
    assert.equal(res1.pagination.totalRecords, 1);
    assert.equal(res1.pagination.page, 1);

    // Search by item name
    const res2 = await service.listStageRecords('brand-owner-assignment', {
      itemName: 'Honey',
    });
    assert.equal(res2.records.length, 1);
    assert.equal(res2.records[0].orderNumber, 'SO-1001');

    // Search by mobile
    const res3 = await service.listStageRecords('brand-owner-assignment', {
      mobile: '9876543210',
    });
    assert.equal(res3.records.length, 1);
    assert.equal(res3.records[0].orderNumber, 'SO-1002');
  });

  it('10. Should enforce max limit of 50 in stage listing pagination', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    const res = await service.listStageRecords('brand-owner-assignment', {
      limit: 100, // Client requests 100
    });
    assert.equal(res.pagination.limit, 50); // Capped at 50
  });

  it('11. Should retrieve and save global notification configuration', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    const initialConfig = await service.getGlobalNotificationConfig();
    assert.equal(initialConfig.brandOwnerAssignment.emailtobrandowner, 'yes');
    assert.equal(initialConfig.completePacking.emailtocustomer, 'yes');

    // Update config
    const updated = await service.saveGlobalNotificationConfig({
      brandOwnerAssignment: {
        ...initialConfig.brandOwnerAssignment,
        emailtobrandowner: 'no',
      },
    });

    assert.equal(updated.brandOwnerAssignment.emailtobrandowner, 'no');

    const refetched = await service.getGlobalNotificationConfig();
    assert.equal(refetched.brandOwnerAssignment.emailtobrandowner, 'no');
  });
});

