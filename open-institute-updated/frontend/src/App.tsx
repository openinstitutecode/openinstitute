import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { LoadingState } from "./components/portal/StateViews";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import RequireToken from "./components/RequireToken";
import Home from "./pages/Home";
const About = lazy(() => import("./pages/About"));
const Programmes = lazy(() => import("./pages/Programmes"));
const ProgrammeDetail = lazy(() => import("./pages/ProgrammeDetail"));
const Admissions = lazy(() => import("./pages/Admissions"));
const Accreditation = lazy(() => import("./pages/Accreditation"));
const Faqs = lazy(() => import("./pages/Faqs"));
const Complaints = lazy(() => import("./pages/Complaints"));
const Rpl = lazy(() => import("./pages/Rpl"));
import Login from "./pages/Login";
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword")); // Batch 67 — KFX-004
import NotFound from "./pages/NotFound";

const StudentDashboard = lazy(() => import("./pages/student/StudentDashboard"));
const StudentCourses = lazy(() => import("./pages/student/StudentCourses"));
const AiTutor = lazy(() => import("./pages/student/AiTutor"));
const StudentGrades = lazy(() => import("./pages/student/StudentGrades"));
const TranscriptView = lazy(() => import("./pages/TranscriptView"));
const StudentFees = lazy(() => import("./pages/student/StudentFees"));
const StudentAttachment = lazy(() => import("./pages/student/StudentAttachment"));
const StudentSupport = lazy(() => import("./pages/student/StudentSupport"));
const StudentLibrary = lazy(() => import("./pages/student/StudentLibrary"));
const StudentWellbeing = lazy(() => import("./pages/student/StudentWellbeing"));
const StudentEvents = lazy(() => import("./pages/student/StudentEvents"));
const StudentCareer = lazy(() => import("./pages/student/StudentCareer"));
const StudentSimulation = lazy(() => import("./pages/student/StudentSimulation"));
const StudentViva = lazy(() => import("./pages/student/StudentViva"));
const StudentVirtualLab = lazy(() => import("./pages/student/StudentVirtualLab"));
const StudentPassport = lazy(() => import("./pages/student/StudentPassport"));
const StudentAppeals = lazy(() => import("./pages/student/StudentAppeals"));
const StudentProfile = lazy(() => import("./pages/student/StudentProfile"));
const StudentGraduation = lazy(() => import("./pages/student/StudentGraduation"));
const StudentIdCard = lazy(() => import("./pages/student/StudentIdCard"));
const StudentAchievements = lazy(() => import("./pages/student/StudentAchievements"));
const StudentAttendance = lazy(() => import("./pages/student/StudentAttendance"));
const StudentTimetable = lazy(() => import("./pages/student/StudentTimetable"));
const StudentForums = lazy(() => import("./pages/student/StudentForums"));
const StudentLearning = lazy(() => import("./pages/student/StudentLearning"));
const TrainerAssignments = lazy(() => import("./pages/trainer/TrainerAssignments"));
const TrainerLmsTools = lazy(() => import("./pages/trainer/TrainerLmsTools"));
const StudentAssignments = lazy(() => import("./pages/student/StudentAssignments"));
const StudentRoadmap = lazy(() => import("./pages/student/StudentRoadmap"));
const StudentJobMatches = lazy(() => import("./pages/student/StudentJobMatches"));
const StudentExams = lazy(() => import("./pages/student/StudentExams"));
const StudentAlerts = lazy(() => import("./pages/student/StudentAlerts"));
const StudentNotebook = lazy(() => import("./pages/student/StudentNotebook"));
const StudentPortfolio = lazy(() => import("./pages/student/StudentPortfolio"));
const StudentAiAdvisor = lazy(() => import("./pages/student/StudentAiAdvisor"));
const StudentLetters = lazy(() => import("./pages/student/StudentLetters"));
const StudentReceipts = lazy(() => import("./pages/student/StudentReceipts"));
const StudentResearch = lazy(() => import("./pages/student/StudentResearch"));
const StudentMessages = lazy(() => import("./pages/student/StudentMessages"));
const StudentAccessibility = lazy(() => import("./pages/student/StudentAccessibility"));
const StudentCreditTransfer = lazy(() => import("./pages/student/StudentCreditTransfer"));
const StudentTutorSessions = lazy(() => import("./pages/student/StudentTutorSessions"));
const StudentCatalogue = lazy(() => import("./pages/student/StudentCatalogue"));
const StudentContentLibrary = lazy(() => import("./pages/student/StudentContentLibrary"));
const StudentLearningAnalytics = lazy(() => import("./pages/student/StudentLearningAnalytics"));
const VerifyStudent = lazy(() => import("./pages/VerifyStudent"));
const Verify = lazy(() => import("./pages/Verify"));

const TrainerDashboard = lazy(() => import("./pages/trainer/TrainerDashboard"));
const TrainerCourses = lazy(() => import("./pages/trainer/TrainerCourses"));
const TrainerGradebook = lazy(() => import("./pages/trainer/TrainerGradebook"));
const TrainerAtRisk = lazy(() => import("./pages/trainer/TrainerAtRisk"));
const TrainerVirtualLab = lazy(() => import("./pages/trainer/TrainerVirtualLab"));
const TrainerRoster = lazy(() => import("./pages/trainer/TrainerRoster"));
const TrainerAnalytics = lazy(() => import("./pages/trainer/TrainerAnalytics"));
const TrainerCommunication = lazy(() => import("./pages/trainer/TrainerCommunication"));
const TrainerEvidenceReview = lazy(() => import("./pages/trainer/TrainerEvidenceReview"));
const TrainerAiAssistant = lazy(() => import("./pages/trainer/TrainerAiAssistant"));
const TrainerAttendance = lazy(() => import("./pages/trainer/TrainerAttendance"));
const TrainerCpd = lazy(() => import("./pages/trainer/TrainerCpd"));
const TrainerPerformance = lazy(() => import("./pages/trainer/TrainerPerformance"));
const TrainerRubrics = lazy(() => import("./pages/trainer/TrainerRubrics"));
const TrainerPracticalChecklist = lazy(() => import("./pages/trainer/TrainerPracticalChecklist"));
const TrainerSimulationReview = lazy(() => import("./pages/trainer/TrainerSimulationReview"));
const TrainerVivaReview = lazy(() => import("./pages/trainer/TrainerVivaReview"));
const TrainerForums = lazy(() => import("./pages/trainer/TrainerForums"));
const TrainerContent = lazy(() => import("./pages/trainer/TrainerContent"));
const TrainerLessonBuilder = lazy(() => import("./pages/trainer/TrainerLessonBuilder"));
const TrainerQuizBuilder = lazy(() => import("./pages/trainer/TrainerQuizBuilder"));
const TrainerLiveTeaching = lazy(() => import("./pages/trainer/TrainerLiveTeaching"));

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminAdmissions = lazy(() => import("./pages/admin/AdminAdmissions"));
const AdminStudents = lazy(() => import("./pages/admin/AdminStudents"));
const AdminFinance = lazy(() => import("./pages/admin/AdminFinance"));
const AdminCompliance = lazy(() => import("./pages/admin/AdminCompliance"));
const AdminTrainers = lazy(() => import("./pages/admin/AdminTrainers"));
const AdminExams = lazy(() => import("./pages/admin/AdminExams"));
const AdminGovernance = lazy(() => import("./pages/admin/AdminGovernance"));
const AdminRegulatoryReports = lazy(() => import("./pages/admin/AdminRegulatoryReports"));
const AdminIntegrity = lazy(() => import("./pages/admin/AdminIntegrity"));
const AdminGraduation = lazy(() => import("./pages/admin/AdminGraduation"));
const AdminAcademicStatistics = lazy(() => import("./pages/admin/AdminAcademicStatistics"));
const AdminQualificationRegister = lazy(() => import("./pages/admin/AdminQualificationRegister"));
const AdminLedger = lazy(() => import("./pages/admin/AdminLedger"));
const AdminReceivablePayable = lazy(() => import("./pages/admin/AdminReceivablePayable"));
const AdminInstallments = lazy(() => import("./pages/admin/AdminInstallments"));
const AdminBudgets = lazy(() => import("./pages/admin/AdminBudgets"));
const AdminInventory = lazy(() => import("./pages/admin/AdminInventory"));
const AdminFinancialPlanning = lazy(() => import("./pages/admin/AdminFinancialPlanning"));
const AdminStaff = lazy(() => import("./pages/admin/AdminStaff"));
const AdminAcademicCalendar = lazy(() => import("./pages/admin/AdminAcademicCalendar"));
const AdminTimetableManagement = lazy(() => import("./pages/admin/AdminTimetableManagement"));
const AdminCommunication = lazy(() => import("./pages/admin/AdminCommunication"));
const AdminPermissionAudit = lazy(() => import("./pages/admin/AdminPermissionAudit"));
const AdminSecurity = lazy(() => import("./pages/admin/AdminSecurity"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminAiAssistant = lazy(() => import("./pages/admin/AdminAiAssistant"));
const AdminAiGovernance = lazy(() => import("./pages/admin/AdminAiGovernance"));
const AdminLibraryAdmin = lazy(() => import("./pages/admin/AdminLibraryAdmin"));
const AdminKuccps = lazy(() => import("./pages/admin/AdminKuccps"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminAuditLog = lazy(() => import("./pages/admin/AdminAuditLog"));
const AdminOperations = lazy(() => import("./pages/admin/AdminOperations")); // Batch 67
const AdminInsights = lazy(() => import("./pages/admin/AdminInsights")); // Batch 68
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings")); // Batch 69
const NotificationCentre = lazy(() => import("./pages/NotificationCentre")); // Batch 70
const StudentAccount = lazy(() => import("./pages/student/StudentAccount")); // Batch 68
const StudentRecord = lazy(() => import("./pages/student/StudentRecord")); // Batch 74
const AdminCurriculum = lazy(() => import("./pages/admin/AdminCurriculum"));
const AdminCourses = lazy(() => import("./pages/admin/AdminCourses"));
const AdminCommandCentre = lazy(() => import("./pages/admin/AdminCommandCentre"));
const AdminLibrary = lazy(() => import("./pages/admin/AdminLibrary"));
const AdminAppeals = lazy(() => import("./pages/admin/AdminAppeals"));
const AdminRpl = lazy(() => import("./pages/admin/AdminRpl"));
const AdminComplaints = lazy(() => import("./pages/admin/AdminComplaints"));
const AdminDepartments = lazy(() => import("./pages/admin/AdminDepartments"));
const AdminFeeStructure = lazy(() => import("./pages/admin/AdminFeeStructure"));
const AdminResearch = lazy(() => import("./pages/admin/AdminResearch"));
const AdminProcurement = lazy(() => import("./pages/admin/AdminProcurement"));
const AdminCorrectiveActions = lazy(() => import("./pages/admin/AdminCorrectiveActions"));
const AdminSupportTickets = lazy(() => import("./pages/admin/AdminSupportTickets"));
const AdminDocuments = lazy(() => import("./pages/admin/AdminDocuments"));
const AdminQaGovernance = lazy(() => import("./pages/admin/AdminQaGovernance"));
const AdminLearningPaths = lazy(() => import("./pages/admin/AdminLearningPaths"));
const AdminCourseEvaluations = lazy(() => import("./pages/admin/AdminCourseEvaluations"));
const AdminInternalAudits = lazy(() => import("./pages/admin/AdminInternalAudits"));
const AdminRegistry = lazy(() => import("./pages/admin/AdminRegistry"));
const AdminResultsApproval = lazy(() => import("./pages/admin/AdminResultsApproval"));
const AdminDataExport = lazy(() => import("./pages/admin/AdminDataExport"));
const AdminDataImport = lazy(() => import("./pages/admin/AdminDataImport"));
const AdminExamSecurity = lazy(() => import("./pages/admin/AdminExamSecurity"));
const AdminIntegrations = lazy(() => import("./pages/admin/AdminIntegrations"));
const AdminVirtualLab = lazy(() => import("./pages/admin/AdminVirtualLab"));
const AdminKnowledgeBase = lazy(() => import("./pages/admin/AdminKnowledgeBase"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminProgrammeAccreditation = lazy(() => import("./pages/admin/AdminProgrammeAccreditation"));
const AdminRolePermissions = lazy(() => import("./pages/admin/AdminRolePermissions"));
const AdminSemesters = lazy(() => import("./pages/admin/AdminSemesters"));
const AdminSimilarityChecking = lazy(() => import("./pages/admin/AdminSimilarityChecking"));
const AdminCreditTransfer = lazy(() => import("./pages/admin/AdminCreditTransfer"));
const AdminWorkflows = lazy(() => import("./pages/admin/AdminWorkflows"));
const AdminInstitutionalAnalytics = lazy(() => import("./pages/admin/AdminInstitutionalAnalytics"));
const AdminDecisionCentre = lazy(() => import("./pages/admin/AdminDecisionCentre"));

const EmployerDashboard = lazy(() => import("./pages/employer/EmployerDashboard"));
const EmployerPostings = lazy(() => import("./pages/employer/EmployerPostings"));
const EmployerPlacements = lazy(() => import("./pages/employer/EmployerPlacements"));

const AlumniDashboard = lazy(() => import("./pages/alumni/AlumniDashboard"));

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-navy focus:shadow">
        Skip to main content
      </a>
      <Nav />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingState label="Loading page…" />}>
    <Routes>
      {/* Public site */}
      <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
      <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
      <Route path="/programmes" element={<PublicLayout><Programmes /></PublicLayout>} />
      <Route path="/programmes/:slug" element={<PublicLayout><ProgrammeDetail /></PublicLayout>} />
      <Route path="/admissions" element={<PublicLayout><Admissions /></PublicLayout>} />
      <Route path="/accreditation" element={<PublicLayout><Accreditation /></PublicLayout>} />
      <Route path="/faqs" element={<PublicLayout><Faqs /></PublicLayout>} />
      <Route path="/complaints" element={<PublicLayout><Complaints /></PublicLayout>} />
      <Route path="/rpl" element={<PublicLayout><Rpl /></PublicLayout>} />
      <Route path="/verify" element={<PublicLayout><Verify /></PublicLayout>} />
      <Route path="/verify/:documentId" element={<PublicLayout><Verify /></PublicLayout>} />
      <Route path="/verify-student" element={<PublicLayout><VerifyStudent /></PublicLayout>} />
      <Route path="/login" element={<PublicLayout><Login /></PublicLayout>} />
      <Route path="/change-password" element={<ChangePassword />} />

      {/* Authenticated portals */}
      <Route element={<RequireToken />}>
        <Route path="/notifications" element={<NotificationCentre />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="/student/courses" element={<StudentCourses />} />
        <Route path="/student/tutor" element={<AiTutor />} />
        <Route path="/student/grades" element={<StudentGrades />} />
        <Route path="/transcript/:documentId" element={<TranscriptView />} />
        <Route path="/student/fees" element={<StudentFees />} />
        <Route path="/student/account" element={<StudentAccount />} />
        <Route path="/student/record" element={<StudentRecord />} />
        <Route path="/student/attachment" element={<StudentAttachment />} />
        <Route path="/student/support" element={<StudentSupport />} />
        <Route path="/student/library" element={<StudentLibrary />} />
        <Route path="/student/wellbeing" element={<StudentWellbeing />} />
        <Route path="/student/events" element={<StudentEvents />} />
        <Route path="/student/career" element={<StudentCareer />} />
        <Route path="/student/simulation" element={<StudentSimulation />} />
        <Route path="/student/viva" element={<StudentViva />} />
        <Route path="/student/virtual-lab" element={<StudentVirtualLab />} />
        <Route path="/student/passport" element={<StudentPassport />} />
        <Route path="/student/appeals" element={<StudentAppeals />} />
        <Route path="/student/profile" element={<StudentProfile />} />
        <Route path="/student/graduation" element={<StudentGraduation />} />
        <Route path="/student/id-card" element={<StudentIdCard />} />
        <Route path="/student/achievements" element={<StudentAchievements />} />
        <Route path="/student/attendance" element={<StudentAttendance />} />
        <Route path="/student/timetable" element={<StudentTimetable />} />
        <Route path="/student/forums" element={<StudentForums />} />
        <Route path="/student/assignments" element={<StudentAssignments />} />
        <Route path="/student/learning" element={<StudentLearning />} />
        <Route path="/trainer/assignments" element={<TrainerAssignments />} />
        <Route path="/trainer/lms-tools" element={<TrainerLmsTools />} />
        <Route path="/student/roadmap" element={<StudentRoadmap />} />
        <Route path="/student/job-matches" element={<StudentJobMatches />} />
        <Route path="/student/exams" element={<StudentExams />} />
        <Route path="/student/alerts" element={<StudentAlerts />} />
        <Route path="/student/notebook" element={<StudentNotebook />} />
        <Route path="/student/portfolio" element={<StudentPortfolio />} />
        <Route path="/student/advisor" element={<StudentAiAdvisor />} />
        <Route path="/student/letters" element={<StudentLetters />} />
        <Route path="/student/receipts" element={<StudentReceipts />} />
        <Route path="/student/research" element={<StudentResearch />} />
        <Route path="/student/messages" element={<StudentMessages />} />
        <Route path="/student/accessibility" element={<StudentAccessibility />} />
        <Route path="/student/credit-transfer" element={<StudentCreditTransfer />} />
        <Route path="/student/tutor-sessions" element={<StudentTutorSessions />} />
        <Route path="/student/catalogue" element={<StudentCatalogue />} />
        <Route path="/student/content-library" element={<StudentContentLibrary />} />
        <Route path="/student/learning-analytics" element={<StudentLearningAnalytics />} />

        <Route path="/trainer/dashboard" element={<TrainerDashboard />} />
        <Route path="/trainer/courses" element={<TrainerCourses />} />
        <Route path="/trainer/gradebook" element={<TrainerGradebook />} />
        <Route path="/trainer/at-risk" element={<TrainerAtRisk />} />
        <Route path="/trainer/virtual-lab" element={<TrainerVirtualLab />} />
        <Route path="/trainer/ai-assistant" element={<TrainerAiAssistant />} />
        <Route path="/trainer/attendance" element={<TrainerAttendance />} />
        <Route path="/trainer/cpd" element={<TrainerCpd />} />
        <Route path="/trainer/performance" element={<TrainerPerformance />} />
        <Route path="/trainer/rubrics" element={<TrainerRubrics />} />
        <Route path="/trainer/practical-checklist" element={<TrainerPracticalChecklist />} />
        <Route path="/trainer/simulation-review" element={<TrainerSimulationReview />} />
        <Route path="/trainer/viva-review" element={<TrainerVivaReview />} />
        <Route path="/trainer/forums" element={<TrainerForums />} />
        <Route path="/trainer/content" element={<TrainerContent />} />
        <Route path="/trainer/lesson-builder" element={<TrainerLessonBuilder />} />
        <Route path="/trainer/quiz-builder" element={<TrainerQuizBuilder />} />
        <Route path="/trainer/live" element={<TrainerLiveTeaching />} />
        <Route path="/trainer/roster" element={<TrainerRoster />} />
        <Route path="/trainer/analytics" element={<TrainerAnalytics />} />
        <Route path="/trainer/communication" element={<TrainerCommunication />} />
        <Route path="/trainer/evidence" element={<TrainerEvidenceReview />} />

        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/admissions" element={<AdminAdmissions />} />
        <Route path="/admin/students" element={<AdminStudents />} />
        <Route path="/admin/finance" element={<AdminFinance />} />
        <Route path="/admin/compliance" element={<AdminCompliance />} />
        <Route path="/admin/trainers" element={<AdminTrainers />} />
        <Route path="/admin/exams" element={<AdminExams />} />
        <Route path="/admin/governance" element={<AdminGovernance />} />
        <Route path="/admin/regulatory-reports" element={<AdminRegulatoryReports />} />
        <Route path="/admin/integrity" element={<AdminIntegrity />} />
        <Route path="/admin/graduation" element={<AdminGraduation />} />
        <Route path="/admin/statistics" element={<AdminAcademicStatistics />} />
        <Route path="/admin/qualifications" element={<AdminQualificationRegister />} />
        <Route path="/admin/ledger" element={<AdminLedger />} />
        <Route path="/admin/receivable-payable" element={<AdminReceivablePayable />} />
        <Route path="/admin/installments" element={<AdminInstallments />} />
        <Route path="/admin/budgets" element={<AdminBudgets />} />
        <Route path="/admin/inventory" element={<AdminInventory />} />
        <Route path="/admin/financial-planning" element={<AdminFinancialPlanning />} />
        <Route path="/admin/staff" element={<AdminStaff />} />
        <Route path="/admin/academic-calendar" element={<AdminAcademicCalendar />} />
        <Route path="/admin/timetable-admin" element={<AdminTimetableManagement />} />
        <Route path="/admin/communication" element={<AdminCommunication />} />
        <Route path="/admin/permission-audit" element={<AdminPermissionAudit />} />
        <Route path="/admin/security" element={<AdminSecurity />} />
        <Route path="/admin/reports" element={<AdminReports />} />
        <Route path="/admin/admin-assistant" element={<AdminAiAssistant />} />
        <Route path="/admin/ai-governance" element={<AdminAiGovernance />} />
        <Route path="/admin/library-admin" element={<AdminLibraryAdmin />} />
        <Route path="/admin/kuccps" element={<AdminKuccps />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/audit-log" element={<AdminAuditLog />} />
        <Route path="/admin/operations" element={<AdminOperations />} />
        <Route path="/admin/insights" element={<AdminInsights />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/curriculum" element={<AdminCurriculum />} />
        <Route path="/admin/courses" element={<AdminCourses />} />
        <Route path="/admin/command-centre" element={<AdminCommandCentre />} />
        <Route path="/admin/library" element={<AdminLibrary />} />
        <Route path="/admin/appeals" element={<AdminAppeals />} />
        <Route path="/admin/rpl" element={<AdminRpl />} />
        <Route path="/admin/complaints" element={<AdminComplaints />} />
        <Route path="/admin/departments" element={<AdminDepartments />} />
        <Route path="/admin/fee-structure" element={<AdminFeeStructure />} />
        <Route path="/admin/research" element={<AdminResearch />} />
        <Route path="/admin/procurement" element={<AdminProcurement />} />
        <Route path="/admin/corrective-actions" element={<AdminCorrectiveActions />} />
        <Route path="/admin/support-tickets" element={<AdminSupportTickets />} />
        <Route path="/admin/documents" element={<AdminDocuments />} />
        <Route path="/admin/data-export" element={<AdminDataExport />} />
        <Route path="/admin/data-import" element={<AdminDataImport />} />
        <Route path="/admin/integrations" element={<AdminIntegrations />} />
        <Route path="/admin/virtual-lab" element={<AdminVirtualLab />} />
        <Route path="/admin/role-permissions" element={<AdminRolePermissions />} />
        <Route path="/admin/semesters" element={<AdminSemesters />} />
        <Route path="/admin/programme-accreditation" element={<AdminProgrammeAccreditation />} />
        <Route path="/admin/credit-transfer" element={<AdminCreditTransfer />} />
        <Route path="/admin/exam-security" element={<AdminExamSecurity />} />
        <Route path="/admin/similarity-checking" element={<AdminSimilarityChecking />} />
        <Route path="/admin/knowledge-base" element={<AdminKnowledgeBase />} />
        <Route path="/admin/notifications" element={<AdminNotifications />} />
        <Route path="/admin/qa-governance" element={<AdminQaGovernance />} />
        <Route path="/admin/learning-paths" element={<AdminLearningPaths />} />
        <Route path="/admin/course-evaluations" element={<AdminCourseEvaluations />} />
        <Route path="/admin/internal-audits" element={<AdminInternalAudits />} />
        <Route path="/admin/registry" element={<AdminRegistry />} />
        <Route path="/admin/results-approval" element={<AdminResultsApproval />} />
        <Route path="/admin/workflows" element={<AdminWorkflows />} />
        <Route path="/admin/institutional-analytics" element={<AdminInstitutionalAnalytics />} />
        <Route path="/admin/decision-centre" element={<AdminDecisionCentre />} />

        <Route path="/employer/dashboard" element={<EmployerDashboard />} />
        <Route path="/employer/postings" element={<EmployerPostings />} />
        <Route path="/employer/placements" element={<EmployerPlacements />} />

        <Route path="/alumni/dashboard" element={<AlumniDashboard />} />
      </Route>

      <Route path="/forgot-password" element={<PublicLayout><ForgotPassword /></PublicLayout>} />
      <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
    </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
