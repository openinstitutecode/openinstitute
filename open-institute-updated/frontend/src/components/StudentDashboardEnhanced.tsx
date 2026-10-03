import { useEffect, useState } from "react";

interface DashboardData {
  userName: string;
  progressPercent: number;
  currentSemester: {
    name: string;
    startDate: string;
    endDate: string;
    weeksElapsed: number;
    totalWeeks: number;
  } | null;
  upcomingDeadlines: Array<{
    title: string;
    dueAt: string;
    type: "assignment" | "assessment";
  }>;
  unreadAlerts: number;
  enrolledCourses: number;
}

export default function StudentDashboardEnhanced() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const [dashRes, semesterRes] = await Promise.all([
          fetch("/api/me/dashboard"),
          fetch("/api/me/current-semester"),
        ]);

        const dashboard = await dashRes.json();
        let currentSemester = null;

        if (semesterRes.ok) {
          currentSemester = await semesterRes.json();
        }

        setData({
          ...dashboard,
          currentSemester,
        });
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return <div className="p-6 text-center">Loading your dashboard...</div>;
  }

  if (!data) {
    return <div className="p-6 text-center text-red-600">Failed to load dashboard</div>;
  }

  const progressColor = data.progressPercent >= 75 ? "#10b981" : 
                        data.progressPercent >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-lg">
        <h1 className="text-3xl font-bold mb-2">Welcome, {data.userName}</h1>
        {data.currentSemester ? (
          <p className="text-lg opacity-90">
            You are in <span className="font-semibold">{data.currentSemester.name}</span>
            {" "}— Week {data.currentSemester.weeksElapsed} of {data.currentSemester.totalWeeks}
          </p>
        ) : (
          <p className="text-lg opacity-90">No active semester</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Progress Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-700 mb-2">Academic Progress</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-24 h-24">
              <svg className="absolute inset-0" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={progressColor}
                  strokeWidth="8"
                  strokeDasharray={`${data.progressPercent * 2.83} 283`}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-700">{data.progressPercent}%</span>
              </div>
            </div>
          </div>
          <p className="text-center text-sm text-gray-600 mt-4">Units completed</p>
        </div>

        {/* Courses Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-700 mb-4">Active Courses</h3>
          <div className="text-4xl font-bold text-blue-600">{data.enrolledCourses}</div>
          <p className="text-sm text-gray-600 mt-2">Enrolled this semester</p>
        </div>

        {/* Alerts Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-700 mb-4">Notifications</h3>
          <div className="text-4xl font-bold text-amber-600">{data.unreadAlerts}</div>
          <p className="text-sm text-gray-600 mt-2">Unread notifications</p>
        </div>
      </div>

      {/* Upcoming Deadlines */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Upcoming Deadlines</h2>
        {data.upcomingDeadlines.length > 0 ? (
          <div className="space-y-3">
            {data.upcomingDeadlines.slice(0, 5).map((deadline, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium text-gray-700">{deadline.title}</p>
                  <p className="text-sm text-gray-600">
                    {deadline.type === "assignment" ? "Assignment" : "Assessment"} due{" "}
                    {new Date(deadline.dueAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs font-semibold text-blue-600">
                  {Math.ceil(
                    (new Date(deadline.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  )}{" "}
                  days
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No upcoming deadlines</p>
        )}
      </div>

      {/* Semester Timeline */}
      {data.currentSemester && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Semester Progress</h2>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-300"
              style={{
                width: `${(data.currentSemester.weeksElapsed / data.currentSemester.totalWeeks) * 100}%`,
              }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {data.currentSemester.weeksElapsed} of {data.currentSemester.totalWeeks} weeks completed
          </p>
        </div>
      )}
    </div>
  );
}
