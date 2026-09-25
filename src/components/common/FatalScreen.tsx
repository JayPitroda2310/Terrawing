interface FatalScreenProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Full-screen error message (WebGL unavailable, invalid data, crash). */
export function FatalScreen({ title, message, actionLabel, onAction }: FatalScreenProps) {
  return (
    <div
      role="alert"
      className="absolute inset-0 z-50 flex items-center justify-center bg-ops-bg p-8"
    >
      <div className="max-w-xl border border-ops-red/50 bg-ops-panel-strong p-8">
        <div className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-ops-red uppercase">
          System fault
        </div>
        <h1 className="mb-4 text-2xl font-semibold tracking-wide text-ops-text">{title}</h1>
        <pre className="mb-6 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ops-dim">
          {message}
        </pre>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="border border-ops-orange px-5 py-2.5 text-xs font-semibold tracking-[0.2em] text-ops-orange uppercase hover:bg-ops-orange hover:text-black"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
