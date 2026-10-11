import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeWhatsAppNumber,
  parseAdditionalPhoneRecipients,
  resolveWhatsAppRecipients,
  isValidHttpUrl,
  resolveWhatsAppApiEndpoint,
  mapWhatsAppStage,
  fetchWhatsAppConfigFromFirestore,
  buildWhatsAppTemplateComponents,
  buildWhatsAppCloudApiPayload,
  sendWhatsAppMessageViaMetaCloudApi,
  sendOrderStageWhatsAppNotification,
  WhatsAppTemplateData,
} from '../src/services/whatsappService.js';
import { OperationsService } from '../src/services/operationsService.js';

describe('VioLeafyServer — WhatsApp Integration Test Suite', () => {
  const sampleTemplateData: WhatsAppTemplateData = {
    customerName: 'Aarav Sharma',
    customerMobile: '919876543210',
    orderNumber: 'ORD-98765',
    orderId: 'ord_1',
    orderDate: '2026-10-11',
    orderStatus: 'PACKING',
    stageHeading: 'Your Order Is Being Packed — ORD-98765',
    normalizedStage: 'Packing',
    deliveryAddress: 'Flat 402, Green Palms, MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    productsSummary: 'Organic Aloe Vera Gel 250ml (Qty: 2), Herbal Shampoo 500ml (Qty: 1)',
    products: [
      {
        productName: 'Organic Aloe Vera Gel 250ml',
        sku: 'SKU-ALOE-250',
        quantity: 2,
        unitPrice: 299,
        itemTotal: 598,
      },
      {
        productName: 'Herbal Shampoo 500ml',
        sku: 'SKU-SHAMP-500',
        quantity: 1,
        unitPrice: 450,
        itemTotal: 450,
      },
    ],
    courierName: 'BlueDart Express',
    trackingNumber: 'TRK-99887766',
  };

  it('1. Phone Number Normalization: validates international digits-only numbers and rejects ungrounded country codes', () => {
    // Valid cases with country code
    const indiaWithPlus = normalizeWhatsAppNumber('+91 98765 43210');
    assert.strictEqual(indiaWithPlus.valid, true);
    assert.strictEqual(indiaWithPlus.normalized, '919876543210');

    const indiaDigitsOnly = normalizeWhatsAppNumber('919876543210');
    assert.strictEqual(indiaDigitsOnly.valid, true);
    assert.strictEqual(indiaDigitsOnly.normalized, '919876543210');

    const usNumber = normalizeWhatsAppNumber('+1 (555) 234-5678');
    assert.strictEqual(usNumber.valid, true);
    assert.strictEqual(usNumber.normalized, '15552345678');

    // Invalid: 10 digits without international country code (must NOT guess country code)
    const tenDigits = normalizeWhatsAppNumber('9876543210');
    assert.strictEqual(tenDigits.valid, false);
    assert.strictEqual(tenDigits.reason?.includes('Missing international country code'), true);

    // Invalid: Leading 0 national trunk prefix without country code
    const trunkPrefix = normalizeWhatsAppNumber('09876543210');
    assert.strictEqual(trunkPrefix.valid, false);
    assert.strictEqual(trunkPrefix.reason?.includes('Leading national trunk prefix'), true);

    // Invalid: Non-numeric and empty inputs
    assert.strictEqual(normalizeWhatsAppNumber('').valid, false);
    assert.strictEqual(normalizeWhatsAppNumber(null).valid, false);
    assert.strictEqual(normalizeWhatsAppNumber('not-a-number').valid, false);
  });

  it('2. Recipient Parsing & Deduplication: normalizes and deduplicates customerMobile and successPhones1', () => {
    // Case A: successPhones1 as string with comma
    const rawString = '+91 98765 43210, +91 98765 43211';
    const parsedStr = parseAdditionalPhoneRecipients(rawString);
    assert.deepStrictEqual(parsedStr, ['+91 98765 43210', '+91 98765 43211']);

    // Case B: successPhones1 as array
    const rawArr = ['+91 98765 43210', 919876543212];
    const parsedArr = parseAdditionalPhoneRecipients(rawArr);
    assert.deepStrictEqual(parsedArr, ['+91 98765 43210', '919876543212']);

    // Deduplication test: customerMobile is +91 98765 43210 and successPhones1 has the same number + another
    const { validRecipients, skippedRecipients } = resolveWhatsAppRecipients(
      '+91 98765 43210',
      ['+91 98765 43210', '+91 98765 43211', 'invalid-phone', '9876543210']
    );

    // Only unique, valid numbers must be present
    assert.deepStrictEqual(validRecipients, ['919876543210', '919876543211']);
    // Skipped items must be tracked with reasons
    assert.strictEqual(skippedRecipients.length, 2);
  });

  it('3. Stage Mapping: correctly maps the 5 operational notification stages and identifies unsupported stages', () => {
    const orderNo = 'ORD-101';

    // 1. Order Item / Order Placed
    const s1 = mapWhatsAppStage('Order Placed', orderNo);
    assert.strictEqual(s1.normalizedStage, 'Order Placed');
    assert.strictEqual(s1.heading, 'Order Confirmed — Order ORD-101');
    assert.strictEqual(s1.defaultTemplateName, 'order_confirmed');
    assert.strictEqual(s1.isSupportedStage, true);

    // 2. Packing
    const s2 = mapWhatsAppStage('Complete Packing', orderNo);
    assert.strictEqual(s2.normalizedStage, 'Packing');
    assert.strictEqual(s2.heading, 'Your Order Is Being Packed — ORD-101');
    assert.strictEqual(s2.defaultTemplateName, 'order_packing');
    assert.strictEqual(s2.isSupportedStage, true);

    // 3. Shipped
    const s3 = mapWhatsAppStage('Shipped', orderNo);
    assert.strictEqual(s3.normalizedStage, 'Shipped');
    assert.strictEqual(s3.heading, 'Your Order Has Been Shipped — ORD-101');
    assert.strictEqual(s3.defaultTemplateName, 'order_shipped');
    assert.strictEqual(s3.isSupportedStage, true);

    // 4. In Transit
    const s4 = mapWhatsAppStage('In Transit', orderNo);
    assert.strictEqual(s4.normalizedStage, 'In Transit');
    assert.strictEqual(s4.heading, 'Your Order Is on the Way — ORD-101');
    assert.strictEqual(s4.defaultTemplateName, 'order_in_transit');
    assert.strictEqual(s4.isSupportedStage, true);

    // 5. Delivered
    const s5 = mapWhatsAppStage('Confirm Delivery', orderNo);
    assert.strictEqual(s5.normalizedStage, 'Delivered');
    assert.strictEqual(s5.heading, 'Your Order Has Been Delivered — ORD-101');
    assert.strictEqual(s5.defaultTemplateName, 'order_delivered');
    assert.strictEqual(s5.isSupportedStage, true);

    // Unsupported stage (e.g. Brand Owner Assignment or Return)
    const unsupported = mapWhatsAppStage('Brand Owner Assignment', orderNo);
    assert.strictEqual(unsupported.isSupportedStage, false);
  });

  it('4. Template Component & Payload Builder: constructs compliant Meta WhatsApp Cloud API body parameters', () => {
    const components = buildWhatsAppTemplateComponents(sampleTemplateData);
    assert.strictEqual(components.length, 1);
    assert.strictEqual(components[0].type, 'body');

    const params = components[0].parameters;
    assert.strictEqual(params.length, 7);
    assert.strictEqual(params[0].text, 'Aarav Sharma'); // Customer
    assert.strictEqual(params[1].text, 'ORD-98765'); // Order Number
    assert.strictEqual(params[2].text, 'Your Order Is Being Packed — ORD-98765'); // Heading
    assert.strictEqual(params[3].text, '2026-10-11'); // Date
    assert.strictEqual(params[4].text.includes('Organic Aloe Vera Gel 250ml'), true); // Products
    assert.strictEqual(params[5].text.includes('Bengaluru, Karnataka - 560001'), true); // Address
    assert.strictEqual(params[6].text.includes('BlueDart Express'), true); // Tracking / Status

    const payload = buildWhatsAppCloudApiPayload('919876543210', 'order_packing', 'en', components);
    assert.strictEqual(payload.messaging_product, 'whatsapp');
    assert.strictEqual(payload.recipient_type, 'individual');
    assert.strictEqual(payload.to, '919876543210');
    assert.strictEqual(payload.type, 'template');
    assert.strictEqual(payload.template.name, 'order_packing');
    assert.strictEqual(payload.template.language.code, 'en');
  });

  it('5. API Endpoint Resolver: validates and resolves base and custom Cloud API URLs safely', () => {
    // Valid Base URL
    assert.strictEqual(isValidHttpUrl('https://graph.facebook.com/v21.0'), true);
    assert.strictEqual(isValidHttpUrl('http://localhost:3000/api'), true);
    assert.strictEqual(isValidHttpUrl('ftp://invalid-scheme'), false);
    assert.strictEqual(isValidHttpUrl('not-a-url'), false);

    const baseResolved = resolveWhatsAppApiEndpoint('https://graph.facebook.com/v21.0', '1234567890');
    assert.strictEqual(baseResolved, 'https://graph.facebook.com/v21.0/1234567890/messages');

    const tokenReplaced = resolveWhatsAppApiEndpoint('https://graph.facebook.com/v21.0/{phone_number_id}/messages', '1234567890');
    assert.strictEqual(tokenReplaced, 'https://graph.facebook.com/v21.0/1234567890/messages');
  });

  it('6. Configuration Validation: safely reports missing or invalid WhatsApp config from Firestore without crashing', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_cfg_test',
          orderNumber: 'ORD-CFG-1',
          customerMobile: '+91 98765 43210',
          products: [],
        },
      ],
      global: [
        {
          id: 'config',
          // Missing whatsappPhoneId, whatsappToken, whatsappApiUrl
        },
      ],
      audit_logs: [],
    };

    const mockDb = {
      getCollectionDocs: async (col: string) => collections[col] || [],
      saveCollectionDoc: async (col: string, doc: any) => {
        if (!collections[col]) collections[col] = [];
        collections[col].push(doc);
      },
    };

    const result = await sendOrderStageWhatsAppNotification(mockDb, 'Order Placed', 'ord_cfg_test');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error?.includes('WhatsApp Cloud API configuration is missing or invalid'), true);

    const auditEntry = collections.audit_logs.find((l) => l.action === 'NOTIFICATION_WHATSAPP_ORDER_PLACED');
    assert.notStrictEqual(auditEntry, undefined);
    assert.strictEqual(auditEntry?.status, 'failed');
  });

  it('7. Idempotency & Deduplication: skips duplicate sends when audit log already records success for order + stage + recipient', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_dup_1',
          orderNumber: 'ORD-DUP-1',
          customerMobile: '+91 98765 43210',
          products: [],
        },
      ],
      global: [
        {
          id: 'config',
          whatsappPhoneId: 'phone_123',
          whatsappToken: 'token_secret',
          whatsappApiUrl: 'https://graph.facebook.com/v21.0',
        },
      ],
      audit_logs: [
        {
          id: 'log_prev_wa',
          action: 'NOTIFICATION_WHATSAPP_PACKING',
          orderId: 'ord_dup_1',
          recipient: '919876543210',
          status: 'success',
          details: 'Previously delivered',
        },
      ],
    };

    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.123' }] }) };
    };

    const mockDb = {
      getCollectionDocs: async (col: string) => collections[col] || [],
      saveCollectionDoc: async (col: string, doc: any) => {
        if (!collections[col]) collections[col] = [];
        collections[col].push(doc);
      },
    };

    const result = await sendOrderStageWhatsAppNotification(mockDb, 'Packing', 'ord_dup_1', undefined, mockFetch);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(fetchCalled, false, 'Duplicate message should NOT trigger HTTP fetch to Meta Cloud API');
  });

  it('8. Meta Cloud API Provider Success & Error Handling: captures provider message ID and redacts secret tokens', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_prov_1',
          orderNumber: 'ORD-PROV-1',
          customerMobile: '+91 98765 43210',
          products: [{ productName: 'Organic Tea', sku: 'TEA-1', quantity: 1, price: 150 }],
        },
      ],
      global: [
        {
          id: 'config',
          whatsappPhoneId: 'phone_123',
          whatsappToken: 'token_secret_12345',
          whatsappApiUrl: 'https://graph.facebook.com/v21.0',
        },
      ],
      audit_logs: [],
    };

    const mockDb = {
      getCollectionDocs: async (col: string) => collections[col] || [],
      saveCollectionDoc: async (col: string, doc: any) => {
        if (!collections[col]) collections[col] = [];
        collections[col].push(doc);
      },
    };

    // Subtest A: Meta returns HTTP 200 with message ID
    const successFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        messaging_product: 'whatsapp',
        messages: [{ id: 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQjE4OT' }],
      }),
    });

    const successResult = await sendOrderStageWhatsAppNotification(mockDb, 'Shipped', 'ord_prov_1', undefined, successFetch);
    assert.strictEqual(successResult.success, true);
    assert.strictEqual(successResult.messageId, 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQjE4OT');

    const logEntry = collections.audit_logs.find((l) => l.action === 'NOTIFICATION_WHATSAPP_SHIPPED' && l.status === 'success');
    assert.notStrictEqual(logEntry, undefined);
    assert.strictEqual(logEntry?.messageId, 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQjE4OT');

    // Subtest B: Meta returns HTTP 400 rejection (e.g. template error)
    collections.audit_logs = [];
    const errorFetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'Template name does not exist in the translated language',
          type: 'OAuthException',
          code: 100,
          error_subcode: 2494010,
        },
      }),
    });

    const errorResult = await sendOrderStageWhatsAppNotification(mockDb, 'Delivered', 'ord_prov_1', undefined, errorFetch);
    assert.strictEqual(errorResult.success, false);
    assert.strictEqual(errorResult.error?.includes('Template name does not exist'), true);
    // Crucial security check: Token must never leak into error message or audit logs
    assert.strictEqual(errorResult.error?.includes('token_secret_12345'), false);

    const failAudit = collections.audit_logs.find((l) => l.action === 'NOTIFICATION_WHATSAPP_DELIVERED');
    assert.strictEqual(failAudit?.status, 'failed');
    assert.strictEqual(failAudit?.details?.includes('token_secret_12345'), false);
  });

  it('9. Partial Recipient Success: handles delivery where one recipient succeeds and another fails', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_partial_1',
          orderNumber: 'ORD-PARTIAL-1',
          customerMobile: '+91 98765 43210',
          products: [],
        },
      ],
      global: [
        {
          id: 'config',
          whatsappPhoneId: 'phone_123',
          whatsappToken: 'token_secret',
          whatsappApiUrl: 'https://graph.facebook.com/v21.0',
          successPhones1: '+91 98765 43211', // Second recipient
        },
      ],
      audit_logs: [],
    };

    const mockDb = {
      getCollectionDocs: async (col: string) => collections[col] || [],
      saveCollectionDoc: async (col: string, doc: any) => {
        if (!collections[col]) collections[col] = [];
        collections[col].push(doc);
      },
    };

    // First recipient (customer) succeeds, second recipient fails
    const partialFetch = async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.to === '919876543210') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: 'wamid.cust_success' }] }),
        };
      }
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Recipient phone number not in allowed opt-in list' } }),
      };
    };

    const partialResult = await sendOrderStageWhatsAppNotification(mockDb, 'In Transit', 'ord_partial_1', undefined, partialFetch);
    // Overall success is true because at least one recipient succeeded
    assert.strictEqual(partialResult.success, true);
    assert.strictEqual(partialResult.results?.length, 2);

    const custRes = partialResult.results?.find((r) => r.recipient === '919876543210');
    assert.strictEqual(custRes?.success, true);
    assert.strictEqual(custRes?.messageId, 'wamid.cust_success');

    const addRes = partialResult.results?.find((r) => r.recipient === '919876543211');
    assert.strictEqual(addRes?.success, false);
    assert.strictEqual(addRes?.error?.includes('Recipient phone number not in allowed opt-in list'), true);
  });

  it('10. OperationsService Integration: triggerStageNotifications invokes WhatsApp without interrupting business operations', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_op_1',
          orderNumber: 'SO-OP-1',
          customerMobile: '+91 98765 43210',
          customerEmail: 'customer@example.com',
          products: [{ productName: 'Organic Jaggery', sku: 'JAG-1', quantity: 1, price: 120 }],
        },
      ],
      global: [
        {
          id: 'config',
          whatsappPhoneId: 'phone_123',
          whatsappToken: 'token_secret',
          whatsappApiUrl: 'https://graph.facebook.com/v21.0',
        },
      ],
      audit_logs: [],
    };

    const dbAccessor = {
      getCollectionDocs: async (col: string) => collections[col] || [],
      saveCollectionDoc: async (col: string, item: any) => {
        if (!collections[col]) collections[col] = [];
        collections[col].push(item);
      },
    };

    const opsService = new OperationsService(dbAccessor);

    // Call triggerStageNotifications for Packing stage
    await opsService.triggerStageNotifications('Complete Packing', 'ord_op_1');

    // Verify WhatsApp notification engine was executed safely
    const waLog = collections.audit_logs.find((l) => l.action === 'NOTIFICATION_WHATSAPP_PACKING');
    assert.notStrictEqual(waLog, undefined);
  });

  it('11. Customer Phone Resolution: resolves mobile from order.contactNo or customers collection when customerMobile is absent', async () => {
    const mockDb: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_contact_no_1',
          orderNumber: 'SO-CN-001',
          customerId: 'cust_cn_1',
          // Note: customerMobile is intentionally absent
          contactNo: '+91 98765 43210',
          products: [{ productName: 'Cold Pressed Coconut Oil 500ml', sku: 'COCO-500', quantity: 2, price: 350 }],
        },
      ],
      customers: [
        {
          id: 'cust_cn_1',
          name: 'Priya Patel',
          mobileNumber: '+91 98765 43210',
          countrymobilecode: '+91',
        },
      ],
      global: [
        {
          id: 'config',
          whatsappPhoneId: 'phone_123',
          whatsappToken: 'token_secret',
          whatsappApiUrl: 'https://graph.facebook.com/v21.0',
        },
      ],
      audit_logs: [],
    };

    const customFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.cn_success' }] }),
    });

    const res = await sendOrderStageWhatsAppNotification(
      {
        getCollectionDocs: async (col) => mockDb[col] || [],
        saveCollectionDoc: async (col, doc) => {
          if (!mockDb[col]) mockDb[col] = [];
          mockDb[col].push(doc);
        },
      },
      'Shipped',
      'ord_contact_no_1',
      { courierName: 'Delhivery', trackingNumber: 'TRK-CN-1234' },
      customFetch as any
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.results?.[0]?.recipient, '919876543210');
    assert.strictEqual(res.results?.[0]?.success, true);
  });

  it('12. 10-Digit Mobile Auto-Prefixing: successfully formats 10-digit number with country code from customer/order', async () => {
    const mockDb: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_ten_digit_1',
          orderNumber: 'SO-10D-001',
          customerId: 'cust_10d_1',
          contactNo: '9876543210', // 10 digits
        },
      ],
      customers: [
        {
          id: 'cust_10d_1',
          name: 'Sunil Verma',
          countrymobilecode: '+91',
        },
      ],
      global: [
        {
          id: 'config',
          whatsappPhoneId: 'phone_123',
          whatsappToken: 'token_secret',
        },
      ],
      audit_logs: [],
    };

    const customFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.10d_success' }] }),
    });

    const res = await sendOrderStageWhatsAppNotification(
      {
        getCollectionDocs: async (col) => mockDb[col] || [],
        saveCollectionDoc: async (col, doc) => {
          if (!mockDb[col]) mockDb[col] = [];
          mockDb[col].push(doc);
        },
      },
      'Shipped',
      'ord_ten_digit_1',
      { courierName: 'Blue Dart', trackingNumber: 'BD-998877' },
      customFetch as any
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.results?.[0]?.recipient, '919876543210');
    assert.strictEqual(res.results?.[0]?.messageId, 'wamid.10d_success');
  });

  it('13. Default Meta API URL: sends successfully when whatsappApiUrl is omitted by defaulting to official endpoint', async () => {
    const mockDb: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_no_url_1',
          orderNumber: 'SO-NO-URL',
          customerMobile: '+91 98765 43210',
        },
      ],
      global: [
        {
          id: 'config',
          whatsappPhoneId: 'phone_123',
          whatsappToken: 'token_secret',
          // Note: whatsappApiUrl is omitted
        },
      ],
      audit_logs: [],
    };

    let requestedUrl = '';
    const customFetch = async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid.url_default' }] }),
      };
    };

    const res = await sendOrderStageWhatsAppNotification(
      {
        getCollectionDocs: async (col) => mockDb[col] || [],
        saveCollectionDoc: async (col, doc) => {
          if (!mockDb[col]) mockDb[col] = [];
          mockDb[col].push(doc);
        },
      },
      'Shipped',
      'ord_no_url_1',
      {},
      customFetch as any
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(requestedUrl.includes('graph.facebook.com'), true);
  });

  it('14. Shipment Status Updation: updateShipmentStatus updates status, synchronizes sales order, and triggers WhatsApp notification', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_status_upd_1',
          orderNumber: 'SO-UPD-001',
          customerName: 'Meera Rao',
          contactNo: '+91 98765 43210',
          deliveryStatus: 'READY_FOR_DISPATCH',
        },
      ],
      order_fulfilment: [
        {
          id: 'ful_ord_status_upd_1',
          orderId: 'ord_status_upd_1',
          status: 'READY_FOR_DISPATCH',
        },
      ],
      order_shipments: [
        {
          id: 'shp_ord_status_upd_1',
          shipmentId: 'SHP_001',
          orderId: 'ord_status_upd_1',
          status: 'CREATED',
          courierAgency: 'Delhivery',
          trackingNumber: 'TRK-INITIAL-01',
        },
      ],
      global: [
        {
          id: 'config',
          whatsappPhoneId: 'phone_123',
          whatsappToken: 'token_secret',
        },
      ],
      order_operation_history: [],
      audit_logs: [],
    };

    const dbAccessor = {
      getCollectionDocs: async (col: string) => collections[col] || [],
      saveCollectionDoc: async (col: string, item: any) => {
        if (!collections[col]) collections[col] = [];
        const idx = collections[col].findIndex((x: any) => x.id === item.id);
        if (idx >= 0) collections[col][idx] = item;
        else collections[col].push(item);
      },
    };

    const opsService = new OperationsService(dbAccessor);

    const updateRes = await opsService.updateShipmentStatus(
      'ord_status_upd_1',
      'SHIPPED',
      {
        courierAgency: 'Blue Dart',
        trackingNumber: 'BD-NEW-DOCKET-99',
        updatedBy: 'Operations Manager',
      }
    );

    assert.strictEqual(updateRes.notificationSent, true);
    assert.strictEqual(updateRes.shipment.status, 'SHIPPED');
    assert.strictEqual(updateRes.shipment.courierAgency, 'Blue Dart');
    assert.strictEqual(updateRes.shipment.trackingNumber, 'BD-NEW-DOCKET-99');

    // Verify sales order was synchronized
    const updatedOrder = collections.sales_orders[0];
    assert.strictEqual(updatedOrder.deliveryStatus, 'SHIPPED');
    assert.strictEqual(updatedOrder.courierName, 'Blue Dart');
    assert.strictEqual(updatedOrder.trackingNumber, 'BD-NEW-DOCKET-99');

    // Verify timeline history
    const historyEvt = collections.order_operation_history.find((e: any) => e.action === 'SHIPMENT_STATUS_SHIPPED');
    assert.notStrictEqual(historyEvt, undefined);
  });
});
