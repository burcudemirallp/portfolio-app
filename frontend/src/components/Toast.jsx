import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);
let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const showSuccess = useCallback((msg) => showToast(msg, 'success'), [showToast]);
  const showError = useCallback((msg) => showToast(msg, 'error', 6000), [showToast]);
  const showInfo = useCallback((msg) => showToast(msg, 'info'), [showToast]);
  const showWarning = useCallback((msg) => showToast(msg, 'warning', 5000), [showToast]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const typeStyles = {
    success: 'bg-bnc-green text-bnc-bg',
    error: 'bg-bnc-red text-bnc-bg',
    info: 'bg-bnc-accent text-bnc-bg',
    warning: 'bg-bnc-surfaceAlt text-bnc-accent border border-bnc-accent'
  };

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo, showWarning }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" aria-live="polite" aria-atomic="false">
        {toasts.map(toast => (
          <div
            key={toast.id}
            role="status"
            onClick={() => dismiss(toast.id)}
            className={`px-4 py-3 rounded-lg shadow-lg cursor-pointer text-sm font-medium transition-all duration-300 animate-slide-in
              ${typeStyles[toast.type] || typeStyles.info}
            `}
          >
            <div className="flex items-start gap-2">
              <span className="whitespace-pre-wrap">{toast.message}</span>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
