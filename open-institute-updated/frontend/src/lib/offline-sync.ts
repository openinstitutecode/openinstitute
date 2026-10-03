// LMS024 — offline content: caches a course's offline-marked lessons (text
// + resolved media URLs, from GET /content/offline-bundle/:courseId) into
// IndexedDB so they're readable with no connection. LMS027 — progress
// synchronization: completions/incompletions toggled while offline are
// queued here and replayed in one batch (POST /content/progress/sync) the
// next time the app is online, instead of being silently lost.
import { apiFetch } from "./api";

const DB_NAME = "kvbdtc-offline";
const DB_VERSION = 1;
const LESSONS_STORE = "offline-lessons";
const QUEUE_STORE = "progress-queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LESSONS_STORE)) db.createObjectStore(LESSONS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "queuedAt" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type OfflineLesson = {
  id: string;
  title: string;
  moduleTitle: string;
  contentType: string;
  contentBody: string | null;
  media: unknown;
};

/** Downloads a course's offline-marked lessons from the server and caches them locally. */
export async function downloadCourseForOffline(courseId: string): Promise<number> {
  const lessons = await apiFetch<OfflineLesson[]>(`/content/offline-bundle/${courseId}`);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LESSONS_STORE, "readwrite");
    for (const lesson of lessons) tx.objectStore(LESSONS_STORE).put(lesson);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return lessons.length;
}

export async function getOfflineLesson(lessonId: string): Promise<OfflineLesson | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(LESSONS_STORE, "readonly").objectStore(LESSONS_STORE).get(lessonId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listOfflineLessons(): Promise<OfflineLesson[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(LESSONS_STORE, "readonly").objectStore(LESSONS_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

type QueuedAction = { queuedAt: number; lessonId: string; action: "complete" | "incomplete" };

/** Call when a completion toggle fails because the device is offline. */
export async function queueProgressAction(lessonId: string, action: "complete" | "incomplete"): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put({ queuedAt: Date.now(), lessonId, action } satisfies QueuedAction);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Replays every queued action in one batch call. Safe to call opportunistically (e.g. on window "online"). */
export async function syncQueuedProgress(): Promise<number> {
  const db = await openDb();
  const queued: QueuedAction[] = await new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE_STORE, "readonly").objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  if (queued.length === 0) return 0;

  await apiFetch<{ synced: number }>("/content/progress/sync", {
    method: "POST",
    body: JSON.stringify({ items: queued.map((q) => ({ lessonId: q.lessonId, action: q.action })) }),
  });

  const db2 = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db2.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    for (const q of queued) store.delete(q.queuedAt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return queued.length;
}

export async function pendingSyncCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE_STORE, "readonly").objectStore(QUEUE_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
