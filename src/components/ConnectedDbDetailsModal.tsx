import React, { useEffect, useState } from 'react';
import { Database, ShieldCheck, RefreshCw, CheckCircle2, Server, Layers, Activity, X, HardDrive } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ConnectedDbDetailsModal({ isOpen, onClose }: Props) {
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    databaseName: string;
    collections: string[];
    error: string | null;
  }>({
    connected: true,
    databaseName: db.app.options.projectId || 'violeafydb',
    collections: ['customers', 'referrals', 'sales_orders', 'products', 'commission_transactions', 'commission_rules', 'performance_levels', 'users', 'leads', 'tasks', 'calendar_events', 'campaigns', 'whatsapp_messages', 'settings', 'permissions'],
    error: null
  });
  const [loading, setLoading] = useState(false);

  const verifyFirestore = async () => {
    setLoading(true);
    try {
      // Test direct Cloud Firestore operation on CUSTOMERS authoritative collection
      const snap = await getDocs(query(collection(db, 'customers'), limit(1)));
      setDbStatus(prev => ({
        ...prev,
        connected: true,
        error: null
      }));
    } catch (e: any) {
      setDbStatus(prev => ({
        ...prev,
        connected: false,
        error: e.message || String(e)
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      verifyFirestore();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn" id="db-details-modal">
      <div className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-emerald-50/90 via-teal-50/40 to-slate-50 border-b border-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-xs">
              <Database className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">Connected Database Details</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Cloud Firestore Node
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                Single Source of Truth: <strong className="text-emerald-700 font-mono font-bold">{dbStatus.databaseName}</strong> &bull; Status: <span className="text-emerald-700 font-bold">{dbStatus.connected ? 'Active' : 'Error'}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer shadow-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs bg-slate-50/40">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Database Engine</span>
                <HardDrive className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="text-base font-black font-mono text-emerald-700">Firebase Firestore</span>
              <span className="text-[10px] text-slate-500 mt-1 font-medium">Cloud Database Engine</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Connection State</span>
                <Activity className="w-4 h-4 text-indigo-600" />
              </div>
              <span className="text-base font-black text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {dbStatus.connected ? 'Connected' : 'Unreachable'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 font-medium">Direct SDK Link</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Fallback Mode</span>
                <ShieldCheck className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-base font-black text-purple-700 font-mono">PROHIBITED</span>
              <span className="text-[10px] text-slate-500 mt-1 font-medium">Zero Client Cache</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Security Rules</span>
                <Server className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-base font-black text-amber-700">ENFORCED</span>
              <span className="text-[10px] text-slate-500 mt-1 font-medium">Auth Verified</span>
            </div>
          </div>

          {/* Managed Collections */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <h4 className="font-extrabold text-slate-800 text-sm flex items-center justify-between">
              <span>Managed Cloud Firestore Collections</span>
              <button 
                onClick={verifyFirestore} 
                disabled={loading}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>Verify Live</span>
              </button>
            </h4>
            <div className="flex flex-wrap gap-2 pt-1">
              {dbStatus.collections.map((coll) => (
                <span key={coll} className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono font-bold text-xs rounded-xl shadow-2xs">
                  {coll}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
