const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Flow {
  name: string;
  version: string;
}

export interface RunResult {
  run_id: string;
  status: "completed" | "failed" | "paused";
  output: Record<string, unknown>;
  duration_ms: number;
  error: string | null;
}

export interface HealthStatus {
  status: string;
}

export async function fetchFlows(): Promise<Flow[]> {
  const res = await fetch(`${API_BASE}/flows`);
  const data = await res.json();
  return data.flows;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/healthcheck`);
  return res.json();
}

export async function invokeFlow(
  name: string,
  input: Record<string, unknown>
): Promise<RunResult> {
  const res = await fetch(`${API_BASE}/flow/${name}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export interface RunSummary {
  run_id: string;
  flow_name: string;
  flow_version: string;
  user_id: string;
  status: string;
  duration_ms: number;
  error: string | null;
  prospect_name: string;
  company_name: string;
  started_at: string;
  completed_at: string;
}

export interface RunDetail extends RunSummary {
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  node_timings: Record<string, { status: string }>;
}

export async function fetchRuns(
  flowName?: string,
  limit = 50,
  offset = 0
): Promise<{ runs: RunSummary[]; total: number }> {
  const params = new URLSearchParams();
  if (flowName) params.set("flow_name", flowName);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const res = await fetch(`${API_BASE}/runs?${params}`);
  return res.json();
}

export async function fetchRunDetail(runId: string): Promise<RunDetail | null> {
  const res = await fetch(`${API_BASE}/runs/${runId}`);
  const data = await res.json();
  return data.run || null;
}

export async function streamFlow(
  name: string,
  input: Record<string, unknown>,
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}/flow/${name}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.replace(/^data: /, "").trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed));
      } catch {
        // skip non-JSON lines
      }
    }
  }
}
