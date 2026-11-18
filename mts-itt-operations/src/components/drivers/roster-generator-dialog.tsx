"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { useDriverActions } from "@/hooks/use-drivers";
import { addDays, formatDay, realToday } from "@/lib/date-utils";
import { generateRoster, nextMonday, planDates, plannedFor, zeroCounts, type RosterPlan, type ShiftCounts } from "@/lib/roster-generator";
import { SHIFT_HOURS, WORK_SHIFTS, type WorkShift } from "@/lib/roster-rules";
import { cn } from "@/lib/utils";

const TEMPLATE_KEY = "mts-itt-roster-templates-v1";
interface Template {
  name: string;
  mode: RosterPlan["mode"];
  perShift: ShiftCounts;
  /** counts by day offset from the period start, so a template can be applied to any week */
  dailyByOffset: ShiftCounts[];
  excludedTrucks: string[];
}

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    return raw ? (JSON.parse(raw) as Template[]) : [];
  } catch {
    return [];
  }
}
function saveTemplates(t: Template[]) {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable: templates simply are not kept */
  }
}

const clampCount = (v: string, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

/**
 * Manager: generate the roster for a week (or any 7–14 days). Either one number of trucks per shift for the whole
 * period, or a number per shift for every date. The preview updates as the numbers change.
 */
export function RosterGeneratorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { db } = useApp();
  const actions = useDriverActions();
  const activeTrucks = useMemo(() => db.primeMovers.filter((p) => p.status === "Active"), [db.primeMovers]);
  const maxTrucks = activeTrucks.length;

  const [start, setStart] = useState(nextMonday());
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<RosterPlan["mode"]>("week");
  const [perShift, setPerShift] = useState<ShiftCounts>({ Morning: Math.min(6, maxTrucks), Night: Math.min(4, maxTrucks) });
  const [daily, setDaily] = useState<Record<string, ShiftCounts>>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [apply, setApply] = useState<RosterPlan["apply"]>("replace");
  const [showTrucks, setShowTrucks] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplName, setTplName] = useState("");
  const [tplPick, setTplPick] = useState("");

  useEffect(() => {
    if (!open) return;
    // reset the form each time the dialog opens
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStart(nextMonday());
    setDays(7);
    setMode("week");
    setDaily({});
    setExcluded([]);
    setApply("replace");
    setShowTrucks(false);
    setTemplates(loadTemplates());
    setTplName("");
    setTplPick("");
  }, [open]);

  const dates = useMemo(() => planDates({ start, days }), [start, days]);
  const plan: RosterPlan = useMemo(() => ({ start, days, mode, perShift, daily, excludedTrucks: excluded, apply }), [start, days, mode, perShift, daily, excluded, apply]);
  const result = useMemo(() => (open ? generateRoster(db, plan) : null), [open, db, plan]);

  const switchMode = (m: RosterPlan["mode"]) => {
    if (m === "daily" && Object.keys(daily).length === 0) {
      // start the date-wise grid from the whole-week numbers
      setDaily(Object.fromEntries(dates.map((d) => [d, { ...perShift }])));
    }
    setMode(m);
  };
  const setCell = (date: string, shift: WorkShift, v: string) =>
    setDaily((p) => ({ ...p, [date]: { ...zeroCounts(), ...(p[date] ?? plannedFor(plan, date)), [shift]: clampCount(v, maxTrucks) } }));
  const fillAll = () => setDaily(Object.fromEntries(dates.map((d) => [d, { ...perShift }])));
  const clearAll = () => setDaily(Object.fromEntries(dates.map((d) => [d, zeroCounts()])));
  const copyLastWeek = () => {
    const next: Record<string, ShiftCounts> = {};
    for (const d of dates) {
      const src = addDays(d, -7);
      const c = zeroCounts();
      for (const r of db.roster) if (r.date === src && (r.shift === "Morning" || r.shift === "Night") && r.attendance !== "Absent") c[r.shift] += 1;
      next[d] = c;
    }
    setDaily(next);
    setMode("daily");
  };
  const changeStart = (v: string) => {
    if (!v) return;
    setStart(v);
    setDaily({});
  };
  const changeDays = (n: number) => {
    setDays(n);
    setDaily({});
    if (mode === "daily") setMode("week");
  };
  const toggleTruck = (id: string) => setExcluded((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const saveTemplate = () => {
    const name = tplName.trim();
    if (!name) return;
    const t: Template = { name, mode, perShift, dailyByOffset: dates.map((d) => plannedFor(plan, d)), excludedTrucks: excluded };
    const all = [...templates.filter((x) => x.name !== name), t];
    setTemplates(all);
    saveTemplates(all);
    setTplName("");
    setTplPick(name);
  };
  const applyTemplate = (name: string) => {
    setTplPick(name);
    const t = templates.find((x) => x.name === name);
    if (!t) return;
    setPerShift({ ...t.perShift });
    setExcluded(t.excludedTrucks.filter((id) => activeTrucks.some((p) => p.id === id)));
    setDaily(Object.fromEntries(dates.map((d, i) => [d, { ...(t.dailyByOffset[i] ?? t.perShift) }])));
    setMode(t.mode);
  };
  const deleteTemplate = () => {
    const all = templates.filter((x) => x.name !== tplPick);
    setTemplates(all);
    saveTemplates(all);
    setTplPick("");
  };

  const today = realToday();
  const publish = () => {
    if (actions.publishRoster(plan)) onOpenChange(false);
  };
  const short = result ? result.totalCovered < result.totalPlanned : false;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Generate roster"
      description="Decide how many trucks run on each shift. The system picks the trucks and drivers using the roster rules (12-hour shifts, rest, weekly day off, one driver per truck per shift)."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={publish} disabled={!result || result.totalPlanned === 0}>
            <CalendarPlus /> Publish roster
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Start date">
            <Input type="date" value={start} min={today} onChange={(e) => changeStart(e.target.value)} className="h-8" />
          </Field>
          <Field label="Period">
            <div className="flex overflow-hidden rounded-lg border text-sm">
              {[7, 14].map((n) => (
                <button key={n} type="button" aria-pressed={days === n} onClick={() => changeDays(n)} className={cn("flex-1 px-3 py-1.5 font-medium", days === n ? "bg-navy text-white" : "bg-card text-slate hover:bg-muted")}>
                  {n === 7 ? "1 week" : "2 weeks"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Saved templates">
            <div className="flex gap-1">
              <NativeSelect value={tplPick} onValueChange={applyTemplate} placeholder={templates.length ? "Load a template" : "None saved yet"} options={templates.map((t) => t.name)} className="min-w-0 flex-1" />
              {tplPick && (
                <Button variant="outline" size="icon-sm" aria-label="Delete template" onClick={deleteTemplate}>
                  <Trash2 />
                </Button>
              )}
            </div>
          </Field>
        </div>
        <div className="-mt-2 text-xs text-slate">{formatDay(dates[0], "EEE dd MMM")} – {formatDay(dates[dates.length - 1], "EEE dd MMM yyyy")}</div>

        <div>
          <div className="mb-2 flex w-fit overflow-hidden rounded-lg border text-sm">
            {([["week", "Whole week"], ["daily", "Date-wise"]] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => switchMode(k)} className={cn("px-4 py-1.5 font-medium", mode === k ? "bg-navy text-white" : "bg-card text-slate hover:bg-muted")}>
                {label}
              </button>
            ))}
          </div>

          {mode === "week" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {WORK_SHIFTS.map((s) => (
                <Field key={s} label={`${s} shift · trucks per day (${SHIFT_HOURS[s].range})`} hint={`Applies to every day of the period. Up to ${maxTrucks} active trucks.`}>
                  <Input type="number" min={0} max={maxTrucks} value={perShift[s]} onChange={(e) => setPerShift((p) => ({ ...p, [s]: clampCount(e.target.value, maxTrucks) }))} className="h-8" aria-label={`${s} trucks`} />
                </Field>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="xs" onClick={fillAll}>Fill all days with the whole-week numbers</Button>
                <Button variant="outline" size="xs" onClick={copyLastWeek}>Copy from last week</Button>
                <Button variant="outline" size="xs" onClick={clearAll}>Clear all (0)</Button>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-slate">
                      <th className="px-3 py-2 text-left font-medium">Trucks</th>
                      {dates.map((d) => (
                        <th key={d} className="px-2 py-2 text-center font-medium">
                          <div>{formatDay(d, "EEE")}</div>
                          <div className="font-normal normal-case">{formatDay(d, "dd MMM")}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {WORK_SHIFTS.map((s) => (
                      <tr key={s} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5 text-xs font-medium text-ink">{s}</td>
                        {dates.map((d) => (
                          <td key={d} className="px-1 py-1 text-center">
                            <Input type="number" min={0} max={maxTrucks} value={plannedFor(plan, d)[s]} onChange={(e) => setCell(d, s, e.target.value)} className="mx-auto h-8 w-14 px-1 text-center" aria-label={`${s} trucks on ${d}`} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate">Set a day to 0 for a holiday or a day with no trucks.</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border">
          <button type="button" onClick={() => setShowTrucks((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-ink">
            <span>Trucks available ({maxTrucks - excluded.length} of {maxTrucks} included)</span>
            <span className="text-xs text-brand">{showTrucks ? "Hide" : "Choose trucks"}</span>
          </button>
          {showTrucks && (
            <div className="grid grid-cols-2 gap-1 border-t px-3 py-2 sm:grid-cols-4">
              {activeTrucks.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={!excluded.includes(p.id)} onChange={() => toggleTruck(p.id)} />
                  <span className="font-medium text-ink">{p.id}</span>
                  <span className="text-slate">{p.regNo}</span>
                </label>
              ))}
              {db.primeMovers.length > activeTrucks.length && <div className="col-span-full text-[11px] text-slate">Trucks that are in maintenance or inactive are never used.</div>}
            </div>
          )}
        </div>

        <Field label="Existing roster entries in this period">
          <NativeSelect
            value={apply}
            onValueChange={(v) => setApply(v as RosterPlan["apply"])}
            options={[
              { value: "replace", label: "Replace the future days (keeps leave, absences and recorded attendance)" },
              { value: "fill", label: "Fill gaps only (keep everything already rostered)" },
            ]}
          />
        </Field>

        {result && (
          <div className="rounded-lg border">
            <div className={cn("flex items-center gap-2 border-b px-3 py-2 text-sm font-medium", short ? "text-warning" : "text-success")}>
              {short ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
              Preview: {result.totalCovered} of {result.totalPlanned} truck-shifts covered
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-slate">
                    <th className="px-3 py-1.5 text-left font-medium">Covered / planned</th>
                    {result.coverage.map((c) => (
                      <th key={c.date} className="px-2 py-1.5 text-center font-medium">{formatDay(c.date, "EEE dd")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WORK_SHIFTS.map((s) => (
                    <tr key={s} className="border-b last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">{s}</td>
                      {result.coverage.map((c) => (
                        <td key={c.date} className={cn("px-2 py-1.5 text-center tabular-nums", c.covered[s] < c.planned[s] ? "font-semibold text-danger" : "text-ink")}>
                          {c.covered[s]}/{c.planned[s]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.warnings.length > 0 && (
              <ul className="space-y-0.5 border-t px-3 py-2 text-xs text-warning">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <p className="border-t px-3 py-2 text-[11px] text-slate">After publishing, change any single shift by clicking its cell in the roster.</p>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Field label="Save these numbers as a template" className="min-w-0 flex-1">
            <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Normal week, Peak week" className="h-8" />
          </Field>
          <Button variant="outline" size="sm" onClick={saveTemplate} disabled={!tplName.trim()}>
            <Save /> Save template
          </Button>
        </div>
      </div>
    </FormDialog>
  );
}
