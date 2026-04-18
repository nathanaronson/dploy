// ============================================================
// DUMMY DATA LAYER — swap these functions for real API calls
// Backend base URL (change when backend is ready)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _API_BASE = "http://localhost:8000"; // ← Ryan/Sam: update this

// ---------- Types ----------

export type DeployStatus = "Running" | "Building" | "Failed";

export interface LogEntry {
  time: string;
  message: string;
}

export interface Deployment {
  id: string;
  name: string;
  source: string;
  status: DeployStatus;
  url: string | null;
  port: number | null;
  type: "github" | "local";
  createdAt: string;
  logs: LogEntry[];
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  github_connected: boolean;
  api_key: string;
}

// ---------- Dummy state ----------

let currentUser: User | null = null;

const API_KEY = "erk_demo_key_a1b2c3d4e5f6g7h8i9j0";

const DUMMY_DEPLOYMENTS: Deployment[] = [
  {
    id: "proj_001",
    name: "my-express-api",
    source: "https://github.com/demo/my-express-api",
    status: "Running",
    url: "https://dploy.dev/proj_001",
    port: 3000,
    type: "github",
    createdAt: "2026-04-15 12:00:14",
    logs: [
      { time: "12:00:01", message: "Cloning repo..." },
      { time: "12:00:03", message: "Detected: Node.js (package.json)" },
      { time: "12:00:04", message: "Running npm install..." },
      { time: "12:00:12", message: "Running npm start..." },
      { time: "12:00:14", message: "\u2713 Server listening on port 3000" },
      { time: "12:00:14", message: "\u2713 Deployed successfully" },
    ],
  },
  {
    id: "proj_002",
    name: "react-dashboard",
    source: "Local project",
    status: "Building",
    url: null,
    port: 5173,
    type: "local",
    createdAt: "2026-04-18 09:30:22",
    logs: [
      { time: "09:30:22", message: "Uploading local files..." },
      { time: "09:30:25", message: "Detected: React + Vite (vite.config.ts)" },
      { time: "09:30:26", message: "Running pnpm install..." },
      { time: "09:30:38", message: "Running pnpm dev..." },
    ],
  },
  {
    id: "proj_003",
    name: "nextjs-blog",
    source: "https://github.com/demo/nextjs-blog",
    status: "Failed",
    url: null,
    port: null,
    type: "github",
    createdAt: "2026-04-17 16:45:08",
    logs: [
      { time: "16:45:08", message: "Cloning repo..." },
      { time: "16:45:11", message: "Detected: Next.js (next.config.js)" },
      { time: "16:45:12", message: "Running npm install..." },
      { time: "16:45:28", message: "Running npm run build..." },
      { time: "16:45:42", message: "\u2717 Build failed: Module not found" },
      { time: "16:45:42", message: "\u2717 Deployment failed" },
    ],
  },
  {
    id: "proj_004",
    name: "python-flask-app",
    source: "Local project",
    status: "Running",
    url: "https://dploy.dev/proj_004",
    port: 5000,
    type: "local",
    createdAt: "2026-04-16 14:20:55",
    logs: [
      { time: "14:20:55", message: "Uploading local files..." },
      { time: "14:20:58", message: "Detected: Python (requirements.txt)" },
      { time: "14:20:59", message: "Creating virtual environment..." },
      { time: "14:21:02", message: "Installing dependencies..." },
      { time: "14:21:15", message: "Running python app.py..." },
      { time: "14:21:17", message: "\u2713 Server listening on port 5000" },
      { time: "14:21:17", message: "\u2713 Deployed successfully" },
    ],
  },
];

// ---------- Auth ----------

/** SWAP: GET /api/auth/github — redirect to GitHub OAuth */
export async function signInWithGithub(): Promise<User> {
  await fakeDelay(800);
  currentUser = {
    id: "user_abc123",
    name: "demo-user",
    avatar: "https://github.com/github.png",
    github_connected: true,
    api_key: API_KEY,
  };
  localStorage.setItem("dploy_user", JSON.stringify(currentUser));
  return currentUser;
  // REAL: window.location.href = `${_API_BASE}/api/auth/github`
}

export function logout() {
  currentUser = null;
  localStorage.removeItem("dploy_user");
}

export function getStoredUser(): User | null {
  if (currentUser) return currentUser;
  const stored = localStorage.getItem("dploy_user");
  if (stored) {
    currentUser = JSON.parse(stored);
    return currentUser;
  }
  return null;
}

export function getApiKey(): string {
  return currentUser?.api_key ?? API_KEY;
}

// ---------- Deployments ----------

/** SWAP: GET /api/projects */
export async function getDeployments(): Promise<Deployment[]> {
  await fakeDelay(300);
  return [...DUMMY_DEPLOYMENTS];
}

/** SWAP: GET /api/status?id=xxx */
export async function getDeployment(id: string): Promise<Deployment | null> {
  await fakeDelay(200);
  return DUMMY_DEPLOYMENTS.find((d) => d.id === id) ?? null;
}

/** SWAP: POST /api/push */
export async function deployFromGithub(repoUrl: string): Promise<Deployment> {
  await fakeDelay(800);
  const name = repoUrl.split("/").pop() || "unnamed-project";
  const newDeployment: Deployment = {
    id: "proj_" + Math.random().toString(36).slice(2, 8),
    name,
    source: repoUrl,
    status: "Building",
    url: null,
    port: null,
    type: "github",
    createdAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    logs: [
      { time: new Date().toLocaleTimeString([], { hour12: false }), message: "Cloning repo..." },
    ],
  };
  DUMMY_DEPLOYMENTS.unshift(newDeployment);

  // Simulate progression
  setTimeout(() => {
    newDeployment.logs.push(
      { time: new Date().toLocaleTimeString([], { hour12: false }), message: "Detected: Node.js (package.json)" },
      { time: new Date().toLocaleTimeString([], { hour12: false }), message: "Running npm install..." },
    );
  }, 2000);

  setTimeout(() => {
    newDeployment.status = "Running";
    newDeployment.port = 3000 + Math.floor(Math.random() * 5000);
    newDeployment.url = `https://dploy.dev/${newDeployment.id}`;
    newDeployment.logs.push(
      { time: new Date().toLocaleTimeString([], { hour12: false }), message: `\u2713 Server listening on port ${newDeployment.port}` },
      { time: new Date().toLocaleTimeString([], { hour12: false }), message: "\u2713 Deployed successfully" },
    );
  }, 6000);

  return newDeployment;
}

// ---------- Helpers ----------

function fakeDelay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
