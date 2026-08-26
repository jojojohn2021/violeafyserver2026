import React, { useState, useEffect, useMemo } from 'react';
import { useCRM } from '../store';
import ProductReviewsSection from './ProductReviewsSection';
import { 
  ShoppingBag, ShoppingCart, Heart, Search, Star, MapPin, Tag, 
  Truck, ArrowLeft, Check, Plus, Minus, Trash2, Calendar, FileText, 
  Settings, CreditCard, ShieldCheck, AlertCircle, RefreshCw, ChevronRight, X,
  Mic, Bell, HelpCircle, Share2, Award, QrCode, Sun, Moon, Sparkles, Send, Box, RefreshCcw
} from 'lucide-react';
import { 
  ShoppingCartItem, WishlistItem, ProductReview, CustomerAddress, Coupon, 
  OrderDeliveryTracking, OrderReturnRequest, OrderRefund,
  SalesOrder, SalesProduct
} from '../types';

export default function ShoppingPlatformView() {
  const {
    currentUser,
    products,
    referrals,
    shoppingCart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    wishlist,
    toggleWishlist,
    productReviews,
    addProductReview,
    customerAddresses,
    addCustomerAddress,
    updateCustomerAddress,
    deleteCustomerAddress,
    coupons,
    applyCoupon,
    deliveryCharges,
    orderDeliveryTracking,
    updateDeliveryTracking,
    orderReturnRequests,
    addReturnRequest,
    updateReturnRequest,
    orderRefunds,
    addRefund,
    updateRefund,
    salesOrders,
    addSalesOrder,
    wallets,
    walletLedgers,
    addCustomAuditLog,
    customCategories,
    categories,
    customBrands,
    customBrandOwners,
    updateProduct,
    initiatePaymentFlow,
    verifyPaymentFlow,
    paymentGatewaySettings
  } = useCRM();

  // Pricing helper utilities
  const getProductPrice = (p: any) => {
    return p.offerPrice !== undefined && p.offerPrice !== null ? p.offerPrice : p.onlinePrice || 0;
  };

  const getProductOriginalPrice = (p: any) => {
    return p.mrp !== undefined && p.mrp !== null ? p.mrp : p.shopPrice || 0;
  };

  const getProductDiscount = (p: any) => {
    if (p.discount !== undefined && p.discount !== null) return p.discount;
    const original = getProductOriginalPrice(p);
    const current = getProductPrice(p);
    if (original > 0 && original > current) {
      return Math.max(0, Math.round(((original - current) / original) * 100));
    }
    return 0;
  };

  // Primary Theme: Light Mode default with Dark Mode toggle support
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('shopping_dark_mode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('shopping_dark_mode', String(isDarkMode));
  }, [isDarkMode]);

  // Bottom Navigation (5 tabs)
  const [activeTab, setActiveTab] = useState<'home' | 'categories' | 'cart' | 'wishlist' | 'account'>('home');
  
  // Search & Category states
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedBrand, setSelectedBrand] = useState<string>('All');
  const [selectedBrandOwner, setSelectedBrandOwner] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Skeleton Loader trigger when switching tabs (Zepto/Blinkit simulation)
  const [isSkeletonLoading, setIsSkeletonLoading] = useState<boolean>(false);
  useEffect(() => {
    setIsSkeletonLoading(true);
    const timer = setTimeout(() => setIsSkeletonLoading(false), 250);
    return () => clearTimeout(timer);
  }, [activeTab, selectedCategory]);

  // Voice Search Stimulation
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [voiceWaveText, setVoiceWaveText] = useState<string>('Listening...');
  const triggerVoiceSearch = () => {
    setIsVoiceListening(true);
    setVoiceWaveText('Listening for your voice...');
    setTimeout(() => {
      setVoiceWaveText('Processing: "Fresh Strawberries"...');
      setTimeout(() => {
        setIsVoiceListening(false);
        setSearchQuery('Strawberries');
        setActiveTab('categories');
        setSelectedCategory('Fruits');
        addCustomAuditLog('VOICE_SEARCH', 'Simulated voice query for "Strawberries" processed.');
      }, 800);
    }, 1200);
  };

  // Barcode / QR Scanner Simulation
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [scannerPulse, setScannerPulse] = useState<boolean>(false);
  const triggerBarcodeScanner = () => {
    setShowScanner(true);
    setScannerPulse(true);
    setTimeout(() => {
      // Find a random organic spice or vegetable product to "scan"
      const spiceProducts = products.filter(p => p.sku?.startsWith('VEG') || p.sku?.startsWith('FRT') || p.name.includes('Chilli'));
      const randomProduct = spiceProducts[Math.floor(Math.random() * spiceProducts.length)] || products[0];
      setScannerPulse(false);
      setShowScanner(false);
      if (randomProduct) {
        setSelectedProduct(randomProduct);
        addCustomAuditLog('BARCODE_SCANNER', `Scanned and auto-loaded item: ${randomProduct.name}`);
      }
    }, 2000);
  };

  // Recently Viewed tracker
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('shopping_recently_viewed');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addToRecentlyViewed = (id: string) => {
    setRecentlyViewedIds(prev => {
      const filtered = prev.filter(x => x !== id);
      const updated = [id, ...filtered].slice(0, 6);
      localStorage.setItem('shopping_recently_viewed', JSON.stringify(updated));
      return updated;
    });
  };

  // Active User Context
  const uId = currentUser?.id || 'guest';

  // Sub-accounts state (Inside Account tab)
  const [accountSubView, setAccountSubView] = useState<'profile' | 'referral' | 'wallet' | 'addresses' | 'support' | 'orders' | 'admin'>('profile');

  // Modals / Details
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'address' | 'payment' | 'review' | 'confirmed'>('cart');
  const [trackingOrder, setTrackingOrder] = useState<SalesOrder | null>(null);
  
  // Custom Reviews state
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');

  // Address adding forms
  const [showAddressForm, setShowAddressForm] = useState<boolean>(false);
  const [addressName, setAddressName] = useState('');
  const [addressPhone, setAddressPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressPincode, setAddressPincode] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');

  // Booking slots
  const [deliverySlot, setDeliverySlot] = useState<string>('Immediate (10-15 mins)');
  const [selectedPayment, setSelectedPayment] = useState<string>('payu');

  // Payment Simulation State
  const [activePaymentTx, setActivePaymentTx] = useState<any | null>(null);
  const [showPaymentGatewaySimulator, setShowPaymentGatewaySimulator] = useState<boolean>(false);
  const [paymentSimulationStatus, setPaymentSimulationStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [paymentSimulationError, setPaymentSimulationError] = useState<string | null>(null);
  const [isInitiatingPayment, setIsInitiatingPayment] = useState<boolean>(false);

  // Active payment channels (Only PayU and COD active by default)
  const paymentChannels = useMemo(() => {
    const list: Array<{ id: string; name: string; icon: any; subtitle: string }> = [];

    // PayU
    list.push({
      id: 'payu',
      name: 'PayU Secure Gateway (payu_biz_node_vionex)',
      icon: CreditCard,
      subtitle: 'Secure merchant checkout powered by PayU'
    });

    // Cash on Delivery is always active as default manual option
    list.push({
      id: 'cod',
      name: 'Cash on Delivery / Pay on Hand',
      icon: Truck,
      subtitle: 'Pay with cash or scan on delivery when parcel arrives'
    });

    return list;
  }, []);

  // Keep selectedPayment default selected to the first available active channel
  useEffect(() => {
    if (paymentChannels.length > 0) {
      const isSelectedActive = paymentChannels.some(ch => ch.id === selectedPayment);
      if (!isSelectedActive) {
        setSelectedPayment(paymentChannels[0].id);
      }
    }
  }, [paymentChannels, selectedPayment]);

  // Coupon & referral codes
  const [couponInput, setCouponInput] = useState<string>('');
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [referralSponsorCode, setReferralSponsorCode] = useState<string>('');

  // Notifications
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<Array<{id: string, text: string, time: string}>>([
    { id: '1', text: '⚡ Your order for Organic Broccoli was delivered in 12 mins!', time: '1 hour ago' },
    { id: '2', text: '🎉 Festival Promo! Get 30% OFF using coupon FESTIVAL30', time: '1 day ago' },
    { id: '3', text: '💚 Referral program bonus updated. Earn up to 5-level overrides!', time: '2 days ago' }
  ]);

  // Support Chat simulation
  const [showHelpChat, setShowHelpChat] = useState<boolean>(false);
  const [helpMessages, setHelpMessages] = useState<Array<{sender: 'user' | 'agent', text: string}>>([
    { sender: 'agent', text: 'Hello! I am VioneX Support Agent. How can I help you today with your delivery?' }
  ]);
  const [helpInput, setHelpInput] = useState<string>('');
  const handleSendHelpMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpInput.trim()) return;
    const userMsg = helpInput;
    setHelpMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setHelpInput('');
    setTimeout(() => {
      setHelpMessages(prev => [...prev, { sender: 'agent', text: 'Thank you for contacting us. Our delivery partner is currently en-route. They will contact you shortly!' }]);
    }, 1000);
  };

  // Auto-scrolling Hero Promo Banners (Every 3.5 seconds)
  const [heroIndex, setHeroIndex] = useState<number>(0);
  const promoBanners = useMemo(() => [
    { title: "Today's Special Offers", subtitle: "Flat 25% Off On Organic Veggies", tag: "FESTIVAL25", bg: "from-emerald-500 to-teal-600" },
    { title: "Free Instant Delivery", subtitle: "Delivering happiness within 15 minutes", tag: "FREEDEL", bg: "from-lime-500 to-emerald-600" },
    { title: "Combo Smart Packs", subtitle: "Save up to ₹150 on kitchen essentials", tag: "COMBOSAVE", bg: "from-orange-500 to-red-600" },
    { title: "Sponsor Incentives", subtitle: "Earn Level commissions on every order placed!", tag: "VIONEX5", bg: "from-blue-500 to-indigo-600" }
  ], []);

  useEffect(() => {
    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % promoBanners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [promoBanners.length]);

  // Dynamic master arrays computed from active product data + custom created records
  const dynamicCategories = useMemo(() => {
    return Array.from(new Set([
      ...customCategories,
      ...products.map(p => p.category || 'Uncategorized')
    ])).filter(Boolean).sort();
  }, [customCategories, products]);

  const dynamicBrands = useMemo(() => {
    return Array.from(new Set([
      ...customBrands.map(b => b.name),
      ...products.map(p => p.brand).filter(Boolean) as string[]
    ])).filter(Boolean).map(brandName => {
      const cb = customBrands.find(c => c.name.toLowerCase() === brandName.toLowerCase());
      const pb = products.find(p => (p.brand || '').toLowerCase() === brandName.toLowerCase());
      return {
        name: brandName,
        owner: cb?.owner || pb?.brandOwner || ''
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [customBrands, products]);

  const dynamicBrandOwners = useMemo(() => {
    return Array.from(new Set([
      ...customBrandOwners,
      ...products.map(p => p.brandOwner).filter(Boolean) as string[],
      ...dynamicBrands.map(b => b.owner).filter(Boolean)
    ])).filter(Boolean).sort();
  }, [customBrandOwners, products, dynamicBrands]);

  // Categories helper
  const CATEGORIES_LIST = useMemo(() => {
    const defaultIcons: Record<string, string> = {
      'Home Care': '🧴',
      'Personal Care': '🧼',
      'Grocery': '🛒',
      'Spices': '🌶',
      'Fruits': '🍎',
      'Vegetables': '🥬',
      'Dairy': '🥛',
      'Uncategorized': '📦'
    };
    return dynamicCategories.map(cat => {
      const imageUrl = categories.find(c => c.name.toLowerCase() === cat.toLowerCase())?.imageUrl;
      return {
        name: cat,
        icon: defaultIcons[cat] || '📦',
        imageUrl
      };
    });
  }, [dynamicCategories, categories]);

  // Map product categories
  const getProductCategory = (p: any) => {
    if (p.category) return p.category;
    const nameLower = p.name.toLowerCase();
    const skuUpper = (p.sku || '').toUpperCase();
    if (skuUpper.startsWith('VEG') || nameLower.includes('onion') || nameLower.includes('potato') || nameLower.includes('vegetable') || nameLower.includes('garlic') || nameLower.includes('ginger') || nameLower.includes('leaf') || nameLower.includes('tomato')) return 'Vegetables';
    if (skuUpper.startsWith('FRT') || nameLower.includes('mango') || nameLower.includes('apple') || nameLower.includes('fruit') || nameLower.includes('banana') || nameLower.includes('orange') || nameLower.includes('berry') || nameLower.includes('lemon')) return 'Fruits';
    if (nameLower.includes('milk') || nameLower.includes('dairy') || nameLower.includes('cheese') || nameLower.includes('butter') || nameLower.includes('paneer') || nameLower.includes('curd') || nameLower.includes('yogurt')) return 'Dairy';
    if (nameLower.includes('chilli') || nameLower.includes('spice') || nameLower.includes('masala') || nameLower.includes('powder') || nameLower.includes('pepper') || nameLower.includes('clove') || nameLower.includes('cardamom') || nameLower.includes('turmeric')) return 'Spices';
    if (nameLower.includes('soap') || nameLower.includes('shampoo') || nameLower.includes('wash') || nameLower.includes('gel') || nameLower.includes('paste') || nameLower.includes('brush') || nameLower.includes('oil')) return 'Personal Care';
    if (nameLower.includes('cleaner') || nameLower.includes('liquid') || nameLower.includes('detergent') || nameLower.includes('spray') || nameLower.includes('floor') || nameLower.includes('dish') || nameLower.includes('home')) return 'Home Care';
    return 'Grocery';
  };

  const getProductImage = (p: any) => {
    if (!p) return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop&q=80';
    // Use Firebase Storage URL if available
    if (p.imageUrl && p.imageUrl.trim() !== '') return p.imageUrl;
    // Fallback to category-based placeholder if no image URL
    const category = getProductCategory(p);
    switch (category) {
      case 'Vegetables': return 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?w=400&h=300&fit=crop&q=80';
      case 'Fruits': return 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=400&h=300&fit=crop&q=80';
      case 'Dairy': return 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&h=300&fit=crop&q=80';
      case 'Spices': return 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400&h=300&fit=crop&q=80';
      case 'Personal Care': return 'https://images.unsplash.com/photo-1608248597481-496100c80836?w=400&h=300&fit=crop&q=80';
      case 'Home Care': return 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=300&fit=crop&q=80';
      default: return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop&q=80';
    }
  };

  // Get active cart
  const userCart = useMemo(() => {
    return shoppingCart.filter(item => item.userId === uId);
  }, [shoppingCart, uId]);

  // Financial summary
  const financials = useMemo(() => {
    let rawTotal = 0;
    userCart.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (prod) {
        rawTotal += getProductPrice(prod) * item.quantity;
      }
    });

    let discount = 0;
    if (activeCoupon) {
      if (activeCoupon.type === 'percentage') {
        discount = rawTotal * (activeCoupon.value / 100);
      } else if (activeCoupon.type === 'fixed') {
        discount = activeCoupon.value;
      }
    }

    // Dynamic referral / wallet deduction discount
    const referralDiscount = referralSponsorCode ? Math.min(50, rawTotal * 0.1) : 0;
    
    // Find delivery charge based on the customer pincode
    const finalAddress = customerAddresses.find(a => a.id === selectedAddressId) || customerAddresses.find(a => a.isDefault) || customerAddresses[0];
    let deliveryFee = 0; // default is Free
    if (finalAddress && finalAddress.pincode) {
      const trimmedPin = finalAddress.pincode.trim();
      const match = (deliveryCharges || []).find(dc => dc.pincode === trimmedPin);
      if (match) {
        deliveryFee = match.charge;
      }
    }

    const finalBill = Math.max(0, rawTotal - discount - referralDiscount + deliveryFee);

    return {
      subtotal: Math.round(rawTotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      referralDiscount: Math.round(referralDiscount * 100) / 100,
      deliveryFee,
      total: Math.round(finalBill * 100) / 100
    };
  }, [userCart, products, activeCoupon, referralSponsorCode, customerAddresses, selectedAddressId, deliveryCharges]);

  // Filtered product lists
  const processedProducts = useMemo(() => {
    return products.filter(p => {
      const cat = getProductCategory(p);
      const isCatMatch = selectedCategory === 'All' || cat === selectedCategory;
      
      const brandVal = p.brand || 'Generic';
      const isBrandMatch = selectedBrand === 'All' || brandVal.toLowerCase() === selectedBrand.toLowerCase();
      
      const ownerVal = p.brandOwner || 'Generic Owner';
      const isOwnerMatch = selectedBrandOwner === 'All' || ownerVal.toLowerCase() === selectedBrandOwner.toLowerCase();

      const isSearchMatch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
      return isCatMatch && isBrandMatch && isOwnerMatch && isSearchMatch;
    });
  }, [products, selectedCategory, selectedBrand, selectedBrandOwner, searchQuery]);

  // Smart Sections for Home Screen
  const flashDeals = useMemo(() => {
    return products.filter(p => getProductPrice(p) < getProductOriginalPrice(p)).slice(0, 4);
  }, [products]);

  const bestSellers = useMemo(() => {
    return products.filter(p => (p.unitsSold || 0) > 10).slice(0, 4);
  }, [products]);

  const newArrivals = useMemo(() => {
    return products.slice(-4).reverse();
  }, [products]);

  const recommendedProducts = useMemo(() => {
    return products.filter(p => p.id.charCodeAt(0) % 2 === 0).slice(0, 4);
  }, [products]);

  const recentlyViewed = useMemo(() => {
    return products.filter(p => recentlyViewedIds.includes(p.id));
  }, [products, recentlyViewedIds]);

  const renderProductCard = (p: any) => {
    const inCartItem = userCart.find(item => item.productId === p.id);
    const savedPercent = getProductDiscount(p);
    
    // Look up Brand details from brand master (dynamicBrands)
    const brandObj = dynamicBrands.find(b => b.name.toLowerCase() === (p.brand || 'Generic').toLowerCase());
    const brandName = brandObj ? brandObj.name : (p.brand || 'Generic');

    // Calculate actual star ratings from productReviews
    const reviews = productReviews.filter(r => r.productId === p.id);
    const averageRating = reviews.length > 0 
      ? Math.round((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length) * 10) / 10 
      : 4.8;
    const reviewCount = reviews.length > 0 ? reviews.length : 120;

    return (
      <div 
        key={p.id}
        className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between group hover:border-[#22C55E]/35 hover:shadow-lg hover:shadow-green-500/5 transition duration-300 relative"
      >
        {/* Top offer discount badge */}
        {savedPercent > 0 && (
          <span className="absolute top-2.5 left-2.5 z-10 text-[9px] font-extrabold bg-[#F97316] text-white py-0.5 px-2.5 rounded-full shadow-sm">
            {savedPercent}% OFF
          </span>
        )}

        {/* Favourite Wishlist badge */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleWishlist(p.id);
            addCustomAuditLog('FAVOURITE_TOGGLED', `Toggled favourite badge status for product: ${p.name}`);
          }}
          className="absolute top-2.5 right-2.5 z-10 p-1.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl text-slate-400 hover:text-red-500 transition shadow-sm"
        >
          <Heart className={`w-3.5 h-3.5 ${isInWishlist(p.id) ? 'fill-red-500 text-red-500' : ''}`} />
        </button>

        {/* Clickable Image body details */}
        <div 
          onClick={() => {
            setSelectedProduct(p);
            addToRecentlyViewed(p.id);
          }}
          className="cursor-pointer space-y-2.5 flex-1 flex flex-col"
        >
          {/* Large product image */}
          <div className="h-44 md:h-48 bg-slate-100 dark:bg-slate-800 overflow-hidden relative shrink-0">
            <img 
              src={getProductImage(p)} 
              alt={p.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
            <div className="space-y-1">
              <span className="text-[9px] font-extrabold uppercase text-[#22C55E] block">{getProductCategory(p)}</span>
              {/* Brand picked from link table brand master */}
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight block">
                🏢 {brandName}
              </span>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight group-hover:text-[#22C55E] transition">{p.name}</h4>
              <span className="text-[10px] text-slate-500 block font-mono">Size: {p.packingSize || '500 g'}</span>
            </div>

            <div className="space-y-2 pt-1">
              {/* Star rating */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 text-amber-500">
                  {[1,2,3,4,5].map(s => (
                    <Star 
                      key={s} 
                      className={`w-2.5 h-2.5 ${s <= Math.round(averageRating) ? 'fill-amber-500 text-amber-500' : 'text-slate-300 dark:text-slate-700'}`} 
                    />
                  ))}
                </div>
                <span className="text-[9px] text-slate-400 font-bold">{averageRating} ({reviewCount})</span>
              </div>

              <div className="flex items-baseline justify-between gap-1 border-t pt-2 dark:border-slate-800">
                <div>
                  <span className="text-sm font-black text-[#22C55E]">₹{getProductPrice(p)}</span>
                  {getProductOriginalPrice(p) > getProductPrice(p) && (
                    <span className="text-[10px] text-slate-400 line-through block">MRP ₹{getProductOriginalPrice(p)}</span>
                  )}
                </div>

                {/* Add or Quantity selector widget */}
                {inCartItem ? (
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
                    <button 
                      onClick={(e) => { e.stopPropagation(); updateCartQuantity(p.id, inCartItem.quantity - 1); }}
                      className="p-1 rounded text-slate-500 hover:bg-slate-150"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] font-bold w-3.5 text-center">{inCartItem.quantity}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); updateCartQuantity(p.id, inCartItem.quantity + 1); }}
                      className="p-1 rounded text-slate-500 hover:bg-slate-150"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      addToCart(p.id, 1); 
                      addCustomAuditLog('PRODUCT_ADDED_TO_CART', `Added ${p.name} to instant cart`);
                    }}
                    className="px-3 py-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E] hover:text-white text-[#22C55E] text-[10px] font-extrabold uppercase rounded-lg transition animate-fade-in"
                  >
                    Add
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Wishlist check
  const isInWishlist = (productId: string) => {
    return wishlist.some(item => item.productId === productId && item.userId === uId);
  };

  // Submit product review
  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !reviewComment.trim()) return;
    addProductReview({
      productId: selectedProduct.id,
      userId: currentUser?.id || 'guest',
      userName: currentUser?.name || 'Anonymous User',
      rating: reviewRating,
      comment: reviewComment
    });
    setReviewComment('');
    addCustomAuditLog('PRODUCT_REVIEW_ADDED', `Submitted ${reviewRating}★ review for ${selectedProduct.name}`);
  };

  // Trigger address adding
  const handleAddAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressName || !addressPhone || !addressLine || !addressCity || !addressState || !addressPincode) return;
    addCustomerAddress({
      userId: uId,
      name: addressName,
      mobileNumber: addressPhone,
      addressLine,
      city: addressCity,
      district: addressCity,
      state: addressState,
      pincode: addressPincode,
      isDefault: customerAddresses.length === 0
    });
    setAddressName('');
    setAddressPhone('');
    setAddressLine('');
    setAddressCity('');
    setAddressState('');
    setAddressPincode('');
    setShowAddressForm(false);
    addCustomAuditLog('CUSTOMER_ADDRESS_ADDED', 'Successfully registered a fresh delivery address node.');
  };

  // Place Storefront Order
  const handlePlaceOrder = async () => {
    if (userCart.length === 0) return;
    setIsInitiatingPayment(true);
    setPaymentSimulationError(null);

    const finalAddress = customerAddresses.find(a => a.id === selectedAddressId) || customerAddresses[0];
    
    const orderedGoods: SalesProduct[] = userCart.map(item => {
      const p = products.find(prod => prod.id === item.productId)!;
      return {
        productId: item.productId,
        productName: p.name,
        price: getProductPrice(p),
        quantity: item.quantity,
        gstPercentage: p.gstPercentage || 18
      };
    });

    // Determine gateway and method
    let gatewayName = 'PayU';
    let paymentMethodStr = 'Credit Card';
    if (selectedPayment === 'cod') {
      gatewayName = 'COD';
      paymentMethodStr = 'Cash';
    }

    // Prepare temp order data for initiation
    const tempOrderId = `so-${Date.now()}`;
    const orderData = {
      id: tempOrderId,
      total: financials.total,
      totalValue: financials.total,
      paymentMethod: paymentMethodStr,
      gateway: gatewayName
    };

    try {
      const res = await initiatePaymentFlow(orderData, paymentMethodStr, gatewayName);
      if (res.success && res.transaction) {
        setActivePaymentTx(res.transaction);
        setPaymentSimulationStatus('idle');
        
        if (selectedPayment === 'cod') {
          // Cash on delivery completes immediately
          const orderPayload = {
            id: tempOrderId,
            customerId: uId,
            customerName: currentUser?.name || 'Online Customer',
            customerCompany: 'VioneX Shopper Client',
            products: orderedGoods,
            totalValue: financials.total,
            paymentStatus: 'Pending' as const, // Pending COD collection
            deliveryStatus: 'Pending' as const,
            assignedTo: 'Automated Dispatch Center',
            paymentMethod: 'Cash' as const,
            orderType: 'Online' as const,
            salesChannel: 'Vamjo',
            referralCode: referralSponsorCode || undefined,
            notes: finalAddress ? `Delivery Address: ${finalAddress.addressLine}, ${finalAddress.city}, ${finalAddress.state} - ${finalAddress.pincode}.` : 'Delivery to saved default address.'
          };

          addSalesOrder(orderPayload, true);
          clearCart();
          setActiveCoupon(null);
          setCheckoutStep('confirmed');
          addCustomAuditLog('ECOM_ORDER_PLACED', `VioneX order placed successfully. Cash on Delivery ₹${financials.total} registered.`);
        } else {
          // Open the payment simulator panel in the same screen
          setShowPaymentGatewaySimulator(true);
        }
      } else {
        setPaymentSimulationError(res.error || "Failed to initiate payment transaction.");
      }
    } catch (err: any) {
      setPaymentSimulationError(err.message || "An error occurred during payment initiation.");
    } finally {
      setIsInitiatingPayment(false);
    }
  };

  // Simulate verification and process success/failure
  const handleVerifySimulation = async (simulateFailure: boolean) => {
    if (!activePaymentTx) return;
    setPaymentSimulationStatus('processing');
    setPaymentSimulationError(null);

    try {
      const res = await verifyPaymentFlow(activePaymentTx.id, { simulateFailure });
      if (res.success && res.transaction) {
        setPaymentSimulationStatus('success');
        
        const finalAddress = customerAddresses.find(a => a.id === selectedAddressId) || customerAddresses[0];
        const orderedGoods: SalesProduct[] = userCart.map(item => {
          const p = products.find(prod => prod.id === item.productId)!;
          return {
            productId: item.productId,
            productName: p.name,
            price: getProductPrice(p),
            quantity: item.quantity,
            gstPercentage: p.gstPercentage || 18
          };
        });

        const finalPaymentMethod = 'Credit Card' as const;

        const orderPayload = {
          id: activePaymentTx.orderId,
          customerId: uId,
          customerName: currentUser?.name || 'Online Customer',
          customerCompany: 'VioneX Shopper Client',
          products: orderedGoods,
          totalValue: financials.total,
          paymentStatus: 'Paid' as const,
          deliveryStatus: 'Pending' as const,
          assignedTo: 'Automated Dispatch Center',
          paymentMethod: finalPaymentMethod,
          orderType: 'Online' as const,
          salesChannel: 'Vamjo',
          referralCode: referralSponsorCode || undefined,
          notes: finalAddress ? `Delivery Address: ${finalAddress.addressLine}, ${finalAddress.city}, ${finalAddress.state} - ${finalAddress.pincode}.` : 'Delivery to saved default address.'
        };

        // Complete sales order and save
        addSalesOrder(orderPayload, true);
        clearCart();
        setActiveCoupon(null);
        
        setTimeout(() => {
          setShowPaymentGatewaySimulator(false);
          setCheckoutStep('confirmed');
          setActivePaymentTx(null);
          setPaymentSimulationStatus('idle');
        }, 1500);
      } else {
        setPaymentSimulationStatus('failed');
        setPaymentSimulationError(res.error || "Simulated payment verification declined.");
      }
    } catch (err: any) {
      setPaymentSimulationStatus('failed');
      setPaymentSimulationError(err.message || "An error occurred while verifying the transaction.");
    }
  };

  // Admin coupon generation
  const [adminCouponCode, setAdminCouponCode] = useState('');
  const [adminCouponValue, setAdminCouponValue] = useState(15);
  const handleAdminCouponCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminCouponCode.trim()) return;
    const newCp: Coupon = {
      id: `cp-${Date.now()}`,
      code: adminCouponCode.toUpperCase().trim(),
      type: 'percentage',
      value: adminCouponValue,
      minOrderValue: 200,
      isActive: true,
      expiryDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      description: `${adminCouponValue}% discount off on fresh grocery staples.`
    };
    
    const currentCoupons = JSON.parse(localStorage.getItem('viocrm_coupons') || '[]');
    localStorage.setItem('viocrm_coupons', JSON.stringify([newCp, ...currentCoupons]));
    setAdminCouponCode('');
    alert('Promotional coupon registered! Simply refresh or trigger search to apply.');
  };

  return (
    <div className={`p-1 md:p-4 rounded-3xl ${isDarkMode ? 'bg-[#121214] text-white' : 'bg-white text-slate-800'}`}>
      {/* HEADER CONTROLS */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between w-full xl:w-auto">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#22C55E]/10 text-[#22C55E]">
              <ShoppingBag className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Shopping Platform</h1>
              <p className="text-xs text-slate-400">Fresh organic staples & instant multi-tier partner rewards</p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <div className="hidden md:flex items-center gap-1 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800">
            {[
              { id: 'home', label: 'Home', icon: '🏠' },
              { id: 'categories', label: 'Categories', icon: '📂' },
              { id: 'cart', label: 'Cart', icon: '🛒', count: shoppingCart.reduce((sum, item) => sum + item.quantity, 0) },
              { id: 'wishlist', label: 'Wishlist', icon: '❤️' },
              { id: 'account', label: 'Account', icon: '👤' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition relative ${activeTab === tab.id ? 'bg-[#22C55E] text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white text-[#22C55E]' : 'bg-[#22C55E] text-white'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Action Widgets */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* Dark mode switch */}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title="Toggle theme mode"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Simulated Scanner */}
          <button 
            onClick={triggerBarcodeScanner}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500/20 transition"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan QR</span>
          </button>

          {/* Quick Notifications Button */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition relative"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-xl p-4 z-40">
                <div className="flex items-center justify-between border-b pb-2 mb-2 dark:border-slate-800">
                  <span className="text-xs font-bold">Recent Alerts</span>
                  <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 text-[10px]">Close</button>
                </div>
                <div className="space-y-3">
                  {notifications.map(n => (
                    <div key={n.id} className="text-xs border-b pb-2 last:border-none dark:border-slate-800">
                      <p className="text-slate-700 dark:text-slate-300">{n.text}</p>
                      <span className="text-[10px] text-slate-450 block mt-1">{n.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SKELETON LOADER ANIMATION SIMULATOR */}
      {isSkeletonLoading ? (
        <div className="space-y-4 py-8 animate-pulse">
          <div className="h-44 bg-slate-100 dark:bg-slate-800 rounded-3xl w-full"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(x => (
              <div key={x} className="h-64 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`min-h-[600px] ${currentUser?.role === 'Referral Team' ? 'pb-64 md:pb-16' : 'pb-44 md:pb-16'}`}>
          {/* ======================= */}
          {/* HOME TAB                */}
          {/* ======================= */}
          {activeTab === 'home' && (
            <div className="space-y-6">
              {/* Home Header Search Panel */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <MapPin className="w-4 h-4 text-[#22C55E]" />
                  <div>
                    <span className="text-slate-400 block text-[10px]">DELIVERY TO</span>
                    <strong className="text-slate-700 dark:text-slate-200">Gachibowli, Hyderabad - 500032</strong>
                  </div>
                </div>

                {/* Instant Search Bar & Microphone */}
                <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-xl">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search grocery, fresh produce, spices..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-[#22C55E]"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button 
                    onClick={triggerVoiceSearch}
                    className="p-3 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 text-[#22C55E] rounded-2xl transition flex items-center justify-center cursor-pointer"
                    title="Voice Search"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* AUTO-SCROLLING PROMOTIONAL BANNERS */}
              <div className="relative overflow-hidden rounded-3xl h-44 md:h-52 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center p-6 md:p-10 shadow-md">
                <div className="max-w-md space-y-2 z-15 relative">
                  <span className="bg-[#F97316] text-white text-[10px] uppercase font-bold py-1 px-3 rounded-full animate-bounce">
                    EXCLUSIVE OFFER
                  </span>
                  <h3 className="text-xl md:text-2xl font-bold tracking-tight">{promoBanners[heroIndex].title}</h3>
                  <p className="text-xs md:text-sm text-emerald-100">{promoBanners[heroIndex].subtitle}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded border border-white/10">Code: {promoBanners[heroIndex].tag}</span>
                    <button 
                      onClick={() => {
                        setCouponInput(promoBanners[heroIndex].tag);
                        setActiveTab('cart');
                        addCustomAuditLog('PROMO_CODE_CLICKED', `Clicked on hero promo banner discount: ${promoBanners[heroIndex].tag}`);
                      }} 
                      className="text-xs font-bold text-lime-300 hover:underline"
                    >
                      Apply Now &rarr;
                    </button>
                  </div>
                </div>

                {/* Abstract graphic accents */}
                <div className="absolute right-4 bottom-4 md:right-10 opacity-20 transform translate-y-1/4 scale-150">
                  <ShoppingBag className="w-44 h-44 text-white" />
                </div>

                {/* Banner Indicators */}
                <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1.5">
                  {promoBanners.map((_, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => setHeroIndex(idx)}
                      className={`w-2 h-2 rounded-full transition-all ${idx === heroIndex ? 'bg-white w-4' : 'bg-white/40'}`}
                    ></button>
                  ))}
                </div>
              </div>

              {/* QUICK CATEGORIES (HORIZONTAL ROUNDED GRID) */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold tracking-tight">Explore Departments</h3>
                <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none snap-x">
                  <button 
                    onClick={() => {
                      setSelectedCategory('All');
                      setActiveTab('categories');
                    }}
                    className={`flex flex-col items-center gap-1.5 shrink-0 snap-start p-3 rounded-2xl w-20 transition border ${selectedCategory === 'All' ? 'bg-[#22C55E]/10 border-[#22C55E]' : 'bg-slate-50 dark:bg-slate-900 border-transparent'}`}
                  >
                    <span className="text-lg">🌟</span>
                    <span className="text-[10px] font-bold">All Items</span>
                  </button>

                  {CATEGORIES_LIST.map(cat => (
                    <button 
                      key={cat.name}
                      onClick={() => {
                        setSelectedCategory(cat.name);
                        setActiveTab('categories');
                      }}
                      className="flex flex-col items-center gap-1.5 shrink-0 snap-start p-3 bg-slate-50 dark:bg-slate-900 hover:bg-[#22C55E]/5 border border-transparent hover:border-[#22C55E]/20 rounded-2xl w-20 transition"
                    >
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt={cat.name} className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <span className="text-lg">{cat.icon}</span>
                      )}
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 text-center truncate w-full">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* RETAIL SECTIONS (HORIZONTAL SHELVES) */}
              
              {/* 1. Flash Deals */}
              {flashDeals.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#F97316] font-bold text-sm">🔥 Flash Deals</span>
                      <span className="text-[9px] font-bold bg-[#F97316]/10 text-[#F97316] py-0.5 px-2 rounded-full">LIMITED STOCK</span>
                    </div>
                    <button onClick={() => { setActiveTab('categories'); setSelectedCategory('All'); }} className="text-xs text-[#22C55E] font-semibold hover:underline">View All</button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {flashDeals.map(prod => renderProductCard(prod))}
                  </div>
                </div>
              )}

              {/* 2. Best Sellers */}
              {bestSellers.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">⭐ Best Sellers</span>
                    <button onClick={() => { setActiveTab('categories'); setSelectedCategory('All'); }} className="text-xs text-[#22C55E] font-semibold hover:underline">View All</button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {bestSellers.map(prod => renderProductCard(prod))}
                  </div>
                </div>
              )}

              {/* 3. Recommended for You */}
              {recommendedProducts.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">💚 Recommended for You</span>
                    <button onClick={() => { setActiveTab('categories'); setSelectedCategory('All'); }} className="text-xs text-[#22C55E] font-semibold hover:underline">View All</button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {recommendedProducts.map(prod => renderProductCard(prod))}
                  </div>
                </div>
              )}

              {/* Recently Viewed */}
              {recentlyViewed.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-sm text-slate-500">Recently Viewed Items</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 opacity-85">
                    {recentlyViewed.map(prod => renderProductCard(prod))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================= */}
          {/* CATEGORIES TAB           */}
          {/* ======================= */}
          {activeTab === 'categories' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Left filter panels */}
              <div className="md:col-span-1 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Departments</h3>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    <button 
                      onClick={() => setSelectedCategory('All')}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${selectedCategory === 'All' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                    >
                      <span>🌟 All Goods</span>
                      <span className="text-[10px] bg-slate-200 dark:bg-slate-800 py-0.5 px-2 rounded-md">{products.length}</span>
                    </button>

                    {CATEGORIES_LIST.map(cat => (
                      <button 
                        key={cat.name}
                        onClick={() => setSelectedCategory(cat.name)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${selectedCategory === cat.name ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                      >
                        <span>{cat.icon} {cat.name}</span>
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-800 py-0.5 px-2 rounded-md">
                          {products.filter(p => getProductCategory(p) === cat.name).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Brands</h3>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    <button 
                      onClick={() => setSelectedBrand('All')}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${selectedBrand === 'All' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                    >
                      <span>🏷️ All Brands</span>
                      <span className="text-[10px] bg-slate-200 dark:bg-slate-800 py-0.5 px-2 rounded-md">{products.length}</span>
                    </button>

                    {dynamicBrands.map(b => (
                      <button 
                        key={b.name}
                        onClick={() => setSelectedBrand(b.name)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${selectedBrand === b.name ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                      >
                        <div className="flex flex-col text-left">
                          <span>🏢 {b.name}</span>
                          <span className="text-[9px] text-slate-400 font-normal">Owner: {b.owner}</span>
                        </div>
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-800 py-0.5 px-2 rounded-md ml-1">
                          {products.filter(p => (p.brand || 'Generic').toLowerCase() === b.name.toLowerCase()).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Brand Owners</h3>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    <button 
                      onClick={() => setSelectedBrandOwner('All')}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${selectedBrandOwner === 'All' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                    >
                      <span>👑 All Owners</span>
                      <span className="text-[10px] bg-slate-200 dark:bg-slate-800 py-0.5 px-2 rounded-md">{products.length}</span>
                    </button>

                    {dynamicBrandOwners.map(owner => (
                      <button 
                        key={owner}
                        onClick={() => setSelectedBrandOwner(owner)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${selectedBrandOwner === owner ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                      >
                        <span>👑 {owner}</span>
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-800 py-0.5 px-2 rounded-md">
                          {products.filter(p => (p.brandOwner || 'Generic Owner').toLowerCase() === owner.toLowerCase()).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Instant Coupon Promo display */}
                <div className="bg-gradient-to-br from-orange-500/10 to-red-500/5 rounded-2xl p-4 border border-orange-500/20 text-xs">
                  <div className="flex items-center gap-1.5 text-[#F97316] font-bold">
                    <Tag className="w-4 h-4" />
                    <span>Active Saving Coupons</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="bg-white dark:bg-slate-900 border border-orange-500/20 p-2.5 rounded-xl">
                      <span className="font-mono text-[10px] font-bold text-[#F97316] bg-orange-500/15 py-0.5 px-2 rounded select-all">FESTIVAL25</span>
                      <p className="text-[10px] text-slate-500 mt-1">Get 25% OFF on groceries above ₹200.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right products output */}
              <div className="md:col-span-3 space-y-4">
                <div className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Showing <strong className="text-slate-700 dark:text-slate-200">{processedProducts.length}</strong> items
                    </span>
                    <div className="flex items-center gap-2 max-w-xs flex-1">
                      <input 
                        type="text" 
                        placeholder="Filter this list..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 py-1.5 px-3 rounded-xl text-xs bg-transparent"
                      />
                    </div>
                  </div>
                  
                  {/* Active filter badges row */}
                  {(selectedCategory !== 'All' || selectedBrand !== 'All' || selectedBrandOwner !== 'All') && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      {selectedCategory !== 'All' && (
                        <span className="inline-flex items-center gap-1 bg-[#22C55E]/10 text-[#22C55E] text-[10px] font-bold px-2.5 py-1 rounded-full border border-[#22C55E]/20">
                          Cat: {selectedCategory}
                          <button onClick={() => setSelectedCategory('All')} className="hover:text-red-500 font-extrabold ml-1">×</button>
                        </span>
                      )}
                      {selectedBrand !== 'All' && (
                        <span className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-indigo-500/20">
                          Brand: {selectedBrand}
                          <button onClick={() => setSelectedBrand('All')} className="hover:text-red-500 font-extrabold ml-1">×</button>
                        </span>
                      )}
                      {selectedBrandOwner !== 'All' && (
                        <span className="inline-flex items-center gap-1 bg-orange-500/10 text-orange-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-orange-500/20">
                          Owner: {selectedBrandOwner}
                          <button onClick={() => setSelectedBrandOwner('All')} className="hover:text-red-500 font-extrabold ml-1">×</button>
                        </span>
                      )}
                      <button 
                        onClick={() => {
                          setSelectedCategory('All');
                          setSelectedBrand('All');
                          setSelectedBrandOwner('All');
                        }}
                        className="text-[10px] text-red-500 hover:underline font-bold self-center ml-auto"
                      >
                        Reset Filters
                      </button>
                    </div>
                  )}
                </div>

                {processedProducts.length === 0 ? (
                  <div className="bg-slate-50 dark:bg-slate-900 p-12 text-center rounded-3xl border border-slate-100 dark:border-slate-800">
                    <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                    <h3 className="text-sm font-bold">No results found</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">We couldn't match any products in this specific department. Try searching general stores.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {processedProducts.map(p => renderProductCard(p))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================= */}
          {/* CART TAB                 */}
          {/* ======================= */}
          {activeTab === 'cart' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cart List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <ShoppingCart className="w-4 h-4 text-[#22C55E]" />
                    <span>Your Shopping Bag</span>
                  </h3>
                  <span className="text-xs text-slate-400">{userCart.length} Unique item types</span>
                </div>

                {userCart.length === 0 ? (
                  <div className="bg-slate-50 dark:bg-slate-900 p-12 text-center rounded-3xl border">
                    <ShoppingBag className="w-12 h-12 text-slate-350 mx-auto mb-3" />
                    <h4 className="font-bold text-sm text-slate-600 dark:text-slate-300">Your cart is currently empty</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Explore fresh vegetables, personal cares and grocery items to place your instant delivery order!</p>
                    <button 
                      onClick={() => { setActiveTab('home'); }}
                      className="mt-4 px-5 py-2 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                    >
                      Start Shopping
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userCart.map(item => {
                      const prod = products.find(p => p.id === item.productId);
                      if (!prod) return null;
                      return (
                        <div 
                          key={item.id} 
                          className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 group hover:border-[#22C55E]/20 transition relative overflow-hidden"
                        >
                          {/* Left Swipe to Delete style trigger */}
                          <button 
                            onClick={() => removeFromCart(prod.id)}
                            className="absolute right-3 top-3 text-slate-400 hover:text-red-500 transition p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20"
                            title="Remove from Cart"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          <img 
                            src={getProductImage(prod)} 
                            alt={prod.name} 
                            className="w-16 h-16 object-cover rounded-xl shrink-0" 
                            referrerPolicy="no-referrer"
                          />

                          <div className="flex-1 min-w-0 pr-6">
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest">{getProductCategory(prod)}</span>
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">{prod.name}</h4>
                            <p className="text-[10px] text-slate-550 dark:text-slate-400 font-mono mt-0.5">Size: {prod.packingSize || '1 Unit'}</p>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-xs font-bold text-[#22C55E]">₹{getProductPrice(prod)}</span>
                              {getProductOriginalPrice(prod) > getProductPrice(prod) && (
                                <span className="text-[10px] text-slate-400 line-through">₹{getProductOriginalPrice(prod)}</span>
                              )}
                            </div>
                          </div>

                          {/* Item Quantity controls */}
                          <div className="flex items-center gap-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shrink-0">
                            <button 
                              onClick={() => updateCartQuantity(prod.id, item.quantity - 1)}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                            <button 
                              onClick={() => updateCartQuantity(prod.id, item.quantity + 1)}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Order checkout parameters */}
              <div className="lg:col-span-1 space-y-4">
                {userCart.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-4">
                    <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400 border-b pb-2 dark:border-slate-800">Invoice Summary</h3>
                    
                    {/* Coupon Code section */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Have a promo coupon?</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="FESTIVAL25" 
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value)}
                          className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                        <button 
                          onClick={() => {
                            if (!couponInput) return;
                            const coupon = applyCoupon(couponInput.toUpperCase(), financials.subtotal);
                            if (coupon) {
                              setActiveCoupon(coupon);
                              addCustomAuditLog('COUPON_APPLIED', `Applied coupon: ${couponInput}`);
                            } else {
                              alert('Coupon is invalid or minimum cart value was not matched.');
                            }
                          }}
                          className="px-3 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white font-bold text-xs rounded-xl transition shrink-0"
                        >
                          Apply
                        </button>
                      </div>
                      {activeCoupon && (
                        <div className="flex items-center justify-between text-[11px] bg-[#22C55E]/10 text-[#22C55E] p-2 rounded-xl">
                          <span>Coupon Applied: <strong>{activeCoupon.code}</strong></span>
                          <button onClick={() => setActiveCoupon(null)} className="font-bold">&times;</button>
                        </div>
                      )}
                    </div>

                    {/* Partner Sponsor Code */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Sponsor Code (For Referral overrides)</label>
                      <input 
                        type="text" 
                        placeholder="E.g. SPONSOR99" 
                        value={referralSponsorCode}
                        onChange={(e) => setReferralSponsorCode(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs"
                      />
                      <span className="text-[9px] text-slate-450 block leading-tight">Attaching a valid sponsor code activates 10% instant checkout deductions & credits commission up to 5 levels deep.</span>
                    </div>

                    {/* Calculated Prices */}
                    <div className="space-y-2 text-xs border-t pt-3 dark:border-slate-800">
                      <div className="flex justify-between text-slate-500">
                        <span>Items Subtotal</span>
                        <span>₹{financials.subtotal}</span>
                      </div>
                      {financials.discount > 0 && (
                        <div className="flex justify-between text-[#F97316]">
                          <span>Coupon Reduction</span>
                          <span>-₹{financials.discount}</span>
                        </div>
                      )}
                      {financials.referralDiscount > 0 && (
                        <div className="flex justify-between text-lime-500">
                          <span>Sponsor Incentive</span>
                          <span>-₹{financials.referralDiscount}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-500">
                        <div>
                          <span>Delivery Partner Fee</span>
                          {(() => {
                            const finalAddress = customerAddresses.find(a => a.id === selectedAddressId) || customerAddresses.find(a => a.isDefault) || customerAddresses[0];
                            if (finalAddress && finalAddress.pincode) {
                              return <span className="block text-[9px] text-slate-400">Pincode: {finalAddress.pincode}</span>;
                            }
                            return <span className="block text-[9px] text-slate-400 font-medium">Default/No address selected</span>;
                          })()}
                        </div>
                        <span>{financials.deliveryFee === 0 ? <strong className="text-[#22C55E] uppercase text-[10px]">FREE</strong> : `₹${financials.deliveryFee}`}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold pt-2 border-t dark:border-slate-800">
                        <span>Final Bill</span>
                        <span className="text-[#22C55E]">₹{financials.total}</span>
                      </div>
                    </div>

                    {/* Action button */}
                    <button 
                      onClick={() => {
                        setCheckoutStep('address');
                      }}
                      className="w-full py-3 bg-[#22C55E] hover:bg-[#22C55E]/95 active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-green-500/10"
                    >
                      Proceed to Checkout
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================= */}
          {/* WISHLIST TAB             */}
          {/* ======================= */}
          {activeTab === 'wishlist' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                  <span>Your Favourites</span>
                </h3>
                <span className="text-xs text-slate-400">{wishlist.filter(w => w.userId === uId).length} Items saved</span>
              </div>

              {wishlist.filter(w => w.userId === uId).length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-900 p-12 text-center rounded-3xl border border-dashed">
                  <Heart className="w-12 h-12 text-slate-350 mx-auto mb-3" />
                  <h4 className="font-bold text-sm text-slate-600 dark:text-slate-300">Wishlist is empty</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Tap the heart symbol on any organic products to store them here for quick access later!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {products.filter(p => isInWishlist(p.id)).map(p => renderProductCard(p))}
                </div>
              )}
            </div>
          )}

          {/* ======================= */}
          {/* ACCOUNT & PROFILE TAB   */}
          {/* ======================= */}
          {activeTab === 'account' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Profile Sidebar */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl p-6 border text-center dark:border-slate-800 space-y-3">
                  <div className="w-20 h-20 rounded-full overflow-hidden mx-auto border-2 border-[#22C55E]">
                    <img src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&q=80'} alt="User Profile avatar" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">{currentUser?.name || 'VioneX Shopper Partner'}</h3>
                    <span className="text-[10px] bg-[#22C55E]/10 text-[#22C55E] py-0.5 px-2 rounded-full font-bold uppercase">{currentUser?.role || 'Referral Partner'}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{currentUser?.email || 'shopper@vionex.co.in'}</p>
                </div>

                {/* Vertical Account Sub-Navigation Menu */}
                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-2 border dark:border-slate-800 space-y-1">
                  {[
                    { id: 'profile', name: 'My Profile & Account', icon: Settings },
                    { id: 'orders', name: 'Purchase Orders', icon: FileText },
                    { id: 'referral', name: 'Referral & Earnings', icon: Award },
                    { id: 'wallet', name: 'Partner Wallet', icon: CreditCard },
                    { id: 'addresses', name: 'Manage Addresses', icon: MapPin },
                    { id: 'support', name: 'Help & FAQ Support', icon: HelpCircle },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => setAccountSubView(item.id as any)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition ${accountSubView === item.id ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span>{item.name}</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Main account views */}
              <div className="lg:col-span-3">
                {/* 1. Profile subview */}
                {accountSubView === 'profile' && (
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl p-6 border dark:border-slate-800 space-y-6">
                    <h3 className="font-bold text-sm border-b pb-2 dark:border-slate-800 uppercase tracking-wider text-slate-400">Account Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block mb-1">RECIPIENT CONTACT NAME</span>
                        <strong className="text-slate-850 dark:text-slate-100">{currentUser?.name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">EMAIL CORRESPONDENCE</span>
                        <strong className="text-slate-850 dark:text-slate-100">{currentUser?.email}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">ROLE ACCESS PROFILE</span>
                        <strong className="text-slate-850 dark:text-slate-100">{currentUser?.role}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">LOGISTICS PREFERENCE</span>
                        <strong className="text-emerald-500">10-15 Min Instant Node Delivery Enabled</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Orders subview */}
                {accountSubView === 'orders' && (
                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl flex items-center justify-between">
                      <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Order Logs & Dispatch Status</h3>
                    </div>

                    {salesOrders.filter(o => o.customerId === uId).length === 0 ? (
                      <div className="bg-slate-50 dark:bg-slate-900 p-8 text-center rounded-2xl">
                        <p className="text-xs text-slate-400">No active purchase orders found. Order fresh stocks to view!</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {salesOrders.filter(o => o.customerId === uId).map(order => (
                          <div key={order.id} className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border dark:border-slate-800 space-y-3">
                            <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
                              <div>
                                <span className="text-[10px] text-emerald-500 font-mono font-bold block">{order.orderNumber}</span>
                                <span className="text-[10px] text-slate-450">{new Date(order.createdAt).toLocaleDateString()}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.deliveryStatus === 'Delivered' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-orange-500/10 text-orange-500'}`}>
                                {order.deliveryStatus}
                              </span>
                            </div>

                            <div className="space-y-1">
                              {order.products.map((p, i) => (
                                <div key={i} className="flex justify-between text-xs">
                                  <span>{p.productName} <strong>x{p.quantity}</strong></span>
                                  <span>₹{p.price * p.quantity}</span>
                                </div>
                              ))}
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t dark:border-slate-800">
                              <span className="text-xs font-bold text-slate-500">Amount Charged</span>
                              <strong className="text-xs text-[#22C55E]">₹{order.totalValue}</strong>
                            </div>

                            {/* Tracking view button */}
                            <button 
                              onClick={() => setTrackingOrder(order)}
                              className="w-full mt-1.5 py-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 text-[#22C55E] text-xs font-bold rounded-lg transition"
                            >
                              Track Live Delivery
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Referral subview */}
                {accountSubView === 'referral' && (
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl p-6 border dark:border-slate-800 space-y-6">
                    <h3 className="font-bold text-sm border-b pb-2 dark:border-slate-800 uppercase tracking-wider text-[#22C55E]">Referral Partner Program</h3>
                    
                    {/* Sponsor Links & stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-750">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Your Sponsor Code</span>
                        <div className="flex items-center justify-between">
                          <strong className="text-lg font-mono text-[#22C55E]">VIONEXPARTNER9</strong>
                          <button onClick={() => alert('Referral link copied to clipboard!')} className="p-1 hover:bg-slate-100 rounded">
                            <Share2 className="w-4 h-4 text-slate-500" />
                          </button>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-750">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Direct Commission L1</span>
                        <strong className="text-lg text-lime-500">10.0%</strong>
                      </div>

                      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-750">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Level commissions</span>
                        <strong className="text-xs text-orange-500 block mt-1">L2 (5.0%) | L3 (2.0%) | L4 (1.0%) | L5 (0.5%)</strong>
                      </div>
                    </div>

                    {/* QR Code and Sponsor Invitation */}
                    <div className="flex flex-col md:flex-row gap-6 items-center bg-white dark:bg-slate-800 p-4 rounded-2xl border">
                      <div className="p-2 bg-slate-50 dark:bg-white rounded-xl shrink-0">
                        <QrCode className="w-24 h-24 text-slate-800" />
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100">Invite Friends & Earn Override Commission</h4>
                        <p className="text-slate-450 leading-relaxed">Let sponsors register under your active level chain. Earn overrides instantly for every grocery checkout they finish inside the VioneX storefront.</p>
                        <button 
                          onClick={() => alert('Sponsor invitation links dispatched to WhatsApp nodes.')}
                          className="px-4 py-1.5 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white rounded-lg text-[10px] font-bold uppercase transition"
                        >
                          Disseminate Sponsor Link
                        </button>
                      </div>
                    </div>

                    {/* REFERRAL TREE VISUALIZATION */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Your Active Multi-Tier Chain Tree</h4>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border text-xs space-y-4">
                        {/* Parent Sponsor Root node */}
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] font-bold">L0</div>
                          <div>
                            <strong className="block text-slate-700 dark:text-slate-200">You (Partner Root)</strong>
                            <span className="text-[10px] text-slate-400">Direct referral discount node</span>
                          </div>
                        </div>

                        {/* Staggered levels */}
                        <div className="pl-6 border-l-2 border-dashed border-slate-200 dark:border-slate-700 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-lime-500/10 flex items-center justify-center text-lime-500 font-bold">L1</div>
                            <div>
                              <strong className="block text-slate-700 dark:text-slate-200">Sponsor Node: Arjun K.</strong>
                              <span className="text-[10px] text-slate-400">10% commission on orders</span>
                            </div>
                          </div>

                          <div className="pl-6 border-l-2 border-dashed border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 font-bold">L2</div>
                              <div>
                                <strong className="block text-slate-700 dark:text-slate-200">Indirect Sponsor: Preeti S.</strong>
                                <span className="text-[10px] text-slate-400">5% override commission</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* MONTHLY EARNINGS CHART (Sleek CSS horizontal bar graph) */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Monthly Commision Earnings Trend</h4>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border text-xs space-y-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span>May 2026</span>
                            <span>₹1,850</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-[#22C55E] h-full rounded-full" style={{ width: '45%' }}></div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span>June 2026</span>
                            <span>₹3,400</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-[#22C55E] h-full rounded-full" style={{ width: '80%' }}></div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span>July 2026 (M-T-D)</span>
                            <span>₹1,200</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-[#22C55E] h-full rounded-full" style={{ width: '30%' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Wallet subview */}
                {accountSubView === 'wallet' && (
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl p-6 border dark:border-slate-800 space-y-6">
                    <h3 className="font-bold text-sm border-b pb-2 dark:border-slate-800 uppercase tracking-wider text-slate-400">E-Commerce Partner Wallet</h3>
                    
                    <div className="bg-gradient-to-br from-[#22C55E] to-lime-600 text-white p-6 rounded-3xl shadow-md flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-emerald-100">Available Wallet Balance</span>
                        <h2 className="text-3xl font-bold tracking-tight">₹4,250.00</h2>
                        <span className="text-[9px] text-emerald-100 block">Pending Clearance: ₹450.00</span>
                      </div>
                      <button 
                        onClick={() => {
                          alert('Disbursement request submitted!');
                          addCustomAuditLog('WALLET_DISBURSE', 'Requested wallet disburse: ₹4250.00');
                        }}
                        className="px-5 py-2.5 bg-white text-[#22C55E] rounded-2xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 active:scale-95 transition shrink-0"
                      >
                        Request Disburse
                      </button>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Wallet Credit/Debit Ledger</h4>
                      <div className="bg-white dark:bg-slate-800 rounded-2xl border overflow-hidden">
                        <div className="p-3 border-b text-[10px] text-slate-400 uppercase font-bold flex justify-between bg-slate-50 dark:bg-slate-900 dark:border-slate-700">
                          <span>Transaction details</span>
                          <span>Value</span>
                        </div>
                        <div className="divide-y text-xs dark:divide-slate-700">
                          <div className="p-3 flex justify-between">
                            <div>
                              <strong className="block text-slate-700 dark:text-slate-200">Arjun K. L1 Checkout Override</strong>
                              <span className="text-[10px] text-slate-400">Jul 05, 2026 - Commission ID: CM-99122</span>
                            </div>
                            <strong className="text-[#22C55E]">+₹180.00</strong>
                          </div>

                          <div className="p-3 flex justify-between">
                            <div>
                              <strong className="block text-slate-700 dark:text-slate-200">Instant UPI Bank Transfer Disburse</strong>
                              <span className="text-[10px] text-slate-400">Jun 30, 2026 - REF: BANK-X9021</span>
                            </div>
                            <strong className="text-red-500">-₹1,500.00</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Addresses subview */}
                {accountSubView === 'addresses' && (
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl p-6 border dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
                      <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Saved Addresses</h3>
                      <button 
                        onClick={() => setShowAddressForm(!showAddressForm)}
                        className="text-xs text-[#22C55E] font-bold hover:underline"
                      >
                        + Add Address
                      </button>
                    </div>

                    {showAddressForm && (
                      <form onSubmit={handleAddAddressSubmit} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border space-y-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase">New Address Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input required type="text" placeholder="Recipient Name" value={addressName} onChange={(e) => setAddressName(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent" />
                          <input required type="tel" placeholder="Mobile Number" value={addressPhone} onChange={(e) => setAddressPhone(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent" />
                          <input required type="text" placeholder="Address Line 1" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent md:col-span-2" />
                          <input required type="text" placeholder="City" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent" />
                          <input required type="text" placeholder="State" value={addressState} onChange={(e) => setAddressState(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent" />
                          <input required type="text" placeholder="Pincode" value={addressPincode} onChange={(e) => setAddressPincode(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent" />
                        </div>
                        <button type="submit" className="px-4 py-2 bg-[#22C55E] text-white text-xs font-bold rounded-xl hover:bg-[#22C55E]/90 transition">Save Address</button>
                      </form>
                    )}

                    <div className="space-y-3">
                      {customerAddresses.length === 0 ? (
                        <p className="text-xs text-slate-400">No saved addresses found. Register a node to complete checkout orders quickly.</p>
                      ) : (
                        customerAddresses.map(addr => (
                          <div key={addr.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border text-xs flex justify-between items-start">
                            <div>
                              <strong className="block text-slate-700 dark:text-slate-200">{addr.name} ({addr.mobileNumber})</strong>
                              <p className="text-slate-450 mt-1">{addr.addressLine}, {addr.city}, {addr.state} - {addr.pincode}</p>
                              {addr.isDefault && <span className="inline-block mt-2 text-[9px] bg-[#22C55E]/15 text-[#22C55E] py-0.5 px-2 rounded font-bold uppercase">DEFAULT ADDRESS</span>}
                            </div>
                            <button onClick={() => deleteCustomerAddress(addr.id)} className="text-slate-400 hover:text-red-500 transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 6. Help Support subview */}
                {accountSubView === 'support' && (
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl p-6 border dark:border-slate-800 space-y-4">
                    <h3 className="font-bold text-sm border-b pb-2 dark:border-slate-800 uppercase tracking-wider text-slate-400">Help & FAQ Live Agent</h3>
                    
                    {/* Simulated Support Chat */}
                    <div className="border rounded-2xl bg-white dark:bg-slate-800 overflow-hidden h-72 flex flex-col justify-between">
                      <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
                        {helpMessages.map((msg, i) => (
                          <div key={i} className={`max-w-xs p-2.5 rounded-xl ${msg.sender === 'user' ? 'bg-[#22C55E] text-white ml-auto' : 'bg-slate-100 dark:bg-slate-750 text-slate-700 dark:text-slate-300'}`}>
                            {msg.text}
                          </div>
                        ))}
                      </div>

                      <form onSubmit={handleSendHelpMessage} className="p-3 border-t dark:border-slate-700 flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Type your question..." 
                          value={helpInput}
                          onChange={(e) => setHelpInput(e.target.value)}
                          className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                        <button type="submit" className="p-2 bg-[#22C55E] text-white rounded-xl hover:bg-[#22C55E]/90 transition">
                          <Send className="w-4 h-4" />
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= */}
      {/* 5-TAB BOTTOM NAVIGATION */}
      {/* ======================= */}
      <div className={`fixed ${currentUser?.role === 'Referral Team' ? 'bottom-[148px]' : 'bottom-[58px]'} left-0 right-0 md:hidden bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 py-2.5 px-6 flex justify-around items-center z-40 max-w-7xl mx-auto rounded-t-3xl shadow-[0_-8px_30px_rgb(0,0,0,0.06)]`}>
        {[
          { id: 'home', label: 'Home', icon: '🏠' },
          { id: 'categories', label: 'Categories', icon: '📂' },
          { id: 'cart', label: 'Cart', icon: '🛒', count: userCart.reduce((sum, item) => sum + item.quantity, 0) },
          { id: 'wishlist', label: 'Wishlist', icon: '❤️' },
          { id: 'account', label: 'Account', icon: '👤' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex flex-col items-center gap-1 relative py-1 px-3 rounded-2xl transition cursor-pointer ${activeTab === tab.id ? 'text-[#22C55E] scale-105' : 'text-slate-400'}`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px] font-bold tracking-tight">{tab.label}</span>
            
            {/* Cart Floating count badge */}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#22C55E] text-white font-black text-[9px] w-5 h-5 rounded-full flex items-center justify-center animate-bounce shadow-md">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ======================= */}
      {/* PRODUCT CARD RENDERER   */}
      {/* ======================= */}
      {/* PRODUCT DETAIL MODAL    */}
      {/* ======================= */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 relative animate-in zoom-in duration-200 space-y-6">
            <button 
              onClick={() => setSelectedProduct(null)} 
              className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Photo carousel row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="h-56 bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden relative">
                <img 
                  src={getProductImage(selectedProduct)} 
                  alt={selectedProduct.name} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
                <span className="absolute bottom-3 left-3 bg-black/65 text-white text-[10px] font-bold py-1 px-2.5 rounded-full">
                  Image 1 of 3
                </span>
              </div>

              <div className="space-y-4">
                <span className="text-[10px] font-bold bg-[#22C55E]/10 text-[#22C55E] py-1 px-3 rounded-full">
                  {getProductCategory(selectedProduct)}
                </span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{selectedProduct.name}</h3>
                
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-lg font-bold text-[#22C55E]">₹{getProductPrice(selectedProduct)}</span>
                  {getProductOriginalPrice(selectedProduct) > getProductPrice(selectedProduct) && (
                    <span className="text-slate-400 line-through">MRP ₹{getProductOriginalPrice(selectedProduct)}</span>
                  )}
                  {getProductOriginalPrice(selectedProduct) > getProductPrice(selectedProduct) && (
                    <span className="text-[#F97316] font-bold text-[11px]">
                      (Save ₹{getProductOriginalPrice(selectedProduct) - getProductPrice(selectedProduct)})
                    </span>
                  )}
                </div>

                <div className="text-xs space-y-2 border-y py-3 dark:border-slate-800">
                  <p className="text-slate-550 dark:text-slate-400 leading-relaxed">
                    {selectedProduct.notes || "Grown locally using sustainable organic methods. This farm-fresh harvest is selected to guarantee maximum nutritional retention and authentic taste."}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    <strong>Ingredients:</strong> 100% Organic, Natural, No synthetic pesticides or growth promoters used.
                  </p>
                </div>

                {/* Delivery timelines and partner commission previews */}
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-[10px] space-y-1 text-slate-500">
                  <div className="flex justify-between">
                    <span>Estimated Arrival:</span>
                    <strong className="text-emerald-500">10-15 Minutes (Instant Node)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Partner Referral Override L1:</span>
                    <strong className="text-lime-500">₹{Math.round(getProductPrice(selectedProduct) * 0.1 * 100) / 100} Override</strong>
                  </div>
                </div>

                {/* Sticky Add / Buy buttons at bottom details */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      addToCart(selectedProduct.id, 1);
                      addCustomAuditLog('PRODUCT_ADDED_TO_CART', `Added ${selectedProduct.name} via details view.`);
                      setSelectedProduct(null);
                    }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer text-center"
                  >
                    Add to Cart
                  </button>
                  <button
                    onClick={() => {
                      addToCart(selectedProduct.id, 1);
                      setSelectedProduct(null);
                      setActiveTab('cart');
                      setCheckoutStep('address');
                    }}
                    className="flex-1 py-3 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white font-bold text-xs rounded-xl transition cursor-pointer text-center"
                  >
                    Buy Now
                  </button>
                </div>
              </div>
            </div>

            {/* Reviews list inside detail */}
            <div className="border-t pt-4 dark:border-slate-800">
              <ProductReviewsSection 
                product={selectedProduct}
                updateProduct={updateProduct}
                productReviews={productReviews}
                addProductReview={addProductReview}
                currentUser={currentUser}
              />
            </div>
          </div>
        </div>
      )}

      {/* ================================== */}
      {/* STEP-BY-STEP CHECKOUT OVERLAY    */}
      {/* ================================== */}
      {checkoutStep !== 'cart' && checkoutStep !== 'confirmed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-3xl w-full max-w-lg p-6 relative animate-in zoom-in duration-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setCheckoutStep('cart')} 
              className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Progress indicator */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">CHECKOUT PROGRESS</span>
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span className={checkoutStep === 'address' ? 'text-[#22C55E]' : ''}>1. ADDRESS</span>
                <span className={checkoutStep === 'payment' ? 'text-[#22C55E]' : ''}>2. PAYMENT</span>
                <span className={checkoutStep === 'review' ? 'text-[#22C55E]' : ''}>3. ORDER REVIEW</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-[#22C55E] h-full transition-all duration-300"
                  style={{
                    width: checkoutStep === 'address' ? '33.33%' :
                           checkoutStep === 'payment' ? '66.66%' : '100%'
                  }}
                ></div>
              </div>
            </div>

            {/* CHECKOUT STEP 1: ADDRESS SELECTION */}
            {checkoutStep === 'address' && (
              <div className="space-y-4">
                <h3 className="font-bold text-sm">Select Delivery Address</h3>
                
                {customerAddresses.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400">No addresses registered. Please create a fresh address below.</p>
                    <form onSubmit={handleAddAddressSubmit} className="space-y-2 border p-4 rounded-2xl bg-slate-50 dark:bg-slate-800">
                      <input required type="text" placeholder="Recipient Name" value={addressName} onChange={(e) => setAddressName(e.target.value)} className="w-full p-2 border rounded-xl text-xs bg-transparent" />
                      <input required type="tel" placeholder="Mobile" value={addressPhone} onChange={(e) => setAddressPhone(e.target.value)} className="w-full p-2 border rounded-xl text-xs bg-transparent" />
                      <input required type="text" placeholder="Street details" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className="w-full p-2 border rounded-xl text-xs bg-transparent" />
                      <div className="grid grid-cols-3 gap-2">
                        <input required type="text" placeholder="City" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent" />
                        <input required type="text" placeholder="State" value={addressState} onChange={(e) => setAddressState(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent" />
                        <input required type="text" placeholder="Pin" value={addressPincode} onChange={(e) => setAddressPincode(e.target.value)} className="p-2 border rounded-xl text-xs bg-transparent" />
                      </div>
                      <button type="submit" className="w-full py-2 bg-[#22C55E] text-white text-xs font-bold rounded-xl">Save & Use Address</button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customerAddresses.map(addr => (
                      <button 
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`w-full text-left p-4 rounded-2xl border text-xs flex items-start gap-3 transition ${selectedAddressId === addr.id || (!selectedAddressId && addr.isDefault) ? 'border-[#22C55E] bg-[#22C55E]/5' : 'border-slate-100 dark:border-slate-800'}`}
                      >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${selectedAddressId === addr.id || (!selectedAddressId && addr.isDefault) ? 'border-[#22C55E] bg-[#22C55E]' : 'border-slate-300'}`}>
                          {(selectedAddressId === addr.id || (!selectedAddressId && addr.isDefault)) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div>
                          <strong className="block text-slate-800 dark:text-slate-200">{addr.name} ({addr.mobileNumber})</strong>
                          <p className="text-slate-500 mt-1">{addr.addressLine}, {addr.city}, {addr.state} - {addr.pincode}</p>
                        </div>
                      </button>
                    ))}
                    <button 
                      onClick={() => setCheckoutStep('payment')}
                      className="w-full py-3 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white rounded-xl text-xs font-bold uppercase tracking-wide cursor-pointer"
                    >
                      Use Selected Address
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CHECKOUT STEP 3: PAYMENT SCREEN */}
            {checkoutStep === 'payment' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="font-bold text-sm">Choose Payment Method</h3>
                  <strong className="text-xs text-[#22C55E]">To Pay: ₹{financials.total}</strong>
                </div>

                <div className="space-y-2.5 text-xs">
                  {paymentChannels.map(pay => {
                    return (
                      <button
                        key={pay.id}
                        onClick={() => setSelectedPayment(pay.id)}
                        className={`w-full text-left p-4 rounded-2xl border flex items-start gap-3 transition ${selectedPayment === pay.id ? 'border-[#22C55E] bg-[#22C55E]/5' : 'border-slate-100 dark:border-slate-800'}`}
                      >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${selectedPayment === pay.id ? 'border-[#22C55E] bg-[#22C55E]' : 'border-slate-300'}`}>
                          {selectedPayment === pay.id && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div>
                          <strong className="block text-slate-800 dark:text-slate-100">{pay.name}</strong>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{pay.subtitle}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* TRUST INDICATORS */}
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-[10px] text-slate-550 flex justify-between items-center border">
                  <span className="flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-[#22C55E]" /> Secure Payment</span>
                  <span>SSL Protected</span>
                  <span>Fast 100% Refunds</span>
                </div>

                <button 
                  onClick={() => setCheckoutStep('review')}
                  className="w-full py-3 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Proceed to Final Review
                </button>
              </div>
            )}

            {/* CHECKOUT STEP 4: ORDER REVIEW */}
            {checkoutStep === 'review' && (
              <div className="space-y-4 text-xs">
                <h3 className="font-bold text-sm">Review & Place Order</h3>
                
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-800 space-y-3">
                  <div>
                    <span className="text-slate-400 block mb-0.5 uppercase text-[9px] font-bold">Payment Channel</span>
                    <strong>
                      {paymentChannels.find(ch => ch.id === selectedPayment)?.name || (selectedPayment === 'payu' ? 'PayU Secure Gateway' : 'Cash on Delivery')}
                    </strong>
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3 dark:border-slate-800">
                  <div className="flex justify-between">
                    <span>Items Total</span>
                    <span>₹{financials.subtotal}</span>
                  </div>
                  {financials.discount > 0 && (
                    <div className="flex justify-between text-[#F97316]">
                      <span>Coupon reduction</span>
                      <span>-₹{financials.discount}</span>
                    </div>
                  )}
                  {financials.referralDiscount > 0 && (
                    <div className="flex justify-between text-[#84CC16]">
                      <span>Referral reward discount</span>
                      <span>-₹{financials.referralDiscount}</span>
                    </div>
                  )}
                   <div className="flex justify-between items-center text-xs">
                     <div>
                       <span>Delivery fee</span>
                       {(() => {
                         const finalAddress = customerAddresses.find(a => a.id === selectedAddressId) || customerAddresses.find(a => a.isDefault) || customerAddresses[0];
                         if (finalAddress && finalAddress.pincode) {
                           return <span className="block text-[9px] text-slate-400">Pincode: {finalAddress.pincode}</span>;
                         }
                         return <span className="block text-[9px] text-slate-400 font-medium">Default/No address selected</span>;
                       })()}
                     </div>
                     <span className="font-semibold">{financials.deliveryFee === 0 ? 'FREE' : `₹${financials.deliveryFee}`}</span>
                   </div>
                  <div className="flex justify-between font-bold text-sm text-[#22C55E] border-t pt-2 dark:border-slate-800">
                    <span>Amount Payable</span>
                    <span>₹{financials.total}</span>
                  </div>
                </div>

                {paymentSimulationError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-medium animate-pulse">
                    ⚠️ {paymentSimulationError}
                  </div>
                )}

                <button 
                  onClick={handlePlaceOrder}
                  disabled={isInitiatingPayment}
                  className="w-full py-3 bg-[#22C55E] hover:bg-[#22C55E]/90 disabled:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg shadow-green-500/10 flex items-center justify-center gap-2"
                >
                  {isInitiatingPayment ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Initiating Payment...</span>
                    </>
                  ) : (
                    <span>Place Order & Pay ₹{financials.total}</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHECKOUT STEP 5: CONFIRMED OVERLAY */}
      {checkoutStep === 'confirmed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-3xl w-full max-w-md p-8 text-center relative animate-in zoom-in duration-200 space-y-6">
            <div className="w-16 h-16 rounded-full bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] mx-auto animate-pulse">
              <Check className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold">Instant Order Confirmed!</h3>
              <p className="text-xs text-slate-400">Your VioneX storefront order was dispatched to nearby fulfillment nodes. Delivery partner will arrive shortly!</p>
            </div>

            {/* Coupon reward reveal */}
            <div className="bg-[#22C55E]/5 border border-[#22C55E]/20 p-4 rounded-2xl text-xs space-y-1 text-slate-600 dark:text-slate-350">
              <div className="flex justify-between font-bold">
                <span>Multi-Tier Override Commission:</span>
                <span className="text-[#22C55E]">Disbursed L1-L5 successfully</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Sponsor wallet credited instantly under automated core ledger rules.</p>
            </div>

            <button
              onClick={() => {
                setCheckoutStep('cart');
                setActiveTab('account');
                setAccountSubView('orders');
              }}
              className="w-full py-3 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Track Deliveries
            </button>
          </div>
        </div>
      )}

      {/* ================================== */}
      {/* ORDER TRACKING TIMELINE MODAL      */}
      {/* ================================== */}
      {trackingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-3xl w-full max-w-md p-6 relative animate-in zoom-in duration-200 space-y-6">
            <button 
              onClick={() => setTrackingOrder(null)} 
              className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="text-[9px] font-mono text-slate-400 uppercase">LIVE DISPATCH TRACKING</span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{trackingOrder.orderNumber}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Logistics: VioneX instant delivery partner • Estimated arrival: <strong>12-14 mins</strong></p>
            </div>

            {/* VERTICAL TIMELINE */}
            <div className="space-y-6 pl-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800 text-xs">
              {[
                { label: 'Order Confirmed', time: '1 min ago', desc: 'Sponsor overrides & payment confirmed', isCheck: true },
                { label: 'Packed & Dispatched', time: 'Just now', desc: 'Fulfillment node complete packing staples', isCheck: true },
                { label: 'Shipped', time: 'En-route', desc: 'Delivery partner picked up shipment bag', isCheck: false },
                { label: 'Out for Delivery', time: 'Awaiting', desc: 'Partner approaches delivery geo coordinates', isCheck: false },
                { label: 'Delivered', time: 'Awaiting', desc: 'OTP verification & drop off complete', isCheck: false }
              ].map((step, idx) => (
                <div key={idx} className="relative pl-6 space-y-0.5">
                  <div className={`absolute left-[-22px] top-0.5 w-4.5 h-4.5 rounded-full border flex items-center justify-center ${step.isCheck ? 'bg-[#22C55E] border-[#22C55E]' : 'bg-white dark:bg-slate-800 border-slate-350'}`}>
                    {step.isCheck && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className="flex justify-between">
                    <strong className={step.isCheck ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}>{step.label}</strong>
                    <span className="text-[10px] text-slate-400">{step.time}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">{step.desc}</p>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setTrackingOrder(null)}
              className="w-full py-2.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/15 text-[#22C55E] text-xs font-bold rounded-xl transition"
            >
              Minimize Tracking Window
            </button>
          </div>
        </div>
      )}

      {/* ================================== */}
      {/* INTERACTIVE VOICE RECOGNITION POPUP */}
      {/* ================================== */}
      {isVoiceListening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-8 rounded-3xl text-center space-y-4 max-w-xs animate-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-full bg-[#22C55E]/20 flex items-center justify-center text-[#22C55E] mx-auto relative">
              <Mic className="w-8 h-8" />
              {/* Ripple animation dots */}
              <span className="absolute inset-0 rounded-full border border-[#22C55E] animate-ping opacity-60"></span>
            </div>
            <div>
              <h4 className="font-bold text-sm">Simulating Voice Search</h4>
              <p className="text-xs text-slate-400 mt-1">{voiceWaveText}</p>
            </div>
            {/* Listening Wave illustration */}
            <div className="flex justify-center gap-1 h-6 items-center">
              {[1, 2, 3, 4, 5, 6, 7].map(x => (
                <span 
                  key={x} 
                  className="w-1 bg-[#22C55E] rounded-full animate-bounce"
                  style={{
                    height: `${Math.floor(Math.random() * 16) + 8}px`,
                    animationDelay: `${x * 120}ms`
                  }}
                ></span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================== */}
      {/* SECURE IN-SCREEN PAYMENT PORTAL    */}
      {/* ================================== */}
      {showPaymentGatewaySimulator && activePaymentTx && (() => {
        const activePayuConfig = paymentGatewaySettings.find(c => c.gateway_name === 'PayU' && c.status === 'Enabled');
        const paymentLink = activePayuConfig?.merchant_key || 'payu_biz_node_vionex';
        const isExternalUrl = paymentLink.startsWith('http://') || paymentLink.startsWith('https://');

        // Dynamic local mock document if not a full external link
        const mockPayUHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="bg-[#ffffff] text-slate-800 p-6 flex flex-col justify-between h-screen select-none font-sans">
            <div class="space-y-5">
              <div class="flex items-center justify-between border-b border-green-200 pb-3">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-[#22c55e] flex items-center justify-center font-black text-white text-xs">Py</div>
                  <div>
                    <h1 class="text-xs font-extrabold tracking-tight text-slate-800 uppercase">PayU Secure Gateway</h1>
                    <p class="text-[9px] text-slate-500 font-mono">Sandbox Channel: ${paymentLink || 'payu_merchant_sandbox'}</p>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded bg-[#dcfce7] text-[#16a34a] font-mono text-[9px] font-bold">SECURE NODE</span>
              </div>

              <div class="bg-[#f0fdf4] border border-[#bbf7d0] p-4 rounded-xl space-y-2.5">
                <div class="flex justify-between items-center text-[11px]">
                  <span class="text-slate-500">Recipient Store</span>
                  <strong class="text-slate-800">VioneX Shopper Commerce</strong>
                </div>
                <div class="flex justify-between items-center text-[11px]">
                  <span class="text-slate-500">Order Ref ID</span>
                  <strong class="text-slate-800 font-mono">${activePaymentTx.orderId}</strong>
                </div>
                <div class="flex justify-between items-center text-[11px] border-t border-[#bbf7d0] pt-2">
                  <span class="text-slate-600 font-semibold">Total Invoice Amount</span>
                  <span class="text-xs font-black text-[#16a34a]">₹${activePaymentTx.amount}</span>
                </div>
              </div>

              <div class="space-y-2.5">
                <h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Simulated Checkout Methods</h3>
                <div class="grid grid-cols-2 gap-2.5 text-[11px]">
                  <div class="p-3 bg-white border border-[#bbf7d0] rounded-xl hover:border-[#22c55e] hover:bg-[#dcfce7]/30 transition cursor-pointer">
                    <span class="block font-semibold text-slate-700">💳 Card Checkout</span>
                    <span class="text-[9px] text-slate-500 block mt-0.5">Credit/Debit Cards</span>
                  </div>
                  <div class="p-3 bg-white border border-[#bbf7d0] rounded-xl hover:border-[#22c55e] hover:bg-[#dcfce7]/30 transition cursor-pointer">
                    <span class="block font-semibold text-slate-700">📲 Net Banking</span>
                    <span class="text-[9px] text-slate-500 block mt-0.5">All major Indian banks</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="border-t border-green-100 pt-3 text-center text-[9px] text-slate-400">
              This sandbox interface mimics standard redirect protocols for the PayU payment node.
            </div>
          </body>
          </html>
        `;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
            <div className="bg-white border border-[#bbf7d0] rounded-3xl w-full max-w-3xl overflow-hidden animate-in zoom-in duration-200 shadow-2xl flex flex-col my-8">
              
              {/* Header: Dynamic secure sandbox address bar */}
              <div className="p-4 bg-[#f0fdf4] border-b border-[#bbf7d0] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">
                    PayU Sandboxed Checkout Iframe
                  </span>
                  <button 
                    onClick={() => {
                      setShowPaymentGatewaySimulator(false);
                      setPaymentSimulationStatus('idle');
                      addCustomAuditLog('PAYMENT_CANCELLED', `User aborted checkout in ${activePaymentTx.gateway} simulator.`);
                    }} 
                    className="p-1 rounded-lg hover:bg-green-100 text-slate-500 hover:text-green-700 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Simulated browser address bar showing the payment handle field */}
                <div className="flex items-center gap-2 bg-white border border-green-200 px-3 py-1.5 rounded-xl text-slate-600 font-mono text-[10px] select-none">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#16a34a] shrink-0" />
                  <span className="text-[#16a34a] font-bold">https://</span>
                  <span className="truncate flex-1 text-slate-700">
                    {isExternalUrl ? paymentLink : `secure.payu.in/sandbox/checkout?handle=${paymentLink || 'default_vionex_merchant'}`}
                  </span>
                  <span className="text-[8px] bg-green-100 text-[#16a34a] px-1.5 py-0.5 rounded font-sans uppercase font-extrabold tracking-wider shrink-0">
                    SSL Encrypted
                  </span>
                </div>
              </div>

              {/* Simulation Verification Controls Toolbar */}
              <div className="bg-[#f0fdf4]/50 border-b border-[#bbf7d0] px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[9px] font-bold uppercase tracking-wider">Simulated Amount</span>
                  <span className="text-sm font-black text-slate-800">₹{activePaymentTx.amount}</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    disabled={paymentSimulationStatus === 'processing' || paymentSimulationStatus === 'success'}
                    onClick={() => handleVerifySimulation(false)}
                    className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition flex items-center gap-1.5 shadow-sm"
                  >
                    {paymentSimulationStatus === 'processing' ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>Verify Success</span>
                  </button>

                  <button
                    disabled={paymentSimulationStatus === 'processing' || paymentSimulationStatus === 'success'}
                    onClick={() => handleVerifySimulation(true)}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 border border-red-200 font-bold text-[10px] uppercase tracking-wider rounded-xl transition flex items-center gap-1.5"
                  >
                    <X className="w-3 h-3" />
                    <span>Decline / Fail</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowPaymentGatewaySimulator(false);
                      setPaymentSimulationStatus('idle');
                      addCustomAuditLog('PAYMENT_CANCELLED', 'User closed secure gateway frame.');
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[10px] uppercase tracking-wider rounded-xl transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Portal Content Viewport */}
              <div className="relative bg-white h-[480px]">
                {paymentSimulationStatus === 'processing' ? (
                  <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center text-center space-y-4">
                    <RefreshCw className="w-12 h-12 animate-spin text-[#22c55e]" />
                    <div className="space-y-1.5">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Verifying Secure Session</h4>
                      <p className="text-[10px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                        Querying PayU digital ledger callbacks for authorization token...
                      </p>
                    </div>
                  </div>
                ) : paymentSimulationStatus === 'success' ? (
                  <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-[#dcfce7] border border-[#bbf7d0] flex items-center justify-center text-[#16a34a] animate-bounce">
                      <Check className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <h4 className="font-bold text-[#16a34a] text-xs uppercase tracking-wider">Payment Confirmed</h4>
                      <p className="text-[10px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                        Transaction successfully completed! Returning to shopping storefront...
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {paymentSimulationError && (
                      <div className="p-3 bg-red-50 border-b border-red-200 text-red-600 text-[11px] font-medium flex items-center gap-2 animate-pulse absolute top-0 left-0 right-0 z-10">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        <span>⚠️ Simulation Notice: {paymentSimulationError}</span>
                      </div>
                    )}
                    
                    {/* Embedded Iframe containing either the configured Payment Handle URL or beautiful custom sandbox doc */}
                    <iframe
                      src={isExternalUrl ? paymentLink : undefined}
                      srcDoc={!isExternalUrl ? mockPayUHtml : undefined}
                      className="w-full h-full border-none bg-white rounded-b-3xl"
                      title="Secure PayU Merchant Sandbox Gateway"
                    />
                  </>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* ================================== */}
      {/* BARCODE SCANNER MOCK POPUP         */}
      {/* ================================== */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl text-center space-y-6 max-w-sm relative animate-in zoom-in duration-200">
            <button onClick={() => setShowScanner(false)} className="absolute top-4 right-4 text-slate-400">
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center justify-center gap-1">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>Simulating Barcode Camera</span>
              </h4>
              <p className="text-[10px] text-slate-400">Point device camera at any retail sticker barcode to auto-load product parameters.</p>
            </div>

            {/* Viewfinder with scanning laser line */}
            <div className="w-56 h-56 border-2 border-dashed border-orange-500 rounded-2xl mx-auto relative overflow-hidden bg-slate-950 flex items-center justify-center">
              {/* Scan green line */}
              {scannerPulse && (
                <div className="absolute left-0 right-0 h-0.5 bg-green-500 shadow-[0_0_8px_#22C55E] animate-bounce top-1/2"></div>
              )}
              <QrCode className="w-24 h-24 text-slate-800 opacity-60" />
            </div>

            <div className="text-[10px] text-slate-400 font-mono flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-500" />
              <span>Scanning Node Viewfinder...</span>
            </div>
          </div>
        </div>
      )}

      {/* SIMULATED FLOATING CHAT BUTTON */}
      <button 
        onClick={() => {
          setActiveTab('account');
          setAccountSubView('support');
          addCustomAuditLog('SUPPORT_CHAT_OPENED', 'Opened instant help drawer to query support partners.');
        }}
        className="fixed bottom-20 right-6 z-40 p-4 bg-[#22C55E] text-white rounded-full shadow-2xl hover:bg-[#22C55E]/90 active:scale-95 transition"
        title="Live support"
      >
        <HelpCircle className="w-6 h-6" />
      </button>
    </div>
  );
}
