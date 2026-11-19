"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "./theme-provider";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Header button: pick light, dark or follow the device. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolved, setTheme } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change theme"
        title="Theme"
        className={cn("flex size-9 items-center justify-center rounded-lg text-slate outline-none transition hover:bg-muted hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/40", className)}
      >
        <Icon className="size-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map(({ value, label, icon: I }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)} aria-checked={theme === value}>
            <I /> {label}
            {theme === value && <Check className="ml-auto size-4 text-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
