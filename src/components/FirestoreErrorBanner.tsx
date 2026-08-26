import React from 'react';
import { AlertTriangle, RefreshCw, XCircle, ShieldAlert, Server } from 'lucide-react';

export interface FirestoreErrorState {
  hasError: boolean;
  message: string;
  collectionName?: string;
  operationType?: string;
  timestamp?: string;
  details?: string;
}

interface Props {
  error: FirestoreErrorState | null;
  onRetry: () => void;
  onDismiss?: () => void;
}

export default function FirestoreErrorBanner({ error, onRetry, onDismiss }: Props) {
  if (!error || !error.hasError) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-lg w-full p-4 bg-rose-950/95 border-2 border-rose-600 rounded-2xl shadow-2xl text-rose-100 backdrop-blur-md animate-fadeIn" id="firestore-error-banner">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-rose-600/30 rounded-xl border border-rose-500/50 text-rose-400 shrink-0 mt-0.5">
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>
        
        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-extrabold text-sm tracking-tight text-white flex items-center gap-2">
              <span>Cloud Firestore Operation Error</span>
              <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-rose-500/30 text-rose-300 border border-rose-500/40">
                Single Source of Truth
              </span>
            </h4>
            {onDismiss && (
              <button 
                onClick={onDismiss}
                className="text-rose-400 hover:text-white transition cursor-pointer"
                title="Dismiss banner"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="text-xs font-mono bg-rose-900/60 p-2 rounded-lg border border-rose-700/60 text-rose-200 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
            {error.message}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-rose-300/80 font-mono">
            {error.collectionName && (
              <span>Collection: <strong className="text-white font-bold">{error.collectionName}</strong></span>
            )}
            {error.operationType && (
              <span>Operation: <strong className="text-white font-bold">{error.operationType.toUpperCase()}</strong></span>
            )}
            {error.timestamp && (
              <span>Time: <strong>{new Date(error.timestamp).toLocaleTimeString()}</strong></span>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <p className="text-[11px] text-rose-300 font-medium italic">
              Fallback or cached data display is strictly prohibited. Retry required.
            </p>
            <button
              onClick={onRetry}
              className="px-3.5 py-1.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition cursor-pointer border border-rose-400/30 shrink-0 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Firestore Call</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
