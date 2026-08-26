export type FulfilmentStatus =
  | 'NOT_STARTED'
  | 'PACKING'
  | 'PACKED'
  | 'READY_FOR_DISPATCH'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURN_IN_PROGRESS'
  | 'COMPLETED';

export type ReturnReason =
  | 'DAMAGED'
  | 'WRONG_ITEM'
  | 'DEFECTIVE'
  | 'NOT_NEEDED'
  | 'OTHER';

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REVERSE_SHIPMENT_CREATED'
  | 'RECEIVED'
  | 'REFUNDED'
  | 'REPLACED'
  | 'REJECTED';

export interface PackingItemVerification {
  productId: string;
  quantity: number;
  packedQuantity: number;
  verified: boolean;
}

export interface PackingRecord {
  id: string;
  orderId: string;
  status: 'NOT_STARTED' | 'PACKING' | 'PACKED';
  startedAt?: string;
  completedAt?: string;
  packedBy?: string;
  items: PackingItemVerification[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandOwnerItemAssignment {
  orderItemId: string;
  productId: string;
  brandOwnerId: string;
  brandOwnerName?: string;
  assignedAt: string;
  assignedBy?: string;
}

export interface BrandOwnerAssignmentRecord {
  id: string;
  orderId: string;
  assignments: BrandOwnerItemAssignment[];
  updatedAt: string;
}

export interface ShipmentCharges {
  baseCharge: number;
  handlingCharge: number;
  additionalCharge: number;
  otherCharge: number;
  totalCharge: number;
}

export interface ShipmentRecord {
  id: string;
  shipmentId: string;
  orderId: string;
  courierAgency: string;
  trackingNumber: string;
  shipmentDate: string;
  expectedDeliveryDate?: string;
  packageCount: number;
  weightKg: number;
  charges: ShipmentCharges;
  status: 'CREATED' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  dispatchedAt?: string;
  dispatchedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryRecord {
  id: string;
  shipmentId: string;
  orderId: string;
  deliveryDate: string;
  deliveryTime: string;
  recipientName: string;
  deliveryReference?: string;
  remarks?: string;
  proofOfDeliveryUrl?: string;
  createdAt: string;
}

export interface ReturnItem {
  orderItemId: string;
  productId: string;
  productName?: string;
  quantity: number;
  reason: ReturnReason;
  notes?: string;
}

export interface ReverseShipmentRecord {
  trackingNumber: string;
  courierAgency: string;
  shippedDate?: string;
  expectedArrivalDate?: string;
  remarks?: string;
}

export interface ReturnRecord {
  id: string;
  returnId: string;
  orderId: string;
  items: ReturnItem[];
  reason: ReturnReason;
  status: ReturnStatus;
  reverseShipment?: ReverseShipmentRecord;
  receivedAt?: string;
  receivedBy?: string;
  resolution?: 'REFUND' | 'REPLACEMENT' | 'REJECTED';
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalTimelineEvent {
  id: string;
  orderId: string;
  action: string;
  description: string;
  timestamp: string;
  performedBy?: string;
  metadata?: Record<string, any>;
}

export interface PaymentReminderRecord {
  id: string;
  orderId: string;
  type: 'STANDARD' | 'WHATSAPP';
  sentAt: string;
  sentToPhone?: string;
  status: 'SENT' | 'FAILED';
  messageId?: string;
}

export interface FulfilmentRecord {
  id: string;
  orderId: string;
  status: FulfilmentStatus;
  packingId?: string;
  latestShipmentId?: string;
  latestDeliveryId?: string;
  brandAssignmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsOrderDetailsResponse {
  order: any;
  fulfilment: FulfilmentRecord;
  packing?: PackingRecord;
  brandAssignments?: BrandOwnerItemAssignment[];
  shipments: ShipmentRecord[];
  delivery?: DeliveryRecord;
  returns: ReturnRecord[];
  timeline: OperationalTimelineEvent[];
}
