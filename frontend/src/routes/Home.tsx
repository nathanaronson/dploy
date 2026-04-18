import { Link, Navigate } from "react-router";
import { useAuth } from "../lib/AuthContext";
import { useProjects } from "../lib/api";
import Layout from "../components/Layout";
import ProjectCard from "../components/ProjectCard";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = useProjects();
  const projects = data?.items ?? [];

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

      {isLoading ? (
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
