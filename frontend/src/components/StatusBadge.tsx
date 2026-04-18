import type { DeployStatus } from "../lib/api";

const config: Record<DeployStatus, { label: string; color: string; dot: string }> = {
  pending: { label: "Pending", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", dot: "bg-yellow-400" },
  building: { label: "Building", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-400 animate-pulse" },
  running: { label: "Running", color: "bg-green-500/10 text-green-400 border-green-500/20", dot: "bg-green-400" },
  failed: { label: "Failed", color: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
};

export default function StatusBadge({ status }: { status: DeployStatus }) {
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
