import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../lib/AuthContext";
import { getProjects, type Project } from "../lib/api";
import Layout from "../components/Layout";
import ProjectCard from "../components/ProjectCard";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getProjects().then((p) => {
      setProjects(p);
      setLoading(false);
    });
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" />;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Your deployments</h1>
          <p className="text-gray-500 text-sm mt-1">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          to="/deploy"
          className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-medium text-sm transition"
        >
          + New deployment
        </Link>
      </div>

      {/* API Key banner */}
      {user.api_key && (
        <div className="mb-6 p-4 rounded-xl border border-gray-800 bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-300">Your API key</p>
              <p className="text-xs text-gray-500 mt-0.5">Use this with the CLI: <code className="text-orange-400">dploy deploy --key {user.api_key.slice(0, 12)}...</code></p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(user.api_key)}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-white hover:border-gray-600 transition"
            >
              Copy key
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">No deployments yet</p>
          <Link
            to="/deploy"
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-medium text-sm transition"
          >
            Deploy your first project
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </Layout>
  );
}
