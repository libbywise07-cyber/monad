"use client";
// Calendar connection.
// Google is real when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set (see README): read-only import via lib/googleCalendar.
// Outlook, and Google without a client ID, run the demo flow with sample events.
import { useEffect, useState } from "react";
import { fmt12 } from "@/lib/planner";
import {
  fetchGoogleSchedule,
  getGoogleToken,
  googleConfigured,
  importFromFiles,
  importFromIcs,
  preloadGoogle,
  type ImportedEvent,
} from "@/lib/googleCalendar";
import { blockFromEvent, mergeCalendar } from "@/lib/calendarSync";
import {
  CALENDAR_NAMES,
  DAYS,
  type CalendarLink,
  type CalendarProvider,
  type DayIndex,
  type ScheduleBlock,
} from "@/lib/types";

type Found = ImportedEvent;

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

type Step = "idle" | "paste" | "consent" | "syncing" | "review";

export function ProviderMark({ provider }: { provider: CalendarProvider | "file" }) {
  return <span className={`cal-mark ${provider}`} aria-hidden>{provider === "google" ? "G" : provider === "outlook" ? "O" : "C"}</span>;
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
  const [error, setError] = useState("");
  const [events, setEvents] = useState<Found[]>(SAMPLE);
  const [account, setAccount] = useState(DEMO_ACCOUNT);
  const [live, setLive] = useState(false);
  const [pasted, setPasted] = useState("");
  const [feedUrl, setFeedUrl] = useState<string | undefined>(undefined);
  const [fileBusy, setFileBusy] = useState<[number, number][] | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(preloadGoogle, []);

  const already = (f: Found) => schedule.some((b) => b.label === f.label && b.start === f.start && b.days.join() === f.days.join());
  const found = events.filter((f) => !already(f));

  const connectGoogle = async () => {
    try {
      const token = await getGoogleToken(); // Google's own consent popup
      setStep("syncing");
      const r = await fetchGoogleSchedule(token);
      setEvents(r.events);
      setAccount(r.account);
      setLive(true);
      setFeedUrl(undefined);
      setFileBusy(undefined);
      setPicked(Object.fromEntries(r.events.map((f) => [f.key, f.defaultOn])));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect to Google Calendar.");
      setStep("idle");
    }
  };

  // No-setup path: read the calendar's private iCal link.
  const connectIcs = async (url: string) => {
    setError("");
    setStep("syncing");
    try {
      const r = await importFromIcs(url);
      setEvents(r.events);
      setAccount(r.account);
      setLive(true);
      setFeedUrl(url.trim());
      setFileBusy(undefined);
      setPicked(Object.fromEntries(r.events.map((f) => [f.key, f.defaultOn])));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that calendar.");
      setStep("paste");
    }
  };

  // Always works, even when the private link is turned off: read Google's export on this device.
  const connectFiles = async (files: File[]) => {
    if (!files.length) return;
    setError("");
    setStep("syncing");
    try {
      const r = await importFromFiles(files);
      setEvents(r.events);
      setAccount(r.account);
      setLive(true);
      setFeedUrl(undefined);
      setFileBusy(r.busy);
      setPicked(Object.fromEntries(r.events.map((f) => [f.key, f.defaultOn])));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
      setShowUpload(true);
      setStep("paste");
    }
  };

  const start = (p: CalendarProvider) => {
    setProvider(p);
    setMsg("");
    setError("");
    if (p === "google" && googleConfigured()) void connectGoogle();
    else if (p === "google" && link?.icsUrl) void connectIcs(link.icsUrl);
    else if (p === "google") setStep("paste");
    else setStep("consent");
  };

  const allow = () => {
    setStep("syncing");
    setTimeout(() => {
      setEvents(SAMPLE);
      setAccount(DEMO_ACCOUNT);
      setLive(false);
      setFeedUrl(undefined);
      setFileBusy(undefined);
      setPicked(Object.fromEntries(SAMPLE.map((f) => [f.key, f.defaultOn])));
      setStep("review");
    }, 1400);
  };

  const importPicked = () => {
    // Remember what was unchecked so automatic syncing doesn't add it back.
    const ignored = new Set(link?.provider === provider ? (link.ignored ?? []) : []);
    for (const f of found) {
      if (picked[f.key]) ignored.delete(f.key);
      else if (f.defaultOn) ignored.add(f.key);
    }
    const add = found.filter((f) => picked[f.key]).map((f) => blockFromEvent(f, provider));
    // With real calendar data, also drop imported events that are no longer on the calendar.
    const next = live ? mergeCalendar([...schedule, ...add], events, ignored, provider).schedule : [...schedule, ...add];
    const now = new Date().toISOString();
    onChange(
      {
        provider,
        account,
        connectedAt: now,
        lastSyncedAt: now,
        addMealsToCalendar: link?.addMealsToCalendar ?? true,
        icsUrl: feedUrl,
        busy: fileBusy,
        ignored: [...ignored],
      },
      next,
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
                  {link.account} ·{" "}
                  {link.icsUrl
                    ? "stays in sync automatically"
                    : link.busy
                      ? `uploaded ${new Date(link.connectedAt).toLocaleDateString([], { month: "short", day: "numeric" })} (doesn't update itself)`
                      : `synced ${new Date(link.lastSyncedAt ?? link.connectedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
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
      {error ? (
        <p className="small" role="alert" style={{ margin: 0, color: "#c0392b" }}>
          {error}
        </p>
      ) : null}

      {step === "paste" && (
        <Modal title="Connect Google Calendar" onClose={() => setStep("idle")}>
          <div className="row" style={{ gap: 10 }}>
            <ProviderMark provider="google" />
            <h2 style={{ margin: 0 }}>Connect Google Calendar</h2>
          </div>
          <p className="muted small">Copy your calendar&apos;s private link from Google once, and CampusFuel reads your classes and events from it.</p>
          <ol className="paste-steps small">
            <li>
              Open{" "}
              <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer">
                Google Calendar settings ↗
              </a>{" "}
              on a computer.
            </li>
            <li>
              On the left, under <b>Settings for my calendars</b>, click your calendar (usually your name).
            </li>
            <li>
              Scroll to <b>Integrate calendar</b> and copy <b>Secret address in iCal format</b>.
            </li>
            <li>Paste it here:</li>
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pasted.trim()) void connectIcs(pasted);
            }}
          >
            <input
              type="url"
              id="ics-url"
              aria-label="Secret address in iCal format"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              autoFocus
              autoComplete="off"
            />
            {error ? (
              <p className="small" role="alert" style={{ color: "#c0392b", margin: "6px 0 0" }}>
                {error}
              </p>
            ) : null}
            <p className="muted small">
              🔒 Your calendar stays private. This link is secret, read-only, and stays in this browser. Treat it like a password: anyone with it can
              see your calendar. You can reset it in the same Google settings anytime.
            </p>
            <div className="upload-alt">
              <button type="button" className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => setShowUpload(!showUpload)} aria-expanded={showUpload}>
                {showUpload ? "▾" : "▸"} Don&apos;t see a secret address? (common with school accounts)
              </button>
              {showUpload ? (
                <div className="small">
                  <p style={{ margin: "4px 0 6px" }}>Upload your calendar instead. The file is read on this device and never uploaded anywhere.</p>
                  <ol className="paste-steps">
                    <li>
                      Open{" "}
                      <a href="https://calendar.google.com/calendar/r/settings/export" target="_blank" rel="noreferrer">
                        Google Calendar → Import &amp; export ↗
                      </a>
                    </li>
                    <li>
                      Under <b>Export</b>, click <b>Export</b>. A .zip file downloads.
                    </li>
                    <li>Choose that file here:</li>
                  </ol>
                  <input
                    type="file"
                    id="ics-file"
                    aria-label="Calendar export file"
                    accept=".zip,.ics,text/calendar,application/zip"
                    multiple
                    onChange={(e) => void connectFiles([...(e.target.files ?? [])])}
                  />
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    An upload is a snapshot. When your schedule changes, export and upload again.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="row between">
              <button type="button" className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => (setError(""), setStep("consent"))}>
                Try a demo with sample events
              </button>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn" onClick={() => setStep("idle")}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={!pasted.trim()}>
                  Connect
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

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
            <span className="spinner" /> Reading the next two weeks from {CALENDAR_NAMES[provider]}…
          </div>
        </Modal>
      )}

      {step === "review" && (
        <Modal title="Review imported events" onClose={() => setStep("idle")}>
          {live ? null : <div className="demo-flag">Demo preview with sample data.</div>}
          <h2 style={{ marginTop: live ? 0 : 14 }}>
            We found {found.length} {found.length === 1 ? "event" : "events"}
          </h2>
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
