// ============================================================
// DUMMY DATA LAYER — swap these functions for real API calls
// Backend base URL (change when backend is ready)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _API_BASE = "http://localhost:8000"; // ← Ryan/Sam: update this

// ---------- Types ----------

export type DeployStatus = "pending" | "building" | "running" | "failed";

export interface Project {
  id: string;
  name: string;
  repo_url: string;
  status: DeployStatus;
  port: number | null;
  url: string | null;
  logs: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  github_connected: boolean;
  api_key: string;
}

// ---------- Dummy state (in-memory) ----------

let currentUser: User | null = null;

const DUMMY_PROJECTS: Project[] = [
  {
    id: "proj_001",
    name: "my-express-api",
    repo_url: "https://github.com/demo/my-express-api",
    status: "running",
    port: 3000,
    url: "https://dploy.dev/proj_001",
    logs: "[12:00:01] Cloning repo...\n[12:00:03] Detected: Node.js (package.json)\n[12:00:04] Running npm install...\n[12:00:12] Running npm start...\n[12:00:14] ✓ Server listening on port 3000\n[12:00:14] ✓ Deployed successfully",
    created_at: "2026-04-18T10:00:00Z",
  },
  {
    id: "proj_002",
    name: "flask-ml-app",
    repo_url: "https://github.com/demo/flask-ml-app",
    status: "building",
    port: null,
    url: null,
    logs: "[12:05:01] Cloning repo...\n[12:05:03] Detected: Python (requirements.txt)\n[12:05:04] Running pip install -r requirements.txt...\n[12:05:20] Installing dependencies...",
    created_at: "2026-04-18T12:05:00Z",
  },
  {
    id: "proj_003",
    name: "broken-app",
    repo_url: "https://github.com/demo/broken-app",
    status: "failed",
    port: null,
    url: null,
    logs: "[11:30:01] Cloning repo...\n[11:30:03] Detected: Node.js (package.json)\n[11:30:04] Running npm install...\n[11:30:10] ✗ Error: Missing dependency 'pg'\n[11:30:10] ✗ Build failed",
    created_at: "2026-04-18T09:30:00Z",
  },
];

// ---------- Auth ----------

/** SWAP: POST /api/auth/signup */
export async function signup(email: string, _password: string, name: string): Promise<User> {
  await fake_delay(600);
  currentUser = {
    id: "user_" + Math.random().toString(36).slice(2, 8),
    email,
    name,
    github_connected: false,
    api_key: "erk_" + Math.random().toString(36).slice(2, 18),
  };
  localStorage.setItem("dploy_user", JSON.stringify(currentUser));
  return currentUser;
}

/** SWAP: POST /api/auth/login */
export async function login(email: string, _password: string): Promise<User> {
  await fake_delay(600);
  currentUser = {
    id: "user_abc123",
    email,
    name: email.split("@")[0],
    github_connected: true,
    api_key: "erk_demo_key_123456",
  };
  localStorage.setItem("dploy_user", JSON.stringify(currentUser));
  return currentUser;
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

/** SWAP: POST /api/auth/github — redirect to GitHub OAuth */
export async function connectGithub(): Promise<User> {
  await fake_delay(1000);
  if (!currentUser) throw new Error("Not logged in");
  currentUser = { ...currentUser, github_connected: true };
  localStorage.setItem("dploy_user", JSON.stringify(currentUser));
  return currentUser;
  // REAL: window.location.href = `${API_BASE}/api/auth/github`
}

// ---------- Projects / Deploy ----------

/** SWAP: GET /api/projects */
export async function getProjects(): Promise<Project[]> {
  await fake_delay(400);
  return [...DUMMY_PROJECTS];
}

/** SWAP: GET /api/status?id=xxx */
export async function getProjectStatus(id: string): Promise<Project> {
  await fake_delay(300);
  const project = DUMMY_PROJECTS.find((p) => p.id === id);
  if (!project) throw new Error("Project not found");

  // Simulate building → running transition
  if (project.status === "building") {
    const elapsed = Date.now() - new Date(project.created_at).getTime();
    if (elapsed > 30000) {
      project.status = "running";
      project.port = 5000;
      project.url = `https://dploy.dev/${project.id}`;
      project.logs += "\n[12:05:45] ✓ Server listening on port 5000\n[12:05:45] ✓ Deployed successfully";
    }
  }

  return { ...project };
}

/** SWAP: POST /api/push */
export async function deployProject(repo_url: string): Promise<Project> {
  await fake_delay(800);
  const name = repo_url.split("/").pop() || "unnamed-project";
  const newProject: Project = {
    id: "proj_" + Math.random().toString(36).slice(2, 8),
    name,
    repo_url,
    status: "pending",
    port: null,
    url: null,
    logs: `[${new Date().toLocaleTimeString()}] Cloning repo...\n`,
    created_at: new Date().toISOString(),
  };
  DUMMY_PROJECTS.unshift(newProject);

  // Simulate status progression
  setTimeout(() => {
    newProject.status = "building";
    newProject.logs += `[${new Date().toLocaleTimeString()}] Detected: Node.js (package.json)\n`;
    newProject.logs += `[${new Date().toLocaleTimeString()}] Running npm install...\n`;
  }, 2000);

  setTimeout(() => {
    newProject.status = "running";
    newProject.port = 3000 + Math.floor(Math.random() * 5000);
    newProject.url = `https://dploy.dev/${newProject.id}`;
    newProject.logs += `[${new Date().toLocaleTimeString()}] ✓ Server listening on port ${newProject.port}\n`;
    newProject.logs += `[${new Date().toLocaleTimeString()}] ✓ Deployed successfully\n`;
  }, 8000);

  return newProject;
}

// ---------- Helpers ----------

function fake_delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
