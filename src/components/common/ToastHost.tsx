import { FC, useEffect, useMemo, useState } from 'react';

type ToastType = 'success' | 'error';

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
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            minWidth: 320,
            maxWidth: 420,
            borderRadius: 14,
            border: `1px solid ${t.type === 'success' ? 'rgba(30,91,69,.5)' : 'rgba(194,75,75,.5)'}`,
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
            <b style={{ fontSize: 12 }}>{t.title}</b>
            {t.message ? <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>{t.message}</p> : null}
          </div>
          <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => api.dismiss(t.id)}>
            关闭
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastHost;

