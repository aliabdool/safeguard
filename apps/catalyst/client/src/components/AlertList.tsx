export interface AlertItem {
  severity: "critical" | "warning" | "info";
  message: string;
}

/** Row 1 of every dashboard — critical alerts. */
export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return <div className="sg-empty">No critical alerts for this scope.</div>;
  }
  return (
    <div className="sg-alert-list">
      {alerts.map((a, i) => (
        <div className={`sg-alert ${a.severity}`} key={i}>
          {a.message}
        </div>
      ))}
    </div>
  );
}
