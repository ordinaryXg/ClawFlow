import React, { FC, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  children: ReactNode;
  title?: string;
  description?: string;
  actionLabel?: string;
};

type State = { hasError: boolean; error?: Error };

class ErrorBoundaryInner extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Keep console signal for debugging; renderer has no centralized logger yet.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="cf-card" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 6 }}>{this.props.title}</h3>
        {this.props.description ? <div className="cf-sub">{this.props.description}</div> : null}
        <div style={{ height: 12 }} />
        <button className="cf-btn cf-btnPrimary" onClick={this.reset}>
          {this.props.actionLabel}
        </button>
      </div>
    );
  }
}

const ErrorBoundary: FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  return (
    <ErrorBoundaryInner
      title={t('common.unexpectedErrorTitle')}
      description={t('common.unexpectedErrorBody')}
      actionLabel={t('common.retry')}
    >
      {children}
    </ErrorBoundaryInner>
  );
};

export default ErrorBoundary;

