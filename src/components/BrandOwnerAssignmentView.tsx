import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Package,
  Building2,
  Phone,
  Mail,
  X,
  Filter,
  Ban,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Clock,
  Send,
  MessageSquare,
} from 'lucide-react';
import { useCRM } from '../store';
import {
  brandOwnerRepository,
  orderRepository,
  shipmentBrandOwnerAssignmentRepository,
} from '../repositories/repositories';
import { apiFetch } from '../utils/apiFetch';
import { BrandOwner } from '../types';

export interface SalesOrderRecord {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerMobile?: string;
  customerEmail?: string;
  products: any[];
  totalValue: number;
  paymentStatus: string;
  deliveryStatus: string;
  fulfilmentStatus: string;
  brandAssignments?: any[];
  createdAt: string;
  lastUpdated?: string;
  salesChannel?: string;
}

export const BrandOwnerAssignmentView: React.FC = () => {
  const { products: globalProducts } = useCRM();
  const [orders, setOrders] = useState<SalesOrderRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [brandOwnersList, setBrandOwnersList] = useState<BrandOwner[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customerNameFilter, setCustomerNameFilter] = useState<string>('');
  const [mobileFilter, setMobileFilter] = useState<string>('');
  const [itemNameFilter, setItemNameFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED' | 'RESTRICTED'>('ALL');

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [paginationInfo, setPaginationInfo] = useState({
    page: 1,
    limit: 10,
    totalRecords: 0,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false,
  });

  // Selected Order & Modal State
  const [selectedOrder, setSelectedOrder] = useState<SalesOrderRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalDetailsLoading, setModalDetailsLoading] = useState<boolean>(false);
  const [brandAssignments, setBrandAssignments] = useState<{ brandOwnerAssignid?: string; orderItemId: string; productId: string; brandOwnerId: string; brandOwnerName: string; contactEmail?: string; contactMobile?: string; whatsappNo?: string }[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Fetch Brand Owners Master List
  const fetchBrandOwners = async () => {
    try {
      const docs = await brandOwnerRepository.getAll();
      if (Array.isArray(docs) && docs.length > 0) {
        setBrandOwnersList(docs);
        return;
      }
    } catch (err) {
      console.warn('Direct Firestore fetch for brand owners failed, falling back to proxy API:', err);
    }

    try {
      const res = await apiFetch('/api/db/product_brand_owners');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.docs)) {
          setBrandOwnersList(data.docs);
          return;
        }
      }
    } catch (err) {
      console.error('Error fetching brand owners from proxy API:', err);
    }
  };

  // Direct Firestore fallback for Sales Orders from sales_orders collection
  const fetchOrdersFromFirestore = async () => {
    try {
      const allOrders = await orderRepository.getAll();
      let filtered: SalesOrderRecord[] = (allOrders || []).map((o: any) => ({
        id: String(o.id || o.orderNumber),
        orderNumber: String(o.orderNumber || o.id),
        customerId: String(o.customerId || ''),
        customerName: String(o.customerName || 'Customer'),
        customerMobile: o.customerMobile || o.mobile || '',
        customerEmail: o.customerEmail || o.email || '',
        products: Array.isArray(o.products) ? o.products : [],
        totalValue: Number(o.totalValue || o.total || 0),
        paymentStatus: String(o.paymentStatus || 'PAID'),
        deliveryStatus: String(o.deliveryStatus || 'PENDING'),
        fulfilmentStatus: String(o.fulfilmentStatus || o.fulfillmentStatus || 'ASSIGNED'),
        brandAssignments: Array.isArray(o.brandAssignments) ? o.brandAssignments : [],
        createdAt: o.createdAt || new Date().toISOString(),
        lastUpdated: o.lastUpdated || o.updatedAt || '',
        salesChannel: o.salesChannel || '',
      }));

      // Apply search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (o) =>
            o.orderNumber.toLowerCase().includes(q) ||
            o.customerName.toLowerCase().includes(q) ||
            (o.customerMobile && o.customerMobile.toLowerCase().includes(q))
        );
      }
      if (customerNameFilter.trim()) {
        const q = customerNameFilter.toLowerCase();
        filtered = filtered.filter((o) => o.customerName.toLowerCase().includes(q));
      }
      if (mobileFilter.trim()) {
        const q = mobileFilter.toLowerCase();
        filtered = filtered.filter((o) => o.customerMobile && o.customerMobile.toLowerCase().includes(q));
      }
      if (itemNameFilter.trim()) {
        const q = itemNameFilter.toLowerCase();
        filtered = filtered.filter((o) =>
          o.products.some((p: any) => (p.name || p.productName || '').toLowerCase().includes(q))
        );
      }
      if (dateFilter.trim()) {
        filtered = filtered.filter((o) => o.createdAt && o.createdAt.startsWith(dateFilter));
      }

      setPaginationInfo({
        page,
        limit,
        totalRecords: filtered.length,
        totalPages: Math.ceil(filtered.length / limit) || 1,
        hasPrevious: page > 1,
        hasNext: page < Math.ceil(filtered.length / limit),
      });

      const start = (page - 1) * limit;
      setOrders(filtered.slice(start, start + limit));
      return true;
    } catch (err: any) {
      console.error('Direct Firestore sales_orders fetch failed:', err);
      setOrders([]);
      showStatus(err?.message || 'Error fetching orders from sales_orders database table.', 'error');
      return false;
    }
  };

  // Fetch Sales Orders populated from sales_orders tables
  const fetchOrders = async () => {
    setLoading(true);
    let loadedFromApi = false;

    try {
      const endpoint = '/api/operations/brand-owner-assignment';
      const params = new URLSearchParams();
      if (itemNameFilter) params.append('itemName', itemNameFilter);
      if (customerNameFilter) params.append('customerName', customerNameFilter);
      if (mobileFilter) params.append('mobile', mobileFilter);
      if (dateFilter) params.append('date', dateFilter);
      if (searchQuery) params.append('search', searchQuery);
      params.append('page', String(page));
      params.append('limit', String(limit));

      const res = await apiFetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (data && data.success) {
            const fetchedOrders: SalesOrderRecord[] = data.records || data.orders || [];
            setOrders(fetchedOrders);
            if (data.pagination) {
              setPaginationInfo(data.pagination);
            } else {
              setPaginationInfo({
                page: 1,
                limit,
                totalRecords: fetchedOrders.length,
                totalPages: Math.ceil(fetchedOrders.length / limit) || 1,
                hasPrevious: page > 1,
                hasNext: page < Math.ceil(fetchedOrders.length / limit),
              });
            }
            loadedFromApi = true;
          }
        }
      }
    } catch (apiErr) {
      console.warn('API endpoint fetch fallback to direct Firestore:', apiErr);
    }

    if (!loadedFromApi) {
      await fetchOrdersFromFirestore();
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchBrandOwners();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [page, limit, assignmentStatusFilter]);

  const showStatus = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Helper validation: check if deliveryStatus is COMPLETED or RETURNED (restricted)
  const isDeliveryStatusRestricted = (deliveryStatus?: string): boolean => {
    if (!deliveryStatus) return false;
    const normalized = deliveryStatus.trim().toUpperCase();
    return normalized === 'COMPLETED' || normalized === 'RETURNED' || normalized === 'DELIVERED';
  };

  const getDeliveryStatusBadgeClass = (deliveryStatus?: string) => {
    const status = (deliveryStatus || '').toUpperCase().trim();
    if (status === 'COMPLETED' || status === 'DELIVERED') {
      return 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
    }
    if (status === 'RETURNED') {
      return 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
    }
    if (status === 'PACKING') {
      return 'bg-green-100 text-green-800 border border-green-300 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800';
    }
    if (status === 'SHIPPED' || status === 'DISPATCHED') {
      return 'bg-lime-100 text-lime-800 border border-lime-300 dark:bg-lime-950/60 dark:text-lime-300 dark:border-lime-800';
    }
    return 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
  };

  const getItemIdKey = (prod: any, idx: number) => `item_${prod?.productId || prod?.id || idx}`;
  const getProdKey = (prod: any, idx: number) => String(prod?.productId || prod?.id || `p_${idx}`);

  // Calculate order assignment status
  const getOrderAssignmentStatus = (order: SalesOrderRecord) => {
    if (isDeliveryStatusRestricted(order.deliveryStatus)) return 'RESTRICTED';
    const prods = order.products || [];
    if (prods.length === 0) return 'UNASSIGNED';
    const assignments = order.brandAssignments || [];
    
    let assignedCount = 0;
    prods.forEach((prod: any, idx: number) => {
      const pKey = getProdKey(prod, idx);
      const iKey = getItemIdKey(prod, idx);
      const match = assignments.find((b: any) => String(b.productId) === pKey || b.orderItemId === iKey);
      if (match && match.brandOwnerId && match.brandOwnerName && match.brandOwnerName !== '-- Select Brand Owner --') {
        assignedCount++;
      }
    });

    if (assignedCount === prods.length) return 'ASSIGNED';
    if (assignedCount > 0) return 'PARTIAL';
    return 'UNASSIGNED';
  };

  // Open Modal for Assignment with validation
  const openAssignmentModal = async (order: SalesOrderRecord) => {
    // DATA VALIDATION: deliveryStatus field value should not be COMPLETED or RETURNED
    if (isDeliveryStatusRestricted(order.deliveryStatus)) {
      showStatus(
        `Data validation restricted: Sales order ${order.orderNumber || order.id} has deliveryStatus '${order.deliveryStatus}'. Assignment is NOT allowed for COMPLETED or RETURNED orders.`,
        'warning'
      );
      return;
    }

    setSelectedOrder(order);
    setIsModalOpen(true);
    setModalDetailsLoading(true);

    try {
      const res = await apiFetch(`/api/operations/orders/${order.id}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (data && data.success && data.order) {
            const fetchedAssignments = data.brandAssignments || [];
            const initialMap = (data.order.products || order.products || []).map((p: any, idx: number) => {
              const pKey = getProdKey(p, idx);
              const iKey = getItemIdKey(p, idx);
              const existingMatch = fetchedAssignments.find(
                (b: any) => String(b.productId) === pKey || b.orderItemId === iKey
              );
              const boObj = brandOwnersList.find(
                (bo) => bo.name?.toLowerCase().trim() === existingMatch?.brandOwnerName?.toLowerCase().trim() || String(bo.id) === String(existingMatch?.brandOwnerId)
              );
              return {
                brandOwnerAssignid: existingMatch?.brandOwnerAssignid || existingMatch?.id || `boa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                orderItemId: iKey,
                productId: pKey,
                brandOwnerId: existingMatch?.brandOwnerId || boObj?.id || '',
                brandOwnerName: existingMatch?.brandOwnerName || boObj?.name || '',
                contactEmail: existingMatch?.contactEmail || boObj?.contactEmail || boObj?.email || '',
                contactMobile: existingMatch?.contactMobile || boObj?.contactMobile || (boObj as any)?.phone || '',
                whatsappNo: existingMatch?.whatsappNo || boObj?.whatsappNo || '',
              };
            });
            setBrandAssignments(initialMap);
            setModalDetailsLoading(false);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load detailed order record from API, building fallback state:', err);
    }

    // Fallback assignment list initialization
    const fallbackAssignments = (order.products || []).map((p: any, idx: number) => {
      const pKey = getProdKey(p, idx);
      const iKey = getItemIdKey(p, idx);
      const existingMatch = (order.brandAssignments || []).find(
        (b: any) => String(b.productId) === pKey || b.orderItemId === iKey
      );
      const boObj = brandOwnersList.find(
        (bo) => bo.name?.toLowerCase().trim() === existingMatch?.brandOwnerName?.toLowerCase().trim() || String(bo.id) === String(existingMatch?.brandOwnerId)
      );
      return {
        brandOwnerAssignid: existingMatch?.brandOwnerAssignid || existingMatch?.id || `boa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        orderItemId: iKey,
        productId: pKey,
        brandOwnerId: existingMatch?.brandOwnerId || boObj?.id || '',
        brandOwnerName: existingMatch?.brandOwnerName || boObj?.name || '',
        contactEmail: existingMatch?.contactEmail || boObj?.contactEmail || boObj?.email || '',
        contactMobile: existingMatch?.contactMobile || boObj?.contactMobile || (boObj as any)?.phone || '',
        whatsappNo: existingMatch?.whatsappNo || boObj?.whatsappNo || '',
      };
    });
    setBrandAssignments(fallbackAssignments);
    setModalDetailsLoading(false);
  };

  // Change selected Brand Owner for an item
  const handleItemBrandOwnerSelect = (idx: number, newOwnerId: string) => {
    const selectedOwner = brandOwnersList.find((b) => String(b.id) === String(newOwnerId));
    setBrandAssignments((prev) => {
      const updated = [...prev];
      if (updated[idx]) {
        updated[idx] = {
          ...updated[idx],
          brandOwnerId: selectedOwner ? selectedOwner.id : '',
          brandOwnerName: selectedOwner ? selectedOwner.name : '',
          contactEmail: selectedOwner ? (selectedOwner.contactEmail || selectedOwner.email || '') : '',
          contactMobile: selectedOwner ? (selectedOwner.contactMobile || selectedOwner.contactPhone || (selectedOwner as any)?.phone || '') : '',
          whatsappNo: selectedOwner ? (selectedOwner.whatsappNo || '') : '',
        };
      }
      return updated;
    });
  };

  // Save Brand Owner Assignments API
  const handleSaveAssignments = async () => {
    if (!selectedOrder) return;

    // DATA VALIDATION CONSTRAINT RE-CHECK
    if (isDeliveryStatusRestricted(selectedOrder.deliveryStatus)) {
      showStatus(
        `Data validation restricted: Cannot assign brand owners for order with deliveryStatus '${selectedOrder.deliveryStatus}'. Value must NOT be COMPLETED or RETURNED.`,
        'error'
      );
      return;
    }

    const validAssignments = brandAssignments
      .filter((a) => a.brandOwnerId && a.brandOwnerName && a.brandOwnerName !== '-- Select Brand Owner --')
      .map((a) => ({
        ...a,
        brandOwnerAssignid: a.brandOwnerAssignid || `boa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      }));

    if (validAssignments.length === 0) {
      showStatus('Please select a valid Brand Owner for at least one item before saving.', 'error');
      return;
    }

    setSubmitting(true);
    let saved = false;

    // 1. Try authoritative operations API
    try {
      const res = await apiFetch(`/api/operations/orders/${selectedOrder.id}/brand-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments: validAssignments,
          assignedBy: 'Ops Admin',
        }),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (data && data.success) {
            saved = true;
          }
        }
      }
    } catch (apiErr) {
      console.warn('API save fallback to direct Firestore:', apiErr);
    }

    // 2. Direct Firestore fallback
    if (!saved) {
      try {
        const now = new Date().toISOString();
        const updatedDeliveryStatus = 'PACKING';

        // Update sales_orders document directly
        await orderRepository.update(selectedOrder.id, {
          deliveryStatus: updatedDeliveryStatus as any,
          brandAssignments: validAssignments,
          lastUpdated: now,
        } as any);

        // Also persist assignment records into shipment_brand_owner_fulfilment
        for (const a of validAssignments) {
          const prodMatch = (selectedOrder.products || []).find(
            (p: any, idx: number) => getProdKey(p, idx) === a.productId || getItemIdKey(p, idx) === a.orderItemId
          );
          const packingSize = prodMatch?.packingSize || prodMatch?.orderpackingsize || 'Standard';
          const unit = prodMatch?.unit || prodMatch?.orderunit || 'PCS';
          const qty = Number(prodMatch?.quantity ?? prodMatch?.qty ?? 1);
          const today = now.split('T')[0];

          const boaDoc = {
            id: a.brandOwnerAssignid,
            brandOwnerAssignid: a.brandOwnerAssignid,
            salesOrderId: String(selectedOrder.id),
            orderItemId: a.orderItemId,
            itemId: a.orderItemId,
            productId: a.productId,
            productName: prodMatch?.name || prodMatch?.productName || 'Product Item',
            brandOwnerId: a.brandOwnerId,
            brandOwnerName: a.brandOwnerName,
            orderpackingsize: packingSize,
            orderunit: unit,
            orderqty: qty,
            outpackdate: today,
            outpackingsize: packingSize,
            outunit: unit,
            outquantity: qty,
            outstatus: 'PACKING',
            outbalanceqty: 0,
            outexpecteddateofdespatchdate: today,
            outdealyreasons: '',
            fulfillmentstatus: 'PACKING',
            status: 'ASSIGNED',
            orderfulfilment: [],
            createdAt: now,
            updatedAt: now,
          };

          try {
            await shipmentBrandOwnerAssignmentRepository.update(a.brandOwnerAssignid, boaDoc);
          } catch {
            await shipmentBrandOwnerAssignmentRepository.create(boaDoc);
          }
        }

        saved = true;
      } catch (repoErr: any) {
        console.error('Direct Firestore save failed:', repoErr);
        showStatus(repoErr?.message || 'Failed to save brand owner assignments to database.', 'error');
        setSubmitting(false);
        return;
      }
    }

    if (saved) {
      if (selectedOrder) {
        selectedOrder.deliveryStatus = 'PACKING';
      }
      showStatus('Brand Owner Assignments saved successfully! Delivery status updated to PACKING.');
      setIsModalOpen(false);
      fetchOrders();
    }
    setSubmitting(false);
  };

  // Filter orders locally if needed
  const filteredOrders = orders.filter((order) => {
    const status = getOrderAssignmentStatus(order);
    if (assignmentStatusFilter === 'ASSIGNED' && status !== 'ASSIGNED') return false;
    if (assignmentStatusFilter === 'UNASSIGNED' && status !== 'UNASSIGNED' && status !== 'PARTIAL') return false;
    if (assignmentStatusFilter === 'RESTRICTED' && status !== 'RESTRICTED') return false;
    return true;
  });

  // Calculate metrics
  const totalCount = paginationInfo.totalRecords || orders.length;
  const restrictedCount = orders.filter((o) => isDeliveryStatusRestricted(o.deliveryStatus)).length;
  const assignedCount = orders.filter((o) => getOrderAssignmentStatus(o) === 'ASSIGNED').length;
  const pendingCount = orders.filter((o) => {
    const s = getOrderAssignmentStatus(o);
    return s === 'UNASSIGNED' || s === 'PARTIAL';
  }).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-slate-900 dark:text-slate-100">
      {/* Top Banner & Header - Project Fresh Green & Lime Theme */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-emerald-800 via-green-900 to-emerald-950 p-6 rounded-2xl text-white shadow-xl border border-green-700/50">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <UserCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Brand Owner Assignment Module</h1>
              <p className="text-xs md:text-sm text-green-100/90">
                Populates sales orders records from <span className="font-mono text-emerald-300 font-semibold">sales_orders</span> table. Standard data validation enforced.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchOrders()}
            className="flex items-center space-x-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 border border-green-500 text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-md backdrop-blur-md active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Grid</span>
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-md transition-all ${
            statusMessage.type === 'error'
              ? 'bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/70 dark:border-rose-900 dark:text-rose-200'
              : statusMessage.type === 'warning'
              ? 'bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/70 dark:border-amber-900 dark:text-amber-200'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/70 dark:border-emerald-900 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center space-x-3">
            {statusMessage.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            ) : statusMessage.type === 'warning' ? (
              <Ban className="w-5 h-5 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Summary Cards - Fresh Green Theme */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-green-200 dark:border-green-900/40 shadow-xs hover:border-green-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Grid Orders</span>
            <div className="p-2 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 rounded-lg">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-800 dark:text-slate-100">{totalCount}</div>
          <span className="text-[11px] text-slate-500">From sales_orders table</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-green-200 dark:border-green-900/40 shadow-xs hover:border-green-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned Orders</span>
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">{assignedCount}</div>
          <span className="text-[11px] text-slate-500">All products assigned</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-green-200 dark:border-green-900/40 shadow-xs hover:border-green-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Assignment</span>
            <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">{pendingCount}</div>
          <span className="text-[11px] text-slate-500">Awaiting brand owner</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-green-200 dark:border-green-900/40 shadow-xs hover:border-green-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assignment Restricted</span>
            <div className="p-2 bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 rounded-lg">
              <Ban className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400">{restrictedCount}</div>
          <span className="text-[11px] text-rose-500 font-medium">deliveryStatus = COMPLETED / RETURNED</span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-green-200 dark:border-green-900/40 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Order #, Customer Name, Mobile, or Product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-green-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAssignmentStatusFilter('ALL')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                assignmentStatusFilter === 'ALL'
                  ? 'bg-green-600 text-white font-semibold shadow-sm'
                  : 'bg-green-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-green-100 dark:hover:bg-slate-700 border border-green-200 dark:border-slate-700'
              }`}
            >
              All Records
            </button>
            <button
              onClick={() => setAssignmentStatusFilter('UNASSIGNED')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                assignmentStatusFilter === 'UNASSIGNED'
                  ? 'bg-amber-600 text-white font-semibold shadow-sm'
                  : 'bg-amber-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-slate-700 border border-amber-200 dark:border-slate-700'
              }`}
            >
              Pending Assignment
            </button>
            <button
              onClick={() => setAssignmentStatusFilter('ASSIGNED')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                assignmentStatusFilter === 'ASSIGNED'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'bg-emerald-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-slate-700 border border-emerald-200 dark:border-slate-700'
              }`}
            >
              Assigned
            </button>
            <button
              onClick={() => setAssignmentStatusFilter('RESTRICTED')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                assignmentStatusFilter === 'RESTRICTED'
                  ? 'bg-rose-600 text-white font-semibold shadow-sm'
                  : 'bg-rose-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-rose-100 dark:hover:bg-slate-700 border border-rose-200 dark:border-slate-700'
              }`}
            >
              Restricted (Completed/Returned)
            </button>
          </div>
        </div>

        {/* Secondary Detailed Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-green-100 dark:border-slate-800">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Customer Name</label>
            <input
              type="text"
              placeholder="Filter customer..."
              value={customerNameFilter}
              onChange={(e) => setCustomerNameFilter(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-green-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Mobile Number</label>
            <input
              type="text"
              placeholder="Filter mobile..."
              value={mobileFilter}
              onChange={(e) => setMobileFilter(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-green-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Item Name</label>
            <input
              type="text"
              placeholder="Filter product..."
              value={itemNameFilter}
              onChange={(e) => setItemNameFilter(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-green-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Order Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-green-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={() => {
              setSearchQuery('');
              setCustomerNameFilter('');
              setMobileFilter('');
              setItemNameFilter('');
              setDateFilter('');
              setPage(1);
              fetchOrders();
            }}
            className="text-xs text-green-700 dark:text-green-400 font-semibold hover:underline"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Main Data Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-green-200 dark:border-green-900/40 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-green-50/70 dark:bg-slate-800/80 border-b border-green-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                <th className="py-4 px-4">Sales Order #</th>
                <th className="py-4 px-4">Date</th>
                <th className="py-4 px-4">Customer Name</th>
                <th className="py-4 px-4">Mobile No</th>
                <th className="py-4 px-4">Delivery Status</th>
                <th className="py-4 px-4">Brand Owner</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-green-100 dark:divide-slate-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <RefreshCw className="w-8 h-8 animate-spin text-green-600" />
                      <span className="text-sm">Populating records from sales_orders tables...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Package className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                      <span className="font-semibold text-slate-600 dark:text-slate-400">No sales orders found</span>
                      <span className="text-xs text-slate-400">Try adjusting your filters or search criteria.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const assignmentStatus = getOrderAssignmentStatus(order);
                  const isRestricted = isDeliveryStatusRestricted(order.deliveryStatus);
                  const prods = order.products || [];

                  const assignedOwners = Array.from(
                    new Set(
                      (order.brandAssignments || [])
                        .map((b: any) => b.brandOwnerName)
                        .filter((name: string) => name && name !== '-- Select Brand Owner --')
                    )
                  );

                  const stateName = (order as any).customerState || (order as any).shippingState || (order as any).state || (order as any).customerAddress?.state || 'N/A';
                  const mobileNum = order.customerMobile || (order as any).customerPhone || (order as any).mobile || 'N/A';

                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-green-50/40 dark:hover:bg-slate-800/50 transition-colors ${
                        isRestricted ? 'bg-slate-50/40 dark:bg-slate-900/40' : ''
                      }`}
                    >
                      {/* 1. Sales Order # */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs font-normal font-mono text-slate-800 dark:text-slate-200">
                        {order.orderNumber || order.id}
                      </td>

                      {/* 2. Date */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs font-normal text-slate-700 dark:text-slate-300">
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                      </td>

                      {/* 3. Customer Name */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs font-normal text-slate-800 dark:text-slate-200">
                        {order.customerName || 'Customer'}
                      </td>

                      {/* 4. Mobile No */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs font-normal text-slate-700 dark:text-slate-300 font-mono">
                        {mobileNum}
                      </td>

                     

                      {/* 5. Delivery Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-normal ${getDeliveryStatusBadgeClass(
                            order.deliveryStatus
                          )}`}
                        >
                          {order.deliveryStatus || 'Pending'}
                        </span>
                        {isRestricted && (
                          <div className="text-[10px] font-normal text-rose-600 dark:text-rose-400 mt-0.5 flex items-center space-x-1">
                            <Ban className="w-3 h-3" />
                            <span>Restricted</span>
                          </div>
                        )}
                      </td>

                      {/* 6. Brand Owner (Same grid color, no background box) */}
                      <td className="py-3 px-4 text-xs font-normal text-slate-800 dark:text-slate-200">
                        {assignedOwners.length > 0 ? (
                          assignedOwners.join(', ')
                        ) : assignmentStatus === 'RESTRICTED' ? (
                          <span className="text-rose-600 dark:text-rose-400 font-normal">Locked</span>
                        ) : (
                          <span className="text-slate-500 font-normal">Unassigned</span>
                        )}
                      </td>

                      {/* 7. Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => openAssignmentModal(order)}
                          disabled={isRestricted}
                          title={
                            isRestricted
                              ? "Data validation restricted: Orders with deliveryStatus COMPLETED or RETURNED cannot be assigned."
                              : "Assign Brand Owner for items"
                          }
                          className={`px-3 py-1.5 rounded-xl text-xs font-normal transition-all duration-200 inline-flex items-center space-x-1.5 shadow-xs ${
                            isRestricted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700'
                              : 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20 active:scale-95'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>{isRestricted ? 'Restricted' : 'Assign Owner'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-green-50/50 dark:bg-slate-800/50 border-t border-green-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              Showing <span className="font-semibold text-slate-900 dark:text-slate-100">{filteredOrders.length}</span> of{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{totalCount}</span> sales order records
            </div>

            {/* Records per page option (Maximum 30 Nos) */}
            <div className="flex items-center space-x-1.5 border-l border-green-200 dark:border-slate-700 pl-3">
              <label htmlFor="records-per-page-select" className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                Records per page:
              </label>
              <select
                id="records-per-page-select"
                value={limit}
                onChange={(e) => {
                  const selectedLimit = Math.min(30, Math.max(1, Number(e.target.value) || 10));
                  setLimit(selectedLimit);
                  setPage(1);
                }}
                className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-green-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-green-500 cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={25}>25</option>
                <option value={30}>30 (Max)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 bg-white dark:bg-slate-800 border border-green-200 dark:border-slate-700 rounded-lg disabled:opacity-50 font-semibold hover:bg-green-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold">
              Page {page} of {paginationInfo.totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(paginationInfo.totalPages || 1, p + 1))}
              disabled={page >= (paginationInfo.totalPages || 1)}
              className="p-2 bg-white dark:bg-slate-800 border border-green-200 dark:border-slate-700 rounded-lg disabled:opacity-50 font-semibold hover:bg-green-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Brand Owner Assignment Modal */}
      {isModalOpen && selectedOrder && (() => {
        const totalProductsCount = selectedOrder.products?.length || 0;
        const assignedProductsCount = brandAssignments.filter(
          (a) => a.brandOwnerId && a.brandOwnerName && a.brandOwnerName !== '-- Select Brand Owner --'
        ).length;
        const modalDeliveryStatus = assignedProductsCount > 0 || selectedOrder.deliveryStatus === 'PACKING' ? 'PACKING' : selectedOrder.deliveryStatus;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full border border-green-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8">
              {/* Modal Header */}
              <div className="p-5 bg-gradient-to-r from-green-900 to-emerald-950 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">Assign Brand Owners</h3>
                  <p className="text-xs text-green-100/90">
                    Sales Order #: <span className="font-mono text-emerald-300 font-semibold">{selectedOrder.orderNumber || selectedOrder.id}</span>
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Order Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-green-50/60 dark:bg-slate-800/60 rounded-xl border border-green-200 dark:border-slate-700 text-xs">
                  <div>
                    <span className="text-slate-500 font-semibold block">Customer</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrder.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block">Total Amount</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">₹{selectedOrder.totalValue?.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block">Delivery Status</span>
                    <span className={`font-bold uppercase ${isDeliveryStatusRestricted(modalDeliveryStatus) ? 'text-rose-600' : modalDeliveryStatus === 'PACKING' ? 'text-green-600 dark:text-green-400' : 'text-emerald-600'}`}>
                      {modalDeliveryStatus}
                    </span>
                  </div>
                </div>

                {/* Data Validation Check Warning */}
                {isDeliveryStatusRestricted(selectedOrder.deliveryStatus) ? (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-200 rounded-xl text-xs flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600" />
                    <div>
                      <span className="font-bold block text-sm">Data Validation Restriction Active</span>
                      <span>
                        Brand Owner Assignment is strictly prohibited for orders where deliveryStatus is COMPLETED or RETURNED.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Order Products ({selectedOrder.products?.length || 0})</span>
                      <span className="text-[11px] text-green-700 dark:text-green-400 font-normal">Select owner for each item</span>
                    </div>

                    {modalDetailsLoading ? (
                      <div className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-green-600 mb-2" />
                        <span className="text-xs">Loading item details...</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-green-200 dark:border-slate-700 rounded-xl shadow-2xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-green-50/80 dark:bg-slate-800/80 border-b border-green-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                              <th className="py-3 px-3">Product Details</th>
                              <th className="py-3 px-3 text-center">Qty</th>
                              <th className="py-3 px-3">Select Brand Owner</th>
                              <th className="py-3 px-3">Brand Owner Email</th>
                              <th className="py-3 px-3">Brand Owner WhatsApp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-green-100 dark:divide-slate-800">
                            {(selectedOrder.products || []).map((prod: any, idx: number) => {
                              const currentAssignment: any = brandAssignments[idx] || {};
                              const pName = prod.productName || prod.name || `Product #${idx + 1}`;

                              return (
                                <tr key={idx} className="hover:bg-green-50/40 dark:hover:bg-slate-800/50 transition-colors">
                                  {/* 1. Product Details */}
                                  <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">
                                    <div className="font-semibold text-slate-800 dark:text-slate-200">{pName}</div>
                                    {(prod.productId || prod.sku) && (
                                      <div className="text-[10px] text-slate-400 font-mono">
                                        ID: {prod.productId || prod.sku}
                                      </div>
                                    )}
                                  </td>

                                  {/* 2. Qty */}
                                  <td className="py-3 px-3 text-center font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                    {prod.quantity || prod.qty || 1}
                                  </td>

                                  {/* 3. Select Brand Owner */}
                                  <td className="py-3 px-3 min-w-[190px]">
                                    <select
                                      value={currentAssignment.brandOwnerId || ''}
                                      onChange={(e) => handleItemBrandOwnerSelect(idx, e.target.value)}
                                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-green-200 dark:border-slate-600 rounded-lg text-xs font-medium focus:ring-2 focus:ring-green-500 outline-none cursor-pointer"
                                    >
                                      <option value="">-- Select Brand Owner --</option>
                                      {brandOwnersList.map((bo) => (
                                        <option key={bo.id} value={bo.id}>
                                          {bo.name} {bo.contactPerson ? `(${bo.contactPerson})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* 4. Brand Owner Email */}
                                  <td className="py-3 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {currentAssignment.contactEmail ? (
                                      <span className="text-xs font-normal">{currentAssignment.contactEmail}</span>
                                    ) : (
                                      <span className="text-slate-400 italic text-xs">N/A</span>
                                    )}
                                  </td>

                                  {/* 5. Brand Owner WhatsApp */}
                                  <td className="py-3 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {currentAssignment.whatsappNo || currentAssignment.contactMobile ? (
                                      <span className="text-xs font-mono">{currentAssignment.whatsappNo || currentAssignment.contactMobile}</span>
                                    ) : (
                                      <span className="text-slate-400 italic text-xs">N/A</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-5 bg-green-50/60 dark:bg-slate-800/80 border-t border-green-200 dark:border-slate-700 flex items-center justify-end space-x-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>

                {!isDeliveryStatusRestricted(selectedOrder.deliveryStatus) && (
                  <button
                    onClick={handleSaveAssignments}
                    disabled={submitting}
                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Brand Owner Assignment</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
