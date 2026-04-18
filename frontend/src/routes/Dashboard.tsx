import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router";
import { Plus, Copy, LogOut } from "lucide-react";
import { toast } from "sonner";
import dployIcon from "../dployIcon.png";
import { useAuth } from "../lib/AuthContext";
import { getDeployments, getApiKey, type Deployment } from "../lib/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout, loading: authLoading } = useAuth();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDeployments().then((d) => {
      setDeployments(d);
      setLoading(false);
    });
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  const apiKey = getApiKey();

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success("API key copied to clipboard");
  };

  const handleSignOut = () => {
    logout();
    navigate("/");
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <img
                src={user.avatar}
                alt="GitHub avatar"
                className="w-8 h-8 rounded-full"
              />
              <span>{user.name}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* API Key Banner */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-6 mb-8 text-white">
          <h3 className="mb-2">Your API key</h3>
          <p className="text-sm text-indigo-100 mb-4">
            Use this with the CLI: <code className="bg-white/20 px-2 py-1 rounded">dploy deploy --key {apiKey.slice(0, 20)}...</code>
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-white/20 px-4 py-2 rounded font-mono text-sm">
              {apiKey}
            </code>
            <button
              onClick={copyApiKey}
              className="bg-white text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded flex items-center gap-2 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy key
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl">Your Deployments</h2>
          <button
            onClick={() => navigate("/add")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Deployment
          </button>
        </div>

        {/* Deployments List */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading deployments...</div>
        ) : deployments.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 mb-4">No deployments yet</p>
            <button
              onClick={() => navigate("/add")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Deploy your first project
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {deployments.map((deployment) => (
              <div
                key={deployment.id}
                onClick={() => navigate(`/deployment/${deployment.id}`)}
                className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg">{deployment.name}</h3>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          deployment.status === "Running"
                            ? "bg-green-100 text-green-700"
                            : deployment.status === "Building"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {deployment.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {deployment.type === "github" ? (
                        <span>{deployment.source}</span>
                      ) : (
                        <span className="italic">{deployment.source}</span>
                      )}
                    </p>
                    {deployment.url && (
                      <a
                        href={deployment.url}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        {deployment.url}
                      </a>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <div>{new Date(deployment.createdAt).toLocaleDateString()}</div>
                    <div className="text-xs">{new Date(deployment.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
