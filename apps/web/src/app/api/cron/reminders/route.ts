import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/server/cron/auth";
import { processDueReminders } from "@/server/cron/process-reminders";

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processDueReminders();
  return NextResponse.json(result);
}
