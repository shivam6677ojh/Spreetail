import { Link, Outlet, useNavigate } from "react-router-dom";

export function AppLayout({ user, onLogout }) {
  const navigate = useNavigate();

  const handleLogoutClick = () => {
    onLogout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-sm">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link className="flex items-center gap-2 text-2xl font-bold text-brand-600 hover:text-brand-500 transition-colors" to="/">
            <svg className="h-7 w-7 text-brand-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Spreetail
          </Link>
          <div className="flex items-center gap-6">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-600 hidden sm:inline">
                  Hello, <strong className="text-slate-800 font-semibold">{user.name}</strong>
                </span>
                <button
                  onClick={handleLogoutClick}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 shadow-sm transition-all"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-500 shadow-sm transition-all"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </nav>
      </header>
      <main className="flex-grow mx-auto w-full max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-slate-400">
          &copy; {new Date().getFullYear()} Spreetail Shared Expense Management App. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
