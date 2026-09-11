import React, { useState, useEffect } from 'react';
import { useCRM } from '../store';
import { PartnerLevel, CommissionRule, CommissionTransaction, Referral } from '../types';
import { 
  TrendingUp, Coins, BarChart3, Users, Briefcase, Gift, AlertCircle, 
  ArrowUpRight, Loader2, Sparkles, Calendar, Award, ChevronDown, Check, 
  Search, Building, CheckCircle2, Target, ShieldCheck, ShieldAlert, ChevronRight,
  Plus, Edit3, Trash2, RefreshCw, Sliders, Layers, Settings, DollarSign, XCircle, RotateCcw, Eye, Filter
} from 'lucide-react';

export default function ReferralPartnerHubView() {
  const { 
    currentUser, 
    referrals, 
    customers,
    updateCustomer,
    updateReferral,
    salesOrders, 
    products, 
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
    updateCommissionTransactionStatus
  } = useCRM();

  // Navigation tabs within Referral Partner Hub
  const [activeTab, setActiveTab] = useState<'overview' | 'referral_tree' | 'partner_levels' | 'commission_rules' | 'commission_txs'>('overview');

  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [partnerSearchKeyword, setPartnerSearchKeyword] = useState('');

  // Sponsor Link Modal State
  const [isLinkSponsorModalOpen, setIsLinkSponsorModalOpen] = useState(false);
  const [targetPartnerToLink, setTargetPartnerToLink] = useState<Referral | null>(null);
  const [selectedSponsorId, setSelectedSponsorId] = useState<string>('');
  const [customSponsorInput, setCustomSponsorInput] = useState<string>('');

  // Set default selected partner
  useEffect(() => {
    if (referrals.length > 0 && !selectedPartnerId) {
      setSelectedPartnerId(referrals[0].id);
    }
  }, [referrals, selectedPartnerId]);

  const partner = referrals.find(r => r.id === selectedPartnerId) || referrals[0];

  // Forms and Modals State
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<PartnerLevel | null>(null);
  const [levelForm, setLevelForm] = useState({
    level_name: '',
    sales_amount: 0,
    sales_period: 'Monthly' as 'Monthly' | 'Quarterly' | 'Annually',
    bonus_commission: 0,
    status: 'Active' as 'Active' | 'Inactive'
  });

  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    product_id: '',
    partner_id: '',
    level: 1,
    commission_value: 10,
    source: 'Default' as 'Default' | 'Product' | 'Partner',
    status: 'Active' as 'Active' | 'Inactive'
  });

  const [txFilterStatus, setTxFilterStatus] = useState<string>('ALL');
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [processOrderIdInput, setProcessOrderIdInput] = useState('');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Partner level modal handlers
  const openLevelModal = (level?: PartnerLevel) => {
    if (level) {
      setEditingLevel(level);
      setLevelForm({
        level_name: level.level_name,
        sales_amount: level.sales_amount,
        sales_period: level.sales_period,
        bonus_commission: level.bonus_commission,
        status: level.status
      });
    } else {
      setEditingLevel(null);
      setLevelForm({
        level_name: '',
        sales_amount: 100000,
        sales_period: 'Monthly',
        bonus_commission: 5,
        status: 'Active'
      });
    }
    setIsLevelModalOpen(true);
  };

  const handleSaveLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!levelForm.level_name.trim()) return;
    try {
      if (editingLevel) {
        await updatePartnerLevel(editingLevel.id, levelForm);
        showFeedback('success', `Partner level '${levelForm.level_name}' updated.`);
      } else {
        await addPartnerLevel(levelForm);
        showFeedback('success', `Partner level '${levelForm.level_name}' created.`);
      }
      setIsLevelModalOpen(false);
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to save partner level.');
    }
  };

  // Commission Rule Modal Handlers
  const openRuleModal = (rule?: CommissionRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        product_id: rule.product_id || '',
        partner_id: rule.partner_id || '',
        level: rule.level,
        commission_value: rule.commission_value,
        source: rule.source,
        status: rule.status
      });
    } else {
      setEditingRule(null);
      setRuleForm({
        product_id: '',
        partner_id: '',
        level: 1,
        commission_value: 10,
        source: 'Default',
        status: 'Active'
      });
    }
    setIsRuleModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        product_id: ruleForm.product_id || null,
        partner_id: ruleForm.partner_id || null,
        level: Number(ruleForm.level),
        commission_type: 'Percentage' as const,
        commission_value: Number(ruleForm.commission_value),
        source: ruleForm.partner_id ? ('Partner' as const) : ruleForm.product_id ? ('Product' as const) : ('Default' as const),
        status: ruleForm.status
      };

      if (editingRule) {
        await updateCommissionRule(editingRule.id, payload);
        showFeedback('success', 'Commission rule updated.');
      } else {
        await addCommissionRule(payload);
        showFeedback('success', 'Commission rule created.');
      }
      setIsRuleModalOpen(false);
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to save commission rule.');
    }
  };

  // Process order commission manually
  const handleProcessOrderCommissions = async () => {
    if (!processOrderIdInput.trim()) return;
    setIsProcessingOrder(true);
    try {
      const result = await processOrderCommissions(processOrderIdInput.trim());
      if (result.success) {
        showFeedback('success', `Generated ${result.count} commission transactions for Order #${processOrderIdInput}.`);
        setProcessOrderIdInput('');
      } else {
        showFeedback('error', result.error || 'No eligible commissions generated.');
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to process order commissions.');
    } finally {
      setIsProcessingOrder(false);
    }
  };

  const openLinkSponsorModal = (targetP?: Referral) => {
    const pToLink = targetP || partner;
    if (!pToLink) return;
    setTargetPartnerToLink(pToLink);
    const existingSponsor = pToLink.referredById || pToLink.parentId || '';
    setSelectedSponsorId(existingSponsor);
    setCustomSponsorInput(existingSponsor);
    setIsLinkSponsorModalOpen(true);
  };

  const handleSaveSponsorLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPartnerToLink) return;
    const finalSponsor = selectedSponsorId || customSponsorInput.trim();

    // Self-referral validation
    if (targetPartnerToLink.id === finalSponsor || targetPartnerToLink.referralId === finalSponsor) {
      showFeedback('error', 'A customer cannot refer themselves.');
      return;
    }

    try {
      // Call authoritative backend endpoint for editing existing sponsor relationship
      const res = await fetch(`/api/admin/referral-partners/${targetPartnerToLink.id}/sponsor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposedSponsorId: finalSponsor })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showFeedback('error', data.message || data.error || 'Failed to update sponsor link.');
        return;
      }

      if (updateReferral) {
        await updateReferral(targetPartnerToLink.id, { referredById: finalSponsor, parentId: finalSponsor });
      }
      if (updateCustomer) {
        await updateCustomer(targetPartnerToLink.id, { referredById: finalSponsor });
      }
      showFeedback('success', `Direct upline sponsor updated for '${targetPartnerToLink.name}'.`);
      setIsLinkSponsorModalOpen(false);
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to update sponsor link.');
    }
  };

  // Helper to normalize strings for comparison
  const norm = (str?: string) => (str || '').trim().toLowerCase();
  const cleanDigits = (str?: string) => (str || '').replace(/\D/g, '');

  // Helper to dynamically resolve sales metrics and commission details for a partner
  const getPartnerMetrics = (p: Referral | any) => {
    if (!p) return { totalSales: 0, commissionEarned: 0, commissionPayable: 0, commissionPaid: 0 };

    const pId = norm(p.id);
    const pRefId = norm(p.referralId || p.referralCode);
    const pCustId = norm(p.customerId);
    const pMobileDigits = cleanDigits(p.mobileNumber);

    // Calculate sales directly from salesOrders
    const partnerOrders = (salesOrders || []).filter((o: any) => {
      const oCustId = norm(o.customerId);
      const oRefCode = norm(o.referralCode);
      const oContactDigits = cleanDigits(o.contactNo);

      if (pId && oCustId === pId) return true;
      if (pCustId && oCustId === pCustId) return true;
      if (pRefId && oRefCode === pRefId) return true;
      if (pMobileDigits && pMobileDigits.length >= 7 && oContactDigits === pMobileDigits) return true;
      return false;
    });

    const calculatedSales = partnerOrders.reduce((sum, o) => sum + Number(o.totalValue || 0), 0);
    const totalSales = Math.max(calculatedSales, Number(p.totalSales || 0), Number(p.totalSpent || 0));

    // Calculate commissions directly from commissionTransactions
    const partnerTxs = (commissionTransactions || []).filter((tx: any) => {
      const benId = norm(tx.beneficiary_partner_id || tx.beneficiary_customer_id);
      return benId === pId || (pRefId && benId === pRefId) || (pCustId && benId === pCustId);
    });

    const earnedFromTxs = partnerTxs
      .filter((tx: any) => tx.status !== 'REVERSED')
      .reduce((sum, tx) => sum + Number(tx.commission_amount || 0), 0);

    const payableFromTxs = partnerTxs
      .filter((tx: any) => tx.status === 'CONFIRMED' || tx.status === 'PAYABLE' || tx.status === 'PENDING')
      .reduce((sum, tx) => sum + Number(tx.commission_amount || 0), 0);

    const paidFromTxs = partnerTxs
      .filter((tx: any) => tx.status === 'PAID')
      .reduce((sum, tx) => sum + Number(tx.commission_amount || 0), 0);

    const commissionEarned = Math.max(earnedFromTxs, Number(p.commissionEarned || 0));
    const commissionPayable = Math.max(payableFromTxs, Number(p.commissionPayable || 0));
    const commissionPaid = Math.max(paidFromTxs, Number(p.commissionPaid || 0));

    return { totalSales, commissionEarned, commissionPayable, commissionPaid };
  };

  // Helper to dynamically look up active default rate for a level from commissionRules table
  const getLevelDefaultRate = (lvl: number) => {
    const rule = (commissionRules || []).find(
      (r) =>
        (!r.product_id || r.product_id === null) &&
        (!r.partner_id || r.partner_id === null) &&
        Number(r.level) === lvl &&
        r.source === 'Default' &&
        r.status === 'Active'
    );
    return rule ? Number(rule.commission_value) : 0;
  };

  // Helper to find a matching partner/customer record by any identifier
  const findPartnerMatch = (identifier: string, pool: any[]) => {
    if (!identifier) return undefined;
    const target = norm(identifier);
    const targetDigits = cleanDigits(identifier);

    return pool.find((item: any) => {
      if (!item) return false;
      const itemId = norm(item.id);
      const itemRefId = norm(item.referralId || item.referralCode);
      const itemCustId = norm(item.customerId);
      const itemUserId = norm(item.userId);
      const itemEmail = norm(item.email);
      const itemName = norm(item.name);
      const itemMobileDigits = cleanDigits(item.mobileNumber);

      if (itemId === target && itemId !== '') return true;
      if (itemRefId === target && itemRefId !== '') return true;
      if (itemCustId === target && itemCustId !== '') return true;
      if (itemUserId === target && itemUserId !== '') return true;
      if (itemEmail === target && itemEmail !== '') return true;
      if (
        targetDigits.length >= 7 &&
        itemMobileDigits.length >= 7 &&
        (itemMobileDigits === targetDigits ||
          itemMobileDigits.endsWith(targetDigits) ||
          targetDigits.endsWith(itemMobileDigits))
      ) {
        return true;
      }
      if (itemName === target && itemName !== '') return true;

      return false;
    });
  };

  const resolveSponsorIdFromCustomer = (cust: any) => {
    if (!cust) return null;
    const ownKeys = new Set<string>();
    if (cust.id) ownKeys.add(norm(cust.id));
    if (cust.customerId) ownKeys.add(norm(cust.customerId));
    if (cust.referralCode) ownKeys.add(norm(cust.referralCode));
    if (cust.referralId) ownKeys.add(norm(cust.referralId));

    const ownMobileDigits = cleanDigits(cust.mobileNumber);

    const candidates = [
      cust.referredById,
      cust.parentId,
      cust.sponsorPartnerId,
      cust.sponsorId,
      cust.sponsorCode,
      cust.referredByCode,
      cust.referredBy,
      cust.referralmobileno,
    ];

    for (const rawCandidate of candidates) {
      if (!rawCandidate) continue;
      const candStr = String(rawCandidate).trim();
      if (!candStr) continue;

      const candLower = norm(candStr);
      const candDigits = cleanDigits(candStr);

      if (ownKeys.has(candLower)) continue;
      if (
        candDigits &&
        ownMobileDigits &&
        candDigits.length >= 7 &&
        ownMobileDigits.length >= 7 &&
        (candDigits === ownMobileDigits ||
          candDigits.endsWith(ownMobileDigits) ||
          ownMobileDigits.endsWith(candDigits))
      ) {
        continue;
      }

      return candStr;
    }

    return null;
  };

  // Build Upline Chain for active partner (L1 Primary Customer, L2-L5 Active Commission Window, L6 Termination Boundary)
  const getUplineChain = (targetPartnerId: string) => {
    const combinedPool = [...referrals, ...(customers || [])];
    const chain: { level: number; partner: Referral; isActiveWindow: boolean; isPrimary: boolean }[] = [];
    
    let current: any = findPartnerMatch(targetPartnerId, combinedPool) || referrals.find(r => r.id === targetPartnerId || r.referralId === targetPartnerId);
    if (!current) return chain;

    const visited = new Set<string>();
    if (current.id) visited.add(norm(current.id));
    if (current.referralId) visited.add(norm(current.referralId));
    if (current.referralCode) visited.add(norm(current.referralCode));
    if (current.customerId) visited.add(norm(current.customerId));
    if (current.mobileNumber) visited.add(cleanDigits(current.mobileNumber));

    // L1 = Transaction Customer / Primary Partner
    const primaryPartner: Referral = {
      id: current.id,
      referralId: current.referralId || current.referralCode || current.customerId || `REF-${current.id}`,
      name: current.name || 'Unnamed Customer',
      mobileNumber: current.mobileNumber || '',
      email: current.email || '',
      address: current.address || '',
      status: current.status || 'Active',
      referredById: resolveSponsorIdFromCustomer(current) || '',
      partnerLevelName: current.partnerLevelName || 'Bronze',
      totalSales: current.totalSales || 0,
      createdAt: current.createdAt || new Date().toISOString()
    };

    chain.push({
      level: 1,
      partner: primaryPartner,
      isActiveWindow: true,
      isPrimary: true
    });

    let depth = 2; // Immediate upline is L2
    while (current && depth <= 6) {
      const sponsorId = resolveSponsorIdFromCustomer(current);
      if (!sponsorId) break;

      const sponsor = findPartnerMatch(sponsorId, combinedPool);
      if (!sponsor) break;

      const sponsorIdKey = norm(sponsor.id || sponsor.referralId || sponsor.customerId);
      const sponsorMobileKey = cleanDigits(sponsor.mobileNumber);

      if (
        (sponsorIdKey && visited.has(sponsorIdKey)) ||
        (sponsorMobileKey && visited.has(sponsorMobileKey))
      ) {
        console.warn(`[REFERRAL HUB] Circular referral detected for sponsor ${sponsorIdKey || sponsorMobileKey}. Terminating chain.`);
        break;
      }

      if (sponsor.id) visited.add(norm(sponsor.id));
      if (sponsor.referralId) visited.add(norm(sponsor.referralId));
      if (sponsor.referralCode) visited.add(norm(sponsor.referralCode));
      if (sponsor.customerId) visited.add(norm(sponsor.customerId));
      if (sponsor.mobileNumber) visited.add(cleanDigits(sponsor.mobileNumber));

      const formattedSponsor: Referral = {
        id: sponsor.id,
        referralId: sponsor.referralId || sponsor.referralCode || sponsor.customerId || `REF-${sponsor.id}`,
        name: sponsor.name || 'Unnamed Partner',
        mobileNumber: sponsor.mobileNumber || '',
        email: sponsor.email || '',
        address: sponsor.address || '',
        status: sponsor.status || 'Active',
        referredById: resolveSponsorIdFromCustomer(sponsor) || '',
        partnerLevelName: sponsor.partnerLevelName || 'Bronze',
        totalSales: sponsor.totalSales || 0,
        createdAt: sponsor.createdAt || new Date().toISOString()
      };

      chain.push({
        level: depth,
        partner: formattedSponsor,
        isActiveWindow: depth <= 5,
        isPrimary: false
      });

      current = sponsor;
      depth++;
    }

    return chain;
  };

  // Filtered lists
  const filteredPartners = referrals.filter(r => 
    r.name.toLowerCase().includes(partnerSearchKeyword.toLowerCase()) ||
    r.referralId.toLowerCase().includes(partnerSearchKeyword.toLowerCase()) ||
    r.mobileNumber.includes(partnerSearchKeyword)
  );

  const filteredTransactions = commissionTransactions.filter(tx => {
    if (txFilterStatus === 'ALL') return true;
    return tx.status === txFilterStatus;
  });

  return (
    <div className="space-y-6 font-sans bg-slate-50 text-slate-900 p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-xs" id="referral-commission-system-root">
      
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-6 rounded-3xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono font-bold uppercase rounded-full tracking-wider">
              Node.js Administrator System
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Rolling 5-Level Referral &amp; Commission Engine</h1>
          <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
            Manage referral partners, partner levels, hierarchical commission rules (System &rarr; Product &rarr; Partner Overrides), and 5-level rolling upline calculations with duplicate protection.
          </p>
        </div>

        {/* Action Quick Bar */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <input
            type="text"
            placeholder="Enter Order ID to process..."
            value={processOrderIdInput}
            onChange={e => setProcessOrderIdInput(e.target.value)}
            className="px-3 py-1.5 bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 w-44 sm:w-52"
          />
          <button
            onClick={handleProcessOrderCommissions}
            disabled={isProcessingOrder || !processOrderIdInput.trim()}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {isProcessingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
            <span>Process Commissions</span>
          </button>
        </div>
      </div>

      {/* Alert / Notification Feedback */}
      {actionMessage && (
        <div className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
          actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'overview' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Partner Directory &amp; KPIs</span>
        </button>

        <button
          onClick={() => setActiveTab('referral_tree')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'referral_tree' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>5-Level Referral Tree</span>
        </button>

        <button
          onClick={() => setActiveTab('partner_levels')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'partner_levels' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Partner Levels ({partnerLevels.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('commission_rules')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'commission_rules' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Commission Rules ({commissionRules.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('commission_txs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'commission_txs' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Commission Audit Log ({commissionTransactions.length})</span>
        </button>
      </div>

      {/* TAB 1: PARTNER DIRECTORY & KPIS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">Total Referral Partners</span>
              <p className="text-xl font-extrabold text-slate-900">{referrals.length}</p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">Total Sales Generated</span>
              <p className="text-xl font-extrabold text-emerald-700">
                ₹{referrals.reduce((sum, r) => sum + getPartnerMetrics(r).totalSales, 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">Commissions Payable</span>
              <p className="text-xl font-extrabold text-amber-600">
                ₹{referrals.reduce((sum, r) => sum + getPartnerMetrics(r).commissionPayable, 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">Commissions Paid</span>
              <p className="text-xl font-extrabold text-blue-600">
                ₹{referrals.reduce((sum, r) => sum + getPartnerMetrics(r).commissionPaid, 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Partner Search & Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search partner name or code..."
                  value={partnerSearchKeyword}
                  onChange={e => setPartnerSearchKeyword(e.target.value)}
                  className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <span className="text-xs font-mono text-slate-500">Showing {filteredPartners.length} of {referrals.length} partners</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] font-mono font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="p-3">Partner ID / Name</th>
                    <th className="p-3">Referral Code</th>
                    <th className="p-3">Sponsor ID</th>
                    <th className="p-3">Partner Level</th>
                    <th className="p-3">Total Sales</th>
                    <th className="p-3">Earned</th>
                    <th className="p-3">Payable</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPartners.map(p => {
                    const pm = getPartnerMetrics(p);
                    return (
                      <tr key={p.id} className={`hover:bg-emerald-50/30 transition ${selectedPartnerId === p.id ? 'bg-emerald-50/60 font-medium' : ''}`}>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">ID: {p.id} | {p.mobileNumber}</div>
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-700">{p.referralId}</td>
                        <td className="p-3 font-mono text-slate-600">{p.referredById || p.parentId || '—'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                            {p.partnerLevelName || 'Bronze'}
                          </span>
                        </td>
                        <td className="p-3 font-semibold">₹{pm.totalSales.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-emerald-700 font-bold">₹{pm.commissionEarned.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-amber-700 font-bold">₹{pm.commissionPayable.toLocaleString('en-IN')}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            p.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedPartnerId(p.id);
                              setActiveTab('referral_tree');
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ml-auto cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Tree</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 5-LEVEL REFERRAL TREE */}
      {activeTab === 'referral_tree' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Target Referral Partner Tree</h3>
              <p className="text-xs text-slate-500">Inspect the 5-level rolling active commission window vs permanent upline history.</p>
            </div>
            <select
              value={selectedPartnerId}
              onChange={e => setSelectedPartnerId(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
            >
              {referrals.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} (#{r.referralId} | {r.mobileNumber})
                </option>
              ))}
            </select>
          </div>

          {/* Active Partner Focus Card */}
          {partner && (() => {
            const focusMetrics = getPartnerMetrics(partner);
            return (
              <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-xs">
                    {partner.name[0]}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">{partner.name}</h4>
                    <p className="text-xs text-slate-600 font-mono">Code: #{partner.referralId} | Mobile: {partner.mobileNumber}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-right">
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Current Level</span>
                    <span className="px-2.5 py-0.5 bg-emerald-600 text-white text-xs font-bold rounded-full">{partner.partnerLevelName || 'Bronze'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Total Sales</span>
                    <span className="text-xs font-extrabold text-slate-900">₹{focusMetrics.totalSales.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Earned Comm.</span>
                    <span className="text-xs font-extrabold text-emerald-700">₹{focusMetrics.commissionEarned.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Payable Comm.</span>
                    <span className="text-xs font-extrabold text-amber-600">₹{focusMetrics.commissionPayable.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <button
                      onClick={() => openLinkSponsorModal(partner)}
                      className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Link / Edit Sponsor</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Upline Chain Visualizer */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>Upline Chain Resolution (5-Level Active Limit)</span>
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono font-bold text-slate-500 hidden md:inline">
                  Levels 1–5: Active Commission Window | Level 6+: Permanent History Only
                </span>
                <button
                  onClick={() => openLinkSponsorModal(partner)}
                  className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Link Sponsor</span>
                </button>
              </div>
            </div>

            {getUplineChain(partner?.id || '').length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-500 text-xs space-y-3">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-400" />
                <div>
                  <p className="font-bold text-slate-700">This partner has no direct upline sponsor registered.</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Link a sponsor code, mobile number, or partner ID to resolve the 5-level active commission chain.
                  </p>
                </div>
                <button
                  onClick={() => openLinkSponsorModal(partner)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Link Direct Upline Sponsor Now</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {getUplineChain(partner?.id || '').map((node) => {
                  const nodeMetrics = getPartnerMetrics(node.partner);
                  return (
                    <div 
                      key={node.level}
                      className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition ${
                        node.isActiveWindow 
                          ? 'bg-emerald-50/50 border-emerald-200' 
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
                          node.isActiveWindow ? 'bg-emerald-600 text-white' : 'bg-slate-400 text-white'
                        }`}>
                          L{node.level}
                        </span>
                        <div>
                          <span className="font-bold text-slate-900 text-sm">{node.partner.name}</span>
                          <p className="text-[10px] text-slate-500 font-mono">
                            Referral Code: #{node.partner.referralId} | Mobile: {node.partner.mobileNumber}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        <div className="text-right">
                          <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Node Sales</span>
                          <span className="font-extrabold text-slate-900">₹{nodeMetrics.totalSales.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Earned</span>
                          <span className="font-bold text-emerald-700">₹{nodeMetrics.commissionEarned.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-mono uppercase text-slate-400 font-bold block">Payable</span>
                          <span className="font-bold text-amber-700">₹{nodeMetrics.commissionPayable.toLocaleString('en-IN')}</span>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase ${
                          node.isPrimary
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : node.level === 6
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : node.isActiveWindow 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {node.isPrimary
                            ? `L1 Primary Customer (${getLevelDefaultRate(1)}% Default)`
                            : node.level === 2
                            ? `L2 Active Commission (${getLevelDefaultRate(2)}% Default)`
                            : node.level === 3
                            ? `L3 Active Commission (${getLevelDefaultRate(3)}% Default)`
                            : node.level === 4
                            ? `L4 Active Commission (${getLevelDefaultRate(4)}% Default)`
                            : node.level === 5
                            ? `L5 Active Commission (${getLevelDefaultRate(5)}% Default)`
                            : node.level === 6
                            ? 'L6 Termination Boundary (No Commission)'
                            : 'Historical Upline (Outside L5)'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PARTNER LEVEL CONFIGURATION */}
      {activeTab === 'partner_levels' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Partner Qualification Levels</h3>
              <p className="text-xs text-slate-500">Define sales target thresholds and bonus commission percentages for automatic partner level qualification.</p>
            </div>
            <button
              onClick={() => openLevelModal()}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Partner Level</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {partnerLevels.map(lvl => (
              <div key={lvl.id} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3 relative shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-extrabold text-slate-900 text-base">{lvl.level_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                    lvl.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {lvl.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-mono">Sales Target:</span>
                    <span className="font-bold text-slate-900">₹{Number(lvl.sales_amount).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-mono">Qualification Period:</span>
                    <span className="font-semibold text-slate-800">{lvl.sales_period}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-mono">Bonus Commission:</span>
                    <span className="font-bold text-emerald-600">+{lvl.bonus_commission}%</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    onClick={() => openLevelModal(lvl)}
                    className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                    title="Edit Level"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deletePartnerLevel(lvl.id)}
                    className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                    title="Delete Level"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: COMMISSION RULES & OVERRIDES */}
      {activeTab === 'commission_rules' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Commission Configuration Hierarchy</h3>
              <p className="text-xs text-slate-500">
                Rule Precedence: <span className="font-bold text-emerald-700">Partner Override &gt; Product Rule &gt; System Default</span>.
              </p>
            </div>
            <button
              onClick={() => openRuleModal()}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Commission Rule / Override</span>
            </button>
          </div>

          {/* System Default Rate Summary Card */}
          <div className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white p-5 rounded-2xl space-y-3">
            <h4 className="font-bold text-sm text-emerald-400">System Default 5-Level Commission Rates</h4>
            <div className="grid grid-cols-5 gap-2 text-center font-mono">
              {[1, 2, 3, 4, 5].map(lvl => {
                const rule = commissionRules.find(r => (!r.product_id || r.product_id === null) && (!r.partner_id || r.partner_id === null) && Number(r.level) === lvl && r.source === 'Default' && r.status === 'Active');
                const rate = rule ? rule.commission_value : 0;
                return (
                  <div key={lvl} className="p-2.5 bg-white/10 rounded-xl border border-white/10">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Level {lvl}</span>
                    <span className="text-lg font-black text-emerald-300">{rate}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rules List Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider font-mono">Active Rules &amp; Overrides</h4>
              <span className="text-xs text-slate-500 font-mono">{commissionRules.length} Total Rules</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] font-mono font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="p-3">Rule Source</th>
                    <th className="p-3">Level</th>
                    <th className="p-3">Target Product</th>
                    <th className="p-3">Target Partner</th>
                    <th className="p-3">Rate</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commissionRules.map(rule => {
                    const targetProd = products.find(p => p.id === rule.product_id);
                    const targetPart = referrals.find(r => r.id === rule.partner_id);

                    return (
                      <tr key={rule.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                            rule.source === 'Partner' ? 'bg-purple-100 text-purple-800' : rule.source === 'Product' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {rule.source}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold">Level {rule.level}</td>
                        <td className="p-3">{targetProd ? targetProd.name : '— All Products —'}</td>
                        <td className="p-3">{targetPart ? `${targetPart.name} (#${targetPart.referralId})` : '— All Partners —'}</td>
                        <td className="p-3 font-extrabold text-emerald-700">{rule.commission_value}%</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            rule.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {rule.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => openRuleModal(rule)}
                            className="p-1 text-slate-600 hover:text-emerald-600 transition inline-block mr-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteCommissionRule(rule.id)}
                            className="p-1 text-slate-600 hover:text-rose-600 transition inline-block cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: COMMISSION TRANSACTIONS AUDIT LOG */}
      {activeTab === 'commission_txs' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Commission Transactions Audit Log</h3>
              <p className="text-xs text-slate-500">Inspect historical commission payouts, status progression, and trigger reversals for refunded orders.</p>
            </div>

            {/* Filter by Status */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={txFilterStatus}
                onChange={e => setTxFilterStatus(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="PAYABLE">PAYABLE</option>
                <option value="PAID">PAID</option>
                <option value="REVERSED">REVERSED</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] font-mono font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="p-3">Txn ID</th>
                    <th className="p-3">Order ID</th>
                    <th className="p-3">Buyer Partner</th>
                    <th className="p-3">Beneficiary (Upline)</th>
                    <th className="p-3">Level</th>
                    <th className="p-3">Rate</th>
                    <th className="p-3">Base</th>
                    <th className="p-3">Commission</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-slate-500 italic">
                        No commission transactions found for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map(tx => {
                      const buyer = referrals.find(r => r.id === tx.buyer_partner_id);
                      const beneficiary = referrals.find(r => r.id === tx.beneficiary_partner_id);

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono text-[10px] text-slate-500" title={tx.id}>
                            {tx.id.slice(0, 16)}...
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900">{tx.order_id}</td>
                          <td className="p-3">{buyer ? buyer.name : tx.buyer_partner_id}</td>
                          <td className="p-3 font-bold text-emerald-900">{beneficiary ? beneficiary.name : tx.beneficiary_partner_id}</td>
                          <td className="p-3 font-mono font-bold">L{tx.level}</td>
                          <td className="p-3 font-bold text-slate-800">{tx.commission_rate}%</td>
                          <td className="p-3">₹{Number(tx.commission_base_amount).toLocaleString('en-IN')}</td>
                          <td className="p-3 font-black text-emerald-700">₹{Number(tx.commission_amount).toLocaleString('en-IN')}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                              tx.status === 'PAID' ? 'bg-blue-100 text-blue-800' :
                              tx.status === 'PAYABLE' ? 'bg-amber-100 text-amber-800' :
                              tx.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' :
                              tx.status === 'REVERSED' ? 'bg-rose-100 text-rose-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {tx.status !== 'PAID' && tx.status !== 'REVERSED' && (
                                <button
                                  onClick={() => updateCommissionTransactionStatus(tx.id, tx.status === 'PENDING' ? 'CONFIRMED' : tx.status === 'CONFIRMED' ? 'PAYABLE' : 'PAID')}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold transition cursor-pointer"
                                >
                                  {tx.status === 'PENDING' ? 'Confirm' : tx.status === 'CONFIRMED' ? 'Make Payable' : 'Mark Paid'}
                                </button>
                              )}
                              {tx.status !== 'REVERSED' && (
                                <button
                                  onClick={() => refundOrderCommissions(tx.order_id, 'Admin manual reversal')}
                                  className="p-1 text-slate-500 hover:text-rose-600 transition cursor-pointer"
                                  title="Refund &amp; Reverse"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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
      )}

      {/* PARTNER LEVEL MODAL */}
      {isLevelModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">{editingLevel ? 'Edit Partner Level' : 'Add Partner Level'}</h3>
            <form onSubmit={handleSaveLevel} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Level Name</label>
                <input
                  type="text"
                  required
                  value={levelForm.level_name}
                  onChange={e => setLevelForm({ ...levelForm, level_name: e.target.value })}
                  placeholder="e.g. Bronze, Silver, Gold"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Required Sales Target (₹)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={levelForm.sales_amount}
                  onChange={e => setLevelForm({ ...levelForm, sales_amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sales Period</label>
                <select
                  value={levelForm.sales_period}
                  onChange={e => setLevelForm({ ...levelForm, sales_period: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Annually">Annually</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Bonus Commission (%)</label>
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  value={levelForm.bonus_commission}
                  onChange={e => setLevelForm({ ...levelForm, bonus_commission: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={levelForm.status}
                  onChange={e => setLevelForm({ ...levelForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLevelModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition cursor-pointer"
                >
                  Save Level
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMMISSION RULE MODAL */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">{editingRule ? 'Edit Commission Rule' : 'Add Commission Rule / Override'}</h3>
            <form onSubmit={handleSaveRule} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Commission Level (1 to 5)</label>
                <select
                  value={ruleForm.level}
                  onChange={e => setRuleForm({ ...ruleForm, level: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value={1}>Level 1 (Direct Sponsor)</option>
                  <option value={2}>Level 2</option>
                  <option value={3}>Level 3</option>
                  <option value={4}>Level 4</option>
                  <option value={5}>Level 5</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Product (Optional)</label>
                <select
                  value={ruleForm.product_id}
                  onChange={e => setRuleForm({ ...ruleForm, product_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">— All Products (Default) —</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Partner Override (Optional)</label>
                <select
                  value={ruleForm.partner_id}
                  onChange={e => setRuleForm({ ...ruleForm, partner_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">— All Partners (Default) —</option>
                  {referrals.map(r => (
                    <option key={r.id} value={r.id}>{r.name} (#{r.referralId})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Commission Percentage (%)</label>
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  value={ruleForm.commission_value}
                  onChange={e => setRuleForm({ ...ruleForm, commission_value: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={ruleForm.status}
                  onChange={e => setRuleForm({ ...ruleForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition cursor-pointer"
                >
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINK SPONSOR MODAL */}
      {isLinkSponsorModalOpen && targetPartnerToLink && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Link Direct Upline Sponsor</h3>
                <p className="text-xs text-slate-500">Assign or update direct sponsor for partner: <strong className="text-emerald-700">{targetPartnerToLink.name}</strong></p>
              </div>
              <button
                type="button"
                onClick={() => setIsLinkSponsorModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSponsorLink} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Upline Sponsor from Active Partners</label>
                <select
                  value={selectedSponsorId}
                  onChange={e => {
                    setSelectedSponsorId(e.target.value);
                    setCustomSponsorInput(e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">— Select Registered Partner —</option>
                  {referrals
                    .filter(r => r.id !== targetPartnerToLink.id)
                    .map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} (#{r.referralId}) | {r.mobileNumber}
                      </option>
                    ))}
                </select>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-2 text-[10px] uppercase font-bold text-slate-400 font-mono">Or enter code manually</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Custom Sponsor Referral Code / ID / Mobile</label>
                <input
                  type="text"
                  placeholder="E.g. REF-1001 or 9876543210"
                  value={customSponsorInput}
                  onChange={e => {
                    setCustomSponsorInput(e.target.value);
                    setSelectedSponsorId('');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Enter referral code, partner ID, customer ID, or mobile number of the sponsor.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLinkSponsorModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Upline Link</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
