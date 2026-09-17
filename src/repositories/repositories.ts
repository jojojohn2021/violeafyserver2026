import { BaseRepository } from './baseRepository';
import { uploadFileToStorage, uploadCategoryImage, uploadBrandImage, uploadBrandOwnerImage } from '../utils/storageUpload';
import { 
  User, 
  ProductPerformance, 
  SalesOrder, 
  CustomerPerformance, 
  Task, 
  CalendarEvent, 
  MarketingCampaign, 
  Referral, 
  WhatsAppMessage,
  WhatsAppSequenceStep,
  WhatsAppTemplate,
  Influencer,
  InfluencerCampaign,
  InfluencerCollaboration,
  InfluencerDispatch,
  InfluencerPayment,
  InfluencerContent,
  BrandConfig,
  RolePermissions,
  SystemAuditLog,
  PaymentGatewaySetting,
  DeliveryCharge,
  CustomerDeliveryAddress,
  PartnerLevel,
  CommissionRule,
  CommissionTransaction,
  FormatInvoice,
  Category,
  Brand,
  BrandOwner,
  UnitMaster
} from '../types';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }
}

export class ProductRepository extends BaseRepository<ProductPerformance> {
  constructor() {
    super('products');
  }
}

export class ShoppingRepository extends ProductRepository {
  async uploadProduct(product: Omit<ProductPerformance, 'id'>, file?: File): Promise<ProductPerformance> {
    const productId = `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const uploaded = file
      ? await uploadFileToStorage(file, `products/${productId}/main.jpg`)
      : undefined;
    const data = {
      ...product,
      ...(uploaded ? { imageUrl: uploaded.downloadUrl, storagePath: uploaded.storagePath } : {}),
    };
    await this.create({ ...data, id: productId });
    return { ...data, id: productId };
  }
}

export class OrderRepository extends BaseRepository<SalesOrder> {
  constructor() {
    super('sales_orders');
  }
}

export class CustomerRepository extends BaseRepository<CustomerPerformance> {
  constructor() {
    super('customers');
  }
}

export class CustomerDeliveryAddressRepository extends BaseRepository<CustomerDeliveryAddress> {
  constructor() {
    super('customer_delivery_addresses');
  }
}

export class TaskRepository extends BaseRepository<Task> {
  constructor() {
    super('tasks');
  }
}

export class EventRepository extends BaseRepository<CalendarEvent> {
  constructor() {
    super('calendar_events');
  }
}

export class CampaignRepository extends BaseRepository<MarketingCampaign> {
  constructor() {
    super('campaigns');
  }
}

export class ReferralRepository extends BaseRepository<Referral> {
  constructor() {
    super('referrals');
  }
}

export class WhatsAppMessageRepository extends BaseRepository<WhatsAppMessage> {
  constructor() {
    super('whatsapp_messages');
  }
}

export class WhatsAppSequenceRepository extends BaseRepository<WhatsAppSequenceStep> {
  constructor() {
    super('whatsapp_sequences');
  }
}

export class WhatsAppTemplateRepository extends BaseRepository<WhatsAppTemplate> {
  constructor() {
    super('whatsapp_templates');
  }
}

export class SystemAuditLogRepository extends BaseRepository<SystemAuditLog> {
  constructor() {
    super('audit_logs');
  }
}

export class InfluencerRepository extends BaseRepository<Influencer> {
  constructor() {
    super('influencers');
  }
}

export class InfluencerCampaignRepository extends BaseRepository<InfluencerCampaign> {
  constructor() {
    super('influencer_campaigns');
  }
}

export class InfluencerCollaborationRepository extends BaseRepository<InfluencerCollaboration> {
  constructor() {
    super('influencer_collaborations');
  }
}

export class InfluencerDispatchRepository extends BaseRepository<InfluencerDispatch> {
  constructor() {
    super('influencer_dispatches');
  }
}

export class InfluencerPaymentRepository extends BaseRepository<InfluencerPayment> {
  constructor() {
    super('influencer_payments');
  }
}

export class InfluencerContentRepository extends BaseRepository<InfluencerContent> {
  constructor() {
    super('influencer_contents');
  }
}

export class BrandConfigRepository extends BaseRepository<BrandConfig & { id?: string }> {
  constructor() {
    super('settings');
  }
}

export class RolePermissionsRepository extends BaseRepository<{ id: string; permissions: RolePermissions }> {
  constructor() {
    super('permissions');
  }
}

export class PaymentGatewaySettingRepository extends BaseRepository<PaymentGatewaySetting> {
  constructor() {
    super('payment_gateway_settings');
  }
}

export class DeliveryChargeRepository extends BaseRepository<DeliveryCharge> {
  constructor() {
    super('delivery_charges');
  }
}

export class PartnerLevelRepository extends BaseRepository<PartnerLevel> {
  constructor() {
    super('performance_levels');
  }
}

export class CommissionRuleRepository extends BaseRepository<CommissionRule> {
  constructor() {
    super('commission_rules');
  }
}

export class CommissionTransactionRepository extends BaseRepository<CommissionTransaction> {
  constructor() {
    super('commission_transactions');
  }
}

export class CustomerIndexRepository extends BaseRepository<any> {
  constructor() {
    super('customer_indexes');
  }
}

export class ReferralLinkRepository extends BaseRepository<any> {
  constructor() {
    super('referral_links');
  }
}

export class FormatInvoiceRepository extends BaseRepository<FormatInvoice> {
  constructor() {
    super('formatinvoice');
  }

  async setDefault(id: string): Promise<void> {
    if (!id) throw new Error('Invalid format invoice ID provided.');
    const records = await this.getAll();
    if (!records.some(record => record.id === id)) {
      throw new Error(`Format invoice '${id}' was not found.`);
    }
    await Promise.all(records.map(record => this.update(record.id, {
      defaultSelection: record.id === id
    })));
  }
}

export class CategoryRepository extends BaseRepository<Category> {
  constructor() {
    super('product_categories');
  }

  async uploadCategoryImage(name: string, file: File, existingId?: string): Promise<Category> {
    const id = existingId || `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const uploaded = await uploadCategoryImage(file, id);
    const data: Category = {
      id,
      name,
      imageUrl: uploaded.downloadUrl,
      storagePath: uploaded.storagePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existingId) {
      await this.update(id, data);
    } else {
      await this.create(data);
    }
    return data;
  }
}

export class BrandRepository extends BaseRepository<Brand> {
  constructor() {
    super('product_brands');
  }

  async uploadBrandImage(name: string, owner: string, file: File, existingId?: string): Promise<Brand> {
    const id = existingId || `brand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const uploaded = await uploadBrandImage(file, id);
    const data: Brand = {
      id,
      name,
      owner,
      imageUrl: uploaded.downloadUrl,
      storagePath: uploaded.storagePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existingId) {
      await this.update(id, data);
    } else {
      await this.create(data);
    }
    return data;
  }
}

export class BrandOwnerRepository extends BaseRepository<BrandOwner> {
  constructor() {
    super('product_brand_owners');
  }

  async uploadBrandOwnerImage(name: string, file: File, existingId?: string): Promise<BrandOwner> {
    const id = existingId || `owner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const uploaded = await uploadBrandOwnerImage(file, id);
    const data: BrandOwner = {
      id,
      name,
      imageUrl: uploaded.downloadUrl,
      storagePath: uploaded.storagePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existingId) {
      await this.update(id, data);
    } else {
      await this.create(data);
    }
    return data;
  }
}

export class UnitMasterRepository extends BaseRepository<UnitMaster> {
  constructor() {
    super('product_units');
  }
}

export class InvoiceRepository extends BaseRepository<any> {
  constructor() {
    super('invoices');
  }
}

export const userRepository = new UserRepository();
export const productRepository = new ProductRepository();
export const shoppingRepository = new ShoppingRepository();
export const orderRepository = new OrderRepository();
export const customerRepository = new CustomerRepository();
export const customerDeliveryAddressRepository = new CustomerDeliveryAddressRepository();
export const taskRepository = new TaskRepository();
export const eventRepository = new EventRepository();
export const campaignRepository = new CampaignRepository();
export const referralRepository = new ReferralRepository();
export const whatsAppMessageRepository = new WhatsAppMessageRepository();
export const whatsAppSequenceRepository = new WhatsAppSequenceRepository();
export const whatsAppTemplateRepository = new WhatsAppTemplateRepository();
export const auditLogRepository = new SystemAuditLogRepository();
export const influencerRepository = new InfluencerRepository();
export const influencerCampaignRepository = new InfluencerCampaignRepository();
export const influencerCollaborationRepository = new InfluencerCollaborationRepository();
export const influencerDispatchRepository = new InfluencerDispatchRepository();
export const influencerPaymentRepository = new InfluencerPaymentRepository();
export const influencerContentRepository = new InfluencerContentRepository();
export const brandConfigRepository = new BrandConfigRepository();
export const rolePermissionsRepository = new RolePermissionsRepository();
export const paymentGatewaySettingRepository = new PaymentGatewaySettingRepository();
export const deliveryChargeRepository = new DeliveryChargeRepository();
export const partnerLevelRepository = new PartnerLevelRepository();
export const commissionRuleRepository = new CommissionRuleRepository();
export const commissionTransactionRepository = new CommissionTransactionRepository();
export const customerIndexRepository = new CustomerIndexRepository();
export const referralLinkRepository = new ReferralLinkRepository();
export const formatInvoiceRepository = new FormatInvoiceRepository();
export const categoryRepository = new CategoryRepository();
export const brandRepository = new BrandRepository();
export const brandOwnerRepository = new BrandOwnerRepository();
export const unitMasterRepository = new UnitMasterRepository();
export const invoiceRepository = new InvoiceRepository();



