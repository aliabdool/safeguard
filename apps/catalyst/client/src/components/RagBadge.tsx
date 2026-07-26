import type { RagStatus } from "../lib/types";

const LABELS: Record<RagStatus, string> = { red: "Red", amber: "Amber", green: "Green", unknown: "Not rated" };

export function RagBadge({ status }: { status: RagStatus }) {
  return (
    <span className={`sg-badge ${status}`}>
      <span className="dot" />
      {LABELS[status]}
    </span>
  );
}
