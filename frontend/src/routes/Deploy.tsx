import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../lib/AuthContext";
import { deployProject } from "../lib/api";
import Layout from "../components/Layout";

export default function Deploy() {
  const { user, loading: authLoading } = useAuth();
  const [repoUrl, setRepoUrl] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  const handleDeploy = async (e: FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setError("");
    setDeploying(true);

    try {
      const project = await deployProject(repoUrl.trim());
      navigate(`/project/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deploy failed");
      setDeploying(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto mt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Deploy a project</h1>
        <p className="text-gray-500 text-sm mb-8">
          Paste a GitHub repo URL and we'll figure out the rest — what to install, how to run it, and what port to expose.
        </p>

        <form onSubmit={handleDeploy} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              GitHub repository URL
            </label>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              required
              placeholder="https://github.com/username/repo"
              className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition font-mono text-sm"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={deploying}
            className="w-full py-3 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold transition"
          >
            {deploying ? "Deploying..." : "Deploy"}
          </button>
        </form>

        <div className="mt-10 p-4 rounded-xl border border-gray-800 bg-gray-900/30">
          <h3 className="text-sm font-medium text-gray-300 mb-2">What happens next?</h3>
          <ol className="text-sm text-gray-500 space-y-1.5">
            <li className="flex gap-2">
              <span className="text-orange-400 font-mono text-xs mt-0.5">1.</span>
              Agent analyzes your repo — detects language, dependencies, run command
            </li>
            <li className="flex gap-2">
              <span className="text-orange-400 font-mono text-xs mt-0.5">2.</span>
              Installs dependencies and builds your project
            </li>
            <li className="flex gap-2">
              <span className="text-orange-400 font-mono text-xs mt-0.5">3.</span>
              Starts your app and exposes it on a public URL
            </li>
          </ol>
        </div>
      </div>
    </Layout>
  );
}
