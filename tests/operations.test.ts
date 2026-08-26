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

  it('2. Should start and complete packing lifecycle without mutating sales_orders', async () => {
    const { collections, dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    const initialSalesOrderCopy = JSON.stringify(collections.sales_orders);

    // Start packing
    const packing1 = await service.startPacking('ord_1001', 'Packer-Alpha');
    assert.equal(packing1.status, 'PACKING');
    assert.equal(packing1.packedBy, 'Packer-Alpha');

    let details = await service.getOrderDetails('ord_1001');
    assert.equal(details.fulfilment.status, 'PACKING');

    // Complete packing
    const packing2 = await service.completePacking('ord_1001', 'Packer-Alpha', 'Verified seals and item counts');
    assert.equal(packing2.status, 'PACKED');

    details = await service.getOrderDetails('ord_1001');
    assert.equal(details.fulfilment.status, 'PACKED');

    // Verify original sales_orders records remained completely untouched
    assert.equal(JSON.stringify(collections.sales_orders), initialSalesOrderCopy);
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

    const shipment = await service.createShipment('ord_1001', {
      courierAgency: 'FedEx',
      trackingNumber: 'FDX998877',
      baseCharge: 80,
    });

    const dispatched = await service.dispatchShipment(shipment.id, 'Logistics Lead');
    assert.equal(dispatched.status, 'DISPATCHED');

    const details = await service.getOrderDetails('ord_1001');
    assert.equal(details.fulfilment.status, 'DISPATCHED');

    // Concurrent double dispatch attempt must throw controlled error
    await assert.rejects(
      async () => service.dispatchShipment(shipment.id, 'Second Dispatcher'),
      (err: any) => err.message === 'SHIPMENT_ALREADY_DISPATCHED'
    );
  });

  it('6. Should record permanent delivery history', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

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
    const outboundShipment = await service.createShipment('ord_1001', {
      courierAgency: 'Express Courier',
      trackingNumber: 'OUTBOUND_123',
    });

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

  it('8. Should handle payment reminders for unpaid orders', async () => {
    const { collections, dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    // Standard reminder
    const reminder1 = await service.sendPaymentReminder('ord_1002');
    assert.equal(reminder1.status, 'SENT');

    // WhatsApp reminder
    const reminder2 = await service.sendWhatsAppPaymentReminder('ord_1002');
    assert.equal(reminder2.status, 'SENT');
    assert.equal(reminder2.sentToPhone, '+919876543210');

    // Verify WhatsApp message logged to collection
    assert.equal(collections.whatsapp_messages.length, 1);
    assert.equal(collections.whatsapp_messages[0].phone, '+919876543210');

    // Attempting to send reminder for paid order must throw error
    await assert.rejects(
      async () => service.sendPaymentReminder('ord_1001'),
      (err: any) => err.message.includes('already paid')
    );
  });

  it('9. Should support Idempotency-Key header to prevent duplicate operations', async () => {
    const { dbAccessor } = createMockDatabase();
    const service = new OperationsService(dbAccessor);

    const key = 'idem_key_unique_001';
    const packing1 = await service.startPacking('ord_1001', 'Packer-A', key);
    const packing2 = await service.startPacking('ord_1001', 'Packer-B', key);

    // Repeated call with same idempotency key must return cached exact result
    assert.equal(packing1.id, packing2.id);
    assert.equal(packing2.packedBy, 'Packer-A');
  });
});
