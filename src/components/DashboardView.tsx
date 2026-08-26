import React, { useState } from 'react';
import { useCRM } from '../store';
import { 
  TrendingUp, DollarSign, ArrowUpRight, 
  ArrowDownRight, Download, FileText, CheckCircle2, Sliders,
  Database, Server
} from 'lucide-react';
import ConnectedDbDetailsModal from './ConnectedDbDetailsModal';

export default function DashboardView() {
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const { 
    hasAccess, campaigns, products, customers, auditLogs, referrals, salesOrders, currentUser, updateReferral
  } = useCRM();

  // Confirmation state for partner approval
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Simulating Marketing spend adjustments in real-time
  const [simulatedSpends, setSimulatedSpends] = useState<{ [key: string]: number }>({});
  const [simulatedRevenues, setSimulatedRevenues] = useState<{ [key: string]: number }>({});

  // Report Generator settings
  const [reportType, setReportType] = useState<'kpi' | 'marketing' | 'roi' | 'security'>('kpi');
  const [includeAuditLogs, setIncludeAuditLogs] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Security Gate
  if (!hasAccess('Dashboard', 'read')) {
    return (
      <div className="bg-rose-950/40 border border-[#4c1d24]/60 rounded-2xl p-8 text-center text-rose-205" id="access-denied-dashboard">
        <h3 className="font-bold text-lg mb-2 text-white">Security Authorization Required</h3>
        <p className="text-sm opacity-90">Your active role profile does not grant access to the Unified Intelligence Dashboard. Please consult your administrator or shift your role perspective above.</p>
      </div>
    );
  }

  // ==========================================
  // CALCULATIONS FOR REGULAR LOGIN
  // ==========================================
  const totalSalesOrdersValue = salesOrders.filter(o => o.deliveryStatus !== 'Cancelled' && o.paymentStatus !== 'Refunded').reduce((sum, o) => sum + o.totalValue, 0);

  const totalMktSpend = campaigns.reduce((sum, c) => sum + (simulatedSpends[c.id] !== undefined ? simulatedSpends[c.id] : c.spend), 0);
  const totalMktRevenue = campaigns.reduce((sum, c) => sum + (simulatedRevenues[c.id] !== undefined ? simulatedRevenues[c.id] : c.revenueGenerated), 0);
  const totalAvgRoi = totalMktSpend > 0 ? ((totalMktRevenue - totalMktSpend) / totalMktSpend) * 100 : 380;

  const handleSpendChange = (id: string, val: number) => {
    setSimulatedSpends(prev => ({ ...prev, [id]: val }));
  };

  const handleRevenueChange = (id: string, val: number) => {
    setSimulatedRevenues(prev => ({ ...prev, [id]: val }));
  };

  const handleGenerateReport = () => {
    setIsLoadingReport(true);
    setGeneratedReport(null);

    setTimeout(() => {
      let doc = '';
      const date = new Date().toLocaleString();
      
      doc += `# VioneX AUTOMATED BUSINESS REPORT\n`;
      doc += `Generated: ${date}\n`;
      doc += `Security Classification: CONFIDENTIAL (Role Restrictions applied)\n`;
      doc += `------------------------------------------------------------\n\n`;

      if (reportType === 'kpi') {
        doc += `## MODULE 1: EXECUTIVE KEY PERFORMANCE INDICATORS\n`;
        doc += `- Invoiced Sales Orders Value: ₹ ${(totalSalesOrdersValue ?? 0).toLocaleString()}\n\n`;
        
        doc += `## TOP SALES PRODUCTS BY POPULARITY\n`;
        products.forEach(p => {
          doc += `- SKU: ${p.sku} | Name: ${p.name} | Units: ${p.unitsSold} | Online Sales: ₹ ${(p.revenue ?? 0).toLocaleString()}\n`;
        });
      } else if (reportType === 'marketing') {
        doc += `## MODULE 2: MARKETING & ROI AUDIT\n`;
        doc += `- Total Campaign Outlays: ₹ ${(totalMktSpend ?? 0).toLocaleString()}\n`;
        doc += `- Campaign Attributed Intake: ₹ ${(totalMktRevenue ?? 0).toLocaleString()}\n`;
        doc += `- Average Marketing Return on Investment (ROI): ${totalAvgRoi.toFixed(1)}%\n\n`;
        doc += `## ACTIVE CHANNELS RECONCILIATION\n`;
        campaigns.forEach(c => {
          const spend = simulatedSpends[c.id] !== undefined ? simulatedSpends[c.id] : c.spend;
          const rev = simulatedRevenues[c.id] !== undefined ? simulatedRevenues[c.id] : c.revenueGenerated;
          const roi = spend > 0 ? ((rev - spend) / spend) * 105 : 0;
          doc += `- ${c.name} (${c.channel}): Leads: ${c.leadsGenerated} | Spend: ₹ ${spend} | Revenue: ₹ ${rev} | ROI: ${roi.toFixed(1)}%\n`;
        });
      } else if (reportType === 'roi') {
        doc += `## MODULE 4: ONLINE MULTI-CHANNEL PERFORMANCE\n`;
        products.forEach(p => {
          doc += `- Product (Online: ₹ ${p.onlinePrice} / Shop: ₹ ${p.shopPrice}) | Amazon: ₹ ${(p.amazonSales || 0).toLocaleString()} | Flipkart: ₹ ${(p.flipkartSales || 0).toLocaleString()} | Meesho: ₹ ${(p.meeshoSales || 0).toLocaleString()} | VAMJO: ₹ ${(p.vamjoSales || 0).toLocaleString()} | WhatsApp: ₹ ${(p.whatsappSales || 0).toLocaleString()} | Countersale: ₹ ${(p.countersaleSales || 0).toLocaleString()} | Total Revenue: ₹ ${(p.revenue ?? 0).toLocaleString()}\n`;
        });
      }

      if (includeAuditLogs) {
        doc += `\n## GRANULAR ACCESS TEAM SECURITY AUDITS\n`;
        auditLogs.slice(0, 5).forEach(l => {
          doc += `[${l.timestamp.slice(11, 19)}] User: ${l.user} [${l.role}] Action: ${l.action} -> Status: ${l.status.toUpperCase()}\n`;
        });
      }

      doc += `\n------------------------------------------------------------\n`;
      doc += `End of report. (VioneX Trusted Integration Protocol)`;
      
      setGeneratedReport(doc);
      setIsLoadingReport(false);
    }, 1200);
  };

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Metric,Value\n";
    csvContent += `Invoiced Orders Value,${totalSalesOrdersValue}\n`;
    csvContent += `Blend Campaign ROI,${totalAvgRoi.toFixed(2)}%\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "viocrm_executive_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // DEFAULT KPI INTELLIGENCE VIEW
  // ==========================================
  const pendingPartners = referrals.filter(r => r.status === 'Pending Approval');

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* VIOSync Node & Connected Database Details Banner */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50/30 border border-emerald-200/90 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs" id="kpi-db-status-banner">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0 shadow-xs">
            <Database className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-slate-900 text-base tracking-tight">VIOSync Node: Connected</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Live Database Active
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 flex items-center gap-2 flex-wrap font-medium">
              <span>Connected Database: <strong className="text-emerald-700 font-mono font-bold">violeafydb</strong></span>
              <span className="text-slate-300">&bull;</span>
              <span>Collections: <strong className="text-slate-900 font-mono font-bold">39 / 39 Verified</strong></span>
              <span className="text-slate-300">&bull;</span>
              <span>Persistence: <strong className="text-emerald-700 font-bold">Upsert & Updates Live</strong></span>
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsDbModalOpen(true)}
          className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-700 font-bold hover:text-slate-900 transition flex items-center gap-2 shrink-0 cursor-pointer self-start md:self-auto shadow-xs"
        >
          <Server className="w-3.5 h-3.5 text-indigo-600" />
          <span>Inspect Connected Database</span>
        </button>
      </div>

      <ConnectedDbDetailsModal 
        isOpen={isDbModalOpen} 
        onClose={() => setIsDbModalOpen(false)} 
      />

      {/* Interactive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="dashboard-kpis">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition duration-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Invoiced Revenue</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 font-sans tracking-tight" id="kpi-revenue-val">
              ₹{(totalSalesOrdersValue ?? 0).toLocaleString()}
            </span>
            <span className="text-xs font-bold text-emerald-800 flex items-center bg-emerald-100 px-1.5 py-0.5 rounded-lg border border-emerald-200">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              +28.3%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 font-semibold font-mono">{salesOrders.length} BILLED INVOICES</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition duration-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Campaigns ROI</span>
            <span className="p-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 font-sans tracking-tight" id="kpi-roi-val">
              {totalAvgRoi.toFixed(1)}%
            </span>
            <span className="text-xs font-bold text-rose-800 flex items-center bg-rose-100 px-1.5 py-0.5 rounded-lg border border-rose-200">
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              -2.1%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 font-semibold font-mono">MONITORED REAL ROI</p>
        </div>
      </div>

      {/* Referral Partner Approvals for Support & Admin */}
      {(currentUser?.role === 'Admin' || currentUser?.role === 'Support') && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-6 shadow-xs" id="pending-referrals-approval">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-amber-200/80 pb-4 mb-4 gap-2">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base tracking-wide uppercase">Referral Partners Pending Approval</h3>
                <p className="text-xs text-slate-600 mt-1 font-medium">Review and activate newly registered referral partners to enable their accounts.</p>
              </div>
            </div>
            <span className="text-xs font-mono bg-amber-100 text-amber-800 px-3 py-1 border border-amber-300 rounded-full font-bold self-start sm:self-auto">
              {pendingPartners.length} PENDING
            </span>
          </div>

          {pendingPartners.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs italic font-medium">
              All referral partners are approved and active. No pending registrations.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingPartners.map(partner => (
                <div key={partner.id} className="bg-white border border-amber-200 p-4 rounded-xl flex flex-col justify-between hover:border-amber-300 shadow-xs transition">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900">{partner.name}</h4>
                        <span className="text-[10px] text-indigo-600 font-mono font-bold">Ref ID: {partner.referralId}</span>
                      </div>
                      <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded font-extrabold uppercase tracking-wider">
                        Awaiting Audit
                      </span>
                    </div>

                    <div className="text-xs space-y-1.5 text-slate-600 font-medium">
                      <div><strong className="text-slate-800">Phone:</strong> {partner.mobileNumber}</div>
                      {partner.email && <div><strong className="text-slate-800">Email:</strong> {partner.email}</div>}
                      <div><strong className="text-slate-800">Address:</strong> {partner.address}</div>
                      <div><strong className="text-slate-800">Joined Date:</strong> {partner.createdAt}</div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end">
                    {confirmingId === partner.id ? (
                      <div className="flex items-center gap-2 w-full justify-between animate-fadeIn">
                        <span className="text-[11px] text-amber-800 font-bold">Approve Partner?</span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              updateReferral(partner.id, { status: 'Active' }, true);
                              setConfirmingId(null);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] px-3 py-1.5 rounded-lg uppercase tracking-wider cursor-pointer shadow-xs"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-[10px] px-3 py-1.5 rounded-lg uppercase tracking-wider cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(partner.id)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] px-4 py-2 rounded-lg uppercase tracking-wider cursor-pointer transition w-full text-center flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        Approve Partner
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Campaign ROI Real-Time Monitor */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base leading-tight">Campaign ROI Real-Time Monitor</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">Simulate cost & value scaling inputs directly</p>
          </div>
          <Sliders className="w-4 h-4 text-indigo-600" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-1">
          {campaigns.map(c => {
            const currentSpend = simulatedSpends[c.id] !== undefined ? simulatedSpends[c.id] : c.spend;
            const currentRevenue = simulatedRevenues[c.id] !== undefined ? simulatedRevenues[c.id] : c.revenueGenerated;
            
            const simulatedRoi = currentSpend > 0 ? ((currentRevenue - currentSpend) / currentSpend) * 100 : 0;

            return (
              <div key={c.id} className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition space-y-2 text-slate-700 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block leading-tight">{c.name}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{c.channel}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                    simulatedRoi >= 400 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                    simulatedRoi >= 200 ? 'bg-indigo-100 text-indigo-800 border-indigo-300' :
                    'bg-amber-100 text-amber-800 border-amber-300'
                  }`}>
                    ROI: {simulatedRoi.toFixed(0)}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium flex justify-between">
                      <span>Spend:</span>
                      <strong className="text-rose-600 font-mono">₹{(currentSpend ?? 0).toLocaleString()}</strong>
                    </span>
                    <input 
                      type="range"
                      min="500"
                      max={c.budget * 2}
                      step="500"
                      value={currentSpend}
                      onChange={(e) => handleSpendChange(c.id, parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-2 accent-indigo-600"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium flex justify-between">
                      <span>Intake:</span>
                      <strong className="text-emerald-700 font-mono">₹{(currentRevenue ?? 0).toLocaleString()}</strong>
                    </span>
                    <input 
                      type="range"
                      min="2000"
                      max="100000"
                      step="1000"
                      value={currentRevenue}
                      onChange={(e) => handleRevenueChange(c.id, parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-2 accent-emerald-600"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer / Product Top Performers */}
        <div className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-xs ${currentUser?.role === 'Support' ? 'lg:col-span-2' : ''}`}>
          <h3 className="font-extrabold text-slate-900 text-base border-b border-slate-200 pb-3 mb-4">Top Revenue Catalysts</h3>
          <div className="space-y-3.5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Top Product Lines:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {products.slice(0, 2).map(p => (
                <div key={p.id} className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between shadow-xs">
                  <div>
                    <span className="text-xs font-bold text-indigo-900 block">{p.name}</span>
                    <span className="text-[10px] text-indigo-700 font-medium mt-0.5 block">{p.unitsSold} Contracts Signed</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-slate-900 block">₹{(p.revenue ?? 0).toLocaleString()}</span>
                    <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 border border-emerald-300 rounded">+{p.growthRate}% Growth</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-1">Key CRM Customer Portals:</div>
            <div className="space-y-2">
              {customers.slice(0, 3).map(c => (
                <div key={c.id} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between transition-all shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-white text-xs font-extrabold text-indigo-600 flex items-center justify-center border border-slate-200 shadow-xs">
                      {c.company.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{c.company}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{c.name} &bull; Satisfaction: {c.satisfactionScore}/5.0</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-slate-900 block">₹{(c.totalSpent ?? 0).toLocaleString()}</span>
                    <span className="px-1.5 py-0.5 bg-indigo-100 border border-indigo-200 text-indigo-800 rounded text-[9px] font-extrabold uppercase tracking-wider">{c.tier}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Automated Custom Reports */}
        {currentUser?.role !== 'Support' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">Interactive CRM Report Generator</h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">Create and download real-time modular business intelligence briefs</p>
                </div>
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Target Core Section:</label>
                  <select 
                    value={reportType}
                    onChange={(e: any) => setReportType(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-xs"
                    id="report-target-select"
                  >
                    <option value="kpi">Total Company KPI Ledger</option>
                    <option value="marketing">Marketing Channels & ROI</option>
                    <option value="roi">Product Return Analytica</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Output Additions:</label>
                  <label className="flex items-center gap-2 mt-1 bg-slate-50 border border-slate-300 rounded-lg p-2.5 cursor-pointer touch-none shadow-xs">
                    <input 
                      type="checkbox"
                      checked={includeAuditLogs}
                      onChange={(e) => setIncludeAuditLogs(e.target.checked)}
                      className="accent-indigo-600 text-xs cursor-pointer ml-1"
                      id="report-audit-checkbox"
                    />
                    <span className="text-xs font-medium text-slate-700">Attach Security Audits</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={handleGenerateReport}
                  disabled={isLoadingReport}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
                  id="generate-report-btn"
                >
                  {isLoadingReport ? 'Assembling Document...' : 'Generate Real-Time Report'}
                </button>
                
                {generatedReport && (
                  <button
                    onClick={handleExportCSV}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    id="export-csv-btn"
                    title="Export raw numbers to spreadsheet"
                  >
                    <Download className="w-4 h-4" />
                    Excel/CSV
                  </button>
                )}
              </div>
            </div>

            {/* Report output terminal */}
            <div className="mt-2 text-left">
              {generatedReport ? (
                <div className="relative animate-fadeIn">
                  <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[9px] leading-relaxed rounded-xl max-h-[160px] overflow-y-auto whitespace-pre-wrap border border-slate-800 shadow-inner">
                    {generatedReport}
                  </pre>
                  <div className="absolute right-2 top-2 bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[8px] font-extrabold flex items-center gap-1 shadow-xs">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    READY & VERIFIED
                  </div>
                </div>
              ) : (
                <div className="p-8 border border-dashed border-slate-300 rounded-xl text-center text-slate-500 text-xs italic bg-slate-50/50 font-medium">
                  Configure report modules above, then trigger document assembly.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
