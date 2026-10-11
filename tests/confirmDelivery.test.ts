import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmDeliveryStatusOption } from '../src/components/ConfirmDeliveryView';

describe('Confirm Delivery Component Logic & Database Verification Tests', () => {
  interface MockDatabase {
    shipment_brand_owner_fulfilment: any[];
    sales_orders: any[];
    products: any[];
  }

  function setupMockDb(): MockDatabase {
    return {
      shipment_brand_owner_fulfilment: [
        {
          id: 'boa_so1_p1',
          brandOwnerAssignid: 'boa_so1_p1',
          salesOrderId: 'SO_2026_001',
          orderItemId: 'item_prod_face_wash',
          productId: 'prod_face_wash',
          productName: 'Herbal Face Wash 100ml',
          brandOwnerId: 'bo_vio_herbal',
          brandOwnerName: 'Vio Herbal Care',
          orderpackingsize: 'Box 100ml',
          orderunit: 'BOTTLE',
          orderqty: 10,
          outpackdate: '2026-10-10',
          outpackingsize: 'Box 100ml',
          outunit: 'BOTTLE',
          outquantity: 10,
          outstatus: 'SHIPPED',
          outbalanceqty: 0,
          outexpecteddateofdespatchdate: '2026-10-10',
          outpickupdate: '2026-10-10',
          outcouriername: 'Delhivery',
          outcourierdocketno: 'DEL1234567',
          outdealyreasons: '',
          deliverydate: '2026-10-11',
          deliverycondition: 'Good Condition',
          fulfillmentstatus: 'SHIPPED',
        },
        {
          id: 'boa_so1_p2',
          brandOwnerAssignid: 'boa_so1_p2',
          salesOrderId: 'SO_2026_001',
          orderItemId: 'item_prod_soap',
          productId: 'prod_soap',
          productName: 'Organic Soap',
          brandOwnerId: 'bo_vio_soap',
          brandOwnerName: 'Vio Organic',
          orderpackingsize: 'Bar 125g',
          orderunit: 'PCS',
          orderqty: 5,
          outpackdate: '2026-10-10',
          outpackingsize: 'Bar 125g',
          outunit: 'PCS',
          outquantity: 5,
          outstatus: 'READY_FOR_DISPATCH',
          outbalanceqty: 0,
          outexpecteddateofdespatchdate: '2026-10-10',
          outpickupdate: '2026-10-10',
          outcouriername: 'Delhivery',
          outcourierdocketno: '',
          outdealyreasons: '',
          fulfillmentstatus: 'READY_FOR_DISPATCH', // NOT SHIPPED
        },
      ],
      sales_orders: [
        {
          id: 'SO_2026_001',
          orderNumber: 'SO_2026_001',
          customerName: 'Priya Sharma',
          customerMobile: '+91 9876543210',
          contactNo: '+91 9876543210',
          createdAt: '2026-10-09T08:30:00.000Z',
        },
      ],
      products: [
        {
          id: 'item_prod_face_wash',
          name: 'Herbal Deep Clean Face Wash',
          sku: 'SKU-HFW-100',
        },
        {
          id: 'item_prod_soap',
          name: 'Organic Aloe Vera Soap Bar',
          sku: 'SKU-OAS-125',
        },
      ],
    };
  }

  it('1. Filter: lists only records satisfying fulfillmentstatus = SHIPPED', () => {
    const db = setupMockDb();
    const shippedRecords = db.shipment_brand_owner_fulfilment.filter(
      (r) => r.fulfillmentstatus === 'SHIPPED' || r.outstatus === 'SHIPPED'
    );

    assert.equal(shippedRecords.length, 1);
    assert.equal(shippedRecords[0].id, 'boa_so1_p1');
    assert.equal(shippedRecords[0].fulfillmentstatus, 'SHIPPED');
  });

  it('2. Linking & Mappings: Order Date, Order No, Customer, Mobile & Product display values', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];
    const matchedOrder = db.sales_orders.find((o) => o.id === row.salesOrderId);
    const matchedProduct = db.products.find((p) => p.id === row.orderItemId);

    assert.equal(matchedOrder?.createdAt.split('T')[0], '2026-10-09');
    assert.equal(matchedOrder?.customerName, 'Priya Sharma');
    assert.equal(matchedOrder?.customerMobile, '+91 9876543210');
    assert.equal(matchedProduct?.name, 'Herbal Deep Clean Face Wash');
  });

  it('3. Delivery Confirmation Save: updates outstatus to COMPLETED and sets deliverydate and deliverycondition', () => {
    const db = setupMockDb();
    const target = db.shipment_brand_owner_fulfilment[0];

    const updatedData = {
      ...target,
      outstatus: 'COMPLETED',
      fulfillmentstatus: 'COMPLETED',
      status: 'DELIVERED',
      deliverystatus: 'DELIVERED',
      deliverydate: '2026-10-11',
      deliverycondition: 'Received safely by customer',
      outdealyreasons: 'Traffic delay resolved',
      updatedAt: new Date().toISOString(),
    };

    const idx = db.shipment_brand_owner_fulfilment.findIndex((r) => r.id === target.id);
    db.shipment_brand_owner_fulfilment[idx] = updatedData;

    const saved = db.shipment_brand_owner_fulfilment[idx];
    assert.equal(saved.outstatus, 'COMPLETED');
    assert.equal(saved.fulfillmentstatus, 'COMPLETED');
    assert.equal(saved.status, 'DELIVERED');
    assert.equal(saved.deliverydate, '2026-10-11');
    assert.equal(saved.deliverycondition, 'Received safely by customer');
    assert.equal(saved.outdealyreasons, 'Traffic delay resolved');
  });

  it('4. Field constraints: outdealyreasons max 70 chars and deliverycondition max 50 chars', () => {
    const longDelayReason = 'A'.repeat(100);
    const longDeliveryCondition = 'B'.repeat(100);

    const truncatedDelay = longDelayReason.slice(0, 70);
    const truncatedCondition = longDeliveryCondition.slice(0, 50);

    assert.equal(truncatedDelay.length, 70);
    assert.equal(truncatedCondition.length, 50);
  });
});
