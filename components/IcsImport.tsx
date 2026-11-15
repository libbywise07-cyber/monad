"use client";
import { useRef, useState } from "react";
import { Modal } from "./CalendarConnect";
import { parseIcs, type IcsEvent } from "@/lib/ics";
import { fmt12 } from "@/lib/planner";
import { DAYS, type ScheduleBlock } from "@/lib/types";

/** Import real classes from an exported calendar file. No sign-in, nothing leaves the browser. */
export default function IcsImport({ schedule, onChange }: { schedule: ScheduleBlock[]; onChange: (s: ScheduleBlock[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [events, setEvents] = useState<IcsEvent[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [help, setHelp] = useState(false);

  const read = async (file?: File) => {
    if (!file) return;
    setMsg("");
    try {
      const text = await file.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not ics");
      const found = parseIcs(text).filter((e) => !schedule.some((b) => b.label === e.label && b.start === e.start));
      if (!found.length) {
        setMsg("No repeating events found for this week. Check that you exported the calendar with your classes in it.");
        return;
      }
      setEvents(found);
      setPicked(Object.fromEntries(found.map((e) => [e.key, e.recurring && e.kind !== "other"])));
    } catch {
      setMsg("That file isn't a calendar file. Export an .ics file from your calendar app and try again.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const add = () => {
    const chosen = (events ?? []).filter((e) => picked[e.key]);
    onChange([
      ...schedule,
      ...chosen.map((e) => ({ id: `ics-${Math.random().toString(36).slice(2)}`, label: e.label, kind: e.kind, days: e.days, start: e.start, end: e.end, source: "file" as const })),
    ]);
    setMsg(`Added ${chosen.length} event${chosen.length === 1 ? "" : "s"} from your calendar file.`);
    setEvents(null);
  };

  const count = Object.values(picked).filter(Boolean).length;

  return (
    <div className="card stack" style={{ background: "var(--bg)" }}>
      <div>
        <h3 style={{ margin: 0 }}>Import a calendar file (.ics)</h3>
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          Works with Google Calendar, Outlook, Apple Calendar and Canvas. Your real classes come in without signing in, and the file never leaves your device.
        </p>
      </div>
      <div className="row">
        <button type="button" className="btn sm primary" onClick={() => fileRef.current?.click()}>
          Choose .ics file
        </button>
        <button type="button" className="btn sm ghost" onClick={() => setHelp(!help)} aria-expanded={help}>
          {help ? "Hide" : "How do I get this file?"}
        </button>
        <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => read(e.target.files?.[0])} />
      </div>
      {help ? (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Google Calendar</b> (on a computer): Settings → Import &amp; export → <b>Export</b>. Unzip the download and pick your calendar&apos;s .ics file.
          </li>
          <li>
            <b>Outlook</b>: Calendar → Share → <b>Publish calendar</b> (or File → Save Calendar on desktop) → download the ICS link.
          </li>
          <li>
            <b>Canvas</b>: Calendar → <b>Calendar Feed</b> → open the link to download the .ics file.
          </li>
          <li>
            <b>Apple Calendar</b> (Mac): File → Export → <b>Export…</b>
          </li>
        </ul>
      ) : null}
      {msg ? <p className="small" style={{ margin: 0 }}>✓ {msg}</p> : null}

      {events ? (
        <Modal title="Events in your calendar file" onClose={() => setEvents(null)}>
          <h2 style={{ marginTop: 0 }}>We found {events.length} events</h2>
          <p className="muted small">Checked events become busy time. Repeating classes, shifts and practices are checked for you.</p>
          <ul className="found-list">
            {events.map((e) => (
              <li key={e.key}>
                <label className="row" style={{ gap: 10, flexWrap: "nowrap", alignItems: "flex-start", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    id={`ics-${e.key}`}
                    style={{ width: "auto", marginTop: 3 }}
                    checked={!!picked[e.key]}
                    onChange={(ev) => setPicked({ ...picked, [e.key]: ev.target.checked })}
                  />
                  <span style={{ minWidth: 0 }}>
                    <b>{e.label}</b> <span className="tag busy">{e.kind}</span>
                    <span className="muted small" style={{ display: "block" }}>
                      {e.days.map((d) => DAYS[d]).join(", ")} · {fmt12(e.start)}–{fmt12(e.end)}
                      {e.recurring ? " · every week" : ""}
                    </span>
                    {e.note ? <span className="small note">{e.note}</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setEvents(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={add} disabled={!count}>
              Add {count} event{count === 1 ? "" : "s"} to my schedule
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
