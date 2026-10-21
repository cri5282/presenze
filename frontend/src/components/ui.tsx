import type { ReactNode } from "react";

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Caricamento"
    />
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="link-button" onClick={onRetry}>
          Riprova
        </button>
      ) : null}
    </div>
  );
}
