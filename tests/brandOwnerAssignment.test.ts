import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OperationsService, DataAccessor } from '../src/services/operationsService';

function createMockDatabase() {
  const collections: Record<string, any[]> = {
    sales_orders: [
      {
        id: 'ord_active_1',
        orderNumber: 'SO-1001',
        customerId: 'cust_01',
        customerName: 'Aarav Sharma',
        products: [
          { productId: 'prod_apple', productName: 'Organic Apples', quantity: 2, price: 150 },
        ],
        totalValue: 300,
        paymentStatus: 'Paid',
        deliveryStatus: 'Pending',
        createdAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'ord_active_2',
        orderNumber: 'SO-1002',
        customerId: 'cust_02',
        customerName: 'Priya Patel',
        products: [
          { productId: 'prod_tea', productName: 'Green Tea Extract', quantity: 1, price: 200 },
        ],
        totalValue: 200,
        paymentStatus: 'Pending',
        deliveryStatus: 'PACKING',
        createdAt: '2026-10-02T11:00:00.000Z',
      },
      {
        id: 'ord_completed',
        orderNumber: 'SO-1003',
        customerId: 'cust_03',
        customerName: 'Rahul Verma',
        products: [
          { productId: 'prod_honey', productName: 'Pure Honey', quantity: 1, price: 500 },
        ],
        totalValue: 500,
        paymentStatus: 'Paid',
        deliveryStatus: 'COMPLETED',
        createdAt: '2026-10-03T12:00:00.000Z',
      },
      {
        id: 'ord_returned',
        orderNumber: 'SO-1004',
        customerId: 'cust_04',
        customerName: 'Neha Gupta',
        products: [
          { productId: 'prod_jam', productName: 'Fruit Jam', quantity: 2, price: 100 },
        ],
        totalValue: 200,
        paymentStatus: 'Refunded',
        deliveryStatus: 'RETURNED',
        createdAt: '2026-10-04T09:00:00.000Z',
      },
    ],
    order_fulfilment: [],
    order_packing: [],
    order_shipments: [],
    order_delivery: [],
    order_returns: [],
    order_operation_history: [],
    order_brand_assignments: [],
    product_brand_owners: [
      { id: 'bo_01', name: 'Vio Organic Farms', contactEmail: 'info@vioorganic.com', contactMobile: '+919876543210' },
      { id: 'bo_02', name: 'Nature Choice', contactEmail: 'contact@naturechoice.com', contactMobile: '+919123456789' },
    ],
    customers: [],
  };

  const dbAccessor: DataAccessor = {
    getCollectionDocs: async (col: string) => JSON.parse(JSON.stringify(collections[col] || [])),
    saveCollectionDoc: async (col: string, item: any) => {
      if (!collections[col]) collections[col] = [];
      const id = String(item.id || Date.now());
      const idx = collections[col].findIndex((c) => String(c.id) === id);
      if (idx >= 0) collections[col][idx] = item;
      else collections[col].push(item);
    },
  };

  return { service: new OperationsService(dbAccessor), collections };
}

describe('Brand Owner Assignment Module & Data Validation Tests', () => {
  it('1. Should populate records from sales_orders table excluding COMPLETED and RETURNED deliveryStatus', async () => {
    const { service } = createMockDatabase();
    const result = await service.listStageRecords('brand-owner-assignment');

    assert.equal(result.records.length, 2);
    const ids = result.records.map((r: any) => r.id);
    assert.ok(ids.includes('ord_active_1'));
    assert.ok(ids.includes('ord_active_2'));
    assert.ok(!ids.includes('ord_completed'));
    assert.ok(!ids.includes('ord_returned'));
  });

  it('2. Should successfully assign brand owner for eligible sales order', async () => {
    const { service, collections } = createMockDatabase();
    const assignment = await service.assignBrandOwners(
      'ord_active_1',
      [
        {
          orderItemId: 'item_prod_apple',
          productId: 'prod_apple',
          brandOwnerId: 'bo_01',
          brandOwnerName: 'Vio Organic Farms',
        },
      ],
      'Ops Test Admin'
    );

    assert.ok(assignment);
    assert.equal(assignment.orderId, 'ord_active_1');
    assert.equal(collections.order_brand_assignments.length, 1);
  });

  it('3. DATA VALIDATION RESTRICTION: Should reject brand owner assignment when deliveryStatus is COMPLETED', async () => {
    const { service } = createMockDatabase();

    await assert.rejects(
      async () => {
        await service.assignBrandOwners(
          'ord_completed',
          [
            {
              orderItemId: 'item_prod_honey',
              productId: 'prod_honey',
              brandOwnerId: 'bo_01',
              brandOwnerName: 'Vio Organic Farms',
            },
          ],
          'Ops Test Admin'
        );
      },
      (err: any) => {
        assert.ok(err.message.includes('Data validation failed') || err.message.includes('restricted') || err.message.includes('COMPLETED'));
        return true;
      }
    );
  });

  it('4. DATA VALIDATION RESTRICTION: Should reject brand owner assignment when deliveryStatus is RETURNED', async () => {
    const { service } = createMockDatabase();

    await assert.rejects(
      async () => {
        await service.assignBrandOwners(
          'ord_returned',
          [
            {
              orderItemId: 'item_prod_jam',
              productId: 'prod_jam',
              brandOwnerId: 'bo_02',
              brandOwnerName: 'Nature Choice',
            },
          ],
          'Ops Test Admin'
        );
      },
      (err: any) => {
        assert.ok(err.message.includes('Data validation failed') || err.message.includes('restricted') || err.message.includes('RETURNED'));
        return true;
      }
    );
  });
});
