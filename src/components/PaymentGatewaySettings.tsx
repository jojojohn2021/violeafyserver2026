import React, { useState, useMemo } from 'react';
import { useCRM } from '../store';
import { PaymentGatewaySetting, PaymentTransaction } from '../types';
import { 
  CreditCard, Shield, RefreshCw, CheckCircle2, XCircle, AlertCircle, 
  Lock, Eye, EyeOff, TrendingUp, BarChart2, DollarSign, Activity, Settings2
} from 'lucide-react';

export default function PaymentGatewaySettings() {
  const { 
    paymentGatewaySettings, 
    updatePaymentGatewaySetting, 
    paymentTransactions 
  } = useCRM();

  // Find active PayU configuration
  const payuConfig = useMemo(() => {
    return paymentGatewaySettings.find(c => c.gateway_name === 'PayU') || {
      id: 'config-payu',
      gateway_name: 'PayU',
      merchant_key: 'gtKFFx',
      merchant_salt: 'eCwWELSp',
      environment: 'Test',
      success_url: window.location.origin + '/api/payment/callback/success',
      failure_url: window.location.origin + '/api/payment/callback/failure',
      webhook_url: window.location.origin + '/api/payment/webhook',
      payment_description: 'VioneX Organic Groceries Secure Payment Checkout',
      currency: 'INR',
      status: 'Enabled',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }, [paymentGatewaySettings]);

  // Form states
  const [status, setStatus] = useState<PaymentGatewaySetting['status']>(payuConfig.status);
  const [environment, setEnvironment] = useState<PaymentGatewaySetting['environment']>(payuConfig.environment);
  const [merchantKey, setMerchantKey] = useState(payuConfig.merchant_key);
  const [merchantSalt, setMerchantSalt] = useState(() => {
    try {
      // Decode if base64 encoded
      return atob(payuConfig.merchant_salt);
    } catch (e) {
      return payuConfig.merchant_salt;
    }
  });
  const [successUrl, setSuccessUrl] = useState(payuConfig.success_url);
  const [failureUrl, setFailureUrl] = useState(payuConfig.failure_url);
  const [webhookUrl, setWebhookUrl] = useState(payuConfig.webhook_url || '');
  const [description, setDescription] = useState(payuConfig.payment_description || '');
  const [logoUrl, setLogoUrl] = useState(payuConfig.logo_url || '');
  const [paymentFlowMode, setPaymentFlowMode] = useState<NonNullable<PaymentGatewaySetting['payment_flow_mode']>>(payuConfig.payment_flow_mode || 'Web Redirect Flow');

  // UI state
  const [showSalt, setShowSalt] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily');

  // Encryption helper
  const encryptSalt = (saltStr: string) => {
    return btoa(saltStr);
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    const todayTxs = paymentTransactions.filter(tx => 
      tx.createdAt.startsWith(todayStr)
    );

    const successfulTxs = paymentTransactions.filter(tx => tx.status === 'Success');
    const failedTxs = paymentTransactions.filter(tx => tx.status === 'Failed');
    const pendingTxs = paymentTransactions.filter(tx => tx.status === 'Initiated' || tx.status === 'Pending');

    const todaySuccess = todayTxs.filter(tx => tx.status === 'Success');
    const todayFailed = todayTxs.filter(tx => tx.status === 'Failed');

    const totalRevenue = successfulTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const successRate = paymentTransactions.length > 0 
      ? (successfulTxs.length / paymentTransactions.length) * 100 
      : 100;

    const avgOrderValue = successfulTxs.length > 0 
      ? totalRevenue / successfulTxs.length 
      : 0;

    return {
      todayPayments: todaySuccess.length,
      todayFailedPayments: todayFailed.length,
      pendingPayments: pendingTxs.length,
      successRate,
      revenue: totalRevenue,
      avgOrderValue
    };
  }, [paymentTransactions]);

  // Chart data computation
  const chartData = useMemo(() => {
    const dataMap: Record<string, { success: number; failed: number }> = {};
    const today = new Date();

    if (chartPeriod === 'daily') {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const label = d.toLocaleDateString('en-US', { weekday: 'short' });
        const key = d.toISOString().split('T')[0];
        dataMap[key] = { success: 0, failed: 0 };
        (dataMap[key] as any).label = label;
      }
      paymentTransactions.forEach(tx => {
        const key = tx.createdAt.split('T')[0];
        if (dataMap[key]) {
          if (tx.status === 'Success') dataMap[key].success += tx.amount;
          else if (tx.status === 'Failed') dataMap[key].failed += tx.amount;
        }
      });
    } else if (chartPeriod === 'monthly') {
      // Last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(today.getMonth() - i);
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        dataMap[key] = { success: 0, failed: 0 };
        (dataMap[key] as any).label = label;
      }
      paymentTransactions.forEach(tx => {
        const key = tx.createdAt.substring(0, 7);
        if (dataMap[key]) {
          if (tx.status === 'Success') dataMap[key].success += tx.amount;
          else if (tx.status === 'Failed') dataMap[key].failed += tx.amount;
        }
      });
    } else {
      // Last 3 years
      for (let i = 2; i >= 0; i--) {
        const year = today.getFullYear() - i;
        const key = String(year);
        dataMap[key] = { success: 0, failed: 0 };
        (dataMap[key] as any).label = key;
      }
      paymentTransactions.forEach(tx => {
        const key = tx.createdAt.substring(0, 4);
        if (dataMap[key]) {
          if (tx.status === 'Success') dataMap[key].success += tx.amount;
          else if (tx.status === 'Failed') dataMap[key].failed += tx.amount;
        }
      });
    }

    return Object.values(dataMap);
  }, [paymentTransactions, chartPeriod]);

  // Handle Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/payment/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_key: merchantKey,
          merchant_salt: encryptSalt(merchantSalt),
          environment
        })
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) {
        setTestResult({ success: true, message: '✓ Connection Successful' });
      } else {
        setTestResult({ success: false, message: `✖ ${data?.error || `Invalid Merchant Credentials (HTTP ${response.status})`}` });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `✖ Connection Refused: ${err?.message || 'Unable to reach the server'}` });
    } finally {
      setIsTesting(false);
    }
  };

  // Handle Save Configuration
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);

    const encryptedSalt = encryptSalt(merchantSalt);

    updatePaymentGatewaySetting(payuConfig.id, {
      status,
      environment,
      merchant_key: merchantKey,
      merchant_salt: encryptedSalt,
      success_url: successUrl,
      failure_url: failureUrl,
      webhook_url: webhookUrl,
      payment_description: description,
      payment_flow_mode: paymentFlowMode,
      logo_url: logoUrl
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const maxVal = useMemo(() => {
    const vals = chartData.map(d => Math.max(d.success, d.failed, 100));
    return Math.max(...vals);
  }, [chartData]);

  return (
    <div className="space-y-6 text-left">
      
      {/* SECTION 1: STATISTICS DASHBOARD */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        
        {/* Today's Payments */}
        <div className="bg-[#0e0e11] border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold tracking-wider uppercase">Today's Payments</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-emerald-400">{metrics.todayPayments}</span>
            <p className="text-[10px] text-slate-500 mt-1">Cleared today</p>
          </div>
        </div>

        {/* Today's Failed Payments */}
        <div className="bg-[#0e0e11] border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold tracking-wider uppercase">Today's Failed</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-rose-400">{metrics.todayFailedPayments}</span>
            <p className="text-[10px] text-slate-500 mt-1">Declined attempts</p>
          </div>
        </div>

        {/* Pending Payments */}
        <div className="bg-[#0e0e11] border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold tracking-wider uppercase">Pending</span>
            <Activity className="w-4 h-4 text-amber-500 animation-pulse" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-amber-400">{metrics.pendingPayments}</span>
            <p className="text-[10px] text-slate-500 mt-1">Awaiting callback</p>
          </div>
        </div>

        {/* Success Rate */}
        <div className="bg-[#0e0e11] border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold tracking-wider uppercase">Success Rate</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-indigo-400">{metrics.successRate.toFixed(1)}%</span>
            <p className="text-[10px] text-slate-500 mt-1">Checkout efficiency</p>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-[#0e0e11] border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold tracking-wider uppercase">Total Revenue</span>
            <DollarSign className="w-4 h-4 text-violet-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-violet-400">₹{metrics.revenue.toLocaleString()}</span>
            <p className="text-[10px] text-slate-500 mt-1">Processed securely</p>
          </div>
        </div>

        {/* Avg Order Value */}
        <div className="bg-[#0e0e11] border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold tracking-wider uppercase">Avg Order Value</span>
            <BarChart2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-sky-400">₹{Math.round(metrics.avgOrderValue).toLocaleString()}</span>
            <p className="text-[10px] text-slate-500 mt-1">Value per transaction</p>
          </div>
        </div>

      </div>

      {/* SECTION 2: CHARTS & GATEWAY CONFIG CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: PAYU CONFIGURATION FORM (8 COLS) */}
        <div className="lg:col-span-8 bg-[#09090d] border border-slate-800 p-6 rounded-3xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-indigo-600/10 text-indigo-400">
                <CreditCard className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">PayU Configuration</h2>
                <p className="text-xs text-slate-400">Manage payment parameters, merchant keys, and active endpoint environments</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${status === 'Enabled' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-400'}`}>
                {status}
              </span>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Gateway Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Gateway Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-600 transition"
                  id="payu-status-select"
                >
                  <option value="Enabled">Enabled</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>

              {/* Environment */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Environment</label>
                <div className="flex items-center gap-4 py-2">
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer select-none">
                    <input
                      type="radio"
                      name="environment"
                      value="Test"
                      checked={environment === 'Test'}
                      onChange={() => setEnvironment('Test')}
                      className="accent-emerald-600"
                    />
                    Test (Sandbox)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer select-none">
                    <input
                      type="radio"
                      name="environment"
                      value="Production"
                      checked={environment === 'Production'}
                      onChange={() => setEnvironment('Production')}
                      className="accent-emerald-600"
                    />
                    Production
                  </label>
                </div>
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Merchant Key */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Merchant Key</label>
                <input
                  type="text"
                  value={merchantKey}
                  onChange={(e) => setMerchantKey(e.target.value)}
                  placeholder="e.g. gtKFFx"
                  className="w-full bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-600 transition"
                  required
                  id="payu-merchant-key"
                />
              </div>

              {/* Merchant Salt */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Merchant Salt</label>
                <div className="relative">
                  <input
                    type={showSalt ? "text" : "password"}
                    value={merchantSalt}
                    onChange={(e) => setMerchantSalt(e.target.value)}
                    placeholder="Enter merchant SHA-512 salt"
                    className="w-full bg-[#121215] border border-slate-800 rounded-xl pl-3 pr-10 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-600 transition"
                    required
                    id="payu-merchant-salt"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSalt(!showSalt)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition"
                    id="toggle-salt-visibility"
                  >
                    {showSalt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Success URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Success Callback URL</label>
                <input
                  type="url"
                  value={successUrl}
                  onChange={(e) => setSuccessUrl(e.target.value)}
                  className="w-full bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-600 transition"
                  required
                  id="payu-success-url"
                />
              </div>

              {/* Failure URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Failure Callback URL</label>
                <input
                  type="url"
                  value={failureUrl}
                  onChange={(e) => setFailureUrl(e.target.value)}
                  className="w-full bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-600 transition"
                  required
                  id="payu-failure-url"
                />
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Webhook URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Webhook URL (Optional)</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://yourdomain.com/api/payment/webhook"
                  className="w-full bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-600 transition"
                  id="payu-webhook-url"
                />
              </div>

              {/* Currency & Logo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Currency</label>
                  <input
                    type="text"
                    value="INR"
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Logo URL (Optional)</label>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="Custom logo link"
                    className="w-full bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-600 transition"
                    id="payu-logo-url"
                  />
                </div>
              </div>

            </div>

            {/* Payment Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Payment Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Product checkout description"
                className="w-full bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-600 transition"
                id="payu-payment-desc"
              />
            </div>

            {/* Payment Methods */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Payment Methods</label>
              <div className="flex flex-wrap gap-2" id="payu-payment-flow-mode">
                {([
                  { value: 'Web Redirect Flow', label: 'Web Redirect Flow' },
                  { value: 'Native Flutter PayU SDK', label: 'Native Flutter PayU SDK' },
                  { value: 'Both', label: 'Both — Native Flutter PayU SDK + Web Redirect Flow fallback' }
                ] as { value: NonNullable<PaymentGatewaySetting['payment_flow_mode']>; label: string }[]).map(opt => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setPaymentFlowMode(opt.value)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                      paymentFlowMode === opt.value
                        ? 'bg-indigo-600/10 border-indigo-600 text-indigo-400'
                        : 'bg-[#121215] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                    id={`payu-payment-flow-mode-${opt.value.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timestamps */}
            <div className="flex flex-wrap gap-4 text-[10px] text-slate-500">
              <div>Created: <span className="font-mono text-slate-400">{new Date(payuConfig.created_at).toLocaleString()}</span></div>
              <div>Modified: <span className="font-mono text-slate-400">{new Date(payuConfig.updated_at).toLocaleString()}</span></div>
            </div>

            {/* Feedback notifications */}
            {testResult && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${testResult.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>✓ PayU Gateway Configuration Saved Successfully!</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !merchantKey || !merchantSalt}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
                id="btn-test-connection"
              >
                {isTesting ? 'Verifying...' : 'Test Connection'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition flex items-center gap-1.5"
                  id="btn-save-gateway-config"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Save Changes
                </button>
              </div>
            </div>

          </form>
        </div>

        {/* RIGHT COLUMN: CHARTS & LEDGER SUMMARY (4 COLS) */}
        <div className="lg:col-span-4 bg-[#09090d] border border-slate-800 p-6 rounded-3xl flex flex-col justify-between space-y-6">
          
          {/* Header */}
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-indigo-650/10 text-indigo-400">
                  <BarChart2 className="w-4 h-4" />
                </span>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Transaction Trends</h3>
              </div>
              <div className="flex bg-[#121215] border border-slate-800 rounded-lg p-0.5">
                {(['daily', 'monthly', 'yearly'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    className={`px-2 py-1 text-[10px] font-bold rounded-md capitalize transition ${chartPeriod === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {p === 'daily' ? '7D' : p === 'monthly' ? '6M' : '3Y'}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Visual Chart */}
            <div className="h-44 w-full flex items-end justify-between gap-2 pt-4 relative">
              {chartData.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-center space-y-1">
                  <Activity className="w-8 h-8 text-slate-700 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider">No Transaction Activity</span>
                  <p className="text-[10px] text-slate-600">Simulate checkouts to see trends</p>
                </div>
              ) : (
                chartData.map((d, index) => {
                  const successPct = (d.success / maxVal) * 100;
                  const failedPct = (d.failed / maxVal) * 100;

                  return (
                    <div key={index} className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative">
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 bg-[#121215] border border-slate-800 p-2 rounded-xl text-[9px] text-left opacity-0 group-hover:opacity-100 transition duration-200 pointer-events-none shadow-xl z-20 w-24">
                        <p className="font-bold text-slate-300">{(d as any).label}</p>
                        <p className="text-emerald-400 mt-0.5">Success: ₹{Math.round(d.success)}</p>
                        <p className="text-rose-400">Failed: ₹{Math.round(d.failed)}</p>
                      </div>

                      <div className="w-full flex items-end justify-center gap-1 h-32 relative">
                        {/* Success Bar */}
                        <div 
                          style={{ height: `${Math.max(successPct, 2)}%` }}
                          className="w-2 rounded-t-sm bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all duration-500 group-hover:brightness-110"
                        />
                        {/* Failed Bar */}
                        <div 
                          style={{ height: `${Math.max(failedPct, 2)}%` }}
                          className="w-2 rounded-t-sm bg-gradient-to-t from-rose-600 to-rose-400 transition-all duration-500 group-hover:brightness-110"
                        />
                      </div>

                      <span className="text-[9px] text-slate-500 font-semibold mt-2 truncate max-w-full">{(d as any).label}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Security and Compliance Seal */}
          <div className="p-4 bg-slate-950 border border-slate-800/50 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-indigo-400">
              <Shield className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">PCI-DSS Cryptographic Security</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              VioneX employs industry-leading SHA-512 backend key/salt signature verification. 
              The merchant credentials are never sent to the browser or stored as plain text, 
              protecting against unauthorized API modifications.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
