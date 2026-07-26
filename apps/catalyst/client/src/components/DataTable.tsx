export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

/** Row 5/6 tables — actions requiring attention, data-quality/assurance blockers, register
 * listings. Every row that represents an action carries owner/due-date/RAG per caller convention;
 * this component is deliberately generic (columns supplied by the caller) rather than 20 bespoke
 * table components. */
export function DataTable<T>({ columns, rows, emptyMessage, rowKey }: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  rowKey: (row: T) => string;
}) {
  if (rows.length === 0) {
    return <div className="sg-empty">{emptyMessage ?? "No records to show."}</div>;
  }
  return (
    <div className="sg-table-wrap">
      <table className="sg-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
