import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-start justify-center py-20">
      <p className="font-mono text-sm text-navy">404</p>
      <h1 className="mt-3 font-display text-3xl">This page doesn't exist.</h1>
      <Link to="/" className="mt-6 btn-secondary">
        Back to home
      </Link>
    </div>
  );
}
