"use client";

import { type ReactNode, useState } from "react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface AnalysisPanelProps {
  linkedinData?: Record<string, unknown>;
  companyData?: Record<string, unknown>;
  companyLinkedinData?: Record<string, unknown>;
  activityData?: Record<string, unknown>;
  serviceMatch?: Record<string, unknown>;
  primaryHook?: string;
  dataQuality?: string;
  // Structured parsed versions from output_formatter agent
  linkedinParsed?: Record<string, unknown>;
  companyParsed?: Record<string, unknown>;
  companyLinkedinParsed?: Record<string, unknown>;
  activityParsed?: Record<string, unknown>;
}

/* ── Main Component ─────────────────────────────────────────────────────────── */

export default function AnalysisPanel({
  linkedinData,
  companyData,
  companyLinkedinData,
  activityData,
  serviceMatch,
  primaryHook,
  dataQuality,
  linkedinParsed,
  companyParsed,
  companyLinkedinParsed,
  activityParsed,
}: AnalysisPanelProps) {
  const hasData = linkedinData || companyData || activityData || serviceMatch || primaryHook
    || linkedinParsed || companyParsed || activityParsed;

  if (!hasData) {
    return (
      <div className="rounded-lg border border-card-border bg-card p-6 text-center text-sm text-muted">
        No analysis data available. Run the pipeline first.
      </div>
    );
  }

  // Prefer parsed (structured) data; fall back to raw data object
  const liData  = (linkedinParsed && Object.keys(linkedinParsed).length  > 0) ? linkedinParsed  : linkedinData;
  const coData  = (companyParsed  && Object.keys(companyParsed).length   > 0) ? companyParsed   : companyData;
  const coLiData = (companyLinkedinParsed && Object.keys(companyLinkedinParsed).length > 0) ? companyLinkedinParsed : companyLinkedinData;
  const actData = (activityParsed && Object.keys(activityParsed).length  > 0) ? activityParsed  : activityData;

  return (
    <div className="space-y-5">

      {/* ── Top bar: quality + hook ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {dataQuality && <QualityBadge quality={dataQuality} />}
        {primaryHook && (
          <div className="flex-1 min-w-0 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2">
            <div className="text-[10px] text-accent font-semibold uppercase tracking-wider">Primary Hook</div>
            <p className="text-sm text-foreground/90 mt-0.5">{primaryHook}</p>
          </div>
        )}
      </div>

      {/* ── Service Match ────────────────────────────────────────────────── */}
      {serviceMatch && <ServiceMatchSection data={serviceMatch} />}

      {/* ── LinkedIn + Activity (2-col) ──────────────────────────────────── */}
      {(liData || actData) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {liData  && <LinkedInSection  data={liData}  />}
          {actData && <ActivitySection  data={actData} />}
        </div>
      )}

      {/* ── Company Research (full width) ────────────────────────────────── */}
      {coData && <CompanyResearchPanel data={coData} />}

      {/* ── Company LinkedIn (full width) ────────────────────────────────── */}
      {coLiData && <CompanyLinkedInPanel data={coLiData} />}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SERVICE MATCH
   ══════════════════════════════════════════════════════════════════════════ */

function ServiceMatchSection({ data }: { data: Record<string, unknown> }) {
  const d = extractFromRaw(data);
  const matches    = Array.isArray(d.matches) ? d.matches : [];
  const confidence = typeof d.match_confidence === "number" ? d.match_confidence : null;
  const hookReasoning = s(d, "hook_reasoning");
  const primaryHook   = s(d, "primary_hook");
  const confPct = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/[0.02] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center gap-1.5">
          🎯 Service Match
        </h3>
        {confPct != null && (
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${confPct >= 70 ? "text-success" : confPct >= 40 ? "text-warning" : "text-error"}`}>
              {confPct}%
            </span>
            <span className="text-xs text-muted">match confidence</span>
          </div>
        )}
      </div>

      {primaryHook && (
        <div className="rounded-lg bg-accent/5 border border-accent/20 px-3 py-2.5 mb-4">
          <div className="text-[10px] text-accent font-semibold uppercase tracking-wider mb-1">Primary Hook</div>
          <p className="text-sm text-foreground/90">{primaryHook}</p>
        </div>
      )}

      {matches.length > 0 && (
        <div className="space-y-3 mb-4">
          {matches.map((m: unknown, i: number) => {
            const obj = asObj(m) ?? {};
            const relevance = typeof obj.relevance === "number" ? obj.relevance : null;
            const relPct = relevance != null ? Math.round(relevance * 100) : null;
            return (
              <div key={i} className="rounded-lg bg-background border border-card-border p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-foreground">{s(obj, "service")}</span>
                  {relPct != null && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-16 h-1.5 rounded-full bg-card-border overflow-hidden">
                        <div
                          className={`h-full rounded-full ${relPct >= 70 ? "bg-success" : relPct >= 40 ? "bg-warning" : "bg-error"}`}
                          style={{ width: `${relPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted">{relPct}%</span>
                    </div>
                  )}
                </div>
                {s(obj, "pain_point") && (
                  <p className="text-xs text-muted mb-1">
                    <span className="text-foreground/60">Pain point:</span> {s(obj, "pain_point")}
                  </p>
                )}
                {s(obj, "talking_point") && (
                  <p className="text-xs text-foreground/70 italic">{s(obj, "talking_point")}</p>
                )}
                {s(obj, "evidence") && (
                  <p className="text-xs text-muted mt-1">Evidence: {s(obj, "evidence")}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hookReasoning && (
        <div className="rounded-lg bg-card border border-card-border px-3 py-2 text-xs text-foreground/70">
          <span className="text-muted font-medium">Hook reasoning: </span>
          {hookReasoning}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LINKEDIN PROFILE
   ══════════════════════════════════════════════════════════════════════════ */

function LinkedInSection({ data }: { data: Record<string, unknown> }) {
  if (data.skipped) return <SkippedCard title="LinkedIn Research" />;

  const name        = s(data, "name") || s(data, "full_name");
  const title       = s(data, "title") || s(data, "headline") || s(data, "current_title");
  const company     = s(data, "company") || s(data, "current_company");
  const location    = s(data, "location");
  const connections = s(data, "connections") || s(data, "connection_count");
  const about       = s(data, "about") || s(data, "summary");

  const experienceRaw = data.experience;
  const educationRaw  = data.education;
  const postsRaw      = data.posts;
  const skillsRaw     = data.skills;
  const contactRaw    = asObj(data.contact) ?? asObj(data.contact_info) ?? {};

  const experience: { title: string; company: string; duration: string; description: string }[] =
    Array.isArray(experienceRaw) ? experienceRaw.map((e: unknown) => {
      const obj = asObj(e) ?? {};
      return {
        title:       s(obj, "title") || s(obj, "job_title"),
        company:     s(obj, "company"),
        duration:    s(obj, "duration") || s(obj, "dates"),
        description: s(obj, "description") || s(obj, "responsibilities"),
      };
    }).filter(e => e.title || e.company) : [];

  const education: { school: string; degree: string; years: string }[] =
    Array.isArray(educationRaw) ? educationRaw.map((e: unknown) => {
      const obj = asObj(e) ?? {};
      return {
        school: s(obj, "school") || s(obj, "institution"),
        degree: s(obj, "degree") || s(obj, "field"),
        years:  s(obj, "years") || s(obj, "dates") || s(obj, "duration"),
      };
    }).filter(e => e.school) : [];

  const posts: { content: string; engagement: string; date: string }[] =
    Array.isArray(postsRaw) ? postsRaw.map((p: unknown) => {
      const obj = asObj(p) ?? {};
      return {
        content:    s(obj, "content") || s(obj, "text") || s(obj, "title"),
        engagement: s(obj, "engagement") || s(obj, "likes") || s(obj, "engagement_count"),
        date:       s(obj, "date"),
      };
    }).filter(p => p.content) : [];

  const skills: string[] = Array.isArray(skillsRaw) ? skillsRaw.map(String).filter(Boolean) : [];
  const email   = s(contactRaw, "email");
  const website = s(contactRaw, "website") || s(contactRaw, "url");

  if (!name && !title && experience.length === 0 && !about) {
    return <SkippedCard title="LinkedIn Profile" />;
  }

  return (
    <Card title="LinkedIn Profile" icon="👤">
      {name && (
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-card-border">
          <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold shrink-0">
            {name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{name}</p>
            {title   && <p className="text-xs text-muted">{title}</p>}
            {company && <p className="text-xs text-muted">{company}</p>}
          </div>
        </div>
      )}
      <div className="space-y-3 text-xs">
        {(location || connections) && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted">
            {location    && <span>📍 {location}</span>}
            {connections && <span>🔗 {connections} connections</span>}
          </div>
        )}
        {about && (
          <SubSection label="About">
            <p className="text-foreground/80 leading-relaxed line-clamp-4">{about}</p>
          </SubSection>
        )}
        {experience.length > 0 && (
          <SubSection label="Experience">
            {experience.slice(0, 3).map((exp, i) => (
              <div key={i} className="py-1.5 border-b border-card-border/40 last:border-0">
                <p className="font-medium text-foreground/90">{exp.title}</p>
                <p className="text-muted">{exp.company}{exp.duration && ` · ${exp.duration}`}</p>
                {exp.description && <p className="text-foreground/60 mt-0.5 line-clamp-2">{exp.description}</p>}
              </div>
            ))}
          </SubSection>
        )}
        {education.length > 0 && (
          <SubSection label="Education">
            {education.slice(0, 2).map((edu, i) => (
              <div key={i} className="text-muted py-0.5">
                {edu.school}{edu.degree && ` — ${edu.degree}`}{edu.years && ` (${edu.years})`}
              </div>
            ))}
          </SubSection>
        )}
        {skills.length > 0 && (
          <SubSection label="Skills">
            <div className="flex flex-wrap gap-1">
              {skills.slice(0, 8).map((sk) => (
                <span key={sk} className="px-1.5 py-0.5 rounded bg-card-border/50 text-[10px] text-foreground/65">{sk}</span>
              ))}
            </div>
          </SubSection>
        )}
        {posts.length > 0 && (
          <SubSection label="Recent Posts">
            {posts.slice(0, 3).map((post, i) => (
              <div key={i} className="py-1.5 border-b border-card-border/40 last:border-0">
                <p className="text-foreground/65 italic line-clamp-2">"{post.content}"</p>
                <div className="flex gap-3 mt-0.5 text-muted">
                  {post.engagement && <span>{post.engagement}</span>}
                  {post.date       && <span>{post.date}</span>}
                </div>
              </div>
            ))}
          </SubSection>
        )}
        {(email || website) && (
          <SubSection label="Contact">
            {email   && <p className="text-muted">{email}</p>}
            {website && (
              <a href={website.startsWith("http") ? website : `https://${website}`}
                target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {website.replace(/^https?:\/\//, "").split("/")[0]} ↗
              </a>
            )}
          </SubSection>
        )}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTIVITY ANALYSIS
   ══════════════════════════════════════════════════════════════════════════ */

function ActivitySection({ data }: { data: Record<string, unknown> }) {
  if (data.skipped) return <SkippedCard title="Activity Analysis" />;

  const topicsRaw  = data.topics;
  const painRaw    = data.pain_points;
  const buyingRaw  = data.buying_signals;
  const commDNARaw = asObj(data.communication_dna) ?? asObj(data.communication);
  const quotesRaw  = data.best_post_quotes;

  const topics: { topic: string; frequency: string }[] = Array.isArray(topicsRaw)
    ? topicsRaw.map((t: unknown) => {
        if (typeof t === "string") return { topic: t, frequency: "" };
        const obj = asObj(t) ?? {};
        return { topic: s(obj, "topic") || s(obj, "name"), frequency: s(obj, "frequency") };
      }).filter(t => t.topic)
    : [];

  const painPoints: { pain: string; evidence: string }[] = Array.isArray(painRaw)
    ? painRaw.map((p: unknown) => {
        if (typeof p === "string") return { pain: p, evidence: "" };
        const obj = asObj(p) ?? {};
        return { pain: s(obj, "pain") || s(obj, "pain_point") || s(obj, "description"), evidence: s(obj, "evidence") || s(obj, "quote") };
      }).filter(p => p.pain)
    : [];

  const buyingSignals: string[] = Array.isArray(buyingRaw) ? buyingRaw.map(String).filter(Boolean) : [];
  const quotes: string[] = Array.isArray(quotesRaw) ? quotesRaw.map(String).filter(Boolean) : [];

  const writingStyle = commDNARaw ? s(commDNARaw, "writing_style") || s(commDNARaw, "style") : "";
  const tone         = commDNARaw ? s(commDNARaw, "tone") : "";
  const postLen      = commDNARaw ? s(commDNARaw, "post_length") : "";
  const postFreq     = commDNARaw ? s(commDNARaw, "posting_frequency") : "";
  const emojiUsage   = commDNARaw ? s(commDNARaw, "emoji_usage") : "";

  if (!topics.length && !painPoints.length && !buyingSignals.length && !writingStyle) {
    return <SkippedCard title="Activity Analysis" />;
  }

  return (
    <Card title="Activity Analysis" icon="📊">
      <div className="space-y-3 text-xs">
        {topics.length > 0 && (
          <SubSection label="Topics of Interest">
            <div className="flex flex-wrap gap-1.5">
              {topics.slice(0, 8).map((t, i) => (
                <span key={i} className="px-2 py-0.5 rounded border bg-card-border/50 text-foreground/70 border-transparent text-[11px]">
                  {t.topic}{t.frequency && <span className="text-muted ml-1">({t.frequency})</span>}
                </span>
              ))}
            </div>
          </SubSection>
        )}
        {painPoints.length > 0 && (
          <SubSection label="Expressed Pain Points">
            {painPoints.slice(0, 3).map((pp, i) => (
              <div key={i} className="py-1 border-b border-card-border/40 last:border-0">
                <p className="text-foreground/80">{pp.pain}</p>
                {pp.evidence && <p className="text-muted italic mt-0.5">"{pp.evidence}"</p>}
              </div>
            ))}
          </SubSection>
        )}
        {buyingSignals.length > 0 && (
          <SubSection label="Buying Signals">
            {buyingSignals.map((signal, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5">
                <span className="text-success mt-0.5 shrink-0">↑</span>
                <span className="text-foreground/80">{signal}</span>
              </div>
            ))}
          </SubSection>
        )}
        {(writingStyle || tone || postLen || postFreq || emojiUsage) && (
          <SubSection label="Communication DNA">
            <div className="space-y-1">
              {[
                ["Style",      writingStyle],
                ["Tone",       tone],
                ["Post Length", postLen],
                ["Frequency",  postFreq],
                ["Emoji Usage", emojiUsage],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} className="flex gap-2">
                  <span className="text-muted w-24 shrink-0">{label}</span>
                  <span className="text-foreground/80">{val}</span>
                </div>
              ))}
            </div>
          </SubSection>
        )}
        {quotes.length > 0 && (
          <SubSection label="Notable Quotes">
            {quotes.slice(0, 2).map((q, i) => (
              <p key={i} className="text-foreground/65 italic border-l-2 border-accent/30 pl-2 py-0.5">"{q}"</p>
            ))}
          </SubSection>
        )}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPANY RESEARCH
   ══════════════════════════════════════════════════════════════════════════ */

function CompanyResearchPanel({ data }: { data: Record<string, unknown> }) {
  if (data.skipped) return <SkippedBanner title="Company Research" />;

  const name     = s(data, "name") || s(data, "company_name") || s(data, "company");
  const size     = s(data, "size");
  const stage    = s(data, "stage");
  const funding  = s(data, "funding");
  const mission  = s(data, "mission");
  const target   = s(data, "target_market");

  const products     = toArr(data.products     ?? data.products_services);
  const techStack    = toArr(data.tech_stack);
  const painPoints   = toArr(data.pain_points  ?? data.challenges);
  const growthSignals = toArr(data.growth_signals ?? data.growth);

  if (!name && !mission && !products.length && !painPoints.length) {
    return <SkippedBanner title="Company Research" />;
  }

  return (
    <CollapsiblePanel title="Company Research" icon="🏢" badge={stage || undefined} badgeColor="accent">
      {(name || size || funding) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-5 pb-4 border-b border-card-border">
          {name    && <h4 className="text-base font-semibold text-foreground">{name}</h4>}
          {size    && <MetaChip label="Size"    value={size} />}
          {stage   && <MetaChip label="Stage"   value={stage} />}
          {funding && <MetaChip label="Funding" value={funding} />}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="space-y-4">
          {mission && (
            <PanelSection label="Mission">
              <p className="text-sm text-foreground/80 leading-relaxed">{mission}</p>
            </PanelSection>
          )}
          {target && (
            <PanelSection label="Target Market">
              <p className="text-sm text-foreground/80 leading-relaxed">{target}</p>
            </PanelSection>
          )}
          {painPoints.length > 0 && (
            <PanelSection label="Key Challenges">
              <ul className="space-y-1.5">
                {painPoints.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-error mt-0.5 shrink-0">•</span>
                    <span className="text-foreground/80">{c}</span>
                  </li>
                ))}
              </ul>
            </PanelSection>
          )}
        </div>
        <div className="space-y-4">
          {products.length > 0 && (
            <PanelSection label="Products & Services">
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => <PillTag key={p} text={p} color="default" />)}
              </div>
            </PanelSection>
          )}
          {techStack.length > 0 && (
            <PanelSection label="Tech Stack">
              <div className="flex flex-wrap gap-1.5">
                {techStack.map((t) => <PillTag key={t} text={t} color="accent" />)}
              </div>
            </PanelSection>
          )}
        </div>
        <div>
          {growthSignals.length > 0 && (
            <PanelSection label="Growth Signals">
              <ul className="space-y-1.5">
                {growthSignals.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-success mt-0.5 shrink-0">↑</span>
                    <span className="text-foreground/80">{g}</span>
                  </li>
                ))}
              </ul>
            </PanelSection>
          )}
        </div>
      </div>
    </CollapsiblePanel>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPANY LINKEDIN
   ══════════════════════════════════════════════════════════════════════════ */

function CompanyLinkedInPanel({ data }: { data: Record<string, unknown> }) {
  const isSkipped = data.skipped === true || asObj(data.error)?.skipped === true;
  if (isSkipped) return <SkippedBanner title="Company LinkedIn" />;

  const name      = s(data, "name") || s(data, "company_name");
  const tagline   = s(data, "tagline") || s(data, "description");
  const employees = s(data, "employees") || s(data, "employee_count");
  const followers = s(data, "followers") || s(data, "follower_count");
  const founded   = s(data, "founded");

  const specialties  = toArr(data.specialties);
  const themes       = toArr(data.content_themes ?? data.themes);
  const recentPosts: unknown[] = Array.isArray(data.recent_posts) ? data.recent_posts : [];
  const keyPeople: unknown[]   = Array.isArray(data.key_people)   ? data.key_people   : [];

  if (!name && !employees && !specialties.length && !recentPosts.length) {
    return <SkippedBanner title="Company LinkedIn" />;
  }

  return (
    <CollapsiblePanel title="Company LinkedIn" icon="📈">
      {(name || employees || followers) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 pb-4 border-b border-card-border">
          {name      && <h4 className="text-base font-semibold">{name}</h4>}
          {founded   && <MetaChip label="Founded"   value={founded} />}
          {employees && <MetaChip label="Employees" value={employees} />}
          {followers && <MetaChip label="Followers" value={followers} />}
        </div>
      )}
      {tagline && <p className="text-sm text-foreground/70 italic mb-4">"{tagline}"</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="space-y-4">
          {specialties.length > 0 && (
            <PanelSection label="Specialties">
              <div className="flex flex-wrap gap-1.5">{specialties.map((t) => <PillTag key={t} text={t} color="default" />)}</div>
            </PanelSection>
          )}
          {themes.length > 0 && (
            <PanelSection label="Content Themes">
              <div className="flex flex-wrap gap-1.5">{themes.map((t) => <PillTag key={t} text={t} color="accent" />)}</div>
            </PanelSection>
          )}
        </div>
        <div>
          {keyPeople.length > 0 && (
            <PanelSection label="Key People">
              <div className="space-y-2">
                {keyPeople.slice(0, 5).map((p, i) => {
                  const person = asObj(p);
                  const pName  = person ? s(person, "name") || s(person, "full_name") : String(p ?? "");
                  const pTitle = person ? s(person, "title") || s(person, "role") : "";
                  return (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-card-border/40 last:border-0">
                      <div className="w-6 h-6 rounded-full bg-card-border flex items-center justify-center text-[10px] font-bold text-muted shrink-0">
                        {pName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground/90 truncate">{pName}</p>
                        {pTitle && <p className="text-[10px] text-muted truncate">{pTitle}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </PanelSection>
          )}
        </div>
        <div>
          {recentPosts.length > 0 && (
            <PanelSection label="Recent Posts">
              <div className="space-y-2">
                {recentPosts.slice(0, 3).map((p, i) => {
                  const post = asObj(p);
                  const text = post ? s(post, "content") || s(post, "text") || s(post, "topic") : String(p ?? "");
                  const date = post ? s(post, "date") : "";
                  const eng  = post ? s(post, "engagement") || s(post, "reactions") : "";
                  return (
                    <div key={i} className="rounded border border-card-border bg-background p-2">
                      <p className="text-xs text-foreground/80 line-clamp-3">{text}</p>
                      <div className="flex gap-2 mt-1 text-[10px] text-muted">
                        {date && <span>{date}</span>}
                        {eng  && <span>{eng}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </PanelSection>
          )}
        </div>
      </div>
    </CollapsiblePanel>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PRIMITIVES
   ══════════════════════════════════════════════════════════════════════════ */

function QualityBadge({ quality }: { quality: string }) {
  const map: Record<string, string> = {
    high:   "bg-success/20 text-success border-success/30",
    medium: "bg-warning/20 text-warning border-warning/30",
    low:    "bg-error/20 text-error border-error/30",
    failed: "bg-error/20 text-error border-error/30",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${map[quality.toLowerCase()] ?? "bg-card-border/50 text-muted border-transparent"}`}>
      Data Quality: {quality}
    </span>
  );
}

function CollapsiblePanel({
  title, icon, badge, badgeColor = "accent", children,
}: {
  title: string; icon: string; badge?: string;
  badgeColor?: "accent" | "success" | "warning"; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const colorMap = {
    accent:  "bg-accent/10 text-accent border-accent/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
  };
  return (
    <div className="rounded-xl border border-card-border bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-card-border hover:bg-card-border/10 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <h3 className="text-sm font-semibold">{title}</h3>
          {badge && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${colorMap[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-muted transition-transform ${collapsed ? "-rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && <div className="px-5 py-5">{children}</div>}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 max-h-[520px] overflow-auto">
      <h3 className="text-xs font-semibold text-accent uppercase tracking-wider mb-3 sticky top-0 bg-card pb-1 flex items-center gap-1.5">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function SubSection({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-1.5">{label}</div>{children}</div>;
}
function PanelSection({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-2">{label}</div>{children}</div>;
}
function MetaChip({ label, value }: { label: string; value: string }) {
  return <span className="text-xs text-muted"><span className="text-foreground/50">{label}:</span> {value}</span>;
}
function PillTag({ text, color }: { text: string; color: "default" | "accent" }) {
  const cls = color === "accent" ? "bg-accent/10 text-accent border-accent/20" : "bg-card-border/50 text-foreground/70 border-transparent";
  return <span className={`px-2 py-0.5 rounded border text-[11px] ${cls}`}>{text}</span>;
}
function SkippedCard({ title }: { title: string }) {
  return <div className="rounded-xl border border-card-border bg-card p-4 flex items-center justify-center text-xs text-muted">{title} — data unavailable</div>;
}
function SkippedBanner({ title }: { title: string }) {
  return <div className="rounded-xl border border-card-border bg-card px-5 py-3 text-xs text-muted">{title} — data unavailable</div>;
}

/* ══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════════════════ */

function extractFromRaw(data: Record<string, unknown>): Record<string, unknown> {
  const raw = data.raw_response;
  if (typeof raw === "string") {
    try {
      let clean = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const start = clean.search(/[{[]/);
      if (start > 0) clean = clean.slice(start);
      const p = JSON.parse(clean);
      if (p && typeof p === "object" && !Array.isArray(p))
        return { ...p as Record<string, unknown>, ...Object.fromEntries(Object.entries(data).filter(([k]) => k !== "raw_response")) };
    } catch { /* not JSON */ }
  }
  return data;
}
function asObj(v: unknown): Record<string, unknown> | null {
  return (v != null && typeof v === "object" && !Array.isArray(v)) ? v as Record<string, unknown> : null;
}
function s(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (v == null) return "";
  // If it's a plain object (e.g. emoji_usage: {frequency, types}), extract a readable summary
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    // Try common "value" keys first
    const inner = o.frequency ?? o.value ?? o.level ?? o.text ?? o.description;
    if (inner != null) return String(inner);
    // Fall back to comma-joined entries
    return Object.entries(o)
      .filter(([, val]) => val != null && !Array.isArray(val))
      .map(([k, val]) => `${k}: ${val}`)
      .join(", ");
  }
  return String(v);
}
function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(/[;\n]+/).map((x) => x.trim().replace(/^[-•*]\s*/, "")).filter(Boolean);
  return [];
}
