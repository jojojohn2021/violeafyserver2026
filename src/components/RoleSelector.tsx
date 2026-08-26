import React, { useState } from 'react';
import { useCRM } from '../store';
import { UserRole } from '../types';
import { ShieldCheck, Users, Smartphone, RefreshCw, Database } from 'lucide-react';
import ConnectedDbDetailsModal from './ConnectedDbDetailsModal';

export default function RoleSelector({ onAvatarDoubleClick }: { onAvatarDoubleClick?: () => void }) {
  const { currentUser, setRole, syncingIndicator, lastSyncedAt } = useCRM();
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);

  if (currentUser.role !== 'Admin') {
    return null;
  }

  const rolesList: { role: UserRole; title: string; color: string; desc: string }[] = [
    { 
      role: 'Admin', 
      title: 'Admin / Executive', 
      color: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
      desc: 'Complete read/write matrix, master ROI insights & security configuration' 
    },
    { 
      role: 'Sales', 
      title: 'Sales Outbound Rep', 
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
      desc: 'Outbound pipeline automation, order processing, and customer matrices' 
    },
    { 
      role: 'Marketing', 
      title: 'Marketing Specialist', 
      color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
      desc: 'Campaign parameters, live customer engagement funnel, & real-time ROI tracking' 
    },
    { 
      role: 'Support', 
      title: 'Support Specialist', 
      color: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
      desc: 'WhatsApp correspondence, templates execution, client logs, & customer records' 
    },
    { 
      role: 'Referral Team', 
      title: 'Referral Team', 
      color: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100',
      desc: 'Access to registered affiliate records, partner networks, & KYC directories' 
    },
  ];

  return (
    <div className="bg-gradient-to-r from-emerald-50/70 via-white to-slate-50 border border-emerald-200/90 rounded-3xl p-5 shadow-xs mb-6" id="role-selector-card">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Active Identity Block */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src={currentUser.avatar} 
              alt={currentUser.name} 
              className="w-12 h-12 rounded-xl object-cover border border-emerald-200 shadow-xs cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200"
              onDoubleClick={onAvatarDoubleClick}
              title="Double click to take a selfie and edit profile photo!"
              referrerPolicy="no-referrer"
            />
            <span className="absolute -bottom-1 -right-1 bg-emerald-500 border-2 border-white w-4 h-4 rounded-full flex items-center justify-center shadow-xs" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-extrabold text-slate-900 text-base leading-tight">{currentUser.name}</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                currentUser.role === 'Admin' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                currentUser.role === 'Sales' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                currentUser.role === 'Marketing' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                currentUser.role === 'Referral Team' ? 'bg-teal-100 text-teal-800 border-teal-200' :
                'bg-rose-100 text-rose-800 border-rose-200'
              }`}>
                {currentUser.role === 'Referral Team' ? 'Referral Team' : `${currentUser.role} Team`}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 flex items-center gap-1 font-medium">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              {currentUser.team} &bull; <span className="font-mono text-[11px] text-slate-500 font-semibold">{currentUser.email}</span>
            </p>
          </div>
        </div>

        {/* Sync & Connected Database Indicator */}
        <div className="flex flex-wrap items-center gap-3 bg-white/90 border border-emerald-200 rounded-2xl px-4 py-2.5 text-xs text-slate-700 self-start md:self-auto shadow-xs">
          <button 
            onClick={() => setIsDbModalOpen(true)}
            className="flex items-center gap-2 hover:opacity-90 transition cursor-pointer group"
            title="Click to view connected database details and verified collections matrix"
          >
            <div className="relative">
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${syncingIndicator ? 'animate-spin text-indigo-600' : 'group-hover:text-emerald-600'}`} />
              {syncingIndicator && (
                <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
              )}
            </div>
            <span className="font-medium">
              VIOSync Node: <span className="text-emerald-700 font-bold uppercase tracking-wider">Connected</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-800 font-mono text-[10px] font-bold">
              violeafydb
            </span>
          </button>
          <span className="text-slate-300">|</span>
          <span>Last Sync: <span className="font-mono text-slate-800 font-semibold">{lastSyncedAt}</span></span>
        </div>

        <ConnectedDbDetailsModal 
          isOpen={isDbModalOpen}
          onClose={() => setIsDbModalOpen(false)}
        />
      </div>

      {/* Role Swap Controls */}
      <div className="mt-4 border-t border-emerald-100 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
          {rolesList.map((r) => {
            const isActive = currentUser.role === r.role;
            const customActiveColor = 
              r.role === 'Admin' ? 'bg-indigo-600 border-indigo-600 font-bold text-white shadow-xs' :
              r.role === 'Sales' ? 'bg-emerald-600 border-emerald-600 font-bold text-white shadow-xs' :
              r.role === 'Marketing' ? 'bg-amber-600 border-amber-600 font-bold text-white shadow-xs' :
              r.role === 'Referral Team' ? 'bg-teal-600 border-teal-600 font-bold text-white shadow-xs' :
              'bg-rose-600 border-rose-600 font-bold text-white shadow-xs';

            const customInactiveColor =
              r.role === 'Admin' ? 'bg-white border-indigo-200 text-indigo-800 hover:bg-indigo-50' :
              r.role === 'Sales' ? 'bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-50' :
              r.role === 'Marketing' ? 'bg-white border-amber-200 text-amber-800 hover:bg-amber-50' :
              r.role === 'Referral Team' ? 'bg-white border-teal-200 text-teal-800 hover:bg-teal-50' :
              'bg-white border-rose-200 text-rose-800 hover:bg-rose-50';

            return (
              <button
                key={r.role}
                onClick={() => setRole(r.role)}
                className={`text-left p-2.5 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  isActive 
                    ? `${customActiveColor} text-white` 
                    : `${customInactiveColor}`
                }`}
                id={`role-btn-${r.role.toLowerCase()}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs tracking-tight uppercase">{r.title}</span>
                  {isActive && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                </div>
                <p className={`text-[11px] mt-1 line-clamp-2 leading-tight ${isActive ? 'text-slate-100 opacity-90 font-medium' : 'text-slate-500 font-medium'}`}>
                  {r.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
