import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlertStore } from '../store/alertStore';
import { useAppStore } from '../store/appStore';
import { Volume2, Megaphone, CheckCircle2, ShoppingBag, X, AlertTriangle, Printer, Sparkles } from 'lucide-react';

export default function MascotAssistant() {
  const {
    mascotState,
    speechText,
    showMascot,
    mascotEnabled,
    minimizeMascot,
    setMascotState
  } = useAlertStore();

  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mediaQuery.matches);
    const listener = (e) => setPrefersReduced(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  if (!mascotEnabled) return null;

  // Set visual elements based on mascotState
  let stateIcon = null;
  let accentColor = 'border-primary bg-primary/10';
  let badgeColor = 'bg-primary text-white';

  switch (mascotState) {
    case 'new_order':
      stateIcon = <Megaphone size={16} className="text-white" />;
      accentColor = 'border-[#e0691b] bg-[#e0691b]/10';
      badgeColor = 'bg-[#e0691b] text-white';
      break;
    case 'accepted':
      stateIcon = <CheckCircle2 size={16} className="text-white" />;
      accentColor = 'border-success bg-success/10';
      badgeColor = 'bg-success text-white';
      break;
    case 'preparing':
      stateIcon = <Sparkles size={16} className="text-white" />;
      accentColor = 'border-[#d99616] bg-[#d99616]/10';
      badgeColor = 'bg-[#d99616] text-white';
      break;
    case 'ready':
      stateIcon = <ShoppingBag size={16} className="text-white" />;
      accentColor = 'border-success bg-success/10';
      badgeColor = 'bg-success text-white';
      break;
    case 'completed':
      stateIcon = <Sparkles size={16} className="text-white animate-spin" />;
      accentColor = 'border-success bg-success/10';
      badgeColor = 'bg-success text-white';
      break;
    case 'low_stock':
      stateIcon = <AlertTriangle size={16} className="text-white" />;
      accentColor = 'border-danger bg-danger/10';
      badgeColor = 'bg-danger text-white';
      break;
    case 'printer_disconnected':
      stateIcon = <Printer size={16} className="text-white" />;
      accentColor = 'border-danger bg-danger/10';
      badgeColor = 'bg-danger text-white';
      break;
    case 'swiggy_import_success':
      stateIcon = <CheckCircle2 size={16} className="text-white" />;
      accentColor = 'border-success bg-success/10';
      badgeColor = 'bg-success text-white';
      break;
  }

  // Animation variants respecting user preferences
  const containerVariants = {
    minimized: {
      y: 0,
      x: 0,
      scale: 0.9,
      opacity: 0.8,
      transition: prefersReduced ? { duration: 0.1 } : { type: 'spring', stiffness: 260, damping: 20 }
    },
    expanded: {
      y: 0,
      x: 0,
      scale: 1,
      opacity: 1,
      transition: prefersReduced ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 20 }
    }
  };

  const bubbleVariants = {
    hidden: { scale: 0.6, opacity: 0, y: 15 },
    visible: {
      scale: 1,
      opacity: 1,
      y: 0,
      transition: prefersReduced ? { duration: 0.15 } : { type: 'spring', stiffness: 250, damping: 14 }
    },
    exit: { scale: 0.8, opacity: 0, transition: { duration: 0.1 } }
  };

  const handleActionClick = (action) => {
    if (action === 'inventory') {
      // Toggle sidebar or change screen to inventory
      const setScreen = useAppStore.getState().setScreen || (() => {});
      setScreen('inventory');
      setMascotState('idle', '');
      minimizeMascot();
    } else if (action === 'printer_retry') {
      // Trigger printer refresh
      window.kitchenOS?.printer?.list?.()
        .then(() => {
          setMascotState('idle', '');
          minimizeMascot();
        })
        .catch(() => {});
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {/* Speech Bubble */}
      <AnimatePresence>
        {showMascot && speechText && (
          <motion.div
            variants={bubbleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-auto relative mr-6 max-w-[280px] rounded-2xl border border-[#eadfd7]/80 bg-white p-4 shadow-xl backdrop-blur-md"
          >
            {/* Speech Bubble Tail */}
            <div className="absolute bottom-[-8px] right-[24px] h-4 w-4 rotate-45 border-b border-r border-[#eadfd7]/80 bg-white" />
            
            <button
              onClick={minimizeMascot}
              className="absolute right-2 top-2 rounded-full p-1 text-text-muted hover:bg-gray-100 transition-colors"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>

            <div className="flex gap-2.5">
              {stateIcon && (
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${badgeColor}`}>
                  {stateIcon}
                </div>
              )}
              <div className="flex-1">
                <p className="text-[13px] font-extrabold text-text-dark pr-3 leading-snug">
                  {speechText}
                </p>

                {/* Direct Actions in speech bubble */}
                {mascotState === 'low_stock' && (
                  <button
                    onClick={() => handleActionClick('inventory')}
                    className="mt-2.5 inline-block text-[11px] font-black uppercase text-primary hover:underline"
                  >
                    View Inventory →
                  </button>
                )}
                {mascotState === 'printer_disconnected' && (
                  <button
                    onClick={() => handleActionClick('printer_retry')}
                    className="mt-2.5 inline-block text-[11px] font-black uppercase text-primary hover:underline"
                  >
                    Retry Connection
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mascot Assistant Avatar */}
      <motion.div
        variants={containerVariants}
        animate={showMascot ? 'expanded' : 'minimized'}
        onClick={() => {
          if (showMascot) minimizeMascot();
          else setMascotState('idle', 'Hello! I am your kitchen assistant.');
        }}
        className="pointer-events-auto group relative cursor-pointer select-none"
      >
        <div className={`overflow-hidden rounded-full border shadow-card transition-all ${
          showMascot 
            ? 'h-24 w-24 bg-white/95 border-[#eadfd7]/80 ring-4 ring-primary/10' 
            : 'h-14 w-14 border-[#eadfd7]/60 bg-white/70 hover:bg-white hover:scale-105'
        }`}>
          {/* Chef Mascot Image with breathing keyframes */}
          <img
            src="chef_mascot.png"
            alt="Chef Mascot"
            className={`h-full w-full object-cover transition-transform duration-300 ${
              showMascot ? 'scale-105' : 'scale-90 group-hover:scale-100'
            }`}
            style={{
              animation: showMascot ? 'chef-breathing 4s infinite ease-in-out' : 'none'
            }}
          />
        </div>

        {/* Small operational indicator dot */}
        {mascotState !== 'idle' && (
          <span className="absolute right-0.5 top-0.5 flex h-4 w-4">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${badgeColor.split(' ')[0]}`} />
            <span className={`relative inline-flex h-4 w-4 rounded-full border border-white ${badgeColor.split(' ')[0]}`} />
          </span>
        )}
      </motion.div>

      {/* Custom breathe keyframes */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes chef-breathing {
          0%, 100% { transform: scale(1.05); }
          50% { transform: scale(1.01); }
        }
      `}} />
    </div>
  );
}
