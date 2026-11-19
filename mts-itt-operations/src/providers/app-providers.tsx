"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AppProvider } from "@/contexts/app-context";
import { AppLayout } from "@/components/layout/app-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/components/theme/theme-provider";

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster position="top-right" richColors closeButton theme={resolved} />;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AppProvider>
        <TooltipProvider delay={200}><AppLayout>{children}</AppLayout></TooltipProvider>
        <ThemedToaster />
      </AppProvider>
    </ThemeProvider>
  );
}
