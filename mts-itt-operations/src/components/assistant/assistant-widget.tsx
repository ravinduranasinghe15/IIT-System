"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { answerQuestion, SUGGESTIONS, type AssistantLink } from "@/lib/assistant";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  from: "user" | "bot";
  text: string;
  links?: AssistantLink[];
}

/** **bold** and line breaks only – the assistant's answers never contain anything else. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <Fragment key={j}>{part}</Fragment>))}
        </Fragment>
      ))}
    </>
  );
}

/** Floating assistant (bottom-right). Answers questions about operations from the live demo data. */
export function AssistantWidget({ liftForTabBar }: { liftForTabBar?: boolean }) {
  const { db } = useApp();
  const { user, role, driverId } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, thinking, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setMessages((m) => [...m, { id: idRef.current++, from: "user", text: q }]);
    setInput("");
    setThinking(true);
    timer.current = window.setTimeout(() => {
      let reply;
      try {
        reply = answerQuestion(db, q, { role, driverId, userName: user.name });
      } catch {
        reply = { text: "Sorry, something went wrong while looking that up. Please try rephrasing the question." };
      }
      setMessages((m) => [...m, { id: idRef.current++, from: "bot", text: reply.text, links: reply.links }]);
      setThinking(false);
    }, 550);
  };

  return (
    <div className={cn("no-print fixed right-4 z-50 flex flex-col items-end gap-3", liftForTabBar ? "bottom-20" : "bottom-4")}>
      {open && (
        <div role="dialog" aria-label="MTS assistant" className="flex h-[min(34rem,calc(100dvh-8rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <div className="flex items-center gap-2 bg-navy px-4 py-3 text-white">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/15">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-tight">MTS Assistant</div>
              <div className="text-[11px] text-white/70">Answers from the system&apos;s live data</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white">
              <X className="size-4" />
            </button>
          </div>

          <div className="scroll-thin flex-1 space-y-3 overflow-y-auto bg-muted/30 px-3 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-xl rounded-tl-sm bg-card px-3 py-2 text-sm text-ink shadow-sm ring-1 ring-border">
                  <Rich text={`Hi ${user.name.split(" ")[0]}! I can answer questions about trips, chits, driver logs, the roster, fleet costs and more. Pick a question or type your own.`} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border bg-card px-3 py-1 text-left text-xs font-medium text-brand hover:border-brand/50 hover:bg-brand/5">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.from === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[88%] rounded-xl px-3 py-2 text-sm shadow-sm", m.from === "user" ? "rounded-tr-sm bg-navy text-white" : "rounded-tl-sm bg-card text-ink ring-1 ring-border")}>
                  <Rich text={m.text} />
                  {m.links && m.links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.links.map((l) => (
                        <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md bg-brand/10 px-2 py-1 text-xs font-medium text-brand hover:bg-brand/20">
                          {l.label} →
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-xl rounded-tl-sm bg-card px-3 py-3 shadow-sm ring-1 ring-border" aria-label="Assistant is typing">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-bounce rounded-full bg-slate/60" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length > 0 && (
            <div className="scroll-thin flex gap-1.5 overflow-x-auto border-t bg-card px-3 py-2">
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium text-slate hover:border-brand/50 hover:text-brand">
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t bg-card p-2.5"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about trips, chits, roster, fuel…"
              aria-label="Ask the assistant"
              className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <button type="submit" disabled={!input.trim() || thinking} aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy text-white transition hover:bg-navy/90 disabled:opacity-40">
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open MTS assistant"}
        aria-expanded={open}
        className="group relative flex size-14 items-center justify-center rounded-full bg-navy text-white shadow-lg ring-4 ring-white/70 transition hover:scale-105 hover:bg-navy/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {open ? <X className="size-6" /> : <Bot className="size-7" />}
        {!open && <Sparkles className="absolute -right-0.5 -top-0.5 size-4 rounded-full bg-amber-400 p-0.5 text-navy" />}
      </button>
    </div>
  );
}
