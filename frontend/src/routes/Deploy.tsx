import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../lib/AuthContext";
import { useDeploy } from "../lib/api";
import Layout from "../components/Layout";

export default function Deploy() {
  const { user, loading: authLoading } = useAuth();
  const [repoUrl, setRepoUrl] = useState("");
  const navigate = useNavigate();
  const deploy = useDeploy();

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  const handleDeploy = async (e: FormEvent) => {
    e.preventDefault();
    const url = repoUrl.trim();
    if (!url) return;
    const project = await deploy.mutateAsync({ body: { github_url: url } });
    navigate(`/project/${project.id}`);
  };

  const error = deploy.error
    ? deploy.error instanceof Error
      ? deploy.error.message
      : "Deploy failed"
    : null;

  return (
    <Layout>
      <div className="max-w-lg mx-auto mt-12">
        <h1 className="text-2xl font-bold text-white mb-2">Deploy a project</h1>
        <p className="text-gray-500 text-sm mb-8">
          Paste a GitHub repo URL and we'll figure out the rest — what to install, how to run it,
          and what port to expose.
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
            disabled={deploy.isPending}
            className="w-full py-3 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold transition"
          >
            {deploy.isPending ? "Deploying..." : "Deploy"}
          </button>
        </form>
      </div>
    </Layout>
  );
}
