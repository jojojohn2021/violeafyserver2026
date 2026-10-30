import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Search,
  RefreshCw,
  AlertTriangle,
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
  ChevronDown,
  ChevronUp,
  Truck,
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
import { migrateFulfilmentItem } from '../utils/fulfilmentItem';
import { ProductPerformance } from '../types';

export type ConfirmDeliveryStatusOption = 'SHIPPED' | 'COMPLETED';

export interface ConfirmDeliveryGridRow {
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
  Outpackingsize: string;
  outunit: string;
  outquantity: number;
  outstatus: ConfirmDeliveryStatusOption;
  fulfillmentstatus: string;
  // Status as loaded from Firestore; grid filtering uses this so in-grid edits don't hide rows until refresh
  loadedStatus: ConfirmDeliveryStatusOption;
  outpickupdate: string;
  outcouriername: string;
  outcourierdocketno: string;
  outdealyreasons: string;
  deliverydate: string;
  deliverycondition: string;

  // Additional metadata & raw records
  outpackdate?: string;
  sku?: string;
  rawDoc?: any;
}

export interface GroupedConfirmDeliveryOrder {
  orderId: string; // sales_orders.id
  orderNo: string;
  orderDate: string;
  customerName: string;
  customerMobile: string;
  fulfilmentStatus: string;
  items: ConfirmDeliveryGridRow[];
}

export const ConfirmDeliveryView: React.FC = () => {
  const { products: globalProducts, salesOrders: globalSalesOrders } = useCRM();
  const [productsMaster, setProductsMaster] = useState<ProductPerformance[]>([]);
  const [salesOrdersMaster, setSalesOrdersMaster] = useState<any[]>([]);
  const [groupedOrders, setGroupedOrders] = useState<GroupedConfirmDeliveryOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'SHIPPED' | 'COMPLETED' | 'ALL'>('SHIPPED');

  // Track recently updated item IDs so they remain visible in grid
  const [recentlyUpdatedItemKeys, setRecentlyUpdatedItemKeys] = useState<Set<string>>(new Set());

  // Header-level bulk values per order (cascades to all child rows)
  type DeliveryHeaderEdit = {
    outstatus?: ConfirmDeliveryStatusOption;
    deliverydate?: string;
    deliverycondition?: string;
    outdealyreasons?: string;
  };
  const [headerEdits, setHeaderEdits] = useState<Record<string, DeliveryHeaderEdit>>({});
  const [headerSavingId, setHeaderSavingId] = useState<string | null>(null);
  const [confirmSaveOrder, setConfirmSaveOrder] = useState<GroupedConfirmDeliveryOrder | null>(null);

  // Track saved items to disable save button and highlight row light sky-blue
  const [savedItemKeys, setSavedItemKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('delivery_saved_item_keys');
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('delivery_saved_item_keys', JSON.stringify(Array.from(savedItemKeys)));
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

  // Fetch and group delivery records by sales_orders.id
  const fetchDeliveryRecords = async () => {
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

      const orderGroupsMap = new Map<string, GroupedConfirmDeliveryOrder>();

      for (const doc of rawDocs) {
        const docSalesOrderId = String(doc.salesOrderId || (doc.items && doc.items[0]?.salesOrderId) || '').trim();
        const fallbackId = (!String(doc.id).startsWith('boa_') && !String(doc.id).startsWith('item_') && !String(doc.id).startsWith('ship_')) ? String(doc.id) : '';
        const salesOrderId = docSalesOrderId || String(doc.orderId || doc.orderNumber || fallbackId || '').trim();
        if (!salesOrderId) continue;

        const matchedOrder = resolveSalesOrder(salesOrderId);

        // Scope: Delivery Status must be SHIPPED or COMPLETED (DELIVERED treated as COMPLETED)
        const DELIVERY_SCOPE = ['SHIPPED', 'COMPLETED', 'DELIVERED'];
        const docDeliveryStatus = String(
          doc.deliveryStatus || matchedOrder?.deliveryStatus || ''
        ).toUpperCase().trim();
        if (docDeliveryStatus && !DELIVERY_SCOPE.includes(docDeliveryStatus)) continue;
        const orderNo = String(matchedOrder?.orderNumber || doc.orderNumber || doc.orderNo || salesOrderId);
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
            fulfilmentStatus: String(doc.fulfilmentStatus || doc.fulfillmentstatus || doc.outstatus || 'SHIPPED'),
            items: [],
          });
        }

        const group = orderGroupsMap.get(salesOrderId)!;
        const rawItems = Array.isArray(doc.items) && doc.items.length > 0 ? doc.items : [doc];

        for (let idx = 0; idx < rawItems.length; idx++) {
          const item = rawItems[idx];
          const orderItemId = String(item.orderItemId || item.itemId || item.productId || `item_${idx}`);
          const productId = String(item.productId || '');
          const brandOwnerAssignid = String(item.brandOwnerAssignid || doc.brandOwnerAssignid || doc.id || `boa_${idx}`);
          const brandOwnerName = String(item.brandOwnerName || doc.brandOwnerName || 'Not Assigned');

          const orderpackingsize = String(
            item.orderpackingsize ??
            item.packingsize ??
            'Standard'
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

          const itemRawStatus = String(item.outstatus || item.fulfillmentstatus || '').toUpperCase().trim();
          // Item-level scope check only when the document has no delivery status
          if (!docDeliveryStatus && !DELIVERY_SCOPE.includes(itemRawStatus)) continue;
          const effectiveStatus = DELIVERY_SCOPE.includes(itemRawStatus) ? itemRawStatus : docDeliveryStatus;
          const outstatus: ConfirmDeliveryStatusOption = effectiveStatus === 'SHIPPED' ? 'SHIPPED' : 'COMPLETED';
          const fulfillmentstatus = outstatus;

          const outpickupdate = String(item.outpickupdate || systemDate);
          const outcouriername = String(item.outcouriername || item.couriername || 'Delhivery');
          const outcourierdocketno = String(item.outcourierdocketno || item.courierdocketno || '');
          const outdealyreasons = String(item.outdealyreasons || '').slice(0, 70);
          const deliverydate = String(item.deliverydate || systemDate);
          const deliverycondition = String(item.deliverycondition || 'Good Condition').slice(0, 50);
          const productName = resolveProductName(orderItemId, productId, item.productName || item.name);

          const existingItemIndex = group.items.findIndex(
            (i) => i.orderItemId === orderItemId || (i.productId && i.productId === productId && productId !== '')
          );

          const itemRow: ConfirmDeliveryGridRow = {
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
            loadedStatus: outstatus,
            fulfillmentstatus,
            outpickupdate,
            outcouriername,
            outcourierdocketno,
            outdealyreasons,
            deliverydate,
            deliverycondition,
            outpackdate: item.outpackdate,
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
      setExpandedOrderIds(new Set(allGroups.map((g) => g.orderId)));
    } catch (err: any) {
      console.error('Failed to load delivery records:', err);
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
    fetchDeliveryRecords();
  }, [productsMaster, salesOrdersMaster]);

  // Handle in-grid field changes for an item
  const handleItemFieldChange = (orderId: string, orderItemId: string, field: keyof ConfirmDeliveryGridRow, val: any) => {
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

  // Header bulk edit: updates header state and cascades to all unsaved child rows
  const handleHeaderFieldChange = <K extends keyof DeliveryHeaderEdit>(
    orderId: string,
    field: K,
    val: DeliveryHeaderEdit[K]
  ) => {
    setHeaderEdits((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || {}), [field]: val },
    }));
    setGroupedOrders((prevOrders) =>
      prevOrders.map((ord) => {
        if (ord.orderId !== orderId) return ord;
        return {
          ...ord,
          items: ord.items.map((it) => {
            if (savedItemKeys.has(`${orderId}_${it.orderItemId}`)) return it;
            const updated: ConfirmDeliveryGridRow = { ...it, [field]: val as any };
            if (field === 'outstatus') {
              updated.fulfillmentstatus = val as any;
            }
            return updated;
          }),
        };
      })
    );
  };

  // Prompt confirmation before saving all child items of an order using header values
  const handleRequestSaveOrderHeader = (order: GroupedConfirmDeliveryOrder) => {
    const header = headerEdits[order.orderId] || {};
    const effectiveCondition = header.deliverycondition ?? 'Good Condition';
    const effectiveDelay = header.outdealyreasons ?? '';

    if (effectiveCondition.length > 50) {
      showStatus('Validation Error: Delivery condition cannot exceed 50 characters.', 'error');
      return;
    }
    if (effectiveDelay.length > 70) {
      showStatus('Validation Error: Delay reasons cannot exceed 70 characters.', 'error');
      return;
    }

    const fullOrder = groupedOrders.find((o) => o.orderId === order.orderId) || order;
    const unsavedCount = fullOrder.items.filter(
      (it) => !savedItemKeys.has(`${order.orderId}_${it.orderItemId}`)
    ).length;

    if (unsavedCount === 0) {
      showStatus(`All items in Order #${order.orderNo} are already saved.`, 'warning');
      return;
    }

    setConfirmSaveOrder(order);
  };

  // Save all child items of an order using header values
  const handleSaveOrderHeader = async (order: GroupedConfirmDeliveryOrder) => {
    setConfirmSaveOrder(null);
    const header = headerEdits[order.orderId] || {};
    const effectiveDeliveryDate = header.deliverydate || getSystemDate();
    const effectiveCondition = header.deliverycondition ?? 'Good Condition';
    const effectiveDelay = header.outdealyreasons ?? '';

    if (effectiveCondition.length > 50) {
      showStatus('Validation Error: Delivery condition cannot exceed 50 characters.', 'error');
      return;
    }
    if (effectiveDelay.length > 70) {
      showStatus('Validation Error: Delay reasons cannot exceed 70 characters.', 'error');
      return;
    }

    const fullOrder = groupedOrders.find((o) => o.orderId === order.orderId) || order;
    const targetStatus: ConfirmDeliveryStatusOption = header.outstatus || 'COMPLETED';
    const itemsToSave = fullOrder.items
      .filter((it) => !savedItemKeys.has(`${order.orderId}_${it.orderItemId}`))
      .map((it) => {
        const merged: ConfirmDeliveryGridRow = {
          ...it,
          outstatus: targetStatus,
          fulfillmentstatus: targetStatus,
          deliverydate: header.deliverydate || it.deliverydate || effectiveDeliveryDate,
          deliverycondition: header.deliverycondition !== undefined ? header.deliverycondition : (it.deliverycondition || 'Good Condition'),
          outdealyreasons: header.outdealyreasons !== undefined ? header.outdealyreasons : it.outdealyreasons,
        };
        return merged;
      });

    if (itemsToSave.length === 0) {
      showStatus(`All items in Order #${order.orderNo} are already saved.`, 'warning');
      return;
    }

    setGroupedOrders((prev) =>
      prev.map((ord) =>
        ord.orderId === order.orderId
          ? {
              ...ord,
              items: ord.items.map((it) => itemsToSave.find((m) => m.orderItemId === it.orderItemId) || it),
            }
          : ord
      )
    );

    setHeaderSavingId(order.orderId);
    let okCount = 0;
    try {
      for (const it of itemsToSave) {
        const ok = await handleSaveItem(fullOrder, it, { silent: true });
        if (ok) okCount++;
      }
      if (okCount === itemsToSave.length) {
        showStatus(`Saved all ${okCount} item(s) for Order #${order.orderNo}.`, 'success');
      } else if (okCount > 0) {
        showStatus(`Saved ${okCount}/${itemsToSave.length} item(s) for Order #${order.orderNo}.`, 'warning');
      }
    } finally {
      setHeaderSavingId(null);
    }
  };

  // Direct WhatsApp notification from grid
  const handleSendWhatsAppNotification = async (orderId: string, item: ConfirmDeliveryGridRow) => {
    const itemKey = `${orderId}_${item.orderItemId}`;
    setWaSendingKey(itemKey);
    try {
      const stage = item.outstatus === 'COMPLETED' ? 'Delivered' : 'Shipped';
      const res = await apiFetch(`/api/operations/orders/${orderId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          metadata: {
            status: item.outstatus,
            productName: item.productName,
            deliveryDate: item.deliverydate,
            deliveryCondition: item.deliverycondition,
            trackingNumber: item.outcourierdocketno,
            courierName: item.outcouriername,
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
        showStatus(data.error || 'Failed to send WhatsApp message. Check Firestore configuration.', 'error');
      }
    } catch (err: any) {
      showStatus(`Network error: ${err.message || 'Unable to communicate with server'}`, 'error');
    } finally {
      setWaSendingKey(null);
    }
  };

  // Direct Save Item from Grid
  const handleSaveItem = async (
    order: GroupedConfirmDeliveryOrder,
    item: ConfirmDeliveryGridRow,
    opts?: { silent?: boolean }
  ): Promise<boolean> => {
    // 1. Validation: deliverycondition <= 50 chars
    if (item.deliverycondition && item.deliverycondition.length > 50) {
      showStatus(`Validation Error: Delivery condition cannot exceed 50 characters.`, 'error');
      return false;
    }

    // 2. Validation: outdealyreasons <= 70 chars
    if (item.outdealyreasons && item.outdealyreasons.length > 70) {
      showStatus(`Validation Error: Delay reasons cannot exceed 70 characters.`, 'error');
      return false;
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
        itemstatus: item.outstatus === 'COMPLETED' ? 'COMPLETED' : 'SHIPPED',
        itemdeliverystatus: item.outstatus === 'COMPLETED' ? 'DELIVERED' : 'IN_TRANSIT',
        outpickupdate: item.outpickupdate,
        outcouriername: item.outcouriername,
        outcourierdocketno: item.outcourierdocketno,
        outdealyreasons: (item.outdealyreasons || '').trim().slice(0, 70),
        deliverydate: item.deliverydate,
        deliverycondition: (item.deliverycondition || '').trim().slice(0, 50),
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
            status: item.outstatus,
            outstatus: item.outstatus,
            fulfillmentstatus: item.outstatus,
            deliveryStatus: updatedChildDoc.itemdeliverystatus || item.outstatus,
            deliverystatus: updatedChildDoc.itemdeliverystatus,
            updatedAt: now,
          });
        } else {
          const newParentDoc = {
            id: parentDocId,
            salesOrderId: String(order.orderId),
            orderNumber: String(order.orderNo || order.orderId),
            customerName: String(order.customerName || ''),
            customerMobile: String(order.customerMobile || ''),
            deliveryStatus: updatedChildDoc.itemdeliverystatus || 'DELIVERED',
            status: item.outstatus,
            outstatus: item.outstatus,
            fulfillmentstatus: item.outstatus,
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
            deliverystatus: updatedChildDoc.itemdeliverystatus,
            outpackingstatus: 'PACKED',
            updatedby: auth?.currentUser?.email || auth?.currentUser?.uid || 'Ops Admin',
          });
        } catch (auditErr) {
          console.warn('[ConfirmDeliveryView] Warning creating shipment_tracking audit log:', auditErr);
        }
      } else {
        // Ensure top-level status, outstatus, and fulfillmentstatus on parent doc are synced in Firestore
        const parentDocId = `fulfil_${order.orderId}`;
        try {
          const existingParent = await shipmentBrandOwnerAssignmentRepository.getById(parentDocId);
          if (existingParent) {
            await shipmentBrandOwnerAssignmentRepository.update(parentDocId, {
              ...existingParent,
              status: item.outstatus,
              outstatus: item.outstatus,
              fulfillmentstatus: item.outstatus,
              deliveryStatus: updatedChildDoc.itemdeliverystatus || item.outstatus,
              updatedAt: now,
            });
          }
        } catch (syncErr) {
          console.warn('[ConfirmDeliveryView] Warning syncing parent status fields:', syncErr);
        }
      }

      setRecentlyUpdatedItemKeys((prev) => new Set(prev).add(itemKey));
      setSavedItemKeys((prev) => new Set(prev).add(itemKey));

      if (!opts?.silent) {
        showStatus(
          item.outstatus === 'COMPLETED'
            ? `Delivery confirmed as COMPLETED for ${item.productName}! Condition: '${item.deliverycondition}'.${notifFeedback}`
            : `Record saved successfully! Status: '${item.outstatus}'.${notifFeedback}`,
          'success'
        );
      }
      return true;
    } catch (err: any) {
      console.error('Failed to save delivery confirmation:', err);
      showStatus(err?.message || 'Failed to save delivery confirmation.', 'error');
      return false;
    } finally {
      setSavingKey(null);
    }
  };

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

  // Filtered orders & items (sorted with SHIPPED records at the top)
  const filteredOrders = useMemo(() => {
    const isShippedItem = (it: ConfirmDeliveryGridRow) =>
      String(it.loadedStatus || it.fulfillmentstatus || it.outstatus || '').toUpperCase() === 'SHIPPED';

    return groupedOrders
      .map((order) => {
        const filteredItems = order.items
          .filter((item) => {
            // Filter on the status captured at load time, so editing the
            // Fulfillment Status dropdown never hides a row until next refresh.
            if (statusFilter === 'SHIPPED' && item.loadedStatus !== 'SHIPPED') return false;
            if (statusFilter === 'COMPLETED' && item.loadedStatus !== 'COMPLETED') return false;

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
          })
          .sort((a, b) => (isShippedItem(b) ? 1 : 0) - (isShippedItem(a) ? 1 : 0));

        return {
          ...order,
          items: filteredItems,
        };
      })
      .filter((order) => order.items.length > 0)
      .sort((a, b) => {
        const aHasShipped =
          a.items.some(isShippedItem) || String(a.fulfilmentStatus || '').toUpperCase() === 'SHIPPED';
        const bHasShipped =
          b.items.some(isShippedItem) || String(b.fulfilmentStatus || '').toUpperCase() === 'SHIPPED';
        if (aHasShipped !== bHasShipped) {
          return aHasShipped ? -1 : 1;
        }
        return 0;
      });
  }, [groupedOrders, statusFilter, searchQuery, recentlyUpdatedItemKeys]);

  const totalOrdersCount = filteredOrders.length;
  const totalPages = Math.ceil(totalOrdersCount / limit) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return filteredOrders.slice(start, start + limit);
  }, [filteredOrders, currentPage, limit]);

  const metrics = useMemo(() => {
    let shippedCount = 0;
    let completedCount = 0;
    let totalItems = 0;

    for (const ord of groupedOrders) {
      for (const it of ord.items) {
        totalItems++;
        if (it.outstatus === 'COMPLETED' || it.fulfillmentstatus === 'COMPLETED') {
          completedCount++;
        } else {
          shippedCount++;
        }
      }
    }

    return {
      totalOrders: groupedOrders.length,
      totalItems,
      shippedCount,
      completedCount,
    };
  }, [groupedOrders]);

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1750px] mx-auto text-slate-900 dark:text-slate-100 font-sans" id="confirm-delivery-container">
      {/* 1. Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-emerald-800 via-green-900 to-emerald-950 p-6 rounded-2xl text-white shadow-xl border border-green-700/50">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight uppercase">CONFIRM DELIVERY</h1>
              <p className="text-xs md:text-sm text-green-100/90 mt-0.5">
                Grouped by <span className="font-mono text-emerald-300 font-bold">sales_orders.id</span> • Child Items stored in array • Grid-level controls
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchDeliveryRecords}
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
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">In Transit / Shipped</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{metrics.shippedCount}</p>
          </div>
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 rounded-xl text-amber-600 dark:text-amber-400">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Delivery Completed</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{metrics.completedCount}</p>
          </div>
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Products</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.totalItems}</p>
          </div>
          <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300">
            <Package className="w-5 h-5" />
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
            <span>Fulfillment Status:</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-emerald-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            {(['SHIPPED', 'COMPLETED', 'ALL'] as const).map((opt) => {
              const active = statusFilter === opt;
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition select-none ${
                    active
                      ? 'bg-emerald-600 !text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="confirm-delivery-status-filter"
                    value={opt}
                    checked={active}
                    onChange={() => {
                      setStatusFilter(opt);
                      setPage(1);
                    }}
                    className="accent-emerald-600 cursor-pointer"
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>

          <span className="text-xs font-bold text-slate-500 ml-1">
            Showing <strong className="text-slate-900 dark:text-white">{filteredOrders.length}</strong> orders
          </span>
        </div>
      </div>

      {/* 5. Grouped Orders Grid Table with Child Items */}
      <div className="space-y-4" id="confirm-delivery-grid">
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
              Dispatched orders with SHIPPED status will appear here for delivery receipt confirmation.
            </p>
            {statusFilter !== 'ALL' && (
              <button
                onClick={() => setStatusFilter('ALL')}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              >
                View All Delivery Records
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-900 dark:text-emerald-300 bg-emerald-200/60 dark:bg-emerald-900/40 px-2 py-0.5 rounded-md">
                          Order #{order.orderNo}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {order.orderDate}
                        </span>
                        {(() => {
                          const currentFulfillmentStatus = String(
                            order.items[0]?.fulfillmentstatus || order.items[0]?.outstatus || order.fulfilmentStatus || 'SHIPPED'
                          ).toUpperCase();
                          const isCompleted = currentFulfillmentStatus === 'COMPLETED';
                          return (
                            <span
                              className={`text-xs font-extrabold px-2.5 py-0.5 rounded-md border shadow-2xs ${
                                isCompleted
                                  ? 'bg-emerald-500 text-white border-emerald-600'
                                  : 'bg-amber-400 text-slate-950 border-amber-500'
                              }`}
                            >
                              {currentFulfillmentStatus}
                            </span>
                          );
                        })()}
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

                  {/* Header bulk controls: cascade to all child rows */}
                  {(() => {
                    const header = headerEdits[order.orderId] || {};
                    const fullOrder = groupedOrders.find((o) => o.orderId === order.orderId) || order;
                    const allSaved = fullOrder.items.every((it) => savedItemKeys.has(`${order.orderId}_${it.orderItemId}`));
                    const isHeaderSaving = headerSavingId === order.orderId;
                    const lockHeader = allSaved || isHeaderSaving;
                    const headerStatus = header.outstatus || 'COMPLETED';
                    const ctl =
                      'px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed';
                    return (
                      <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-2 cursor-default">
                        <input
                          type="text"
                          value={headerStatus}
                          disabled
                          readOnly
                          title="Fulfillment Status (default: COMPLETED)"
                          className="px-2.5 py-1 text-xs w-32 font-extrabold text-center rounded-lg bg-emerald-100 text-emerald-950 border-2 border-emerald-500 shadow-2xs disabled:opacity-100 cursor-not-allowed"
                        />

                        <input
                          type="date"
                          value={header.deliverydate || getSystemDate()}
                          disabled={lockHeader}
                          onChange={(e) => handleHeaderFieldChange(order.orderId, 'deliverydate', e.target.value)}
                          title="Delivery Date (applies to all items)"
                          className={`${ctl} cursor-pointer`}
                        />

                        <input
                          type="text"
                          maxLength={50}
                          placeholder="Delivery condition (Max 50)"
                          value={header.deliverycondition ?? ''}
                          disabled={lockHeader}
                          onChange={(e) => handleHeaderFieldChange(order.orderId, 'deliverycondition', e.target.value)}
                          title="Delivery Condition (applies to all items)"
                          className={`${ctl} w-44`}
                        />

                        <input
                          type="text"
                          maxLength={70}
                          placeholder="Delay reasons (all items)"
                          value={header.outdealyreasons || ''}
                          disabled={lockHeader}
                          onChange={(e) => handleHeaderFieldChange(order.orderId, 'outdealyreasons', e.target.value)}
                          title="Delay Reasons (applies to all items)"
                          className={`${ctl} w-44`}
                        />

                        <button
                          type="button"
                          disabled={lockHeader}
                          onClick={() => handleRequestSaveOrderHeader(order)}
                          title={allSaved ? 'All items saved' : 'Save and apply to all items'}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                            allSaved
                              ? 'bg-sky-200 text-sky-800 border border-sky-300 cursor-not-allowed'
                              : isHeaderSaving
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              : 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer active:scale-95'
                          }`}
                        >
                          {allSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                          <span>{isHeaderSaving ? 'Saving All...' : allSaved ? 'All Saved' : 'Save All'}</span>
                        </button>

                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
                          {order.items.length} Product{order.items.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Child Items Table with Grid-Level Controls */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">
                        <tr>
                          <th className="py-2.5 px-3 min-w-[200px]">Product Details</th>
                          <th className="py-2.5 px-2 text-center min-w-[70px]">Qty</th>
                          <th className="py-2.5 px-2 min-w-[140px]">Courier Partner</th>
                          <th className="py-2.5 px-2 min-w-[140px]">Docket No</th>
                          <th className="hidden py-2.5 px-2 min-w-[140px]">Fulfillment Status</th>
                          <th className="hidden py-2.5 px-2 min-w-[130px]">Delivery Date</th>
                          <th className="hidden py-2.5 px-2 min-w-[170px]">Delivery Condition (Max 50)</th>
                          <th className="hidden py-2.5 px-2 min-w-[170px]">Delay Reasons (Max 70)</th>
                          <th className="hidden py-2.5 px-3 text-center min-w-[80px]">Action</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {order.items.map((item) => {
                          const itemKey = `${order.orderId}_${item.orderItemId}`;
                          const isSaving = savingKey === itemKey || headerSavingId === order.orderId;
                          const isSaved = savedItemKeys.has(itemKey);
                          const isSendingWa = waSendingKey === itemKey;

                          return (
                            <tr
                              key={item.orderItemId}
                              className={`transition-colors ${
                                isSaved
                                  ? 'bg-[#B9EBFF] hover:bg-[#A5E3FC] text-slate-900'
                                  : 'hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {/* 1. Product Details */}
                              <td className="py-3 px-3">
                                <div className="flex items-start gap-2">
                                  <Package className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                  <div>
                                    <div className="font-extrabold text-slate-900 dark:text-white line-clamp-2" title={item.productName}>
                                      {item.productName}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                      {item.Outpackingsize} • {item.outunit}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 2. Quantity (Disabled) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <span className="font-extrabold text-emerald-800 dark:text-emerald-300">
                                  {item.outquantity}
                                </span>
                              </td>

                              {/* 3. Courier Partner (Disabled) */}
                              <td className="py-3 px-2 whitespace-nowrap text-slate-700 dark:text-slate-300 font-semibold">
                                {item.outcouriername || 'Delhivery'}
                              </td>

                              {/* 4. Courier Docket No (Disabled) */}
                              <td className="py-3 px-2 whitespace-nowrap font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                {item.outcourierdocketno || '-'}
                              </td>

                              {/* 5. Out Status / Fulfillment Status (Grid-Level Combo Box) */}
                              <td className="hidden py-3 px-2 whitespace-nowrap">
                                <select
                                  value={item.outstatus}
                                  onChange={(e) =>
                                    handleItemFieldChange(
                                      order.orderId,
                                      item.orderItemId,
                                      'outstatus',
                                      e.target.value as ConfirmDeliveryStatusOption
                                    )
                                  }
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500 ${
                                    item.outstatus === 'COMPLETED'
                                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700'
                                      : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700'
                                  }`}
                                >
                                  <option value="SHIPPED">SHIPPED</option>
                                  <option value="COMPLETED">COMPLETED</option>
                                </select>
                              </td>

                              {/* 6. Delivery Date (Grid-Level Date Input) */}
                              <td className="hidden py-3 px-2 whitespace-nowrap">
                                <input
                                  type="date"
                                  value={item.deliverydate}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'deliverydate', e.target.value)
                                  }
                                  className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>

                              {/* 7. Delivery Condition (Grid-Level text input max 50 chars) */}
                              <td className="hidden py-3 px-2 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <input
                                    type="text"
                                    placeholder="Good Condition (Max 50)"
                                    maxLength={50}
                                    value={item.deliverycondition}
                                    onChange={(e) =>
                                      handleItemFieldChange(order.orderId, item.orderItemId, 'deliverycondition', e.target.value)
                                    }
                                    className="w-40 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <span className="text-[10px] text-slate-400 text-right mt-0.5">
                                    {item.deliverycondition?.length || 0}/50
                                  </span>
                                </div>
                              </td>

                              {/* 8. Delay Reasons (Grid-Level text input max 70 chars) */}
                              <td className="hidden py-3 px-2 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <input
                                    type="text"
                                    placeholder="Optional (Max 70 chars)"
                                    maxLength={70}
                                    value={item.outdealyreasons}
                                    onChange={(e) =>
                                      handleItemFieldChange(order.orderId, item.orderItemId, 'outdealyreasons', e.target.value)
                                    }
                                    className="w-40 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <span className="text-[10px] text-slate-400 text-right mt-0.5">
                                    {item.outdealyreasons?.length || 0}/70
                                  </span>
                                </div>
                              </td>

                              {/* 9. Actions: Save & WhatsApp */}
                              <td className="hidden py-3 px-3 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isSaving || isSaved}
                                    onClick={() => handleSaveItem(order, item)}
                                    title={isSaved ? 'Record Saved' : 'Save Delivery Status'}
                                    className={`hidden px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs ${
                                      isSaved
                                        ? 'bg-sky-200 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700 cursor-not-allowed shadow-none'
                                        : isSaving
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
                                    title="Send WhatsApp delivery notification"
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

      {/* Save Record Confirmation Popup */}
      {confirmSaveOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setConfirmSaveOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                <Save className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Save Record</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Order #{confirmSaveOrder.orderNo}
                </p>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Do you want to save the delivery confirmation record for Order #{confirmSaveOrder.orderNo}?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSaveOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => handleSaveOrderHeader(confirmSaveOrder)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition cursor-pointer active:scale-95"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfirmDeliveryView;
