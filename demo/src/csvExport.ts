// SPDX-License-Identifier: Apache-2.0
/**
 * Issue #118 – CSV export of stream history.
 *
 * Converts an array of TxRecord objects into a RFC 4180-compliant CSV string
 * and triggers a browser download. Works for streams with 1000+ events by
 * streaming rows without building a large DOM structure.
 */

import { TxRecord } from "./useTransactionHistory";

const HEADERS = ["date", "type", "amount", "stream_id"] as const;

/** Escape a CSV cell value per RFC 4180. */
function escapeCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build a CSV string from transaction records.
 * @param records  Array of TxRecord (may be large — processed row-by-row).
 * @param streamId The stream ID to include in every row.
 */
export function buildCsv(records: TxRecord[], streamId: bigint): string {
  const rows: string[] = [HEADERS.join(",")];
  for (const r of records) {
    const date = r.timestamp ? new Date(r.timestamp).toISOString() : "";
    rows.push(
      [
        escapeCell(date),
        escapeCell(r.type),
        escapeCell(r.amount ?? ""),
        escapeCell(streamId.toString()),
      ].join(",")
    );
  }
  return rows.join("\r\n");
}

/**
 * Trigger a CSV file download in the browser.
 * @param csv      CSV string produced by buildCsv.
 * @param filename Suggested filename (e.g. "stream-42-history.csv").
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convenience: fetch ALL pages of history for a stream then download as CSV.
 * Handles streams with 1000+ events by paginating until exhausted.
 *
 * @param streamId  Stream to export.
 * @param fetchPage Function that fetches one page given an optional cursor,
 *                  returning records and the next cursor (null when done).
 */
export async function exportAllHistory(
  streamId: bigint,
  fetchPage: (cursor?: string) => Promise<{ records: TxRecord[]; nextCursor: string | null }>
): Promise<void> {
  const all: TxRecord[] = [];
  let cursor: string | undefined;

  do {
    const { records, nextCursor } = await fetchPage(cursor);
    all.push(...records);
    cursor = nextCursor ?? undefined;
  } while (cursor);

  const csv = buildCsv(all, streamId);
  downloadCsv(csv, `stream-${streamId}-history.csv`);
}
