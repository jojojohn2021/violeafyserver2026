import React, { useState, useEffect, useMemo } from 'react';
import {
  PackageCheck,
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
import { migrateFulfilmentItem } from '../utils/fulfilmentItem';
import { ProductPerformance } from '../types';

export type PackingStatusOption = 'READY_FOR_DISPATCH' | 'PACKING' | 'CANCELLED';

export interface PackingGridRow {
  // Hidden fields
  id: string; // id = hidden
  shipid?: string;
  brandOwnerAssignid: string; // brandOwnerAssignid = Hidden
  orderItemId: string; // orderItemId = hidden
  salesOrderId?: string;
  productId?: string;

  // Visual/Editable columns
  outpackdate: string;
  brandOwnerName: string;
  productName: string;
  orderpackingsize: string;
  orderunit: string;
  orderqty: number;
  Outpackingsize: string;
  outunit: string;
  outquantity: number;
  outstatus: PackingStatusOption;
  outbalanceqty: number;
  outexpecteddateofdespatchdate: string;
  outdealyreasons: string;
  fulfillmentstatus: string;

  // Additional metadata & raw records
  outcouriername?: string;
  outcourierdocketno?: string;
  orderfulfilment?: any[];
  sku?: string;
  rawDoc?: any;
}

export interface GroupedPackingOrder {
  orderId: string; // sales_orders.id
  orderNo: string;
  salesOrderId: string;
  orderDate: string;
  customerName: string;
  customerMobile: string;
  fulfilmentStatus: string;
  items: PackingGridRow[];
}

export const CompletePackingView: React.FC = () => {
  const { products: globalProducts, salesOrders: globalSalesOrders } = useCRM();
  const [productsMaster, setProductsMaster] = useState<ProductPerformance[]>([]);
  const [salesOrdersMaster, setSalesOrdersMaster] = useState<any[]>([]);
  const [groupedOrders, setGroupedOrders] = useState<GroupedPackingOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'PACKING' | 'READY_FOR_DISPATCH' | 'CANCELLED' | 'ALL'>('ALL');
  const [brandOwnerFilter, setBrandOwnerFilter] = useState<string>('ALL');

  // Track recently updated items so their status changes remain visible in grid
  const [recentlyUpdatedItemKeys, setRecentlyUpdatedItemKeys] = useState<Set<string>>(new Set());

  // Order header (bulk) edits: values cascade to all child rows of the order
  type HeaderEdit = { outstatus?: PackingStatusOption; outpackdate?: string; outexpecteddateofdespatchdate?: string; outdealyreasons?: string };
  const [headerEdits, setHeaderEdits] = useState<Record<string, HeaderEdit>>({});
  const [headerSavingId, setHeaderSavingId] = useState<string | null>(null);

  // Track saved items to disable save button and highlight row blue
  const [savedItemKeys, setSavedItemKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('packing_saved_item_keys');
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('packing_saved_item_keys', JSON.stringify(Array.from(savedItemKeys)));
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

  // Fetch and group packing records by sales_orders.id
  const fetchPackingRecords = async () => {
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

      const orderGroupsMap = new Map<string, GroupedPackingOrder>();

      for (const doc of rawDocs) {
        // Never treat boa_, item_ or ship_ IDs as salesOrderId
        const docSalesOrderId = String(doc.salesOrderId || (doc.items && doc.items[0]?.salesOrderId) || '').trim();
        const fallbackId = (!String(doc.id).startsWith('boa_') && !String(doc.id).startsWith('item_') && !String(doc.id).startsWith('ship_')) ? String(doc.id) : '';
        const salesOrderId = docSalesOrderId || String(doc.orderId || doc.orderNumber || fallbackId || '').trim();
        if (!salesOrderId) continue;

        const matchedOrder = resolveSalesOrder(salesOrderId);
        const orderNo = String(doc.orderNumber || doc.orderNo || matchedOrder?.orderNumber || salesOrderId);
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
            salesOrderId: docSalesOrderId || salesOrderId,
            orderDate,
            customerName,
            customerMobile,
            fulfilmentStatus: String(doc.fulfilmentStatus || doc.fulfillmentstatus || doc.outstatus || 'PACKING'),
            items: [],
          });
        }

        const group = orderGroupsMap.get(salesOrderId)!;
        const rawItems = Array.isArray(doc.items) && doc.items.length > 0 ? doc.items : [doc];

        for (let idx = 0; idx < rawItems.length; idx++) {
          const item = rawItems[idx];
          const orderItemId = String(item.orderItemId || item.itemId || item.productId || `item_${idx}`);
          const productId = String(item.productId || '');
          const brandOwnerAssignid = String(item.brandOwnerAssignid || doc.brandOwnerAssignid || (doc.id && String(doc.id).startsWith('boa_') ? doc.id : `boa_${idx}`));
          const brandOwnerName = String(item.brandOwnerName || doc.brandOwnerName || 'Not Assigned');

          // Pack Size = shipment_brand_owner_fulfilment.items[].orderpackingsize.
          // Legacy rows were saved with the placeholder 'Standard' / blank, so resolve the real size
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

          // Restrict to records where fulfillmentstatus = 'ASSIGNED' only
          const rawFulfillmentStatus = String(
            item.fulfillmentstatus || item.fulfilmentStatus || doc.fulfillmentstatus || doc.fulfilmentStatus || ''
          ).toUpperCase().trim().replace(/[\s-]+/g, '_');
          if (rawFulfillmentStatus !== 'ASSIGNED') continue;

          const currentRawStatus = String(item.outstatus || 'PACKING').toUpperCase().trim().replace(/[\s-]+/g, '_');
          let outstatus: PackingStatusOption = 'PACKING';
          if (currentRawStatus === 'READY_FOR_DISPATCH') outstatus = 'READY_FOR_DISPATCH';
          else if (currentRawStatus === 'CANCELLED' || currentRawStatus === 'CANCELED') outstatus = 'CANCELLED';

          const outbalanceqty = Math.max(0, orderqty - outquantity);
          const fulfillmentstatus = rawFulfillmentStatus;

          const outpackdate = item.outpackdate ? String(item.outpackdate) : systemDate;
          const outexpecteddateofdespatchdate = item.outexpecteddateofdespatchdate ? String(item.outexpecteddateofdespatchdate) : systemDate;
          const outdealyreasons = String(item.outdealyreasons || '').slice(0, 70);
          const productName = resolveProductName(orderItemId, productId, item.productName || item.name);

          const existingItemIndex = group.items.findIndex(
            (i) => i.orderItemId === orderItemId || (i.productId && i.productId === productId && productId !== '')
          );

          const itemRow: PackingGridRow = {
            id: String(doc.id || `fulfil_${salesOrderId}`),
            shipid: item.shipid ? String(item.shipid) : doc.shipid ? String(doc.shipid) : undefined,
            brandOwnerAssignid,
            orderItemId,
            salesOrderId,
            productId,
            outpackdate,
            brandOwnerName,
            productName,
            orderpackingsize,
            orderunit,
            orderqty,
            Outpackingsize,
            outunit,
            outquantity,
            outstatus,
            outbalanceqty,
            outexpecteddateofdespatchdate,
            outdealyreasons,
            fulfillmentstatus,
            outcouriername: item.outcouriername || item.couriername,
            outcourierdocketno: item.outcourierdocketno || item.courierdocketno,
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

      const allGroups = Array.from(orderGroupsMap.values()).filter((g) => g.items.length > 0);
      setGroupedOrders(allGroups);
      setExpandedOrderIds(new Set(allGroups.map((g) => g.orderId)));
    } catch (err: any) {
      console.error('Failed to load packing records:', err);
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
    fetchPackingRecords();
  }, [productsMaster, salesOrdersMaster]);

  // Handle in-grid field changes for an item
  const handleItemFieldChange = (orderId: string, orderItemId: string, field: keyof PackingGridRow, val: any) => {
    setGroupedOrders((prevOrders) =>
      prevOrders.map((ord) => {
        if (ord.orderId !== orderId) return ord;
        return {
          ...ord,
          items: ord.items.map((it) => {
            if (it.orderItemId !== orderItemId) return it;
            const updated = { ...it, [field]: val };

            // Recalculate outbalanceqty if outquantity changes
            if (field === 'outquantity') {
              const numVal = Math.max(0, Math.min(it.orderqty, Number(val) || 0));
              updated.outquantity = numVal;
              updated.outbalanceqty = Math.max(0, it.orderqty - numVal);
              // Fulfillment status column value remains existing - updates only on next refresh
            }

            return updated;
          }),
        };
      })
    );
  };

  // Header (order-level) field change: store header value and cascade to all unsaved child rows
  const handleHeaderFieldChange = (orderId: string, field: keyof HeaderEdit, val: any) => {
    setHeaderEdits((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] || {}), [field]: val } }));
    setGroupedOrders((prevOrders) =>
      prevOrders.map((ord) => {
        if (ord.orderId !== orderId) return ord;
        return {
          ...ord,
          items: ord.items.map((it) =>
            savedItemKeys.has(`${orderId}_${it.orderItemId}`) ? it : { ...it, [field]: val }
          ),
        };
      })
    );
  };

  // Header Save: save every unsaved child record of the order
  const handleSaveOrderHeader = async (order: GroupedPackingOrder) => {
    const header = headerEdits[order.orderId] || {};
    if (header.outdealyreasons && header.outdealyreasons.length > 70) {
      showStatus('Validation Error: Delay Reasons cannot exceed 70 characters.', 'error');
      return;
    }
    const fullOrder = groupedOrders.find((o) => o.orderId === order.orderId) || order;
    const pending = fullOrder.items.filter((it) => !savedItemKeys.has(`${order.orderId}_${it.orderItemId}`));
    if (pending.length === 0) {
      showStatus('All items of this order are already saved.', 'warning');
      return;
    }

    setHeaderSavingId(order.orderId);
    let ok = 0;
    let failed = 0;
    try {
      const defaultPackDate = header.outpackdate || getSystemDate();
      for (const it of pending) {
        const merged: PackingGridRow = { ...it, outpackdate: defaultPackDate, ...header } as PackingGridRow;
        const success = await handleSaveItem(fullOrder, merged, { silent: true });
        success ? ok++ : failed++;
      }
    } finally {
      setHeaderSavingId(null);
    }

    if (failed === 0) {
      showStatus(`Order ${order.orderNo}: ${ok} item(s) saved from header.`, 'success');
    } else {
      showStatus(`Order ${order.orderNo}: ${ok} saved, ${failed} failed. Check item values and retry.`, 'error');
    }
  };

  // Direct WhatsApp notification from grid
  const handleSendWhatsAppNotification = async (orderId: string, item: PackingGridRow) => {
    const itemKey = `${orderId}_${item.orderItemId}`;
    setWaSendingKey(itemKey);
    try {
      const stage = item.outstatus === 'READY_FOR_DISPATCH' ? 'Ready for Dispatch' : 'Complete Packing';
      const res = await apiFetch(`/api/operations/orders/${orderId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          metadata: {
            status: item.outstatus,
            productName: item.productName,
            packedQty: item.outquantity,
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
    order: GroupedPackingOrder,
    item: PackingGridRow,
    opts?: { silent?: boolean }
  ): Promise<boolean> => {
    // 1. Validation: outquantity > 0 and <= orderqty
    if (item.outquantity <= 0) {
      showStatus(`Validation Error: Packed quantity must be greater than 0 for ${item.productName}.`, 'error');
      return false;
    }
    if (item.outquantity > item.orderqty) {
      showStatus(`Validation Error: Packed quantity (${item.outquantity}) cannot exceed order quantity (${item.orderqty}).`, 'error');
      return false;
    }

    // 2. Character limit validation: Delay reasons <= 70
    if (item.outdealyreasons && item.outdealyreasons.length > 70) {
      showStatus(`Validation Error: Delay Reasons cannot exceed 70 characters.`, 'error');
      return false;
    }

    const itemKey = `${order.orderId}_${item.orderItemId}`;
    setSavingKey(itemKey);

    try {
      const now = new Date().toISOString();
      const calculatedBalance = Math.max(0, item.orderqty - item.outquantity);
      const computedFulfillmentStatus = calculatedBalance > 0 ? 'PARTIALLY_PACKED' : item.outstatus;

      const updatedChildDoc: any = {
        ...(item.rawDoc || {}),
        salesOrderId: order.orderId,
        orderNo: order.orderNo,
        orderItemId: item.orderItemId,
        itemId: item.orderItemId,
        productId: item.productId || '',
        productName: item.productName,
        brandOwnerAssignid: item.brandOwnerAssignid,
        brandOwnerName: item.brandOwnerName,
        orderpackingsize: item.orderpackingsize,
        orderunit: item.orderunit,
        orderqty: item.orderqty,
        Outpackingsize: item.orderpackingsize,
        outpackingsize: item.orderpackingsize,
        outunit: item.orderunit,
        outpackdate: item.outpackdate,
        outquantity: item.outquantity,
        outstatus: item.outstatus,
        outbalanceqty: calculatedBalance,
        outexpecteddateofdespatchdate: item.outexpecteddateofdespatchdate,
        outdealyreasons: (item.outdealyreasons || '').trim().slice(0, 70),
        fulfillmentstatus: computedFulfillmentStatus,
        itemstatus: item.outstatus === 'READY_FOR_DISPATCH' ? 'PACKED' : 'ASSIGNED',
        outpackingstatus: item.outstatus === 'READY_FOR_DISPATCH' ? 'PACKED' : 'PACKING',
        shipid: item.shipid || `ship_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        updatedAt: now,
      };
      // shipment_brand_owner_fulfilment.items[]: legacy `deliverystatus` -> `itemdeliverystatus`, `status` -> `itemstatus`
      Object.assign(updatedChildDoc, migrateFulfilmentItem({ ...updatedChildDoc }));
      delete updatedChildDoc.deliverystatus;
      delete updatedChildDoc.status;

      let newOrderFulfilmentRecord: any = null;
      if (calculatedBalance > 0) {
        newOrderFulfilmentRecord = {
          id: `of_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          orderItemId: item.orderItemId,
          orderpackingsize: item.orderpackingsize,
          orderqty: calculatedBalance,
          orderunit: item.orderunit,
          outbalanceqty: 0,
          outcourierdocketno: '',
          outcouriername: '',
          outdealyreasons: '',
          outexpecteddateofdespatchdate: '',
          outpackdate: '',
          outpackingsize: '',
          outpackingstatus: 'PACKING',
          outquantity: 0,
          outstatus: 'PACKING',
          outunit: '',
          shipid: `ship_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          brandOwnerAssignid: item.brandOwnerAssignid,
          brandOwnerName: item.brandOwnerName,
          productId: item.productId || '',
          productName: item.productName,
          salesOrderId: order.orderId,
          fulfillmentstatus: 'ASSIGNED',
          itemstatus: 'ASSIGNED',
          createdAt: now,
          updatedAt: now,
        };
      }

      // 1. Authoritative API call to update grouped document
      let savedSuccessfully = false;
      let apiValidationError = '';
      try {
        const apiRes = await apiFetch('/api/operations/shipment-brand-owner-fulfilment/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record: updatedChildDoc,
            newRecord: newOrderFulfilmentRecord,
          }),
        });
        const apiData = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && apiData.success) {
          savedSuccessfully = true;
        } else if (apiRes.status === 400) {
          apiValidationError = apiData.error || 'Validation failed on server.';
        }
      } catch (apiErr) {
        console.warn('API save fallback to direct repository:', apiErr);
      }
      if (apiValidationError) throw new Error(apiValidationError);

      // 2. Direct Firestore fallback - only save to parent grouped document
      if (!savedSuccessfully) {
        const parentDocId = `fulfil_${order.orderId}`;
        const existingParent = await shipmentBrandOwnerAssignmentRepository.getById(parentDocId);
        if (existingParent && Array.isArray(existingParent.items)) {
          let updatedItems = existingParent.items.map((it: any) =>
            migrateFulfilmentItem(it.orderItemId === item.orderItemId ? { ...it, ...updatedChildDoc } : it)
          );
          if (newOrderFulfilmentRecord) {
            updatedItems.push(newOrderFulfilmentRecord);
          }
          await shipmentBrandOwnerAssignmentRepository.update(parentDocId, {
            ...existingParent,
            items: updatedItems,
            outstatus: item.outstatus,
            deliveryStatus: item.outstatus,
            fulfillmentstatus: computedFulfillmentStatus,
            updatedAt: now,
          });
        } else {
          // If parent doesn't exist, create it as the parent document with items child array
          const newParentDoc = {
            id: parentDocId,
            salesOrderId: String(order.orderId),
            orderNumber: String(order.orderNo || order.orderId),
            customerName: String(order.customerName || ''),
            customerMobile: String(order.customerMobile || ''),
            deliveryStatus: item.outstatus,
            fulfillmentstatus: computedFulfillmentStatus,
            status: item.outstatus === 'READY_FOR_DISPATCH' ? 'PACKED' : 'ASSIGNED',
            items: [updatedChildDoc, ...(newOrderFulfilmentRecord ? [newOrderFulfilmentRecord] : [])],
            createdAt: now,
            updatedAt: now,
          };
          await shipmentBrandOwnerAssignmentRepository.create(newParentDoc);
        }

        // Delete any duplicate flat document with this item ID from shipment_brand_owner_fulfilment
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
            deliverystatus: updatedChildDoc.itemdeliverystatus || 'PACKING',
            outpackingstatus: updatedChildDoc.outstatus === 'READY_FOR_DISPATCH' ? 'PACKED' : 'PACKING',
            updatedby: auth?.currentUser?.email || auth?.currentUser?.uid || 'Ops Admin',
          });
        } catch (auditErr) {
          console.warn('[CompletePackingView] Warning creating shipment_tracking audit log:', auditErr);
        }
      }

      setRecentlyUpdatedItemKeys((prev) => new Set(prev).add(itemKey));
      setSavedItemKeys((prev) => new Set(prev).add(itemKey));

      if (!opts?.silent) {
        showStatus(
          calculatedBalance > 0
            ? `Record saved! Balance qty (${calculatedBalance}) created for remaining split packing.`
            : `Packing completed! Status updated to '${item.outstatus}'.`,
          'success'
        );
      }
      return true;
    } catch (err: any) {
      console.error('Failed to save packing item:', err);
      showStatus(err?.message || 'Failed to save packing details.', 'error');
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

  // Filtered orders & items
  const filteredOrders = useMemo(() => {
    return groupedOrders
      .map((order) => {
        const filteredItems = order.items.filter((item) => {
          const itemKey = `${order.orderId}_${item.orderItemId}`;
          const isRecentlyUpdated = recentlyUpdatedItemKeys.has(itemKey);

          if (String(item.fulfillmentstatus || '').toUpperCase().trim() !== 'ASSIGNED' && !isRecentlyUpdated) {
            return false;
          }

          if (statusFilter === 'PACKING') {
            const isPacking =
              item.outstatus === 'PACKING' ||
              item.fulfillmentstatus === 'ASSIGNED' ||
              item.fulfillmentstatus === 'PACKING' ||
              item.fulfillmentstatus === 'PARTIALLY_PACKED';
            if (!isPacking && !isRecentlyUpdated) return false;
          } else if (statusFilter === 'READY_FOR_DISPATCH') {
            const isReady = item.outstatus === 'READY_FOR_DISPATCH' || item.fulfillmentstatus === 'READY_FOR_DISPATCH';
            if (!isReady) return false;
          } else if (statusFilter === 'CANCELLED') {
            if (item.outstatus !== 'CANCELLED') return false;
          }

          if (brandOwnerFilter !== 'ALL' && item.brandOwnerName !== brandOwnerFilter) {
            return false;
          }

          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const pMatch = item.productName?.toLowerCase().includes(q);
            const orderMatch = order.orderNo?.toLowerCase().includes(q) || order.orderId?.toLowerCase().includes(q);
            const customerMatch = order.customerName?.toLowerCase().includes(q);
            const mobileMatch = order.customerMobile?.toLowerCase().includes(q);
            const boMatch = item.brandOwnerName?.toLowerCase().includes(q);
            if (!pMatch && !orderMatch && !customerMatch && !mobileMatch && !boMatch) {
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
  }, [groupedOrders, statusFilter, brandOwnerFilter, searchQuery, recentlyUpdatedItemKeys]);

  const totalOrdersCount = filteredOrders.length;
  const totalPages = Math.ceil(totalOrdersCount / limit) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return filteredOrders.slice(start, start + limit);
  }, [filteredOrders, currentPage, limit]);

  const metrics = useMemo(() => {
    let packingCount = 0;
    let readyCount = 0;
    let cancelledCount = 0;
    let totalItems = 0;

    for (const ord of groupedOrders) {
      for (const it of ord.items) {
        totalItems++;
        if (it.outstatus === 'READY_FOR_DISPATCH' || it.fulfillmentstatus === 'READY_FOR_DISPATCH') {
          readyCount++;
        } else if (it.outstatus === 'CANCELLED') {
          cancelledCount++;
        } else {
          packingCount++;
        }
      }
    }

    return {
      totalOrders: groupedOrders.length,
      totalItems,
      packingCount,
      readyCount,
      cancelledCount,
    };
  }, [groupedOrders]);

  const distinctBrandOwners = useMemo(() => {
    const set = new Set<string>();
    groupedOrders.forEach((o) => {
      o.items.forEach((i) => {
        if (i.brandOwnerName && i.brandOwnerName !== 'Not Assigned') {
          set.add(i.brandOwnerName);
        }
      });
    });
    return Array.from(set);
  }, [groupedOrders]);

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1750px] mx-auto text-slate-900 dark:text-slate-100 font-sans" id="complete-packing-container">
      {/* 1. Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-emerald-800 via-green-900 to-emerald-950 p-6 rounded-2xl text-white shadow-xl border border-green-700/50">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <PackageCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight uppercase">COMPLETE PACKING</h1>
              <p className="text-xs md:text-sm text-green-100/90 mt-0.5">
                Grouped by <span className="font-mono text-emerald-300 font-bold">sales_orders.id</span> • Child Items stored in array • Grid-level controls
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchPackingRecords}
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
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">In Packing</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{metrics.packingCount}</p>
          </div>
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 rounded-xl text-amber-600 dark:text-amber-400">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ready For Dispatch</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{metrics.readyCount}</p>
          </div>
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cancelled Items</p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{metrics.cancelledCount}</p>
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
            placeholder="Search by Order No, Customer, Mobile, Product, Brand..."
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
            <span>Packing Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="text-xs bg-emerald-50 dark:bg-slate-800 border border-emerald-300 dark:border-slate-700 rounded-xl px-3 py-2 font-extrabold text-emerald-900 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">All (PACKING / READY_FOR_DISPATCH / CANCELLED)</option>
            <option value="PACKING">PACKING</option>
            <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>

          {distinctBrandOwners.length > 0 && (
            <select
              value={brandOwnerFilter}
              onChange={(e) => {
                setBrandOwnerFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Brand Owners</option>
              {distinctBrandOwners.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

          <span className="text-xs font-bold text-slate-500 ml-1">
            Showing <strong className="text-slate-900 dark:text-white">{filteredOrders.length}</strong> orders
          </span>
        </div>
      </div>

      {/* 5. Grouped Orders Grid Table with Child Items */}
      <div className="space-y-4" id="complete-packing-grid">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 p-16 text-center text-slate-400 rounded-2xl border border-slate-200 dark:border-slate-800">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3 text-emerald-600" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Loading grouped records from shipment_brand_owner_fulfilment...
            </p>
          </div>
        ) : paginatedOrders.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-16 text-center text-slate-400 rounded-2xl border border-slate-200 dark:border-slate-800">
            <PackageCheck className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-200">
              No Orders Found Satisfying Packing Status Criteria
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Orders assigned to brand owners will appear here for packing confirmation and quantity splits.
            </p>
            {statusFilter !== 'ALL' && (
              <button
                onClick={() => setStatusFilter('ALL')}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              >
                View All Packing Orders
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

                  {/* Header bulk controls: cascade to all child rows */}
                  {(() => {
                    const header = headerEdits[order.orderId] || {};
                    const fullOrder = groupedOrders.find((o) => o.orderId === order.orderId) || order;
                    const allSaved = fullOrder.items.every((it) => savedItemKeys.has(`${order.orderId}_${it.orderItemId}`));
                    const isHeaderSaving = headerSavingId === order.orderId;
                    const headerStatus = header.outstatus || '';
                    return (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex flex-wrap items-center gap-2 cursor-default"
                      >
                        <select
                          value={headerStatus}
                          disabled={allSaved || isHeaderSaving}
                          onChange={(e) => handleHeaderFieldChange(order.orderId, 'outstatus', e.target.value as PackingStatusOption)}
                          title="Fulfillment Status (applies to all items)"
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed ${
                            headerStatus === 'READY_FOR_DISPATCH'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                              : headerStatus === 'CANCELLED'
                              ? 'bg-rose-50 text-rose-900 border-rose-300'
                              : headerStatus === 'PACKING'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-white text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <option value="" disabled>Fulfillment Status</option>
                          <option value="PACKING">PACKING</option>
                          <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                        <input
                          type="date"
                          value={header.outpackdate || getSystemDate()}
                          disabled={allSaved || isHeaderSaving}
                          onChange={(e) => handleHeaderFieldChange(order.orderId, 'outpackdate', e.target.value)}
                          title="Pack Date (applies to all items)"
                          className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-60"
                        />
                        <input
                          type="text"
                          maxLength={70}
                          placeholder="Delay reasons (all items)"
                          value={header.outdealyreasons || ''}
                          disabled={allSaved || isHeaderSaving}
                          onChange={(e) => handleHeaderFieldChange(order.orderId, 'outdealyreasons', e.target.value)}
                          className="w-48 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                        <button
                          type="button"
                          disabled={allSaved || isHeaderSaving}
                          onClick={() => handleSaveOrderHeader(order)}
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
                  <div className="overflow-x-auto relative">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">
                        <tr>
                          <th className="py-2.5 px-3 min-w-[220px] max-w-[280px] sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Product Details</th>
                          <th className="py-2.5 px-2 min-w-[120px]">Pack Date</th>
                          <th className="py-2.5 px-2 text-center min-w-[80px]">Pack Size</th>
                          <th className="py-2.5 px-2 text-center min-w-[60px]">Unit</th>
                          <th className="py-2.5 px-2 text-center min-w-[60px]">Order Qty</th>
                          <th className="py-2.5 px-2 text-center min-w-[80px]">Out Qty *</th>
                          <th className="py-2.5 px-2 text-center min-w-[80px]">Balance Qty</th>
                          <th className="hidden py-2.5 px-2 min-w-[150px]">Out Status</th>
                          <th className="hidden py-2.5 px-2 text-center min-w-[120px]">Fulfillment Status</th>
                          <th className="hidden py-2.5 px-2 min-w-[130px]">Exp Dispatch Date</th>
                          <th className="hidden py-2.5 px-2 min-w-[180px]">Delay Reasons</th>
                          <th className="py-2.5 px-3 text-center min-w-[80px]">Action</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {order.items.map((item) => {
                          const itemKey = `${order.orderId}_${item.orderItemId}`;
                          const isSaving = savingKey === itemKey || headerSavingId === order.orderId;
                          const isSaved = savedItemKeys.has(itemKey);
                          const isSendingWa = waSendingKey === itemKey;
                          const hasBalance = item.outbalanceqty > 0;

                          return (
                            <tr
                              key={item.orderItemId}
                              className={`transition-colors ${
                                isSaved
                                  ? 'bg-[#B9EBFF] hover:bg-[#A5E3FC] text-slate-900 border-l-4 border-l-sky-400'
                                  : 'hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {/* 1. Product Name & Brand (Frozen Column) */}
                              <td
                                className={`py-3 px-3 min-w-[220px] max-w-[280px] sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] ${
                                  isSaved
                                    ? 'bg-[#B9EBFF] text-slate-900'
                                    : 'bg-white dark:bg-slate-900'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <Package className={`w-4 h-4 mt-0.5 shrink-0 ${isSaved ? 'text-sky-600 dark:text-sky-400' : 'text-emerald-600'}`} />
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

                              {/* 2. Outpackdate (Grid-level date input) */}
                              <td className="py-3 px-2 whitespace-nowrap">
                                <input
                                  type="date"
                                  value={item.outpackdate}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'outpackdate', e.target.value)
                                  }
                                  className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>

                              {/* 3. Pack Size = shipment_brand_owner_fulfilment.items[].orderpackingsize (Disabled) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <input
                                  type="text"
                                  value={item.orderpackingsize}
                                  disabled
                                  readOnly
                                  className="w-20 text-center px-1.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 cursor-not-allowed font-medium"
                                />
                              </td>

                              {/* 4. Out Unit (Disabled) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <input
                                  type="text"
                                  value={item.outunit}
                                  disabled
                                  readOnly
                                  className="w-14 text-center px-1.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 cursor-not-allowed font-medium"
                                />
                              </td>

                              {/* 5. Order Qty (Disabled) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <input
                                  type="number"
                                  value={item.orderqty}
                                  disabled
                                  readOnly
                                  className="w-14 text-center px-1.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 cursor-not-allowed font-medium"
                                />
                              </td>

                              {/* 6. Out Quantity (Editable number > 0 and <= orderqty) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <input
                                  type="number"
                                  min={1}
                                  max={item.orderqty}
                                  value={item.outquantity}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'outquantity', e.target.value)
                                  }
                                  className="w-16 text-center px-2 py-1 text-xs bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-lg border border-emerald-300 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                              </td>

                              {/* 7. Balance Qty (orderqty - outquantity, Disabled) */}
                              <td className="py-3 px-2 text-center whitespace-nowrap">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md font-bold text-xs ${
                                    hasBalance
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {item.outbalanceqty}
                                </span>
                              </td>

                              {/* 8. Out Status (Selection Combo Box) */}
                              <td className="hidden py-3 px-2 whitespace-nowrap">
                                <select
                                  value={item.outstatus}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'outstatus', e.target.value as PackingStatusOption)
                                  }
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500 ${
                                    item.outstatus === 'READY_FOR_DISPATCH'
                                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700'
                                      : item.outstatus === 'CANCELLED'
                                      ? 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700'
                                      : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700'
                                  }`}
                                >
                                  <option value="PACKING">PACKING</option>
                                  <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                                  <option value="CANCELLED">CANCELLED</option>
                                </select>
                              </td>

                              {/* 9. Fulfillment Status Badge */}
                              <td className="hidden py-3 px-2 text-center whitespace-nowrap">
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black border ${
                                    item.fulfillmentstatus === 'READY_FOR_DISPATCH'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : item.fulfillmentstatus === 'PARTIALLY_PACKED'
                                      ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300'
                                      : item.fulfillmentstatus === 'CANCELLED'
                                      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                                      : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                                  }`}
                                >
                                  {item.fulfillmentstatus}
                                </span>
                              </td>

                              {/* 10. Expected Date of Despatch Date */}
                              <td className="hidden py-3 px-2 whitespace-nowrap">
                                <input
                                  type="date"
                                  value={item.outexpecteddateofdespatchdate}
                                  onChange={(e) =>
                                    handleItemFieldChange(order.orderId, item.orderItemId, 'outexpecteddateofdespatchdate', e.target.value)
                                  }
                                  className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>

                              {/* 11. Delay Reasons (Max 70 chars) */}
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
                                    className="w-44 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <span className="text-[10px] text-slate-400 text-right mt-0.5">
                                    {item.outdealyreasons?.length || 0}/70
                                  </span>
                                </div>
                              </td>

                              {/* 12. Actions: Save & WhatsApp */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isSaving || isSaved}
                                    onClick={() => handleSaveItem(order, item)}
                                    title={isSaved ? 'Record Saved' : 'Save Item Packing Status'}
                                    className={`hidden px-3 py-1.5 rounded-xl text-xs font-bold transition items-center gap-1 shadow-xs ${
                                      isSaved
                                        ? 'bg-sky-200 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700 cursor-not-allowed shadow-none'
                                        : isSaving
                                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed shadow-none'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 cursor-pointer active:scale-95'
                                    }`}
                                  >
                                    {isSaved ? <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> : <Save className="w-3.5 h-3.5" />}
                                    <span>{isSaving ? 'Saving...' : isSaved ? 'Saved' : 'Save'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isSendingWa}
                                    onClick={() => handleSendWhatsAppNotification(order.orderId, item)}
                                    title="Send WhatsApp packing notification"
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

export default CompletePackingView;
