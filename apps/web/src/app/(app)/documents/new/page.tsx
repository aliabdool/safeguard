import { getDb } from "@/db";
import { departments, properties } from "@/db/schema";

import { DocumentForm } from "./document-form";

export default async function NewDocumentPage() {
  const db = getDb();
  const [allProperties, allDepartments] = await Promise.all([
    db.select({ id: properties.id, name: properties.name }).from(properties),
    db.select({ id: departments.id, name: departments.name }).from(departments),
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
