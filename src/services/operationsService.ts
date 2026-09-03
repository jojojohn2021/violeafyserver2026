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

  // 4. PACKING - START PACKING
  async startPacking(orderId: string, packerId?: string, idempotencyKey?: string): Promise<PackingRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const details = await this.getOrderDetails(orderId);
    const order = details.order;

    if (details.fulfilment.status !== 'NOT_STARTED' && details.fulfilment.status !== 'PACKING') {
      throw new Error(`Cannot start packing for order in state '${details.fulfilment.status}'`);
    }

    const existingPackings = await this.db.getCollectionDocs('order_packing');
    let packing = existingPackings.find((p) => String(p.orderId) === String(orderId));

    const now = new Date().toISOString();
    const items: PackingItemVerification[] = (order.products || []).map((p: any) => ({
      productId: p.productId || p.id || 'item',
      quantity: p.quantity || 1,
      packedQuantity: p.quantity || 1,
      verified: true,
    }));

    if (!packing) {
      packing = {
        id: this.generateId('pck'),
        orderId,
        status: 'PACKING',
        startedAt: now,
        packedBy: packerId || 'Warehouse Staff',
        items,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      packing.status = 'PACKING';
      packing.updatedAt = now;
      if (packerId) packing.packedBy = packerId;
    }

    await this.db.saveCollectionDoc('order_packing', packing);
    await this.updateFulfilmentStatus(orderId, 'PACKING', { packingId: packing.id });
    await this.recordTimelineEvent(orderId, 'PACKING_STARTED', `Packing started by ${packerId || 'Warehouse Staff'}`, packerId);
    await this.syncPaymentRecord(orderId);

    this.setIdempotency(idempotencyKey, packing);
    return packing;
  }

  // 5. PACKING - COMPLETE PACKING
  async completePacking(orderId: string, packerId?: string, notes?: string, idempotencyKey?: string): Promise<PackingRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const details = await this.getOrderDetails(orderId);
    if (details.fulfilment.status === 'PACKED' || details.fulfilment.status === 'READY_FOR_DISPATCH') {
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
        status: 'PACKED',
        startedAt: now,
        completedAt: now,
        packedBy: packerId || 'Warehouse Staff',
        items,
        notes,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      packing.status = 'PACKED';
      packing.completedAt = now;
      if (notes) packing.notes = notes;
      if (packerId) packing.packedBy = packerId;
      packing.updatedAt = now;
    }

    await this.db.saveCollectionDoc('order_packing', packing);
    await this.updateFulfilmentStatus(orderId, 'PACKED', { packingId: packing.id });
    await this.recordTimelineEvent(orderId, 'PACKING_COMPLETED', `Packing completed by ${packerId || 'Warehouse Staff'}`, packerId, { notes });
    await this.syncPaymentRecord(orderId);

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

    await this.getOrderDetails(orderId);
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

    await this.db.saveCollectionDoc('order_brand_assignments', record);
    await this.recordTimelineEvent(
      orderId,
      'BRAND_OWNER_ASSIGNED',
      `Assigned brand owners for ${assignments.length} order items`,
      assignedBy,
      { assignments: formattedAssignments }
    );
    await this.syncPaymentRecord(orderId);

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

    this.setIdempotency(idempotencyKey, returnRecord);
    return returnRecord;
  }

  // 14. PAYMENT REMINDER
  async sendPaymentReminder(orderId: string, sentBy?: string, idempotencyKey?: string): Promise<PaymentReminderRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const details = await this.getOrderDetails(orderId);
    const order = details.order;

    if (order.paymentStatus === 'Paid') {
      throw new Error(`Order '${order.orderNumber || orderId}' is already paid.`);
    }

    const now = new Date().toISOString();
    const reminder: PaymentReminderRecord = {
      id: this.generateId('pmr'),
      orderId,
      type: 'STANDARD',
      sentAt: now,
      status: 'SENT',
    };

    await this.db.saveCollectionDoc('payment_reminders', reminder);
    await this.recordTimelineEvent(
      orderId,
      'PAYMENT_REMINDER_SENT',
      `Standard payment reminder sent for order ${order.orderNumber || orderId}`,
      sentBy,
      { reminderId: reminder.id }
    );

    this.setIdempotency(idempotencyKey, reminder);
    return reminder;
  }

  // 15. WHATSAPP PAYMENT REMINDER
  async sendWhatsAppPaymentReminder(
    orderId: string,
    phoneOverride?: string,
    sentBy?: string,
    idempotencyKey?: string
  ): Promise<PaymentReminderRecord> {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const details = await this.getOrderDetails(orderId);
    const order = details.order;

    if (order.paymentStatus === 'Paid') {
      throw new Error(`Order '${order.orderNumber || orderId}' is already paid.`);
    }

    const targetPhone = phoneOverride || order.contactNo || order.customerPhone || 'Customer Mobile';
    const now = new Date().toISOString();
    const messageId = `wa_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const reminder: PaymentReminderRecord = {
      id: this.generateId('wpr'),
      orderId,
      type: 'WHATSAPP',
      sentAt: now,
      sentToPhone: targetPhone,
      status: 'SENT',
      messageId,
    };

    // Save to isolated payment_reminders and log outgoing whatsapp message
    await this.db.saveCollectionDoc('payment_reminders', reminder);
    await this.db.saveCollectionDoc('whatsapp_messages', {
      id: messageId,
      phone: targetPhone,
      direction: 'Outgoing',
      content: `Hello ${order.customerName || 'Valued Customer'}, this is a reminder regarding your pending order #${
        order.orderNumber || orderId
      } total Rs ${order.totalValue || 0}. Please complete payment using your payment link.`,
      timestamp: now,
      status: 'sent',
      templateName: 'PaymentReminder',
    });

    await this.recordTimelineEvent(
      orderId,
      'WHATSAPP_PAYMENT_REMINDER_SENT',
      `WhatsApp payment reminder dispatched to ${targetPhone}`,
      sentBy,
      { reminderId: reminder.id, messageId }
    );

    this.setIdempotency(idempotencyKey, reminder);
    return reminder;
  }
}
