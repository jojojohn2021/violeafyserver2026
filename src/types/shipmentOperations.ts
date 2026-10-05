export type BrandOwnerAssignmentStatus = 'PENDING' | 'ASSIGNED' | 'CANCELLED';
export type PackingStatus = 'PENDING' | 'PARTIALLY_PACKED' | 'PACKING' | 'CANCELLED';
export type ShipmentStatus = 'PENDING' | 'READY_FOR_SHIPMENT' | 'SHIPPED' | 'CANCELLED';
export type DeliveryStatus = 'PENDING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED' | 'CANCELLED';
export type ReturnStatus = 'PENDING' | 'RETURN_REQUESTED' | 'RETURN_APPROVED' | 'RETURN_RECEIVED' | 'RETURN_COMPLETED' | 'RETURN_REJECTED' | 'CANCELLED';

export interface StatusHistoryEntry {
  fromStatus: string | null;
  toStatus: string;
  transactionDate: string;
  performedBy: string;
  reason?: string;
}

export interface ShipmentOperationalCommon {
  id: string;
  salesOrderId: string;
  invoiceId: string;
  invoiceNumber?: string;
  itemId?: string;
  productId?: string;
  sku?: string;
  productName?: string;
  brandOwnerId?: string;
  brandOwnerName?: string;
  status: string;
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy?: string;
  statusHistory: StatusHistoryEntry[];
}

export interface ShipmentBrandOwnerAssignment extends ShipmentOperationalCommon {
  quantity?: number;
  notes?: string;
  courier?: string;
  docketno?: string;
  pickupdate?: string;
  status: BrandOwnerAssignmentStatus;
}

export interface ShipmentPacking extends ShipmentOperationalCommon {
  packedBy?: string;
  notes?: string;
  items?: Array<{
    itemId?: string;
    productId?: string;
    quantity: number;
    packedQuantity: number;
  }>;
  status: PackingStatus;
}

export interface ShipmentShipment extends ShipmentOperationalCommon {
  courierAgency?: string;
  trackingNumber?: string;
  expectedDeliveryDate?: string;
  packageCount?: number;
  weightKg?: number;
  status: ShipmentStatus;
}

export interface ShipmentDelivery extends ShipmentOperationalCommon {
  recipientName?: string;
  remarks?: string;
  proofOfDeliveryUrl?: string;
  status: DeliveryStatus;
}

export interface ShipmentReturn extends ShipmentOperationalCommon {
  reason?: string;
  notes?: string;
  resolution?: 'REFUND' | 'REPLACEMENT' | 'REJECTED';
  resolutionNotes?: string;
  status: ReturnStatus;
}

export interface OperationalFilterParams {
  salesOrderId?: string;
  invoiceId?: string;
  itemId?: string;
  SKU?: string;
  productName?: string;
  customerName?: string;
  customerMobile?: string;
  brandOwnerId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  success: boolean;
  records: T[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  };
}

export interface OrderLifecycleResponse {
  salesOrderId: string;
  invoiceId: string;
  summary: {
    assignmentStatus: string;
    packingStatus: string;
    shipmentStatus: string;
    deliveryStatus: string;
    returnStatus: string;
  };
  items: Array<{
    itemId: string;
    productId?: string;
    productName?: string;
    activeBrandOwner?: {
      brandOwnerId: string;
      brandOwnerName?: string;
      assignedAt: string;
    };
    brandOwnerHistory: ShipmentBrandOwnerAssignment[];
    packing?: ShipmentPacking;
    shipment?: ShipmentShipment;
    delivery?: ShipmentDelivery;
    returns: ShipmentReturn[];
  }>;
  history: {
    assignments: ShipmentBrandOwnerAssignment[];
    packings: ShipmentPacking[];
    shipments: ShipmentShipment[];
    deliveries: ShipmentDelivery[];
    returns: ShipmentReturn[];
  };
}
