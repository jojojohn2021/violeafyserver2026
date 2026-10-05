import { BaseRepository } from '../repositories/baseRepository';
import {
  orderRepository,
  shipmentBrandOwnerAssignmentRepository,
  shipmentPackingRepository,
  shipmentShipmentRepository,
  shipmentDeliveryRepository,
  shipmentReturnRepository,
} from '../repositories/repositories';

const fulfilmentRepository = new BaseRepository<any>('order_fulfilment');
const operationHistoryRepository = new BaseRepository<any>('order_operation_history');

async function upsertShipmentRecord(
  repository: BaseRepository<any>,
  existingRecords: any[],
  record: Record<string, any>,
  orderId: string,
  productId: string,
  itemId: string
): Promise<void> {
  const existing = existingRecords.find((candidate) =>
    String(candidate.salesOrderId) === orderId &&
    (String(candidate.productId) === productId || String(candidate.itemId) === itemId)
  );

  if (existing?.id) {
    await repository.update(String(existing.id), { ...record, id: existing.id });
  } else {
    await repository.create(record);
  }
}

/** Persist brand assignments from the browser when the deployed site has no API backend. */
export async function persistProductionBrandAssignments(
  order: any,
  assignments: any[],
  fulfilmentStatus: string,
  operator = 'Ops Manager'
): Promise<void> {
  const orderId = String(order.id);
  if (!orderId) throw new Error('Sales order ID is missing.');
  if (!assignments.length) throw new Error('There are no brand owner assignments to save.');

  const invoiceId = String(order.invoiceId || order.id);
  const invoiceNumber = String(order.invoiceNumber || order.orderNumber || `INV_${order.id}`);
  const now = new Date().toISOString();
  const products = Array.isArray(order.products) && order.products.length > 0
    ? order.products
    : assignments.map((assignment: any, idx: number) => ({
        productId: assignment.productId || assignment.orderItemId || `p_${idx}`,
        itemId: assignment.orderItemId,
        productName: assignment.productName,
        sku: assignment.sku,
        quantity: assignment.quantity,
      }));

  const [existingAssignments, existingPackings, existingShipments, existingDeliveries, existingReturns, fulfilments] = await Promise.all([
    shipmentBrandOwnerAssignmentRepository.getAll(),
    shipmentPackingRepository.getAll(),
    shipmentShipmentRepository.getAll(),
    shipmentDeliveryRepository.getAll(),
    shipmentReturnRepository.getAll(),
    fulfilmentRepository.getAll(),
  ]);

  for (let idx = 0; idx < products.length; idx++) {
    const product = products[idx];
    const productId = String(product.productId || product.id || `p_${idx}`);
    const itemId = String(product.itemId || `item_${product.productId || product.id || idx}`);
    const assignment = assignments.find((candidate: any) =>
      String(candidate.productId) === productId || String(candidate.orderItemId) === itemId
    );
    if (!assignment) {
      throw new Error(`No brand owner is assigned to ${product.productName || product.name || productId}.`);
    }

    const brandOwnerId = String(assignment.brandOwnerId || product.brandOwnerId || 'brand_owner_default');
    const brandOwnerName = String(assignment.brandOwnerName || product.brandOwner || product.brand || 'Unassigned');
    const common = {
      salesOrderId: orderId,
      invoiceId,
      invoiceNumber,
      itemId,
      productId,
      sku: product.sku || '',
      productName: product.productName || product.name || `Product ${idx + 1}`,
      brandOwnerId,
      brandOwnerName,
      transactionDate: now,
      updatedAt: now,
      createdBy: operator,
    };

    const existingAssignment = existingAssignments.find((record: any) =>
      String(record.salesOrderId) === orderId &&
      (String(record.productId) === productId || String(record.itemId) === itemId) &&
      record.status === 'ASSIGNED'
    );
    await upsertShipmentRecord(
      shipmentBrandOwnerAssignmentRepository,
      existingAssignment ? existingAssignments : existingAssignments,
      {
        ...common,
        id: existingAssignment?.id || `boa_${orderId}_${productId}`,
        quantity: product.quantity || 1,
        status: 'ASSIGNED',
        createdAt: existingAssignment?.createdAt || now,
      },
      orderId,
      productId,
      itemId
    );

    const tables = [
      {
        repository: shipmentPackingRepository,
        records: existingPackings,
        record: { ...common, id: `pck_${orderId}_${productId}`, packedBy: operator, status: 'PACKING' },
      },
      {
        repository: shipmentShipmentRepository,
        records: existingShipments,
        record: {
          ...common,
          id: `shp_${orderId}_${productId}`,
          courierAgency: 'Pending Courier',
          trackingNumber: `TRK_${Date.now().toString().slice(-8)}_${idx}`,
          status: 'PENDING',
        },
      },
      {
        repository: shipmentDeliveryRepository,
        records: existingDeliveries,
        record: { ...common, id: `del_${orderId}_${productId}`, recipientName: order.customerName || 'Customer', status: 'PENDING' },
      },
      {
        repository: shipmentReturnRepository,
        records: existingReturns,
        record: { ...common, id: `ret_${orderId}_${productId}`, reason: 'NONE', status: 'PENDING' },
      },
    ];

    for (const table of tables) {
      await upsertShipmentRecord(table.repository, table.records, table.record, orderId, productId, itemId);
    }
  }

  const fulfilment = fulfilments.find((record: any) => String(record.orderId) === orderId);
  if (fulfilment?.id) {
    await fulfilmentRepository.update(String(fulfilment.id), {
      status: fulfilmentStatus,
      updatedAt: now,
      updatedBy: operator,
    });
  } else {
    await fulfilmentRepository.create({
      id: `ful_${orderId}`,
      orderId,
      status: fulfilmentStatus,
      createdAt: now,
      updatedAt: now,
      updatedBy: operator,
    });
  }

  await orderRepository.update(orderId, { deliveryStatus: fulfilmentStatus, updatedAt: now } as any);
  await operationHistoryRepository.create({
    id: `evt_brand_assignment_${orderId}_${Date.now()}`,
    orderId,
    action: 'BRAND_OWNER_ASSIGNED',
    description: `Saved brand owner assignments and fulfilment status ${fulfilmentStatus}`,
    timestamp: now,
    performedBy: operator,
    metadata: { assignments, status: fulfilmentStatus },
  });
}
