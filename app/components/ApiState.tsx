import { RefreshCw } from "lucide-react";

export function LoadingState({ label = "Carregando informações" }: { label?: string }) {
  return (
    <div className="state-card state-loading" role="status" aria-live="polite">
      <span className="state-spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <p>Só um instante.</p>
      </div>
    </div>
  );
}

export function ErrorState({
  message = "Não foi possível carregar esta área.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="state-card state-error" role="alert">
      <div>
        <span className="state-kicker">Algo deu errado</span>
        <strong>{message}</strong>
        <p>O servidor está iniciando. Isso pode levar alguns segundos.</p>
      </div>
      <button className="button button-compact button-secondary" type="button" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-card state-empty">
      <span className="empty-mark" aria-hidden="true">BRB</span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}
