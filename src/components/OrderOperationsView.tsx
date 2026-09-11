import React, { useState, useEffect } from 'react';
import {
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Send,
  MessageSquare,
  Clock,
  UserCheck,
  Search,
  RefreshCw,
  Plus,
  ArrowRight,
  ShieldCheck,
  DollarSign,
  FileText,
  MapPin,
  Calendar,
  X,
  ExternalLink,
  ChevronRight,
  Printer,
  Share2,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import { useCRM } from '../store';

interface OperationsOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  products: any[];
  totalValue: number;
  paymentStatus: string;
  deliveryStatus: string;
  fulfilmentStatus: string;
  assignedTo?: string;
  createdAt: string;
  paymentMethod?: string;
  contactNo?: string;
  salesChannel?: string;
}

export const OrderOperationsView: React.FC = () => {
  const { salesOrders } = useCRM();
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'packing' | 'dispatch' | 'delivery' | 'returns' | 'unpaid'>('all');
  const [orders, setOrders] = useState<OperationsOrder[]>([]);
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<OperationsOrder | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('NOT_STARTED');
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Print & Share Modals State
  const [printOrder, setPrintOrder] = useState<OperationsOrder | null>(null);
  const [printDetails, setPrintDetails] = useState<any>(null);
  const [printLoading, setPrintLoading] = useState<boolean>(false);

  const [shareOrder, setShareOrder] = useState<OperationsOrder | null>(null);
  const [shareText, setShareText] = useState<string>('');
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // Form Modals State
  const [activeModal, setActiveModal] = useState<'packing' | 'brand' | 'shipment' | 'delivery' | 'return' | 'reverseShipment' | null>(null);

  // Form Inputs
  const [packerIdInput, setPackerIdInput] = useState<string>('Ops Staff');
  const [packingNotesInput, setPackingNotesInput] = useState<string>('');

  const [brandAssignments, setBrandAssignments] = useState<{ orderItemId: string; productId: string; brandOwnerId: string; brandOwnerName: string }[]>([]);

  const [shipmentForm, setShipmentForm] = useState({
    courierAgency: 'FedEx Express',
    trackingNumber: '',
    packageCount: 1,
    weightKg: 0.5,
    baseCharge: 50,
    handlingCharge: 10,
    additionalCharge: 0,
    otherCharge: 0,
  });

  const [deliveryForm, setDeliveryForm] = useState({
    recipientName: '',
    remarks: 'Delivered in good condition',
    proofOfDeliveryUrl: '',
  });

  const [returnForm, setReturnForm] = useState({
    reason: 'DAMAGED',
    notes: '',
    selectedProductIds: [] as string[],
  });

  const [reverseShipmentForm, setReverseShipmentForm] = useState({
    returnId: '',
    courierAgency: 'BlueDart Return Services',
    trackingNumber: '',
    remarks: 'Customer return pickup',
  });

  const fetchOrders = async () => {
    setLoading(true);
    try {
      let endpoint = '/api/operations/orders';
      if (activeSubTab === 'packing') endpoint = '/api/operations/packing/orders';
      if (activeSubTab === 'dispatch') endpoint = '/api/operations/dispatch/orders';
      if (activeSubTab === 'delivery') endpoint = '/api/operations/delivery/orders';

      const res = await fetch(endpoint);
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : null;
      if (data?.success) {
        setOrders(data.orders || []);
      } else {
        setOrders(salesOrders.map((order) => ({
          ...order,
          fulfilmentStatus: order.deliveryStatus === 'Delivered'
            ? 'DELIVERED'
            : order.deliveryStatus === 'Shipped'
            ? 'DISPATCHED'
            : 'NOT_STARTED',
        })));
      }

      if (activeSubTab === 'returns' && data?.success) {
        const retRes = await fetch('/api/operations/returns');
        const retData = await retRes.json();
        if (retData.success) {
          setReturnsList(retData.returns || []);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch operations data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [activeSubTab, salesOrders]);

  const fetchOrderDetails = async (orderId: string) => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/operations/orders/${orderId}`);
      const data = await res.json();
      if (data.success) {
        setOrderDetails(data);
        if (data.fulfilment?.status) {
          setSelectedStatus(data.fulfilment.status);
        }
      }
    } catch (err) {
      console.error('Error fetching details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openOrderModal = (order: OperationsOrder) => {
    setSelectedOrder(order);
    setSelectedStatus(order.fulfilmentStatus || 'NOT_STARTED');
    fetchOrderDetails(order.id);

    // Pre-fill brand assignments structure
    const initialBrandAssignments = (order.products || []).map((p: any, index: number) => ({
      orderItemId: `item_${p.productId || p.id || index}`,
      productId: String(p.productId || p.id || `p_${index}`),
      brandOwnerId: p.brandOwnerId || 'brand_owner_default',
      brandOwnerName: p.brandOwner || p.brand || 'VioLeafy Partner',
    }));
    setBrandAssignments(initialBrandAssignments);

    setDeliveryForm({
      recipientName: order.customerName || 'Customer',
      remarks: 'Delivered successfully',
      proofOfDeliveryUrl: '',
    });

    setShipmentForm((prev) => ({
      ...prev,
      trackingNumber: `TRK${Date.now().toString().slice(-8)}`,
    }));
  };

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // API Triggers
  const handleStartPacking = async (orderId: string) => {
    try {
      const res = await fetch(`/api/operations/orders/${orderId}/packing/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packerId: packerIdInput }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus('Packing started successfully!');
        fetchOrders();
        fetchOrderDetails(orderId);
      } else {
        showStatus(data.error || 'Failed to start packing', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleCompletePacking = async (orderId: string) => {
    try {
      const res = await fetch(`/api/operations/orders/${orderId}/packing/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packerId: packerIdInput, notes: packingNotesInput }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus('Packing completed! Order is ready for brand assignment & dispatch.');
        setActiveModal(null);
        fetchOrders();
        fetchOrderDetails(orderId);
      } else {
        showStatus(data.error || 'Failed to complete packing', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleAssignBrandOwners = async (orderId: string) => {
    try {
      const res = await fetch(`/api/operations/orders/${orderId}/brand-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: brandAssignments, assignedBy: 'Ops Manager' }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus('Brand owners assigned to order items successfully!');
        setActiveModal(null);
        fetchOrderDetails(orderId);
      } else {
        showStatus(data.error || 'Failed to assign brand owners', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleCreateShipment = async (orderId: string) => {
    try {
      const res = await fetch(`/api/operations/orders/${orderId}/shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shipmentForm),
      });
      const data = await res.json();
      if (data.success) {
        showStatus(`Shipment created with tracking #${data.shipment.trackingNumber}. Total charge: ₹${data.shipment.charges.totalCharge}`);
        setActiveModal(null);
        fetchOrders();
        fetchOrderDetails(orderId);
      } else {
        showStatus(data.error || 'Failed to create shipment', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleDispatchShipment = async (shipmentId: string, orderId: string) => {
    try {
      const res = await fetch(`/api/operations/shipments/${shipmentId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatchedBy: 'Logistics Supervisor' }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus('Shipment dispatched and marked IN_TRANSIT!');
        fetchOrders();
        fetchOrderDetails(orderId);
      } else {
        showStatus(data.error || 'Failed to dispatch shipment', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleRecordDelivery = async (targetId: string, orderId: string) => {
    try {
      const res = await fetch(`/api/operations/shipments/${targetId}/delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deliveryForm),
      });
      const data = await res.json();
      if (data.success) {
        showStatus('Delivery recorded permanently in operational history!');
        setActiveModal(null);
        setSelectedStatus('DELIVERED');
        setSelectedOrder((prev) => (prev ? { ...prev, fulfilmentStatus: 'DELIVERED' } : null));
        fetchOrders();
        fetchOrderDetails(orderId);
      } else {
        showStatus(data.error || 'Failed to record delivery', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleCreateReturn = async (orderId: string) => {
    try {
      const items = (selectedOrder?.products || []).map((p: any, idx: number) => ({
        orderItemId: `item_${p.productId || p.id || idx}`,
        productId: String(p.productId || p.id || idx),
        productName: p.productName || 'Order Product',
        quantity: 1,
        reason: returnForm.reason,
      }));

      const res = await fetch(`/api/operations/orders/${orderId}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, reason: returnForm.reason, notes: returnForm.notes, requestedBy: 'Customer Support' }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus('Return request registered. Reverse logistics initiated!');
        setActiveModal(null);
        fetchOrders();
        fetchOrderDetails(orderId);
      } else {
        showStatus(data.error || 'Failed to create return', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleCreateReverseShipment = async () => {
    try {
      const res = await fetch(`/api/operations/returns/${reverseShipmentForm.returnId}/reverse-shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reverseShipmentForm),
      });
      const data = await res.json();
      if (data.success) {
        showStatus('Reverse shipment tracking created!');
        setActiveModal(null);
        fetchOrders();
        if (selectedOrder) fetchOrderDetails(selectedOrder.id);
      } else {
        showStatus(data.error || 'Failed to create reverse shipment', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleSendPaymentReminder = async (orderId: string, type: 'standard' | 'whatsapp') => {
    try {
      const endpoint = type === 'whatsapp'
        ? `/api/operations/orders/${orderId}/whatsapp-payment-reminder`
        : `/api/operations/orders/${orderId}/payment-reminder`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentBy: 'Ops Desk' }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus(`${type === 'whatsapp' ? 'WhatsApp' : 'Standard'} payment reminder sent successfully!`);
        fetchOrderDetails(orderId);
      } else {
        showStatus(data.error || 'Failed to send reminder', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedOrder) return;
    try {
      const res = await fetch(`/api/operations/orders/${selectedOrder.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: selectedStatus, updatedBy: 'Ops Manager' }),
      });
      const data = await res.json();
      if (data.success) {
        showStatus(`Fulfilment status updated to '${selectedStatus}' successfully!`);
        setSelectedOrder((prev) => (prev ? { ...prev, fulfilmentStatus: selectedStatus } : null));
        fetchOrders();
        fetchOrderDetails(selectedOrder.id);
      } else {
        showStatus(data.error || 'Failed to update status', 'error');
      }
    } catch (err: any) {
      showStatus(err.message, 'error');
    }
  };

  const openPrintOrderModal = async (order: OperationsOrder) => {
    setPrintOrder(order);
    setPrintLoading(true);
    try {
      const res = await fetch(`/api/operations/orders/${order.id}`);
      const data = await res.json();
      if (data.success) {
        setPrintDetails(data);
      }
    } catch (err) {
      console.error('Error fetching print details:', err);
    } finally {
      setPrintLoading(false);
    }
  };

  const openShareOrderModal = (order: OperationsOrder) => {
    setShareOrder(order);
    setCopiedSummary(false);

    const itemsList = (order.products || [])
      .map((p: any) => `- ${p.productName || p.name || 'Product'} x ${p.quantity || 1} (₹${p.price || 0})`)
      .join('\n');

    const text = `📦 *VIOLEAFY ORDER SUMMARY*
----------------------------------------
Order #: ${order.orderNumber || order.id}
Customer: ${order.customerName || 'Valued Customer'}
Total Amount: ₹${(order.totalValue || 0).toLocaleString()}
Payment Status: ${order.paymentStatus || 'Pending'}
Fulfilment Status: ${order.fulfilmentStatus || 'NOT_STARTED'}
Sales Channel: ${order.salesChannel || 'Mobile App'}
Order Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}

*Order Items:*
${itemsList || '- 1x Package Item'}

VioLeafy E-Commerce Platform`;

    setShareText(text);
  };

  const handleCopyShareSummary = () => {
    navigator.clipboard.writeText(shareText);
    setCopiedSummary(true);
    showStatus('Order summary copied to clipboard!');
    setTimeout(() => setCopiedSummary(false), 3000);
  };

  const handleWhatsAppShare = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share && shareOrder) {
      try {
        await navigator.share({
          title: `VioLeafy Order ${shareOrder.orderNumber || shareOrder.id}`,
          text: shareText,
        });
      } catch (err) {
        console.warn('Native share cancelled:', err);
      }
    } else {
      handleCopyShareSummary();
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (activeSubTab === 'unpaid' && o.paymentStatus === 'Paid') return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.id && o.id.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'DISPATCHED':
      case 'IN_TRANSIT':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'PACKED':
      case 'READY_FOR_DISPATCH':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'PACKING':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'RETURN_IN_PROGRESS':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-7 h-7 text-emerald-200" />
            <h2 className="text-xl font-black uppercase tracking-tight">Order Operations & Fulfilment Hub</h2>
          </div>
          <p className="text-xs text-emerald-100 font-medium mt-1">
            Non-Invasive Operations Control: Packing, Multi-Brand Item Assignment, Courier Dispatch, Delivery Audits & Returns
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-extrabold uppercase transition backdrop-blur-sm cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Pipeline
        </button>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-md ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pipeline Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 text-xs font-bold">
        <button
          onClick={() => setActiveSubTab('all')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'all' ? 'bg-emerald-600 text-white font-black shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          All Orders
        </button>

        <button
          onClick={() => setActiveSubTab('packing')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'packing' ? 'bg-emerald-600 text-white font-black shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          Packing Queue
        </button>

        <button
          onClick={() => setActiveSubTab('dispatch')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'dispatch' ? 'bg-emerald-600 text-white font-black shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          Ready for Dispatch
        </button>

        <button
          onClick={() => setActiveSubTab('delivery')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'delivery' ? 'bg-emerald-600 text-white font-black shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Delivery Audit
        </button>

        <button
          onClick={() => setActiveSubTab('returns')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'returns' ? 'bg-emerald-600 text-white font-black shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          Returns & Reverse Logistics
        </button>

        <button
          onClick={() => setActiveSubTab('unpaid')}
          className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'unpaid' ? 'bg-amber-600 text-white font-black shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Send className="w-4 h-4" />
          Payment Reminders
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Order #, Customer name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          />
        </div>

        <div className="text-xs text-slate-500 font-bold">
          Showing <span className="text-emerald-700 font-extrabold">{filteredOrders.length}</span> sales orders
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-500 text-xs font-bold gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
          Fetching sales orders from authoritative violeafydb...
        </div>
      ) : activeSubTab === 'returns' ? (
        /* Returns Table View */
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 uppercase text-[10px] font-extrabold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3">Return ID</th>
                <th className="p-3">Order ID</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Items Count</th>
                <th className="p-3">Reverse Tracking</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returnsList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    No return records found.
                  </td>
                </tr>
              ) : (
                returnsList.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-emerald-700">{ret.returnId || ret.id}</td>
                    <td className="p-3 font-mono text-slate-600">{ret.orderId}</td>
                    <td className="p-3 font-bold text-slate-800">{ret.reason}</td>
                    <td className="p-3 font-bold text-slate-700">{ret.items?.length || 1}</td>
                    <td className="p-3 font-mono text-slate-600">
                      {ret.reverseShipment ? `${ret.reverseShipment.courierAgency} (${ret.reverseShipment.trackingNumber})` : 'Not Created'}
                    </td>
                    <td className="p-3">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border bg-purple-50 text-purple-800 border-purple-200">
                        {ret.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setReverseShipmentForm((prev) => ({ ...prev, returnId: ret.id }));
                          setActiveModal('reverseShipment');
                        }}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold uppercase transition"
                      >
                        Reverse Shipment
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Orders Main Table */
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 uppercase text-[10px] font-extrabold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3">Order #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Total Value</th>
                <th className="p-3">Payment</th>
                <th className="p-3">Fulfilment State</th>
                <th className="p-3">Created At</th>
                <th className="p-3 text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    No orders matching criteria in the pipeline.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-mono font-extrabold text-slate-900">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-black text-slate-900">{order.orderNumber || order.id}</div>
                          <div className="text-[9px] font-normal text-slate-400">{order.salesChannel || 'Mobile App'}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openOrderModal(order)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                            title="View Full Order Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openPrintOrderModal(order)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition cursor-pointer"
                            title="Print Order Receipt / Invoice"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openShareOrderModal(order)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition cursor-pointer"
                            title="Share Order Details"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-bold text-slate-800">{order.customerName || 'Standard Customer'}</td>
                    <td className="p-3 font-extrabold text-slate-900">₹{(order.totalValue || 0).toLocaleString()}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                          order.paymentStatus === 'Paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {order.paymentStatus || 'Pending'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${getStatusBadge(order.fulfilmentStatus)}`}>
                        {order.fulfilmentStatus}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[10px]">
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-3 text-right space-x-1.5">
                      <button
                        onClick={() => openOrderModal(order)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition cursor-pointer"
                      >
                        Manage Operations
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ORDER OPERATIONS DETAILS MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-extrabold text-base uppercase">Sales Order #{selectedOrder.orderNumber || selectedOrder.id}</h3>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-300">Status:</span>
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="bg-slate-800 text-white text-xs font-extrabold font-mono px-2.5 py-1 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        <option value="NOT_STARTED">NOT_STARTED</option>
                        <option value="PACKING">PACKING</option>
                        <option value="PACKED">PACKED</option>
                        <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                        <option value="DISPATCHED">DISPATCHED</option>
                        <option value="IN_TRANSIT">IN_TRANSIT</option>
                        <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="RETURN_IN_PROGRESS">RETURN_IN_PROGRESS</option>
                        <option value="COMPLETED">COMPLETED</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">Customer: {selectedOrder.customerName} | Value: ₹{selectedOrder.totalValue}</p>
                </div>
              </div>

              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {detailsLoading ? (
                <div className="flex items-center justify-center p-12 text-slate-500 font-bold gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                  Loading operational details & timeline...
                </div>
              ) : (
                <>
                  {/* Quick Action Control Bar */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <h4 className="font-black text-slate-700 uppercase text-[10px] tracking-wider">Fulfilment Action Pipeline</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleStartPacking(selectedOrder.id)}
                        className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Package className="w-3.5 h-3.5" /> Start Packing
                      </button>

                      <button
                        onClick={() => setActiveModal('packing')}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Complete Packing
                      </button>

                      <button
                        onClick={() => setActiveModal('brand')}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Item Brand Owner Assignment
                      </button>

                      <button
                        onClick={() => setActiveModal('shipment')}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Truck className="w-3.5 h-3.5" /> Create Shipment
                      </button>

                      <button
                        onClick={() => setActiveModal('delivery')}
                        className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5" /> Confirm Delivery
                      </button>

                      <button
                        onClick={() => setActiveModal('return')}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Process Return
                      </button>

                      <button
                        onClick={() => handleSendPaymentReminder(selectedOrder.id, 'standard')}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" /> Payment Reminder
                      </button>

                      <button
                        onClick={() => handleSendPaymentReminder(selectedOrder.id, 'whatsapp')}
                        className="px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> WhatsApp Reminder
                      </button>

                      <button
                        onClick={() => openPrintOrderModal(selectedOrder)}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print Order Details
                      </button>

                      <button
                        onClick={() => openShareOrderModal(selectedOrder)}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Share Order
                      </button>
                    </div>
                  </div>

                  {/* Order Items & Brand Owner Grid */}
                  <div className="space-y-2">
                    <h4 className="font-extrabold text-slate-800 uppercase text-[11px]">Sales Order Items</h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 uppercase text-[10px] font-extrabold text-slate-600">
                          <tr>
                            <th className="p-2.5">Product</th>
                            <th className="p-2.5">Qty</th>
                            <th className="p-2.5">Price</th>
                            <th className="p-2.5">Assigned Brand Owner</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(selectedOrder.products || []).map((prod: any, idx: number) => {
                            const brandMatch = (orderDetails?.brandAssignments || []).find(
                              (b: any) => String(b.productId) === String(prod.productId || prod.id)
                            );
                            return (
                              <tr key={idx}>
                                <td className="p-2.5 font-bold text-slate-800">{prod.productName || prod.name || `Product ${idx + 1}`}</td>
                                <td className="p-2.5 font-bold">{prod.quantity || 1}</td>
                                <td className="p-2.5 font-mono">₹{prod.price || 0}</td>
                                <td className="p-2.5 font-extrabold text-indigo-700">
                                  {brandMatch?.brandOwnerName || prod.brandOwner || prod.brand || 'Unassigned'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Shipments List */}
                  {orderDetails?.shipments?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-slate-800 uppercase text-[11px]">Shipments & Courier Details</h4>
                      <div className="space-y-2">
                        {orderDetails.shipments.map((shp: any) => (
                          <div key={shp.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900">{shp.courierAgency}</span>
                                <span className="font-mono text-emerald-700 font-extrabold">#{shp.trackingNumber}</span>
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-blue-100 text-blue-800">
                                  {shp.status}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                                Packages: {shp.packageCount} | Weight: {shp.weightKg}kg | Total Charge: ₹{shp.charges?.totalCharge || 0} (Base ₹{shp.charges?.baseCharge || 0} + Handling ₹{shp.charges?.handlingCharge || 0})
                              </div>
                            </div>
                            {shp.status !== 'DISPATCHED' && shp.status !== 'DELIVERED' && (
                              <button
                                onClick={() => handleDispatchShipment(shp.id, selectedOrder.id)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-extrabold uppercase cursor-pointer"
                              >
                                Confirm Dispatch
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timeline History */}
                  <div className="space-y-2">
                    <h4 className="font-extrabold text-slate-800 uppercase text-[11px]">Operational Audit History</h4>
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3 max-h-60 overflow-y-auto">
                      {(orderDetails?.timeline || []).length === 0 ? (
                        <p className="text-slate-400 font-medium text-center">No operational history recorded yet.</p>
                      ) : (
                        orderDetails.timeline.map((evt: any) => (
                          <div key={evt.id} className="flex items-start gap-3 text-[11px] border-b border-slate-200/60 pb-2">
                            <Clock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-extrabold text-slate-800">{evt.action}</div>
                              <div className="text-slate-600">{evt.description}</div>
                              <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                                {new Date(evt.timestamp).toLocaleString()} | By: {evt.performedBy || 'System'}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <span>Selected Status:</span>
                <span className="font-extrabold font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">{selectedStatus}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveStatus}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" /> Save Status
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition active:scale-95"
                >
                  Close Panel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL: PACKING NOTES */}
      {activeModal === 'packing' && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900">Complete Order Packing</h3>
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Packer Name / Staff ID</label>
              <input
                type="text"
                value={packerIdInput}
                onChange={(e) => setPackerIdInput(e.target.value)}
                className="w-full mt-1 p-2 text-xs border rounded-lg"
              />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Packing Remarks / Inspection Notes</label>
              <textarea
                value={packingNotesInput}
                onChange={(e) => setPackingNotesInput(e.target.value)}
                className="w-full mt-1 p-2 text-xs border rounded-lg"
                rows={3}
                placeholder="Verified all item quantities and box seals..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer">
                Cancel
              </button>
              <button onClick={() => handleCompletePacking(selectedOrder.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold cursor-pointer">
                Complete Packing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL: BRAND OWNER ASSIGNMENT */}
      {activeModal === 'brand' && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900">Assign Brand Owners (Item Level)</h3>
            <p className="text-xs text-slate-500">Link multi-brand sales order items to their respective brand owners for fulfilment routing.</p>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {brandAssignments.map((ba, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border rounded-xl flex items-center justify-between gap-2">
                  <div className="font-bold text-slate-800 truncate max-w-[150px]">{ba.productId}</div>
                  <input
                    type="text"
                    value={ba.brandOwnerName}
                    onChange={(e) => {
                      const updated = [...brandAssignments];
                      updated[idx].brandOwnerName = e.target.value;
                      setBrandAssignments(updated);
                    }}
                    placeholder="Brand Owner Name"
                    className="p-1.5 text-xs border rounded-lg flex-1"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer">
                Cancel
              </button>
              <button onClick={() => handleAssignBrandOwners(selectedOrder.id)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold cursor-pointer">
                Save Assignments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL: SHIPMENT CREATION */}
      {activeModal === 'shipment' && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900">Create Order Shipment</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">Courier Agency</label>
                <input
                  type="text"
                  value={shipmentForm.courierAgency}
                  onChange={(e) => setShipmentForm({ ...shipmentForm, courierAgency: e.target.value })}
                  className="w-full mt-1 p-2 text-xs border rounded-lg"
                />
              </div>
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">Tracking / Docket Number</label>
                <input
                  type="text"
                  value={shipmentForm.trackingNumber}
                  onChange={(e) => setShipmentForm({ ...shipmentForm, trackingNumber: e.target.value })}
                  className="w-full mt-1 p-2 text-xs border rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">Base Charge (₹)</label>
                <input
                  type="number"
                  value={shipmentForm.baseCharge}
                  onChange={(e) => setShipmentForm({ ...shipmentForm, baseCharge: Number(e.target.value) })}
                  className="w-full mt-1 p-2 text-xs border rounded-lg"
                />
              </div>
              <div>
                <label className="text-[10px] font-extrabold uppercase text-slate-500">Handling Charge (₹)</label>
                <input
                  type="number"
                  value={shipmentForm.handlingCharge}
                  onChange={(e) => setShipmentForm({ ...shipmentForm, handlingCharge: Number(e.target.value) })}
                  className="w-full mt-1 p-2 text-xs border rounded-lg"
                />
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-900">
              <span>Calculated Total Shipment Charge:</span>
              <span className="text-sm font-extrabold font-mono">
                ₹{Number(shipmentForm.baseCharge || 0) + Number(shipmentForm.handlingCharge || 0) + Number(shipmentForm.additionalCharge || 0) + Number(shipmentForm.otherCharge || 0)}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer">
                Cancel
              </button>
              <button onClick={() => handleCreateShipment(selectedOrder.id)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold cursor-pointer">
                Create Shipment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL: CONFIRM DELIVERY */}
      {activeModal === 'delivery' && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900">Confirm & Record Delivery</h3>
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Recipient Name</label>
              <input
                type="text"
                value={deliveryForm.recipientName}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, recipientName: e.target.value })}
                className="w-full mt-1 p-2 text-xs border rounded-lg"
              />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Delivery Remarks</label>
              <input
                type="text"
                value={deliveryForm.remarks}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, remarks: e.target.value })}
                className="w-full mt-1 p-2 text-xs border rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!selectedOrder) return;
                  const shp = orderDetails?.shipments?.[0];
                  handleRecordDelivery(shp?.id || selectedOrder.id, selectedOrder.id);
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold cursor-pointer transition active:scale-95"
              >
                Record Delivery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL: REVERSE SHIPMENT */}
      {activeModal === 'reverseShipment' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900">Create Reverse Shipment</h3>
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Reverse Courier Agency</label>
              <input
                type="text"
                value={reverseShipmentForm.courierAgency}
                onChange={(e) => setReverseShipmentForm({ ...reverseShipmentForm, courierAgency: e.target.value })}
                className="w-full mt-1 p-2 text-xs border rounded-lg"
              />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Reverse Tracking Number</label>
              <input
                type="text"
                value={reverseShipmentForm.trackingNumber}
                onChange={(e) => setReverseShipmentForm({ ...reverseShipmentForm, trackingNumber: e.target.value })}
                className="w-full mt-1 p-2 text-xs border rounded-lg font-mono"
                placeholder="RET987654321"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer">
                Cancel
              </button>
              <button onClick={handleCreateReverseShipment} className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold cursor-pointer">
                Create Reverse Tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORM MODAL: PROCESS RETURN */}
      {activeModal === 'return' && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900">Process Item Return</h3>
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Return Reason</label>
              <select
                value={returnForm.reason}
                onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
                className="w-full mt-1 p-2 text-xs border rounded-lg bg-white"
              >
                <option value="DAMAGED">Damaged in Transit</option>
                <option value="WRONG_ITEM">Wrong Item Sent</option>
                <option value="DEFECTIVE">Defective Product</option>
                <option value="NOT_NEEDED">Customer Changed Mind</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Return Notes</label>
              <textarea
                value={returnForm.notes}
                onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                className="w-full mt-1 p-2 text-xs border rounded-lg"
                rows={2}
                placeholder="Details of damage or return request..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setActiveModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer">
                Cancel
              </button>
              <button onClick={() => handleCreateReturn(selectedOrder.id)} className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold cursor-pointer">
                Initiate Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT ORDER DETAILS / INVOICE MODAL */}
      {printOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-sm uppercase">Print Order Invoice / Receipt</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                >
                  <Printer className="w-4 h-4" /> Print Document
                </button>
                <button onClick={() => setPrintOrder(null)} className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div id="printable-order-area" className="printable-order-modal p-8 flex-1 overflow-y-auto space-y-6 text-slate-800 bg-white">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-300 pb-6">
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-tight text-emerald-700">VioLeafy E-Commerce</h1>
                  <p className="text-xs font-semibold text-slate-500 mt-1">Official Sales Order Receipt & Invoice Copy</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Authoritative Operations Record • DB: violeafydb</p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-lg font-black text-slate-900">ORDER #{printOrder.orderNumber || printOrder.id}</div>
                  <div className="text-xs text-slate-500">Date: {printOrder.createdAt ? new Date(printOrder.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</div>
                  <div className="text-xs text-slate-500">Channel: {printOrder.salesChannel || 'Mobile App'}</div>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="font-extrabold uppercase text-slate-500 text-[10px]">Customer Information</span>
                  <div className="font-bold text-slate-900 text-sm mt-1">{printOrder.customerName || 'Valued Customer'}</div>
                  <div className="text-slate-600 text-xs mt-0.5 font-mono">Customer ID: {printOrder.customerId || 'CUST_DIR'}</div>
                </div>
                <div className="text-right">
                  <span className="font-extrabold uppercase text-slate-500 text-[10px]">Order Status</span>
                  <div className="font-black text-emerald-700 text-sm mt-1">Payment: {printOrder.paymentStatus || 'Pending'}</div>
                  <div className="font-bold text-slate-700 text-xs mt-0.5">Fulfilment: {printOrder.fulfilmentStatus || 'NOT_STARTED'}</div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-extrabold text-slate-800 uppercase text-[11px] mb-2">Order Line Items</h4>
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 uppercase text-[10px] font-extrabold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Item Description</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Unit Price</th>
                      <th className="p-3 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(printOrder.products || []).map((p: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-900">{p.productName || p.name || 'Product Item'}</td>
                        <td className="p-3 font-bold text-center">{p.quantity || 1}</td>
                        <td className="p-3 font-mono text-right">₹{(p.price || 0).toLocaleString()}</td>
                        <td className="p-3 font-mono font-bold text-right">₹{((p.price || 0) * (p.quantity || 1)).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end pt-2">
                <div className="w-64 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Items Subtotal:</span>
                    <span className="font-mono font-bold">₹{(printOrder.totalValue || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Shipping Charges:</span>
                    <span className="font-mono font-bold">₹0</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-extrabold text-sm border-t border-slate-300 pt-2">
                    <span>Grand Total:</span>
                    <span className="font-mono text-emerald-700">₹{(printOrder.totalValue || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 pt-4 text-[10px] text-slate-400 text-center space-y-1 font-mono">
                <p>VioLeafy Non-Invasive Order Operations & Fulfilment API • Verified Authentic</p>
                <p>Thank you for your business!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHARE ORDER DETAILS MODAL */}
      {shareOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-extrabold text-base">
                <Share2 className="w-5 h-5 text-blue-600" />
                <span>Share Order Details</span>
              </div>
              <button onClick={() => setShareOrder(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-[10px] font-extrabold uppercase text-slate-500">Order Summary Content</label>
              <textarea
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
                className="w-full mt-1 p-3 text-xs border border-slate-200 rounded-xl font-mono bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={8}
              />
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleCopyShareSummary}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm"
              >
                {copiedSummary ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedSummary ? 'Copied to Clipboard!' : 'Copy Summary Text'}
              </button>

              <button
                onClick={handleWhatsAppShare}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm"
              >
                <MessageSquare className="w-4 h-4" />
                Share via WhatsApp
              </button>

              <button
                onClick={handleNativeShare}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Native Share App
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
