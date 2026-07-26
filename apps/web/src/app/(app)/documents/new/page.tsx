import { headers } from "next/headers";

import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { listDepartments, listProperties } from "@/server/identity/catalyst-identity";

import { DocumentForm } from "./document-form";

export default async function NewDocumentPage() {
  const catalystApp = catalystAppFromHeaders(await headers());
  const [allProperties, allDepartments] = await Promise.all([
    listProperties(catalystApp),
    listDepartments(catalystApp),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New document</h1>
        <p className="text-muted-foreground text-sm">
          Creates the document record. Upload the first version from the document page once
          created.
        </p>
      </div>
      <DocumentForm properties={allProperties} departments={allDepartments} />
    </div>
  );
}
