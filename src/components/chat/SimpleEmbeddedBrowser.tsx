import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeHttpUrl } from '../../utils/normalize-http-url';

const DEFAULT_URL = 'https://example.com';

export type SimpleEmbeddedBrowserProps = {
  /** 由主进程工具经 IPC 请求导航；非 null 时应用该 URL 并触发 onConsumedExternalNavigate */
  externalNavigateUrl?: string | null;
  onConsumedExternalNavigate?: () => void;
};

const SimpleEmbeddedBrowser: FC<SimpleEmbeddedBrowserProps> = ({
  externalNavigateUrl = null,
  onConsumedExternalNavigate,
}) => {
  const { t } = useTranslation();
  const wvRef = useRef<HTMLElement | null>(null);
  const [input, setInput] = useState(DEFAULT_URL);
  const [activeSrc, setActiveSrc] = useState(DEFAULT_URL);

  const setWebviewRef = useCallback((el: HTMLElement | null) => {
    wvRef.current = el;
    if (el) el.setAttribute('allowpopups', 'true');
  }, []);

  const go = useCallback(() => {
    const u = normalizeHttpUrl(input);
    if (u) setActiveSrc(u);
  }, [input]);

  useEffect(() => {
    if (externalNavigateUrl == null || externalNavigateUrl === '') return;
    const u = normalizeHttpUrl(externalNavigateUrl);
    if (u) {
      setInput(u);
      setActiveSrc(u);
    }
    onConsumedExternalNavigate?.();
  }, [externalNavigateUrl, onConsumedExternalNavigate]);

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
        ref={setWebviewRef}
        className="cf-embeddedBrowser__webview"
        src={activeSrc}
      />
    </div>
  );
};

export default SimpleEmbeddedBrowser;
