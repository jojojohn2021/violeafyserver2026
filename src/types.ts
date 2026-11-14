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

/** Certification entry stored in `product_details/{productId}.certifications`. */
export interface ProductCertification {
  certificateId: string;
  certificateName: string;
  certificateNumber: string;
  issuingAuthority: string;
  certificateImageUrl: string;
  certificateStoragePath: string;
  validFrom: string;
  validUntil: string;
  displayOrder: number;
  isActive: boolean;
}

/** Additional product picture stored in `product_details/{productId}.productImageUrls`. */
export interface ProductDetailsImage {
  imageId: string;
  imageUrl: string;
  storagePath: string;
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  displayOrder: number;
  isActive: boolean;
}

/** `product_details/{productId}` — 1:1 extension of a `products` document. */
export interface ProductDetails {
  productId: string;
  whyShopFromLeafyearth: string;
  idealForMaking: string;
  shelfLife: string;
  fssaiNumber: string;
  marketedManufacturedBy: string;
  allergenInformation: string;
  storageConditions: string;
  certifications: ProductCertification[];
  productImageUrls: ProductDetailsImage[];
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string;
  updatedBy: string;
  isActive: boolean;
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
  preorderactive?: boolean;
  vamjoWeblink?: string;
  amazonWeblink?: string;
  flipkartWeblink?: string;
  meeshoWeblink?: string;
  category?: string;
  categories?: string[];
  brand?: string;
  brandOwner?: string;
  // Firebase Storage - main product image
  imageUrl?: string;
  storagePath?: string;
  // Product Master fields
  images?: string[];
  description?: string;
  ingredients?: string;
  uniqueSpec1?: string;
  uniqueSpec2?: string;
  uniqueSpec3?: string;
  uniqueSpec4?: string;
  specifications?: string;
  variants?: string;
  stockAvailability?: string;
  offerPrice?: number;
  mrp?: number;
  discount?: number;
  rating?: number;
  reviewsCount?: number;
  videos?: string[];

  // =========================================================================
  // V5 Product Master Extension: General E-Commerce & Multilingual Fields (17)
  // =========================================================================
  title?: string;
  botanicalName?: string;
  botanicalFamily?: string;
  productForm?: string;
  englishName?: string;
  malayalamName?: string;
  hindiName?: string;
  tamilName?: string;
  kannadaName?: string;
  teluguName?: string;
  keyFeatures?: string[];
  culinaryUses?: string[];
  storageInstructions?: string;
  healthBenefits?: AIHealthBenefit[] | string[];
  nutritionalBenefits?: string[];
  generalPrecautions?: string[];
  healthReferences?: AIContentReference[] | string[];
  isAyurvedicProduct?: boolean;

  // =========================================================================
  // V5 Product Master Extension: Conditional Ayurvedic Fields (21)
  // =========================================================================
  sanskritName?: string;
  ayurvedicClassification?: string;
  ayurvedicDescription?: string;
  rasa?: string[];
  guna?: string[];
  virya?: string;
  vipaka?: string;
  prabhava?: string;
  vataEffect?: string;
  pittaEffect?: string;
  kaphaEffect?: string;
  medicinalPartsUsed?: string[];
  ayurvedicMedicinalUses?: string[];
  ayurvedicFormulations?: string[];
  ayurvedicUsageMethods?: string[];
  anupana?: string[];
  ayurvedicDosage?: string;
  ayurvedicPrecautions?: string[];
  contraindications?: string[];
  drugInteractions?: string[];
  ayurvedicReferences?: AIContentReference[] | string[];

  // =========================================================================
  // V8 Product Master Extension: Taxation, Web Price Research & Pack Sizes (8)
  // =========================================================================
  lowestWebPrice?: number | null;
  highestWebPrice?: number | null;
  webPriceCurrency?: string;
  webPriceSources?: WebPriceSourceOffer[];
  webPriceCheckedAt?: string | null;
  availablePackingSizes?: string[];
  gstReference?: string;
  gstVerifiedAt?: string | null;

  // =========================================================================
  // V9 Product Master Extension: SEO & Canonical Slug Fields (5)
  // =========================================================================
  seoTitle?: string;
  metaDescription?: string;
  seoKeywords?: string[];
  urlSlug?: string;
  seoUpdatedAt?: string | null;

  // =========================================================================
  // V10 Product Master Extension: AI Commerce & Discoverability Fields (22)
  // =========================================================================
  gtin?: string | null;
  mpn?: string | null;
  barcode?: string | null;
  googleProductCategory?: string | null;
  productType?: string | null;
  canonicalUrl?: string | null;
  currency?: string;
  condition?: 'new' | 'refurbished' | 'used';
  countryOfOrigin?: string | null;
  manufacturerName?: string | null;
  netWeight?: number | null;
  netWeightUnit?: string | null;
  netVolume?: number | null;
  netVolumeUnit?: string | null;
  shippingWeight?: number | null;
  shippingWeightUnit?: string | null;
  shippingDimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in';
  } | null;
  productFAQs?: Array<{ question: string; answer: string }>;
  productHighlights?: string[];
  searchTags?: string[];
  dietaryAttributes?: string[];
  allergenInformation?: string[];
  certifications?: Array<{
    name: string;
    authority?: string;
    certificateNumber?: string;
    validUntil?: string;
  }>;
  fssaiLicenseNumber?: string | null;
  aiContentMetadata?: Record<string, AIContentProvenanceEntry>;
  aiCommerceEnabled?: boolean;
  aiCommerceUpdatedAt?: string | null;
  revision?: number;
}

export interface CustomerPerformance {
  id: string;
  customerId?: string;
  name: string;
  company: string;
  email: string;
  mobileNumber: string;
  phone?: string;
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
  isFromLead?: boolean;
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
  leadsGenerated?: number;
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
  leadId?: string;
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
  referralId?: string;
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
  unit?: string;
  packingSize?: string;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  orderId?: string;
  customerId: string;
  customerName: string;
  customerCompany: string;
  products: SalesProduct[];
  totalValue: number;
  paymentStatus: 'Paid' | 'Pending' | 'Overdue' | 'Refunded';
  deliveryStatus: 'Pending' | 'Shipped' | 'Delivered' | 'Cancelled';
  salesPlatform?: string;
  assignedTo: string;
  createdAt: string;
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Stripe' | 'UPI' | 'Credit Card';
  invoiceId?: string;
  invoiceDate?: string;
  pickupDate?: string;
  courierAgency?: string;
  courierCharges?: number;
  contactNo?: string;
  customerMobile?: string;
  deliveryFee?: number;
  referralCode?: string;
  orderType?: 'Online' | 'Shop';
  salesChannel?: 'Amazon' | 'Flipkart' | 'Vamjo' | 'Meesho' | 'Shop' | 'Website' | 'Distributor' | 'Other Marketplace' | string;
  brandAssignments?: any[];
  lastUpdated?: string;
  [key: string]: any;
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
  contactPerson?: string;     // Brand Owner Contact Name
  contactName?: string;       // Brand Owner Contact Name
  contactMobile?: string;     // Brand Owner Contact Mobile
  contactPhone?: string;      // Brand Owner Contact Mobile (Alias)
  whatsappNo?: string;        // Brand Owner Whatsappno
  contactEmail?: string;      // Brand Owner email
  email?: string;             // Brand Owner email (Alias)
  address?: string;           // Brand Owner Address
  gstNo?: string;             // Brand Owner Gstno
  fssaiRegNo?: string;        // Brand Owner fssairegno
  otherRegDetails?: string;   // Brand Owner otherRegdetails
  gpsTracking?: string;       // Brand Owner gpstracking
  description?: string;
  imageUrl?: string;
  storagePath?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UnitMaster {
  id: string;
  desc: string;
  uqc: string;
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
  customerId?: string;
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

// ============================================================================
// LeafyEarth | AI Product Content Module – V8 Types
// ============================================================================

export type AIProductDraftStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'FAILED';

export type AIProductImageStatus = 'GENERATED' | 'APPROVED' | 'REJECTED' | 'FAILED';

export type AIProductResearchStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'FAILED';

export type AIEvidenceLevel =
  | 'traditional_use'
  | 'nutritional'
  | 'preliminary_study'
  | 'human_study'
  | 'insufficient_evidence';

export type AIReviewStatus = 'pending_review' | 'approved' | 'rejected';

export type AIAyurvedaApplicability = 'applicable' | 'not_applicable' | 'uncertain';

export interface AIContentReference {
  id: string;
  source_type: string;
  title: string;
  author_or_body: string;
  section_or_citation: string;
  url: string | null;
  verification_note: string;
}

export interface AIHealthBenefit {
  claim: string;
  evidence_level: AIEvidenceLevel;
  reference_ids: string[];
  review_status: AIReviewStatus;
}

export interface AIAyurvedaDoshaEffects {
  vata: string;
  pitta: string;
  kapha: string;
}

export interface AIAyurvedaContent {
  sanskrit_name: string;
  classification: string;
  classical_description: string;
  rasa: string[];
  guna: string[];
  virya: string;
  vipaka: string;
  prabhava: string;
  dosha_effects: AIAyurvedaDoshaEffects;
  parts_used: string[];
  medicinal_uses: string[];
  classical_formulations: string[];
  usage_methods: string[];
  anupana: string[];
  typical_dosage_note: string;
  precautions: string[];
  contraindications: string[];
  interactions: string[];
  references: AIContentReference[];
}

export interface AIProductTranslations {
  en: { name: string };
  ml: { name: string };
  hi: { name: string };
  ta: { name: string };
  kn: { name: string };
  te: { name: string };
}

export interface AIProductSEOPayload {
  seoTitle: string;
  metaDescription: string;
  seoKeywords: string[];
  urlSlug: string;
}

export interface AICommerceFAQItem {
  question: string;
  answer: string;
}

export interface AICommerceFactualSuggestions {
  netWeight?: number | null;
  netWeightUnit?: 'g' | 'kg' | 'mg' | string | null;
  netVolume?: number | null;
  netVolumeUnit?: 'ml' | 'l' | string | null;
  countryOfOrigin?: string | null;
  condition?: 'new' | 'refurbished' | 'used';
}

export interface AICommerceContentPayload {
  productHighlights: string[];
  productFAQs: AICommerceFAQItem[];
  searchTags: string[];
  dietaryAttributes: string[];
  googleProductCategory: string | null;
  productType: string | null;
  factualAttributeSuggestions?: AICommerceFactualSuggestions | null;
}

export interface AIContentProvenanceEntry {
  source: 'ai' | 'manual';
  draftId?: string | null;
  versionId?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface ProductSlugReservation {
  slug: string;
  productId: string;
  state: 'active' | 'redirect';
  canonicalSlug?: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface AIProductContentPayload {
  english_product_name: string;
  botanical_name: string;
  family: string;
  category: string;
  form: string;
  title: string;
  description: string;
  key_features: string[];
  culinary_uses: string[];
  storage_instructions: string;
  translations: AIProductTranslations;
  health_benefits: AIHealthBenefit[];
  nutritional_benefits: string[];
  safety_precautions: string[];
  ayurveda_applicability: AIAyurvedaApplicability;
  ayurveda: AIAyurvedaContent | null;
  references: AIContentReference[];
  review_flags: string[];
  // V9 SEO extension (nullable for backward compatibility with V8 drafts)
  seo?: AIProductSEOPayload | null;
  // V10 AI Commerce extension (nullable for backward compatibility)
  commerce?: AICommerceContentPayload | null;
}

export interface AIUsageMetadata {
  provider: string;
  project_name: string;
  model: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  live_api_used: boolean;
}

export interface AIProductVersion {
  id: string;
  draft_id: string;
  version_no: number;
  generated_payload: AIProductContentPayload;
  edited_payload: AIProductContentPayload;
  model: string;
  prompt_version: string;
  usage_metadata: AIUsageMetadata;
  generated_at: string;
  edited_by?: string | null;
  edited_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  seo_status?: 'DRAFT' | 'APPROVED' | 'REJECTED';
  seo_approved_by?: string | null;
  seo_approved_at?: string | null;
  commerce_status?: 'DRAFT' | 'APPROVED' | 'REJECTED';
  commerce_approved_by?: string | null;
  commerce_approved_at?: string | null;
}

export interface AIProductImage {
  id: string;
  draft_id: string;
  version_id: string;
  storage_key: string;
  preview_url: string;
  mime_type: string;
  width: number;
  height: number;
  background_hex: string;
  checksum: string;
  prompt: string;
  model: string;
  generation_metadata: {
    provider: string;
    project_name: string;
    product_form: string;
    packaging_style: string;
    estimated_cost_usd: number;
    latency_ms: number;
    live_api_used: boolean;
    source_type: 'ai_generated' | 'manual_upload';
  };
  status: AIProductImageStatus;
  rejection_reason?: string | null;
  created_by: string;
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface WebPriceSourceOffer {
  siteName: string;
  productTitle: string;
  packSize: string;
  price: number;
  mrp: number | null;
  currency: string;
  inStock: boolean;
  sourceUrl: string;
  checkedAt: string;
  included: boolean;
  matchConfidence: 'high' | 'medium' | 'low';
}

export interface AIProductTaxationResearch {
  hsnCode: string;
  gstRatePercent: number;
  gstReference: string;
  confidence: 'high' | 'medium' | 'low';
  needsManualVerification: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export interface AIProductPackingResearch {
  selectedPackingSize: string;
  unit: string;
  availablePackingSizes: string[];
}

export interface AIProductMarketResearch {
  comparedPackingSize: string;
  currency: string;
  lowestPrice: number | null;
  highestPrice: number | null;
  checkedAt: string;
  searchStatus: 'verified_offers' | 'manual_entry' | 'insufficient_verified_web_price_data';
  offers: WebPriceSourceOffer[];
}

export interface AIProductResearchRecord {
  id: string;
  draft_id: string;
  version_id: string;
  taxation: AIProductTaxationResearch;
  packing: AIProductPackingResearch;
  marketResearch: AIProductMarketResearch;
  status: AIProductResearchStatus;
  rejection_reason?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface AIProductDraft {
  id: string;
  source_product_name: string;
  master_product_id: string | null;
  master_product_name?: string | null;
  master_product_sku?: string | null;
  category_hint?: string | null;
  brand_hint?: string | null;
  status: AIProductDraftStatus;
  current_version_id: string;
  approved_version_id: string | null;
  approved_image_id: string | null;
  approved_research_id: string | null;
  approved_seo_version_id?: string | null;
  approved_commerce_draft_id?: string | null;
  rejection_reason?: string | null;
  last_synced_at?: string | null;
  created_by: string;
  created_by_email?: string;
  created_at: string;
  updated_at: string;
}

export interface AIProductSyncLog {
  id: string;
  draft_id: string;
  version_id: string;
  master_product_id: string;
  idempotency_key: string;
  selected_fields: string[];
  image_action?: 'none' | 'replace_primary' | 'append_gallery';
  approved_image_id?: string | null;
  approved_research_id?: string | null;
  approved_commerce_draft_id?: string | null;
  expected_master_revision?: number | null;
  resulting_master_revision?: number | null;
  slug_action?: {
    previousSlug: string | null;
    newSlug: string | null;
    redirectCreated: boolean;
  } | null;
  before_snapshot: Record<string, any>;
  after_snapshot: Record<string, any>;
  result: 'SUCCESS' | 'FAILED';
  error_message?: string | null;
  applied_by: string;
  applied_by_email?: string;
  applied_at: string;
}

export interface AIProductEvent {
  id: string;
  draft_id: string;
  event_type:
    | 'DRAFT_GENERATED'
    | 'DRAFT_EDITED'
    | 'DRAFT_REGENERATED'
    | 'SUBMITTED_FOR_REVIEW'
    | 'CONTENT_APPROVED'
    | 'CONTENT_REJECTED'
    | 'SEO_GENERATED'
    | 'SEO_EDITED'
    | 'SEO_APPROVED'
    | 'SEO_REJECTED'
    | 'SEO_APPLIED'
    | 'COMMERCE_GENERATED'
    | 'COMMERCE_EDITED'
    | 'COMMERCE_APPROVED'
    | 'COMMERCE_REJECTED'
    | 'COMMERCE_APPLIED'
    | 'IMAGE_GENERATED'
    | 'IMAGE_UPLOADED'
    | 'IMAGE_APPROVED'
    | 'IMAGE_REJECTED'
    | 'RESEARCH_GENERATED'
    | 'RESEARCH_UPDATED'
    | 'RESEARCH_APPROVED'
    | 'RESEARCH_REJECTED'
    | 'MASTER_SYNC_APPLIED'
    | 'MASTER_SYNC_FAILED';
  actor_id: string;
  actor_email?: string;
  actor_role?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export type AIProductSubmenuId =
  | 'generate'
  | 'drafts'
  | 'review'
  | 'images'
  | 'sync'
  | 'history'
  | 'usage'
  | 'config'
  | 'research'
  | 'commerce';

// ============================================================================
// LeafyEarth | V10 AI Commerce & Product Discoverability Types
// ============================================================================

export type AICommercePlatformId =
  | 'google_merchant'
  | 'public_web'
  | 'bing_copilot'
  | 'openai_chatgpt'
  | 'perplexity';

export type AICommerceLocalReadiness = 'ready' | 'warning' | 'blocked' | 'disabled';

export type AICommerceRemoteStatus =
  | 'not_submitted'
  | 'queued'
  | 'submitted'
  | 'approved'
  | 'disapproved'
  | 'ineligible_market'
  | 'platform_disabled';

export interface AICommercePlatformSettings {
  id: AICommercePlatformId;
  platform: AICommercePlatformId;
  displayName: string;
  priority: 'P0' | 'P1' | 'P2';
  enabled: boolean;
  market: string; // 'IN'
  currency: string; // 'INR'
  marketEligible: boolean;
  eligibilityNote: string;
  verifiedDomain: string;
  schemaVersion: string;
  credentialRef: string | null;
  syncPolicy: {
    mode: 'event_driven_and_scheduled' | 'manual_only';
    reconcileIntervalMinutes: number;
    dailyFullRebuild: boolean;
    dryRunOnly: boolean;
  };
  shippingPolicy: {
    country: string;
    service: string;
    flatRateInr: number;
    freeShippingThresholdInr: number;
    handlingDaysMin: number;
    handlingDaysMax: number;
    transitDaysMin: number;
    transitDaysMax: number;
  };
  returnPolicy: {
    country: string;
    returnPolicyCategory: 'finite_return_window' | 'no_returns';
    returnWindowDays: number;
    returnMethod: 'by_mail';
    returnFees: 'free' | 'customer_responsibility';
    policyUrl: string;
  };
  updatedAt: string;
  updatedBy?: string | null;
}

export interface AICommerceStagingDraft {
  id: string;
  productId: string | null;
  aiDraftId?: string | null;
  sourceProductName: string;
  version: number;
  content: AICommerceContentPayload;
  seo?: AIProductSEOPayload | null;
  evidence: {
    gtinVerified: boolean;
    fssaiVerified: boolean;
    originVerified: boolean;
    allergenVerified: boolean;
    notes?: string;
  };
  provenance: {
    model: string;
    promptVersion: string;
    generatedAt: string;
    liveApiUsed: boolean;
  };
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'APPLIED';
  errors: string[];
  actorId: string;
  actorEmail?: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface AICommerceFeedRun {
  id: string;
  platform: AICommercePlatformId;
  market: string;
  format: 'xml' | 'jsonl' | 'json';
  objectPath: string;
  checksum: string;
  count: number;
  withdrawnCount: number;
  schemaVersion: string;
  status: 'COMPLETED' | 'FAILED' | 'DRY_RUN';
  isActiveManifest: boolean;
  previousManifestRunId?: string | null;
  errorMessage?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AICommerceSyncJob {
  id: string;
  productId: string;
  revision: number;
  platform: AICommercePlatformId;
  action: 'UPSERT_PROJECTION' | 'WITHDRAW_PROJECTION' | 'SYNC_FEED';
  state: 'PENDING' | 'LEASED' | 'COMPLETED' | 'RETRY_SCHEDULED' | 'DEAD_LETTER';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseUntil: string | null;
  idempotencyKey: string;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AICommerceSyncLog {
  id: string;
  jobId: string;
  productId: string;
  platform: AICommercePlatformId;
  action: string;
  sanitizedResult: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  errorCode?: string | null;
  timestamp: string;
}

export interface AICommerceValidationIssue {
  code: string;
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  remediation?: string;
}

export interface AICommerceValidationReport {
  id: string;
  productId: string;
  offerId: string;
  platform: AICommercePlatformId;
  revision: number;
  localReadiness: AICommerceLocalReadiness;
  issues: AICommerceValidationIssue[];
  severity: 'error' | 'warning' | 'ok';
  checkedAt: string;
}

export interface AICommercePlatformStatus {
  id: string;
  productId: string;
  offerId: string;
  platform: AICommercePlatformId;
  localReadiness: AICommerceLocalReadiness;
  remoteStatus: AICommerceRemoteStatus;
  remoteId: string | null;
  checkedAt: string;
  issues: AICommerceValidationIssue[];
}

export interface AICommerceAnalyticsRecord {
  id: string;
  periodId: string; // e.g. '2026-11'
  platform: AICommercePlatformId;
  feedBuildsCount: number;
  publishedOffersCount: number;
  readyOffersCount: number;
  blockedOffersCount: number;
  publicPageViews: number;
  feedFetchesCount: number;
  updatedAt: string;
}

/**
 * Allowlisted approved public projection stored in `public_products/{offerId}`.
 * Strictly excludes internal stock counts, cost data, competitor web prices,
 * AI prompts, and private `aiContentMetadata`.
 */
export interface PublicProductOfferProjection {
  id: string;
  offerId: string;
  productId: string;
  itemGroupId: string;
  sku: string;
  title: string;
  name: string;
  description: string;
  urlSlug: string;
  canonicalUrl: string;
  imageUrl: string;
  additionalImageUrls: string[];
  brand: string;
  category: string;
  googleProductCategory: string;
  productType: string;
  price: number;
  salePrice: number | null;
  mrp: number | null;
  currency: 'INR';
  availability: 'in_stock' | 'out_of_stock' | 'preorder';
  condition: 'new' | 'refurbished' | 'used';
  packingSize: string;
  unit: string;
  gtin: string | null;
  mpn: string | null;
  identifierExists: boolean;
  countryOfOrigin: string;
  manufacturerName: string | null;
  fssaiLicenseNumber: string | null;
  netWeight: number | null;
  netWeightUnit: string | null;
  netVolume: number | null;
  netVolumeUnit: string | null;
  productHighlights: string[];
  productFAQs: AICommerceFAQItem[];
  searchTags: string[];
  dietaryAttributes: string[];
  allergenInformation: string[];
  seoTitle: string;
  metaDescription: string;
  seoKeywords: string[];
  isAyurvedicProduct: boolean;
  botanicalName: string | null;
  sanskritName: string | null;
  rating: number | null;
  reviewsCount: number;
  aiGeneratedContentDisclosure: boolean;
  revision: number;
  updatedAt: string;
}







