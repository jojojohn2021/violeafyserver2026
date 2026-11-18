import { Permission, RolePermissions, UserRole } from '../types';

export interface SecurityModuleCatalogEntry {
  menuOrder: number;
  menuId: string;
  module: string;
  label: string;
  sidebarName: string;
  componentName: string;
  category: string;
  aliases: string[];
  submenus?: string[];
  parentFallback?: string;
}

/**
 * Authoritative catalog of all 21 Main Menu screens/components in exact left-navigation order.
 */
export const SECURITY_MODULES_CATALOG: SecurityModuleCatalogEntry[] = [
  {
    menuOrder: 1,
    menuId: 'dashboard',
    module: 'Dashboard',
    label: 'KPI Intelligence',
    sidebarName: 'KPI Intelligence',
    componentName: 'DashboardView.tsx',
    category: 'Core & Platform',
    aliases: ['dashboard', 'kpi intelligence'],
  },
  {
    menuOrder: 2,
    menuId: 'shopping',
    module: 'Shopping Platform',
    label: 'Shopping Platform',
    sidebarName: 'Shopping Platform',
    componentName: 'ShoppingPlatformView.tsx',
    category: 'Core & Platform',
    aliases: ['shopping platform', 'shopping'],
    parentFallback: 'Dashboard',
  },
  {
    menuOrder: 3,
    menuId: 'settings',
    module: 'Settings',
    label: 'Settings',
    sidebarName: 'Settings',
    componentName: 'SettingsView.tsx',
    category: 'Core & Platform',
    aliases: ['settings'],
    parentFallback: 'Dashboard',
  },
  {
    menuOrder: 4,
    menuId: 'referrals',
    module: 'Referral Hub',
    label: 'Referral Hub (Dashboard)',
    sidebarName: 'Dashboard (Referral Hub)',
    componentName: 'ReferralPartnerHubView.tsx',
    category: 'Referrals & Commissions',
    aliases: ['referral hub', 'referrals', 'dashboard (referral hub)'],
  },
  {
    menuOrder: 5,
    menuId: 'sales_orders',
    module: 'Sales Orders',
    label: 'Invoices (Sales Orders)',
    sidebarName: 'Invoices',
    componentName: 'SalesOrdersView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['sales orders', 'invoices'],
  },
  {
    menuOrder: 6,
    menuId: 'preorders',
    module: 'Pre-Order Management',
    label: 'Pre-Order Management',
    sidebarName: 'Pre-Order Management',
    componentName: 'PreOrderManagementView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['pre-order management', 'preorder management', 'preorders'],
  },
  {
    menuOrder: 7,
    menuId: 'brand_owner_assignment',
    module: 'Brand Owner Assignment',
    label: 'Brand Owner Assignment',
    sidebarName: 'Brand Owner Assignment',
    componentName: 'BrandOwnerAssignmentView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['brand owner assignment'],
    parentFallback: 'Sales Orders',
  },
  {
    menuOrder: 8,
    menuId: 'complete_packing',
    module: 'Complete Packing',
    label: 'Complete Packing',
    sidebarName: 'COMPLETE PACKING',
    componentName: 'CompletePackingView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['complete packing'],
    parentFallback: 'Sales Orders',
  },
  {
    menuOrder: 9,
    menuId: 'create_shipment',
    module: 'Create Shipment',
    label: 'Create Shipment',
    sidebarName: 'CREATE SHIPMENT',
    componentName: 'CreateShipmentView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['create shipment'],
    parentFallback: 'Sales Orders',
  },
  {
    menuOrder: 10,
    menuId: 'confirm_delivery',
    module: 'Confirm Delivery',
    label: 'Confirm Delivery',
    sidebarName: 'CONFIRM DELIVERY',
    componentName: 'ConfirmDeliveryView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['confirm delivery'],
    parentFallback: 'Sales Orders',
  },
  {
    menuOrder: 11,
    menuId: 'process_return',
    module: 'Process Return',
    label: 'Process Return',
    sidebarName: 'Process Return',
    componentName: 'OrderOperationsView.tsx (returns)',
    category: 'Orders & Fulfillment',
    aliases: ['process return'],
    parentFallback: 'Sales Orders',
  },
  {
    menuOrder: 12,
    menuId: 'order_operations',
    module: 'All Operations Summary',
    label: 'All Operations Summary',
    sidebarName: 'All Operations Summary',
    componentName: 'OrderOperationsView.tsx (all)',
    category: 'Orders & Fulfillment',
    aliases: ['all operations summary', 'order operations'],
    parentFallback: 'Sales Orders',
  },
  {
    menuOrder: 13,
    menuId: 'customers',
    module: 'Customer Directory',
    label: 'Customer Directory',
    sidebarName: 'Customer Directory',
    componentName: 'CustomerManagementView.tsx',
    category: 'CRM & Scheduling',
    aliases: ['customer directory', 'customers'],
  },
  {
    menuOrder: 14,
    menuId: 'schedules',
    module: 'Tasks & Calendar',
    label: 'Task & Calendar Sync',
    sidebarName: 'Task & Calendar Sync',
    componentName: 'TasksCalendarView.tsx',
    category: 'CRM & Scheduling',
    aliases: ['tasks & calendar', 'task & calendar sync', 'schedules'],
  },
  {
    menuOrder: 15,
    menuId: 'performance',
    module: 'Products & Clients',
    label: 'Products Settings',
    sidebarName: 'Products Settings',
    componentName: 'PerformanceTrackingView.tsx',
    category: 'Catalog & Reviews',
    aliases: ['products & clients', 'products settings', 'performance'],
  },
  {
    menuOrder: 16,
    menuId: 'ai_product_content',
    module: 'AI Product Content',
    label: 'AI Product Content',
    sidebarName: 'AI Product Content',
    componentName: 'AIProductContentView.tsx',
    category: 'Catalog & Reviews',
    aliases: [
      'ai product content',
      'ai products',
      'ai_product_content',
      'ai commerce & discoverability',
    ],
    submenus: [
      'Generate Product Content',
      'AI Generated Content',
      'Review & Edit Content (V9 SEO)',
      'AI Product Images (1000×1000)',
      'Taxation & Market Research',
      'AI Commerce & Discoverability (V10)',
      'Update Product Master',
      'Generation History',
      'AI Usage & Cost',
      'AI Configuration',
    ],
  },
  {
    menuOrder: 17,
    menuId: 'banner_management',
    module: 'Banner Management',
    label: 'Banner Management',
    sidebarName: 'Banner Management',
    componentName: 'BannerManagementView.tsx',
    category: 'Catalog & Reviews',
    aliases: ['banner management', 'banners', 'home banners', 'banner_management'],
    submenus: [
      'All Banners',
      'Home Page',
      'Category Pages',
      'Product Pages',
      'Other Pages',
    ],
    parentFallback: 'Products & Clients',
  },
  {
    menuOrder: 18,
    menuId: 'product_reviews',
    module: 'Product Reviews',
    label: 'Product Reviews',
    sidebarName: 'Product Reviews',
    componentName: 'ProductReviewsManagementView.tsx',
    category: 'Catalog & Reviews',
    aliases: ['product reviews', 'customer reviews'],
    parentFallback: 'Products & Clients',
  },
  {
    menuOrder: 19,
    menuId: 'whatsapp',
    module: 'WhatsApp Integration',
    label: 'WhatsApp Automation',
    sidebarName: 'WhatsApp Automation',
    componentName: 'WhatsAppIntegrationView.tsx',
    category: 'Engagement & Marketing',
    aliases: ['whatsapp integration', 'whatsapp automation', 'whatsapp'],
  },
  {
    menuOrder: 20,
    menuId: 'influencer_marketing',
    module: 'Campaigns & ROI',
    label: 'Influencer Marketing',
    sidebarName: 'Influencer Marketing',
    componentName: 'InfluencerMarketingView.tsx',
    category: 'Engagement & Marketing',
    aliases: ['campaigns & roi', 'influencer marketing', 'marketing'],
  },
  {
    menuOrder: 21,
    menuId: 'security',
    module: 'Security Audit',
    label: 'Security & Access Grid',
    sidebarName: 'Security & Access Grid',
    componentName: 'SecurityControlView.tsx',
    category: 'Security & Administration',
    aliases: ['security audit', 'security & access grid', 'security'],
  },
  {
    menuOrder: 22,
    menuId: 'users',
    module: 'User Management',
    label: 'User Management',
    sidebarName: 'User Management',
    componentName: 'UserManagementView.tsx',
    category: 'Security & Administration',
    aliases: ['user management', 'users'],
    parentFallback: 'Security Audit',
  },
];

export const ALL_SECURITY_ROLES: UserRole[] = [
  'Admin',
  'Sales',
  'Marketing',
  'Support',
  'Referral Team',
];

export const FULL_DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  Admin: SECURITY_MODULES_CATALOG.map((m) => ({
    module: m.module,
    read: true,
    create: true,
    edit: true,
    delete: true,
  })),
  Sales: [
    { module: 'Dashboard', read: true, create: false, edit: false, delete: false },
    { module: 'Shopping Platform', read: true, create: true, edit: false, delete: false },
    { module: 'Settings', read: true, create: false, edit: false, delete: false },
    { module: 'Referral Hub', read: true, create: true, edit: true, delete: false },
    { module: 'Sales Orders', read: true, create: true, edit: true, delete: false },
    { module: 'Pre-Order Management', read: true, create: true, edit: true, delete: false },
    { module: 'Brand Owner Assignment', read: true, create: true, edit: true, delete: false },
    { module: 'Complete Packing', read: true, create: true, edit: true, delete: false },
    { module: 'Create Shipment', read: true, create: true, edit: true, delete: false },
    { module: 'Confirm Delivery', read: true, create: true, edit: true, delete: false },
    { module: 'Process Return', read: true, create: true, edit: true, delete: false },
    { module: 'All Operations Summary', read: true, create: true, edit: true, delete: false },
    { module: 'Customer Directory', read: true, create: true, edit: true, delete: false },
    { module: 'Tasks & Calendar', read: true, create: true, edit: true, delete: true },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
    { module: 'AI Product Content', read: true, create: true, edit: true, delete: false },
    { module: 'Banner Management', read: true, create: false, edit: false, delete: false },
    { module: 'Product Reviews', read: true, create: true, edit: true, delete: false },
    { module: 'WhatsApp Integration', read: true, create: true, edit: false, delete: false },
    { module: 'Campaigns & ROI', read: true, create: false, edit: false, delete: false },
    { module: 'Security Audit', read: false, create: false, edit: false, delete: false },
    { module: 'User Management', read: false, create: false, edit: false, delete: false },
  ],
  Marketing: [
    { module: 'Dashboard', read: false, create: false, edit: false, delete: false },
    { module: 'Shopping Platform', read: false, create: false, edit: false, delete: false },
    { module: 'Settings', read: false, create: false, edit: false, delete: false },
    { module: 'Referral Hub', read: false, create: false, edit: false, delete: false },
    { module: 'Sales Orders', read: false, create: false, edit: false, delete: false },
    { module: 'Pre-Order Management', read: false, create: false, edit: false, delete: false },
    { module: 'Brand Owner Assignment', read: false, create: false, edit: false, delete: false },
    { module: 'Complete Packing', read: false, create: false, edit: false, delete: false },
    { module: 'Create Shipment', read: false, create: false, edit: false, delete: false },
    { module: 'Confirm Delivery', read: false, create: false, edit: false, delete: false },
    { module: 'Process Return', read: false, create: false, edit: false, delete: false },
    { module: 'All Operations Summary', read: false, create: false, edit: false, delete: false },
    { module: 'Customer Directory', read: false, create: false, edit: false, delete: false },
    { module: 'Tasks & Calendar', read: false, create: false, edit: false, delete: false },
    { module: 'Products & Clients', read: false, create: false, edit: false, delete: false },
    { module: 'AI Product Content', read: true, create: true, edit: true, delete: false },
    { module: 'Banner Management', read: true, create: true, edit: true, delete: true },
    { module: 'Product Reviews', read: true, create: true, edit: true, delete: false },
    { module: 'WhatsApp Integration', read: false, create: false, edit: false, delete: false },
    { module: 'Campaigns & ROI', read: false, create: false, edit: false, delete: false },
    { module: 'Security Audit', read: false, create: false, edit: false, delete: false },
    { module: 'User Management', read: false, create: false, edit: false, delete: false },
  ],
  Support: [
    { module: 'Dashboard', read: true, create: false, edit: false, delete: false },
    { module: 'Shopping Platform', read: true, create: false, edit: false, delete: false },
    { module: 'Settings', read: true, create: false, edit: false, delete: false },
    { module: 'Referral Hub', read: true, create: false, edit: false, delete: false },
    { module: 'Sales Orders', read: true, create: true, edit: true, delete: false },
    { module: 'Pre-Order Management', read: true, create: true, edit: true, delete: false },
    { module: 'Brand Owner Assignment', read: true, create: true, edit: true, delete: false },
    { module: 'Complete Packing', read: true, create: true, edit: true, delete: false },
    { module: 'Create Shipment', read: true, create: true, edit: true, delete: false },
    { module: 'Confirm Delivery', read: true, create: true, edit: true, delete: false },
    { module: 'Process Return', read: true, create: true, edit: true, delete: false },
    { module: 'All Operations Summary', read: true, create: true, edit: true, delete: false },
    { module: 'Customer Directory', read: true, create: false, edit: true, delete: false },
    { module: 'Tasks & Calendar', read: true, create: true, edit: true, delete: true },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
    { module: 'AI Product Content', read: true, create: true, edit: true, delete: false },
    { module: 'Banner Management', read: true, create: false, edit: false, delete: false },
    { module: 'Product Reviews', read: true, create: true, edit: true, delete: false },
    { module: 'WhatsApp Integration', read: true, create: true, edit: true, delete: false },
    { module: 'Campaigns & ROI', read: false, create: false, edit: false, delete: false },
    { module: 'Security Audit', read: false, create: false, edit: false, delete: false },
    { module: 'User Management', read: false, create: false, edit: false, delete: false },
  ],
  'Referral Team': [
    { module: 'Dashboard', read: true, create: false, edit: false, delete: false },
    { module: 'Shopping Platform', read: true, create: true, edit: false, delete: false },
    { module: 'Settings', read: false, create: false, edit: false, delete: false },
    { module: 'Referral Hub', read: true, create: true, edit: true, delete: false },
    { module: 'Sales Orders', read: true, create: true, edit: true, delete: false },
    { module: 'Pre-Order Management', read: false, create: false, edit: false, delete: false },
    { module: 'Brand Owner Assignment', read: false, create: false, edit: false, delete: false },
    { module: 'Complete Packing', read: false, create: false, edit: false, delete: false },
    { module: 'Create Shipment', read: false, create: false, edit: false, delete: false },
    { module: 'Confirm Delivery', read: false, create: false, edit: false, delete: false },
    { module: 'Process Return', read: false, create: false, edit: false, delete: false },
    { module: 'All Operations Summary', read: false, create: false, edit: false, delete: false },
    { module: 'Customer Directory', read: true, create: false, edit: false, delete: false },
    { module: 'Tasks & Calendar', read: false, create: false, edit: false, delete: false },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
    { module: 'AI Product Content', read: false, create: false, edit: false, delete: false },
    { module: 'Banner Management', read: false, create: false, edit: false, delete: false },
    { module: 'Product Reviews', read: true, create: false, edit: false, delete: false },
    { module: 'WhatsApp Integration', read: false, create: false, edit: false, delete: false },
    { module: 'Campaigns & ROI', read: false, create: false, edit: false, delete: false },
    { module: 'Security Audit', read: false, create: false, edit: false, delete: false },
    { module: 'User Management', read: false, create: false, edit: false, delete: false },
  ],
};

/**
 * Resolves any module or component name/alias to its canonical catalog entry.
 */
export function resolveSecurityModuleEntry(
  moduleName: string
): SecurityModuleCatalogEntry | undefined {
  const normalized = String(moduleName || '').trim().toLowerCase();
  if (!normalized) return undefined;
  return SECURITY_MODULES_CATALOG.find(
    (entry) =>
      entry.module.toLowerCase() === normalized ||
      entry.label.toLowerCase() === normalized ||
      entry.componentName.toLowerCase() === normalized ||
      entry.aliases.includes(normalized)
  );
}

/**
 * Finds or synthesizes the effective Permission rule for a `(role, moduleName)` pair.
 */
export function getEffectivePermissionRule(
  permissions: RolePermissions | undefined,
  role: UserRole,
  moduleName: string
): Permission {
  if (role === 'Admin') {
    return { module: moduleName, read: true, create: true, edit: true, delete: true };
  }

  const catalogEntry = resolveSecurityModuleEntry(moduleName);
  const canonicalModule = catalogEntry ? catalogEntry.module : moduleName;
  const rolePerms = permissions?.[role] || [];

  const directMatch = rolePerms.find(
    (p) => p.module.toLowerCase() === canonicalModule.toLowerCase()
  );
  if (directMatch) return directMatch;

  if (catalogEntry?.parentFallback) {
    const parentMatch = rolePerms.find(
      (p) => p.module.toLowerCase() === catalogEntry.parentFallback!.toLowerCase()
    );
    if (parentMatch) {
      return { ...parentMatch, module: canonicalModule };
    }
  }

  const defaultList = FULL_DEFAULT_ROLE_PERMISSIONS[role] || [];
  const defaultMatch = defaultList.find(
    (p) => p.module.toLowerCase() === canonicalModule.toLowerCase()
  );
  if (defaultMatch) return defaultMatch;

  return { module: canonicalModule, read: true, create: false, edit: false, delete: false };
}

/**
 * Merges persisted Firestore permission documents with `FULL_DEFAULT_ROLE_PERMISSIONS`
 * so every role always contains all 19 component rules.
 */
export function mergeRolePermissionsFromDocs(docs: any[]): RolePermissions {
  const merged: RolePermissions = {
    Admin: [...FULL_DEFAULT_ROLE_PERMISSIONS.Admin],
    Sales: [...FULL_DEFAULT_ROLE_PERMISSIONS.Sales],
    Marketing: [...FULL_DEFAULT_ROLE_PERMISSIONS.Marketing],
    Support: [...FULL_DEFAULT_ROLE_PERMISSIONS.Support],
    'Referral Team': [...FULL_DEFAULT_ROLE_PERMISSIONS['Referral Team']],
  };

  for (const docItem of docs || []) {
    const nestedPerms = docItem?.permissions;
    if (nestedPerms && typeof nestedPerms === 'object') {
      const targetRoles: UserRole[] = ALL_SECURITY_ROLES.includes(docItem?.id as UserRole)
        ? [docItem.id as UserRole]
        : ALL_SECURITY_ROLES;
      for (const role of targetRoles) {
        if (role === 'Admin') continue;
        const incomingList = Array.isArray(nestedPerms[role]) ? nestedPerms[role] : null;
        if (!incomingList) continue;
        merged[role] = SECURITY_MODULES_CATALOG.map((entry) => {
          const exact = incomingList.find(
            (p: any) => String(p?.module || '').toLowerCase() === entry.module.toLowerCase()
          );
          if (exact) {
            return {
              module: entry.module,
              read: Boolean(exact.read),
              create: Boolean(exact.create),
              edit: Boolean(exact.edit),
              delete: Boolean(exact.delete),
            };
          }
          if (entry.parentFallback) {
            const parent = incomingList.find(
              (p: any) =>
                String(p?.module || '').toLowerCase() === entry.parentFallback!.toLowerCase()
            );
            if (parent) {
              return {
                module: entry.module,
                read: Boolean(parent.read),
                create: Boolean(parent.create),
                edit: Boolean(parent.edit),
                delete: Boolean(parent.delete),
              };
            }
          }
          return getEffectivePermissionRule(FULL_DEFAULT_ROLE_PERMISSIONS, role, entry.module);
        });
      }
    }
  }

  return merged;
}
