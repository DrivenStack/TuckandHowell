"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, alphanumeric: sortFn_alphanumeric },
});

export interface Col<T> {
  id: string;
  header: string;
  /** Value used for sorting and CSV */
  value: (row: T) => string | number | null;
  /** Custom rendering, defaults to the value */
  cell?: (row: T) => ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  /** How the column appears on phones: as the card title, inside the meta grid, or hidden */
  mobile?: "title" | "meta" | "hidden";
  className?: string;
  /** Header tooltip / helper */
  headerExtra?: ReactNode;
}

export function DataTable<T extends RowData>({
  rows,
  columns,
  rowKey,
  onRowClick,
  initialSort,
  csvName,
  empty,
  rowClassName,
  caption,
}: {
  rows: T[];
  columns: Col<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  initialSort?: { id: string; desc?: boolean };
  csvName?: string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  caption: string;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [{ id: initialSort.id, desc: !!initialSort.desc }] : []);
  const defs = useMemo(
    () =>
      columns.map(
        (c) =>
          ({
            id: c.id,
            accessorFn: (r: T) => c.value(r) ?? -Infinity,
            header: c.header,
            enableSorting: c.sortable !== false,
            sortFn: "basic",
            sortUndefined: "last",
          }) as ColumnDef<typeof features, T>,
      ),
    [columns],
  );
  const table = useTable({
    features,
    columns: defs,
    data: rows,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (r: T) => rowKey(r),
  });
  const sortedRows = table.getRowModel().rows.map((r) => r.original);
  const byId = new Map(columns.map((c) => [c.id, c]));
  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const metaCols = columns.filter((c) => c !== titleCol && c.mobile !== "hidden");

  return (
    <div>
      {csvName ? (
        <div className="mb-3 flex justify-end">
          <CsvButton name={csvName} columns={columns} rows={sortedRows} />
        </div>
      ) : null}
      {!rows.length && empty ? (
        empty
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-panel md:block">
            <table className="w-full border-collapse text-small">
              <caption className="sr-only">{caption}</caption>
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-line">
                    {hg.headers.map((h) => {
                      const col = byId.get(h.column.id)!;
                      const dir = h.column.getIsSorted();
                      const canSort = h.column.getCanSort();
                      return (
                        <th
                          key={h.id}
                          scope="col"
                          aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                          className={cn(
                            "h-11 px-4 text-left align-middle text-caption font-medium whitespace-nowrap text-muted-foreground",
                            col.align === "right" && "text-right",
                          )}
                        >
                          <span className={cn("inline-flex items-center gap-1", col.align === "right" && "flex-row-reverse")}>
                            {canSort ? (
                              <button
                                type="button"
                                onClick={h.column.getToggleSortingHandler()}
                                className={cn("-mx-1 inline-flex h-8 items-center gap-1 rounded-[6px] px-1 hover:text-ink", dir && "text-ink")}
                              >
                                {col.header}
                                {dir === "asc" ? (
                                  <ArrowUp className="size-3.5" aria-hidden />
                                ) : dir === "desc" ? (
                                  <ArrowDown className="size-3.5" aria-hidden />
                                ) : (
                                  <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                                )}
                              </button>
                            ) : (
                              col.header
                            )}
                            {col.headerExtra}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={rowKey(r)}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={cn(
                      "border-b border-line last:border-0",
                      onRowClick && "cursor-pointer hover:bg-subtle/60",
                      rowClassName?.(r),
                    )}
                  >
                    {columns.map((c, ci) => (
                      <td key={c.id} className={cn("h-14 px-4 align-middle", c.align === "right" && "num text-right", c.className)}>
                        {ci === 0 && onRowClick ? (
                          <button
                            type="button"
                            className="text-left outline-none focus-visible:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRowClick(r);
                            }}
                          >
                            {c.cell ? c.cell(r) : c.value(r)}
                          </button>
                        ) : c.cell ? (
                          c.cell(r)
                        ) : (
                          c.value(r)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked rows */}
          <ul className="divide-y divide-line border-y border-line md:hidden" aria-label={caption}>
            {sortedRows.map((r) => {
              const content = (
                <>
                  <div className="text-body font-medium">{titleCol.cell ? titleCol.cell(r) : titleCol.value(r)}</div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                    {metaCols.map((c) => (
                      <div key={c.id} className="min-w-0">
                        <dt className="text-caption text-muted-foreground">{c.header}</dt>
                        <dd className={cn("text-small", c.align === "right" && "num")}>{c.cell ? c.cell(r) : c.value(r)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              );
              return (
                <li key={rowKey(r)} className={rowClassName?.(r)}>
                  {onRowClick ? (
                    <button type="button" onClick={() => onRowClick(r)} className="block w-full py-4 text-left">
                      {content}
                    </button>
                  ) : (
                    <div className="py-4">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------------- CSV export ---------------- */

function toCsv<T>(columns: Col<T>[], rows: T[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.header)).join(","), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(","))].join("\n");
}

export function CsvButton<T>({ name, columns, rows, className }: { name: string; columns: Col<T>[]; rows: T[]; className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={() => {
        const blob = new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      <Download aria-hidden />
      Export to CSV
    </Button>
  );
}
