export type UserRole = 'Admin' | 'Sales' | 'Marketing' | 'Support' | 'Referral Team';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  avatar: string;
  team: string;
  mobileNumber?: string;
  password?: string;
}

export interface Permission {
  module: string;
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export interface RolePermissions {
  Admin: Permission[];
  Sales: Permission[];
  Marketing: Permission[];
  Support: Permission[];
  'Referral Team': Permission[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending' | 'Completed';
  assignedTo: string;
  category: 'Call' | 'Email' | 'Meeting' | 'Demo' | 'Task';
  linkedTo?: {
    type: 'Customer';
    id: string;
    name: string;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  type: 'Meeting' | 'Demo' | 'FollowUp' | 'CampaignRun';
  color: string;
  linkedTo?: string; // Customer name
}

export interface ProductPerformance {
  id: string;
  name: string;
  sku: string;
  hsnCode?: string;
  packingSize: string;
  unit: string;
  onlinePrice: number;
  shopPrice: number;
  notes: string;
  unitsSold: number;
  revenue: number;
  growthRate: number; // percentage
  stock: number;
  amazonSales: number;
  flipkartSales: number;
  meeshoSales: number;
  vamjoSales: number;
  whatsappSales: number;
  countersaleSales: number;
  gstPercentage?: number;
  stockIn?: number;
  stockOut?: number;
  vamjoWeblink?: string;
  amazonWeblink?: string;
  flipkartWeblink?: string;
  meeshoWeblink?: string;
  category?: string;
  brand?: string;
  brandOwner?: string;
  // Firebase Storage - main product image
  imageUrl?: string;
  storagePath?: string;
  // Product Master fields
  images?: string[];
  description?: string;
  ingredients?: string;
  specifications?: string;
  variants?: string;
  stockAvailability?: string;
  offerPrice?: number;
  mrp?: number;
  discount?: number;
  rating?: number;
  reviewsCount?: number;
  videos?: string[];
}

export interface CustomerPerformance {
  id: string;
  customerId: string;
  name: string;
  company: string;
  email: string;
  mobileNumber: string;
  countrymobilecode?: string;
  mobilenumberwithcountrycode?: string;
  address: string;
  state: string;
  district: string;
  pincode?: string;
  totalSpent: number;
  dealsClosed: number;
  satisfactionScore: number; // 1-5
  lastOrderDate: string;
  tier: 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
  partnerName?: string;
  referralCode?: string;
  password?: string;
  status?: string;
  referredById?: string;
  parentId?: string;
  partnerLevelId?: string;
  partnerLevelName?: string;
  totalSales?: number;
  commissionEarned?: number;
  commissionPayable?: number;
  commissionPaid?: number;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: 'Google Ads' | 'Facebook' | 'LinkedIn' | 'WhatsApp Blast' | 'Email Newsletter';
  status: 'Active' | 'Paused' | 'Completed' | 'Planned';
  budget: number;
  spend: number;
  conversions: number;
  revenueGenerated: number;
  roi: number; // ROI percentage
  startDate: string;
  endDate: string;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: 'Welcome' | 'FollowUp' | 'Promotion' | 'Alert';
  body: string;
  variables: string[];
}

export interface WhatsAppSequenceStep {
  id: string;
  delayHours: number;
  templateId: string;
  isActive: boolean;
}

export interface WhatsAppMessage {
  id: string;
  phone: string;
  direction: 'Incoming' | 'Outgoing';
  content: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  templateName?: string;
}

export interface SystemAuditLog {
  id: string;
  timestamp: string;
  user: string;
  role: UserRole;
  action: string;
  details: string;
  status: 'success' | 'warning' | 'denied';
}

export interface Referral {
  id: string;
  referralId: string;
  name: string;
  mobileNumber: string;
  email?: string;
  address: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  branch?: string;
  ifscCode?: string;
  ifsCode?: string;
  upiId?: string;
  createdAt: string;
  status: 'Active' | 'Pending Approval' | 'Suspended' | 'Inactive';
  securityRoleProfile?: UserRole;
  photo?: string;
  password?: string;
  referredById?: string;
  parentId?: string;
  userId?: string;
  partnerLevelId?: string;
  partnerLevelName?: string;
  totalSales?: number;
  referralCount?: number;
  downlineCount?: number;
  commissionEarned?: number;
  commissionPayable?: number;
  commissionPaid?: number;
}

export interface SalesProduct {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  gstPercentage?: number;
  category?: string;
  brand?: string;
  brandOwner?: string;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerCompany: string;
  products: SalesProduct[];
  totalValue: number;
  paymentStatus: 'Paid' | 'Pending' | 'Overdue' | 'Refunded';
  deliveryStatus: 'Pending' | 'Shipped' | 'Delivered' | 'Cancelled';
  assignedTo: string;
  createdAt: string;
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Stripe' | 'UPI' | 'Credit Card';
  invoiceDate?: string;
  pickupDate?: string;
  courierAgency?: string;
  courierCharges?: number;
  contactNo?: string;
  referralCode?: string;
  orderType?: 'Online' | 'Shop';
  salesChannel?: 'Amazon' | 'Flipkart' | 'Vamjo' | 'Meesho' | 'Shop' | 'Website' | 'Distributor' | 'Other Marketplace' | string;
}

export interface BrandConfig {
  logoType: 'fruits_flowers' | 'apps_grid' | 'initial' | 'custom_url';
  logoUrl?: string;
  imageUrl: string;
  imageType: 'preset' | 'custom_url' | 'uploaded';
  brandName: string;
  brandTagline: string;
  welcomeHeader: string;
  layoutStyle: 'split' | 'backdrop' | 'compact';
  overlayOpacity: number;
}

export interface FormatInvoice {
  id: string;
  companyName: string;
  addressess: string;
  addressess1: string;
  mobileNumber: string;
  customerCareNumber: string;
  customerCareEmail: string;
  webAddress: string;
  defaultSelection: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  storagePath?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Brand {
  id: string;
  name: string;
  owner: string;
  description?: string;
  imageUrl?: string;
  storagePath?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrandOwner {
  id: string;
  name: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  description?: string;
  imageUrl?: string;
  storagePath?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReferralChain {
  id: string; // unique ID ('chainId_partnerId_levelNo')
  chainId: string; // Represents the owner's partner ID
  partnerId: string; // Partner in the chain at that level
  levelNo: number; // 1 to 5
  activeFlag: boolean;
}

export interface ChainHistory {
  id: string; // HistoryID
  chainId: string; // Owner partner ID whose chain they were removed from
  partnerId: string; // Removed partner ID
  removalOrder: number; // 1 (1st), 2 (2nd), 3 (3rd), etc
  overridePercent: number; // calculated overlay %: 10, 5, 2, or 0
  removalDate: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'influencer';
  text: string;
  timestamp: string; // ISO string
  imageUrl?: string;
}

// Shopping Platform Extension Interfaces
export interface ShoppingCartItem {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  savedForLater?: boolean;
}

export interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
  photos?: string[];
  videos?: string[];
}

export interface CustomerDeliveryAddress {
  id: string;
  customerId: string;
  userId?: string;
  name: string;
  mobileNumber: string;
  addressLine: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export type CustomerAddress = CustomerDeliveryAddress;

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minOrderValue?: number;
  maxDiscount?: number;
  isActive: boolean;
  expiryDate: string;
  description: string;
}

export interface DeliveryCharge {
  id: string;
  pincode: string;
  charge: number;
}

export interface OrderDeliveryTracking {
  id: string;
  orderId: string;
  status: 'Order Confirmed' | 'Packed' | 'Shipped' | 'Out For Delivery' | 'Delivered' | 'Cancelled';
  updatedAt: string;
  courierName?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  history: { status: string; timestamp: string; note: string }[];
}

export interface OrderReturnRequest {
  id: string;
  orderId: string;
  type: 'Return' | 'Replacement';
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
  createdAt: string;
  processedBy?: string;
  processedAt?: string;
}

export interface OrderRefund {
  id: string;
  orderId: string;
  paymentId: string;
  amount: number;
  status: 'Pending' | 'Completed' | 'Failed';
  referenceNumber?: string;
  createdAt: string;
}

export interface PaymentGatewaySetting {
  id: string;
  gateway_name: string;
  merchant_key: string;
  merchant_salt: string;
  environment: 'Test' | 'Production';
  success_url: string;
  failure_url: string;
  webhook_url?: string;
  payment_description?: string;
  payment_flow_mode?: 'Web Redirect Flow' | 'Native Flutter PayU SDK' | 'Both';
  currency: string;
  status: 'Enabled' | 'Disabled';
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  amount: number;
  paymentMethod: 'UPI' | 'Credit Card' | 'Debit Card' | 'Net Banking' | 'Wallet' | 'COD' | string;
  gateway: 'Razorpay' | 'Cashfree' | 'PhonePe' | 'PayU' | 'CCAvenue' | 'COD' | string;
  status: 'Initiated' | 'Success' | 'Failed' | 'Refunded';
  transactionReference: string;
  environment: 'Test' | 'Live';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  statusHistory: Array<{ status: string; timestamp: string; note: string }>;
  logs: Array<{ timestamp: string; action: string; details: string }>;
}


// Influencer Marketing Interfaces
export interface Influencer {
  id: string;
  name: string;
  handle: string;
  platform: 'Instagram' | 'YouTube' | 'TikTok' | 'Facebook' | 'Twitter';
  followers: number;
  niche: string;
  email: string;
  phone?: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  contactNumber?: string;
  gpayNumber?: string;
  ratingScore: number; // 1-100 rating based on previous work
  notes?: string;
  referralCode?: string; // used to link transactions in the ERP
  chatHistory?: ChatMessage[];
  avatarUrl?: string;

  // Added directory fields
  influencerId?: string;
  instagramHandle?: string;
  facebook?: string;
  youtube?: string;
  engagementPercent?: number;
  state?: string;
  district?: string;
  city?: string;
  pincode?: string;
  language?: string;
  category?: string;
  whatsappMobile?: string;
  amazonWishlist?: string;
  upi?: string;
  collaborationType?: string;
  productSent?: string;
  payment?: string;
  campaign?: string;
  reelLink?: string;
  storyLink?: string;
  couponCode?: string;
  salesGenerated?: number;
  leads?: number;
  roi?: number;
  status?: string;
}

export interface InfluencerCampaign {
  id: string;
  name: string;
  status: 'Planned' | 'Active' | 'Paused' | 'Completed';
  budget: number;
  startDate: string;
  endDate: string;
  targetProductIds: string[];
  goal: string;
  advertisingCost: number;
  otherExpenses: number;
}

export interface InfluencerCollaboration {
  id: string;
  campaignId: string;
  influencerId: string;
  status: 'Proposed' | 'Negotiating' | 'Signed' | 'Active' | 'Completed';
  agreedFee: number;
  notes?: string;
}

export interface InfluencerDispatch {
  id: string;
  collaborationId: string;
  productId: string;
  productCost: number;
  shippingCost: number;
  dispatchType: 'Free Sample' | 'Amazon Purchase';
  amazonOrderId?: string;
  reimbursementAmount: number;
  trackingNumber?: string;
  dispatchDate: string;
  deliveryStatus: 'Pending' | 'Shipped' | 'Delivered' | 'Reimbursed';
}

export interface InfluencerPayment {
  id: string;
  collaborationId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: 'UPI' | 'Bank Transfer' | 'Stripe' | 'PayPal' | 'Cash';
  status: 'Pending' | 'Paid';
  referenceNumber?: string;
}

export interface InfluencerContent {
  id: string;
  collaborationId: string;
  deliverableType: 'Reel' | 'Post' | 'Story' | 'YouTube Video' | 'TikTok Video';
  link: string;
  liveDate?: string;
  status: 'Pending Draft' | 'Approved' | 'Live';
  views: number;
  likes: number;
  comments: number;
  engagementRate?: number; // percent
}

export interface PartnerLevel {
  id: string;
  level_name: string;
  sales_amount: number;
  sales_period: 'Monthly' | 'Quarterly' | 'Annually';
  bonus_commission: number; // percentage
  status: 'Active' | 'Inactive';
  created_at: string;
  updated_at: string;
}

export interface CommissionRule {
  id: string;
  product_id?: string | null; // null for System Default
  partner_id?: string | null; // set if Partner-Specific Override
  level: number; // 1 to 5
  commission_type: 'Percentage' | 'Fixed';
  commission_value: number;
  source: 'Default' | 'Product' | 'Partner';
  effective_from?: string;
  effective_to?: string;
  status: 'Active' | 'Inactive';
  created_at: string;
  updated_at: string;
}

export interface CommissionTransaction {
  id: string;
  order_id: string;
  order_item_id: string;
  buyer_partner_id: string;
  beneficiary_partner_id: string;
  level: number; // 1 to 5
  commission_rate: number;
  commission_base_amount: number;
  commission_amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'PAYABLE' | 'PAID' | 'REVERSED';
  rule_id?: string;
  created_at: string;
  confirmed_at?: string;
  paid_at?: string;
  reversal_info?: {
    reversed_at: string;
    reason: string;
    reversal_transaction_id?: string;
  };
}






