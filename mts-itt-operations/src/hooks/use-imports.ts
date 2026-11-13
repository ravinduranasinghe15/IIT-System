"use client";

import { useCallback, useMemo } from "react";
import { useApp } from "@/contexts/app-context";
import { commitImport, type CommitImportInput, type CommitImportResult } from "@/lib/mutations/import";

export function useImportStats() {
  const { db } = useApp();
  return useMemo(() => {
    const real = db.imports.filter((i) => i.status !== "Rejected – Duplicate File");
    return {
      totalImports: db.imports.length,
      rowsImported: real.reduce((s, i) => s + i.success, 0),
      rowsRejected: real.reduce((s, i) => s + i.failed + i.duplicate, 0),
      exceptionsRaised: real.reduce((s, i) => s + i.exceptionsRaised, 0),
      duplicateFiles: db.imports.filter((i) => i.status === "Rejected – Duplicate File").length,
    };
  }, [db.imports]);
}

export function useImportActions() {
  const { update } = useApp();
  const commit = useCallback((input: CommitImportInput): CommitImportResult => update((d) => commitImport(d, input)), [update]);
  return { commit };
}
