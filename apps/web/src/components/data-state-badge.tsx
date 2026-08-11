import type { VariantProps } from "class-variance-authority";

import { Badge, type badgeVariants } from "@/components/ui/badge";
import {
  DATA_STATE_LABELS,
  DATA_STATE_TONE,
  type DataState,
} from "@/server/dashboard/data-states";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

/** The one place a DataState tone maps to a Badge visual variant — every consumer of
 * data-states.ts renders through this component so "Not assessed" / "Major gap" / "Verified
 * satisfactory" etc. never render as an ad hoc string or badge colour that could drift between
 * pages (see chat: "0"/"—"/"N/A"/"Not assessed"/missing data must never be conflated). */
const TONE_TO_VARIANT: Record<string, BadgeVariant> = {
  neutral: "secondary",
  amber: "warning",
  red: "destructive",
  green: "success",
  grey: "outline",
};

export function DataStateBadge({
  state,
  label,
}: {
  state: DataState;
  /** Override the default label, e.g. to add detail ("Major gap — 2 controls"). The tone is still
   * always derived from `state`. */
  label?: string;
}) {
  return (
    <Badge variant={TONE_TO_VARIANT[DATA_STATE_TONE[state]]}>
      {label ?? DATA_STATE_LABELS[state]}
    </Badge>
  );
}
