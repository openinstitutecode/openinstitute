import { useState } from "react";
import PortalShell from "../../components/portal/PortalShell";
import CourseForum from "../../components/CourseForum";
import { CoursePicker } from "../../components/portal/TrainerPickers";
import { useCurrentUserName } from "../../lib/api";
import { trainerLinks as links } from "./trainerLinks";

export default function TrainerForums() {
  const userName = useCurrentUserName();
  const [courseId, setCourseId] = useState("");
  return (
    <PortalShell role="Trainer portal" links={links} userName={userName}>
      <h1 className="font-display text-2xl">Discussion forums</h1>
      <p className="mt-2 max-w-prose text-sm text-ink/60">
        Choose a course to moderate its discussion topics.
      </p>
      <div className="mt-4 max-w-md">
        <CoursePicker value={courseId} onChange={setCourseId} />
      </div>
      <div className="mt-8">
        {courseId && <CourseForum key={courseId} defaultCourseId={courseId} hideCourseInput />}
      </div>
    </PortalShell>
  );
}
