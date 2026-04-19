import { useState, useMemo } from "react";
import { useNavigate, Navigate } from "react-router";
import { Plus, Search, Folder, Globe, ChevronRight, X } from "lucide-react";
import { GithubIcon } from "../components/GithubIcon";
import { useAuth } from "../lib/AuthContext";
import { deploymentSource, displayStatus, useProjects, type DisplayStatus } from "../lib/api";
import { Reveal } from "../components/Reveal";
import { Nav } from "../components/Nav";
import type { DeploymentRead } from "../client/types.gen";

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today at ${time}`;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date} at ${time}`;
}

function statusCls(status: DisplayStatus) {
  return status === "Running" ? "ok" : status === "Building" ? "warn" : "err";
}

function buildProgress(d: DeploymentRead): number {
  if (d.status === "running") return 100;
  if (d.status === "building" || d.status === "analyzing" || d.status === "pending") {
    const elapsed = (Date.now() - new Date(d.created_at).getTime()) / 1000;
    return Math.min(95, (elapsed / 30) * 100);
  }
  return 0;
}

function StatusPill({ status }: { status: DisplayStatus }) {
  const cls = statusCls(status);
  return (
    <span className={`pill pill-${cls}`}>
      {status === "Running" && <span className="pill-dot" aria-hidden />}
      {status === "Failed" && <span className="pill-x" aria-hidden>✕</span>}
      {status}
    </span>
  );
}

function DeploymentCard({ d, onClick }: { d: DeploymentRead; onClick: () => void }) {
  const status = displayStatus(d.status);
  const source = deploymentSource(d);
  const cls = statusCls(status);
  const progress = buildProgress(d);

  return (
    <div onClick={onClick} className="dcard" style={{ cursor: "pointer" }}>
      <div className={`dcard-rail rail-${cls}`} />
      <div className="dcard-main">
        <div className="dcard-top">
          <div className="dcard-titlewrap">
            <div className={`dcard-icon dicon-${cls}`}>
              {source.type === "github" ? <GithubIcon size={16} /> : <Folder size={16} />}
            </div>
            <div>
              <h3 className="dcard-title">{d.name ?? "Untitled deployment"}</h3>
              <div className="dcard-sub">
                <span className={`mono${source.type === "local" ? " italic" : ""}`}>
                  {source.label}
                </span>
                {d.exposed_ports?.[0] && (
                  <>
                    <span className="dot-sep">•</span>
                    <span className="mono tiny">:{d.exposed_ports[0]}</span>
                  </>
                )}
                <span className="dot-sep">•</span>
                <span className="dcard-timestamp">{formatTimestamp(d.created_at)}</span>
              </div>
            </div>
          </div>
          <StatusPill status={status} />
        </div>

        {status === "Running" && d.public_url && (
          <div className="dcard-live">
            <div className="live-url" style={{ cursor: "pointer" }} onClick={onClick}>
              <Globe size={13} />
              <span className="mono">{d.public_url}</span>
              <ChevronRight size={12} className="live-ext" />
            </div>
          </div>
        )}

        {status === "Building" && (
          <div className="dcard-building">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }}>
                <span className="progress-sheen" aria-hidden />
              </div>
            </div>
            <div className="building-meta">
              <span className="mono">▸ Building…</span>
              <span className="mono muted">{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {status === "Failed" && (
          <div className="dcard-failed">
            <span className="mono err-ink-text">
              ⨯ {(d as DeploymentRead & { error?: string }).error ?? "Deployment failed"}
            </span>
          </div>
        )}
      </div>

      <div className="dcard-arrow">
        <ChevronRight size={16} className="chev" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = useProjects();
  const [filter, setFilter] = useState<"all" | "running" | "building" | "failed">("all");
  const [q, setQ] = useState("");

  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <span className="big-spinner" />
    </div>
  );
  if (!user) return <Navigate to="/signin" replace />;

  const deployments = data?.items ?? [];

  const counts = useMemo(
    () => ({
      running: deployments.filter((d) => displayStatus(d.status) === "Running").length,
      building: deployments.filter((d) => displayStatus(d.status) === "Building").length,
      failed: deployments.filter((d) => displayStatus(d.status) === "Failed").length,
    }),
    [deployments],
  );

  const filtered = useMemo(() => {
    return deployments.filter((d) => {
      const status = displayStatus(d.status).toLowerCase();
      if (filter !== "all" && status !== filter) return false;
      if (q && !(d.name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [deployments, filter, q]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <Nav />
      <div className="dash-wrap">
        {/* Hero strip — simplified */}
        <Reveal className="dash-hero">
          <h2 className="dash-h2">Your Deployments</h2>
          <button className="btn-primary" onClick={() => navigate("/add")}>
            <Plus size={14} /> Add Deployment
          </button>
        </Reveal>

        {/* Controls */}
        <Reveal delay={80} className="dash-controls">
          <div className="search-box">
            <Search size={15} style={{ color: "var(--ink-faint)", flexShrink: 0 }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search active deployments…"
              aria-label="Search active deployments"
            />
            {q && (
              <button
                style={{ border: "none", background: "none", color: "var(--ink-faint)", cursor: "pointer", padding: 0 }}
                onClick={() => setQ("")}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="filter-tabs" role="tablist">
            {(["all", "running", "building", "failed"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`filter-tab ${filter === f ? "active" : ""}`}
              >
                {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
                <span className="filter-count">
                  {f === "all"
                    ? deployments.length
                    : f === "running"
                    ? counts.running
                    : f === "building"
                    ? counts.building
                    : counts.failed}
                </span>
              </button>
            ))}
          </div>
        </Reveal>

        {/* Cards */}
        <div className="dash-list">
          {isLoading ? (
            <Reveal className="dash-empty">
              <span className="mini-spinner" aria-hidden />
              <p>Loading deployments…</p>
            </Reveal>
          ) : filtered.length === 0 ? (
            <Reveal className="dash-empty">
              <Search size={28} style={{ color: "var(--ink-faint)" }} />
              {q ? (
                <p>No deployments match &ldquo;{q}&rdquo;</p>
              ) : (
                <>
                  <p>No deployments yet</p>
                  <button
                    className="btn-primary"
                    onClick={() => navigate("/add")}
                  >
                    <Plus size={14} /> Deploy your first project
                  </button>
                </>
              )}
            </Reveal>
          ) : (
            filtered.map((d, i) => (
              <Reveal key={d.id} delay={i * 60}>
                <DeploymentCard
                  d={d}
                  onClick={() => navigate(`/deployment/${d.id}`)}
                />
              </Reveal>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
