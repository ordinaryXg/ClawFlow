import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './chat.css';

export function formatThinkingBody(raw: string): { isJson: boolean; display: string } {
  const t = raw.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return { isJson: true, display: JSON.stringify(JSON.parse(t), null, 2) };
    } catch {
      /* ignore */
    }
  }
  return { isJson: false, display: raw };
}

type Props = {
  text: string;
  /** 流式生成中：默认展开 */
  streaming?: boolean;
  className?: string;
};

const ThinkingBlock: FC<Props> = ({ text, streaming = false, className }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(streaming);

  useEffect(() => {
    if (streaming) setExpanded(true);
  }, [streaming]);

  const { isJson, display } = useMemo(() => formatThinkingBody(text), [text]);

  const oneLine = useMemo(() => {
    const line = display.replace(/\s+/g, ' ').trim();
    return line.length > 120 ? `${line.slice(0, 117)}…` : line || t('chat.thinkingEmpty');
  }, [display, t]);

  if (!text.trim()) return null;

  return (
    <div className={['cf-thinkingBlock', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="cf-thinkingBlock__bar"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="cf-thinkingBlock__chevron" aria-hidden>
          {expanded ? '▼' : '▶'}
        </span>
        <span className="cf-thinkingBlock__label">{t('chat.thinkingLabel')}</span>
        {!expanded ? <span className="cf-thinkingBlock__summary">{oneLine}</span> : null}
      </button>
      {expanded ? (
        isJson ? (
          <pre className="cf-thinkingBlock__pre">{display}</pre>
        ) : (
          <div className="cf-thinkingBlock__body">{display}</div>
        )
      ) : null}
    </div>
  );
};

export default ThinkingBlock;
