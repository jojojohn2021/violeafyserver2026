import {
  FulfilmentRecord,
  FulfilmentStatus,
  PackingRecord,
  PackingItemVerification,
  BrandOwnerItemAssignment,
  BrandOwnerAssignmentRecord,
  ShipmentRecord,
  ShipmentCharges,
  DeliveryRecord,
  ReturnRecord,
  ReturnItem,
  ReverseShipmentRecord,
  OperationalTimelineEvent,
  PaymentReminderRecord,
  OperationsOrderDetailsResponse,
  PaymentRecord,
  GlobalNotificationConfig,
  StageNotificationSetting,
} from '../types/operations';

export interface DataAccessor {
  getCollectionDocs: (collection: string) => Promise<any[]>;
  saveCollectionDoc: (collection: string, item: any) => Promise<void>;
  deleteCollectionDoc?: (collection: string, id: string) => Promise<void>;
}

// In-memory idempotency cache for duplicate request suppression
const processedIdempotencyKeys = new Map<string, { timestamp: number; response: any }>();

// Helper to strip undefined properties for Firestore compatibility
function sanitizeFirestorePayload(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeFirestorePayload);
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        clean[key] = sanitizeFirestorePayload(val);
      }
    }
    return clean;
  }
  return obj;
}

export class OperationsService {
  constructor(private db: DataAccessor) {}

  // Helper for generating IDs
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Idempotency check helper
  private checkIdempotency(key?: string): any | null {
    if (!key) return null;
    const existing = processedIdempotencyKeys.get(key);
    if (existing && Date.now() - existing.timestamp < 24 * 60 * 60 * 1000) {
      return existing.response;
    }
    return null;
  }

  private setIdempotency(key: string | undefined, response: any): void {
    if (!key) return;
    processedIdempotencyKeys.set(key, { timestamp: Date.now(), response });
  }

  // Record an audit / timeline event
  private async recordTimelineEvent(
    orderId: string,
    action: string,
    description: string,
    performedBy?: string,
    metadata?: Record<string, any>
  ): Promise<OperationalTimelineEvent> {
    const event: any = {
      id: this.generateId('evt'),
      orderId,
      action,
      description,
      timestamp: new Date().toISOString(),
      performedBy: performedBy || 'System',
    };
    if (metadata !== undefined) {
      const sanitized = sanitizeFirestorePayload(metadata);
      if (sanitized !== null) event.metadata = sanitized;
    }
    await this.db.saveCollectionDoc('order_operation_history', sanitizeFirestorePayload(event));
    return event as OperationalTimelineEvent;
  }

  // Helper to retrieve or create default FulfilmentRecord for a sales order
  private async getOrCreateFulfilment(orderId: string): Promise<FulfilmentRecord> {
    const fuls = await this.db.getCollectionDocs('order_fulfilment');
    const existing = fuls.find((f) => String(f.orderId) === String(orderId));
    if (existing) {
      return existing as FulfilmentRecord;
    }

    const newRecord: FulfilmentRecord = {
      id: this.generateId('ful'),
      orderId,
      status: 'NOT_STARTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.db.saveCollectionDoc('order_fulfilment', newRecord);
    return newRecord;
  }

  // Helper to update Fulfilment state safely
  private async updateFulfilmentStatus(
    orderId: string,
    status: FulfilmentStatus,
    patch: Partial<FulfilmentRecord> = {}
  ): Promise<FulfilmentRecord> {
    const ful = await this.getOrCreateFulfilment(orderId);
    const updated: FulfilmentRecord = {
      ...ful,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    };
    await this.db.saveCollectionDoc('order_fulfilment', updated);
    return updated;
  }

  // UPDATE STATUS DIRECTLY (Manually save selected status)
  async updateStatusDirectly(
    orderId: string,
    newStatus: FulfilmentStatus,
    updatedBy?: string,
    notes?: string,
    idempotencyKey?: string
  ): Promise<FulfilmentRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const ful = await this.updateFulfilmentStatus(orderId, newStatus);

    if (newStatus === 'PACKING') {
      const orders = await this.db.getCollectionDocs('sales_orders');
      const order = orders.find((o) => String(o.id) === String(orderId));
      if (order) {
        order.deliveryStatus = 'PACKING';
        order.updatedAt = new Date().toISOString();
        await this.db.saveCollectionDoc('sales_orders', sanitizeFirestorePayload(order));
      }
    }

    await this.recordTimelineEvent(
      orderId,
      'STATUS_UPDATED',
      `Fulfilment status manually updated to ${newStatus}${notes ? `: ${notes}` : ''}`,
      updatedBy || 'Operations Staff',
      notes ? { notes, newStatus } : { newStatus }
    );
    await this.syncPaymentRecord(orderId);

    this.setIdempotency(idempotencyKey, ful);
    return ful;
  }

  // 1. LIST ORDERS (Combining existing sales_orders with isolated fulfilment state)
  async listOrders(filters: {
    paymentStatus?: string;
    deliveryStatus?: string;
    fulfilmentStatus?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    const salesOrders = await this.db.getCollectionDocs('sales_orders');
    const fulfilmentRecords = await this.db.getCollectionDocs('order_fulfilment');
    const shipments = await this.db.getCollectionDocs('order_shipments');

    const fulfilmentMap = new Map<string, FulfilmentRecord>();
    fulfilmentRecords.forEach((f) => fulfilmentMap.set(String(f.orderId), f));

    const combined = salesOrders.map((order) => {
      const ful = fulfilmentMap.get(String(order.id)) || {
        id: `ful_synthetic_${order.id}`,
        orderId: order.id,
        status: (order.deliveryStatus === 'Delivered'
          ? 'DELIVERED'
          : order.deliveryStatus === 'Shipped'
          ? 'DISPATCHED'
          : 'NOT_STARTED') as FulfilmentStatus,
        createdAt: order.createdAt || new Date().toISOString(),
        updatedAt: order.createdAt || new Date().toISOString(),
      };

      const orderShipments = shipments.filter((s) => String(s.orderId) === String(order.id));

      return {
        ...order,
        fulfilmentStatus: ful.status,
        fulfilment: ful,
        shipmentCount: orderShipments.length,
      };
    });

    return combined.filter((item) => {
      if (filters.paymentStatus && item.paymentStatus?.toUpperCase() !== filters.paymentStatus.toUpperCase()) {
        return false;
      }
      if (filters.deliveryStatus && item.deliveryStatus?.toUpperCase() !== filters.deliveryStatus.toUpperCase()) {
        return false;
      }
      if (filters.fulfilmentStatus && item.fulfilmentStatus !== filters.fulfilmentStatus) {
        return false;
      }
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchNumber = String(item.orderNumber || '').toLowerCase().includes(query);
        const matchCustomer = String(item.customerName || '').toLowerCase().includes(query);
        const matchId = String(item.id || '').toLowerCase().includes(query);
        if (!matchNumber && !matchCustomer && !matchId) return false;
      }
      return true;
    });
  }

  // 1b. LIST STAGE RECORDS WITH SERVER-SIDE FILTERING & PAGINATION (Sections 10-25, 33-39, 50-56)
  async listStageRecords(
    stage: 'assignment' | 'packing' | 'shipment' | 'delivery' | 'returns' | 'brand-owner-assignment',
    filters: {
      itemName?: string;
      customerName?: string;
      mobile?: string;
      date?: string;
      page?: number;
      limit?: number;
      search?: string;
    } = {}
  ): Promise<{
    records: any[];
    pagination: {
      page: number;
      limit: number;
      totalRecords: number;
      totalPages: number;
      hasPrevious: boolean;
      hasNext: boolean;
    };
  }> {
    const [salesOrders, fulfilments, packings, brandAssignments, shipments, deliveries, returns, customers] = await Promise.all([
      this.db.getCollectionDocs('sales_orders'),
      this.db.getCollectionDocs('order_fulfilment'),
      this.db.getCollectionDocs('order_packing'),
      this.db.getCollectionDocs('order_brand_assignments'),
      this.db.getCollectionDocs('order_shipments'),
      this.db.getCollectionDocs('order_delivery'),
      this.db.getCollectionDocs('order_returns'),
      this.db.getCollectionDocs('customers'),
    ]);

    const fulMap = new Map<string, FulfilmentRecord>();
    fulfilments.forEach((f) => fulMap.set(String(f.orderId), f));

    const pckMap = new Map<string, PackingRecord>();
    packings.forEach((p) => pckMap.set(String(p.orderId), p));

    const brandMap = new Map<string, BrandOwnerAssignmentRecord>();
    brandAssignments.forEach((b) => brandMap.set(String(b.orderId), b));

    const custMap = new Map<string, any>();
    customers.forEach((c) => {
      custMap.set(String(c.id), c);
      if (c.customerId) custMap.set(String(c.customerId), c);
    });

    const shpMap = new Map<string, ShipmentRecord[]>();
    shipments.forEach((s) => {
      const list = shpMap.get(String(s.orderId)) || [];
      list.push(s);
      shpMap.set(String(s.orderId), list);
    });

    const delMap = new Map<string, DeliveryRecord>();
    deliveries.forEach((d) => delMap.set(String(d.orderId), d));

    const retMap = new Map<string, ReturnRecord[]>();
    returns.forEach((r) => {
      const list = retMap.get(String(r.orderId)) || [];
      list.push(r);
      retMap.set(String(r.orderId), list);
    });

    const targetStage = stage === 'brand-owner-assignment' ? 'assignment' : stage;

    const combined = salesOrders.map((order) => {
      const orderIdStr = String(order.id);
      const ful = fulMap.get(orderIdStr) || {
        id: `ful_synthetic_${order.id}`,
        orderId: order.id,
        status: (order.deliveryStatus === 'Delivered'
          ? 'DELIVERED'
          : order.deliveryStatus === 'Shipped'
          ? 'DISPATCHED'
          : 'NOT_STARTED') as FulfilmentStatus,
        createdAt: order.createdAt || new Date().toISOString(),
        updatedAt: order.createdAt || new Date().toISOString(),
      };

      const packing = pckMap.get(orderIdStr);
      const brandDoc = brandMap.get(orderIdStr);
      const orderShipments = shpMap.get(orderIdStr) || [];
      const latestShipment = orderShipments.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0];
      const delivery = delMap.get(orderIdStr);
      const orderReturns = retMap.get(orderIdStr) || [];
      const latestReturn = orderReturns.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0];

      const customer = custMap.get(String(order.customerId));
      const customerMobile = order.contactNo || order.customerMobile || customer?.mobileNumber || customer?.phone || '';
      const customerEmail = customer?.email || '';

      let stageDate = order.createdAt || new Date().toISOString();
      if (targetStage === 'assignment') {
        stageDate = brandDoc?.updatedAt || order.createdAt || stageDate;
      } else if (targetStage === 'packing') {
        stageDate = packing?.completedAt || packing?.updatedAt || order.createdAt || stageDate;
      } else if (targetStage === 'shipment') {
        stageDate = latestShipment?.shipmentDate || latestShipment?.updatedAt || order.createdAt || stageDate;
      } else if (targetStage === 'delivery') {
        stageDate = delivery?.deliveryDate || latestShipment?.dispatchedAt || order.createdAt || stageDate;
      } else if (targetStage === 'returns') {
        stageDate = latestReturn?.updatedAt || latestReturn?.createdAt || delivery?.createdAt || order.createdAt || stageDate;
      }

      const lastUpdated = stageDate || ful.updatedAt || order.createdAt;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        customerMobile,
        customerEmail,
        products: order.products || [],
        totalValue: Number(order.totalValue || 0),
        paymentStatus: order.paymentStatus || 'Pending',
        deliveryStatus: order.deliveryStatus || 'Pending',
        fulfilmentStatus: ful.status,
        brandAssignments: brandDoc?.assignments || [],
        packingStatus: packing?.status || (ful.status === 'PACKING' || ful.status === 'READY_FOR_DISPATCH' ? 'PACKING' : 'NOT_STARTED'),
        shipmentStatus: latestShipment ? latestShipment.status : 'NONE',
        shipment: latestShipment,
        delivery: delivery,
        returnRecord: latestReturn,
        createdAt: order.createdAt,
        lastUpdated,
        stageDate,
      };
    });

    const stageEligible = combined.filter((rec) => {
      if (targetStage === 'assignment') {
        const hasFullAssignment = rec.brandAssignments && rec.brandAssignments.length > 0 && rec.brandAssignments.length >= rec.products.length;
        return !hasFullAssignment && rec.fulfilmentStatus !== 'COMPLETED' && rec.deliveryStatus !== 'Cancelled';
      }
      if (targetStage === 'packing') {
        return (rec.fulfilmentStatus === 'NOT_STARTED' || rec.fulfilmentStatus === 'PACKING') && rec.packingStatus !== 'PACKING' && rec.deliveryStatus !== 'Cancelled';
      }
      if (targetStage === 'shipment') {
        return (rec.fulfilmentStatus === 'PACKING' || rec.packingStatus === 'PACKING') && rec.shipmentStatus !== 'DISPATCHED' && rec.shipmentStatus !== 'DELIVERED';
      }
      if (targetStage === 'delivery') {
        return (rec.fulfilmentStatus === 'READY_FOR_DISPATCH' || rec.fulfilmentStatus === 'DISPATCHED' || rec.fulfilmentStatus === 'IN_TRANSIT' || rec.fulfilmentStatus === 'OUT_FOR_DELIVERY' || (rec.shipment && rec.shipmentStatus !== 'DELIVERED')) && !rec.delivery;
      }
      if (targetStage === 'returns') {
        return rec.fulfilmentStatus === 'DELIVERED' || rec.fulfilmentStatus === 'RETURN_IN_PROGRESS' || Boolean(rec.delivery) || Boolean(rec.returnRecord);
      }
      return true;
    });

    const searchFiltered = stageEligible.filter((rec) => {
      if (filters.itemName && String(filters.itemName).trim()) {
        const itemQuery = filters.itemName.toLowerCase().trim();
        const hasMatch = rec.products.some((p: any) => String(p.productName || p.name || '').toLowerCase().includes(itemQuery));
        if (!hasMatch) return false;
      }
      if (filters.customerName && String(filters.customerName).trim()) {
        const custQuery = filters.customerName.toLowerCase().trim();
        if (!String(rec.customerName || '').toLowerCase().includes(custQuery)) return false;
      }
      if (filters.mobile && String(filters.mobile).trim()) {
        const mobQuery = filters.mobile.toLowerCase().trim();
        if (!String(rec.customerMobile || '').toLowerCase().includes(mobQuery)) return false;
      }
      if (filters.date && String(filters.date).trim()) {
        const dateQuery = filters.date.trim();
        const matchCreated = String(rec.createdAt || '').includes(dateQuery);
        const matchLastUpdated = String(rec.lastUpdated || '').includes(dateQuery);
        const matchStageDate = String(rec.stageDate || '').includes(dateQuery);
        if (!matchCreated && !matchLastUpdated && !matchStageDate) return false;
      }
      if (filters.search && String(filters.search).trim()) {
        const query = filters.search.toLowerCase().trim();
        const matchOrderNo = String(rec.orderNumber || '').toLowerCase().includes(query);
        const matchCust = String(rec.customerName || '').toLowerCase().includes(query);
        const matchMob = String(rec.customerMobile || '').toLowerCase().includes(query);
        const matchItem = rec.products.some((p: any) => String(p.productName || p.name || '').toLowerCase().includes(query));
        if (!matchOrderNo && !matchCust && !matchMob && !matchItem) return false;
      }
      return true;
    });

    searchFiltered.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

    const limit = Math.min(50, Math.max(1, filters.limit ? Number(filters.limit) : 10));
    const page = Math.max(1, filters.page ? Number(filters.page) : 1);
    const totalRecords = searchFiltered.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const startIndex = (page - 1) * limit;
    const records = searchFiltered.slice(startIndex, startIndex + limit);

    return {
      records,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
    };
  }

  // GET GLOBAL NOTIFICATION CONFIG (Sections 62-63)
  async getGlobalNotificationConfig(): Promise<GlobalNotificationConfig> {
    const configs = await this.db.getCollectionDocs('global');
    const existing = configs.find((c) => String(c.id) === 'config' || String(c.configId) === 'config');
    const base: GlobalNotificationConfig = existing
      ? (existing as GlobalNotificationConfig)
      : {
          id: 'config',
          'Brand Owner Assignment': {
            emailtobrandowner: 'yes',
            emailtocustomer: 'yes',
            emailtemplateid: 'tpl_brand_assignment_email',
            WhatsApptobrandowner: 'yes',
            WhatsApptocustomer: 'yes',
            WhatsApptemplateid: 'tpl_brand_assignment_wa',
          },
          'Complete Packing': {
            emailtocustomer: 'yes',
            emailtemplateid: 'tpl_complete_packing_email',
            WhatsApptocustomer: 'yes',
            WhatsApptemplateid: 'tpl_complete_packing_wa',
          },
          'Create Shipment': {
            emailtobrandowner: 'yes',
            emailtocustomer: 'yes',
            emailtemplateid: 'tpl_create_shipment_email',
            WhatsApptobrandowner: 'yes',
            WhatsApptocustomer: 'yes',
            WhatsApptemplateid: 'tpl_create_shipment_wa',
          },
          'Confirm Delivery': {
            emailtobrandowner: 'yes',
            emailtocustomer: 'yes',
            emailtemplateid: 'tpl_confirm_delivery_email',
            WhatsApptobrandowner: 'yes',
            WhatsApptocustomer: 'yes',
            WhatsApptemplateid: 'tpl_confirm_delivery_wa',
          },
          'Process Return': {
            emailtobrandowner: 'yes',
            emailtocustomer: 'yes',
            emailtemplateid: 'tpl_process_return_email',
            WhatsApptobrandowner: 'yes',
            WhatsApptocustomer: 'yes',
            WhatsApptemplateid: 'tpl_process_return_wa',
          },
        };

    return {
      ...base,
      brandOwnerAssignment: base['Brand Owner Assignment'],
      completePacking: base['Complete Packing'],
      createShipment: base['Create Shipment'],
      confirmDelivery: base['Confirm Delivery'],
      processReturn: base['Process Return'],
    };
  }

  // SAVE GLOBAL NOTIFICATION CONFIG (Section 62-63, 81)
  async saveGlobalNotificationConfig(config: Partial<GlobalNotificationConfig>): Promise<GlobalNotificationConfig> {
    const current = await this.getGlobalNotificationConfig();
    const payload = {
      ...current,
      ...config,
      'Brand Owner Assignment': config['Brand Owner Assignment'] || config.brandOwnerAssignment || current['Brand Owner Assignment'],
      'Complete Packing': config['Complete Packing'] || config.completePacking || current['Complete Packing'],
      'Create Shipment': config['Create Shipment'] || config.createShipment || current['Create Shipment'],
      'Confirm Delivery': config['Confirm Delivery'] || config.confirmDelivery || current['Confirm Delivery'],
      'Process Return': config['Process Return'] || config.processReturn || current['Process Return'],
      id: 'config',
      updatedAt: new Date().toISOString(),
    };
    await this.db.saveCollectionDoc('global', sanitizeFirestorePayload(payload));
    return this.getGlobalNotificationConfig();
  }

  // TRIGGER STAGE NOTIFICATIONS (Sections 64-80)
  async triggerStageNotifications(
    stage: 'Brand Owner Assignment' | 'Complete Packing' | 'Create Shipment' | 'Confirm Delivery' | 'Process Return',
    orderId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const config = await this.getGlobalNotificationConfig();
      const stageConfig = config[stage];
      if (!stageConfig) return;

      const details = await this.getOrderDetails(orderId);
      const customers = await this.db.getCollectionDocs('customers');
      const customer = customers.find((c) => String(c.id) === String(details.order?.customerId));

      const customerEmail = customer?.email || details.order?.customerEmail;
      const customerMobile = details.order?.contactNo || details.order?.customerMobile || customer?.mobileNumber || customer?.phone;

      const brandOwners = await this.db.getCollectionDocs('product_brand_owners');
      const assignedOwners: any[] = [];
      if (details.brandAssignments && details.brandAssignments.length > 0) {
        for (const ba of details.brandAssignments) {
          const owner = brandOwners.find((bo) => String(bo.id) === String(ba.brandOwnerId));
          if (owner) assignedOwners.push(owner);
        }
      }

      const now = new Date().toISOString();

      if (stageConfig.emailtocustomer === 'yes' && stageConfig.emailtemplateid && customerEmail) {
        await this.db.saveCollectionDoc('audit_logs', {
          id: this.generateId('notif_email_cust'),
          timestamp: now,
          user: 'System Notification Engine',
          role: 'Admin',
          action: `NOTIFICATION_EMAIL_CUSTOMER_${stage.replace(/\s+/g, '_').toUpperCase()}`,
          details: `Sent email notification to customer ${customerEmail} using template ${stageConfig.emailtemplateid} for Order #${details.order.orderNumber}`,
          status: 'success',
        });
      }

      if (stageConfig.WhatsApptocustomer === 'yes' && stageConfig.WhatsApptemplateid && customerMobile) {
        await this.db.saveCollectionDoc('whatsapp_messages', {
          id: this.generateId('msg'),
          phone: customerMobile,
          direction: 'Outgoing',
          content: `Notification for Order #${details.order.orderNumber} (${stage})`,
          timestamp: now,
          status: 'sent',
          templateName: stageConfig.WhatsApptemplateid,
        });
      }

      if ('emailtobrandowner' in stageConfig && stageConfig.emailtobrandowner === 'yes' && stageConfig.emailtemplateid) {
        for (const bo of assignedOwners) {
          const boEmail = bo.contactEmail || bo.email;
          if (boEmail) {
            await this.db.saveCollectionDoc('audit_logs', {
              id: this.generateId('notif_email_bo'),
              timestamp: now,
              user: 'System Notification Engine',
              role: 'Admin',
              action: `NOTIFICATION_EMAIL_BRAND_OWNER_${stage.replace(/\s+/g, '_').toUpperCase()}`,
              details: `Sent email notification to brand owner ${bo.name} (${boEmail}) using template ${stageConfig.emailtemplateid} for Order #${details.order.orderNumber}`,
              status: 'success',
            });
          }
        }
      }

      if ('WhatsApptobrandowner' in stageConfig && stageConfig.WhatsApptobrandowner === 'yes' && stageConfig.WhatsApptemplateid) {
        for (const bo of assignedOwners) {
          const boMobile = bo.contactMobile || bo.whatsappNo || bo.contactPhone;
          if (boMobile) {
            await this.db.saveCollectionDoc('whatsapp_messages', {
              id: this.generateId('msg_bo'),
              phone: boMobile,
              direction: 'Outgoing',
              content: `Operational Notification for Brand Owner ${bo.name} - Order #${details.order.orderNumber} (${stage})`,
              timestamp: now,
              status: 'sent',
              templateName: stageConfig.WhatsApptemplateid,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn(`[NOTIFICATION] Non-fatal notification trigger warning for stage '${stage}' on order '${orderId}':`, err);
    }
  }

  // 2. GET SINGLE ORDER DETAILS (Unified response)
  async getOrderDetails(orderId: string): Promise<OperationsOrderDetailsResponse> {
    const orders = await this.db.getCollectionDocs('sales_orders');
    const order = orders.find((o) => String(o.id) === String(orderId));
    if (!order) {
      throw new Error(`Sales Order '${orderId}' not found.`);
    }

    const fulfilment = await this.getOrCreateFulfilment(orderId);

    const packings = await this.db.getCollectionDocs('order_packing');
    const packing = packings.find((p) => String(p.orderId) === String(orderId));

    const brandDocs = await this.db.getCollectionDocs('order_brand_assignments');
    const brandDoc = brandDocs.find((b) => String(b.orderId) === String(orderId));

    const allShipments = await this.db.getCollectionDocs('order_shipments');
    const orderShipments = allShipments.filter((s) => String(s.orderId) === String(orderId));

    const allDeliveries = await this.db.getCollectionDocs('order_delivery');
    const delivery = allDeliveries.find((d) => String(d.orderId) === String(orderId));

    const allReturns = await this.db.getCollectionDocs('order_returns');
    const orderReturns = allReturns.filter((r) => String(r.orderId) === String(orderId));

    const allTimeline = await this.db.getCollectionDocs('order_operation_history');
    const timeline = allTimeline
      .filter((t) => String(t.orderId) === String(orderId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      order,
      fulfilment,
      packing,
      brandAssignments: brandDoc?.assignments || [],
      shipments: orderShipments,
      delivery,
      returns: orderReturns,
      timeline,
    };
  }

  // Map the loosely-typed sales_orders.paymentStatus field onto the authoritative payments.paymentStatus enum
  private mapPaymentStatus(raw?: string): PaymentRecord['paymentStatus'] {
    const normalized = String(raw || '').toUpperCase();
    if (normalized === 'PAID') return 'COMPLETED';
    if (normalized === 'OVERDUE') return 'OVERDUE';
    if (normalized === 'REFUNDED') return 'REFUNDED';
    return 'PENDING';
  }

  /**
   * Recompute and persist the authoritative `payments` record for an order.
   * `payments.orderId` (doc id == orderId) is the single relationship key that every
   * operational table (fulfilment, packing, shipments, delivery, returns, history) links to.
   * This must be called after every operation that changes operational or payment state.
   */
  private async syncPaymentRecord(orderId: string): Promise<PaymentRecord> {
    const [orders, fulfilments, packings, shipments, deliveries, returns, existingPayments] = await Promise.all([
      this.db.getCollectionDocs('sales_orders'),
      this.db.getCollectionDocs('order_fulfilment'),
      this.db.getCollectionDocs('order_packing'),
      this.db.getCollectionDocs('order_shipments'),
      this.db.getCollectionDocs('order_delivery'),
      this.db.getCollectionDocs('order_returns'),
      this.db.getCollectionDocs('payments'),
    ]);

    const order = orders.find((o) => String(o.id) === String(orderId));
    if (!order) {
      throw new Error(`Sales Order '${orderId}' not found.`);
    }

    const fulfilment = fulfilments.find((f) => String(f.orderId) === String(orderId));
    const packing = packings.find((p) => String(p.orderId) === String(orderId));
    const orderShipments = shipments
      .filter((s) => String(s.orderId) === String(orderId))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    const latestShipment = orderShipments[0];
    const delivery = deliveries.find((d) => String(d.orderId) === String(orderId));
    const orderReturns = returns
      .filter((r) => String(r.orderId) === String(orderId))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    const latestReturn = orderReturns[0];

    const now = new Date().toISOString();
    const existing = existingPayments.find((p) => String(p.orderId) === String(orderId));

    const record: PaymentRecord = {
      id: String(orderId), // guarantees payments.orderId uniqueness (one doc per orderId)
      orderId: String(orderId),
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      totalAmount: Number(order.totalValue || 0),
      paymentStatus: this.mapPaymentStatus(order.paymentStatus),
      orderStatus: fulfilment?.status || 'NOT_STARTED',
      fulfilmentStatus: fulfilment?.status || 'NOT_STARTED',
      packingStatus: packing?.status || 'NOT_STARTED',
      shipmentStatus: (latestShipment?.status as PaymentRecord['shipmentStatus']) || 'NONE',
      deliveryStatus: delivery ? 'DELIVERED' : 'PENDING',
      returnStatus: latestReturn?.status || 'NONE',
      courierName: latestShipment?.courierAgency,
      trackingNumber: latestShipment?.trackingNumber,
      latestOperationAt: now,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await this.db.saveCollectionDoc('payments', sanitizeFirestorePayload(record));
    return record;
  }

  // GET AUTHORITATIVE ORDER VIEW - single source of truth for customer/operations facing order status
  async getAuthoritativeOrderView(orderId: string): Promise<PaymentRecord> {
    const payments = await this.db.getCollectionDocs('payments');
    const existing = payments.find((p) => String(p.orderId) === String(orderId));
    if (existing) return existing as PaymentRecord;
    // Lazily backfill payments record for orders created before this sync existed
    return this.syncPaymentRecord(orderId);
  }

  // Public entry point for external callers (e.g. sales_orders create/update routes) to
  // refresh the authoritative payments.orderId record after payment status changes.
  async syncPaymentRecordForOrder(orderId: string): Promise<PaymentRecord> {
    return this.syncPaymentRecord(orderId);
  }

  // 3. GET TIMELINE
  async getOrderTimeline(orderId: string): Promise<OperationalTimelineEvent[]> {
    const allTimeline = await this.db.getCollectionDocs('order_operation_history');
    return allTimeline
      .filter((t) => String(t.orderId) === String(orderId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }



  // 5. PACKING - COMPLETE PACKING
  async completePacking(orderId: string, packerId?: string, notes?: string, idempotencyKey?: string): Promise<PackingRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const details = await this.getOrderDetails(orderId);
    if (details.fulfilment.status === 'PACKING' || details.fulfilment.status === 'READY_FOR_DISPATCH') {
      const existingPackings = await this.db.getCollectionDocs('order_packing');
      const p = existingPackings.find((entry) => String(entry.orderId) === String(orderId));
      if (p) return p;
    }

    if (details.fulfilment.status !== 'PACKING' && details.fulfilment.status !== 'NOT_STARTED') {
      throw new Error(`Cannot complete packing for order in state '${details.fulfilment.status}'`);
    }

    const existingPackings = await this.db.getCollectionDocs('order_packing');
    let packing = existingPackings.find((p) => String(p.orderId) === String(orderId));
    const now = new Date().toISOString();

    if (!packing) {
      const items: PackingItemVerification[] = (details.order.products || []).map((p: any) => ({
        productId: p.productId || p.id || 'item',
        quantity: p.quantity || 1,
        packedQuantity: p.quantity || 1,
        verified: true,
      }));
      packing = {
        id: this.generateId('pck'),
        orderId,
        status: 'PACKING',
        startedAt: now,
        completedAt: now,
        packedBy: packerId || 'Warehouse Staff',
        items,
        notes,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      packing.status = 'PACKING';
      packing.completedAt = now;
      if (notes) packing.notes = notes;
      if (packerId) packing.packedBy = packerId;
      packing.updatedAt = now;
    }

    await this.db.saveCollectionDoc('order_packing', packing);
    await this.updateFulfilmentStatus(orderId, 'PACKING', { packingId: packing.id });
    await this.recordTimelineEvent(orderId, 'PACKING_COMPLETED', `Packing completed by ${packerId || 'Warehouse Staff'}`, packerId, { notes });
    await this.syncPaymentRecord(orderId);
    await this.triggerStageNotifications('Complete Packing', orderId, { packerId, notes });

    this.setIdempotency(idempotencyKey, packing);
    return packing;
  }

  // 6. BRAND OWNER ASSIGNMENT
  async assignBrandOwners(
    orderId: string,
    assignments: { orderItemId: string; productId: string; brandOwnerId: string; brandOwnerName?: string }[],
    assignedBy?: string,
    idempotencyKey?: string
  ): Promise<BrandOwnerAssignmentRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const details = await this.getOrderDetails(orderId);
    const existing = await this.db.getCollectionDocs('order_brand_assignments');
    let record = existing.find((b) => String(b.orderId) === String(orderId));

    const now = new Date().toISOString();
    const formattedAssignments: BrandOwnerItemAssignment[] = assignments.map((a) => ({
      ...a,
      assignedAt: now,
      assignedBy: assignedBy || 'Operations Admin',
    }));

    if (!record) {
      record = {
        id: this.generateId('boa'),
        orderId,
        assignments: formattedAssignments,
        updatedAt: now,
      };
    } else {
      record.assignments = formattedAssignments;
      record.updatedAt = now;
    }

    const orderProds = details.order?.products || [];
    const allAssigned = orderProds.length > 0 && orderProds.every((p: any, idx: number) => {
      const pId = String(p.productId || p.id || `p_${idx}`);
      const itemKey = `item_${p.productId || p.id || idx}`;
      const match = formattedAssignments.find((a: any) => String(a.productId) === pId || a.orderItemId === itemKey);
      const name = match?.brandOwnerName || p.brandOwner || p.brand || '';
      return Boolean(name && name.trim() !== '' && name.trim() !== '-- Select Brand Owner --');
    });

    const computedStatus = allAssigned ? 'PACKING' : 'NOT_STARTED';
    if (details.fulfilment.status === 'NOT_STARTED' || details.fulfilment.status === 'PACKING') {
      await this.updateFulfilmentStatus(orderId, computedStatus);
      if (computedStatus === 'PACKING') {
        const orders = await this.db.getCollectionDocs('sales_orders');
        const order = orders.find((o) => String(o.id) === String(orderId));
        if (order) {
          order.deliveryStatus = 'PACKING';
          order.updatedAt = new Date().toISOString();
          await this.db.saveCollectionDoc('sales_orders', sanitizeFirestorePayload(order));
        }
      }
    }

    await this.db.saveCollectionDoc('order_brand_assignments', record);
    await this.recordTimelineEvent(
      orderId,
      'BRAND_OWNER_ASSIGNED',
      `Assigned brand owners for ${assignments.length} order items (Status: ${computedStatus})`,
      assignedBy,
      { assignments: formattedAssignments, status: computedStatus }
    );
    await this.syncPaymentRecord(orderId);
    await this.triggerStageNotifications('Brand Owner Assignment', orderId, { assignments: formattedAssignments });

    this.setIdempotency(idempotencyKey, record);
    return record;
  }

  // 7. CREATE SHIPMENT (Server-side charge calculation)
  async createShipment(
    orderId: string,
    shipmentData: {
      courierAgency: string;
      trackingNumber: string;
      expectedDeliveryDate?: string;
      packageCount?: number;
      weightKg?: number;
      baseCharge?: number;
      handlingCharge?: number;
      additionalCharge?: number;
      otherCharge?: number;
    },
    createdBy?: string,
    idempotencyKey?: string
  ): Promise<ShipmentRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const details = await this.getOrderDetails(orderId);

    // Concurrency / duplicate checking
    const existingShipments = await this.db.getCollectionDocs('order_shipments');
    const duplicateTracking = existingShipments.find(
      (s) => s.trackingNumber?.toLowerCase() === shipmentData.trackingNumber.toLowerCase()
    );
    if (duplicateTracking) {
      throw new Error(`Shipment with tracking number '${shipmentData.trackingNumber}' already exists.`);
    }

    // Calculate server-side total shipment charge
    const baseCharge = Number(shipmentData.baseCharge || 0);
    const handlingCharge = Number(shipmentData.handlingCharge || 0);
    const additionalCharge = Number(shipmentData.additionalCharge || 0);
    const otherCharge = Number(shipmentData.otherCharge || 0);
    const totalCharge = baseCharge + handlingCharge + additionalCharge + otherCharge;

    const charges: ShipmentCharges = {
      baseCharge,
      handlingCharge,
      additionalCharge,
      otherCharge,
      totalCharge,
    };

    const now = new Date().toISOString();
    const shipment: ShipmentRecord = {
      id: this.generateId('shp'),
      shipmentId: `SHP_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      orderId,
      courierAgency: shipmentData.courierAgency,
      trackingNumber: shipmentData.trackingNumber,
      shipmentDate: now,
      expectedDeliveryDate: shipmentData.expectedDeliveryDate,
      packageCount: shipmentData.packageCount || 1,
      weightKg: shipmentData.weightKg || 0.5,
      charges,
      status: 'CREATED',
      createdAt: now,
      updatedAt: now,
    };

    await this.db.saveCollectionDoc('order_shipments', shipment);
    await this.updateFulfilmentStatus(orderId, 'READY_FOR_DISPATCH', { latestShipmentId: shipment.id });
    await this.recordTimelineEvent(
      orderId,
      'SHIPMENT_CREATED',
      `Shipment created with ${shipment.courierAgency} (Tracking: ${shipment.trackingNumber}). Total Charge: ${totalCharge}`,
      createdBy,
      { shipmentId: shipment.id, trackingNumber: shipment.trackingNumber, totalCharge }
    );
    await this.syncPaymentRecord(orderId);
    await this.triggerStageNotifications('Create Shipment', orderId, { shipmentId: shipment.id });

    this.setIdempotency(idempotencyKey, shipment);
    return shipment;
  }

  // 8. DISPATCH SHIPMENT
  async dispatchShipment(shipmentId: string, dispatchedBy?: string, idempotencyKey?: string): Promise<ShipmentRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const shipments = await this.db.getCollectionDocs('order_shipments');
    const shipment = shipments.find((s) => String(s.id) === String(shipmentId) || String(s.shipmentId) === String(shipmentId));
    if (!shipment) {
      throw new Error(`Shipment '${shipmentId}' not found.`);
    }

    if (shipment.status === 'DISPATCHED' || shipment.status === 'IN_TRANSIT') {
      throw new Error('SHIPMENT_ALREADY_DISPATCHED');
    }

    const now = new Date().toISOString();
    shipment.status = 'DISPATCHED';
    shipment.dispatchedAt = now;
    shipment.dispatchedBy = dispatchedBy || 'Operations Staff';
    shipment.updatedAt = now;

    await this.db.saveCollectionDoc('order_shipments', shipment);
    await this.updateFulfilmentStatus(shipment.orderId, 'DISPATCHED', { latestShipmentId: shipment.id });
    await this.recordTimelineEvent(
      shipment.orderId,
      'SHIPMENT_DISPATCHED',
      `Shipment ${shipment.trackingNumber} dispatched via ${shipment.courierAgency}`,
      dispatchedBy,
      { shipmentId: shipment.id, trackingNumber: shipment.trackingNumber }
    );
    await this.syncPaymentRecord(shipment.orderId);

    this.setIdempotency(idempotencyKey, shipment);
    return shipment;
  }

  // 9. RECORD DELIVERY
  async recordDelivery(
    shipmentId: string,
    deliveryData: {
      deliveryDate?: string;
      deliveryTime?: string;
      recipientName: string;
      remarks?: string;
      proofOfDeliveryUrl?: string;
    },
    recordedBy?: string,
    idempotencyKey?: string
  ): Promise<DeliveryRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const shipments = await this.db.getCollectionDocs('order_shipments');
    let shipment = shipments.find((s) => String(s.id) === String(shipmentId) || String(s.shipmentId) === String(shipmentId) || String(s.orderId) === String(shipmentId));
    if (!shipment) {
      shipment = await this.createShipment(
        shipmentId,
        {
          courierAgency: 'Direct / Standard Local Delivery',
          trackingNumber: `DEL_${Date.now().toString().slice(-8)}`,
        },
        recordedBy
      );
    }

    const now = new Date().toISOString();
    const delivery: DeliveryRecord = {
      id: this.generateId('del'),
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      deliveryDate: deliveryData.deliveryDate || now.split('T')[0],
      deliveryTime: deliveryData.deliveryTime || now.split('T')[1].substring(0, 5),
      recipientName: deliveryData.recipientName,
      remarks: deliveryData.remarks,
      proofOfDeliveryUrl: deliveryData.proofOfDeliveryUrl,
      createdAt: now,
    };

    shipment.status = 'DELIVERED';
    shipment.updatedAt = now;
    await this.db.saveCollectionDoc('order_shipments', shipment);
    await this.db.saveCollectionDoc('order_delivery', delivery);

    await this.updateFulfilmentStatus(shipment.orderId, 'DELIVERED', { latestDeliveryId: delivery.id });
    await this.recordTimelineEvent(
      shipment.orderId,
      'DELIVERY_CONFIRMED',
      `Order delivered to ${delivery.recipientName}`,
      recordedBy,
      { deliveryId: delivery.id, recipientName: delivery.recipientName }
    );
    await this.syncPaymentRecord(shipment.orderId);
    await this.triggerStageNotifications('Confirm Delivery', shipment.orderId, { deliveryId: delivery.id });

    this.setIdempotency(idempotencyKey, delivery);
    return delivery;
  }

  // 10. CREATE RETURN (Item-level returns)
  async createReturn(
    orderId: string,
    returnData: {
      items: ReturnItem[];
      reason: any;
      notes?: string;
    },
    requestedBy?: string,
    idempotencyKey?: string
  ): Promise<ReturnRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const details = await this.getOrderDetails(orderId);
    if (!returnData.items || returnData.items.length === 0) {
      throw new Error('At least one order item must be specified for a return request.');
    }

    // Validate return items against order products
    const validProducts = details.order.products || [];
    for (const retItem of returnData.items) {
      const match = validProducts.find(
        (p: any) => String(p.productId || p.id) === String(retItem.productId) || String(retItem.orderItemId).includes(String(p.productId || p.id))
      );
      if (!match && validProducts.length > 0) {
        retItem.productName = retItem.productName || validProducts[0]?.productName;
      } else if (match) {
        retItem.productName = match.productName;
      }
    }

    const now = new Date().toISOString();
    const returnRecord: ReturnRecord = {
      id: this.generateId('ret'),
      returnId: `RET_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      orderId,
      items: returnData.items,
      reason: returnData.reason || 'DAMAGED',
      status: 'REQUESTED',
      createdAt: now,
      updatedAt: now,
    };

    await this.db.saveCollectionDoc('order_returns', returnRecord);
    await this.updateFulfilmentStatus(orderId, 'RETURN_IN_PROGRESS');
    await this.recordTimelineEvent(
      orderId,
      'RETURN_CREATED',
      `Return requested for ${returnData.items.length} items. Reason: ${returnRecord.reason}`,
      requestedBy,
      { returnId: returnRecord.id, reason: returnRecord.reason }
    );
    await this.syncPaymentRecord(orderId);

    this.setIdempotency(idempotencyKey, returnRecord);
    return returnRecord;
  }

  // 11. CREATE REVERSE SHIPMENT
  async createReverseShipment(
    returnId: string,
    reverseData: ReverseShipmentRecord,
    createdBy?: string,
    idempotencyKey?: string
  ): Promise<ReturnRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const allReturns = await this.db.getCollectionDocs('order_returns');
    const returnRecord = allReturns.find((r) => String(r.id) === String(returnId) || String(r.returnId) === String(returnId));
    if (!returnRecord) {
      throw new Error(`Return record '${returnId}' not found.`);
    }

    const now = new Date().toISOString();
    returnRecord.reverseShipment = reverseData;
    returnRecord.status = 'REVERSE_SHIPMENT_CREATED';
    returnRecord.updatedAt = now;

    await this.db.saveCollectionDoc('order_returns', returnRecord);
    await this.recordTimelineEvent(
      returnRecord.orderId,
      'REVERSE_SHIPMENT_CREATED',
      `Reverse shipment created with tracking ${reverseData.trackingNumber} via ${reverseData.courierAgency}`,
      createdBy,
      { returnId: returnRecord.id, reverseTracking: reverseData.trackingNumber }
    );
    await this.syncPaymentRecord(returnRecord.orderId);

    this.setIdempotency(idempotencyKey, returnRecord);
    return returnRecord;
  }

  // 12. CONFIRM RETURN RECEIVED
  async confirmReturnReceived(returnId: string, receivedBy?: string, idempotencyKey?: string): Promise<ReturnRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const allReturns = await this.db.getCollectionDocs('order_returns');
    const returnRecord = allReturns.find((r) => String(r.id) === String(returnId) || String(r.returnId) === String(returnId));
    if (!returnRecord) {
      throw new Error(`Return record '${returnId}' not found.`);
    }

    const now = new Date().toISOString();
    returnRecord.status = 'RECEIVED';
    returnRecord.receivedAt = now;
    returnRecord.receivedBy = receivedBy || 'Warehouse Staff';
    returnRecord.updatedAt = now;

    await this.db.saveCollectionDoc('order_returns', returnRecord);
    await this.recordTimelineEvent(
      returnRecord.orderId,
      'RETURN_RECEIVED',
      `Return items received in warehouse`,
      receivedBy,
      { returnId: returnRecord.id }
    );
    await this.syncPaymentRecord(returnRecord.orderId);

    this.setIdempotency(idempotencyKey, returnRecord);
    return returnRecord;
  }

  // 13. RESOLVE RETURN
  async resolveReturn(
    returnId: string,
    resolution: 'REFUND' | 'REPLACEMENT' | 'REJECTED',
    notes?: string,
    resolvedBy?: string,
    idempotencyKey?: string
  ): Promise<ReturnRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const allReturns = await this.db.getCollectionDocs('order_returns');
    const returnRecord = allReturns.find((r) => String(r.id) === String(returnId) || String(r.returnId) === String(returnId));
    if (!returnRecord) {
      throw new Error(`Return record '${returnId}' not found.`);
    }

    const now = new Date().toISOString();
    returnRecord.resolution = resolution;
    returnRecord.resolutionNotes = notes;
    returnRecord.status = resolution === 'REFUND' ? 'REFUNDED' : resolution === 'REPLACEMENT' ? 'REPLACED' : 'REJECTED';
    returnRecord.updatedAt = now;

    await this.db.saveCollectionDoc('order_returns', returnRecord);
    await this.updateFulfilmentStatus(returnRecord.orderId, 'COMPLETED');
    await this.recordTimelineEvent(
      returnRecord.orderId,
      'RETURN_RESOLVED',
      `Return resolved with action: ${resolution}`,
      resolvedBy,
      { returnId: returnRecord.id, resolution, notes }
    );
    await this.syncPaymentRecord(returnRecord.orderId);
    await this.triggerStageNotifications('Process Return', returnRecord.orderId, { returnId: returnRecord.id, resolution });

    this.setIdempotency(idempotencyKey, returnRecord);
    return returnRecord;
  }
}


