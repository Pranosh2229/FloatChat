"use client";

import { useEffect, useRef, useState } from "react";

interface CsvRow {
  [column: string]: string | number;
}

interface ExportMenuProps {
  /** Base filename, no extension — timestamped and suffixed with .json/.csv on download. */
  filename: string;
  /** Human-readable text for "Copy summary" — omit to hide that option. */
  summary?: string;
  /** The real structured data behind this view, for "Copy JSON" / "Download JSON". */
  json: unknown;
  /** Flat tabular rows for "Download CSV" — omit to hide that option (not everything is tabular). */
  csvRows?: CsvRow[];
  className?: string;
}

function toCsv(rows: CsvRow[]): string {
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((k) => set.add(k));
    return set;
  }, new Set<string>()));
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => escape(row[c] ?? "")).join(","));
  return lines.join("\n");
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reusable export control for anything backed by real fetched data (a case file's evidence, a
 * float's trajectory, the dashboard's stats) — four honest options: copy a plain-English summary
 * or the raw JSON to the clipboard, or download either as a file. Never used on fabricated or
 * placeholder data. CSV is only offered where the caller has genuinely tabular rows to give it;
 * forcing every shape into a spreadsheet would just produce a useless one-cell CSV.
 */
export function ExportMenu({ filename, summary, json, csvRows, className }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [justDid, setJustDid] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const flash = (what: string) => {
    setJustDid(what);
    window.setTimeout(() => setJustDid((cur) => (cur === what ? null : cur)), 1500);
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(what);
    } catch {
      /* clipboard unavailable (permissions, insecure context) — silently no-op, nothing to fall back to */
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Export"
        title="Export"
        className="btn btn-ghost card !px-2.5 !py-1.5 !text-[11px]"
      >
        ⤓ Export
      </button>
      {open && (
        <div className="card rise absolute right-0 top-[calc(100%+6px)] z-20 w-48 overflow-hidden rounded-xl p-1.5">
          {summary && (
            <button
              type="button"
              onClick={() => copy(summary, "summary")}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[var(--graphite-2)] transition-colors hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
            >
              Copy summary
              {justDid === "summary" && <span className="text-[10px] text-[var(--cobalt)]">copied</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => copy(JSON.stringify(json, null, 2), "json")}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[var(--graphite-2)] transition-colors hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
          >
            Copy JSON
            {justDid === "json" && <span className="text-[10px] text-[var(--cobalt)]">copied</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              download(JSON.stringify(json, null, 2), `${filename}-${stamp}.json`, "application/json");
              setOpen(false);
            }}
            className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[var(--graphite-2)] transition-colors hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
          >
            Download JSON
          </button>
          {csvRows && csvRows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                download(toCsv(csvRows), `${filename}-${stamp}.csv`, "text/csv");
                setOpen(false);
              }}
              className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[var(--graphite-2)] transition-colors hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
            >
              Download CSV
            </button>
          )}
        </div>
      )}
    </div>
  );
}
