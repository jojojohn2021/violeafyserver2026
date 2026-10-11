import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  escapeHtml,
  isValidEmail,
  parseAdditionalRecipients,
  getStageMessageAndSubject,
  renderHtmlEmailTemplate,
  renderPlainTextEmailTemplate,
  fetchSmtpConfigFromFirestore,
  sendOrderStageEmailNotification,
  EmailTemplateData,
} from '../src/services/emailService.js';

describe('Dynamic Order-Stage Email Notifications Test Suite', () => {
  const sampleOrderData: EmailTemplateData = {
    customerName: 'Aarav Sharma',
    orderNumber: 'ORD-98765',
    orderDate: '2026-10-11',
    orderStatus: 'PACKING',
    statusUpdatedDate: '2026-10-11',
    invoiceNumber: 'INV-2026-001',
    trackingNumber: 'TRK-99887766',
    courierName: 'BlueDart Express',
    deliveryAddress: 'Flat 402, Green Palms, MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    customerPhone: '+919876543210',
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
  };

  it('1. HTML escaping should escape special characters to prevent HTML injection', () => {
    const raw = '<script>alert("xss")</script> & "quote" \'single\'';
    const escaped = escapeHtml(raw);
    assert.strictEqual(escaped.includes('<script>'), false);
    assert.strictEqual(escaped.includes('&lt;script&gt;'), true);
    assert.strictEqual(escaped.includes('&amp;'), true);
  });

  it('2. Email validation should correctly identify valid and invalid email addresses', () => {
    assert.strictEqual(isValidEmail('customer@example.com'), true);
    assert.strictEqual(isValidEmail('admin.user+tag@domain.co.in'), true);
    assert.strictEqual(isValidEmail('invalid-email'), false);
    assert.strictEqual(isValidEmail('missing@domain'), false);
    assert.strictEqual(isValidEmail(''), false);
    assert.strictEqual(isValidEmail(null), false);
  });

  it('3. Recipient parsing should extract and deduplicate addresses from successEmails1', () => {
    const stringConfig = 'admin@violeafy.com, ops@violeafy.com ; support@violeafy.com';
    const parsed = parseAdditionalRecipients(stringConfig);
    assert.deepStrictEqual(parsed, ['admin@violeafy.com', 'ops@violeafy.com', 'support@violeafy.com']);

    const arrayConfig = ['admin@violeafy.com', 'ops@violeafy.com', 'invalid-email'];
    const parsedArray = parseAdditionalRecipients(arrayConfig);
    assert.deepStrictEqual(parsedArray, ['admin@violeafy.com', 'ops@violeafy.com']);
  });

  it('4. Stage mapping should yield correct subjects and body messages for all 5 stages', () => {
    const orderNo = 'ORD-123';

    // Stage 1: Order Item / Order Placed
    const s1 = getStageMessageAndSubject('Order Placed', orderNo);
    assert.strictEqual(s1.subject, 'Order Confirmed — Order ORD-123');
    assert.strictEqual(s1.stageMessage.includes('confirmed successfully'), true);

    // Stage 2: Packing
    const s2 = getStageMessageAndSubject('Packing', orderNo);
    assert.strictEqual(s2.subject, 'Your Order Is Being Packed — ORD-123');
    assert.strictEqual(s2.stageMessage.includes('prepared and packed'), true);

    // Stage 3: Shipped
    const s3 = getStageMessageAndSubject('Shipped', orderNo);
    assert.strictEqual(s3.subject, 'Your Order Has Been Shipped — ORD-123');
    assert.strictEqual(s3.stageMessage.includes('order has been shipped'), true);

    // Stage 4: In Transit
    const s4 = getStageMessageAndSubject('In Transit', orderNo);
    assert.strictEqual(s4.subject, 'Your Order Is on the Way — ORD-123');
    assert.strictEqual(s4.stageMessage.includes('in transit toward'), true);

    // Stage 5: Delivered
    const s5 = getStageMessageAndSubject('Delivered', orderNo);
    assert.strictEqual(s5.subject, 'Your Order Has Been Delivered — ORD-123');
    assert.strictEqual(s5.stageMessage.includes('marked as delivered'), true);
  });

  it('5. HTML Email Template rendering should contain all dynamic customer, order, and product details', () => {
    const html = renderHtmlEmailTemplate('Packing', sampleOrderData);

    assert.strictEqual(html.includes('Aarav Sharma'), true);
    assert.strictEqual(html.includes('ORD-98765'), true);
    assert.strictEqual(html.includes('BlueDart Express'), true);
    assert.strictEqual(html.includes('TRK-99887766'), true);
    assert.strictEqual(html.includes('INV-2026-001'), true);
    assert.strictEqual(html.includes('Organic Aloe Vera Gel 250ml'), true);
    assert.strictEqual(html.includes('SKU-ALOE-250'), true);
    assert.strictEqual(html.includes('₹598.00'), true);
    assert.strictEqual(html.includes('₹450.00'), true);
    assert.strictEqual(html.includes('Flat 402, Green Palms, MG Road'), true);
    assert.strictEqual(html.includes('560001'), true);
  });

  it('6. Plain-text Email Template rendering should produce valid text output', () => {
    const text = renderPlainTextEmailTemplate('Shipped', sampleOrderData);

    assert.strictEqual(text.includes('Dear Aarav Sharma,'), true);
    assert.strictEqual(text.includes('Order Number: ORD-98765'), true);
    assert.strictEqual(text.includes('Shipment / Tracking Number: TRK-99887766'), true);
    assert.strictEqual(text.includes('SKU-ALOE-250'), true);
  });

  it('7. Firestore SMTP configuration reader should return config document', async () => {
    const mockDb = {
      getCollectionDocs: async (col: string) => {
        if (col === 'config') {
          return [
            {
              id: 'config',
              smtpHost: 'smtp.test.com',
              smtpPort: 587,
              smtpUser: 'test@test.com',
              SmtpPass: 'secret',
              SmtpFrom: 'VioLeafy <test@test.com>',
              successEmails1: 'admin@test.com',
            },
          ];
        }
        return [];
      },
    };

    const config = await fetchSmtpConfigFromFirestore(mockDb);
    assert.notStrictEqual(config, null);
    assert.strictEqual(config?.smtpHost, 'smtp.test.com');
    assert.strictEqual(config?.smtpPort, 587);
    assert.strictEqual(config?.SmtpPass, 'secret');
    assert.strictEqual(config?.successEmails1, 'admin@test.com');
  });

  it('8. sendOrderStageEmailNotification should handle missing SMTP config gracefully without crashing', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_1',
          orderNumber: 'ORD-001',
          customerId: 'cust_1',
          customerEmail: 'customer@example.com',
          products: [{ productName: 'Test Prod', sku: 'SKU-1', quantity: 1, price: 100 }],
        },
      ],
      customers: [{ id: 'cust_1', name: 'John Doe', email: 'customer@example.com' }],
      audit_logs: [],
    };

    const mockDb = {
      getCollectionDocs: async (col: string) => collections[col] || [],
      saveCollectionDoc: async (col: string, doc: any) => {
        if (!collections[col]) collections[col] = [];
        collections[col].push(doc);
      },
    };

    const result = await sendOrderStageEmailNotification(mockDb, 'Order Placed', 'ord_1');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error?.includes('SMTP configuration is missing'), true);

    const logEntry = collections.audit_logs.find((l) => l.action === 'NOTIFICATION_EMAIL_ORDER_PLACED');
    assert.notStrictEqual(logEntry, undefined);
    assert.strictEqual(logEntry?.status, 'failed');
  });

  it('9. sendOrderStageEmailNotification should enforce idempotency and skip sending duplicate emails', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_2',
          orderNumber: 'ORD-002',
          customerId: 'cust_1',
          customerEmail: 'customer@example.com',
          products: [],
        },
      ],
      customers: [{ id: 'cust_1', name: 'Jane Doe', email: 'customer@example.com' }],
      audit_logs: [
        {
          id: 'log_prev',
          action: 'NOTIFICATION_EMAIL_PACKING',
          orderId: 'ord_2',
          status: 'success',
          details: 'Previously sent',
        },
      ],
    };

    const mockDb = {
      getCollectionDocs: async (col: string) => collections[col] || [],
      saveCollectionDoc: async (col: string, doc: any) => {
        if (!collections[col]) collections[col] = [];
        collections[col].push(doc);
      },
    };

    const result = await sendOrderStageEmailNotification(mockDb, 'Packing', 'ord_2');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.skipped, true);
  });

  it('10. Should trigger Shipped email notification when status is updated to SHIPPED in CompletePackingView', async () => {
    const collections: Record<string, any[]> = {
      sales_orders: [
        {
          id: 'ord_3',
          orderNumber: 'ORD-003',
          customerId: 'cust_1',
          customerEmail: 'customer@example.com',
          products: [{ productName: 'Natural Honey 500g', sku: 'HONEY-500', quantity: 1, price: 350 }],
        },
      ],
      customers: [{ id: 'cust_1', name: 'Rohan Verma', email: 'customer@example.com' }],
      config: [
        {
          id: 'config',
          smtpHost: 'smtp.mockserver.com',
          smtpPort: 587,
          smtpUser: 'notifications@violeafy.com',
          SmtpPass: 'mockpass',
          SmtpFrom: 'VioLeafy Orders <notifications@violeafy.com>',
          successEmails1: 'admin@violeafy.com',
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

    const mockTransporter = {
      sendMail: async () => ({ messageId: 'mock-123' }),
    };

    // Trigger Shipped email with tracking metadata from CompletePackingView save
    const result = await sendOrderStageEmailNotification(
      mockDb,
      'Shipped',
      'ord_3',
      {
        courierName: 'BlueDart Express',
        trackingNumber: 'TRK-123456',
      },
      mockTransporter
    );

    assert.strictEqual(result.success, true);
    const logEntry = collections.audit_logs.find((l) => l.action === 'NOTIFICATION_EMAIL_SHIPPED');
    assert.notStrictEqual(logEntry, undefined);
    assert.strictEqual(logEntry?.orderId, 'ord_3');
    assert.strictEqual(logEntry?.status, 'success');
  });
});
