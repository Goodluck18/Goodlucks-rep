import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { ToastNotification } from '../types';

interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-4 right-4 left-4 sm:left-auto sm:right-6 sm:top-6 z-[9999] flex flex-col gap-3 max-w-md pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};

interface ToastItemProps {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const duration = toast.duration || 4500;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  const getStyle = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-surface border-interactive/60 text-ink shadow-ink/10',
          iconBg: 'bg-interactive/20 text-ink border border-interactive/30',
          progressBg: 'bg-interactive',
          icon: <CheckCircle2 className="w-5 h-5 text-ink" />,
        };
      case 'error':
        return {
          bg: 'bg-surface border-rose-500/60 text-ink shadow-rose-500/20',
          iconBg: 'bg-rose-500/20 text-rose-700 border border-rose-500/30',
          progressBg: 'bg-rose-500',
          icon: <AlertCircle className="w-5 h-5 text-rose-700" />,
        };
      case 'warning':
        return {
          bg: 'bg-surface border-amber-500/60 text-ink shadow-amber-500/20',
          iconBg: 'bg-amber-500/20 text-amber-700 border border-amber-500/30',
          progressBg: 'bg-amber-500',
          icon: <AlertTriangle className="w-5 h-5 text-amber-700" />,
        };
      case 'info':
      default:
        return {
          bg: 'bg-surface border-cyan-500/60 text-ink shadow-cyan-500/20',
          iconBg: 'bg-cyan-500/20 text-cyan-700 border border-cyan-500/30',
          progressBg: 'bg-cyan-400',
          icon: <Info className="w-5 h-5 text-cyan-700" />,
        };
    }
  };

  const style = getStyle();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`relative overflow-hidden pointer-events-auto rounded-2xl border p-4 shadow-lg backdrop-blur-md flex items-start gap-3.5 ${style.bg}`}
    >
      <div className={`p-2 rounded-xl shrink-0 ${style.iconBg}`}>
        {style.icon}
      </div>

      <div className="flex-1 pr-2 pt-0.5 min-w-0">
        <h4 className="text-sm font-bold text-ink leading-tight tracking-tight">
          {toast.title}
        </h4>
        {toast.message && (
          <p className="text-xs text-ink/70 mt-1 leading-snug break-words">
            {toast.message}
          </p>
        )}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="text-ink/70 hover:text-ink p-1 rounded-lg hover:bg-page transition-colors shrink-0 -mr-1 -mt-1"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress Line */}
      <motion.div
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: duration / 1000, ease: 'linear' }}
        className={`absolute bottom-0 left-0 h-1 ${style.progressBg} opacity-80`}
      />
    </motion.div>
  );
};
