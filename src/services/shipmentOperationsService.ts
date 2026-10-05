import {
  ShipmentBrandOwnerAssignment,
  ShipmentPacking,
  ShipmentShipment,
  ShipmentDelivery,
  ShipmentReturn,
  OperationalFilterParams,
  PaginatedResult,
  OrderLifecycleResponse,
  StatusHistoryEntry,
  BrandOwnerAssignmentStatus,
  PackingStatus,
  ShipmentStatus,
  DeliveryStatus,
  ReturnStatus,
} from '../types/shipmentOperations';

export interface DataAccessor {
  getCollectionDocs: (collection: string) => Promise<any[]>;
  saveCollectionDoc: (collection: string, item: any) => Promise<void>;
  deleteCollectionDoc?: (collection: string, id: string) => Promise<void>;
}

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

function matchesOrderId(order: any, targetId: string): boolean {
  if (!order || !targetId) return false;
  const targetStr = String(targetId).trim().toLowerCase();
  const targetClean = targetStr.replace(/^#/, '');
  const oIdStr = String(order.id || '').trim().toLowerCase();
  const oIdClean = oIdStr.replace(/^#/, '');
  const oNumStr = String(order.orderNumber || '').trim().toLowerCase();
  const oNumClean = oNumStr.replace(/^#/, '');

  return targetStr === oIdStr ||
         targetStr === oNumStr ||
         targetClean === oIdClean ||
         targetClean === oNumClean;
}

export class ShipmentOperationsService {
  constructor(private db: DataAccessor) {}

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // --- Helper: Verify salesOrderId & Extract order info ---
  private async getSalesOrderInfo(salesOrderId: string): Promise<{
    salesOrder: any;
    invoiceId: string;
    invoiceNumber: string;
  }> {
    const orders = await this.db.getCollectionDocs('sales_orders');
    const salesOrder = orders.find((o) => matchesOrderId(o, salesOrderId));
    if (!salesOrder) {
      throw new Error(`Sales Order '${salesOrderId}' not found.`);
    }

    const invoiceId = salesOrder.invoiceId || salesOrder.id;
    const invoiceNumber = salesOrder.invoiceNumber || salesOrder.orderNumber || `INV_${salesOrder.id}`;
    return { salesOrder, invoiceId: String(invoiceId), invoiceNumber: String(invoiceNumber) };
  }

  // --- Helper: Generic Server-Side Search, Filter & Pagination ---
  private paginateAndFilter<T extends Record<string, any>>(
    items: T[],
    filters: OperationalFilterParams = {}
  ): PaginatedResult<T> {
    let filtered = [...items];

    if (filters.salesOrderId) {
      const q = filters.salesOrderId.toLowerCase().trim();
      filtered = filtered.filter((i) => String(i.salesOrderId || '').toLowerCase().includes(q));
    }

    if (filters.invoiceId) {
      const q = filters.invoiceId.toLowerCase().trim();
      filtered = filtered.filter(
        (i) =>
          String(i.invoiceId || '').toLowerCase().includes(q) ||
          String(i.invoiceNumber || '').toLowerCase().includes(q)
      );
    }

    if (filters.itemId) {
      const q = filters.itemId.toLowerCase().trim();
      filtered = filtered.filter((i) => String(i.itemId || '').toLowerCase().includes(q));
    }

    if (filters.SKU) {
      const q = filters.SKU.toLowerCase().trim();
      filtered = filtered.filter((i) => String(i.sku || '').toLowerCase().includes(q));
    }

    if (filters.productName) {
      const q = filters.productName.toLowerCase().trim();
      filtered = filtered.filter((i) => String(i.productName || '').toLowerCase().includes(q));
    }

    if (filters.brandOwnerId) {
      const q = filters.brandOwnerId.toLowerCase().trim();
      filtered = filtered.filter(
        (i) =>
          String(i.brandOwnerId || '').toLowerCase().includes(q) ||
          String(i.brandOwnerName || '').toLowerCase().includes(q)
      );
    }

    if (filters.status) {
      const q = filters.status.toUpperCase().trim();
      filtered = filtered.filter((i) => String(i.status || '').toUpperCase() === q);
    }

    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      filtered = filtered.filter((i) => new Date(i.transactionDate || i.createdAt).getTime() >= from);
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime();
      filtered = filtered.filter((i) => new Date(i.transactionDate || i.createdAt).getTime() <= to);
    }

    const sortBy = filters.sortBy || 'updatedAt';
    const sortOrder = filters.sortOrder || 'desc';

    filtered.sort((a, b) => {
      const valA = new Date(a[sortBy] || a.createdAt || 0).getTime();
      const valB = new Date(b[sortBy] || b.createdAt || 0).getTime();
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    const page = Math.max(1, filters.page ? Number(filters.page) : 1);
    const limit = Math.min(50, Math.max(1, filters.limit ? Number(filters.limit) : 10));
    const totalRecords = filtered.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const startIndex = (page - 1) * limit;
    const records = filtered.slice(startIndex, startIndex + limit);

    return {
      success: true,
      records,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
        sortBy,
        sortOrder,
      },
    };
  }

  // ==========================================
  // 1. BRAND OWNER ASSIGNMENT APIs
  // Collection: shipment_brand_owner_assignments
  // ==========================================

  async listBrandOwnerAssignments(
    filters: OperationalFilterParams = {}
  ): Promise<PaginatedResult<ShipmentBrandOwnerAssignment>> {
    const docs = await this.db.getCollectionDocs('shipment_brand_owner_assignments');
    return this.paginateAndFilter<ShipmentBrandOwnerAssignment>(docs, filters);
  }

  async getBrandOwnerAssignmentById(id: string): Promise<ShipmentBrandOwnerAssignment> {
    const docs = await this.db.getCollectionDocs('shipment_brand_owner_assignments');
    const doc = docs.find((d) => String(d.id) === String(id));
    if (!doc) {
      throw new Error(`Brand Owner Assignment record '${id}' not found.`);
    }
    return doc;
  }

  async createBrandOwnerAssignment(
    payload: {
      salesOrderId: string;
      itemId: string;
      brandOwnerId: string;
      brandOwnerName?: string;
      productId?: string;
      sku?: string;
      productName?: string;
      quantity?: number;
      notes?: string;
      courier?: string;
      docketno?: string;
      pickupdate?: string;
    },
    createdBy: string = 'System'
  ): Promise<ShipmentBrandOwnerAssignment> {
    const { salesOrder, invoiceId, invoiceNumber } = await this.getSalesOrderInfo(payload.salesOrderId);
    const now = new Date().toISOString();

    const existingDocs: ShipmentBrandOwnerAssignment[] = await this.db.getCollectionDocs(
      'shipment_brand_owner_assignments'
    );
    const active = existingDocs.find(
      (d) =>
        String(d.salesOrderId) === String(payload.salesOrderId) &&
        String(d.itemId) === String(payload.itemId) &&
        d.status === 'ASSIGNED'
    );

    if (active) {
      if (String(active.brandOwnerId) === String(payload.brandOwnerId)) {
        return active; // Duplicate suppression / idempotency
      }
      // Reassign rule: Cancel existing assignment, create new ASSIGNED record atomically
      return this.reassignBrandOwner(active.id, payload, createdBy);
    }

    const itemMatch = (salesOrder.products || []).find(
      (p: any) => String(p.productId || p.id) === String(payload.productId || payload.itemId)
    );

    const initialHistory: StatusHistoryEntry[] = [
      {
        fromStatus: null,
        toStatus: 'ASSIGNED',
        transactionDate: now,
        performedBy: createdBy,
        reason: 'Initial Brand Owner Assignment',
      },
    ];

    const record: ShipmentBrandOwnerAssignment = {
      id: this.generateId('boa'),
      salesOrderId: String(payload.salesOrderId),
      invoiceId,
      invoiceNumber,
      itemId: String(payload.itemId),
      productId: payload.productId || itemMatch?.productId || payload.itemId,
      sku: payload.sku || itemMatch?.sku || '',
      productName: payload.productName || itemMatch?.productName || itemMatch?.name || 'Item',
      quantity: payload.quantity || itemMatch?.quantity || 1,
      brandOwnerId: String(payload.brandOwnerId),
      brandOwnerName: payload.brandOwnerName || '',
      status: 'ASSIGNED',
      notes: payload.notes,
      courier: payload.courier,
      docketno: payload.docketno,
      pickupdate: payload.pickupdate,
      transactionDate: now,
      createdAt: now,
      updatedAt: now,
      createdBy,
      statusHistory: initialHistory,
    };

    try {
      await this.db.saveCollectionDoc('shipment_brand_owner_assignments', sanitizeFirestorePayload(record));
      console.log(`[VIO-FIRESTORE] Record inserted successfully in table: shipment_brand_owner_assignments (ID: ${record.id})`);
      return record;
    } catch (err: any) {
      console.error(`[VIO-FIRESTORE] Failed to insert record into table shipment_brand_owner_assignments:`, err);
      throw new Error(`Failed to insert record into table shipment_brand_owner_assignments: ${err?.message || err}`);
    }
  }

  // REASSIGNMENT RULE (Section 8, 9 & Key Business Rule)
  async reassignBrandOwner(
    existingAssignmentId: string,
    newPayload: {
      brandOwnerId: string;
      brandOwnerName?: string;
      notes?: string;
      courier?: string;
      docketno?: string;
      pickupdate?: string;
    },
    updatedBy: string = 'System'
  ): Promise<ShipmentBrandOwnerAssignment> {
    const existing = await this.getBrandOwnerAssignmentById(existingAssignmentId);
    if (existing.status === 'CANCELLED') {
      throw new Error(`Cannot reassign a CANCELLED brand owner assignment '${existingAssignmentId}'`);
    }

    const now = new Date().toISOString();

    // 1. Mark existing assignment CANCELLED
    existing.status = 'CANCELLED';
    existing.updatedAt = now;
    existing.updatedBy = updatedBy;
    existing.statusHistory = [
      ...(existing.statusHistory || []),
      {
        fromStatus: 'ASSIGNED',
        toStatus: 'CANCELLED',
        transactionDate: now,
        performedBy: updatedBy,
        reason: `Reassigned to Brand Owner ID ${newPayload.brandOwnerId}`,
      },
    ];
    await this.db.saveCollectionDoc('shipment_brand_owner_assignments', sanitizeFirestorePayload(existing));

    // 2. Create new assignment record as ASSIGNED
    const newHistory: StatusHistoryEntry[] = [
      {
        fromStatus: null,
        toStatus: 'ASSIGNED',
        transactionDate: now,
        performedBy: updatedBy,
        reason: `Reassigned from Brand Owner ID ${existing.brandOwnerId}`,
      },
    ];

    const newRecord: ShipmentBrandOwnerAssignment = {
      id: this.generateId('boa'),
      salesOrderId: existing.salesOrderId,
      invoiceId: existing.invoiceId,
      invoiceNumber: existing.invoiceNumber,
      itemId: existing.itemId,
      productId: existing.productId,
      sku: existing.sku,
      productName: existing.productName,
      quantity: existing.quantity,
      brandOwnerId: String(newPayload.brandOwnerId),
      brandOwnerName: newPayload.brandOwnerName || '',
      status: 'ASSIGNED',
      notes: newPayload.notes || existing.notes,
      courier: newPayload.courier || existing.courier,
      docketno: newPayload.docketno || existing.docketno,
      pickupdate: newPayload.pickupdate || existing.pickupdate,
      transactionDate: now,
      createdAt: now,
      updatedAt: now,
      createdBy: updatedBy,
      statusHistory: newHistory,
    };

    try {
      await this.db.saveCollectionDoc('shipment_brand_owner_assignments', sanitizeFirestorePayload(newRecord));
      console.log(`[VIO-FIRESTORE] Record inserted successfully in table: shipment_brand_owner_assignments (ID: ${newRecord.id})`);
      return newRecord;
    } catch (err: any) {
      console.error(`[VIO-FIRESTORE] Failed to insert record into table shipment_brand_owner_assignments:`, err);
      throw new Error(`Failed to insert record into table shipment_brand_owner_assignments: ${err?.message || err}`);
    }
  }

  async getBrandOwnerAssignmentHistory(id: string): Promise<StatusHistoryEntry[]> {
    const record = await this.getBrandOwnerAssignmentById(id);
    return record.statusHistory || [];
  }

  // ==========================================
  // 2. PACKING APIs
  // Collection: shipment_packing
  // ==========================================

  async listPacking(filters: OperationalFilterParams = {}): Promise<PaginatedResult<ShipmentPacking>> {
    const docs = await this.db.getCollectionDocs('shipment_packing');
    return this.paginateAndFilter<ShipmentPacking>(docs, filters);
  }

  async getPackingById(id: string): Promise<ShipmentPacking> {
    const docs = await this.db.getCollectionDocs('shipment_packing');
    const doc = docs.find((d) => String(d.id) === String(id));
    if (!doc) {
      throw new Error(`Packing record '${id}' not found.`);
    }
    return doc;
  }

  async createPacking(
    payload: {
      salesOrderId: string;
      itemId?: string;
      packedBy?: string;
      notes?: string;
      items?: any[];
      status?: PackingStatus;
    },
    createdBy: string = 'System'
  ): Promise<ShipmentPacking> {
    const { salesOrder, invoiceId, invoiceNumber } = await this.getSalesOrderInfo(payload.salesOrderId);

    // Prerequisite Validation: Packing cannot be completed without a valid active Brand Owner assignment
    const assignments: ShipmentBrandOwnerAssignment[] = await this.db.getCollectionDocs(
      'shipment_brand_owner_assignments'
    );
    const activeAssignments = assignments.filter(
      (a) => String(a.salesOrderId) === String(payload.salesOrderId) && a.status === 'ASSIGNED'
    );

    if (activeAssignments.length === 0) {
      throw new Error(
        `Packing cannot be performed for Sales Order '${payload.salesOrderId}' without a valid active Brand Owner assignment.`
      );
    }

    const now = new Date().toISOString();
    const initialStatus: PackingStatus = payload.status || 'PACKING';

    const initialHistory: StatusHistoryEntry[] = [
      {
        fromStatus: null,
        toStatus: initialStatus,
        transactionDate: now,
        performedBy: createdBy,
        reason: 'Packing Record Created',
      },
    ];

    const record: ShipmentPacking = {
      id: this.generateId('pck'),
      salesOrderId: String(payload.salesOrderId),
      invoiceId,
      invoiceNumber,
      itemId: payload.itemId,
      packedBy: payload.packedBy || createdBy,
      notes: payload.notes,
      items: payload.items || salesOrder.products || [],
      status: initialStatus,
      transactionDate: now,
      createdAt: now,
      updatedAt: now,
      createdBy,
      statusHistory: initialHistory,
    };

    await this.db.saveCollectionDoc('shipment_packing', sanitizeFirestorePayload(record));
    return record;
  }

  async updatePacking(
    id: string,
    update: { status?: PackingStatus; notes?: string; packedBy?: string },
    updatedBy: string = 'System'
  ): Promise<ShipmentPacking> {
    const record = await this.getPackingById(id);
    const now = new Date().toISOString();

    if (update.status && update.status !== record.status) {
      record.statusHistory.push({
        fromStatus: record.status,
        toStatus: update.status,
        transactionDate: now,
        performedBy: updatedBy,
        reason: update.notes || 'Packing Status Updated',
      });
      record.status = update.status;
    }

    if (update.notes) record.notes = update.notes;
    if (update.packedBy) record.packedBy = update.packedBy;
    record.updatedAt = now;
    record.updatedBy = updatedBy;

    await this.db.saveCollectionDoc('shipment_packing', sanitizeFirestorePayload(record));
    return record;
  }

  async getPackingHistory(id: string): Promise<StatusHistoryEntry[]> {
    const record = await this.getPackingById(id);
    return record.statusHistory || [];
  }

  // ==========================================
  // 3. SHIPMENT APIs
  // Collection: shipment_shipments
  // ==========================================

  async listShipments(filters: OperationalFilterParams = {}): Promise<PaginatedResult<ShipmentShipment>> {
    const docs = await this.db.getCollectionDocs('shipment_shipments');
    return this.paginateAndFilter<ShipmentShipment>(docs, filters);
  }

  async getShipmentById(id: string): Promise<ShipmentShipment> {
    const docs = await this.db.getCollectionDocs('shipment_shipments');
    const doc = docs.find((d) => String(d.id) === String(id));
    if (!doc) {
      throw new Error(`Shipment record '${id}' not found.`);
    }
    return doc;
  }

  async createShipment(
    payload: {
      salesOrderId: string;
      courierAgency?: string;
      trackingNumber?: string;
      expectedDeliveryDate?: string;
      packageCount?: number;
      weightKg?: number;
      status?: ShipmentStatus;
    },
    createdBy: string = 'System'
  ): Promise<ShipmentShipment> {
    const { salesOrder, invoiceId, invoiceNumber } = await this.getSalesOrderInfo(payload.salesOrderId);

    // Prerequisite Validation: Shipment creation requires a valid packing state
    const packings: ShipmentPacking[] = await this.db.getCollectionDocs('shipment_packing');
    const validPacking = packings.find(
      (p) =>
        String(p.salesOrderId) === String(payload.salesOrderId) &&
        (p.status === 'PACKING' || p.status === 'PARTIALLY_PACKED')
    );

    if (!validPacking) {
      throw new Error(
        `Shipment creation for Sales Order '${payload.salesOrderId}' requires a valid packing state (PACKING or PARTIALLY_PACKED).`
      );
    }

    const now = new Date().toISOString();
    const initialStatus: ShipmentStatus = payload.status || 'SHIPPED';

    const initialHistory: StatusHistoryEntry[] = [
      {
        fromStatus: null,
        toStatus: initialStatus,
        transactionDate: now,
        performedBy: createdBy,
        reason: 'Shipment Created',
      },
    ];

    const record: ShipmentShipment = {
      id: this.generateId('shp'),
      salesOrderId: String(payload.salesOrderId),
      invoiceId,
      invoiceNumber,
      courierAgency: payload.courierAgency || 'Default Logistics',
      trackingNumber: payload.trackingNumber || `TRK_${Date.now().toString().slice(-8)}`,
      expectedDeliveryDate: payload.expectedDeliveryDate,
      packageCount: payload.packageCount || 1,
      weightKg: payload.weightKg || 0.5,
      status: initialStatus,
      transactionDate: now,
      createdAt: now,
      updatedAt: now,
      createdBy,
      statusHistory: initialHistory,
    };

    await this.db.saveCollectionDoc('shipment_shipments', sanitizeFirestorePayload(record));
    return record;
  }

  async updateShipment(
    id: string,
    update: { status?: ShipmentStatus; courierAgency?: string; trackingNumber?: string },
    updatedBy: string = 'System'
  ): Promise<ShipmentShipment> {
    const record = await this.getShipmentById(id);
    const now = new Date().toISOString();

    if (update.status && update.status !== record.status) {
      record.statusHistory.push({
        fromStatus: record.status,
        toStatus: update.status,
        transactionDate: now,
        performedBy: updatedBy,
        reason: 'Shipment Status Updated',
      });
      record.status = update.status;
    }

    if (update.courierAgency) record.courierAgency = update.courierAgency;
    if (update.trackingNumber) record.trackingNumber = update.trackingNumber;
    record.updatedAt = now;
    record.updatedBy = updatedBy;

    await this.db.saveCollectionDoc('shipment_shipments', sanitizeFirestorePayload(record));
    return record;
  }

  async getShipmentHistory(id: string): Promise<StatusHistoryEntry[]> {
    const record = await this.getShipmentById(id);
    return record.statusHistory || [];
  }

  // ==========================================
  // 4. DELIVERY APIs
  // Collection: shipment_deliveries
  // ==========================================

  async listDeliveries(filters: OperationalFilterParams = {}): Promise<PaginatedResult<ShipmentDelivery>> {
    const docs = await this.db.getCollectionDocs('shipment_deliveries');
    return this.paginateAndFilter<ShipmentDelivery>(docs, filters);
  }

  async getDeliveryById(id: string): Promise<ShipmentDelivery> {
    const docs = await this.db.getCollectionDocs('shipment_deliveries');
    const doc = docs.find((d) => String(d.id) === String(id));
    if (!doc) {
      throw new Error(`Delivery record '${id}' not found.`);
    }
    return doc;
  }

  async createDelivery(
    payload: {
      salesOrderId: string;
      recipientName?: string;
      remarks?: string;
      proofOfDeliveryUrl?: string;
      status?: DeliveryStatus;
    },
    createdBy: string = 'System'
  ): Promise<ShipmentDelivery> {
    const { salesOrder, invoiceId, invoiceNumber } = await this.getSalesOrderInfo(payload.salesOrderId);

    // Prerequisite Validation: Delivery confirmation requires a valid shipment
    const shipments: ShipmentShipment[] = await this.db.getCollectionDocs('shipment_shipments');
    const validShipment = shipments.find(
      (s) => String(s.salesOrderId) === String(payload.salesOrderId) && s.status === 'SHIPPED'
    );

    if (!validShipment) {
      throw new Error(
        `Delivery confirmation for Sales Order '${payload.salesOrderId}' requires a valid shipped shipment.`
      );
    }

    const now = new Date().toISOString();
    const initialStatus: DeliveryStatus = payload.status || 'DELIVERED';

    const initialHistory: StatusHistoryEntry[] = [
      {
        fromStatus: null,
        toStatus: initialStatus,
        transactionDate: now,
        performedBy: createdBy,
        reason: 'Delivery Record Created',
      },
    ];

    const record: ShipmentDelivery = {
      id: this.generateId('del'),
      salesOrderId: String(payload.salesOrderId),
      invoiceId,
      invoiceNumber,
      recipientName: payload.recipientName || salesOrder.customerName || 'Customer',
      remarks: payload.remarks,
      proofOfDeliveryUrl: payload.proofOfDeliveryUrl,
      status: initialStatus,
      transactionDate: now,
      createdAt: now,
      updatedAt: now,
      createdBy,
      statusHistory: initialHistory,
    };

    await this.db.saveCollectionDoc('shipment_deliveries', sanitizeFirestorePayload(record));
    return record;
  }

  async updateDelivery(
    id: string,
    update: { status?: DeliveryStatus; remarks?: string; recipientName?: string },
    updatedBy: string = 'System'
  ): Promise<ShipmentDelivery> {
    const record = await this.getDeliveryById(id);
    const now = new Date().toISOString();

    if (update.status && update.status !== record.status) {
      record.statusHistory.push({
        fromStatus: record.status,
        toStatus: update.status,
        transactionDate: now,
        performedBy: updatedBy,
        reason: update.remarks || 'Delivery Status Updated',
      });
      record.status = update.status;
    }

    if (update.remarks) record.remarks = update.remarks;
    if (update.recipientName) record.recipientName = update.recipientName;
    record.updatedAt = now;
    record.updatedBy = updatedBy;

    await this.db.saveCollectionDoc('shipment_deliveries', sanitizeFirestorePayload(record));
    return record;
  }

  async getDeliveryHistory(id: string): Promise<StatusHistoryEntry[]> {
    const record = await this.getDeliveryById(id);
    return record.statusHistory || [];
  }

  // ==========================================
  // 5. RETURN APIs
  // Collection: shipment_returns
  // ==========================================

  async listReturns(filters: OperationalFilterParams = {}): Promise<PaginatedResult<ShipmentReturn>> {
    const docs = await this.db.getCollectionDocs('shipment_returns');
    return this.paginateAndFilter<ShipmentReturn>(docs, filters);
  }

  async getReturnById(id: string): Promise<ShipmentReturn> {
    const docs = await this.db.getCollectionDocs('shipment_returns');
    const doc = docs.find((d) => String(d.id) === String(id));
    if (!doc) {
      throw new Error(`Return record '${id}' not found.`);
    }
    return doc;
  }

  async createReturn(
    payload: {
      salesOrderId: string;
      reason?: string;
      notes?: string;
      resolution?: 'REFUND' | 'REPLACEMENT' | 'REJECTED';
      status?: ReturnStatus;
    },
    createdBy: string = 'System'
  ): Promise<ShipmentReturn> {
    const { salesOrder, invoiceId, invoiceNumber } = await this.getSalesOrderInfo(payload.salesOrderId);
    const now = new Date().toISOString();
    const initialStatus: ReturnStatus = payload.status || 'RETURN_REQUESTED';

    const initialHistory: StatusHistoryEntry[] = [
      {
        fromStatus: null,
        toStatus: initialStatus,
        transactionDate: now,
        performedBy: createdBy,
        reason: 'Return Requested',
      },
    ];

    const record: ShipmentReturn = {
      id: this.generateId('ret'),
      salesOrderId: String(payload.salesOrderId),
      invoiceId,
      invoiceNumber,
      reason: payload.reason || 'DAMAGED',
      notes: payload.notes,
      resolution: payload.resolution,
      status: initialStatus,
      transactionDate: now,
      createdAt: now,
      updatedAt: now,
      createdBy,
      statusHistory: initialHistory,
    };

    await this.db.saveCollectionDoc('shipment_returns', sanitizeFirestorePayload(record));
    return record;
  }

  async updateReturn(
    id: string,
    update: { status?: ReturnStatus; resolution?: 'REFUND' | 'REPLACEMENT' | 'REJECTED'; notes?: string },
    updatedBy: string = 'System'
  ): Promise<ShipmentReturn> {
    const record = await this.getReturnById(id);
    const now = new Date().toISOString();

    if (update.status && update.status !== record.status) {
      record.statusHistory.push({
        fromStatus: record.status,
        toStatus: update.status,
        transactionDate: now,
        performedBy: updatedBy,
        reason: update.notes || 'Return Status Updated',
      });
      record.status = update.status;
    }

    if (update.resolution) record.resolution = update.resolution;
    if (update.notes) record.notes = update.notes;
    record.updatedAt = now;
    record.updatedBy = updatedBy;

    await this.db.saveCollectionDoc('shipment_returns', sanitizeFirestorePayload(record));
    return record;
  }

  async getReturnHistory(id: string): Promise<StatusHistoryEntry[]> {
    const record = await this.getReturnById(id);
    return record.statusHistory || [];
  }

  // ==========================================
  // GENERAL CANCELLATION API (Section 14, 22)
  // ==========================================

  async cancelOperationalRecord(
    collectionName: 'brand-owner' | 'packing' | 'shipment' | 'delivery' | 'return',
    id: string,
    cancelledBy: string = 'System',
    reason: string = 'Cancelled by Operator'
  ): Promise<any> {
    const colMap: Record<string, string> = {
      'brand-owner': 'shipment_brand_owner_assignments',
      packing: 'shipment_packing',
      shipment: 'shipment_shipments',
      delivery: 'shipment_deliveries',
      return: 'shipment_returns',
    };

    const targetCol = colMap[collectionName];
    if (!targetCol) throw new Error(`Invalid operational domain '${collectionName}'`);

    const docs = await this.db.getCollectionDocs(targetCol);
    const record = docs.find((d) => String(d.id) === String(id));
    if (!record) throw new Error(`Record '${id}' not found in '${collectionName}'`);

    if (record.status === 'CANCELLED') {
      return record;
    }

    const now = new Date().toISOString();
    const prevStatus = record.status;
    record.status = 'CANCELLED';
    record.updatedAt = now;
    record.updatedBy = cancelledBy;
    record.statusHistory = [
      ...(record.statusHistory || []),
      {
        fromStatus: prevStatus,
        toStatus: 'CANCELLED',
        transactionDate: now,
        performedBy: cancelledBy,
        reason,
      },
    ];

    await this.db.saveCollectionDoc(targetCol, sanitizeFirestorePayload(record));
    return record;
  }

  // ==========================================
  // 6. AGGREGATED LIFECYCLE APIs (Section 27-29)
  // ==========================================

  async getOrderLifecycle(salesOrderId: string): Promise<OrderLifecycleResponse> {
    const { salesOrder, invoiceId } = await this.getSalesOrderInfo(salesOrderId);

    const [assignments, packings, shipments, deliveries, returns] = await Promise.all([
      this.db.getCollectionDocs('shipment_brand_owner_assignments'),
      this.db.getCollectionDocs('shipment_packing'),
      this.db.getCollectionDocs('shipment_shipments'),
      this.db.getCollectionDocs('shipment_deliveries'),
      this.db.getCollectionDocs('shipment_returns'),
    ]);

    const orderAssignments: ShipmentBrandOwnerAssignment[] = assignments.filter(
      (a) => String(a.salesOrderId) === String(salesOrderId)
    );
    const orderPackings: ShipmentPacking[] = packings.filter(
      (p) => String(p.salesOrderId) === String(salesOrderId)
    );
    const orderShipments: ShipmentShipment[] = shipments.filter(
      (s) => String(s.salesOrderId) === String(salesOrderId)
    );
    const orderDeliveries: ShipmentDelivery[] = deliveries.filter(
      (d) => String(d.salesOrderId) === String(salesOrderId)
    );
    const orderReturns: ShipmentReturn[] = returns.filter(
      (r) => String(r.salesOrderId) === String(salesOrderId)
    );

    const activeAssignments = orderAssignments.filter((a) => a.status === 'ASSIGNED');
    const latestPacking = orderPackings.find((p) => p.status !== 'CANCELLED');
    const latestShipment = orderShipments.find((s) => s.status !== 'CANCELLED');
    const latestDelivery = orderDeliveries.find((d) => d.status !== 'CANCELLED');
    const latestReturn = orderReturns.find((r) => r.status !== 'CANCELLED');

    const products = salesOrder.products || [];
    const assignmentStatus =
      activeAssignments.length === 0
        ? 'NOT_STARTED'
        : activeAssignments.length >= products.length
        ? 'COMPLETED'
        : 'PARTIAL';

    const packingStatus = latestPacking ? latestPacking.status : 'NOT_STARTED';
    const shipmentStatus = latestShipment ? latestShipment.status : 'NOT_STARTED';
    const deliveryStatus = latestDelivery ? latestDelivery.status : 'NOT_STARTED';
    const returnStatus = latestReturn ? latestReturn.status : 'NOT_STARTED';

    const items = products.map((prod: any, idx: number) => {
      const pId = String(prod.productId || prod.id || `p_${idx}`);
      const itemKey = `item_${prod.productId || prod.id || idx}`;

      const itemAssignments = orderAssignments.filter(
        (a) => String(a.productId) === pId || a.itemId === itemKey
      );
      const activeItemAssignment = itemAssignments.find((a) => a.status === 'ASSIGNED');

      return {
        itemId: itemKey,
        productId: pId,
        productName: prod.productName || prod.name || `Item ${idx + 1}`,
        activeBrandOwner: activeItemAssignment
          ? {
              brandOwnerId: activeItemAssignment.brandOwnerId,
              brandOwnerName: activeItemAssignment.brandOwnerName,
              assignedAt: activeItemAssignment.transactionDate,
            }
          : undefined,
        brandOwnerHistory: itemAssignments,
        packing: latestPacking,
        shipment: latestShipment,
        delivery: latestDelivery,
        returns: orderReturns.filter((r) => r.itemId === itemKey || !r.itemId),
      };
    });

    return {
      salesOrderId: String(salesOrderId),
      invoiceId,
      summary: {
        assignmentStatus,
        packingStatus,
        shipmentStatus,
        deliveryStatus,
        returnStatus,
      },
      items,
      history: {
        assignments: orderAssignments,
        packings: orderPackings,
        shipments: orderShipments,
        deliveries: orderDeliveries,
        returns: orderReturns,
      },
    };
  }

  async getInvoiceLifecycle(invoiceId: string): Promise<any> {
    const orders = await this.db.getCollectionDocs('sales_orders');
    const matchingOrders = orders.filter(
      (o) => String(o.invoiceId) === String(invoiceId) || String(o.invoiceNumber) === String(invoiceId) || String(o.id) === String(invoiceId)
    );

    if (matchingOrders.length === 0) {
      throw new Error(`Invoice '${invoiceId}' not found.`);
    }

    const lifecycles = await Promise.all(
      matchingOrders.map((o) => this.getOrderLifecycle(o.id))
    );

    return {
      invoiceId,
      orderCount: matchingOrders.length,
      orders: lifecycles,
    };
  }

  async getBrandOwnerLifecycle(
    brandOwnerId: string,
    filters: OperationalFilterParams = {}
  ): Promise<{
    brandOwnerId: string;
    activeAssignments: ShipmentBrandOwnerAssignment[];
    historicalAssignments: ShipmentBrandOwnerAssignment[];
    totalAssignmentsCount: number;
  }> {
    const docs: ShipmentBrandOwnerAssignment[] = await this.db.getCollectionDocs(
      'shipment_brand_owner_assignments'
    );

    const matching = docs.filter(
      (d) =>
        String(d.brandOwnerId) === String(brandOwnerId) ||
        String(d.brandOwnerName).toLowerCase().includes(String(brandOwnerId).toLowerCase())
    );

    const activeAssignments = matching.filter((d) => d.status === 'ASSIGNED');
    const historicalAssignments = matching.filter((d) => d.status === 'CANCELLED');

    return {
      brandOwnerId,
      activeAssignments,
      historicalAssignments,
      totalAssignmentsCount: matching.length,
    };
  }

  // ITEM-WISE PACKING & 5-TABLE OPERATIONAL SYNC
  async syncPackingAndOperationalTables(
    salesOrderId: string,
    assignments: Array<{ orderItemId?: string; productId: string; brandOwnerId: string; brandOwnerName?: string }> = [],
    operator: string = 'Ops Manager',
    fulfilmentStatus: string = 'PACKING'
  ): Promise<{ success: boolean; salesOrder: any }> {
    const orders = await this.db.getCollectionDocs('sales_orders');
    const salesOrder = orders.find((o) => matchesOrderId(o, salesOrderId));
    if (!salesOrder) {
      throw new Error(`Sales Order '${salesOrderId}' not found.`);
    }

    const canonicalOrderId = String(salesOrder.id || salesOrderId);
    const invoiceId = String(salesOrder.invoiceId || salesOrder.id);
    const invoiceNumber = String(salesOrder.invoiceNumber || salesOrder.orderNumber || `INV_${salesOrder.id}`);
    const now = new Date().toISOString();

    // 1. Persist the selected fulfilment status on the sales order itself.
    salesOrder.deliveryStatus = fulfilmentStatus;
    salesOrder.updatedAt = now;
    await this.db.saveCollectionDoc('sales_orders', sanitizeFirestorePayload(salesOrder));

    const orderProducts = Array.isArray(salesOrder.products) ? salesOrder.products : [];

    let activeAssignmentsList = assignments || [];
    if (!activeAssignmentsList || activeAssignmentsList.length === 0) {
      const existingBrandDocs = await this.db.getCollectionDocs('order_brand_assignments');
      const bDoc = existingBrandDocs.find(
        (b) => matchesOrderId({ id: b.orderId, orderNumber: b.orderId }, salesOrderId) ||
               matchesOrderId({ id: b.orderId, orderNumber: b.orderId }, canonicalOrderId) ||
               String(b.id) === String(salesOrderId) || String(b.id) === canonicalOrderId
      );
      if (bDoc && Array.isArray(bDoc.assignments) && bDoc.assignments.length > 0) {
        activeAssignmentsList = bDoc.assignments;
      }
    }

    const products = orderProducts.length > 0
      ? orderProducts
      : activeAssignmentsList.map((assignment: any, idx: number) => ({
          id: assignment.productId || assignment.orderItemId || `p_${idx}`,
          productId: assignment.productId || assignment.orderItemId || `p_${idx}`,
          itemId: assignment.orderItemId,
          productName: assignment.productName,
          sku: assignment.sku,
          quantity: assignment.quantity,
        }));

    // 2. Item-wise update across the 5 tables:
    for (let idx = 0; idx < products.length; idx++) {
      const prod = products[idx];
      const pId = String(prod.productId || prod.id || `p_${idx}`);
      const itemKey = String(prod.itemId || `item_${prod.productId || prod.id || idx}`);

      const assignmentMatch = activeAssignmentsList.find(
        (a: any) => String(a.productId) === pId || a.orderItemId === itemKey
      );

      const brandOwnerId = String(assignmentMatch?.brandOwnerId || prod.brandOwnerId || 'brand_owner_default');
      const brandOwnerName = String(assignmentMatch?.brandOwnerName || prod.brandOwner || prod.brand || 'Unassigned');

      // Table 1: shipment_brand_owner_assignments
      const existingBA: ShipmentBrandOwnerAssignment[] = await this.db.getCollectionDocs('shipment_brand_owner_assignments');
      const activeBA = existingBA.find(
        (b) => (String(b.salesOrderId) === canonicalOrderId || matchesOrderId({ id: b.salesOrderId, orderNumber: b.salesOrderId }, salesOrderId)) &&
               (String(b.productId) === pId || b.itemId === itemKey) && b.status === 'ASSIGNED'
      );

      if (!activeBA) {
        const baRecord: ShipmentBrandOwnerAssignment = {
          id: this.generateId('boa'),
          salesOrderId: canonicalOrderId,
          invoiceId,
          invoiceNumber,
          itemId: itemKey,
          productId: pId,
          sku: prod.sku || '',
          productName: prod.productName || prod.name || `Product ${idx + 1}`,
          quantity: prod.quantity || 1,
          brandOwnerId,
          brandOwnerName,
          status: 'ASSIGNED',
          transactionDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: operator,
          statusHistory: [
            { fromStatus: null, toStatus: 'ASSIGNED', transactionDate: now, performedBy: operator, reason: 'Brand Owner Assigned on Packing' }
          ],
        };
        await this.db.saveCollectionDoc('shipment_brand_owner_assignments', sanitizeFirestorePayload(baRecord));
      } else if (activeBA.brandOwnerId !== brandOwnerId || activeBA.brandOwnerName !== brandOwnerName) {
        await this.reassignBrandOwner(activeBA.id, { brandOwnerId, brandOwnerName }, operator);
      }

      // Table 2: shipment_packing
      const existingPck: ShipmentPacking[] = await this.db.getCollectionDocs('shipment_packing');
      const itemPck = existingPck.find(
        (p) => String(p.salesOrderId) === String(salesOrderId) && (String(p.productId) === pId || p.itemId === itemKey)
      );

      if (!itemPck) {
        const pckRecord: ShipmentPacking = {
          id: this.generateId('pck'),
          salesOrderId: String(salesOrderId),
          invoiceId,
          invoiceNumber,
          itemId: itemKey,
          productId: pId,
          sku: prod.sku || '',
          productName: prod.productName || prod.name || `Product ${idx + 1}`,
          brandOwnerId,
          brandOwnerName,
          packedBy: operator,
          status: 'PACKING',
          transactionDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: operator,
          statusHistory: [
            { fromStatus: null, toStatus: 'PACKING', transactionDate: now, performedBy: operator, reason: 'Item Packed' }
          ],
        };
        await this.db.saveCollectionDoc('shipment_packing', sanitizeFirestorePayload(pckRecord));
      } else if (itemPck.status !== 'PACKING') {
        itemPck.status = 'PACKING';
        itemPck.updatedAt = now;
        itemPck.updatedBy = operator;
        itemPck.statusHistory = [
          ...(itemPck.statusHistory || []),
          { fromStatus: itemPck.status, toStatus: 'PACKING', transactionDate: now, performedBy: operator, reason: 'Updated to PACKING' }
        ];
        await this.db.saveCollectionDoc('shipment_packing', sanitizeFirestorePayload(itemPck));
      }

      // Table 3: shipment_shipments
      const existingShp: ShipmentShipment[] = await this.db.getCollectionDocs('shipment_shipments');
      const itemShp = existingShp.find(
        (s) => String(s.salesOrderId) === String(salesOrderId) && (String(s.productId) === pId || s.itemId === itemKey)
      );

      if (!itemShp) {
        const shpRecord: ShipmentShipment = {
          id: this.generateId('shp'),
          salesOrderId: String(salesOrderId),
          invoiceId,
          invoiceNumber,
          itemId: itemKey,
          productId: pId,
          sku: prod.sku || '',
          productName: prod.productName || prod.name || `Product ${idx + 1}`,
          brandOwnerId,
          brandOwnerName,
          courierAgency: 'Pending Courier',
          trackingNumber: `TRK_${Date.now().toString().slice(-8)}_${idx}`,
          status: 'PENDING',
          transactionDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: operator,
          statusHistory: [
            { fromStatus: null, toStatus: 'PENDING', transactionDate: now, performedBy: operator, reason: 'Shipment Initialized' }
          ],
        };
        await this.db.saveCollectionDoc('shipment_shipments', sanitizeFirestorePayload(shpRecord));
      }

      // Table 4: shipment_deliveries
      const existingDel: ShipmentDelivery[] = await this.db.getCollectionDocs('shipment_deliveries');
      const itemDel = existingDel.find(
        (d) => String(d.salesOrderId) === String(salesOrderId) && (String(d.productId) === pId || d.itemId === itemKey)
      );

      if (!itemDel) {
        const delRecord: ShipmentDelivery = {
          id: this.generateId('del'),
          salesOrderId: String(salesOrderId),
          invoiceId,
          invoiceNumber,
          itemId: itemKey,
          productId: pId,
          sku: prod.sku || '',
          productName: prod.productName || prod.name || `Product ${idx + 1}`,
          brandOwnerId,
          brandOwnerName,
          recipientName: salesOrder.customerName || 'Customer',
          status: 'PENDING',
          transactionDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: operator,
          statusHistory: [
            { fromStatus: null, toStatus: 'PENDING', transactionDate: now, performedBy: operator, reason: 'Delivery Initialized' }
          ],
        };
        await this.db.saveCollectionDoc('shipment_deliveries', sanitizeFirestorePayload(delRecord));
      }

      // Table 5: shipment_returns
      const existingRet: ShipmentReturn[] = await this.db.getCollectionDocs('shipment_returns');
      const itemRet = existingRet.find(
        (r) => String(r.salesOrderId) === String(salesOrderId) && (String(r.productId) === pId || r.itemId === itemKey)
      );

      if (!itemRet) {
        const retRecord: ShipmentReturn = {
          id: this.generateId('ret'),
          salesOrderId: String(salesOrderId),
          invoiceId,
          invoiceNumber,
          itemId: itemKey,
          productId: pId,
          sku: prod.sku || '',
          productName: prod.productName || prod.name || `Product ${idx + 1}`,
          brandOwnerId,
          brandOwnerName,
          reason: 'NONE',
          status: 'PENDING',
          transactionDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: operator,
          statusHistory: [
            { fromStatus: null, toStatus: 'PENDING', transactionDate: now, performedBy: operator, reason: 'Return Lifecycle Initialized' }
          ],
        };
        await this.db.saveCollectionDoc('shipment_returns', sanitizeFirestorePayload(retRecord));
      }
    }

    const [savedOrders, savedAssignments] = await Promise.all([
      this.db.getCollectionDocs('sales_orders'),
      this.db.getCollectionDocs('shipment_brand_owner_assignments'),
    ]);
    const savedOrder = savedOrders.find((order) => String(order.id) === canonicalOrderId);
    if (savedOrder?.deliveryStatus !== fulfilmentStatus) {
      throw new Error(`Sales order '${canonicalOrderId}' did not persist fulfilment status '${fulfilmentStatus}'.`);
    }

    for (const assignment of activeAssignmentsList) {
      const savedAssignment = savedAssignments.find((record) =>
        String(record.salesOrderId) === canonicalOrderId &&
        record.status === 'ASSIGNED' &&
        (String(record.productId) === String(assignment.productId) ||
          (assignment.orderItemId && String(record.itemId) === String(assignment.orderItemId)))
      );
      if (!savedAssignment) {
        throw new Error(`Brand owner assignment for product '${assignment.productId}' was not persisted.`);
      }
    }

    return { success: true, salesOrder: savedOrder };
  }
}
