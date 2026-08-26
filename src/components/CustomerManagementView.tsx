import React, { useState } from 'react';
import { useCRM } from '../store';
import { CustomerPerformance } from '../types';
import { 
  Users, UserPlus, Filter, Phone, MapPin, Globe, CreditCard, Star, 
  Trash2, Edit3, Check, X, Search, Map, Compass, Activity, ShieldAlert, CheckCircle2,
  ChevronDown, Gift
} from 'lucide-react';

import { INDIAN_STATES_AND_DISTRICTS, INDIAN_STATES_LIST } from '../data/indianStatesAndDistricts';

export default function CustomerManagementView() {
  const { 
    hasAccess, customers, addCustomer, updateCustomer, deleteCustomer, currentUser, referrals, addCustomAuditLog,
    customerDeliveryAddresses, addCustomerDeliveryAddress, updateCustomerDeliveryAddress, deleteCustomerDeliveryAddress
  } = useCRM();

  // Search and regional filters
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [partnerCodeFilter, setPartnerCodeFilter] = useState('all');

  const getReferralCodeForPartner = (name?: string) => {
    if (!name) return '';
    const found = referrals.find(r => r.name.toLowerCase() === name.toLowerCase());
    return found ? found.referralId : '';
  };

  // Interactive Form visibility
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form input fields
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('');
  const [district, setDistrict] = useState('');
  const [pincode, setPincode] = useState('');
  const [tier, setTier] = useState<'Platinum' | 'Gold' | 'Silver' | 'Bronze'>('Silver');
  const [partnerName, setPartnerName] = useState('');
  const [password, setPassword] = useState('');
  const [onboardingTab, setOnboardingTab] = useState<'profile' | 'addresses'>('profile');
  const [addressManagerCustomer, setAddressManagerCustomer] = useState<CustomerPerformance | null>(null);
  const [deliveryAddressForm, setDeliveryAddressForm] = useState({
    name: '', mobileNumber: '', addressLine: '', city: '', district: '', state: '', pincode: '', isDefault: true
  });
  const deliveryAddressPincodeRef = React.useRef<HTMLInputElement>(null);
  const [isDeliveryPincodeLoading, setIsDeliveryPincodeLoading] = useState(false);
  const [pincodeErrorPopup, setPincodeErrorPopup] = useState<string | null>(null);

  // Auto-set the logged-in partner's name when form opens or user changes
  React.useEffect(() => {
    if (currentUser && currentUser.role === 'Referral Team') {
      setPartnerName(currentUser.name);
    } else {
      setPartnerName('');
    }
  }, [currentUser, isAdding]);

  // Validation constraint feedback state
  const [validationError, setValidationError] = useState<string | null>(null);

  // Search & drop-down combobox visibility for Onboard Customer
  const [stateSearchText, setStateSearchText] = useState('');
  const [isStateOpen, setIsStateOpen] = useState(false);
  const [districtSearchText, setDistrictSearchText] = useState('');
  const [isDistrictOpen, setIsDistrictOpen] = useState(false);

  // Search & drop-down combobox visibility for Edit Customer
  const [editStateSearchText, setEditStateSearchText] = useState('');
  const [isEditStateOpen, setIsEditStateOpen] = useState(false);
  const [editDistrictSearchText, setEditDistrictSearchText] = useState('');
  const [isEditDistrictOpen, setIsEditDistrictOpen] = useState(false);

  // Refs for click outside handling
  const stateOnboardRef = React.useRef<HTMLDivElement>(null);
  const districtOnboardRef = React.useRef<HTMLDivElement>(null);
  const editStateRef = React.useRef<HTMLDivElement>(null);
  const editDistrictRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (stateOnboardRef.current && !stateOnboardRef.current.contains(event.target as Node)) {
        setIsStateOpen(false);
      }
      if (districtOnboardRef.current && !districtOnboardRef.current.contains(event.target as Node)) {
        setIsDistrictOpen(false);
      }
      if (editStateRef.current && !editStateRef.current.contains(event.target as Node)) {
        setIsEditStateOpen(false);
      }
      if (editDistrictRef.current && !editDistrictRef.current.contains(event.target as Node)) {
        setIsEditDistrictOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Edit fields backup states
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editState, setEditState] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editPincode, setEditPincode] = useState('');
  const [editTier, setEditTier] = useState<'Platinum' | 'Gold' | 'Silver' | 'Bronze'>('Silver');
  const [editPartnerName, setEditPartnerName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editValError, setEditValError] = useState<string | null>(null);

  const [isPincodeLoading, setIsPincodeLoading] = useState(false);
  const [pincodeLookupMessage, setPincodeLookupMessage] = useState('');
  const [isEditPincodeLoading, setIsEditPincodeLoading] = useState(false);
  const [editPincodeLookupMessage, setEditPincodeLookupMessage] = useState('');

  React.useEffect(() => {
    if (pincode && pincode.length === 6) {
      const fetchPincodeDetails = async () => {
        setIsPincodeLoading(true);
        setPincodeLookupMessage('Fetching PIN info...');
        try {
          const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
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
                setStateName(matchedState);
                setStateSearchText(matchedState);

                const districtsList = INDIAN_STATES_AND_DISTRICTS[matchedState] || [];
                const matchedDistrict = districtsList.find(dst => 
                  dst.toLowerCase().replace(/[^a-z]/g, '') === apiDistrict.toLowerCase().replace(/[^a-z]/g, '') ||
                  dst.toLowerCase() === apiDistrict.toLowerCase()
                ) || districtsList[0];

                if (matchedDistrict) {
                  setDistrict(matchedDistrict);
                  setDistrictSearchText(matchedDistrict);
                }
                setPincodeLookupMessage('PIN matches!');
                setIsPincodeLoading(false);
                return;
              }
            }
          }
        } catch (error) {
          console.warn('Pincode fetch error, falling back locally:', error);
        }

        // --- Local fallback block ---
        const firstDigit = pincode[0];
        let fallbackState = '';
        let fallbackDistrict = '';

        if (pincode === '110001') {
          fallbackState = 'Delhi';
          fallbackDistrict = 'New Delhi';
        } else if (pincode === '400001') {
          fallbackState = 'Maharashtra';
          fallbackDistrict = 'Mumbai';
        } else if (pincode === '682011') {
          fallbackState = 'Kerala';
          fallbackDistrict = 'Ernakulam';
        } else if (pincode === '600001') {
          fallbackState = 'Tamil Nadu';
          fallbackDistrict = 'Chennai';
        } else if (pincode === '560001') {
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
            setStateName(matchedState);
            setStateSearchText(matchedState);
            const districtsList = INDIAN_STATES_AND_DISTRICTS[matchedState] || [];
            const matchedDistrict = districtsList.find(dst => dst.toLowerCase() === fallbackDistrict.toLowerCase()) || districtsList[0];
            if (matchedDistrict) {
              setDistrict(matchedDistrict);
              setDistrictSearchText(matchedDistrict);
              setPincodeLookupMessage('Matched locally');
            }
          }
        } else {
          setPincodeLookupMessage('Not found, fill manually');
        }
        setIsPincodeLoading(false);
      };

      fetchPincodeDetails();
    } else {
      setPincodeLookupMessage('');
    }
  }, [pincode]);

  React.useEffect(() => {
    if (editPincode && editPincode.length === 6) {
      const fetchEditPincodeDetails = async () => {
        setIsEditPincodeLoading(true);
        setEditPincodeLookupMessage('Fetching PIN info...');
        try {
          const response = await fetch(`https://api.postalpincode.in/pincode/${editPincode}`);
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
                setEditState(matchedState);
                setEditStateSearchText(matchedState);

                const districtsList = INDIAN_STATES_AND_DISTRICTS[matchedState] || [];
                const matchedDistrict = districtsList.find(dst => 
                  dst.toLowerCase().replace(/[^a-z]/g, '') === apiDistrict.toLowerCase().replace(/[^a-z]/g, '') ||
                  dst.toLowerCase() === apiDistrict.toLowerCase()
                ) || districtsList[0];

                if (matchedDistrict) {
                  setEditDistrict(matchedDistrict);
                  setEditDistrictSearchText(matchedDistrict);
                }
                setEditPincodeLookupMessage('PIN matches!');
                setIsEditPincodeLoading(false);
                return;
              }
            }
          }
        } catch (error) {
          console.warn('Edit pincode fetch error:', error);
        }

        // Local fallback
        const firstDigit = editPincode[0];
        let fallbackState = '';
        let fallbackDistrict = '';

        if (editPincode === '110001') {
          fallbackState = 'Delhi';
          fallbackDistrict = 'New Delhi';
        } else if (editPincode === '400001') {
          fallbackState = 'Maharashtra';
          fallbackDistrict = 'Mumbai';
        } else if (editPincode === '682011') {
          fallbackState = 'Kerala';
          fallbackDistrict = 'Ernakulam';
        } else if (editPincode === '600001') {
          fallbackState = 'Tamil Nadu';
          fallbackDistrict = 'Chennai';
        } else if (editPincode === '560001') {
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
            setEditState(matchedState);
            setEditStateSearchText(matchedState);
            const districtsList = INDIAN_STATES_AND_DISTRICTS[matchedState] || [];
            const matchedDistrict = districtsList.find(dst => dst.toLowerCase() === fallbackDistrict.toLowerCase()) || districtsList[0];
            if (matchedDistrict) {
              setEditDistrict(matchedDistrict);
              setEditDistrictSearchText(matchedDistrict);
              setEditPincodeLookupMessage('Matched locally');
            }
          }
        } else {
          setEditPincodeLookupMessage('Not found');
        }
        setIsEditPincodeLoading(false);
      };

      fetchEditPincodeDetails();
    } else {
      setEditPincodeLookupMessage('');
    }
  }, [editPincode]);

  // Unique key constraint verification helper
  // Under requirements, Mobile number is a unique key.
  // We'll prevent adding or editing to duplicate mobile number.
  const validateUniqueConstraint = (targetName: string, targetMobile: string, excludeId?: string): boolean => {
    const normMobile = targetMobile.replace(/\D/g, '');

    for (const c of customers) {
      if (excludeId && c.id === excludeId) continue;
      
      const existingMobile = c.mobileNumber.replace(/\D/g, '');

      if (existingMobile === normMobile) {
        setValidationError(`Database conflict: Mobile Number "${targetMobile}" is already assigned to a profile.`);
        setEditValError(`Database conflict: Mobile Number "${targetMobile}" is already assigned to a profile.`);
        return false;
      }
    }
    setValidationError(null);
    setEditValError(null);
    return true;
  };

  // Form handlers
  const handleAddNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAccess('Customer Directory', 'create')) return;

    if (!name.trim() || !mobileNumber.trim()) {
      setValidationError('Customer Name and Mobile Number are required and act as unique identifiers.');
      return;
    }

    if (!validateUniqueConstraint(name, mobileNumber)) {
      return;
    }

    let generatedCustomerId = '';
    do {
      generatedCustomerId = `CUS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    } while (customers.some(customer => customer.customerId === generatedCustomerId));
    const created = await addCustomer({
      customerId: generatedCustomerId,
      name: name.trim(),
      company: company.trim() || 'Individual',
      email: email.trim() || 'n/a',
      mobileNumber: mobileNumber.trim(),
      address: address.trim(),
      state: stateName.trim() || 'N/A',
      district: district.trim() || 'N/A',
      pincode: pincode.trim() || 'N/A',
      totalSpent: 0,
      dealsClosed: 0,
      satisfactionScore: 5.0,
      lastOrderDate: new Date().toISOString().split('T')[0],
      tier: tier,
      partnerName: partnerName.trim() || undefined,
      password: password.trim() || '1234'
    });

    if (created && address.trim()) {
      await addCustomerDeliveryAddress({
        customerId: generatedCustomerId,
        name: name.trim(),
        mobileNumber: mobileNumber.trim(),
        addressLine: address.trim(),
        city: district.trim() || 'N/A',
        district: district.trim() || 'N/A',
        state: stateName.trim() || 'N/A',
        pincode: pincode.trim() || 'N/A',
        isDefault: true
      });
    }

    // Reset fields
    setName('');
    setCompany('');
    setEmail('');
    setMobileNumber('');
    setAddress('');
    setStateName('');
    setDistrict('');
    setPincode('');
    setTier('Silver');
    setPassword('');
    setOnboardingTab('profile');
    if (currentUser && currentUser.role === 'Referral Team') {
      setPartnerName(currentUser.name);
    } else {
      setPartnerName('');
    }
    setIsAdding(false);
    setValidationError(null);
  };

  const openAddressManager = (customer: CustomerPerformance) => {
    setAddressManagerCustomer(customer);
    setDeliveryAddressForm({
      name: customer.name,
      mobileNumber: customer.mobileNumber,
      addressLine: '',
      city: '',
      district: '',
      state: '',
      pincode: '',
      isDefault: customerDeliveryAddresses.filter(address => address.mobileNumber === customer.mobileNumber || address.customerId === (customer.customerId || customer.id)).length === 0
    });
    setPincodeErrorPopup(null);
  };

  const handleDeliveryPincodeBlur = async () => {
    const pin = deliveryAddressForm.pincode.trim();
    if (!pin) return;

    if (pin.length !== 6) {
      setPincodeErrorPopup("Invalid PIN code. PIN code must be exactly 6 digits.");
      setDeliveryAddressForm(prev => ({ ...prev, district: '', state: '' }));
      setTimeout(() => deliveryAddressPincodeRef.current?.focus(), 100);
      return;
    }

    setIsDeliveryPincodeLoading(true);
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
          const postOffice = data[0].PostOffice[0];
          const apiState = postOffice.State || '';
          const apiDistrict = postOffice.District || '';

          const matchedState = INDIAN_STATES_LIST.find(st => 
            st.toLowerCase().replace(/[^a-z]/g, '') === apiState.toLowerCase().replace(/[^a-z]/g, '') ||
            st.toLowerCase() === apiState.toLowerCase()
          ) || apiState;

          const districtsList = INDIAN_STATES_AND_DISTRICTS[matchedState] || [];
          const matchedDistrict = districtsList.find(dst => 
            dst.toLowerCase().replace(/[^a-z]/g, '') === apiDistrict.toLowerCase().replace(/[^a-z]/g, '') ||
            dst.toLowerCase() === apiDistrict.toLowerCase()
          ) || apiDistrict;

          setDeliveryAddressForm(prev => ({
            ...prev,
            district: matchedDistrict,
            state: matchedState
          }));
        } else {
          setPincodeErrorPopup("Invalid PIN code. State and district details could not be found.");
          setDeliveryAddressForm(prev => ({ ...prev, district: '', state: '' }));
          setTimeout(() => deliveryAddressPincodeRef.current?.focus(), 100);
        }
      } else {
        setPincodeErrorPopup("Invalid PIN code or service unavailable. Please check the PIN code.");
        setDeliveryAddressForm(prev => ({ ...prev, district: '', state: '' }));
        setTimeout(() => deliveryAddressPincodeRef.current?.focus(), 100);
      }
    } catch (err) {
      setPincodeErrorPopup("Error validating PIN code. Please enter a valid 6-digit PIN code.");
      setDeliveryAddressForm(prev => ({ ...prev, district: '', state: '' }));
      setTimeout(() => deliveryAddressPincodeRef.current?.focus(), 100);
    } finally {
      setIsDeliveryPincodeLoading(false);
    }
  };

  const handleAddDeliveryAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressManagerCustomer || !deliveryAddressForm.addressLine.trim() || !deliveryAddressForm.pincode.trim()) return;
    if (deliveryAddressForm.pincode.trim().length !== 6) {
      setPincodeErrorPopup("PIN code must be exactly 6 digits.");
      setTimeout(() => deliveryAddressPincodeRef.current?.focus(), 100);
      return;
    }
    await addCustomerDeliveryAddress({
      ...deliveryAddressForm,
      customerId: addressManagerCustomer.customerId || addressManagerCustomer.id,
      name: deliveryAddressForm.name.trim(),
      mobileNumber: deliveryAddressForm.mobileNumber.trim(),
      addressLine: deliveryAddressForm.addressLine.trim(),
      city: deliveryAddressForm.city.trim(),
      district: deliveryAddressForm.district.trim(),
      state: deliveryAddressForm.state.trim(),
      pincode: deliveryAddressForm.pincode.trim()
    });
    setDeliveryAddressForm(prev => ({
      ...prev,
      addressLine: '',
      city: '',
      district: '',
      state: '',
      pincode: '',
      isDefault: false
    }));
  };

  const handleStartEditing = (c: CustomerPerformance) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditCompany(c.company);
    setEditEmail(c.email);
    setEditMobile(c.mobileNumber);
    setEditAddress(c.address);
    setEditState(c.state);
    setEditDistrict(c.district);
    setEditPincode(c.pincode || '');
    setEditTier(c.tier);
    setEditPartnerName(c.partnerName || '');
    setEditPassword(c.password || '1234');
    setEditValError(null);
  };

  const handleSaveUpdate = (id: string) => {
    if (!hasAccess('Customer Directory', 'edit')) return;

    if (!editName.trim() || !editMobile.trim()) {
      setEditValError('Customer Name and Mobile Number are required.');
      return;
    }

    if (!validateUniqueConstraint(editName, editMobile, id)) {
      return;
    }

    updateCustomer(id, {
      name: editName.trim(),
      company: editCompany.trim(),
      email: editEmail.trim(),
      mobileNumber: editMobile.trim(),
      address: editAddress.trim(),
      state: editState.trim(),
      district: editDistrict.trim(),
      pincode: editPincode.trim(),
      tier: editTier,
      partnerName: editPartnerName.trim() || undefined,
      password: editPassword.trim() || '1234'
    });

    setEditingId(null);
    setEditValError(null);
  };

  const [customerToDelete, setCustomerToDelete] = useState<CustomerPerformance | null>(null);

  const handleDeleteProfile = (cust: CustomerPerformance) => {
    setCustomerToDelete(cust);
  };

  // Get list of unique States in the DB for filter select options
  const existingStates = Array.from(new Set(customers.map(c => c.state).filter(Boolean)));

  // Filter & Search Implementation
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.mobileNumber.includes(searchTerm) ||
      c.district.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.state.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.pincode && c.pincode.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesState = stateFilter === 'all' || c.state === stateFilter;
    const matchesTier = tierFilter === 'all' || c.tier === tierFilter;
    const matchesPartnerCode = partnerCodeFilter === 'all' || getReferralCodeForPartner(c.partnerName) === partnerCodeFilter;

    return matchesSearch && matchesState && matchesTier && matchesPartnerCode;
  });

  // Simple statistics counters
  const totalSpendSum = filteredCustomers.reduce((acc, c) => acc + (c.totalSpent || 0), 0);
  const avgSatisfaction = filteredCustomers.length > 0 
    ? (filteredCustomers.reduce((acc, c) => acc + (c.satisfactionScore || 5), 0) / filteredCustomers.length).toFixed(1)
    : '5.0';

  return (
    <div className="space-y-6" id="customer-management-view">
      {addressManagerCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#111114] border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Delivery Addresses</h3>
                <p className="text-[10px] text-slate-500 mt-1">{addressManagerCustomer.name} · {addressManagerCustomer.customerId}</p>
              </div>
              <button type="button" onClick={() => setAddressManagerCustomer(null)} className="p-1.5 text-slate-400 hover:text-white" title="Close address manager"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              {customerDeliveryAddresses.filter(address => address.mobileNumber === addressManagerCustomer.mobileNumber || address.customerId === (addressManagerCustomer.customerId || addressManagerCustomer.id)).map(address => (
                <div key={address.id} className="flex items-start justify-between gap-3 p-3 bg-[#141418] border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-300">
                    <div className="font-bold text-white">{address.name} {address.isDefault && <span className="text-emerald-400 text-[9px] uppercase ml-2">Default</span>}</div>
                    <div className="mt-1">{address.addressLine}, {address.city ? `${address.city}, ` : ''}{address.district}, {address.state} - {address.pincode}</div>
                    <div className="text-slate-500 mt-1">{address.mobileNumber}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {!address.isDefault && <button type="button" onClick={() => updateCustomerDeliveryAddress(address.id, { isDefault: true })} className="text-[10px] text-indigo-400 hover:text-indigo-300">Make default</button>}
                    <button type="button" onClick={() => deleteCustomerDeliveryAddress(address.id)} className="text-[10px] text-rose-400 hover:text-rose-300">Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddDeliveryAddress} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-800 pt-4">
              <input value={deliveryAddressForm.name} onChange={e => setDeliveryAddressForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Recipient name" required className="p-2.5 bg-[#141418] border border-slate-800 rounded-xl text-xs text-slate-200" />
              <input value={deliveryAddressForm.mobileNumber} onChange={e => setDeliveryAddressForm(prev => ({ ...prev, mobileNumber: e.target.value }))} placeholder="Mobile number" required className="p-2.5 bg-[#141418] border border-slate-800 rounded-xl text-xs text-slate-200" />
              <input value={deliveryAddressForm.addressLine} onChange={e => setDeliveryAddressForm(prev => ({ ...prev, addressLine: e.target.value }))} placeholder="Full delivery address" required className="sm:col-span-2 p-2.5 bg-[#141418] border border-slate-800 rounded-xl text-xs text-slate-200" />
              <input value={deliveryAddressForm.city} onChange={e => setDeliveryAddressForm(prev => ({ ...prev, city: e.target.value }))} placeholder="City" className="sm:col-span-2 p-2.5 bg-[#141418] border border-slate-800 rounded-xl text-xs text-slate-200" />
              <div className="sm:col-span-2 relative">
                <input
                  ref={deliveryAddressPincodeRef}
                  value={deliveryAddressForm.pincode}
                  onChange={e => setDeliveryAddressForm(prev => ({ ...prev, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  onBlur={handleDeliveryPincodeBlur}
                  placeholder="PIN code (6 digits)"
                  required
                  maxLength={6}
                  className="w-full p-2.5 bg-[#141418] border border-slate-800 rounded-xl text-xs text-slate-200"
                />
                {isDeliveryPincodeLoading && (
                  <span className="absolute right-3 top-2.5 text-[10px] text-indigo-400 animate-pulse">Checking PIN...</span>
                )}
              </div>
              <input value={deliveryAddressForm.district} placeholder="District" disabled readOnly className="p-2.5 bg-[#0d0d10] border border-slate-800/80 rounded-xl text-xs text-slate-400 cursor-not-allowed opacity-75" />
              <input value={deliveryAddressForm.state} placeholder="State" disabled readOnly className="p-2.5 bg-[#0d0d10] border border-slate-800/80 rounded-xl text-xs text-slate-400 cursor-not-allowed opacity-75" />
              <label className="flex items-center gap-2 text-xs text-slate-300 sm:col-span-2"><input type="checkbox" checked={deliveryAddressForm.isDefault} onChange={e => setDeliveryAddressForm(prev => ({ ...prev, isDefault: e.target.checked }))} /> Set as default address</label>
              <button type="submit" className="sm:col-span-2 justify-self-end px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold">Add Delivery Address</button>
            </form>
          </div>
        </div>
      )}
      {pincodeErrorPopup && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#18181c] border border-rose-800/80 rounded-2xl p-5 max-w-sm w-full space-y-3 shadow-2xl text-center">
            <div className="text-rose-500 font-bold text-sm">PIN Code Error</div>
            <p className="text-xs text-slate-300">{pincodeErrorPopup}</p>
            <button
              type="button"
              onClick={() => {
                setPincodeErrorPopup(null);
                setTimeout(() => deliveryAddressPincodeRef.current?.focus(), 50);
              }}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {/* Custom Confirmation Modal for Deleting Customers */}
      {customerToDelete && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-[#0f0f12] border-2 border-rose-950/80 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative" id="delete-confirmation-dialog">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-rose-950/50 border border-rose-900/50 flex items-center justify-center text-rose-500 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="text-sm font-bold text-white tracking-widest uppercase">
                  Purge Profile Record
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Are you absolutely sure you want to permanently delete the customer account profile for <strong className="text-white">"{customerToDelete.name}"</strong>?
                </p>
                {customerToDelete.company && (
                  <p className="text-[11px] text-slate-400">
                    Company: <strong className="text-slate-300">{customerToDelete.company}</strong>
                  </p>
                )}
                <div className="bg-rose-950/20 border border-slate-800/80 rounded-xl p-3 text-[10px] text-rose-300 leading-normal space-y-1">
                  <div>⚠️ <strong>Cascading Profile & Linked Records Purge:</strong></div>
                  <div>• Linked <strong>index table</strong> entries will be deleted.</div>
                  <div>• Linked <strong>delivery address table</strong> records will be deleted.</div>
                  <div>• Linked <strong>referral link table</strong> records will be deleted.</div>
                  <div>• Associated referral ID & referral name references in downlines will be cleared (emptied).</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                onClick={() => setCustomerToDelete(null)}
                type="button"
                className="px-4 py-2 hover:bg-slate-900 text-slate-400 hover:text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const targetId = customerToDelete.id;
                  setCustomerToDelete(null);
                  await deleteCustomer(targetId);
                }}
                type="button"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                id="confirm-delete-customer-btn"
              >
                <Check className="w-3.5 h-3.5" />
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 1. Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-sm font-extrabold text-white tracking-widest uppercase flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Core Client Ledger & Customer Directory
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Enforce unified record-keeping with unique Customer Profile matching controls. Name & Mobile keys are uniquely indexed.
          </p>
        </div>

        {hasAccess('Customer Directory', 'create') && (
          <button
            onClick={() => {
              setIsAdding(!isAdding);
              setValidationError(null);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition duration-150 cursor-pointer"
            id="register-new-customer-btn"
          >
            {isAdding ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span>{isAdding ? 'Close Portal' : 'Register New Customer'}</span>
          </button>
        )}
      </div>

      {/* 2. Top Analytical Mini Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="customers-stats-grid">
        {/* KPI: Total Managed Contacts */}
        <div className="bg-[#111114] border border-slate-800/80 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-950/50 border border-indigo-900/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Total Registers</span>
            <span className="text-xl font-extrabold text-white mt-0.5 block">{filteredCustomers.length} Accounts</span>
          </div>
        </div>

        {/* KPI: State-Wise Footprints */}
        <div className="bg-[#111114] border border-slate-800/80 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-950/50 border border-violet-900/40 flex items-center justify-center text-violet-400 shrink-0">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Geographic States</span>
            <span className="text-xl font-extrabold text-white mt-0.5 block">{existingStates.length} Regions</span>
          </div>
        </div>

        {/* KPI: Total Commerce Capital */}
        <div className="bg-[#111114] border border-slate-800/80 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/50 border border-emerald-900/40 flex items-center justify-center text-emerald-400 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Accumulated Spent</span>
            <span className="text-xl font-extrabold text-emerald-400 mt-0.5 block font-mono">₹{(totalSpendSum ?? 0).toLocaleString()}</span>
          </div>
        </div>

        {/* KPI: Sentiment Rating */}
        <div className="bg-[#111114] border border-slate-800/80 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-950/50 border border-amber-900/40 flex items-center justify-center text-amber-400 shrink-0">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Satisfaction Factor</span>
            <span className="text-xl font-extrabold text-white mt-0.5 block">{avgSatisfaction} / 5.0</span>
          </div>
        </div>
      </div>

      {/* 3. Collapsible Customer Generation Form (Includes Unique and Required checks) */}
      {isAdding && (
        <div className="bg-[#bdbddb] border-2 border-indigo-950/70 p-5 rounded-2xl space-y-4 animate-slideIn" id="add-customer-portal">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2.5">
            <UserPlus className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Onboard New Customer Account Profile</h3>
          </div>

          <div className="flex gap-1 border-b border-slate-800 pb-2">
            <button type="button" onClick={() => setOnboardingTab('profile')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase ${onboardingTab === 'profile' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Profile</button>
            <button type="button" onClick={() => setOnboardingTab('addresses')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase ${onboardingTab === 'addresses' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Delivery Addresses</button>
          </div>

          {validationError && (
            <div className="p-3 bg-rose-950/30 border border-rose-900 h-auto rounded-lg flex items-start gap-2.5 text-xs text-rose-400" id="validation-alert">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>{validationError}</div>
            </div>
          )}

          {onboardingTab === 'profile' && <form onSubmit={handleAddNewCustomer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {/* Required unique-safe field: Name */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                Customer Full Name <span className="text-indigo-400 font-black">*</span>:
              </label>
              <input 
                type="text" 
                placeholder="e.g. Johnathan Doe" 
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setValidationError(null);
                }}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Required Unique field: Mobile Number */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                Mobile Number <span className="text-indigo-400 font-black">*</span> (Unique Key):
              </label>
              <input 
                type="text" 
                placeholder="e.g. +91 9876543210" 
                value={mobileNumber}
                onChange={e => {
                  setMobileNumber(e.target.value);
                  setValidationError(null);
                }}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Company */}
            <div>
              <label className="block text-[10px] font-bold text-slate-505 mb-1.5 uppercase tracking-wider">Company Branch / Store Name:</label>
              <input 
                type="text" 
                placeholder="e.g. Acme Retailers (Optional)" 
                value={company}
                onChange={e => setCompany(e.target.value)}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[10px] font-bold text-slate-505 mb-1.5 uppercase tracking-wider">Corporate Email Address:</label>
              <input 
                type="email" 
                placeholder="e.g. jdoe@acme.com" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none"
              />
            </div>

            {/* PIN Code */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] font-bold text-slate-505 uppercase tracking-wider">PIN Code:</label>
                {pincodeLookupMessage && (
                  <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded transition-all duration-200 ${
                    pincodeLookupMessage.includes('matches') || pincodeLookupMessage.includes('locally')
                      ? 'text-emerald-400 bg-emerald-950/30 border border-emerald-900/40'
                      : pincodeLookupMessage.includes('Fetching')
                      ? 'text-amber-400 bg-amber-955/20 border border-amber-900/30 animate-pulse'
                      : 'text-slate-400 bg-slate-900/50'
                  }`}>
                    {pincodeLookupMessage}
                  </span>
                )}
              </div>
              <input 
                type="text" 
                maxLength={6}
                placeholder="e.g. 682011" 
                value={pincode}
                onChange={e => setPincode(e.target.value.replace(/\D/g, ''))}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* State Region Combobox Selection */}
            <div className="relative" ref={stateOnboardRef}>
              <label className="block text-[10px] font-bold text-slate-505 mb-1.5 uppercase tracking-wider">State Region:</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="-- Search & Select State --" 
                  value={isStateOpen ? stateSearchText : stateName}
                  onChange={e => {
                    setStateSearchText(e.target.value);
                    setIsStateOpen(true);
                  }}
                  onFocus={() => {
                    setStateSearchText(stateName);
                    setIsStateOpen(true);
                  }}
                  className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs pr-8"
                />
                <button
                  type="button"
                  onClick={() => setIsStateOpen(!isStateOpen)}
                  className="absolute right-2.5 top-3 text-slate-500 hover:text-slate-300"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isStateOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {isStateOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#0d0d10] border border-slate-800 rounded-xl shadow-2xl divide-y divide-slate-850">
                  {INDIAN_STATES_LIST.filter(st => st.toLowerCase().includes(stateSearchText.toLowerCase())).length === 0 ? (
                    <div className="p-2.5 text-xs text-slate-500 italic">No matching states found</div>
                  ) : (
                    INDIAN_STATES_LIST.filter(st => st.toLowerCase().includes(stateSearchText.toLowerCase())).map(st => (
                      <button
                        type="button"
                        key={st}
                        onMouseDown={() => {
                          setStateName(st);
                          setStateSearchText(st);
                          setIsStateOpen(false);
                          // Reset District
                          setDistrict('');
                          setDistrictSearchText('');
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-950/40 text-slate-300 transition ${
                          stateName === st ? 'bg-indigo-950/20 text-white font-bold' : ''
                        }`}
                      >
                        {st}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* District Combobox Selection */}
            <div className="relative" ref={districtOnboardRef}>
              <label className="block text-[10px] font-bold text-slate-505 mb-1.5 uppercase tracking-wider">District:</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder={stateName ? "-- Search & Select District --" : "Select State First"} 
                  disabled={!stateName}
                  value={stateName ? (isDistrictOpen ? districtSearchText : district) : ''}
                  onChange={e => {
                    setDistrictSearchText(e.target.value);
                    setIsDistrictOpen(true);
                  }}
                  onFocus={() => {
                    setDistrictSearchText(district);
                    setIsDistrictOpen(true);
                  }}
                  className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs pr-8 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  disabled={!stateName}
                  onClick={() => setIsDistrictOpen(!isDistrictOpen)}
                  className="absolute right-2.5 top-3 text-slate-500 hover:text-slate-300 disabled:opacity-50"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDistrictOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {isDistrictOpen && stateName && (
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#0d0d10] border border-slate-800 rounded-xl shadow-2xl divide-y divide-slate-850">
                  {((INDIAN_STATES_AND_DISTRICTS[stateName] || []).filter(dst => dst.toLowerCase().includes(districtSearchText.toLowerCase()))).length === 0 ? (
                    <div className="p-2.5 text-xs text-slate-500 italic">No matching districts found</div>
                  ) : (
                    (INDIAN_STATES_AND_DISTRICTS[stateName] || []).filter(dst => dst.toLowerCase().includes(districtSearchText.toLowerCase())).map(dst => (
                      <button
                        type="button"
                        key={dst}
                        onMouseDown={() => {
                          setDistrict(dst);
                          setDistrictSearchText(dst);
                          setIsDistrictOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-950/40 text-slate-300 transition ${
                          district === dst ? 'bg-indigo-950/20 text-white font-bold' : ''
                        }`}
                      >
                        {dst}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Full Street Address */}
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-505 mb-1.5 uppercase tracking-wider">Full Geographic Address Destination:</label>
              <input 
                type="text" 
                placeholder="e.g. Door No. 45-B, MG Road, opposite Grand Mall" 
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none"
              />
            </div>

            {/* Loyalty Tier Selection */}
            <div>
              <label className="block text-[10px] font-bold text-slate-505 mb-1.5 uppercase tracking-wider">Classification Level:</label>
              <select 
                value={tier}
                onChange={e => setTier(e.target.value as any)}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none"
              >
                <option value="Platinum">👑 Platinum Account</option>
                <option value="Gold">⭐️ Gold Account</option>
                <option value="Silver">🔘 Silver Account</option>
                <option value="Bronze">🍂 Bronze Account</option>
              </select>
            </div>

            {/* Referral Partner Section */}
            <div>
              <label className="block text-[10px] font-bold text-slate-505 mb-1.5 uppercase tracking-wider">
                Referral Partner Name {currentUser.role !== 'Admin' && <span className="text-slate-500 font-normal italic text-[8.5px]">(Admin Only)</span>}:
              </label>
              <select 
                value={partnerName}
                onChange={e => setPartnerName(e.target.value)}
                disabled={currentUser.role !== 'Admin'}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-505 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">-- No Direct Referral Partner --</option>
                {referrals.map(ref => (
                  <option key={ref.id} value={ref.name}>
                    {ref.name} ({ref.mobileNumber || 'No mobile'})
                  </option>
                ))}
                {currentUser.role === 'Referral Team' && !referrals.some(ref => ref.name === currentUser.name) && (
                  <option value={currentUser.name}>
                    {currentUser.name} (Logged in Referral - You)
                  </option>
                )}
              </select>
            </div>

            {/* Password / Security Code Field */}
            <div>
              <label className="block text-[10px] font-bold text-slate-505 mb-1.5 uppercase tracking-wider">
                Security Password / Access Code:
              </label>
              <input 
                type="text" 
                placeholder="Default: 1234" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-505"
              />
            </div>

            {/* Action buttons */}
            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 font-semibold rounded-xl text-xs transition duration-150 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs transition duration-150 shadow shadow-indigo-600/10 cursor-pointer"
              >
                Onboard Customer
              </button>
            </div>
          </form>}
          {onboardingTab === 'addresses' && (
            <div className="p-4 border border-slate-800 rounded-xl bg-[#141418] text-xs text-slate-300 space-y-2">
              <p className="font-bold text-white">The profile address becomes the default delivery address when the customer is onboarded.</p>
              <p>After registration, use the address-book action in the customer ledger to add multiple delivery addresses and change the default.</p>
              <button type="button" onClick={() => setOnboardingTab('profile')} className="mt-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] font-bold uppercase">Return to Profile</button>
            </div>
          )}
        </div>
      )}

      {/* 4. Directory Filtration Bar */}
      <div className="bg-[#111114] p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-4 items-stretch justify-between" id="search-filter-belt">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search directory by Name, Mobile, Address, District, or State..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#141418] border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="absolute right-3 top-3 text-[10px] text-slate-500 hover:text-white uppercase font-bold"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filters select block */}
        <div className="flex gap-2.5 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#141418] border border-slate-800 rounded-xl px-3 py-1.5">
            <Gift className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={partnerCodeFilter}
              onChange={e => setPartnerCodeFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-350 focus:outline-none font-medium cursor-pointer"
            >
              <option value="all">All Partner Codes</option>
              {referrals.map(ref => (
                <option key={ref.id} value={ref.referralId}>
                  {ref.referralId} ({ref.name})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#141418] border border-slate-800 rounded-xl px-3 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-350 focus:outline-none font-medium cursor-pointer"
            >
              <option value="all">All States</option>
              {existingStates.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#141418] border border-slate-800 rounded-xl px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-350 focus:outline-none font-medium cursor-pointer"
            >
              <option value="all">All Tiers</option>
              <option value="Platinum">👑 Platinum</option>
              <option value="Gold">⭐️ Gold</option>
              <option value="Silver">🔘 Silver</option>
              <option value="Bronze">🍂 Bronze</option>
            </select>
          </div>
        </div>
      </div>

      {/* 5. Directory Ledger Table (Supports inline edits & unique constraints) */}
      <div className="bg-[#111114] border border-slate-800 rounded-2xl overflow-hidden" id="customer-ledger-table-wrapper">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0e0e11] text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800">
                <th className="p-4 pl-5">Client Profile Identity</th>
                <th className="p-4">Contact Coordinates</th>
                <th className="p-4">Geographic Boundaries (District, State, PIN)</th>
                <th className="p-4">Physical Destination Address</th>
                <th className="p-4 text-center">Score Factor</th>
                <th className="p-4">Total Sales</th>
                <th className="p-4">Loyalty Tier</th>
                <th className="p-4 text-right pr-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs text-slate-300">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500">
                    <Activity className="w-6 h-6 mx-auto animate-pulse text-indigo-500/20 mb-2" />
                    No customers found matching directory filters. 
                    {searchTerm && <button onClick={() => setSearchTerm('')} className="text-indigo-400 font-bold hover:underline ml-1">Clear Search</button>}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(c => {
                  const isEditing = editingId === c.id;

                  return (
                    <tr key={c.id} className="hover:bg-[#1a1a1f]/30 transition-colors">
                      {/* Name / Company */}
                      <td className="p-4 pl-5">
                        {isEditing ? (
                          <div className="space-y-2 max-w-[180px]">
                            <label className="block text-[8px] font-black text-indigo-400 uppercase">Customer Name:</label>
                            <input 
                              type="text" 
                              value={editName}
                              onChange={e => {
                                setEditName(e.target.value);
                                setEditValError(null);
                              }}
                              className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:border-indigo-505 focus:outline-none"
                              required
                            />
                            <label className="block text-[8px] font-black text-slate-500 uppercase">Company:</label>
                            <input 
                              type="text" 
                              value={editCompany}
                              onChange={e => setEditCompany(e.target.value)}
                              className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:outline-none"
                            />
                            <label className="block text-[8px] font-black text-slate-505 uppercase">Referral Partner {currentUser.role !== 'Admin' && '(Admin Only)'} {c.isFromLead && '(Converted Lead: Non-Editable)'}:</label>
                            <select 
                              value={editPartnerName}
                              onChange={e => setEditPartnerName(e.target.value)}
                              disabled={currentUser.role !== 'Admin' || !!c.isFromLead}
                              className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-150 rounded focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <option value="">-- No Partner --</option>
                              {referrals.map(ref => (
                                <option key={ref.id} value={ref.name}>{ref.name}</option>
                              ))}
                              {currentUser.role === 'Referral Team' && !referrals.some(ref => ref.name === currentUser.name) && (
                                <option value={currentUser.name}>{currentUser.name}</option>
                              )}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <span className="font-extrabold text-white block text-sm">{c.name}</span>
                            <div className="flex flex-col gap-1 mt-1">
                              <span className="text-[9px] text-indigo-300 font-mono tracking-wider">{c.customerId || c.id}</span>
                              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{c.company}</span>
                              {c.partnerName && (
                                <span className="bg-teal-950/40 text-teal-400 border border-teal-900/40 px-2 py-0.5 mt-1 rounded text-[9px] font-bold w-max flex items-center gap-1.5 flex-wrap">
                                  <span>Partner: {c.partnerName}</span>
                                  {getReferralCodeForPartner(c.partnerName) && (
                                    <span className="bg-teal-900/30 text-emerald-300 px-1.5 py-0.2 rounded font-mono font-extrabold text-[8px] border border-teal-850">
                                      {getReferralCodeForPartner(c.partnerName)}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Phone & Email */}
                      <td className="p-4">
                        {isEditing ? (
                          <div className="space-y-2 max-w-[180px]">
                            <label className="block text-[8px] font-black text-indigo-400 uppercase">Mobile Number:</label>
                            <input 
                              type="text" 
                              value={editMobile}
                              onChange={e => {
                                setEditMobile(e.target.value);
                                setEditValError(null);
                              }}
                              className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:outline-none"
                              required
                            />
                            <label className="block text-[8px] font-black text-slate-500 uppercase">Email:</label>
                            <input 
                              type="email" 
                              value={editEmail}
                              onChange={e => setEditEmail(e.target.value)}
                              className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:outline-none"
                            />
                            <label className="block text-[8px] font-black text-slate-500 uppercase font-mono">Password / Access Code:</label>
                            <input 
                              type="text" 
                              value={editPassword}
                              onChange={e => setEditPassword(e.target.value)}
                              placeholder="Default: 1234"
                              className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="flex items-center gap-1.5 font-bold font-mono text-slate-200">
                              <Phone className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              {c.mobileNumber}
                            </span>
                            <span className="text-[10px] text-slate-400 select-all block lowercase hover:text-indigo-400 transition-colors">
                              {c.email}
                            </span>
                            <div className="text-[10px] text-slate-400 font-medium pt-1.5 flex items-center gap-1.5">
                              <span className="text-slate-500 font-semibold">Pass:</span>
                              <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded select-all text-indigo-300 font-bold border border-slate-850">
                                {c.password || '1234'}
                              </span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* District and State */}
                      <td className="p-4 relative">
                        {isEditing ? (
                          <div className="space-y-2 max-w-[180px]">
                            {/* Edit State Combobox Selection */}
                            <div className="relative" ref={editStateRef}>
                              <label className="block text-[8px] font-black text-slate-500 uppercase font-mono">State Region:</label>
                              <div className="relative">
                                <input 
                                  type="text" 
                                  placeholder="-- Search State --" 
                                  value={isEditStateOpen ? editStateSearchText : editState}
                                  onChange={e => {
                                    setEditStateSearchText(e.target.value);
                                    setIsEditStateOpen(true);
                                  }}
                                  onFocus={() => {
                                    setEditStateSearchText(editState);
                                    setIsEditStateOpen(true);
                                  }}
                                  className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:outline-none focus:border-indigo-505 pr-5"
                                />
                                <button
                                  type="button"
                                  onClick={() => setIsEditStateOpen(!isEditStateOpen)}
                                  className="absolute right-1 top-2 text-slate-500 hover:text-slate-300"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {isEditStateOpen && (
                                <div className="absolute z-[60] left-0 right-0 mt-1 max-h-32 overflow-y-auto bg-[#0d0d10] border border-slate-800 rounded shadow-2xl divide-y divide-slate-850">
                                  {INDIAN_STATES_LIST.filter(st => st.toLowerCase().includes(editStateSearchText.toLowerCase())).length === 0 ? (
                                    <div className="p-2 text-[10px] text-slate-550 italic">No matches</div>
                                  ) : (
                                    INDIAN_STATES_LIST.filter(st => st.toLowerCase().includes(editStateSearchText.toLowerCase())).map(st => (
                                      <button
                                        type="button"
                                        key={st}
                                        onMouseDown={() => {
                                          setEditState(st);
                                          setEditStateSearchText(st);
                                          setIsEditStateOpen(false);
                                          // Reset District
                                          setEditDistrict('');
                                          setEditDistrictSearchText('');
                                        }}
                                        className={`w-full text-left px-2 py-1 text-[11px] hover:bg-indigo-950/40 text-slate-300 transition ${
                                          editState === st ? 'bg-indigo-950/20 text-white font-bold' : ''
                                        }`}
                                      >
                                        {st}
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Edit District Combobox Selection */}
                            <div className="relative" ref={editDistrictRef}>
                              <label className="block text-[8px] font-black text-slate-505 uppercase font-mono">District:</label>
                              <div className="relative">
                                <input 
                                  type="text" 
                                  placeholder={editState ? "-- Search District --" : "Select State"} 
                                  disabled={!editState}
                                  value={editState ? (isEditDistrictOpen ? editDistrictSearchText : editDistrict) : ''}
                                  onChange={e => {
                                    setEditDistrictSearchText(e.target.value);
                                    setIsEditDistrictOpen(true);
                                  }}
                                  onFocus={() => {
                                    setEditDistrictSearchText(editDistrict);
                                    setIsEditDistrictOpen(true);
                                  }}
                                  className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:outline-none focus:border-indigo-505 pr-5 disabled:opacity-50"
                                />
                                <button
                                  type="button"
                                  disabled={!editState}
                                  onClick={() => setIsEditDistrictOpen(!isEditDistrictOpen)}
                                  className="absolute right-1 top-2 text-slate-500 hover:text-slate-300 disabled:opacity-50"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {isEditDistrictOpen && editState && (
                                <div className="absolute z-[60] left-0 right-0 mt-1 max-h-32 overflow-y-auto bg-[#0d0d10] border border-slate-800 rounded shadow-2xl divide-y divide-slate-850">
                                  {((INDIAN_STATES_AND_DISTRICTS[editState] || []).filter(dst => dst.toLowerCase().includes(editDistrictSearchText.toLowerCase()))).length === 0 ? (
                                    <div className="p-2 text-[10px] text-slate-550 italic">No matches</div>
                                  ) : (
                                    (INDIAN_STATES_AND_DISTRICTS[editState] || []).filter(dst => dst.toLowerCase().includes(editDistrictSearchText.toLowerCase())).map(dst => (
                                      <button
                                        type="button"
                                        key={dst}
                                        onMouseDown={() => {
                                          setEditDistrict(dst);
                                          setEditDistrictSearchText(dst);
                                          setIsEditDistrictOpen(false);
                                        }}
                                        className={`w-full text-left px-2 py-1 text-[11px] hover:bg-indigo-950/40 text-slate-300 transition ${
                                          editDistrict === dst ? 'bg-indigo-950/20 text-white font-bold' : ''
                                        }`}
                                      >
                                        {dst}
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>

                            <label className="block text-[8px] font-black text-slate-505 uppercase font-mono">PIN Code:</label>
                            <input 
                              type="text" 
                              maxLength={6}
                              value={editPincode}
                              onChange={e => setEditPincode(e.target.value.replace(/\D/g, ''))}
                              className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-slate-200 font-extrabold flex items-center gap-1">
                              <Compass className="w-3.5 h-3.5 text-slate-500" />
                              <span>{c.district || 'N/A'}</span>
                            </div>
                            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{c.state || 'N/A'}</div>
                            <div className="text-[10px] text-slate-400 font-semibold font-mono">PIN: {c.pincode || 'N/A'}</div>
                          </div>
                        )}
                      </td>

                      {/* Street Destination Address */}
                      <td className="p-4 max-w-[200px]">
                        {isEditing ? (
                          <div>
                            <label className="block text-[8px] font-black text-slate-500 uppercase font-mono mb-1">Physical Address:</label>
                            <textarea 
                              value={editAddress}
                              onChange={e => setEditAddress(e.target.value)}
                              rows={3}
                              className="w-full p-2 bg-[#141418] border border-slate-800 text-xs text-slate-100 rounded focus:outline-none"
                            />
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 leading-relaxed font-medium break-words">
                            {c.address ? c.address : <span className="text-slate-600 italic">No address provided</span>}
                          </p>
                        )}
                      </td>

                      {/* Score stars */}
                      <td className="p-4 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="text-[10px] text-amber-500 font-black flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {c.satisfactionScore || '5.0'}
                          </span>
                          <span className="text-[8px] text-slate-500 font-mono font-bold uppercase">Average Score</span>
                        </div>
                      </td>

                      {/* Converted Deals / Spent */}
                      <td className="p-4">
                        <div className="space-y-1">
                          <span className="font-mono text-emerald-400 font-extrabold block">
                            ₹{(c.totalSpent ?? 0).toLocaleString()}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold block bg-[#0e0e11] px-1.5 py-0.5 rounded border border-slate-800/40 w-max">
                            {c.dealsClosed} approved contracts
                          </span>
                        </div>
                      </td>

                      {/* Tier Tag */}
                      <td className="p-4">
                        {isEditing ? (
                          <select 
                            value={editTier}
                            onChange={e => setEditTier(e.target.value as any)}
                            className="bg-[#141418] border border-slate-800 text-xs p-1.5 rounded text-white focus:outline-none"
                          >
                            <option value="Platinum">Platinum</option>
                            <option value="Gold">Gold</option>
                            <option value="Silver">Silver</option>
                            <option value="Bronze">Bronze</option>
                          </select>
                        ) : (
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border inline-block ${
                            c.tier === 'Platinum' ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/40' :
                            c.tier === 'Gold' ? 'bg-amber-955/40 text-amber-400 border-amber-900/40' :
                            c.tier === 'Silver' ? 'bg-slate-900 text-slate-350 border-slate-850' :
                            'bg-orange-950/20 text-orange-400 border-orange-900/30'
                          }`}>
                            {c.tier}
                          </span>
                        )}
                      </td>

                      {/* Live Row Control Actions */}
                      <td className="p-4 text-right pr-5">
                        {isEditing ? (
                          <div className="space-y-1">
                            {editValError && (
                              <div className="text-[8px] text-rose-450 font-bold max-w-[120px] select-none block bg-rose-950/30 p-1 border border-rose-900/40 rounded uppercase text-center mb-1">
                                {editValError}
                              </div>
                            )}
                            <div className="flex gap-2.5 justify-end">
                              <button
                                onClick={() => handleSaveUpdate(c.id)}
                                className="p-1 px-2.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white font-bold inline-flex items-center gap-1 transition cursor-pointer text-[10px]"
                                title="Commit Changes"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 px-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-350 transition cursor-pointer text-[10px]"
                                title="Discard Changes"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 justify-end items-center">
                            {hasAccess('Customer Directory', 'edit') && (
                              <button
                                onClick={() => openAddressManager(c)}
                                className="p-1.5 border border-slate-800 bg-[#141418] text-emerald-400 hover:text-emerald-300 rounded-lg hover:border-slate-700 transition cursor-pointer"
                                title="Manage Delivery Addresses"
                                id={`addresses-customer-${c.id}`}
                              >
                                <MapPin className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {hasAccess('Customer Directory', 'edit') && (
                              <button
                                onClick={() => handleStartEditing(c)}
                                className="p-1.5 border border-slate-800 bg-[#141418] text-indigo-400 hover:text-indigo-300 rounded-lg hover:border-slate-700 transition cursor-pointer"
                                title="Edit Customer Details"
                                id={`edit-customer-${c.id}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {hasAccess('Customer Directory', 'delete') && (
                              <button
                                onClick={() => handleDeleteProfile(c)}
                                className="p-1.5 border border-slate-800 bg-[#141418] text-rose-500 hover:text-rose-400 rounded-lg hover:border-slate-700 transition cursor-pointer"
                                title="Prune Profile Records"
                                id={`delete-customer-${c.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
