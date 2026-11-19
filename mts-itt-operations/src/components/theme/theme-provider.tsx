"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
export const THEME_KEY = "mts-itt-theme";

/** Runs before the page is painted (see the inline script in the root layout) – keeps in step with `apply` below. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

interface ThemeCtx {
  /** What the user chose */
  theme: Theme;
  /** What is actually shown */
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}
const Ctx = createContext<ThemeCtx>({ theme: "system", resolved: "light", setTheme: () => {} });

const listeners = new Set<() => void>();
const read = (): Theme => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
};
const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const apply = (t: Theme) => {
  const dark = t === "dark" || (t === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
  return dark;
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSys = () => cb();
  mq.addEventListener("change", onSys);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSys);
    window.removeEventListener("storage", cb);
  };
};

/** Light / dark / system theme. The choice is kept in localStorage; "system" follows the device. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const sysDark = useSyncExternalStore(subscribe, systemDark, () => false);
  const resolved: "light" | "dark" = theme === "dark" || (theme === "system" && sysDark) ? "dark" : "light";

  useEffect(() => {
    apply(theme);
  }, [theme, sysDark]);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* private mode: the choice just is not remembered */
    }
    apply(t);
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
