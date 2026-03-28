"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyDashboardProps {
  companyParsed?: Record<string, unknown>;
  companyLinkedinParsed?: Record<string, unknown>;
  companyData?: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function s(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === "string") return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

function toArr(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v))
    return v
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          return (
            s(o, "signal", "description", "text", "name", "feature", "advantage", "title") || JSON.stringify(x)
          );
        }
        return String(x);
      })
      .filter(Boolean);
  if (typeof v === "string") return v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Pill({
  text,
  color = "default",
  size = "sm",
}: {
  text: string;
  color?: "default" | "accent" | "success" | "warning" | "error" | "purple";
  size?: "sm" | "xs";
}) {
  const cls = {
    default: "bg-surface-high/80 text-foreground/70 border-card-border",
    accent: "bg-accent/10 text-accent border-accent/25",
    success: "bg-success/10 text-success border-success/25",
    warning: "bg-warning/10 text-warning border-warning/25",
    error: "bg-error/10 text-error border-error/25",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/25",
  }[color];
  const sz = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center rounded-lg border font-medium ${cls} ${sz}`}>
      {text}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6rem] font-bold uppercase tracking-widest text-muted/70 mb-2.5">
      {children}
    </p>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-card-border rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

// ── Stat Tile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon,
  trend,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  icon?: string;
  trend?: "up" | "down" | "stable";
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col gap-1.5 ${
        accent
          ? "bg-accent/5 border-accent/20"
          : "bg-card border-card-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.6rem] font-bold uppercase tracking-widest text-muted/70">
          {label}
        </span>
        {icon && <span className="text-base opacity-70">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-foreground leading-none tabular-nums">
          {value || "—"}
        </span>
        {trend === "up" && <span className="text-success text-sm font-bold">↑</span>}
        {trend === "down" && <span className="text-error text-sm font-bold">↓</span>}
      </div>
      {sub && <span className="text-[0.6rem] text-muted leading-tight">{sub}</span>}
    </div>
  );
}

// ── Horizontal Bar Chart ──────────────────────────────────────────────────────

function BarRow({
  label,
  value,
  max,
  color,
  suffix = "",
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-foreground/80 truncate max-w-[65%]">{label}</span>
        <span className="text-xs font-mono text-muted">
          {value.toLocaleString()}
          {suffix}
        </span>
      </div>
      <div className="h-2 w-full bg-surface-high rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-1000`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Radar-style score card ────────────────────────────────────────────────────

function ScoreRing({
  score,
  label,
  color,
}: {
  score: number;
  label: string;
  color: string;
}) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-surface-high" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke="currentColor" strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className={color}
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        <text
          x="36" y="36"
          textAnchor="middle" dominantBaseline="middle"
          className="fill-foreground text-[11px] font-bold rotate-90"
          style={{ transform: "rotate(90deg)", transformOrigin: "36px 36px", fontSize: "13px", fontWeight: 700 }}
        >
          {score}
        </text>
      </svg>
      <span className="text-[0.6rem] text-muted text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Growth signal card ────────────────────────────────────────────────────────

function SignalCard({ text, icon = "↑" }: { text: string; icon?: string }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-success/5 border border-success/15">
      <span className="text-success font-bold shrink-0 mt-0.5">{icon}</span>
      <p className="text-sm text-foreground/85 leading-snug">{text}</p>
    </div>
  );
}

// ── News card ─────────────────────────────────────────────────────────────────

function NewsItem({
  title,
  date,
  summary,
}: {
  title: string;
  date?: string;
  summary?: string;
}) {
  return (
    <div className="flex gap-3 p-4 rounded-xl border border-card-border bg-background/60 hover:bg-card transition-colors">
      <div className="w-1 rounded-full bg-accent/40 shrink-0 self-stretch" />
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-semibold text-foreground/90 leading-snug">{title}</p>
        {date && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-surface-high text-muted font-medium">
            {date}
          </span>
        )}
        {summary && <p className="text-xs text-muted leading-relaxed pt-0.5">{summary}</p>}
      </div>
    </div>
  );
}

// ── Person card ───────────────────────────────────────────────────────────────

function PersonCard({
  name,
  title,
  url,
}: {
  name: string;
  title?: string;
  url?: string;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-card-border bg-card hover:border-accent/30 transition-colors">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center text-xs font-bold text-accent shrink-0">
        {initials || "?"}
      </div>
      <div className="min-w-0 flex-1">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-accent hover:underline truncate block"
          >
            {name}
          </a>
        ) : (
          <p className="text-sm font-semibold text-foreground/90 truncate">{name}</p>
        )}
        {title && (
          <p className="text-[11px] text-muted leading-snug truncate mt-0.5">{title}</p>
        )}
      </div>
      {url && (
        <svg className="w-3.5 h-3.5 text-muted/40 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
        </svg>
      )}
    </div>
  );
}

// ── Conclusion / Sales Intelligence Summary ───────────────────────────────────

function SalesConclusion({
  name,
  stage,
  funding,
  painPoints,
  growthSignals,
  hiringSignals,
  products,
  targetMkt,
}: {
  name: string;
  stage: string;
  funding: string;
  painPoints: string[];
  growthSignals: Array<{ signal: string; icon: string }>;
  hiringSignals: string[];
  products: string[];
  targetMkt: string;
}) {
  // Derive sales readiness score
  const scores = {
    growth: Math.min(100, growthSignals.length * 25),
    hiring: Math.min(100, hiringSignals.length * 33),
    budget: funding ? 80 : stage === "series" ? 70 : 40,
    fit: Math.min(100, painPoints.length * 20 + products.length * 10),
  };
  const overall = Math.round(
    (scores.growth + scores.hiring + scores.budget + scores.fit) / 4
  );

  const momentum =
    overall >= 70 ? "High" : overall >= 45 ? "Medium" : "Low";
  const momentumColor =
    overall >= 70
      ? "text-success"
      : overall >= 45
      ? "text-warning"
      : "text-error";

  const hooks = [
    growthSignals[0]?.signal,
    hiringSignals[0],
    funding ? `Recently raised ${funding}` : null,
    painPoints[0] ? `Solving: ${painPoints[0]}` : null,
  ].filter(Boolean) as string[];

  return (
    <Card className="border-accent/20 bg-gradient-to-br from-accent/3 to-transparent">
      <div className="flex items-center justify-between mb-5">
        <div>
          <Label>Sales Intelligence Summary</Label>
          <h3 className="text-base font-bold text-foreground">
            Why reach out to {name} now
          </h3>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-black ${momentumColor}`}>{momentum}</div>
          <div className="text-[10px] text-muted uppercase tracking-widest">Momentum</div>
        </div>
      </div>

      {/* Score rings */}
      <div className="flex items-center justify-around py-4 border-y border-card-border mb-5">
        <ScoreRing score={scores.growth}  label="Growth"  color="text-success" />
        <ScoreRing score={scores.hiring}  label="Hiring"  color="text-warning" />
        <ScoreRing score={scores.budget}  label="Budget"  color="text-accent" />
        <ScoreRing score={scores.fit}     label="Product Fit" color="text-purple-400" />
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border-2 border-accent/30 flex items-center justify-center">
            <span className="text-xl font-black text-accent">{overall}</span>
          </div>
          <span className="text-[0.6rem] text-muted text-center leading-tight">Overall Score</span>
        </div>
      </div>

      {/* Conversation hooks */}
      {hooks.length > 0 && (
        <div>
          <Label>Top Conversation Hooks</Label>
          <div className="space-y-2">
            {hooks.slice(0, 3).map((h, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-background/60 border border-card-border/60">
                <div className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-foreground/85 leading-snug">{h}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {targetMkt && (
        <div className="mt-4 pt-4 border-t border-card-border/50">
          <Label>ICP Match</Label>
          <p className="text-sm text-foreground/75 leading-relaxed">{targetMkt}</p>
        </div>
      )}
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CompanyDashboard({
  companyParsed,
  companyLinkedinParsed,
  companyData,
}: CompanyDashboardProps) {
  const [activeSection, setActiveSection] = useState<"overview" | "product" | "people" | "intel">("overview");

  const cp  = companyParsed        || {};
  const clp = companyLinkedinParsed || {};

  // Core identity
  const name       = s(cp, "name") || s(clp, "name") || "Company";
  const tagline    = s(cp, "tagline") || s(clp, "tagline");
  const mission    = s(cp, "mission");
  const about      = s(cp, "about");
  const industry   = s(cp, "industry") || s(clp, "industry");
  const hq         = s(cp, "headquarters") || s(clp, "headquarters_location");
  const founded    = s(cp, "founded") || s(clp, "founded");
  const size       = s(cp, "size") || s(clp, "employees");
  const stage      = s(cp, "stage");
  const funding    = s(cp, "funding");
  const totalFund  = s(cp, "total_funding_raised");
  const valuation  = s(cp, "valuation");
  const revenue    = s(cp, "revenue_range");
  const followers  = s(clp, "followers");
  const website    = s(cp, "website") || s(asObj(companyData) || {}, "website");
  const targetMkt  = s(cp, "target_market");
  const pricing    = s(cp, "pricing_model");

  // Arrays
  const products        = toArr(cp.products);
  const keyFeatures     = toArr(cp.key_features);
  const integrations    = toArr(cp.integrations);
  const techStack       = toArr(cp.tech_stack);
  const painPoints      = toArr(cp.pain_points);
  const compAdv         = toArr(cp.competitive_advantages);
  const competitors     = toArr(cp.competitors);
  const hiringSignals   = toArr(cp.hiring_signals);
  const socialProof     = toArr(cp.social_proof);
  const specialties     = toArr(clp.specialties);
  const contentThemes   = toArr(clp.content_themes);
  const useCases        = toArr(cp.use_cases);
  const custSegments    = toArr(cp.customer_segments);
  const traction        = toArr(cp.traction_metrics);
  const pricingTiers    = toArr(cp.pricing_tiers);
  const investors       = toArr(cp.investors);

  // Growth signals — handle both string[] and {signal,icon,source}[]
  const rawGS = Array.isArray(cp.growth_signals) ? cp.growth_signals : [];
  const growthSignals = rawGS.map((g) => {
    if (typeof g === "string") return { signal: g, icon: "↑", source: "" };
    const o = asObj(g);
    return {
      signal: o ? s(o, "signal", "description", "text") || JSON.stringify(g) : String(g),
      icon: o ? s(o, "icon") || "↑" : "↑",
      source: o ? s(o, "source") : "",
    };
  });

  // News
  const rawNews = Array.isArray(cp.recent_news) ? cp.recent_news : [];
  const news = rawNews
    .map((n) => {
      const o = asObj(n);
      if (!o) return { title: String(n), date: "", summary: "" };
      return { title: s(o, "title", "headline"), date: s(o, "date"), summary: s(o, "summary", "snippet") };
    })
    .filter((n) => n.title);

  // Key people
  const rawPeople = Array.isArray(clp.key_people) ? clp.key_people : [];
  const people = rawPeople.map((p) => {
    const o = asObj(p);
    if (!o) return { name: String(p), title: "", url: "" };
    return { name: s(o, "name", "full_name"), title: s(o, "title", "role"), url: s(o, "linkedin_url", "url") };
  }).filter((p) => p.name);

  // Recent posts for engagement chart
  const rawPosts = Array.isArray(clp.recent_posts) ? clp.recent_posts : [];
  const posts = rawPosts.map((p) => {
    const o = asObj(p);
    if (!o) return { label: String(p).slice(0, 35), likes: 0 };
    const engObj = asObj(o.engagement_count ?? o.engagement ?? {});
    const likes = engObj
      ? Number(engObj.likes) || Number(engObj.reactions) || 0
      : Number(o.engagement_count) || Number(o.likes) || 0;
    const label = s(o, "topic", "content_snippet", "content").slice(0, 35) || "Post";
    return { label, likes };
  });
  const maxLikes = Math.max(...posts.map((p) => p.likes), 1);

  // Build fallback stat tiles
  const statTiles: Array<{ label: string; value: string; icon: string; trend?: "up" | "down" | "stable"; sub?: string }> = [];
  if (size || s(clp, "exact_employee_count"))
    statTiles.push({ label: "Team Size", value: size || s(clp, "exact_employee_count"), icon: "👥", trend: "up" });
  if (founded)
    statTiles.push({ label: "Founded", value: founded, icon: "📅" });
  if (funding || totalFund)
    statTiles.push({ label: "Funding", value: totalFund || funding, icon: "💰", trend: "up", sub: funding !== totalFund ? funding : undefined });
  if (followers)
    statTiles.push({ label: "LinkedIn", value: followers + " followers", icon: "🔗", trend: "up" });
  if (valuation)
    statTiles.push({ label: "Valuation", value: valuation, icon: "📊" });
  if (revenue)
    statTiles.push({ label: "Revenue", value: revenue, icon: "💵" });
  if (traction.length > 0)
    traction.slice(0, 2).forEach((t) => {
      const parts = t.split(/\s+/);
      statTiles.push({ label: "Traction", value: parts.slice(0, 2).join(" "), icon: "🚀", sub: t, trend: "up" });
    });

  if (name === "Company" && !mission && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-high border border-card-border flex items-center justify-center text-3xl">🏢</div>
        <p className="text-sm font-medium text-muted">No company data yet. Run the pipeline first.</p>
      </div>
    );
  }

  const navItems = [
    { key: "overview", label: "Overview" },
    { key: "product",  label: "Products & Market" },
    { key: "people",   label: "Team & Social" },
    { key: "intel",    label: "Sales Intel" },
  ] as const;

  return (
    <div className="space-y-6">

      {/* ── Hero header ── */}
      <Card className="relative overflow-hidden">
        {/* Background gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent/4 via-transparent to-transparent pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center text-xl font-black text-accent shrink-0">
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-black text-foreground tracking-tight">{name}</h1>
              {tagline && (
                <p className="text-sm text-muted mt-0.5 italic">"{tagline}"</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {industry  && <Pill text={industry}        color="accent" />}
                {stage     && <Pill text={stage}           color="warning" />}
                {hq        && <Pill text={"📍 " + hq}      color="default" />}
                {founded   && <Pill text={"Est. " + founded} color="default" />}
                {pricing   && <Pill text={pricing}         color="purple" size="xs" />}
              </div>
            </div>
          </div>

          {website && (
            <a
              href={website.startsWith("http") ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-accent/30 text-accent hover:bg-accent/10 font-semibold transition-colors"
            >
              Visit Website
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {(mission || about) && (
          <div className="relative mt-4 pt-4 border-t border-card-border/60">
            <Label>Mission & About</Label>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {mission || about}
            </p>
          </div>
        )}
      </Card>

      {/* ── Stat tiles ── */}
      {statTiles.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statTiles.slice(0, 4).map((t, i) => (
            <StatTile
              key={i}
              label={t.label}
              value={t.value}
              icon={t.icon}
              trend={t.trend}
              sub={t.sub}
              accent={i === 0}
            />
          ))}
        </div>
      )}

      {/* ── Section nav ── */}
      <div className="flex gap-1 border-b border-card-border pb-0">
        {navItems.map((n) => (
          <button
            key={n.key}
            onClick={() => setActiveSection(n.key)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 -mb-px transition-all ${
              activeSection === n.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {n.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════ OVERVIEW ══════════════════════════ */}
      {activeSection === "overview" && (
        <div className="space-y-5">

          {/* Growth signals */}
          {growthSignals.length > 0 && (
            <Card>
              <Label>Growth Signals</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {growthSignals.map((g, i) => (
                  <SignalCard key={i} text={g.signal} icon={g.icon || "↑"} />
                ))}
              </div>
            </Card>
          )}

          {/* Traction */}
          {traction.length > 0 && (
            <Card>
              <Label>Traction Metrics</Label>
              <div className="flex flex-wrap gap-2">
                {traction.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-success/5 border border-success/20">
                    <span className="text-success text-sm">🚀</span>
                    <span className="text-sm font-medium text-foreground/85">{t}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Social proof + hiring in a row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {socialProof.length > 0 && (
              <Card>
                <Label>Social Proof</Label>
                <div className="space-y-2">
                  {socialProof.map((sp, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="text-warning shrink-0 mt-0.5">★</span>
                      <span className="text-foreground/80">{sp}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {hiringSignals.length > 0 && (
              <Card>
                <Label>Hiring Signals</Label>
                <div className="space-y-2">
                  {hiringSignals.map((h, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="text-accent shrink-0 mt-0.5">◈</span>
                      <span className="text-foreground/80">{h}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Investors + recent news */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {investors.length > 0 && (
              <Card>
                <Label>Investors</Label>
                <div className="flex flex-wrap gap-1.5">
                  {investors.map((inv) => <Pill key={inv} text={inv} color="purple" />)}
                </div>
              </Card>
            )}

            {news.length > 0 && (
              <Card>
                <Label>Recent News</Label>
                <div className="space-y-2">
                  {news.map((n, i) => <NewsItem key={i} title={n.title} date={n.date} summary={n.summary} />)}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ PRODUCT & MARKET ═════════════════════ */}
      {activeSection === "product" && (
        <div className="space-y-5">

          {/* Products */}
          {products.length > 0 && (
            <Card>
              <Label>Products & Services</Label>
              <div className="space-y-2">
                {products.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-high/50 border border-card-border/60">
                    <div className="w-6 h-6 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-bold text-accent shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <p className="text-sm text-foreground/85 leading-snug">{p}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Key features */}
            {keyFeatures.length > 0 && (
              <Card>
                <Label>Key Features</Label>
                <ul className="space-y-2">
                  {keyFeatures.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-accent mt-0.5 shrink-0">✦</span>
                      <span className="text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Use cases */}
            {useCases.length > 0 && (
              <Card>
                <Label>Use Cases</Label>
                <ul className="space-y-2">
                  {useCases.map((u, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-success mt-0.5 shrink-0">▸</span>
                      <span className="text-foreground/80">{u}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Tech stack */}
            {techStack.length > 0 && (
              <Card>
                <Label>Tech Stack</Label>
                <div className="flex flex-wrap gap-1.5">
                  {techStack.map((t) => <Pill key={t} text={t} color="accent" />)}
                </div>
              </Card>
            )}

            {/* Integrations */}
            {integrations.length > 0 && (
              <Card>
                <Label>Integrations</Label>
                <div className="flex flex-wrap gap-1.5">
                  {integrations.map((t) => <Pill key={t} text={t} color="default" />)}
                </div>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Target market */}
            {(targetMkt || custSegments.length > 0) && (
              <Card>
                <Label>Target Market & ICP</Label>
                {targetMkt && <p className="text-sm text-foreground/80 leading-relaxed mb-3">{targetMkt}</p>}
                {custSegments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {custSegments.map((c) => <Pill key={c} text={c} color="success" size="xs" />)}
                  </div>
                )}
              </Card>
            )}

            {/* Pain points */}
            {painPoints.length > 0 && (
              <Card>
                <Label>Key Challenges They Solve</Label>
                <ul className="space-y-2">
                  {painPoints.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-error mt-0.5 shrink-0">•</span>
                      <span className="text-foreground/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Pricing */}
            {pricingTiers.length > 0 && (
              <Card>
                <Label>Pricing{pricing ? ` · ${pricing}` : ""}</Label>
                <div className="space-y-2">
                  {pricingTiers.map((t, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-purple-400 mt-0.5 shrink-0">▣</span>
                      <span className="text-foreground/80">{t}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Competitive advantages + competitors */}
            <Card>
              {compAdv.length > 0 && (
                <div className="mb-4">
                  <Label>Competitive Advantages</Label>
                  <ul className="space-y-1.5">
                    {compAdv.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-success shrink-0">✓</span>
                        <span className="text-foreground/80">{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {competitors.length > 0 && (
                <>
                  <Label>Competitors</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {competitors.map((c) => <Pill key={c} text={c} color="error" size="xs" />)}
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════ TEAM & SOCIAL ═════════════════════════ */}
      {activeSection === "people" && (
        <div className="space-y-5">

          {/* Key people grid */}
          {people.length > 0 && (
            <Card>
              <Label>Key People</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {people.map((p, i) => (
                  <PersonCard key={i} name={p.name} title={p.title} url={p.url} />
                ))}
              </div>
            </Card>
          )}

          {/* LinkedIn content themes */}
          {contentThemes.length > 0 && (
            <Card>
              <Label>LinkedIn Content Strategy</Label>
              <div className="flex flex-wrap gap-2">
                {contentThemes.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/5 border border-accent/15">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    <span className="text-xs text-foreground/80">{t}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Post engagement chart */}
          {posts.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <Label>LinkedIn Post Engagement</Label>
                <span className="text-[10px] text-muted">by reactions</span>
              </div>
              <div className="space-y-3">
                {posts.map((p, i) => (
                  <BarRow
                    key={i}
                    label={p.label}
                    value={p.likes}
                    max={maxLikes}
                    color={i === 0 ? "bg-accent" : i === 1 ? "bg-accent/70" : "bg-accent/40"}
                  />
                ))}
                {posts.every((p) => p.likes === 0) && (
                  <p className="text-xs text-muted text-center py-3">Engagement counts not available from LinkedIn scrape</p>
                )}
              </div>
            </Card>
          )}

          {/* Specialties */}
          {specialties.length > 0 && (
            <Card>
              <Label>Company Specialties</Label>
              <div className="flex flex-wrap gap-1.5">
                {specialties.map((s) => <Pill key={s} text={s} color="default" />)}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════════════ SALES INTEL ══════════════════════════ */}
      {activeSection === "intel" && (
        <div className="space-y-5">
          <SalesConclusion
            name={name}
            stage={stage}
            funding={funding || totalFund}
            painPoints={painPoints}
            growthSignals={growthSignals}
            hiringSignals={hiringSignals}
            products={products}
            targetMkt={targetMkt}
          />

          {/* Buying triggers full list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {growthSignals.length > 0 && (
              <Card>
                <Label>All Growth Signals</Label>
                <div className="space-y-2">
                  {growthSignals.map((g, i) => (
                    <SignalCard key={i} text={g.signal} icon={g.icon} />
                  ))}
                </div>
              </Card>
            )}

            <Card>
              {hiringSignals.length > 0 && (
                <div className="mb-4">
                  <Label>Hiring Signals</Label>
                  <div className="space-y-2">
                    {hiringSignals.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-warning shrink-0">◈</span>
                        <span className="text-foreground/80">{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {news.length > 0 && (
                <>
                  <Label>Recent Triggers</Label>
                  <div className="space-y-2">
                    {news.map((n, i) => <NewsItem key={i} title={n.title} date={n.date} summary={n.summary} />)}
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Pain point → product fit map */}
          {painPoints.length > 0 && products.length > 0 && (
            <Card>
              <Label>Pain Point → Product Fit</Label>
              <div className="space-y-3 mt-1">
                {painPoints.slice(0, 4).map((pain, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                    <div className="p-2.5 rounded-lg bg-error/5 border border-error/15 text-xs text-foreground/80 leading-snug">
                      {pain}
                    </div>
                    <div className="text-muted text-xs">→</div>
                    <div className="p-2.5 rounded-lg bg-success/5 border border-success/15 text-xs text-foreground/80 leading-snug">
                      {products[i % products.length]?.split("—")[0]?.trim() || products[0]}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

    </div>
  );
}
