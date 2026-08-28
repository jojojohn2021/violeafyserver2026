import React, { useState, useRef, useEffect } from 'react';
import { useCRM } from '../store';
import { ProductPerformance, CustomerPerformance } from '../types';
import ProductReviewsSection from './ProductReviewsSection';
import { uploadFileToStorage, uploadProductImage } from '../utils/storageUpload';
import { auth } from '../firebase';
import { 
  LineChart, ShoppingBag, Heart, BarChart3, TrendingUp, Grid, 
  Trash2, Plus, Edit, DollarSign, HelpCircle, Check, Award,
  Users, Tag, Building2, Search, FolderKanban, Sparkles,
  ChevronDown, X, ArrowUpDown, Filter, RefreshCw, AlertTriangle, Shield
} from 'lucide-react';

export const normalizeStringArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(item => String(item).trim()).filter(Boolean);
        }
      } catch {
        // Fall back to comma-separated
      }
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

export default function PerformanceTrackingView() {
  const { 
    hasAccess, products, updateProduct, addProduct, deleteProduct, customers, updateCustomer, addCustomer, salesOrders, clearAllData, recalculateAllMasterRecords,
    productReviews, addProductReview, currentUser,
    customCategories, setCustomCategories, categories, uploadCategoryPicture, createCategory, updateCategory, deleteCategory,
    brands, createBrand, updateBrand, deleteBrand, uploadBrandPicture,
    brandOwners, createBrandOwner, updateBrandOwner, deleteBrandOwner, uploadBrandOwnerPicture,
    customBrands, setCustomBrands,
    customBrandOwners, setCustomBrandOwners,
    units, createUnit, updateUnit, deleteUnit
  } = useCRM();

  // Selected sub-view
  const [panelTab, setPanelTab] = useState<'products' | 'customers' | 'stock' | 'analytics'>('products');

  // Sub-tab selection for Product portfolio master records
  const [productsSubTab, setProductsSubTab] = useState<'all' | 'categories' | 'brands' | 'owners' | 'units'>('all');

  // State for performance analytics sorting & sub-tabs
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'products' | 'customers' | 'ledger' | 'channels' | 'couriers'>('products');
  const [analyticsSearchQuery, setAnalyticsSearchQuery] = useState('');
  const [analyticsChannelFilter, setAnalyticsChannelFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('revenue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Master record inline editing
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const [editMasterNameVal, setEditMasterNameVal] = useState<string>('');
  const [editMasterOwnerVal, setEditMasterOwnerVal] = useState<string>('');

  // Master record search filters
  const [masterSearchQuery, setMasterSearchQuery] = useState<string>('');

  // Modals / forms for adding master records
  const [showAddMasterModal, setShowAddMasterModal] = useState<'category' | 'brand' | 'owner' | 'unit' | null>(null);
  const [newMasterName, setNewMasterName] = useState('');
  const [newMasterOwner, setNewMasterOwner] = useState('');
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Unit Master state
  const [newUnitDesc, setNewUnitDesc] = useState('');
  const [newUnitUqc, setNewUnitUqc] = useState('');
  const [unitError, setUnitError] = useState<string | null>(null);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editUnitDescVal, setEditUnitDescVal] = useState('');
  const [editUnitUqcVal, setEditUnitUqcVal] = useState('');
  const [deletingUnitId, setDeletingUnitId] = useState<string | null>(null);

  // Interactive inline editing variables for product matrices
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [deletingMasterId, setDeletingMasterId] = useState<string | null>(null);
  const [uploadingCategoryImageFor, setUploadingCategoryImageFor] = useState<string | null>(null);
  const [categoryImageError, setCategoryImageError] = useState<string | null>(null);
  const categoryImageInputRef = useRef<HTMLInputElement>(null);
  const [categoryImageUploadTarget, setCategoryImageUploadTarget] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editSku, setEditSku] = useState<string>('');
  const [editHsnCode, setEditHsnCode] = useState<string>('');
  const [editPackingSize, setEditPackingSize] = useState<string>('');
  const [editUnit, setEditUnit] = useState<string>('');
  const [editOnlinePrice, setEditOnlinePrice] = useState<number>(0);
  const [editShopPrice, setEditShopPrice] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editPicture, setEditPicture] = useState<string>('');
  const [editGstPercentage, setEditGstPercentage] = useState<number>(18);
  const [editStockIn, setEditStockIn] = useState<number>(0);
  const [editStockOut, setEditStockOut] = useState<number>(0);
  const [editVamjoWeblink, setEditVamjoWeblink] = useState<string>('');
  const [editAmazonWeblink, setEditAmazonWeblink] = useState<string>('');
  const [editFlipkartWeblink, setEditFlipkartWeblink] = useState<string>('');
  const [editMeeshoWeblink, setEditMeeshoWeblink] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editBrand, setEditBrand] = useState<string>('');
  const [editBrandOwner, setEditBrandOwner] = useState<string>('');
  const [editImages, setEditImages] = useState<string[]>([]);
  const [editImagesText, setEditImagesText] = useState<string>('');
  const [editVideos, setEditVideos] = useState<string[]>([]);
  const [editVideosText, setEditVideosText] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editIngredients, setEditIngredients] = useState<string>('');
  const [editSpecifications, setEditSpecifications] = useState<string>('');
  const [editVariants, setEditVariants] = useState<string>('');
  const [editStockAvailability, setEditStockAvailability] = useState<string>('In Stock');
  const [editOfferPrice, setEditOfferPrice] = useState<number>(0);
  const [editMrp, setEditMrp] = useState<number>(0);
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editRating, setEditRating] = useState<number>(5);
  const [editReviewsCount, setEditReviewsCount] = useState<number>(0);

  // New Category Master picture upload states
  const [newMasterCategoryFile, setNewMasterCategoryFile] = useState<File | null>(null);
  const [newMasterCategoryPreview, setNewMasterCategoryPreview] = useState<string>('');
  const [newMasterCategoryDescription, setNewMasterCategoryDescription] = useState<string>('');

  // New Brand & Brand Owner Master picture upload states
  const [newMasterBrandFile, setNewMasterBrandFile] = useState<File | null>(null);
  const [newMasterBrandPreview, setNewMasterBrandPreview] = useState<string>('');
  const [newMasterBrandDescription, setNewMasterBrandDescription] = useState<string>('');

  const [newMasterOwnerFile, setNewMasterOwnerFile] = useState<File | null>(null);
  const [newMasterOwnerPreview, setNewMasterOwnerPreview] = useState<string>('');
  const [newMasterOwnerDescription, setNewMasterOwnerDescription] = useState<string>('');

  // Upload picture targets
  const [brandImageUploadTarget, setBrandImageUploadTarget] = useState<string | null>(null);
  const [uploadingBrandImageFor, setUploadingBrandImageFor] = useState<string | null>(null);
  const brandImageInputRef = useRef<HTMLInputElement>(null);

  const [ownerImageUploadTarget, setOwnerImageUploadTarget] = useState<string | null>(null);
  const [uploadingOwnerImageFor, setUploadingOwnerImageFor] = useState<string | null>(null);
  const ownerImageInputRef = useRef<HTMLInputElement>(null);
 
  // New product addition
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodHsnCode, setProdHsnCode] = useState('');
  const [prodPackingSize, setProdPackingSize] = useState('500ml Bottle');
  const [prodUnit, setProdUnit] = useState('NOS');
  const [prodOnlinePrice, setProdOnlinePrice] = useState<number>(12);
  const [prodShopPrice, setProdShopPrice] = useState<number>(15);
  const [prodGstPercentage, setProdGstPercentage] = useState<number>(18);
  const [prodNotes, setProdNotes] = useState('');
  const [prodImageFile, setProdImageFile] = useState<File | null>(null);
  const [prodUploadId, setProdUploadId] = useState(() => `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [prodPicturePreview, setProdPicturePreview] = useState<string>('');
  const [prodPictureUrl, setProdPictureUrl] = useState<string>('');
  const [prodStockIn, setProdStockIn] = useState<number>(0);
  const [prodStockOut, setProdStockOut] = useState<number>(0);
  const [prodVamjoWeblink, setProdVamjoWeblink] = useState('');
  const [prodAmazonWeblink, setProdAmazonWeblink] = useState('');
  const [prodFlipkartWeblink, setProdFlipkartWeblink] = useState('');
  const [prodMeeshoWeblink, setProdMeeshoWeblink] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodBrand, setProdBrand] = useState('');
  const [prodBrandOwner, setProdBrandOwner] = useState('');
  const [prodImages, setProdImages] = useState<string[]>([]);
  const [prodImagesText, setProdImagesText] = useState('');
  const [prodVideos, setProdVideos] = useState<string[]>([]);
  const [prodVideosText, setProdVideosText] = useState<string>('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodIngredients, setProdIngredients] = useState('');
  const [prodSpecifications, setProdSpecifications] = useState('');
  const [prodVariants, setProdVariants] = useState('');
  const [prodStockAvailability, setProdStockAvailability] = useState('In Stock');
  const [prodOfferPrice, setProdOfferPrice] = useState<number>(0);
  const [prodMrp, setProdMrp] = useState<number>(0);
  const [prodDiscount, setProdDiscount] = useState<number>(0);
  const [prodRating, setProdRating] = useState<number>(5);
  const [prodReviewsCount, setProdReviewsCount] = useState<number>(0);

  const handleImageUploadAsync = async (file: File, callback: (downloadUrl: string) => void) => {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      alert('Please select an image smaller than 10MB.');
      return;
    }
    try {
      const upload = await uploadFileToStorage(file, `products/${prodUploadId}/images/${crypto.randomUUID()}`);
      callback(upload.downloadUrl);
    } catch (error) {
      console.error('Image upload failed', error);
      alert('Failed to upload image. Please try again.');
    }
  };

  const handleVideoUploadAsync = async (file: File, callback: (downloadUrl: string) => void) => {
    if (!file.type.startsWith('video/') || file.size > 50 * 1024 * 1024) {
      alert('Please select a video smaller than 50MB.');
      return;
    }
    try {
      const upload = await uploadFileToStorage(file, `products/${prodUploadId}/videos/${crypto.randomUUID()}`);
      callback(upload.downloadUrl);
    } catch (error) {
      console.error('Video upload failed', error);
      alert('Failed to upload video. Please try again.');
    }
  };

  // Combobox states for Product Creation
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [catSearchQuery, setCatSearchQuery] = useState('');
  const catDropdownRef = useRef<HTMLDivElement>(null);

  const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
  const [brandSearchQuery, setBrandSearchQuery] = useState('');
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const ownerDropdownRef = useRef<HTMLDivElement>(null);

  // Combobox states for Product Editing in Popup modal
  const [isEditCatDropdownOpen, setIsEditCatDropdownOpen] = useState(false);
  const [editCatSearchQuery, setEditCatSearchQuery] = useState('');
  const editCatDropdownRef = useRef<HTMLDivElement>(null);

  const [isEditBrandDropdownOpen, setIsEditBrandDropdownOpen] = useState(false);
  const [editBrandSearchQuery, setEditBrandSearchQuery] = useState('');
  const editBrandDropdownRef = useRef<HTMLDivElement>(null);

  const [isEditOwnerDropdownOpen, setIsEditOwnerDropdownOpen] = useState(false);
  const [editOwnerSearchQuery, setEditOwnerSearchQuery] = useState('');
  const editOwnerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target as Node)) {
        setIsCatDropdownOpen(false);
      }
      if (brandDropdownRef.current && !brandDropdownRef.current.contains(event.target as Node)) {
        setIsBrandDropdownOpen(false);
      }
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target as Node)) {
        setIsOwnerDropdownOpen(false);
      }
      if (editCatDropdownRef.current && !editCatDropdownRef.current.contains(event.target as Node)) {
        setIsEditCatDropdownOpen(false);
      }
      if (editBrandDropdownRef.current && !editBrandDropdownRef.current.contains(event.target as Node)) {
        setIsEditBrandDropdownOpen(false);
      }
      if (editOwnerDropdownRef.current && !editOwnerDropdownRef.current.contains(event.target as Node)) {
        setIsEditOwnerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Stock adjustment inputs & logs
  const [receiveAdjustments, setReceiveAdjustments] = useState<Record<string, number>>({});
  const [stockLogs, setStockLogs] = useState<{id: string, productName: string, sku: string, qty: number, date: string}[]>([]);

  const handleAddStockIn = (productId: string, qty: number) => {
    if (qty <= 0) return;
    const p = products.find(prod => prod.id === productId);
    if (!p) return;
    
    const currentStockIn = p.stockIn ?? p.stock ?? 0;
    const newStockIn = currentStockIn + qty;
    const newStock = p.stock + qty;
    
    updateProduct(productId, {
      stockIn: newStockIn,
      stock: newStock
    });
    
    const nowStr = new Date().toLocaleString();
    setStockLogs(prev => [
      {
        id: `log-${Date.now()}-${Math.random()}`,
        productName: p.name,
        sku: p.sku,
        qty: qty,
        date: nowStr
      },
      ...prev
    ]);
    
    setReceiveAdjustments(prev => ({
      ...prev,
      [productId]: 0
    }));
  };

  // Drag and drop image upload states
  const [dragActive, setDragActive] = useState(false);
  const [editDragActive, setEditDragActive] = useState(false);

  const handleEditDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setEditDragActive(true);
    } else if (e.type === "dragleave") {
      setEditDragActive(false);
    }
  };

  // Firebase Storage upload helper - validates and prepares file
  const validateAndPrepareFile = (file: File): File | null => {
    if (!file.type.startsWith('image/')) {
      alert('Only image files (.png, .jpg, .jpeg, .webp) are allowed.');
      return null;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert('File size must be less than 10MB.');
      return null;
    }
    return file;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const validatedFile = validateAndPrepareFile(e.dataTransfer.files[0]);
      if (validatedFile) {
        setProdImageFile(validatedFile);
        try {
          const url = URL.createObjectURL(validatedFile);
          setProdPicturePreview(url);
        } catch {}
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const validatedFile = validateAndPrepareFile(e.target.files[0]);
      if (validatedFile) {
        setProdImageFile(validatedFile);
        try {
          const url = URL.createObjectURL(validatedFile);
          setProdPicturePreview(url);
        } catch {}
      }
    }
  };

  // New customer addition
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [custName, setCustName] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custSpent, setCustSpent] = useState<number>(5000);
  const [custScore, setCustScore] = useState<number>(5);

  if (!hasAccess('Products & Clients', 'read')) {
    return (
      <div className="bg-rose-955/40 border border-[#4c1d24]/60 rounded-2xl p-8 text-center text-rose-205" id="access-denied-performance">
        <h3 className="font-bold text-lg mb-2 text-white">Security Authorization Required</h3>
        <p className="text-sm opacity-90">Your active role profile is unauthorized for database assets tracking. Switch to managers or Admin to read performance matrices.</p>
      </div>
    );
  }

  // Dynamic master arrays computed from active product data + DB records + custom created records
  const dynamicCategories = Array.from(new Set([
    ...categories.map(c => c.name),
    ...customCategories,
    ...products.map(p => p.category || 'Uncategorized')
  ])).filter(Boolean).sort();

  const dynamicBrands = Array.from(new Set([
    ...brands.map(b => b.name),
    ...customBrands.map(b => b.name),
    ...products.map(p => p.brand).filter(Boolean) as string[]
  ])).filter(Boolean).map(brandName => {
    const db = brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
    const cb = customBrands.find(c => c.name.toLowerCase() === brandName.toLowerCase());
    const pb = products.find(p => (p.brand || '').toLowerCase() === brandName.toLowerCase());
    return {
      name: brandName,
      owner: db?.owner || cb?.owner || pb?.brandOwner || ''
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const dynamicBrandOwners = Array.from(new Set([
    ...brandOwners.map(o => o.name),
    ...customBrandOwners,
    ...products.map(p => p.brandOwner).filter(Boolean) as string[],
    ...dynamicBrands.map(b => b.owner).filter(Boolean)
  ])).filter(Boolean).sort();

  const filteredCategories = dynamicCategories.filter(cat => 
    cat.toLowerCase().includes(catSearchQuery.toLowerCase())
  );

  const filteredBrands = dynamicBrands.filter(b => 
    b.name.toLowerCase().includes(brandSearchQuery.toLowerCase())
  );

  const filteredOwners = dynamicBrandOwners.filter(owner => 
    owner.toLowerCase().includes(ownerSearchQuery.toLowerCase())
  );

  const filteredEditCategories = dynamicCategories.filter(cat => 
    cat.toLowerCase().includes(editCatSearchQuery.toLowerCase())
  );

  const filteredEditBrands = dynamicBrands.filter(b => 
    b.name.toLowerCase().includes(editBrandSearchQuery.toLowerCase())
  );

  const filteredEditOwners = dynamicBrandOwners.filter(owner => 
    owner.toLowerCase().includes(editOwnerSearchQuery.toLowerCase())
  );

  const getProductVolume = (p: ProductPerformance) => {
    let volume = 0;
    salesOrders.forEach(order => {
      if (order.deliveryStatus === 'Cancelled') return;
      if (order.products) {
        order.products.forEach(item => {
          if (item.productId === p.id) {
            volume += (item.quantity || 0);
          }
        });
      }
    });
    return volume > 0 ? volume : (p.unitsSold || 0);
  };

  const getProductRevenue = (p: ProductPerformance) => {
    let revenue = 0;
    salesOrders.forEach(order => {
      if (order.deliveryStatus === 'Cancelled') return;
      if (order.products) {
        order.products.forEach(item => {
          if (item.productId === p.id) {
            const gstRate = item.gstPercentage !== undefined ? item.gstPercentage : (p.gstPercentage !== undefined ? p.gstPercentage : 18);
            const itemTotal = item.price * item.quantity;
            const gstAmount = itemTotal * (gstRate / (100 + gstRate));
            const baseValue = itemTotal - gstAmount;
            revenue += baseValue;
          }
        });
      }
    });
    if (revenue === 0) {
      const channelSum = (p.amazonSales ?? 0) + (p.flipkartSales ?? 0) + (p.meeshoSales ?? 0) + (p.vamjoSales ?? 0) + (p.whatsappSales ?? 0) + (p.countersaleSales ?? 0);
      return channelSum > 0 ? channelSum : (p.revenue || 0);
    }
    return revenue;
  };

  const getProductBrandOwner = (p: ProductPerformance) => {
    if (p.brandOwner && p.brandOwner.trim() !== '') return p.brandOwner;
    const brandName = p.brand || '';
    const matchedBrand = dynamicBrands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
    return (matchedBrand && matchedBrand.owner) ? matchedBrand.owner : (p.brandOwner || '');
  };

  // Helper functions to add/edit/delete masters
  const handleAddCategory = async (name: string, description?: string, file?: File | null) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (dynamicCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      alert("Category already exists!");
      return;
    }
    setCustomCategories(prev => [...prev, trimmed]);
    try {
      if (file) {
        await uploadCategoryPicture(trimmed, file);
      } else {
        await createCategory({ name: trimmed, description: description || '' });
      }
    } catch (err) {
      console.error('Failed to create category doc in DB:', err);
    }
  };

  const handleEditCategory = async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew.toLowerCase() === oldName.toLowerCase()) return;
    
    // Update products with matching category
    products.forEach(p => {
      if ((p.category || 'Uncategorized').toLowerCase() === oldName.toLowerCase()) {
        updateProduct(p.id, { category: trimmedNew });
      }
    });

    setCustomCategories(prev => {
      const filtered = prev.filter(c => c.toLowerCase() !== oldName.toLowerCase());
      return [...filtered, trimmedNew];
    });

    const existingCat = categories.find(c => c.name.toLowerCase() === oldName.toLowerCase());
    if (existingCat) {
      try {
        await updateCategory(existingCat.id, { name: trimmedNew });
      } catch (err) {
        console.error('Failed to update category doc in DB:', err);
      }
    } else {
      try {
        await createCategory({ name: trimmedNew });
      } catch (err) {
        console.error('Failed to save updated category doc in DB:', err);
      }
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    products.forEach(p => {
      if ((p.category || 'Uncategorized').toLowerCase() === catName.toLowerCase()) {
        updateProduct(p.id, { category: 'Uncategorized' });
      }
    });
    setCustomCategories(prev => prev.filter(c => c.toLowerCase() !== catName.toLowerCase()));

    const existingCat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
    if (existingCat) {
      try {
        await deleteCategory(existingCat.id);
      } catch (err) {
        console.error('Failed to delete category doc from DB:', err);
      }
    }
  };

  const getCategoryImage = (catName: string) => {
    return categories.find(c => c.name.toLowerCase() === catName.toLowerCase())?.imageUrl;
  };

  const handleCategoryImageClick = (catName: string) => {
    setCategoryImageUploadTarget(catName);
    categoryImageInputRef.current?.click();
  };

  const handleCategoryImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const catName = categoryImageUploadTarget;
    e.target.value = '';
    if (!file || !catName) return;

    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setCategoryImageError('Please select an image smaller than 10MB.');
      return;
    }

    try {
      setCategoryImageError(null);
      setUploadingCategoryImageFor(catName);
      await uploadCategoryPicture(catName, file);
    } catch (error) {
      console.error('Category image upload failed', error);
      setCategoryImageError('Failed to upload category picture. Please try again.');
    } finally {
      setUploadingCategoryImageFor(null);
      setCategoryImageUploadTarget(null);
    }
  };

  const handleAddBrand = async (name: string, owner: string, description?: string, file?: File | null) => {
    const bName = name.trim();
    const bOwner = owner.trim() || 'Generic Owner';
    if (!bName) return;
    if (dynamicBrands.some(b => b.name.toLowerCase() === bName.toLowerCase())) {
      alert("Brand already exists!");
      return;
    }
    setCustomBrands(prev => [...prev, { name: bName, owner: bOwner }]);
    if (!customBrandOwners.some(o => o.toLowerCase() === bOwner.toLowerCase())) {
      setCustomBrandOwners(prev => [...prev, bOwner]);
    }
    try {
      if (file) {
        await uploadBrandPicture(bName, file, bOwner);
      } else {
        await createBrand({ name: bName, owner: bOwner, description: description || '' });
      }
    } catch (err) {
      console.error('Failed to create brand doc in DB:', err);
    }
  };

  const handleEditBrand = async (oldName: string, newName: string, newOwner: string) => {
    const trimmedNew = newName.trim();
    const trimmedOwner = newOwner.trim() || 'Generic Owner';
    if (!trimmedNew) return;

    // Update products matching this brand
    products.forEach(p => {
      if ((p.brand || 'Generic').toLowerCase() === oldName.toLowerCase()) {
        updateProduct(p.id, { brand: trimmedNew, brandOwner: trimmedOwner });
      }
    });

    setCustomBrands(prev => {
      const filtered = prev.filter(b => b.name.toLowerCase() !== oldName.toLowerCase());
      return [...filtered, { name: trimmedNew, owner: trimmedOwner }];
    });

    if (!customBrandOwners.some(o => o.toLowerCase() === trimmedOwner.toLowerCase())) {
      setCustomBrandOwners(prev => [...prev, trimmedOwner]);
    }

    const existingBrand = brands.find(b => b.name.toLowerCase() === oldName.toLowerCase());
    if (existingBrand) {
      try {
        await updateBrand(existingBrand.id, { name: trimmedNew, owner: trimmedOwner });
      } catch (err) {
        console.error('Failed to update brand doc in DB:', err);
      }
    } else {
      try {
        await createBrand({ name: trimmedNew, owner: trimmedOwner });
      } catch (err) {
        console.error('Failed to create brand doc in DB:', err);
      }
    }
  };

  const handleDeleteBrand = async (brandName: string) => {
    products.forEach(p => {
      if ((p.brand || 'Generic').toLowerCase() === brandName.toLowerCase()) {
        updateProduct(p.id, { brand: 'Generic', brandOwner: 'Generic Owner' });
      }
    });
    setCustomBrands(prev => prev.filter(b => b.name.toLowerCase() !== brandName.toLowerCase()));

    const existingBrand = brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
    if (existingBrand) {
      try {
        await deleteBrand(existingBrand.id);
      } catch (err) {
        console.error('Failed to delete brand doc from DB:', err);
      }
    }
  };

  const getBrandImage = (brandName: string) => {
    return brands.find(b => b.name.toLowerCase() === brandName.toLowerCase())?.imageUrl;
  };

  const handleBrandImageClick = (brandName: string) => {
    setBrandImageUploadTarget(brandName);
    brandImageInputRef.current?.click();
  };

  const handleBrandImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const brandName = brandImageUploadTarget;
    e.target.value = '';
    if (!file || !brandName) return;

    try {
      setUploadingBrandImageFor(brandName);
      const existing = dynamicBrands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
      await uploadBrandPicture(brandName, file, existing?.owner || 'Generic Owner');
    } catch (error) {
      console.error('Brand image upload failed', error);
    } finally {
      setUploadingBrandImageFor(null);
      setBrandImageUploadTarget(null);
    }
  };

  const handleAddBrandOwner = async (name: string, description?: string, file?: File | null) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (dynamicBrandOwners.some(o => o.toLowerCase() === trimmed.toLowerCase())) {
      alert("Brand Owner already exists!");
      return;
    }
    setCustomBrandOwners(prev => [...prev, trimmed]);
    try {
      if (file) {
        await uploadBrandOwnerPicture(trimmed, file);
      } else {
        await createBrandOwner({ name: trimmed, description: description || '' });
      }
    } catch (err) {
      console.error('Failed to create brand owner doc in DB:', err);
    }
  };

  const handleEditBrandOwner = async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew.toLowerCase() === oldName.toLowerCase()) return;

    // Update products matching this brandOwner or derived brand owner
    products.forEach(p => {
      const currentOwner = getProductBrandOwner(p);
      if ((p.brandOwner || '').toLowerCase() === oldName.toLowerCase() || currentOwner.toLowerCase() === oldName.toLowerCase()) {
        updateProduct(p.id, { brandOwner: trimmedNew });
      }
    });

    // Update associated custom brands as well
    setCustomBrands(prev => prev.map(b => b.owner.toLowerCase() === oldName.toLowerCase() ? { ...b, owner: trimmedNew } : b));

    setCustomBrandOwners(prev => {
      const filtered = prev.filter(o => o.toLowerCase() !== oldName.toLowerCase());
      return [...filtered, trimmedNew];
    });

    const existingOwner = brandOwners.find(o => o.name.toLowerCase() === oldName.toLowerCase());
    if (existingOwner) {
      try {
        await updateBrandOwner(existingOwner.id, { name: trimmedNew });
      } catch (err) {
        console.error('Failed to update brand owner doc in DB:', err);
      }
    } else {
      try {
        await createBrandOwner({ name: trimmedNew });
      } catch (err) {
        console.error('Failed to create brand owner doc in DB:', err);
      }
    }
  };

  const handleDeleteBrandOwner = async (ownerName: string) => {
    const target = ownerName.trim().toLowerCase();
    products.forEach(p => {
      const currentOwner = getProductBrandOwner(p);
      if (
        (p.brandOwner || '').toLowerCase() === target ||
        currentOwner.toLowerCase() === target
      ) {
        updateProduct(p.id, { brandOwner: '' });
      }
    });
    // also update brands matching ownerName
    setCustomBrands(prev => prev.map(b => b.owner.toLowerCase() === target ? { ...b, owner: '' } : b));
    setCustomBrandOwners(prev => prev.filter(o => o.toLowerCase() !== target));

    const existingOwner = brandOwners.find(o => o.name.toLowerCase() === target);
    if (existingOwner) {
      try {
        await deleteBrandOwner(existingOwner.id);
      } catch (err) {
        console.error('Failed to delete brand owner doc from DB:', err);
      }
    }
  };

  const getBrandOwnerImage = (ownerName: string) => {
    return brandOwners.find(o => o.name.toLowerCase() === ownerName.toLowerCase())?.imageUrl;
  };

  const handleOwnerImageClick = (ownerName: string) => {
    setOwnerImageUploadTarget(ownerName);
    ownerImageInputRef.current?.click();
  };

  const handleOwnerImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const ownerName = ownerImageUploadTarget;
    e.target.value = '';
    if (!file || !ownerName) return;

    try {
      setUploadingOwnerImageFor(ownerName);
      await uploadBrandOwnerPicture(ownerName, file);
    } catch (error) {
      console.error('Brand owner image upload failed', error);
    } finally {
      setUploadingOwnerImageFor(null);
      setOwnerImageUploadTarget(null);
    }
  };

  // Handle Product pricing update
  const handleSavePricing = (id: string) => {
    if (!hasAccess('Products & Clients', 'edit')) return;

    if (!editHsnCode.trim()) {
      setSkuError('HSN Code is required.');
      return;
    }
    if (editMrp <= 0) {
      setSkuError('MRP is required and must be greater than zero.');
      return;
    }

    const cleanedSku = editSku.trim().toUpperCase();
    const isDuplicate = products.some(p => p.id !== id && p.sku.trim().toUpperCase() === cleanedSku);
    if (isDuplicate) {
      setSkuError(`SKU PREFIX "${cleanedSku}" is already taken by another product. SKU PREFIX must be unique.`);
      return;
    }

    setSkuError(null);
    const parsedEditImages = editImagesText.split(',').map(s => s.trim()).filter(Boolean);
    const parsedEditVideos = editVideosText.split(',').map(s => s.trim()).filter(Boolean);
    updateProduct(id, { 
      name: editName,
      sku: editSku,
      hsnCode: editHsnCode.trim(),
      packingSize: editPackingSize,
      unit: editUnit,
      onlinePrice: editOnlinePrice,
      shopPrice: editShopPrice,
      gstPercentage: editGstPercentage,
      notes: editNotes,
      stockIn: editStockIn,
      stockOut: editStockOut,
      stock: Math.max(0, editStockIn - editStockOut),
      vamjoWeblink: editVamjoWeblink,
      amazonWeblink: editAmazonWeblink,
      flipkartWeblink: editFlipkartWeblink,
      meeshoWeblink: editMeeshoWeblink,
      category: editCategory,
      brand: editBrand,
      brandOwner: editBrandOwner,
      images: parsedEditImages,
      videos: parsedEditVideos,
      description: editDescription,
      ingredients: editIngredients,
      specifications: editSpecifications,
      variants: editVariants,
      stockAvailability: editStockAvailability,
      offerPrice: editOfferPrice,
      mrp: editMrp,
      discount: editDiscount,
      rating: editRating,
      reviewsCount: editReviewsCount
    });
    setEditingProductId(null);
  };

  const handleStartProductEdit = (p: ProductPerformance) => {
    setSkuError(null);
    setEditingProductId(p.id);
    setEditName(p.name);
    setEditSku(p.sku);
    setEditHsnCode(p.hsnCode || '');
    setEditPackingSize(p.packingSize || '500ml Bottle');
    setEditUnit(p.unit || 'NOS');
    setEditOnlinePrice(p.onlinePrice || 0);
    setEditShopPrice(p.shopPrice || 0);
    setEditGstPercentage(p.gstPercentage ?? 18);
    setEditNotes(p.notes || '');
    setEditStockIn(p.stockIn ?? p.stock ?? 0);
    setEditStockOut(p.stockOut ?? getProductVolume(p) ?? 0);
    setEditVamjoWeblink(p.vamjoWeblink || '');
    setEditAmazonWeblink(p.amazonWeblink || '');
    setEditFlipkartWeblink(p.flipkartWeblink || '');
    setEditMeeshoWeblink(p.meeshoWeblink || '');
    setEditCategory(p.category || '');
    setEditBrand(p.brand || '');
    setEditBrandOwner(p.brandOwner || '');
    setEditCatSearchQuery(p.category || '');
    setEditBrandSearchQuery(p.brand || '');
    setEditOwnerSearchQuery(p.brandOwner || '');
    
    // Set image from Firebase Storage
    if (p.imageUrl) {
      setEditPicture(p.imageUrl);
    } else {
      setEditPicture('https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=80&auto=format&fit=crop&q=60');
    }
    
    // Set other fields safely
    const parsedImages = normalizeStringArray(p.images);
    setEditImages(parsedImages);
    setEditImagesText(parsedImages.join(', '));
    const parsedVideos = normalizeStringArray(p.videos);
    setEditVideos(parsedVideos);
    setEditVideosText(parsedVideos.join(', '));
    setEditDescription(p.description || p.notes || '');
    setEditIngredients(p.ingredients || '');
    setEditSpecifications(p.specifications || '');
    setEditVariants(p.variants || '');
    setEditStockAvailability(p.stockAvailability || (p.stock > 0 ? 'In Stock' : 'Out of Stock'));
    setEditOfferPrice(p.offerPrice ?? p.onlinePrice ?? 0);
    setEditMrp(p.mrp ?? p.shopPrice ?? 0);
    setEditDiscount(p.discount ?? (p.shopPrice && p.onlinePrice ? Math.max(0, Math.round(((p.shopPrice - p.onlinePrice) / p.shopPrice) * 100)) : 0));
    setEditRating(p.rating ?? 5);
    setEditReviewsCount(p.reviewsCount ?? 0);
  };

  // Handle custom product creation
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAccess('Products & Clients', 'create')) return;

    if (!prodName || !prodSku || !prodHsnCode.trim()) {
      setSkuError('HSN Code is required.');
      return;
    }
    if (prodMrp <= 0) {
      setSkuError('MRP is required and must be greater than zero.');
      return;
    }

    const cleanedSku = prodSku.trim().toUpperCase();
    const isDuplicate = products.some(p => p.sku.trim().toUpperCase() === cleanedSku);
    if (isDuplicate) {
      setSkuError(`SKU PREFIX "${cleanedSku}" is already taken. SKU PREFIX must be unique.`);
      return;
    }

    setSkuError(null);
    const parsedProdImages = prodImagesText.split(',').map(s => s.trim()).filter(Boolean);
    const parsedProdVideos = prodVideosText.split(',').map(s => s.trim()).filter(Boolean);

    // If a file has been selected, try multipart upload to /api/products with Auth token
    if (prodImageFile) {
      const fd = new FormData();
      fd.append('image', prodImageFile);
      fd.append('id', prodUploadId);
      fd.append('name', prodName);
      fd.append('sku', prodSku);
      fd.append('hsnCode', prodHsnCode.trim());
      fd.append('packingSize', prodPackingSize);
      fd.append('unit', prodUnit);
      fd.append('onlinePrice', String(prodOnlinePrice));
      fd.append('shopPrice', String(prodShopPrice));
      fd.append('gstPercentage', String(prodGstPercentage));
      fd.append('notes', prodNotes);
      fd.append('unitsSold', String(Math.round((prodOnlinePrice * 110 + prodShopPrice * 10) / (prodOnlinePrice || 1))));
      fd.append('revenue', String(Math.round(prodOnlinePrice * 40) + Math.round(prodOnlinePrice * 30) + Math.round(prodOnlinePrice * 20) + Math.round(prodOnlinePrice * 10) + Math.round(prodOnlinePrice * 10) + Math.round(prodShopPrice * 10)));
      fd.append('growthRate', String(15.0));
      fd.append('stock', String(Math.max(0, prodStockIn - prodStockOut)));
      fd.append('stockIn', String(prodStockIn));
      fd.append('stockOut', String(prodStockOut));
      fd.append('vamjoWeblink', prodVamjoWeblink);
      fd.append('amazonWeblink', prodAmazonWeblink);
      fd.append('flipkartWeblink', prodFlipkartWeblink);
      fd.append('meeshoWeblink', prodMeeshoWeblink);
      fd.append('category', prodCategory);
      fd.append('brand', prodBrand);
      fd.append('brandOwner', prodBrandOwner);
      fd.append('images', JSON.stringify(parsedProdImages));
      fd.append('videos', JSON.stringify(parsedProdVideos));
      fd.append('description', prodDescription || prodNotes);
      fd.append('ingredients', prodIngredients);
      fd.append('specifications', prodSpecifications);
      fd.append('variants', prodVariants);
      fd.append('stockAvailability', prodStockAvailability);
      fd.append('offerPrice', String(prodOfferPrice || prodOnlinePrice));
      fd.append('mrp', String(prodMrp || prodShopPrice));
      fd.append('discount', String(prodDiscount || (prodShopPrice && prodOnlinePrice ? Math.max(0, Math.round(((prodShopPrice - prodOnlinePrice) / prodShopPrice) * 100)) : 0)));
      fd.append('rating', String(prodRating));
      fd.append('reviewsCount', String(prodReviewsCount));

      try {
        const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: fd,
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.product) {
            await addProduct(data.product);
          }
        } else {
          // If server upload fails or 401s, fallback to uploading file via client storage and creating product
          const uploadRes = await uploadFileToStorage(prodImageFile, `products/${prodUploadId}/main.jpg`);
          await addProduct({
            name: prodName,
            sku: prodSku,
            hsnCode: prodHsnCode.trim(),
            packingSize: prodPackingSize,
            unit: prodUnit,
            onlinePrice: prodOnlinePrice,
            shopPrice: prodShopPrice,
            gstPercentage: prodGstPercentage,
            notes: prodNotes,
            unitsSold: Math.round((prodOnlinePrice * 110 + prodShopPrice * 10) / (prodOnlinePrice || 1)),
            revenue: Math.round(prodOnlinePrice * 40) + Math.round(prodOnlinePrice * 30) + Math.round(prodOnlinePrice * 20) + Math.round(prodOnlinePrice * 10) + Math.round(prodOnlinePrice * 10) + Math.round(prodShopPrice * 10),
            growthRate: 15.0,
            stock: Math.max(0, prodStockIn - prodStockOut),
            stockIn: prodStockIn,
            stockOut: prodStockOut,
            amazonSales: Math.round(prodOnlinePrice * 40),
            flipkartSales: Math.round(prodOnlinePrice * 30),
            meeshoSales: Math.round(prodOnlinePrice * 20),
            vamjoSales: Math.round(prodOnlinePrice * 10),
            whatsappSales: Math.round(prodOnlinePrice * 10),
            countersaleSales: Math.round(prodShopPrice * 10),
            vamjoWeblink: prodVamjoWeblink,
            amazonWeblink: prodAmazonWeblink,
            flipkartWeblink: prodFlipkartWeblink,
            meeshoWeblink: prodMeeshoWeblink,
            category: prodCategory,
            brand: prodBrand,
            brandOwner: prodBrandOwner,
            imageUrl: uploadRes.downloadUrl,
            storagePath: uploadRes.storagePath,
            images: parsedProdImages,
            videos: parsedProdVideos,
            description: prodDescription || prodNotes,
            ingredients: prodIngredients,
            specifications: prodSpecifications,
            variants: prodVariants,
            stockAvailability: prodStockAvailability,
            offerPrice: prodOfferPrice || prodOnlinePrice,
            mrp: prodMrp || prodShopPrice,
            discount: prodDiscount || (prodShopPrice && prodOnlinePrice ? Math.max(0, Math.round(((prodShopPrice - prodOnlinePrice) / prodShopPrice) * 100)) : 0),
            rating: prodRating,
            reviewsCount: prodReviewsCount
          });
        }
      } catch (err) {
        console.error('Product upload API failed, falling back to client storage upload', err);
        try {
          const uploadRes = await uploadFileToStorage(prodImageFile, `products/${prodUploadId}/main.jpg`);
          await addProduct({
            name: prodName,
            sku: prodSku,
            hsnCode: prodHsnCode.trim(),
            packingSize: prodPackingSize,
            unit: prodUnit,
            onlinePrice: prodOnlinePrice,
            shopPrice: prodShopPrice,
            gstPercentage: prodGstPercentage,
            notes: prodNotes,
            unitsSold: Math.round((prodOnlinePrice * 110 + prodShopPrice * 10) / (prodOnlinePrice || 1)),
            revenue: Math.round(prodOnlinePrice * 40) + Math.round(prodOnlinePrice * 30) + Math.round(prodOnlinePrice * 20) + Math.round(prodOnlinePrice * 10) + Math.round(prodOnlinePrice * 10) + Math.round(prodShopPrice * 10),
            growthRate: 15.0,
            stock: Math.max(0, prodStockIn - prodStockOut),
            stockIn: prodStockIn,
            stockOut: prodStockOut,
            amazonSales: Math.round(prodOnlinePrice * 40),
            flipkartSales: Math.round(prodOnlinePrice * 30),
            meeshoSales: Math.round(prodOnlinePrice * 20),
            vamjoSales: Math.round(prodOnlinePrice * 10),
            whatsappSales: Math.round(prodOnlinePrice * 10),
            countersaleSales: Math.round(prodShopPrice * 10),
            vamjoWeblink: prodVamjoWeblink,
            amazonWeblink: prodAmazonWeblink,
            flipkartWeblink: prodFlipkartWeblink,
            meeshoWeblink: prodMeeshoWeblink,
            category: prodCategory,
            brand: prodBrand,
            brandOwner: prodBrandOwner,
            imageUrl: uploadRes.downloadUrl,
            storagePath: uploadRes.storagePath,
            images: parsedProdImages,
            videos: parsedProdVideos,
            description: prodDescription || prodNotes,
            ingredients: prodIngredients,
            specifications: prodSpecifications,
            variants: prodVariants,
            stockAvailability: prodStockAvailability,
            offerPrice: prodOfferPrice || prodOnlinePrice,
            mrp: prodMrp || prodShopPrice,
            discount: prodDiscount || (prodShopPrice && prodOnlinePrice ? Math.max(0, Math.round(((prodShopPrice - prodOnlinePrice) / prodShopPrice) * 100)) : 0),
            rating: prodRating,
            reviewsCount: prodReviewsCount
          });
        } catch (fallbackErr) {
          console.error('Fallback upload failed', fallbackErr);
          alert('Failed to upload product image. Creating product without image.');
          await addProduct({
            name: prodName,
            sku: prodSku,
            hsnCode: prodHsnCode.trim(),
            packingSize: prodPackingSize,
            unit: prodUnit,
            onlinePrice: prodOnlinePrice,
            shopPrice: prodShopPrice,
            gstPercentage: prodGstPercentage,
            notes: prodNotes,
            unitsSold: Math.round((prodOnlinePrice * 110 + prodShopPrice * 10) / (prodOnlinePrice || 1)),
            revenue: Math.round(prodOnlinePrice * 40) + Math.round(prodOnlinePrice * 30) + Math.round(prodOnlinePrice * 20) + Math.round(prodOnlinePrice * 10) + Math.round(prodOnlinePrice * 10) + Math.round(prodShopPrice * 10),
            growthRate: 15.0,
            stock: Math.max(0, prodStockIn - prodStockOut),
            stockIn: prodStockIn,
            stockOut: prodStockOut,
            amazonSales: Math.round(prodOnlinePrice * 40),
            flipkartSales: Math.round(prodOnlinePrice * 30),
            meeshoSales: Math.round(prodOnlinePrice * 20),
            vamjoSales: Math.round(prodOnlinePrice * 10),
            whatsappSales: Math.round(prodOnlinePrice * 10),
            countersaleSales: Math.round(prodShopPrice * 10),
            vamjoWeblink: prodVamjoWeblink,
            amazonWeblink: prodAmazonWeblink,
            flipkartWeblink: prodFlipkartWeblink,
            meeshoWeblink: prodMeeshoWeblink,
            category: prodCategory,
            brand: prodBrand,
            brandOwner: prodBrandOwner,
            images: parsedProdImages,
            videos: parsedProdVideos,
            description: prodDescription || prodNotes,
            ingredients: prodIngredients,
            specifications: prodSpecifications,
            variants: prodVariants,
            stockAvailability: prodStockAvailability,
            offerPrice: prodOfferPrice || prodOnlinePrice,
            mrp: prodMrp || prodShopPrice,
            discount: prodDiscount || (prodShopPrice && prodOnlinePrice ? Math.max(0, Math.round(((prodShopPrice - prodOnlinePrice) / prodShopPrice) * 100)) : 0),
            rating: prodRating,
            reviewsCount: prodReviewsCount
          });
        }
      }
    } else {
      // No file selected — create product without image
      addProduct({
        name: prodName,
        sku: prodSku,
        hsnCode: prodHsnCode.trim(),
        packingSize: prodPackingSize,
        unit: prodUnit,
        onlinePrice: prodOnlinePrice,
        shopPrice: prodShopPrice,
        gstPercentage: prodGstPercentage,
        notes: prodNotes,
        unitsSold: Math.round((prodOnlinePrice * 110 + prodShopPrice * 10) / (prodOnlinePrice || 1)),
        revenue: Math.round(prodOnlinePrice * 40) + Math.round(prodOnlinePrice * 30) + Math.round(prodOnlinePrice * 20) + Math.round(prodOnlinePrice * 10) + Math.round(prodOnlinePrice * 10) + Math.round(prodShopPrice * 10),
        growthRate: 15.0,
        stock: Math.max(0, prodStockIn - prodStockOut),
        stockIn: prodStockIn,
        stockOut: prodStockOut,
        amazonSales: Math.round(prodOnlinePrice * 40),
        flipkartSales: Math.round(prodOnlinePrice * 30),
        meeshoSales: Math.round(prodOnlinePrice * 20),
        vamjoSales: Math.round(prodOnlinePrice * 10),
        whatsappSales: Math.round(prodOnlinePrice * 10),
        countersaleSales: Math.round(prodShopPrice * 10),
        vamjoWeblink: prodVamjoWeblink,
        amazonWeblink: prodAmazonWeblink,
        flipkartWeblink: prodFlipkartWeblink,
        meeshoWeblink: prodMeeshoWeblink,
        category: prodCategory,
        brand: prodBrand,
        brandOwner: prodBrandOwner,
        // Firebase Storage fields - empty when no image
        imageUrl: undefined,
        storagePath: undefined,
        images: parsedProdImages,
        videos: parsedProdVideos,
        description: prodDescription || prodNotes,
        ingredients: prodIngredients,
        specifications: prodSpecifications,
        variants: prodVariants,
        stockAvailability: prodStockAvailability,
        offerPrice: prodOfferPrice || prodOnlinePrice,
        mrp: prodMrp || prodShopPrice,
        discount: prodDiscount || (prodShopPrice && prodOnlinePrice ? Math.max(0, Math.round(((prodShopPrice - prodOnlinePrice) / prodShopPrice) * 100)) : 0),
        rating: prodRating,
        reviewsCount: prodReviewsCount
      });
    }

    setProdName('');
    setProdSku('');
    setProdHsnCode('');
    setProdPackingSize('500ml Bottle');
    setProdUnit('NOS');
    setProdOnlinePrice(12);
    setProdShopPrice(15);
    setProdGstPercentage(18);
    setProdNotes('');
    setProdImageFile(null);
    setProdUploadId(`product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    setProdPicturePreview('');
    setProdPictureUrl('');
    setProdStockIn(0);
    setProdStockOut(0);
    setProdVamjoWeblink('');
    setProdAmazonWeblink('');
    setProdFlipkartWeblink('');
    setProdMeeshoWeblink('');
    setProdCategory('');
    setProdBrand('');
    setProdBrandOwner('');
    
    // Clear new fields
    setProdImages([]);
    setProdImagesText('');
    setProdVideos([]);
    setProdVideosText('');
    setProdDescription('');
    setProdIngredients('');
    setProdSpecifications('');
    setProdVariants('');
    setProdStockAvailability('In Stock');
    setProdOfferPrice(12);
    setProdMrp(15);
    setProdDiscount(0);
    setProdRating(5);
    setProdReviewsCount(0);
    setIsAddingProduct(false);
  };

  // Handle custom customer creation
  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAccess('Products & Clients', 'create')) return;

    if (!custName || !custCompany || !custEmail) return;

    addCustomer({
      name: custName,
      company: custCompany,
      email: custEmail,
      mobileNumber: '+15550192300',
      address: 'CRM Loyalty Portal Destination Address',
      state: 'N/A',
      district: 'N/A',
      totalSpent: custSpent,
      dealsClosed: 1,
      satisfactionScore: custScore,
      lastOrderDate: new Date().toISOString().split('T')[0],
      tier: custSpent >= 25000 ? 'Platinum' : (custSpent >= 10000 ? 'Gold' : 'Silver')
    });

    setCustName('');
    setCustCompany('');
    setCustEmail('');
    setIsAddingCustomer(false);
  };

  // Satisfactors array stars generator
  const renderStars = (score: number) => {
    const totalStars = 5;
    return (
      <div className="flex items-center gap-0.5 text-amber-400">
        {Array.from({ length: totalStars }).map((_, i) => (
          <span 
            key={i} 
            className={`text-sm ${
              i < Math.floor(score) ? 'text-amber-400 font-bold' : 'text-slate-700'
            }`}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  // Helper for sorting and querying
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortedProducts = () => {
    let filtered = products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(analyticsSearchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(analyticsSearchQuery.toLowerCase());
      return matchSearch;
    });

    filtered.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === 'sku') {
        valA = a.sku.toLowerCase();
        valB = b.sku.toLowerCase();
      } else if (sortField === 'category') {
        valA = (a.category || '').toLowerCase();
        valB = (b.category || '').toLowerCase();
      } else if (sortField === 'volume') {
        valA = getProductVolume(a);
        valB = getProductVolume(b);
      } else if (sortField === 'revenue') {
        valA = getProductRevenue(a);
        valB = getProductRevenue(b);
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  };

  const getSortedCustomers = () => {
    return customers.filter(c => {
      return c.company.toLowerCase().includes(analyticsSearchQuery.toLowerCase()) ||
        c.name.toLowerCase().includes(analyticsSearchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(analyticsSearchQuery.toLowerCase());
    }).sort((a, b) => {
      // Sort by spending
      const valA = a.totalSpent || 0;
      const valB = b.totalSpent || 0;
      return valB - valA; // always desc for spending
    });
  };

  const getCustomerSalesVolume = (customerEmail: string, customerCompany: string) => {
    let unitsCount = 0;
    salesOrders.forEach(order => {
      const match = (order.customerId && order.customerId === customerEmail) || 
                    (order.customerCompany && order.customerCompany.toLowerCase() === customerCompany.toLowerCase()) ||
                    (order.customerName && order.customerName.toLowerCase() === customerCompany.toLowerCase());
      if (match && order.products) {
        order.products.forEach(item => {
          unitsCount += (item.quantity || 0);
        });
      }
    });
    return unitsCount;
  };

  const getChannelMetrics = () => {
    let amazonRev = 0, amazonVol = 0;
    let flipkartRev = 0, flipkartVol = 0;
    let meeshoRev = 0, meeshoVol = 0;
    let vamjoRev = 0, vamjoVol = 0;
    let whatsappRev = 0, whatsappVol = 0;
    let countersaleRev = 0, countersaleVol = 0;

    products.forEach(p => {
      amazonRev += (p.amazonSales ?? 0);
      flipkartRev += (p.flipkartSales ?? 0);
      meeshoRev += (p.meeshoSales ?? 0);
      vamjoRev += (p.vamjoSales ?? 0);
      whatsappRev += (p.whatsappSales ?? 0);
      countersaleRev += (p.countersaleSales ?? 0);
    });

    // Also parse actual sales orders to dynamically add and represent actual values accurately
    salesOrders.forEach(order => {
      const channel = (order.salesChannel || 'Shop').toLowerCase();
      const orderVol = order.products ? order.products.reduce((sum, item) => sum + item.quantity, 0) : 0;
      const orderRev = order.totalValue;

      if (channel === 'amazon') {
        amazonRev += orderRev;
        amazonVol += orderVol;
      } else if (channel === 'flipkart') {
        flipkartRev += orderRev;
        flipkartVol += orderVol;
      } else if (channel === 'meesho') {
        meeshoRev += orderRev;
        meeshoVol += orderVol;
      } else if (channel === 'vamjo') {
        vamjoRev += orderRev;
        vamjoVol += orderVol;
      } else if (channel === 'whatsapp') {
        whatsappRev += orderRev;
        whatsappVol += orderVol;
      } else {
        countersaleRev += orderRev;
        countersaleVol += orderVol;
      }
    });

    return {
      amazon: { rev: amazonRev, vol: amazonVol },
      flipkart: { rev: flipkartRev, vol: flipkartVol },
      meesho: { rev: meeshoRev, vol: meeshoVol },
      vamjo: { rev: vamjoRev, vol: vamjoVol },
      whatsapp: { rev: whatsappRev, vol: whatsappVol },
      shop: { rev: countersaleRev, vol: countersaleVol }
    };
  };

  const getDetailedChannelMetrics = () => {
    const channels = ['Shop', 'Amazon', 'Vamjo', 'Website', 'Distributor', 'Other Marketplace', 'Flipkart', 'Meesho'];
    
    const stats: Record<string, {
      totalOrders: number;
      totalQuantitySold: number;
      totalSalesRevenue: number;
      netRevenueBeforeGst: number;
      averageOrderValue: number;
      lastTransactionDate: string;
    }> = {};

    channels.forEach(ch => {
      stats[ch] = {
        totalOrders: 0,
        totalQuantitySold: 0,
        totalSalesRevenue: 0,
        netRevenueBeforeGst: 0,
        averageOrderValue: 0,
        lastTransactionDate: 'N/A'
      };
    });

    salesOrders.forEach(order => {
      if (order.deliveryStatus === 'Cancelled') {
        return; // Ignore cancelled orders
      }

      const ch = order.salesChannel || 'Shop';
      const matchedChannel = channels.find(c => c.toLowerCase() === ch.toLowerCase()) || 'Shop';
      
      const orderStats = stats[matchedChannel];
      orderStats.totalOrders += 1;

      let orderQty = 0;
      let orderBaseValue = 0;

      if (order.products) {
        order.products.forEach(item => {
          orderQty += (item.quantity || 0);
          
          const gstRate = item.gstPercentage !== undefined ? item.gstPercentage : 18;
          const itemTotal = item.price * item.quantity;
          const gstAmount = itemTotal * (gstRate / (100 + gstRate));
          const baseValue = itemTotal - gstAmount;
          orderBaseValue += baseValue;
        });
      }

      orderStats.totalQuantitySold += orderQty;
      orderStats.totalSalesRevenue += order.totalValue;
      orderStats.netRevenueBeforeGst += orderBaseValue;

      const orderDate = order.invoiceDate || order.createdAt;
      if (orderDate) {
        if (orderStats.lastTransactionDate === 'N/A' || new Date(orderDate) > new Date(orderStats.lastTransactionDate)) {
          orderStats.lastTransactionDate = new Date(orderDate).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
    });

    channels.forEach(ch => {
      const s = stats[ch];
      if (s.totalOrders > 0) {
        s.averageOrderValue = Math.round((s.totalSalesRevenue / s.totalOrders) * 100) / 100;
      }
      s.totalSalesRevenue = Math.round(s.totalSalesRevenue * 100) / 100;
      s.netRevenueBeforeGst = Math.round(s.netRevenueBeforeGst * 100) / 100;
    });

    return stats;
  };

  const getCourierMetrics = () => {
    const partners = ['Amazon', 'Delhivery', 'FedEx', 'DHL', 'BlueDart'];
    
    const stats: Record<string, {
      totalShipments: number;
      totalCourierCharges: number;
      totalInvoiceValue: number;
      netRevenue: number;
      averageCostPerShipment: number;
      averageCostPerUnit: number;
      lastShipmentDate: string;
    }> = {};

    partners.forEach(p => {
      stats[p] = {
        totalShipments: 0,
        totalCourierCharges: 0,
        totalInvoiceValue: 0,
        netRevenue: 0,
        averageCostPerShipment: 0,
        averageCostPerUnit: 0,
        lastShipmentDate: 'N/A'
      };
    });

    salesOrders.forEach(order => {
      if (order.deliveryStatus === 'Cancelled') {
        return; // Ignore cancelled orders
      }

      const agency = order.courierAgency || 'Amazon';
      const matchedPartner = partners.find(p => p.toLowerCase() === agency.toLowerCase());
      const partnerKey = matchedPartner || agency;
      
      if (!stats[partnerKey]) {
        stats[partnerKey] = {
          totalShipments: 0,
          totalCourierCharges: 0,
          totalInvoiceValue: 0,
          netRevenue: 0,
          averageCostPerShipment: 0,
          averageCostPerUnit: 0,
          lastShipmentDate: 'N/A'
        };
      }

      const s = stats[partnerKey];
      s.totalShipments += 1;
      s.totalCourierCharges += (order.courierCharges || 0);
      s.totalInvoiceValue += order.totalValue;

      let orderQty = 0;
      if (order.products) {
        order.products.forEach(item => {
          orderQty += (item.quantity || 0);
        });
      }

      s.averageCostPerUnit += orderQty;

      const orderDate = order.pickupDate || order.invoiceDate || order.createdAt;
      if (orderDate) {
        if (s.lastShipmentDate === 'N/A' || new Date(orderDate) > new Date(s.lastShipmentDate)) {
          s.lastShipmentDate = new Date(orderDate).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
    });

    Object.keys(stats).forEach(key => {
      const s = stats[key];
      s.netRevenue = Math.round((s.totalInvoiceValue - s.totalCourierCharges) * 100) / 100;
      
      if (s.totalShipments > 0) {
        s.averageCostPerShipment = Math.round((s.totalCourierCharges / s.totalShipments) * 100) / 100;
      }
      
      const totalUnits = s.averageCostPerUnit;
      if (totalUnits > 0) {
        s.averageCostPerUnit = Math.round((s.totalCourierCharges / totalUnits) * 100) / 100;
      } else {
        s.averageCostPerUnit = 0;
      }

      s.totalCourierCharges = Math.round(s.totalCourierCharges * 100) / 100;
      s.totalInvoiceValue = Math.round(s.totalInvoiceValue * 100) / 100;
    });

    return stats;
  };

  const getFilteredLedgerItems = () => {
    const items: {
      orderId: string;
      orderNumber: string;
      date: string;
      company: string;
      clientName: string;
      channel: string;
      productId: string;
      productName: string;
      quantity: number;
      price: number;
      gst?: number;
    }[] = [];

    salesOrders.forEach(o => {
      const channel = (o.salesChannel || 'Shop').toLowerCase();
      if (analyticsChannelFilter !== 'all' && channel !== analyticsChannelFilter) {
        return;
      }

      if (o.products) {
        o.products.forEach(p => {
          const matchesSearch = o.orderNumber.toLowerCase().includes(analyticsSearchQuery.toLowerCase()) ||
            o.customerCompany.toLowerCase().includes(analyticsSearchQuery.toLowerCase()) ||
            p.productName.toLowerCase().includes(analyticsSearchQuery.toLowerCase());

          if (!matchesSearch && analyticsSearchQuery !== '') {
            return;
          }

          items.push({
            orderId: o.id,
            orderNumber: o.orderNumber,
            date: o.invoiceDate || o.createdAt ? new Date(o.invoiceDate || o.createdAt || '').toISOString().split('T')[0] : '2026-06-25',
            company: o.customerCompany,
            clientName: o.customerName,
            channel: channel,
            productId: p.productId,
            productName: p.productName,
            quantity: p.quantity,
            price: p.price,
            gst: p.gstPercentage
          });
        });
      }
    });

    return items;
  };

  return (
    <div className="space-y-6" id="perf-container">
      {/* Upper header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5.5 h-5.5 text-indigo-400" />
            Product & Customer Performance Analytics
          </h2>
          <button
            onClick={async () => {
              setIsRecalculating(true);
              try {
                await recalculateAllMasterRecords();
                alert("All transactional level logic recalculated and master records updated successfully!");
              } catch (e) {
                alert("Failed to recalculate: " + e);
              } finally {
                setIsRecalculating(false);
              }
            }}
            disabled={isRecalculating}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-mono text-[10px] font-bold uppercase rounded-xl transition-all shadow-md flex items-center gap-1.5 border border-emerald-500/30 cursor-pointer"
            id="recalculate-master-records-btn"
          >
            <span>{isRecalculating ? "🔄 Recalculating..." : "🔄 Recalculate Master Records"}</span>
          </button>
        </div>

        {/* Modular switch controls */}
        <div className="flex flex-wrap items-center gap-1 bg-[#141418] border border-slate-800 rounded-2xl p-1.5 max-w-full">
          <button
            onClick={() => { setPanelTab('products'); setSkuError(null); setIsAddingProduct(false); setIsAddingCustomer(false); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              panelTab === 'products' 
                ? 'bg-slate-900 border border-slate-850 text-white shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
            id="perf-tab-products"
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            <span>Product Portfolios</span>
          </button>

          <button
            onClick={() => { setPanelTab('stock'); setSkuError(null); setIsAddingProduct(false); setIsAddingCustomer(false); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              panelTab === 'stock' 
                ? 'bg-slate-900 border border-slate-850 text-white shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
            id="perf-tab-stock"
          >
            <Grid className="w-3.5 h-3.5 shrink-0" />
            <span>Stock Ledger</span>
          </button>
          
          <button
            onClick={() => { setPanelTab('customers'); setSkuError(null); setIsAddingProduct(false); setIsAddingCustomer(false); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              panelTab === 'customers' 
                ? 'bg-slate-900 border border-slate-850 text-white shadow-sm' 
                : 'text-slate-400 hover:text-white'
            }`}
            id="perf-tab-customers"
          >
            <Heart className="w-3.5 h-3.5 shrink-0" />
            <span>Customer Assets</span>
          </button>

          <button
            onClick={() => { setPanelTab('analytics'); setSkuError(null); setIsAddingProduct(false); setIsAddingCustomer(false); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              panelTab === 'analytics' 
                ? 'bg-slate-900 border border-slate-850 text-white shadow-sm font-black text-indigo-400' 
                : 'text-slate-400 hover:text-white'
            }`}
            id="perf-tab-analytics"
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400 animate-pulse shrink-0" />
            <span>Volume & Revenue Analytics</span>
          </button>
        </div>
      </div>

      {panelTab === 'products' && (
        <div className="space-y-6">
          {/* Sub-tabs for Product Portfolio and Master Directory records */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0d0d10] p-3.5 rounded-2xl border border-slate-800/60" id="products-sub-tabs">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => { setProductsSubTab('all'); setMasterSearchQuery(''); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  productsSubTab === 'all' 
                    ? 'bg-indigo-600 text-white shadow-sm font-extrabold' 
                    : 'bg-[#141418] border border-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                All Products ({products.length})
              </button>
              <button
                onClick={() => { setProductsSubTab('categories'); setMasterSearchQuery(''); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  productsSubTab === 'categories' 
                    ? 'bg-indigo-600 text-white shadow-sm font-extrabold' 
                    : 'bg-[#141418] border border-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5 text-sky-400" />
                Category Masters ({dynamicCategories.length})
              </button>
              <button
                onClick={() => { setProductsSubTab('brands'); setMasterSearchQuery(''); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  productsSubTab === 'brands' 
                    ? 'bg-indigo-600 text-white shadow-sm font-extrabold' 
                    : 'bg-[#141418] border border-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                <Award className="w-3.5 h-3.5 text-amber-400" />
                Brand Masters ({dynamicBrands.length})
              </button>
              <button
                onClick={() => { setProductsSubTab('owners'); setMasterSearchQuery(''); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  productsSubTab === 'owners' 
                    ? 'bg-indigo-600 text-white shadow-sm font-extrabold' 
                    : 'bg-[#141418] border border-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                Brand Owner Masters ({dynamicBrandOwners.length})
              </button>
              <button
                onClick={() => { setProductsSubTab('units'); setMasterSearchQuery(''); setUnitError(null); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  productsSubTab === 'units' 
                    ? 'bg-indigo-600 text-white shadow-sm font-extrabold' 
                    : 'bg-[#141418] border border-slate-800/80 text-slate-400 hover:text-white'
                }`}
                id="unit-master-tab-btn"
              >
                <Grid className="w-3.5 h-3.5 text-purple-400" />
                Unit Masters ({units.length})
              </button>
            </div>

            {productsSubTab !== 'all' && (
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-slate-500" />
                  </span>
                  <input
                    type="text"
                    placeholder={`Search ${productsSubTab === 'categories' ? 'categories' : productsSubTab === 'brands' ? 'brands' : productsSubTab === 'owners' ? 'brand owners' : 'units (Desc or UQC)'}...`}
                    value={masterSearchQuery}
                    onChange={(e) => setMasterSearchQuery(e.target.value)}
                    className="block w-full pl-9 pr-3 py-1.5 bg-[#141418] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                {hasAccess('Products & Clients', 'create') && (
                  <button
                    onClick={() => {
                      setNewMasterName('');
                      setNewMasterOwner('');
                      setNewUnitDesc('');
                      setNewUnitUqc('');
                      setUnitError(null);
                      setShowAddMasterModal(productsSubTab === 'categories' ? 'category' : productsSubTab === 'brands' ? 'brand' : productsSubTab === 'owners' ? 'owner' : 'unit');
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1"
                    id="add-new-master-btn"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add New
                  </button>
                )}
              </div>
            )}
          </div>

          {productsSubTab === 'all' && (
            <div className="space-y-6">
              {skuError && (
            <div className="p-4 bg-rose-950/80 border border-rose-900/60 rounded-xl text-rose-200 flex items-start gap-3 animate-fadeIn" id="sku-uniqueness-alert">
              <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 animate-pulse"></div>
              <div className="flex-1 text-xs">
                <span className="font-extrabold uppercase tracking-wider text-rose-300 block mb-0.5">SKU Prefix Constraint Violation</span>
                {skuError}
              </div>
              <button 
                type="button" 
                onClick={() => setSkuError(null)} 
                className="text-rose-400 hover:text-rose-200 font-semibold text-xs px-2 py-0.5 hover:bg-rose-900/30 rounded-md transition cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Action section products */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              Products Channel Performance
            </h3>

            {hasAccess('Products & Clients', 'create') && (
              <button
                onClick={() => setIsAddingProduct(!isAddingProduct)}
                className="px-3.5 py-2 border border-slate-800 text-indigo-400 bg-[#141418] hover:bg-[#1c1c21] text-xs font-semibold rounded-xl transition cursor-pointer"
                id="add-prod-btn"
              >
                {isAddingProduct ? 'Show Portfolios' : '+ Create Product'}
              </button>
            )}
          </div>

          {/* Product add collapsed form */}
          {isAddingProduct && (
            <form onSubmit={handleCreateProduct} className="bg-[#bdbddb] border border-slate-800 rounded-2xl p-5 max-w-4xl animate-fadeIn space-y-4" id="add-prod-form">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Product Master Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">PROD NAME:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Lavender Gel Cleaner" 
                    value={prodName}
                    onChange={e => setProdName(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">SKU PREFIX:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. HC-LGC-005" 
                    value={prodSku}
                    onChange={e => setProdSku(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">PACKING SIZE:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 500ml Bottle" 
                    value={prodPackingSize}
                    onChange={e => setProdPackingSize(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">UNIT (UQC):</label>
                  <select 
                    value={prodUnit}
                    onChange={e => setProdUnit(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-indigo-300 font-mono font-bold rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    required
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.uqc} className="bg-[#0d0d10] text-slate-200 font-sans">
                        {u.uqc} ({u.desc})
                      </option>
                    ))}
                    {prodUnit && !units.some(u => u.uqc.toUpperCase() === prodUnit.toUpperCase()) && (
                      <option value={prodUnit} className="bg-[#0d0d10] text-slate-200 font-sans">
                        {prodUnit}
                      </option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-rose-400 mb-1.5 uppercase tracking-wider">MRP (₹):</label>
                  <input 
                    type="number" 
                    placeholder="Maximum Retail Price"
                    value={prodMrp}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      setProdMrp(val);
                      const off = prodOfferPrice || prodOnlinePrice;
                      if (val > 0 && off > 0) {
                        setProdDiscount(Math.max(0, Math.round(((val - off) / val) * 100)));
                      }
                    }}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    min="1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">HSN CODE:</label>
                  <input
                    type="text"
                    placeholder="e.g. 330499"
                    value={prodHsnCode}
                    onChange={e => setProdHsnCode(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-400 mb-1.5 uppercase tracking-wider">ONLINE PRICE (₹):</label>
                  <input 
                    type="number" 
                    value={prodOnlinePrice}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      setProdOnlinePrice(val);
                      setProdOfferPrice(val);
                      const mrpVal = prodMrp || prodShopPrice;
                      if (mrpVal > 0) {
                        setProdDiscount(Math.max(0, Math.round(((mrpVal - val) / mrpVal) * 100)));
                      }
                    }}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-amber-500 mb-1.5 uppercase tracking-wider">SHOP PRICE (₹):</label>
                  <input 
                    type="number" 
                    value={prodShopPrice}
                    onChange={e => setProdShopPrice(parseInt(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">GST RATE (%):</label>
                  <select 
                    value={prodGstPercentage}
                    onChange={e => setProdGstPercentage(parseInt(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value={5}>5% GST (Essential)</option>
                    <option value={12}>12% GST (Standard)</option>
                    <option value={18}>18% GST (Active Household)</option>
                    <option value={28}>28% GST (Luxury/Special)</option>
                    <option value={0}>0% GST (Exempt)</option>
                  </select>
                </div>
                {/* CATEGORY SEARCHABLE COMBOBOX */}
                <div className="relative" ref={catDropdownRef}>
                  <label className="block text-[10px] font-bold text-sky-400 mb-1.5 uppercase tracking-wider">CATEGORY:</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="e.g. Fruits & Flowers" 
                      value={isCatDropdownOpen ? catSearchQuery : prodCategory}
                      onChange={e => {
                        const val = e.target.value;
                        setProdCategory(val);
                        setCatSearchQuery(val);
                        setIsCatDropdownOpen(true);
                      }}
                      onFocus={() => {
                        setIsCatDropdownOpen(true);
                        setCatSearchQuery(prodCategory);
                      }}
                      className="w-full text-xs p-2.5 pr-14 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {prodCategory && (
                        <button
                          type="button"
                          onClick={() => {
                            setProdCategory('');
                            setCatSearchQuery('');
                          }}
                          className="hover:text-rose-400 text-slate-500 transition cursor-pointer p-0.5"
                          title="Clear field"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsCatDropdownOpen(!isCatDropdownOpen);
                          if (!isCatDropdownOpen) {
                            setCatSearchQuery(prodCategory);
                          }
                        }}
                        className="hover:text-indigo-400 text-slate-500 transition cursor-pointer p-0.5"
                        title="Toggle dropdown"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {isCatDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#0d0d10] border border-slate-850 rounded-xl max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-850 animate-fadeIn scrollbar-thin">
                      {filteredCategories.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                          No matching categories. Type to use custom category.
                        </div>
                      ) : (
                        filteredCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setProdCategory(cat);
                              setCatSearchQuery(cat);
                              setIsCatDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] hover:bg-slate-900 text-slate-300 hover:text-white transition flex items-center justify-between cursor-pointer"
                          >
                            <span>{cat}</span>
                            {prodCategory.toLowerCase() === cat.toLowerCase() && (
                              <Check className="w-3 h-3 text-sky-400 shrink-0" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* BRAND SEARCHABLE COMBOBOX */}
                <div className="relative" ref={brandDropdownRef}>
                  <label className="block text-[10px] font-bold text-amber-400 mb-1.5 uppercase tracking-wider">BRAND:</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="e.g. Vamjo" 
                      value={isBrandDropdownOpen ? brandSearchQuery : prodBrand}
                      onChange={e => {
                        const val = e.target.value;
                        setProdBrand(val);
                        setBrandSearchQuery(val);
                        setIsBrandDropdownOpen(true);
                      }}
                      onFocus={() => {
                        setIsBrandDropdownOpen(true);
                        setBrandSearchQuery(prodBrand);
                      }}
                      className="w-full text-xs p-2.5 pr-14 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {prodBrand && (
                        <button
                          type="button"
                          onClick={() => {
                            setProdBrand('');
                            setBrandSearchQuery('');
                          }}
                          className="hover:text-rose-400 text-slate-500 transition cursor-pointer p-0.5"
                          title="Clear field"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsBrandDropdownOpen(!isBrandDropdownOpen);
                          if (!isBrandDropdownOpen) {
                            setBrandSearchQuery(prodBrand);
                          }
                        }}
                        className="hover:text-indigo-400 text-slate-500 transition cursor-pointer p-0.5"
                        title="Toggle dropdown"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isBrandDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {isBrandDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#0d0d10] border border-slate-850 rounded-xl max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-850 animate-fadeIn scrollbar-thin">
                      {filteredBrands.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                          No matching brands. Type to use custom brand.
                        </div>
                      ) : (
                        filteredBrands.map(b => (
                          <button
                            key={b.name}
                            type="button"
                            onClick={() => {
                              setProdBrand(b.name);
                              setBrandSearchQuery(b.name);
                              // Auto-fill Brand Owner if selected from master!
                              if (b.owner) {
                                setProdBrandOwner(b.owner);
                                setOwnerSearchQuery(b.owner);
                              }
                              setIsBrandDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] hover:bg-slate-900 text-slate-300 hover:text-white transition flex flex-col cursor-pointer"
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium text-slate-200">{b.name}</span>
                              {prodBrand.toLowerCase() === b.name.toLowerCase() && (
                                <Check className="w-3 h-3 text-amber-400 shrink-0" />
                              )}
                            </div>
                            {b.owner && (
                              <span className="text-[9px] text-slate-505 mt-0.5">Owner: {b.owner}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* BRAND OWNER SEARCHABLE COMBOBOX */}
                <div className="relative" ref={ownerDropdownRef}>
                  <label className="block text-[10px] font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">BRAND OWNER:</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="e.g. Vamjo Brands Ltd" 
                      value={isOwnerDropdownOpen ? ownerSearchQuery : prodBrandOwner}
                      onChange={e => {
                        const val = e.target.value;
                        setProdBrandOwner(val);
                        setOwnerSearchQuery(val);
                        setIsOwnerDropdownOpen(true);
                      }}
                      onFocus={() => {
                        setIsOwnerDropdownOpen(true);
                        setOwnerSearchQuery(prodBrandOwner);
                      }}
                      className="w-full text-xs p-2.5 pr-14 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {prodBrandOwner && (
                        <button
                          type="button"
                          onClick={() => {
                            setProdBrandOwner('');
                            setOwnerSearchQuery('');
                          }}
                          className="hover:text-rose-400 text-slate-500 transition cursor-pointer p-0.5"
                          title="Clear field"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsOwnerDropdownOpen(!isOwnerDropdownOpen);
                          if (!isOwnerDropdownOpen) {
                            setOwnerSearchQuery(prodBrandOwner);
                          }
                        }}
                        className="hover:text-indigo-400 text-slate-500 transition cursor-pointer p-0.5"
                        title="Toggle dropdown"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOwnerDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {isOwnerDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#0d0d10] border border-slate-850 rounded-xl max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-850 animate-fadeIn scrollbar-thin">
                      {filteredOwners.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                          No matching brand owners. Type to use custom owner.
                        </div>
                      ) : (
                        filteredOwners.map(owner => (
                          <button
                            key={owner}
                            type="button"
                            onClick={() => {
                              setProdBrandOwner(owner);
                              setOwnerSearchQuery(owner);
                              setIsOwnerDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-[11px] hover:bg-slate-900 text-slate-300 hover:text-white transition flex items-center justify-between cursor-pointer"
                          >
                            <span>{owner}</span>
                            {prodBrandOwner.toLowerCase() === owner.toLowerCase() && (
                              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-violet-400 mb-1.5 uppercase tracking-wider">Stock In (Qty Received):</label>
                  <input 
                    type="number" 
                    value={prodStockIn}
                    onChange={e => setProdStockIn(parseInt(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="e.g. 1000"
                    min="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-rose-400 mb-1.5 uppercase tracking-wider">Stock Out (Qty Sold/Out):</label>
                  <input 
                    type="number" 
                    value={prodStockOut}
                    onChange={e => setProdStockOut(parseInt(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-505"
                    placeholder="e.g. 0"
                    min="0"
                    required
                  />
                </div>

                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">PRODUCT PHOTO / IMAGE DETAILS:</label>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch mt-1.5">
                    {/* Drag-and-Drop Image Area */}
                    <div className="md:col-span-7">
                      <div 
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center h-full min-h-[110px] ${
                          dragActive 
                            ? 'border-indigo-500 bg-indigo-950/20' 
                            : 'border-slate-800 hover:border-slate-700 bg-[#141418]'
                        }`}
                        onClick={() => document.getElementById('prod-file-input')?.click()}
                      >
                        <input 
                          type="file" 
                          id="prod-file-input" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleFileInputChange}
                        />
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <Plus className="w-5 h-5 text-indigo-400 animate-pulse" />
                          <p className="text-[11px] font-medium text-slate-200">
                            Drop photo here or <span className="text-indigo-400 font-bold hover:underline">browse files</span>
                          </p>
                          <p className="text-[9px] text-slate-500">
                            PNG, JPG, WebP up to 10MB (Saved dynamically in-memory)
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Pre-view and URL Paste Fallback */}
                    <div className="md:col-span-5 flex items-center gap-3 bg-[#111114] p-3 border border-slate-800/60 rounded-xl">
                      <img 
                        src={prodPicturePreview || prodPictureUrl || 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=80&auto=format&fit=crop&q=60'} 
                        alt="Product preview" 
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-800 bg-[#0d0d10] shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="text-[9px] font-bold text-slate-500 block uppercase tracking-wide">Or Input Image URL:</span>
                        <input 
                          type="text" 
                          placeholder="https://images.unsplash.com/photo-..." 
                          value={prodPictureUrl}
                          onChange={e => setProdPictureUrl(e.target.value)}
                          className="w-full text-[10px] p-2 bg-[#141418] border border-slate-800 text-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2 md:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-[#111114]/40 p-3 rounded-xl border border-slate-800/40">
                  <div>
                    <label className="block text-[10px] font-bold text-sky-400 mb-1.5 uppercase tracking-wider">VAMJO WEBLINK:</label>
                    <input 
                      type="url" 
                      placeholder="https://vamjo.com/..." 
                      value={prodVamjoWeblink}
                      onChange={e => setProdVamjoWeblink(e.target.value)}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-500 mb-1.5 uppercase tracking-wider">AMAZON WEBLINK:</label>
                    <input 
                      type="url" 
                      placeholder="https://amazon.in/..." 
                      value={prodAmazonWeblink}
                      onChange={e => setProdAmazonWeblink(e.target.value)}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-blue-400 mb-1.5 uppercase tracking-wider">FLIPKART WEBLINK:</label>
                    <input 
                      type="url" 
                      placeholder="https://flipkart.com/..." 
                      value={prodFlipkartWeblink}
                      onChange={e => setProdFlipkartWeblink(e.target.value)}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-pink-400 mb-1.5 uppercase tracking-wider">MEESHO WEBLINK:</label>
                    <input 
                      type="url" 
                      placeholder="https://meesho.com/..." 
                      value={prodMeeshoWeblink}
                      onChange={e => setProdMeeshoWeblink(e.target.value)}
                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 md:col-span-3 text-[10px] font-bold text-indigo-400 uppercase tracking-wider border-b border-slate-800/60 pb-1 mt-4">
                  Extended Product Catalog Details (E-Commerce & Master Table)
                </div>

                <div className="sm:col-span-2 md:col-span-3 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Multiple Images Upload Option */}
                    <div className="bg-[#111114] border border-slate-800/60 p-4 rounded-xl space-y-3">
                      <label className="block text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                        E-Commerce Multiple Images
                      </label>
                      <div className="space-y-2">
                        <input 
                          type="text" 
                          placeholder="Or type comma-separated URLs: https://image1.jpg, https://image2.jpg" 
                          value={prodImagesText}
                          onChange={e => {
                            setProdImagesText(e.target.value);
                            setProdImages(e.target.value.split(',').map(s => s.trim()).filter(Boolean));
                          }}
                          className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Or Drag & Upload Image Files</span>
                        </div>
                        <input 
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={e => {
                            if (e.target.files) {
                              Array.from(e.target.files).forEach((file: any) => {
                                handleImageUploadAsync(file, (downloadUrl) => {
                                  setProdImages(prev => {
                                    const updated = [...prev, downloadUrl];
                                    setProdImagesText(updated.join(', '));
                                    return updated;
                                  });
                                });
                              });
                            }
                          }}
                          className="w-full text-[11px] text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-indigo-950 file:text-indigo-400 hover:file:bg-indigo-900 transition file:cursor-pointer"
                        />
                      </div>
                      
                      {/* Thumbnail Gallery */}
                      {prodImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-2 bg-[#0d0d10] border border-slate-800 rounded-lg">
                          {prodImages.map((img, idx) => (
                            <div key={idx} className="relative group w-12 h-12">
                              <img src={img} alt={`Img ${idx}`} className="w-full h-full object-cover rounded border border-slate-800" />
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = prodImages.filter((_, i) => i !== idx);
                                  setProdImages(updated);
                                  setProdImagesText(updated.join(', '));
                                }}
                                className="absolute -top-1 -right-1 bg-rose-600 text-white p-0.5 rounded-full hover:bg-rose-500 opacity-0 group-hover:opacity-100 transition duration-150"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Multiple Videos Upload Option */}
                    <div className="bg-[#111114] border border-slate-800/60 p-4 rounded-xl space-y-3">
                      <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                        E-Commerce Product Videos
                      </label>
                      <div className="space-y-2">
                        <input 
                          type="text" 
                          placeholder="Or type comma-separated URLs: https://video1.mp4, https://video2.mp4" 
                          value={prodVideosText}
                          onChange={e => {
                            setProdVideosText(e.target.value);
                            setProdVideos(e.target.value.split(',').map(s => s.trim()).filter(Boolean));
                          }}
                          className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Or Drag & Upload Video Files</span>
                        </div>
                        <input 
                          type="file"
                          accept="video/*"
                          multiple
                          onChange={e => {
                            if (e.target.files) {
                              Array.from(e.target.files).forEach((file: any) => {
                                handleVideoUploadAsync(file, (downloadUrl) => {
                                  setProdVideos(prev => {
                                    const updated = [...prev, downloadUrl];
                                    setProdVideosText(updated.join(', '));
                                    return updated;
                                  });
                                });
                              });
                            }
                          }}
                          className="w-full text-[11px] text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-amber-950 file:text-amber-400 hover:file:bg-amber-900 transition file:cursor-pointer"
                        />
                      </div>
                      
                      {/* Video Preview Gallery */}
                      {prodVideos.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-2 bg-[#0d0d10] border border-slate-800 rounded-lg">
                          {prodVideos.map((vid, idx) => (
                            <div key={idx} className="relative group w-32 h-20">
                              <video src={vid} className="w-full h-full object-cover rounded border border-slate-800 bg-black" />
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = prodVideos.filter((_, i) => i !== idx);
                                  setProdVideos(updated);
                                  setProdVideosText(updated.join(', '));
                                }}
                                className="absolute -top-1 -right-1 bg-rose-600 text-white p-0.5 rounded-full hover:bg-rose-500 opacity-0 group-hover:opacity-100 transition duration-150 z-10"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-500 mb-1.5 uppercase tracking-wider">PRODUCT VARIANTS (e.g. 500ml, 1L, Red, Blue):</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Lavender, Lemon, Rose" 
                    value={prodVariants}
                    onChange={e => setProdVariants(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">STOCK AVAILABILITY STATUS:</label>
                  <select 
                    value={prodStockAvailability}
                    onChange={e => setProdStockAvailability(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="In Stock">In Stock</option>
                    <option value="Low Stock">Low Stock</option>
                    <option value="Out of Stock">Out of Stock</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-indigo-400 mb-1.5 uppercase tracking-wider">OFFER PRICE (₹):</label>
                  <input 
                    type="number" 
                    placeholder="Discounted Offer Price"
                    value={prodOfferPrice}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      setProdOfferPrice(val);
                      setProdOnlinePrice(val);
                      const mrpVal = prodMrp || prodShopPrice;
                      if (mrpVal > 0) {
                        setProdDiscount(Math.max(0, Math.round(((mrpVal - val) / mrpVal) * 100)));
                      }
                    }}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-teal-400 mb-1.5 uppercase tracking-wider">DISCOUNT (%):</label>
                  <input 
                    type="number" 
                    value={prodDiscount}
                    onChange={e => setProdDiscount(parseInt(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-yellow-500 mb-1.5 uppercase tracking-wider">CUSTOMER RATINGS (1-5 ⭐):</label>
                  <select 
                    value={prodRating}
                    onChange={e => setProdRating(parseFloat(e.target.value) || 5)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="5">5.0 - Excellent</option>
                    <option value="4.5">4.5 - Very Good</option>
                    <option value="4">4.0 - Good</option>
                    <option value="3.5">3.5 - Above Average</option>
                    <option value="3">3.0 - Average</option>
                    <option value="2">2.0 - Poor</option>
                    <option value="1">1.0 - Terrible</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-pink-400 mb-1.5 uppercase tracking-wider">TOTAL REVIEWS COUNT:</label>
                  <input 
                    type="number" 
                    value={prodReviewsCount}
                    onChange={e => setProdReviewsCount(parseInt(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-purple-400 mb-1.5 uppercase tracking-wider">INGREDIENTS:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Active Surfactants, Natural Lavender Extract, Purified Water" 
                    value={prodIngredients}
                    onChange={e => setProdIngredients(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">TECHNICAL SPECIFICATIONS / FORMULATIONS:</label>
                  <textarea 
                    placeholder="e.g. pH Level: 7.5; Soluble in water; Biodegradable surfactants..." 
                    value={prodSpecifications}
                    onChange={e => setProdSpecifications(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">E-COMMERCE DESCRIPTION:</label>
                  <textarea 
                    placeholder="Provide a detailed consumer-facing description of the product benefits and usage directions..." 
                    value={prodDescription}
                    onChange={e => setProdDescription(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">NOTES / DESCRIPTION:</label>
                  <textarea 
                    placeholder="Describe specific details about the homecare product formulations here..." 
                    value={prodNotes}
                    onChange={e => setProdNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                    required
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer">
                  Create Product
                </button>
              </div>
            </form>
          )}

          {/* Grid list of Products */}
          <div className="bg-[#141418] border border-slate-800 rounded-2xl shadow-sm overflow-hidden" id="products-table">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-[#0d0d10] text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <th className="p-4 pl-5 w-56">Product & Actions</th>
                    <th className="p-4">PROD NAME:</th>
                    <th className="p-4">CATEGORY</th>
                    <th className="p-4">BRAND</th>
                    <th className="p-4">BRAND OWNER</th>
                    <th className="p-4">SKU PREFIX:</th>
                    <th className="p-4">PACKING SIZE</th>
                    <th className="p-4">UNIT</th>
                    <th className="p-4 text-indigo-400">Online Price</th>
                    <th className="p-4 text-amber-500">Shop Price</th>
                    <th className="p-4 text-emerald-400">GST %</th>
                    <th className="p-4 text-violet-400 font-mono">Stock In</th>
                    <th className="p-4 text-rose-400 font-mono">Stock Out</th>
                    <th className="p-4 text-teal-400 font-mono">Current Stock</th>
                    <th className="p-4 text-sky-400">Platform WebLinks</th>
                    <th className="p-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-xs">
                  {products.map((p) => {
                    const isEditing = false;

                    return (
                      <React.Fragment key={p.id}>
                        <tr className="hover:bg-[#1c1c21]/45 transition-colors">
                        {/* 1. Product Picture */}
                        <td className="p-4 pl-5">
                          <div className="flex items-center gap-3">
                            <img 
                              src={p.imageUrl || 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=80&auto=format&fit=crop&q=60'} 
                              alt={p.name} 
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 object-cover rounded-xl border border-slate-800 shadow-inner group-hover:scale-105 transition-transform shrink-0"
                            />
                            
                            {/* Action Buttons next to the product picture */}
                            <div className="flex flex-col gap-1.5 shrink-0">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setExpandedProductId(expandedProductId === p.id ? null : p.id);
                                    if (expandedProductId !== p.id && editingProductId === p.id) {
                                      handleStartProductEdit(p);
                                    }
                                  }}
                                  className={`px-2 py-1 border rounded-lg text-[10px] font-bold transition cursor-pointer select-none whitespace-nowrap ${
                                    expandedProductId === p.id 
                                      ? 'border-indigo-500 bg-indigo-950 text-indigo-300' 
                                      : 'border-indigo-900/40 bg-indigo-950/40 hover:bg-indigo-900/30 text-indigo-400 hover:text-indigo-300'
                                  }`}
                                  title={expandedProductId === p.id ? 'Hide Specifications' : 'View Specifications'}
                                >
                                  {expandedProductId === p.id ? 'Hide' : 'View'}
                                </button>

                                {hasAccess('Products & Clients', 'edit') && (
                                  <button 
                                    onClick={() => {
                                      setDeletingProductId(null);
                                      handleStartProductEdit(p);
                                      setExpandedProductId(p.id); // auto expand on edit to edit specs as well
                                    }}
                                    className="px-2 py-1 border border-slate-800 bg-[#0d0d10] hover:bg-[#1c1c21] text-slate-400 hover:text-white rounded-lg text-[10px] font-semibold transition cursor-pointer select-none whitespace-nowrap"
                                    id={`edit-product-${p.id}`}
                                    title="Edit Product Details"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>

                              <div>
                                {deletingProductId === p.id ? (
                                  <div className="flex items-center gap-1 animate-fadeIn bg-rose-950/25 border border-rose-900/30 rounded px-1.5 py-0.5">
                                    <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider">Del?</span>
                                    <button
                                      onClick={() => {
                                        deleteProduct(p.id);
                                        setDeletingProductId(null);
                                      }}
                                      className="px-1 py-0.5 bg-rose-900 hover:bg-rose-800 text-white rounded text-[9px] font-bold transition cursor-pointer"
                                      id={`confirm-delete-product-${p.id}`}
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={() => setDeletingProductId(null)}
                                      className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] transition cursor-pointer"
                                      id={`cancel-delete-product-${p.id}`}
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  hasAccess('Products & Clients', 'delete') && (
                                    <button 
                                      onClick={() => {
                                        setDeletingProductId(p.id);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 border border-rose-950/40 bg-rose-950/10 text-rose-500 hover:text-rose-400 rounded-lg hover:border-rose-900/30 transition cursor-pointer text-[10px] font-bold"
                                      title="Delete Product portfolio"
                                      id={`delete-product-${p.id}`}
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                      <span>Delete</span>
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. PROD NAME: */}
                        <td className="p-4">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="w-full p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              required
                            />
                          ) : (
                            <div className="font-bold text-white text-xs">{p.name}</div>
                          )}
                        </td>

                        {/* Category */}
                        <td className="p-4">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editCategory}
                              onChange={e => setEditCategory(e.target.value)}
                              className="w-28 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              required
                            />
                          ) : (
                            <span className="text-[10px] bg-slate-900 border border-slate-800 text-sky-400 rounded px-1.5 py-0.5 whitespace-nowrap">{p.category || 'Uncategorized'}</span>
                          )}
                        </td>

                        {/* Brand */}
                        <td className="p-4">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editBrand}
                              onChange={e => setEditBrand(e.target.value)}
                              className="w-24 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              required
                            />
                          ) : (
                            <span className="text-[11px] font-semibold text-amber-400 whitespace-nowrap">{p.brand || 'Generic'}</span>
                          )}
                        </td>

                        {/* Brand Owner */}
                        <td className="p-4">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editBrandOwner}
                              onChange={e => setEditBrandOwner(e.target.value)}
                              className="w-28 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              required
                            />
                          ) : (
                            <span className="text-[11px] text-slate-300 whitespace-nowrap">{p.brandOwner || 'Generic Owner'}</span>
                          )}
                        </td>

                        {/* 3. SKU PREFIX: */}
                        <td className="p-4 font-mono font-semibold">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editSku}
                              onChange={e => setEditSku(e.target.value)}
                              className="w-28 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              required
                            />
                          ) : (
                            <span className="text-[9px] bg-[#0d0d10] border border-slate-800 text-indigo-400 font-mono font-black rounded px-1.5 py-0.5">{p.sku}</span>
                          )}
                        </td>

                        {/* 4. PACKING SIZE */}
                        <td className="p-4 text-slate-300 font-medium">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editPackingSize}
                              onChange={e => setEditPackingSize(e.target.value)}
                              className="w-24 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none"
                              required
                            />
                          ) : (
                            <span>{p.packingSize || '500ml Bottle'}</span>
                          )}
                        </td>

                        {/* 4b. UNIT */}
                        <td className="p-4 text-slate-300 font-medium">
                          {isEditing ? (
                            <select 
                              value={editUnit}
                              onChange={e => setEditUnit(e.target.value)}
                              className="w-24 p-1 bg-[#0d0d10] border border-slate-800 text-xs font-mono font-bold text-indigo-300 rounded-md focus:outline-none cursor-pointer"
                              required
                            >
                              {units.map(u => (
                                <option key={u.id} value={u.uqc} className="bg-[#0d0d10] text-slate-200 font-sans">
                                  {u.uqc} ({u.desc})
                                </option>
                              ))}
                              {editUnit && !units.some(u => u.uqc.toUpperCase() === editUnit.toUpperCase()) && (
                                <option value={editUnit} className="bg-[#0d0d10] text-slate-200 font-sans">
                                  {editUnit}
                                </option>
                              )}
                            </select>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 bg-indigo-950/60 border border-indigo-800/40 text-indigo-300 text-[11px] font-mono font-bold rounded">
                              {p.unit || 'NOS'}
                            </span>
                          )}
                        </td>

                        {/* 5. Online Price */}
                        <td className="p-4 font-semibold text-indigo-400 font-mono">
                          {isEditing ? (
                            <input 
                              type="number" 
                              value={editOnlinePrice}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setEditOnlinePrice(val);
                                setEditOfferPrice(val);
                              }}
                              className="w-16 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none"
                              required
                            />
                          ) : (
                            <span>₹{(p.onlinePrice || 0).toLocaleString()}</span>
                          )}
                        </td>

                        {/* 6. Shop Price */}
                        <td className="p-4 font-semibold text-amber-500 font-mono">
                          {isEditing ? (
                            <input 
                              type="number" 
                              value={editShopPrice}
                              onChange={e => setEditShopPrice(parseInt(e.target.value) || 0)}
                              className="w-16 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none"
                              required
                            />
                          ) : (
                            <span>₹{(p.shopPrice || 0).toLocaleString()}</span>
                          )}
                        </td>

                        {/* 6b. GST % */}
                        <td className="p-4 font-semibold text-emerald-400 font-mono">
                          {isEditing ? (
                            <select 
                              value={editGstPercentage}
                              onChange={e => setEditGstPercentage(parseInt(e.target.value) || 0)}
                              className="w-20 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none cursor-pointer"
                            >
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                              <option value={0}>0%</option>
                            </select>
                          ) : (
                            <span>{p.gstPercentage !== undefined ? `${p.gstPercentage}%` : '18%'}</span>
                          )}
                        </td>

                        {/* 6c. Stock In */}
                        <td className="p-4 font-semibold text-slate-300 font-mono">
                          {isEditing ? (
                            <input 
                              type="number" 
                              value={editStockIn}
                              onChange={e => setEditStockIn(parseInt(e.target.value) || 0)}
                              className="w-16 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none"
                              required
                            />
                          ) : (
                            <span className="text-violet-400">{(p.stockIn ?? p.stock ?? 0).toLocaleString()}</span>
                          )}
                        </td>

                        {/* 6d. Stock Out */}
                        <td className="p-4 font-semibold text-slate-300 font-mono">
                          {isEditing ? (
                            <input 
                              type="number" 
                              value={editStockOut}
                              onChange={e => setEditStockOut(parseInt(e.target.value) || 0)}
                              className="w-16 p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none"
                              required
                            />
                          ) : (
                            <span className="text-rose-400">{(p.stockOut ?? getProductVolume(p)).toLocaleString()}</span>
                          )}
                        </td>

                        {/* 6e. Available */}
                        <td className="p-4 font-semibold font-mono">
                          <span className={p.stock <= 50 ? "text-rose-500 font-extrabold animate-pulse" : p.stock <= 200 ? "text-amber-500 font-semibold" : "text-teal-400 font-semibold"}>
                            {p.stock.toLocaleString()} units
                          </span>
                        </td>

                        {/* 6f. Platform WebLinks */}
                        <td className="p-4">
                          {isEditing ? (
                            <div className="space-y-1.5 min-w-[140px]">
                              <input 
                                type="url" 
                                placeholder="Vamjo Link" 
                                value={editVamjoWeblink}
                                onChange={e => setEditVamjoWeblink(e.target.value)}
                                className="w-full text-[9px] px-1.5 py-1 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded focus:outline-none focus:border-sky-500"
                              />
                              <input 
                                type="url" 
                                placeholder="Amazon Link" 
                                value={editAmazonWeblink}
                                onChange={e => setEditAmazonWeblink(e.target.value)}
                                className="w-full text-[9px] px-1.5 py-1 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded focus:outline-none focus:border-amber-500"
                              />
                              <input 
                                type="url" 
                                placeholder="Flipkart Link" 
                                value={editFlipkartWeblink}
                                onChange={e => setEditFlipkartWeblink(e.target.value)}
                                className="w-full text-[9px] px-1.5 py-1 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded focus:outline-none focus:border-blue-500"
                              />
                              <input 
                                type="url" 
                                placeholder="Meesho Link" 
                                value={editMeeshoWeblink}
                                onChange={e => setEditMeeshoWeblink(e.target.value)}
                                className="w-full text-[9px] px-1.5 py-1 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded focus:outline-none focus:border-pink-500"
                              />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 min-w-[120px] font-mono">
                              {p.vamjoWeblink ? (
                                <a href={p.vamjoWeblink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-bold hover:underline transition-colors" title={p.vamjoWeblink}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0"></span>
                                  <span>Vamjo Link ↗</span>
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-600">No Vamjo link</span>
                              )}
                              {p.amazonWeblink ? (
                                <a href={p.amazonWeblink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-400 font-bold hover:underline transition-colors" title={p.amazonWeblink}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                                  <span>Amazon Link ↗</span>
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-600">No Amazon link</span>
                              )}
                              {p.flipkartWeblink ? (
                                <a href={p.flipkartWeblink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-bold hover:underline transition-colors" title={p.flipkartWeblink}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"></span>
                                  <span>Flipkart Link ↗</span>
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-600">No Flipkart link</span>
                              )}
                              {p.meeshoWeblink ? (
                                <a href={p.meeshoWeblink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-pink-400 hover:text-pink-300 font-bold hover:underline transition-colors" title={p.meeshoWeblink}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-pink-405 shrink-0"></span>
                                  <span>Meesho Link ↗</span>
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-600">No Meesho link</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 7. Notes */}
                        <td className="p-4 text-slate-400 max-w-xs">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editNotes}
                              onChange={e => setEditNotes(e.target.value)}
                              className="w-full p-1 bg-[#0d0d10] border border-slate-800 text-xs text-white rounded-md focus:outline-none"
                            />
                          ) : (
                            <span className="block truncate hover:text-slate-200 select-none cursor-help" title={p.notes}>
                              {p.notes || 'No active notes.'}
                            </span>
                          )}
                        </td>

                      </tr>
                      {expandedProductId === p.id && (
                        <tr key={p.id + '-expanded'} className="bg-[#111114]/80 border-t border-b border-slate-800">
                          <td colSpan={16} className="p-5 pl-8">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-slate-300">
                              {isEditing ? (
                                <>
                                  <div className="md:col-span-4 text-xs font-bold text-indigo-400 uppercase tracking-widest pb-1 border-b border-slate-800">
                                    Edit Catalog Specifications (Saves when clicking 'Commit' on main row)
                                  </div>
                                  
                                  <div>
                                    <label className="block text-[10px] font-bold text-sky-400 mb-1 uppercase">Multiple Images (Comma-separated URLs):</label>
                                    <input 
                                      type="text"
                                      value={editImagesText}
                                      onChange={e => setEditImagesText(e.target.value)}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded focus:outline-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-amber-500 mb-1 uppercase">Product Variants (e.g. 500ml, 1L):</label>
                                    <input 
                                      type="text"
                                      value={editVariants}
                                      onChange={e => setEditVariants(e.target.value)}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded focus:outline-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-emerald-400 mb-1 uppercase">Stock Availability:</label>
                                    <select 
                                      value={editStockAvailability}
                                      onChange={e => setEditStockAvailability(e.target.value)}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded cursor-pointer focus:outline-none"
                                    >
                                      <option value="In Stock">In Stock</option>
                                      <option value="Low Stock">Low Stock</option>
                                      <option value="Out of Stock">Out of Stock</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-rose-400 mb-1 uppercase">MRP (₹):</label>
                                    <input 
                                      type="number"
                                      value={editMrp}
                                      onChange={e => {
                                        const val = parseInt(e.target.value) || 0;
                                        setEditMrp(val);
                                        const off = editOfferPrice || editOnlinePrice;
                                        if (val > 0 && off > 0) {
                                          setEditDiscount(Math.max(0, Math.round(((val - off) / val) * 100)));
                                        }
                                      }}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded focus:outline-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-indigo-400 mb-1 uppercase">Offer Price (₹):</label>
                                    <input 
                                      type="number"
                                      value={editOfferPrice}
                                      onChange={e => {
                                        const val = parseInt(e.target.value) || 0;
                                        setEditOfferPrice(val);
                                        setEditOnlinePrice(val);
                                        const mrpVal = editMrp || editShopPrice;
                                        if (mrpVal > 0) {
                                          setEditDiscount(Math.max(0, Math.round(((mrpVal - val) / mrpVal) * 100)));
                                        }
                                      }}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded focus:outline-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-teal-400 mb-1 uppercase">Discount (%):</label>
                                    <input 
                                      type="number"
                                      value={editDiscount}
                                      onChange={e => setEditDiscount(parseInt(e.target.value) || 0)}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded focus:outline-none"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-yellow-500 mb-1 uppercase">Rating (1-5 ⭐):</label>
                                    <select 
                                      value={editRating}
                                      onChange={e => setEditRating(parseFloat(e.target.value) || 5)}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded cursor-pointer focus:outline-none"
                                    >
                                      <option value="5">5.0 - Excellent</option>
                                      <option value="4.5">4.5 - Very Good</option>
                                      <option value="4">4.0 - Good</option>
                                      <option value="3.5">3.5 - Above Average</option>
                                      <option value="3">3.0 - Average</option>
                                      <option value="2">2.0 - Poor</option>
                                      <option value="1">1.0 - Terrible</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-pink-400 mb-1 uppercase">Reviews Count:</label>
                                    <input 
                                      type="number"
                                      value={editReviewsCount}
                                      onChange={e => setEditReviewsCount(parseInt(e.target.value) || 0)}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded focus:outline-none"
                                    />
                                  </div>

                                  <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-purple-400 mb-1 uppercase">Ingredients:</label>
                                    <input 
                                      type="text"
                                      value={editIngredients}
                                      onChange={e => setEditIngredients(e.target.value)}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded focus:outline-none"
                                    />
                                  </div>

                                  <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Specifications:</label>
                                    <textarea 
                                      value={editSpecifications}
                                      onChange={e => setEditSpecifications(e.target.value)}
                                      rows={2}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded resize-none focus:outline-none"
                                    />
                                  </div>

                                  <div className="md:col-span-4">
                                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">E-Commerce Description:</label>
                                    <textarea 
                                      value={editDescription}
                                      onChange={e => setEditDescription(e.target.value)}
                                      rows={2}
                                      className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded resize-none focus:outline-none"
                                    />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="md:col-span-4 flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
                                    <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                                      Product Master Specs & E-Commerce Details
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] px-2.5 py-0.5 bg-[#1a1c23] border border-indigo-900/60 rounded text-indigo-400 font-bold">
                                        Rating: {p.rating !== undefined ? p.rating : '5.0'} ⭐ ({p.reviewsCount !== undefined ? p.reviewsCount : '0'} reviews)
                                      </span>
                                      <span className={`text-[10px] px-2.5 py-0.5 rounded font-bold uppercase ${
                                        (p.stockAvailability || 'In Stock') === 'In Stock' 
                                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900' 
                                          : (p.stockAvailability === 'Low Stock' ? 'bg-amber-950/60 text-amber-400 border border-amber-900' : 'bg-rose-950/60 text-rose-400 border border-rose-900')
                                      }`}>
                                        {p.stockAvailability || 'In Stock'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="md:col-span-2 space-y-4">
                                    <div>
                                      <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Catalog Description</h5>
                                      <p className="text-xs text-slate-300 mt-1 leading-relaxed whitespace-pre-line">{p.description || p.notes || 'No consumer description configured.'}</p>
                                    </div>

                                    <div>
                                      <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product Variants</h5>
                                      <p className="text-xs text-indigo-300 mt-1 font-semibold">{p.variants || 'No variants configured.'}</p>
                                    </div>

                                    <div>
                                      <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ingredients</h5>
                                      <p className="text-xs text-slate-300 mt-1 italic">{p.ingredients || 'No ingredients listed.'}</p>
                                    </div>
                                  </div>

                                  <div className="md:col-span-2 space-y-4">
                                    <div>
                                      <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Technical Specifications</h5>
                                      <p className="text-xs text-slate-300 mt-1 whitespace-pre-line leading-relaxed">{p.specifications || 'No technical specifications configured.'}</p>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 bg-[#0c0c0e] p-3 rounded-xl border border-slate-800/80">
                                      <div>
                                        <span className="text-[9px] text-slate-500 uppercase font-black block">MRP</span>
                                        <span className="text-xs font-mono font-bold text-rose-400">₹{p.mrp !== undefined ? p.mrp : p.shopPrice || 0}</span>
                                      </div>
                                      <div>
                                        <span className="text-[9px] text-slate-500 uppercase font-black block">OFFER PRICE</span>
                                        <span className="text-xs font-mono font-bold text-teal-400">₹{p.offerPrice !== undefined ? p.offerPrice : p.onlinePrice || 0}</span>
                                      </div>
                                      <div>
                                        <span className="text-[9px] text-slate-500 uppercase font-black block">DISCOUNT</span>
                                        <span className="text-xs font-mono font-bold text-emerald-400">
                                          {p.discount !== undefined ? p.discount : (p.shopPrice && p.onlinePrice ? Math.max(0, Math.round(((p.shopPrice - p.onlinePrice) / p.shopPrice) * 100)) : 0)}% OFF
                                        </span>
                                      </div>
                                    </div>

                                    {(() => {
                                      const additionalImgs = normalizeStringArray(p.images);
                                      if (additionalImgs.length === 0) return null;
                                      return (
                                        <div>
                                          <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Additional Product Images</h5>
                                          <div className="flex gap-2 flex-wrap">
                                            {additionalImgs.map((imgUrl, idx) => (
                                              <img 
                                                key={idx}
                                                src={imgUrl} 
                                                alt={`Alt ${idx}`} 
                                                referrerPolicy="no-referrer"
                                                className="w-12 h-12 object-cover rounded-lg border border-slate-800 hover:border-slate-700 transition cursor-help bg-[#0d0d10]"
                                                title={`Product image #${idx + 1}`}
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  {/* CUSTOMER REVIEWS SECTION */}
                                  <div className="md:col-span-4 mt-6 pt-6 border-t border-slate-800">
                                    <ProductReviewsSection 
                                      product={p} 
                                      updateProduct={updateProduct}
                                      productReviews={productReviews}
                                      addProductReview={addProductReview}
                                      currentUser={currentUser}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                </tbody>
              </table>
            </div>
          </div>

          {/* EDIT PRODUCT MODAL (POPUP NEW WINDOW AS REQUESTED) */}
          {editingProductId && (
            <div className="fixed inset-0 z-[1000] overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
              <div className="bg-[#141418] border border-slate-850 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-fadeIn my-auto flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0d0d10] shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Edit Product details</h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Updating Product SKU prefix <span className="text-indigo-400 font-bold font-mono">{editSku}</span>
                    </p>
                  </div>
                  <button 
                    onClick={() => setEditingProductId(null)}
                    className="text-slate-400 hover:text-white hover:bg-slate-800 p-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body - using same layout patterns of create product screen fields */}
                <div className="p-6 overflow-y-auto space-y-6 text-xs scrollbar-thin flex-1">
                  {skuError && (
                    <div className="p-3 bg-rose-950/40 border border-rose-900/50 text-rose-400 rounded-xl text-xs font-semibold">
                      {skuError}
                    </div>
                  )}

                  <div className="bg-[#141418] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Product Master Details</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">PROD NAME:</label>
                        <input 
                          type="text" 
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">SKU PREFIX:</label>
                        <input 
                          type="text" 
                          value={editSku}
                          onChange={e => setEditSku(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">HSN CODE:</label>
                        <input
                          type="text"
                          placeholder="e.g. 330499"
                          value={editHsnCode}
                          onChange={e => setEditHsnCode(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">PACKING SIZE:</label>
                        <input 
                          type="text" 
                          value={editPackingSize}
                          onChange={e => setEditPackingSize(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">UNIT (UQC):</label>
                        <select 
                          value={editUnit}
                          onChange={e => setEditUnit(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-indigo-300 font-mono font-bold rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          required
                        >
                          {units.map(u => (
                            <option key={u.id} value={u.uqc} className="bg-[#0d0d10] text-slate-200 font-sans">
                              {u.uqc} ({u.desc})
                            </option>
                          ))}
                          {editUnit && !units.some(u => u.uqc.toUpperCase() === editUnit.toUpperCase()) && (
                            <option value={editUnit} className="bg-[#0d0d10] text-slate-200 font-sans">
                              {editUnit}
                            </option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-rose-400 mb-1.5 uppercase tracking-wider">MRP (₹):</label>
                        <input 
                          type="number"
                          placeholder="Maximum Retail Price"
                          value={editMrp}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            setEditMrp(val);
                            const off = editOfferPrice || editOnlinePrice;
                            if (val > 0 && off > 0) {
                              setEditDiscount(Math.max(0, Math.round(((val - off) / val) * 100)));
                            }
                          }}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          min="1"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-indigo-400 mb-1.5 uppercase tracking-wider">ONLINE PRICE (₹):</label>
                        <input 
                          type="number" 
                          value={editOnlinePrice}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            setEditOnlinePrice(val);
                            setEditOfferPrice(val);
                            const mrpVal = editMrp || editShopPrice;
                            if (mrpVal > 0) {
                              setEditDiscount(Math.max(0, Math.round(((mrpVal - val) / mrpVal) * 100)));
                            }
                          }}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-amber-500 mb-1.5 uppercase tracking-wider">SHOP PRICE (₹):</label>
                        <input 
                          type="number" 
                          value={editShopPrice}
                          onChange={e => setEditShopPrice(parseInt(e.target.value) || 0)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">GST RATE (%):</label>
                        <select 
                          value={editGstPercentage}
                          onChange={e => setEditGstPercentage(parseInt(e.target.value) || 0)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value={5}>5% GST (Essential)</option>
                          <option value={12}>12% GST (Standard)</option>
                          <option value={18}>18% GST (Active Household)</option>
                          <option value={28}>28% GST (Luxury/Special)</option>
                          <option value={0}>0% GST (Exempt)</option>
                        </select>
                      </div>

                      {/* EDIT CATEGORY SEARCHABLE COMBOBOX */}
                      <div className="relative" ref={editCatDropdownRef}>
                        <label className="block text-[10px] font-bold text-sky-400 mb-1.5 uppercase tracking-wider">CATEGORY:</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            placeholder="e.g. Fruits & Flowers" 
                            value={isEditCatDropdownOpen ? editCatSearchQuery : editCategory}
                            onChange={e => {
                              const val = e.target.value;
                              setEditCategory(val);
                              setEditCatSearchQuery(val);
                              setIsEditCatDropdownOpen(true);
                            }}
                            onFocus={() => {
                              setIsEditCatDropdownOpen(true);
                              setEditCatSearchQuery(editCategory);
                            }}
                            className="w-full text-xs p-2.5 pr-14 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {editCategory && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditCategory('');
                                  setEditCatSearchQuery('');
                                }}
                                className="hover:text-rose-400 text-slate-500 transition cursor-pointer p-0.5"
                                title="Clear field"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditCatDropdownOpen(!isEditCatDropdownOpen);
                                if (!isEditCatDropdownOpen) {
                                  setEditCatSearchQuery(editCategory);
                                }
                              }}
                              className="hover:text-indigo-400 text-slate-500 transition cursor-pointer p-0.5"
                              title="Toggle dropdown"
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isEditCatDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>

                        {isEditCatDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#0d0d10] border border-slate-850 rounded-xl max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-850 animate-fadeIn scrollbar-thin">
                            {filteredEditCategories.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                                No matching categories. Type to use custom category.
                              </div>
                            ) : (
                              filteredEditCategories.map(cat => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => {
                                    setEditCategory(cat);
                                    setEditCatSearchQuery(cat);
                                    setIsEditCatDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-slate-900 text-slate-300 hover:text-white transition flex items-center justify-between cursor-pointer"
                                >
                                  <span>{cat}</span>
                                  {editCategory.toLowerCase() === cat.toLowerCase() && (
                                    <Check className="w-3 h-3 text-sky-400 shrink-0" />
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* EDIT BRAND SEARCHABLE COMBOBOX */}
                      <div className="relative" ref={editBrandDropdownRef}>
                        <label className="block text-[10px] font-bold text-amber-400 mb-1.5 uppercase tracking-wider">BRAND:</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            placeholder="e.g. Vamjo" 
                            value={isEditBrandDropdownOpen ? editBrandSearchQuery : editBrand}
                            onChange={e => {
                              const val = e.target.value;
                              setEditBrand(val);
                              setEditBrandSearchQuery(val);
                              setIsEditBrandDropdownOpen(true);
                            }}
                            onFocus={() => {
                              setIsEditBrandDropdownOpen(true);
                              setEditBrandSearchQuery(editBrand);
                            }}
                            className="w-full text-xs p-2.5 pr-14 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {editBrand && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditBrand('');
                                  setEditBrandSearchQuery('');
                                }}
                                className="hover:text-rose-400 text-slate-500 transition cursor-pointer p-0.5"
                                title="Clear field"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditBrandDropdownOpen(!isEditBrandDropdownOpen);
                                if (!isEditBrandDropdownOpen) {
                                  setEditBrandSearchQuery(editBrand);
                                }
                              }}
                              className="hover:text-indigo-400 text-slate-500 transition cursor-pointer p-0.5"
                              title="Toggle dropdown"
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isEditBrandDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>

                        {isEditBrandDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#0d0d10] border border-slate-850 rounded-xl max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-850 animate-fadeIn scrollbar-thin">
                            {filteredEditBrands.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                                No matching brands. Type to use custom brand.
                              </div>
                            ) : (
                              filteredEditBrands.map(b => (
                                <button
                                  key={b.name}
                                  type="button"
                                  onClick={() => {
                                    setEditBrand(b.name);
                                    setEditBrandSearchQuery(b.name);
                                    if (b.owner) {
                                      setEditBrandOwner(b.owner);
                                      setEditOwnerSearchQuery(b.owner);
                                    }
                                    setIsEditBrandDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-slate-900 text-slate-300 hover:text-white transition flex flex-col cursor-pointer"
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <span className="font-medium text-slate-200">{b.name}</span>
                                    {editBrand.toLowerCase() === b.name.toLowerCase() && (
                                      <Check className="w-3 h-3 text-amber-400 shrink-0" />
                                    )}
                                  </div>
                                  {b.owner && (
                                    <span className="text-[9px] text-slate-500 mt-0.5">Owner: {b.owner}</span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* EDIT BRAND OWNER SEARCHABLE COMBOBOX */}
                      <div className="relative" ref={editOwnerDropdownRef}>
                        <label className="block text-[10px] font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">BRAND OWNER:</label>
                        <div className="relative">
                          <input 
                            type="text" 
                            placeholder="e.g. Vamjo Brands Ltd" 
                            value={isEditOwnerDropdownOpen ? editOwnerSearchQuery : editBrandOwner}
                            onChange={e => {
                              const val = e.target.value;
                              setEditBrandOwner(val);
                              setEditOwnerSearchQuery(val);
                              setIsEditOwnerDropdownOpen(true);
                            }}
                            onFocus={() => {
                              setIsEditOwnerDropdownOpen(true);
                              setEditOwnerSearchQuery(editBrandOwner);
                            }}
                            className="w-full text-xs p-2.5 pr-14 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {editBrandOwner && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditBrandOwner('');
                                  setEditOwnerSearchQuery('');
                                }}
                                className="hover:text-rose-400 text-slate-500 transition cursor-pointer p-0.5"
                                title="Clear field"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditOwnerDropdownOpen(!isEditOwnerDropdownOpen);
                                if (!isEditOwnerDropdownOpen) {
                                  setEditOwnerSearchQuery(editBrandOwner);
                                }
                              }}
                              className="hover:text-indigo-400 text-slate-500 transition cursor-pointer p-0.5"
                              title="Toggle dropdown"
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isEditOwnerDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>

                        {isEditOwnerDropdownOpen && (
                          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#0d0d10] border border-slate-850 rounded-xl max-h-48 overflow-y-auto shadow-2xl divide-y divide-slate-850 animate-fadeIn scrollbar-thin">
                            {filteredEditOwners.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                                No matching brand owners. Type to use custom owner.
                              </div>
                            ) : (
                              filteredEditOwners.map(owner => (
                                <button
                                  key={owner}
                                  type="button"
                                  onClick={() => {
                                    setEditBrandOwner(owner);
                                    setEditOwnerSearchQuery(owner);
                                    setIsEditOwnerDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[11px] hover:bg-slate-900 text-slate-300 hover:text-white transition flex items-center justify-between cursor-pointer"
                                >
                                  <span>{owner}</span>
                                  {editBrandOwner.toLowerCase() === owner.toLowerCase() && (
                                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-violet-400 mb-1.5 uppercase tracking-wider font-mono">Stock In (Qty Received):</label>
                        <input 
                          type="number" 
                          value={editStockIn}
                          onChange={e => setEditStockIn(parseInt(e.target.value) || 0)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          min="0"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-rose-400 mb-1.5 uppercase tracking-wider font-mono">Stock Out (Qty Sold/Out):</label>
                        <input 
                          type="number" 
                          value={editStockOut}
                          onChange={e => setEditStockOut(parseInt(e.target.value) || 0)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          min="0"
                          required
                        />
                      </div>
                    </div>

                    {/* DRAG AND DROP / FILE INPUT IN EDIT MODAL */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch border-t border-slate-800/60 pt-4">
                      <div className="md:col-span-12 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Product Photo / Image Details
                      </div>
                      <div className="md:col-span-7">
                        <div 
                          onDragEnter={handleEditDrag}
                          onDragOver={handleEditDrag}
                          onDragLeave={handleEditDrag}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                              uploadProductImage(e.dataTransfer.files[0], editingProductId || '').then(({ downloadUrl }) => {
                                setEditPicture(downloadUrl);
                                if (editingProductId) updateProduct(editingProductId, { imageUrl: downloadUrl, storagePath: `products/${editingProductId}/main.jpg` });
                              }).catch(() => alert('Failed to replace product image.'));
                            }
                          }}
                          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center h-full min-h-[110px] ${
                            editDragActive 
                              ? 'border-indigo-500 bg-indigo-950/10' 
                              : 'border-slate-800 hover:border-slate-700 bg-[#0d0d10]'
                          }`}
                          onClick={() => document.getElementById('edit-modal-file-input')?.click()}
                        >
                          <input 
                            type="file" 
                            id="edit-modal-file-input" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                uploadProductImage(e.target.files[0], editingProductId || '').then(({ downloadUrl }) => {
                                  setEditPicture(downloadUrl);
                                  if (editingProductId) updateProduct(editingProductId, { imageUrl: downloadUrl, storagePath: `products/${editingProductId}/main.jpg` });
                                }).catch(() => alert('Failed to replace product image.'));
                              }
                            }}
                          />
                          <div className="flex flex-col items-center justify-center space-y-1">
                            <Plus className="w-5 h-5 text-indigo-400 animate-pulse" />
                            <p className="text-[11px] font-medium text-slate-200">
                              Drop photo here or <span className="text-indigo-400 font-bold hover:underline">browse files</span>
                            </p>
                            <p className="text-[9px] text-slate-500">
                              PNG, JPG, WebP up to 10MB
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-5 flex items-center gap-3 bg-[#0d0d10] p-3 border border-slate-800 rounded-xl">
                        <img 
                          src={editPicture || 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=80&auto=format&fit=crop&q=60'} 
                          alt="Product preview" 
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-800 bg-[#0d0d10] shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <span className="text-[9px] font-bold text-slate-500 block uppercase tracking-wide">Or Input Image URL:</span>
                          <input 
                            type="text" 
                            placeholder="https://images.unsplash.com/photo-..." 
                            value={editPicture}
                            onChange={e => setEditPicture(e.target.value)}
                            className="w-full text-[10px] p-2 bg-[#141418] border border-slate-800 text-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* WEBLINKS GRID */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-[#0d0d10] p-3 rounded-xl border border-slate-800 mt-4">
                      <div>
                        <label className="block text-[10px] font-bold text-sky-400 mb-1.5 uppercase tracking-wider">VAMJO WEBLINK:</label>
                        <input 
                          type="url" 
                          placeholder="https://vamjo.com/..." 
                          value={editVamjoWeblink}
                          onChange={e => setEditVamjoWeblink(e.target.value)}
                          className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-amber-500 mb-1.5 uppercase tracking-wider">AMAZON WEBLINK:</label>
                        <input 
                          type="url" 
                          placeholder="https://amazon.in/..." 
                          value={editAmazonWeblink}
                          onChange={e => setEditAmazonWeblink(e.target.value)}
                          className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-blue-400 mb-1.5 uppercase tracking-wider">FLIPKART WEBLINK:</label>
                        <input 
                          type="url" 
                          placeholder="https://flipkart.com/..." 
                          value={editFlipkartWeblink}
                          onChange={e => setEditFlipkartWeblink(e.target.value)}
                          className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-pink-400 mb-1.5 uppercase tracking-wider">MEESHO WEBLINK:</label>
                        <input 
                          type="url" 
                          placeholder="https://meesho.com/..." 
                          value={editMeeshoWeblink}
                          onChange={e => setEditMeeshoWeblink(e.target.value)}
                          className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* EXTENDED SPECIFICATIONS */}
                  <div className="bg-[#141418] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">E-Commerce & Master Table Catalog Details</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="sm:col-span-2 md:col-span-3 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Multiple Images Upload Option */}
                          <div className="bg-[#111114] border border-slate-800/60 p-4 rounded-xl space-y-3">
                            <label className="block text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                              E-Commerce Multiple Images
                            </label>
                            <div className="space-y-2">
                              <input 
                                type="text" 
                                placeholder="Or type comma-separated URLs: https://image1.jpg, https://image2.jpg" 
                                value={editImagesText}
                                onChange={e => {
                                  setEditImagesText(e.target.value);
                                  setEditImages(e.target.value.split(',').map(s => s.trim()).filter(Boolean));
                                }}
                                className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Or Drag & Upload Image Files</span>
                              </div>
                              <input 
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={e => {
                                  if (e.target.files) {
                                    Array.from(e.target.files).forEach((file: any) => {
                                      handleImageUploadAsync(file, (downloadUrl) => {
                                        setEditImages(prev => {
                                          const current = Array.isArray(prev) ? prev : [];
                                          const updated = [...current, downloadUrl];
                                          setEditImagesText(updated.join(', '));
                                          return updated;
                                        });
                                      });
                                    });
                                  }
                                }}
                                className="w-full text-[11px] text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-indigo-950 file:text-indigo-400 hover:file:bg-indigo-900 transition file:cursor-pointer"
                              />
                            </div>
                            
                            {/* Thumbnail Gallery */}
                            {Array.isArray(editImages) && editImages.length > 0 && (
                              <div className="flex flex-wrap gap-2 p-2 bg-[#0d0d10] border border-slate-800 rounded-lg">
                                {editImages.map((img, idx) => (
                                  <div key={idx} className="relative group w-12 h-12">
                                    <img src={img} alt={`Img ${idx}`} className="w-full h-full object-cover rounded border border-slate-800" />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (Array.isArray(editImages) ? editImages : []).filter((_, i) => i !== idx);
                                        setEditImages(updated);
                                        setEditImagesText(updated.join(', '));
                                      }}
                                      className="absolute -top-1 -right-1 bg-rose-600 text-white p-0.5 rounded-full hover:bg-rose-500 opacity-0 group-hover:opacity-100 transition duration-150"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Multiple Videos Upload Option */}
                          <div className="bg-[#111114] border border-slate-800/60 p-4 rounded-xl space-y-3">
                            <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                              E-Commerce Product Videos
                            </label>
                            <div className="space-y-2">
                              <input 
                                type="text" 
                                placeholder="Or type comma-separated URLs: https://video1.mp4, https://video2.mp4" 
                                value={editVideosText}
                                onChange={e => {
                                  setEditVideosText(e.target.value);
                                  setEditVideos(e.target.value.split(',').map(s => s.trim()).filter(Boolean));
                                }}
                                className="w-full text-xs p-2 bg-[#141418] border border-slate-800 text-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Or Drag & Upload Video Files</span>
                              </div>
                              <input 
                                type="file"
                                accept="video/*"
                                multiple
                                onChange={e => {
                                  if (e.target.files) {
                                    Array.from(e.target.files).forEach((file: any) => {
                                      handleVideoUploadAsync(file, (downloadUrl) => {
                                        setEditVideos(prev => {
                                          const current = Array.isArray(prev) ? prev : [];
                                          const updated = [...current, downloadUrl];
                                          setEditVideosText(updated.join(', '));
                                          return updated;
                                        });
                                      });
                                    });
                                  }
                                }}
                                className="w-full text-[11px] text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-amber-950 file:text-amber-400 hover:file:bg-amber-900 transition file:cursor-pointer"
                              />
                            </div>
                            
                            {/* Video Preview Gallery */}
                            {Array.isArray(editVideos) && editVideos.length > 0 && (
                              <div className="flex flex-wrap gap-2 p-2 bg-[#0d0d10] border border-slate-800 rounded-lg">
                                {editVideos.map((vid, idx) => (
                                  <div key={idx} className="relative group w-32 h-20">
                                    <video src={vid} className="w-full h-full object-cover rounded border border-slate-800 bg-black" />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (Array.isArray(editVideos) ? editVideos : []).filter((_, i) => i !== idx);
                                        setEditVideos(updated);
                                        setEditVideosText(updated.join(', '));
                                      }}
                                      className="absolute -top-1 -right-1 bg-rose-600 text-white p-0.5 rounded-full hover:bg-rose-500 opacity-0 group-hover:opacity-100 transition duration-150 z-10"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-amber-500 mb-1.5 uppercase tracking-wider">PRODUCT VARIANTS (e.g. 500ml, 1L):</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Lavender, Lemon, Rose" 
                          value={editVariants}
                          onChange={e => setEditVariants(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">STOCK AVAILABILITY STATUS:</label>
                        <select 
                          value={editStockAvailability}
                          onChange={e => setEditStockAvailability(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="In Stock">In Stock</option>
                          <option value="Low Stock">Low Stock</option>
                          <option value="Out of Stock">Out of Stock</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-indigo-400 mb-1.5 uppercase tracking-wider">OFFER PRICE (₹):</label>
                        <input 
                          type="number" 
                          value={editOfferPrice}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            setEditOfferPrice(val);
                            setEditOnlinePrice(val);
                            const mrpVal = editMrp || editShopPrice;
                            if (mrpVal > 0) {
                              setEditDiscount(Math.max(0, Math.round(((mrpVal - val) / mrpVal) * 100)));
                            }
                          }}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-teal-400 mb-1.5 uppercase tracking-wider">DISCOUNT (%):</label>
                        <input 
                          type="number" 
                          value={editDiscount}
                          onChange={e => setEditDiscount(parseInt(e.target.value) || 0)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          min="0"
                          max="100"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-yellow-500 mb-1.5 uppercase tracking-wider">CUSTOMER RATINGS (1-5 ⭐):</label>
                        <select 
                          value={editRating}
                          onChange={e => setEditRating(parseFloat(e.target.value) || 5)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="5">5.0 - Excellent</option>
                          <option value="4.5">4.5 - Very Good</option>
                          <option value="4">4.0 - Good</option>
                          <option value="3.5">3.5 - Above Average</option>
                          <option value="3">3.0 - Average</option>
                          <option value="2">2.0 - Poor</option>
                          <option value="1">1.0 - Terrible</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-pink-400 mb-1.5 uppercase tracking-wider">TOTAL REVIEWS COUNT:</label>
                        <input 
                          type="number" 
                          value={editReviewsCount}
                          onChange={e => setEditReviewsCount(parseInt(e.target.value) || 0)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          min="0"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-purple-400 mb-1.5 uppercase tracking-wider">INGREDIENTS:</label>
                        <input 
                          type="text" 
                          value={editIngredients}
                          onChange={e => setEditIngredients(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="sm:col-span-2 md:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">TECHNICAL SPECIFICATIONS:</label>
                        <textarea 
                          value={editSpecifications}
                          onChange={e => setEditSpecifications(e.target.value)}
                          rows={2}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                      </div>

                      <div className="sm:col-span-2 md:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">E-COMMERCE DESCRIPTION:</label>
                        <textarea 
                          value={editDescription}
                          onChange={e => setEditDescription(e.target.value)}
                          rows={2}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-202 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                      </div>

                      <div className="sm:col-span-2 md:col-span-3">
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">NOTES / DESCRIPTION:</label>
                        <textarea 
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          rows={2}
                          className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sticky Bottom Actions */}
                <div className="p-5 border-t border-slate-800 bg-[#0d0d10] flex items-center justify-end gap-3 shrink-0">
                  <button 
                    onClick={() => setEditingProductId(null)}
                    className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleSavePricing(editingProductId)}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Categories Master Grid view */}
      {productsSubTab === 'categories' && (
        <div className="space-y-6">
          <input
            type="file"
            accept="image/*"
            ref={categoryImageInputRef}
            onChange={handleCategoryImageFileChange}
            className="hidden"
            id="category-image-upload-input"
          />
          {categoryImageError && (
            <div className="flex items-center justify-between bg-rose-950/30 border border-rose-900/40 text-rose-300 text-xs rounded-xl px-4 py-2.5">
              <span>{categoryImageError}</span>
              <button onClick={() => setCategoryImageError(null)} className="text-rose-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="category-masters-grid">
            {dynamicCategories
              .filter(cat => cat.toLowerCase().includes(masterSearchQuery.toLowerCase()))
              .map(cat => {
                const catProducts = products.filter(p => (p.category || 'Uncategorized').toLowerCase() === cat.toLowerCase());
                const totalProducts = catProducts.length;
                const totalStock = catProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
                const totalRevenue = catProducts.reduce((sum, p) => sum + getProductRevenue(p), 0);
                const totalUnitsSold = catProducts.reduce((sum, p) => sum + getProductVolume(p), 0);
                
                // Calculate Net Revenue (Before GST), Total Orders, Last Sales Date from non-cancelled orders
                let netRevenueBeforeGst = 0;
                let totalOrdersCount = 0;
                let lastSalesDate: string = 'N/A';

                salesOrders.forEach(order => {
                  if (order.deliveryStatus === 'Cancelled') return;
                  
                  let hasCatProduct = false;
                  if (order.products) {
                    order.products.forEach(item => {
                      const pMaster = products.find(prod => prod.id === item.productId);
                      const itemCat = pMaster?.category || item.category || 'Uncategorized';
                      if (itemCat.toLowerCase() === cat.toLowerCase()) {
                        hasCatProduct = true;
                        
                        const gstRate = item.gstPercentage !== undefined ? item.gstPercentage : (pMaster?.gstPercentage !== undefined ? pMaster.gstPercentage : 18);
                        const itemTotal = item.price * item.quantity;
                        const gstAmount = itemTotal * (gstRate / (100 + gstRate));
                        const baseValue = itemTotal - gstAmount;
                        netRevenueBeforeGst += baseValue;
                      }
                    });
                  }
                  
                  if (hasCatProduct) {
                    totalOrdersCount += 1;
                    const orderDate = order.invoiceDate || order.createdAt;
                    if (orderDate) {
                      if (lastSalesDate === 'N/A' || new Date(orderDate) > new Date(lastSalesDate)) {
                        lastSalesDate = orderDate;
                      }
                    }
                  }
                });

                const formattedLastSalesDate = lastSalesDate !== 'N/A' 
                  ? new Date(lastSalesDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  : 'N/A';

                const isEditing = editingMasterId === `category-${cat}`;

                return (
                  <div 
                    key={cat} 
                    className="bg-[#141418] border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/40 transition-all shadow-md group relative flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => hasAccess('Products & Clients', 'edit') && handleCategoryImageClick(cat)}
                            disabled={!hasAccess('Products & Clients', 'edit') || uploadingCategoryImageFor === cat}
                            className="w-10 h-10 rounded-xl bg-sky-950/40 border border-sky-800/40 flex items-center justify-center text-sky-400 overflow-hidden shrink-0 cursor-pointer disabled:cursor-default relative group/catimg shadow-sm"
                            title={hasAccess('Products & Clients', 'edit') ? 'Upload category picture to Firestore DB' : 'Category picture'}
                          >
                            {uploadingCategoryImageFor === cat ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                            ) : getCategoryImage(cat) ? (
                              <img src={getCategoryImage(cat)} alt={cat} className="w-full h-full object-cover" />
                            ) : (
                              <Tag className="w-5 h-5 text-sky-400" />
                            )}
                            {hasAccess('Products & Clients', 'edit') && uploadingCategoryImageFor !== cat && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/catimg:opacity-100 transition-opacity flex items-center justify-center">
                                <Edit className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </button>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editMasterNameVal}
                              onChange={e => setEditMasterNameVal(e.target.value)}
                              className="p-1 bg-[#0d0d10] border border-slate-800 text-sm text-white rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                              onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      handleEditCategory(cat, editMasterNameVal);
                                      setEditingMasterId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingMasterId(null);
                                    }
                                  }}
                              autoFocus
                            />
                          ) : (
                            <h4 className="text-sm font-bold text-white group-hover:text-sky-400 transition-colors">{cat}</h4>
                          )}
                        </div>
                        {deletingMasterId === `category-${cat}` ? (
                          <div className="flex items-center gap-1.5 animate-fadeIn">
                            <span className="text-[10px] text-rose-400 font-medium font-sans">Delete?</span>
                            <button
                              onClick={() => {
                                handleDeleteCategory(cat);
                                setDeletingMasterId(null);
                              }}
                              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold uppercase transition cursor-pointer"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeletingMasterId(null)}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : !isEditing && hasAccess('Products & Clients', 'edit') && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingMasterId(`category-${cat}`);
                                setEditMasterNameVal(cat);
                              }}
                              className="p-1 hover:bg-slate-800 text-slate-404 hover:text-white rounded transition cursor-pointer"
                              title="Edit category name"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingMasterId(`category-${cat}`)}
                              className="p-1 hover:bg-rose-955/40 text-slate-404 hover:text-rose-400 rounded transition cursor-pointer"
                              title="Delete category"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {isEditing && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                handleEditCategory(cat, editMasterNameVal);
                                setEditingMasterId(null);
                              }}
                              className="px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMasterId(null)}
                              className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[10px] font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Sales Volume</span>
                          <span className="text-xs font-bold text-slate-202">{totalUnitsSold.toLocaleString()} sold</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Total Revenue</span>
                          <span className="text-xs font-bold text-emerald-400 font-mono">₹{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Net Revenue (Excl GST)</span>
                          <span className="text-xs font-bold text-indigo-400 font-mono">₹{netRevenueBeforeGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Total Orders</span>
                          <span className="text-xs font-bold text-slate-205">{totalOrdersCount} orders</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Last Sales Date</span>
                          <span className="text-xs font-bold text-slate-202 truncate block">{formattedLastSalesDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-800/60 pt-3">
                      {totalProducts > 0 ? (
                        <div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Portfolio Products:</span>
                          <div className="flex flex-wrap gap-1">
                            {catProducts.slice(0, 3).map(p => (
                              <span key={p.id} className="text-[10px] px-2 py-0.5 bg-[#0d0d10] border border-slate-800 text-slate-404 rounded-md truncate max-w-[120px]" title={p.name}>
                                {p.name}
                              </span>
                            ))}
                            {totalProducts > 3 && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-indigo-950/30 border border-indigo-900/30 text-indigo-400 rounded-md">
                                +{totalProducts - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-xs text-slate-600 italic py-2">
                          No products under this category yet
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Brands Master Grid view */}
      {productsSubTab === 'brands' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="brand-masters-grid">
            {dynamicBrands
              .filter(b => b.name.toLowerCase().includes(masterSearchQuery.toLowerCase()))
              .map(brand => {
                const brandProducts = products.filter(p => (p.brand || 'Generic').toLowerCase() === brand.name.toLowerCase());
                const totalProducts = brandProducts.length;
                const totalStock = brandProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
                const totalRevenue = brandProducts.reduce((sum, p) => sum + getProductRevenue(p), 0);
                const totalUnitsSold = brandProducts.reduce((sum, p) => sum + getProductVolume(p), 0);

                // Calculate Net Revenue (Before GST), Total Orders, Last Sales Date from non-cancelled orders
                let netRevenueBeforeGst = 0;
                let totalOrdersCount = 0;
                let lastSalesDate: string = 'N/A';

                salesOrders.forEach(order => {
                  if (order.deliveryStatus === 'Cancelled') return;
                  
                  let hasBrandProduct = false;
                  if (order.products) {
                    order.products.forEach(item => {
                      const pMaster = products.find(prod => prod.id === item.productId);
                      const itemBrand = pMaster?.brand || item.brand || 'Generic';
                      if (itemBrand.toLowerCase() === brand.name.toLowerCase()) {
                        hasBrandProduct = true;
                        
                        const gstRate = item.gstPercentage !== undefined ? item.gstPercentage : (pMaster?.gstPercentage !== undefined ? pMaster.gstPercentage : 18);
                        const itemTotal = item.price * item.quantity;
                        const gstAmount = itemTotal * (gstRate / (100 + gstRate));
                        const baseValue = itemTotal - gstAmount;
                        netRevenueBeforeGst += baseValue;
                      }
                    });
                  }
                  
                  if (hasBrandProduct) {
                    totalOrdersCount += 1;
                    const orderDate = order.invoiceDate || order.createdAt;
                    if (orderDate) {
                      if (lastSalesDate === 'N/A' || new Date(orderDate) > new Date(lastSalesDate)) {
                        lastSalesDate = orderDate;
                      }
                    }
                  }
                });

                const formattedLastSalesDate = lastSalesDate !== 'N/A' 
                  ? new Date(lastSalesDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  : 'N/A';

                const isEditing = editingMasterId === `brand-${brand.name}`;

                return (
                  <div 
                    key={brand.name} 
                    className="bg-[#141418] border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/40 transition-all shadow-md group relative flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => hasAccess('Products & Clients', 'edit') && handleBrandImageClick(brand.name)}
                            disabled={!hasAccess('Products & Clients', 'edit') || uploadingBrandImageFor === brand.name}
                            className="w-10 h-10 rounded-xl bg-amber-955/40 border border-amber-800/40 flex items-center justify-center text-amber-400 overflow-hidden shrink-0 cursor-pointer disabled:cursor-default relative group/brandimg shadow-sm"
                            title={hasAccess('Products & Clients', 'edit') ? 'Upload brand picture to Firestore DB' : 'Brand picture'}
                          >
                            {uploadingBrandImageFor === brand.name ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                            ) : getBrandImage(brand.name) ? (
                              <img src={getBrandImage(brand.name)} alt={brand.name} className="w-full h-full object-cover" />
                            ) : (
                              <Award className="w-5 h-5 text-amber-400" />
                            )}
                            {hasAccess('Products & Clients', 'edit') && uploadingBrandImageFor !== brand.name && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/brandimg:opacity-100 transition-opacity flex items-center justify-center">
                                <Edit className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </button>
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editMasterNameVal}
                                onChange={e => setEditMasterNameVal(e.target.value)}
                                placeholder="Brand Name"
                                className="p-1 text-xs bg-[#0d0d10] border border-slate-800 text-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                              />
                              <select
                                value={editMasterOwnerVal}
                                onChange={e => setEditMasterOwnerVal(e.target.value)}
                                className="p-1 text-[10px] bg-[#0d0d10] border border-slate-800 text-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              >
                                {dynamicBrandOwners.map(o => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">{brand.name}</h4>
                              <span className="text-[10px] text-slate-550 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-slate-500" />
                                {brand.owner}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {deletingMasterId === `brand-${brand.name}` ? (
                          <div className="flex items-center gap-1.5 animate-fadeIn">
                            <span className="text-[10px] text-rose-400 font-medium font-sans">Delete?</span>
                            <button
                              onClick={() => {
                                handleDeleteBrand(brand.name);
                                setDeletingMasterId(null);
                              }}
                              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold uppercase transition cursor-pointer"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeletingMasterId(null)}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : !isEditing && hasAccess('Products & Clients', 'edit') && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingMasterId(`brand-${brand.name}`);
                                setEditMasterNameVal(brand.name);
                                setEditMasterOwnerVal(brand.owner);
                              }}
                              className="p-1 hover:bg-slate-800 text-slate-404 hover:text-white rounded transition cursor-pointer"
                              title="Edit Brand"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingMasterId(`brand-${brand.name}`)}
                              className="p-1 hover:bg-rose-955/40 text-slate-404 hover:text-rose-400 rounded transition cursor-pointer"
                              title="Delete Brand"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {isEditing && (
                          <div className="flex flex-col gap-1.5 shrink-0 ml-2">
                            <button
                              onClick={() => {
                                handleEditBrand(brand.name, editMasterNameVal, editMasterOwnerVal);
                                setEditingMasterId(null);
                              }}
                              className="px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMasterId(null)}
                              className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[10px] font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4 mt-4">
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Sales Volume</span>
                          <span className="text-xs font-bold text-slate-202">{totalUnitsSold.toLocaleString()} sold</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Total Revenue</span>
                          <span className="text-xs font-bold text-emerald-400 font-mono">₹{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Net Revenue (Excl GST)</span>
                          <span className="text-xs font-bold text-indigo-400 font-mono">₹{netRevenueBeforeGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Total Orders</span>
                          <span className="text-xs font-bold text-slate-205">{totalOrdersCount} orders</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Last Sales Date</span>
                          <span className="text-xs font-bold text-slate-202 truncate block">{formattedLastSalesDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      {totalProducts > 0 ? (
                        <div className="border-t border-slate-800/60 pt-3">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Featured Products:</span>
                          <div className="flex flex-wrap gap-1">
                            {brandProducts.slice(0, 3).map(p => (
                              <span key={p.id} className="text-[10px] px-2 py-0.5 bg-[#0d0d10] border border-slate-800 text-slate-404 rounded-md truncate max-w-[120px]" title={p.name}>
                                {p.name}
                              </span>
                            ))}
                            {totalProducts > 3 && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-indigo-950/30 border border-indigo-900/30 text-indigo-400 rounded-md">
                                +{totalProducts - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="border-t border-slate-800/60 pt-3 text-center text-xs text-slate-600 italic">
                          No products under this brand yet
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Brand Owners Master Grid view */}
      {productsSubTab === 'owners' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="owner-masters-grid">
            {dynamicBrandOwners
              .filter(o => o.toLowerCase().includes(masterSearchQuery.toLowerCase()))
              .map(owner => {
                const ownerBrandsCount = dynamicBrands.filter(b => b.owner.toLowerCase() === owner.toLowerCase()).length;
                const ownerProducts = products.filter(p => getProductBrandOwner(p).toLowerCase() === owner.toLowerCase());
                const totalProducts = ownerProducts.length;
                const totalStock = ownerProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
                const totalRevenue = ownerProducts.reduce((sum, p) => sum + getProductRevenue(p), 0);
                const totalUnitsSold = ownerProducts.reduce((sum, p) => sum + getProductVolume(p), 0);

                // Calculate Net Revenue (Before GST), Total Orders, Last Sales Date from non-cancelled orders
                let netRevenueBeforeGst = 0;
                let totalOrdersCount = 0;
                let lastSalesDate: string = 'N/A';

                salesOrders.forEach(order => {
                  if (order.deliveryStatus === 'Cancelled') return;
                  
                  let hasOwnerProduct = false;
                  if (order.products) {
                    order.products.forEach(item => {
                      const pMaster = products.find(prod => prod.id === item.productId);
                      const itemOwner = pMaster ? getProductBrandOwner(pMaster) : (item.brandOwner || 'Generic Owner');
                      if (itemOwner.toLowerCase() === owner.toLowerCase()) {
                        hasOwnerProduct = true;
                        
                        const gstRate = item.gstPercentage !== undefined ? item.gstPercentage : (pMaster?.gstPercentage !== undefined ? pMaster.gstPercentage : 18);
                        const itemTotal = item.price * item.quantity;
                        const gstAmount = itemTotal * (gstRate / (100 + gstRate));
                        const baseValue = itemTotal - gstAmount;
                        netRevenueBeforeGst += baseValue;
                      }
                    });
                  }
                  
                  if (hasOwnerProduct) {
                    totalOrdersCount += 1;
                    const orderDate = order.invoiceDate || order.createdAt;
                    if (orderDate) {
                      if (lastSalesDate === 'N/A' || new Date(orderDate) > new Date(lastSalesDate)) {
                        lastSalesDate = orderDate;
                      }
                    }
                  }
                });

                const formattedLastSalesDate = lastSalesDate !== 'N/A' 
                  ? new Date(lastSalesDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  : 'N/A';

                const isEditing = editingMasterId === `owner-${owner}`;

                return (
                  <div 
                    key={owner} 
                    className="bg-[#141418] border border-slate-800 rounded-2xl p-5 hover:border-indigo-500/40 transition-all shadow-md group relative flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => hasAccess('Products & Clients', 'edit') && handleOwnerImageClick(owner)}
                            disabled={!hasAccess('Products & Clients', 'edit') || uploadingOwnerImageFor === owner}
                            className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400 overflow-hidden shrink-0 cursor-pointer disabled:cursor-default relative group/ownerimg shadow-sm"
                            title={hasAccess('Products & Clients', 'edit') ? 'Upload brand owner picture to Firestore DB' : 'Brand Owner picture'}
                          >
                            {uploadingOwnerImageFor === owner ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                            ) : getBrandOwnerImage(owner) ? (
                              <img src={getBrandOwnerImage(owner)} alt={owner} className="w-full h-full object-cover" />
                            ) : (
                              <Building2 className="w-5 h-5 text-emerald-400" />
                            )}
                            {hasAccess('Products & Clients', 'edit') && uploadingOwnerImageFor !== owner && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/ownerimg:opacity-100 transition-opacity flex items-center justify-center">
                                <Edit className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </button>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editMasterNameVal}
                              onChange={e => setEditMasterNameVal(e.target.value)}
                              className="p-1 bg-[#0d0d10] border border-slate-805 text-sm text-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                              onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    handleEditBrandOwner(owner, editMasterNameVal);
                                    setEditingMasterId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingMasterId(null);
                                  }
                                }}
                              autoFocus
                            />
                          ) : (
                            <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{owner}</h4>
                          )}
                        </div>
                        
                        {deletingMasterId === `owner-${owner}` ? (
                          <div className="flex items-center gap-1.5 animate-fadeIn">
                            <span className="text-[10px] text-rose-400 font-medium font-sans">Delete?</span>
                            <button
                              onClick={() => {
                                handleDeleteBrandOwner(owner);
                                setDeletingMasterId(null);
                              }}
                              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold uppercase transition cursor-pointer"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeletingMasterId(null)}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : !isEditing && hasAccess('Products & Clients', 'edit') && (
                          <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                  setEditingMasterId(`owner-${owner}`);
                                  setEditMasterNameVal(owner);
                                }}
                              className="p-1 hover:bg-slate-800 text-slate-404 hover:text-white rounded transition cursor-pointer"
                              title="Edit Brand Owner"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingMasterId(`owner-${owner}`)}
                              className="p-1 hover:bg-rose-955/40 text-slate-404 hover:text-rose-400 rounded transition cursor-pointer"
                              title="Delete Brand Owner"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {isEditing && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                handleEditBrandOwner(owner, editMasterNameVal);
                                setEditingMasterId(null);
                              }}
                              className="px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMasterId(null)}
                              className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[10px] font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Sales Volume</span>
                          <span className="text-xs font-bold text-slate-202">{totalUnitsSold.toLocaleString()} sold</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Total Revenue</span>
                          <span className="text-xs font-bold text-emerald-400 font-mono">₹{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Net Revenue (Excl GST)</span>
                          <span className="text-xs font-bold text-indigo-400 font-mono">₹{netRevenueBeforeGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Total Orders</span>
                          <span className="text-xs font-bold text-slate-205">{totalOrdersCount} orders</span>
                        </div>
                        <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                          <span className="text-[10px] text-slate-550 uppercase tracking-wider block mb-0.5">Last Sales Date</span>
                          <span className="text-xs font-bold text-slate-202 truncate block">{formattedLastSalesDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      {ownerBrandsCount > 0 ? (
                        <div className="border-t border-slate-805/60 pt-3">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Portfolio Brands:</span>
                          <div className="flex flex-wrap gap-1">
                            {dynamicBrands.filter(b => b.owner.toLowerCase() === owner.toLowerCase()).slice(0, 3).map(b => (
                              <span key={b.name} className="text-[10px] px-2 py-0.5 bg-[#0d0d10] border border-slate-800 text-slate-404 rounded-md truncate max-w-[120px]" title={b.name}>
                                {b.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="border-t border-slate-805/60 pt-3 text-center text-xs text-slate-600 italic">
                          No brands under this owner yet
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <input
        type="file"
        ref={categoryImageInputRef}
        onChange={handleCategoryImageFileChange}
        accept="image/*"
        className="hidden"
      />
      {/* Unit Master Table View */}
      {productsSubTab === 'units' && (
        <div className="space-y-6 animate-fadeIn" id="unit-master-view">
          {unitError && (
            <div className="flex items-center justify-between bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs rounded-xl px-4 py-3 shadow-md">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{unitError}</span>
              </div>
              <button onClick={() => setUnitError(null)} className="text-rose-400 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Unit Master Summary Header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#141418] border border-slate-800/80 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Total Units</span>
                <h4 className="text-2xl font-black text-white mt-1 font-mono">{units.length}</h4>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center text-indigo-400">
                <Grid className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-[#141418] border border-slate-800/80 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Unique UQCs</span>
                <h4 className="text-2xl font-black text-emerald-400 mt-1 font-mono">{new Set(units.map(u => u.uqc.toUpperCase())).size}</h4>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                <Check className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-[#141418] border border-slate-800/80 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Validation Rules</span>
                <p className="text-xs font-semibold text-slate-300 mt-1">Desc & UQC Mandatory | UQC Unique</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-sky-950/60 border border-sky-800/40 flex items-center justify-center text-sky-400">
                <Tag className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-[#141418] border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <Grid className="w-4 h-4 text-indigo-400" />
                  Unit Master Table
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Manage unit descriptions and official Unique Quantity Codes (UQC)</p>
              </div>
              {hasAccess('Products & Clients', 'create') && (
                <button
                  onClick={() => {
                    setNewUnitDesc('');
                    setNewUnitUqc('');
                    setUnitError(null);
                    setShowAddMasterModal('unit');
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  Add Unit Master
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0d0d10] text-[10px] uppercase tracking-wider text-slate-400 font-extrabold">
                    <th className="py-3.5 px-4 w-12 text-center">#</th>
                    <th className="py-3.5 px-4 font-extrabold text-slate-300">Desc (Description) <span className="text-rose-400">*</span></th>
                    <th className="py-3.5 px-4 font-extrabold text-slate-300">UQC (Unique Quantity Code) <span className="text-rose-400">* Unique</span></th>
                    <th className="py-3.5 px-4">Created Date</th>
                    <th className="py-3.5 px-4 text-right pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {units
                    .filter(u => 
                      u.desc.toLowerCase().includes(masterSearchQuery.toLowerCase()) || 
                      u.uqc.toLowerCase().includes(masterSearchQuery.toLowerCase())
                    )
                    .map((u, idx) => {
                      const isEditing = editingUnitId === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-3.5 px-4 text-center font-mono text-slate-500 text-[11px] font-bold">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-200">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editUnitDescVal}
                                onChange={e => setEditUnitDescVal(e.target.value)}
                                className="w-full p-2 bg-[#0d0d10] border border-indigo-500/80 text-xs text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="Desc (Mandatory)"
                                required
                              />
                            ) : (
                              <span>{u.desc}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editUnitUqcVal}
                                onChange={e => setEditUnitUqcVal(e.target.value.toUpperCase())}
                                className="w-36 p-2 bg-[#0d0d10] border border-indigo-500/80 text-xs font-mono font-bold text-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase"
                                placeholder="UQC (Mandatory & Unique)"
                                required
                              />
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 bg-indigo-950/80 border border-indigo-800/60 text-indigo-300 text-xs font-bold rounded-lg tracking-wider">
                                {u.uqc}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 text-[11px] font-mono">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'System Default'}
                          </td>
                          <td className="py-3.5 px-4 text-right pr-6">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={async () => {
                                    setUnitError(null);
                                    try {
                                      await updateUnit(u.id, editUnitDescVal, editUnitUqcVal);
                                      setEditingUnitId(null);
                                    } catch (err: any) {
                                      setUnitError(err?.message || 'Failed to update unit');
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" /> Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingUnitId(null);
                                    setUnitError(null);
                                  }}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                {hasAccess('Products & Clients', 'edit') && (
                                  <button
                                    onClick={() => {
                                      setEditingUnitId(u.id);
                                      setEditUnitDescVal(u.desc);
                                      setEditUnitUqcVal(u.uqc);
                                      setUnitError(null);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                    title="Edit Unit"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                )}
                                {hasAccess('Products & Clients', 'delete') && (
                                  <button
                                    onClick={() => setDeletingUnitId(u.id)}
                                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                    title="Delete Unit"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {units.filter(u => u.desc.toLowerCase().includes(masterSearchQuery.toLowerCase()) || u.uqc.toLowerCase().includes(masterSearchQuery.toLowerCase())).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 text-xs">
                        No unit records found matching "{masterSearchQuery}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Delete Unit Confirmation Modal */}
      {deletingUnitId && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141418] border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-scaleIn">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Confirm Delete Unit</h4>
            </div>
            <p className="text-xs text-slate-300 mb-5">
              Are you sure you want to delete this unit master record? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingUnitId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteUnit(deletingUnitId);
                    setDeletingUnitId(null);
                  } catch (err: any) {
                    setUnitError(err?.message || 'Failed to delete unit');
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Delete Unit
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={brandImageInputRef}
        onChange={handleBrandImageFileChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={ownerImageInputRef}
        onChange={handleOwnerImageFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Master Creation Modals */}
      {showAddMasterModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141418] border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wider">
                <Plus className="w-4 h-4 text-indigo-400 animate-pulse" />
                Add New {showAddMasterModal === 'category' ? 'Category' : showAddMasterModal === 'brand' ? 'Brand' : showAddMasterModal === 'owner' ? 'Brand Owner' : 'Unit Master'}
              </h3>
              <button 
                onClick={() => { setShowAddMasterModal(null); setUnitError(null); }} 
                className="text-slate-404 hover:text-white text-xs cursor-pointer bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {showAddMasterModal !== 'unit' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-404 mb-1.5 uppercase tracking-wider">
                    {showAddMasterModal === 'category' ? 'Category Name' : showAddMasterModal === 'brand' ? 'Brand Name' : 'Brand Owner Name'}
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. ${showAddMasterModal === 'category' ? 'Homecare Pro' : showAddMasterModal === 'brand' ? 'CleanFlow' : 'CleanseCorp Ltd'}`}
                    value={newMasterName}
                    onChange={e => setNewMasterName(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                    autoFocus
                  />
                </div>
              )}

              {showAddMasterModal === 'category' && (
                <div className="space-y-3 border-t border-slate-800/60 pt-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-404 mb-1.5 uppercase tracking-wider">Category Description (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Premium eco-friendly cleaning solutions"
                      value={newMasterCategoryDescription}
                      onChange={e => setNewMasterCategoryDescription(e.target.value)}
                      className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-sky-400 mb-1.5 uppercase tracking-wider">Category Picture (Single Source in Firestore DB)</label>
                    <div className="flex items-center gap-3 bg-[#0d0d10] p-3 border border-slate-800 rounded-xl">
                      {newMasterCategoryPreview ? (
                        <img src={newMasterCategoryPreview} alt="Preview" className="w-12 h-12 object-cover rounded-lg border border-slate-700 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-sky-950/40 border border-sky-800/40 flex items-center justify-center text-sky-400 shrink-0">
                          <Tag className="w-5 h-5 text-sky-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setNewMasterCategoryFile(f);
                              setNewMasterCategoryPreview(URL.createObjectURL(f));
                            }
                          }}
                          className="w-full text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-sky-950 file:text-sky-300 hover:file:bg-sky-900 transition file:cursor-pointer"
                        />
                        <span className="text-[9px] text-slate-500 block">Category picture stored directly in Firestore product_categories table</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showAddMasterModal === 'brand' && (
                <div className="space-y-3 border-t border-slate-800/60 pt-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-404 mb-1.5 uppercase tracking-wider">Brand Owner</label>
                    <select
                      value={newMasterOwner}
                      onChange={e => setNewMasterOwner(e.target.value)}
                      className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">-- Select Owner --</option>
                      {dynamicBrandOwners.map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                      <option value="Generic Owner">Generic Owner (Default)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-404 mb-1.5 uppercase tracking-wider">Brand Description (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Premium hygiene and surface cleaners"
                      value={newMasterBrandDescription}
                      onChange={e => setNewMasterBrandDescription(e.target.value)}
                      className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-amber-400 mb-1.5 uppercase tracking-wider">Brand Picture (Single Source in Firestore DB)</label>
                    <div className="flex items-center gap-3 bg-[#0d0d10] p-3 border border-slate-800 rounded-xl">
                      {newMasterBrandPreview ? (
                        <img src={newMasterBrandPreview} alt="Preview" className="w-12 h-12 object-cover rounded-lg border border-slate-700 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-amber-955/40 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
                          <Award className="w-5 h-5 text-amber-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setNewMasterBrandFile(f);
                              setNewMasterBrandPreview(URL.createObjectURL(f));
                            }
                          }}
                          className="w-full text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-amber-950 file:text-amber-300 hover:file:bg-amber-900 transition file:cursor-pointer"
                        />
                        <span className="text-[9px] text-slate-500 block">Brand picture stored directly in Firestore product_brands table</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showAddMasterModal === 'owner' && (
                <div className="space-y-3 border-t border-slate-800/60 pt-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-404 mb-1.5 uppercase tracking-wider">Owner Notes/Description (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Parent corporate entity"
                      value={newMasterOwnerDescription}
                      onChange={e => setNewMasterOwnerDescription(e.target.value)}
                      className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-emerald-400 mb-1.5 uppercase tracking-wider">Brand Owner Logo/Picture (Single Source in Firestore DB)</label>
                    <div className="flex items-center gap-3 bg-[#0d0d10] p-3 border border-slate-800 rounded-xl">
                      {newMasterOwnerPreview ? (
                        <img src={newMasterOwnerPreview} alt="Preview" className="w-12 h-12 object-cover rounded-lg border border-slate-700 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shrink-0">
                          <Building2 className="w-5 h-5 text-emerald-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setNewMasterOwnerFile(f);
                              setNewMasterOwnerPreview(URL.createObjectURL(f));
                            }
                          }}
                          className="w-full text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-emerald-950 file:text-emerald-300 hover:file:bg-emerald-900 transition file:cursor-pointer"
                        />
                        <span className="text-[9px] text-slate-500 block">Brand Owner logo stored directly in Firestore product_brand_owners table</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showAddMasterModal === 'unit' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                      Desc (Description) <span className="text-rose-400">* Mandatory</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. BAG, Bundles, Box, Cartons"
                      value={newUnitDesc}
                      onChange={e => setNewUnitDesc(e.target.value)}
                      className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                      UQC (Unique Quantity Code) <span className="text-rose-400">* Mandatory & Unique</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. BAG, BDL, BOX, CTN"
                      value={newUnitUqc}
                      onChange={e => setNewUnitUqc(e.target.value.toUpperCase())}
                      className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-indigo-300 font-mono font-bold uppercase rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      required
                    />
                    <span className="text-[9px] text-slate-500 block mt-1">UQC must be unique across all unit master records.</span>
                  </div>

                  {unitError && (
                    <div className="p-2.5 bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs rounded-lg flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{unitError}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/40">
                <button
                  onClick={() => { setShowAddMasterModal(null); setUnitError(null); }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (showAddMasterModal === 'category') {
                      await handleAddCategory(newMasterName, newMasterCategoryDescription, newMasterCategoryFile);
                      setNewMasterCategoryFile(null);
                      setNewMasterCategoryPreview('');
                      setNewMasterCategoryDescription('');
                      setShowAddMasterModal(null);
                    } else if (showAddMasterModal === 'brand') {
                      await handleAddBrand(newMasterName, newMasterOwner || 'Generic Owner', newMasterBrandDescription, newMasterBrandFile);
                      setNewMasterBrandFile(null);
                      setNewMasterBrandPreview('');
                      setNewMasterBrandDescription('');
                      setShowAddMasterModal(null);
                    } else if (showAddMasterModal === 'owner') {
                      await handleAddBrandOwner(newMasterName, newMasterOwnerDescription, newMasterOwnerFile);
                      setNewMasterOwnerFile(null);
                      setNewMasterOwnerPreview('');
                      setNewMasterOwnerDescription('');
                      setShowAddMasterModal(null);
                    } else if (showAddMasterModal === 'unit') {
                      setUnitError(null);
                      try {
                        await createUnit(newUnitDesc, newUnitUqc);
                        setNewUnitDesc('');
                        setNewUnitUqc('');
                        setShowAddMasterModal(null);
                      } catch (err: any) {
                        setUnitError(err?.message || 'Failed to create unit master');
                      }
                    }
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Create Master Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )}

      {panelTab === 'stock' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Grid className="w-4 h-4 text-violet-400" />
              Homecare Products Inventory & Stock Ledger
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">Real-time dynamic balance audit</span>
          </div>

          {/* Dynamic Metrics Cards */}
          {(() => {
            const totalIn = products.reduce((acc, p) => acc + (p.stockIn ?? p.stock ?? 0), 0);
            const totalOut = products.reduce((acc, p) => acc + (p.stockOut ?? getProductVolume(p)), 0);
            const totalNet = products.reduce((acc, p) => acc + p.stock, 0);

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-[#141418] border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[9px] font-bold text-violet-400 uppercase tracking-wider block mb-1">Total Stock Inwards (Received)</span>
                    <p className="text-2xl font-black text-white font-mono">{totalIn.toLocaleString()} <span className="text-xs text-slate-500 font-normal">units</span></p>
                  </div>
                  <div className="w-10 h-10 bg-violet-950/40 border border-violet-850 rounded-xl flex items-center justify-center text-violet-400">
                    <Plus className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-[#141418] border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider block mb-1">Total Stock Outwards (Sold)</span>
                    <p className="text-2xl font-black text-white font-mono">{totalOut.toLocaleString()} <span className="text-xs text-slate-500 font-normal">units</span></p>
                  </div>
                  <div className="w-10 h-10 bg-rose-950/40 border border-rose-850 rounded-xl flex items-center justify-center text-rose-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-[#141418] border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[9px] font-bold text-teal-400 uppercase tracking-wider block mb-1">Net Available Stock</span>
                    <p className="text-2xl font-black text-white font-mono">{totalNet.toLocaleString()} <span className="text-xs text-slate-500 font-normal">units</span></p>
                  </div>
                  <div className="w-10 h-10 bg-teal-950/40 border border-teal-850 rounded-xl flex items-center justify-center text-teal-400">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Main workspace splits */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Stock Receipt Ledger */}
            <div className="lg:col-span-8 bg-lime-50 border border-lime-200 rounded-2xl shadow-sm overflow-hidden" id="stock-receipt-workspace">
              <div className="p-4 border-b border-lime-200 bg-lime-100/60 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Plus className="w-4 h-4 text-lime-600 animate-pulse" />
                  Add Stock In Quantity
                </span>
                <span className="text-[10px] bg-lime-200 text-lime-800 px-2 py-0.5 rounded font-mono font-bold">Inwards Loading Panel</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-lime-100/30 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-lime-200">
                      <th className="p-4 pl-5">Product SKU</th>
                      <th className="p-4">Product Name</th>
                      <th className="p-4 text-center">Inwards Balance</th>
                      <th className="p-4 text-center">Current Stock</th>
                      <th className="p-4 text-right pr-5">Add Operations (Stock-In)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-lime-100 text-xs">
                    {products.map((p) => {
                      const curVal = receiveAdjustments[p.id] || 0;
                      return (
                        <tr key={p.id} className="hover:bg-lime-100/40 transition-colors">
                          {/* SKU */}
                          <td className="p-4 pl-5 font-mono">
                            <span className="text-[9px] bg-white border border-lime-200 text-lime-800 font-bold rounded px-1.5 py-0.5">{p.sku}</span>
                          </td>
                          {/* Name / Pack */}
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <img 
                                src={p.imageUrl || 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=80&auto=format&fit=crop&q=60'}
                                alt={p.name} 
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 object-cover rounded-lg border border-lime-200"
                              />
                              <div>
                                <p className="font-bold text-slate-800">{p.name}</p>
                                <p className="text-[9px] text-slate-500 font-medium">{p.packingSize || '500ml Bottle'} • {p.unit || 'Nos'}</p>
                              </div>
                            </div>
                          </td>
                          {/* Inwards tally */}
                          <td className="p-4 text-center font-mono font-bold text-lime-700">
                            {(p.stockIn ?? p.stock ?? 0).toLocaleString()}
                          </td>
                          {/* Local stock */}
                          <td className="p-4 text-center font-mono font-bold">
                            <span className={p.stock <= 50 ? "text-rose-600 font-black animate-pulse" : p.stock <= 200 ? "text-amber-600" : "text-emerald-700"}>
                              {p.stock.toLocaleString()} units
                            </span>
                          </td>
                          {/* Operators */}
                          <td className="p-4 text-right pr-5">
                            <div className="flex items-center justify-end gap-2.5">
                              {/* Quick Increments */}
                              <div className="flex gap-1">
                                {[10, 50, 100, 500].map((inc) => (
                                  <button
                                    key={inc}
                                    onClick={() => {
                                      setReceiveAdjustments(prev => ({
                                        ...prev,
                                        [p.id]: (prev[p.id] || 0) + inc
                                      }));
                                    }}
                                    className="p-1 px-1.5 border border-lime-200 hover:border-lime-300 bg-white text-slate-700 hover:bg-lime-100/55 rounded text-[9px] font-mono transition cursor-pointer"
                                  >
                                    +{inc}
                                  </button>
                                ))}
                              </div>

                              {/* Number input */}
                              <input 
                                type="number"
                                placeholder="Qty"
                                value={curVal === 0 ? "" : curVal}
                                onChange={(e) => {
                                  const parsed = parseInt(e.target.value) || 0;
                                  setReceiveAdjustments(prev => ({
                                    ...prev,
                                    [p.id]: Math.max(0, parsed)
                                  }));
                                }}
                                className="w-16 p-1 bg-white border border-lime-200 text-xs text-slate-800 font-mono rounded text-center focus:outline-none focus:ring-1 focus:ring-lime-500"
                                min="0"
                              />

                              {/* Submit adjustment */}
                              <button
                                onClick={() => handleAddStockIn(p.id, curVal)}
                                disabled={curVal <= 0}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                  curVal > 0 
                                    ? 'bg-lime-600 hover:bg-lime-700 text-white border border-lime-550 shadow-sm'
                                    : 'bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed'
                                }`}
                              >
                                Commit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Audit log right panel */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-[#141418] border border-slate-800 rounded-2xl shadow-sm p-4">
                <span className="text-xs font-bold text-white uppercase tracking-wider block mb-3 border-b border-slate-800 pb-2">
                  Stock-In Audit Logs
                </span>
                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                  {stockLogs.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      No inbound transactions recorded yet.
                    </div>
                  ) : (
                    stockLogs.map((log) => (
                      <div key={log.id} className="bg-[#0b0b0d] border border-slate-900 rounded-xl p-3 space-y-1.5 hover:border-slate-800 transition">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-violet-400 font-mono">+{log.qty} units loaded</span>
                          <span className="text-[9px] text-[#8c8d92] font-mono">{log.date}</span>
                        </div>
                        <p className="text-xs font-bold text-white">{log.productName}</p>
                        <p className="text-[9px] text-slate-500 font-mono">SKU ID Prefix: {log.sku}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Fast Inventory Instruction Card */}
              <div className="bg-[#141418]/60 border border-slate-850 rounded-2xl p-4 text-xs space-y-2">
                <p className="font-bold text-violet-400">💡 Inventory Control Rules:</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-400 text-[11px] leading-relaxed">
                  <li>Available Stock is calculated dynamically from <span className="font-mono text-slate-300">Stock In - Stock Out</span>.</li>
                  <li>Adding stock-in quantities automatically increases the physical inwards receipt pool as well as immediate available quantities.</li>
                  <li>Drafting or completing Sales Orders decrement available stock and increment output metrics.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {panelTab === 'customers' && (
        <div className="space-y-6">
          {/* Action section customers */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-500 animate-pulse" />
              Customer Loyalty Profiles Ledger & Sentiments
            </h3>

            {hasAccess('Products & Clients', 'create') && (
              <button
                onClick={() => setIsAddingCustomer(!isAddingCustomer)}
                className="px-3.5 py-2 border border-slate-805 text-violet-400 bg-[#141418] hover:bg-[#1c1c21] text-xs font-semibold rounded-xl transition cursor-pointer"
                id="add-cust-btn"
              >
                {isAddingCustomer ? 'Show Portals' : '+ Register Core Portal'}
              </button>
            )}
          </div>

          {/* Customer addition collapsible */}
          {isAddingCustomer && (
            <form onSubmit={handleCreateCustomer} className="bg-[#0b0b0d] border border-slate-800 rounded-xl p-5 max-w-2xl animate-fadeIn space-y-4" id="add-cust-form">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Acquire Loyal Portal Customer Profile</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">COMPANY NAME:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Acme Corp" 
                    value={custCompany}
                    onChange={e => setCustCompany(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">REP CONTACT NAME:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Sarah Connor" 
                    value={custName}
                    onChange={e => setCustName(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-505"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">EMAIL:</label>
                  <input 
                    type="email" 
                    placeholder="e.g. sconnor@acme.com" 
                    value={custEmail}
                    onChange={e => setCustEmail(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-505"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">INITIAL BUDGET CONVERTED (₹):</label>
                  <input 
                    type="number" 
                    value={custSpent}
                    onChange={e => setCustSpent(parseInt(e.target.value))}
                    className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-205 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-505"
                    required
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold tracking-wide transition cursor-pointer">
                  Write Customer Portal
                </button>
              </div>
            </form>
          )}

          {/* Grid table representation for Customers database */}
          <div className="bg-[#141418] border border-slate-800 rounded-2xl shadow-sm overflow-hidden" id="customers-table">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0d0d10] text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <th className="p-4 pl-5">Customer Brand / Account</th>
                    <th className="p-4">Contact rep</th>
                    <th className="p-4">Current rating</th>
                    <th className="p-4">Total loyalty spent</th>
                    <th className="p-4">Contracts approved</th>
                    <th className="p-4 text-right pr-5">Loyalty Rank</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-xs">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-[#1c1c21]/45 transition-colors">
                      <td className="p-4 pl-5">
                        <div className="font-bold text-white text-xs">{c.company}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{c.email}</div>
                      </td>
                      <td className="p-4 font-semibold text-slate-350">{c.name}</td>
                      <td className="p-4">
                        <div className="space-y-1">
                          {renderStars(c.satisfactionScore)}
                          <span className="text-[9px] text-slate-450 font-bold">Score: {c.satisfactionScore}/5.0</span>
                        </div>
                      </td>
                      <td className="p-4 font-bold text-white">₹{(c.totalSpent ?? 0).toLocaleString()}</td>
                      <td className="p-4 font-semibold text-slate-300">{c.dealsClosed} deals</td>
                      <td className="p-4 text-right pr-5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                          c.tier === 'Platinum' ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/40' :
                          c.tier === 'Gold' ? 'bg-amber-955/40 text-amber-400 border-amber-900/40' :
                          'bg-slate-900 text-slate-300 border-slate-800'
                        }`}>
                          {c.tier}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {panelTab === 'analytics' && (
        <div className="space-y-6">
          {/* Top Analytics KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="analytics-kpi-grid">
            <div className="bg-[#141418] border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Total Sales Volume</span>
                <span className="text-2xl font-extrabold text-indigo-400">
                  {products.reduce((sum, p) => sum + getProductVolume(p), 0).toLocaleString()} <span className="text-xs font-medium text-slate-500">Units</span>
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-950/40 border border-indigo-900/30 flex items-center justify-center text-indigo-400">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-[#141418] border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Total Sales Revenue</span>
                <span className="text-2xl font-extrabold text-emerald-400 font-mono">
                  ₹{products.reduce((sum, p) => sum + getProductRevenue(p), 0).toLocaleString()}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-900/30 flex items-center justify-center text-emerald-400">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            {(() => {
              const activeSalesOrders = salesOrders.filter(o => o.deliveryStatus !== 'Cancelled' && o.paymentStatus !== 'Refunded');
              const activeSalesTotal = activeSalesOrders.reduce((sum, o) => sum + o.totalValue, 0);
              const avgOrderValue = activeSalesOrders.length > 0 ? Math.round(activeSalesTotal / activeSalesOrders.length) : 0;
              return (
                <>
                  <div className="bg-[#141418] border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Total Orders Placed</span>
                      <span className="text-2xl font-extrabold text-sky-400">
                        {activeSalesOrders.length} <span className="text-xs font-medium text-slate-500">Invoices</span>
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-sky-950/40 border border-sky-900/30 flex items-center justify-center text-sky-400">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="bg-[#141418] border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Avg Order Value</span>
                      <span className="text-2xl font-extrabold text-amber-400 font-mono">
                        ₹{avgOrderValue.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-955/40 border border-amber-900/30 flex items-center justify-center text-amber-400">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>



          {/* Filtering and sub-view controls */}
          <div className="bg-[#0d0d10] p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex bg-[#141418] border border-slate-800 rounded-xl p-1 w-full md:w-auto overflow-x-auto">
              <button
                onClick={() => { setAnalyticsSubTab('products'); setAnalyticsSearchQuery(''); }}
                className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  analyticsSubTab === 'products' ? 'bg-indigo-600 text-white shadow-sm font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Product Performance ({products.length})
              </button>
              <button
                onClick={() => { setAnalyticsSubTab('customers'); setAnalyticsSearchQuery(''); }}
                className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  analyticsSubTab === 'customers' ? 'bg-indigo-600 text-white shadow-sm font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Customer Contributions ({customers.length})
              </button>
              <button
                onClick={() => { setAnalyticsSubTab('channels'); setAnalyticsSearchQuery(''); }}
                className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  analyticsSubTab === 'channels' ? 'bg-indigo-600 text-white shadow-sm font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sales Channel Masters
              </button>
              <button
                onClick={() => { setAnalyticsSubTab('couriers'); setAnalyticsSearchQuery(''); }}
                className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  analyticsSubTab === 'couriers' ? 'bg-indigo-600 text-white shadow-sm font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Courier Agency Masters
              </button>
              <button
                onClick={() => { setAnalyticsSubTab('ledger'); setAnalyticsSearchQuery(''); }}
                className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  analyticsSubTab === 'ledger' ? 'bg-indigo-600 text-white shadow-sm font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Detailed Order Ledger ({salesOrders.reduce((acc, o) => acc + (o.products ? o.products.length : 0), 0)} Items)
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
              <div className="relative flex-1 sm:w-64">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-3.5 w-3.5 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder={`Search ${analyticsSubTab === 'products' ? 'product name/sku...' : analyticsSubTab === 'customers' ? 'customer/rep...' : analyticsSubTab === 'channels' ? 'channel name...' : analyticsSubTab === 'couriers' ? 'courier name...' : 'order/product...'}`}
                  value={analyticsSearchQuery}
                  onChange={(e) => setAnalyticsSearchQuery(e.target.value)}
                  className="block w-full pl-9 pr-3 py-1.5 bg-[#141418] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {analyticsSubTab === 'ledger' && (
                <div className="relative">
                  <select
                    value={analyticsChannelFilter}
                    onChange={(e) => setAnalyticsChannelFilter(e.target.value)}
                    className="appearance-none bg-[#141418] border border-slate-800 rounded-xl text-xs text-slate-300 py-1.5 pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">All Channels</option>
                    <option value="amazon">Amazon</option>
                    <option value="flipkart">Flipkart</option>
                    <option value="meesho">Meesho</option>
                    <option value="vamjo">Vamjo</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="shop">Offline Shop</option>
                  </select>
                  <Filter className="absolute right-2.5 top-2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          {/* TAB 1: Product Performance Detailed Records */}
          {analyticsSubTab === 'products' && (
            <div className="bg-[#141418] border border-slate-800 rounded-2xl shadow-sm overflow-hidden animate-fadeIn" id="analytics-products-table">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0d0d10] text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <th className="p-4 pl-5 cursor-pointer hover:text-white transition" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-1">
                          Product / SKU Code
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        </div>
                      </th>
                      <th className="p-4 cursor-pointer hover:text-white transition" onClick={() => handleSort('category')}>
                        <div className="flex items-center gap-1">
                          Category / Brand
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        </div>
                      </th>
                      <th className="p-4 text-center cursor-pointer hover:text-white transition" onClick={() => handleSort('volume')}>
                        <div className="flex items-center gap-1 justify-center">
                          Sales Volume
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        </div>
                      </th>
                      <th className="p-4 text-indigo-400 font-mono text-right">Online / Shop Price</th>
                      <th className="p-4 text-right cursor-pointer hover:text-white transition" onClick={() => handleSort('revenue')}>
                        <div className="flex items-center gap-1 justify-end text-emerald-450">
                          Total Revenue
                          <ArrowUpDown className="w-3 h-3 text-emerald-500" />
                        </div>
                      </th>
                      <th className="p-4 text-right pr-5">Platform Channel Sales Shares (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {getSortedProducts().map((p) => {
                      const totalRev = getProductRevenue(p);
                      const productVol = getProductVolume(p);
                      const isHotSeller = productVol > 40;
                      return (
                        <tr key={p.id} className="hover:bg-[#1c1c21]/45 transition-colors">
                          <td className="p-4 pl-5">
                            <div className="flex items-center gap-3">
                              <img 
                                src={p.imageUrl || 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=80&auto=format&fit=crop&q=60'}
                                alt={p.name} 
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 object-cover rounded-lg border border-slate-800 bg-[#0d0d10] shrink-0"
                              />
                              <div>
                                <div className="font-extrabold text-white text-xs">{p.name}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{p.sku}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="text-slate-300 font-semibold">{p.category || 'Homecare'}</div>
                            <div className="text-[10px] text-slate-500">{p.brand || 'Generic'}</div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="font-bold text-white text-sm">{productVol.toLocaleString()}</span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded mt-1 font-semibold ${isHotSeller ? 'bg-rose-950/40 text-rose-400 border border-rose-900/30' : 'bg-slate-900 text-slate-500'}`}>
                                {isHotSeller ? '🔥 Hot Seller' : 'Steady'}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-right font-semibold text-slate-350 font-mono">
                            <div>Online: ₹{(p.onlinePrice || 0).toLocaleString()}</div>
                            <div className="text-[10px] text-slate-500">Shop: ₹{(p.shopPrice || 0).toLocaleString()}</div>
                          </td>
                          <td className="p-4 text-right">
                            <div className="font-extrabold text-emerald-400 font-mono text-sm">₹{totalRev.toLocaleString()}</div>
                            <div className="text-[9px] text-slate-500">Excl. {p.gstPercentage || 18}% GST</div>
                          </td>
                          <td className="p-4 text-right pr-5">
                            <div className="flex flex-wrap gap-1 justify-end max-w-xs ml-auto">
                              {p.amazonSales && p.amazonSales > 0 ? <span className="text-[9px] bg-orange-950/40 border border-orange-900/40 text-orange-400 px-1.5 py-0.5 rounded font-bold">AZ: ₹{p.amazonSales}</span> : null}
                              {p.flipkartSales && p.flipkartSales > 0 ? <span className="text-[9px] bg-sky-950/40 border border-sky-900/40 text-sky-400 px-1.5 py-0.5 rounded font-bold">FK: ₹{p.flipkartSales}</span> : null}
                              {p.meeshoSales && p.meeshoSales > 0 ? <span className="text-[9px] bg-pink-950/40 border border-pink-900/40 text-pink-400 px-1.5 py-0.5 rounded font-bold">MS: ₹{p.meeshoSales}</span> : null}
                              {p.vamjoSales && p.vamjoSales > 0 ? <span className="text-[9px] bg-purple-950/40 border border-purple-900/40 text-purple-400 px-1.5 py-0.5 rounded font-bold">VJ: ₹{p.vamjoSales}</span> : null}
                              {p.whatsappSales && p.whatsappSales > 0 ? <span className="text-[9px] bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded font-bold">WA: ₹{p.whatsappSales}</span> : null}
                              {p.countersaleSales && p.countersaleSales > 0 ? <span className="text-[9px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold">Offline: ₹{p.countersaleSales}</span> : null}
                              {!p.amazonSales && !p.flipkartSales && !p.meeshoSales && !p.vamjoSales && !p.whatsappSales && !p.countersaleSales ? <span className="text-slate-500 text-[10px]">No sales recorded yet</span> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Customer Performance Contributions */}
          {analyticsSubTab === 'customers' && (
            <div className="bg-[#141418] border border-slate-800 rounded-2xl shadow-sm overflow-hidden animate-fadeIn" id="analytics-customers-table">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0d0d10] text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <th className="p-4 pl-5">Customer Brand / Account</th>
                      <th className="p-4">Primary Representative</th>
                      <th className="p-4 text-center">Deals Closed</th>
                      <th className="p-4 text-center text-indigo-400 font-bold">Sales Volume (Units Bought)</th>
                      <th className="p-4 text-right text-emerald-400 font-bold">Total Spent Revenue Contribution</th>
                      <th className="p-4 text-right pr-5">Rank Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {getSortedCustomers().map((c) => {
                      const unitsBought = getCustomerSalesVolume(c.email, c.company);
                      return (
                        <tr key={c.id} className="hover:bg-[#1c1c21]/45 transition-colors">
                          <td className="p-4 pl-5">
                            <div className="font-extrabold text-white text-xs">{c.company}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{c.email}</div>
                          </td>
                          <td className="p-4 font-semibold text-slate-300">{c.name}</td>
                          <td className="p-4 text-center font-bold text-slate-200">{c.dealsClosed || 0} Deals</td>
                          <td className="p-4 text-center font-black text-indigo-300 font-mono">
                            {unitsBought.toLocaleString()} units
                          </td>
                          <td className="p-4 text-right font-black text-emerald-400 font-mono text-sm">
                            ₹{(c.totalSpent ?? 0).toLocaleString()}
                          </td>
                          <td className="p-4 text-right pr-5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                              c.tier === 'Platinum' ? 'bg-indigo-950/45 text-indigo-400 border-indigo-900/40' :
                              c.tier === 'Gold' ? 'bg-amber-955/45 text-amber-400 border-amber-900/40' :
                              'bg-slate-900 text-slate-300 border-slate-800'
                            }`}>
                              {c.tier}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Detailed Order-by-Order itemization Audit Ledger */}
          {analyticsSubTab === 'ledger' && (
            <div className="bg-[#141418] border border-slate-800 rounded-2xl shadow-sm overflow-hidden animate-fadeIn" id="analytics-ledger-table">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0d0d10] text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <th className="p-4 pl-5">Order ID / Date</th>
                      <th className="p-4">Customer Account</th>
                      <th className="p-4">Channel</th>
                      <th className="p-4">Product Name / SKU</th>
                      <th className="p-4 text-center">Qty Volume</th>
                      <th className="p-4 text-right">Unit Price</th>
                      <th className="p-4 text-right">GST %</th>
                      <th className="p-4 text-right pr-5">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {getFilteredLedgerItems().map((item, index) => {
                      return (
                        <tr key={`${item.orderId}-${item.productId}-${index}`} className="hover:bg-[#1c1c21]/45 transition-colors">
                          <td className="p-4 pl-5">
                            <div className="font-extrabold text-white text-xs">{item.orderNumber}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{item.date}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-300 text-xs">{item.company}</div>
                            <div className="text-[10px] text-slate-500">{item.clientName}</div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                              item.channel === 'amazon' ? 'bg-orange-950/30 text-orange-400 border-orange-900/30' :
                              item.channel === 'flipkart' ? 'bg-sky-955/30 text-sky-400 border-sky-900/30' :
                              item.channel === 'meesho' ? 'bg-pink-955/30 text-pink-400 border-pink-900/30' :
                              item.channel === 'vamjo' ? 'bg-purple-955/30 text-purple-400 border-purple-900/30' :
                              item.channel === 'whatsapp' ? 'bg-emerald-955/30 text-emerald-400 border-emerald-900/30' :
                              'bg-slate-900 text-slate-300 border-slate-800'
                            }`}>
                              {item.channel}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-200">{item.productName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">SKU ID: {item.productId.slice(0, 8)}</div>
                          </td>
                          <td className="p-4 text-center font-black text-indigo-300">
                            {item.quantity} units
                          </td>
                          <td className="p-4 text-right font-mono text-slate-300">
                            ₹{item.price.toLocaleString()}
                          </td>
                          <td className="p-4 text-right text-slate-500 font-mono">
                            {item.gst || 18}%
                          </td>
                          <td className="p-4 text-right font-black text-emerald-400 font-mono text-sm pr-5">
                            ₹{(item.price * item.quantity).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {getFilteredLedgerItems().length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-12 text-center text-slate-500">
                          No matching invoice transactions or product lines found for the filter options.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: Sales Channel Masters */}
          {analyticsSubTab === 'channels' && (
            <div className="space-y-6 animate-fadeIn" id="analytics-channels-panel">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Object.entries(getDetailedChannelMetrics())
                  .filter(([name]) => name.toLowerCase().includes(analyticsSearchQuery.toLowerCase()))
                  .map(([name, data]) => {
                    return (
                      <div 
                        key={name}
                        className="bg-[#141418] border border-slate-800 rounded-2xl p-5 hover:border-emerald-500/45 transition-all shadow-md group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-emerald-950/40 border border-emerald-850/40 flex items-center justify-center text-emerald-400">
                                <Grid className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{name}</h4>
                                <span className="text-[10px] text-slate-500 font-mono">Sales Channel Master</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Total Orders</span>
                              <span className="text-sm font-bold text-slate-205">{data.totalOrders} Invoices</span>
                            </div>
                            <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Total Qty Sold</span>
                              <span className="text-sm font-bold text-slate-202">{data.totalQuantitySold.toLocaleString()} units</span>
                            </div>
                            <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Net Rev (Before GST)</span>
                              <span className="text-sm font-bold text-amber-400 font-mono font-mono">₹{data.netRevenueBeforeGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Total Sales Revenue</span>
                              <span className="text-sm font-bold text-emerald-400 font-mono">₹{data.totalSalesRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-slate-800/60 pt-3 flex flex-col gap-1.5 text-[11px] text-slate-400">
                          <div className="flex justify-between">
                            <span>Average Order Value:</span>
                            <strong className="text-slate-202 font-mono">₹{data.averageOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Last Transaction Date:</span>
                            <strong className="text-slate-300 font-mono">{data.lastTransactionDate}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* TAB 5: Courier Agency Masters */}
          {analyticsSubTab === 'couriers' && (
            <div className="space-y-6 animate-fadeIn" id="analytics-couriers-panel">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Object.entries(getCourierMetrics())
                  .filter(([name]) => name.toLowerCase().includes(analyticsSearchQuery.toLowerCase()))
                  .map(([name, data]) => {
                    return (
                      <div 
                        key={name}
                        className="bg-[#141418] border border-slate-800 rounded-2xl p-5 hover:border-violet-500/40 transition-all shadow-md group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-violet-950/40 border border-violet-850/40 flex items-center justify-center text-violet-400">
                                <TrendingUp className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white group-hover:text-violet-400 transition-colors">{name}</h4>
                                <span className="text-[10px] text-slate-500 font-mono">Courier Agency Master</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Total Shipments</span>
                              <span className="text-sm font-bold text-slate-205">{data.totalShipments} Packages</span>
                            </div>
                            <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Courier Charges</span>
                              <span className="text-sm font-bold text-rose-400 font-mono">₹{data.totalCourierCharges.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Invoice Value</span>
                              <span className="text-sm font-bold text-slate-202 font-mono">₹{data.totalInvoiceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-[#0d0d10]/55 p-2.5 rounded-xl border border-slate-900">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Net Revenue</span>
                              <span className="text-sm font-bold text-emerald-400 font-mono font-mono">₹{data.netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-slate-800/60 pt-3 flex flex-col gap-1.5 text-[11px] text-slate-400">
                          <div className="flex justify-between">
                            <span>Cost per Shipment:</span>
                            <strong className="text-slate-202 font-mono">₹{data.averageCostPerShipment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Cost per Unit:</span>
                            <strong className="text-slate-202 font-mono">₹{data.averageCostPerUnit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Last Shipment Date:</span>
                            <strong className="text-slate-300 font-mono">{data.lastShipmentDate}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
