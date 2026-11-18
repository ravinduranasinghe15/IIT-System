"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal scroll container with visible left / right buttons (for phones, where a wide table is otherwise hard to
 * discover or reach). The buttons only appear while there is more to scroll in that direction.
 * Works with the shared <Table>, which already wraps its <table> in its own scrolling container.
 */
export function ScrollX({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  /** The element that actually scrolls: the Table's own container when present, else our wrapper. */
  const scroller = useCallback(() => (root.current?.querySelector<HTMLElement>('[data-slot="table-container"]') ?? (root.current?.firstElementChild as HTMLElement | null) ?? null), []);

  const measure = useCallback(() => {
    const el = scroller();
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, [scroller]);

  useEffect(() => {
    const el = scroller();
    if (!el) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, scroller]);

  const go = (dir: -1 | 1) => {
    const el = scroller();
    el?.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: "smooth" });
  };

  const btn = "absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-card/95 text-navy shadow-md active:scale-95";
  return (
    <div ref={root} className="relative min-w-0 max-w-full">
      <div className={cn("scroll-thin overflow-x-auto", className)}>{children}</div>
      {edge.left && (
        <button type="button" aria-label="Scroll left" onClick={() => go(-1)} className={cn(btn, "left-1.5")}>
          <ChevronLeft className="size-5" />
        </button>
      )}
      {edge.right && (
        <button type="button" aria-label="Scroll right" onClick={() => go(1)} className={cn(btn, "right-1.5")}>
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  );
}
