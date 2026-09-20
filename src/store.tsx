import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  UserRole, User, Permission, RolePermissions, Task, 
  CalendarEvent, ProductPerformance, CustomerPerformance, MarketingCampaign, 
  WhatsAppTemplate, WhatsAppSequenceStep, WhatsAppMessage, SystemAuditLog, Referral,
  SalesOrder, SalesProduct, BrandConfig, FormatInvoice, ReferralChain, ChainHistory,
  Influencer, InfluencerCampaign, InfluencerCollaboration, InfluencerDispatch, 
  InfluencerPayment, InfluencerContent,
  ShoppingCartItem, WishlistItem, ProductReview, CustomerAddress, CustomerDeliveryAddress, Coupon, 
  OrderDeliveryTracking, OrderReturnRequest, OrderRefund, PaymentTransaction, PaymentGatewaySetting, DeliveryCharge,
  PartnerLevel, CommissionRule, CommissionTransaction, Category, Brand, BrandOwner, UnitMaster
} from './types';
import { db, auth, initError } from './firebase';
import { 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut 
} from 'firebase/auth';
import { logFirestoreError, createFirestoreException } from './utils/firestoreLogger';
import { FirestoreErrorState } from './components/FirestoreErrorBanner';
import {
  userRepository,
  productRepository,
  orderRepository,
  customerRepository,
  taskRepository,
  eventRepository,
  campaignRepository,
  referralRepository,
  whatsAppMessageRepository,
  whatsAppSequenceRepository,
  whatsAppTemplateRepository,
  auditLogRepository,
  influencerRepository,
  influencerCampaignRepository,
  influencerCollaborationRepository,
  influencerDispatchRepository,
  influencerPaymentRepository,
  influencerContentRepository,
  brandConfigRepository,
  rolePermissionsRepository,
  paymentGatewaySettingRepository,
  deliveryChargeRepository,
  customerDeliveryAddressRepository,
  partnerLevelRepository,
  commissionRuleRepository,
  commissionTransactionRepository,
  customerIndexRepository,
  referralLinkRepository,
  formatInvoiceRepository,
  categoryRepository,
  brandRepository,
  brandOwnerRepository,
  unitMasterRepository
} from './repositories/repositories';

export const DEFAULT_UNITS: UnitMaster[] = [
  { id: 'unit_bag', desc: 'BAG', uqc: 'BAG' },
  { id: 'unit_bdl', desc: 'Bundles', uqc: 'BDL' },
  { id: 'unit_bal', desc: 'Bale', uqc: 'BAL' },
  { id: 'unit_bkl', desc: 'Buckles', uqc: 'BKL' },
  { id: 'unit_box', desc: 'Box', uqc: 'BOX' },
  { id: 'unit_btl', desc: 'Bottles', uqc: 'BTL' },
  { id: 'unit_bun', desc: 'Bunches', uqc: 'BUN' },
  { id: 'unit_can', desc: 'Cans', uqc: 'CAN' },
  { id: 'unit_ctn', desc: 'Cartons', uqc: 'CTN' },
  { id: 'unit_doz', desc: 'Dozen', uqc: 'DOZ' },
  { id: 'unit_drm', desc: 'Drum', uqc: 'DRM' },
  { id: 'unit_grs', desc: 'Gross', uqc: 'GRS' },
  { id: 'unit_nos', desc: 'Numbers', uqc: 'NOS' },
  { id: 'unit_pac', desc: 'Packs', uqc: 'PAC' },
  { id: 'unit_pcs', desc: 'Pieces', uqc: 'PCS' },
  { id: 'unit_prs', desc: 'Pairs', uqc: 'PRS' },
  { id: 'unit_rol', desc: 'Rolls', uqc: 'ROL' },
  { id: 'unit_set', desc: 'Sets', uqc: 'SET' },
  { id: 'unit_tbs', desc: 'Tablets', uqc: 'TBS' }
];

export interface CRMContextType {
  currentUser: User;
  setRole: (role: UserRole) => void;
  permissions: RolePermissions;
  hasAccess: (module: string, action: 'read' | 'create' | 'edit' | 'delete') => boolean;
  updatePermission: (role: UserRole, module: string, action: 'read' | 'create' | 'edit' | 'delete', value: boolean) => void;
  
  // Authentication properties (Firebase Authentication)
  isLoggedIn: boolean;
  loginWithEmailPassword: (email: string, password: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  registerWithEmailPassword: (email: string, password: string, name: string, role?: UserRole) => Promise<{ success: boolean; user?: User; error?: string }>;
  resetPasswordWithEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  registeredUsers: User[];
  addUser: (user: Omit<User, "id">) => Promise<boolean>;
  updateUser: (id: string, updates: Partial<User>) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;

  syncCustomersToWhatsAppContacts: () => { successCount: number; skippedCount: number; permissionDenied?: boolean };
  
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'status'>, isRemoteSync?: boolean) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>, isRemoteSync?: boolean) => Promise<void>;
  deleteTask: (id: string, isRemoteSync?: boolean) => Promise<void>;
  
  calendarEvents: CalendarEvent[];
  addCalendarEvent: (event: Omit<CalendarEvent, 'id'>, isRemoteSync?: boolean) => Promise<void>;
  updateCalendarEvent: (id: string, updates: Partial<CalendarEvent>, isRemoteSync?: boolean) => Promise<void>;
  deleteCalendarEvent: (id: string, isRemoteSync?: boolean) => Promise<void>;
  
  products: ProductPerformance[];
  updateProduct: (id: string, updates: Partial<ProductPerformance>) => Promise<void>;
  addProduct: (product: Omit<ProductPerformance, 'id'>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  
  customers: CustomerPerformance[];
  updateCustomer: (id: string, updates: Partial<CustomerPerformance>) => Promise<void>;
  addCustomer: (customer: Omit<CustomerPerformance, 'id'>, bypassPermissions?: boolean) => Promise<CustomerPerformance | undefined>;
  deleteCustomer: (id: string) => Promise<void>;

  customerDeliveryAddresses: CustomerDeliveryAddress[];
  addCustomerDeliveryAddress: (address: Omit<CustomerDeliveryAddress, 'id'>) => Promise<CustomerDeliveryAddress | undefined>;
  updateCustomerDeliveryAddress: (id: string, updates: Partial<CustomerDeliveryAddress>) => Promise<void>;
  deleteCustomerDeliveryAddress: (id: string) => Promise<void>;

  referrals: Referral[];
  addReferral: (referral: Omit<Referral, 'id' | 'createdAt' | 'status'>, bypassPermissions?: boolean) => Promise<void>;
  updateReferral: (id: string, updates: Partial<Referral>, bypassPermissions?: boolean) => Promise<void>;
  deleteReferral: (id: string) => Promise<void>;
  
  campaigns: MarketingCampaign[];
  addCampaign: (campaign: Omit<MarketingCampaign, 'id'>) => Promise<void>;
  updateCampaign: (id: string, updates: Partial<MarketingCampaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  
  whatsAppMessages: WhatsAppMessage[];
  sendWhatsAppMessage: (phone: string, content: string, leadId?: string, templateName?: string) => Promise<void>;
  deleteAllWhatsAppMessages: () => Promise<void>;
  whatsAppSequence: WhatsAppSequenceStep[];
  updateSequenceStep: (id: string, updates: Partial<WhatsAppSequenceStep>) => Promise<void>;
  whatsAppTemplates: WhatsAppTemplate[];
  
  auditLogs: SystemAuditLog[];
  addCustomAuditLog: (action: string, details: string, status?: 'success' | 'warning' | 'denied') => Promise<void>;
  clearAuditLogs: () => Promise<void>;
  clearAllData: () => Promise<void>;
  removeUnlinkedRecords: () => {
    unlinkedReferralCount: number;
    unlinkedPayoutCount: number;
    unlinkedOrderCount: number;
    unlinkedTaskCount: number;
    unlinkedEventCount: number;
  };

  salesOrders: SalesOrder[];
  addSalesOrder: (order: Omit<SalesOrder, 'id' | 'orderNumber' | 'createdAt'>, bypassPermissionCheck?: boolean) => Promise<void>;
  updateSalesOrder: (id: string, updates: Partial<SalesOrder>) => Promise<void>;
  deleteSalesOrder: (id: string) => Promise<void>;
  deleteAllSalesOrders: () => Promise<void>;
  
  referralChains: ReferralChain[];
  addReferralChain: (chain: ReferralChain) => void;
  chainHistories: ChainHistory[];
  addChainHistory: (history: ChainHistory) => void;

  influencers: Influencer[];
  addInfluencer: (item: Omit<Influencer, 'id'>) => Promise<void>;
  updateInfluencer: (id: string, updates: Partial<Influencer>) => Promise<void>;
  deleteInfluencer: (id: string) => Promise<void>;

  influencerCampaigns: InfluencerCampaign[];
  addInfluencerCampaign: (item: Omit<InfluencerCampaign, 'id'>) => Promise<void>;
  updateInfluencerCampaign: (id: string, updates: Partial<InfluencerCampaign>) => Promise<void>;
  deleteInfluencerCampaign: (id: string) => Promise<void>;

  influencerCollaborations: InfluencerCollaboration[];
  addInfluencerCollaboration: (item: Omit<InfluencerCollaboration, 'id'>) => Promise<void>;
  updateInfluencerCollaboration: (id: string, updates: Partial<InfluencerCollaboration>) => Promise<void>;
  deleteInfluencerCollaboration: (id: string) => Promise<void>;

  influencerDispatches: InfluencerDispatch[];
  addInfluencerDispatch: (item: Omit<InfluencerDispatch, 'id'>) => Promise<void>;
  updateInfluencerDispatch: (id: string, updates: Partial<InfluencerDispatch>) => Promise<void>;
  deleteInfluencerDispatch: (id: string) => Promise<void>;

  influencerPayments: InfluencerPayment[];
  addInfluencerPayment: (item: Omit<InfluencerPayment, 'id'>) => Promise<void>;
  updateInfluencerPayment: (id: string, updates: Partial<InfluencerPayment>) => Promise<void>;
  deleteInfluencerPayment: (id: string) => Promise<void>;

  influencerContents: InfluencerContent[];
  addInfluencerContent: (item: Omit<InfluencerContent, 'id'>) => Promise<void>;
  updateInfluencerContent: (id: string, updates: Partial<InfluencerContent>) => Promise<void>;
  deleteInfluencerContent: (id: string) => Promise<void>;

  syncingIndicator: boolean;
  lastSyncedAt: string;
  brandConfig: BrandConfig;
  updateBrandConfig: (updates: Partial<BrandConfig>) => Promise<void>;
  recalculateAllMasterRecords: () => Promise<void>;

  customCategories: string[];
  setCustomCategories: React.Dispatch<React.SetStateAction<string[]>>;
  categories: Category[];
  uploadCategoryPicture: (categoryName: string, file: File) => Promise<void>;
  createCategory: (category: Omit<Category, 'id'>) => Promise<Category>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<Category>;
  deleteCategory: (id: string) => Promise<void>;
  brands: Brand[];
  createBrand: (brand: Omit<Brand, 'id'>) => Promise<Brand>;
  updateBrand: (id: string, updates: Partial<Brand>) => Promise<Brand>;
  deleteBrand: (id: string) => Promise<void>;
  uploadBrandPicture: (brandName: string, file: File, owner?: string) => Promise<void>;
  brandOwners: BrandOwner[];
  createBrandOwner: (owner: Omit<BrandOwner, 'id'>) => Promise<BrandOwner>;
  updateBrandOwner: (id: string, updates: Partial<BrandOwner>) => Promise<BrandOwner>;
  deleteBrandOwner: (id: string) => Promise<void>;
  uploadBrandOwnerPicture: (ownerName: string, file: File) => Promise<void>;
  customBrands: {name: string, owner: string}[];
  setCustomBrands: React.Dispatch<React.SetStateAction<{name: string, owner: string}[]>>;
  customBrandOwners: string[];
  setCustomBrandOwners: React.Dispatch<React.SetStateAction<string[]>>;
  units: UnitMaster[];
  createUnit: (desc: string, uqc: string) => Promise<UnitMaster>;
  updateUnit: (id: string, desc: string, uqc: string) => Promise<UnitMaster>;
  deleteUnit: (id: string) => Promise<void>;

  // General Shopping Platform State & Methods
  shoppingCart: ShoppingCartItem[];
  addToCart: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  wishlist: WishlistItem[];
  toggleWishlist: (productId: string) => void;

  productReviews: ProductReview[];
  addProductReview: (review: Omit<ProductReview, 'id' | 'createdAt'>) => void;

  customerAddresses: CustomerAddress[];
  addCustomerAddress: (address: Omit<CustomerAddress, 'id'>) => void;
  updateCustomerAddress: (id: string, updates: Partial<CustomerAddress>) => void;
  deleteCustomerAddress: (id: string) => void;

  coupons: Coupon[];
  applyCoupon: (code: string, orderValue: number) => Coupon | null;
  addCoupon: (coupon: Coupon) => void;

  orderDeliveryTracking: OrderDeliveryTracking[];
  updateDeliveryTracking: (orderId: string, status: OrderDeliveryTracking['status'], note: string) => void;

  orderReturnRequests: OrderReturnRequest[];
  addReturnRequest: (req: Omit<OrderReturnRequest, 'id' | 'createdAt' | 'status'>) => void;
  updateReturnRequest: (id: string, status: OrderReturnRequest['status']) => void;

  orderRefunds: OrderRefund[];
  addRefund: (ref: Omit<OrderRefund, 'id' | 'createdAt' | 'status'>) => void;
  updateRefund: (id: string, updates: Partial<OrderRefund>) => void;

  paymentTransactions: PaymentTransaction[];
  addPaymentTransaction: (tx: PaymentTransaction) => void;
  updatePaymentTransaction: (id: string, updates: Partial<PaymentTransaction>) => void;
  initiatePaymentFlow: (orderData: any, paymentMethod: string, gateway: string) => Promise<{ success: boolean; transaction?: PaymentTransaction; error?: string }>;
  verifyPaymentFlow: (transactionId: string, gatewayResponse: any) => Promise<{ success: boolean; order?: SalesOrder; transaction?: PaymentTransaction; error?: string }>;
  processRefund: (paymentId: string, amount: number, reason: string) => Promise<{ success: boolean; refund?: OrderRefund; error?: string }>;

  paymentGatewaySettings: PaymentGatewaySetting[];
  updatePaymentGatewaySetting: (id: string, updates: Partial<PaymentGatewaySetting>) => void;

  deliveryCharges: DeliveryCharge[];
  addDeliveryCharge: (charge: DeliveryCharge) => Promise<void>;
  updateDeliveryCharge: (id: string, updates: Partial<DeliveryCharge>) => Promise<void>;
  deleteDeliveryCharge: (id: string) => Promise<void>;

  formatInvoices: FormatInvoice[];
  addFormatInvoice: (invoice: Omit<FormatInvoice, 'id'>) => Promise<void>;
  updateFormatInvoice: (id: string, updates: Partial<FormatInvoice>) => Promise<void>;
  setDefaultFormatInvoice: (id: string) => Promise<void>;

  // Referral & Rolling 5-Level Commission State & Actions
  partnerLevels: PartnerLevel[];
  addPartnerLevel: (level: Omit<PartnerLevel, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updatePartnerLevel: (id: string, updates: Partial<PartnerLevel>) => Promise<void>;
  deletePartnerLevel: (id: string) => Promise<void>;

  commissionRules: CommissionRule[];
  addCommissionRule: (rule: Omit<CommissionRule, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateCommissionRule: (id: string, updates: Partial<CommissionRule>) => Promise<void>;
  deleteCommissionRule: (id: string) => Promise<void>;

  commissionTransactions: CommissionTransaction[];
  processOrderCommissions: (orderId: string) => Promise<{ success: boolean; count: number; transactions: any[]; error?: string }>;
  refundOrderCommissions: (orderId: string, reason?: string) => Promise<{ success: boolean; reversedCount: number }>;
  updateCommissionTransactionStatus: (id: string, status: CommissionTransaction['status']) => Promise<void>;

  // Single Source of Truth & Error UI State
  firestoreError: FirestoreErrorState | null;
  dismissFirestoreError: () => void;
  reloadFirestoreData: () => Promise<void>;
  isLoadingFirestore: boolean;
}

const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  Admin: [
    { module: 'Dashboard', read: true, create: true, edit: true, delete: true },
    { module: 'Tasks & Calendar', read: true, create: true, edit: true, delete: true },
    { module: 'Products & Clients', read: true, create: true, edit: true, delete: true },
    { module: 'Customer Directory', read: true, create: true, edit: true, delete: true },
    { module: 'Referral Hub', read: true, create: true, edit: true, delete: true },
    { module: 'Campaigns & ROI', read: true, create: true, edit: true, delete: true },
    { module: 'WhatsApp Integration', read: true, create: true, edit: true, delete: true },
    { module: 'Security Audit', read: true, create: true, edit: true, delete: true },
    { module: 'Sales Orders', read: true, create: true, edit: true, delete: true },
  ],
  Sales: [
    { module: 'Dashboard', read: true, create: false, edit: false, delete: false },
    { module: 'Tasks & Calendar', read: true, create: true, edit: true, delete: true },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
    { module: 'Customer Directory', read: true, create: true, edit: true, delete: false },
    { module: 'Referral Hub', read: true, create: true, edit: true, delete: false },
    { module: 'Campaigns & ROI', read: true, create: false, edit: false, delete: false },
    { module: 'WhatsApp Integration', read: true, create: true, edit: false, delete: false },
    { module: 'Security Audit', read: false, create: false, edit: false, delete: false },
    { module: 'Sales Orders', read: true, create: true, edit: true, delete: false },
  ],
  Marketing: [
    { module: 'Dashboard', read: true, create: false, edit: false, delete: false },
    { module: 'Tasks & Calendar', read: true, create: true, edit: true, delete: true },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
    { module: 'Customer Directory', read: true, create: false, edit: false, delete: false },
    { module: 'Referral Hub', read: true, create: true, edit: false, delete: false },
    { module: 'Campaigns & ROI', read: true, create: true, edit: true, delete: true },
    { module: 'WhatsApp Integration', read: true, create: true, edit: true, delete: false },
    { module: 'Security Audit', read: false, create: false, edit: false, delete: false },
    { module: 'Sales Orders', read: true, create: false, edit: false, delete: false },
  ],
  Support: [
    { module: 'Dashboard', read: true, create: false, edit: false, delete: false },
    { module: 'Tasks & Calendar', read: true, create: true, edit: true, delete: true },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
    { module: 'Customer Directory', read: true, create: false, edit: true, delete: false },
    { module: 'Referral Hub', read: true, create: false, edit: false, delete: false },
    { module: 'Campaigns & ROI', read: false, create: false, edit: false, delete: false },
    { module: 'WhatsApp Integration', read: true, create: true, edit: true, delete: false },
    { module: 'Security Audit', read: false, create: false, edit: false, delete: false },
    { module: 'Sales Orders', read: true, create: true, edit: true, delete: false },
  ],
  'Referral Team': [
    { module: 'Dashboard', read: true, create: false, edit: false, delete: false },
    { module: 'Tasks & Calendar', read: false, create: false, edit: false, delete: false },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
    { module: 'Customer Directory', read: true, create: false, edit: false, delete: false },
    { module: 'Referral Hub', read: true, create: true, edit: true, delete: false },
    { module: 'Campaigns & ROI', read: false, create: false, edit: false, delete: false },
    { module: 'WhatsApp Integration', read: false, create: false, edit: false, delete: false },
    { module: 'Security Audit', read: false, create: false, edit: false, delete: false },
    { module: 'Sales Orders', read: true, create: true, edit: true, delete: false },
  ]
};

export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  logoType: 'fruits_flowers',
  logoUrl: '/Logo.png',
  imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200',
  imageType: 'preset',
  brandName: 'Fruits n Flowers',
  brandTagline: 'Connect. Refer. Earn.',
  welcomeHeader: 'Login to Leafy Server',
  layoutStyle: 'split',
  overlayOpacity: 45,
};

export const mergeBrandConfig = (raw: any): BrandConfig => {
  const merged = { ...DEFAULT_BRAND_CONFIG };
  if (!raw) return merged;
  for (const key of Object.keys(DEFAULT_BRAND_CONFIG)) {
    const k = key as keyof BrandConfig;
    if (raw[k] !== undefined && raw[k] !== null) {
      (merged as any)[k] = raw[k];
    }
  }
  return merged;
};

const CRMContext = createContext<CRMContextType | undefined>(undefined);

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State variables (UI state holding data directly retrieved from Firestore)
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User>({
    id: 'user-guest',
    name: 'Authenticated User',
    role: 'Admin',
    email: 'user@viocrm.com',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&q=80',
    team: 'Executive Leadership',
    mobileNumber: ''
  });
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  const [permissions, setPermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);
  const [brandConfig, setBrandConfig] = useState<BrandConfig>(DEFAULT_BRAND_CONFIG);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [products, setProducts] = useState<ProductPerformance[]>([]);
  const [customers, setCustomers] = useState<CustomerPerformance[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [whatsAppMessages, setWhatsAppMessages] = useState<WhatsAppMessage[]>([]);
  const [whatsAppSequence, setWhatsAppSequence] = useState<WhatsAppSequenceStep[]>([]);
  const [whatsAppTemplates, setWhatsAppTemplates] = useState<WhatsAppTemplate[]>([]);
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [influencerCampaigns, setInfluencerCampaigns] = useState<InfluencerCampaign[]>([]);
  const [influencerCollaborations, setInfluencerCollaborations] = useState<InfluencerCollaboration[]>([]);
  const [influencerDispatches, setInfluencerDispatches] = useState<InfluencerDispatch[]>([]);
  const [influencerPayments, setInfluencerPayments] = useState<InfluencerPayment[]>([]);
  const [influencerContents, setInfluencerContents] = useState<InfluencerContent[]>([]);

  const [referralChains, setReferralChains] = useState<ReferralChain[]>([]);
  const [chainHistories, setChainHistories] = useState<ChainHistory[]>([]);

  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandOwners, setBrandOwners] = useState<BrandOwner[]>([]);
  const [customBrands, setCustomBrands] = useState<{name: string, owner: string}[]>([]);
  const [customBrandOwners, setCustomBrandOwners] = useState<string[]>([]);
  const [units, setUnits] = useState<UnitMaster[]>(DEFAULT_UNITS);

  const [shoppingCart, setShoppingCart] = useState<ShoppingCartItem[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [productReviews, setProductReviews] = useState<ProductReview[]>([]);
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([]);
  const [customerDeliveryAddresses, setCustomerDeliveryAddresses] = useState<CustomerDeliveryAddress[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [orderDeliveryTracking, setOrderDeliveryTracking] = useState<OrderDeliveryTracking[]>([]);
  const [orderReturnRequests, setOrderReturnRequests] = useState<OrderReturnRequest[]>([]);
  const [orderRefunds, setOrderRefunds] = useState<OrderRefund[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([]);
  const [paymentGatewaySettings, setPaymentGatewaySettings] = useState<PaymentGatewaySetting[]>([]);
  const [deliveryCharges, setDeliveryCharges] = useState<DeliveryCharge[]>([]);
  const [formatInvoices, setFormatInvoices] = useState<FormatInvoice[]>([]);
  const [partnerLevels, setPartnerLevels] = useState<PartnerLevel[]>([]);
  const [commissionRules, setCommissionRules] = useState<CommissionRule[]>([]);
  const [commissionTransactions, setCommissionTransactions] = useState<CommissionTransaction[]>([]);
  const [defaultFallbackRates, setDefaultFallbackRates] = useState<number[]>([10, 5, 3]);

  const [syncingIndicator, setSyncingIndicator] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(new Date().toISOString());

  // Firestore Single Source of Truth & Error UI state
  const [firestoreError, setFirestoreError] = useState<FirestoreErrorState | null>(
    initError ? { hasError: true, message: initError, timestamp: new Date().toISOString() } : null
  );
  const [isLoadingFirestore, setIsLoadingFirestore] = useState<boolean>(true);

  const dismissFirestoreError = useCallback(() => {
    setFirestoreError(null);
  }, []);

  // Main data fetch function: Query Cloud Firestore directly using Repositories
  const reloadFirestoreData = useCallback(async () => {
    setIsLoadingFirestore(true);
    setFirestoreError(null);
    setSyncingIndicator(true);

    try {
      // Ensure user is signed into Firebase Auth before querying protected collections
      if (!auth.currentUser) {
        setIsLoadingFirestore(false);
        setSyncingIndicator(false);
        return;
      }

      // Read directly from Cloud Firestore collections via Repository Layer
      const [
        fetchedUsers,
        fetchedProducts,
        fetchedOrders,
        fetchedCustomers,
        fetchedTasks,
        fetchedEvents,
        fetchedCampaigns,
        fetchedReferrals,
        fetchedMessages,
        fetchedAuditLogs,
        fetchedInfluencers,
        fetchedInfluencerCampaigns,
        fetchedCustomerDeliveryAddresses,
        fetchedPartnerLevels,
        fetchedCommissionRules,
        fetchedCommissionTransactions,
        fetchedFormatInvoices,
        fetchedDeliveryCharges
      ] = await Promise.all([
        userRepository.getAll(),
        productRepository.getAll(),
        orderRepository.getAll(),
        customerRepository.getAll(),
        taskRepository.getAll(),
        eventRepository.getAll(),
        campaignRepository.getAll(),
        referralRepository.getAll(),
        whatsAppMessageRepository.getAll(),
        auditLogRepository.getAll(),
        influencerRepository.getAll(),
        influencerCampaignRepository.getAll(),
        customerDeliveryAddressRepository.getAll(),
        partnerLevelRepository.getAll(),
        commissionRuleRepository.getAll(),
        commissionTransactionRepository.getAll(),
        formatInvoiceRepository.getAll(),
        deliveryChargeRepository.getAll()
      ]);

      setRegisteredUsers(fetchedUsers);
      setProducts(fetchedProducts);
      const mappedOrders = fetchedOrders.map(o => ({
        ...o,
        salesPlatform: o.salesPlatform || 'webleafyearth'
      }));
      setSalesOrders(mappedOrders);
      setCustomers(fetchedCustomers);

      // Mass update existing sales_orders records in Firestore if missing salesPlatform
      fetchedOrders.forEach(o => {
        if (!o.salesPlatform) {
          orderRepository.update(o.id, { salesPlatform: 'webleafyearth' }).catch(() => {});
        }
      });
      setTasks(fetchedTasks);
      setCalendarEvents(fetchedEvents);
      setCampaigns(fetchedCampaigns);
      setFormatInvoices(fetchedFormatInvoices);
      setDeliveryCharges(fetchedDeliveryCharges);

      // Derive referral partners strictly from CUSTOMERS table, excluding administrative users
      const adminUserIds = new Set(fetchedUsers.map(u => String(u.id)));
      const adminUserEmails = new Set(fetchedUsers.map(u => String(u.email || '').toLowerCase()).filter(Boolean));
      const adminUserMobiles = new Set(fetchedUsers.map(u => String(u.mobileNumber || '').replace(/\D/g, '')).filter(Boolean));

      const customerPartners: Referral[] = fetchedCustomers.map(c => {
        const legacy = fetchedReferrals.find(r => r.id === c.id || r.referralId === c.referralCode || r.referralId === c.customerId || (r.mobileNumber && c.mobileNumber && r.mobileNumber.replace(/\D/g, '') === c.mobileNumber.replace(/\D/g, '')));
        const uplineSponsorId =
          c.referredById ||
          c.parentId ||
          (c as any).sponsorPartnerId ||
          (c as any).sponsorId ||
          (c as any).sponsorCode ||
          (c as any).referredByCode ||
          (c as any).referredBy ||
          (c as any).referralmobileno ||
          c.partnerName ||
          legacy?.referredById ||
          legacy?.parentId ||
          (legacy as any)?.sponsorId ||
          (legacy as any)?.partnerName ||
          (legacy as any)?.referralmobileno ||
          '';

        return {
          id: c.id,
          referralId: c.referralCode || c.customerId || `REF-${c.id}`,
          name: c.name || 'Unnamed Customer',
          mobileNumber: c.mobileNumber || '',
          email: c.email || '',
          address: c.address || '',
          bankAccountName: legacy?.bankAccountName || '',
          bankAccountNumber: legacy?.bankAccountNumber || '',
          bankName: legacy?.bankName || '',
          branch: legacy?.branch || '',
          ifscCode: legacy?.ifscCode || legacy?.ifsCode || '',
          upiId: legacy?.upiId || '',
          createdAt: c.lastOrderDate || legacy?.createdAt || new Date().toISOString(),
          status: (c.status as any) || legacy?.status || 'Active',
          referredById: uplineSponsorId,
          parentId: uplineSponsorId,
          partnerLevelId: c.partnerLevelId || legacy?.partnerLevelId,
          partnerLevelName: c.partnerLevelName || legacy?.partnerLevelName,
          totalSales: c.totalSales || legacy?.totalSales || c.totalSpent || 0,
          commissionEarned: c.commissionEarned || legacy?.commissionEarned || 0,
          commissionPayable: c.commissionPayable || legacy?.commissionPayable || 0,
          commissionPaid: c.commissionPaid || legacy?.commissionPaid || 0,
        };
      });

      const extraLegacy = fetchedReferrals.filter(r => {
        if (fetchedCustomers.some(c => c.id === r.id)) return false;
        if (adminUserIds.has(String(r.id)) || adminUserIds.has(String(r.userId))) return false;
        if (r.email && adminUserEmails.has(String(r.email).toLowerCase())) return false;
        if (r.mobileNumber && adminUserMobiles.has(String(r.mobileNumber).replace(/\D/g, ''))) return false;
        return true;
      });

      setReferrals([...customerPartners, ...extraLegacy]);
      setWhatsAppMessages(fetchedMessages);
      setAuditLogs(fetchedAuditLogs);
      setInfluencers(fetchedInfluencers);
      setInfluencerCampaigns(fetchedInfluencerCampaigns);
      setCustomerDeliveryAddresses(fetchedCustomerDeliveryAddresses);
      setPartnerLevels(fetchedPartnerLevels);
      setCommissionRules(fetchedCommissionRules);
      setCommissionTransactions(fetchedCommissionTransactions);

      // Attempt to load settings
      try {
        const brandConfigDoc = await brandConfigRepository.getById('global');
        if (brandConfigDoc) {
          setBrandConfig(mergeBrandConfig(brandConfigDoc));
        }
      } catch (e) {
        // Brand config document optional initialization
      }

      try {
        const fetchedGatewaySettings = await paymentGatewaySettingRepository.getAll();
        if (fetchedGatewaySettings.length > 0) {
          setPaymentGatewaySettings(fetchedGatewaySettings);
        }
      } catch (e) {
        // Payment gateway settings optional initialization
      }

      try {
        const fetchedCategories = await categoryRepository.getAll();
        setCategories(fetchedCategories);
        if (fetchedCategories.length > 0) {
          setCustomCategories(prev => Array.from(new Set([...prev, ...fetchedCategories.map(c => c.name)])));
        }
      } catch (e) {
        // Category images optional initialization
      }

      try {
        const fetchedBrands = await brandRepository.getAll();
        setBrands(fetchedBrands);
        if (fetchedBrands.length > 0) {
          setCustomBrands(prev => {
            const existingNames = new Set(prev.map(b => b.name.toLowerCase()));
            const newOnes = fetchedBrands.filter(b => !existingNames.has(b.name.toLowerCase())).map(b => ({ name: b.name, owner: b.owner || 'Generic Owner' }));
            return [...prev, ...newOnes];
          });
        }
      } catch (e) {
        // Brands optional initialization
      }

      try {
        const fetchedBrandOwners = await brandOwnerRepository.getAll();
        setBrandOwners(fetchedBrandOwners);
        if (fetchedBrandOwners.length > 0) {
          setCustomBrandOwners(prev => Array.from(new Set([...prev, ...fetchedBrandOwners.map(o => o.name)])));
        }
      } catch (e) {
        // Brand owners optional initialization
      }

      try {
        const fetchedUnits = await unitMasterRepository.getAll();
        if (fetchedUnits && fetchedUnits.length > 0) {
          setUnits(fetchedUnits);
        } else {
          setUnits(DEFAULT_UNITS);
          for (const u of DEFAULT_UNITS) {
            await unitMasterRepository.create(u).catch(() => {});
          }
        }
      } catch (e) {
        // Units optional initialization
      }

      setLastSyncedAt(new Date().toISOString());
    } catch (err: any) {
      console.error("[Firestore Error Captured]", err);
      const errMsg = err?.message || String(err);
      logFirestoreError({
        operationType: 'list',
        collectionName: 'all_collections',
        errorMessage: errMsg,
        stackTrace: err?.stack
      });

      setFirestoreError({
        hasError: true,
        message: errMsg,
        collectionName: 'Firestore Collections',
        operationType: 'read',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoadingFirestore(false);
      setSyncingIndicator(false);
    }
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    if (!auth) {
      setIsLoggedIn(false);
      setIsLoadingFirestore(false);
      setSyncingIndicator(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setIsLoggedIn(true);
        setCurrentUser(prev => ({
          ...prev,
          id: firebaseUser.uid,
          email: firebaseUser.email || prev.email,
          name: firebaseUser.displayName || prev.name
        }));
        reloadFirestoreData();
      } else {
        setIsLoggedIn(false);
        setIsLoadingFirestore(false);
        setSyncingIndicator(false);
      }
    });
    return () => unsubscribe();
  }, [reloadFirestoreData]);

  // Authorization access checks
  const setRole = useCallback((role: UserRole) => {
    setCurrentUser(prev => ({ ...prev, role }));
  }, []);

  const hasAccess = useCallback((moduleName: string, action: 'read' | 'create' | 'edit' | 'delete'): boolean => {
    const rolePerms = permissions[currentUser.role];
    if (!rolePerms) return true;
    const mod = rolePerms.find(p => p.module.toLowerCase() === moduleName.toLowerCase());
    if (!mod) return true;
    return mod[action];
  }, [permissions, currentUser.role]);

  const updatePermission = useCallback((role: UserRole, moduleName: string, action: 'read' | 'create' | 'edit' | 'delete', value: boolean) => {
    setPermissions(prev => {
      const copy = { ...prev };
      const rolePerms = [...(copy[role] || [])];
      const idx = rolePerms.findIndex(p => p.module === moduleName);
      if (idx !== -1) {
        rolePerms[idx] = { ...rolePerms[idx], [action]: value };
      }
      copy[role] = rolePerms;
      rolePermissionsRepository.set(role, { id: role, permissions: copy })
        .catch(err => setFirestoreError({
          hasError: true,
          message: err.message,
          collectionName: 'permissions',
          operationType: 'update',
          timestamp: new Date().toISOString()
        }));
      return copy;
    });
  }, []);

  // Auth Operations via Firebase Authentication
  const loginWithEmailPassword = useCallback(async (email: string, pass: string) => {
    try {
      const res = await signInWithEmailAndPassword(auth, email, pass);
      setIsLoggedIn(true);
      const userDoc: User = {
        id: res.user.uid,
        name: res.user.displayName || email.split('@')[0],
        email: email,
        role: 'Admin',
        avatar: res.user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&q=80',
        team: 'Management',
        mobileNumber: ''
      };
      setCurrentUser(userDoc);
      return { success: true, user: userDoc };
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      return { success: false, error: errorMsg };
    }
  }, []);

  const registerWithEmailPassword = useCallback(async (email: string, pass: string, name: string, role: UserRole = 'Admin') => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser: User = {
        id: res.user.uid,
        name,
        email,
        role,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&q=80',
        team: 'Management',
        mobileNumber: ''
      };
      await userRepository.set(res.user.uid, newUser);
      setRegisteredUsers(prev => [...prev, newUser]);
      setCurrentUser(newUser);
      setIsLoggedIn(true);
      return { success: true, user: newUser };
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      return { success: false, error: errorMsg };
    }
  }, []);

  const resetPasswordWithEmail = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to send password reset email.' };
    }
  }, []);

  const logout = useCallback(() => {
    signOut(auth).catch(console.error);
    setIsLoggedIn(false);
  }, []);

  // CRUD Operations accessing Firestore directly via Repositories
  const addUser = useCallback(async (userData: Omit<User, "id">) => {
    try {
      const created = await userRepository.create(userData);
      setRegisteredUsers(prev => [...prev, created]);
      return true;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'users',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }, []);

  const updateUser = useCallback(async (id: string, updates: Partial<User>) => {
    try {
      await userRepository.update(id, updates);
      setRegisteredUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
      if (currentUser.id === id) {
        setCurrentUser(prev => ({ ...prev, ...updates }));
      }
      return true;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'users',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }, [currentUser.id]);

  const deleteUser = useCallback(async (id: string) => {
    try {
      await userRepository.delete(id);
      setRegisteredUsers(prev => prev.filter(u => u.id !== id));
      return true;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'users',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }, []);



  const syncCustomersToWhatsAppContacts = useCallback(() => {
    return { successCount: customers.length, skippedCount: 0 };
  }, [customers]);

  // Tasks CRUD
  const addTask = useCallback(async (taskData: Omit<Task, 'id' | 'status'>) => {
    try {
      const fullTaskData = { ...taskData, status: 'Pending' as const };
      const created = await taskRepository.create(fullTaskData);
      setTasks(prev => [created, ...prev]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'tasks',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    try {
      await taskRepository.update(id, updates);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'tasks',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    try {
      await taskRepository.delete(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'tasks',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Calendar Events CRUD
  const addCalendarEvent = useCallback(async (eventData: Omit<CalendarEvent, 'id'>) => {
    try {
      const created = await eventRepository.create(eventData);
      setCalendarEvents(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'calendar_events',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateCalendarEvent = useCallback(async (id: string, updates: Partial<CalendarEvent>) => {
    try {
      await eventRepository.update(id, updates);
      setCalendarEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'calendar_events',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteCalendarEvent = useCallback(async (id: string) => {
    try {
      await eventRepository.delete(id);
      setCalendarEvents(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'calendar_events',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Products CRUD
  const addProduct = useCallback(async (prodData: Omit<ProductPerformance, 'id'>) => {
    try {
      const created = await productRepository.create(prodData);
      setProducts(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'products',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateProduct = useCallback(async (id: string, updates: Partial<ProductPerformance>) => {
    try {
      await productRepository.update(id, updates);
      setProducts(prev => prev.map(p => String(p.id || '').trim() === String(id || '').trim() ? { ...p, ...updates } : p));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'products',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    try {
      await productRepository.delete(id);
      setProducts(prev => prev.filter(p => String(p.id || '').trim() !== String(id || '').trim()));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'products',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Customers CRUD
  const addCustomer = useCallback(async (custData: Omit<CustomerPerformance, 'id'>) => {
    try {
      if (custData.mobileNumber) {
        const normTarget = custData.mobileNumber.replace(/\D/g, '');
        if (normTarget) {
          const duplicate = customers.find(c => c.mobileNumber && c.mobileNumber.replace(/\D/g, '') === normTarget);
          if (duplicate) {
            throw new Error(`Duplicate customer mobile number "${custData.mobileNumber}" is not allowed.`);
          }
        }
      }
      const countryCode = custData.countrymobilecode || '+91';
      const cleanMobile = custData.mobileNumber ? custData.mobileNumber.replace(/\D/g, '') : '';
      const fullMobile = custData.mobilenumberwithcountrycode || (cleanMobile ? (cleanMobile.startsWith('+') ? cleanMobile : `${countryCode}${cleanMobile}`) : '');
      const payload: Omit<CustomerPerformance, 'id'> = {
        ...custData,
        countrymobilecode: countryCode,
        mobilenumberwithcountrycode: fullMobile
      };
      const created = await customerRepository.create(payload);
      setCustomers(prev => [...prev, created]);
      return created;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'customers',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
      return undefined;
    }
  }, [customers]);

  const updateCustomer = useCallback(async (id: string, updates: Partial<CustomerPerformance>) => {
    try {
      if (updates.mobileNumber) {
        const normTarget = updates.mobileNumber.replace(/\D/g, '');
        if (normTarget) {
          const duplicate = customers.find(c => c.id !== id && c.mobileNumber && c.mobileNumber.replace(/\D/g, '') === normTarget);
          if (duplicate) {
            throw new Error(`Duplicate customer mobile number "${updates.mobileNumber}" is not allowed.`);
          }
        }
      }
      await customerRepository.update(id, updates);
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'customers',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, [customers]);

  const deleteCustomer = useCallback(async (id: string) => {
    try {
      const targetCustomer = customers.find(c => c.id === id);
      const customerIdVal = targetCustomer?.customerId || id;
      const refCodeVal = targetCustomer?.referralCode || '';
      const mobileVal = targetCustomer?.mobileNumber || '';
      const emailVal = targetCustomer?.email || '';
      const nameVal = targetCustomer?.name || '';

      // 1. Delete linked delivery address tables
      const linkedAddresses = customerDeliveryAddresses.filter(addr => 
        addr.customerId === id || 
        addr.customerId === customerIdVal || 
        addr.userId === id || 
        (mobileVal && addr.mobileNumber === mobileVal)
      );
      if (linkedAddresses.length > 0) {
        await Promise.all(linkedAddresses.map(addr => customerDeliveryAddressRepository.delete(addr.id)));
        const deletedAddressIds = new Set(linkedAddresses.map(a => a.id));
        setCustomerDeliveryAddresses(prev => prev.filter(a => !deletedAddressIds.has(a.id)));
        setCustomerAddresses(prev => prev.filter(a => !deletedAddressIds.has(a.id)));
      }

      // 2. Delete linked referral link table records
      const linkedReferrals = referrals.filter(r => 
        r.id === id || 
        r.referralId === id || 
        r.referralId === customerIdVal || 
        (refCodeVal && r.referralId === refCodeVal) || 
        r.userId === id || 
        (mobileVal && r.mobileNumber === mobileVal) || 
        (emailVal && r.email === emailVal)
      );
      if (linkedReferrals.length > 0) {
        await Promise.all(linkedReferrals.map(r => referralRepository.delete(r.id)));
        const deletedReferralIds = new Set(linkedReferrals.map(r => r.id));
        setReferrals(prev => prev.filter(r => !deletedReferralIds.has(r.id)));
      }

      // Delete linked referral links from referral_links collection if any
      try {
        const allReferralLinks = await referralLinkRepository.getAll();
        const matchingRefLinks = allReferralLinks.filter((link: any) => 
          link.id === id || 
          link.customerId === id || 
          link.customerId === customerIdVal || 
          (refCodeVal && link.referralCode === refCodeVal) || 
          (mobileVal && link.mobileNumber === mobileVal)
        );
        if (matchingRefLinks.length > 0) {
          await Promise.all(matchingRefLinks.map((link: any) => referralLinkRepository.delete(link.id)));
        }
      } catch (refLinkErr) {
        console.warn('[deleteCustomer] Referral links cleanup skipped:', refLinkErr);
      }

      // 3. Delete linked index tables
      try {
        const allIndexDocs = await customerIndexRepository.getAll();
        const matchingIndexes = allIndexDocs.filter((idx: any) => 
          idx.id === id || 
          idx.customerId === id || 
          idx.customerId === customerIdVal || 
          (refCodeVal && idx.referralCode === refCodeVal) || 
          (mobileVal && idx.mobileNumber === mobileVal)
        );
        if (matchingIndexes.length > 0) {
          await Promise.all(matchingIndexes.map((idx: any) => customerIndexRepository.delete(idx.id)));
        }
      } catch (indexErr) {
        console.warn('[deleteCustomer] Customer index cleanup skipped:', indexErr);
      }

      // 4. Corresponding referral id and referral name should change to empty
      const updatedCustomersToPersist: { id: string; updates: Partial<CustomerPerformance> }[] = [];
      const updatedCustomersState = customers
        .filter(c => c.id !== id)
        .map(c => {
          let modified = false;
          const updates: Partial<CustomerPerformance> = {};
          if (c.referredById === id || c.referredById === customerIdVal || (refCodeVal && c.referredById === refCodeVal)) {
            updates.referredById = '';
            modified = true;
          }
          if (c.parentId === id || c.parentId === customerIdVal || (refCodeVal && c.parentId === refCodeVal)) {
            updates.parentId = '';
            modified = true;
          }
          if (c.partnerName && (c.partnerName === nameVal || (targetCustomer?.partnerName && c.partnerName === targetCustomer.partnerName))) {
            updates.partnerName = '';
            modified = true;
          }
          if (modified) {
            updatedCustomersToPersist.push({ id: c.id, updates });
            return { ...c, ...updates };
          }
          return c;
        });

      if (updatedCustomersToPersist.length > 0) {
        await Promise.all(updatedCustomersToPersist.map(item => customerRepository.update(item.id, item.updates)));
      }

      const updatedReferralsToPersist: { id: string; updates: Partial<Referral> }[] = [];
      const updatedReferralsState = referrals
        .filter(r => r.id !== id && !linkedReferrals.some(lr => lr.id === r.id))
        .map(r => {
          let modified = false;
          const updates: Partial<Referral> = {};
          if (r.referredById === id || r.referredById === customerIdVal || (refCodeVal && r.referredById === refCodeVal)) {
            updates.referredById = '';
            modified = true;
          }
          if (r.parentId === id || r.parentId === customerIdVal || (refCodeVal && r.parentId === refCodeVal)) {
            updates.parentId = '';
            modified = true;
          }
          if (modified) {
            updatedReferralsToPersist.push({ id: r.id, updates });
            return { ...r, ...updates };
          }
          return r;
        });

      if (updatedReferralsToPersist.length > 0) {
        await Promise.all(updatedReferralsToPersist.map(item => referralRepository.update(item.id, item.updates)));
      }

      // 5. Delete main customer doc
      await customerRepository.delete(id);

      // 6. Update local store states
      setCustomers(updatedCustomersState);
      setReferrals(updatedReferralsState);

      // 7. Record system audit log
      await auditLogRepository.create({
        timestamp: new Date().toISOString(),
        user: currentUser?.name || 'System User',
        role: currentUser?.role || 'Admin',
        action: 'CUSTOMER_PURGED',
        details: `Deleted customer ${nameVal || id} and purged linked delivery addresses, referral links, index entries, and cleared referral ID/name references.`,
        status: 'success'
      }).catch(logErr => console.warn('[deleteCustomer] Audit log write failed:', logErr));

    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'customers',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, [customers, customerDeliveryAddresses, referrals, currentUser]);

  const addCustomerDeliveryAddress = useCallback(async (address: Omit<CustomerDeliveryAddress, 'id'>) => {
    try {
      const created = await customerDeliveryAddressRepository.create(address);
      if (created.isDefault) {
        const existingDefaults = customerDeliveryAddresses.filter(item => item.customerId === address.customerId && item.isDefault);
        await Promise.all(existingDefaults.map(item => customerDeliveryAddressRepository.update(item.id, { isDefault: false })));
      }
      setCustomerDeliveryAddresses(prev => [
        ...prev
          .map(item => item.customerId === address.customerId && created.isDefault ? { ...item, isDefault: false } : item),
        created
      ]);
      return created;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'customer_delivery_addresses',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
      return undefined;
    }
  }, [customerDeliveryAddresses]);

  const updateCustomerDeliveryAddress = useCallback(async (id: string, updates: Partial<CustomerDeliveryAddress>) => {
    try {
      const current = customerDeliveryAddresses.find(item => item.id === id);
      await customerDeliveryAddressRepository.update(id, updates);
      if (updates.isDefault && current) {
        const existingDefaults = customerDeliveryAddresses.filter(item => item.customerId === current.customerId && item.id !== id && item.isDefault);
        await Promise.all(existingDefaults.map(item => customerDeliveryAddressRepository.update(item.id, { isDefault: false })));
      }
      setCustomerDeliveryAddresses(prev => prev.map(item => {
        if (item.id === id) return { ...item, ...updates };
        if (updates.isDefault && current && item.customerId === current.customerId) return { ...item, isDefault: false };
        return item;
      }));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'customer_delivery_addresses',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, [customerDeliveryAddresses]);

  const deleteCustomerDeliveryAddress = useCallback(async (id: string) => {
    try {
      await customerDeliveryAddressRepository.delete(id);
      setCustomerDeliveryAddresses(prev => prev.filter(item => item.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'customer_delivery_addresses',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Referrals CRUD
  const addReferral = useCallback(async (refData: Omit<Referral, 'id' | 'createdAt' | 'status'>) => {
    try {
      const fullRef = { ...refData, createdAt: new Date().toISOString(), status: 'Pending Approval' as const };
      const created = await referralRepository.create(fullRef);
      setReferrals(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'referrals',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateReferral = useCallback(async (id: string, updates: Partial<Referral>) => {
    try {
      await referralRepository.update(id, updates);
      setReferrals(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'referrals',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteReferral = useCallback(async (id: string) => {
    try {
      await referralRepository.delete(id);
      setReferrals(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'referrals',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);




  // Campaigns CRUD
  const addCampaign = useCallback(async (campData: Omit<MarketingCampaign, 'id'>) => {
    try {
      const created = await campaignRepository.create(campData);
      setCampaigns(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'campaigns',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateCampaign = useCallback(async (id: string, updates: Partial<MarketingCampaign>) => {
    try {
      await campaignRepository.update(id, updates);
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'campaigns',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteCampaign = useCallback(async (id: string) => {
    try {
      await campaignRepository.delete(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'campaigns',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // WhatsApp Messages & Sequences
  const sendWhatsAppMessage = useCallback(async (phone: string, content: string, leadId?: string, templateName?: string) => {
    try {
      const msg: Omit<WhatsAppMessage, 'id'> = {
        phone,
        direction: 'Outgoing' as const,
        content,
        leadId,
        templateName,
        timestamp: new Date().toISOString(),
        status: 'sent'
      };
      const created = await whatsAppMessageRepository.create(msg);
      setWhatsAppMessages(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'whatsapp_messages',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteLeadWhatsAppMessages = useCallback(async (leadId: string) => {
    try {
      const toDelete = whatsAppMessages.filter(m => m.leadId === leadId);
      await Promise.all(toDelete.map(m => whatsAppMessageRepository.delete(m.id)));
      setWhatsAppMessages(prev => prev.filter(m => m.leadId !== leadId));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'whatsapp_messages',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, [whatsAppMessages]);

  const deleteAllWhatsAppMessages = useCallback(async () => {
    try {
      await Promise.all(whatsAppMessages.map(m => whatsAppMessageRepository.delete(m.id)));
      setWhatsAppMessages([]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'whatsapp_messages',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, [whatsAppMessages]);

  const updateSequenceStep = useCallback(async (id: string, updates: Partial<WhatsAppSequenceStep>) => {
    try {
      await whatsAppSequenceRepository.update(id, updates);
      setWhatsAppSequence(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'whatsapp_sequences',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // System Audit Logs
  const addCustomAuditLog = useCallback(async (action: string, details: string, status: 'success' | 'warning' | 'denied' = 'success') => {
    try {
      const logData: Omit<SystemAuditLog, 'id'> = {
        timestamp: new Date().toISOString(),
        user: currentUser.name,
        role: currentUser.role,
        action,
        details,
        status
      };
      const created = await auditLogRepository.create(logData);
      setAuditLogs(prev => [created, ...prev]);
    } catch (err: any) {
      console.warn("Failed to write audit log to Firestore", err);
    }
  }, [currentUser]);

  const clearAuditLogs = useCallback(async () => {
    try {
      await Promise.all(auditLogs.map(l => auditLogRepository.delete(l.id)));
      setAuditLogs([]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'audit_logs',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, [auditLogs]);

  const clearAllData = useCallback(async () => {
    try {
      await Promise.all([
        ...tasks.map(t => taskRepository.delete(t.id)),
        ...salesOrders.map(o => orderRepository.delete(o.id)),
        ...referrals.map(r => referralRepository.delete(r.id))
      ]);
      setTasks([]);
      setSalesOrders([]);
      setReferrals([]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'all_collections',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, [tasks, salesOrders, referrals]);

  const removeUnlinkedRecords = useCallback(() => {
    return {
      unlinkedReferralCount: 0,
      unlinkedPayoutCount: 0,
      unlinkedOrderCount: 0,
      unlinkedTaskCount: 0,
      unlinkedEventCount: 0
    };
  }, []);

  // Sales Orders CRUD
  const addSalesOrder = useCallback(async (orderData: Omit<SalesOrder, 'id' | 'orderNumber' | 'createdAt'>) => {
    try {
      const fullOrder = {
        ...orderData,
        salesPlatform: orderData.salesPlatform || 'webleafyearth',
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        createdAt: new Date().toISOString()
      };
      const created = await orderRepository.create(fullOrder);
      setSalesOrders(prev => [created, ...prev]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'sales_orders',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateSalesOrder = useCallback(async (id: string, updates: Partial<SalesOrder>) => {
    try {
      await orderRepository.update(id, updates);
      setSalesOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'sales_orders',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteSalesOrder = useCallback(async (id: string) => {
    try {
      await orderRepository.delete(id);
      setSalesOrders(prev => prev.filter(o => o.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'sales_orders',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteAllSalesOrders = useCallback(async () => {
    try {
      await Promise.all(salesOrders.map(o => orderRepository.delete(o.id)));
      setSalesOrders([]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'sales_orders',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, [salesOrders]);

  // Referral Chains & Commissions
  const addReferralChain = useCallback((chain: ReferralChain) => setReferralChains(prev => [...prev, chain]), []);
  const addChainHistory = useCallback((history: ChainHistory) => setChainHistories(prev => [...prev, history]), []);


  // Influencers CRUD
  const addInfluencer = useCallback(async (itemData: Omit<Influencer, 'id'>) => {
    try {
      const created = await influencerRepository.create(itemData);
      setInfluencers(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencers',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateInfluencer = useCallback(async (id: string, updates: Partial<Influencer>) => {
    try {
      await influencerRepository.update(id, updates);
      setInfluencers(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencers',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteInfluencer = useCallback(async (id: string) => {
    try {
      await influencerRepository.delete(id);
      setInfluencers(prev => prev.filter(i => i.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencers',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Influencer Campaigns CRUD
  const addInfluencerCampaign = useCallback(async (itemData: Omit<InfluencerCampaign, 'id'>) => {
    try {
      const created = await influencerCampaignRepository.create(itemData);
      setInfluencerCampaigns(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_campaigns',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateInfluencerCampaign = useCallback(async (id: string, updates: Partial<InfluencerCampaign>) => {
    try {
      await influencerCampaignRepository.update(id, updates);
      setInfluencerCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_campaigns',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteInfluencerCampaign = useCallback(async (id: string) => {
    try {
      await influencerCampaignRepository.delete(id);
      setInfluencerCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_campaigns',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Influencer Collaborations CRUD
  const addInfluencerCollaboration = useCallback(async (itemData: Omit<InfluencerCollaboration, 'id'>) => {
    try {
      const created = await influencerCollaborationRepository.create(itemData);
      setInfluencerCollaborations(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_collaborations',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateInfluencerCollaboration = useCallback(async (id: string, updates: Partial<InfluencerCollaboration>) => {
    try {
      await influencerCollaborationRepository.update(id, updates);
      setInfluencerCollaborations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_collaborations',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteInfluencerCollaboration = useCallback(async (id: string) => {
    try {
      await influencerCollaborationRepository.delete(id);
      setInfluencerCollaborations(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_collaborations',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Influencer Dispatches CRUD
  const addInfluencerDispatch = useCallback(async (itemData: Omit<InfluencerDispatch, 'id'>) => {
    try {
      const created = await influencerDispatchRepository.create(itemData);
      setInfluencerDispatches(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_dispatches',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateInfluencerDispatch = useCallback(async (id: string, updates: Partial<InfluencerDispatch>) => {
    try {
      await influencerDispatchRepository.update(id, updates);
      setInfluencerDispatches(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_dispatches',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteInfluencerDispatch = useCallback(async (id: string) => {
    try {
      await influencerDispatchRepository.delete(id);
      setInfluencerDispatches(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_dispatches',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Influencer Payments CRUD
  const addInfluencerPayment = useCallback(async (itemData: Omit<InfluencerPayment, 'id'>) => {
    try {
      const created = await influencerPaymentRepository.create(itemData);
      setInfluencerPayments(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_payments',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateInfluencerPayment = useCallback(async (id: string, updates: Partial<InfluencerPayment>) => {
    try {
      await influencerPaymentRepository.update(id, updates);
      setInfluencerPayments(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_payments',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteInfluencerPayment = useCallback(async (id: string) => {
    try {
      await influencerPaymentRepository.delete(id);
      setInfluencerPayments(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_payments',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Influencer Contents CRUD
  const addInfluencerContent = useCallback(async (itemData: Omit<InfluencerContent, 'id'>) => {
    try {
      const created = await influencerContentRepository.create(itemData);
      setInfluencerContents(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_contents',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const updateInfluencerContent = useCallback(async (id: string, updates: Partial<InfluencerContent>) => {
    try {
      await influencerContentRepository.update(id, updates);
      setInfluencerContents(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_contents',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  const deleteInfluencerContent = useCallback(async (id: string) => {
    try {
      await influencerContentRepository.delete(id);
      setInfluencerContents(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'influencer_contents',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
    }
  }, []);

  // Brand Config
  const updateBrandConfig = useCallback(async (updates: Partial<BrandConfig>) => {
    try {
      const merged = mergeBrandConfig({ ...brandConfig, ...updates });
      setBrandConfig(merged);
      await brandConfigRepository.set('global', { id: 'global', ...merged });
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'settings',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, [brandConfig]);

  const updateDefaultFallbackRates = useCallback((rates: number[]) => setDefaultFallbackRates(rates), []);
  const recalculateAllMasterRecords = useCallback(async () => {}, []);

  // Category picture upload (Firebase Storage + Firestore-backed metadata)
  const uploadCategoryPicture = useCallback(async (categoryName: string, file: File) => {
    const existing = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    try {
      const saved = await categoryRepository.uploadCategoryImage(categoryName, file, existing?.id);
      setCategories(prev => existing
        ? prev.map(c => c.id === existing.id ? saved : c)
        : [...prev, saved]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_categories',
        operationType: existing ? 'update' : 'create',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, [categories]);

  // Category Master Persistence Handlers (writes directly to product_categories collection in violeafydb)
  const createCategory = useCallback(async (catData: Omit<Category, 'id'>) => {
    const newCatDoc: Category = {
      ...catData,
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    try {
      await categoryRepository.create(newCatDoc);
      setCategories(prev => [...prev, newCatDoc]);
      if (!customCategories.some(c => c.toLowerCase() === newCatDoc.name.toLowerCase())) {
        setCustomCategories(prev => [...prev, newCatDoc.name]);
      }
      return newCatDoc;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_categories',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, [customCategories]);

  const updateCategory = useCallback(async (id: string, updates: Partial<Category>) => {
    try {
      await categoryRepository.update(id, updates);
      let updatedCatDoc: Category | null = null;
      setCategories(prev => prev.map(c => {
        if (c.id === id) {
          updatedCatDoc = { ...c, ...updates, updatedAt: new Date().toISOString() };
          return updatedCatDoc;
        }
        return c;
      }));
      return updatedCatDoc || ({ id, ...updates } as Category);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_categories',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    try {
      await categoryRepository.delete(id);
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_categories',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, []);

  // Brand Master Persistence Handlers (writes directly to product_brands collection in violeafydb)
  const createBrand = useCallback(async (brandData: Omit<Brand, 'id'>) => {
    const newBrandDoc: Brand = {
      ...brandData,
      id: `brand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    try {
      await brandRepository.create(newBrandDoc);
      setBrands(prev => [...prev, newBrandDoc]);
      if (!customBrands.some(b => b.name.toLowerCase() === newBrandDoc.name.toLowerCase())) {
        setCustomBrands(prev => [...prev, { name: newBrandDoc.name, owner: newBrandDoc.owner || 'Generic Owner' }]);
      }
      return newBrandDoc;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_brands',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, [customBrands]);

  const updateBrand = useCallback(async (id: string, updates: Partial<Brand>) => {
    try {
      await brandRepository.update(id, updates);
      let updatedBrandDoc: Brand | null = null;
      setBrands(prev => prev.map(b => {
        if (b.id === id) {
          updatedBrandDoc = { ...b, ...updates, updatedAt: new Date().toISOString() };
          return updatedBrandDoc;
        }
        return b;
      }));
      return updatedBrandDoc || ({ id, ...updates } as Brand);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_brands',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, []);

  const deleteBrand = useCallback(async (id: string) => {
    try {
      await brandRepository.delete(id);
      setBrands(prev => prev.filter(b => b.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_brands',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, []);

  const uploadBrandPicture = useCallback(async (brandName: string, file: File, owner?: string) => {
    const existing = brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
    try {
      const saved = await brandRepository.uploadBrandImage(brandName, owner || existing?.owner || 'Generic Owner', file, existing?.id);
      setBrands(prev => existing
        ? prev.map(b => b.id === existing.id ? saved : b)
        : [...prev, saved]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_brands',
        operationType: existing ? 'update' : 'create',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, [brands]);

  // Brand Owner Master Persistence Handlers (writes directly to product_brand_owners collection in violeafydb)
  const createBrandOwner = useCallback(async (ownerData: Omit<BrandOwner, 'id'>) => {
    const newOwnerDoc: BrandOwner = {
      ...ownerData,
      id: `owner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    try {
      await brandOwnerRepository.create(newOwnerDoc);
      setBrandOwners(prev => [...prev, newOwnerDoc]);
      if (!customBrandOwners.some(o => o.toLowerCase() === newOwnerDoc.name.toLowerCase())) {
        setCustomBrandOwners(prev => [...prev, newOwnerDoc.name]);
      }
      return newOwnerDoc;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_brand_owners',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, [customBrandOwners]);

  const updateBrandOwner = useCallback(async (id: string, updates: Partial<BrandOwner>) => {
    try {
      await brandOwnerRepository.update(id, updates);
      let updatedOwnerDoc: BrandOwner | null = null;
      setBrandOwners(prev => prev.map(o => {
        if (o.id === id) {
          updatedOwnerDoc = { ...o, ...updates, updatedAt: new Date().toISOString() };
          return updatedOwnerDoc;
        }
        return o;
      }));
      return updatedOwnerDoc || ({ id, ...updates } as BrandOwner);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_brand_owners',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, []);

  const deleteBrandOwner = useCallback(async (id: string) => {
    try {
      await brandOwnerRepository.delete(id);
      setBrandOwners(prev => prev.filter(o => o.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_brand_owners',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, []);

  const uploadBrandOwnerPicture = useCallback(async (ownerName: string, file: File) => {
    const existing = brandOwners.find(o => o.name.toLowerCase() === ownerName.toLowerCase());
    try {
      const saved = await brandOwnerRepository.uploadBrandOwnerImage(ownerName, file, existing?.id);
      setBrandOwners(prev => existing
        ? prev.map(o => o.id === existing.id ? saved : o)
        : [...prev, saved]);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_brand_owners',
        operationType: existing ? 'update' : 'create',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, [brandOwners]);

  // Unit Master Persistence Handlers (writes to product_units collection)
  const createUnit = useCallback(async (desc: string, uqc: string) => {
    const cleanDesc = desc.trim();
    const cleanUqc = uqc.trim().toUpperCase();

    if (!cleanDesc || !cleanUqc) {
      throw new Error('Both Desc and UQC fields are mandatory.');
    }

    const duplicate = units.find(u => u.uqc.toUpperCase() === cleanUqc);
    if (duplicate) {
      throw new Error(`UQC must be unique. '${cleanUqc}' is already in use.`);
    }

    const newUnitDoc: UnitMaster = {
      id: `unit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      desc: cleanDesc,
      uqc: cleanUqc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await unitMasterRepository.create(newUnitDoc);
      setUnits(prev => [...prev, newUnitDoc]);
      return newUnitDoc;
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_units',
        operationType: 'create',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, [units]);

  const updateUnit = useCallback(async (id: string, desc: string, uqc: string) => {
    const cleanDesc = desc.trim();
    const cleanUqc = uqc.trim().toUpperCase();

    if (!cleanDesc || !cleanUqc) {
      throw new Error('Both Desc and UQC fields are mandatory.');
    }

    const duplicate = units.find(u => u.id !== id && u.uqc.toUpperCase() === cleanUqc);
    if (duplicate) {
      throw new Error(`UQC must be unique. '${cleanUqc}' is already in use by another unit.`);
    }

    const updates = {
      desc: cleanDesc,
      uqc: cleanUqc,
      updatedAt: new Date().toISOString(),
    };

    try {
      await unitMasterRepository.update(id, updates);
      let updatedDoc: UnitMaster | null = null;
      setUnits(prev => prev.map(u => {
        if (u.id === id) {
          updatedDoc = { ...u, ...updates };
          return updatedDoc;
        }
        return u;
      }));
      return updatedDoc || ({ id, ...updates } as UnitMaster);
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_units',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, [units]);

  const deleteUnit = useCallback(async (id: string) => {
    try {
      await unitMasterRepository.delete(id);
      setUnits(prev => prev.filter(u => u.id !== id));
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'product_units',
        operationType: 'delete',
        timestamp: new Date().toISOString()
      });
      throw err;
    }
  }, []);

  // Shopping Platform State Handlers
  const addToCart = useCallback((productId: string, quantity: number) => {
    setShoppingCart(prev => {
      const existing = prev.find(i => i.productId === productId);
      if (existing) {
        return prev.map(i => i.productId === productId ? { ...i, quantity: i.quantity + quantity } : i);
      }
      const newItem: ShoppingCartItem = {
        id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: currentUser?.id || 'guest',
        productId,
        quantity
      };
      return [...prev, newItem];
    });
  }, [currentUser]);

  const removeFromCart = useCallback((productId: string) => {
    setShoppingCart(prev => prev.filter(i => i.productId !== productId));
  }, []);

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    setShoppingCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity } : i));
  }, []);

  const clearCart = useCallback(() => setShoppingCart([]), []);

  const toggleWishlist = useCallback((productId: string) => {
    const newItem: WishlistItem = {
      id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: currentUser?.id || 'guest',
      productId,
      createdAt: new Date().toISOString()
    };
    setWishlist(prev => prev.some(w => w.productId === productId) ? prev.filter(w => w.productId !== productId) : [...prev, newItem]);
  }, [currentUser]);

  const addProductReview = useCallback((review: Omit<ProductReview, 'id' | 'createdAt'>) => {
    setProductReviews(prev => [...prev, { ...review, id: `rev-${Date.now()}`, createdAt: new Date().toISOString() }]);
  }, []);

  const addCustomerAddress = useCallback((addr: Omit<CustomerAddress, 'id'>) => {
    addCustomerDeliveryAddress({ ...addr, customerId: addr.userId || addr.mobileNumber });
  }, [addCustomerDeliveryAddress]);

  const updateCustomerAddress = useCallback((id: string, updates: Partial<CustomerAddress>) => {
    updateCustomerDeliveryAddress(id, updates);
  }, [updateCustomerDeliveryAddress]);

  const deleteCustomerAddress = useCallback((id: string) => {
    deleteCustomerDeliveryAddress(id);
  }, [deleteCustomerDeliveryAddress]);

  const applyCoupon = useCallback((code: string, orderValue: number) => {
    const matched = coupons.find(c => c.code.toUpperCase() === code.toUpperCase() && c.isActive);
    return matched || null;
  }, [coupons]);

  const addCoupon = useCallback((coupon: Coupon) => setCoupons(prev => [...prev, coupon]), []);

  const updateDeliveryTracking = useCallback((orderId: string, status: OrderDeliveryTracking['status'], note: string) => {
    setOrderDeliveryTracking(prev => prev.map(t => t.orderId === orderId ? { ...t, status } : t));
  }, []);

  const addReturnRequest = useCallback((req: Omit<OrderReturnRequest, 'id' | 'createdAt' | 'status'>) => {
    setOrderReturnRequests(prev => [...prev, { ...req, id: `ret-${Date.now()}`, createdAt: new Date().toISOString(), status: 'Pending' }]);
  }, []);

  const updateReturnRequest = useCallback((id: string, status: OrderReturnRequest['status']) => {
    setOrderReturnRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }, []);

  const addRefund = useCallback((ref: Omit<OrderRefund, 'id' | 'createdAt' | 'status'>) => {
    setOrderRefunds(prev => [...prev, { ...ref, id: `ref-${Date.now()}`, createdAt: new Date().toISOString(), status: 'Pending' }]);
  }, []);

  const updateRefund = useCallback((id: string, updates: Partial<OrderRefund>) => {
    setOrderRefunds(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const addPaymentTransaction = useCallback((tx: PaymentTransaction) => setPaymentTransactions(prev => [...prev, tx]), []);
  const updatePaymentTransaction = useCallback((id: string, updates: Partial<PaymentTransaction>) => {
    setPaymentTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const initiatePaymentFlow = useCallback(async (orderData: any, paymentMethod: string, gateway: string) => {
    const nowStr = new Date().toISOString();
    const tx: PaymentTransaction = {
      id: `tx-${Date.now()}`,
      orderId: orderData.id || `ord-${Date.now()}`,
      amount: orderData.totalAmount || 0,
      paymentMethod,
      gateway,
      status: 'Initiated',
      transactionReference: `tx-${Date.now()}`,
      environment: 'Live',
      createdAt: nowStr,
      updatedAt: nowStr,
      statusHistory: [{ status: 'Initiated', timestamp: nowStr, note: 'Payment initiated' }],
      logs: [{ timestamp: nowStr, action: 'initiate', details: 'Payment initiated' }]
    };
    setPaymentTransactions(prev => [...prev, tx]);
    return { success: true, transaction: tx };
  }, []);

  const verifyPaymentFlow = useCallback(async (transactionId: string, gatewayResponse: any): Promise<{ success: boolean; order?: SalesOrder; transaction?: PaymentTransaction; error?: string }> => {
    const tx = paymentTransactions.find(t => t.id === transactionId);
    if (tx) {
      updatePaymentTransaction(transactionId, { status: 'Success' });
      const updatedTx: PaymentTransaction = { ...tx, status: 'Success' };
      return { success: true, transaction: updatedTx };
    }
    return { success: false, error: 'Transaction not found' };
  }, [paymentTransactions, updatePaymentTransaction]);

  const processRefund = useCallback(async (paymentId: string, amount: number, reason: string) => {
    const ref: OrderRefund = {
      id: `ref-${Date.now()}`,
      orderId: paymentId,
      paymentId: paymentId,
      amount,
      status: 'Completed',
      createdAt: new Date().toISOString()
    };
    setOrderRefunds(prev => [...prev, ref]);
    return { success: true, refund: ref };
  }, []);

  const updatePaymentGatewaySetting = useCallback(async (id: string, updates: Partial<PaymentGatewaySetting>) => {
    try {
      const existing = paymentGatewaySettings.find(g => g.id === id);
      const nowStr = new Date().toISOString();
      const merged: PaymentGatewaySetting = {
        id,
        gateway_name: 'PayU',
        merchant_key: '',
        merchant_salt: '',
        environment: 'Test',
        success_url: '',
        failure_url: '',
        currency: 'INR',
        status: 'Enabled',
        created_at: nowStr,
        ...existing,
        ...updates,
        updated_at: nowStr
      };
      // Upsert: writes the document even if it doesn't exist yet in Firestore
      await paymentGatewaySettingRepository.create(merged);
      setPaymentGatewaySettings(prev => {
        const exists = prev.some(g => g.id === id);
        return exists ? prev.map(g => g.id === id ? merged : g) : [...prev, merged];
      });
    } catch (err: any) {
      setFirestoreError({
        hasError: true,
        message: err.message,
        collectionName: 'payment_gateway_settings',
        operationType: 'update',
        timestamp: new Date().toISOString()
      });
    }
  }, [paymentGatewaySettings]);

  const addDeliveryCharge = useCallback(async (charge: DeliveryCharge) => {
    try {
      const created = await deliveryChargeRepository.create(charge);
      setDeliveryCharges(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({ hasError: true, message: err.message, collectionName: 'delivery_charges', operationType: 'create', timestamp: new Date().toISOString() });
      throw err;
    }
  }, []);

  const updateDeliveryCharge = useCallback(async (id: string, updates: Partial<DeliveryCharge>) => {
    try {
      await deliveryChargeRepository.update(id, updates);
      setDeliveryCharges(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    } catch (err: any) {
      setFirestoreError({ hasError: true, message: err.message, collectionName: 'delivery_charges', operationType: 'update', timestamp: new Date().toISOString() });
      throw err;
    }
  }, []);

  const deleteDeliveryCharge = useCallback(async (id: string) => {
    try {
      await deliveryChargeRepository.delete(id);
      setDeliveryCharges(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      setFirestoreError({ hasError: true, message: err.message, collectionName: 'delivery_charges', operationType: 'delete', timestamp: new Date().toISOString() });
      throw err;
    }
  }, []);

  const addFormatInvoice = useCallback(async (invoice: Omit<FormatInvoice, 'id'>) => {
    try {
      const created = await formatInvoiceRepository.create(invoice);
      setFormatInvoices(prev => [...prev, created]);
    } catch (err: any) {
      setFirestoreError({ hasError: true, message: err.message, collectionName: 'formatinvoice', operationType: 'create', timestamp: new Date().toISOString() });
    }
  }, []);

  const updateFormatInvoice = useCallback(async (id: string, updates: Partial<FormatInvoice>) => {
    try {
      await formatInvoiceRepository.update(id, updates);
      setFormatInvoices(prev => prev.map(invoice => invoice.id === id ? { ...invoice, ...updates } : invoice));
    } catch (err: any) {
      setFirestoreError({ hasError: true, message: err.message, collectionName: 'formatinvoice', operationType: 'update', timestamp: new Date().toISOString() });
    }
  }, []);

  const setDefaultFormatInvoice = useCallback(async (id: string) => {
    try {
      await formatInvoiceRepository.setDefault(id);
      setFormatInvoices(prev => prev.map(invoice => ({ ...invoice, defaultSelection: invoice.id === id })));
    } catch (err: any) {
      setFirestoreError({ hasError: true, message: err.message, collectionName: 'formatinvoice', operationType: 'update', timestamp: new Date().toISOString() });
    }
  }, []);

  const addPartnerLevel = useCallback(async (item: Omit<PartnerLevel, 'id' | 'created_at' | 'updated_at'>) => {
    const res = await fetch('/api/admin/partner-levels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    if (res.ok) {
      await reloadFirestoreData();
    }
  }, [reloadFirestoreData]);

  const updatePartnerLevel = useCallback(async (id: string, updates: Partial<PartnerLevel>) => {
    const res = await fetch(`/api/admin/partner-levels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      await reloadFirestoreData();
    }
  }, [reloadFirestoreData]);

  const deletePartnerLevel = useCallback(async (id: string) => {
    await partnerLevelRepository.delete(id);
    await reloadFirestoreData();
  }, [reloadFirestoreData]);

  const addCommissionRule = useCallback(async (item: Omit<CommissionRule, 'id' | 'created_at' | 'updated_at'>) => {
    const res = await fetch('/api/admin/commission-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    if (res.ok) {
      await reloadFirestoreData();
    }
  }, [reloadFirestoreData]);

  const updateCommissionRule = useCallback(async (id: string, updates: Partial<CommissionRule>) => {
    const res = await fetch(`/api/admin/commission-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      await reloadFirestoreData();
    }
  }, [reloadFirestoreData]);

  const deleteCommissionRule = useCallback(async (id: string) => {
    await commissionRuleRepository.delete(id);
    await reloadFirestoreData();
  }, [reloadFirestoreData]);

  const processOrderCommissions = useCallback(async (orderId: string) => {
    const res = await fetch(`/api/admin/commission-transactions/process-order/${orderId}`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      await reloadFirestoreData();
    }
    return data;
  }, [reloadFirestoreData]);

  const refundOrderCommissions = useCallback(async (orderId: string, reason: string = 'Order refunded/cancelled') => {
    const res = await fetch(`/api/admin/commission-transactions/refund-order/${orderId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (data.success) {
      await reloadFirestoreData();
    }
    return data;
  }, [reloadFirestoreData]);

  const updateCommissionTransactionStatus = useCallback(async (id: string, status: CommissionTransaction['status']) => {
    const res = await fetch(`/api/admin/commission-transactions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      await reloadFirestoreData();
    }
  }, [reloadFirestoreData]);

  const value: CRMContextType = {
    currentUser,
    setRole,
    permissions,
    hasAccess,
    updatePermission,
    isLoggedIn,
    loginWithEmailPassword,
    registerWithEmailPassword,
    resetPasswordWithEmail,
    logout,
    registeredUsers,
    addUser,
    updateUser,
    deleteUser,
    syncCustomersToWhatsAppContacts,
    tasks,
    addTask,
    updateTask,
    deleteTask,
    calendarEvents,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    products,
    updateProduct,
    addProduct,
    deleteProduct,
    customers,
    updateCustomer,
    addCustomer,
    deleteCustomer,
    customerDeliveryAddresses,
    addCustomerDeliveryAddress,
    updateCustomerDeliveryAddress,
    deleteCustomerDeliveryAddress,
    referrals,
    addReferral,
    updateReferral,
    deleteReferral,
    campaigns,
    addCampaign,
    updateCampaign,
    deleteCampaign,
    whatsAppMessages,
    sendWhatsAppMessage,
    deleteAllWhatsAppMessages,
    whatsAppSequence,
    updateSequenceStep,
    whatsAppTemplates,
    auditLogs,
    addCustomAuditLog,
    clearAuditLogs,
    clearAllData,
    removeUnlinkedRecords,
    salesOrders,
    addSalesOrder,
    updateSalesOrder,
    deleteSalesOrder,
    deleteAllSalesOrders,
    referralChains,
    addReferralChain,
    chainHistories,
    addChainHistory,
    influencers,
    addInfluencer,
    updateInfluencer,
    deleteInfluencer,
    influencerCampaigns,
    addInfluencerCampaign,
    updateInfluencerCampaign,
    deleteInfluencerCampaign,
    influencerCollaborations,
    addInfluencerCollaboration,
    updateInfluencerCollaboration,
    deleteInfluencerCollaboration,
    influencerDispatches,
    addInfluencerDispatch,
    updateInfluencerDispatch,
    deleteInfluencerDispatch,
    influencerPayments,
    addInfluencerPayment,
    updateInfluencerPayment,
    deleteInfluencerPayment,
    influencerContents,
    addInfluencerContent,
    updateInfluencerContent,
    deleteInfluencerContent,
    partnerLevels,
    addPartnerLevel,
    updatePartnerLevel,
    deletePartnerLevel,
    commissionRules,
    addCommissionRule,
    updateCommissionRule,
    deleteCommissionRule,
    commissionTransactions,
    processOrderCommissions,
    refundOrderCommissions,
    updateCommissionTransactionStatus,
    syncingIndicator,
    lastSyncedAt,
    brandConfig,
    updateBrandConfig,
    recalculateAllMasterRecords,
    customCategories,
    setCustomCategories,
    categories,
    uploadCategoryPicture,
    createCategory,
    updateCategory,
    deleteCategory,
    brands,
    createBrand,
    updateBrand,
    deleteBrand,
    uploadBrandPicture,
    brandOwners,
    createBrandOwner,
    updateBrandOwner,
    deleteBrandOwner,
    uploadBrandOwnerPicture,
    customBrands,
    setCustomBrands,
    customBrandOwners,
    setCustomBrandOwners,
    units,
    createUnit,
    updateUnit,
    deleteUnit,
    shoppingCart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    wishlist,
    toggleWishlist,
    productReviews,
    addProductReview,
    customerAddresses: customerDeliveryAddresses,
    addCustomerAddress,
    updateCustomerAddress,
    deleteCustomerAddress,
    coupons,
    applyCoupon,
    addCoupon,
    orderDeliveryTracking,
    updateDeliveryTracking,
    orderReturnRequests,
    addReturnRequest,
    updateReturnRequest,
    orderRefunds,
    addRefund,
    updateRefund,
    paymentTransactions,
    addPaymentTransaction,
    updatePaymentTransaction,
    initiatePaymentFlow,
    verifyPaymentFlow,
    processRefund,
    paymentGatewaySettings,
    updatePaymentGatewaySetting,
    deliveryCharges,
    addDeliveryCharge,
    updateDeliveryCharge,
    deleteDeliveryCharge,
    formatInvoices,
    addFormatInvoice,
    updateFormatInvoice,
    setDefaultFormatInvoice,
    firestoreError,
    dismissFirestoreError,
    reloadFirestoreData,
    isLoadingFirestore
  };

  return (
    <CRMContext.Provider value={value}>
      {children}
    </CRMContext.Provider>
  );
};

export const useCRM = () => {
  const context = useContext(CRMContext);
  if (!context) {
    throw new Error('useCRM must be used within a CRMProvider');
  }
  return context;
};
