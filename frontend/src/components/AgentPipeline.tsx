"use client";

import StatusBadge from "./StatusBadge";

export interface AgentStep {
  id: string;
  name: string;
  model: string;
  status: "idle" | "running" | "completed" | "failed" | "skipped";
  durationMs?: number;
  output?: Record<string, unknown>;
  parallel?: boolean;
}

export default function AgentPipeline({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const isFirstParallel = step.parallel && !steps[i - 1]?.parallel;
        const isLastParallel = step.parallel && !steps[i + 1]?.parallel;
        const isMidParallel = step.parallel && steps[i - 1]?.parallel;

        return (
          <div key={step.id} className="animate-slide-up">
            {/* Parallel group header label */}
            {isFirstParallel && (
              <div className="flex items-center gap-2 ml-7 mb-1 mt-1">
                <div className="h-px flex-1 bg-accent/20" />
                <span className="text-[10px] text-accent font-medium uppercase tracking-wider px-1.5">
                  Parallel
                </span>
                <div className="h-px flex-1 bg-accent/20" />
              </div>
            )}

            <div
              className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-all ${
                step.parallel ? "ml-4 border-l-2 border-l-accent/30" : ""
              } ${
                step.status === "running"
                  ? "border-accent/40 bg-accent/5"
                  : step.status === "completed"
                  ? "border-success/20 bg-success/5"
                  : step.status === "failed"
                  ? "border-error/20 bg-error/5"
                  : step.parallel
                  ? "border-card-border border-l-accent/30 bg-card"
                  : "border-card-border bg-card"
              }`}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-card-border text-xs font-mono text-muted">
                {step.parallel ? "∥" : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{step.name}</div>
                <div className="text-xs text-muted font-mono">{step.model}</div>
              </div>
              <StatusBadge status={step.status} />
              {step.durationMs !== undefined && (
                <span className="text-xs text-muted font-mono w-16 text-right">
                  {(step.durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            {/* Connector line — skip between parallel siblings, show after last parallel */}
            {i < steps.length - 1 && !isMidParallel && !isFirstParallel && (
              <div className={`${step.parallel ? "ml-11" : "ml-7"} h-4 border-l border-card-border`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
