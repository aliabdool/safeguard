import Link from "next/link";
import { desc } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db";
import { documents } from "@/db/schema";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "success" | "warning"
> = {
  draft: "secondary",
  under_review: "warning",
  approved: "success",
  expired: "destructive",
  superseded: "secondary",
  archived: "secondary",
};

export default async function DocumentsPage() {
  const db = getDb();
  const rows = await db.select().from(documents).orderBy(desc(documents.createdAt)).limit(100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Document &amp; evidence library
          </h1>
          <p className="text-muted-foreground text-sm">
            Upload once, approve once, use many times — one document version can be linked as
            evidence to many controls, KPIs, audits, findings and CAPA actions.
          </p>
        </div>
        <Button asChild>
          <Link href="/documents/new">New document</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No documents yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Confidentiality</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {doc.documentNumber}
                  </Link>
                </TableCell>
                <TableCell>{doc.title}</TableCell>
                <TableCell>{doc.category}</TableCell>
                <TableCell>{doc.confidentialityLevel}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[doc.status] ?? "default"}>
                    {doc.status.replace("_", " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
