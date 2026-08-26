import React, { useState } from 'react';
import { useCRM } from '../store';
import { WhatsAppMessage, CustomerPerformance } from '../types';
import { 
  MessageSquare, Send, Smartphone, Clock, Settings, FileText, Check, 
  User, Database, Sparkles, CheckCheck, HelpCircle, Link, RefreshCw,
  Trash2, Search, Users, ShieldCheck, ArrowRight, Activity, AlertCircle
} from 'lucide-react';

export default function WhatsAppIntegrationView() {
  const { 
    hasAccess, customers, whatsAppMessages, sendWhatsAppMessage, 
    whatsAppSequence, updateSequenceStep, whatsAppTemplates,
    deleteAllWhatsAppMessages, syncCustomersToWhatsAppContacts, currentUser,
    referrals
  } = useCRM();

  // Tab selections
  // 'customers' = Customers Chat
  // 'referrals' = Referral Partners Chat
  // 'delivery_logs' = Messages Delivery & Read status tracker
  // 'templates' = Meta Webhook Templates
  // 'sequences' = Automated sequences Delay Schedule
  const [whatsTab, setWhatsTab] = useState<'customers' | 'referrals' | 'delivery_logs' | 'templates' | 'sequences'>('customers');

  // Customer Chat specific States
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [typedMessageCustomer, setTypedMessageCustomer] = useState('');
  const [selectedTemplateCustomer, setSelectedTemplateCustomer] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Referral Chat specific States
  const [selectedReferralId, setSelectedReferralId] = useState<string>(referrals[0]?.id || '');
  const [typedMessageReferral, setTypedMessageReferral] = useState('');
  const [selectedTemplateReferral, setSelectedTemplateReferral] = useState<string>('');
  const [referralSearchQuery, setReferralSearchQuery] = useState('');

  // Delivery log specific filters and states
  const [searchTermLog, setSearchTermLog] = useState('');
  const [statusLogFilter, setStatusLogFilter] = useState<'all' | 'sent' | 'delivered' | 'read'>('all');
  const [typeLogFilter, setTypeLogFilter] = useState<'all' | 'customer' | 'referral'>('all');

  // Feedback states
  const [sequenceAlertMsg, setSequenceAlertMsg] = useState<string | null>(null);
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<'single_contact' | 'all_contacts' | null>(null);

  if (!hasAccess('WhatsApp Integration', 'read')) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-800" id="access-denied-whatsapp">
        <h3 className="font-bold text-lg mb-2">Security Authorization Required</h3>
        <p className="text-sm">Your active role profile is unauthorized for Customer Correspondence modules. Shift perspective to Support, Sales, or Admin.</p>
      </div>
    );
  }

  const isSensitiveRole = currentUser && ['Support', 'Marketing', 'Sales'].includes(currentUser.role);

  // Filter systems
  const filteredCustomersList = customers
    .filter(c => c.mobileNumber)
    .filter(c => {
      if (!customerSearchQuery) return true;
      const query = customerSearchQuery.toLowerCase();
      return (c.name || '').toLowerCase().includes(query) || 
             (c.company || '').toLowerCase().includes(query) || 
             (c.mobileNumber || '').includes(query);
    });

  const filteredReferralsList = referrals
    .filter(r => r.mobileNumber)
    .filter(r => {
      if (!referralSearchQuery) return true;
      const query = referralSearchQuery.toLowerCase();
      return r.name.toLowerCase().includes(query) || 
             r.referralId.toLowerCase().includes(query) || 
             r.mobileNumber.includes(query);
    });

  // Current active profiles
  const activeCustomer = customers.find(c => c.id === selectedCustomerId);
  const activeReferral = referrals.find(r => r.id === selectedReferralId);

  // Active chat arrays
  const activeCustomerMessages = whatsAppMessages
    .filter(m => m.phone === activeCustomer?.mobileNumber?.replace(/\D/g, ''))
    .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const activeReferralMessages = whatsAppMessages
    .filter(m => activeReferral && m.phone === activeReferral.mobileNumber.replace(/\D/g, ''))
    .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Customer Chat Handlers
  const handleSendCustomerMessage = (e?: React.FormEvent, isReal: boolean = false) => {
    if (e) e.preventDefault();
    if (!typedMessageCustomer || !activeCustomer || !hasAccess('WhatsApp Integration', 'create')) return;

    if (isReal) {
      sendWhatsAppMessage(activeCustomer.mobileNumber, typedMessageCustomer);
      const phoneClean = activeCustomer.phone.replace(/\D/g, '');
      const waUrl = `https://wa.me/${phoneClean}?text=${encodeURIComponent(typedMessageCustomer)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      sendWhatsAppMessage(activeCustomer.phone, typedMessageCustomer, activeCustomer.id);
    }
    setTypedMessageCustomer('');
  };

  const handleSendCustomerTemplate = (isReal: boolean = false) => {
    if (!selectedTemplateCustomer || !activeCustomer) return;
    const template = whatsAppTemplates.find(t => t.id === selectedTemplateCustomer);
    if (!template) return;

    const body = template.body
      .replace('{{name}}', activeCustomer.name)
      .replace('{{company}}', activeCustomer.company);

    if (isReal) {
      sendWhatsAppMessage(activeCustomer.phone, body, activeCustomer.id, template.name);
      const phoneClean = activeCustomer.phone.replace(/\D/g, '');
      const waUrl = `https://wa.me/${phoneClean}?text=${encodeURIComponent(body)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      sendWhatsAppMessage(activeCustomer.phone, body, activeCustomer.id, template.name);
    }
    setSelectedTemplateCustomer('');
  };

  // Referral Partner Chat Handlers
  const handleSendReferralMessage = (e?: React.FormEvent, isReal: boolean = false) => {
    if (e) e.preventDefault();
    if (!typedMessageReferral || !activeReferral || !hasAccess('WhatsApp Integration', 'create')) return;

    const phoneClean = activeReferral.mobileNumber.replace(/\D/g, '');
    if (isReal) {
      sendWhatsAppMessage(activeReferral.mobileNumber, typedMessageReferral, activeReferral.id);
      const waUrl = `https://wa.me/${phoneClean}?text=${encodeURIComponent(typedMessageReferral)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      sendWhatsAppMessage(activeReferral.mobileNumber, typedMessageReferral, activeReferral.id);
    }
    setTypedMessageReferral('');
  };

  const handleSendReferralTemplate = (isReal: boolean = false) => {
    if (!selectedTemplateReferral || !activeReferral) return;
    const template = whatsAppTemplates.find(t => t.id === selectedTemplateReferral);
    if (!template) return;

    const body = template.body
      .replace('{{name}}', activeReferral.name)
      .replace('{{company}}', activeReferral.referralId); // Substituting referral id for company/code

    const phoneClean = activeReferral.mobileNumber.replace(/\D/g, '');
    if (isReal) {
      sendWhatsAppMessage(activeReferral.mobileNumber, body, activeReferral.id, template.name);
      const waUrl = `https://wa.me/${phoneClean}?text=${encodeURIComponent(body)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      sendWhatsAppMessage(activeReferral.mobileNumber, body, activeReferral.id, template.name);
    }
    setSelectedTemplateReferral('');
  };

  const handleSyncCustomers = () => {
    const res = syncCustomersToWhatsAppContacts();
    if (res.permissionDenied) {
      setWhatsAppFeedback("Access Denied: You don't have permission to sync contacts.");
    } else {
      setWhatsAppFeedback(`Successfully synced ${res.successCount} customer(s). ${res.skippedCount} duplicates/skipped.`);
    }
    setTimeout(() => setWhatsAppFeedback(null), 5000);
  };

  const handleToggleSequence = (id: string, active: boolean) => {
    updateSequenceStep(id, { isActive: !active });
    setSequenceAlertMsg(`Sequence trigger step ${id} successfully toggled.`);
    setTimeout(() => setSequenceAlertMsg(null), 2500);
  };

  const handleUpdateSequenceDelay = (id: string, delay: number) => {
    updateSequenceStep(id, { delayHours: Math.max(1, delay) });
  };

  // Delivery log message helpers
  const enrichedLogs = whatsAppMessages.map(m => {
    // Try to find if either a customer or a referral partner corresponds to this message
    const customerMatch = customers.find(c => (c.mobileNumber && c.mobileNumber.replace(/\D/g, '') === m.phone.replace(/\D/g, '')));
    const referralMatch = referrals.find(r => (r.mobileNumber && r.mobileNumber.replace(/\D/g, '') === m.phone.replace(/\D/g, '')));
    
    return {
      ...m,
      recipientName: customerMatch ? customerMatch.name : (referralMatch ? referralMatch.name : 'Unknown Recipient'),
      recipientType: customerMatch ? 'Customer' : (referralMatch ? 'Referral Partner' : 'Direct Target'),
      recipientId: customerMatch ? customerMatch.id : (referralMatch ? referralMatch.id : null),
      companyOrCode: customerMatch ? customerMatch.company : (referralMatch ? referralMatch.referralId : 'N/A')
    };
  });

  const filteredLogs = enrichedLogs.filter(log => {
    // Filters by text search
    const matchesSearch = log.phone.includes(searchTermLog) || 
                          log.recipientName.toLowerCase().includes(searchTermLog.toLowerCase()) || 
                          log.content.toLowerCase().includes(searchTermLog.toLowerCase()) ||
                          log.companyOrCode.toLowerCase().includes(searchTermLog.toLowerCase());
    
    // Filters by type selector
    const matchesType = typeLogFilter === 'all' || 
                        (typeLogFilter === 'customer' && log.recipientType === 'Customer') ||
                        (typeLogFilter === 'referral' && log.recipientType === 'Referral Partner');

    // Filters by status selector
    const matchesStatus = statusLogFilter === 'all' || log.status === statusLogFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Calculate delivery and read counters
  const totalLogsCount = whatsAppMessages.length;
  const sentCount = whatsAppMessages.filter(m => m.status === 'sent').length;
  const deliveredCount = whatsAppMessages.filter(m => m.status === 'delivered' || m.status === 'read').length;
  const readCount = whatsAppMessages.filter(m => m.status === 'read').length;
  const readRate = totalLogsCount > 0 ? Math.round((readCount / totalLogsCount) * 100) : 0;
  const deliveryRate = totalLogsCount > 0 ? Math.round((deliveredCount / totalLogsCount) * 100) : 0;

  return (
    <div className="space-y-6" id="whatsapp-container">
      {/* Upper bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-5.5 h-5.5 text-emerald-500 animate-pulse animate-duration-2000" />
            Meta WhatsApp Advanced Automation Node
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Automate outbound triggers, coordinate verified referral onboarding templates, and sync status transmissions.
          </p>
        </div>

        {/* Top-Level Tab Selection Pill - responsive Wrap layout */}
        <div className="flex flex-wrap bg-slate-100/80 border border-slate-200 rounded-2xl p-1 gap-1 shrink-0 self-start xl:self-auto shadow-sm">
          {[
            { id: 'customers', label: 'Customers', count: customers.filter(c => c.mobileNumber).length },
            { id: 'referrals', label: 'Referral Partners', count: referrals.filter(r => r.mobileNumber).length },
            { id: 'delivery_logs', label: 'Delivery & Audit Tracker', isLogs: true },
            { id: 'templates', label: 'Meta Templates' },
            { id: 'sequences', label: 'Sequence Pipeline' }
          ].map((tab) => {
            const isActive = whatsTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setWhatsTab(tab.id as any)}
                type="button"
                className={`px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  isActive 
                    ? 'bg-slate-900 text-white shadow-sm' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
                id={`wa-tab-${tab.id}`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-200 text-slate-700'}`}>
                    {tab.count}
                  </span>
                )}
                {tab.isLogs && (
                  <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${whatsAppMessages.some(m => m.status === 'sent') ? 'animate-ping' : ''}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {sequenceAlertMsg && (
        <div className="bg-orange-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl text-xs font-bold animate-fadeIn">
          {sequenceAlertMsg}
        </div>
      )}

      {/* Main Tab Panels */}
      {whatsTab === 'customers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          {/* Left Panel: Customer Recipients Selector */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm lg:col-span-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-1">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-indigo-500" />
                  Active Customers
                </h3>
              </div>

              {/* Live search for Customers */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search customer by name or phone..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8.5 pr-3 py-2 bg-slate-50 border border-slate-250 rounded-xl placeholder-slate-450 focus:border-indigo-500 focus:bg-white outline-none transition font-medium"
                />
              </div>

              {/* Scrollable Customer List */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredCustomersList.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 italic">
                    No customers found matching search.
                  </div>
                ) : (
                  filteredCustomersList.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                        selectedCustomerId === c.id 
                          ? 'bg-emerald-50/70 border-emerald-400 font-bold shadow-xs' 
                          : 'bg-slate-50 hover:bg-slate-100/90 border-slate-150'
                      }`}
                    >
                      <div>
                        <div className="text-xs text-slate-800 leading-tight font-bold">{c.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-medium">{c.company} &bull; {c.mobileNumber}</div>
                      </div>
                      <span className="text-[9px] bg-slate-200/80 px-1.5 py-0.5 rounded font-black font-sans uppercase">
                        {c.tier}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {/* CRM insights */}
              {activeCustomer && (
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-3 text-[11px] space-y-1.5 animate-fadeIn">
                  <h4 className="font-extrabold text-slate-800 border-b border-slate-200 pb-1 flex items-center gap-1 uppercase tracking-wider text-[9px]">
                    <User className="w-3 h-3 text-indigo-500" />
                    Target Customer Insight:
                  </h4>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Company:</span>
                    <strong className="text-slate-800">{activeCustomer.company}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Phone Contact:</span>
                    <strong className="text-slate-800">{activeCustomer.mobileNumber}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Outbound Template Injector inside Selected contact view */}
            {hasAccess('WhatsApp Integration', 'create') && activeCustomer && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Template Quick Inject:</label>
                <div className="flex gap-1.5">
                  <select
                    value={selectedTemplateCustomer}
                    onChange={e => setSelectedTemplateCustomer(e.target.value)}
                    className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 font-medium cursor-pointer"
                  >
                    <option value="">Select template...</option>
                    {whatsAppTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSendCustomerTemplate(false)}
                    disabled={!selectedTemplateCustomer}
                    className="px-2.5 py-2 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 bg-white rounded-lg transition shrink-0 cursor-pointer text-xs font-black uppercase tracking-wider"
                    title="Simulate transmission internally"
                  >
                    Simulate
                  </button>
                  <button
                    onClick={() => handleSendCustomerTemplate(true)}
                    disabled={!selectedTemplateCustomer}
                    className="p-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition shrink-0 cursor-pointer text-xs font-bold flex items-center gap-1 shadow-sm"
                    title="Send via Real WhatsApp API launch link"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 flex items-center gap-1 leading-normal">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Inputs variables like customer and company names automatically.
                </p>
              </div>
            )}
          </div>

          {/* Right Panel: Simulated iPhone Chat Display */}
          <div className="bg-slate-900 border border-slate-950 rounded-2xl h-[460px] lg:col-span-8 shadow-inner flex flex-col justify-between relative overflow-hidden" id="chat-terminal-customers">
            {/* Header */}
            <div className="bg-slate-850 px-4 py-3 flex items-center justify-between border-b border-slate-850/80 z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 text-sm font-bold flex items-center justify-center border border-emerald-500/30">
                  {activeCustomer?.name.slice(0, 2).toUpperCase() || 'CU'}
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-xs leading-none">{activeCustomer?.name || 'VIO Support Desk'}</h4>
                  <p className="text-[10px] text-emerald-400 mt-1 leading-none font-medium">
                    {activeCustomer?.phone || 'Online Client'} &bull; Customer Segment
                  </p>
                </div>
              </div>

              <div className="text-[10px] font-black text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-900/30 font-sans tracking-wide">
                CUSTOMER WEBHOOK LINK
              </div>
            </div>

            {/* Message Pane */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col pt-4 bg-slate-950/95 scrollbar-thin">
              {activeCustomerMessages.length === 0 ? (
                <div className="my-auto text-center text-slate-500 text-xs italic py-10">
                  No conversational record. Select template or compose text below to trigger outbound transmission.
                </div>
              ) : (
                activeCustomerMessages.map((m) => {
                  const isOutgoing = m.direction === 'Outgoing';
                  return (
                    <div 
                      key={m.id} 
                      className={`max-w-[75%] p-3 rounded-2xl text-xs leading-relaxed relative font-medium ${
                        isOutgoing 
                          ? 'ml-auto bg-emerald-600 text-white rounded-tr-none' 
                          : 'mr-auto bg-slate-800 text-slate-100 rounded-tl-none border border-slate-750'
                      }`}
                    >
                      {m.templateName && (
                        <span className="block text-[8px] opacity-75 font-bold uppercase tracking-widest mb-1.5 font-mono text-emerald-200">
                          Template: {m.templateName}
                        </span>
                      )}
                      
                      <p className="whitespace-pre-wrap">{m.content}</p>

                      <div className="flex items-center justify-end gap-1.5 text-[8.5px] opacity-80 mt-1.5 text-right font-mono">
                        {isOutgoing && (
                          <a
                            href={`https://wa.me/${m.phone.replace(/\D/g, '')}?text=${encodeURIComponent(m.content)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mr-auto text-[8px] text-teal-100 hover:underline font-bold shrink-0 uppercase tracking-widest cursor-pointer bg-black/20 px-1 py-0.5 rounded"
                          >
                            🚀 Send Real
                          </a>
                        )}
                        <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        
                        {isOutgoing && (
                          m.status === 'read' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                          ) : m.status === 'delivered' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-400" />
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Outbound composition bar */}
            {activeCustomer ? (
              hasAccess('WhatsApp Integration', 'create') ? (
                <div className="bg-slate-850 p-3 border-t border-slate-800 flex flex-col gap-2">
                  <form onSubmit={(e) => handleSendCustomerMessage(e, false)} className="flex gap-2 items-center" id="wa-cust-text-form">
                    <input 
                      type="text"
                      placeholder="Compose secure outbound message..."
                      value={typedMessageCustomer}
                      onChange={e => setTypedMessageCustomer(e.target.value)}
                      className="flex-1 text-xs bg-slate-950 border border-slate-750 text-white placeholder-slate-500 rounded-xl p-2.5 outline-none focus:border-indigo-500 transition font-medium"
                      id="typed-wa-msg-cust"
                    />
                    <button
                      type="submit"
                      className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-slate-700"
                      title="Simulate transmission internally"
                    >
                      <Database className="w-3.5 h-3.5 text-slate-400" />
                      <span>Simulate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendCustomerMessage(undefined, true)}
                      className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-black uppercase tracking-wider shadow-sm"
                      title="Send via real WhatsApp link"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Real</span>
                    </button>
                  </form>
                  <div className="flex items-center justify-between text-[9px] text-slate-500 px-1 font-mono">
                    <span>Target Phone: <strong className="text-emerald-400">{activeCustomer.phone}</strong></span>
                    <span>⚡ Real WhatsApp transmission uses the official Web URL link gateway.</span>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-850 p-3 border-t border-slate-800 text-center text-xs text-slate-400 italic font-medium">
                  Read Only: Switch role to generate outbound messages.
                </div>
              )
            ) : (
              <div className="bg-slate-850 p-3 border-t border-slate-800 text-center text-xs text-slate-400 italic font-medium">
                Please select a recipient contact on the left list view to chat.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. REFERRAL PARTNERS CHAT TAB */}
      {whatsTab === 'referrals' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          {/* Left Panel: Referral Recipients Selector */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm lg:col-span-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-1">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-emerald-500" />
                  Referral Partners
                </h3>
                <span className="text-[9px] font-bold text-slate-400 italic">
                  Approved & Onboarded
                </span>
              </div>

              {/* Live search for Referral partners */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search partner by name or code..."
                  value={referralSearchQuery}
                  onChange={(e) => setReferralSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8.5 pr-3 py-2 bg-slate-50 border border-slate-250 rounded-xl placeholder-slate-450 focus:border-indigo-500 focus:bg-white outline-none transition font-medium"
                />
              </div>

              {/* Scrollable Referral Partner List */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {filteredReferralsList.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 italic">
                    No approved partners with mobile contact found.
                  </div>
                ) : (
                  filteredReferralsList.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedReferralId(r.id)}
                      className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                        selectedReferralId === r.id 
                          ? 'bg-indigo-50/70 border-indigo-400 font-bold shadow-xs' 
                          : 'bg-slate-50 hover:bg-slate-100/90 border-slate-150'
                      }`}
                    >
                      <div>
                        <div className="text-xs text-slate-800 leading-tight font-bold">{r.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Code: <strong className="text-indigo-600 font-mono">{r.referralId}</strong> &bull; {r.mobileNumber}</div>
                      </div>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${
                        r.status === 'Active' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-250' 
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {r.status === 'Active' ? 'Active' : r.status}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {/* CRM Referral Profile insights */}
              {activeReferral && (
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-3 text-[11px] space-y-1.5 animate-fadeIn">
                  <h4 className="font-extrabold text-slate-800 border-b border-slate-200 pb-1 flex items-center gap-1 uppercase tracking-wider text-[9px]">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    Affiliate Partner Insights:
                  </h4>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Referral Code:</span>
                    <strong className="text-indigo-650 font-mono bg-indigo-50 px-1 rounded">{activeReferral.referralId}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Mobile:</span>
                    <strong className="text-slate-800">{activeReferral.mobileNumber}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Verification Status:</span>
                    <span className="text-emerald-600 font-extrabold">APPROVED &bull; ACTIVE</span>
                  </div>
                  {activeReferral.email && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">Secure Email:</span>
                      <strong className="text-slate-800 text-[10px] truncate max-w-[120px]">{activeReferral.email}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Outbound Template Injector inside Selected referral view */}
            {hasAccess('WhatsApp Integration', 'create') && activeReferral && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Template Partner Inject:</label>
                <div className="flex gap-1.5">
                  <select
                    value={selectedTemplateReferral}
                    onChange={e => setSelectedTemplateReferral(e.target.value)}
                    className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 font-medium cursor-pointer"
                  >
                    <option value="">Select template...</option>
                    {whatsAppTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSendReferralTemplate(false)}
                    disabled={!selectedTemplateReferral}
                    className="px-2.5 py-2 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 bg-white rounded-lg transition shrink-0 cursor-pointer text-xs font-black uppercase tracking-wider"
                    title="Simulate transmission internally"
                  >
                    Simulate
                  </button>
                  <button
                    onClick={() => handleSendReferralTemplate(true)}
                    disabled={!selectedTemplateReferral}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition shrink-0 cursor-pointer text-xs font-bold flex items-center gap-1 shadow-sm"
                    title="Send via Real WhatsApp API launch link"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 mt-1 flex items-center gap-1 leading-normal">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Inputs referral name and code automatically.
                </p>
              </div>
            )}
          </div>

          {/* Right Panel: Simulated iPhone Chat Display for Referral Partners */}
          <div className="bg-slate-900 border border-slate-950 rounded-2xl h-[460px] lg:col-span-8 shadow-inner flex flex-col justify-between relative overflow-hidden" id="chat-terminal-referrals">
            {/* Header */}
            <div className="bg-slate-850 px-4 py-3 flex items-center justify-between border-b border-slate-850/80 z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-800 text-sm font-bold flex items-center justify-center border border-indigo-500/30">
                  {activeReferral?.name.slice(0, 2).toUpperCase() || 'RP'}
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-xs leading-none">{activeReferral?.name || 'VIO Support Desk'}</h4>
                  <p className="text-[10px] text-indigo-400 mt-1 leading-none font-medium">
                    Code: <strong className="text-white font-mono">{activeReferral?.referralId || 'N/A'}</strong> &bull; {activeReferral?.mobileNumber || 'Online Partner'}
                  </p>
                </div>
              </div>

              <div className="text-[10px] font-black text-indigo-400 bg-indigo-950/40 px-2.5 py-1 rounded-full border border-indigo-900/30 font-sans tracking-wide uppercase">
                Partner Channel Verified
              </div>
            </div>

            {/* Message Pane */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col pt-4 bg-slate-950/95 scrollbar-thin">
              {activeReferralMessages.length === 0 ? (
                <div className="my-auto text-center text-slate-500 text-xs italic py-10">
                  No conversational record. Select template or compose welcome text below to communicate with the partner.
                </div>
              ) : (
                activeReferralMessages.map((m) => {
                  const isOutgoing = m.direction === 'Outgoing';
                  return (
                    <div 
                      key={m.id} 
                      className={`max-w-[75%] p-3 rounded-2xl text-xs leading-relaxed relative font-medium ${
                        isOutgoing 
                          ? 'ml-auto bg-indigo-650 text-white rounded-tr-none' 
                          : 'mr-auto bg-slate-800 text-slate-100 rounded-tl-none border border-slate-750'
                      }`}
                    >
                      {m.templateName && (
                        <span className="block text-[8px] opacity-75 font-bold uppercase tracking-widest mb-1.5 font-mono text-indigo-200">
                          Template: {m.templateName}
                        </span>
                      )}
                      
                      <p className="whitespace-pre-wrap">{m.content}</p>

                      <div className="flex items-center justify-end gap-1.5 text-[8.5px] opacity-80 mt-1.5 text-right font-mono">
                        {isOutgoing && (
                          <a
                            href={`https://wa.me/${m.phone.replace(/\D/g, '')}?text=${encodeURIComponent(m.content)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mr-auto text-[8px] text-indigo-100 hover:underline font-bold shrink-0 uppercase tracking-widest cursor-pointer bg-black/20 px-1 py-0.5 rounded"
                          >
                            🚀 Send Real
                          </a>
                        )}
                        <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        
                        {isOutgoing && (
                          m.status === 'read' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-indigo-300" />
                          ) : m.status === 'delivered' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-400" />
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Outbound composition bar */}
            {activeReferral ? (
              hasAccess('WhatsApp Integration', 'create') ? (
                <div className="bg-slate-850 p-3 border-t border-slate-800 flex flex-col gap-2">
                  <form onSubmit={(e) => handleSendReferralMessage(e, false)} className="flex gap-2 items-center" id="wa-ref-text-form">
                    <input 
                      type="text"
                      placeholder="Compose secure outbound message to partner..."
                      value={typedMessageReferral}
                      onChange={e => setTypedMessageReferral(e.target.value)}
                      className="flex-1 text-xs bg-slate-950 border border-slate-750 text-white placeholder-slate-500 rounded-xl p-2.5 outline-none focus:border-indigo-500 transition font-medium"
                      id="typed-wa-msg-ref"
                    />
                    <button
                      type="submit"
                      className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-slate-700"
                      title="Simulate transmission internally"
                    >
                      <Database className="w-3.5 h-3.5 text-slate-400" />
                      <span>Simulate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendReferralMessage(undefined, true)}
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-black uppercase tracking-wider shadow-sm"
                      title="Send via real WhatsApp link"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Real</span>
                    </button>
                  </form>
                  <div className="flex items-center justify-between text-[9px] text-slate-500 px-1 font-mono">
                    <span>Partner Mobile: <strong className="text-indigo-400">{activeReferral.mobileNumber}</strong></span>
                    <span>⚡ Real WhatsApp transmission uses the official Web URL link gateway.</span>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-850 p-3 border-t border-slate-800 text-center text-xs text-slate-400 italic font-medium">
                  Read Only: Switch role to generate outbound messages.
                </div>
              )
            ) : (
              <div className="bg-slate-850 p-3 border-t border-slate-800 text-center text-xs text-slate-400 italic font-medium">
                Please select a referral partner on the left list view to chat.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. DELIVERY & READ TRACKER COMPLIANCE TAB */}
      {whatsTab === 'delivery_logs' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-6 animate-fadeIn" id="wa-delivery-checker">
          {/* Section banner */}
          <div className="border-b border-slate-100 pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <Activity className="w-4.5 h-4.5 text-indigo-500" />
                Live Messaging Delivery Status & Read Audit Tracker
              </h3>
              <p className="text-xs text-slate-500">
                Track full outbound message notification lifecycles (Sent ➔ Delivered ➔ Read) with enterprise audit logs compliance.
              </p>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-slate-600 font-bold">Meta Webhook Live sync</span>
            </div>
          </div>

          {/* KPI Analytics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 shadow-xs">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Dispatched</span>
              <div className="text-2xl font-black text-slate-800 mt-1">{totalLogsCount}</div>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">Accumulated outbound attempts</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 shadow-xs">
              <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Transmission (Sent)</span>
              <div className="text-2xl font-black text-indigo-700 mt-1">{sentCount}</div>
              <p className="text-[10px] text-slate-500 mt-1 font-semibold">Awaiting gateway verification</p>
            </div>

            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-xs">
              <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Delivery Rate (Delivered)</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-800 mt-1">{deliveryRate}%</span>
                <span className="text-[10px] font-bold text-emerald-600">({deliveredCount} msgs)</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">Successfully pushed to devices</p>
            </div>

            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 shadow-xs">
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider font-mono">Audited Read Rate</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-indigo-800 mt-1">{readRate}%</span>
                <span className="text-[10px] font-bold text-indigo-600">({readCount} msgs)</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-semibold">Recipient device read webhook verified</p>
            </div>
          </div>

          {/* Filter options */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search logs by name, phone or body..."
                value={searchTermLog}
                onChange={(e) => setSearchTermLog(e.target.value)}
                className="w-full text-xs pl-9.5 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl placeholder-slate-400 focus:border-indigo-500 outline-none transition font-medium"
              />
            </div>

            {/* Segment selectors */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Type:</span>
                <select
                  value={typeLogFilter}
                  onChange={(e: any) => setTypeLogFilter(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg p-1.5 text-slate-705 font-bold cursor-pointer"
                >
                  <option value="all">All Contacts</option>
                  <option value="customer">Customers Only</option>
                  <option value="referral">Referral Partners Only</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Milestone:</span>
                <select
                  value={statusLogFilter}
                  onChange={(e: any) => setStatusLogFilter(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg p-1.5 text-slate-705 font-bold cursor-pointer"
                >
                  <option value="all">All status</option>
                  <option value="sent">Sent Node</option>
                  <option value="delivered">Delivered Node</option>
                  <option value="read">Read Node</option>
                </select>
              </div>

              <button
                onClick={() => {
                  setSearchTermLog('');
                  setStatusLogFilter('all');
                  setTypeLogFilter('all');
                }}
                className="px-2 py-1 text-[11px] font-bold text-indigo-650 hover:underline hover:text-indigo-805 cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Delivery & Read Tracker Log Table Grid */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-550 border-b border-slate-200 font-black tracking-wider uppercase text-[9.5px]">
                    <th className="p-4" style={{ minWidth: '150px' }}>Recipient & Identity</th>
                    <th className="p-4">Contact Type</th>
                    <th className="p-4" style={{ minWidth: '220px' }}>Transmitted Content (Body)</th>
                    <th className="p-4">Timeline</th>
                    <th className="p-4" style={{ minWidth: '180px' }}>Delivery Lifespan Transition</th>
                    <th className="p-4 text-right">Audit Compliant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                        No auditable communication transmissions matched selected target criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      return (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition">
                          {/* Recipient info */}
                          <td className="p-4 font-bold">
                            <div className="text-slate-800">{log.recipientName}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{log.phone}</div>
                          </td>

                          {/* Recipient Class */}
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase ${
                              log.recipientType === 'Customer' 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                            }`}>
                              {log.recipientType}
                            </span>
                          </td>

                          {/* Message Body */}
                          <td className="p-4 text-slate-650">
                            <div className="max-w-[280px] truncate" title={log.content}>
                              {log.templateName && (
                                <span className="block text-[8px] font-black text-indigo-650 uppercase font-mono tracking-widest bg-indigo-50/70 w-fit px-1 rounded mb-1 border border-indigo-100">
                                  Meta: {log.templateName}
                                </span>
                              )}
                              <p className="italic font-medium leading-normal">&ldquo;{log.content}&rdquo;</p>
                            </div>
                          </td>

                          {/* Timestamps */}
                          <td className="p-4 text-slate-500 font-medium whitespace-nowrap">
                            <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                            <div className="text-[9.5px] font-mono mt-0.5">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>

                          {/* Delivery Lifespan Progression Stages sent ➔ delivered ➔ read */}
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              <div className="flex items-center gap-1 bg-slate-50 border border-slate-150 p-1 rounded-lg">
                                {/* Sent Node */}
                                <div className="flex items-center gap-1 px-1 py-0.5 rounded bg-sky-50 text-sky-750 font-bold text-[8.5px] border border-sky-100">
                                  <Check className="w-2.5 h-2.5 text-sky-600" />
                                  <span>Sent</span>
                                </div>
                                <ArrowRight className="w-2.5 h-2.5 text-slate-350" />

                                {/* Delivered Node */}
                                <div className={`flex items-center gap-1 px-1 py-0.5 rounded text-[8.5px] font-bold border transition ${
                                  log.status === 'delivered' || log.status === 'read'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-100 text-slate-400 border-slate-150 opacity-45'
                                }`}>
                                  <CheckCheck className={`w-2.5 h-2.5 ${log.status === 'delivered' || log.status === 'read' ? 'text-amber-500' : 'text-slate-400'}`} />
                                  <span>Delivered</span>
                                </div>
                                <ArrowRight className="w-2.5 h-2.5 text-slate-355" />

                                {/* Read Node */}
                                <div className={`flex items-center gap-1 px-1 py-0.5 rounded text-[8.5px] font-bold border transition ${
                                  log.status === 'read'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-350'
                                    : 'bg-slate-100 text-slate-400 border-slate-150 opacity-45'
                                }`}>
                                  <CheckCheck className={`w-2.5 h-2.5 ${log.status === 'read' ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
                                  <span>Read</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Audit Certificate Token */}
                          <td className="p-4 text-right">
                            <div className="text-[10px] font-mono text-slate-400 select-all" title={`Verification SHA: SHA256-${log.id}`}>
                              {log.id.slice(0, 12)}...
                            </div>
                            <span className="text-[8px] uppercase tracking-widest font-black text-emerald-600 block mt-0.5 font-sans">
                              ● Compliant
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination / Table summary Footer */}
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-550 font-bold">
              <span>Showing <strong>{filteredLogs.length}</strong> of <strong>{whatsAppMessages.length}</strong> communication logs</span>
              <div className="flex gap-1">
                <span className="font-mono text-[10px] text-slate-450 bg-white border border-slate-200 p-1 rounded">SSL Secure v3</span>
                <span className="font-mono text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-150 p-1 rounded">Audit Compliant</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. META WEBHOOK TEMPLATES TAB */}
      {whatsTab === 'templates' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 animate-fadeIn" id="wa-templates-panel">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">Approved Meta Webhook Message Templates</h3>
              <p className="text-xs text-slate-500">Secure automated communications templates mapped to Meta Business API standards</p>
            </div>
            
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Database className="w-5 h-5" />
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {whatsAppTemplates.map(t => (
              <div key={t.id} className="p-4 bg-slate-50 border border-slate-150 rounded-xl relative hover:border-slate-300 transition">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <span className="font-bold text-xs text-slate-800 font-mono underline">{t.name}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    t.category === 'Welcome' ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' :
                    t.category === 'FollowUp' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' :
                    'bg-amber-50 text-amber-700 border border-amber-150'
                  }`}>
                    {t.category}
                  </span>
                </div>
                
                <p className="text-xs text-slate-605 font-medium leading-relaxed bg-white border border-slate-100 rounded-lg p-2.5 italic">
                  &ldquo;{t.body}&rdquo;
                </p>

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                  <span>Variables: <strong className="text-slate-700">{t.variables.join(', ') || 'None'}</strong></span>
                  <span className="text-emerald-600">Meta Config: ACTIVE</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. WORKFLOW TRIGGER SEQUENCES TAB */}
      {whatsTab === 'sequences' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 animate-fadeIn" id="wa-sequences-panel">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">Automated Outbound Nurturing Sequences</h3>
              <p className="text-xs text-slate-500">Scale campaigns automatically with time-delayed WhatsApp trigger workflows</p>
            </div>

            <Clock className="w-5 h-5 text-indigo-500" />
          </div>

          <div className="space-y-4 font-medium">
            {whatsAppSequence.map((step, idx) => {
              const matchedTemplate = whatsAppTemplates.find(t => t.id === step.templateId);

              return (
                <div 
                  key={step.id} 
                  className={`p-4 border rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
                    step.isActive ? 'bg-white border-indigo-200/85 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                      #{idx + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">
                        Delayed Automation: Trigger Template [ {matchedTemplate?.name || 'Unresolved'} ]
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                        Will deliver onboarding sequence steps after threshold constraints are met.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-none pt-2 md:pt-0">
                    {/* Time delays modification */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500 font-semibold">Buffer delay:</span>
                      {hasAccess('WhatsApp Integration', 'edit') ? (
                        <input 
                          type="number"
                          min="1"
                          max="168"
                          value={step.delayHours}
                          onChange={(e) => handleUpdateSequenceDelay(step.id, parseInt(e.target.value))}
                          className="w-12 p-1 border border-slate-200 rounded text-center font-bold text-slate-800 bg-slate-50 font-mono"
                        />
                      ) : (
                        <strong className="text-slate-700">{step.delayHours}</strong>
                      )}
                      <span className="text-slate-500 font-semibold">hours</span>
                    </div>

                    {/* Active toggle */}
                    {hasAccess('WhatsApp Integration', 'edit') ? (
                      <button
                        onClick={() => handleToggleSequence(step.id, step.isActive)}
                        className={`px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          step.isActive 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                            : 'bg-slate-200 hover:bg-slate-250 text-slate-705'
                        }`}
                      >
                        {step.isActive ? 'Active Pipeline' : 'Paused'}
                      </button>
                    ) : (
                      <span className={`text-[10px] font-extrabold ${step.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {step.isActive ? '● IN SERVICE' : '● EXCLUDED'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
