import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import dployIcon from "../dployIcon.png";
import { useAuth } from "../lib/AuthContext";
import { API_BASE_URL } from "../lib/client";
import { useProject } from "../lib/api";

/** Wrap API_BASE_URL as a ws:// / wss:// URL. */
function wsBase(): string {
  const u = new URL(API_BASE_URL);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString().replace(/\/$/, "");
}

function previewArgv(base: string, extra: string): string {
  if (!extra.trim()) return base;
  const baseParts = base === "(no entrypoint configured)" ? [] : base.split(/\s+/);
  if (needsDelimiter(baseParts)) {
    return `${base} -- ${extra.trim()}`;
  }
  return `${base} ${extra.trim()}`;
}

function needsDelimiter(base: string[]): boolean {
  if (base.includes("--")) return false;
  if (base.length >= 2 && base[0] === "cargo" && base[1] === "run") return true;
  if (
    base.length >= 2 &&
    ["npm", "pnpm", "yarn"].includes(base[0]) &&
    ["start", "run", "dev", "exec"].includes(base[1])
  ) {
    return true;
  }
  if (base.length >= 3 && base[0] === "bun" && base[1] === "run") return true;
  return false;
}

export default function Terminal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: deployment, isLoading, isError } = useProject(id, { poll: true });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const [args, setArgs] = useState("");
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize xterm once.
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;
    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      theme: { background: "#0b0f19", foreground: "#d1d5db" },
      convertEol: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Disconnect on unmount.
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" replace />;

  if (isError) {
    return (
      <div className="size-full min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Deployment not found</h2>
          <button
            onClick={() => navigate("/dashboard")}
            className="text-indigo-600 hover:text-indigo-700 cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  if (isLoading || !deployment) {
    return (
      <div className="size-full min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const ready = deployment.status === "running";
  const canConnect = Boolean(deployment.sandbox_id) && ready && !connected && !starting;

  const connect = () => {
    const term = termRef.current;
    if (!term || !id) return;
    term.clear();
    term.focus();
    setError(null);
    setStarting(true);

    const cols = term.cols;
    const rows = term.rows;
    const qs = new URLSearchParams({ cols: String(cols), rows: String(rows) });
    if (args.trim()) qs.set("args", args.trim());

    const url = `${wsBase()}/api/v1/deployments/${id}/terminal?${qs.toString()}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStarting(false);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        // Control frame from the server (ready / error).
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "error") {
            term.write(`\r\n\x1b[31m[terminal error] ${msg.message}\x1b[0m\r\n`);
            setError(msg.message);
          } else if (msg.type === "ready") {
            term.write(
              `\x1b[90m[connected: ${(msg.argv ?? []).join(" ")}]\x1b[0m\r\n`,
            );
          }
        } catch {
          term.write(ev.data);
        }
        return;
      }
      // Binary PTY output.
      const bytes = new Uint8Array(ev.data as ArrayBuffer);
      term.write(bytes);
    };
    ws.onclose = (ev) => {
      setConnected(false);
      setStarting(false);
      term.write(
        `\r\n\x1b[90m[session closed${ev.reason ? `: ${ev.reason}` : ""}]\x1b[0m\r\n`,
      );
    };
    ws.onerror = () => {
      setError("WebSocket error — check backend logs.");
      setStarting(false);
    };

    // Pipe keystrokes to the server as raw bytes.
    const enc = new TextEncoder();
    const dataDisp = term.onData((s) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(enc.encode(s));
    });
    ws.addEventListener("close", () => dataDisp.dispose());
  };

  const disconnect = () => {
    wsRef.current?.close();
  };

  const argvPreview = (() => {
    const base = deployment.entrypoint && deployment.entrypoint.length > 0
      ? deployment.entrypoint.join(" ")
      : (deployment.start_command ?? "(no entrypoint configured)");
    return previewArgv(base, args);
  })();

  return (
    <div className="size-full min-h-screen bg-gray-50 flex flex-col">
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={dployIcon} alt="DPloy" className="w-8 h-8 rounded-lg" />
            <span className="text-xl">DPloy</span>
          </div>
          <button
            onClick={() => navigate(`/deployment/${id}`)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Deployment
          </button>
        </div>
      </div>

      <div className="max-w-5xl w-full mx-auto px-6 py-6 flex flex-col gap-4 flex-1">
        <div>
          <h1 className="text-2xl mb-1">Terminal</h1>
          <p className="text-sm text-gray-600">
            Attached to the deployed binary's stdin/stdout. No shell — just the app.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-4 flex flex-col gap-3">
          <div className="text-sm text-gray-700">Arguments</div>
          <input
            type="text"
            placeholder="--flag value positional-arg"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            disabled={connected || starting}
            className="w-full px-3 py-2 rounded border border-gray-300 font-mono text-sm disabled:bg-gray-100"
          />
          <div className="text-xs text-gray-500 font-mono break-all">
            $ {argvPreview}
          </div>
          <div className="flex items-center gap-2">
            {!connected ? (
              <button
                onClick={connect}
                disabled={!canConnect}
                className="px-4 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
              >
                {starting ? "Connecting..." : "Connect"}
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="px-4 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-700 cursor-pointer"
              >
                Disconnect
              </button>
            )}
            {!deployment.sandbox_id && (
              <span className="text-xs text-red-600">
                No active sandbox — deploy must be running to attach.
              </span>
            )}
            {deployment.sandbox_id && !ready && (
              <span className="text-xs text-gray-600">
                Deployment is still preparing. The terminal will connect once it reaches running.
              </span>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>

        <div
          ref={containerRef}
          className="bg-[#0b0f19] rounded-lg p-3 flex-1 min-h-[400px]"
        />
      </div>
    </div>
  );
}
