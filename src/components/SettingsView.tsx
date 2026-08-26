import React, { useState } from 'react';
import { useCRM } from '../store';
import { PaymentTransaction, Coupon, DeliveryCharge } from '../types';
import BrandCustomizer from './BrandCustomizer';
import PaymentGatewaySettings from './PaymentGatewaySettings';
import FormatInvoiceSettings from './FormatInvoiceSettings';
import { 
  Settings, Shield, RefreshCw, Search, Info, 
  CheckCircle, XCircle, AlertTriangle, FileText, Gift, Calendar, DollarSign,
  ArrowRight, Ticket, RotateCcw, ListCollapse, List, Check, Trash, Palette, CreditCard,
  Code, Database, Activity, ArrowUpRight, ArrowDownLeft, X, MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function SettingsView() {
  const { 
    currentUser,
    paymentTransactions,
    initiatePaymentFlow,
    verifyPaymentFlow,
    processRefund,
    coupons,
    addCoupon,
    orderReturnRequests,
    updateReturnRequest,
    orderRefunds,
    salesOrders,
    sendWhatsAppMessage,
    deliveryCharges,
    addDeliveryCharge,
    updateDeliveryCharge,
    deleteDeliveryCharge
  } = useCRM();

  const [activeTab, setActiveTab] = useState<'gateways' | 'brand' | 'transactions' | 'refunds' | 'coupons' | 'returns' | 'delivery_charges' | 'format_invoice'>('gateways');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<PaymentTransaction | null>(null);
  const [selectedTxTab, setSelectedTxTab] = useState<'info' | 'timeline' | 'audit'>('info');

  // Process Refund modal states
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [txToRefund, setTxToRefund] = useState<PaymentTransaction | null>(null);
  const [modalRefundAmount, setModalRefundAmount] = useState('');
  const [modalRefundReason, setModalRefundReason] = useState('');
  const [modalRefunding, setModalRefunding] = useState(false);
  const [modalRefundError, setModalRefundError] = useState<string | null>(null);
  const [modalRefundSuccess, setModalRefundSuccess] = useState<string | null>(null);

  // Helper to generate simulated PayU payloads based on transaction details
  const getPayUPayloads = (tx: PaymentTransaction) => {
    const key = 'gtKFFx';
    const salt = 'eCwWELSp';
    const productInfo = "VioneX Organic Grocery Checkout Bundle";
    const firstname = "VioneX Shopper";
    const email = "shopper@vionex.com";
    
    const requestPayload = {
      key: key,
      txnid: tx.id,
      amount: tx.amount.toFixed(2),
      productinfo: productInfo,
      firstname: firstname,
      email: email,
      phone: "9876543210",
      surl: `${window.location.origin}/api/payment/verify`,
      furl: `${window.location.origin}/api/payment/verify`,
      hash: "6b360b9794e776e625a25752c0068a0... (SHA-512 Secure Hash)"
    };

    const responsePayload = tx.status === 'Success' ? {
      mihpayid: "403998711" + tx.id.slice(-6),
      mode: tx.paymentMethod === 'Credit Card' ? 'CC' : tx.paymentMethod === 'Debit Card' ? 'DC' : tx.paymentMethod === 'UPI' ? 'UPI' : 'NB',
      status: "success",
      unmappedstatus: "captured",
      key: key,
      txnid: tx.id,
      amount: tx.amount.toFixed(2),
      cardCategory: "domestic",
      discount: "0.00",
      additional_charges: "0.00",
      productinfo: productInfo,
      firstname: firstname,
      email: email,
      hash: "3775f0f08cb388a18357a702b85e05c... (SHA-512 Reverse Hash)",
      bank_ref_num: "BANKREF" + tx.id.slice(-8),
      bankcode: tx.paymentMethod === 'UPI' ? 'UPI' : 'VISA',
      error: "SUCCESS",
      error_Message: "No Error"
    } : tx.status === 'Failed' ? {
      mihpayid: "403998711" + tx.id.slice(-6),
      mode: "CC",
      status: "failure",
      unmappedstatus: "failed",
      key: key,
      txnid: tx.id,
      amount: tx.amount.toFixed(2),
      additional_charges: "0.00",
      productinfo: productInfo,
      firstname: firstname,
      email: email,
      hash: "8cb388a18357a702b85e05c...",
      error: "E103",
      error_Message: tx.errorMessage || "Card declined or insufficient funds (Simulated Gateway Error)"
    } : {
      info: "Payment transaction is in 'Initiated' state. Response payload will be populated once transaction completes."
    };

    return { requestPayload, responsePayload };
  };

  // Refund local states
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundStatusMessage, setRefundStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [refunding, setRefunding] = useState(false);

  // Coupon local states
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponValue, setNewCouponValue] = useState(15);
  const [newCouponMin, setNewCouponMin] = useState(200);

  // Delivery Charge local states
  const [chargePincode, setChargePincode] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeSuccess, setChargeSuccess] = useState<string | null>(null);

  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [editingPincode, setEditingPincode] = useState('');
  const [editingAmount, setEditingAmount] = useState('');

  const handleCreateDeliveryCharge = (e: React.FormEvent) => {
    e.preventDefault();
    setChargeError(null);
    setChargeSuccess(null);

    const pin = chargePincode.trim();
    const amt = parseFloat(chargeAmount);

    if (!pin) {
      setChargeError('Pincode is required.');
      return;
    }
    if (isNaN(amt) || amt < 0) {
      setChargeError('Delivery charge must be a positive number or 0.');
      return;
    }

    // Check if duplicate pincode rule already exists
    const duplicate = (deliveryCharges || []).find(c => c.pincode === pin);
    if (duplicate) {
      setChargeError(`A delivery charge rule for pincode ${pin} already exists. Please edit or delete the existing rule.`);
      return;
    }

    addDeliveryCharge({
      id: 'del_' + Math.random().toString(36).substr(2, 9),
      pincode: pin,
      charge: amt
    });

    setChargeSuccess(`Successfully set delivery charge of ₹${amt.toFixed(2)} for pincode ${pin}`);
    setChargePincode('');
    setChargeAmount('');
  };

  const handleSaveEditDeliveryCharge = (id: string) => {
    const amt = parseFloat(editingAmount);
    const pin = editingPincode.trim();

    if (!pin) {
      alert('Pincode is required.');
      return;
    }
    if (isNaN(amt) || amt < 0) {
      alert('Delivery charge must be a positive number or 0.');
      return;
    }

    // Check if duplicate pincode rule already exists on OTHER records
    const duplicate = (deliveryCharges || []).find(c => c.pincode === pin && c.id !== id);
    if (duplicate) {
      alert(`A delivery charge rule for pincode ${pin} already exists.`);
      return;
    }

    updateDeliveryCharge(id, {
      pincode: pin,
      charge: amt
    });

    setEditingChargeId(null);
  };

  // Coupon create and registration

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundPaymentId || !refundAmount || !refundReason.trim()) {
      setRefundStatusMessage({ type: 'error', text: 'All refund fields are required.' });
      return;
    }

    const tx = paymentTransactions.find(t => t.id === refundPaymentId);
    if (!tx) {
      setRefundStatusMessage({ type: 'error', text: 'Payment transaction reference not found.' });
      return;
    }

    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      setRefundStatusMessage({ type: 'error', text: 'Refund amount must be a positive number.' });
      return;
    }

    if (amt > tx.amount) {
      setRefundStatusMessage({ type: 'error', text: `Refund amount cannot exceed transaction total (₹${tx.amount}).` });
      return;
    }

    try {
      setRefunding(true);
      setRefundStatusMessage(null);
      const res = await processRefund(refundPaymentId, amt, refundReason.trim());
      if (res.success) {
        setRefundStatusMessage({ type: 'success', text: `Successfully processed refund of ₹${amt} for Order Ref ${tx.orderId}.` });
        setRefundPaymentId('');
        setRefundAmount('');
        setRefundReason('');
      } else {
        setRefundStatusMessage({ type: 'error', text: res.error || 'Refund processing failed.' });
      }
    } catch (err: any) {
      setRefundStatusMessage({ type: 'error', text: err.message || 'An error occurred during refund processing.' });
    } finally {
      setRefunding(false);
    }
  };

  const handleModalRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txToRefund) return;

    const amt = parseFloat(modalRefundAmount);
    if (isNaN(amt) || amt <= 0) {
      setModalRefundError('Refund amount must be a positive number.');
      return;
    }

    if (amt > txToRefund.amount) {
      setModalRefundError(`Refund amount cannot exceed transaction total (₹${txToRefund.amount}).`);
      return;
    }

    if (!modalRefundReason.trim()) {
      setModalRefundError('Refund reason/explanation is required.');
      return;
    }

    try {
      setModalRefunding(true);
      setModalRefundError(null);
      setModalRefundSuccess(null);

      const res = await processRefund(txToRefund.id, amt, modalRefundReason.trim());

      if (res.success) {
        // Find linked sales order to get customer details
        const order = salesOrders.find(o => o.id === txToRefund.orderId);
        const customerName = order?.customerName || 'Customer';
        const contactNo = order?.contactNo || '9876543210';

        // Send a WhatsApp notification
        const messageContent = `Dear ${customerName}, a refund of ₹${amt.toFixed(2)} has been successfully processed for your order #${txToRefund.orderId} (Transaction Ref: ${txToRefund.id}). Reason: ${modalRefundReason.trim()}. The amount has been credited back to your original payment method. Thank you for shopping with us!`;
        
        sendWhatsAppMessage(contactNo, messageContent, undefined, 'payment_refund_alert');

        setModalRefundSuccess(`Refund of ₹${amt.toFixed(2)} processed successfully. Notification sent to customer.`);
        
        // Reset inputs
        setModalRefundAmount('');
        setModalRefundReason('');

        // Clear modal state after a delay
        setTimeout(() => {
          setIsRefundModalOpen(false);
          setTxToRefund(null);
          setModalRefundSuccess(null);
        }, 2500);
      } else {
        setModalRefundError(res.error || 'Refund processing failed.');
      }
    } catch (err: any) {
      setModalRefundError(err.message || 'An error occurred during refund processing.');
    } finally {
      setModalRefunding(false);
    }
  };

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) return;

    const code = newCouponCode.toUpperCase().trim();
    const existing = coupons.find(c => c.code === code);
    if (existing) {
      alert('A coupon with this code already exists.');
      return;
    }

    const newCp: Coupon = {
      id: `cp-${Date.now()}`,
      code,
      type: 'percentage',
      value: Number(newCouponValue),
      minOrderValue: Number(newCouponMin),
      isActive: true,
      expiryDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      description: `${newCouponValue}% discount off storewide. Min order ₹${newCouponMin}.`
    };

    addCoupon(newCp);
    setNewCouponCode('');
    alert(`Campaign coupon ${code} registered successfully!`);
  };

  // Filter transactions
  const filteredTxs = paymentTransactions.filter(tx => {
    const query = searchQuery.toLowerCase();
    return (
      tx.id.toLowerCase().includes(query) ||
      tx.orderId.toLowerCase().includes(query) ||
      tx.transactionReference.toLowerCase().includes(query) ||
      tx.gateway.toLowerCase().includes(query) ||
      tx.paymentMethod.toLowerCase().includes(query) ||
      tx.status.toLowerCase().includes(query)
    );
  });

  const successfulPayments = paymentTransactions.filter(tx => tx.status === 'Success');

  return (
    <div className="space-y-6" id="settings-unified-dashboard">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-500" />
            Settings & Operations Admin
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Customize live brand style visuals, monitor transactions, trigger refunds, and manage shopping promotions.
          </p>
        </div>

        {/* Sync Indicator */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[10px] text-slate-300 font-mono">Operations: Secure TLS</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('gateways')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'gateways' 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
          id="tab-settings-gateways"
        >
          <CreditCard className="w-3.5 h-3.5" />
          PayU Configuration
        </button>

        <button
          onClick={() => setActiveTab('brand')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'brand' 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
          id="tab-settings-brand"
        >
          <Palette className="w-3.5 h-3.5" />
          Customize Brand Style
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'transactions' 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
          id="tab-settings-transactions"
        >
          <FileText className="w-3.5 h-3.5" />
          Audit Ledger ({paymentTransactions.length})
        </button>

        <button
          onClick={() => setActiveTab('refunds')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'refunds' 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
          id="tab-settings-refunds"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refund Settlement
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'coupons' 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
          id="tab-settings-coupons"
        >
          <Ticket className="w-3.5 h-3.5" />
          Campaign Coupons ({coupons.length})
        </button>

        <button
          onClick={() => setActiveTab('returns')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'returns' 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
          id="tab-settings-returns"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Return Operations ({orderReturnRequests.length})
        </button>

        <button
          onClick={() => setActiveTab('delivery_charges')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'delivery_charges' 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
          id="tab-settings-delivery"
        >
          <MapPin className="w-3.5 h-3.5" />
          Delivery Charges ({(deliveryCharges || []).length})
        </button>

        <button
          onClick={() => setActiveTab('format_invoice')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === 'format_invoice'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
          }`}
          id="tab-settings-format-invoice"
        >
          <FileText className="w-3.5 h-3.5" />
          Invoice Formats
        </button>
      </div>

      {/* Main Content Grid */}
      <div className={(activeTab === 'brand' || activeTab === 'gateways' || activeTab === 'delivery_charges' || activeTab === 'format_invoice') ? "w-full" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
        
        {/* LEFT/MAIN COLUMN */}
        <div className={(activeTab === 'brand' || activeTab === 'gateways' || activeTab === 'delivery_charges' || activeTab === 'format_invoice') ? "w-full" : "lg:col-span-2 space-y-6"}>

          {/* TAB: PAYU GATEWAY CONFIGURATION */}
          {activeTab === 'gateways' && (
            <PaymentGatewaySettings />
          )}

          {/* TAB: BRAND STYLE CUSTOMIZER */}
          {activeTab === 'brand' && (
            <BrandCustomizer />
          )}

          {activeTab === 'format_invoice' && (
            <FormatInvoiceSettings />
          )}

          {/* TAB: AUDIT LEDGER */}
          {activeTab === 'transactions' && (
            <div className="space-y-4">
              <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-left">
                <div>
                  <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-2">Cryptographic Transaction Auditing Ledger</h3>
                  <p className="text-xs text-slate-400">
                    A completely authoritative record of payments with real-time logging, security verification, and checkout tracing.
                  </p>
                </div>
                {/* Search Bar */}
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search by ID, status, order ref..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0a0a0c] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Transactions Ledger List */}
              <div className="bg-[#101014] border border-slate-800 rounded-2xl overflow-hidden">
                {filteredTxs.length === 0 ? (
                  <div className="p-8 text-center">
                    <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 font-mono">No payment transactions match search queries or have been recorded.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs text-slate-300">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold">
                          <th className="p-4">TX REF</th>
                          <th className="p-4">ORDER ID</th>
                          <th className="p-4">AMOUNT</th>
                          <th className="p-4">GATEWAY / METHOD</th>
                          <th className="p-4">ENV</th>
                          <th className="p-4">STATUS</th>
                          <th className="p-4 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredTxs.map(tx => (
                          <tr key={tx.id} className="hover:bg-slate-850/40 transition">
                            <td className="p-4 font-mono font-bold text-slate-200">
                              {tx.id}
                            </td>
                            <td className="p-4 font-mono text-slate-400">
                              {tx.orderId}
                            </td>
                            <td className="p-4 font-bold text-white">
                              ₹{tx.amount}
                            </td>
                            <td className="p-4">
                              <span className="block font-semibold text-slate-200">{tx.gateway}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{tx.paymentMethod}</span>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase font-mono ${
                                tx.environment === 'Live' 
                                  ? 'bg-red-950/30 text-red-400 border border-red-900/50' 
                                  : 'bg-amber-950/30 text-amber-400 border border-amber-900/50'
                              }`}>
                                {tx.environment}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                tx.status === 'Success' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-900/30' 
                                  : tx.status === 'Refunded'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-900/30'
                                    : tx.status === 'Failed'
                                      ? 'bg-red-500/10 text-red-400 border border-red-900/30'
                                      : 'bg-amber-500/10 text-amber-400 border border-amber-900/30'
                              }`}>
                                {tx.status}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedTx(tx);
                                    setSelectedTxTab('audit');
                                  }}
                                  className="px-2.5 py-1 bg-slate-900 border border-slate-750 hover:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-300 transition flex items-center gap-1"
                                >
                                  <Info className="w-3 h-3" />
                                  Audit Logs
                                </button>
                                {tx.status === 'Success' && (
                                  <button
                                    onClick={() => {
                                      setTxToRefund(tx);
                                      setModalRefundAmount(String(tx.amount));
                                      setModalRefundReason('');
                                      setModalRefundError(null);
                                      setModalRefundSuccess(null);
                                      setIsRefundModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 bg-red-950/40 border border-red-900/50 hover:bg-red-900/30 rounded-lg text-[10px] font-bold text-red-400 transition flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Refund
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: REFUND SETTLEMENT */}
          {activeTab === 'refunds' && (
            <div className="space-y-4">
              <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl text-left">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-2">Automated Refund Settlement Center</h3>
                <p className="text-xs text-slate-400">
                  Select a successfully captured customer checkout payment, enter a precise refund amount, and trigger a secure refund API settlement.
                </p>
              </div>

              {/* Refund Form */}
              <form onSubmit={handleRefundSubmit} className="bg-[#101014] border border-slate-800 rounded-2xl p-5 space-y-4 text-left">
                {refundStatusMessage && (
                  <div className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
                    refundStatusMessage.type === 'success' 
                      ? 'bg-emerald-950/30 border border-emerald-900 text-emerald-400' 
                      : 'bg-red-950/30 border border-red-900 text-red-400'
                  }`}>
                    {refundStatusMessage.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                    <p>{refundStatusMessage.text}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Select Successful Payment</label>
                    <select
                      value={refundPaymentId}
                      onChange={e => {
                        setRefundPaymentId(e.target.value);
                        const tx = paymentTransactions.find(t => t.id === e.target.value);
                        if (tx) {
                          setRefundAmount(String(tx.amount));
                        } else {
                          setRefundAmount('');
                        }
                      }}
                      required
                      className="w-full bg-[#0a0a0c] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Choose Captured Payment --</option>
                      {successfulPayments.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.id} - Order: {p.orderId} (₹{p.amount} via {p.gateway})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Refund Settlement Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="e.g. 299.00"
                      value={refundAmount}
                      onChange={e => setRefundAmount(e.target.value)}
                      className="w-full bg-[#0a0a0c] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Refund Explanation / Reason</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Enter customer return reason, dispatch fault, or order cancellation notes..."
                    value={refundReason}
                    onChange={e => setRefundReason(e.target.value)}
                    className="w-full bg-[#0a0a0c] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={refunding}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-lg"
                  >
                    {refunding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Process Settled Refund API
                  </button>
                </div>
              </form>

              {/* OrderRefunds Ledger list */}
              <div className="bg-[#101014] border border-[#ff0000]/10 rounded-2xl p-5 space-y-4 text-left">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Processed Settlement History Ledger</h4>
                {orderRefunds.length === 0 ? (
                  <p className="text-xs text-slate-500 font-mono">No refunds have been generated on this system.</p>
                ) : (
                  <div className="space-y-3">
                    {orderRefunds.map(ref => (
                      <div key={ref.id} className="p-3 bg-[#0d0d10] border border-slate-800 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <strong className="block text-slate-300 font-mono">{ref.referenceNumber || ref.id}</strong>
                          <p className="text-slate-500 mt-1">Payment ID: {ref.paymentId} | Order Ref: {ref.orderId}</p>
                        </div>
                        <div className="text-right">
                          <span className="block font-bold text-red-400">-₹{ref.amount}</span>
                          <span className="text-[10px] text-slate-500">{new Date(ref.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: COUPONS */}
          {activeTab === 'coupons' && (
            <div className="space-y-4">
              <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl text-left">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-2">Campaign Discount Coupon Controls</h3>
                <p className="text-xs text-slate-400">
                  Register promotional campaign coupons to drive traffic and coordinate discounts on checkout shopping.
                </p>
              </div>

              {/* Coupon Registration Form */}
              <form onSubmit={handleCreateCoupon} className="bg-[#101014] border border-slate-800 rounded-2xl p-5 space-y-4 text-left">
                <h4 className="text-xs font-bold text-indigo-400 uppercase">Register Campaign Discount Coupon</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Coupon Code</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. WINTER35"
                      value={newCouponCode}
                      onChange={e => setNewCouponCode(e.target.value)}
                      className="w-full bg-[#0a0a0c] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Discount Percentage (%)</label>
                    <input
                      required
                      type="number"
                      min={1}
                      max={100}
                      value={newCouponValue}
                      onChange={e => setNewCouponValue(Number(e.target.value))}
                      className="w-full bg-[#0a0a0c] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Minimum Order Value (₹)</label>
                    <input
                      required
                      type="number"
                      min={0}
                      value={newCouponMin}
                      onChange={e => setNewCouponMin(Number(e.target.value))}
                      className="w-full bg-[#0a0a0c] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-bold rounded-xl transition shadow-lg"
                  >
                    Create Coupon Code
                  </button>
                </div>
              </form>

              {/* Coupons List */}
              <div className="bg-[#101014] border border-slate-800 rounded-2xl p-5 space-y-4 text-left">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Promotional Coupons</h4>
                {coupons.length === 0 ? (
                  <p className="text-xs text-slate-500 font-mono">No promo coupons registered.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {coupons.map(cp => (
                      <div key={cp.id} className="p-4 bg-[#0d0d10] border border-slate-850 rounded-xl space-y-2 relative overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-1 bg-indigo-950 text-indigo-400 border border-indigo-900 rounded-md font-mono text-xs font-bold">
                            {cp.code}
                          </span>
                          <span className="text-xs font-bold text-emerald-400">{cp.value}% OFF</span>
                        </div>
                        <p className="text-[11px] text-slate-400">{cp.description}</p>
                        <div className="flex items-center justify-between text-[9px] text-slate-500 border-t border-slate-800/50 pt-2 font-mono">
                          <span>Min Order: ₹{cp.minOrderValue}</span>
                          <span>Expires: {new Date(cp.expiryDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: RETURN OPERATIONS */}
          {activeTab === 'returns' && (
            <div className="space-y-4">
              <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl text-left">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-2">Customer Return Requests Operations</h3>
                <p className="text-xs text-slate-400">
                  Assess submitted product return requests, approve refund validations, or reject invalid claims.
                </p>
              </div>

              <div className="bg-[#101014] border border-slate-800 rounded-2xl p-5 space-y-4 text-left">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Return Requests Ledger</h4>
                {orderReturnRequests.length === 0 ? (
                  <div className="text-center py-6">
                    <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 font-mono">All return requests have been fully processed and settled!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orderReturnRequests.map(req => (
                      <div key={req.id} className="p-4 bg-[#0d0d10] border border-slate-850 rounded-2xl text-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300">
                              REF: {req.orderId}
                            </span>
                            <span className="font-bold text-slate-200">{req.type}</span>
                          </div>
                          <p className="text-slate-400 text-[11px] font-medium">Reason: {req.reason}</p>
                          <span className="block text-[10px] text-slate-500 font-mono">Status: {req.status}</span>
                        </div>

                        {req.status === 'Pending' && (
                          <div className="flex gap-2 w-full md:w-auto shrink-0">
                            <button
                              onClick={() => {
                                updateReturnRequest(req.id, 'Approved');
                                alert(`Return Request Approved! Refund has been unlocked.`);
                              }}
                              className="flex-1 md:flex-none px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                updateReturnRequest(req.id, 'Rejected');
                                alert(`Return Request Rejected.`);
                              }}
                              className="flex-1 md:flex-none px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: DELIVERY CHARGES Master configuration */}
          {activeTab === 'delivery_charges' && (
            <div className="space-y-4">
              <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl text-left">
                <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-2">Delivery Charges Master Configuration</h3>
                <p className="text-xs text-slate-400">
                  Manage pincode-specific delivery fees. By default, delivery charges are **Free (₹0)** if a pincode is not listed here or if the customer doesn't have an address set.
                </p>
              </div>

              {/* Add Delivery Charge Form */}
              <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl text-left space-y-4">
                <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-400">Add New Pincode Rate Rule</h4>
                
                {chargeError && (
                  <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-xs text-red-400">
                    {chargeError}
                  </div>
                )}
                {chargeSuccess && (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-xl text-xs text-emerald-400">
                    {chargeSuccess}
                  </div>
                )}

                <form onSubmit={handleCreateDeliveryCharge} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Pincode:</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 560001"
                      value={chargePincode}
                      onChange={e => setChargePincode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Delivery Charge (₹):</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      placeholder="e.g. 40"
                      value={chargeAmount}
                      onChange={e => setChargeAmount(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition"
                    >
                      Save Rule
                    </button>
                  </div>
                </form>
              </div>

              {/* Master Rates Table */}
              <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl text-left">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-300 mb-4">Pincode Delivery Rules Ledger</h4>
                
                {(!deliveryCharges || deliveryCharges.length === 0) ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No custom delivery rates configured. All pincodes fall back to the default **Free** delivery charge.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          <th className="py-3 px-4">Pincode</th>
                          <th className="py-3 px-4">Charge Amount</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {deliveryCharges.map(c => (
                          <tr key={c.id} className="hover:bg-slate-900/30 text-xs">
                            <td className="py-3 px-4 font-mono font-bold text-slate-300">
                              {editingChargeId === c.id ? (
                                <input
                                  type="text"
                                  value={editingPincode}
                                  onChange={e => setEditingPincode(e.target.value.replace(/\D/g, ''))}
                                  className="bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-white font-mono w-24 focus:outline-none focus:border-indigo-500"
                                />
                              ) : (
                                c.pincode
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {editingChargeId === c.id ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editingAmount}
                                  onChange={e => setEditingAmount(e.target.value)}
                                  className="bg-slate-950 border border-slate-850 rounded px-2 py-1 text-xs text-white font-mono w-24 focus:outline-none focus:border-indigo-500"
                                />
                              ) : (
                                <span>₹{c.charge}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex justify-end gap-2">
                                {editingChargeId === c.id ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveEditDeliveryCharge(c.id)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px]"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingChargeId(null)}
                                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded font-bold text-[10px]"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingChargeId(c.id);
                                        setEditingPincode(c.pincode);
                                        setEditingAmount(c.charge.toString());
                                      }}
                                      className="px-2 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded text-slate-300 hover:text-white transition font-mono text-[10px]"
                                      title="Edit rule"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to delete delivery charge for pincode ${c.pincode}?`)) {
                                          deleteDeliveryCharge(c.id);
                                        }
                                      }}
                                      className="p-1.5 bg-slate-900 hover:bg-red-950/40 border border-slate-800 hover:border-red-900/30 rounded text-slate-400 hover:text-red-400 transition"
                                      title="Delete rule"
                                    >
                                      <Trash className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT AUDIT SIDEBAR PANEL (Only shown when not displaying Brand Customizer or full-width tabs) */}
        {activeTab !== 'brand' && activeTab !== 'gateways' && activeTab !== 'delivery_charges' && (
          <div className="space-y-6">
            
            {/* Selected Transaction Audit Details panel */}
            <div className="bg-[#0d0d10] border border-slate-800 rounded-3xl p-5 space-y-4 text-left">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Transaction Inspector
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">Select a record to view comprehensive tracing logs and payloads.</p>
                </div>
                {selectedTx && (
                  <button 
                    onClick={() => setSelectedTx(null)}
                    className="text-[10px] font-bold text-slate-500 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {selectedTx ? (
                <div className="space-y-4">
                  {/* Visual Status Indicator Card */}
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase block">STATUS</span>
                      <strong className="text-xs text-white">{selectedTx.status}</strong>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      selectedTx.status === 'Success' 
                        ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' 
                        : selectedTx.status === 'Refunded'
                          ? 'bg-blue-500'
                          : selectedTx.status === 'Failed'
                            ? 'bg-red-500'
                            : 'bg-amber-500'
                    }`} />
                  </div>

                  {/* Inspector Sub-Tabs */}
                  <div className="flex border-b border-slate-800 gap-1 pb-1">
                    <button
                      onClick={() => setSelectedTxTab('info')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                        selectedTxTab === 'info'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                      }`}
                    >
                      Overview
                    </button>
                    <button
                      onClick={() => setSelectedTxTab('timeline')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                        selectedTxTab === 'timeline'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                      }`}
                    >
                      Timeline
                    </button>
                    <button
                      onClick={() => setSelectedTxTab('audit')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                        selectedTxTab === 'audit'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                      }`}
                      id="selected-tx-audit-log-tab"
                    >
                      Audit Log
                    </button>
                  </div>

                  {/* Tab Content: OVERVIEW */}
                  {selectedTxTab === 'info' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                      <div className="space-y-2 text-[11px] font-mono bg-slate-900/40 p-3 rounded-2xl border border-slate-850">
                        <div className="flex justify-between">
                          <span className="text-slate-500">TX ID:</span>
                          <span className="text-slate-300 font-bold select-all">{selectedTx.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">ORDER REF:</span>
                          <span className="text-slate-300 select-all">{selectedTx.orderId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">GATEWAY:</span>
                          <span className="text-slate-300 font-bold">{selectedTx.gateway}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">METHOD:</span>
                          <span className="text-slate-300">{selectedTx.paymentMethod}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">ENVIRONMENT:</span>
                          <span className="text-slate-300 uppercase">{selectedTx.environment}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">AMOUNT:</span>
                          <span className="text-white font-bold">₹{selectedTx.amount}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800/60 pt-2">
                          <span className="text-slate-500">GATEWAY REF:</span>
                          <span className="text-indigo-400 select-all truncate max-w-[130px]" title={selectedTx.transactionReference}>{selectedTx.transactionReference}</span>
                        </div>
                        {selectedTx.errorMessage && (
                          <div className="border-t border-slate-800/60 pt-2 mt-2">
                            <span className="text-red-400 text-[10px] font-semibold block uppercase">Error Message:</span>
                            <span className="text-red-400 text-[10px] leading-relaxed block mt-0.5">{selectedTx.errorMessage}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab Content: TIMELINE */}
                  {selectedTxTab === 'timeline' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <ListCollapse className="w-3 h-3 text-indigo-500" />
                          Status Transition History
                        </h4>
                        <div className="space-y-4 pl-2 border-l border-slate-800 mt-2">
                          {(selectedTx.statusHistory || []).map((hist, idx) => (
                            <div key={idx} className="relative pl-4 text-[10px]">
                              <span className="absolute -left-[13px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-[#0d0d10]" />
                              <span className="block font-bold text-slate-300">{hist.status}</span>
                              <p className="text-slate-500 mt-0.5">{hist.note}</p>
                              <span className="text-[8px] text-slate-600 block mt-1 font-mono">{new Date(hist.timestamp).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab Content: AUDIT LOG (with payloads & status updates) */}
                  {selectedTxTab === 'audit' && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-indigo-500" />
                          Detailed Event Timeline
                        </h4>
                        
                        <div className="space-y-5 pl-2.5 border-l border-slate-800 mt-2">
                          {/* Chronological events merge with payloads */}
                          {(selectedTx.logs || []).map((log, idx) => {
                            const showReqPayload = log.action === 'INITIATED';
                            const showResPayload = (log.action === 'VERIFIED' || log.action === 'FAILED');
                            const payloads = getPayUPayloads(selectedTx);
                            
                            return (
                              <div key={idx} className="relative pl-4 text-[10.5px] space-y-2">
                                <span className={`absolute -left-[14.5px] top-1.5 w-2 h-2 rounded-full ${
                                  log.action === 'VERIFIED' ? 'bg-emerald-500' : log.action === 'FAILED' ? 'bg-red-500' : 'bg-indigo-400'
                                } border-2 border-[#0d0d10]`} />
                                
                                <div className="flex items-center justify-between">
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase font-mono tracking-wider ${
                                    log.action === 'VERIFIED' 
                                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
                                      : log.action === 'FAILED'
                                        ? 'bg-red-950/40 text-red-400 border border-red-900/40'
                                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                                  }`}>
                                    {log.action}
                                  </span>
                                  <span className="text-[8px] text-slate-500 font-mono">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                
                                <p className="text-slate-300 font-medium leading-relaxed">{log.details}</p>
                                
                                {/* If INITIATED, display outbound request payload */}
                                {showReqPayload && (
                                  <div className="bg-slate-950/80 border border-slate-850 p-3 rounded-xl mt-2.5 space-y-1.5">
                                    <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
                                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 font-sans">
                                        <ArrowUpRight className="w-3 h-3 text-indigo-400" />
                                        PayU Request Payload
                                      </span>
                                      <span className="text-[8px] font-mono text-slate-600 uppercase">Outbound HTTPS POST</span>
                                    </div>
                                    <pre className="text-[9px] font-mono text-indigo-300 bg-slate-950/50 p-2 rounded-lg overflow-x-auto max-h-[140px] leading-relaxed">
                                      {JSON.stringify(payloads.requestPayload, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                {/* If VERIFIED / FAILED, display callback / API response payload */}
                                {showResPayload && (
                                  <div className="bg-slate-950/80 border border-slate-850 p-3 rounded-xl mt-2.5 space-y-1.5">
                                    <div className="flex items-center justify-between border-b border-slate-900 pb-1.5">
                                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 font-sans">
                                        <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                                        PayU Callback Response
                                      </span>
                                      <span className="text-[8px] font-mono text-slate-600 uppercase">Inbound HTTPS POST</span>
                                    </div>
                                    <pre className="text-[9px] font-mono text-emerald-300 bg-slate-950/50 p-2 rounded-lg overflow-x-auto max-h-[160px] leading-relaxed">
                                      {JSON.stringify(payloads.responsePayload, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Decryption Check Indicator */}
                      <div className="p-2.5 rounded-xl bg-indigo-950/20 border border-indigo-900/30 text-[9px] text-indigo-300 flex items-center gap-2 font-mono">
                        <Database className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>Cryptographic payloads verified with 256-bit SHA header salts.</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                  <AlertTriangle className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                  <p className="text-[10px] text-slate-500 font-mono">No active logs loaded. Select a record to expand auditing details.</p>
                </div>
              )}
            </div>

            {/* Quick Summary metrics */}
            <div className="bg-[#0d0d10] border border-slate-800 rounded-3xl p-5 space-y-4 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Transaction Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-900/40 p-3 rounded-2xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 block uppercase">Settled Gross</span>
                  <strong className="text-sm text-white font-mono">₹{successfulPayments.reduce((acc, p) => acc + p.amount, 0).toFixed(2)}</strong>
                </div>
                <div className="bg-slate-900/40 p-3 rounded-2xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 block uppercase">Refunded</span>
                  <strong className="text-sm text-red-400 font-mono">₹{orderRefunds.reduce((acc, p) => acc + p.amount, 0).toFixed(2)}</strong>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Process Refund Modal */}
      <AnimatePresence>
        {isRefundModalOpen && txToRefund && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
            onClick={() => {
              if (!modalRefunding) {
                setIsRefundModalOpen(false);
                setTxToRefund(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#0e0e12] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl text-left space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-950/40 rounded-xl text-red-400 border border-red-900/30">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider">Process Settled Refund</h3>
                    <p className="text-[9px] text-slate-500 font-mono">Server-Side Gateway Settlement</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsRefundModalOpen(false);
                    setTxToRefund(null);
                  }}
                  disabled={modalRefunding}
                  className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status alerts */}
              {modalRefundError && (
                <div className="p-3 bg-red-950/30 border border-red-900/40 rounded-2xl flex items-start gap-2 text-xs text-red-400 leading-relaxed animate-in fade-in duration-200">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{modalRefundError}</span>
                </div>
              )}

              {modalRefundSuccess && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-2xl flex items-start gap-2 text-xs text-emerald-400 leading-relaxed animate-in fade-in duration-200">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{modalRefundSuccess}</span>
                </div>
              )}

              {/* Transaction details card */}
              <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-2xl space-y-2 font-mono text-[10.5px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">TRANSACTION REF:</span>
                  <span className="text-slate-300 font-bold">{txToRefund.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ORDER NUMBER:</span>
                  <span className="text-slate-300">{txToRefund.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">GATEWAY / METHOD:</span>
                  <span className="text-slate-300">{txToRefund.gateway} ({txToRefund.paymentMethod})</span>
                </div>
                <div className="flex justify-between border-t border-slate-850 pt-1.5 mt-1.5">
                  <span className="text-slate-500">ORIGINAL AMOUNT:</span>
                  <span className="text-white font-bold">₹{txToRefund.amount.toFixed(2)}</span>
                </div>
              </div>

              {/* Form fields */}
              <form onSubmit={handleModalRefundSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Refund Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={txToRefund.amount}
                    value={modalRefundAmount}
                    onChange={(e) => setModalRefundAmount(e.target.value)}
                    required
                    disabled={modalRefunding || !!modalRefundSuccess}
                    className="w-full bg-[#07070a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-red-500 transition disabled:opacity-50"
                  />
                  <p className="text-[9px] text-slate-500 mt-1 font-mono">
                    Can be full or partial amount up to max ₹{txToRefund.amount.toFixed(2)}.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Refund Reason / Explanation
                  </label>
                  <textarea
                    rows={2}
                    value={modalRefundReason}
                    onChange={(e) => setModalRefundReason(e.target.value)}
                    placeholder="Enter reason for customer refund..."
                    required
                    disabled={modalRefunding || !!modalRefundSuccess}
                    className="w-full bg-[#07070a] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-red-500 transition resize-none disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRefundModalOpen(false);
                      setTxToRefund(null);
                    }}
                    disabled={modalRefunding}
                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-bold rounded-xl transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalRefunding || !!modalRefundSuccess}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-lg shadow-red-950/20"
                  >
                    {modalRefunding ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Execute Refund
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
