import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Package,
  Calendar,
  X,
  Filter,
  Save,
  Building2,
  Clock,
  Layers,
  Send,
  Info,
  ChevronLeft,
  ChevronRight,
  FileText,
  Sparkles,
  User,
  Phone,
  Hash,
  FolderOpen,
  ArrowRight,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { useCRM } from '../store';
import {
  shipmentBrandOwnerAssignmentRepository,
  productRepository,
  orderRepository,
} from '../repositories/repositories';
import { apiFetch } from '../utils/apiFetch';
import { ProductPerformance } from '../types';

export type ShipmentStatusOption = 'READY_FOR_DISPATCH' | 'SHIPPED';

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
  brandOwnerAssignid: string; // brandOwnerAssignid = Hidden
  orderItemId: string; // orderItemId = hidden
  productId?: string;
  salesOrderId?: string;
  brandOwnerName: string; // brandOwnerName = hidden
  orderpackingsize: string; // orderpackingsize = hidden
  orderunit: string; // orderunit = hidden
  orderqty: number; // orderqty = hidden

  // Columns displayed in grid and update screen
  orderDate: string; // Order Date = sales_orders->createdAt (update value from sales_orders Linkid=salesOrderId)
  orderNo: string; // Order No = salesOrderId
  customerName: string; // Customer = salesorders->customerName (update value from sales_orders Linkid=salesOrderId)
  customerMobile: string; // Mobile = salesorders->customerMobile (update value from sales_orders Linkid=salesOrderId)
  productName: string; // Products = (update value from products->name link id -> orderItemId, use existing API - display only products->name (id should be hidden))
  Outpackingsize: string; // Outpackingsize = disable (update the value orderpackingsize)
  outunit: string; // outunit = disable (update the value orderunit)
  outquantity: number; // outquantity = disable
  outstatus: ShipmentStatusOption; // outstatus = selection combo box (values -> READY_FOR_DISPATCH | SHIPPED)
  fulfillmentstatus: string; // fulfillmentstatus = outstatus
  outpickupdate: string; // outpickupdate = systemdate by default (option to select date)
  outcouriername: string; // outcouriername = selection combo box (values = "Amazon | Delhivery | DTDC | Blue Dart The Professional Couriers | India Post")
  outcourierdocketno: string; // outcourierdocketno = enter this field value is mandatory . then only enable the save button
  outdealyreasons: string; // outdealyreasons = maximum 70 characters

  // Additional metadata & raw records
  outpackdate: string;
  sku?: string;
  rawDoc?: any;
}

export const CreateShipmentView: React.FC = () => {
  const { products: globalProducts, salesOrders: globalSalesOrders } = useCRM();
  const [productsMaster, setProductsMaster] = useState<ProductPerformance[]>([]);
  const [salesOrdersMaster, setSalesOrdersMaster] = useState<any[]>([]);
  const [rows, setRows] = useState<CreateShipmentGridRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'READY_FOR_DISPATCH' | 'SHIPPED' | 'ALL'>('READY_FOR_DISPATCH');
  const [courierFilter, setCourierFilter] = useState<string>('ALL');

  // Track recently updated records so they stay visible even if status changed to SHIPPED
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);

  // Updation Screen Modal state
  const [isEditScreenOpen, setIsEditScreenOpen] = useState<boolean>(false);
  const [editingRow, setEditingRow] = useState<CreateShipmentGridRow | null>(null);

  // Confirmation Yes/No Message Box Modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);

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

  // 1. Fetch Products master list to map products->name linking id -> orderItemId
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

  // 2. Fetch Sales Orders master list to link sales_orders Linkid=salesOrderId
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

  // Helper to resolve Product Name from products->name link id -> orderItemId (display only products->name, id hidden)
  const resolveProductName = (orderItemId: string, productId?: string, fallbackName?: string): string => {
    const prods = productsMaster.length > 0 ? productsMaster : globalProducts;
    if (!prods || prods.length === 0) return fallbackName || 'Product Item';

    // Link by ID -> orderItemId
    const matchByOrderItemId = prods.find((p) => String(p.id) === String(orderItemId));
    if (matchByOrderItemId?.name) return matchByOrderItemId.name;

    // Link by product ID
    if (productId) {
      const matchByProdId = prods.find((p) => String(p.id) === String(productId));
      if (matchByProdId?.name) return matchByProdId.name;
    }

    // Try stripping 'item_' prefix
    const cleanId = orderItemId.replace(/^item_/, '');
    const matchByCleanId = prods.find((p) => String(p.id) === cleanId || orderItemId.includes(String(p.id)));
    if (matchByCleanId?.name) return matchByCleanId.name;

    return fallbackName || 'Product Item';
  };

  // Helper to resolve Sales Order record linking Linkid=salesOrderId
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

  // 3. Fetch records from Firestore table shipment_brand_owner_fulfilment
  const fetchShipmentRecords = async () => {
    setLoading(true);
    const systemDate = getSystemDate();

    try {
      let rawDocs: any[] = [];

      // Try dedicated operations API first
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

      // Fallback to direct repository access
      if (rawDocs.length === 0) {
        try {
          rawDocs = await shipmentBrandOwnerAssignmentRepository.getAll();
        } catch (repoErr) {
          console.warn('Repository fetch error:', repoErr);
        }
      }

      // Map raw Firestore documents to grid rows according to exact specification
      const mappedRows: CreateShipmentGridRow[] = (rawDocs || []).map((doc: any, idx: number) => {
        const docId = String(doc.id || `doc_${idx}`);
        const brandOwnerAssignid = String(doc.brandOwnerAssignid || doc.id || `boa_${idx}`);
        const orderItemId = String(doc.orderItemId || doc.itemId || `item_${doc.productId || idx}`);
        const productId = String(doc.productId || '');
        const brandOwnerName = String(doc.brandOwnerName || doc.brandOwner || 'Not Assigned');

        const orderpackingsize = String(
          doc.orderpackingsize ??
          doc.packingsize ??
          doc.orderfulfilment?.[0]?.orderpackingsize ??
          'Standard'
        );
        const orderunit = String(
          doc.orderunit ??
          doc.unit ??
          doc.orderfulfilment?.[0]?.orderunit ??
          'PCS'
        );
        const orderqty = Number(
          doc.orderqty !== undefined
            ? doc.orderqty
            : doc.quantity !== undefined
            ? doc.quantity
            : doc.orderfulfilment?.[0]?.orderqty ?? 1
        );

        // Outpackingsize = disable (update the value orderpackingsize)
        const Outpackingsize = String(doc.outpackingsize || doc.Outpackingsize || orderpackingsize);

        // outunit = disable (update the value orderunit)
        const outunit = String(doc.outunit || orderunit);

        // outquantity = disable
        const outquantity = doc.outquantity !== undefined && doc.outquantity !== null
          ? Number(doc.outquantity)
          : orderqty;

        // outstatus = selection combo box (values -> READY_FOR_DISPATCH | SHIPPED)
        const currentRawStatus = String(doc.outstatus || doc.fulfillmentstatus || 'READY_FOR_DISPATCH').toUpperCase().trim();
        const outstatus: ShipmentStatusOption = currentRawStatus === 'SHIPPED' ? 'SHIPPED' : 'READY_FOR_DISPATCH';

        // fulfillmentstatus = outstatus
        const fulfillmentstatus = outstatus;

        // outpickupdate = systemdate by default (option to select date)
        const outpickupdate = doc.outpickupdate ? String(doc.outpickupdate) : systemDate;

        // outcouriername = selection combo box (Amazon | Delhivery | DTDC | Blue Dart The Professional Couriers | India Post)
        const outcouriername = String(doc.outcouriername || doc.couriername || doc.courier || 'Delhivery');

        // outcourierdocketno = enter this field value is mandatory . then only enable the save button
        const outcourierdocketno = String(doc.outcourierdocketno || doc.courierdocketno || doc.docketno || '');

        // outdealyreasons = maximum 70 characters
        const outdealyreasons = String(doc.outdealyreasons || '').slice(0, 70);

        // Products = (update value from products->name link id -> orderItemId, use existing API - display only products->name (id should be hidden))
        const productName = resolveProductName(orderItemId, productId, doc.productName || doc.name);

        // Link with sales_orders using Linkid=salesOrderId
        const salesOrderId = String(doc.salesOrderId || doc.orderId || doc.orderNumber || '');
        const matchedOrder = resolveSalesOrder(salesOrderId);

        // Order Date = sales_orders->createdAt(update value from sales_orders Linkid=salesOrderId)
        const rawCreatedAt = matchedOrder?.createdAt || doc.orderDate || doc.createdAt || '';
        let orderDate = '';
        if (rawCreatedAt) {
          if (typeof rawCreatedAt === 'string' && rawCreatedAt.includes('T')) {
            orderDate = rawCreatedAt.split('T')[0];
          } else if (typeof rawCreatedAt === 'string') {
            orderDate = rawCreatedAt;
          } else if (rawCreatedAt && typeof rawCreatedAt.toDate === 'function') {
            try {
              orderDate = rawCreatedAt.toDate().toISOString().split('T')[0];
            } catch (e) {
              orderDate = String(rawCreatedAt);
            }
          } else if (rawCreatedAt && typeof rawCreatedAt.seconds === 'number') {
            orderDate = new Date(rawCreatedAt.seconds * 1000).toISOString().split('T')[0];
          }
        }
        if (!orderDate) {
          orderDate = systemDate;
        }

        // Order No = salesOrderId
        const orderNo = salesOrderId || String(doc.orderNo || doc.orderNumber || docId);

        // Customer = salesorders->customerName(update value from sales_orders Linkid=salesOrderId)
        const customerName = String(
          matchedOrder?.customerName ||
          doc.customerName ||
          doc.customer ||
          'N/A'
        );

        // Mobile = salesorders->customerMobile((update value from sales_orders Linkid=salesOrderId)
        const customerMobile = String(
          matchedOrder?.customerMobile ||
          matchedOrder?.contactNo ||
          doc.customerMobile ||
          doc.contactNo ||
          doc.mobile ||
          'N/A'
        );

        // Preserved outpackdate
        const outpackdate = doc.outpackdate ? String(doc.outpackdate) : systemDate;

        return {
          id: docId,
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
          sku: doc.sku || '',
          rawDoc: doc,
        };
      });

      setRows(mappedRows);
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

  // Handle opening the update screen for a selected row
  const handleOpenEditScreen = (row: CreateShipmentGridRow) => {
    setEditingRow({ ...row });
    setIsEditScreenOpen(true);
  };

  // Updation Screen Field change handlers
  const handleEditFieldChange = (field: keyof CreateShipmentGridRow, val: any) => {
    if (!editingRow) return;
    setEditingRow((prev) => (prev ? { ...prev, [field]: val } : null));
  };

  const handleEditStatusChange = (newStatus: ShipmentStatusOption) => {
    if (!editingRow) return;
    setEditingRow((prev) =>
      prev
        ? {
            ...prev,
            outstatus: newStatus,
            fulfillmentstatus: newStatus, // fulfillmentstatus = outstatus
          }
        : null
    );
  };

  // Trigger Confirmation Popup on Save button click from Edit Screen
  const handleInitiateSaveFromEditScreen = () => {
    if (!editingRow) return;

    // Validation: outcourierdocketno = enter this field value is mandatory . then only enable the save button
    if (!editingRow.outcourierdocketno || editingRow.outcourierdocketno.trim() === '') {
      showStatus(`Validation Error: Courier Docket No is mandatory for ${editingRow.productName}.`, 'error');
      return;
    }

    // Open confirmation message box popup (Yes / No)
    setConfirmModalOpen(true);
  };

  // Execute Save after user clicks "Yes" in confirmation popup
  const handleConfirmSave = async () => {
    if (!editingRow) return;
    const row = editingRow;
    setSavingId(row.id);

    try {
      const now = new Date().toISOString();

      // Base updated record for shipment_brand_owner_fulfilment
      const updatedDoc: any = {
        ...(row.rawDoc || {}),
        id: row.id,
        brandOwnerAssignid: row.brandOwnerAssignid,
        orderItemId: row.orderItemId,
        itemId: row.orderItemId,
        salesOrderId: row.salesOrderId || row.orderNo,
        orderNo: row.orderNo,
        orderDate: row.orderDate,
        customerName: row.customerName,
        customerMobile: row.customerMobile,
        productId: row.productId || '',
        productName: row.productName,
        brandOwnerName: row.brandOwnerName,
        orderpackingsize: row.orderpackingsize,
        orderunit: row.orderunit,
        orderqty: row.orderqty,
        Outpackingsize: row.Outpackingsize || row.orderpackingsize, // update the value orderpackingsize
        outpackingsize: row.Outpackingsize || row.orderpackingsize,
        outunit: row.outunit || row.orderunit, // update the value orderunit
        outquantity: row.outquantity,
        outpackdate: row.outpackdate,
        outpickupdate: row.outpickupdate,
        outcouriername: row.outcouriername,
        couriername: row.outcouriername,
        outcourierdocketno: row.outcourierdocketno,
        courierdocketno: row.outcourierdocketno,
        outdealyreasons: row.outdealyreasons,
        outstatus: row.outstatus,
        fulfillmentstatus: row.outstatus, // fulfillmentstatus = outstatus
        status: row.outstatus === 'SHIPPED' ? 'SHIPPED' : (row.rawDoc?.status || 'ASSIGNED'),
        deliverystatus: row.outstatus === 'SHIPPED' ? 'IN_TRANSIT' : (row.rawDoc?.deliverystatus || ''),
        updatedAt: now,
      };

      // 1. Try backend authoritative API
      let savedSuccessfully = false;
      try {
        const apiRes = await apiFetch('/api/operations/shipment-brand-owner-fulfilment/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record: updatedDoc,
          }),
        });
        const apiData = await apiRes.json();
        if (apiRes.ok && apiData.success) {
          savedSuccessfully = true;
        }
      } catch (apiErr) {
        console.warn('API save fallback to direct repository:', apiErr);
      }

      // 2. Direct Firestore fallback
      if (!savedSuccessfully) {
        await shipmentBrandOwnerAssignmentRepository.update(row.id, updatedDoc);
      }

      // Update the values to the table in the selected grid record (keep status changes after save)
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...row,
                fulfillmentstatus: row.outstatus,
                rawDoc: updatedDoc,
              }
            : r
        )
      );

      // Track recently updated row so it stays visible in the grid view
      setRecentlyUpdatedIds((prev) => new Set(prev).add(row.id));

      showStatus(
        row.outstatus === 'SHIPPED'
          ? `Shipment marked as SHIPPED with Docket #${row.outcourierdocketno} via ${row.outcouriername}!`
          : `Shipment details saved successfully with Docket #${row.outcourierdocketno}.`,
        'success'
      );

      // Close both confirmation popup and the edit screen
      setConfirmModalOpen(false);
      setIsEditScreenOpen(false);
      setEditingRow(null);
    } catch (err: any) {
      console.error('Failed to save shipment record:', err);
      showStatus(err?.message || 'Failed to save shipment details to database.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  // Filtered rows: fulfillmentstatus = READY_FOR_DISPATCH (Default)
  // Keeps recently updated records in view so status changes are visible after save
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Primary rule: filter by fulfillmentstatus / outstatus
      if (statusFilter === 'READY_FOR_DISPATCH') {
        const isReady =
          row.fulfillmentstatus === 'READY_FOR_DISPATCH' ||
          row.outstatus === 'READY_FOR_DISPATCH' ||
          row.rawDoc?.fulfillmentstatus === 'READY_FOR_DISPATCH' ||
          row.rawDoc?.outstatus === 'READY_FOR_DISPATCH';
        const isRecentlyUpdated = recentlyUpdatedIds.has(row.id);
        if (!isReady && !isRecentlyUpdated) return false;
      } else if (statusFilter === 'SHIPPED') {
        const isShipped =
          row.fulfillmentstatus === 'SHIPPED' ||
          row.outstatus === 'SHIPPED' ||
          row.rawDoc?.fulfillmentstatus === 'SHIPPED' ||
          row.rawDoc?.outstatus === 'SHIPPED';
        if (!isShipped) return false;
      }

      if (courierFilter !== 'ALL' && row.outcouriername !== courierFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pMatch = row.productName?.toLowerCase().includes(q);
        const orderMatch = row.orderNo?.toLowerCase().includes(q);
        const customerMatch = row.customerName?.toLowerCase().includes(q);
        const mobileMatch = row.customerMobile?.toLowerCase().includes(q);
        const courierMatch = row.outcouriername?.toLowerCase().includes(q);
        const docketMatch = row.outcourierdocketno?.toLowerCase().includes(q);
        if (!pMatch && !orderMatch && !customerMatch && !mobileMatch && !courierMatch && !docketMatch) return false;
      }

      return true;
    });
  }, [rows, searchQuery, statusFilter, courierFilter, recentlyUpdatedIds]);

  // Pagination slice
  const totalRecords = filteredRows.length;
  const totalPages = Math.ceil(totalRecords / limit) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return filteredRows.slice(start, start + limit);
  }, [filteredRows, currentPage, limit]);

  // Metrics KPI calculation
  const metrics = useMemo(() => {
    const readyForDispatch = rows.filter(
      (r) => r.fulfillmentstatus === 'READY_FOR_DISPATCH' || r.outstatus === 'READY_FOR_DISPATCH'
    ).length;
    const shippedCount = rows.filter(
      (r) => r.fulfillmentstatus === 'SHIPPED' || r.outstatus === 'SHIPPED'
    ).length;
    const missingDocket = rows.filter(
      (r) =>
        (r.fulfillmentstatus === 'READY_FOR_DISPATCH' || r.outstatus === 'READY_FOR_DISPATCH') &&
        (!r.outcourierdocketno || r.outcourierdocketno.trim() === '')
    ).length;
    const total = rows.length;
    return { readyForDispatch, shippedCount, missingDocket, total };
  }, [rows]);

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1700px] mx-auto text-slate-900 dark:text-slate-100 font-sans" id="create-shipment-container">
      {/* 1. Header Banner - Project Fresh Green & Lime Theme */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-emerald-800 via-green-900 to-emerald-950 p-6 rounded-2xl text-white shadow-xl border border-green-700/50">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight uppercase">CREATE SHIPMENT</h1>
              <p className="text-xs md:text-sm text-green-100/90 mt-0.5">
                Linked Firestore Database Table: <span className="font-mono text-emerald-300 font-bold">shipment_brand_owner_fulfilment</span> • Filter: <span className="font-mono bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-md font-bold">fulfillmentstatus = READY_FOR_DISPATCH</span>
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
            <span>Refresh Table</span>
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
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Metrics KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Ready For Dispatch</p>
            <h3 className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">{metrics.readyForDispatch}</h3>
          </div>
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Shipped / In Transit</p>
            <h3 className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{metrics.shippedCount}</h3>
          </div>
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">Pending Docket No</p>
            <h3 className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">{metrics.missingDocket}</h3>
          </div>
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 rounded-xl text-rose-600">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Total Pipeline Records</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.total}</h3>
          </div>
          <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300">
            <Layers className="w-5 h-5" />
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
          {/* Status View Filter (Default: READY_FOR_DISPATCH as per specification) */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
            <Filter className="w-3.5 h-3.5" />
            <span>Fulfillment Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="text-xs bg-emerald-50 dark:bg-slate-800 border border-emerald-300 dark:border-slate-700 rounded-xl px-3 py-2 font-extrabold text-emerald-900 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH (Default)</option>
            <option value="SHIPPED">SHIPPED</option>
            <option value="ALL">All Statuses</option>
          </select>

          {/* Courier Filter */}
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
            Showing <strong className="text-slate-900 dark:text-white">{filteredRows.length}</strong> records
          </span>
        </div>
      </div>

      {/* 5. Create Shipment Grid Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" id="create-shipment-grid">
        <div className="overflow-x-auto min-h-[350px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#EEF6EE] dark:bg-slate-800/80 border-b border-[#D9E2DA] dark:border-slate-700 text-[#1F2933] dark:text-slate-200 font-extrabold uppercase text-[10px] tracking-wider whitespace-nowrap sticky top-0 z-10">
              <tr>
                {/* Frozen Columns:
                    Col 1: Order Date = sales_orders->createdAt
                    Col 2: Order No = salesOrderId
                    Col 3: Customer = salesorders->customerName
                */}
                <th
                  className="py-3 px-3 w-[120px] min-w-[120px] max-w-[120px] sticky left-0 top-0 z-30 bg-[#EEF6EE] dark:bg-slate-800"
                  style={{ left: 0 }}
                >
                  Order Date
                </th>
                <th
                  className="py-3 px-3 w-[130px] min-w-[130px] max-w-[130px] sticky left-[120px] top-0 z-30 bg-[#EEF6EE] dark:bg-slate-800"
                  style={{ left: 120 }}
                >
                  Order No
                </th>
                <th
                  className="py-3 px-3 w-[150px] min-w-[150px] max-w-[150px] sticky left-[250px] top-0 z-30 bg-[#EEF6EE] dark:bg-slate-800 border-r border-[#D9E2DA] dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                  style={{ left: 250 }}
                >
                  Customer
                </th>
                <th className="py-3 px-3 min-w-[120px]">Mobile</th>
                <th className="py-3 px-3 min-w-[180px]">Products</th>
                <th className="py-3 px-2 text-center min-w-[110px]">Out Packing Size</th>
                <th className="py-3 px-2 text-center min-w-[80px]">Out Unit</th>
                <th className="py-3 px-2 text-center min-w-[90px]">Out Quantity</th>
                <th className="py-3 px-2 min-w-[160px]">Out Status</th>
                <th className="py-3 px-2 text-center min-w-[140px]">Fulfillment Status</th>
                <th className="py-3 px-2 min-w-[130px]">Pickup Date</th>
                <th className="py-3 px-2 min-w-[170px]">Courier Name</th>
                <th className="py-3 px-2 min-w-[160px]">Courier Docket No *</th>
                <th className="py-3 px-2 min-w-[180px]">Delay Reasons</th>
                <th className="py-3 px-3 text-center sticky right-0 top-0 z-30 bg-[#EEF6EE] dark:bg-slate-800 shadow-l">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-slate-400">
                    <RefreshCw className="w-7 h-7 mx-auto animate-spin mb-2 text-emerald-600" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Loading records from shipment_brand_owner_fulfilment...</p>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-slate-400">
                    <Truck className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                      No Records Satisfying fulfillmentstatus = READY_FOR_DISPATCH
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Items completed in the COMPLETE PACKING view with status READY_FOR_DISPATCH will appear here for courier assignment.
                    </p>
                    {statusFilter !== 'ALL' && (
                      <button
                        onClick={() => setStatusFilter('ALL')}
                        className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                      >
                        View All Pipeline Records
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group text-slate-800 dark:text-slate-200"
                    >
                      {/* HIDDEN FIELDS IN DOM */}
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="brandOwnerAssignid" value={row.brandOwnerAssignid} />
                      <input type="hidden" name="brandOwnerName" value={row.brandOwnerName} />
                      <input type="hidden" name="orderItemId" value={row.orderItemId} />
                      <input type="hidden" name="orderpackingsize" value={row.orderpackingsize} />
                      <input type="hidden" name="orderunit" value={row.orderunit} />
                      <input type="hidden" name="orderqty" value={row.orderqty} />

                      {/* 1. Order Date = sales_orders->createdAt (update value from sales_orders Linkid=salesOrderId) - Frozen Col 1 */}
                      <td
                        className="py-2.5 px-3 w-[120px] min-w-[120px] max-w-[120px] whitespace-nowrap sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors"
                        style={{ left: 0 }}
                      >
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold truncate">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{row.orderDate}</span>
                        </div>
                      </td>

                      {/* 2. Order No = salesOrderId - Frozen Col 2 */}
                      <td
                        className="py-2.5 px-3 w-[130px] min-w-[130px] max-w-[130px] whitespace-nowrap sticky left-[120px] z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors"
                        style={{ left: 120 }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono font-bold text-slate-900 dark:text-white truncate" title={row.orderNo}>
                            {row.orderNo}
                          </span>
                        </div>
                      </td>

                      {/* 3. Customer = salesorders->customerName (update value from sales_orders Linkid=salesOrderId) - Frozen Col 3 */}
                      <td
                        className="py-2.5 px-3 w-[150px] min-w-[150px] max-w-[150px] whitespace-nowrap sticky left-[250px] z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors border-r border-[#D9E2DA] dark:border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                        style={{ left: 250 }}
                      >
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate" title={row.customerName}>
                            {row.customerName}
                          </span>
                        </div>
                      </td>

                      {/* 4. Mobile = salesorders->customerMobile (update value from sales_orders Linkid=salesOrderId) */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-slate-700 dark:text-slate-300" title={row.customerMobile}>
                            {row.customerMobile}
                          </span>
                        </div>
                      </td>

                      {/* 5. Products = update value from products->name link id -> orderItemId (display only name, id hidden) */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="font-extrabold text-slate-900 dark:text-white line-clamp-2" title={row.productName}>
                            {row.productName}
                          </span>
                        </div>
                      </td>

                      {/* 6. Outpackingsize = disable (update the value orderpackingsize) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <input
                          type="text"
                          value={row.Outpackingsize}
                          disabled
                          readOnly
                          title="Updated from orderpackingsize"
                          className="w-24 text-center px-2 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg cursor-not-allowed font-medium"
                        />
                      </td>

                      {/* 7. outunit = disable (update the value orderunit) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <input
                          type="text"
                          value={row.outunit}
                          disabled
                          readOnly
                          title="Updated from orderunit"
                          className="w-16 text-center px-2 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg cursor-not-allowed font-medium"
                        />
                      </td>

                      {/* 8. outquantity = disable */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <input
                          type="number"
                          value={row.outquantity}
                          disabled
                          readOnly
                          className="w-16 text-center px-2 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-slate-200 dark:border-slate-700 rounded-lg cursor-not-allowed font-extrabold"
                        />
                      </td>

                      {/* 9. outstatus = selection combo box (READY_FOR_DISPATCH | SHIPPED) */}
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            row.outstatus === 'SHIPPED'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700'
                              : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700'
                          }`}
                        >
                          {row.outstatus}
                        </span>
                      </td>

                      {/* 10. fulfillmentstatus = outstatus */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black tracking-tight border ${
                            row.fulfillmentstatus === 'SHIPPED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {row.fulfillmentstatus}
                        </span>
                      </td>

                      {/* 11. outpickupdate = systemdate by default (option to select date) */}
                      <td className="py-2.5 px-2 whitespace-nowrap text-slate-700 dark:text-slate-300 font-medium">
                        {row.outpickupdate}
                      </td>

                      {/* 12. outcouriername = selection combo box */}
                      <td className="py-2.5 px-2 whitespace-nowrap font-bold text-slate-800 dark:text-slate-200">
                        {row.outcouriername}
                      </td>

                      {/* 13. outcourierdocketno */}
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        {row.outcourierdocketno ? (
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {row.outcourierdocketno}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                            Pending Docket
                          </span>
                        )}
                      </td>

                      {/* 14. outdealyreasons = maximum 70 characters */}
                      <td className="py-2.5 px-2 max-w-[180px] truncate text-slate-600 dark:text-slate-400" title={row.outdealyreasons}>
                        {row.outdealyreasons || '-'}
                      </td>

                      {/* 15. Action Column: Button renamed from Save into Open */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap sticky right-0 top-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 shadow-l">
                        <button
                          onClick={() => handleOpenEditScreen(row)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 hover:shadow-md"
                          title="Open updation screen"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Open</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Pagination */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Rows per page:</span>
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
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="text-slate-400 ml-2">
              Page {currentPage} of {totalPages}
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

      {/* 6. Updation Screen Modal (No Grid Layout) */}
      {isEditScreenOpen && editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6 my-auto max-h-[92vh] overflow-y-auto">
            {/* Hidden fields */}
            <input type="hidden" name="id" value={editingRow.id} />
            <input type="hidden" name="brandOwnerAssignid" value={editingRow.brandOwnerAssignid} />
            <input type="hidden" name="brandOwnerName" value={editingRow.brandOwnerName} />
            <input type="hidden" name="orderItemId" value={editingRow.orderItemId} />
            <input type="hidden" name="orderpackingsize" value={editingRow.orderpackingsize} />
            <input type="hidden" name="orderunit" value={editingRow.orderunit} />
            <input type="hidden" name="orderqty" value={editingRow.orderqty} />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/15 rounded-xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    Update Shipment Record
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Order No: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{editingRow.orderNo}</span> • Table: <span className="font-mono font-semibold">shipment_brand_owner_fulfilment</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditScreenOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Close screen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields: Non-Grid Layout Cards */}
            <div className="space-y-5">
              {/* Card 1: Order & Customer Information */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  Order & Customer Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Order Date
                    </label>
                    <input
                      type="text"
                      value={editingRow.orderDate}
                      disabled
                      readOnly
                      title="sales_orders->createdAt"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Order No
                    </label>
                    <input
                      type="text"
                      value={editingRow.orderNo}
                      disabled
                      readOnly
                      title="salesOrderId"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Customer
                    </label>
                    <input
                      type="text"
                      value={editingRow.customerName}
                      disabled
                      readOnly
                      title="salesorders->customerName"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-semibold truncate"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Mobile
                    </label>
                    <input
                      type="text"
                      value={editingRow.customerMobile}
                      disabled
                      readOnly
                      title="salesorders->customerMobile"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-mono font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Product & Packaging Specifications */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-600" />
                  Product & Packaging Details
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Products
                    </label>
                    <input
                      type="text"
                      value={editingRow.productName}
                      disabled
                      readOnly
                      title="products->name link id -> orderItemId (display only name, id hidden)"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-extrabold"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Display only products-&gt;name (product id is hidden)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Out Packing Size
                      </label>
                      <input
                        type="text"
                        value={editingRow.Outpackingsize}
                        disabled
                        readOnly
                        title="disable (update the value orderpackingsize)"
                        className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-medium text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Out Unit
                      </label>
                      <input
                        type="text"
                        value={editingRow.outunit}
                        disabled
                        readOnly
                        title="disable (update the value orderunit)"
                        className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-medium text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Out Quantity
                      </label>
                      <input
                        type="number"
                        value={editingRow.outquantity}
                        disabled
                        readOnly
                        title="outquantity = disable"
                        className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-extrabold text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Shipment Updation Fields */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                  Shipment & Courier Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Out Status <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editingRow.outstatus}
                      onChange={(e) => handleEditStatusChange(e.target.value as ShipmentStatusOption)}
                      className={`w-full px-3 py-2 text-xs rounded-xl font-bold border focus:outline-none focus:ring-2 cursor-pointer ${
                        editingRow.outstatus === 'SHIPPED'
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700 focus:ring-emerald-500'
                          : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700 focus:ring-amber-500'
                      }`}
                    >
                      <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                      <option value="SHIPPED">SHIPPED</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Fulfillment Status (Synced to Out Status)
                    </label>
                    <div className="px-3 py-2 text-xs rounded-xl font-bold border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black tracking-tight border ${
                          editingRow.fulfillmentstatus === 'SHIPPED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                        }`}
                      >
                        {editingRow.fulfillmentstatus}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">fulfillmentstatus = outstatus</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pickup Date
                    </label>
                    <input
                      type="date"
                      value={editingRow.outpickupdate}
                      onChange={(e) => handleEditFieldChange('outpickupdate', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Courier Name <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editingRow.outcouriername}
                      onChange={(e) => handleEditFieldChange('outcouriername', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      {COURIER_PARTNERS.map((partner) => (
                        <option key={partner} value={partner}>
                          {partner}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Courier Docket No <span className="text-rose-500 font-extrabold">* (Mandatory to Save)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter Docket / AWB No *"
                      value={editingRow.outcourierdocketno}
                      onChange={(e) => handleEditFieldChange('outcourierdocketno', e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl font-bold focus:outline-none focus:ring-2 ${
                        !editingRow.outcourierdocketno || editingRow.outcourierdocketno.trim() === ''
                          ? 'bg-amber-50/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 placeholder:text-amber-500/70 focus:ring-amber-500'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-emerald-500'
                      }`}
                    />
                    {(!editingRow.outcourierdocketno || editingRow.outcourierdocketno.trim() === '') && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1 block">
                        * Enter this field value is mandatory. Then only enable the Save button.
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Delay Reasons
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {editingRow.outdealyreasons.length}/70
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={70}
                      placeholder="Enter remarks or delay reasons (max 70 characters)..."
                      value={editingRow.outdealyreasons}
                      onChange={(e) => handleEditFieldChange('outdealyreasons', e.target.value.slice(0, 70))}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom of the screen: Close and Save buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 font-medium">
                {!editingRow.outcourierdocketno || editingRow.outcourierdocketno.trim() === '' ? (
                  <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Courier Docket No is required to enable Save.
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    All required fields valid. Ready to save.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditScreenOpen(false)}
                  className="px-5 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!editingRow.outcourierdocketno || editingRow.outcourierdocketno.trim() === '' || savingId === editingRow.id}
                  onClick={handleInitiateSaveFromEditScreen}
                  className={`px-6 py-2.5 rounded-xl text-xs font-extrabold transition shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                    !editingRow.outcourierdocketno || editingRow.outcourierdocketno.trim() === '' || savingId === editingRow.id
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 dark:bg-slate-800 dark:border-slate-700 shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 hover:shadow-lg'
                  }`}
                  title={!editingRow.outcourierdocketno ? 'Enter Courier Docket No to enable Save' : 'Save Shipment Details'}
                >
                  <Save className="w-4 h-4" />
                  <span>{savingId === editingRow.id ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Confirmation Message Box Modal (Yes / No) */}
      {confirmModalOpen && editingRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 dark:bg-emerald-950/80 rounded-xl text-emerald-700 dark:text-emerald-300">
                  <AlertTriangle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Confirm Save Shipment?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Update record in table <span className="font-mono font-semibold">shipment_brand_owner_fulfilment</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary details */}
            <div className="bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Order No:</span>
                <span className="font-mono font-extrabold text-slate-900 dark:text-white">
                  {editingRow.orderNo}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Product Name:</span>
                <span className="font-extrabold text-slate-900 dark:text-white max-w-[200px] truncate" title={editingRow.productName}>
                  {editingRow.productName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Courier Partner:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {editingRow.outcouriername}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Courier Docket No:</span>
                <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                  {editingRow.outcourierdocketno}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Pickup Date:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {editingRow.outpickupdate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Status / Fulfillment Status:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {editingRow.outstatus}
                </span>
              </div>
              {editingRow.outdealyreasons && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Delay Reasons:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 max-w-[200px] truncate">
                    {editingRow.outdealyreasons}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Do you want to confirm and save these shipment details into the database?
            </p>

            {/* Action buttons: Yes / No */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Yes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateShipmentView;
