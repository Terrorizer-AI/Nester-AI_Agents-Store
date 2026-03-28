"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import EmailPreview from "@/components/EmailPreview";
import PersonaCard from "@/components/PersonaCard";
import AnalysisPanel from "@/components/AnalysisPanel";
import CompanyDashboard from "@/components/CompanyDashboard";
import ResearchChatDrawer from "@/components/ResearchChatDrawer";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROFILE_KEY = "nester_sender_profile";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentStep {
  id: string;
  label: string;
  status: "idle" | "running" | "completed" | "failed";
  parallel?: boolean;
  durationMs?: number;
}

interface SenderProfile {
  sender_name: string;
  sender_company: string;
  sender_role: string;
  services: string;
  value_proposition: string;
  target_pain_points: string;
  ideal_outcome: string;
  case_studies: string;
  email_tone: string;
  cta_preference: string;
}

interface SalesForm extends SenderProfile {
  linkedin_url: string;
  company_website: string;
  company_linkedin_url: string;
}

// ── Pipeline config ───────────────────────────────────────────────────────────

const PIPELINE_STAGES: AgentStep[] = [
  { id: "linkedin_researcher",        label: "LinkedIn",        status: "idle" },
  { id: "company_researcher",         label: "Company",         status: "idle", parallel: true },
  { id: "company_linkedin_researcher",label: "Co. LinkedIn",    status: "idle", parallel: true },
  { id: "activity_analyzer",          label: "User LinkedIn",   status: "idle", parallel: true },
  { id: "persona_builder",            label: "Persona",         status: "idle" },
  { id: "service_matcher",            label: "Service Match",   status: "idle" },
  { id: "email_composer",             label: "Email Compose",   status: "idle" },
  { id: "output_formatter",           label: "Formatter",       status: "idle" },
];

const BLANK_PROFILE: SenderProfile = {
  sender_name: "", sender_company: "", sender_role: "", services: "",
  value_proposition: "", target_pain_points: "", ideal_outcome: "",
  case_studies: "", email_tone: "professional", cta_preference: "soft",
};

// ── Profile persistence ───────────────────────────────────────────────────────

function loadSavedProfile(): SenderProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as SenderProfile) : null;
  } catch { return null; }
}

function saveProfile(p: SenderProfile): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* noop */ }
}

function extractProfile(f: SalesForm): SenderProfile {
  const { linkedin_url, company_website, company_linkedin_url, ...profile } = f;
  void linkedin_url; void company_website; void company_linkedin_url;
  return profile;
}

// ── Pipeline Timeline ─────────────────────────────────────────────────────────

function AgentNode({ step, index }: { step: AgentStep; index: number }) {
  const isDone = step.status === "completed";
  const isRunning = step.status === "running";
  const isFailed = step.status === "failed";

  return (
    <div className="flex flex-col items-center gap-1.5 group/node relative px-3">
      {/* Node orb */}
      <div className={`relative flex items-center justify-center rounded-full border transition-all duration-500 ${
        isDone
          ? "w-8 h-8 bg-secondary border-secondary/30 shadow-[0_0_12px_rgba(78,222,163,0.5)]"
          : isRunning
          ? "w-9 h-9 bg-accent border-accent/50 shadow-[0_0_18px_rgba(128,131,255,0.6)] animate-pulse"
          : isFailed
          ? "w-8 h-8 bg-error/20 border-error/40"
          : "w-8 h-8 bg-surface-high border-outline/20"
      }`}>
        {isDone ? (
          <svg className="w-3.5 h-3.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : isRunning ? (
          <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : isFailed ? (
          <span className="text-error text-[10px] font-black">✕</span>
        ) : (
          <span className={`text-[10px] font-black ${isDone ? "text-background" : "text-muted/50"}`}>{index + 1}</span>
        )}
      </div>

      {/* Label */}
      <div className="text-center min-w-0">
        <span className={`block text-[0.5rem] uppercase tracking-wider font-bold whitespace-nowrap ${
          isDone ? "text-secondary" : isRunning ? "text-accent" : "text-muted/40"
        }`}>
          {step.label}
        </span>
        <span className={`block text-[0.42rem] font-mono mt-0.5 ${
          isDone ? "text-secondary/50" : isRunning ? "text-accent/60 animate-pulse" : "text-muted/25"
        }`}>
          {isDone && step.durationMs ? `${(step.durationMs/1000).toFixed(1)}s` : isRunning ? "RUNNING" : "STANDBY"}
        </span>
      </div>

      {/* Hover tooltip */}
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-card border border-outline/30 rounded-lg px-3 py-2 text-[10px] whitespace-nowrap opacity-0 group-hover/node:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
        <span className="font-bold text-foreground block">{step.label}</span>
        <span className={`font-mono text-[9px] ${isDone ? "text-secondary" : isRunning ? "text-accent" : "text-muted"}`}>
          {isDone ? `✓ done` : isRunning ? "● running" : "○ pending"}
        </span>
      </div>
    </div>
  );
}

function Wire({ active }: { active: boolean }) {
  return (
    <div className={`h-px w-5 flex-shrink-0 transition-all duration-500 self-start mt-4 ${
      active ? "bg-secondary/70" : ""
    }`}
      style={active ? {} : {
        backgroundImage: "repeating-linear-gradient(90deg,#464554 0,#464554 3px,transparent 3px,transparent 7px)"
      }}
    />
  );
}

// ── Architecture node card ────────────────────────────────────────────────────

function ArchNode({
  step, index, role, desc, outputs,
}: {
  step: AgentStep; index: number; role: string; desc: string; outputs: string[];
}) {
  const isDone    = step.status === "completed";
  const isRunning = step.status === "running";
  const isFailed  = step.status === "failed";

  const borderColor = isDone
    ? "border-secondary/40 shadow-[0_0_14px_rgba(78,222,163,0.18)]"
    : isRunning
    ? "border-accent/50 shadow-[0_0_18px_rgba(128,131,255,0.3)] animate-pulse"
    : isFailed
    ? "border-error/30"
    : "border-outline/20";

  const dotColor = isDone ? "bg-secondary" : isRunning ? "bg-accent animate-pulse" : "bg-outline/30";

  return (
    <div className={`relative rounded-xl border bg-card/70 backdrop-blur-sm px-4 py-3 w-44 transition-all duration-500 ${borderColor}`}>
      {/* Index badge */}
      <div className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-surface-high border border-outline/30 flex items-center justify-center">
        <span className="text-[0.45rem] font-black text-muted">{index}</span>
      </div>
      {/* Status dot */}
      <div className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-2 border-background ${dotColor}`} />

      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`text-[0.6rem] font-black uppercase tracking-wider truncate ${
          isDone ? "text-secondary" : isRunning ? "text-accent" : "text-muted/60"
        }`}>{step.label}</span>
      </div>

      <div className={`text-[0.5rem] font-bold uppercase tracking-widest mb-1 ${
        isDone ? "text-secondary/50" : "text-muted/30"
      }`}>{role}</div>

      <p className="text-[0.5rem] text-muted/50 leading-relaxed mb-2">{desc}</p>

      {/* Outputs */}
      <div className="flex flex-wrap gap-1">
        {outputs.map(o => (
          <span key={o} className={`text-[0.42rem] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
            isDone ? "bg-secondary/10 text-secondary/70" : "bg-surface-high text-muted/40"
          }`}>{o}</span>
        ))}
      </div>

      {/* Timing */}
      {isDone && step.durationMs && (
        <div className="mt-2 pt-2 border-t border-outline/10 text-[0.45rem] font-mono text-secondary/50">
          ✓ {(step.durationMs / 1000).toFixed(1)}s
        </div>
      )}
      {isRunning && (
        <div className="mt-2 pt-2 border-t border-outline/10 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      )}
    </div>
  );
}

// ── Vertical arrow connector ──────────────────────────────────────────────────

function VArrow({ active, label }: { active: boolean; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-0 py-1">
      {label && (
        <span className={`text-[0.4rem] uppercase tracking-widest font-bold mb-0.5 ${active ? "text-secondary/60" : "text-muted/20"}`}>
          {label}
        </span>
      )}
      <div className={`w-px h-6 transition-colors duration-500 ${active ? "bg-secondary/50" : "bg-outline/15"}`} />
      <svg width="8" height="6" viewBox="0 0 8 6" className={`transition-colors duration-500 ${active ? "text-secondary/50" : "text-outline/15"}`}>
        <path d="M4 6 L0 0 L8 0 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

// ── Horizontal arrow ─────────────────────────────────────────────────────────

function HArrow({ active }: { active: boolean }) {
  return (
    <svg width="32" height="8" viewBox="0 0 32 8" className={`flex-shrink-0 transition-colors duration-500 ${active ? "text-secondary/60" : "text-outline/20"}`}>
      <path d="M0 4 L26 4 M22 0 L26 4 L22 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Stage badge label ─────────────────────────────────────────────────────────

function StageBadge({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <div className="my-1">
      <span className={`text-[0.45rem] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-outline/10 flex items-center gap-1.5 ${
        accent ? "bg-surface-high text-muted/40" : "bg-surface-high text-muted/30"
      }`}>
        {accent && <span className="w-1.5 h-1.5 rounded-full bg-accent/40" />}
        {label}
      </span>
    </div>
  );
}

// ── Mini node (compact card for single-row diagram) ──────────────────────────

function MiniNode({ step, index, label, sub }: { step: AgentStep; index: number; label: string; sub: string }) {
  const isDone    = step.status === "completed";
  const isRunning = step.status === "running";

  return (
    <div className={`relative rounded-lg border px-2.5 py-2 shrink-0 transition-all duration-500 ${
      isDone    ? "border-secondary/40 bg-secondary/5 shadow-[0_0_10px_rgba(78,222,163,0.12)]"
      : isRunning ? "border-accent/50 bg-accent/5 shadow-[0_0_12px_rgba(128,131,255,0.2)] animate-pulse"
      : "border-outline/20 bg-card/50"
    }`} style={{ minWidth: "68px" }}>
      {/* index */}
      <div className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-surface-high border border-outline/30 flex items-center justify-center">
        <span className="text-[0.38rem] font-black text-muted">{index}</span>
      </div>
      {/* status dot */}
      <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-background ${
        isDone ? "bg-secondary" : isRunning ? "bg-accent animate-pulse" : "bg-outline/30"
      }`} />
      <div className={`text-[0.5rem] font-black uppercase tracking-wide truncate ${
        isDone ? "text-secondary" : isRunning ? "text-accent" : "text-muted/50"
      }`}>{label}</div>
      <div className="text-[0.38rem] text-muted/40 truncate">{sub}</div>
      {isDone && step.durationMs ? (
        <div className="text-[0.38rem] font-mono text-secondary/50 mt-0.5">✓ {(step.durationMs/1000).toFixed(1)}s</div>
      ) : isRunning ? (
        <div className="flex gap-0.5 mt-0.5">
          {[0,150,300].map(d => <span key={d} className="w-0.5 h-0.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
        </div>
      ) : null}
    </div>
  );
}

// ── Parallel fork / join SVGs ─────────────────────────────────────────────────

function ParallelFork({ active }: { active: boolean }) {
  const c = active ? "#4edea3" : "rgba(70,69,84,0.25)";
  // From 1 point on left → split to 3 rows (top/mid/bot) on right
  return (
    <svg width="20" height="90" viewBox="0 0 20 90" className="transition-all duration-500 shrink-0">
      <line x1="0" y1="45" x2="10" y2="45" stroke={c} strokeWidth="1.5"/>
      <line x1="10" y1="15" x2="10" y2="75" stroke={c} strokeWidth="1.5"/>
      <line x1="10" y1="15" x2="20" y2="15" stroke={c} strokeWidth="1.5"/>
      <line x1="10" y1="45" x2="20" y2="45" stroke={c} strokeWidth="1.5"/>
      <line x1="10" y1="75" x2="20" y2="75" stroke={c} strokeWidth="1.5"/>
    </svg>
  );
}

function ParallelJoin({ active }: { active: boolean }) {
  const c = active ? "#4edea3" : "rgba(70,69,84,0.25)";
  return (
    <svg width="20" height="90" viewBox="0 0 20 90" className="transition-all duration-500 shrink-0">
      <line x1="0" y1="15" x2="10" y2="15" stroke={c} strokeWidth="1.5"/>
      <line x1="0" y1="45" x2="10" y2="45" stroke={c} strokeWidth="1.5"/>
      <line x1="0" y1="75" x2="10" y2="75" stroke={c} strokeWidth="1.5"/>
      <line x1="10" y1="15" x2="10" y2="75" stroke={c} strokeWidth="1.5"/>
      <line x1="10" y1="45" x2="20" y2="45" stroke={c} strokeWidth="1.5"/>
    </svg>
  );
}

// ── Fan-out / fan-in for parallel block ───────────────────────────────────────

function FanOut({ active }: { active: boolean }) {
  const c = active ? "#4edea3" : "rgba(70,69,84,0.3)";
  return (
    <svg width="200" height="28" viewBox="0 0 200 28" className="transition-all duration-500">
      {/* Vertical stem down */}
      <line x1="100" y1="0" x2="100" y2="12" stroke={c} strokeWidth="1.5" />
      {/* Horizontal bar */}
      <line x1="24" y1="12" x2="176" y2="12" stroke={c} strokeWidth="1.5" />
      {/* Three drops */}
      <line x1="24"  y1="12" x2="24"  y2="28" stroke={c} strokeWidth="1.5" />
      <line x1="100" y1="12" x2="100" y2="28" stroke={c} strokeWidth="1.5" />
      <line x1="176" y1="12" x2="176" y2="28" stroke={c} strokeWidth="1.5" />
    </svg>
  );
}

function FanIn({ active }: { active: boolean }) {
  const c = active ? "#4edea3" : "rgba(70,69,84,0.3)";
  return (
    <svg width="200" height="28" viewBox="0 0 200 28" className="transition-all duration-500">
      {/* Three rises */}
      <line x1="24"  y1="0" x2="24"  y2="16" stroke={c} strokeWidth="1.5" />
      <line x1="100" y1="0" x2="100" y2="16" stroke={c} strokeWidth="1.5" />
      <line x1="176" y1="0" x2="176" y2="16" stroke={c} strokeWidth="1.5" />
      {/* Horizontal bar */}
      <line x1="24" y1="16" x2="176" y2="16" stroke={c} strokeWidth="1.5" />
      {/* Stem up */}
      <line x1="100" y1="16" x2="100" y2="28" stroke={c} strokeWidth="1.5" />
    </svg>
  );
}

function PipelineTimeline({ steps, fullscreen = false }: { steps: AgentStep[]; fullscreen?: boolean }) {
  const linkedin   = steps[0];
  const company    = steps[1];
  const coLinkedin = steps[2];
  const activity   = steps[3];
  const persona    = steps[4];
  const service    = steps[5];
  const email      = steps[6];
  const formatter  = steps[7];

  const completedCount = steps.filter(s => s.status === "completed").length;
  const progress = steps.length ? (completedCount / steps.length) * 100 : 0;
  const isRunning = steps.some(s => s.status === "running");
  const isComplete = steps.every(s => s.status === "completed") && steps.length > 0;
  const totalMs = steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  const linkedinDone    = linkedin?.status === "completed";
  const parallelAllDone = [company, coLinkedin, activity].every(s => s?.status === "completed");
  const personaDone     = persona?.status === "completed";
  const serviceDone     = service?.status === "completed";
  const emailDone       = email?.status === "completed";

  if (fullscreen) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-6 py-4 gap-4">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 shrink-0">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-foreground">Sales Outreach Pipeline</h2>
            <p className="text-[0.48rem] text-muted/50 uppercase tracking-widest">8-Agent Architecture · AI-Driven Personalization</p>
          </div>
          {isRunning && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[0.45rem] font-bold uppercase tracking-widest text-accent">Live · {completedCount}/{steps.length}</span>
            </span>
          )}
          {isComplete && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/10 border border-secondary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              <span className="text-[0.45rem] font-bold uppercase tracking-widest text-secondary">Complete · {(totalMs/1000).toFixed(1)}s</span>
            </span>
          )}
          {!isRunning && !isComplete && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-high border border-outline/20">
              <span className="w-1.5 h-1.5 rounded-full bg-muted/30" />
              <span className="text-[0.45rem] font-bold uppercase tracking-widest text-muted/40">Ready</span>
            </span>
          )}
        </div>

        {/* ── Single-row architecture diagram ── */}
        <div className="flex items-center justify-center gap-0 shrink-0 w-full">

          {/* Input bubble */}
          <div className="rounded-lg border border-dashed border-outline/20 bg-surface-low/30 px-2 py-1.5 text-center shrink-0">
            <div className="text-[0.38rem] font-bold uppercase tracking-widest text-muted/40 mb-0.5">Input</div>
            <div className="text-[0.38rem] text-muted/40 leading-relaxed">
              <div>LinkedIn</div><div>Company</div><div>Seller</div>
            </div>
          </div>

          <HArrow active={true} />

          {/* Stage 1 */}
          {linkedin && <MiniNode step={linkedin} index={1} label="LinkedIn" sub="Profile + Posts" />}

          {/* Parallel fork */}
          <div className="flex flex-col items-center shrink-0 mx-1">
            <ParallelFork active={linkedinDone} />
          </div>

          {/* Stage 2 — stacked parallel */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <div className="text-[0.38rem] font-bold uppercase tracking-widest text-accent/40 text-center mb-0.5">∥ parallel</div>
            {company    && <MiniNode step={company}    index={2} label="Company"    sub="Website scrape" />}
            {coLinkedin && <MiniNode step={coLinkedin} index={3} label="Co.LinkedIn" sub="Team + posts" />}
            {activity   && <MiniNode step={activity}   index={4} label="User LI"    sub="Posts + DNA" />}
          </div>

          {/* Parallel join */}
          <div className="flex flex-col items-center shrink-0 mx-1">
            <ParallelJoin active={parallelAllDone} />
          </div>

          {/* Stage 3a */}
          {persona && <MiniNode step={persona} index={5} label="Persona" sub="Psych profile" />}
          <HArrow active={personaDone} />

          {/* Stage 3b */}
          {service && <MiniNode step={service} index={6} label="Matcher" sub="Service fit" />}
          <HArrow active={serviceDone} />

          {/* Stage 3c */}
          {email && <MiniNode step={email} index={7} label="Email" sub="3 variants" />}
          <HArrow active={emailDone} />

          {/* Stage 4 */}
          {formatter && <MiniNode step={formatter} index={8} label="Formatter" sub="JSON output" />}

          <HArrow active={isComplete} />

          {/* Output bubble */}
          <div className={`rounded-lg border px-2 py-1.5 text-center shrink-0 transition-all duration-500 ${
            isComplete ? "border-secondary/30 bg-secondary/5" : "border-dashed border-outline/20 bg-surface-low/30"
          }`}>
            <div className={`text-[0.38rem] font-bold uppercase tracking-widest mb-0.5 ${isComplete ? "text-secondary/60" : "text-muted/40"}`}>Output</div>
            <div className="text-[0.38rem] text-muted/40 leading-relaxed">
              <div>Emails</div><div>Persona</div><div>Intel</div>
            </div>
          </div>

        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xl shrink-0 flex flex-col gap-1">
          <div className="flex justify-between text-[0.45rem] font-mono text-muted/40">
            <span>{completedCount}/{steps.length} agents</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 bg-outline/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-accent to-secondary rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
        </div>

      </div>
    );
  }

  // ── Compact header bar (shown after pipeline completes) ────────────────────

  const linkedinDone2    = linkedin?.status === "completed";
  const parallelAllDone2 = [company, coLinkedin, activity].every(s => s?.status === "completed");

  return (
    <div className="glass border-b border-outline/10 px-6 py-4 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[0.55rem] font-black uppercase tracking-widest text-muted">Pipeline</span>
          {isRunning && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[0.45rem] font-bold uppercase tracking-widest text-accent">Live</span>
            </span>
          )}
          {isComplete && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/10 border border-secondary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              <span className="text-[0.45rem] font-bold uppercase tracking-widest text-secondary">Complete · {(totalMs/1000).toFixed(1)}s</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isComplete && totalMs > 0 && (
            <div className="text-right">
              <span className="block text-[0.42rem] uppercase tracking-widest text-muted">Time</span>
              <span className="text-xs font-black text-accent font-mono">{(totalMs/1000).toFixed(1)}s</span>
            </div>
          )}
          <div className="text-right">
            <span className="block text-[0.42rem] uppercase tracking-widest text-muted">Progress</span>
            <span className="text-xs font-black text-secondary font-mono">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>

      {/* Timeline — single horizontal row */}
      <div className="flex items-start justify-center overflow-x-auto">
        <div className="flex flex-col items-center" style={{ paddingTop: "13px" }}>
          {linkedin && <AgentNode step={linkedin} index={0} />}
        </div>
        <Wire active={linkedinDone2} />

        <div className="flex flex-col items-center">
          <span className="text-[0.38rem] uppercase tracking-widest text-accent/30 font-bold mb-1 h-3 flex items-center">∥ parallel</span>
          <div className="flex items-start border border-accent/15 rounded-xl bg-surface-low/30 px-1 py-1">
            {[company, coLinkedin, activity].map((step, i) => step && (
              <div key={step.id} className="flex items-start">
                <AgentNode step={step} index={i + 1} />
                {i < 2 && <div className="w-px h-4 bg-outline/20 mt-4 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        <Wire active={parallelAllDone2} />

        {[
          { step: persona,   idx: 4, active: persona?.status === "completed" },
          { step: service,   idx: 5, active: service?.status === "completed" },
          { step: email,     idx: 6, active: email?.status === "completed" },
          { step: formatter, idx: 7, active: false },
        ].map(({ step, idx, active }, pos) => step && (
          <div key={step.id} className="flex items-start">
            <div style={{ paddingTop: "13px" }}>
              <AgentNode step={step} index={idx} />
            </div>
            {pos < 3 && <Wire active={active} />}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-px bg-outline/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-secondary rounded-full transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ── Service Match Dial ────────────────────────────────────────────────────────

function MatchDial({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#4edea3" : score >= 50 ? "#8083ff" : "#ffb95f";

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="transparent" stroke="#2a292f" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={r} fill="transparent"
          stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black tracking-tighter">{score}</span>
        <span className="text-[0.5rem] uppercase tracking-widest text-muted font-bold">match</span>
      </div>
    </div>
  );
}

// ── Left Panel ────────────────────────────────────────────────────────────────

function ServiceTag({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[0.625rem] font-bold uppercase tracking-tight transition-all active:scale-95 ${
        selected
          ? "bg-accent text-white shadow-[0_0_8px_rgba(128,131,255,0.3)]"
          : "bg-surface-high text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

// ── Output Canvas (right side) ────────────────────────────────────────────────

type Tab = "email" | "persona" | "intelligence" | "company" | "raw";

function OutputCanvas({
  output,
  running,
  onVerify,
}: {
  output: Record<string, unknown> | null;
  running: boolean;
  onVerify: () => void;
}) {
  const [tab, setTab] = useState<Tab>("email");

  const tabs: { key: Tab; label: string }[] = [
    { key: "email",        label: "Generated Variants" },
    { key: "persona",      label: "Persona" },
    { key: "intelligence", label: "Intelligence" },
    { key: "company",      label: "Company Research" },
    { key: "raw",          label: "Raw" },
  ];

  if (!output && !running) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-12">
        <div className="w-16 h-16 rounded-2xl bg-surface-high border border-outline/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground/60 mb-1">Canvas is empty</p>
          <p className="text-xs text-muted">Fill in the prospect parameters and run the pipeline</p>
        </div>
        {/* Ghost sections */}
        <div className="w-full max-w-lg space-y-3 mt-4">
          {["Generated Email", "Persona Analysis", "Research Intelligence"].map(s => (
            <div key={s} className="rounded-xl border border-dashed border-outline/20 p-5">
              <div className="text-[0.6rem] uppercase tracking-widest text-muted/30 font-bold">{s}</div>
              <div className="mt-3 space-y-2">
                <div className="h-2 w-3/4 bg-surface-high/50 rounded" />
                <div className="h-2 w-1/2 bg-surface-high/50 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (running && !output) {
    return (
      <div className="flex-1 px-10 py-8 space-y-6 overflow-y-auto">
        {["Research Verification", "Intelligence Cards", "Generated Variants"].map(s => (
          <section key={s} className="animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-muted">{s}</span>
              <div className="h-px flex-1 bg-outline/10" />
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (!output) return null;

  const serviceMatch = output.service_match as Record<string, unknown> | undefined;
  const matchScore = typeof serviceMatch?.match_confidence === "number"
    ? Math.round(serviceMatch.match_confidence * 100)
    : 75;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-10 pt-6 border-b border-outline/10">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-[0.6875rem] font-bold uppercase tracking-widest border-b-2 transition-all ${
              tab === t.key
                ? "border-accent text-accent-dim"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1">
          <button
            onClick={onVerify}
            className="flex items-center gap-1.5 text-[0.625rem] px-3 py-1.5 rounded-full border border-accent/30 text-accent hover:bg-accent/10 font-bold uppercase tracking-widest transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Verify Sources
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-10 py-8 space-y-10 animate-slide-up">

        {/* ── EMAIL TAB ── */}
        {tab === "email" && (
          <>
            {/* Service Alignment + Engagement row */}
            <div className="grid grid-cols-12 gap-5">
              <div className="col-span-4 bg-card rounded-2xl border border-outline/10 p-6 flex flex-col items-center justify-center text-center">
                <MatchDial score={matchScore} />
                <h4 className="font-bold text-xs uppercase tracking-widest mt-3 mb-1">Service Alignment</h4>
                <p className="text-[0.6875rem] text-muted leading-relaxed">
                  {typeof output.primary_hook === "string"
                    ? output.primary_hook.slice(0, 80) + "..."
                    : "Analyzing service fit..."}
                </p>
              </div>
              <div className="col-span-8 bg-surface-low rounded-2xl border border-outline/10 p-6">
                <div className="flex justify-between items-center mb-5">
                  <h4 className="font-bold text-xs uppercase tracking-widest">Engagement Probability</h4>
                  <span className="text-[0.625rem] text-accent font-bold uppercase tracking-wide">AI Model</span>
                </div>
                {[
                  { label: "Direct Email", pct: 82, color: "bg-secondary" },
                  { label: "LinkedIn InMail", pct: 64, color: "bg-accent" },
                  { label: "Phone Follow-up", pct: 12, color: "bg-outline" },
                ].map(row => (
                  <div key={row.label} className="space-y-1.5 mb-4 last:mb-0">
                    <div className="flex justify-between text-[0.625rem] font-bold uppercase tracking-widest">
                      <span className="text-muted">{row.label}</span>
                      <span className={row.pct > 50 ? "text-secondary" : row.pct > 30 ? "text-accent-dim" : "text-muted"}>
                        {row.pct}%
                      </span>
                    </div>
                    <div className="h-1 w-full bg-surface-high rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full transition-all duration-1000`} style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Email drafts */}
            <EmailPreview
              subject={String(output.email_subject || "")}
              body={String(output.email_body || "")}
              approved={Boolean(output.email_approved)}
              personalizationNotes={output.personalization_notes as string | undefined}
              styleMatch={output.style_match as string | undefined}
              qualityScore={output.email_quality_score as number | undefined}
              drafts={Array.isArray(output.email_drafts) ? output.email_drafts as import("@/components/EmailPreview").EmailDraft[] : undefined}
              onVerify={onVerify}
            />
          </>
        )}

        {/* ── PERSONA TAB ── */}
        {tab === "persona" && (
          <PersonaCard
            persona={output.persona as Record<string, unknown> | undefined}
            confidence={output.persona_confidence as number | undefined}
            communicationStyle={output.communication_style as string | undefined}
          />
        )}

        {/* ── INTELLIGENCE TAB ── */}
        {tab === "intelligence" && (
          <AnalysisPanel
            linkedinData={output.linkedin_data as Record<string, unknown> | undefined}
            companyData={output.company_data as Record<string, unknown> | undefined}
            companyLinkedinData={output.company_linkedin_data as Record<string, unknown> | undefined}
            activityData={output.activity_data as Record<string, unknown> | undefined}
            serviceMatch={output.service_match as Record<string, unknown> | undefined}
            primaryHook={output.primary_hook as string | undefined}
            dataQuality={output.linkedin_data_quality as string | undefined}
            linkedinParsed={output.linkedin_parsed as Record<string, unknown> | undefined}
            companyParsed={output.company_parsed as Record<string, unknown> | undefined}
            companyLinkedinParsed={output.company_linkedin_parsed as Record<string, unknown> | undefined}
            activityParsed={output.activity_parsed as Record<string, unknown> | undefined}
          />
        )}

        {/* ── COMPANY TAB ── */}
        {tab === "company" && (
          <CompanyDashboard
            companyParsed={output.company_parsed as Record<string, unknown> | undefined}
            companyLinkedinParsed={output.company_linkedin_parsed as Record<string, unknown> | undefined}
            companyData={output.company_data as Record<string, unknown> | undefined}
          />
        )}

        {/* ── RAW TAB ── */}
        {tab === "raw" && (
          <div className="rounded-xl border border-outline/10 bg-card p-5 overflow-auto max-h-[70vh]">
            <pre className="text-[0.6875rem] font-mono text-muted/80 whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FlowPage() {
  const params = useParams();
  const name = params.name as string;
  const isSales = name === "sales_outreach";

  const [salesForm, setSalesForm] = useState<SalesForm>({
    linkedin_url: "", company_website: "", company_linkedin_url: "",
    ...BLANK_PROFILE,
  });

  const [savedProfile, setSavedProfile] = useState<SenderProfile | null>(null);
  const [profileMode, setProfileMode] = useState<"saved" | "editing" | "new">("new");
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Tag-style service input
  const [serviceInput, setServiceInput] = useState("");
  const [serviceTags, setServiceTags] = useState<string[]>([]);

  const [agents, setAgents] = useState<AgentStep[]>(PIPELINE_STAGES.map(a => ({ ...a })));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [runMeta, setRunMeta] = useState<{ duration_ms: number } | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [pipelineCollapsed, setPipelineCollapsed] = useState(false);

  // Load saved profile on mount
  useEffect(() => {
    const p = loadSavedProfile();
    if (p) {
      setSavedProfile(p);
      setSalesForm(prev => ({ ...prev, ...p }));
      setProfileMode("saved");
      if (p.services) setServiceTags(p.services.split(",").map(s => s.trim()).filter(s => s && s !== "[object Object]"));
    }
    setProfileLoaded(true);
  }, []);

  const updateSales = (field: keyof SalesForm, value: string) =>
    setSalesForm(prev => ({ ...prev, [field]: value }));

  const addServiceTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || serviceTags.includes(trimmed)) return;
    const next = [...serviceTags, trimmed];
    setServiceTags(next);
    setSalesForm(prev => ({ ...prev, services: next.join(", ") }));
    setServiceInput("");
  };

  const removeServiceTag = (tag: string) => {
    const next = serviceTags.filter(t => t !== tag);
    setServiceTags(next);
    setSalesForm(prev => ({ ...prev, services: next.join(", ") }));
  };

  const handleSaveProfile = () => {
    const profile = extractProfile(salesForm);
    saveProfile(profile);
    setSavedProfile(profile);
    setProfileMode("saved");
  };

  const handleClearProfile = () => {
    try { localStorage.removeItem(PROFILE_KEY); } catch { /* noop */ }
    setSavedProfile(null);
    setSalesForm(prev => ({ ...prev, ...BLANK_PROFILE }));
    setServiceTags([]);
    setProfileMode("new");
  };

  const runFlow = useCallback(async () => {
    if (isSales) {
      const profile = extractProfile(salesForm);
      saveProfile(profile);
      setSavedProfile(profile);
    }

    setRunning(true);
    setResult(null);
    setRunMeta(null);
    setPipelineCollapsed(false);
    setAgents(PIPELINE_STAGES.map(a => ({ ...a })));

    const stageCount = PIPELINE_STAGES.length;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < stageCount; i++) {
      timers.push(setTimeout(() => {
        setAgents(prev => prev.map((a, idx) => {
          if (idx === i) return { ...a, status: "running" as const };
          if (idx < i) return { ...a, status: "completed" as const, durationMs: 5000 + Math.random() * 5000 };
          return a;
        }));
      }, i * 8000));
    }

    try {
      const input = isSales ? {
        linkedin_url: salesForm.linkedin_url,
        company_website: salesForm.company_website,
        company_linkedin_url: salesForm.company_linkedin_url,
        service_catalog: serviceTags.map(s => ({ name: s })),
        sender_name: salesForm.sender_name,
        sender_company: salesForm.sender_company,
        sender_role: salesForm.sender_role,
        value_proposition: salesForm.value_proposition,
        target_pain_points: salesForm.target_pain_points,
        ideal_outcome: salesForm.ideal_outcome,
        email_tone: salesForm.email_tone,
        case_studies: salesForm.case_studies,
        cta_preference: salesForm.cta_preference,
      } : {};

      const res = await fetch(`${API}/flow/${name}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      timers.forEach(clearTimeout);
      setAgents(prev => prev.map(a => ({
        ...a, status: "completed" as const, durationMs: (data.duration_ms || 60000) / prev.length,
      })));
      setResult(data.output || {});
      setRunMeta({ duration_ms: data.duration_ms });
      // Collapse pipeline after a short pause so user sees "Complete" badge
      setTimeout(() => setPipelineCollapsed(true), 1800);
    } catch {
      timers.forEach(clearTimeout);
      setAgents(prev => prev.map(a =>
        a.status === "running" ? { ...a, status: "failed" as const } : a
      ));
    } finally {
      setRunning(false);
    }
  }, [name, isSales, salesForm, serviceTags]);

  const profileIsComplete = Boolean(salesForm.sender_name && salesForm.sender_company && salesForm.value_proposition);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Left Panel — collapsed strip, expands on hover ─────────────────── */}
      <aside className="group/sidebar relative z-30 flex-shrink-0 w-12 hover:w-[420px] transition-[width] duration-300 ease-in-out bg-surface-low border-r border-outline/10 flex flex-col overflow-hidden">

        {/* Collapsed indicator strip */}
        <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col items-center justify-center gap-4 group-hover/sidebar:opacity-0 transition-opacity duration-200 pointer-events-none">
          <div className="w-1 h-16 rounded-full bg-accent/20" />
          <svg className="w-4 h-4 text-muted/40 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <div className="w-1 h-16 rounded-full bg-accent/20" />
        </div>

        {/* Expanded content */}
        <div className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 delay-100 w-[420px] flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-8 pt-8 pb-6">

          {/* Saved profile identity card */}
          {profileLoaded && savedProfile && profileMode === "saved" && (
            <div
              onClick={() => setProfileMode("editing")}
              className="bg-surface-high/40 border border-outline/20 rounded-xl p-5 flex items-center gap-4 hover:bg-surface-high/60 cursor-pointer group mb-6 transition-all"
            >
              <div className="w-11 h-11 rounded-lg bg-accent/20 border border-accent/20 flex items-center justify-center text-lg font-black text-accent-dim shrink-0">
                {savedProfile.sender_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{savedProfile.sender_name}</p>
                <p className="text-[0.6875rem] text-accent/70 font-bold uppercase tracking-widest truncate">
                  {savedProfile.sender_role} @ {savedProfile.sender_company}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); setProfileMode("editing"); }}
                  className="text-[0.6rem] px-2 py-1 rounded border border-outline/30 text-muted hover:text-foreground transition-colors uppercase tracking-wide font-bold"
                >
                  Edit
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleClearProfile(); }}
                  className="text-[0.6rem] px-2 py-1 rounded border border-error/30 text-error/70 hover:text-error transition-colors uppercase tracking-wide font-bold"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Prospect Parameters */}
          <section className="mb-6">
            <label className="block text-[0.6rem] uppercase tracking-widest text-muted font-bold mb-4">
              Prospect Parameters
            </label>
            <div className="space-y-3">
              <CockpitInput
                placeholder="https://linkedin.com/in/..."
                label="LinkedIn"
                value={salesForm.linkedin_url}
                onChange={v => updateSales("linkedin_url", v)}
              />
              <CockpitInput
                placeholder="https://company.com"
                label="Website"
                value={salesForm.company_website}
                onChange={v => updateSales("company_website", v)}
              />
              <CockpitInput
                placeholder="linkedin.com/company/..."
                label="Co. LinkedIn"
                value={salesForm.company_linkedin_url}
                onChange={v => updateSales("company_linkedin_url", v)}
              />
            </div>
          </section>

          {/* Your Profile */}
          {(profileMode === "editing" || profileMode === "new") && (
            <>
              <section className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-[0.6rem] uppercase tracking-widest text-muted font-bold">
                    Your Profile Context
                  </label>
                  {profileMode === "editing" && (
                    <button
                      onClick={() => setProfileMode("saved")}
                      className="text-[0.6rem] text-muted hover:text-foreground transition-colors uppercase tracking-wide"
                    >
                      ← Back
                    </button>
                  )}
                </div>
                <div className="bg-surface-high/20 rounded-xl p-4 space-y-3">
                  <CockpitInput placeholder="Your Name" label="Name" value={salesForm.sender_name} onChange={v => updateSales("sender_name", v)} />
                  <CockpitInput placeholder="Your Company" label="Company" value={salesForm.sender_company} onChange={v => updateSales("sender_company", v)} />
                  <CockpitInput placeholder="Founder / Sales / CTO" label="Role" value={salesForm.sender_role} onChange={v => updateSales("sender_role", v)} />
                </div>
              </section>

              <section className="mb-6">
                <label className="block text-[0.6rem] uppercase tracking-widest text-muted font-bold mb-4">
                  Service Catalog
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {serviceTags.map(tag => (
                    <ServiceTag
                      key={tag}
                      label={tag}
                      selected
                      onClick={() => removeServiceTag(tag)}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={serviceInput}
                    onChange={e => setServiceInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addServiceTag(serviceInput);
                      }
                    }}
                    placeholder="Add service, press Enter"
                    className="flex-1 bg-surface-high/30 border-none rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                  <button
                    onClick={() => addServiceTag(serviceInput)}
                    className="px-3 py-2 rounded-lg bg-accent/20 text-accent text-xs font-bold hover:bg-accent/30 transition-colors"
                  >
                    +
                  </button>
                </div>
              </section>

              <section className="mb-6">
                <label className="block text-[0.6rem] uppercase tracking-widest text-muted font-bold mb-4">
                  Targeting Brief
                </label>
                <div className="space-y-3">
                  <CockpitTextarea
                    placeholder="Value proposition — what do you offer and why does it matter?"
                    label="Value Prop"
                    value={salesForm.value_proposition}
                    onChange={v => updateSales("value_proposition", v)}
                    rows={3}
                  />
                  <CockpitTextarea
                    placeholder="Pain points you solve"
                    label="Pain Points"
                    value={salesForm.target_pain_points}
                    onChange={v => updateSales("target_pain_points", v)}
                    rows={2}
                  />
                  <CockpitTextarea
                    placeholder="Case studies or social proof"
                    label="Proof"
                    value={salesForm.case_studies}
                    onChange={v => updateSales("case_studies", v)}
                    rows={2}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <CockpitSelect
                      label="Tone"
                      value={salesForm.email_tone}
                      onChange={v => updateSales("email_tone", v)}
                      options={[
                        { value: "professional", label: "Professional" },
                        { value: "casual", label: "Casual" },
                        { value: "technical", label: "Technical" },
                        { value: "founder", label: "Founder" },
                      ]}
                    />
                    <CockpitSelect
                      label="CTA"
                      value={salesForm.cta_preference}
                      onChange={v => updateSales("cta_preference", v)}
                      options={[
                        { value: "soft", label: "Soft" },
                        { value: "direct", label: "Direct" },
                        { value: "question", label: "Question" },
                      ]}
                    />
                  </div>
                </div>
              </section>

              {profileIsComplete && (
                <button
                  onClick={handleSaveProfile}
                  className="w-full py-2 rounded-lg text-[0.625rem] font-bold uppercase tracking-widest border border-accent/30 text-accent hover:bg-accent/10 transition-colors mb-4"
                >
                  {savedProfile ? "Update Profile" : "Save Profile"}
                </button>
              )}
            </>
          )}
        </div>

        {/* Sticky Run Button */}
        <div className="mt-auto px-8 pb-8 pt-4 border-t border-outline/10">
          {runMeta && (
            <div className="flex items-center justify-between mb-3 text-[0.625rem] text-muted">
              <span className="uppercase tracking-widest">Last run</span>
              <span className="font-bold text-secondary">{(runMeta.duration_ms / 1000).toFixed(1)}s</span>
            </div>
          )}
          <button
            onClick={runFlow}
            disabled={running}
            className={`w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
              running
                ? "bg-accent/20 text-accent cursor-wait"
                : "bg-accent text-white hover:bg-accent/90 shadow-[0_0_20px_rgba(128,131,255,0.25)]"
            }`}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Synthesizing...
              </span>
            ) : (
              "Run Pipeline →"
            )}
          </button>
        </div>
        </div>{/* end expanded content */}
      </aside>

      {/* ── Right Output Canvas — full remaining space ─────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">

        {/* ── Phase: idle — full-screen pipeline placeholder ── */}
        {!running && !result && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-12">
            <PipelineTimeline steps={agents} fullscreen />
            {/* Ghost canvas hints below */}
            <div className="w-full max-w-lg space-y-3 mt-2 opacity-40">
              {["Generated Email", "Persona Analysis", "Research Intelligence"].map(s => (
                <div key={s} className="rounded-xl border border-dashed border-outline/20 p-5">
                  <div className="text-[0.6rem] uppercase tracking-widest text-muted/30 font-bold">{s}</div>
                  <div className="mt-3 space-y-2">
                    <div className="h-2 w-3/4 bg-surface-high/50 rounded" />
                    <div className="h-2 w-1/2 bg-surface-high/50 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Phase: running — full-screen pipeline ── */}
        {running && !result && (
          <div className="flex-1 flex flex-col items-center justify-center px-12">
            <PipelineTimeline steps={agents} fullscreen />
          </div>
        )}

        {/* ── Phase: done — pipeline slides out, canvas takes over ── */}
        {result && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Pipeline slides up and disappears */}
            <div
              className="shrink-0 overflow-hidden transition-all duration-700 ease-in-out"
              style={{
                maxHeight: pipelineCollapsed ? "0px" : "120px",
                opacity: pipelineCollapsed ? 0 : 1,
                transform: pipelineCollapsed ? "translateY(-100%)" : "translateY(0)",
              }}
            >
              <PipelineTimeline steps={agents} />
            </div>
            {/* Canvas expands to fill remaining space */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <OutputCanvas output={result} running={false} onVerify={() => setVerifyOpen(true)} />
            </div>
          </div>
        )}
      </div>

      {/* Research Verification Drawer */}
      {result && (
        <ResearchChatDrawer
          open={verifyOpen}
          onClose={() => setVerifyOpen(false)}
          researchContext={result}
        />
      )}
    </div>
  );
}

// ── Cockpit Form Primitives ───────────────────────────────────────────────────

function CockpitInput({
  label, placeholder, value, onChange,
}: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-card/60 border-none rounded-xl px-4 py-3 pr-16 text-xs text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
      />
      <span className="absolute right-3 top-3 text-[0.55rem] text-accent/40 font-bold uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

function CockpitTextarea({
  label, placeholder, value, onChange, rows = 3,
}: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-card/60 border-none rounded-xl px-4 py-3 text-xs text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none transition-all"
      />
      <span className="absolute right-3 top-3 text-[0.55rem] text-accent/40 font-bold uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

function CockpitSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[0.55rem] uppercase tracking-widest text-muted font-bold mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-card/60 border-none rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/30"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
