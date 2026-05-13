import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ToastType = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
};

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export const ToastHost: FC = () => {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const api = useMemo(() => {
    const push = (type: ToastType, title: string, message?: string) => {
      const id = uid();
      setToasts((prev) => [...prev, { id, type, title, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    };
    return {
      success: (title: string, message?: string) => push('success', title, message),
      error: (title: string, message?: string) => push('error', title, message),
      info: (title: string, message?: string) => push('info', title, message),
      dismiss: (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    };
  }, []);

  useEffect(() => {
    (window as any).__cf_toast = api;
    return () => {
      if ((window as any).__cf_toast === api) (window as any).__cf_toast = undefined;
    };
  }, [api]);

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 18, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 60 }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            minWidth: 320,
            maxWidth: 420,
            borderRadius: 14,
            border: `1px solid ${
              toast.type === 'success'
                ? 'rgba(30,91,69,.5)'
                : toast.type === 'info'
                  ? 'rgba(70,120,180,.55)'
                  : 'rgba(194,75,75,.5)'
            }`,
            background: 'rgba(26,29,33,.92)',
            boxShadow: 'var(--shadow)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <b style={{ fontSize: 12 }}>{toast.title}</b>
            {toast.message ? <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>{toast.message}</p> : null}
          </div>
          <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => api.dismiss(toast.id)}>
            {t('common.close')}
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastHost;

