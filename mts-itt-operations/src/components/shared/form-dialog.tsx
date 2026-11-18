"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" };

/** Standard modal: title, optional description, scrollable body and footer actions. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0", SIZES[size])}>
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="text-base text-navy">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <DialogFooter className="m-0 shrink-0 rounded-none border-t bg-muted/40 px-5 py-3">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
