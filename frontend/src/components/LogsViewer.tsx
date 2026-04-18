import { useEffect, useRef } from "react";

export default function LogsViewer({ logs }: { logs: string }) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900/50">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        <span className="ml-2 text-xs text-gray-500 font-mono">logs</span>
      </div>
      <pre
        ref={ref}
        className="p-4 text-sm font-mono text-gray-300 overflow-auto max-h-80 leading-relaxed whitespace-pre-wrap"
      >
        {logs || "No logs yet..."}
      </pre>
    </div>
  );
}
