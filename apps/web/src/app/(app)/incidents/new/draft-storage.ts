"use client";

/**
 * Client-side-only incident wizard draft persistence — deliberately never touches the server (see
 * chat: cross-device/server-resumable drafts are a separate future feature, and no incomplete row
 * is ever written to Incidents just to support a draft). Uses sessionStorage rather than
 * localStorage so a draft is already gone the moment the browser tab/window closes, plus an
 * explicit timestamp-based expiry so a draft doesn't linger indefinitely in a tab left open. Never
 * store clinical/medical notes here — the wizard doesn't collect them at all (Step 4's brief:
 * "keep clinical notes in the restricted Medical tab after incident creation").
 */

const STORAGE_KEY = "safeguard.incident-draft.v1";
const EXPIRY_MS = 24 * 60 * 60 * 1000;

interface DraftEnvelope<T> {
  savedAt: number;
  data: T;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function saveIncidentDraft<T>(data: T): void {
  if (!isBrowser()) return;
  const envelope: DraftEnvelope<T> = { savedAt: Date.now(), data };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage unavailable (private browsing, quota) — draft persistence is a convenience, not a
    // requirement, so fail silently rather than block the wizard.
  }
}

export function loadIncidentDraft<T>(): T | null {
  if (!isBrowser()) return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as DraftEnvelope<T>;
    if (Date.now() - envelope.savedAt > EXPIRY_MS) {
      clearIncidentDraft();
      return null;
    }
    return envelope.data;
  } catch {
    clearIncidentDraft();
    return null;
  }
}

export function clearIncidentDraft(): void {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
