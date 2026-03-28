"use client";

type Status = "idle" | "running" | "completed" | "failed" | "skipped";

const STATUS_STYLES: Record<Status, string> = {
  idle: "bg-card-border text-muted",
  running: "bg-accent/20 text-accent",
  completed: "bg-success/20 text-success",
  failed: "bg-error/20 text-error",
  skipped: "bg-warning/20 text-warning",
};

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
      )}
      {status === "completed" && <span>&#10003;</span>}
      {status === "failed" && <span>&#10007;</span>}
      {status}
    </span>
  );
}
