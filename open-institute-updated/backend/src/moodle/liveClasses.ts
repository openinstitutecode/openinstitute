// Moodle integration — live classes (BigBlueButton).
//
// Deliberately does NOT call a bigbluebuttonbn-specific web service
// function. There isn't one consistently documented/available across
// Moodle versions for external listing, and guessing at one would
// violate "do not invent APIs." Instead this uses
// core_course_get_contents — a real, stable, well-documented core
// function that returns every section/activity in a course, including
// bigbluebuttonbn activities — and filters client-side for modname
// "bigbluebuttonbn".
//
// This means join URLs come from the activity's own `url` field as
// Moodle reports it; actual BBB session state (is it live right now)
// isn't in this payload; that would need mod_bigbluebuttonbn's own
// completion/status data, which should be checked against your
// installed plugin version before relying on it for a "join now" vs
// "starts at" distinction in the UI.

import { callMoodle } from "./client.js";

interface MoodleCourseModule {
  id: number;
  name: string;
  modname: string;
  url?: string;
  description?: string;
  dates?: Array<{ label: string; timestamp: number }>;
}

interface MoodleCourseSection {
  id: number;
  name: string;
  modules: MoodleCourseModule[];
}

export interface LiveClassSummary {
  moodleModuleId: number;
  name: string;
  joinUrl?: string;
  description?: string;
  dates: Array<{ label: string; timestamp: number }>;
}

export async function listLiveClasses(moodleCourseId: number): Promise<LiveClassSummary[]> {
  const sections = await callMoodle<MoodleCourseSection[]>("core_course_get_contents", {
    courseid: moodleCourseId,
  });

  const modules = sections.flatMap((s) => s.modules ?? []);
  return modules
    .filter((m) => m.modname === "bigbluebuttonbn")
    .map((m) => ({
      moodleModuleId: m.id,
      name: m.name,
      joinUrl: m.url,
      description: m.description,
      dates: m.dates ?? [],
    }));
}
