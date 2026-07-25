import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlertStore } from '../store/alertStore';
import { Bell, CheckCircle2, AlertTriangle, Printer, Info, X } from 'lucide-react';

export default function PremiumToasts() {
  const { toastMessage, clearToast } = useAlertStore();

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => {
      clearToast();
    }, toastMessage.duration || 4000);
    return () => clearTimeout(timer);
  }, [toastMessage, clearToast]);

  if (!toastMessage) return null;

  let toastIcon = <Info size={16} />;
  let toastColor = 'border-primary bg-white text-text-dark';

  switch (toastMessage.type) {
    case 'success':
      toastIcon = <CheckCircle2 size={16} className="text-success" />;
      toastColor = 'border-[#eadfd7]/80 bg-white/95';
      break;
    case 'info':
      toastIcon = <Bell size={16} className="text-primary" />;
      toastColor = 'border-[#eadfd7]/80 bg-white/95';
      break;
    case 'warning':
      toastIcon = <AlertTriangle size={16} className="text-warning" />;
      toastColor = 'border-[#eadfd7]/80 bg-white/95';
      break;
    case 'error':
      toastIcon = <AlertTriangle size={16} className="text-danger" />;
      toastColor = 'border-danger/30 bg-red-50/95';
      break;
  }

  return (
    <div className="fixed top-5 right-5 z-[60] max-w-sm pointer-events-none">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-md ${toastColor}`}
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-50 border border-gray-100">
            {toastIcon}
          </div>
          <div className="flex-1 pr-4">
            <p className="text-xs font-black text-text-dark leading-snug">
              {toastMessage.text}
            </p>
          </div>
          <button
            onClick={clearToast}
            className="text-text-muted hover:text-text-dark p-0.5 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
