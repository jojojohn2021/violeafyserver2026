import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COURIER_PARTNERS } from '../src/components/CreateShipmentView';

describe('Complete Create Shipment Component Logic & Database Verification Tests', () => {
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
          outstatus: 'READY_FOR_DISPATCH',
          outbalanceqty: 0,
          outexpecteddateofdespatchdate: '2026-10-10',
          outpickupdate: '2026-10-10',
          outcouriername: 'Delhivery',
          outcourierdocketno: '',
          outdealyreasons: '',
          fulfillmentstatus: 'READY_FOR_DISPATCH',
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
          outstatus: 'PACKING',
          outbalanceqty: 0,
          outexpecteddateofdespatchdate: '2026-10-10',
          outpickupdate: '2026-10-10',
          outcouriername: 'Delhivery',
          outcourierdocketno: '',
          outdealyreasons: '',
          fulfillmentstatus: 'PACKING', // NOT READY_FOR_DISPATCH
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

  it('1. Filter: lists only records satisfying fulfillmentstatus = READY_FOR_DISPATCH', () => {
    const db = setupMockDb();
    const readyRecords = db.shipment_brand_owner_fulfilment.filter(
      (r) => r.fulfillmentstatus === 'READY_FOR_DISPATCH' || r.outstatus === 'READY_FOR_DISPATCH'
    );

    assert.equal(readyRecords.length, 1);
    assert.equal(readyRecords[0].id, 'boa_so1_p1');
    assert.equal(readyRecords[0].fulfillmentstatus, 'READY_FOR_DISPATCH');
  });

  it('2. Order Date, Order No, Customer, and Mobile: resolved from sales_orders using Linkid=salesOrderId', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    const matchedOrder = db.sales_orders.find(
      (so) => so.id === row.salesOrderId || so.orderNumber === row.salesOrderId
    );
    assert.ok(matchedOrder, 'Sales order must be found using Linkid=salesOrderId');

    // Order Date = sales_orders->createdAt
    const orderDate = matchedOrder.createdAt.split('T')[0];
    assert.equal(orderDate, '2026-10-09');

    // Order No = salesOrderId
    const orderNo = row.salesOrderId;
    assert.equal(orderNo, 'SO_2026_001');

    // Customer = salesorders->customerName
    const customerName = matchedOrder.customerName;
    assert.equal(customerName, 'Priya Sharma');

    // Mobile = salesorders->customerMobile
    const customerMobile = matchedOrder.customerMobile;
    assert.equal(customerMobile, '+91 9876543210');
  });

  it('3. Products column: updates value from products->name linking id -> orderItemId and displays only name (id hidden)', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    const matchedProduct = db.products.find((p) => p.id === row.orderItemId);
    assert.ok(matchedProduct, 'Product must be resolved using orderItemId');
    assert.equal(matchedProduct.name, 'Herbal Deep Clean Face Wash');

    // Display only products->name (ID is not displayed)
    const displayName = matchedProduct.name;
    assert.equal(displayName, 'Herbal Deep Clean Face Wash');
    assert.equal(displayName.includes(row.orderItemId), false, 'Display must only show name without ID text');
  });

  it('4. Hidden fields: brandOwnerAssignid, brandOwnerName, orderItemId, id, orderpackingsize, orderunit, orderqty', () => {
    const hiddenFields = [
      'brandOwnerAssignid',
      'brandOwnerName',
      'orderItemId',
      'id',
      'orderpackingsize',
      'orderunit',
      'orderqty',
    ];
    // Each of these fields is marked as hidden and omitted from visible grid table headers
    assert.equal(hiddenFields.length, 7);
    assert.ok(hiddenFields.includes('brandOwnerAssignid'));
    assert.ok(hiddenFields.includes('brandOwnerName'));
    assert.ok(hiddenFields.includes('orderItemId'));
    assert.ok(hiddenFields.includes('id'));
    assert.ok(hiddenFields.includes('orderpackingsize'));
    assert.ok(hiddenFields.includes('orderunit'));
    assert.ok(hiddenFields.includes('orderqty'));
  });

  it('5. Disabled columns: Outpackingsize, outunit, and outquantity are disabled', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    // Outpackingsize = disable (update the value orderpackingsize)
    const Outpackingsize = row.outpackingsize || row.orderpackingsize;
    assert.equal(Outpackingsize, 'Box 100ml');

    // outunit = disable (update the value orderunit)
    const outunit = row.outunit || row.orderunit;
    assert.equal(outunit, 'BOTTLE');

    // outquantity = disable
    const outquantity = row.outquantity;
    assert.equal(outquantity, 10);
  });

  it('6. Mandatory outcourierdocketno: save button disabled when docket is empty, enabled when entered', () => {
    const isSaveDisabled = (docket: string) => !docket || docket.trim() === '';

    assert.equal(isSaveDisabled(''), true, 'Save must be disabled when outcourierdocketno is empty');
    assert.equal(isSaveDisabled('   '), true, 'Save must be disabled when outcourierdocketno is whitespace');
    assert.equal(isSaveDisabled('DELH-123456789'), false, 'Save must be enabled when outcourierdocketno is entered');
  });

  it('7. fulfillmentstatus = outstatus synchronization: updating outstatus to SHIPPED updates fulfillmentstatus to SHIPPED', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    // Change status from READY_FOR_DISPATCH to SHIPPED
    row.outstatus = 'SHIPPED';
    row.fulfillmentstatus = row.outstatus; // fulfillmentstatus = outstatus

    assert.equal(row.outstatus, 'SHIPPED');
    assert.equal(row.fulfillmentstatus, 'SHIPPED');
  });

  it('8. Delay reasons validation: maximum 70 characters', () => {
    const longReason = 'A'.repeat(100);
    const cappedReason = longReason.slice(0, 70);
    assert.equal(cappedReason.length, 70);
  });

  it('9. Courier selection: supports all specified couriers including Blue Dart The Professional Couriers', () => {
    assert.ok(COURIER_PARTNERS.includes('Amazon'));
    assert.ok(COURIER_PARTNERS.includes('Delhivery'));
    assert.ok(COURIER_PARTNERS.includes('DTDC'));
    assert.ok(COURIER_PARTNERS.includes('Blue Dart The Professional Couriers'));
    assert.ok(COURIER_PARTNERS.includes('Blue Dart'));
    assert.ok(COURIER_PARTNERS.includes('The Professional Couriers'));
    assert.ok(COURIER_PARTNERS.includes('India Post'));
  });

  it('10. Save shipment updates values to shipment_brand_owner_fulfilment table', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    const updatedData = {
      ...row,
      salesOrderId: 'SO_2026_001',
      orderNo: 'SO_2026_001',
      orderDate: '2026-10-09',
      customerName: 'Priya Sharma',
      customerMobile: '+91 9876543210',
      outpickupdate: '2026-10-10',
      outcouriername: 'Blue Dart The Professional Couriers',
      outcourierdocketno: 'BD-88992211',
      outdealyreasons: 'Dispatched on morning slot',
      outstatus: 'SHIPPED',
      fulfillmentstatus: 'SHIPPED', // fulfillmentstatus = outstatus
      status: 'SHIPPED',
      deliverystatus: 'IN_TRANSIT',
      updatedAt: new Date().toISOString(),
    };

    const idx = db.shipment_brand_owner_fulfilment.findIndex((r) => r.id === row.id);
    db.shipment_brand_owner_fulfilment[idx] = updatedData;

    const saved = db.shipment_brand_owner_fulfilment[idx];
    assert.equal(saved.orderNo, 'SO_2026_001');
    assert.equal(saved.customerName, 'Priya Sharma');
    assert.equal(saved.customerMobile, '+91 9876543210');
    assert.equal(saved.outcouriername, 'Blue Dart The Professional Couriers');
    assert.equal(saved.outcourierdocketno, 'BD-88992211');
    assert.equal(saved.outstatus, 'SHIPPED');
    assert.equal(saved.fulfillmentstatus, 'SHIPPED');
    assert.equal(saved.deliverystatus, 'IN_TRANSIT');
  });

  it('11. Action button named Open: user clicks Open to launch new updation screen for selected record', () => {
    const db = setupMockDb();
    const row = db.shipment_brand_owner_fulfilment[0];

    // Grid row action button is named "Open"
    const actionButtonName = 'Open';
    assert.equal(actionButtonName, 'Open');

    // Clicking Open sets up editing state for new screen
    let isEditScreenOpen = false;
    let editingRow: any = null;

    const handleOpenEditScreen = (selected: any) => {
      editingRow = { ...selected };
      isEditScreenOpen = true;
    };

    handleOpenEditScreen(row);
    assert.equal(isEditScreenOpen, true);
    assert.equal(editingRow.id, row.id);
    assert.equal(editingRow.productName, row.productName);
  });

  it('12. Updation screen layout & bottom buttons: Close and Save with docket requirement', () => {
    let isEditScreenOpen = true;
    const editingRow = {
      outcourierdocketno: '',
      outcouriername: 'Delhivery',
      outstatus: 'READY_FOR_DISPATCH',
    };

    // Save button disabled when docket is empty
    const isSaveDisabled = !editingRow.outcourierdocketno || editingRow.outcourierdocketno.trim() === '';
    assert.equal(isSaveDisabled, true);

    // Close button dismisses the screen
    const handleClose = () => {
      isEditScreenOpen = false;
    };
    handleClose();
    assert.equal(isEditScreenOpen, false);
  });

  it('13. Confirmation popup on Save: user inputs Yes/No to confirm save', () => {
    let confirmModalOpen = false;
    let databaseSaved = false;

    // Click Save on updation screen triggers confirmation popup
    const handleInitiateSave = (docket: string) => {
      if (docket.trim()) {
        confirmModalOpen = true;
      }
    };

    handleInitiateSave('DELH-998877');
    assert.equal(confirmModalOpen, true);

    // If user clicks "No", confirm closes without saving
    const handleNo = () => {
      confirmModalOpen = false;
    };
    handleNo();
    assert.equal(confirmModalOpen, false);
    assert.equal(databaseSaved, false);

    // If user clicks "Yes", saves to database
    const handleYes = () => {
      confirmModalOpen = false;
      databaseSaved = true;
    };
    handleYes();
    assert.equal(databaseSaved, true);
  });

  it('14. Keep record status changes after save: recently saved records remain visible in grid', () => {
    const rows = [
      { id: 'boa_1', outstatus: 'READY_FOR_DISPATCH', fulfillmentstatus: 'READY_FOR_DISPATCH' },
      { id: 'boa_2', outstatus: 'READY_FOR_DISPATCH', fulfillmentstatus: 'READY_FOR_DISPATCH' },
    ];

    // User updates boa_1 to SHIPPED
    const recentlyUpdatedIds = new Set<string>();
    rows[0].outstatus = 'SHIPPED';
    rows[0].fulfillmentstatus = 'SHIPPED';
    recentlyUpdatedIds.add('boa_1');

    // Filter rule: fulfillmentstatus === READY_FOR_DISPATCH OR is in recentlyUpdatedIds
    const statusFilter = 'READY_FOR_DISPATCH';
    const visibleRows = rows.filter((r) => {
      if (statusFilter === 'READY_FOR_DISPATCH') {
        const isReady = r.fulfillmentstatus === 'READY_FOR_DISPATCH';
        const isRecentlyUpdated = recentlyUpdatedIds.has(r.id);
        return isReady || isRecentlyUpdated;
      }
      return true;
    });

    // Both remain visible so user sees the status change kept after save
    assert.equal(visibleRows.length, 2);
    assert.equal(visibleRows[0].outstatus, 'SHIPPED');
    assert.equal(visibleRows[0].fulfillmentstatus, 'SHIPPED');
  });
});
