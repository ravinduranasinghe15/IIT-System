"use client";

import { useRef, useState, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/** Drag-and-drop + click-to-browse file picker. */
export function FileDropzone({
  accept,
  onFiles,
  multiple,
  title = "Drag & drop a file here",
  hint,
  className,
  compact,
}: {
  accept?: string;
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  title?: string;
  hint?: string;
  className?: string;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-muted/40 text-center transition",
        compact ? "px-4 py-5" : "px-6 py-10",
        over ? "border-brand bg-brand/5" : "border-input hover:border-brand/60",
        className,
      )}
    >
      <UploadCloud className="size-8 text-brand" />
      <div className="text-sm font-medium text-ink">{title}</div>
      <div className="text-xs text-slate">or click to browse{hint ? ` · ${hint}` : ""}</div>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
