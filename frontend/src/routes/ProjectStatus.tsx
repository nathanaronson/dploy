import { useParams, Navigate, Link } from "react-router";
import { useAuth } from "../lib/AuthContext";
import { useProject } from "../lib/api";
import type { DeployStatus } from "../lib/api";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";

const statusMessages: Record<string, string> = {
  pending: "Queued for analysis...",
  analyzing: "Analyzing your repo...",
  building: "Installing dependencies & building...",
  running: "Your app is live!",
  failed: "Deployment failed",
  stopped: "Deployment stopped",
};

export default function ProjectStatus() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { data: project, error, isLoading } = useProject(id, { poll: true });

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  if (error) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-red-400 mb-4">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <Link to="/" className="text-orange-400 hover:text-orange-300 text-sm">
            Back to dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  if (isLoading || !project) {
    return (
      <Layout>
        <div className="text-center py-16 text-gray-500">Loading...</div>
      </Layout>
    );
  }

  const repoLabel = project.github_url ?? `upload:${project.upload_id ?? "?"}`;

  return (
    <Layout>
      <Link
        to="/"
        className="text-sm text-gray-500 hover:text-gray-300 transition mb-6 inline-block"
      >
        ← Back to dashboard
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name ?? project.id}</h1>
          <p className="text-sm text-gray-500 font-mono mt-1">{repoLabel}</p>
        </div>
        <StatusBadge status={project.status as DeployStatus} />
      </div>

      <div className="mb-6 p-4 rounded-xl border border-gray-800 bg-gray-900/50">
        <p className="text-sm text-gray-300">
          {(project.status === "building" || project.status === "analyzing") && (
            <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
          )}
          {statusMessages[project.status] ?? project.status}
        </p>
      </div>

      {project.status === "running" && project.public_url && (
        <div className="mb-6 p-4 rounded-xl border border-green-500/20 bg-green-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-400">Live URL</p>
              <a
                href={project.public_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-mono text-sm hover:text-green-300 transition"
              >
                {project.public_url}
              </a>
              {project.exposed_ports && project.exposed_ports.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Port{project.exposed_ports.length > 1 ? "s" : ""}:{" "}
                  {project.exposed_ports.join(", ")}
                </p>
              )}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(project.public_url!)}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-white hover:border-gray-600 transition"
            >
              Copy URL
            </button>
          </div>
        </div>
      )}

      {project.error && (
        <div className="mb-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
          <p className="text-sm font-medium text-red-400 mb-1">Error</p>
          <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">{project.error}</pre>
        </div>
      )}

      <p className="text-xs text-gray-600 mt-4">
        Created: {new Date(project.created_at).toLocaleString()}
      </p>
    </Layout>
  );
}
