import React from 'react';
import { useCRM } from '../store';
import { UserRole } from '../types';
import { 
  ShieldCheck, ShieldAlert, Lock, Unlock, Eye, Database, HelpCircle, 
  Trash2, RefreshCw, FileText, CheckCircle2 
} from 'lucide-react';

export default function SecurityControlView() {
  const { 
    hasAccess, permissions, updatePermission, auditLogs, clearAuditLogs, currentUser 
  } = useCRM();

  // Roles to render on security grid
  const rolesList: UserRole[] = ['Admin', 'Sales', 'Marketing', 'Support', 'Referral Team'];

  // Modules list in permission rule
  const modulesMock = [
    'Dashboard',
    'Tasks & Calendar',
    'Products & Clients',
    'Customer Directory',
    'Referral Hub',
    'Campaigns & ROI',
    'WhatsApp Integration',
    'Security Audit'
  ];

  if (!hasAccess('Security Audit', 'read')) {
    return (
      <div className="bg-rose-955/40 border border-[#4c1d24]/60 rounded-2xl p-8 text-center text-rose-205" id="access-denied-security">
        <h3 className="font-bold text-lg mb-2 text-white">Security Authorization Required</h3>
        <p className="text-sm opacity-90">Your active role is unauthorized for System Security Audit modules. Please change role perspective to Admin above to view audit logs.</p>
      </div>
    );
  }

  const handleTogglePermissionCheckbox = (
    role: UserRole, 
    moduleName: string, 
    action: 'read' | 'create' | 'edit' | 'delete', 
    currentVal: boolean
  ) => {
    updatePermission(role, moduleName, action, !currentVal);
  };

  return (
    <div className="space-y-6" id="security-view-container">
      {/* Upper header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5.5 h-5.5 text-indigo-400" />
            Security Matrix & Granular Access Control
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Toggle granular team permissions rules in real-time and review system policy audit logs
          </p>
        </div>

        {/* Level Indicator banner */}
        <div className="flex items-center gap-2 bg-indigo-950/40 border border-indigo-900/30 rounded-xl px-3.5 py-1.5 text-xs text-indigo-305 shrink-0">
          <Lock className="w-3.5 h-3.5 text-indigo-400" />
          <span>Active Policy: <strong className="font-bold text-white">Multilevel Role-Based Access (RBAC)</strong></span>
        </div>
      </div>

      {permissions && (
        <div className="bg-[#141418] border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-1">
            <div>
              <h3 className="font-bold text-white text-sm">Active Grandular Authorization Grid</h3>
              <p className="text-xs text-slate-400">
                {currentUser.role === 'Admin' 
                  ? '🔒 ADMIN PRIVILEGES ACTIVATED: Toggling checkboxes below will immediately restrict/grant elements on other screens' 
                  : '👁️ READ ONLY PERSPECTIVE: Switch role to Admin to rewrite security parameters'}
              </p>
            </div>
            <Eye className="w-4 h-4 text-slate-505" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-[#d3d3e8] font-bold border-b border-slate-800 text-slate-350">
                  <th className="p-3">Team Role profile</th>
                  <th className="p-3">Core Module Link</th>
                  <th className="p-3 text-center">Read access</th>
                  <th className="p-3 text-center">Create access</th>
                  <th className="p-3 text-center font-semibold">Edit access</th>
                  <th className="p-3 text-center">Delete access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rolesList.map((role) => {
                  return modulesMock.map((modName, idx) => {
                    const rule = permissions[role].find(r => r.module === modName);
                    if (!rule) return null;

                    const isRootAdmin = role === 'Admin';

                    return (
                      <tr key={`${role}-${modName}`} className={`hover:bg-[#1c1c21]/45 ${idx === 0 ? 'border-t border-t-slate-800' : ''}`}>
                        {idx === 0 && (
                          <td rowSpan={modulesMock.length} className="p-3 font-bold bg-[#0d0d10]/40 text-slate-200 border-r border-slate-800 align-top">
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`w-2 h-2 rounded-full ${
                                role === 'Admin' ? 'bg-indigo-500' :
                                role === 'Sales' ? 'bg-emerald-400' :
                                role === 'Marketing' ? 'bg-amber-400' :
                                role === 'Referral Team' ? 'bg-teal-400' :
                                'bg-rose-400'
                              }`} />
                              <span>{role === 'Referral Team' ? 'Referral Team' : `${role} Team`}</span>
                            </div>
                            <p className="text-[9px] text-slate-400 font-normal mt-2 leading-normal max-w-[125px]">
                              {role === 'Admin' ? 'Global root database outlays and ROI controls.' :
                               role === 'Sales' ? 'Outbound pipeline operations and lead scoring.' :
                               role === 'Marketing' ? 'Visual campaigns spends and leads creation.' :
                               role === 'Referral Team' ? 'Affiliate program operations, commissions, and partner validations.' :
                               'WhatsApp templates dispatch and logs care.'}
                            </p>
                          </td>
                        )}

                        <td className="p-2.5 font-semibold text-slate-200 pl-4 border-r border-slate-800/40 flex items-center justify-between">
                          <span>{modName}</span>
                        </td>

                        {/* Checkbox columns: read */}
                        <td className="p-2.5 text-center">
                          <input 
                            type="checkbox"
                            checked={rule.read}
                            disabled={isRootAdmin || currentUser.role !== 'Admin'}
                            onChange={() => handleTogglePermissionCheckbox(role, modName, 'read', rule.read)}
                            className="accent-indigo-505 cursor-pointer disabled:opacity-40"
                          />
                        </td>

                        {/* Checkbox columns: create */}
                        <td className="p-2.5 text-center">
                          <input 
                            type="checkbox"
                            checked={rule.create}
                            disabled={isRootAdmin || currentUser.role !== 'Admin'}
                            onChange={() => handleTogglePermissionCheckbox(role, modName, 'create', rule.create)}
                            className="accent-indigo-505 cursor-pointer disabled:opacity-40"
                          />
                        </td>

                        {/* Checkbox columns: edit */}
                        <td className="p-2.5 text-center">
                          <input 
                            type="checkbox"
                            checked={rule.edit}
                            disabled={isRootAdmin || currentUser.role !== 'Admin'}
                            onChange={() => handleTogglePermissionCheckbox(role, modName, 'edit', rule.edit)}
                            className="accent-indigo-505 cursor-pointer disabled:opacity-40"
                          />
                        </td>

                        {/* Checkbox columns: delete */}
                        <td className="p-2.5 text-center">
                          <input 
                            type="checkbox"
                            checked={rule.delete}
                            disabled={isRootAdmin || currentUser.role !== 'Admin'}
                            onChange={() => handleTogglePermissionCheckbox(role, modName, 'delete', rule.delete)}
                            className="accent-indigo-505 cursor-pointer disabled:opacity-40"
                          />
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Logs Screen Terminal */}
      <div className="bg-[#0b0b0d] border border-slate-800 rounded-2xl p-5 shadow-inner" id="system-audit-terminal">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-400 animate-pulse" />
            <div>
              <h3 className="font-bold text-white text-xs leading-none">System Security & Authorizations Log Trace</h3>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-none font-mono">ENCRYPTED PORTAL REGISTRY</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {auditLogs.length > 0 && (
              <button 
                onClick={clearAuditLogs}
                className="px-2.5 py-1 border border-slate-800 bg-[#141418] hover:border-slate-700 hover:bg-slate-900 rounded-xl text-[10px] font-bold text-slate-300 cursor-pointer transition select-none"
              >
                Flush Logs
              </button>
            )}
          </div>
        </div>

        {/* Logs visual terminal style list */}
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {auditLogs.length === 0 ? (
            <p className="text-[11px] text-slate-500 font-mono italic text-center py-10">
              No audit logs captured. Everything clean inside Leafy Server databases.
            </p>
          ) : (
            auditLogs.map((log) => {
              const isDenied = log.status === 'denied';
              const isWarning = log.status === 'warning';

              return (
                <div 
                  key={log.id} 
                  className={`p-2.5 rounded-xl font-mono text-[10px] border leading-normal flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 ${
                    isDenied ? 'bg-rose-955/20 border-rose-900/40 text-rose-350' :
                    isWarning ? 'bg-amber-955/20 border-amber-900/40 text-amber-250' :
                    'bg-slate-900/50 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-500 text-[9px] font-bold">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <strong className="text-white">{log.user}</strong>
                      <span className={`px-1.5 rounded-[4px] text-[8px] font-bold border ${
                        log.role === 'Admin' ? 'bg-indigo-955 text-indigo-400 border-indigo-900/30' :
                        log.role === 'Sales' ? 'bg-emerald-955 text-emerald-400 border-emerald-900/30' :
                        log.role === 'Marketing' ? 'bg-amber-955 text-amber-400 border-amber-900/30' :
                        log.role === 'Support' ? 'bg-rose-955 text-rose-400 border-rose-900/30' :
                        log.role === 'Referral Team' ? 'bg-teal-955 text-teal-400 border-teal-900/30' :
                        'bg-[#141418] border-slate-800 text-slate-400'
                      }`}>
                        {log.role}
                      </span>
                      <span className="text-indigo-400 font-semibold">{log.action}</span>
                    </div>
                    <p className="opacity-90">{log.details}</p>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase shrink-0 self-start sm:self-auto border ${
                    isDenied ? 'bg-rose-955/35 text-rose-450 border-rose-905 animate-pulse' :
                    isWarning ? 'bg-amber-955/35 text-amber-455 border-amber-905 font-bold' :
                    'bg-emerald-955/35 text-emerald-450 border-emerald-905'
                  }`}>
                    {log.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
