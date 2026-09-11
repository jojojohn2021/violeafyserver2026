import React, { useState, useEffect, useRef } from 'react';
import { useCRM } from '../store';
import { SalesOrder, SalesProduct, CustomerPerformance, ProductPerformance } from '../types';
import { 
  Receipt, Plus, DollarSign, Calendar, TrendingUp, Search, 
  Trash2, Eye, ShoppingBag, CreditCard, ChevronDown, Check, X,
  FileSpreadsheet, FileText, CheckCircle2, Clock, AlertTriangle, AlertCircle,
  UserPlus, UserCheck, Link, Edit
} from 'lucide-react';

import { INDIAN_STATES_AND_DISTRICTS, INDIAN_STATES_LIST } from '../data/indianStatesAndDistricts';

export default function SalesOrdersView() {
  const { 
    hasAccess, salesOrders, addSalesOrder, updateSalesOrder, deleteSalesOrder, deleteAllSalesOrders,
    customers, products, updateProduct, referrals, addCustomer, currentUser,
    updateCustomer, referralChains, reloadFirestoreData
  } = useCRM();

  // New Order Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [updatePayload, setUpdatePayload] = useState<any>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'Cash' | 'Bank Transfer' | 'Stripe' | 'UPI' | 'Credit Card'>('Bank Transfer');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending' | 'Overdue' | 'Refunded'>('Paid');
  const [deliveryStatus, setDeliveryStatus] = useState<'Pending' | 'Shipped' | 'Delivered' | 'Cancelled'>('Pending');
  const [assignedAgent, setAssignedAgent] = useState('Tony Stark');
  const [orderType, setOrderType] = useState<'Online' | 'Shop'>('Online');
  const [salesChannel, setSalesChannel] = useState<'Amazon' | 'Flipkart' | 'Vamjo' | 'Meesho' | 'Shop' | 'Website' | 'Distributor' | 'Other Marketplace' | string>('Shop');

  // Unified Invoice Headers State
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pickupDate, setPickupDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [courierAgency, setCourierAgency] = useState('Amazon');
  const [courierCharges, setCourierCharges] = useState<number>(0);
  const [contactNo, setContactNo] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralError, setReferralError] = useState('');
  const [referralValid, setReferralValid] = useState(false);

  // States for custom search-filtered referral code combobox
  const [referralSearchQuery, setReferralSearchQuery] = useState('');
  const [isReferralDropdownOpen, setIsReferralDropdownOpen] = useState(false);
  const referralDropdownRef = useRef<HTMLDivElement>(null);

  // Configuration Tabs: 'order' or 'new_customer'
  const [activeConfigTab, setActiveConfigTab] = useState<'order' | 'new_customer'>('order');

  // Form block for quick registering a new customer (New Customer section/tab)
  const [newCustName, setNewCustName] = useState('');
  const [newCustCompany, setNewCustCompany] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustMobile, setNewCustMobile] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustState, setNewCustState] = useState('');
  const [newCustDistrict, setNewCustDistrict] = useState('');
  const [newCustPincode, setNewCustPincode] = useState('');
  const [newCustTier, setNewCustTier] = useState<'Platinum' | 'Gold' | 'Silver' | 'Bronze'>('Silver');

  const [isNewCustPincodeLoading, setIsNewCustPincodeLoading] = useState(false);
  const [newCustPincodeLookupMessage, setNewCustPincodeLookupMessage] = useState('');

  useEffect(() => {
    if (newCustPincode && newCustPincode.length === 6) {
      const fetchNewCustPincodeDetails = async () => {
        setIsNewCustPincodeLoading(true);
        setNewCustPincodeLookupMessage('Fetching PIN info...');
        try {
          const response = await fetch(`https://api.postalpincode.in/pincode/${newCustPincode}`);
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
              const postOffice = data[0].PostOffice[0];
              const apiState = postOffice.State || '';
              const apiDistrict = postOffice.District || '';

              const matchedState = INDIAN_STATES_LIST.find(st => 
                st.toLowerCase().replace(/[^a-z]/g, '') === apiState.toLowerCase().replace(/[^a-z]/g, '') ||
                st.toLowerCase() === apiState.toLowerCase()
              );

              if (matchedState) {
                setNewCustState(matchedState);
                setNewCustStateSearch(matchedState);

                const districtsList = INDIAN_STATES_AND_DISTRICTS[matchedState] || [];
                const matchedDistrict = districtsList.find(dst => 
                  dst.toLowerCase().replace(/[^a-z]/g, '') === apiDistrict.toLowerCase().replace(/[^a-z]/g, '') ||
                  dst.toLowerCase() === apiDistrict.toLowerCase()
                ) || districtsList[0];

                if (matchedDistrict) {
                  setNewCustDistrict(matchedDistrict);
                  setNewCustDistrictSearch(matchedDistrict);
                }
                setNewCustPincodeLookupMessage('PIN matches!');
                setIsNewCustPincodeLoading(false);
                return;
              }
            }
          }
        } catch (error) {
          console.warn('New customer pincode fetch error, falling back locally:', error);
        }

        // --- Local fallback block ---
        const firstDigit = newCustPincode[0];
        let fallbackState = '';
        let fallbackDistrict = '';

        if (newCustPincode === '110001') {
          fallbackState = 'Delhi';
          fallbackDistrict = 'New Delhi';
        } else if (newCustPincode === '400001') {
          fallbackState = 'Maharashtra';
          fallbackDistrict = 'Mumbai';
        } else if (newCustPincode === '682011') {
          fallbackState = 'Kerala';
          fallbackDistrict = 'Ernakulam';
        } else if (newCustPincode === '600001') {
          fallbackState = 'Tamil Nadu';
          fallbackDistrict = 'Chennai';
        } else if (newCustPincode === '560001') {
          fallbackState = 'Karnataka';
          fallbackDistrict = 'Bengaluru Urban';
        } else {
          if (firstDigit === '6') {
            fallbackState = 'Kerala';
            fallbackDistrict = 'Ernakulam';
          } else if (firstDigit === '5') {
            fallbackState = 'Karnataka';
            fallbackDistrict = 'Bengaluru Urban';
          } else if (firstDigit === '4') {
            fallbackState = 'Maharashtra';
            fallbackDistrict = 'Mumbai';
          } else if (firstDigit === '3') {
            fallbackState = 'Gujarat';
            fallbackDistrict = 'Ahmedabad';
          } else if (firstDigit === '2') {
            fallbackState = 'Uttar Pradesh';
            fallbackDistrict = 'Noida';
          } else if (firstDigit === '1') {
            fallbackState = 'Delhi';
            fallbackDistrict = 'New Delhi';
          } else if (firstDigit === '8') {
            fallbackState = 'Bihar';
            fallbackDistrict = 'Patna';
          } else if (firstDigit === '7') {
            fallbackState = 'West Bengal';
            fallbackDistrict = 'Kolkata';
          }
        }

        if (fallbackState) {
          const matchedState = INDIAN_STATES_LIST.find(st => st.toLowerCase() === fallbackState.toLowerCase());
          if (matchedState) {
            setNewCustState(matchedState);
            setNewCustStateSearch(matchedState);
            const districtsList = INDIAN_STATES_AND_DISTRICTS[matchedState] || [];
            const matchedDistrict = districtsList.find(dst => dst.toLowerCase() === fallbackDistrict.toLowerCase()) || districtsList[0];
            if (matchedDistrict) {
              setNewCustDistrict(matchedDistrict);
              setNewCustDistrictSearch(matchedDistrict);
              setNewCustPincodeLookupMessage('Matched locally');
            }
          }
        } else {
          setNewCustPincodeLookupMessage('Not found, fill manually');
        }
        setIsNewCustPincodeLoading(false);
      };

      fetchNewCustPincodeDetails();
    } else {
      setNewCustPincodeLookupMessage('');
    }
  }, [newCustPincode]);

  // Dropdown search & open states
  const [newCustStateSearch, setNewCustStateSearch] = useState('');
  const [isNewCustStateOpen, setIsNewCustStateOpen] = useState(false);
  const [newCustDistrictSearch, setNewCustDistrictSearch] = useState('');
  const [isNewCustDistrictOpen, setIsNewCustDistrictOpen] = useState(false);

  // Refs for click outside
  const newCustStateRef = useRef<HTMLDivElement>(null);
  const newCustDistrictRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (newCustStateRef.current && !newCustStateRef.current.contains(event.target as Node)) {
        setIsNewCustStateOpen(false);
      }
      if (newCustDistrictRef.current && !newCustDistrictRef.current.contains(event.target as Node)) {
        setIsNewCustDistrictOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Multi-product line items state (now stores price for editability!)
  const [lineItems, setLineItems] = useState<{ productId: string; quantity: number; price: number }[]>([]);
  const [currentItemId, setCurrentItemId] = useState('');
  const [currentQty, setCurrentQty] = useState(1);
  const [customPriceInput, setCustomPriceInput] = useState<number | null>(null);

  // Search and Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('All');
  const [deliveryFilter, setDeliveryFilter] = useState<string>('All');

  // Active dropdown status editor state
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [dropType, setDropType] = useState<'payment' | 'delivery' | null>(null);

  // Selected Invoice modal
  const [selectedInvoice, setSelectedInvoice] = useState<SalesOrder | null>(null);

  // Custom Delete Order State
  const [orderToDelete, setOrderToDelete] = useState<SalesOrder | null>(null);
  const [showPurgeAllConfirm, setShowPurgeAllConfirm] = useState(false);

  // Combobox states
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);

  // Helper to resolve referral code for customer from master customer directory
  const getCustomerReferralCode = (cust?: CustomerPerformance) => {
    if (!cust) return '';
    if (cust.referralCode) return cust.referralCode;
    if (cust.partnerName) {
      const found = referrals.find(r => (r.name || '').toLowerCase() === cust.partnerName?.toLowerCase());
      if (found) return found.referralId;
    }
    return '';
  };

  const masterReferralCode = selectedCustomerObj ? getCustomerReferralCode(selectedCustomerObj) : '';
  const isReferralCodeDisabled = !!(selectedCustomerObj && masterReferralCode);

  // Sync selected customer referral code from customer directory master table
  useEffect(() => {
    if (selectedCustomerObj) {
      const code = getCustomerReferralCode(selectedCustomerObj);
      if (code) {
        setReferralCode(code);
        setReferralValid(true);
        setReferralError('');
      } else {
        // If there is no customer master referral code, don't wipe out any manually selected or invoice-loaded referral code
        if (!referralCode && !referralValid) {
          setReferralCode('');
          setReferralValid(false);
          setReferralError('');
        }
      }
    } else {
      if (!editingOrderId && !referralValid) {
        setReferralCode('');
        setReferralValid(false);
        setReferralError('');
      }
    }
  }, [selectedCustomerId, customers, referrals, editingOrderId]);

  const filteredCustomers = customers.filter(c => {
    const q = customerSearchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.mobileNumber || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)
    );
  });

  const filteredReferralAsCustomers = referrals.filter(p => {
    const q = customerSearchQuery.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.referralId || '').toLowerCase().includes(q) ||
      (p.mobileNumber || '').toLowerCase().includes(q)
    );
  });

  const filteredReferralPartners = referrals.filter(p => {
    const q = referralSearchQuery.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.referralId || '').toLowerCase().includes(q) ||
      (p.mobileNumber || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
      if (referralDropdownRef.current && !referralDropdownRef.current.contains(event.target as Node)) {
        setIsReferralDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Validation feedback
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-select newly created customer helper via hook detection
  const prevCustomersLength = useRef(customers.length);
  useEffect(() => {
    if (customers.length > prevCustomersLength.current) {
      // The newly prepended customer
      const newest = customers[0];
      if (newest) {
        setSelectedCustomerId(newest.id);
        setContactNo(newest.mobileNumber || '');
        setErrorMessage('');
      }
    }
    prevCustomersLength.current = customers.length;
  }, [customers]);

  // Handle customer selection lookup
  const handleCustomerSelect = (id: string) => {
    setSelectedCustomerId(id);
    const cust = customers.find(c => c.id === id);
    if (cust) {
      setContactNo(cust.mobileNumber || '');
      const code = getCustomerReferralCode(cust);
      if (code) {
        setReferralCode(code);
        setReferralValid(true);
        setReferralError('');
        const partner = referrals.find(r => r.referralId === code);
        setReferralSearchQuery(partner ? partner.name : code);
      } else {
        setReferralCode('');
        setReferralValid(false);
        setReferralError('');
        setReferralSearchQuery('');
      }
    } else {
      setContactNo('');
      setReferralCode('');
      setReferralValid(false);
      setReferralError('');
      setReferralSearchQuery('');
    }
  };

  // Check referral code hub availability
  const checkReferralAvailability = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setReferralError('');
      setReferralValid(false);
      return;
    }
    const match = referrals.find(r => r.referralId === trimmed || (r.name || '').toLowerCase() === trimmed.toLowerCase());
    if (match) {
      setReferralValid(true);
      setReferralError('');
    } else {
      setReferralValid(false);
      setReferralCode(''); // blank out field if invalid
      setReferralError('referral code not available'); // literal error prompt
    }
  };

  // Quick reset of checking indicators on value modifications
  const handleReferralChange = (val: string) => {
    setReferralCode(val);
    setReferralError('');
    setReferralValid(false);
  };

  if (!hasAccess('Sales Orders', 'read')) {
    return (
      <div className="bg-rose-955/40 border border-[#4c1d24]/60 rounded-2xl p-8 text-center text-rose-205" id="access-denied-sales">
        <h3 className="font-bold text-lg mb-2 text-white">Security Authorization Required</h3>
        <p className="text-sm opacity-90">Your active role profile does not grant access to the Sales Orders & Invoicing module. Please shift perspective to Sales or Admin to access active opportunities.</p>
      </div>
    );
  }

  // Handle adding product line item to draft order
  const handleAddLineItem = () => {
    if (!currentItemId) return;
    
    const prod = products.find(p => p.id === currentItemId);
    if (!prod) return;

    if (currentQty <= 0) {
      setErrorMessage("Quantity must be at least 1.");
      return;
    }

    if (prod.stock < currentQty) {
      setErrorMessage(`Insufficient stock. Only ${prod.stock} left for ${prod.name}.`);
      return;
    }

    const defaultPrice = orderType === 'Online' ? prod.onlinePrice : (prod.shopPrice || prod.onlinePrice);
    const resolvedPrice = customPriceInput !== null ? customPriceInput : defaultPrice;

    // Check if product is already in line items
    const existingIndex = lineItems.findIndex(item => item.productId === currentItemId);
    const updated = [...lineItems];
    if (existingIndex > -1) {
      const newQty = updated[existingIndex].quantity + currentQty;
      if (prod.stock < newQty) {
        setErrorMessage(`Insufficient stock. Total quantity of ${prod.name} exceeds available ${prod.stock}.`);
        return;
      }
      updated[existingIndex].quantity = newQty;
      updated[existingIndex].price = resolvedPrice;
      setLineItems(updated);
    } else {
      setLineItems(prev => [...prev, { productId: currentItemId, quantity: currentQty, price: resolvedPrice }]);
    }

    setErrorMessage('');
    setCurrentItemId('');
    setCurrentQty(1);
    setCustomPriceInput(null);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleEditInvoice = (order: SalesOrder) => {
    // Refresh directory before editing so the customer combobox reflects the latest saved data
    reloadFirestoreData();
    setIsAdding(true);
    setEditingOrderId(order.id);
    setSelectedCustomerId(order.customerId || '');
    setSelectedMethod((order.paymentMethod as any) || 'Bank Transfer');
    setPaymentStatus(order.paymentStatus || 'Paid');
    setDeliveryStatus(order.deliveryStatus || 'Pending');
    setAssignedAgent(order.assignedTo || 'Tony Stark');
    setOrderType(order.orderType || 'Online');
    setSalesChannel(order.salesChannel || 'Shop');
    setInvoiceDate(order.invoiceDate || (order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]));
    setPickupDate(order.pickupDate || new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    setCourierAgency(order.courierAgency || 'Amazon');
    setCourierCharges(order.courierCharges || 0);
    setContactNo(order.contactNo || '');
    setReferralCode(order.referralCode || '');
    
    if (order.referralCode) {
      setReferralValid(true);
      setReferralError('');
      const partner = referrals.find(r => r.referralId === order.referralCode);
      setReferralSearchQuery(partner ? partner.name : order.referralCode);
    } else {
      setReferralValid(false);
      setReferralError('');
      setReferralSearchQuery('');
    }

    const items = (order.products || []).map(p => ({
      productId: p.productId,
      quantity: p.quantity,
      price: p.price
    }));
    setLineItems(items);
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOrderId) {
      if (!hasAccess('Sales Orders', 'edit')) return;
    } else {
      if (!hasAccess('Sales Orders', 'create')) return;
    }

    if (!selectedCustomerId) {
      setErrorMessage('Please select a customer or define a new one first.');
      return;
    }

    if (lineItems.length === 0) {
      setErrorMessage('Please add at least one product to the sales order.');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) {
      setErrorMessage('Invalid customer chosen.');
      return;
    }

    const compiledProducts: SalesProduct[] = lineItems.map(item => {
      const prod = products.find(p => p.id === item.productId)!;
      return {
        productId: item.productId,
        productName: prod?.name || 'Unknown Item',
        quantity: item.quantity,
        price: item.price,
        gstPercentage: prod?.gstPercentage ?? 18
      };
    });

    const totalValue = calculateTotal();

    // If the customer does NOT already have a referral code in the customer directory master table, update it
    if (selectedCustomerObj && !selectedCustomerObj.referralCode && referralCode) {
      const matchPartner = referrals.find(r => r.referralId === referralCode || (r.name || '').toLowerCase() === referralCode.toLowerCase());
      updateCustomer(selectedCustomerId, {
        referralCode: referralCode,
        partnerName: matchPartner ? matchPartner.name : undefined
      });
    }

    if (editingOrderId) {
      setUpdatePayload({
        id: editingOrderId,
        data: {
          customerId: selectedCustomerId,
          customerName: customer.name,
          customerCompany: customer.company || "Individual",
          products: compiledProducts,
          totalValue,
          paymentStatus: paymentStatus as any,
          deliveryStatus: deliveryStatus as any,
          assignedTo: assignedAgent,
          paymentMethod: selectedMethod,
          orderType: orderType,
          salesChannel: salesChannel,
          invoiceDate,
          pickupDate,
          courierAgency,
          courierCharges: Math.round(Number(courierCharges || 0) * 100) / 100,
          contactNo,
          referralCode
        }
      });
      setShowUpdateConfirm(true);
      return;
    } else {
      // Trigger store integration adding order
      addSalesOrder({
        customerId: selectedCustomerId,
        customerName: customer.name,
        customerCompany: customer.company || "Individual",
        products: compiledProducts,
        totalValue,
        paymentStatus: paymentStatus as any,
        deliveryStatus: deliveryStatus as any,
        assignedTo: assignedAgent,
        paymentMethod: selectedMethod,
        orderType: orderType,
        salesChannel: salesChannel,
        invoiceDate,
        pickupDate,
        courierAgency,
        courierCharges: Math.round(Number(courierCharges || 0) * 100) / 100,
        contactNo,
        referralCode
      });

      // Reset Form on fresh creation
      setIsAdding(false);
      setEditingOrderId(null);
      setSelectedCustomerId('');
      setLineItems([]);
      setErrorMessage('');
      setCourierAgency('Amazon');
      setCourierCharges(0);
      setContactNo('');
      setReferralCode('');
      setReferralError('');
      setReferralValid(false);
      setSalesChannel('Shop');
    }
  };

  const handleConfirmUpdate = () => {
    if (!updatePayload) return;
    updateSalesOrder(updatePayload.id, updatePayload.data);

    // Reset Form on confirmation
    setShowUpdateConfirm(false);
    setUpdatePayload(null);
    setIsAdding(false);
    setEditingOrderId(null);
    setSelectedCustomerId('');
    setLineItems([]);
    setErrorMessage('');
    setCourierAgency('Amazon');
    setCourierCharges(0);
    setContactNo('');
    setReferralCode('');
    setReferralError('');
    setReferralValid(false);
    setSalesChannel('Shop');
  };

  // Performance calculations
  const partnerOfUser = referrals.find(r => 
    (r.email && currentUser?.email && r.email.toLowerCase() === currentUser.email.toLowerCase()) || 
    (r.mobileNumber && currentUser?.mobileNumber && r.mobileNumber === currentUser.mobileNumber) ||
    (r.name && currentUser?.name && r.name.toLowerCase() === currentUser.name.toLowerCase())
  );
  
  const userSalesOrders = currentUser?.role === 'Referral Team' 
    ? salesOrders.filter(order => {
        const myCode = partnerOfUser?.referralId || '';
        const myName = currentUser?.name || '';
        return order.referralCode && (
          (myCode && order.referralCode === myCode) ||
          (myName && order.referralCode.toLowerCase() === myName.toLowerCase())
        );
      })
    : salesOrders;

  const activeOrders = userSalesOrders.filter(o => o.deliveryStatus !== 'Cancelled' && o.paymentStatus !== 'Refunded');

  const totalRevenue = activeOrders.reduce((sum, o) => sum + o.totalValue, 0);
  const paidRevenue = activeOrders.filter(o => o.paymentStatus === 'Paid').reduce((sum, o) => sum + o.totalValue, 0);
  const outstandingRevenue = activeOrders.filter(o => o.paymentStatus === 'Pending' || o.paymentStatus === 'Overdue').reduce((sum, o) => sum + o.totalValue, 0);
  const averageValue = activeOrders.length > 0 ? (totalRevenue / activeOrders.length) : 0;

  // Search filter implementation
  const filteredOrders = userSalesOrders.filter(o => {
    const matchesSearch = o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.customerCompany.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPayment = paymentFilter === 'All' || o.paymentStatus === paymentFilter;
    const matchesDelivery = deliveryFilter === 'All' || o.deliveryStatus === deliveryFilter;

    return matchesSearch && matchesPayment && matchesDelivery;
  });

  return (
    <div className="space-y-6" id="sales-orders-view">
      
      {/* 1. Module Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0d0d10] p-6 rounded-2xl border border-slate-800 shadow shadow-black/40">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center shadow">
            <Receipt className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              Sales Orders & Invoiced Accounts
            </h1>
            <p className="text-xs text-slate-400">Generate commercial invoices, manage order fulfillment, and reconcile loyalty accounts.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Purge All Invoices Button Hidden as requested
          {hasAccess('Sales Orders', 'delete') && salesOrders.length > 0 && (
            <button
              onClick={() => setShowPurgeAllConfirm(true)}
              className="py-2.5 px-4 bg-rose-600/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 shadow-lg"
              id="purge-all-orders-btn"
              title="Delete all sales orders and related linked transactions"
            >
              <Trash2 className="w-4 h-4" />
              Purge All Invoices
            </button>
          )}
          */}

          {hasAccess('Sales Orders', 'create') && currentUser?.role !== 'Referral Team' && (
            <button
              onClick={() => {
                if (isAdding) {
                  setIsAdding(false);
                  setEditingOrderId(null);
                  setSelectedCustomerId('');
                  setLineItems([]);
                  setErrorMessage('');
                  setCourierAgency('Amazon');
                  setContactNo('');
                  setReferralCode('');
                  setReferralError('');
                  setReferralValid(false);
                  setReferralSearchQuery('');
                } else {
                  setIsAdding(true);
                  setEditingOrderId(null);
                }
              }}
              className="py-2.5 px-4 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer active:scale-95 shadow-lg shadow-green-600/15 border border-green-500/20"
              id="add-order-toggler"
            >
              {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isAdding ? (editingOrderId ? 'Close Editor' : 'Close Builder') : 'New Invoice Order'}
            </button>
          )}
        </div>
      </div>

      {/* 2. Key Performance Indicators Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="sales-kpi-grid">
        <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#a5b4fc] block">Sales Revenue</span>
            <span className="text-2xl font-black text-white mt-1 block">₹{(totalRevenue ?? 0).toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 mt-1 block font-mono">Gross billed across {activeOrders.length} orders</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
          </div>
        </div>

        <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 block">Collections Realized</span>
            <span className="text-2xl font-black text-emerald-400 mt-1 block">₹{(paidRevenue ?? 0).toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 mt-1 block font-mono">{(totalRevenue > 0 ? (paidRevenue / totalRevenue * 100) : 0).toFixed(0)}% payment rate achieved</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
        </div>

        <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-orange-400 block">Receivables Aging</span>
            <span className="text-2xl font-black text-orange-400 mt-1 block">₹{(outstandingRevenue ?? 0).toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 mt-1 block font-mono">Outstanding pending bills</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
            <Clock className="w-5 h-5 text-orange-400" />
          </div>
        </div>

        <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-violet-400 block">Average Order Value</span>
            <span className="text-2xl font-black text-white mt-1 block">₹{(averageValue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            <span className="text-[10px] text-slate-400 mt-1 block font-mono">Billed total mean value</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
            <DollarSign className="w-5 h-5 text-violet-400" />
          </div>
        </div>
      </div>

      {/* 3. New Order builder card */}
      {isAdding && (
        <form onSubmit={handleCreateOrder} className="bg-[#0d0d10] border-2 border-violet-900/35 p-6 rounded-2xl shadow-xl animate-scaleIn space-y-6" id="add-order-form">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-violet-400" />
              {editingOrderId ? 'Edit Invoice & Order Details' : 'Dynamic Invoice & Order Configurator'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {editingOrderId ? 'Refine metallurgical, partner, and distribution parameters for this invoice live.' : 'Specify logistical parameters and compile loyal partner billing records securely.'}
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sub-navigation Tabs */}
          <div className="flex border-b border-slate-800" id="form-sub-tabs">
            <button
              type="button"
              onClick={() => setActiveConfigTab('order')}
              className={`py-2.5 px-5 text-xs font-bold border-b-2 transition ${
                activeConfigTab === 'order' 
                  ? 'border-violet-500 text-white bg-violet-950/20' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Configure Order Document
            </button>
            <button
              type="button"
              onClick={() => setActiveConfigTab('new_customer')}
              className={`py-2.5 px-5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeConfigTab === 'new_customer' 
                  ? 'border-violet-500 text-white bg-violet-950/20' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-4 h-4 text-violet-400" />
              New Customer Creation Tab
            </button>
          </div>

          {activeConfigTab === 'new_customer' ? (
            <div className="space-y-4 bg-[#141418] border border-slate-800 p-5 rounded-2xl animate-fadeIn">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-5 h-5 text-violet-400" />
                <h4 className="text-sm font-bold text-white">Loyalty Account Registration</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Create a permanent folder entry for this partner. On registration completion, they will be saved to the database directory and pre-selected in your open invoice configuration tab automatically.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., Bruce Wayne"
                    value={newCustName}
                    onChange={e => setNewCustName(e.target.value)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Business/Company name</label>
                  <input
                    type="text"
                    placeholder="E.g., Wayne Enterprises"
                    value={newCustCompany}
                    onChange={e => setNewCustCompany(e.target.value)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Primary Email</label>
                  <input
                    type="email"
                    placeholder="bruce@waynecorp.com"
                    value={newCustEmail}
                    onChange={e => setNewCustEmail(e.target.value)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Mobile / Contact No *</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={newCustMobile}
                    onChange={e => setNewCustMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* PIN Code */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">PIN Code</label>
                    {newCustPincodeLookupMessage && (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded transition-all duration-200 ${
                        newCustPincodeLookupMessage.includes('matches') || newCustPincodeLookupMessage.includes('locally')
                          ? 'text-emerald-400 bg-emerald-950/30'
                          : newCustPincodeLookupMessage.includes('Fetching')
                          ? 'text-amber-400 bg-amber-955/20 animate-pulse'
                          : 'text-slate-400 bg-slate-900/50'
                      }`}>
                        {newCustPincodeLookupMessage}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 682011"
                    value={newCustPincode}
                    onChange={e => setNewCustPincode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200"
                  />
                </div>

                {/* State Region Combobox */}
                <div className="relative" ref={newCustStateRef}>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">State</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="-- Search State --" 
                      value={isNewCustStateOpen ? newCustStateSearch : newCustState}
                      onChange={e => {
                        setNewCustStateSearch(e.target.value);
                        setIsNewCustStateOpen(true);
                      }}
                      onFocus={() => {
                        setNewCustStateSearch(newCustState);
                        setIsNewCustStateOpen(true);
                      }}
                      className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 pr-8 text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setIsNewCustStateOpen(!isNewCustStateOpen)}
                      className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {isNewCustStateOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#0d0d10] border border-slate-800 rounded-xl shadow-2xl divide-y divide-slate-850">
                      {INDIAN_STATES_LIST.filter(st => st.toLowerCase().includes(newCustStateSearch.toLowerCase())).length === 0 ? (
                        <div className="p-2.5 text-xs text-slate-500 italic">No matches</div>
                      ) : (
                        INDIAN_STATES_LIST.filter(st => st.toLowerCase().includes(newCustStateSearch.toLowerCase())).map(st => (
                          <button
                            type="button"
                            key={st}
                            onMouseDown={() => {
                              setNewCustState(st);
                              setNewCustStateSearch(st);
                              setIsNewCustStateOpen(false);
                              // Reset district
                              setNewCustDistrict('');
                              setNewCustDistrictSearch('');
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-violet-950/40 text-slate-300 transition ${
                              newCustState === st ? 'bg-violet-950/20 text-white font-bold' : ''
                            }`}
                          >
                            {st}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* District Combobox */}
                <div className="relative" ref={newCustDistrictRef}>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">District</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder={newCustState ? "-- Search District --" : "Select State First"} 
                      disabled={!newCustState}
                      value={newCustState ? (isNewCustDistrictOpen ? newCustDistrictSearch : newCustDistrict) : ''}
                      onChange={e => {
                        setNewCustDistrictSearch(e.target.value);
                        setIsNewCustDistrictOpen(true);
                      }}
                      onFocus={() => {
                        setNewCustDistrictSearch(newCustDistrict);
                        setIsNewCustDistrictOpen(true);
                      }}
                      className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 pr-8 text-slate-200 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={!newCustState}
                      onClick={() => setIsNewCustDistrictOpen(!isNewCustDistrictOpen)}
                      className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300 disabled:opacity-50"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {isNewCustDistrictOpen && newCustState && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#0d0d10] border border-slate-800 rounded-xl shadow-2xl divide-y divide-slate-850">
                      {((INDIAN_STATES_AND_DISTRICTS[newCustState] || []).filter(dst => dst.toLowerCase().includes(newCustDistrictSearch.toLowerCase()))).length === 0 ? (
                        <div className="p-2.5 text-xs text-slate-500 italic">No matches</div>
                      ) : (
                        (INDIAN_STATES_AND_DISTRICTS[newCustState] || []).filter(dst => dst.toLowerCase().includes(newCustDistrictSearch.toLowerCase())).map(dst => (
                          <button
                            type="button"
                            key={dst}
                            onMouseDown={() => {
                              setNewCustDistrict(dst);
                              setNewCustDistrictSearch(dst);
                              setIsNewCustDistrictOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-violet-950/40 text-slate-300 transition ${
                              newCustDistrict === dst ? 'bg-violet-900/20 text-white font-bold' : ''
                            }`}
                          >
                            {dst}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Permanent Address */}
                <div className="md:col-span-2">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Permanent Address</label>
                  <input
                    type="text"
                    placeholder="Street, Suite number, etc."
                    value={newCustAddress}
                    onChange={e => setNewCustAddress(e.target.value)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200"
                  />
                </div>

                {/* Loyalty Tier Selection */}
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1 block">Classification Level</label>
                  <select
                    value={newCustTier}
                    onChange={e => setNewCustTier(e.target.value as any)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200 cursor-pointer"
                  >
                    <option value="Platinum">👑 Platinum Account</option>
                    <option value="Gold">⭐️ Gold Account</option>
                    <option value="Silver">🔘 Silver Account</option>
                    <option value="Bronze">🍂 Bronze Account</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveConfigTab('order');
                  }}
                  className="py-2 px-4 bg-[#141418] hover:bg-[#1a1a22] text-slate-400 border border-slate-800 rounded-xl text-xs font-bold transition cursor-pointer font-sans"
                >
                  Regard as Draft (Back)
                </button>
                <button
                  type="button"
                  onClick={async (e) => {
                    if (!newCustName.trim() || !newCustMobile.trim()) {
                      setErrorMessage('Loyalty client name and mobile contact no are strictly mandatory.');
                      return;
                    }
                    const cleanMobile = newCustMobile.trim();
                    if (!/^\d{10}$/.test(cleanMobile)) {
                      setErrorMessage('Mobile / Contact No must be exactly 10 digits.');
                      return;
                    }
                    let generatedCustomerId = '';
                    do {
                      generatedCustomerId = `CUS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
                    } while (customers.some(c => c.customerId === generatedCustomerId));
                    const newC = await addCustomer({
                      customerId: generatedCustomerId,
                      name: newCustName,
                      company: newCustCompany || 'Individual',
                      email: newCustEmail || `${newCustName.toLowerCase().replace(/\s+/g, '')}@noemail.com`,
                      mobileNumber: newCustMobile,
                      address: newCustAddress || 'Corporate HQ Address',
                      state: newCustState || 'Karnataka',
                      district: newCustDistrict || 'Bengaluru',
                      pincode: newCustPincode || 'N/A',
                      totalSpent: 0,
                      dealsClosed: 0,
                      satisfactionScore: 5,
                      lastOrderDate: new Date().toISOString().split('T')[0],
                      tier: newCustTier
                    }, true);

                    if (newC) {
                      setSelectedCustomerId(newC.id);
                    }

                    setNewCustName('');
                    setNewCustCompany('');
                    setNewCustEmail('');
                    setNewCustMobile('');
                    setNewCustAddress('');
                    setNewCustState('');
                    setNewCustDistrict('');
                    setNewCustPincode('');
                    setNewCustTier('Silver');
                    setErrorMessage('');
                    setActiveConfigTab('order');
                  }}
                  className="py-2 px-5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer font-sans shadow shadow-indigo-650"
                >
                  <Check className="w-4 h-4" /> Save Customer
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-fadeIn">
              {/* Elegant Header Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 bg-[#141418] rounded-2xl border border-slate-800" id="invoice-header-fields">
                
                {/* Field 1: Customer Link Selection */}
                <div className="md:col-span-2 relative" ref={customerDropdownRef}>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-slate-455 block">Customer Selection (Directory) *</label>
                    <button
                      type="button"
                      onClick={() => setActiveConfigTab('new_customer')}
                      className="text-[10px] font-extrabold text-violet-400 hover:text-violet-300 flex items-center gap-1 cursor-pointer hover:underline animate-pulse"
                    >
                      <Plus className="w-2.5 h-2.5" /> Register New Customer
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder={
                        selectedCustomerObj 
                          ? `${selectedCustomerObj.name} - ${selectedCustomerObj.mobileNumber || 'No Mobile'}`
                          : "-- Choose Customer: Search by Name or Mobile --"
                      }
                      value={
                        isCustomerDropdownOpen 
                          ? customerSearchQuery 
                          : selectedCustomerObj 
                            ? `${selectedCustomerObj.name} - ${selectedCustomerObj.mobileNumber || 'No Mobile'}` 
                            : ''
                      }
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        if (!isCustomerDropdownOpen) {
                          setIsCustomerDropdownOpen(true);
                        }
                      }}
                      onFocus={() => {
                        setIsCustomerDropdownOpen(true);
                        // Refetch latest customers/referrals so the directory never shows stale data
                        reloadFirestoreData();
                      }}
                      className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2.5 pl-3 pr-10 text-slate-200 transition"
                    />

                    <div className="absolute right-3.5 top-2.5 flex items-center gap-1.5 text-slate-400">
                      {selectedCustomerId && (
                        <button
                          type="button"
                          onClick={() => {
                            handleCustomerSelect('');
                            setCustomerSearchQuery('');
                          }}
                          className="hover:text-rose-455 text-slate-500 transition cursor-pointer p-0.5"
                          title="Clear customer selection"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const next = !isCustomerDropdownOpen;
                          setIsCustomerDropdownOpen(next);
                          if (next) reloadFirestoreData();
                        }}
                        className="hover:text-violet-400 text-slate-500 transition cursor-pointer p-0.5"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCustomerDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {isCustomerDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#0d0d10] border border-slate-850 rounded-xl max-h-60 overflow-y-auto shadow-2xl divide-y divide-slate-850 animate-fadeIn">
                      {filteredCustomers.length === 0 && filteredReferralAsCustomers.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-slate-500 italic">
                          No matching customers or referral partners found.
                        </div>
                      ) : (
                        <>
                          {/* Standard Customers Header */}
                          {filteredCustomers.length > 0 && (
                            <div className="bg-[#141418] px-3 py-1.5 text-[9px] uppercase tracking-wider font-extrabold text-slate-500 border-b border-slate-850 font-mono">
                              Master Customer Directory
                            </div>
                          )}
                          {filteredCustomers.map(c => (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => {
                                handleCustomerSelect(c.id);
                                setIsCustomerDropdownOpen(false);
                                setCustomerSearchQuery('');
                              }}
                              className={`w-full text-left px-4 py-2.5 text-xs hover:bg-violet-950/30 transition flex flex-col gap-0.5 ${
                                selectedCustomerId === c.id ? 'bg-violet-950/20 text-white font-bold' : 'text-slate-300'
                              }`}
                            >
                              <div className="flex justify-between items-center w-full">
                                <span className="font-semibold text-slate-100">{c.name}</span>
                                <span className="text-[10px] font-mono text-violet-400 bg-violet-950/45 px-1.5 py-0.5 rounded font-bold">{c.tier}</span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] text-slate-400 w-full font-sans mt-0.5">
                                <span className="truncate">{c.company || 'Individual'}</span>
                                <span className="font-mono text-slate-400">{c.mobileNumber || 'No Mobile'}</span>
                              </div>
                            </button>
                          ))}

                          {/* Referral Partners Section */}
                          {filteredReferralAsCustomers.length > 0 && (
                            <div className="bg-lime-950/40 px-3 py-1.5 text-[9px] uppercase tracking-wider font-extrabold text-lime-400 border-t border-b border-slate-850 font-mono flex items-center justify-between">
                              <span>Referral Partners (Convert on Selection)</span>
                              <span className="text-[8px] bg-lime-900/50 text-lime-300 px-1 py-0.2 rounded font-bold uppercase">Partner Hub</span>
                            </div>
                          )}
                          {filteredReferralAsCustomers.map(r => {
                            // Find if this referral is currently active or selected as customer
                            const isSelected = selectedCustomerObj?.referralCode === r.referralId;
                            return (
                              <button
                                type="button"
                                key={r.id}
                                onClick={async () => {
                                  // Check if a customer record already exists for this referral partner
                                  let existingC = customers.find(c => 
                                    (c.referralCode === r.referralId) ||
                                    (c.mobileNumber === r.mobileNumber && r.mobileNumber) ||
                                    (c.name.toLowerCase() === r.name.toLowerCase())
                                  );
                                  
                                  if (!existingC) {
                                    let generatedCustomerId = '';
                                    do {
                                      generatedCustomerId = `CUS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
                                    } while (customers.some(c => c.customerId === generatedCustomerId));
                                    // Dynamically register the referral partner as a customer in the directory
                                    existingC = await addCustomer({
                                      customerId: generatedCustomerId,
                                      name: r.name,
                                      company: "Referral Partner",
                                      email: r.email || `${r.referralId.toLowerCase()}@partner.com`,
                                      mobileNumber: r.mobileNumber || '',
                                      address: r.address || 'Referral Directory',
                                      state: 'Maharashtra', // Default standard
                                      district: 'Mumbai',
                                      pincode: '',
                                      totalSpent: 0,
                                      dealsClosed: 0,
                                      satisfactionScore: 5,
                                      lastOrderDate: new Date().toISOString().split('T')[0],
                                      tier: 'Silver',
                                      referralCode: r.referralId,
                                      partnerName: r.name
                                    }, true); // bypass permissions true
                                  }

                                  if (existingC) {
                                    handleCustomerSelect(existingC.id);
                                    // Set referral code for the order flow to self for Level-1 and upward chain support
                                    setReferralCode(r.referralId);
                                    setReferralValid(true);
                                    setReferralError('');
                                    setReferralSearchQuery(r.name);
                                  }
                                  setIsCustomerDropdownOpen(false);
                                  setCustomerSearchQuery('');
                                }}
                                className={`w-full text-left px-4 py-2.5 text-xs bg-[#0b0f0b] hover:bg-lime-950/25 border-l-2 border-lime-500/40 transition flex flex-col gap-0.5 ${
                                  isSelected ? 'bg-lime-950/30 text-lime-100 font-bold' : 'text-slate-350'
                                }`}
                              >
                                <div className="flex justify-between items-center w-full">
                                  <span className="font-extrabold text-lime-300">{r.name}</span>
                                  <span className="text-[9px] font-mono text-lime-400 bg-lime-950/60 px-1.5 py-0.5 border border-lime-800/30 rounded font-black uppercase">PARTNER #{r.referralId}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-slate-400 w-full font-sans mt-0.5">
                                  <span className="truncate text-lime-400/70 font-semibold">Auto-calculates MLM Multi-level Commissions</span>
                                  <span className="font-mono text-lime-400/80">{r.mobileNumber || 'No Mobile'}</span>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Field 2: Contact No */}
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-455 block mb-1.5">Contact No (Phone) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contact number"
                    value={contactNo}
                    onChange={e => setContactNo(e.target.value)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200"
                  />
                </div>

                {/* Field 3: Sales Platform Combo Box */}
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-[#a5b4fc] block mb-1.5">Sales Platform *</label>
                  <select
                    value={orderType}
                    onChange={e => setOrderType(e.target.value as any)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200 font-bold"
                  >
                    <option value="Online">Online Sales</option>
                    <option value="Shop">Shop Sales</option>
                  </select>
                </div>

                {/* Field 3.5: Sales Channel Combo Box */}
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 block mb-1.5">Sales Channel *</label>
                  <select
                    value={salesChannel}
                    onChange={e => setSalesChannel(e.target.value as any)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200 font-bold"
                  >
                    <option value="Amazon">Amazon</option>
                    <option value="Flipkart">Flipkart</option>
                    <option value="Vamjo">Vamjo</option>
                    <option value="Meesho">Meesho</option>
                    <option value="Shop">Shop</option>
                  </select>
                </div>

                {/* Field 4: Date of Invoice */}
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-[#a5b4fc] block mb-1.5 font-mono">Date of Invoice *</label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200 font-mono"
                  />
                </div>

                {/* Field 5: Pickup Date */}
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-[#a5b4fc] block mb-1.5 font-mono">Pickup Date *</label>
                  <input
                    type="date"
                    required
                    value={pickupDate}
                    onChange={e => setPickupDate(e.target.value)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-3 text-slate-200 font-mono"
                  />
                </div>

                {/* Field 6: Courier Agency & Charges */}
                <div className="grid grid-cols-2 gap-3" id="field-courier-config">
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-widest text-slate-455 block mb-1.5">Courier Agency</label>
                    <select
                      value={courierAgency}
                      onChange={e => setCourierAgency(e.target.value)}
                      className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200 cursor-pointer"
                    >
                      <option value="Amazon">Amazon</option>
                      <option value="Delhivery">Delhivery</option>
                      <option value="FedEx">FedEx</option>
                      <option value="DHL">DHL</option>
                      <option value="BlueDart">BlueDart</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-widest text-slate-455 block mb-1.5">Charges (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Charges"
                      value={courierCharges || ''}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setCourierCharges(Math.round(val * 100) / 100);
                      }}
                      className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200 font-mono"
                    />
                  </div>
                </div>

                {/* Field 7: Referral Code matching / Custom Combobox */}
                <div className="md:col-span-2 relative">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-[#a5b4fc] block">Referral Code *</label>
                    {referralValid && (
                      <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5 animate-pulse">
                        ✓ {isReferralCodeDisabled ? 'Linked (Master)' : 'Linked'}
                      </span>
                    )}
                  </div>
                  
                  {isReferralCodeDisabled ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        readOnly
                        value={referralCode}
                        className="flex-1 bg-[#141418] border border-[#a5b4fc]/30 rounded-xl text-xs py-2.5 px-3 text-indigo-300 font-bold font-mono cursor-not-allowed"
                      />
                    </div>
                  ) : (
                    <div className="relative" ref={referralDropdownRef}>
                      <div className="relative flex gap-1">
                        <input
                          type="text"
                          placeholder="Search partner by Name, Code, or Mobile..."
                          value={isReferralDropdownOpen ? referralSearchQuery : (referralCode ? `${referrals.find(r => r.referralId === referralCode)?.name || referralCode} (${referralCode})` : '')}
                          onChange={e => {
                            setReferralSearchQuery(e.target.value);
                            setIsReferralDropdownOpen(true);
                            setReferralCode(e.target.value); // Sync to field
                            setReferralValid(false);
                            setReferralError('');
                          }}
                          onFocus={() => {
                            const matchedName = referrals.find(r => r.referralId === referralCode)?.name || '';
                            setReferralSearchQuery(matchedName || referralCode);
                            setIsReferralDropdownOpen(true);
                          }}
                          className={`flex-1 bg-[#0d0d10] border focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200 font-semibold transition-all ${
                            referralValid 
                              ? 'border-emerald-500/50 focus:border-emerald-500' 
                              : referralError 
                                ? 'border-rose-500/50 focus:border-rose-500' 
                                : 'border-slate-800 focus:border-violet-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (referralCode) {
                              checkReferralAvailability(referralCode);
                            } else {
                              setIsReferralDropdownOpen(!isReferralDropdownOpen);
                            }
                          }}
                          className="py-1.5 px-3.5 rounded-xl text-[10px] font-black transition flex items-center justify-center shrink-0 border border-slate-700 bg-[#b1b1e3] text-slate-900 hover:bg-[#a1a1d3] cursor-pointer font-sans"
                        >
                          Verify
                        </button>
                      </div>

                      {isReferralDropdownOpen && (
                        <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-[#141418] border border-slate-800 rounded-xl shadow-2xl divide-y divide-slate-850">
                          {filteredReferralPartners.length === 0 ? (
                            <div className="p-3 text-xs text-slate-500 italic">No matching referral partners found</div>
                          ) : (
                            filteredReferralPartners.map(p => (
                              <button
                                type="button"
                                key={p.id}
                                onMouseDown={() => {
                                  setReferralCode(p.referralId);
                                  setReferralSearchQuery(p.name);
                                  setReferralValid(true);
                                  setReferralError('');
                                  setIsReferralDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2.5 hover:bg-violet-950/40 text-slate-300 transition ${
                                  referralCode === p.referralId ? 'bg-violet-900/20 text-white font-bold' : ''
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <div>
                                    <span className="font-bold text-slate-100">{p.name}</span>
                                    <span className="text-[10px] text-slate-400 ml-2 font-mono">({p.mobileNumber})</span>
                                  </div>
                                  <span className="text-[10px] bg-violet-950/60 text-violet-300 px-1.5 py-0.5 rounded font-mono font-bold">
                                    {p.referralId}
                                  </span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {isReferralCodeDisabled && (
                    <p className="text-[10px] text-indigo-400 font-medium mt-1 leading-normal">
                      🔒 This referral association is established in the Customer Directory master table and locked against dynamic editing.
                    </p>
                  )}
                  {referralError && (
                    <p className="text-[10px] text-rose-400 font-semibold mt-1">
                      ⚠️ {referralError}
                    </p>
                  )}
                </div>

                {/* Field 8: Disable text field to view the chain reference id and Level details */}
                {(() => {
                  const selectedPartnerObj = referrals.find(r => r.referralId === referralCode || r.id === referralCode);
                  let displayValue = '';
                  if (selectedPartnerObj) {
                    const parentPartner = selectedPartnerObj.parentId
                      ? referrals.find(r => r.id === selectedPartnerObj.parentId)
                      : null;
                    displayValue = `Partner: ${selectedPartnerObj.name} | Level: 1 (Sponsor) ${parentPartner ? `| Parent: ${parentPartner.name}` : '| Root entity'}`;
                  } else {
                    displayValue = referralCode ? 'Looking up active cascade path details...' : 'Pick a customer or referral partner';
                  }
                  return (
                    <div className="md:col-span-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-[#a5b4fc] block mb-1.5 font-mono">Chain Reference ID & Level Details</label>
                      <input
                        type="text"
                        disabled
                        value={displayValue}
                        className="w-full bg-slate-900/40 border border-slate-800 rounded-xl text-xs py-2.5 px-3 text-indigo-300 font-bold font-mono opacity-80"
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Details Section / Catalog Picker Row */}
              <div className="bg-[#141418] border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <h4 className="text-xs uppercase font-extrabold tracking-wider text-violet-400">Details Section (Selected Sales Line Items)</h4>
                  <p className="text-[10px] text-slate-400">Specify details: Serial number, choosing product item, quantities, and completely editable prices.</p>
                </div>

                {/* Choosing product input bar */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-4 bg-[#0d0d10] border border-slate-800 rounded-xl">
                  <div className="sm:col-span-5">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1">Choose Product Item *</label>
                    <select
                      value={currentItemId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setCurrentItemId(id);
                        const p = products.find(prod => prod.id === id);
                        if (p) {
                          const defaultPrice = orderType === 'Online' ? p.onlinePrice : (p.shopPrice || p.onlinePrice);
                          setCustomPriceInput(defaultPrice);
                        } else {
                          setCustomPriceInput(null);
                        }
                      }}
                      className="w-full bg-[#141418] border border-slate-800 focus:border-violet-500 rounded-lg text-xs py-2 px-2.5 text-slate-200"
                    >
                      <option value="">-- Choose Product Item --</option>
                      {products.map(p => {
                        const activePrice = orderType === 'Online' ? p.onlinePrice : (p.shopPrice || p.onlinePrice);
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} (SKU: {p.sku}, Active Price: ₹{activePrice}, Stock: {p.stock} units)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1">Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={currentQty}
                      onChange={(e) => setCurrentQty(parseInt(e.target.value) || 1)}
                      className="w-full bg-[#141418] border border-slate-800 focus:border-violet-500 rounded-lg text-xs py-2 px-2 text-slate-200 text-center font-mono"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1">Price (Editable)</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2.5 text-slate-500 text-xs font-mono">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Price"
                        value={customPriceInput !== null ? customPriceInput : ''}
                        onChange={(e) => setCustomPriceInput(parseFloat(e.target.value) || 0)}
                        className="w-full bg-[#141418] border border-slate-800 focus:border-violet-500 rounded-lg text-xs py-2 pl-6 pr-2 text-slate-200 font-semibold font-mono"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddLineItem}
                      className="w-full bg-green-600 hover:bg-green-300 text-white hover:text-slate-900 text-xs py-2.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                  </div>
                </div>

                {/* Interactive Line-items table details list */}
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#0d0d10]" id="draft-items-container">
                  {lineItems.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs italic" id="empty-line-items">
                      No items selected. Add products above to dynamically populate the invoice details layout.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-350 border-collapse">
                        <thead className="bg-[#141418] text-slate-455 uppercase text-[9px] font-bold tracking-widest border-b border-slate-800">
                          <tr>
                            <th className="p-3 text-center w-14">Sl No</th>
                            <th className="p-3">Choose Product Item (Catalog Name)</th>
                            <th className="p-3 text-center w-24">Qty</th>
                            <th className="p-3 text-right w-36 font-mono font-bold">Price (₹) (Editable)</th>
                            <th className="p-3 text-right w-32 font-mono font-bold">Subtotal</th>
                            <th className="p-3 text-center w-14">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {lineItems.map((item, index) => {
                            const prod = products.find(p => p.id === item.productId);
                            const gstPercentage = prod?.gstPercentage !== undefined ? prod.gstPercentage : 18;
                            const unitPrice = item.price;
                            const gstAmountPerUnit = unitPrice * (gstPercentage / (100 + gstPercentage));
                            const priceExclGst = unitPrice - gstAmountPerUnit;
                            const totalGstAmountForLine = gstAmountPerUnit * item.quantity;
                            const totalExclGstForLine = priceExclGst * item.quantity;
                            
                            const updateLineItemQty = (val: number) => {
                              if (prod && val > prod.stock) {
                                setErrorMessage(`Insufficient stock. Only ${prod.stock} left for ${prod.name}`);
                                return;
                              }
                              const updated = [...lineItems];
                              updated[index].quantity = Math.max(1, val);
                              setLineItems(updated);
                              setErrorMessage('');
                            };

                            const updateLineItemPrice = (val: number) => {
                              const updated = [...lineItems];
                              updated[index].price = Math.max(0, val);
                              setLineItems(updated);
                            };

                            return (
                              <tr key={item.productId} className="hover:bg-[#111114]/40 animate-fadeIn">
                                <td className="p-3 font-mono text-center text-slate-500">{index + 1}</td>
                                <td className="p-3 border-r border-slate-900">
                                  <span className="font-bold text-slate-200 block">{prod?.name || 'N/A'}</span>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="text-[9px] text-slate-500 font-mono">SKU: {prod?.sku || 'N/A'} • Size: {prod?.packingSize}</span>
                                    <span className="text-[9px] bg-emerald-950/40 text-emerald-300 border border-emerald-900/40 px-1.5 py-0.5 rounded font-mono font-bold">
                                      {gstPercentage}% GST Included
                                    </span>
                                  </div>
                                </td>
                                <td className="p-3 text-center border-r border-slate-900">
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={e => updateLineItemQty(parseInt(e.target.value) || 1)}
                                    className="w-16 p-1 text-center bg-[#0d0d10] border border-slate-800 text-xs text-slate-200 rounded focus:border-violet-500 focus:outline-none font-mono"
                                  />
                                </td>
                                <td className="p-3 text-right border-r border-slate-900">
                                  <div className="inline-flex items-center gap-1 font-mono">
                                    <span className="text-slate-550">₹</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={item.price}
                                      onChange={e => updateLineItemPrice(parseFloat(e.target.value) || 0)}
                                      className="w-24 p-1 text-right bg-[#0d0d10] border border-slate-800 text-xs text-slate-200 font-bold rounded focus:border-violet-500 focus:outline-none font-mono"
                                    />
                                  </div>
                                  <div className="text-[10px] text-left mt-1 text-slate-400 font-mono space-y-0.5 border-t border-slate-900/50 pt-1">
                                    <div className="flex justify-between gap-1">
                                      <span>Base:</span>
                                      <span className="text-slate-300 font-semibold" title="Price excluding GST">₹{priceExclGst.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between gap-1">
                                      <span>GST Amt:</span>
                                      <span className="text-emerald-400 font-semibold" title="Calculated GST tax value included">₹{gstAmountPerUnit.toFixed(2)}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 text-right border-r border-slate-900">
                                  <div className="font-black text-white font-mono">
                                    ₹{((item.price || 0) * (item.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-[10px] text-right mt-1 text-slate-500 font-mono space-y-0.5 border-t border-slate-900/50 pt-1">
                                    <div>Base Sub: ₹{(totalExclGstForLine ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                    <div className="text-emerald-505">GST Sub: ₹{(totalGstAmountForLine ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                  </div>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLineItem(index)}
                                    className="p-1 hover:bg-rose-950/20 text-rose-455 hover:text-rose-300 rounded transition border border-transparent hover:border-rose-900/35"
                                    title="Delete this item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Total calculations footer */}
                {lineItems.length > 0 && (() => {
                  const totalsExclGst = lineItems.reduce((sum, item) => {
                    const p = products.find(prod => prod.id === item.productId);
                    const gstRate = p?.gstPercentage !== undefined ? p.gstPercentage : 18;
                    const unitPrice = item.price;
                    const gstPerUnit = unitPrice * (gstRate / (100 + gstRate));
                    const exclGst = unitPrice - gstPerUnit;
                    return sum + (exclGst * item.quantity);
                  }, 0);

                  const totalsGst = lineItems.reduce((sum, item) => {
                    const p = products.find(prod => prod.id === item.productId);
                    const gstRate = p?.gstPercentage !== undefined ? p.gstPercentage : 18;
                    const unitPrice = item.price;
                    const gstPerUnit = unitPrice * (gstRate / (100 + gstRate));
                    return sum + (gstPerUnit * item.quantity);
                  }, 0);

                  return (
                    <div className="flex flex-col sm:flex-row justify-between items-center p-4 bg-[#0d0d10] border border-slate-800 rounded-xl text-xs font-mono gap-4 mt-4" id="draft-totals">
                      <div className="text-slate-400 text-[10px] uppercase font-bold tracking-widest flex flex-wrap gap-4">
                        <span>Active Platform: <strong className="text-violet-400">{orderType === 'Online' ? 'Online Sales' : 'Shop Sales'}</strong></span>
                        <span>Items Count: <strong className="text-white">{lineItems.length}</strong></span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 text-right items-end sm:items-center">
                        <div className="text-[11px] text-slate-400 flex gap-4">
                          <span>Base Value: <strong className="text-slate-205 font-bold">₹{(totalsExclGst ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                          <span>Tax Pool (GST): <strong className="text-emerald-400 font-bold">₹{(totalsGst ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">GRAND TOTAL:</span>
                          <strong className="text-emerald-400 font-black text-lg font-mono">₹{(calculateTotal() ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Logistics Status & Agent assignment block */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-[#141418] rounded-2xl border border-slate-800" id="fulfillment-settings">
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1.5 font-sans">Payment Method</label>
                  <select
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value as any)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200 font-bold"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI (Unified Payments)</option>
                    <option value="Stripe">Stripe API Gateway</option>
                    <option value="Cash">Cash on Counter</option>
                    <option value="Credit Card">Credit Card Terminal</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1.5 font-sans">Draft Settlement Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as any)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200"
                  >
                    <option value="Paid">Paid (Clearing Settled)</option>
                    <option value="Pending">Pending (Awaiting Wire)</option>
                    <option value="Overdue">Overdue (Past Credit Limit)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1.5 font-sans">Fulfillment Status</label>
                  <select
                    value={deliveryStatus}
                    onChange={(e) => setDeliveryStatus(e.target.value as any)}
                    className="w-full bg-[#0d0d10] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2.5 px-3 text-slate-200"
                  >
                    <option value="Pending">Pending Fulfillment</option>
                    <option value="Shipped">Shipped in Transit</option>
                    <option value="Delivered">Delivered & Signed</option>
                  </select>
                </div>
              </div>

              {/* Bottom Actions footer */}
              <div className="border-t border-slate-800 pt-4 flex justify-end gap-3 z-index-10">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingOrderId(null);
                    setSelectedCustomerId('');
                    setLineItems([]);
                    setErrorMessage('');
                    setCourierAgency('Amazon');
                    setContactNo('');
                    setReferralCode('');
                    setReferralError('');
                    setReferralValid(false);
                  }}
                  className="py-2.5 px-5 bg-[#141418] hover:bg-[#1a1a22] text-slate-400 border border-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {editingOrderId ? 'Cancel Edit' : 'Cancel Builder'}
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-700/10 transition cursor-pointer flex items-center gap-1.5 font-sans"
                >
                  <Check className="w-4 h-4" /> {editingOrderId ? 'Update Invoice & Save changes' : 'Finalize Invoice & Save Order'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* 4. Filter Toolbar & Search */}
      <div className="bg-[#0d0d10] p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center shadow" id="sales-filters">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search catalog / order #, customer, or company name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#141418] border border-slate-800 focus:border-violet-500 focus:outline-none rounded-xl text-xs py-2 px-9 text-slate-200 transition"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Payment:</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="bg-[#141418] border border-slate-800 rounded-xl text-[10px] py-1.5 px-2.5 text-slate-300 focus:outline-none focus:border-violet-500"
            >
              <option value="All">All Payments</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
              <option value="Overdue">Overdue</option>
              <option value="Refunded">Refunded</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Fulfillment:</label>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value)}
              className="bg-[#141418] border border-slate-800 rounded-xl text-[10px] py-1.5 px-2.5 text-slate-300 focus:outline-none focus:border-violet-500"
            >
              <option value="All">All Shipments</option>
              <option value="Pending">Pending</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* 5. Transactions Table */}
      <div className="bg-[#0d0d10] border border-slate-800 rounded-2xl shadow overflow-hidden" id="sales-ledgers-wrapper">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[850px]" id="sales-results-table">
            <thead className="bg-[#141418] text-slate-400 uppercase text-[9px] font-bold tracking-widest border-b border-slate-800">
              <tr>
                <th className="p-4">Order Number</th>
                <th className="p-4">Account Partner</th>
                <th className="p-4">Billing Date</th>
                <th className="p-4 text-right">Invoice Sum</th>
                <th className="p-4">Payment Status</th>
                <th className="p-4">Fulfillment</th>
                {currentUser?.role !== 'Referral Team' && <th className="p-4 text-center">Fulfillment Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={currentUser?.role === 'Referral Team' ? 6 : 7} className="p-8 text-center text-slate-500">
                    No sales orders matched active search configurations.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-lime-50 hover:text-slate-900 group transition-colors animate-fadeIn" id={`row-${order.id}`}>
                    <td className="p-4 font-mono font-bold text-violet-400 group-hover:text-violet-850">
                      <div>{order.orderNumber}</div>
                      {order.salesChannel && (
                        <span className="inline-block mt-1 text-[9px] font-sans font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 group-hover:bg-emerald-100 group-hover:text-emerald-800 group-hover:border-emerald-300">
                          {order.salesChannel}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-white group-hover:text-slate-900">{order.customerName}</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5 group-hover:text-slate-600">{order.customerCompany}</div>
                    </td>
                    <td className="p-4 text-slate-305 group-hover:text-slate-700 font-mono text-[11px]">
                      {new Date(order.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="p-4 text-right font-black font-mono text-white group-hover:text-slate-900 text-[13px]">
                      ₹{(order.totalValue ?? 0).toLocaleString()}
                    </td>
                    <td className="p-4">
                      {/* Static Payment Status Badge */}
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold select-none ${
                          order.paymentStatus === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-105 group-hover:text-emerald-805 group-hover:border-emerald-300' :
                          order.paymentStatus === 'Pending' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 group-hover:bg-orange-105 group-hover:text-orange-855 group-hover:border-orange-300' :
                          order.paymentStatus === 'Overdue' ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20 group-hover:bg-rose-105 group-hover:text-rose-805 group-hover:border-rose-300' :
                          'bg-slate-700/10 text-slate-400 border border-slate-700/20'
                        }`}
                      >
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="p-4">
                      {/* Static Delivery Status Badge */}
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold select-none ${
                          order.deliveryStatus === 'Delivered' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-105 group-hover:text-emerald-805' :
                          order.deliveryStatus === 'Shipped' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:bg-indigo-105 group-hover:text-indigo-805' :
                          order.deliveryStatus === 'Pending' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 group-hover:bg-amber-105 group-hover:text-amber-805' :
                          'bg-[#220713] text-rose-400 border border-rose-900/30 group-hover:bg-rose-105 group-hover:text-rose-805'
                        }`}
                      >
                        {order.deliveryStatus}
                      </span>
                    </td>
                    {currentUser?.role !== 'Referral Team' && (
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedInvoice(order)}
                            className="p-2 bg-[#141418] hover:bg-[#1a1a24] text-slate-300 hover:text-white rounded-lg border border-slate-800 transition cursor-pointer flex items-center gap-1 text-[10px] font-bold group-hover:bg-white group-hover:border-slate-300 group-hover:text-slate-800"
                            title="Generate Printed Invoice"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
                            Receipt
                          </button>

                          {hasAccess('Sales Orders', 'edit') && (
                            <button
                              onClick={() => handleEditInvoice(order)}
                              className="p-2 bg-[#141418] hover:bg-[#1a1a24] text-slate-305 hover:text-white rounded-lg border border-slate-800 transition cursor-pointer flex items-center gap-1 text-[10px] font-bold group-hover:bg-white group-hover:border-slate-300 group-hover:text-slate-800 animate-fadeIn"
                              title="Edit Invoice details"
                            >
                              <Edit className="w-3.5 h-3.5 text-violet-400 group-hover:text-violet-600" />
                              Edit
                            </button>
                          )}
   
                          {hasAccess('Sales Orders', 'delete') && (
                            <button
                              onClick={() => setOrderToDelete(order)}
                              className="p-1.5 hover:bg-red-950/20 text-slate-500 hover:text-red-400 rounded-lg transition border border-transparent hover:border-red-900/40 cursor-pointer animate-fadeIn"
                              title="Delete Ledger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Invoice Modal Overlay System */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-[#000]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="invoice-modal-overlay">
          <div className="bg-white text-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-scaleIn select-text">
            
            {/* Header watermarking decoration */}
            <div className="absolute right-0 top-0 w-32 h-32 bg-slate-100 rounded-full translate-x-12 -translate-y-12 shrink-0 select-none pointer-events-none" />

            {/* Back to CRM/Cancel toggle */}
            <button
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-4 right-4 p-2 text-slate-500 hover:bg-slate-100 rounded-full transition cursor-pointer z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Invoice Printable document container */}
            <div className="space-y-6">
              
              {/* Document Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-5">
                <div>
                  <h4 className="text-xl font-black tracking-tight text-violet-700">Leafy Server Enterprise</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold mt-1">Order Fulfillment Invoice</p>
                  <p className="text-[11px] text-slate-605 leading-relaxed mt-2 max-w-xs">
                    Naturescience Custom Formulators Headquarters,<br />
                    Outer Loop Road, Tech Quad, Karnataka, Karnataka 560001
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] bg-violet-100 text-violet-800 px-2 py-0.5 rounded font-black font-mono">ORIGINAL COPY</span>
                  <p className="text-sm font-bold mt-3 font-mono text-slate-800">{selectedInvoice.orderNumber}</p>
                  <p className="text-[11px] text-slate-500 font-mono">Date: {new Date(selectedInvoice.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Bill to Section */}
              {/* Logistical & Billing Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border-y border-slate-150 py-4">
                <div className="space-y-1">
                  <span className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider block">CUSTOMER DETAILS (CRM LINK)</span>
                  <p className="font-bold text-slate-900 text-sm mt-1">{selectedInvoice.customerName}</p>
                  <p className="font-semibold text-slate-600">{selectedInvoice.customerCompany}</p>
                  {selectedInvoice.contactNo && (
                    <p className="text-slate-600 font-mono mt-0.5">Contact No: {selectedInvoice.contactNo}</p>
                  )}
                  {selectedInvoice.referralCode && (
                    <p className="text-slate-500 font-mono text-[10px] mt-1">
                      Verified Referral ID: <strong className="text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded font-black">{selectedInvoice.referralCode}</strong>
                    </p>
                  )}
                </div>

                <div className="space-y-1 text-left md:text-right">
                  <span className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider block">LOGISTICS & FULFILLMENT</span>
                  <div className="flex flex-wrap items-center md:justify-end gap-1.5 mt-1">
                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 text-slate-700 rounded font-bold animate-fadeIn">
                      Platform: <strong className="text-violet-700">{selectedInvoice.orderType || 'Online'} Sales</strong>
                    </span>
                    {selectedInvoice.salesChannel && (
                      <span className="text-[10px] bg-emerald-50 px-2 py-0.5 text-emerald-700 rounded font-bold border border-emerald-100 flex items-center gap-1">
                        Channel: <strong className="text-emerald-600 font-extrabold">{selectedInvoice.salesChannel}</strong>
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${selectedInvoice.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-105 text-orange-800 bg-amber-50'}`}>
                      {selectedInvoice.paymentStatus}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-800">
                      Fulfillment: {selectedInvoice.deliveryStatus}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-left md:text-right mt-2 text-[10px] text-slate-600">
                    <div>
                      <p>Invoice Date: <strong className="text-slate-800 font-mono">{selectedInvoice.invoiceDate || 'N/A'}</strong></p>
                      <p>Pickup Date: <strong className="text-slate-800 font-mono">{selectedInvoice.pickupDate || 'N/A'}</strong></p>
                    </div>
                    <div>
                      <p>Courier: <strong className="text-slate-800">{selectedInvoice.courierAgency || 'N/A'}</strong></p>
                      <p>Charges: <strong className="text-slate-800">₹{(selectedInvoice.courierCharges || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lines table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left font-sans">
                  <thead className="bg-[#f8fafc] border-b border-slate-205 text-slate-500 uppercase text-[9px] font-extrabold tracking-wider">
                    <tr>
                      <th className="p-3 text-center w-12">Sl No</th>
                      <th className="p-3 font-sans">Product Name & Choice SKU</th>
                      <th className="p-3 text-center w-20">Qty</th>
                      <th className="p-3 text-right w-28">Unit Price</th>
                      <th className="p-3 text-right w-28">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {selectedInvoice.products.map((p, idx) => {
                      const gstRate = p.gstPercentage !== undefined ? p.gstPercentage : 18;
                      const unitPrice = p.price;
                      const gstAmountPerUnit = unitPrice * (gstRate / (100 + gstRate));
                      const priceExclGst = unitPrice - gstAmountPerUnit;
                      const totalGst = gstAmountPerUnit * p.quantity;

                      return (
                        <tr key={idx} className="font-medium text-slate-700">
                          <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3">
                            <p className="font-bold text-slate-900">{p.productName}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] text-slate-400 font-mono">SKU reference identifier #{idx+1}</span>
                              <span className="text-[9px] bg-slate-100 text-slate-605 px-1.5 py-0.2 rounded font-mono font-semibold">
                                {gstRate}% GST Incl.
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-600">
                            {p.quantity}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-605">
                            <div>₹{(p.price ?? 0).toLocaleString()}</div>
                            <div className="text-[9px] text-slate-400" title="Subtracted GST tax value">
                              Excl GST: ₹{priceExclGst.toFixed(2)}
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">
                            <div>₹{((p.price ?? 0) * (p.quantity ?? 1)).toLocaleString()}</div>
                            <div className="text-[9px] text-emerald-600 font-medium" title="Calculated GST Amount">
                              GST: ₹{totalGst.toFixed(2)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Grand Total computations */}
              {(() => {
                const invoiceBaseTotal = selectedInvoice.products.reduce((sum, p) => {
                  const gstRate = p.gstPercentage !== undefined ? p.gstPercentage : 18;
                  const gstAmt = (p.price || 0) * (gstRate / (100 + gstRate));
                  return sum + (((p.price || 0) - gstAmt) * (p.quantity || 1));
                }, 0);

                const invoiceGstTotal = selectedInvoice.products.reduce((sum, p) => {
                  const gstRate = p.gstPercentage !== undefined ? p.gstPercentage : 18;
                  const gstAmt = (p.price || 0) * (gstRate / (100 + gstRate));
                  return sum + (gstAmt * (p.quantity || 1));
                }, 0);

                return (
                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <div className="w-64 space-y-2 text-xs font-mono">
                      <div className="flex justify-between text-slate-600">
                        <span>Tax Exclusive Base</span>
                        <span>₹{(invoiceBaseTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>GST Value Pool</span>
                        <span>₹{(invoiceGstTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      {selectedInvoice.courierCharges !== undefined && selectedInvoice.courierCharges > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Charges</span>
                          <span>₹{(selectedInvoice.courierCharges ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                        <span>Invoice Grand Total</span>
                        <span className="text-violet-700 text-base font-black">₹{((invoiceBaseTotal || 0) + (invoiceGstTotal || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Printable terms and footer */}
              <div className="pt-6 border-t border-slate-200 text-center space-y-1 select-none">
                <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest leading-relaxed">Thank you for your valuable business partnership!</p>
                <p className="text-[9px] text-slate-450 leading-relaxed max-w-md mx-auto">This commercial invoice document was electronically compiled and authorized via Leafy Server Enterprise. If you have any inquiries regarding active outstanding balances, please contact accounts@Leafy Server.io.</p>
              </div>

            </div>

            {/* Print trigger button action */}
            <div className="bg-slate-50 p-4 border-t border-slate-150 flex justify-between items-center -mx-6 -mb-6 mt-6">
              <span className="text-[10px] font-mono text-slate-500">Authorized cryptographically VIOSEC-1025C</span>
              <button
                onClick={() => window.print()}
                className="py-1.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow"
              >
                <FileText className="w-3.5 h-3.5" /> Print Invoice copy
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 7. Custom Elegant Delete Confirmation Modal */}
      {orderToDelete && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" id="delete-order-modal">
          <div className="bg-[#141418] border border-slate-800 text-slate-100 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-scaleIn">
            
            {/* Header watermarking decoration */}
            <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/5 rounded-full translate-x-8 -translate-y-8 pointer-events-none" />
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-950/40 border border-red-900/40 flex items-center justify-center text-red-400 shrink-0 font-bold">
                <Trash2 className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1.5 flex-1 text-left animate-slideDown">
                <h3 className="text-base font-extrabold text-white tracking-tight leading-none">Confirm Deletion</h3>
                <p className="text-xs text-slate-450 leading-relaxed">
                  Are you absolutely sure you want to delete invoice register <strong className="text-violet-400 font-mono">{orderToDelete.orderNumber}</strong>?
                </p>
                <div className="bg-[#0e0e11] border border-slate-800 p-3 rounded-lg text-[11px] space-y-1 text-slate-400 font-mono">
                  <div>Customer: <strong className="text-slate-200">{orderToDelete.customerName}</strong></div>
                  <div>Total Billed: <strong className="text-emerald-450">₹{(orderToDelete.totalValue ?? 0).toLocaleString()}</strong></div>
                  <div>Channel: <strong className="text-pink-400">{orderToDelete.salesChannel || 'Shop'}</strong></div>
                </div>
                <p className="text-[10px] text-amber-500 italic font-medium">
                  * Note: product master stockouts, units sold, and revenues will be automatically rolled back & recalculated dynamically. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800/60">
              <button
                onClick={() => setOrderToDelete(null)}
                className="py-1.5 px-3.5 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-lg text-xs font-bold transition border border-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteSalesOrder(orderToDelete.id);
                  setOrderToDelete(null);
                }}
                className="py-1.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-red-950/30 border border-red-800/30 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 8. Custom Elegant Update/Edits Confirmation Modal */}
      {showUpdateConfirm && updatePayload && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" id="update-order-confirm-modal">
          <div className="bg-[#141418] border border-slate-800 text-slate-100 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-scaleIn">
            
            {/* Header watermarking decoration */}
            <div className="absolute right-3.5 top-3.5 w-24 h-24 bg-violet-500/5 rounded-full pointer-events-none" />
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-violet-950/40 border border-violet-900/40 flex items-center justify-center text-violet-400 shrink-0 font-bold">
                <AlertCircle className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1.5 flex-1 text-left">
                <h3 className="text-base font-extrabold text-white tracking-tight leading-none">Confirm Invoice Changes</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Are you sure you want to update and save the changes for this invoice & order?
                </p>
                <div className="bg-[#0e0e11] border border-slate-800 p-3 rounded-lg text-[11px] space-y-1 text-slate-400 font-mono">
                  <div>Customer: <strong className="text-slate-200">{updatePayload.data.customerName}</strong></div>
                  <div>Total Value: <strong className="text-emerald-450 font-black">₹{(updatePayload.data.totalValue ?? 0).toLocaleString()}</strong></div>
                  <div>Payment Status: <span className="text-slate-300 font-medium">{updatePayload.data.paymentStatus}</span></div>
                  <div>Fulfillment Status: <span className="text-slate-300 font-medium">{updatePayload.data.deliveryStatus}</span></div>
                </div>
                <p className="text-[10px] text-amber-500 italic font-medium mt-2">
                  * Note: product level performance and multilevel referral commissions will be automatically recalculated inside the core ledger with pristine accuracy.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800/60 font-sans">
              <button
                type="button"
                onClick={() => {
                  setShowUpdateConfirm(false);
                  setUpdatePayload(null);
                }}
                className="py-1.5 px-3.5 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-lg text-xs font-bold transition border border-slate-800 cursor-pointer"
              >
                No, Keep Editing
              </button>
              <button
                type="button"
                onClick={handleConfirmUpdate}
                className="py-1.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-violet-950/30 border border-violet-800/30 cursor-pointer"
              >
                Yes, Update Invoice
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 9. Custom Elegant Purge All Confirmation Modal */}
      {showPurgeAllConfirm && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" id="purge-all-orders-modal">
          <div className="bg-[#141418] border border-slate-800 text-slate-100 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-scaleIn">
            
            {/* Header watermarking decoration */}
            <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/5 rounded-full translate-x-8 -translate-y-8 pointer-events-none" />
            
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-950/40 border border-red-900/40 flex items-center justify-center text-red-400 shrink-0 font-bold">
                <Trash2 className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1.5 flex-1 text-left">
                <h3 className="text-base font-extrabold text-white tracking-tight leading-none text-red-400">Purge All Invoice Registers</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Are you absolutely sure you want to delete <strong className="text-white font-black">{salesOrders.length}</strong> sales orders?
                </p>
                <div className="bg-[#0e0e11] border border-slate-850 p-3 rounded-xl text-[11px] space-y-1.5 text-slate-400 font-mono">
                  <div className="text-rose-400 font-bold">CRITICAL DESTRUCTIVE ACTION:</div>
                  <div className="flex justify-between">
                    <span>Total Orders:</span>
                    <strong className="text-slate-200">{salesOrders.length}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Revenue:</span>
                    <strong className="text-emerald-400">₹{(totalRevenue ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Linked Commission Tx:</span>
                    <strong className="text-violet-400">Will be permanently deleted</strong>
                  </div>
                </div>
                <p className="text-[10px] text-amber-500 italic font-medium leading-relaxed mt-2">
                  * Note: product master stockouts, units sold, and revenues will be automatically rolled back & recalculated dynamically. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800/60 font-sans">
              <button
                type="button"
                onClick={() => setShowPurgeAllConfirm(false)}
                className="py-1.5 px-3.5 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-lg text-xs font-bold transition border border-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteAllSalesOrders();
                  setShowPurgeAllConfirm(false);
                }}
                className="py-1.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-red-950/30 border border-red-800/30 cursor-pointer"
              >
                Purge All Records
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
