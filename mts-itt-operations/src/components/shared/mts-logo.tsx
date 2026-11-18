import { cn } from "@/lib/utils";

/** The MTS logo (public/mts-logo.jpg). The picture has a white background, so it sits on a white tile. */
export function MtsLogo({ className, pulse }: { className?: string; pulse?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mts-logo.jpg" alt="MTS" className={cn("size-full object-contain", pulse && "animate-pulse")} draggable={false} />
    </span>
  );
}
