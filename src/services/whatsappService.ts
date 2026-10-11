/**
 * VioLeafyServer — WhatsApp Integration Service
 * Provider: Meta WhatsApp Business Cloud API
 * Database: Existing Firestore database (global -> config, sales_orders, audit_logs)
 */

export interface WhatsAppFirestoreConfig {
  whatsappPhoneId?: string;
  whatsappToken?: string;
  whatsappApiUrl?: string;
  successPhones1?: string | string[] | number;
  whatsappTemplateOrderPlaced?: string;
  whatsappTemplatePacking?: string;
  whatsappTemplateShipped?: string;
  whatsappTemplateInTransit?: string;
  whatsappTemplateDelivered?: string;
  whatsappLanguageCode?: string;
  [key: string]: any;
}

export interface WhatsAppProductItem {
  productName: string;
  sku: string;
  quantity: number | string;
  unitPrice: number | string;
  itemTotal: number | string;
}

export interface WhatsAppTemplateData {
  customerName: string;
  customerMobile: string;
  orderNumber: string;
  orderId: string;
  orderDate: string;
  orderStatus: string;
  stageHeading: string;
  normalizedStage: string;
  deliveryAddress: string;
  city: string;
  state: string;
  pincode: string;
  productsSummary: string;
  products: WhatsAppProductItem[];
  courierName?: string;
  trackingNumber?: string;
  invoiceNumber?: string;
}

export interface WhatsAppStageMapping {
  normalizedStage: string;
  stageActionKey: string;
  heading: string;
  defaultTemplateName: string;
  isSupportedStage: boolean;
  reason?: string;
}

export interface WhatsAppRecipientResult {
  recipient: string;
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  skipped?: boolean;
  messageId?: string;
  results?: WhatsAppRecipientResult[];
  message?: string;
  error?: string;
}

/**
 * Normalizes phone numbers to international digits-only format required by Meta Cloud API (e.g., India: 919876543210).
 * Enforces rule: "Do not guess missing country codes. If a number cannot be safely normalized or validated, skip that recipient and record a safe reason."
 */
export function normalizeWhatsAppNumber(raw: string | number | undefined | null): {
  valid: boolean;
  normalized?: string;
  reason?: string;
} {
  if (raw === undefined || raw === null) {
    return { valid: false, reason: 'Empty or missing phone number' };
  }

  let str = String(raw).trim();
  if (!str) {
    return { valid: false, reason: 'Empty phone number string' };
  }

  // Remove leading plus sign if present
  if (str.startsWith('+')) {
    str = str.substring(1).trim();
  }

  // Remove spaces, hyphens, and parentheses
  const cleaned = str.replace(/[\s\-\(\)\.]/g, '');

  // Must only contain numeric digits
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, reason: `Phone number '${cleaned}' contains non-numeric characters` };
  }

  // National numbers starting with 0 trunk prefix lack international country code
  if (cleaned.startsWith('0')) {
    return { valid: false, reason: `Leading national trunk prefix (0) provided without international country code ('${cleaned}')` };
  }

  // A 10-digit number lacks international country code (e.g. 10-digit Indian mobile number without 91 prefix)
  if (cleaned.length === 10) {
    return { valid: false, reason: `Missing international country code (10 digits provided: '${cleaned}'). Do not guess country code.` };
  }

  // Valid ITU-T E.164 digits-only length with country code: 11 to 15 digits
  if (cleaned.length < 11 || cleaned.length > 15) {
    return { valid: false, reason: `Invalid international phone number length (${cleaned.length} digits: '${cleaned}'). Must be 11-15 digits.` };
  }

  return { valid: true, normalized: cleaned };
}

/**
 * Parses additional phone numbers from global -> config.successPhones1.
 * Supports string (comma/semicolon-separated), array of strings/numbers, or single number.
 */
export function parseAdditionalPhoneRecipients(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  let candidates: string[] = [];
  if (Array.isArray(raw)) {
    candidates = raw.map((item) => String(item).trim());
  } else if (typeof raw === 'number') {
    candidates = [String(raw).trim()];
  } else if (typeof raw === 'string') {
    candidates = raw
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return candidates;
}

/**
 * Slices and normalizes recipients, deduplicating valid numbers between primary customerMobile and successPhones1.
 */
export function resolveWhatsAppRecipients(
  customerMobileRaw: string | number | undefined | null,
  additionalPhonesRaw: unknown
): {
  validRecipients: string[];
  skippedRecipients: Array<{ raw: string; reason: string }>;
} {
  const validRecipients: string[] = [];
  const skippedRecipients: Array<{ raw: string; reason: string }> = [];

  // 1. Process customer mobile (Primary recipient)
  const custRes = normalizeWhatsAppNumber(customerMobileRaw);
  if (custRes.valid && custRes.normalized) {
    validRecipients.push(custRes.normalized);
  } else {
    skippedRecipients.push({
      raw: String(customerMobileRaw ?? ''),
      reason: `Customer primary mobile: ${custRes.reason || 'Invalid format'}`,
    });
  }

  // 2. Process additional recipients from successPhones1
  const additionalCandidates = parseAdditionalPhoneRecipients(additionalPhonesRaw);
  for (const candidate of additionalCandidates) {
    const addRes = normalizeWhatsAppNumber(candidate);
    if (addRes.valid && addRes.normalized) {
      if (!validRecipients.includes(addRes.normalized)) {
        validRecipients.push(addRes.normalized);
      }
    } else {
      skippedRecipients.push({
        raw: candidate,
        reason: `Additional successPhones1 recipient: ${addRes.reason || 'Invalid format'}`,
      });
    }
  }

  return { validRecipients, skippedRecipients };
}

/**
 * Validates whether a given URL string is a valid HTTP/HTTPS URL.
 */
export function isValidHttpUrl(urlStr: string | undefined | null): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Constructs and validates the Meta WhatsApp Cloud API endpoint from configured whatsappApiUrl and whatsappPhoneId.
 */
export function resolveWhatsAppApiEndpoint(apiUrl: string, phoneId: string): string {
  const trimmedUrl = String(apiUrl || '').trim();
  const trimmedPhoneId = String(phoneId || '').trim();

  if (trimmedUrl.includes('{phone_number_id}')) {
    return trimmedUrl.replace('{phone_number_id}', encodeURIComponent(trimmedPhoneId));
  }
  if (trimmedUrl.includes('{{PhoneId}}')) {
    return trimmedUrl.replace('{{PhoneId}}', encodeURIComponent(trimmedPhoneId));
  }
  if (trimmedUrl.includes(':phoneId')) {
    return trimmedUrl.replace(':phoneId', encodeURIComponent(trimmedPhoneId));
  }
  if (trimmedUrl.endsWith('/messages')) {
    return trimmedUrl;
  }

  // Base URL format (e.g. https://graph.facebook.com/v21.0)
  return `${trimmedUrl.replace(/\/+$/, '')}/${encodeURIComponent(trimmedPhoneId)}/messages`;
}

/**
 * Maps the incoming operational stage to one of the 5 allowed transactional notification stages.
 */
export function mapWhatsAppStage(stage: string, orderNumber: string): WhatsAppStageMapping {
  const norm = String(stage || '').toLowerCase().trim();

  // 1. Delivered / Confirm Delivery
  if (norm.includes('deliver')) {
    return {
      normalizedStage: 'Delivered',
      stageActionKey: 'NOTIFICATION_WHATSAPP_DELIVERED',
      heading: `Your Order Has Been Delivered — ${orderNumber}`,
      defaultTemplateName: 'order_delivered',
      isSupportedStage: true,
    };
  }

  // 2. In Transit
  if (norm.includes('transit') || norm.includes('dispatch') || norm.includes('way')) {
    return {
      normalizedStage: 'In Transit',
      stageActionKey: 'NOTIFICATION_WHATSAPP_IN_TRANSIT',
      heading: `Your Order Is on the Way — ${orderNumber}`,
      defaultTemplateName: 'order_in_transit',
      isSupportedStage: true,
    };
  }

  // 3. Shipped / Create Shipment
  if (norm.includes('ship')) {
    return {
      normalizedStage: 'Shipped',
      stageActionKey: 'NOTIFICATION_WHATSAPP_SHIPPED',
      heading: `Your Order Has Been Shipped — ${orderNumber}`,
      defaultTemplateName: 'order_shipped',
      isSupportedStage: true,
    };
  }

  // 4. Packing / Complete Packing
  if (norm.includes('pack')) {
    return {
      normalizedStage: 'Packing',
      stageActionKey: 'NOTIFICATION_WHATSAPP_PACKING',
      heading: `Your Order Is Being Packed — ${orderNumber}`,
      defaultTemplateName: 'order_packing',
      isSupportedStage: true,
    };
  }

  // 5. Order Item / Order Placed / Order Confirmed
  if (norm.includes('placed') || norm.includes('confirm') || norm.includes('item') || norm.includes('order')) {
    return {
      normalizedStage: 'Order Placed',
      stageActionKey: 'NOTIFICATION_WHATSAPP_ORDER_PLACED',
      heading: `Order Confirmed — Order ${orderNumber}`,
      defaultTemplateName: 'order_confirmed',
      isSupportedStage: true,
    };
  }

  return {
    normalizedStage: stage,
    stageActionKey: `NOTIFICATION_WHATSAPP_${stage.replace(/\s+/g, '_').toUpperCase()}`,
    heading: `Order Notification — ${orderNumber}`,
    defaultTemplateName: 'order_notification',
    isSupportedStage: false,
    reason: `Stage '${stage}' is not one of the 5 operational notification stages.`,
  };
}

/**
 * Reads WhatsApp configuration from existing Firestore collection structure (global -> config, or fallback config -> config).
 */
export async function fetchWhatsAppConfigFromFirestore(db: {
  getCollectionDocs: (col: string) => Promise<any[]>;
}): Promise<WhatsAppFirestoreConfig | null> {
  try {
    const configDocs = await db.getCollectionDocs('config').catch(() => []);
    let match = configDocs.find(
      (c: any) =>
        String(c.id) === 'config' ||
        String(c.configId) === 'config' ||
        c.whatsappPhoneId ||
        c.phoneId ||
        c.phoneNumberId ||
        c.whatsappToken ||
        c.token ||
        c.whatsappApiUrl
    );
    if (!match && configDocs.length > 0) {
      match = configDocs[0];
    }

    const globalDocs = await db.getCollectionDocs('global').catch(() => []);
    const globalMatch = globalDocs.find(
      (c: any) =>
        String(c.id) === 'config' ||
        String(c.configId) === 'config' ||
        String(c.id) === 'global' ||
        c.whatsappPhoneId ||
        c.phoneId ||
        c.phoneNumberId ||
        c.whatsappToken ||
        c.token ||
        c.whatsappApiUrl
    );

    const settingsDocs = await db.getCollectionDocs('settings').catch(() => []);
    const settingsMatch = settingsDocs.find(
      (c: any) =>
        String(c.id) === 'config' ||
        String(c.id) === 'whatsapp' ||
        c.whatsappPhoneId ||
        c.phoneId ||
        c.whatsappToken
    );

    const merged = {
      ...(settingsMatch || {}),
      ...(globalMatch || {}),
      ...(match || {}),
    } as any;

    const envPhoneId = typeof process !== 'undefined' ? process.env?.WHATSAPP_PHONE_ID : undefined;
    const envToken = typeof process !== 'undefined' ? process.env?.WHATSAPP_TOKEN : undefined;
    const envApiUrl = typeof process !== 'undefined' ? process.env?.WHATSAPP_API_URL : undefined;

    const phoneId = merged.whatsappPhoneId || merged.phoneId || merged.phoneNumberId || merged.whatsAppPhoneId || merged.whatsapp_phone_id || envPhoneId;
    const token = merged.whatsappToken || merged.token || merged.accessToken || merged.whatsAppToken || merged.whatsapp_token || envToken;
    const apiUrl = merged.whatsappApiUrl || merged.apiUrl || merged.whatsAppApiUrl || merged.whatsapp_api_url || envApiUrl;

    if (phoneId || token || apiUrl || match || globalMatch || settingsMatch) {
      return {
        ...merged,
        whatsappPhoneId: phoneId ? String(phoneId).trim() : undefined,
        whatsappToken: token ? String(token).trim() : undefined,
        whatsappApiUrl: apiUrl ? String(apiUrl).trim() : undefined,
      } as WhatsAppFirestoreConfig;
    }

    return null;
  } catch (err) {
    console.error('[VIO-WHATSAPP] Operational error reading WhatsApp config from Firestore:', err);
    return null;
  }
}

/**
 * Builds standard Meta WhatsApp Business Cloud API template components.
 * Parameters correspond to:
 * 1: Customer Name
 * 2: Order Number
 * 3: Stage Heading
 * 4: Order Date
 * 5: Products Summary
 * 6: Delivery Address
 * 7: Tracking / Courier info (or current stage status)
 */
export function buildWhatsAppTemplateComponents(
  data: WhatsAppTemplateData,
  templateName?: string
): Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }> {
  const trackingInfo = data.courierName && data.trackingNumber
    ? `${data.courierName} (Docket: ${data.trackingNumber})`
    : data.trackingNumber
    ? `Tracking: ${data.trackingNumber}`
    : `Status: ${data.orderStatus}`;

  const fullAddress = [
    data.deliveryAddress,
    data.city,
    data.state ? (data.pincode ? `${data.state} - ${data.pincode}` : data.state) : data.pincode,
  ]
    .filter(Boolean)
    .join(', ');

  // Template-specific parameters for approved Meta templates
  const normTemplate = String(templateName || '').toLowerCase().trim();
  if (normTemplate === 'leafyearth_order_shipped' || normTemplate.includes('order_shipped')) {
    return [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: String(data.customerName || 'Valued Customer').slice(0, 1024) },
          { type: 'text', text: String(trackingInfo).slice(0, 1024) },
        ],
      },
    ];
  }

  if (normTemplate === 'leafyearth_order_confirm' || normTemplate.includes('order_confirm')) {
    return [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: String(data.customerName || 'Valued Customer').slice(0, 1024) },
          { type: 'text', text: String(data.orderNumber || data.orderId).slice(0, 1024) },
          { type: 'text', text: String(data.orderDate || new Date().toISOString().split('T')[0]).slice(0, 1024) },
        ],
      },
    ];
  }

  const parameters: Array<{ type: 'text'; text: string }> = [
    { type: 'text', text: String(data.customerName || 'Valued Customer').slice(0, 1024) },
    { type: 'text', text: String(data.orderNumber || data.orderId).slice(0, 1024) },
    { type: 'text', text: String(data.stageHeading).slice(0, 1024) },
    { type: 'text', text: String(data.orderDate).slice(0, 1024) },
    { type: 'text', text: String(data.productsSummary || 'Items detailed in order').slice(0, 1024) },
    { type: 'text', text: String(fullAddress || 'Address on file').slice(0, 1024) },
    { type: 'text', text: String(trackingInfo).slice(0, 1024) },
  ];

  return [
    {
      type: 'body',
      parameters,
    },
  ];
}

/**
 * Builds the official Meta WhatsApp Business Cloud API message payload.
 */
export function buildWhatsAppCloudApiPayload(
  recipient: string,
  templateName: string,
  languageCode: string,
  components: any[]
): Record<string, any> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode || 'en',
      },
      components,
    },
  };
}

/**
 * Sends an authenticated HTTPS POST request to Meta WhatsApp Business Cloud API.
 * Uses bounded timeout (10s) and bounded retries for transient errors.
 * Never leaks token or authorization headers into logs or errors.
 */
export async function sendWhatsAppMessageViaMetaCloudApi(
  endpointUrl: string,
  token: string,
  payload: Record<string, any>,
  customFetch?: (url: string, init: any) => Promise<any>
): Promise<{ success: boolean; messageId?: string; error?: string; status?: number }> {
  const fetchFn = customFetch || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return { success: false, error: 'No HTTP fetch client available in runtime' };
  }

  const cleanToken = String(token || '').trim();
  const maxAttempts = 3; // 1 initial + up to 2 retries (transient, language fallback, or parameter count adaptation)
  let attempt = 0;
  let lastErr = '';
  let lastStatus = 0;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;

    try {
      const response = await fetchFn(endpointUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'VioLeafyServer-WhatsApp/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      const status = response.status;
      lastStatus = status;

      let resBody: any = null;
      try {
        resBody = await response.json();
      } catch {
        resBody = null;
      }

      if (response.ok) {
        const messageId = resBody?.messages?.[0]?.id || 'accepted';
        return {
          success: true,
          messageId,
          status,
        };
      }

      // Safe error extraction from Meta response
      const metaErrMsg =
        resBody?.error?.message ||
        resBody?.error?.error_user_msg ||
        `Provider responded with HTTP ${status}`;
      const metaErrCode = resBody?.error?.code ? ` (code: ${resBody.error.code})` : '';
      lastErr = `Meta API error: ${metaErrMsg}${metaErrCode}`;

      // Auto-fallback 1: Language code mismatch (132001) e.g., 'en' vs 'en_US'
      if (resBody?.error?.code === 132001 && attempt < maxAttempts && payload?.template?.language?.code) {
        const currentLang = payload.template.language.code;
        if (currentLang === 'en') {
          console.warn(`[VIO-WHATSAPP] Template does not exist in 'en'. Auto-retrying with 'en_US'...`);
          payload.template.language.code = 'en_US';
          continue;
        } else if (currentLang === 'en_US') {
          console.warn(`[VIO-WHATSAPP] Template does not exist in 'en_US'. Auto-retrying with 'en'...`);
          payload.template.language.code = 'en';
          continue;
        }
      }

      // Auto-fallback 2: Parameter count mismatch (132000)
      if (resBody?.error?.code === 132000 && attempt < maxAttempts) {
        const detailStr = String(resBody?.error?.error_data?.details || resBody?.error?.message || '');
        const matchExpected = detailStr.match(/expected number of params \((\d+)\)/);
        if (matchExpected && payload?.template?.components?.[0]?.parameters) {
          const expectedCount = parseInt(matchExpected[1], 10);
          const currentParams = payload.template.components[0].parameters;
          if (currentParams.length > expectedCount) {
            console.warn(`[VIO-WHATSAPP] Parameter count mismatch (${currentParams.length} vs expected ${expectedCount}). Auto-adjusting to ${expectedCount} params and retrying...`);
            payload.template.components[0].parameters = currentParams.slice(0, expectedCount);
            continue;
          }
        }
      }

      // Bounded retry ONLY for transient status codes (429 Rate Limit, 500, 502, 503, 504)
      const isTransient = status === 429 || (status >= 500 && status <= 504);
      if (isTransient && attempt < maxAttempts) {
        console.warn(`[VIO-WHATSAPP] Transient provider error (${status}). Retrying attempt ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      // Permanent error (e.g. 400 invalid parameters, 401 unauthorized, 404 not found)
      return {
        success: false,
        error: lastErr,
        status,
      };
    } catch (netErr: any) {
      if (timeoutId) clearTimeout(timeoutId);
      const isTimeout = netErr?.name === 'AbortError' || String(netErr?.message || '').toLowerCase().includes('timeout');
      lastErr = isTimeout ? 'Network timeout communicating with Meta WhatsApp API (10s)' : `Network connection error: ${netErr?.message || netErr}`;

      if (attempt < maxAttempts) {
        console.warn(`[VIO-WHATSAPP] Transient network failure (${lastErr}). Retrying attempt ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      return {
        success: false,
        error: lastErr,
        status: 0,
      };
    }
  }

  return {
    success: false,
    error: lastErr || 'Failed sending WhatsApp message after bounded attempts',
    status: lastStatus,
  };
}

/**
 * Primary transactional WhatsApp stage notification function.
 * Connects to Firestore, checks idempotency, resolves recipients, formats payload, and sends via Meta Cloud API.
 */
export async function sendOrderStageWhatsAppNotification(
  db: {
    getCollectionDocs: (col: string) => Promise<any[]>;
    saveCollectionDoc: (col: string, doc: any) => Promise<void>;
  },
  stage: string,
  orderId: string,
  metadata?: Record<string, any>,
  customFetch?: (url: string, init: any) => Promise<any>
): Promise<WhatsAppSendResult> {
  const now = new Date().toISOString();

  // 1. Stage Mapping Check
  const stageMap = mapWhatsAppStage(stage, orderId);
  if (!stageMap.isSupportedStage) {
    console.log(`[VIO-WHATSAPP] Skipping notification: ${stageMap.reason}`);
    return {
      success: true,
      skipped: true,
      message: stageMap.reason,
    };
  }

  const { normalizedStage, stageActionKey, heading } = stageMap;

  try {
    // 2. Fetch Order Details
    const salesOrders = await db.getCollectionDocs('sales_orders').catch(() => []);
    const order = salesOrders.find(
      (o: any) => String(o.id) === String(orderId) || String(o.orderNumber) === String(orderId)
    );

    if (!order) {
      const errMsg = `Order #${orderId} not found in database. Cannot send WhatsApp notification.`;
      console.error(`[VIO-WHATSAPP] ${errMsg}`);
      await db.saveCollectionDoc('audit_logs', {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        user: 'System WhatsApp Engine',
        role: 'Admin',
        action: stageActionKey,
        orderId,
        details: errMsg,
        status: 'failed',
      });
      return { success: false, error: errMsg };
    }

    const orderNumberStr = String(order.orderNumber || order.id);
    const updatedStageHeading = mapWhatsAppStage(stage, orderNumberStr).heading;

    // 3. Fetch Configuration from global -> config
    const waConfig = await fetchWhatsAppConfigFromFirestore(db);
    const phoneId = String(waConfig?.whatsappPhoneId || '').trim();
    const token = String(waConfig?.whatsappToken || '').trim();
    let apiUrl = String(waConfig?.whatsappApiUrl || '').trim();
    if (!apiUrl && phoneId && token) {
      apiUrl = 'https://graph.facebook.com/v21.0';
    }

    if (!waConfig || !phoneId || !token || !apiUrl || !isValidHttpUrl(apiUrl)) {
      const missingFields: string[] = [];
      if (!phoneId) missingFields.push('whatsappPhoneId');
      if (!token) missingFields.push('whatsappToken');
      if (!apiUrl) missingFields.push('whatsappApiUrl');
      else if (!isValidHttpUrl(apiUrl)) missingFields.push('whatsappApiUrl (invalid URL)');

      const configErrMsg = `WhatsApp Cloud API configuration is missing or invalid in Firestore 'global -> config' (${missingFields.join(', ')}). Notification skipped safely.`;
      console.warn(`[VIO-WHATSAPP] ${configErrMsg}`);
      await db.saveCollectionDoc('audit_logs', {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        user: 'System WhatsApp Engine',
        role: 'Admin',
        action: stageActionKey,
        orderId: String(order.id),
        details: configErrMsg,
        status: 'failed',
      });
      return { success: false, error: configErrMsg };
    }

    // 4. Fetch Customer Record Early to Resolve Primary Recipient Mobile & Country Code
    const customers = await db.getCollectionDocs('customers').catch(() => []);
    const customer = customers.find(
      (c: any) =>
        String(c.id) === String(order.customerId) ||
        String(c.customerId) === String(order.customerId)
    );

    // Collect all mobile candidate fields from order and customer record
    const phoneCandidates: string[] = [
      order.mobilenumberwithcountrycode,
      customer?.mobilenumberwithcountrycode,
      order.customerMobile,
      order.contactNo,
      order.mobileNumber,
      order.mobile,
      order.phone,
      customer?.mobileNumber,
      customer?.contactNo,
      customer?.phone,
    ]
      .filter((v): v is string => Boolean(v && typeof v === 'string' && v.trim().length > 0))
      .map((v) => v.trim());

    const detectedCountryCode = String(
      order.countrymobilecode ||
      customer?.countrymobilecode ||
      waConfig?.countrymobilecode ||
      waConfig?.whatsappDefaultCountryCode ||
      waConfig?.defaultCountryCode ||
      ''
    ).trim();

    // Check if any candidate is already a valid international number
    let resolvedCustomerMobile: string | undefined = undefined;
    for (const cand of phoneCandidates) {
      const normRes = normalizeWhatsAppNumber(cand);
      if (normRes.valid && normRes.normalized) {
        resolvedCustomerMobile = normRes.normalized;
        break;
      }
    }

    // If not yet normalized and we have a 10-digit number with a country code (or default 91)
    if (!resolvedCustomerMobile && phoneCandidates.length > 0) {
      for (const cand of phoneCandidates) {
        const cleaned = cand.replace(/[\s\-\(\)\.]/g, '').replace(/^\+/, '');
        if (cleaned.length === 10) {
          const cCode = (detectedCountryCode || '91').replace(/^\+/, '');
          const withCode = `${cCode}${cleaned}`;
          const normRes = normalizeWhatsAppNumber(withCode);
          if (normRes.valid && normRes.normalized) {
            resolvedCustomerMobile = normRes.normalized;
            break;
          }
        }
      }
    }

    // Resolve Recipients: Customer Primary and Additional (successPhones1)
    const { validRecipients, skippedRecipients } = resolveWhatsAppRecipients(
      resolvedCustomerMobile || order.customerMobile || order.contactNo,
      waConfig.successPhones1
    );

    if (validRecipients.length === 0) {
      const recipientErrMsg = `No valid WhatsApp recipients found for Order #${orderNumberStr}. Reasons: ${skippedRecipients.map((s) => s.reason).join('; ')}`;
      console.warn(`[VIO-WHATSAPP] ${recipientErrMsg}`);
      await db.saveCollectionDoc('audit_logs', {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        user: 'System WhatsApp Engine',
        role: 'Admin',
        action: stageActionKey,
        orderId: String(order.id),
        details: recipientErrMsg,
        status: 'failed',
      });
      return { success: false, error: recipientErrMsg };
    }

    // 5. Idempotency Check: Filter out recipients that already received this stage notification
    const auditLogs = await db.getCollectionDocs('audit_logs').catch(() => []);
    const recipientsToSend: string[] = [];
    const recipientResults: WhatsAppRecipientResult[] = [];

    for (const recipient of validRecipients) {
      const alreadySent = auditLogs.find(
        (log: any) =>
          String(log.action) === stageActionKey &&
          (String(log.orderId) === String(order.id) || String(log.orderId) === String(order.orderNumber)) &&
          log.status === 'success' &&
          (String(log.recipient || '').trim() === recipient || String(log.details || '').includes(recipient))
      );

      if (alreadySent) {
        console.log(`[VIO-WHATSAPP] Skipping duplicate send for Order #${orderNumberStr} to ${recipient} (stage: ${normalizedStage}). Audit log exists.`);
        recipientResults.push({
          recipient,
          success: true,
          skipped: true,
          reason: 'Notification already sent to recipient for this stage',
        });
      } else {
        recipientsToSend.push(recipient);
      }
    }

    // If all valid recipients were already sent, return skipped safely
    if (recipientsToSend.length === 0) {
      return {
        success: true,
        skipped: true,
        results: recipientResults,
        message: 'Notification already sent for this stage to all recipients.',
      };
    }

    // 6. Gather Dynamic Order & Customer Data
    const customerName = (customer?.name || order.customerName || 'Valued Customer').trim();
    const deliveryAddress = (order.deliveryAddress || order.address || customer?.address || '').trim();
    const city = (order.city || order.district || customer?.district || customer?.city || '').trim();
    const state = (order.state || customer?.state || '').trim();
    const pincode = (order.pincode || customer?.pincode || '').trim();

    let trackingNumber = order.trackingNumber || metadata?.trackingNumber;
    let courierName = order.courierName || order.courierAgency || metadata?.courierName || metadata?.courierAgency;
    let invoiceNumber = order.invoiceNumber || order.invoiceId || metadata?.invoiceNumber;

    if (!trackingNumber || !courierName) {
      const shipments = await db.getCollectionDocs('order_shipments').catch(() => []);
      const matchShipment = shipments.find(
        (s: any) => String(s.orderId) === String(order.id) || String(s.orderId) === String(order.orderNumber)
      );
      if (matchShipment) {
        if (!trackingNumber) trackingNumber = matchShipment.trackingNumber;
        if (!courierName) courierName = matchShipment.courierAgency || matchShipment.courierName;
      }
    }

    // Fallback: check shipment_brand_owner_fulfilment (used by Complete Packing & Create Shipment views)
    if (!trackingNumber || !courierName) {
      const fulfilments = await db.getCollectionDocs('shipment_brand_owner_fulfilment').catch(() => []);
      const matchFul = fulfilments.find(
        (f: any) =>
          String(f.salesOrderId) === String(order.id) ||
          String(f.salesOrderId) === String(order.orderNumber) ||
          String(f.orderNo) === String(order.id) ||
          String(f.orderNo) === String(order.orderNumber)
      );
      if (matchFul) {
        if (!trackingNumber) trackingNumber = matchFul.outcourierdocketno || matchFul.courierdocketno;
        if (!courierName) courierName = matchFul.outcouriername || matchFul.couriername;
      }
    }

    const products: WhatsAppProductItem[] = (Array.isArray(order.products) ? order.products : []).map(
      (p: any, idx: number) => {
        const name = p.productName || p.name || p.title || `Item ${idx + 1}`;
        const sku = p.sku || p.SKU || p.productId || `SKU-${idx + 1}`;
        const qty = Number(p.quantity ?? p.qty ?? p.orderqty ?? 1);
        const price = Number(p.price ?? p.unitPrice ?? p.onlinePrice ?? p.shopPrice ?? 0);
        const itemTotal = Number(p.itemTotal ?? p.total ?? qty * price);
        return {
          productName: name,
          sku,
          quantity: qty,
          unitPrice: price,
          itemTotal,
        };
      }
    );

    const productsSummary = products.length > 0
      ? products.map((p) => `${p.productName} (Qty: ${p.quantity})`).join(', ')
      : 'Order Items';

    const templateData: WhatsAppTemplateData = {
      customerName,
      customerMobile: String(resolvedCustomerMobile || order.customerMobile || order.contactNo || ''),
      orderNumber: orderNumberStr,
      orderId: String(order.id),
      orderDate: String(order.createdAt || order.orderDate || now).split('T')[0],
      orderStatus: String(order.deliveryStatus || order.status || normalizedStage),
      stageHeading: updatedStageHeading,
      normalizedStage,
      deliveryAddress,
      city,
      state,
      pincode,
      productsSummary,
      products,
      courierName,
      trackingNumber,
      invoiceNumber,
    };

    // 7. Determine Template Name and Language
    // Checks stage-specific config, global stageConfig, or standard default template name
    const stageTemplateOverrideKey = `whatsappTemplate${normalizedStage.replace(/\s+/g, '')}`;
    const configuredTemplateName =
      waConfig[stageTemplateOverrideKey] ||
      waConfig[stage]?.WhatsApptemplateid ||
      waConfig[stageMap.normalizedStage]?.WhatsApptemplateid ||
      waConfig['Create Shipment']?.WhatsApptemplateid ||
      waConfig['Complete Packing']?.WhatsApptemplateid ||
      stageMap.defaultTemplateName;
    let languageCode = String(waConfig.whatsappLanguageCode || '').trim();
    if (!languageCode) {
      languageCode = configuredTemplateName.startsWith('leafyearth_') ? 'en_US' : 'en';
    }

    // 8. Build Meta Cloud API Components & Endpoint
    const components = buildWhatsAppTemplateComponents(templateData, configuredTemplateName);
    const endpointUrl = resolveWhatsAppApiEndpoint(apiUrl, phoneId);

    // 9. Dispatch to all active recipients
    for (const recipient of recipientsToSend) {
      const payload = buildWhatsAppCloudApiPayload(recipient, configuredTemplateName, languageCode, components);
      const sendResult = await sendWhatsAppMessageViaMetaCloudApi(endpointUrl, token, payload, customFetch);

      if (sendResult.success) {
        recipientResults.push({
          recipient,
          success: true,
          messageId: sendResult.messageId,
        });

        // Record individual recipient success in audit log
        await db.saveCollectionDoc('audit_logs', {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: now,
          user: 'System WhatsApp Engine',
          role: 'Admin',
          action: stageActionKey,
          orderId: String(order.id),
          recipient,
          messageId: sendResult.messageId,
          details: `Sent ${normalizedStage} WhatsApp notification for Order #${orderNumberStr} to ${recipient} (Template: ${configuredTemplateName}, MsgId: ${sendResult.messageId}).`,
          status: 'success',
        });
      } else {
        recipientResults.push({
          recipient,
          success: false,
          error: sendResult.error,
        });

        // Record individual recipient failure in audit log
        await db.saveCollectionDoc('audit_logs', {
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: now,
          user: 'System WhatsApp Engine',
          role: 'Admin',
          action: stageActionKey,
          orderId: String(order.id),
          recipient,
          details: `Failed to deliver ${normalizedStage} WhatsApp notification for Order #${orderNumberStr} to ${recipient}. Error: ${sendResult.error}`,
          status: 'failed',
        });
      }
    }

    const successes = recipientResults.filter((r) => r.success && !r.skipped);
    const failures = recipientResults.filter((r) => !r.success);
    const isOverallSuccess = successes.length > 0;
    const isPartial = successes.length > 0 && failures.length > 0;

    const summaryDetails = `WhatsApp notification for Order #${orderNumberStr} (${normalizedStage}): ${successes.length} delivered, ${failures.length} failed.`;

    return {
      success: isOverallSuccess,
      results: recipientResults,
      messageId: successes[0]?.messageId,
      message: summaryDetails,
      error: failures.length > 0 ? failures.map((f) => `${f.recipient}: ${f.error}`).join('; ') : undefined,
    };
  } catch (err: any) {
    const fatalErr = `Uncaught operational error during WhatsApp notification: ${err?.message || err}`;
    console.error(`[VIO-WHATSAPP] ${fatalErr}`);
    try {
      await db.saveCollectionDoc('audit_logs', {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        user: 'System WhatsApp Engine',
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
