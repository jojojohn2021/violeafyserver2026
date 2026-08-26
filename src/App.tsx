import React, { useState } from 'react';
import { CRMProvider, useCRM } from './store';
import { BrandConfig } from './types';
import RoleSelector from './components/RoleSelector';
import DashboardView from './components/DashboardView';
import TasksCalendarView from './components/TasksCalendarView';
import PerformanceTrackingView from './components/PerformanceTrackingView';
import WhatsAppIntegrationView from './components/WhatsAppIntegrationView';
import SecurityControlView from './components/SecurityControlView';
import CustomerManagementView from './components/CustomerManagementView';
import LoginScreen from './components/LoginScreen';
import UserManagementView from './components/UserManagementView';
import SalesOrdersView from './components/SalesOrdersView';
import FruitsFlowersLogo from './components/FruitsFlowersLogo';
import ReferralPartnerHubView from './components/ReferralPartnerHubView';
import SelfieCaptureModal from './components/SelfieCaptureModal';
import InfluencerMarketingView from './components/InfluencerMarketingView';
import ShoppingPlatformView from './components/ShoppingPlatformView';
import SettingsView from './components/SettingsView';
import FirestoreErrorBanner from './components/FirestoreErrorBanner';
import { OrderOperationsView } from './components/OrderOperationsView';

import { 
  BarChart3, Users, Briefcase, Calendar, TrendingUp, MessageSquare, 
  ShieldCheck, LayoutDashboard, Menu, X, HelpCircle, ShieldAlert, UserCheck, Gift,
  LogOut, Receipt, Coins, Layout, Sparkles, ShoppingBag, Settings, Loader2, PackageCheck
} from 'lucide-react';

type ModuleTab = 'dashboard' | 'customers' | 'sales_orders' | 'order_operations' | 'schedules' | 'performance' | 'whatsapp' | 'security' | 'referrals' | 'users' | 'influencer_marketing' | 'shopping' | 'settings';

function CRMAppShell() {
  const { 
    currentUser, 
    hasAccess, 
    syncingIndicator, 
    isLoggedIn, 
    logout, 
    brandConfig, 
    updateUser,
    firestoreError,
    dismissFirestoreError,
    reloadFirestoreData,
    isLoadingFirestore
  } = useCRM();
  const [activeTab, setActiveTab] = useState<ModuleTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSelfieModalOpen, setIsSelfieModalOpen] = useState(false);

  const renderLogoSymbol = (classes = "w-9 h-9") => {
    const logoType = brandConfig.logoType || 'fruits_flowers';
    if (logoType === 'fruits_flowers') {
      return (
        <div className={`${classes} flex items-center justify-center overflow-hidden shrink-0`}>
          <FruitsFlowersLogo size="100%" />
        </div>
      );
    }
    if (logoType === 'apps_grid') {
      return (
        <div className={`${classes} flex items-center justify-center text-indigo-500 shrink-0`}>
          <Layout className="w-5 h-5" />
        </div>
      );
    }
    if (logoType === 'custom_url' && brandConfig.logoUrl) {
      return (
        <img 
          src={brandConfig.logoUrl} 
          alt="Brand Logo" 
          className={`${classes} object-contain shrink-0`}
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/Logo.png';
          }}
        />
      );
    }
    // Fallback or Initial text based
    return (
      <div className={`${classes} bg-transparent flex items-center justify-center font-extrabold text-[#747ff1] text-base shrink-0`}>
        {brandConfig.brandName?.[0] || 'V'}
      </div>
    );
  };

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  // Navigations links mapped to module access checks
  const navigationItems: { id: ModuleTab; name: string; icon: any; moduleCheck: string }[] = [
    { id: 'dashboard', name: 'KPI Intelligence', icon: BarChart3, moduleCheck: 'Dashboard' },
    { id: 'shopping', name: 'Shopping Platform', icon: ShoppingBag, moduleCheck: 'Dashboard' },
    { id: 'settings', name: 'Settings', icon: Settings, moduleCheck: 'Dashboard' },
    { id: 'referrals', name: 'Dashboard', icon: Gift, moduleCheck: 'Referral Hub' },
    { id: 'sales_orders', name: 'Invoices', icon: Receipt, moduleCheck: 'Sales Orders' },
    { id: 'order_operations', name: 'Order Operations', icon: PackageCheck, moduleCheck: 'Sales Orders' },
    { id: 'customers', name: 'Customer Directory', icon: UserCheck, moduleCheck: 'Customer Directory' },
    { id: 'schedules', name: 'Task & Calendar Sync', icon: Calendar, moduleCheck: 'Tasks & Calendar' },
    { id: 'performance', name: 'Products Settings', icon: TrendingUp, moduleCheck: 'Products & Clients' },
    { id: 'whatsapp', name: 'WhatsApp Automation', icon: MessageSquare, moduleCheck: 'WhatsApp Integration' },
    { id: 'influencer_marketing', name: 'Influencer Marketing', icon: Sparkles, moduleCheck: 'Campaigns & ROI' },
    { id: 'security', name: 'Security & Access Grid', icon: ShieldCheck, moduleCheck: 'Security Audit' },
    { id: 'users', name: 'User Management', icon: Users, moduleCheck: 'Security Audit' },
  ];

  // If a role does not have READ access to a tab, filter it out
  const visibleNavigation = navigationItems.filter(item => hasAccess(item.moduleCheck, 'read'));

  const displayedNavs = currentUser?.role === 'Referral Team'
    ? navigationItems.filter(item => item.id === 'dashboard' || item.id === 'referrals' || item.id === 'sales_orders' || item.id === 'shopping')
    : currentUser?.role === 'Support'
      ? navigationItems.filter(item => item.id !== 'security' && item.id !== 'users')
      : navigationItems;

  // Handler for navigation clicking
  const handleNavigate = (tab: ModuleTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col items-center justify-start antialiased font-sans selection:bg-green-500/20" id="crm-shell">
      {/* Native Mobile & Desktop App Frame Container */}
      <div className="w-full max-w-7xl min-h-screen bg-white shadow-xl flex flex-col relative pb-20 md:pb-8 border-x border-green-100">

        {/* 1. Mobile & Desktop Unified Top Header Bar */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-green-200 px-4 h-14 flex items-center justify-between shadow-xs" id="mobile-navbar">
          <div className="flex items-center gap-2.5">
            {renderLogoSymbol("w-8 h-8 rounded-xl bg-green-50 border border-green-200 p-0.5")}
            <div className="leading-none">
              <h1 className="font-extrabold tracking-tight text-slate-900 text-sm uppercase truncate max-w-[160px] sm:max-w-xs">{brandConfig.brandName}</h1>
              <p className="text-[8px] font-bold text-green-600 tracking-wider font-mono mt-0.5 uppercase truncate max-w-[160px] sm:max-w-xs">{brandConfig.brandTagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Sync Badge */}
            {currentUser?.role !== 'Referral Team' && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-[9px] font-bold text-green-700 font-mono">
                <span className={`w-1.5 h-1.5 rounded-full ${syncingIndicator ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                <span>SYNC</span>
              </div>
            )}

            {/* User Profile Avatar & Role */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-green-200 pl-1 pr-2 py-1 rounded-full">
              <img 
                src={currentUser.avatar} 
                alt={currentUser.name} 
                className="w-6 h-6 rounded-full object-cover border border-green-300 cursor-pointer hover:scale-105 active:scale-95 transition"
                onDoubleClick={() => setIsSelfieModalOpen(true)}
                title="Double click to take a selfie!"
                referrerPolicy="no-referrer"
              />
              <span className="text-[9px] font-extrabold text-slate-700 uppercase tracking-tight max-w-[80px] truncate">{currentUser.name.split(' ')[0]}</span>
            </div>

            {/* Logout button */}
            <button
              onClick={logout}
              className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl transition cursor-pointer active:scale-95"
              title="Log Out"
              id="mobile-logout-btn"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Body Layout with Left Side Vertical Navigation & Main Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">

          {/* 2. Left Side Vertical Navigation Sidebar (Desktop / Tablet) */}
          <aside className="hidden md:flex flex-col w-64 shrink-0 bg-slate-50/80 border-r border-green-200 p-3 gap-1.5" id="left-sidebar-nav">
            <div className="px-2 py-1.5 mb-1 flex items-center justify-between border-b border-green-200/60">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider font-mono">Main Menu</span>
              <span className="text-[9px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">{displayedNavs.length} Modules</span>
            </div>

            <div className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-8rem)] sticky top-16 pr-0.5">
              {displayedNavs.map((item) => {
                const permitted = hasAccess(item.moduleCheck, 'read');
                const active = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    disabled={!permitted}
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-left transition cursor-pointer shrink-0 ${
                      active 
                        ? 'bg-green-600 text-white shadow-sm font-extrabold' 
                        : permitted 
                          ? 'bg-white text-slate-700 hover:bg-green-50 hover:text-green-700 border border-green-200/80 hover:border-green-300' 
                          : 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed border border-slate-200'
                    }`}
                    id={`side-nav-${item.id}`}
                  >
                    <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-green-600'}`} />
                    <span className="truncate">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* 3. Primary Content Flow */}
          <main className="flex-1 p-3 sm:p-5 max-w-full w-full min-w-0" id="main-content-flow">
            
            {/* Persistent Role Selector for Admin */}
            {activeTab !== 'referrals' && (
              <RoleSelector onAvatarDoubleClick={() => setIsSelfieModalOpen(true)} />
            )}

            {/* Active View Renderer Container */}
            <div className="bg-white border border-green-200 rounded-2xl p-3 sm:p-5 shadow-xs min-h-[500px]" id="view-renderer-panel">
              {activeTab === 'dashboard' && <DashboardView />}
              {activeTab === 'shopping' && <ShoppingPlatformView />}
              {activeTab === 'settings' && <SettingsView />}
              {activeTab === 'customers' && <CustomerManagementView />}
              {activeTab === 'referrals' && <ReferralPartnerHubView />}
              {activeTab === 'sales_orders' && <SalesOrdersView />}
              {activeTab === 'order_operations' && <OrderOperationsView />}
              {activeTab === 'schedules' && <TasksCalendarView />}
              {activeTab === 'performance' && <PerformanceTrackingView />}
              {activeTab === 'whatsapp' && <WhatsAppIntegrationView />}
              {activeTab === 'influencer_marketing' && <InfluencerMarketingView />}
              {activeTab === 'security' && <SecurityControlView />}
              {activeTab === 'users' && <UserManagementView />}
            </div>
          </main>
        </div>

        {/* 4. Native Mobile Bottom Tab Navigation Bar */}
        <div 
          className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-green-200 px-3 py-2 z-50 shadow-lg flex items-center justify-around" 
          id="mobile-navigation-layout"
        >
          {/* Quick Tab 1: KPI Intelligence */}
          <button
            onClick={() => handleNavigate('dashboard')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition cursor-pointer active:scale-95 ${
              activeTab === 'dashboard' ? 'text-green-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] uppercase font-bold tracking-tight">KPI</span>
          </button>

          {/* Quick Tab 2: Shopping */}
          <button
            onClick={() => handleNavigate('shopping')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition cursor-pointer active:scale-95 ${
              activeTab === 'shopping' ? 'text-green-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px] uppercase font-bold tracking-tight">Shop</span>
          </button>

          {/* Quick Tab 3: Customers */}
          <button
            onClick={() => handleNavigate('customers')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition cursor-pointer active:scale-95 ${
              activeTab === 'customers' ? 'text-green-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-5 h-5" />
            <span className="text-[10px] uppercase font-bold tracking-tight">Customers</span>
          </button>

          {/* Quick Tab 4: Invoices */}
          <button
            onClick={() => handleNavigate('sales_orders')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition cursor-pointer active:scale-95 ${
              activeTab === 'sales_orders' ? 'text-green-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-[10px] uppercase font-bold tracking-tight">Invoices</span>
          </button>

          {/* Quick Tab 5: More Drawer Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition cursor-pointer active:scale-95 ${
              mobileMenuOpen ? 'text-green-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] uppercase font-bold tracking-tight">More</span>
          </button>
        </div>

        {/* 5. Mobile Bottom Sheet Drawer Modal */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end md:hidden animate-fadeIn" onClick={() => setMobileMenuOpen(false)}>
            <div 
              className="bg-white rounded-t-3xl border-t border-green-200 p-5 space-y-4 max-h-[80vh] overflow-y-auto animate-fadeIn shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-green-100 pb-3">
                <div className="flex items-center gap-2">
                  <Layout className="w-5 h-5 text-green-600" />
                  <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide">All Application Modules</h3>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {displayedNavs.map((item) => {
                  const permitted = hasAccess(item.moduleCheck, 'read');
                  const active = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      disabled={!permitted}
                      onClick={() => handleNavigate(item.id)}
                      className={`flex flex-col items-start p-3 rounded-2xl border transition text-left cursor-pointer active:scale-95 ${
                        active 
                          ? 'bg-green-600 text-white border-green-600 font-bold shadow-sm' 
                          : permitted 
                            ? 'bg-green-50/50 text-slate-800 border-green-200 hover:bg-green-100/60' 
                            : 'bg-slate-50 text-slate-400 border-slate-200 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 mb-2 ${active ? 'text-white' : 'text-green-600'}`} />
                      <span className="text-xs font-extrabold tracking-tight leading-tight">{item.name}</span>
                      {!permitted && <span className="text-[8px] font-bold text-rose-600 uppercase mt-1">Locked</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Brand visual customizer is integrated directly as a tab inside Settings & Operations Admin */}

      <SelfieCaptureModal 
        isOpen={isSelfieModalOpen}
        onClose={() => setIsSelfieModalOpen(false)}
        onSave={(newAvatar) => {
          updateUser(currentUser.id, { avatar: newAvatar });
        }}
        currentAvatar={currentUser.avatar}
      />

      {/* Cloud Firestore Single Source of Truth Global Error Banner & Retry UI */}
      <FirestoreErrorBanner 
        error={firestoreError} 
        onRetry={reloadFirestoreData} 
        onDismiss={dismissFirestoreError} 
      />

      {/* Loading Overlay while waiting for Firestore operations */}
      {isLoadingFirestore && (
        <div className="fixed top-4 right-4 z-40 bg-slate-900/90 text-emerald-400 border border-emerald-500/40 px-3.5 py-2 rounded-xl text-xs font-mono flex items-center gap-2 shadow-lg backdrop-blur-sm">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Fetching Cloud Firestore documents...</span>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state: { hasError: boolean; error: any; };
  props: any;
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught React Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="bg-slate-800 border border-rose-500/40 rounded-2xl p-8 max-w-lg shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h2 className="text-xl font-extrabold text-rose-400 uppercase tracking-wide">Application Runtime Notice</h2>
            <p className="text-sm text-slate-300">An unexpected error occurred during client rendering.</p>
            <pre className="bg-slate-950 p-4 rounded-xl text-left text-xs text-rose-300 font-mono overflow-x-auto max-h-40 border border-slate-800">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition cursor-pointer text-xs uppercase tracking-wider"
            >
              Reset Session Storage & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <CRMProvider>
        <CRMAppShell />
      </CRMProvider>
    </ErrorBoundary>
  );
}
