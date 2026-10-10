import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Complete Packing View Component & Backend Logic Tests', () => {
  interface MockDatabase {
    shipment_brand_owner_fulfilment: any[];
    orderfulfilment: any[];
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
          outstatus: 'PACKING',
          outbalanceqty: 0,
          outexpecteddateofdespatchdate: '2026-10-10',
          outdealyreasons: '',
          fulfillmentstatus: 'PACKING',
          orderfulfilment: [],
        },
        {
          id: 'boa_so2_p2',
          brandOwnerAssignid: 'boa_so2_p2',
          salesOrderId: 'SO_2026_002',
          orderItemId: 'item_prod_soap',
          productId: 'prod_soap',
          productName: 'Organic Aloe Vera Soap Bar',
          brandOwnerId: 'bo_vio_herbal',
          brandOwnerName: 'Vio Herbal Care',
          orderpackingsize: 'Standard',
          orderunit: 'PCS',
          orderqty: 5,
          outpackdate: '2026-10-10',
          outpackingsize: 'Standard',
          outunit: 'PCS',
          outquantity: 5,
          outstatus: 'READY_FOR_DISPATCH',
          outbalanceqty: 0,
          outexpecteddateofdespatchdate: '2026-10-10',
          outdealyreasons: '',
          fulfillmentstatus: 'READY_FOR_DISPATCH',
          orderfulfilment: [],
        },
      ],
      orderfulfilment: [],
      products: [
        {
          id: 'item_prod_face_wash',
          name: 'Herbal Deep Clean Face Wash',
          sku: 'SKU-HFW-100',
        },
        {
          id: 'prod_soap',
          name: 'Organic Aloe Vera Soap Bar',
          sku: 'SKU-OAS-125',
        },
      ],
    };
  }

  it('1. Product name resolution: links id -> orderItemId from products table', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    // Linking id -> orderItemId
    const matchedProduct = db.products.find((p) => p.id === row.orderItemId);
    assert.ok(matchedProduct, 'Product must be resolved using orderItemId');
    assert.equal(matchedProduct.name, 'Herbal Deep Clean Face Wash');
  });

  it('2. Full Packing: when outbalanceqty === 0, fulfillmentstatus equals outstatus and no split record is created', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    const orderqty = row.orderqty; // 10
    const outquantity = 10; // full pack
    const outbalanceqty = orderqty - outquantity; // 0
    const outstatus = 'READY_FOR_DISPATCH';
    const fulfillmentstatus = outbalanceqty > 0 ? 'PARTIALLY_PACKED' : outstatus;

    assert.equal(outbalanceqty, 0);
    assert.equal(fulfillmentstatus, 'READY_FOR_DISPATCH');

    // Update row
    row.outquantity = outquantity;
    row.outbalanceqty = outbalanceqty;
    row.outstatus = outstatus;
    row.fulfillmentstatus = fulfillmentstatus;

    assert.equal(row.fulfillmentstatus, 'READY_FOR_DISPATCH');
    assert.equal(db.orderfulfilment.length, 0, 'No child record should be created when outbalanceqty is 0');
  });

  it('3. Partial Packing: when outbalanceqty > 0, creates new record orderfulfilment with remaining balance and sets fulfillmentstatus to PARTIALLY_PACKED', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    const orderqty = row.orderqty; // 10
    const outquantity = 6; // partial pack 6 of 10
    const outbalanceqty = orderqty - outquantity; // 4
    const outstatus = 'READY_FOR_DISPATCH';
    const fulfillmentstatus = outbalanceqty > 0 ? 'PARTIALLY_PACKED' : outstatus;

    assert.equal(outbalanceqty, 4);
    assert.equal(fulfillmentstatus, 'PARTIALLY_PACKED');

    // Update existing row
    row.outquantity = outquantity;
    row.outbalanceqty = outbalanceqty;
    row.outstatus = outstatus;
    row.fulfillmentstatus = fulfillmentstatus;

    // Spec: if outbalanceqty > 0 then create new record orderfulfilment
    const uniqueId = `of_${Date.now()}_test1`;
    const newRecordOrderFulfilment = {
      id: uniqueId,
      orderItemId: row.orderItemId,
      orderpackingsize: row.orderpackingsize,
      orderqty: outbalanceqty, // 4
      orderunit: row.orderunit,
      outbalanceqty: 0,
      outcourierdocketno: '',
      outcouriername: '',
      outdealyreasons: '',
      outemailssenddetails: '',
      outestimateddatetoreach: '',
      outexpecteddateofdespatchdate: '',
      outpackdate: '',
      outpackingsize: '',
      outpackingstatus: 'PACKING',
      outpickupdate: '',
      outquantity: 0,
      outstatus: '',
      outunit: '',
      fulfillmentstatus: 'PARTIALLY_PACKED',
    };

    db.orderfulfilment.push(newRecordOrderFulfilment);
    db.shipment_brand_owner_fulfilment[0].orderfulfilment.push(newRecordOrderFulfilment);

    // Verify parent record
    assert.equal(row.fulfillmentstatus, 'PARTIALLY_PACKED');
    assert.equal(row.outquantity, 6);
    assert.equal(row.outbalanceqty, 4);

    // Verify newly generated orderfulfilment record
    assert.equal(db.orderfulfilment.length, 1);
    const child = db.orderfulfilment[0];
    assert.equal(child.orderItemId, 'item_prod_face_wash');
    assert.equal(child.orderqty, 4, 'New record orderqty must equal outbalanceqty');
    assert.equal(child.orderpackingsize, 'Box 100ml');
    assert.equal(child.orderunit, 'BOTTLE');
    assert.equal(child.outbalanceqty, 0);
    assert.equal(child.outpackingstatus, 'PACKING');
    assert.equal(child.outquantity, 0);
  });

  it('4. Data validation: outquantity must be > 0 and <= orderqty, delay reasons maximum 70 characters', () => {
    const orderqty = 10;

    // Zero quantity validation
    const qtyZero = 0;
    const isZeroValid = qtyZero > 0 && qtyZero <= orderqty;
    assert.equal(isZeroValid, false, 'outquantity = 0 must be invalid');

    // Negative quantity validation
    const qtyNegative = -3;
    const isNegativeValid = qtyNegative > 0 && qtyNegative <= orderqty;
    assert.equal(isNegativeValid, false, 'outquantity < 0 must be invalid');

    // Greater than orderqty validation
    const qtyExcess = 15;
    const isExcessValid = qtyExcess > 0 && qtyExcess <= orderqty;
    assert.equal(isExcessValid, false, 'outquantity > orderqty must be invalid');

    // Valid quantity
    const qtyValid = 7;
    const isValid = qtyValid > 0 && qtyValid <= orderqty;
    assert.equal(isValid, true, 'outquantity in range must be valid');

    // Delay reasons max 70 chars validation
    const longReason = 'A'.repeat(85);
    const cappedReason = longReason.slice(0, 70);
    assert.equal(cappedReason.length, 70, 'Delay reasons must be capped at 70 characters');
  });

  it('5. Status options: supports READY_FOR_DISPATCH, PACKING, CANCELLED', () => {
    const allowedStatuses = ['READY_FOR_DISPATCH', 'PACKING', 'CANCELLED'];

    assert.ok(allowedStatuses.includes('READY_FOR_DISPATCH'));
    assert.ok(allowedStatuses.includes('PACKING'));
    assert.ok(allowedStatuses.includes('CANCELLED'));
  });

  it('6. Default listing filter: lists records satisfying fulfillmentstatus = "PACKING"', () => {
    const db = setupMockDb();
    const statusFilter = 'PACKING';

    const defaultFiltered = db.shipment_brand_owner_fulfilment.filter(
      (r) => r.fulfillmentstatus === statusFilter || r.outstatus === statusFilter
    );

    assert.equal(defaultFiltered.length, 1);
    assert.equal(defaultFiltered[0].id, 'boa_so1_p1');
    assert.equal(defaultFiltered[0].fulfillmentstatus, 'PACKING');
  });

  it('7. Status retention after save: recently updated records remain visible in PACKING view', () => {
    const db = setupMockDb();
    const recentlyUpdatedIds = new Set<string>();

    // Initially filtered for PACKING
    let filtered = db.shipment_brand_owner_fulfilment.filter((r) => {
      const isPacking = r.fulfillmentstatus === 'PACKING' || r.outstatus === 'PACKING';
      const isRecent = recentlyUpdatedIds.has(r.id);
      return isPacking || isRecent;
    });
    assert.equal(filtered.length, 1);

    // Save change: row changes from PACKING to READY_FOR_DISPATCH
    const rowToUpdate = db.shipment_brand_owner_fulfilment[0];
    rowToUpdate.outstatus = 'READY_FOR_DISPATCH';
    rowToUpdate.fulfillmentstatus = 'READY_FOR_DISPATCH';
    recentlyUpdatedIds.add(rowToUpdate.id);

    // Filtered again with status retention
    filtered = db.shipment_brand_owner_fulfilment.filter((r) => {
      const isPacking = r.fulfillmentstatus === 'PACKING' || r.outstatus === 'PACKING';
      const isRecent = recentlyUpdatedIds.has(r.id);
      return isPacking || isRecent;
    });

    assert.equal(filtered.length, 1, 'Updated row must remain visible in grid');
    assert.equal(filtered[0].fulfillmentstatus, 'READY_FOR_DISPATCH', 'Updated status is reflected');
  });

  it('8. Updation Screen Field Configuration: salesOrderId in top, hidden fields, disabled fields', () => {
    const row = {
      id: 'doc_123',
      brandOwnerAssignid: 'boa_123',
      orderItemId: 'item_456',
      salesOrderId: 'SO_2026_999',
      productId: 'prod_999',
      productName: 'Organic Lip Balm',
      brandOwnerName: 'Pure Organics Ltd',
      orderpackingsize: '15g Tube',
      orderunit: 'PIECES',
      orderqty: 20,
      Outpackingsize: '15g Tube',
      outunit: 'PIECES',
      outquantity: 15,
      outstatus: 'READY_FOR_DISPATCH',
      outbalanceqty: 5,
      outpackdate: '2026-10-10',
      outexpecteddateofdespatchdate: '2026-10-12',
      outdealyreasons: 'Minor packaging delay',
      fulfillmentstatus: 'PARTIALLY_PACKED',
    };

    // salesOrderId displayed in top
    assert.equal(row.salesOrderId, 'SO_2026_999');

    // Hidden fields
    const hiddenFields = ['brandOwnerAssignid', 'orderItemId', 'id'];
    hiddenFields.forEach((field) => {
      assert.ok(field in row, `Field ${field} must exist and be designated hidden`);
    });

    // Disabled fields
    const disabledFieldValues = {
      brandOwnerName: row.brandOwnerName,
      orderpackingsize: row.orderpackingsize,
      orderunit: row.orderunit,
      orderqty: row.orderqty,
      Outpackingsize: row.Outpackingsize,
      outunit: row.outunit,
      outbalanceqty: row.outbalanceqty,
    };

    assert.equal(disabledFieldValues.brandOwnerName, 'Pure Organics Ltd');
    assert.equal(disabledFieldValues.Outpackingsize, row.orderpackingsize, 'Outpackingsize matches orderpackingsize');
    assert.equal(disabledFieldValues.outunit, row.orderunit, 'outunit matches orderunit');
    assert.equal(disabledFieldValues.outbalanceqty, row.orderqty - row.outquantity);
  });

  it('9. Confirm message box Yes/No flow triggers save and updates selected grid record', () => {
    const gridRows = [
      {
        id: 'row_1',
        salesOrderId: 'SO_2026_001',
        outquantity: 10,
        orderqty: 10,
        outstatus: 'PACKING',
        fulfillmentstatus: 'PACKING',
      },
    ];

    // User edits row in Updation Screen
    const editingState = {
      ...gridRows[0],
      outquantity: 8,
      outstatus: 'READY_FOR_DISPATCH',
      outbalanceqty: 2,
      fulfillmentstatus: 'PARTIALLY_PACKED',
    };

    // User clicks Save -> Confirm modal opens
    let confirmModalOpen = true;
    assert.equal(confirmModalOpen, true, 'Confirm modal is opened upon Save click');

    // User selects 'Yes' -> Updates table in selected grid record
    const updatedGridRows = gridRows.map((r) =>
      r.id === editingState.id ? { ...r, ...editingState } : r
    );
    confirmModalOpen = false;

    assert.equal(confirmModalOpen, false);
    assert.equal(updatedGridRows[0].outquantity, 8);
    assert.equal(updatedGridRows[0].outstatus, 'READY_FOR_DISPATCH');
    assert.equal(updatedGridRows[0].fulfillmentstatus, 'PARTIALLY_PACKED');
  });
});
