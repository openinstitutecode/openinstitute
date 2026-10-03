#!/usr/bin/env python3
"""VBI049 — Grade Synchronization E2E. Runs the REAL Virtual Business Lab domain code (Python) and the
REAL Measur Business College integration modules (TypeScript, under Node) against each other over real loopback sockets:

  portal enroll event -> dispatch -> Lab webhook -> student provisioned
  student evidence -> assessor decides -> sync_worker -> portal webhook -> result PENDING_APPROVAL
  trainer approves -> grade posted to gradebook -> approval dispatched back -> Lab confirmation
  portal down -> event retried and delivered; same event redelivered -> no duplicate grade
  approval reversed -> grade zeroed -> Lab confirmation REVERSED

Batch 66: the portal side now runs against a REAL Postgres (the in-memory Prisma stand-in is gone).
Only the HTTP glue (FastAPI / Express route wrappers) is replaced by tiny servers. Needs: Python 3.10+,
Node 22+, `npm install` + `npx prisma generate` in backend/, and a THROWAWAY Postgres database whose
name contains "e2e" or "test" with the schema applied (`DATABASE_URL=... npx prisma db push`). The
portal server TRUNCATES that database when it starts.

    E2E_DATABASE_URL=postgresql://user:pw@localhost:5432/kvbdtc_e2e \\
    VBL_REPO=/path/to/virtual-business-lab python3 e2e/run_e2e.py
"""
import http.server, json, os, re, subprocess, sys, threading, time, unittest, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PORTAL_BACKEND = os.path.dirname(HERE)
VBL_REPO = os.environ.get("VBL_REPO") or os.path.join(PORTAL_BACKEND, "..", "..", "virtual-business-lab")
sys.path[:0] = [os.path.join(VBL_REPO, "backend"), os.path.join(VBL_REPO, "backend", "tests"), os.path.join(VBL_REPO, "backend", "tools")]

os.environ.update({"PORTAL_WEBHOOK_SECRET": "e2e-portal-secret", "VBL_WEBHOOK_SECRET": "e2e-vbl-secret",
                   "PORTAL_SSO_SECRET": "e2e-sso", "VBL_DEFAULT_INSTITUTION_CODE": "A"})
from helpers import World  # noqa: E402  (VBL tests/helpers.py)
from vbl.errors import VBLError  # noqa: E402
import sync_worker  # noqa: E402


def call(base, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


class E2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.w = World()
        cls.v = cls.w.vbl
        v = cls.v
        # ---- Lab webhook endpoint (what FastAPI's /integration/v1/webhooks/portal does) ----
        class LabWebhook(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                raw = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
                try:
                    out = v.integration.handle_portal_event(self.headers.get("x-portal-timestamp", ""), raw,
                            self.headers.get("x-portal-signature"), json.loads(raw), key_id_hint=self.headers.get("x-portal-key-id"))
                    status, body = 200, out
                except VBLError as e:
                    status, body = e.status, {"error": str(e)}
                self.send_response(status); self.end_headers(); self.wfile.write(json.dumps(body).encode())
            def log_message(self, *a): pass
        cls.lab_server = http.server.HTTPServer(("127.0.0.1", 0), LabWebhook)
        threading.Thread(target=cls.lab_server.serve_forever, daemon=True).start()
        cls.lab_url = f"http://127.0.0.1:{cls.lab_server.server_address[1]}"
        # ---- portal (Node + real Postgres) ----
        db_url = os.environ.get("E2E_DATABASE_URL")
        if not db_url:
            raise unittest.SkipTest("E2E_DATABASE_URL is not set — the portal side needs a throwaway Postgres (see the module docstring)")
        tsx = os.path.join(PORTAL_BACKEND, "node_modules", ".bin", "tsx")
        if not os.path.exists(tsx):
            raise RuntimeError("Run `npm install` and `npx prisma generate` in backend/ first (tsx not found).")
        env = dict(os.environ, VBL_INTEGRATION_URL=cls.lab_url, PORT="0", DATABASE_URL=db_url)
        cls.node = subprocess.Popen([tsx, os.path.join(PORTAL_BACKEND, "e2e", "portal-e2e-server.ts")], cwd=PORTAL_BACKEND,
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        m, seen = None, []
        for _ in range(200):  # tsx/prisma may print warnings before READY
            line = cls.node.stdout.readline()
            if not line:
                break
            seen.append(line)
            m = re.match(r"READY (\d+)", line)
            if m:
                break
        if not m:
            cls.node.kill(); raise RuntimeError("portal server failed to start:\n" + "".join(seen))
        cls.portal = f"http://127.0.0.1:{m.group(1)}"
        cls.portal_webhook = cls.portal + "/webhooks/vbl"

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "node", None): cls.node.kill()
        cls.lab_server.shutdown(); cls.lab_server.server_close()

    def state(self):
        return call(self.portal, "GET", "/state")[1]

    def deliver_to_portal(self):
        """Runs the Lab's real sync_worker pass against the portal's real webhook."""
        return sync_worker.run_once(self.v, self.portal_webhook)

    def test_full_acceptance_scenario(self):
        w, v = self.w, self.v

        # ---- Phase A: portal enrollment reaches the Lab (needs the course mapping first) ----
        v.integration.create_course_mapping(w.admin_a, "u1", "BM501", w.prog, lab_unit_id=w.unit)
        self.assertEqual(call(self.portal, "POST", "/admin/enroll", {"unitId": "u1"})[0], 201)
        self.assertEqual(call(self.portal, "POST", "/admin/dispatch")[1], {"sent": 1, "failed": 0})
        mapping = v.db.one("SELECT * FROM integration_student_map WHERE portal_student_id=?", ("stu_1",))
        self.assertIsNotNone(mapping, "Lab should have provisioned the student from the portal's enrollment event")
        self.assertEqual(mapping["registration_number"], "2026/BM5/000001")
        self.assertEqual(self.state()["ledger"][0]["status"], "SENT")

        # ---- Phase B: student works, assessor decides, Lab -> portal ----
        from vbl.security import Actor
        student = Actor(mapping["lab_user_id"], w.inst_a, "student")
        ev = v.competency.capture_evidence(student, w.comp, "Bank rec", "Reconciliation v1", "SCENARIO_ACTIVITY", "scenario:e2e/1")
        attempt = v.assessment.submit(student, ev)
        v.assessment.decide(w.assessor, attempt, {"diff": True, "adj": True}, "Well reconciled")

        # Portal is DOWN for the first delivery attempt: point the worker at a dead port.
        sent, failed = sync_worker.run_once(v, "http://127.0.0.1:1/webhooks/vbl")
        self.assertEqual(sent, 0)
        self.assertGreaterEqual(failed, 1)
        pending = v.db.all("SELECT status, attempts FROM integration_events WHERE direction='OUT'")
        self.assertTrue(all(r["status"] == "FAILED" and r["attempts"] == 1 for r in pending), "nothing lost while the portal is down")
        self.assertEqual(self.state()["results"], [])

        # Portal recovers. Fast-forward the backoff window; retry delivers everything.
        v.db.run("UPDATE integration_events SET processed_at='2020-01-01T00:00:00' WHERE direction='OUT'")
        sent, failed = self.deliver_to_portal()
        self.assertEqual((sent >= 3, failed), (True, 0))  # activity.logged + assessment.decided + simulation.completed

        st = self.state()
        self.assertEqual(len(st["results"]), 1)
        result = st["results"][0]
        self.assertEqual(result["status"], "PENDING_APPROVAL")
        self.assertEqual(result["outcome"], "COMPETENT")
        self.assertEqual(result["externalAssessmentId"], attempt)
        self.assertEqual(result["studentId"], "stu_1")
        self.assertEqual(result["learningOutcomeId"], "lo-1")  # competency mapped to a portal learning outcome
        lab_hash = v.db.one("SELECT hash FROM evidence_versions WHERE evidence_id=? AND version=1", (ev,))["hash"]
        self.assertEqual(result["evidenceContentHash"], lab_hash, "evidence reference must match the Lab's own hash chain")
        actions = [a["action"] for a in st["audits"]]
        self.assertIn("VBL_SIMULATION_COMPLETED", actions)
        self.assertTrue(any(a["activityType"] == "evidence.capture" for a in st["activities"]),
                        "Batch 66: Lab activity is stored as queryable rows (VBI036), not only an audit line")
        self.assertEqual(st["submissions"], [], "nothing reaches the gradebook before a human approves")

        # ---- Phase C: the SAME events redelivered must not create a second anything ----
        for row in v.db.all("SELECT id FROM integration_events WHERE direction='OUT'"):
            v.db.run("UPDATE integration_events SET status='PENDING', processed_at='2020-01-01T00:00:00' WHERE id=?", (row["id"],))
        self.deliver_to_portal()
        st = self.state()
        self.assertEqual(len(st["results"]), 1, "duplicate delivery must not duplicate the result")
        self.assertEqual(st["submissions"], [])

        # ---- Phase D: trainer approves -> official gradebook entry + confirmation back to the Lab ----
        code, approved = call(self.portal, "POST", "/admin/approve", {"resultId": result["id"], "note": "Verified"})
        self.assertEqual(code, 200)
        self.assertTrue(approved["gradebook"]["posted"])
        st = self.state()
        self.assertEqual(len(st["submissions"]), 1)
        self.assertEqual(st["submissions"][0]["score"], 100)
        self.assertEqual(st["submissions"][0]["studentUserId"], "user_1")
        self.assertEqual(call(self.portal, "POST", "/admin/approve", {"resultId": result["id"]})[0], 409, "cannot approve twice")

        self.assertEqual(call(self.portal, "POST", "/admin/dispatch")[1]["failed"], 0)
        confirmation = v.integration.portal_confirmation_for(attempt)
        self.assertEqual(confirmation["portal_status"], "APPROVED")

        # ---- Phase E: reversal zeroes the grade and the Lab learns of it ----
        code, _ = call(self.portal, "POST", "/admin/reverse", {"resultId": result["id"], "reason": "Recorded against the wrong cohort"})
        self.assertEqual(code, 200)
        st = self.state()
        self.assertEqual(st["submissions"][0]["score"], 0)
        self.assertEqual(len(st["submissions"]), 1, "reversal annotates the grade, never deletes it")
        call(self.portal, "POST", "/admin/dispatch")
        self.assertEqual(v.integration.portal_confirmation_for(attempt)["portal_status"], "REVERSED")

        # ---- Phase F: nothing is stuck anywhere ----
        self.assertEqual(v.integration.dashboard(w.admin_a)["health"], "GREEN")
        self.assertTrue(all(e["status"] in ("SENT", "RECEIVED") for e in self.state()["ledger"]))

    def test_event_arriving_before_its_mapping_is_retried_not_lost(self):
        """Cross-system proof of the retry-loss fix: the Lab rejects an enrollment for an unmapped unit,
        the portal keeps it FAILED, and once the mapping exists the redelivery is APPLIED (not 'duplicate')."""
        call(self.portal, "POST", "/admin/enroll", {"unitId": "u-unmapped"})
        out = call(self.portal, "POST", "/admin/dispatch")[1]
        self.assertEqual(out["failed"], 1)
        failed = [e for e in self.state()["ledger"] if e["status"] == "FAILED"]
        self.assertEqual(len(failed), 1)
        self.assertIn("HTTP 404", failed[0]["lastError"])
        self.v.integration.create_course_mapping(self.w.admin_a, "u-unmapped", "BM999", self.w.prog)
        # Batch 66: a failed event now waits out an exponential backoff (nextAttemptAt). An immediate
        # retry must do nothing; once the backoff has "elapsed" the same event is delivered.
        self.assertEqual(call(self.portal, "POST", "/admin/dispatch")[1], {"sent": 0, "failed": 0})
        call(self.portal, "POST", "/admin/backdate")
        out = call(self.portal, "POST", "/admin/dispatch")[1]
        self.assertEqual(out, {"sent": 1, "failed": 0})
        self.assertTrue(all(e["status"] == "SENT" for e in self.state()["ledger"] if e["eventType"] == "enrollment.created"))

    def test_lab_event_for_a_student_the_portal_does_not_know_yet_is_retried_not_lost(self):
        """Portal-side counterpart of the test above: the portal 500s an assessment.decided for a student
        it hasn't got yet, keeps the ledger row FAILED, and APPLIES the same eventId when it is redelivered
        after the student exists — instead of acknowledging it as a duplicate and losing the result."""
        w, v = self.w, self.v
        v.integration.create_course_mapping(w.admin_a, "u1", "BM501", w.prog, lab_unit_id=w.unit)
        # a second Lab student linked to a portal student id the portal has not created yet
        from vbl.security import Actor
        uid = v.db.insert("users", institution_id=w.inst_a, email="late@lab.test", name="Late", pw_hash="x", role="student", created_at="2026-01-01")
        v.db.insert("integration_student_map", institution_id=w.inst_a, portal_student_id="stu_late", registration_number="2026/BM5/000777",
                    lab_user_id=uid, status="ACTIVE", created_at="2026-01-01", updated_at="2026-01-01")
        late = Actor(uid, w.inst_a, "student")
        ev = v.competency.capture_evidence(late, w.comp, "Late rec", "content", "SCENARIO_ACTIVITY", "scenario:e2e/late")
        attempt = v.assessment.submit(late, ev)
        v.assessment.decide(w.assessor, attempt, {"diff": True, "adj": True}, "")

        before = len(self.state()["results"])
        self.deliver_to_portal()
        st = self.state()
        self.assertEqual(len(st["results"]), before, "portal cannot record a result for an unknown student")
        failed = [e for e in st["ledger"] if e["status"] == "FAILED" and e["eventType"] == "assessment.decided"]
        self.assertEqual(len(failed), 1)
        self.assertIn("No matching student", failed[0]["lastError"])

        call(self.portal, "POST", "/admin/add-student", {"id": "stu_late", "studentNumber": "2026/BM5/000777"})
        v.db.run("UPDATE integration_events SET processed_at='2020-01-01T00:00:00' WHERE direction='OUT' AND status='FAILED'")
        self.deliver_to_portal()
        st = self.state()
        self.assertEqual(len(st["results"]), before + 1, "the redelivered event must now be APPLIED")
        self.assertEqual(st["results"][-1]["externalAssessmentId"], attempt)
        self.assertEqual([e["status"] for e in st["ledger"] if e["eventType"] == "assessment.decided" and e["payload"]["externalAssessmentId"] == attempt], ["RECEIVED"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
