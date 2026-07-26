import { headers } from "next/headers";
import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";

interface FrameworkRow extends CatalystRow {
  code: string;
  name: string;
  description: string;
}

export default async function FrameworkLandingPage() {
  const catalystApp = catalystAppFromHeaders(await headers());
  const allFrameworks = (await catalystApp
    .datastore()
    .table("Frameworks")
    .getRows({})) as FrameworkRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          H&amp;S Framework &amp; KPI Catalogue
        </h1>
        <p className="text-muted-foreground text-sm">
          One master control library. Each control maps to one or more frameworks below —
          controls are never duplicated per framework.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Link href="/framework/controls">
          <Card className="hover:bg-accent/50 h-full">
            <CardHeader>
              <CardTitle className="text-base">Master control library</CardTitle>
              <CardDescription>Browse and assess every control.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/kpis">
          <Card className="hover:bg-accent/50 h-full">
            <CardHeader>
              <CardTitle className="text-base">KPI catalogue</CardTitle>
              <CardDescription>Controlled register + live dashboards.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {allFrameworks.map((f) => (
          <Link key={f.ROWID} href={`/framework/${f.code}`}>
            <Card className="hover:bg-accent/50 h-full">
              <CardHeader>
                <CardTitle className="text-base">{f.name}</CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
