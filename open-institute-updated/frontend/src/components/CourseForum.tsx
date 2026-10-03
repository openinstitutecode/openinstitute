import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Post = { id: string; body: string; authorId: string; createdAt: string };
type ForumData = { id: string; title: string; posts: Post[] };

export default function CourseForum({ defaultCourseId = "", hideCourseInput = false }: { defaultCourseId?: string; hideCourseInput?: boolean }) {
  const [courseId, setCourseId] = useState(defaultCourseId);
  const [forums, setForums] = useState<ForumData[] | null>(null);
  const [newForumTitle, setNewForumTitle] = useState("");
  const [postDrafts, setPostDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!courseId) return;
    apiFetch<ForumData[]>(`/forums/course/${courseId}`)
      .then(setForums)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load forums."));
  }
  useEffect(load, [courseId]);

  async function createForum(e: FormEvent) {
    e.preventDefault();
    if (!courseId || !newForumTitle.trim()) return;
    try {
      await apiFetch("/forums", { method: "POST", body: JSON.stringify({ courseId, title: newForumTitle }) });
      setNewForumTitle("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create forum.");
    }
  }

  async function postReply(forumId: string, e: FormEvent) {
    e.preventDefault();
    const body = postDrafts[forumId];
    if (!body?.trim()) return;
    try {
      await apiFetch("/forums/posts", { method: "POST", body: JSON.stringify({ forumId, body }) });
      setPostDrafts((d) => ({ ...d, [forumId]: "" }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post.");
    }
  }

  return (
    <div>
      {!hideCourseInput && (
        <div className="flex items-center gap-3">
          <input
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            placeholder="Course ID"
            className="input w-64"
          />
        </div>
      )}

      {error && <p className="mt-4 text-sm text-navy-dark">{error}</p>}

      {courseId && (
        <>
          <form onSubmit={createForum} className="mt-6 flex gap-3">
            <input
              value={newForumTitle}
              onChange={(e) => setNewForumTitle(e.target.value)}
              placeholder="New discussion topic title…"
              className="input flex-1"
            />
            <button type="submit" className="btn-secondary shrink-0">Start topic</button>
          </form>

          <div className="mt-8 space-y-6">
            {forums?.map((f) => (
              <div key={f.id} className="border border-line bg-white p-5">
                <h3 className="font-display text-lg">{f.title}</h3>
                <ul className="mt-4 space-y-3">
                  {f.posts.map((p) => (
                    <li key={p.id} className="border-l-2 border-line pl-3 text-sm text-ink/70">
                      {p.body}
                      <p className="mt-1 text-xs text-ink/40">{new Date(p.createdAt).toLocaleString()}</p>
                    </li>
                  ))}
                  {f.posts.length === 0 && <p className="text-sm text-ink/40">No replies yet.</p>}
                </ul>
                <form onSubmit={(e) => postReply(f.id, e)} className="mt-4 flex gap-2">
                  <input
                    value={postDrafts[f.id] ?? ""}
                    onChange={(e) => setPostDrafts((d) => ({ ...d, [f.id]: e.target.value }))}
                    placeholder="Reply…"
                    className="input flex-1"
                  />
                  <button type="submit" className="btn-secondary shrink-0">Post</button>
                </form>
              </div>
            ))}
            {forums && forums.length === 0 && <p className="text-sm text-ink/50">No discussion topics for this course yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
