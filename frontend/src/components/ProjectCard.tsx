import { Link } from "react-router";
import type { Project } from "../lib/api";
import StatusBadge from "./StatusBadge";

export default function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/project/${project.id}`}
      className="block border border-gray-800 rounded-xl p-5 hover:border-gray-700 hover:bg-gray-900/50 transition group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white group-hover:text-orange-300 transition">
            {project.name}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5 font-mono">{project.repo_url}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        {project.port && <span>Port {project.port}</span>}
        {project.url && (
          <span className="text-orange-400/70">{project.url}</span>
        )}
        <span className="ml-auto">
          {new Date(project.created_at).toLocaleString()}
        </span>
      </div>
    </Link>
  );
}
