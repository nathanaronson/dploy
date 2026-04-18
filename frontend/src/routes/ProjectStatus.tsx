import { useEffect, useState } from "react";
import { useParams, Navigate, Link } from "react-router";
import { useAuth } from "../lib/AuthContext";
import { getProjectStatus, type Project } from "../lib/api";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import LogsViewer from "../components/LogsViewer";

export default function ProjectStatus() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || !user) return;

    // Initial fetch
    getProjectStatus(id)
      .then(setProject)
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"));

    // Poll every 3s while not terminal
    const interval = setInterval(async () => {
      try {
        const p = await getProjectStatus(id);
        setProject(p);
        if (p.status === "running" || p.status === "failed") {
          clearInterval(interval);
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [id, user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  if (error) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-red-400 mb-4">{error}</p>
          <Link to="/" className="text-orange-400 hover:text-orange-300 text-sm">
            Back to dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="text-center py-16 text-gray-500">Loading...</div>
      </Layout>
    );
  }

  const statusMessages: Record<string, string> = {
    pending: "Analyzing your repo...",
    building: "Installing dependencies & building...",
    running: "Your app is live!",
    failed: "Deployment failed",
  };

  return (
    <Layout>
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-300 transition mb-6 inline-block">
        ← Back to dashboard
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <p className="text-sm text-gray-500 font-mono mt-1">{project.repo_url}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* Status message */}
      <div className="mb-6 p-4 rounded-xl border border-gray-800 bg-gray-900/50">
        <p className="text-sm text-gray-300">
          {project.status === "building" && (
            <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
          )}
          {statusMessages[project.status]}
        </p>
      </div>

      {/* Live URL + Port */}
      {project.status === "running" && project.url && (
        <div className="mb-6 p-4 rounded-xl border border-green-500/20 bg-green-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-400">Live URL</p>
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-mono text-sm hover:text-green-300 transition"
              >
                {project.url}
              </a>
              {project.port && (
                <p className="text-xs text-gray-500 mt-1">Port: {project.port}</p>
              )}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(project.url!)}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-white hover:border-gray-600 transition"
            >
              Copy URL
            </button>
          </div>
        </div>
      )}

      {/* Logs */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">Build logs</h2>
        <LogsViewer logs={project.logs} />
      </div>

      {/* Timestamps */}
      <p className="text-xs text-gray-600 mt-4">
        Created: {new Date(project.created_at).toLocaleString()}
      </p>
    </Layout>
  );
}
