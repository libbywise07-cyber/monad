"use client";
// Calendar connection MOCKUP.
// Real Google / Microsoft sign-in needs OAuth app credentials (see README). Until those exist,
// this runs the full flow with sample events so the experience can be demoed and reviewed.
import { useEffect, useState } from "react";
import { fmt12 } from "@/lib/planner";
import {
  CALENDAR_NAMES,
  DAYS,
  type CalendarLink,
  type CalendarProvider,
  type DayIndex,
  type ScheduleBlock,
} from "@/lib/types";

type Found = Omit<ScheduleBlock, "id"> & {
  key: string;
  note?: string;
  defaultOn: boolean;
};

// What a typical student calendar returns for one week.
const SAMPLE: Found[] = [
  { key: "bio", label: "BIO 210 Lecture", kind: "class", days: [0, 2, 4], start: "09:00", end: "09:50", defaultOn: true },
  { key: "wr", label: "WR 121 Writing", kind: "class", days: [1, 3], start: "10:00", end: "11:20", defaultOn: true },
  { key: "chem", label: "CHEM 113 Lab", kind: "class", days: [1], start: "13:00", end: "15:50", defaultOn: true },
  { key: "vb", label: "Club volleyball practice", kind: "practice", days: [0, 2], start: "19:00", end: "20:30", defaultOn: true },
  { key: "job", label: "Shift: campus bookstore", kind: "work", days: [3, 4], start: "16:00", end: "20:00", defaultOn: true },
  { key: "study", label: "Study group, library", kind: "study", days: [6], start: "14:00", end: "16:00", defaultOn: true },
  {
    key: "lunch",
    label: "Lunch with Sam",
    kind: "other",
    days: [4],
    start: "12:00",
    end: "13:00",
    defaultOn: false,
    note: "Looks like a meal, so we'll plan lunch here instead of blocking it.",
  },
  {
    key: "dentist",
    label: "Dentist appointment",
    kind: "other",
    days: [2],
    start: "15:00",
    end: "16:00",
    defaultOn: false,
    note: "One-time event. Only recurring events repeat each week.",
  },
];

const DEMO_ACCOUNT = "student@example.edu";

type Step = "idle" | "consent" | "syncing" | "review";

export function ProviderMark({ provider }: { provider: CalendarProvider }) {
  return <span className={`cal-mark ${provider}`} aria-hidden>{provider === "google" ? "G" : "O"}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

interface Props {
  link?: CalendarLink;
  schedule: ScheduleBlock[];
  onChange: (link: CalendarLink | undefined, schedule: ScheduleBlock[]) => void;
}

export default function CalendarConnect({ link, schedule, onChange }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [provider, setProvider] = useState<CalendarProvider>("google");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");

  const already = (f: Found) => schedule.some((b) => b.label === f.label && b.start === f.start);
  const found = SAMPLE.filter((f) => !already(f));

  const start = (p: CalendarProvider) => {
    setProvider(p);
    setMsg("");
    setStep("consent");
  };

  const allow = () => {
    setStep("syncing");
    setTimeout(() => {
      setPicked(Object.fromEntries(SAMPLE.map((f) => [f.key, f.defaultOn])));
      setStep("review");
    }, 1400);
  };

  const importPicked = () => {
    const add: ScheduleBlock[] = found
      .filter((f) => picked[f.key])
      .map(({ key, note, defaultOn, ...b }) => {
        void note;
        void defaultOn;
        return { ...b, id: `cal-${provider}-${key}`, source: provider };
      });
    onChange(
      { provider, account: DEMO_ACCOUNT, connectedAt: new Date().toISOString(), addMealsToCalendar: link?.addMealsToCalendar ?? true },
      [...schedule, ...add],
    );
    setMsg(add.length ? `Added ${add.length} event${add.length > 1 ? "s" : ""} from ${CALENDAR_NAMES[provider]}.` : "Your schedule is already up to date.");
    setStep("idle");
  };

  const disconnect = () => {
    const kept = schedule.filter((b) => !b.source);
    const removed = schedule.length - kept.length;
    onChange(undefined, kept);
    setMsg(`Disconnected. Removed ${removed} imported event${removed === 1 ? "" : "s"}; events you added yourself stay.`);
  };

  const count = found.filter((f) => picked[f.key]).length;

  return (
    <div className="card cal-card stack">
      {link ? (
        <>
          <div className="row between">
            <div className="row" style={{ gap: 10 }}>
              <ProviderMark provider={link.provider} />
              <div>
                <b>Connected to {CALENDAR_NAMES[link.provider]}</b>
                <div className="muted small">
                  {link.account} · synced {new Date(link.connectedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm" onClick={() => start(link.provider)}>
                Sync again
              </button>
              <button type="button" className="btn sm ghost" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          </div>
          <label className="row" style={{ fontWeight: 500, gap: 8, flexWrap: "nowrap" }}>
            <input
              type="checkbox"
              id="meals-to-calendar"
              style={{ width: "auto" }}
              checked={link.addMealsToCalendar}
              onChange={(e) => onChange({ ...link, addMealsToCalendar: e.target.checked }, schedule)}
            />
            Add my planned meals to a &quot;CampusFuel Meals&quot; calendar so they show up next to my classes
          </label>
        </>
      ) : (
        <>
          <div>
            <h3 style={{ margin: 0 }}>Import from your calendar</h3>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Skip the typing. We read your classes, shifts and practices, and your plan updates when they change.
            </p>
          </div>
          <div className="row">
            <button type="button" className="btn cal-btn" onClick={() => start("google")}>
              <ProviderMark provider="google" /> Connect Google Calendar
            </button>
            <button type="button" className="btn cal-btn" onClick={() => start("outlook")}>
              <ProviderMark provider="outlook" /> Connect Outlook
            </button>
          </div>
        </>
      )}
      {msg ? <p className="small" style={{ margin: 0 }}>✓ {msg}</p> : null}

      {step === "consent" && (
        <Modal title={`Connect ${CALENDAR_NAMES[provider]}`} onClose={() => setStep("idle")}>
          <div className="demo-flag">Demo preview with sample data. No real account is connected.</div>
          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <ProviderMark provider={provider} />
            <div>
              <div className="muted small">Sign in with {provider === "google" ? "Google" : "Microsoft"}</div>
              <b>{DEMO_ACCOUNT}</b>
            </div>
          </div>
          <h2 style={{ marginTop: 16 }}>CampusFuel wants to:</h2>
          <ul className="perm-list">
            <li>
              <b>See your calendar events</b>
              <span className="muted small">Read-only. Used to find when you&apos;re busy.</span>
            </li>
            <li>
              <b>Add events to a new &quot;CampusFuel Meals&quot; calendar</b>
              <span className="muted small">Optional. Never edits or deletes your other events.</span>
            </li>
          </ul>
          <p className="muted small">You can disconnect anytime from your profile.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setStep("idle")}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={allow}>
              Allow
            </button>
          </div>
        </Modal>
      )}

      {step === "syncing" && (
        <Modal title="Syncing" onClose={() => setStep("idle")}>
          <div className="row" style={{ justifyContent: "center", padding: "28px 0" }}>
            <span className="spinner" /> Reading this week from {CALENDAR_NAMES[provider]}…
          </div>
        </Modal>
      )}

      {step === "review" && (
        <Modal title="Review imported events" onClose={() => setStep("idle")}>
          <div className="demo-flag">Demo preview with sample data.</div>
          <h2 style={{ marginTop: 14 }}>We found {found.length} events</h2>
          <p className="muted small">Checked events become busy time, so no meals are planned during them.</p>
          {found.length ? (
            <ul className="found-list">
              {found.map((f) => (
                <li key={f.key}>
                  <label className="row" style={{ gap: 10, flexWrap: "nowrap", alignItems: "flex-start", fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      id={`cal-${f.key}`}
                      style={{ width: "auto", marginTop: 3 }}
                      checked={!!picked[f.key]}
                      onChange={(e) => setPicked({ ...picked, [f.key]: e.target.checked })}
                    />
                    <span style={{ minWidth: 0 }}>
                      <b>{f.label}</b> <span className="tag busy">{f.kind}</span>
                      <span className="muted small" style={{ display: "block" }}>
                        {f.days.map((d) => DAYS[d as DayIndex]).join(", ")} · {fmt12(f.start)}–{fmt12(f.end)}
                      </span>
                      {f.note ? <span className="small note">{f.note}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p>Everything on your calendar is already in your schedule.</p>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setStep("idle")}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={importPicked}>
              {count ? `Add ${count} event${count > 1 ? "s" : ""} to my schedule` : "Done"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
