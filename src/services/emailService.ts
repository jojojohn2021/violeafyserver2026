import nodemailer from 'nodemailer';

export interface EmailTemplateProductItem {
  productName: string;
  sku: string;
  quantity: number | string;
  unitPrice: number | string;
  itemTotal: number | string;
}

export interface EmailTemplateData {
  customerName: string;
  orderNumber: string;
  orderDate: string;
  orderStatus: string;
  statusUpdatedDate: string;
  invoiceNumber?: string;
  trackingNumber?: string;
  courierName?: string;
  deliveryAddress: string;
  city: string;
  state: string;
  pincode: string;
  customerPhone: string;
  products: EmailTemplateProductItem[];
}

export interface SmtpFirestoreConfig {
  smtpHost?: string;
  smtpPort?: number | string;
  smtpUser?: string;
  SmtpPass?: string;
  SmtpFrom?: string;
  successEmails1?: string | string[];
  [key: string]: any;
}

export function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isValidEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

export function parseAdditionalRecipients(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  let candidates: string[] = [];
  if (Array.isArray(raw)) {
    candidates = raw.map((item) => String(item).trim());
  } else if (typeof raw === 'string') {
    candidates = raw
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return Array.from(new Set(candidates.filter(isValidEmail)));
}

export function getStageMessageAndSubject(stage: string, orderNumber: string): { subject: string; stageMessage: string; normalizedStage: string } {
  const normStage = String(stage || '').toLowerCase().trim();

  if (normStage.includes('placed') || normStage.includes('confirm') || normStage.includes('item')) {
    return {
      normalizedStage: 'Order Placed',
      subject: `Order Confirmed — Order ${orderNumber}`,
      stageMessage: `Thank you for shopping with  Leafyearth. Your order has been confirmed successfully.\n\nWe are preparing your order for the next stage of processing. Please review the order and product details below.`,
    };
  }

  if (normStage.includes('pack')) {
    return {
      normalizedStage: 'Packing',
      subject: `Your Order Is Being Packed — ${orderNumber}`,
      stageMessage: `Your order is now being prepared and packed for dispatch.\n\nWe will notify you when the shipment has been handed over for delivery.`,
    };
  }

  if (normStage.includes('ship')) {
    return {
      normalizedStage: 'Shipped',
      subject: `Your Order Has Been Shipped — ${orderNumber}`,
      stageMessage: `Good news! Your order has been shipped.\n\nWhere available, please refer to the courier name and tracking number included in this email to follow your shipment.`,
    };
  }

  if (normStage.includes('transit') || normStage.includes('dispatch')) {
    return {
      normalizedStage: 'In Transit',
      subject: `Your Order Is on the Way — ${orderNumber}`,
      stageMessage: `Your shipment is currently in transit toward the delivery destination.\n\nPlease refer to the tracking details included below, where available, for shipment progress.`,
    };
  }

  if (normStage.includes('deliver')) {
    return {
      normalizedStage: 'Delivered',
      subject: `Your Order Has Been Delivered — ${orderNumber}`,
      stageMessage: `Your order has been marked as delivered.\n\nThank you for choosing VioLeafy / Leafyearth. We appreciate your business.`,
    };
  }

  return {
    normalizedStage: stage,
    subject: `Order Notification — ${orderNumber}`,
    stageMessage: `Your order status has been updated to ${stage}. Please review the details below.`,
  };
}

export function formatCurrency(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || amount === '') return '₹0.00';
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num)) return `₹${amount}`;
  return `₹${num.toFixed(2)}`;
}

export function renderHtmlEmailTemplate(stage: string, data: EmailTemplateData): string {
  const { stageMessage } = getStageMessageAndSubject(stage, data.orderNumber);
  const safeMessageHtml = escapeHtml(stageMessage).replace(/\n/g, '<br/>');

  const productRowsHtml = (data.products || [])
    .map(
      (item) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 12px; font-size: 14px; color: #1e293b;">${escapeHtml(item.productName)}</td>
          <td style="padding: 10px 12px; font-size: 14px; color: #64748b;">${escapeHtml(item.sku)}</td>
          <td style="padding: 10px 12px; font-size: 14px; color: #1e293b; text-align: center;">${escapeHtml(String(item.quantity))}</td>
          <td style="padding: 10px 12px; font-size: 14px; color: #1e293b; text-align: right;">${escapeHtml(formatCurrency(item.unitPrice))}</td>
          <td style="padding: 10px 12px; font-size: 14px; color: #0f766e; font-weight: 600; text-align: right;">${escapeHtml(formatCurrency(item.itemTotal))}</td>
        </tr>`
    )
    .join('');

  const optionalOrderDetails: string[] = [];
  if (data.invoiceNumber) {
    optionalOrderDetails.push(`<li><strong>Invoice Number:</strong> ${escapeHtml(data.invoiceNumber)}</li>`);
  }
  if (data.trackingNumber) {
    optionalOrderDetails.push(`<li><strong>Shipment / Tracking Number:</strong> ${escapeHtml(data.trackingNumber)}</li>`);
  }
  if (data.courierName) {
    optionalOrderDetails.push(`<li><strong>Courier Name:</strong> ${escapeHtml(data.courierName)}</li>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.orderNumber)} Notification</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#334155;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding:20px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:640px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
          
          <!-- BRAND HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #064e3b 0%, #047857 100%); padding:28px 32px; text-align:left;">
              <h1 style="margin:0; font-size:24px; font-weight:700; color:#ffffff; letter-spacing:-0.5px;">VioLeafy / Leafyearth</h1>
              <p style="margin:4px 0 0 0; font-size:13px; color:#a7f3d0; text-transform:uppercase; letter-spacing:1px;">Order Notification System</p>
            </td>
          </tr>

          <!-- BODY CONTENT -->
          <tr>
            <td style="padding:32px;">
              <p style="font-size:16px; font-weight:600; color:#0f172a; margin:0 0 16px 0;">Dear ${escapeHtml(data.customerName)},</p>
              
              <div style="font-size:15px; line-height:1.6; color:#334155; margin-bottom:24px; background-color:#f0fdf4; border-left:4px solid #10b981; padding:14px 18px; border-radius:0 8px 8px 0;">
                ${safeMessageHtml}
              </div>

              <p style="font-size:14px; color:#64748b; margin:0 0 20px 0;">Your order information is provided below for your reference.</p>

              <!-- ORDER DETAILS -->
              <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:18px; margin-bottom:24px;">
                <h3 style="margin:0 0 12px 0; font-size:15px; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">Order Details</h3>
                <ul style="margin:0; padding:0 0 0 18px; font-size:14px; line-height:1.7; color:#334155;">
                  <li><strong>Order Number:</strong> ${escapeHtml(data.orderNumber)}</li>
                  <li><strong>Order Date:</strong> ${escapeHtml(data.orderDate)}</li>
                  <li><strong>Order Status:</strong> <span style="background-color:#dcfce7; color:#166534; padding:2px 8px; border-radius:4px; font-weight:600; font-size:13px;">${escapeHtml(data.orderStatus)}</span></li>
                  <li><strong>Status Updated Date:</strong> ${escapeHtml(data.statusUpdatedDate)}</li>
                  ${optionalOrderDetails.join('')}
                </ul>
              </div>

              <!-- CUSTOMER DETAILS -->
              <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:18px; margin-bottom:24px;">
                <h3 style="margin:0 0 12px 0; font-size:15px; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">Customer Details</h3>
                <ul style="margin:0; padding:0 0 0 18px; font-size:14px; line-height:1.7; color:#334155;">
                  <li><strong>Customer Name:</strong> ${escapeHtml(data.customerName)}</li>
                  <li><strong>Delivery Address:</strong> ${escapeHtml(data.deliveryAddress)}</li>
                  <li><strong>City / District:</strong> ${escapeHtml(data.city)}</li>
                  <li><strong>State:</strong> ${escapeHtml(data.state)}</li>
                  <li><strong>PIN Code:</strong> ${escapeHtml(data.pincode)}</li>
                  <li><strong>Contact Number:</strong> ${escapeHtml(data.customerPhone)}</li>
                </ul>
              </div>

              <!-- PRODUCT DETAILS TABLE -->
              <div style="margin-bottom:28px;">
                <h3 style="margin:0 0 12px 0; font-size:15px; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.5px;">Product Details</h3>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; width:100%; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                  <thead>
                    <tr style="background-color:#f1f5f9; text-align:left;">
                      <th style="padding:10px 12px; font-size:12px; font-weight:700; color:#475569; text-transform:uppercase;">Product Name</th>
                      <th style="padding:10px 12px; font-size:12px; font-weight:700; color:#475569; text-transform:uppercase;">SKU</th>
                      <th style="padding:10px 12px; font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; text-align:center;">Qty</th>
                      <th style="padding:10px 12px; font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; text-align:right;">Unit Price</th>
                      <th style="padding:10px 12px; font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; text-align:right;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${productRowsHtml || '<tr><td colspan="5" style="padding:12px; text-align:center; color:#94a3b8;">No items detailed</td></tr>'}
                  </tbody>
                </table>
              </div>

              <!-- FOOTER -->
              <div style="border-top:1px solid #e2e8f0; padding-top:20px; font-size:13px; color:#64748b; line-height:1.6;">
                <p style="margin:0 0 8px 0; font-weight:600; color:#334155;">Thank you for shopping with VioLeafy / Leafyearth.</p>
                <p style="margin:0 0 8px 0;">For assistance with your order, please contact the support channel configured by the existing application.</p>
                <p style="margin:0; font-size:12px; color:#94a3b8; font-style:italic;">This is an automated notification. Please do not reply if the configured sender address does not accept incoming messages.</p>
              </div>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderPlainTextEmailTemplate(stage: string, data: EmailTemplateData): string {
  const { stageMessage } = getStageMessageAndSubject(stage, data.orderNumber);

  const productLines = (data.products || [])
    .map(
      (item) =>
        `- ${item.productName} (SKU: ${item.sku}) | Qty: ${item.quantity} | Unit Price: ${formatCurrency(item.unitPrice)} | Total: ${formatCurrency(item.itemTotal)}`
    )
    .join('\n');

  const optionalLines: string[] = [];
  if (data.invoiceNumber) optionalLines.push(`Invoice Number: ${data.invoiceNumber}`);
  if (data.trackingNumber) optionalLines.push(`Shipment / Tracking Number: ${data.trackingNumber}`);
  if (data.courierName) optionalLines.push(`Courier Name: ${data.courierName}`);

  return `Dear ${data.customerName},

${stageMessage}

Your order information is provided below for your reference.

ORDER DETAILS
- Order Number: ${data.orderNumber}
- Order Date: ${data.orderDate}
- Order Status: ${data.orderStatus}
- Status Updated Date: ${data.statusUpdatedDate}
${optionalLines.map((l) => `- ${l}`).join('\n')}

CUSTOMER DETAILS
- Customer Name: ${data.customerName}
- Delivery Address: ${data.deliveryAddress}
- City / District: ${data.city}
- State: ${data.state}
- PIN Code: ${data.pincode}
- Contact Number: ${data.customerPhone}

PRODUCT DETAILS
${productLines || '- No product items detailed'}

Thank you for shopping with  Leafyearth.
For assistance with your order, please contact the support channel configured by the existing application.
This is an automated notification. Please do not reply if the configured sender address does not accept incoming messages.`;
}

export async function fetchSmtpConfigFromFirestore(db: { getCollectionDocs: (col: string) => Promise<any[]> }): Promise<SmtpFirestoreConfig | null> {
  try {
    const configDocs = await db.getCollectionDocs('config').catch(() => []);
    let match = configDocs.find((c: any) => String(c.id) === 'config' || String(c.configId) === 'config' || c.smtpHost);
    if (!match && configDocs.length > 0) {
      match = configDocs[0];
    }

    const globalDocs = await db.getCollectionDocs('global').catch(() => []);
    const globalMatch = globalDocs.find((c: any) => String(c.id) === 'config' || String(c.configId) === 'config' || String(c.id) === 'global' || c.smtpHost);

    if (match || globalMatch) {
      return {
        ...(globalMatch || {}),
        ...(match || {}),
      } as SmtpFirestoreConfig;
    }

    return null;
  } catch (err) {
    console.error('[VIO-EMAIL] Operational error reading SMTP config from Firestore:', err);
    return null;
  }
}

export async function sendOrderStageEmailNotification(
  db: {
    getCollectionDocs: (col: string) => Promise<any[]>;
    saveCollectionDoc: (col: string, doc: any) => Promise<void>;
  },
  stage: string,
  orderId: string,
  metadata?: Record<string, any>,
  customTransporter?: any
): Promise<{ success: boolean; message?: string; skipped?: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { normalizedStage, subject } = getStageMessageAndSubject(stage, orderId);
  const stageActionKey = `NOTIFICATION_EMAIL_${normalizedStage.replace(/\s+/g, '_').toUpperCase()}`;

  try {
    // 1. Idempotency Check: Prevent duplicate sends if audit_log contains success entry for (orderId, stageActionKey)
    const auditLogs = await db.getCollectionDocs('audit_logs').catch(() => []);
    const existingSuccess = auditLogs.find(
      (log: any) =>
        String(log.action) === stageActionKey &&
        (String(log.orderId) === String(orderId) || String(log.details || '').includes(String(orderId))) &&
        log.status === 'success'
    );
    if (existingSuccess) {
      console.log(`[VIO-EMAIL] Skipping duplicate email for Order #${orderId} stage '${normalizedStage}'. Audit log entry exists.`);
      return { success: true, skipped: true, message: 'Notification already sent successfully for this stage.' };
    }

    // 2. Fetch Order Details & Customer Record
    const salesOrders = await db.getCollectionDocs('sales_orders').catch(() => []);
    const order = salesOrders.find((o: any) => String(o.id) === String(orderId) || String(o.orderNumber) === String(orderId));

    if (!order) {
      const errMsg = `Order #${orderId} not found in database. Cannot send notification.`;
      console.error(`[VIO-EMAIL] ${errMsg}`);
      await db.saveCollectionDoc('audit_logs', {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        user: 'System Notification Engine',
        role: 'Admin',
        action: stageActionKey,
        orderId,
        details: errMsg,
        status: 'failed',
      });
      return { success: false, error: errMsg };
    }

    const customers = await db.getCollectionDocs('customers').catch(() => []);
    const customer = customers.find((c: any) => String(c.id) === String(order.customerId) || String(c.customerId) === String(order.customerId));

    const customerEmail = (customer?.email || order.customerEmail || order.email || '').trim();
    const customerName = (customer?.name || order.customerName || 'Valued Customer').trim();
    const customerPhone = (order.contactNo || order.customerMobile || customer?.mobileNumber || customer?.phone || 'N/A').trim();
    const deliveryAddress = (order.deliveryAddress || order.address || customer?.address || 'N/A').trim();
    const city = (order.city || order.district || customer?.district || customer?.city || 'N/A').trim();
    const state = (order.state || customer?.state || 'N/A').trim();
    const pincode = (order.pincode || customer?.pincode || 'N/A').trim();

    // 3. Fetch optional Tracking & Courier info from order / shipments
    let trackingNumber = order.trackingNumber || metadata?.trackingNumber;
    let courierName = order.courierName || order.courierAgency || metadata?.courierName || metadata?.courierAgency;
    let invoiceNumber = order.invoiceNumber || order.invoiceId || metadata?.invoiceNumber;

    if (!trackingNumber || !courierName) {
      const shipments = await db.getCollectionDocs('order_shipments').catch(() => []);
      const matchShipment = shipments.find((s: any) => String(s.orderId) === String(order.id));
      if (matchShipment) {
        if (!trackingNumber) trackingNumber = matchShipment.trackingNumber;
        if (!courierName) courierName = matchShipment.courierAgency || matchShipment.courierName;
      }
    }

    // 4. Map Product Items without recalculating prices
    const products: EmailTemplateProductItem[] = (Array.isArray(order.products) ? order.products : []).map((p: any, idx: number) => {
      const name = p.productName || p.name || p.title || `Item ${idx + 1}`;
      const sku = p.sku || p.SKU || p.productId || `SKU-${idx + 1}`;
      const qty = Number(p.quantity ?? p.qty ?? p.orderqty ?? 1);
      const price = Number(p.price ?? p.unitPrice ?? p.onlinePrice ?? p.shopPrice ?? 0);
      const itemTotal = Number(p.itemTotal ?? p.total ?? (qty * price));
      return {
        productName: name,
        sku,
        quantity: qty,
        unitPrice: price,
        itemTotal,
      };
    });

    const emailData: EmailTemplateData = {
      customerName,
      orderNumber: String(order.orderNumber || order.id),
      orderDate: String(order.createdAt || order.orderDate || now).split('T')[0],
      orderStatus: String(order.deliveryStatus || order.status || normalizedStage),
      statusUpdatedDate: now.split('T')[0],
      invoiceNumber,
      trackingNumber,
      courierName,
      deliveryAddress,
      city,
      state,
      pincode,
      customerPhone,
      products,
    };

    // 5. Fetch SMTP & Notification Configuration
    const smtpConfig = await fetchSmtpConfigFromFirestore(db);
    const authUser = (
      isValidEmail(smtpConfig?.smtpUser)
        ? String(smtpConfig?.smtpUser).trim()
        : isValidEmail(smtpConfig?.SmtpFrom)
        ? String(smtpConfig?.SmtpFrom).trim()
        : String(smtpConfig?.smtpUser || smtpConfig?.SmtpFrom || '').trim()
    );
    const authPass = String(smtpConfig?.SmtpPass || smtpConfig?.smtpPass || '');

    if (!smtpConfig || !smtpConfig.smtpHost || !smtpConfig.smtpPort || !authUser || !authPass) {
      const configErrMsg = `SMTP configuration is missing or incomplete in Firestore 'config' document (smtpHost: ${smtpConfig?.smtpHost || 'missing'}, authUser: ${authUser || 'missing'}). Notification skipped safely.`;
      console.warn(`[VIO-EMAIL] ${configErrMsg}`);
      await db.saveCollectionDoc('audit_logs', {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        user: 'System Notification Engine',
        role: 'Admin',
        action: stageActionKey,
        orderId: String(order.id),
        details: configErrMsg,
        status: 'failed',
      });
      return { success: false, error: configErrMsg };
    }

    const portNum = parseInt(String(smtpConfig.smtpPort), 10);
    const isSecure = portNum === 465;

    let senderIdentity = String(smtpConfig.SmtpFrom || authUser).trim();
    if (smtpConfig.smtpUser && !isValidEmail(smtpConfig.smtpUser) && isValidEmail(smtpConfig.SmtpFrom)) {
      senderIdentity = `"${smtpConfig.smtpUser}" <${smtpConfig.SmtpFrom}>`;
    }

    // 6. Recipient Resolution (Combines successEmails1, successEmails2, successEmails3)
    const additionalRecipients = Array.from(
      new Set([
        ...parseAdditionalRecipients(smtpConfig.successEmails1),
        ...parseAdditionalRecipients(smtpConfig.successEmails2),
        ...parseAdditionalRecipients(smtpConfig.successEmails3),
      ])
    );
    const isCustomerValid = isValidEmail(customerEmail);

    if (!isCustomerValid && additionalRecipients.length === 0) {
      const recipientErrMsg = `No valid recipients found. Customer email '${customerEmail}' is invalid/missing and successEmails contains no valid addresses.`;
      console.warn(`[VIO-EMAIL] ${recipientErrMsg}`);
      await db.saveCollectionDoc('audit_logs', {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        user: 'System Notification Engine',
        role: 'Admin',
        action: stageActionKey,
        orderId: String(order.id),
        details: recipientErrMsg,
        status: 'failed',
      });
      return { success: false, error: recipientErrMsg };
    }

    // 7. Render Templates
    const htmlBody = renderHtmlEmailTemplate(normalizedStage, emailData);
    const textBody = renderPlainTextEmailTemplate(normalizedStage, emailData);

    // 8. Configure SMTP Transporter
    const transporter = customTransporter || nodemailer.createTransport({
      host: String(smtpConfig.smtpHost).trim(),
      port: isNaN(portNum) ? 587 : portNum,
      secure: isSecure,
      auth: {
        user: authUser,
        pass: authPass,
      },
      tls: {
        rejectUnauthorized: false, // Compatibility for custom SMTP gateways
      },
    });

    const sendErrors: string[] = [];
    const successfulRecipients: string[] = [];

    // 9. Send to Customer
    if (isCustomerValid) {
      try {
        await transporter.sendMail({
          from: senderIdentity,
          to: customerEmail,
          subject,
          html: htmlBody,
          text: textBody,
        });
        successfulRecipients.push(customerEmail);
      } catch (custErr: any) {
        const errStr = `Failed sending to customer ${customerEmail}: ${custErr?.message || custErr}`;
        console.error(`[VIO-EMAIL] ${errStr}`);
        sendErrors.push(errStr);
      }
    } else {
      sendErrors.push(`Customer email '${customerEmail}' is missing or invalid.`);
    }

    // 10. Send to Additional Recipients (config.successEmails1)
    for (const addEmail of additionalRecipients) {
      if (addEmail === customerEmail) continue; // Avoid duplicate sending
      try {
        await transporter.sendMail({
          from: senderIdentity,
          to: addEmail,
          subject: `[Internal Copy] ${subject}`,
          html: htmlBody,
          text: textBody,
        });
        successfulRecipients.push(addEmail);
      } catch (addErr: any) {
        const errStr = `Failed sending to additional recipient ${addEmail}: ${addErr?.message || addErr}`;
        console.error(`[VIO-EMAIL] ${errStr}`);
        sendErrors.push(errStr);
      }
    }

    const isSuccess = successfulRecipients.length > 0;
    const auditDetails = isSuccess
      ? `Sent ${normalizedStage} email notification for Order #${emailData.orderNumber} to: ${successfulRecipients.join(', ')}.${sendErrors.length ? ' Warnings: ' + sendErrors.join('; ') : ''}`
      : `Failed to deliver ${normalizedStage} email notification for Order #${emailData.orderNumber}. Errors: ${sendErrors.join('; ')}`;

    await db.saveCollectionDoc('audit_logs', {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now,
      user: 'System Notification Engine',
      role: 'Admin',
      action: stageActionKey,
      orderId: String(order.id),
      details: auditDetails,
      status: isSuccess ? 'success' : 'failed',
    });

    return {
      success: isSuccess,
      message: auditDetails,
      error: !isSuccess ? sendErrors.join('; ') : undefined,
    };
  } catch (err: any) {
    const fatalErr = `Uncaught operational error during email notification: ${err?.message || err}`;
    console.error(`[VIO-EMAIL] ${fatalErr}`);
    try {
      await db.saveCollectionDoc('audit_logs', {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        user: 'System Notification Engine',
        role: 'Admin',
        action: stageActionKey,
        orderId,
        details: fatalErr,
        status: 'failed',
      });
    } catch (_) {}
    return { success: false, error: fatalErr };
  }
}
