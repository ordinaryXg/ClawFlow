import { FC, useEffect, useState } from 'react';
import { FileOutlined } from '@ant-design/icons';

type Props = {
  absPath: string;
  fileName: string;
  disabled?: boolean;
  removeAriaLabel: string;
  onRemove: () => void;
};

export const ChatInputAttachmentChip: FC<Props> = ({ absPath, fileName, disabled, removeAriaLabel, onRemove }) => {
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const api = window.electronAPI?.appGetFileIconDataUrl;
    if (!api) return;
    void (async () => {
      try {
        const r = await api(absPath);
        if (!alive) return;
        if (r && typeof r === 'object' && 'ok' in r && r.ok && 'dataUrl' in r && typeof (r as { dataUrl?: string }).dataUrl === 'string') {
          setIconUrl((r as { dataUrl: string }).dataUrl);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [absPath]);

  return (
    <div className="cf-chatInput__attachChipWrap">
      <span className="cf-chatInput__attachChip" title={absPath}>
        {iconUrl ? (
          <img src={iconUrl} alt="" className="cf-chatInput__attachIconImg" width={16} height={16} decoding="async" />
        ) : (
          <span className="cf-chatInput__attachIconPh" aria-hidden>
            <FileOutlined />
          </span>
        )}
        <span className="cf-chatInput__attachName">{fileName}</span>
      </span>
      <button
        type="button"
        className="cf-chatInput__attachRemove"
        disabled={disabled}
        onClick={onRemove}
        aria-label={removeAriaLabel}
      >
        ×
      </button>
    </div>
  );
};
