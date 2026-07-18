import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ExportIncidentsButton } from "./export-button";

export default function ExportPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data export</h1>
        <p className="text-muted-foreground text-sm">
          Permission-controlled — scoped to your granted properties, excludes medical/clinical
          data entirely, and every export is written to the audit trail.
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
    </div>
  );
}
