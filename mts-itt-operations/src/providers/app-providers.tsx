"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AppProvider } from "@/contexts/app-context";
import { AppLayout } from "@/components/layout/app-layout";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <TooltipProvider delay={200}><AppLayout>{children}</AppLayout></TooltipProvider>
      <Toaster position="top-right" richColors closeButton />
    </AppProvider>
  );
}
