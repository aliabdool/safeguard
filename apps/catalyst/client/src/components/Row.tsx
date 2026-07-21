export function Row({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="sg-row">
      <div className="sg-row-title">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Loading() {
  return <div className="sg-loading">Loading…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="sg-alert critical">{message}</div>;
}
