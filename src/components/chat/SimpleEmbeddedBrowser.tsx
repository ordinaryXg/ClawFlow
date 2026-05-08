import { FC, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DEFAULT_URL = 'https://example.com';

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t)) return `https://${t}`;
  try {
    // eslint-disable-next-line no-new
    new URL(t);
    return t;
  } catch {
    return null;
  }
}

const SimpleEmbeddedBrowser: FC = () => {
  const { t } = useTranslation();
  const wvRef = useRef<HTMLElement | null>(null);
  const [input, setInput] = useState(DEFAULT_URL);
  const [activeSrc, setActiveSrc] = useState(DEFAULT_URL);

  const go = useCallback(() => {
    const u = normalizeUrl(input);
    if (u) setActiveSrc(u);
  }, [input]);

  return (
    <div className="cf-embeddedBrowser">
      <div className="cf-embeddedBrowser__toolbar">
        <input
          className="cf-input cf-embeddedBrowser__url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go();
            }
          }}
          placeholder={t('chat.rightTabs.browserUrlPh')}
          aria-label={t('chat.rightTabs.browserUrlPh')}
        />
        <button type="button" className="cf-btn cf-btnPrimary cf-btnSmall" onClick={go}>
          {t('chat.rightTabs.browserGo')}
        </button>
        <button
          type="button"
          className="cf-btn cf-btnSmall"
          onClick={() => {
            const el = wvRef.current as { reload?: () => void } | null;
            el?.reload?.();
          }}
        >
          {t('chat.rightTabs.browserReload')}
        </button>
      </div>
      {/* Electron <webview>：需主窗口 webPreferences.webviewTag */}
      <webview
        ref={wvRef}
        className="cf-embeddedBrowser__webview"
        src={activeSrc}
        allowpopups={true}
      />
    </div>
  );
};

export default SimpleEmbeddedBrowser;
