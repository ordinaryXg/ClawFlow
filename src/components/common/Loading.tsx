import { FC } from 'react';

type Props = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  inline?: boolean;
};

const Loading: FC<Props> = ({ label, size = 'md', inline }) => {
  const cls = `cf-loading${inline ? ' cf-loading--inline' : ''} cf-loading--${size}`;
  return (
    <div className={cls} role="status" aria-live="polite">
      <span className="cf-loading__spinner" aria-hidden />
      {label ? <span className="cf-loading__label">{label}</span> : null}
    </div>
  );
};

export default Loading;

