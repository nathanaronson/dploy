import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "./lib/AuthContext";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="text-2xl">index.html</span>
            <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
              Dploy
            </span>
          </Link>

          {user && (
            <div className="flex items-center gap-4">
              <Link
                to="/deploy"
                className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-sm font-medium text-white transition"
              >
                + Deploy
              </Link>
              <div className="text-sm text-gray-400">{user.email}</div>
              <button
                onClick={() => { logout(); navigate("/login"); }}
                className="text-sm text-gray-500 hover:text-gray-300 transition"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
