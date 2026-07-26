import { headers } from "next/headers";
import Link from "next/link";

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
import { catalystAppFromHeaders } from "@/lib/catalyst/app";

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

interface DocumentListRow {
  ROWID: string;
  document_number: string;
  title: string;
  category: string;
  confidentiality_level: string;
  status: string;
}

export default async function DocumentsPage() {
  const catalystApp = catalystAppFromHeaders(await headers());
  const rows = (await catalystApp.zcql().executeZCQLQuery(
    `select Documents.ROWID, Documents.document_number, Documents.title, Documents.category, Documents.confidentiality_level, Documents.status
     from Documents order by Documents.created_at desc limit 100`,
  )) as Array<{ Documents: DocumentListRow }>;
  const docs = rows.map((r) => r.Documents);

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

      {docs.length === 0 ? (
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
            {docs.map((doc) => (
              <TableRow key={doc.ROWID}>
                <TableCell>
                  <Link
                    href={`/documents/${doc.ROWID}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {doc.document_number}
                  </Link>
                </TableCell>
                <TableCell>{doc.title}</TableCell>
                <TableCell>{doc.category}</TableCell>
                <TableCell>{doc.confidentiality_level}</TableCell>
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
