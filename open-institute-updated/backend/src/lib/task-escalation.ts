// Batch 70 — KFEAT-062: who to nudge about overdue tasks. Assignee straight away; the person who assigned it once it is a week late.
type T = { title: string; status: string; dueDate: Date | null; assignedToId: string; createdById: string };
export function taskEscalations(tasks: T[], now = new Date()) {
  const out: { userId: string; title: string; body: string }[] = [];
  for (const t of tasks) {
    if (t.status === "done" || !t.dueDate || t.dueDate >= now) continue;
    const days = Math.floor((now.getTime() - t.dueDate.getTime()) / 86_400_000);
    const short = t.title.slice(0, 60);
    out.push({ userId: t.assignedToId, title: `Task overdue: ${short}`, body: `"${t.title}" was due ${t.dueDate.toISOString().slice(0, 10)} (${days} day(s) ago). Update its status or ask for more time.` });
    if (days >= 7 && t.createdById !== t.assignedToId) out.push({ userId: t.createdById, title: `Assigned task is ${days >= 14 ? "two weeks" : "a week"} late: ${short}`, body: `"${t.title}" is still ${t.status.replace("_", " ")} ${days} day(s) after its due date.` });
  }
  return out;
}
export function subscriptionDue(frequency: string, lastRunAt: Date | null, now = new Date()) {
  if (!lastRunAt) return true;
  const hours = (now.getTime() - lastRunAt.getTime()) / 3_600_000;
  return frequency === "daily" ? hours >= 20 : frequency === "weekly" ? hours >= 24 * 6.5 : frequency === "monthly" ? hours >= 24 * 27 : false;
}
