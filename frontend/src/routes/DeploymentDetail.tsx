import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router";
import { ArrowLeft, Copy, ExternalLink, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import dployIcon from "../dployIcon.png";
import { useAuth } from "../lib/AuthContext";
import { getDeployment, type Deployment } from "../lib/api";

export default function DeploymentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id || !user) return;

    getDeployment(id).then((d) => {
      if (d) setDeployment(d);
      else setNotFound(true);
    });

    // Poll while building
    const interval = setInterval(async () => {
      const d = await getDeployment(id);
      if (d) {
        setDeployment({ ...d });
        if (d.status === "Running" || d.status === "Failed") {
          clearInterval(interval);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/" />;

  if (notFound) {
    return (
      <div className="size-full min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Deployment not found</h2>
          <button
            onClick={() => navigate("/dashboard")}
            className="text-indigo-600 hover:text-indigo-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className="size-full min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const copyUrl = () => {
    if (deployment.url) {
      navigator.clipboard.writeText(deployment.url);
      toast.success("URL copied to clipboard");
    }
  };

  const shareViaEmail = () => {
    if (deployment.url) {
      window.open(
        `mailto:?subject=Check out my deployment&body=I deployed ${deployment.name} on DPloy: ${deployment.url}`
      );
    }
  };

  const shareViaiMessage = () => {
    toast.info("iMessage sharing would open on macOS/iOS");
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

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl">{deployment.name}</h1>
            <span
              className={`px-3 py-1 rounded text-sm ${
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
          <p className="text-gray-600">
            {deployment.type === "github" ? (
              deployment.source
            ) : (
              <span className="italic">{deployment.source}</span>
            )}
          </p>
        </div>

        {/* Live URL section */}
        {deployment.status === "Running" && deployment.url && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-2 mb-4 text-green-800">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Your app is live!</span>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-700 mb-1">Live URL</div>
              <div className="flex items-center gap-3">
                <a
                  href={deployment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-white px-4 py-3 rounded border border-gray-200 text-indigo-600 hover:text-indigo-700 flex items-center gap-2"
                >
                  {deployment.url}
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={copyUrl}
                  className="bg-white hover:bg-gray-50 border border-gray-200 px-4 py-3 rounded flex items-center gap-2 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy URL
                </button>
              </div>
            </div>

            {deployment.port && (
              <div className="mb-4">
                <div className="text-sm text-gray-700 mb-1">Port</div>
                <div className="bg-white px-4 py-2 rounded border border-gray-200 inline-block">
                  {deployment.port}
                </div>
              </div>
            )}

            <div>
              <div className="text-sm text-gray-700 mb-2">Share</div>
              <div className="flex gap-2">
                <button
                  onClick={shareViaEmail}
                  className="bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Email
                </button>
                <button
                  onClick={shareViaiMessage}
                  className="bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded flex items-center gap-2 text-sm transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  iMessage
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Build Logs */}
        <div className="bg-white rounded-lg border">
          <div className="border-b px-6 py-4">
            <h3 className="text-lg">Build Logs</h3>
          </div>
          <div className="p-6">
            <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm overflow-auto max-h-96">
              {deployment.logs.map((log, index) => (
                <div key={index} className="mb-1">
                  <span className="text-gray-500">[{log.time}]</span> {log.message}
                </div>
              ))}
              {deployment.status === "Building" && (
                <div className="mb-1 animate-pulse text-yellow-400">
                  <span className="text-gray-500">[...]</span> Building...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
