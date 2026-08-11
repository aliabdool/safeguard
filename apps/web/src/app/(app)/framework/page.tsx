import { headers } from "next/headers";
import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import {
  FRAMEWORK_CATEGORIES,
  FRAMEWORK_CATEGORY_DESCRIPTIONS,
  FRAMEWORK_CATEGORY_LABELS,
  mapFrameworkCodeToCategory,
} from "@/server/framework/categories";

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

  const byCategory = new Map<string, FrameworkRow[]>();
  for (const f of allFrameworks) {
    const category = mapFrameworkCodeToCategory(f.code);
    const list = byCategory.get(category) ?? [];
    list.push(f);
    byCategory.set(category, list);
  }
  const hasLiveSdgFramework = allFrameworks.some((f) => f.code === "SDG");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          H&amp;S Framework &amp; KPI Catalogue
        </h1>
        <p className="text-muted-foreground text-sm">
          One master control library. Each control maps to one or more frameworks below —
          controls are never duplicated per framework. Frameworks are grouped by kind: a
          certifiable management system standard, an audit methodology, a sustainability
          disclosure standard, a set of voluntary principles, and SDG contribution mapping are
          not equivalent, and are never presented as if they were.
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
              <CardTitle className="text-base">Safety Performance Analytics</CardTitle>
              <CardDescription>Controlled KPI register + live dashboards.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {FRAMEWORK_CATEGORIES.map((category) => {
        const frameworksInCategory = byCategory.get(category) ?? [];
        // The SDG contribution-mapping page (see chat) is intentionally independent of any live
        // Frameworks row — there is no "SDG" certification/disclosure standard to catalogue, so
        // its category always renders (with a link to that page) even with zero live rows.
        const isEmptySdgCategory = category === "sdg" && !hasLiveSdgFramework;
        if (frameworksInCategory.length === 0 && !isEmptySdgCategory) {
          return (
            <section key={category} className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {FRAMEWORK_CATEGORY_LABELS[category]}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {FRAMEWORK_CATEGORY_DESCRIPTIONS[category]}
                </p>
              </div>
              <p className="text-muted-foreground text-sm italic">
                No frameworks currently catalogued in this category.
              </p>
            </section>
          );
        }

        return (
          <section key={category} className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {FRAMEWORK_CATEGORY_LABELS[category]}
              </h2>
              <p className="text-muted-foreground text-sm">
                {FRAMEWORK_CATEGORY_DESCRIPTIONS[category]}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {category === "sdg" ? (
                <Link href="/framework/sdg">
                  <Card className="hover:bg-accent/50 h-full">
                    <CardHeader>
                      <CardTitle className="text-base">
                        UN Sustainable Development Goals
                      </CardTitle>
                      <CardDescription>
                        Contribution mapping (SDG 3, 8, 13) — controls, KPIs, and evidence,
                        never a compliance percentage.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ) : null}
              {frameworksInCategory
                .filter((f) => f.code !== "SDG")
                .map((f) => (
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
          </section>
        );
      })}
    </div>
  );
}
