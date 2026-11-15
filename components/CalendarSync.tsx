"use client";
// Background calendar sync for the dashboard. While CampusFuel is open it re-reads the connected
// Google Calendar (on open, when you come back to the tab, and every 15 minutes). If your schedule
// changed, it updates it and asks the dashboard to rebuild the meal plan.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProviderMark } from "./CalendarConnect";
import { SYNC_EVERY_MS, hasChanges, syncCalendar, type Changes } from "@/lib/calendarSync";
import type { Profile } from "@/lib/types";

const ago = (iso?: string) => {
  if (!iso) return "not yet";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} hr ago` : new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
};

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, 2).join(", ")} and ${xs.length - 2} more`);

function describe(c: Changes) {
  return [
    c.added.length ? `added ${list(c.added)}` : "",
    c.moved.length ? `moved ${list(c.moved)}` : "",
    c.removed.length ? `removed ${list(c.removed)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export default function CalendarSync({ profile, onSynced }: { profile: Profile; onSynced: (p: Profile, changed: boolean) => void }) {
  const link = profile.calendar;
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [news, setNews] = useState("");
  const [, tick] = useState(0); // re-render so "x min ago" stays current

  // Latest values for timers and event listeners.
  const latest = useRef({ profile, onSynced });
  latest.current = { profile, onSynced };
  const running = useRef(false);

  const run = useCallback(async (force: boolean) => {
    const p = latest.current.profile;
    const last = p.calendar?.lastSyncedAt ? Date.parse(p.calendar.lastSyncedAt) : 0;
    if (!p.calendar?.icsUrl || running.current || (!force && Date.now() - last < SYNC_EVERY_MS - 30_000)) return;
    running.current = true;
    setSyncing(true);
    try {
      const r = await syncCalendar(p);
      if (!r) return;
      setError("");
      const changed = hasChanges(r.changes);
      if (changed) setNews(describe(r.changes));
      latest.current.onSynced(r.profile, changed);
    } catch (e) {
      // Keep the current schedule; try again next time.
      setError(e instanceof Error ? e.message : "Couldn't reach Google Calendar.");
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!link?.icsUrl) return;
    void run(false);
    const timer = setInterval(() => {
      tick((n) => n + 1);
      void run(false);
    }, 60_000);
    const onVisible = () => document.visibilityState === "visible" && void run(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [link?.icsUrl, run]);

  if (!link) return null;

  if (!link.icsUrl) {
    // Uploaded snapshot (or demo / sign-in): explain how to get automatic updates.
    return link.busy ? (
      <div className="sync-bar small">
        <ProviderMark provider="google" />
        <span>
          Using a calendar you uploaded {ago(link.connectedAt)}. It won&apos;t pick up changes.{" "}
          <Link href="/onboarding?step=4">Connect with your calendar&apos;s private link</Link> to stay in sync automatically.
        </span>
      </div>
    ) : null;
  }

  return (
    <>
      {news ? (
        <div className="notice sync-news small" role="status">
          <span>
            📅 <b>Your calendar changed:</b> {news}. Your meal plan has been updated to match.
          </span>
          <button type="button" className="btn ghost sm" onClick={() => setNews("")} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ) : null}
      <div className="sync-bar small">
        <ProviderMark provider="google" />
        <span className="muted">
          {syncing ? (
            <>
              <span className="spinner" /> Checking your Google Calendar…
            </>
          ) : error ? (
            <span style={{ color: "#c0392b" }}>{error} We&apos;ll keep trying.</span>
          ) : (
            <>Synced with Google Calendar · {ago(link.lastSyncedAt)}</>
          )}
        </span>
        <button type="button" className="btn ghost sm" onClick={() => void run(true)} disabled={syncing}>
          Sync now
        </button>
      </div>
    </>
  );
}
