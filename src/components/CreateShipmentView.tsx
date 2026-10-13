import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Package,
  Calendar,
  Filter,
  Save,
  Send,
  User,
  Phone,
  Hash,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useCRM } from '../store';
import {
  shipmentBrandOwnerAssignmentRepository,
  shipmentTrackingRepository,
  productRepository,
  orderRepository,
} from '../repositories/repositories';
import { auth } from '../firebase';
import { apiFetch } from '../utils/apiFetch';
import { migrateFulfilmentItem, getItemDeliveryStatus } from '../utils/fulfilmentItem';
import { ProductPerformance } from '../types';

export type ShipmentStatusOption = 'PACKING' | 'READY_FOR_DISPATCH' | 'SHIPPED' | 'CANCELLED';

// Helper validation: Scope of documents listed in grid is restricted to Delivery Status = 'SHIPPED', 'READY_FOR_DISPATCH', or 'CANCELLED'
export const isEligibleShipmentDeliveryStatus = (status?: string): boolean => {
  if (!status) return false;
  const s = status.toUpperCase().trim().replace(/[-_ ]/g, '_');
  return s === 'SHIPPED' || s === 'READY_FOR_DISPATCH' || s === 'CANCELLED' || s === 'CANCELED';
};

// Helper: Grid row header value should be shipment_brand_owner_fulfilment->orderNumber
export const resolveShipmentOrderNo = (doc: any, matchedOrder?: any, fallbackSalesOrderId?: string): string => {
  return String(
    doc?.orderNumber ||
    doc?.orderNo ||
    matchedOrder?.orderNumber ||
    fallbackSalesOrderId ||
    ''
  );
};

export const COURIER_PARTNERS = [
  'Amazon',
  'Delhivery',
  'DTDC',
  'Blue Dart The Professional Couriers',
  'Blue Dart',
  'The Professional Couriers',
  'India Post',
] as const;

export interface CreateShipmentGridRow {
  // Hidden fields
  id: string; // id = hidden
  shipid?: string;
  brandOwnerAssignid: string; // brandOwnerAssignid = Hidden
  orderItemId: string; // orderItemId = hidden
  productId?: string;
  salesOrderId?: string;
  brandOwnerName: string; // brandOwnerName = hidden
  orderpackingsize: string; // orderpackingsize = hidden
  orderunit: string; // orderunit = hidden
  orderqty: number; // orderqty = hidden

  // Columns displayed in grid
  orderDate: string;
  orderNo: string;
  customerName: string;
  customerMobile: string;
  productName: string;
  Outpackingsize: string; // Outpackingsize = disable
  outunit: string; // outunit = disable
  outquantity: number; // outquantity = disable
  outstatus: ShipmentStatusOption; // outstatus = selection combo box (READY_FOR_DISPATCH | SHIPPED | PACKING | CANCELLED)
  fulfillmentstatus: string; // fulfillmentstatus = outstatus
  outpickupdate: string; // outpickupdate = systemdate by default (option to select date)
  outcouriername: string; // outcouriername = selection combo box
  outcourierdocketno: string; // outcourierdocketno = mandatory
  outdealyreasons: string; // outdealyreasons = maximum 70 characters

  // Additional metadata & raw records
  outpackdate: string;
  sku?: string;
  rawDoc?: any;
}

export interface GroupedShipmentOrder {
  orderId: string; // sales_orders.id
  orderNo: string;
  orderDate: string;
  customerName: string;
  customerMobile: string;
  fulfilmentStatus: string;
  deliveryStatus?: string;
  items: CreateShipmentGridRow[];
}

export const CreateShipmentView: React.FC = () => {
  const { products: globalProducts, salesOrders: globalSalesOrders } = useCRM();
  const [productsMaster, setProductsMaster] = useState<ProductPerformance[]>([]);
  const [salesOrdersMaster, setSalesOrdersMaster] = useState<any[]>([]);
  const [groupedOrders, setGroupedOrders] = useState<GroupedShipmentOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SHIPPED' | 'READY_FOR_DISPATCH' | 'CANCELLED'>('ALL');
  const [courierFilter, setCourierFilter] = useState<string>('ALL');

  // Track recently updated item IDs so they remain visible after status change
  const [recentlyUpdatedItemKeys, setRecentlyUpdatedItemKeys] = useState<Set<string>>(new Set());

  // Track saved items to disable save button and highlight row light sky-blue
  const [savedItemKeys, setSavedItemKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('shipment_saved_item_keys');
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('shipment_saved_item_keys', JSON.stringify(Array.from(savedItemKeys)));
    } catch {
      // ignore storage errors
    }
  }, [savedItemKeys]);

  // Expand / collapse all orders
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);

  // WhatsApp Sending State
  const [waSendingKey, setWaSendingKey] = useState<string | null>(null);

  // System Date helper (YYYY-MM-DD)
  const getSystemDate = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const showStatus = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Fetch Products master list
  const fetchProductsMaster = async () => {
    try {
      if (Array.isArray(globalProducts) && globalProducts.length > 0) {
        setProductsMaster(globalProducts);
        return;
      }
      const prods = await productRepository.getAll();
      if (Array.isArray(prods) && prods.length > 0) {
        setProductsMaster(prods);
        return;
      }
    } catch (err) {
      console.warn('Direct product fetch fallback:', err);
    }

    try {
      const res = await apiFetch('/api/db/products');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.docs)) {
          setProductsMaster(data.docs);
        }
      }
    } catch (err) {
      console.error('Failed to fetch products master list:', err);
    }
  };

  // Fetch Sales Orders master list
  const fetchSalesOrdersMaster = async () => {
    try {
      if (Array.isArray(globalSalesOrders) && globalSalesOrders.length > 0) {
        setSalesOrdersMaster(globalSalesOrders);
        return;
      }
      const orders = await orderRepository.getAll();
      if (Array.isArray(orders) && orders.length > 0) {
        setSalesOrdersMaster(orders);
        return;
      }
    } catch (err) {
      console.warn('Direct sales order fetch fallback:', err);
    }

    try {
      const res = await apiFetch('/api/db/sales_orders');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.docs)) {
          setSalesOrdersMaster(data.docs);
          return;
        }
      }
    } catch (err) {
      console.warn('API /api/db/sales_orders fallback:', err);
    }

    try {
      const res = await apiFetch('/api/operations/orders');
      if (res.ok) {
        const data = await res.json();
        const list = data.orders || data.records || data.docs;
        if (Array.isArray(list)) {
          setSalesOrdersMaster(list);
        }
      }
    } catch (err) {
      console.warn('API /api/operations/orders fallback:', err);
    }
  };

  const resolveProductName = (orderItemId: string, productId?: string, fallbackName?: string): string => {
    const prods = productsMaster.length > 0 ? productsMaster : globalProducts;
    if (!prods || prods.length === 0) return fallbackName || 'Product Item';

    const matchByOrderItemId = prods.find((p) => String(p.id) === String(orderItemId));
    if (matchByOrderItemId?.name) return matchByOrderItemId.name;

    if (productId) {
      const matchByProdId = prods.find((p) => String(p.id) === String(productId));
      if (matchByProdId?.name) return matchByProdId.name;
    }

    const cleanId = orderItemId.replace(/^item_/, '');
    const matchByCleanId = prods.find((p) => String(p.id) === cleanId || orderItemId.includes(String(p.id)));
    if (matchByCleanId?.name) return matchByCleanId.name;

    return fallbackName || 'Product Item';
  };

  const resolveSalesOrder = (salesOrderId?: string) => {
    if (!salesOrderId) return null;
    const list = salesOrdersMaster.length > 0 ? salesOrdersMaster : (globalSalesOrders || []);
    const sId = String(salesOrderId).trim().toLowerCase();
    return (
      list.find((o: any) => {
        const idMatch = o.id && String(o.id).trim().toLowerCase() === sId;
        const orderIdMatch = o.orderId && String(o.orderId).trim().toLowerCase() === sId;
        const orderNoMatch = o.orderNumber && String(o.orderNumber).trim().toLowerCase() === sId;
        return idMatch || orderIdMatch || orderNoMatch;
      }) || null
    );
  };

  // Helper to format date string
  const formatOrderDate = (rawCreatedAt: any, systemDate: string) => {
    if (!rawCreatedAt) return systemDate;
    if (typeof rawCreatedAt === 'string' && rawCreatedAt.includes('T')) {
      return rawCreatedAt.split('T')[0];
    }
    if (typeof rawCreatedAt === 'string') {
      return rawCreatedAt;
    }
    if (rawCreatedAt && typeof rawCreatedAt.toDate === 'function') {
      try {
        return rawCreatedAt.toDate().toISOString().split('T')[0];
      } catch (e) {
        return String(rawCreatedAt);
      }
    }
    if (rawCreatedAt && typeof rawCreatedAt.seconds === 'number') {
      return new Date(rawCreatedAt.seconds * 1000).toISOString().split('T')[0];
    }
    return systemDate;
  };

  // Fetch and group shipment records by sales_orders.id
  const fetchShipmentRecords = async () => {
    setLoading(true);
    const systemDate = getSystemDate();

    try {
      let rawDocs: any[] = [];

      try {
        const res = await apiFetch('/api/operations/shipment-brand-owner-fulfilment');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.docs)) {
            rawDocs = data.docs;
          }
        }
      } catch (apiErr) {
        console.warn('API endpoint fetch fallback to repository:', apiErr);
      }

      if (rawDocs.length === 0) {
        try {
          rawDocs = await shipmentBrandOwnerAssignmentRepository.getAll();
        } catch (repoErr) {
          console.warn('Repository fetch error:', repoErr);
        }
      }

      // Group by sales_orders.id
      const orderGroupsMap = new Map<string, GroupedShipmentOrder>();

      for (const doc of rawDocs) {
        const docSalesOrderId = String(doc.salesOrderId || (doc.items && doc.items[0]?.salesOrderId) || '').trim();
        const fallbackId = (!String(doc.id).startsWith('boa_') && !String(doc.id).startsWith('item_') && !String(doc.id).startsWith('ship_')) ? String(doc.id) : '';
        const salesOrderId = docSalesOrderId || String(doc.orderId || doc.orderNumber || fallbackId || '').trim();
        if (!salesOrderId) continue;

        const matchedOrder = resolveSalesOrder(salesOrderId);

        // Scope validation: Only orders with shipment_brand_owner_fulfilment->deliveryStatus equal to 'PACKING', 'READY_FOR_DISPATCH', or 'CANCELLED'
        const docDeliveryStatusRaw = String(
          doc.deliveryStatus ||
          doc.deliverystatus ||
          matchedOrder?.deliveryStatus ||
          (Array.isArray(doc.items) && doc.items.length > 0
            ? (doc.items[0]?.deliveryStatus || getItemDeliveryStatus(doc.items[0]) || doc.items[0]?.outstatus)
            : '') ||
          ''
        ).trim();

        if (!isEligibleShipmentDeliveryStatus(docDeliveryStatusRaw)) {
          continue;
        }

        const normalizedDocStatus = docDeliveryStatusRaw.toUpperCase().replace(/[\s_-]+/g, '_');
        const docDeliveryStatus: 'SHIPPED' | 'READY_FOR_DISPATCH' | 'CANCELLED' =
          normalizedDocStatus === 'CANCELLED' || normalizedDocStatus === 'CANCELED'
            ? 'CANCELLED'
            : normalizedDocStatus === 'SHIPPED'
            ? 'SHIPPED'
            : 'READY_FOR_DISPATCH';

        // Display ORDER NO: grid row header value should be shipment_brand_owner_fulfilment->orderNumber
        const orderNo = resolveShipmentOrderNo(doc, matchedOrder, salesOrderId);
        const customerName = String(
          matchedOrder?.customerName ||
          doc.customerName ||
          doc.customer ||
          'N/A'
        );
        const customerMobile = String(
          matchedOrder?.customerMobile ||
          matchedOrder?.contactNo ||
          doc.customerMobile ||
          doc.contactNo ||
          doc.mobile ||
          'N/A'
        );
        const orderDate = formatOrderDate(matchedOrder?.createdAt || doc.orderDate || doc.createdAt, systemDate);

        if (!orderGroupsMap.has(salesOrderId)) {
          orderGroupsMap.set(salesOrderId, {
            orderId: salesOrderId,
            orderNo,
            orderDate,
            customerName,
            customerMobile,
            fulfilmentStatus: String(doc.fulfilmentStatus || doc.fulfillmentstatus || doc.outstatus || docDeliveryStatus),
            deliveryStatus: docDeliveryStatus,
            items: [],
          });
        }

        const group = orderGroupsMap.get(salesOrderId)!;

        // Process items: either doc has child `items` array or doc is a flat item
        const rawItems = Array.isArray(doc.items) && doc.items.length > 0 ? doc.items : [doc];

        for (let idx = 0; idx < rawItems.length; idx++) {
          const item = rawItems[idx];
          const orderItemId = String(item.orderItemId || item.itemId || item.productId || `item_${idx}`);
          const productId = String(item.productId || '');
          const brandOwnerAssignid = String(item.brandOwnerAssignid || doc.brandOwnerAssignid || doc.id || `boa_${idx}`);
          const brandOwnerName = String(item.brandOwnerName || doc.brandOwnerName || 'Not Assigned');

          // Item delivery status inherits docDeliveryStatus unless item has an explicit eligible status or SHIPPED
          const explicitItemStatus = String(
            item.deliveryStatus ||
            getItemDeliveryStatus(item) ||
            item.outstatus ||
            ''
          ).trim().toUpperCase().replace(/[\s_-]+/g, '_');

          const itemDeliveryStatus = (
            explicitItemStatus && (isEligibleShipmentDeliveryStatus(explicitItemStatus) || explicitItemStatus === 'SHIPPED')
              ? explicitItemStatus
              : docDeliveryStatus
          );

          // Pack Size = shipment_brand_owner_fulfilment.items[].orderpackingsize.
          // Legacy rows hold the placeholder 'Standard' / blank, so resolve the real size
          // from the sales order line, then the product master.
          const storedPackSize = String(item.orderpackingsize ?? item.packingsize ?? '').trim();
          const isPlaceholderPackSize = !storedPackSize || storedPackSize.toLowerCase() === 'standard';
          const orderLine = (matchedOrder?.products || []).find(
            (p: any) => String(p.productId || p.id) === productId || `item_${p.productId || p.id}` === orderItemId
          );
          const masterProd = (productsMaster.length > 0 ? productsMaster : globalProducts || []).find(
            (p: any) => String(p.id) === productId || String(p.id) === orderItemId.replace(/^item_/, '')
          );
          const orderpackingsize = String(
            isPlaceholderPackSize
              ? orderLine?.packingSize || orderLine?.packingsize || orderLine?.orderpackingsize ||
                (masterProd as any)?.packingSize || storedPackSize || 'Standard'
              : storedPackSize
          );
          const orderunit = String(
            item.orderunit ??
            item.unit ??
            'PCS'
          );
          const orderqty = Number(
            item.orderqty !== undefined
              ? item.orderqty
              : item.quantity !== undefined
              ? item.quantity
              : 1
          );

          const Outpackingsize = String(item.outpackingsize || item.Outpackingsize || orderpackingsize);
          const outunit = String(item.outunit || orderunit);
          const outquantity = item.outquantity !== undefined && item.outquantity !== null
            ? Number(item.outquantity)
            : orderqty;

          let outstatus: ShipmentStatusOption = docDeliveryStatus;
          if (itemDeliveryStatus === 'SHIPPED') outstatus = 'SHIPPED';
          else if (itemDeliveryStatus === 'PACKING') outstatus = 'PACKING';
          else if (itemDeliveryStatus === 'CANCELLED' || itemDeliveryStatus === 'CANCELED') outstatus = 'CANCELLED';
          else if (itemDeliveryStatus === 'READY_FOR_DISPATCH') outstatus = 'READY_FOR_DISPATCH';

          const explicitFulfillment = String(item.fulfillmentstatus || '').trim().toUpperCase().replace(/[\s_-]+/g, '_');
          const fulfillmentstatus = (
            explicitFulfillment && (isEligibleShipmentDeliveryStatus(explicitFulfillment) || explicitFulfillment === 'SHIPPED')
              ? explicitFulfillment
              : outstatus
          );
          const outpickupdate = item.outpickupdate ? String(item.outpickupdate) : systemDate;
          const outcouriername = String(item.outcouriername || item.couriername || 'Delhivery');
          const outcourierdocketno = String(item.outcourierdocketno || item.courierdocketno || '');
          const outdealyreasons = String(item.outdealyreasons || '').slice(0, 70);
          const productName = resolveProductName(orderItemId, productId, item.productName || item.name);
          const outpackdate = item.outpackdate ? String(item.outpackdate) : systemDate;

          // Check if item already exists in this order group to avoid duplicates
          const existingItemIndex = group.items.findIndex(
            (i) => i.orderItemId === orderItemId || (i.productId && i.productId === productId && productId !== '')
          );

          const itemRow: CreateShipmentGridRow = {
            id: String(doc.id || `doc_${salesOrderId}`),
            shipid: item.shipid ? String(item.shipid) : doc.shipid ? String(doc.shipid) : undefined,
            brandOwnerAssignid,
            orderItemId,
            productId,
            salesOrderId,
            brandOwnerName,
            orderpackingsize,
            orderunit,
            orderqty,
            orderDate,
            orderNo,
            customerName,
            customerMobile,
            productName,
            Outpackingsize,
            outunit,
            outquantity,
            outstatus,
            fulfillmentstatus,
            outpickupdate,
            outcouriername,
            outcourierdocketno,
            outdealyreasons,
            outpackdate,
            sku: item.sku || '',
            rawDoc: item,
          };

          if (existingItemIndex >= 0) {
            group.items[existingItemIndex] = itemRow;
          } else {
            group.items.push(itemRow);
          }
        }
      }

      const allGroups = Array.from(orderGroupsMap.values());
      setGroupedOrders(allGroups);
      // Auto expand all orders by default for ease of operations
      setExpandedOrderIds(new Set(allGroups.map((g) => g.orderId)));
    } catch (err: any) {
      console.error('Failed to load shipment records:', err);
      showStatus(err?.message || 'Error loading records from shipment_brand_owner_fulfilment', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductsMaster();
    fetchSalesOrdersMaster();
  }, []);

  useEffect(() => {
    fetchShipmentRecords();
  }, [productsMaster, salesOrdersMaster]);

  // Handle in-grid field changes for an item
  const handleItemFieldChange = (orderId: string, orderItemId: string, field: keyof CreateShipmentGridRow, val: any) => {
    setGroupedOrders((prevOrders) =>
      prevOrders.map((ord) => {
        if (ord.orderId !== orderId) return ord;
        return {
          ...ord,
          items: ord.items.map((it) => {
            if (it.orderItemId !== orderItemId) return it;
            const updated = { ...it, [field]: val };
            if (field === 'outstatus') {
              updated.fulfillmentstatus = val;
            }
            return updated;
          }),
        };
      })
    );
  };

  // Send WhatsApp Notification directly from grid
  const handleSendWhatsAppNotification = async (orderId: string, item: CreateShipmentGridRow) => {
    const itemKey = `${orderId}_${item.orderItemId}`;
    setWaSendingKey(itemKey);
    try {
      const stage = item.outstatus === 'SHIPPED' ? 'Shipped' : 'Create Shipment';
      const res = await apiFetch(`/api/operations/orders/${orderId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          metadata: {
            courierName: item.outcouriername,
            trackingNumber: item.outcourierdocketno,
            status: item.outstatus,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showStatus(
          data.skipped
            ? `WhatsApp skipped: ${data.message || 'Notification already sent for this stage.'}`
            : `WhatsApp message sent successfully to customer! Message ID: ${data.messageId || 'accepted'}`,
          'success'
        );
      } else {
        showStatus(data.error || 'Failed to send WhatsApp message. Check Firestore WhatsApp configuration.', 'error');
      }
    } catch (err: any) {
      showStatus(`Network error: ${err.message || 'Unable to communicate with server'}`, 'error');
    } finally {
      setWaSendingKey(null);
    }
  };

  // Save Item directly from Grid
  const handleSaveItem = async (order: GroupedShipmentOrder, item: CreateShipmentGridRow) => {
    // 1. Mandatory Validation: Courier Docket No must be present
    if (!item.outcourierdocketno || item.outcourierdocketno.trim() === '') {
      showStatus(`Validation Error: Courier Docket No is mandatory for ${item.productName}.`, 'error');
      return;
    }

    // 2. Character limit validation: Delay reasons <= 70
    if (item.outdealyreasons && item.outdealyreasons.length > 70) {
      showStatus(`Validation Error: Delay Reasons cannot exceed 70 characters.`, 'error');
      return;
    }

    const itemKey = `${order.orderId}_${item.orderItemId}`;
    setSavingKey(itemKey);

    try {
      const now = new Date().toISOString();
      const updatedChildDoc: any = migrateFulfilmentItem({
        ...(item.rawDoc || {}),
        salesOrderId: order.orderId,
        orderNo: order.orderNo,
        orderDate: order.orderDate,
        customerName: order.customerName,
        customerMobile: order.customerMobile,
        orderItemId: item.orderItemId,
        itemId: item.orderItemId,
        productId: item.productId || '',
        productName: item.productName,
        brandOwnerAssignid: item.brandOwnerAssignid,
        brandOwnerName: item.brandOwnerName,
        orderpackingsize: item.orderpackingsize,
        orderunit: item.orderunit,
        orderqty: item.orderqty,
        Outpackingsize: item.Outpackingsize,
        outpackingsize: item.Outpackingsize,
        outunit: item.outunit,
        outquantity: item.outquantity,
        outstatus: item.outstatus,
        fulfillmentstatus: item.outstatus,
        status: item.outstatus === 'SHIPPED' ? 'SHIPPED' : 'ASSIGNED',
        itemdeliverystatus: item.outstatus === 'SHIPPED' ? 'IN_TRANSIT' : '',
        outpickupdate: item.outpickupdate,
        outcouriername: item.outcouriername,
        couriername: item.outcouriername,
        outcourierdocketno: item.outcourierdocketno.trim(),
        courierdocketno: item.outcourierdocketno.trim(),
        outdealyreasons: (item.outdealyreasons || '').trim().slice(0, 70),
        outpackdate: item.outpackdate,
        shipid: item.shipid || `ship_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        updatedAt: now,
      });

      // 1. Authoritative API call to update grouped document
      let savedSuccessfully = false;
      let notifFeedback = '';

      let apiValidationError = '';
      try {
        const apiRes = await apiFetch('/api/operations/shipment-brand-owner-fulfilment/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: updatedChildDoc }),
        });
        const apiData = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && apiData.success) {
          savedSuccessfully = true;
          if (apiData.notification?.status === 'dispatched') {
            notifFeedback = ' • WhatsApp notification dispatched to customer!';
          }
        } else if (apiRes.status === 400) {
          apiValidationError = apiData.error || 'Validation failed on server.';
        }
      } catch (apiErr) {
        console.warn('API save fallback to direct repository:', apiErr);
      }
      if (apiValidationError) throw new Error(apiValidationError);

      // 2. Direct Firestore fallback
      if (!savedSuccessfully) {
        const parentDocId = `fulfil_${order.orderId}`;
        const existingParent = await shipmentBrandOwnerAssignmentRepository.getById(parentDocId);
        if (existingParent && Array.isArray(existingParent.items)) {
          const updatedItems = existingParent.items.map((it: any) =>
            migrateFulfilmentItem(it.orderItemId === item.orderItemId ? { ...it, ...updatedChildDoc } : it)
          );
          await shipmentBrandOwnerAssignmentRepository.update(parentDocId, {
            ...existingParent,
            items: updatedItems,
            outstatus: item.outstatus,
            fulfillmentstatus: item.outstatus,
            updatedAt: now,
          });
        } else {
          const newParentDoc = {
            id: parentDocId,
            salesOrderId: String(order.orderId),
            orderNumber: String(order.orderNo || order.orderId),
            customerName: String(order.customerName || ''),
            customerMobile: String(order.customerMobile || ''),
            deliveryStatus: item.outstatus,
            fulfillmentstatus: item.outstatus,
            status: 'SHIPPED',
            items: [updatedChildDoc],
            createdAt: now,
            updatedAt: now,
          };
          await shipmentBrandOwnerAssignmentRepository.create(newParentDoc);
        }

        if (item.brandOwnerAssignid && String(item.brandOwnerAssignid).startsWith('boa_')) {
          try {
            await shipmentBrandOwnerAssignmentRepository.delete(item.brandOwnerAssignid);
          } catch (delErr) {
            // ignore
          }
        }

        try {
          await shipmentTrackingRepository.create({
            id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            shipid: updatedChildDoc.shipid,
            salesOrderId: String(order.orderId),
            createdAt: new Date(),
            deliverystatus: updatedChildDoc.itemdeliverystatus || '',
            outpackingstatus: updatedChildDoc.outstatus === 'SHIPPED' ? 'PACKED' : 'PACKING',
            updatedby: auth?.currentUser?.email || auth?.currentUser?.uid || 'Ops Admin',
          });
        } catch (auditErr) {
          console.warn('[CreateShipmentView] Warning creating shipment_tracking audit log:', auditErr);
        }
      }

      // Track recently updated key so it stays visible
      setRecentlyUpdatedItemKeys((prev) => new Set(prev).add(itemKey));
      setSavedItemKeys((prev) => new Set(prev).add(itemKey));

      showStatus(
        item.outstatus === 'SHIPPED'
          ? `Shipment marked as SHIPPED with Docket #${item.outcourierdocketno} via ${item.outcouriername}!${notifFeedback}`
          : `Shipment details saved successfully with Docket #${item.outcourierdocketno}.${notifFeedback}`,
        'success'
      );
    } catch (err: any) {
      console.error('Failed to save shipment item:', err);
      showStatus(err?.message || 'Failed to save shipment details.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  // Toggle order expansion
  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Filtered orders & items
  const filteredOrders = useMemo(() => {
    return groupedOrders
      .map((order) => {
        const filteredItems = order.items.filter((item) => {
          const itemKey = `${order.orderId}_${item.orderItemId}`;

          // Status filter: PACKING | READY_FOR_DISPATCH | CANCELLED | ALL
          if (statusFilter !== 'ALL') {
            const normalizedFilter = statusFilter.toUpperCase().trim().replace(/[\s_-]+/g, '_');
            const itemOutStatus = String(item.outstatus || '').toUpperCase().trim().replace(/[\s_-]+/g, '_');
            const itemFulfillment = String(item.fulfillmentstatus || '').toUpperCase().trim().replace(/[\s_-]+/g, '_');
            const orderDeliveryStatus = String(order.deliveryStatus || '').toUpperCase().trim().replace(/[\s_-]+/g, '_');

            const matchesStatus =
              itemOutStatus === normalizedFilter ||
              itemFulfillment === normalizedFilter ||
              orderDeliveryStatus === normalizedFilter ||
              (normalizedFilter === 'CANCELLED' && (
                itemOutStatus === 'CANCELED' ||
                itemFulfillment === 'CANCELED' ||
                orderDeliveryStatus === 'CANCELED'
              ));

            const isRecentlyUpdated = recentlyUpdatedItemKeys.has(itemKey);
            if (!matchesStatus && !isRecentlyUpdated) return false;
          }

          // Courier filter
          if (courierFilter !== 'ALL' && item.outcouriername !== courierFilter) {
            return false;
          }

          // Search query filter
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const pMatch = item.productName?.toLowerCase().includes(q);
            const orderMatch = order.orderNo?.toLowerCase().includes(q) || order.orderId?.toLowerCase().includes(q);
            const customerMatch = order.customerName?.toLowerCase().includes(q);
            const mobileMatch = order.customerMobile?.toLowerCase().includes(q);
            const courierMatch = item.outcouriername?.toLowerCase().includes(q);
            const docketMatch = item.outcourierdocketno?.toLowerCase().includes(q);
            if (!pMatch && !orderMatch && !customerMatch && !mobileMatch && !courierMatch && !docketMatch) {
              return false;
            }
          }

          return true;
        });

        return {
          ...order,
          items: filteredItems,
        };
      })
      .filter((order) => order.items.length > 0);
  }, [groupedOrders, statusFilter, courierFilter, searchQuery, recentlyUpdatedItemKeys]);

  // Pagination
  const totalOrdersCount = filteredOrders.length;
  const totalPages = Math.ceil(totalOrdersCount / limit) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return filteredOrders.slice(start, start + limit);
  }, [filteredOrders, currentPage, limit]);

  // Overall metrics count
  const metrics = useMemo(() => {
    let readyForDispatch = 0;
    let shippedCount = 0;
    let missingDocket = 0;
    let totalItems = 0;

    for (const ord of groupedOrders) {
      for (const it of ord.items) {
        totalItems++;
        if (it.outstatus === 'SHIPPED' || it.fulfillmentstatus === 'SHIPPED') {
          shippedCount++;
        } else if (it.outstatus === 'READY_FOR_DISPATCH' || it.fulfillmentstatus === 'READY_FOR_DISPATCH') {
          readyForDispatch++;
          if (!it.outcourierdocketno || it.outcourierdocketno.trim() === '') {
            missingDocket++;
          }
        }
      }
    }

    return {
      totalOrders: groupedOrders.length,
      totalItems,
      readyForDispatch,
      shippedCount,
      missingDocket,
    };
  }, [groupedOrders]);

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1750px] mx-auto text-slate-900 dark:text-slate-100 font-sans" id="create-shipment-container">
      {/* 1. Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-emerald-800 via-green-900 to-emerald-950 p-6 rounded-2xl text-white shadow-xl border border-green-700/50">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight uppercase">CREATE SHIPMENT</h1>
              <p className="text-xs md:text-sm text-green-100/90 mt-0.5">
                Grouped by <span className="font-mono text-emerald-300 font-bold">sales_orders.id</span> • Child Items stored in array • Grid-level controls
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchShipmentRecords}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-sm active:scale-95"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Records</span>
          </button>
        </div>
      </div>

      {/* 2. Notification Toast Alert */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-md transition ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
              : statusMessage.type === 'warning'
              ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
              : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-500 hover:text-slate-800">
            &times;
          </button>
        </div>
      )}

      {/* 3. KPI Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ready For Dispatch</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{metrics.readyForDispatch}</p>
          </div>
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 rounded-xl text-amber-600 dark:text-amber-400">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Shipped Items</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{metrics.shippedCount}</p>
          </div>
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl text-emerald-600 dark:text-emerald-400">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pending Docket #</p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{metrics.missingDocket}</p>
          </div>
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 rounded-xl text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Orders</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.totalOrders}</p>
          </div>
          <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300">
            <Hash className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4. Search & Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Order No, Customer, Mobile, Product, Courier, Docket..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
            <Filter className="w-3.5 h-3.5" />
            <span>Delivery Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="text-xs bg-emerald-50 dark:bg-slate-800 border border-emerald-300 dark:border-slate-700 rounded-xl px-3 py-2 font-extrabold text-emerald-900 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Eligible (SHIPPED / READY_FOR_DISPATCH / CANCELLED)</option>
            <option value="SHIPPED">SHIPPED</option>
            <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>

          <select
            value={courierFilter}
            onChange={(e) => {
              setCourierFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Couriers</option>
            {COURIER_PARTNERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <span className="text-xs font-bold text-slate-500 ml-1">
            Showing <strong className="text-slate-900 dark:text-white">{filteredOrders.length}</strong> orders
          </span>
        </div>
      </div>

      {/* 5. Grouped Orders Grid Table with Child Items */}
      <div className="space-y-4" id="create-shipment-grid">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 p-16 text-center text-slate-400 rounded-2xl border border-slate-200 dark:border-slate-800">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3 text-emerald-600" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Loading grouped records from shipment_brand_owner_fulfilment...
            </p>
          </div>
        ) : paginatedOrders.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-16 text-center text-slate-400 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Truck className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-200">
              No Orders Found Satisfying Status Criteria
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Orders packed with READY_FOR_DISPATCH status will appear here for courier docket assignment and dispatch.
            </p>
            {statusFilter !== 'ALL' && (
              <button
                onClick={() => setStatusFilter('ALL')}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              >
                View All Pipeline Orders
              </button>
            )}
          </div>
        ) : (
          paginatedOrders.map((order) => {
            const isExpanded = expandedOrderIds.has(order.orderId);

            return (
              <div
                key={order.orderId}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-100 dark:border-slate-800 shadow-sm overflow-hidden transition-all duration-200"
              >
                {/* Parent Order Header Row */}
                <div
                  onClick={() => toggleOrderExpand(order.orderId)}
                  className="p-4 bg-emerald-50/70 dark:bg-slate-800/80 border-b border-emerald-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none hover:bg-emerald-100/60 dark:hover:bg-slate-800 transition"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-slate-600"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-900 dark:text-emerald-300 bg-emerald-200/60 dark:bg-emerald-900/40 px-2 py-0.5 rounded-md">
                          ORDER NO : {order.orderNo}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {order.orderDate}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-700 dark:text-slate-300">
                        <span className="font-bold flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {order.customerName}
                        </span>
                        <span className="font-mono text-slate-500 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {order.customerMobile}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
                      {order.items.length} Product{order.items.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Child Items Table with Grid-Level Controls */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">
                        <tr>
                          <th className="py-2.5 px-3 min-w-[200px]">Product Details</th>
                          <th className="py-2.5 px-2 text-center min-w-[80px]">Pack Size</th>
                          <th className="py-2.5 px-2 text-center min-w-[60px]">Unit</th>
                          <th className="py-2.5 px-2 text-center min-w-[60px]">Qty</th>
                          <th className="py-2.5 px-2 min-w-[150px]">Out Status</th>
                          <th className="py-2.5 px-2 text-center min-w-[120px]">Fulfillment Status</th>
                          <th className="py-2.5 px-2 min-w-[130px]">Pickup Date</th>
                          <th className="py-2.5 px-2 min-w-[160px]">Courier Partner</th>
                          <th className="py-2.5 px-2 min-w-[160px]">Courier Docket No *</th>
                          <th className="py-2.5 px-2 min-w-[180px]">Delay Reasons</th>
                          <th className="py-2.5 px-3 text-center min-w-[160px]">Action</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {order.items.map((item) => {
                          const itemKey = `${order.orderId}_${item.orderItemId}`;
                          const isSaving = savingKey === itemKey;
                          const isSaved = savedItemKeys.has(itemKey);
                          const isSendingWa = waSendingKey === itemKey;
                          const isDocketMissing = !item.outcourierdocketno || item.outcourierdocketno.trim() === '';

                          return (
                            <tr
                              key={item.orderItemId}
                              className={`transition-colors ${
                                isSaved
                                  ? 'bg-[#B9EBFF] hover:bg-[#A5E3FC] text-slate-900'
                                  : 'hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {/* 1. Product Name & SKU */}
                              <td className="py-3 px-3">
                                <div className="flex items-start gap-2">
                                  <Package className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                  <div>
                                    <div className="font-extrabold text-slate-900 dark:text-white line-clamp-2" title={item.productName}>
                                      {item.productName}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      {item.brandOwnerName && item.brandOwnerName !== 'Not Assigned' ? `Brand: ${item.brandOwnerName}` : ''}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 2. Pack Size = shipment_brand_owner_fulfilment.items[].orderpackingsize (Disabled) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <input
                                  type="text"
                                  value={item.orderpackingsize}
                                  disabled
                                  readOnly
                                  className="w-20 text-center px-1.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 cursor-not-allowed font-medium"
                                />
                              </td>

                              {/* 3. Out Unit (Disabled) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <input
                                  type="text"
                                  value={item.outunit}
                                  disabled
                                  readOnly
                                  className="w-14 text-center px-1.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 cursor-not-allowed font-medium"
                                />
                              </td>

                              {/* 4. Out Quantity (Disabled) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <input
                                  type="number"
                                  value={item.outquantity}
                                  disabled
                                  readOnly
                                  className="w-14 text-center px-1.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-lg border border-slate-200 dark:border-slate-700 cursor-not-allowed"
                                />
                              </td>

                              {/* 5. Out Status Combo Box (Grid-Level Control) */}
                              <td className="py-3 px-2 whitespace-nowrap">
                                <select
                                  value={item.outstatus}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'outstatus', e.target.value as ShipmentStatusOption)
                                  }
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500 ${
                                    item.outstatus === 'SHIPPED'
                                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700'
                                      : item.outstatus === 'CANCELLED'
                                      ? 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700'
                                      : item.outstatus === 'READY_FOR_DISPATCH'
                                      ? 'bg-lime-50 text-lime-900 border-lime-300 dark:bg-lime-950/60 dark:text-lime-200 dark:border-lime-700'
                                      : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700'
                                  }`}
                                >
                                  <option value="PACKING">PACKING</option>
                                  <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                                  <option value="SHIPPED">SHIPPED</option>
                                  <option value="CANCELLED">CANCELLED</option>
                                </select>
                              </td>

                              {/* 6. Fulfillment Status Badge */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black border ${
                                    item.fulfillmentstatus === 'SHIPPED'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : item.fulfillmentstatus === 'CANCELLED'
                                      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                                      : item.fulfillmentstatus === 'READY_FOR_DISPATCH'
                                      ? 'bg-lime-100 text-lime-800 border-lime-300 dark:bg-lime-950/60 dark:text-lime-300'
                                      : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                                  }`}
                                >
                                  {item.fulfillmentstatus}
                                </span>
                              </td>

                              {/* 7. Pickup Date (Grid-Level Control) */}
                              <td className="py-3 px-2 whitespace-nowrap">
                                <input
                                  type="date"
                                  value={item.outpickupdate}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'outpickupdate', e.target.value)
                                  }
                                  className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>

                              {/* 8. Courier Partner Combo Box (Grid-Level Control) */}
                              <td className="py-3 px-2 whitespace-nowrap">
                                <select
                                  value={item.outcouriername}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'outcouriername', e.target.value)
                                  }
                                  className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                                >
                                  {COURIER_PARTNERS.map((cp) => (
                                    <option key={cp} value={cp}>
                                      {cp}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* 9. Courier Docket No (Mandatory Grid-Level Control) */}
                              <td className="py-3 px-2 whitespace-nowrap">
                                <input
                                  type="text"
                                  placeholder="Docket No (Req) *"
                                  value={item.outcourierdocketno}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'outcourierdocketno', e.target.value)
                                  }
                                  className={`w-36 px-2.5 py-1 text-xs rounded-lg font-mono font-bold outline-none border focus:ring-2 ${
                                    isDocketMissing
                                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-900 dark:text-amber-200 focus:ring-amber-500 placeholder-amber-400'
                                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-emerald-700 dark:text-emerald-300 focus:ring-emerald-500'
                                  }`}
                                />
                              </td>

                              {/* 10. Delay Reasons (Max 70 chars Grid-Level Control) */}
                              <td className="py-3 px-2 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <input
                                    type="text"
                                    placeholder="Optional (Max 70 chars)"
                                    maxLength={70}
                                    value={item.outdealyreasons}
                                    onChange={(e) =>
                                      handleItemFieldChange(order.orderId, item.orderItemId, 'outdealyreasons', e.target.value)
                                    }
                                    className="w-44 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <span className="text-[10px] text-slate-400 text-right mt-0.5">
                                    {item.outdealyreasons?.length || 0}/70
                                  </span>
                                </div>
                              </td>

                              {/* 11. Actions: Save & WhatsApp */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isDocketMissing || isSaving || isSaved}
                                    onClick={() => handleSaveItem(order, item)}
                                    title={isSaved ? 'Record Saved' : isDocketMissing ? 'Enter Courier Docket No to enable Save' : 'Save Item Shipment'}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs ${
                                      isSaved
                                        ? 'bg-sky-200 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700 cursor-not-allowed shadow-none'
                                        : isDocketMissing || isSaving
                                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed shadow-none'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 cursor-pointer active:scale-95'
                                    }`}
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>{isSaving ? 'Saving...' : isSaved ? 'Saved' : 'Save'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isSendingWa}
                                    onClick={() => handleSendWhatsAppNotification(order.orderId, item)}
                                    title="Send WhatsApp shipment notification"
                                    className="p-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-800 transition cursor-pointer active:scale-95"
                                  >
                                    <Send className={`w-3.5 h-3.5 ${isSendingWa ? 'animate-pulse' : ''}`} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Pagination Footer */}
        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Orders per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-bold text-xs cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
            </select>
            <span className="text-slate-400 ml-2">
              Page {currentPage} of {totalPages} ({totalOrdersCount} Total Orders)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-extrabold text-slate-700 dark:text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateShipmentView;
