import { Permission, RolePermissions, UserRole } from '../types';

export interface SecurityModuleCatalogEntry {
  module: string;
  label: string;
  componentName: string;
  category: string;
  aliases: string[];
  parentFallback?: string;
}

/**
 * Authoritative catalog of all 19 existing application screens/components in left-navigation order.
 */
export const SECURITY_MODULES_CATALOG: SecurityModuleCatalogEntry[] = [
  {
    module: 'Dashboard',
    label: 'KPI Intelligence',
    componentName: 'DashboardView.tsx',
    category: 'Core & Platform',
    aliases: ['dashboard', 'kpi intelligence'],
  },
  {
    module: 'Shopping Platform',
    label: 'Shopping Platform',
    componentName: 'ShoppingPlatformView.tsx',
    category: 'Core & Platform',
    aliases: ['shopping platform', 'shopping'],
    parentFallback: 'Dashboard',
  },
  {
    module: 'Settings',
    label: 'Settings',
    componentName: 'SettingsView.tsx',
    category: 'Core & Platform',
    aliases: ['settings'],
    parentFallback: 'Dashboard',
  },
  {
    module: 'Referral Hub',
    label: 'Referral Hub (Dashboard)',
    componentName: 'ReferralPartnerHubView.tsx',
    category: 'Referrals & Commissions',
    aliases: ['referral hub', 'referrals'],
  },
  {
    module: 'Sales Orders',
    label: 'Invoices (Sales Orders)',
    componentName: 'SalesOrdersView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['sales orders', 'invoices'],
  },
  {
    module: 'Brand Owner Assignment',
    label: 'Brand Owner Assignment',
    componentName: 'BrandOwnerAssignmentView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['brand owner assignment'],
    parentFallback: 'Sales Orders',
  },
  {
    module: 'Complete Packing',
    label: 'Complete Packing',
    componentName: 'CompletePackingView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['complete packing'],
    parentFallback: 'Sales Orders',
  },
  {
    module: 'Create Shipment',
    label: 'Create Shipment',
    componentName: 'CreateShipmentView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['create shipment'],
    parentFallback: 'Sales Orders',
  },
  {
    module: 'Confirm Delivery',
    label: 'Confirm Delivery',
    componentName: 'ConfirmDeliveryView.tsx',
    category: 'Orders & Fulfillment',
    aliases: ['confirm delivery'],
    parentFallback: 'Sales Orders',
  },
  {
    module: 'Process Return',
    label: 'Process Return',
    componentName: 'OrderOperationsView.tsx (returns)',
    category: 'Orders & Fulfillment',
    aliases: ['process return'],
    parentFallback: 'Sales Orders',
  },
  {
    module: 'All Operations Summary',
    label: 'All Operations Summary',
    componentName: 'OrderOperationsView.tsx (all)',
    category: 'Orders & Fulfillment',
    aliases: ['all operations summary', 'order operations'],
    parentFallback: 'Sales Orders',
  },
  {
    module: 'Customer Directory',
    label: 'Customer Directory',
    componentName: 'CustomerManagementView.tsx',
    category: 'CRM & Scheduling',
    aliases: ['customer directory', 'customers'],
  },
  {
    module: 'Tasks & Calendar',
    label: 'Task & Calendar Sync',
    componentName: 'TasksCalendarView.tsx',
    category: 'CRM & Scheduling',
    aliases: ['tasks & calendar', 'task & calendar sync', 'schedules'],
  },
  {
    module: 'Products & Clients',
    label: 'Products Settings',
    componentName: 'PerformanceTrackingView.tsx',
    category: 'Catalog & Reviews',
    aliases: ['products & clients', 'products settings', 'performance'],
  },
  {
    module: 'Product Reviews',
    label: 'Product Reviews',
    componentName: 'ProductReviewsManagementView.tsx',
    category: 'Catalog & Reviews',
    aliases: ['product reviews', 'customer reviews'],
    parentFallback: 'Products & Clients',
  },
  {
    module: 'WhatsApp Integration',
    label: 'WhatsApp Automation',
    componentName: 'WhatsAppIntegrationView.tsx',
    category: 'Engagement & Marketing',
    aliases: ['whatsapp integration', 'whatsapp automation', 'whatsapp'],
  },
  {
    module: 'Campaigns & ROI',
    label: 'Influencer Marketing',
    componentName: 'InfluencerMarketingView.tsx',
    category: 'Engagement & Marketing',
    aliases: ['campaigns & roi', 'influencer marketing', 'marketing'],
  },
  {
    module: 'Security Audit',
    label: 'Security & Access Grid',
    componentName: 'SecurityControlView.tsx',
    category: 'Security & Administration',
    aliases: ['security audit', 'security & access grid', 'security'],
  },
  {
    module: 'User Management',
    label: 'User Management',
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
    { module: 'Brand Owner Assignment', read: true, create: true, edit: true, delete: false },
    { module: 'Complete Packing', read: true, create: true, edit: true, delete: false },
    { module: 'Create Shipment', read: true, create: true, edit: true, delete: false },
    { module: 'Confirm Delivery', read: true, create: true, edit: true, delete: false },
    { module: 'Process Return', read: true, create: true, edit: true, delete: false },
    { module: 'All Operations Summary', read: true, create: true, edit: true, delete: false },
    { module: 'Customer Directory', read: true, create: true, edit: true, delete: false },
    { module: 'Tasks & Calendar', read: true, create: true, edit: true, delete: true },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
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
    { module: 'Brand Owner Assignment', read: false, create: false, edit: false, delete: false },
    { module: 'Complete Packing', read: false, create: false, edit: false, delete: false },
    { module: 'Create Shipment', read: false, create: false, edit: false, delete: false },
    { module: 'Confirm Delivery', read: false, create: false, edit: false, delete: false },
    { module: 'Process Return', read: false, create: false, edit: false, delete: false },
    { module: 'All Operations Summary', read: false, create: false, edit: false, delete: false },
    { module: 'Customer Directory', read: false, create: false, edit: false, delete: false },
    { module: 'Tasks & Calendar', read: false, create: false, edit: false, delete: false },
    { module: 'Products & Clients', read: false, create: false, edit: false, delete: false },
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
    { module: 'Brand Owner Assignment', read: true, create: true, edit: true, delete: false },
    { module: 'Complete Packing', read: true, create: true, edit: true, delete: false },
    { module: 'Create Shipment', read: true, create: true, edit: true, delete: false },
    { module: 'Confirm Delivery', read: true, create: true, edit: true, delete: false },
    { module: 'Process Return', read: true, create: true, edit: true, delete: false },
    { module: 'All Operations Summary', read: true, create: true, edit: true, delete: false },
    { module: 'Customer Directory', read: true, create: false, edit: true, delete: false },
    { module: 'Tasks & Calendar', read: true, create: true, edit: true, delete: true },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
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
    { module: 'Brand Owner Assignment', read: false, create: false, edit: false, delete: false },
    { module: 'Complete Packing', read: false, create: false, edit: false, delete: false },
    { module: 'Create Shipment', read: false, create: false, edit: false, delete: false },
    { module: 'Confirm Delivery', read: false, create: false, edit: false, delete: false },
    { module: 'Process Return', read: false, create: false, edit: false, delete: false },
    { module: 'All Operations Summary', read: false, create: false, edit: false, delete: false },
    { module: 'Customer Directory', read: true, create: false, edit: false, delete: false },
    { module: 'Tasks & Calendar', read: false, create: false, edit: false, delete: false },
    { module: 'Products & Clients', read: true, create: false, edit: false, delete: false },
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
