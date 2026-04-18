import { useState, type FormEvent } from "react";
import { useNavigate, Navigate } from "react-router";
import { ArrowLeft, Github, Folder } from "lucide-react";
import dployIcon from "../dployIcon.png";
import { useAuth } from "../lib/AuthContext";
import { deployFromGithub, getApiKey } from "../lib/api";

export default function AddDeployment() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [deploymentType, setDeploymentType] = useState<"github" | "local">("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [deploying, setDeploying] = useState(false);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const handleDeploy = async (e: FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) return;
    setDeploying(true);
    try {
      const deployment = await deployFromGithub(githubUrl.trim());
      navigate(`/deployment/${deployment.id}`);
    } catch {
      setDeploying(false);
    }
  };

  return (
    <div className="size-full min-h-screen bg-gray-50">
      {/* Nav */}
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={dployIcon} alt="DPloy" className="w-8 h-8 rounded-lg" />
            <span className="text-xl">DPloy</span>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl mb-2">Add New Deployment</h1>
        <p className="text-gray-600 mb-8">
          Deploy from GitHub or a local project on your computer
        </p>

        <div className="bg-white rounded-lg border p-6 mb-6">
          {/* Type Picker */}
          <label className="block mb-4">
            <span className="text-sm text-gray-700 mb-2 block">Deployment Type</span>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setDeploymentType("github")}
                className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all ${
                  deploymentType === "github"
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Github className="w-8 h-8" />
                <span>GitHub Repository</span>
              </button>
              <button
                onClick={() => setDeploymentType("local")}
                className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all ${
                  deploymentType === "local"
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Folder className="w-8 h-8" />
                <span>Local Project</span>
              </button>
            </div>
          </label>

          {/* GitHub form */}
          {deploymentType === "github" ? (
            <form onSubmit={handleDeploy}>
              <label className="block">
                <span className="text-sm text-gray-700 mb-2 block">GitHub Repository URL</span>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/username/repository"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </form>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 mb-2">
                To deploy a local project, use the DPloy CLI:
              </p>
              <code className="block bg-gray-900 text-white px-4 py-3 rounded text-sm font-mono">
                cd /path/to/your/project<br />
                dploy deploy --key {getApiKey().slice(0, 12)}...
              </code>
              <p className="text-xs text-gray-600 mt-3">
                The CLI will automatically detect your project type and deploy it to a live URL.
              </p>
            </div>
          )}
        </div>

        {deploymentType === "github" && (
          <button
            onClick={handleDeploy as () => void}
            disabled={!githubUrl || deploying}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg transition-colors"
          >
            {deploying ? "Deploying..." : "Deploy Project"}
          </button>
        )}
      </div>
    </div>
  );
}
