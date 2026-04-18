import { useState } from "react";
import { useNavigate } from "react-router";
import dployIcon from "../dployIcon.png";
import { connectGithub } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export default function ConnectGithub() {
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const handleConnect = async () => {
    setLoading(true);
    try {
      const user = await connectGithub();
      setUser(user);
      navigate("/");
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <img
            src={dployIcon}
            alt="Dploy logo"
            className="mx-auto mb-4 w-16 h-16 rounded-xl shadow-lg"
          />
          <h1 className="text-2xl font-bold text-white">Connect GitHub</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Link your GitHub account to deploy repos directly
          </p>
        </div>

        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-white text-black font-medium hover:bg-gray-200 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          {loading ? "Connecting..." : "Connect with GitHub"}
        </button>

        <button
          onClick={() => navigate("/")}
          className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
