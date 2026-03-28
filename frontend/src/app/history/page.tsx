"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MetricCard from "@/components/MetricCard";
import { fetchRuns, fetchRunDetail, type RunSummary, type RunDetail } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = (ms / 1000).toFixed(1);
  return `${secs}s`;
}

function flowLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_COLORS: Record<string, string> = {
  completed: "text-success bg-success/15",
  failed: "text-error bg-error/15",
  paused: "text-warning bg-warning/15",
};

// ── Node Timings Badge ───────────────────────────────────────────────────────

function NodeBadge({ nodeId, status }: { nodeId: string; status: string }) {
  const colors: Record<string, string> = {
    ok: "bg-success/20 text-success",
    skipped: "bg-warning/20 text-warning",
    error: "bg-error/20 text-error",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${colors[status] || "bg-card-border text-muted"}`}>
      {status === "ok" && <span>&#10003;</span>}
      {status === "error" && <span>&#10007;</span>}
      {status === "skipped" && <span>&#9888;</span>}
      {nodeId.replace(/_/g, " ")}
    </span>
  );
}

// ── Run Detail Panel ─────────────────────────────────────────────────────────

function RunDetailPanel({ run, onClose }: { run: RunDetail; onClose: () => void }) {
  const output = (run.output_data || {}) as Record<string, unknown>;
  const input = (run.input_data || {}) as Record<string, string>;
  const nodes = (run.node_timings || {}) as any;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const liParsed = (output.linkedin_parsed || {}) as any;
  const coParsed = (output.company_parsed || {}) as any;
  const actParsed = (output.activity_parsed || {}) as any;
  const emailDrafts = (output.email_drafts || output.emails || []) as any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-card border border-card-border rounded-2xl shadow-2xl w-[90vw] max-w-5xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
          <div>
            <h2 className="text-lg font-bold">{run.prospect_name || run.run_id.slice(0, 8)}</h2>
            <p className="text-xs text-muted mt-0.5">
              {flowLabel(run.flow_name)} &middot; {fmtDate(run.completed_at)} &middot; {fmtDuration(run.duration_ms)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none px-2">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <Section title="Input">
            <div className="grid grid-cols-2 gap-3">
              {input.linkedin_url && <KV label="LinkedIn URL" value={String(input.linkedin_url)} />}
              {input.company_website && <KV label="Company Website" value={String(input.company_website)} />}
              {input.sender_name && <KV label="Sender" value={String(input.sender_name)} />}
              {input.sender_company && <KV label="Sender Company" value={String(input.sender_company)} />}
            </div>
          </Section>

          {Object.keys(nodes).length > 0 && (
            <Section title="Agent Pipeline">
              <div className="flex flex-wrap gap-2">
                {Object.entries(nodes).map(([nodeId, info]: [string, any]) => (
                  <NodeBadge key={nodeId} nodeId={nodeId} status={info?.status || "ok"} />
                ))}
              </div>
            </Section>
          )}

          {Object.keys(liParsed).length > 0 && (
            <Section title="Prospect Profile">
              <div className="grid grid-cols-2 gap-3">
                {liParsed.name && <KV label="Name" value={String(liParsed.name)} />}
                {liParsed.title && <KV label="Title" value={String(liParsed.title)} />}
                {liParsed.company && <KV label="Company" value={String(liParsed.company)} />}
                {liParsed.location && <KV label="Location" value={String(liParsed.location)} />}
              </div>
              {liParsed.about && (
                <p className="text-xs text-muted mt-3 leading-relaxed">{String(liParsed.about).slice(0, 300)}</p>
              )}
              {Array.isArray(liParsed.skills) && liParsed.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {liParsed.skills.slice(0, 10).map((s: string) => (
                    <span key={s} className="px-2 py-0.5 rounded bg-accent-soft text-accent-dim text-[10px] font-medium">{s}</span>
                  ))}
                </div>
              )}
            </Section>
          )}

          {Object.keys(coParsed).length > 0 && (
            <Section title="Company Intelligence">
              <div className="grid grid-cols-2 gap-3">
                {coParsed.name && <KV label="Company" value={String(coParsed.name)} />}
                {coParsed.industry && <KV label="Industry" value={String(coParsed.industry)} />}
                {coParsed.size && <KV label="Size" value={String(coParsed.size)} />}
                {coParsed.stage && <KV label="Stage" value={String(coParsed.stage)} />}
                {coParsed.funding && <KV label="Funding" value={String(coParsed.funding)} />}
                {coParsed.headquarters && <KV label="HQ" value={String(coParsed.headquarters)} />}
              </div>
              {Array.isArray(coParsed.pain_points) && coParsed.pain_points.length > 0 && (
                <div className="mt-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted font-bold">Pain Points</span>
                  <ul className="mt-1 space-y-1">
                    {coParsed.pain_points.slice(0, 5).map((p: string, i: number) => (
                      <li key={i} className="text-xs text-foreground/70 flex gap-2">
                        <span className="text-warning">&#8226;</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {Object.keys(actParsed).length > 0 && (
            <Section title="Activity Analysis">
              <div className="grid grid-cols-2 gap-3">
                {Array.isArray(actParsed.topics) && <KV label="Topics" value={actParsed.topics.join(", ")} />}
                {actParsed.communication_dna?.writing_style && (
                  <KV label="Writing Style" value={actParsed.communication_dna.writing_style} />
                )}
                {actParsed.communication_dna?.tone && (
                  <KV label="Tone" value={actParsed.communication_dna.tone} />
                )}
              </div>
            </Section>
          )}

          {emailDrafts.length > 0 && (
            <Section title="Generated Emails">
              <div className="space-y-3">
                {emailDrafts.map((draft: any, i: number) => (
                  <div key={i} className="rounded-lg border border-card-border bg-surface-low p-4">
                    <p className="text-xs font-semibold text-accent-dim mb-1">{String(draft.subject || draft.variant || `Variant ${i + 1}`)}</p>
                    <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed">{String(draft.body || draft.content || "")}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {run.error && (
            <Section title="Error">
              <pre className="text-xs text-error bg-error/10 rounded-lg p-3 overflow-x-auto">{run.error}</pre>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-muted font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
      <p className="text-sm text-foreground/90 mt-0.5 truncate">{value}</p>
    </div>
  );
}

// ── Memory Chat Widget ───────────────────────────────────────────────────────

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const CHAT_SUGGESTIONS = [
  "What do you know about the last prospect I researched?",
  "Compare the pain points across all companies",
  "Which prospect has the strongest buying signals?",
  "What industries have I targeted so far?",
  "Summarize everything you know about [company name]",
  "What communication styles have you seen?",
];

function MemoryChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;

      const userMsg: ChatMsg = { role: "user", content: question };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch(`${API}/chat/memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") break;

            try {
              const parsed = JSON.parse(raw);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.token) {
                accumulated += parsed.token;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: accumulated,
                    streaming: true,
                  };
                  return updated;
                });
              }
            } catch {
              // malformed SSE line
            }
          }
        }

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: accumulated,
            streaming: false,
          };
          return updated;
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Something went wrong. Please try again.",
            streaming: false,
          };
          return updated;
        });
      } finally {
        setLoading(false);
      }
    },
    [loading, messages],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const isEmpty = messages.length === 0;

  // Render [Memory: X] as badges
  function renderContent(text: string) {
    const parts = text.split(/(\[Memory:[^\]]+\])/g);
    return parts.map((part, i) => {
      if (part.startsWith("[Memory:")) {
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary/10 text-secondary border border-secondary/20 whitespace-nowrap"
          >
            <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            {part.slice(1, -1)}
          </span>
        );
      }
      return (
        <span key={i}>
          {part.split("\n").map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ))}
        </span>
      );
    });
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          open
            ? "bg-card-border text-muted rotate-0"
            : "bg-accent text-white hover:scale-105 hover:shadow-accent/30"
        }`}
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      <div
        className={`fixed bottom-24 right-6 z-40 w-[420px] max-h-[600px] flex flex-col rounded-2xl border border-card-border bg-background shadow-2xl transition-all duration-300 origin-bottom-right ${
          open ? "scale-100 opacity-100 pointer-events-auto" : "scale-90 opacity-0 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-card-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Memory Chat</h3>
              <p className="text-[10px] text-muted">Ask anything about past research &middot; Powered by Nester</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0" style={{ maxHeight: "400px" }}>
          {isEmpty && (
            <div className="space-y-4">
              <div className="rounded-xl bg-accent/8 border border-accent/20 p-4">
                <p className="text-xs text-foreground/80 leading-relaxed">
                  I have access to all memories from your pipeline runs — prospect profiles,
                  company intelligence, activity analysis, pain points, and more. Ask me anything.
                </p>
              </div>

              <div>
                <p className="text-[10px] text-muted mb-2 uppercase tracking-wider font-medium">Try asking</p>
                <div className="space-y-1.5">
                  {CHAT_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg border border-card-border text-foreground/75 hover:text-foreground hover:border-accent/40 hover:bg-accent/5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                  msg.role === "user"
                    ? "bg-accent text-white"
                    : "bg-secondary/20 text-secondary"
                }`}
              >
                {msg.role === "user" ? "U" : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                )}
              </div>

              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent text-white rounded-tr-sm"
                    : "bg-card border border-card-border text-foreground/90 rounded-tl-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  <>
                    {renderContent(msg.content)}
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-3.5 bg-secondary/60 ml-0.5 animate-pulse rounded-sm" />
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-card-border px-4 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about prospects, companies, insights..."
              disabled={loading}
              className="flex-1 text-xs bg-card border border-card-border rounded-lg px-3 py-2.5 text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 w-8 h-8 rounded-lg bg-accent flex items-center justify-center disabled:opacity-40 hover:bg-accent/90 transition-colors"
            >
              {loading ? (
                <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </form>

          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="mt-2 w-full text-center text-[10px] text-muted hover:text-foreground transition-colors"
            >
              Clear conversation
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const flowName = filter === "all" ? undefined : filter;
      const data = await fetchRuns(flowName, 100);
      setRuns(data.runs || []);
      setTotal(data.total || 0);
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  async function openDetail(runId: string) {
    setLoadingDetail(true);
    try {
      const detail = await fetchRunDetail(runId);
      if (detail) setSelectedRun(detail);
    } finally {
      setLoadingDetail(false);
    }
  }

  const completedCount = runs.filter((r) => r.status === "completed").length;
  const failedCount = runs.filter((r) => r.status === "failed").length;
  const avgDuration = runs.length > 0
    ? Math.round(runs.reduce((s, r) => s + r.duration_ms, 0) / runs.length)
    : 0;

  const uniqueFlows = [...new Set(runs.map((r) => r.flow_name))];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Run History</h1>
        <p className="text-muted text-sm">All pipeline executions with full data</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Runs" value={total} sub="All time" />
        <MetricCard label="Completed" value={completedCount} sub={`${failedCount} failed`} />
        <MetricCard label="Avg Duration" value={fmtDuration(avgDuration)} sub="Per pipeline" />
        <MetricCard label="Flows" value={uniqueFlows.length} sub={uniqueFlows.join(", ") || "None"} />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "all" ? "bg-accent/20 text-accent" : "bg-card text-muted hover:text-foreground"}`}
        >
          All
        </button>
        {uniqueFlows.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-accent/20 text-accent" : "bg-card text-muted hover:text-foreground"}`}
          >
            {flowLabel(f)}
          </button>
        ))}
      </div>

      {/* Runs Table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-20 text-muted">
          <div className="text-4xl mb-3 opacity-30">&#128203;</div>
          <p className="text-sm">No pipeline runs yet.</p>
          <p className="text-xs mt-1">Run a pipeline from Outreach to see history here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_1fr_120px_100px_100px_80px] gap-4 px-4 py-2 text-[10px] uppercase tracking-wider text-muted font-bold">
            <span>Prospect</span>
            <span>Company</span>
            <span>Flow</span>
            <span>Duration</span>
            <span>Time</span>
            <span>Status</span>
          </div>

          {runs.map((run) => (
            <button
              key={run.run_id}
              onClick={() => openDetail(run.run_id)}
              className="w-full grid grid-cols-[1fr_1fr_120px_100px_100px_80px] gap-4 items-center px-4 py-3 rounded-xl border border-card-border bg-card hover:border-accent/30 hover:bg-card/80 transition-all text-left group"
            >
              <div className="truncate">
                <span className="text-sm font-medium group-hover:text-accent-dim transition-colors">
                  {run.prospect_name || run.run_id.slice(0, 8)}
                </span>
              </div>
              <div className="truncate text-sm text-muted">
                {run.company_name || "-"}
              </div>
              <div className="text-xs text-muted font-mono">
                {flowLabel(run.flow_name).slice(0, 15)}
              </div>
              <div className="text-xs font-mono text-foreground/70">
                {fmtDuration(run.duration_ms)}
              </div>
              <div className="text-xs text-muted" title={fmtDate(run.completed_at)}>
                {timeAgo(run.completed_at)}
              </div>
              <div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[run.status] || "bg-card-border text-muted"}`}>
                  {run.status === "completed" && <span>&#10003;</span>}
                  {run.status === "failed" && <span>&#10007;</span>}
                  {run.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Loading indicator for detail fetch */}
      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl px-6 py-4 border border-card-border">
            <span className="text-sm text-muted">Loading run details...</span>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedRun && (
        <RunDetailPanel run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}

      {/* Memory Chat Widget */}
      <MemoryChatWidget />
    </div>
  );
}
