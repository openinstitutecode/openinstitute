import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

interface CatalogueEntry {
  id: string;
  courseId: string;
  isVisible: boolean;
  shortCode?: string;
  credits?: number;
  level?: string;
  keywords?: string[];
  course: {
    id: string;
    title: string;
    description?: string;
    unit?: { title: string };
    trainer?: { fullName: string };
  };
}

export function CourseCataloguePanel() {
  const [entries, setEntries] = useState<CatalogueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchCatalogues = async () => {
      try {
        const res = await apiFetch<CatalogueEntry[]>("/courses/catalogue/browse");
        setEntries(res || []);
      } catch (error) {
        console.error("Failed to fetch course catalogue:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCatalogues();
  }, []);

  const filtered = entries.filter((e) =>
    e.course.title.toLowerCase().includes(search.toLowerCase()) ||
    e.shortCode?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-4 text-gray-500">Loading catalogue...</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="Search courses by title or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{entry.course.title}</h3>
              {entry.level && (
                <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {entry.level}
                </span>
              )}
            </div>

            {entry.shortCode && (
              <p className="text-xs text-gray-500 mb-2">Code: {entry.shortCode}</p>
            )}

            {entry.course.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {entry.course.description}
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-gray-500 border-t pt-2 mt-2">
              <span>
                {entry.course.trainer?.fullName} · {entry.credits || 3} credits
              </span>
            </div>

            {entry.keywords && entry.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {entry.keywords.slice(0, 2).map((kw) => (
                  <span
                    key={kw}
                    className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No courses match your search.
        </div>
      )}
    </div>
  );
}
