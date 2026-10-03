import { FormEvent, useEffect, useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import { PortalSection } from "../../components/portal/Primitives";
import { apiFetch, useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";
import { CoursePicker, StudentPicker } from "../../components/portal/TrainerPickers";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Message = { id: string; senderId: string; recipientId: string; body: string; sentAt: string };
type Slot = { id: string; dayOfWeek: number; startTime: string; endTime: string; link: string | null };

export default function TrainerCommunication() {
  const userName = useCurrentUserName();
  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Messages, announcements &amp; office hours</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Direct student messages, course-scoped announcements, and your published office hours.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <DirectMessages />
        <Announcements />
      </div>
      <div className="mt-6">
        <OfficeHours />
      </div>
    </PortalShell>
  );
}

function DirectMessages() {
  const [courseId, setCourseId] = useState("");
  const [otherUserId, setOtherUserId] = useState("");
  const [thread, setThread] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!otherUserId) return;
    try {
      setThread(await apiFetch<Message[]>(`/trainer-self/messages/thread/${otherUserId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load thread.");
    }
  }

  useEffect(() => {
    setThread([]);
    void load();
  }, [otherUserId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !otherUserId) return;
    try {
      await apiFetch("/trainer-self/messages", { method: "POST", body: JSON.stringify({ recipientId: otherUserId, body }) });
      setBody("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    }
  }

  return (
    <PortalSection title="Direct messages">
      <div className="grid gap-3 sm:grid-cols-2">
        <CoursePicker value={courseId} onChange={(id) => { setCourseId(id); setOtherUserId(""); }} />
        <StudentPicker courseId={courseId} value={otherUserId} onChange={setOtherUserId} by="userId" />
      </div>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      <ul className="mt-3 space-y-2 max-h-64 overflow-y-auto">
        {thread.map((m) => (
          <li key={m.id} className={`text-sm ${m.senderId === otherUserId ? "text-ink/70" : "font-medium"}`}>{m.body}</li>
        ))}
      </ul>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message…" className="input flex-1" />
        <button type="submit" className="btn-primary shrink-0">Send</button>
      </form>
    </PortalSection>
  );
}

function Announcements() {
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ recipientCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ recipientCount: number }>("/trainer-self/announcements", {
        method: "POST",
        body: JSON.stringify({ courseId, title, body }),
      });
      setResult(res);
      setTitle(""); setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send announcement.");
    }
  }

  return (
    <PortalSection title="Course announcement">
      <form onSubmit={send} className="space-y-2">
        <CoursePicker value={courseId} onChange={setCourseId} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input" />
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" className="input" />
        <button type="submit" disabled={!courseId} className="btn-primary">Send to enrolled students</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
      {result && <p className="mt-2 text-xs text-forest">Sent to {result.recipientCount} student(s).</p>}
    </PortalSection>
  );
}

function OfficeHours() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Slot[]>("/trainer-self/office-hours/mine").then(setSlots).catch(() => setSlots([]));
  }
  useEffect(load, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/trainer-self/office-hours", { method: "POST", body: JSON.stringify({ dayOfWeek, startTime, endTime, link: link || undefined }) });
      setStartTime(""); setEndTime(""); setLink("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add slot.");
    }
  }

  async function remove(id: string) {
    await apiFetch(`/trainer-self/office-hours/${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  }

  return (
    <PortalSection title="Virtual office hours">
      <ul className="divide-y divide-line">
        {slots?.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2 text-sm">
            <span>{DAYS[s.dayOfWeek]} {s.startTime}–{s.endTime} {s.link && <a href={s.link} className="text-navy underline" target="_blank" rel="noreferrer">Join link</a>}</span>
            <button onClick={() => remove(s.id)} className="text-xs text-navy-dark underline decoration-dotted">Remove</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="input">
          {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" />
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Join link (optional)" className="input flex-1" />
        <button type="submit" className="btn-primary">Add slot</button>
      </form>
      {error && <p className="mt-2 text-xs text-navy-dark">{error}</p>}
    </PortalSection>
  );
}
