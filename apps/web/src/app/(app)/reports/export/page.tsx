import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { recentFinancialYears } from "@/server/kpi/period";

import { generateAssurancePackAction, generateBoardNarrativeAction } from "./actions";
import { ExportIncidentsButton, GenerateMarkdownButton } from "./export-button";

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; propertyId?: string }>;
}) {
  const { fy, propertyId } = await searchParams;
  const fyOptions = recentFinancialYears(new Date());
  const selectedFy = fyOptions.find((o) => o.label === fy) ?? fyOptions[0]!;
  const boardNarrativeAction = generateBoardNarrativeAction.bind(
    null,
    selectedFy.label,
    propertyId ?? null,
  );
  const assurancePackAction = generateAssurancePackAction.bind(
    null,
    selectedFy.label,
    propertyId ?? null,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports &amp; exports</h1>
        <p className="text-muted-foreground text-sm">
          Permission-controlled — scoped to your granted properties, excludes medical/clinical
          data entirely, and every export is written to the audit trail. Board narrative and
          assurance pack are generated for <strong>{selectedFy.label}</strong> — change the
          financial year from the dashboard&rsquo;s FY selector and follow this link again to
          regenerate for a different period.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Incidents (CSV)</CardTitle>
          <CardDescription>
            Available to Super Administrator, Group H&amp;S Administrator, Property H&amp;S
            Officer, Internal Auditor, and Executive Read-Only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportIncidentsButton />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Board narrative (Markdown)</CardTitle>
          <CardDescription>
            Auto-generated, deterministic prose built entirely from the same live KPI figures
            as the dashboard tiles — never fabricated, never an LLM call. States gaps and
            caveats explicitly rather than smoothing them over.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateMarkdownButton
            label="Generate board narrative"
            busyLabel="Generating..."
            filenamePrefix={`board-narrative-${selectedFy.label}`}
            action={boardNarrativeAction}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assurance readiness pack (Markdown)</CardTitle>
          <CardDescription>
            KPI evidence table, control-readiness and critical-gap summary, open critical/major
            findings, CAPA status and data-quality exceptions — structured for an ISAE 3000
            (Revised) type engagement. Clearly labelled as a management self-assessment, not an
            assurance opinion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateMarkdownButton
            label="Generate assurance pack"
            busyLabel="Generating..."
            filenamePrefix={`assurance-pack-${selectedFy.label}`}
            action={assurancePackAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
