import { Link } from "react-router-dom";
import { LogoOnDark, COLLEGE_NAME } from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-navy text-paper/90">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <LogoOnDark className="h-16 w-auto" />
          <p className="mt-3 font-display text-base font-semibold text-paper">{COLLEGE_NAME}</p>
          <p className="mt-2 max-w-[26ch] text-sm text-paper/70">
            A virtual TVET college for business and digital skills, built for
            learners across Kenya.
          </p>
        </div>

        <div>
          <h3 className="eyebrow text-gold-light">Study</h3>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link to="/programmes" className="hover:text-gold-light">Programmes</Link></li>
            <li><Link to="/admissions" className="hover:text-gold-light">Admissions</Link></li>
            <li><Link to="/accreditation" className="hover:text-gold-light">Accreditation status</Link></li>
            <li><Link to="/verify" className="hover:text-gold-light">Verify a certificate</Link></li>
            <li><Link to="/verify-student" className="hover:text-gold-light">Verify a student</Link></li>
            <li><Link to="/faqs" className="hover:text-gold-light">FAQs</Link></li>
            <li><Link to="/complaints" className="hover:text-gold-light">Complaints</Link></li>
            <li><Link to="/rpl" className="hover:text-gold-light">Recognition of Prior Learning</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="eyebrow text-gold-light">Portals</h3>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link to="/login" className="hover:text-gold-light">Student login</Link></li>
            <li><Link to="/login" className="hover:text-gold-light">Trainer login</Link></li>
            <li><Link to="/login" className="hover:text-gold-light">Staff &amp; admin login</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="eyebrow text-gold-light">Contact</h3>
          <ul className="mt-4 space-y-2 text-sm text-paper/70">
            <li>admissions@kvbdtc.ac.ke</li>
            <li>+254 700 000 000</li>
            <li>Nairobi, Kenya</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-paper/10">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-paper/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Measur Business College.</p>
          <p>Accreditation status: pending — see the Accreditation page for current facts.</p>
        </div>
      </div>
    </footer>
  );
}
