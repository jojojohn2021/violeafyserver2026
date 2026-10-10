import React, { useState, useEffect, useMemo } from 'react';
import {
  PackageCheck,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Package,
  Calendar,
  X,
  Filter,
  Save,
  HelpCircle,
  Building2,
  Layers,
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  FolderOpen,
  Hash,
  User,
  ArrowRight,
} from 'lucide-react';
import { useCRM } from '../store';
import { shipmentBrandOwnerAssignmentRepository, productRepository } from '../repositories/repositories';
import { apiFetch } from '../utils/apiFetch';
import { ProductPerformance } from '../types';

export type PackingStatusOption = 'READY_FOR_DISPATCH' | 'PACKING' | 'CANCELLED';

export interface PackingGridRow {
  // Hidden fields
  id: string; // id = hidden
  brandOwnerAssignid: string; // brandOwnerAssignid = Hidden
  orderItemId: string; // orderItemId = hidden
  salesOrderId?: string; // salesOrderId display in top
  productId?: string;

  // Visual/Editable columns
  outpackdate: string; // outpackdate = systemdate by default (option to select date)
  brandOwnerName: string; // brandOwnerName = disable
  productName: string; // Products = (update value from products->name link id -> orderItemId, use existing API)
  orderpackingsize: string; // orderpackingsize = disable
  orderunit: string; // orderunit = disable
  orderqty: number; // orderqty = disable
  Outpackingsize: string; // Outpackingsize = disable (update the value orderpackingsize)
  outunit: string; // outunit = disable (update the value orderunit)
  outquantity: number; // outquantity = allow edit only numbers > 0 should not greater than orderqty value
  outstatus: PackingStatusOption; // outstatus = selection combo box (values -> READY_FOR_DISPATCH | PACKING | CANCELLED)
  outbalanceqty: number; // outbalanceqty = orderqty - outquantity (disable field)
  outexpecteddateofdespatchdate: string; // outexpecteddateofdespatchdate = systemdate option to select date
  outdealyreasons: string; // outdealyreasons = maximum 70 characters
  fulfillmentstatus: string; // if outbalanceqty > 0 then PARTIALLY_PACKED else outstatus

  // Additional metadata & raw records
  orderfulfilment?: any[];
  sku?: string;
  rawDoc?: any;
}

export const CompletePackingView: React.FC = () => {
  const { products: globalProducts } = useCRM();
  const [productsMaster, setProductsMaster] = useState<ProductPerformance[]>([]);
  const [rows, setRows] = useState<PackingGridRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Search & Filter state (Default: PACKING according to specification)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'PACKING' | 'READY_FOR_DISPATCH' | 'CANCELLED' | 'ALL'>('PACKING');
  const [brandOwnerFilter, setBrandOwnerFilter] = useState<string>('ALL');

  // Track recently updated records so their status changes stay visible in grid view after save
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);

  // Updation Screen Modal state
  const [isEditScreenOpen, setIsEditScreenOpen] = useState<boolean>(false);
  const [editingRow, setEditingRow] = useState<PackingGridRow | null>(null);

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

  // 2. Fetch records from Firestore table shipment_brand_owner_fulfilment
  const fetchFulfilmentRecords = async () => {
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
          console.warn('Repository fetch error, checking proxy:', repoErr);
        }
      }

      // Map raw Firestore documents to grid rows according to exact specification
      const mappedRows: PackingGridRow[] = (rawDocs || []).map((doc: any, idx: number) => {
        const docId = String(doc.id || `doc_${idx}`);
        const brandOwnerAssignid = String(doc.brandOwnerAssignid || doc.id || `boa_${idx}`);
        const orderItemId = String(doc.orderItemId || doc.itemId || `item_${doc.productId || idx}`);
        const productId = String(doc.productId || '');
        const salesOrderId = String(
          doc.salesOrderId ||
          doc.orderId ||
          doc.orderNo ||
          doc.salesOrder?.id ||
          doc.salesOrder?.orderNumber ||
          doc.orderfulfilment?.[0]?.salesOrderId ||
          ''
        );
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
        const Outpackingsize = String(doc.outpackingsize || orderpackingsize);

        // outunit = disable (update the value orderunit)
        const outunit = String(doc.outunit || orderunit);

        // outpackdate = systemdate by default (option to select date)
        const outpackdate = doc.outpackdate ? String(doc.outpackdate) : systemDate;

        // outexpecteddateofdespatchdate = systemdate option to select date
        const outexpecteddateofdespatchdate = doc.outexpecteddateofdespatchdate
          ? String(doc.outexpecteddateofdespatchdate)
          : systemDate;

        // outquantity = allow edit only numbers > 0, should not greater than orderqty value
        const initialOutQty = doc.outquantity !== undefined && doc.outquantity !== null && Number(doc.outquantity) > 0
          ? Number(doc.outquantity)
          : orderqty;

        // outstatus = selection combo box (READY_FOR_DISPATCH | PACKING | CANCELLED)
        const rawStatus = (doc.outstatus || doc.status || doc.fulfillmentstatus || 'PACKING').toUpperCase().trim();
        const outstatus: PackingStatusOption =
          rawStatus === 'READY_FOR_DISPATCH' || rawStatus === 'CANCELLED' ? (rawStatus as PackingStatusOption) : 'PACKING';

        // outbalanceqty = orderqty - outquantity (disable field)
        const outbalanceqty = Math.max(0, orderqty - initialOutQty);

        // outdealyreasons = maximum 70 characters
        const outdealyreasons = String(doc.outdealyreasons || '').slice(0, 70);

        // fulfillmentstatus = if outbalanceqty > 0 then PARTIALLY_PACKED else outstatus
        const fulfillmentstatus = outbalanceqty > 0 ? 'PARTIALLY_PACKED' : outstatus;

        // Products = update value from products->name link id -> orderItemId
        const productName = resolveProductName(orderItemId, productId, doc.productName || doc.name);

        return {
          id: docId,
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
          outquantity: initialOutQty,
          outstatus,
          outbalanceqty,
          outexpecteddateofdespatchdate,
          outdealyreasons,
          fulfillmentstatus,
          orderfulfilment: doc.orderfulfilment || [],
          sku: doc.sku || '',
          rawDoc: doc,
        };
      });

      setRows(mappedRows);
    } catch (err: any) {
      console.error('Failed to load shipment_brand_owner_fulfilment table:', err);
      showStatus(err?.message || 'Error loading records from shipment_brand_owner_fulfilment', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductsMaster();
  }, []);

  useEffect(() => {
    fetchFulfilmentRecords();
  }, [productsMaster]);

  // Sync from Sales Orders if database table is empty
  const handleSyncFromOrders = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/operations/shipment-brand-owner-fulfilment/sync-from-orders', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showStatus(`Synchronized ${data.addedCount || 0} assigned items from sales orders into packing pipeline.`);
        await fetchFulfilmentRecords();
      } else {
        showStatus(data.error || 'Failed to sync orders.', 'error');
      }
    } catch (err: any) {
      showStatus(err.message || 'Sync failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Open the updation screen modal for the selected grid record
  const handleOpenEditScreen = (row: PackingGridRow) => {
    setEditingRow({
      ...row,
      Outpackingsize: row.orderpackingsize, // Outpackingsize = disable (update the value orderpackingsize)
      outunit: row.orderunit, // outunit = disable (update the value orderunit)
    });
    setIsEditScreenOpen(true);
  };

  // Handlers for modifying values within the Updation Screen
  const handleEditQuantityChange = (valStr: string) => {
    if (!editingRow) return;
    const val = parseInt(valStr, 10);
    const newQty = isNaN(val) ? 0 : val;
    const bal = Math.max(0, editingRow.orderqty - newQty);
    const fStatus = bal > 0 ? 'PARTIALLY_PACKED' : editingRow.outstatus;
    setEditingRow({
      ...editingRow,
      outquantity: newQty,
      outbalanceqty: bal,
      fulfillmentstatus: fStatus,
    });
  };

  const handleEditStatusChange = (newStatus: PackingStatusOption) => {
    if (!editingRow) return;
    const fStatus = editingRow.outbalanceqty > 0 ? 'PARTIALLY_PACKED' : newStatus;
    setEditingRow({
      ...editingRow,
      outstatus: newStatus,
      fulfillmentstatus: fStatus,
    });
  };

  const handleEditFieldChange = <K extends keyof PackingGridRow>(field: K, value: PackingGridRow[K]) => {
    if (!editingRow) return;
    setEditingRow({
      ...editingRow,
      [field]: value,
    });
  };

  // Trigger Confirmation Modal from the Edit Screen Save button
  const handleInitiateSaveFromEditScreen = () => {
    if (!editingRow) return;

    // Validation: outquantity allow edit only numbers > 0 should not greater than orderqty value
    if (!editingRow.outquantity || editingRow.outquantity <= 0) {
      showStatus(
        `Validation Error: Packed quantity (outquantity) must be greater than 0 for ${editingRow.productName}.`,
        'error'
      );
      return;
    }
    if (editingRow.outquantity > editingRow.orderqty) {
      showStatus(
        `Validation Error: Packed quantity (${editingRow.outquantity}) cannot be greater than Order Quantity (${editingRow.orderqty}) for ${editingRow.productName}.`,
        'error'
      );
      return;
    }

    setConfirmModalOpen(true);
  };

  // Execute Save after user inputs "Yes" in confirmation popup
  const handleConfirmSave = async () => {
    if (!editingRow) return;
    const row = editingRow;
    setSavingId(row.id);

    try {
      const now = new Date().toISOString();
      const calculatedBalance = Math.max(0, row.orderqty - row.outquantity);
      const computedFulfillmentStatus = calculatedBalance > 0 ? 'PARTIALLY_PACKED' : row.outstatus;

      // Base updated record for shipment_brand_owner_fulfilment
      const updatedDoc: any = {
        ...(row.rawDoc || {}),
        id: row.id,
        brandOwnerAssignid: row.brandOwnerAssignid,
        orderItemId: row.orderItemId,
        itemId: row.orderItemId,
        productId: row.productId || '',
        productName: row.productName,
        brandOwnerName: row.brandOwnerName,
        salesOrderId: row.salesOrderId || '',
        orderpackingsize: row.orderpackingsize,
        orderunit: row.orderunit,
        orderqty: row.orderqty,
        Outpackingsize: row.orderpackingsize, // update the value orderpackingsize
        outpackingsize: row.orderpackingsize,
        outunit: row.orderunit, // update the value orderunit
        outpackdate: row.outpackdate,
        outquantity: row.outquantity,
        outstatus: row.outstatus,
        outbalanceqty: calculatedBalance,
        outexpecteddateofdespatchdate: row.outexpecteddateofdespatchdate,
        outdealyreasons: row.outdealyreasons,
        fulfillmentstatus: computedFulfillmentStatus,
        updatedAt: now,
      };

      let newOrderFulfilmentRecord: any = null;

      // SPEC: if outbalanceqty > 0 then create new record orderfulfilment
      if (calculatedBalance > 0) {
        const uniqueId = `of_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        newOrderFulfilmentRecord = {
          id: uniqueId,
          orderItemId: row.orderItemId,
          orderpackingsize: row.orderpackingsize,
          orderqty: calculatedBalance,
          orderunit: row.orderunit,
          outbalanceqty: 0,
          outcourierdocketno: '',
          outcouriername: '',
          outdealyreasons: '',
          outemailssenddetails: '',
          outestimateddatetoreach: '',
          outexpecteddateofdespatchdate: '',
          outpackdate: '',
          outpackingsize: '',
          outpackingstatus: 'PACKING',
          outpickupdate: '',
          outquantity: 0,
          outstatus: '',
          outunit: '',
          brandOwnerAssignid: `boa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          brandOwnerId: row.rawDoc?.brandOwnerId || '',
          brandOwnerName: row.brandOwnerName,
          productId: row.productId || '',
          productName: row.productName,
          salesOrderId: row.salesOrderId || '',
          fulfillmentstatus: 'PACKING',
          status: 'ASSIGNED',
          createdAt: now,
          updatedAt: now,
        };

        // Attach to child orderfulfilment list
        const existingDetails = Array.isArray(updatedDoc.orderfulfilment) ? updatedDoc.orderfulfilment : [];
        updatedDoc.orderfulfilment = [...existingDetails, newOrderFulfilmentRecord];
      }

      // 1. Try backend authoritative API
      let savedSuccessfully = false;
      try {
        const apiRes = await apiFetch('/api/operations/shipment-brand-owner-fulfilment/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record: updatedDoc,
            newRecord: newOrderFulfilmentRecord,
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
        if (newOrderFulfilmentRecord) {
          await shipmentBrandOwnerAssignmentRepository.create(newOrderFulfilmentRecord);
        }
      }

      // Update the values to the table in the selected grid record (keep status changes after save)
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...row,
                fulfillmentstatus: computedFulfillmentStatus,
                rawDoc: updatedDoc,
              }
            : r
        )
      );

      // Track recently updated row so it stays visible in the grid view
      setRecentlyUpdatedIds((prev) => new Set(prev).add(row.id));

      showStatus(
        calculatedBalance > 0
          ? `Record saved! Balance qty (${calculatedBalance}) created as a new pending packing record in orderfulfilment.`
          : `Record saved successfully! Fulfillment status updated to '${row.outstatus}'.`,
        'success'
      );

      // Close both confirmation popup and the edit screen
      setConfirmModalOpen(false);
      setIsEditScreenOpen(false);
      setEditingRow(null);
    } catch (err: any) {
      console.error('Failed to save packing record:', err);
      showStatus(err?.message || 'Failed to save packing record to database.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  // Filtered rows: Default fulfillmentstatus = "PACKING"
  // Keeps recently updated records in view so status changes remain visible after save
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Primary rule: filter by fulfillmentstatus / outstatus (Default: PACKING)
      if (statusFilter === 'PACKING') {
        const isPacking =
          row.fulfillmentstatus === 'PACKING' ||
          row.outstatus === 'PACKING' ||
          row.rawDoc?.fulfillmentstatus === 'PACKING' ||
          row.rawDoc?.outstatus === 'PACKING';
        const isRecentlyUpdated = recentlyUpdatedIds.has(row.id);
        if (!isPacking && !isRecentlyUpdated) return false;
      } else if (statusFilter !== 'ALL') {
        const matchesStatus =
          row.fulfillmentstatus === statusFilter ||
          row.outstatus === statusFilter ||
          row.rawDoc?.fulfillmentstatus === statusFilter ||
          row.rawDoc?.outstatus === statusFilter;
        const isRecentlyUpdated = recentlyUpdatedIds.has(row.id);
        if (!matchesStatus && !isRecentlyUpdated) return false;
      }

      if (brandOwnerFilter !== 'ALL' && row.brandOwnerName !== brandOwnerFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pMatch = row.productName?.toLowerCase().includes(q);
        const boMatch = row.brandOwnerName?.toLowerCase().includes(q);
        const itemMatch = row.orderItemId?.toLowerCase().includes(q);
        const fStatusMatch = row.fulfillmentstatus?.toLowerCase().includes(q);
        const sOrderMatch = row.salesOrderId?.toLowerCase().includes(q);
        if (!pMatch && !boMatch && !itemMatch && !fStatusMatch && !sOrderMatch) return false;
      }

      return true;
    });
  }, [rows, searchQuery, statusFilter, brandOwnerFilter, recentlyUpdatedIds]);

  // Unique brand owners for filter
  const uniqueBrandOwners = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.brandOwnerName) set.add(r.brandOwnerName);
    });
    return Array.from(set);
  }, [rows]);

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
    const packing = rows.filter(
      (r) => r.fulfillmentstatus === 'PACKING' || r.outstatus === 'PACKING'
    ).length;
    const readyForDispatch = rows.filter(
      (r) => r.fulfillmentstatus === 'READY_FOR_DISPATCH' || r.outstatus === 'READY_FOR_DISPATCH'
    ).length;
    const partiallyPacked = rows.filter(
      (r) => r.fulfillmentstatus === 'PARTIALLY_PACKED'
    ).length;
    const cancelled = rows.filter(
      (r) => r.fulfillmentstatus === 'CANCELLED' || r.outstatus === 'CANCELLED'
    ).length;
    const total = rows.length;
    return { packing, readyForDispatch, partiallyPacked, cancelled, total };
  }, [rows]);

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1700px] mx-auto text-slate-900 dark:text-slate-100 font-sans" id="complete-packing-container">
      {/* 1. Header Banner - Project Fresh Green & Lime Theme */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-emerald-800 via-green-900 to-emerald-950 p-6 rounded-2xl text-white shadow-xl border border-green-700/50">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <PackageCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight uppercase">COMPLETE PACKING</h1>
              <p className="text-xs md:text-sm text-green-100/90 mt-0.5">
                Linked Firestore Database Table: <span className="font-mono text-emerald-300 font-bold">shipment_brand_owner_fulfilment</span> • Filter: <span className="font-mono bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-md font-bold">fulfillmentstatus = PACKING</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {rows.length === 0 && !loading && (
            <button
              onClick={handleSyncFromOrders}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 border border-emerald-500/40 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-sm active:scale-95"
              title="Populate assigned items from sales orders"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Sync from Assigned Orders</span>
            </button>
          )}

          <button
            onClick={fetchFulfilmentRecords}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">In Packing</p>
            <h3 className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{metrics.packing}</h3>
          </div>
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Ready For Dispatch</p>
            <h3 className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">{metrics.readyForDispatch}</h3>
          </div>
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">Partially Packed</p>
            <h3 className="text-2xl font-black text-indigo-700 dark:text-indigo-300 mt-1">{metrics.partiallyPacked}</h3>
          </div>
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">Cancelled</p>
            <h3 className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">{metrics.cancelled}</h3>
          </div>
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 rounded-xl text-rose-600">
            <X className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Total Pipeline Records</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.total}</h3>
          </div>
          <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300">
            <Package className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4. Search & Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Order ID, Product Name, Brand Owner..."
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
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="PACKING">PACKING (Default)</option>
            <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="ALL">All Statuses</option>
          </select>

          {uniqueBrandOwners.length > 0 && (
            <select
              value={brandOwnerFilter}
              onChange={(e) => {
                setBrandOwnerFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer max-w-[180px] truncate"
            >
              <option value="ALL">All Brand Owners</option>
              {uniqueBrandOwners.map((bo) => (
                <option key={bo} value={bo}>
                  {bo}
                </option>
              ))}
            </select>
          )}

          <span className="text-xs font-bold text-slate-500 ml-1">
            Showing <strong className="text-slate-900 dark:text-white">{filteredRows.length}</strong> records
          </span>
        </div>
      </div>

      {/* 5. Complete Packing Grid Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden" id="complete-packing-grid">
        <div className="overflow-x-auto min-h-[350px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#EEF6EE] dark:bg-slate-800/80 border-b border-[#D9E2DA] dark:border-slate-700 text-[#1F2933] dark:text-slate-200 font-extrabold uppercase text-[10px] tracking-wider whitespace-nowrap sticky top-0 z-10">
              <tr>
                {/* Frozen Column 1: Order No */}
                <th className="py-3 px-3 sticky left-0 z-20 bg-[#EEF6EE] dark:bg-slate-800 shadow-[1px_0_0_0_#D9E2DA] dark:shadow-[1px_0_0_0_#334155] min-w-[120px]">
                  Order No
                </th>
                {/* Frozen Column 2: Pack Date */}
                <th className="py-3 px-3 sticky left-[120px] z-20 bg-[#EEF6EE] dark:bg-slate-800 shadow-[1px_0_0_0_#D9E2DA] dark:shadow-[1px_0_0_0_#334155] min-w-[110px]">
                  Pack Date
                </th>
                {/* Frozen Column 3: Brand Owner */}
                <th className="py-3 px-3 sticky left-[230px] z-20 bg-[#EEF6EE] dark:bg-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] min-w-[140px]">
                  Brand Owner
                </th>

                {/* Normal Scrollable Columns */}
                <th className="py-3 px-3 min-w-[180px]">Products</th>
                <th className="py-3 px-2 text-center">Order Packing Size</th>
                <th className="py-3 px-2 text-center">Order Unit</th>
                <th className="py-3 px-2 text-center">Order Qty</th>
                <th className="py-3 px-2 text-center">Out Packing Size</th>
                <th className="py-3 px-2 text-center">Out Unit</th>
                <th className="py-3 px-2 text-center min-w-[90px]">Out Quantity</th>
                <th className="py-3 px-2 text-center min-w-[140px]">Out Status</th>
                <th className="py-3 px-2 text-center min-w-[95px]">Out Balance Qty</th>
                <th className="py-3 px-2 min-w-[130px]">Expected Despatch</th>
                <th className="py-3 px-2 min-w-[180px]">Delay Reasons</th>
                <th className="py-3 px-2 text-center min-w-[130px]">Fulfillment Status</th>

                {/* Sticky Right Action Column */}
                <th className="py-3 px-3 text-center sticky right-0 bg-[#EEF6EE] dark:bg-slate-800/90 shadow-l z-20">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={16} className="py-16 text-center text-slate-400">
                    <RefreshCw className="w-7 h-7 mx-auto animate-spin mb-2 text-emerald-600" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Loading packing records from shipment_brand_owner_fulfilment...
                    </p>
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-16 text-center text-slate-400">
                    <PackageCheck className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                      No Records Found in Database with status &quot;{statusFilter}&quot;
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Assigned items from sales orders automatically appear here, or you can synchronize existing orders.
                    </p>
                    <button
                      onClick={handleSyncFromOrders}
                      className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                    >
                      Sync Assigned Orders Now
                    </button>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const isRecentlyUpdated = recentlyUpdatedIds.has(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group text-slate-800 dark:text-slate-200 ${
                        isRecentlyUpdated ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      {/* HIDDEN FIELDS IN DOM */}
                      <input type="hidden" name="brandOwnerAssignid" value={row.brandOwnerAssignid} />
                      <input type="hidden" name="orderItemId" value={row.orderItemId} />
                      <input type="hidden" name="id" value={row.id} />

                      {/* Frozen Column 1: Order No (salesOrderId display in top/grid) */}
                      <td className="py-2.5 px-3 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800 shadow-[1px_0_0_0_#F1F5F9] dark:shadow-[1px_0_0_0_#1E293B]">
                        <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400">
                          {row.salesOrderId || 'N/A'}
                        </span>
                      </td>

                      {/* Frozen Column 2: Pack Date */}
                      <td className="py-2.5 px-3 whitespace-nowrap sticky left-[120px] z-10 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800 shadow-[1px_0_0_0_#F1F5F9] dark:shadow-[1px_0_0_0_#1E293B]">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {row.outpackdate}
                        </span>
                      </td>

                      {/* Frozen Column 3: Brand Owner (Disabled) */}
                      <td className="py-2.5 px-3 whitespace-nowrap sticky left-[230px] z-10 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-600 dark:text-slate-300 max-w-[130px] truncate" title={row.brandOwnerName}>
                            {row.brandOwnerName}
                          </span>
                        </div>
                      </td>

                      {/* Products: products->name link id -> orderItemId (display only name, id hidden) */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-900 dark:text-white line-clamp-1" title={row.productName}>
                            {row.productName}
                          </span>
                          {row.sku && (
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                              SKU: {row.sku}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Order Packing Size (Disabled) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">
                          {row.orderpackingsize}
                        </span>
                      </td>

                      {/* Order Unit (Disabled) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">
                          {row.orderunit}
                        </span>
                      </td>

                      {/* Order Qty (Disabled) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">
                          {row.orderqty}
                        </span>
                      </td>

                      {/* Out Packing Size (Disabled - updated from orderpackingsize) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">
                          {row.Outpackingsize}
                        </span>
                      </td>

                      {/* Out Unit (Disabled - updated from orderunit) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">
                          {row.outunit}
                        </span>
                      </td>

                      {/* Out Quantity */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span className="font-extrabold text-emerald-800 dark:text-emerald-300">
                          {row.outquantity}
                        </span>
                      </td>

                      {/* Out Status */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black tracking-tight border ${
                            row.outstatus === 'READY_FOR_DISPATCH'
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                              : row.outstatus === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          {row.outstatus}
                        </span>
                      </td>

                      {/* Out Balance Qty (Disabled field = orderqty - outquantity) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span
                          className={`font-mono font-extrabold text-xs ${
                            row.outbalanceqty > 0
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.outbalanceqty}
                        </span>
                      </td>

                      {/* Expected Despatch Date */}
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span className="text-slate-600 dark:text-slate-300">
                          {row.outexpecteddateofdespatchdate}
                        </span>
                      </td>

                      {/* Delay Reasons (max 70 chars) */}
                      <td className="py-2.5 px-2">
                        <span
                          className="text-slate-600 dark:text-slate-400 text-xs line-clamp-1"
                          title={row.outdealyreasons}
                        >
                          {row.outdealyreasons || '—'}
                        </span>
                      </td>

                      {/* Fulfillment Status */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black tracking-tight border ${
                            row.fulfillmentstatus === 'PARTIALLY_PACKED'
                              ? 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                              : row.fulfillmentstatus === 'READY_FOR_DISPATCH'
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                              : row.fulfillmentstatus === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          {row.fulfillmentstatus}
                        </span>
                      </td>

                      {/* Action: Button Open (changed from Save into Open) */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 shadow-l">
                        <button
                          type="button"
                          onClick={() => handleOpenEditScreen(row)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 hover:shadow-md"
                          title="Open record for updation"
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

      {/* 6. Updation Screen Modal (Reference Screen: Update Shipment Record; Non-Grid Layout) */}
      {isEditScreenOpen && editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6 my-auto">
            {/* Top: Header Banner with Sales Order ID displayed in top */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-emerald-500/15 rounded-2xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  <PackageCheck className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      Packing Updation Screen
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">• Table: shipment_brand_owner_fulfilment</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
                    Update Packing Record
                  </h2>
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

            {/* Top Display: salesOrderId displayed in top */}
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 dark:from-emerald-950/40 dark:via-teal-950/40 dark:to-green-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <Hash className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Sales Order ID
                  </span>
                  <span className="text-base sm:text-lg font-mono font-black text-emerald-800 dark:text-emerald-300 tracking-tight">
                    {editingRow.salesOrderId || 'N/A (Standard Assignment)'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Current Status:</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-black bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
                  {editingRow.fulfillmentstatus}
                </span>
              </div>
            </div>

            {/* Hidden Fields */}
            <input type="hidden" name="brandOwnerAssignid" value={editingRow.brandOwnerAssignid} />
            <input type="hidden" name="orderItemId" value={editingRow.orderItemId} />
            <input type="hidden" name="id" value={editingRow.id} />

            {/* Form Fields: Non-Grid Layout Cards */}
            <div className="space-y-5">
              {/* Card 1: Assignment & Product Information */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  Assignment & Product Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* outpackdate = systemdate by default (option to select date) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Pack Date <span className="text-xs text-slate-400 font-normal">(System date by default)</span>
                    </label>
                    <input
                      type="date"
                      value={editingRow.outpackdate}
                      onChange={(e) => handleEditFieldChange('outpackdate', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold cursor-pointer"
                    />
                  </div>

                  {/* brandOwnerName = disable */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                      Brand Owner Name <span className="text-xs text-slate-400 font-normal">(Disabled)</span>
                    </label>
                    <input
                      type="text"
                      value={editingRow.brandOwnerName}
                      disabled
                      readOnly
                      title={editingRow.brandOwnerName}
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-semibold truncate"
                    />
                  </div>

                  {/* Products = (update value from products->name link id -> orderItemId, use existing API) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                      Products <span className="text-xs text-slate-400 font-normal">(ID hidden)</span>
                    </label>
                    <input
                      type="text"
                      value={editingRow.productName}
                      disabled
                      readOnly
                      title="Resolved from products->name link id -> orderItemId"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-extrabold truncate"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Resolved via product master API (ID hidden)
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Packaging Specifications & Quantities */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  Packaging Specifications & Quantities
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  {/* orderpackingsize = disable */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Order Packing Size (Disabled)
                    </label>
                    <input
                      type="text"
                      value={editingRow.orderpackingsize}
                      disabled
                      readOnly
                      className="w-full text-center px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-medium"
                    />
                  </div>

                  {/* orderunit = disable */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Order Unit (Disabled)
                    </label>
                    <input
                      type="text"
                      value={editingRow.orderunit}
                      disabled
                      readOnly
                      className="w-full text-center px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-medium"
                    />
                  </div>

                  {/* orderqty = disable */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Order Qty (Disabled)
                    </label>
                    <input
                      type="number"
                      value={editingRow.orderqty}
                      disabled
                      readOnly
                      className="w-full text-center px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-extrabold"
                    />
                  </div>

                  {/* Outpackingsize = disable (update the value orderpackingsize) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Out Packing Size (Disabled)
                    </label>
                    <input
                      type="text"
                      value={editingRow.Outpackingsize}
                      disabled
                      readOnly
                      title="Updated from orderpackingsize"
                      className="w-full text-center px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-medium"
                    />
                  </div>

                  {/* outunit = disable (update the value orderunit) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Out Unit (Disabled)
                    </label>
                    <input
                      type="text"
                      value={editingRow.outunit}
                      disabled
                      readOnly
                      title="Updated from orderunit"
                      className="w-full text-center px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl cursor-not-allowed font-medium"
                    />
                  </div>

                  {/* outquantity = allow edit only numbers > 0 should not greater than orderqty value */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Out Quantity <span className="text-emerald-600 font-extrabold">* (&gt; 0, &le; {editingRow.orderqty})</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={editingRow.orderqty}
                      value={editingRow.outquantity}
                      onChange={(e) => handleEditQuantityChange(e.target.value)}
                      className={`w-full text-center px-3 py-2 text-xs rounded-xl font-extrabold focus:outline-none focus:ring-2 ${
                        !editingRow.outquantity || editingRow.outquantity <= 0 || editingRow.outquantity > editingRow.orderqty
                          ? 'bg-rose-50 border border-rose-300 text-rose-700 focus:ring-rose-500 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-300'
                          : 'bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 focus:ring-emerald-500'
                      }`}
                    />
                    {(!editingRow.outquantity || editingRow.outquantity <= 0 || editingRow.outquantity > editingRow.orderqty) && (
                      <span className="text-[10px] text-rose-500 font-bold block mt-1 text-center">
                        {editingRow.outquantity > editingRow.orderqty ? `Cannot exceed ${editingRow.orderqty}` : 'Must be greater than 0'}
                      </span>
                    )}
                  </div>
                </div>

                {/* outbalanceqty = orderqty - outquantity (disable field) */}
                <div className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      Out Balance Qty (Disabled field = orderqty - outquantity)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {editingRow.outbalanceqty > 0
                        ? 'Remaining balance will generate a child orderfulfilment split record'
                        : 'Full quantity packed'}
                    </span>
                  </div>
                  <div
                    className={`px-4 py-1.5 rounded-xl font-mono text-sm font-black border ${
                      editingRow.outbalanceqty > 0
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                    }`}
                  >
                    {editingRow.outbalanceqty} {editingRow.orderunit}
                  </div>
                </div>
              </div>

              {/* Card 3: Status, Expected Despatch Date & Delay Reasons */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Status & Despatch Timeline
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* outstatus = selection combo box (values -> READY_FOR_DISPATCH | PACKING | CANCELLED) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Out Status <span className="text-emerald-600 font-extrabold">* (Selection Combo Box)</span>
                    </label>
                    <select
                      value={editingRow.outstatus}
                      onChange={(e) => handleEditStatusChange(e.target.value as PackingStatusOption)}
                      className={`w-full px-3 py-2 text-xs rounded-xl font-bold border focus:outline-none focus:ring-2 cursor-pointer ${
                        editingRow.outstatus === 'READY_FOR_DISPATCH'
                          ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700 focus:ring-amber-500'
                          : editingRow.outstatus === 'CANCELLED'
                          ? 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-700 focus:ring-rose-500'
                          : 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700 focus:ring-emerald-500'
                      }`}
                    >
                      <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                      <option value="PACKING">PACKING</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>

                  {/* outexpecteddateofdespatchdate = systemdate option to select date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Expected Despatch Date <span className="text-xs text-slate-400 font-normal">(System date by default)</span>
                    </label>
                    <input
                      type="date"
                      value={editingRow.outexpecteddateofdespatchdate}
                      onChange={(e) => handleEditFieldChange('outexpecteddateofdespatchdate', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium cursor-pointer"
                    />
                  </div>

                  {/* outdealyreasons = maximum 70 characters */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Delay Reasons <span className="text-xs text-slate-400 font-normal">(Maximum 70 characters)</span>
                      </label>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {editingRow.outdealyreasons.length}/70 characters
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={70}
                      placeholder="Enter reason for delay if any (maximum 70 characters)..."
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
                {!editingRow.outquantity || editingRow.outquantity <= 0 || editingRow.outquantity > editingRow.orderqty ? (
                  <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Out Quantity must be &gt; 0 and &le; {editingRow.orderqty} to enable Save.
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Validation passed. Click Save to confirm and update.
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
                  disabled={
                    !editingRow.outquantity ||
                    editingRow.outquantity <= 0 ||
                    editingRow.outquantity > editingRow.orderqty ||
                    savingId === editingRow.id
                  }
                  onClick={handleInitiateSaveFromEditScreen}
                  className={`px-6 py-2.5 rounded-xl text-xs font-extrabold transition shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                    !editingRow.outquantity ||
                    editingRow.outquantity <= 0 ||
                    editingRow.outquantity > editingRow.orderqty ||
                    savingId === editingRow.id
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 dark:bg-slate-800 dark:border-slate-700 shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 hover:shadow-lg'
                  }`}
                  title="Save packing changes"
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
                    Confirm Save Packing Record?
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
                <span className="text-slate-500 font-semibold">Sales Order ID:</span>
                <span className="font-mono font-extrabold text-slate-900 dark:text-white">
                  {editingRow.salesOrderId || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Product Name:</span>
                <span className="font-extrabold text-slate-900 dark:text-white max-w-[200px] truncate">
                  {editingRow.productName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Brand Owner:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{editingRow.brandOwnerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Order Qty:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {editingRow.orderqty} {editingRow.orderunit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Packed Qty (outquantity):</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                  {editingRow.outquantity} {editingRow.outunit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Balance Qty (outbalanceqty):</span>
                <span
                  className={`font-extrabold ${
                    editingRow.outbalanceqty > 0
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500'
                  }`}
                >
                  {editingRow.outbalanceqty} {editingRow.orderunit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Selected Status (outstatus):</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{editingRow.outstatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Resulting Fulfillment:</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                  {editingRow.fulfillmentstatus}
                </span>
              </div>
            </div>

            {editingRow.outbalanceqty > 0 ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-xl flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200 font-medium">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Remaining balance ({editingRow.outbalanceqty}) will generate a child packing record in{' '}
                  <span className="font-mono font-bold">orderfulfilment</span>.
                </span>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-start gap-2 text-xs text-emerald-900 dark:text-emerald-200 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Full quantity completed. Record fulfillment status will be updated to{' '}
                  <strong>{editingRow.outstatus}</strong>.
                </span>
              </div>
            )}

            {/* Confirmation Buttons: Yes / No */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                No, Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Yes, Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompletePackingView;
