import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, message, type }]);
  }, []);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDone={() => remove(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ toast, onDone }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="pointer-events-auto relative overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.06)] pl-3 pr-3 py-2.5 backdrop-blur-glass shadow-glow"
      style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent)' }}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0 text-[var(--accent)]">
          {toast.type === 'error' && <AlertCircle className="h-4 w-4" />}
          {toast.type === 'info' && <Info className="h-4 w-4" />}
          {toast.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
        </div>
        <p className="text-sm leading-snug text-[#F0F0F0]">{toast.message}</p>
      </div>
      <motion.div
        className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)]"
        initial={{ width: '100%' }}
        animate={{ width: 0 }}
        transition={{ duration: 3, ease: 'linear' }}
        onAnimationComplete={onDone}
      />
    </motion.div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
