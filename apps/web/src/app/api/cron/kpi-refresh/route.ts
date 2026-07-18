import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/server/cron/auth";
import { refreshAllKpiSnapshots } from "@/server/cron/refresh-kpis";

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshAllKpiSnapshots();
  return NextResponse.json(result);
}
