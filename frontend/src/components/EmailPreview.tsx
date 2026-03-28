"use client";

import { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmailDraft {
  angle: string;
  subject: string;
  body: string;
  personalization_notes: string;
  style_match: string;
  email_quality_score: number;
  quality_notes: string;
}

interface EmailPreviewProps {
  subject: string;
  body: string;
  approved: boolean;
  personalizationNotes?: string;
  styleMatch?: string;
  qualityScore?: number;
  drafts?: EmailDraft[];
  onVerify?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Try to parse drafts array from body if backend sent raw JSON */
function parseDraftsFromBody(body: string): EmailDraft[] | null {
  try {
    const cleaned = body
      .replace(/^```json\n?/m, "")
      .replace(/^```\n?/m, "")
      .replace(/```$/m, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].body) {
      return parsed as EmailDraft[];
    }
    if (typeof parsed === "object" && parsed !== null && parsed.body) {
      return [parsed as EmailDraft];
    }
  } catch {
    // not JSON
  }
  return null;
}

function normaliseDraft(
  subject: string,
  body: string,
  notes: string,
  style: string,
  score: number,
): EmailDraft {
  return {
    angle: "Draft",
    subject,
    body,
    personalization_notes: notes,
    style_match: style,
    email_quality_score: score,
    quality_notes: "",
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function QualityBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-success" : score >= 60 ? "bg-warning" : "bg-error";
  const label =
    score >= 80 ? "High Quality" : score >= 60 ? "Good" : "Needs Review";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-card-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-muted shrink-0">
        {score}/100 · {label}
      </span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  if (!score) return null;
  const cls =
    score >= 80
      ? "bg-success/15 text-success"
      : score >= 60
      ? "bg-warning/15 text-warning"
      : "bg-error/15 text-error";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>
      {score}/100
    </span>
  );
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function EmailBody({ text }: { text: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) =>
        /^https?:\/\/[^\s]+$/.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors font-medium no-underline text-xs"
          >
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Book a 30-min call
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-2.5 py-1 rounded-md border border-card-border text-muted hover:text-foreground hover:border-accent/40 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function DraftCard({
  draft,
  index,
  isSelected,
  onSelect,
}: {
  draft: EmailDraft;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const fullText = `Subject: ${draft.subject}\n\n${draft.body}`;
  const hasDetails = Boolean(
    draft.personalization_notes || draft.style_match || draft.quality_notes
  );

  return (
    <div
      className={`rounded-xl border transition-all ${
        isSelected
          ? "border-accent bg-accent/5 shadow-sm"
          : "border-card-border bg-card hover:border-accent/40"
      }`}
    >
      {/* Card header — click to select */}
      <button
        onClick={onSelect}
        className="w-full text-left px-5 py-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Selection indicator */}
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                isSelected
                  ? "border-accent bg-accent"
                  : "border-card-border"
              }`}
            >
              {isSelected && (
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </div>
            <span className="text-xs font-semibold text-accent uppercase tracking-wide">
              Option {index + 1}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ScoreBadge score={draft.email_quality_score} />
            {isSelected && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                Selected
              </span>
            )}
          </div>
        </div>

        {/* Angle label */}
        {draft.angle && (
          <div className="mt-2 text-xs text-muted italic">{draft.angle}</div>
        )}

        {/* Subject */}
        <div className="mt-2.5">
          <div className="text-xs text-muted mb-1">Subject</div>
          <div className="text-sm font-semibold leading-snug">
            {draft.subject || "(no subject)"}
          </div>
        </div>

        {draft.email_quality_score > 0 && (
          <div className="mt-3">
            <QualityBar score={draft.email_quality_score} />
          </div>
        )}
      </button>

      {/* Body */}
      <div className="px-5 pb-4 border-t border-card-border/50">
        <div className="pt-4 text-sm leading-7 text-foreground/90 font-sans">
          <EmailBody text={draft.body} />
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 pb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {!isSelected && (
            <button
              onClick={onSelect}
              className="text-xs px-3 py-1.5 rounded-md bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 font-medium transition-colors"
            >
              Use this draft
            </button>
          )}
          <CopyButton text={fullText} />
        </div>

        {hasDetails && (
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-muted hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Notes
            <svg
              className={`w-3 h-3 transition-transform ${showDetails ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Collapsible details */}
      {hasDetails && showDetails && (
        <div className="px-5 pb-5 space-y-3 border-t border-card-border/50">
          {draft.personalization_notes && (
            <div className="pt-3">
              <div className="text-xs font-medium text-muted mb-1.5 uppercase tracking-wider">
                Data Points Used
              </div>
              <p className="text-sm text-foreground/75 leading-relaxed">
                {draft.personalization_notes}
              </p>
            </div>
          )}
          {draft.style_match && (
            <div>
              <div className="text-xs font-medium text-muted mb-1.5 uppercase tracking-wider">
                Style Match
              </div>
              <p className="text-sm text-foreground/75 leading-relaxed">
                {draft.style_match}
              </p>
            </div>
          )}
          {draft.quality_notes && (
            <div>
              <div className="text-xs font-medium text-muted mb-1.5 uppercase tracking-wider">
                Quality Notes
              </div>
              <p className="text-sm text-foreground/75 leading-relaxed">
                {draft.quality_notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmailPreview({
  subject: subjectProp,
  body: bodyProp,
  approved,
  personalizationNotes,
  styleMatch,
  qualityScore,
  drafts: draftsProp,
  onVerify,
}: EmailPreviewProps) {
  // Resolve the list of drafts to show
  const resolvedDrafts: EmailDraft[] = (() => {
    if (draftsProp && draftsProp.length > 0) return draftsProp;
    // Try parsing from body (in case backend embedded JSON)
    const fromBody = bodyProp ? parseDraftsFromBody(bodyProp) : null;
    if (fromBody) return fromBody;
    // Single draft fallback
    if (bodyProp) {
      return [
        normaliseDraft(
          subjectProp,
          bodyProp,
          personalizationNotes || "",
          styleMatch || "",
          qualityScore || 0,
        ),
      ];
    }
    return [];
  })();

  // Default selection = highest quality score
  const defaultIdx = resolvedDrafts.reduce(
    (best, d, i) =>
      d.email_quality_score > (resolvedDrafts[best]?.email_quality_score ?? 0)
        ? i
        : best,
    0,
  );

  const [selectedIdx, setSelectedIdx] = useState(defaultIdx);

  if (resolvedDrafts.length === 0) return null;

  const selected = resolvedDrafts[selectedIdx];
  const isSingleDraft = resolvedDrafts.length === 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            {isSingleDraft ? "Email Draft" : `${resolvedDrafts.length} Email Variants`}
          </h3>
          {!isSingleDraft && (
            <p className="text-xs text-muted mt-0.5">
              Each uses a different opening angle — select the one that fits best
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              approved
                ? "bg-success/15 text-success"
                : "bg-warning/15 text-warning"
            }`}
          >
            {approved ? "Approved" : "Pending Review"}
          </span>
          {onVerify && (
            <button
              onClick={onVerify}
              className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border border-accent/40 text-accent hover:bg-accent/10 transition-colors font-medium"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Verify
            </button>
          )}
        </div>
      </div>

      {/* Draft cards */}
      <div className="space-y-3">
        {resolvedDrafts.map((draft, i) => (
          <DraftCard
            key={i}
            draft={draft}
            index={i}
            isSelected={i === selectedIdx}
            onSelect={() => setSelectedIdx(i)}
          />
        ))}
      </div>

      {/* Bottom action bar — operates on selected draft */}
      {!isSingleDraft && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 px-5 py-3.5 flex items-center justify-between gap-4">
          <div className="text-xs text-muted">
            <span className="font-medium text-foreground">Option {selectedIdx + 1}</span>
            {" "}selected
            {selected.angle ? ` · ${selected.angle}` : ""}
          </div>
          <div className="flex gap-2">
            <button className="text-xs px-3 py-1.5 rounded-md border border-card-border text-muted hover:text-foreground hover:border-accent/40 transition-colors">
              Approve &amp; Send
            </button>
            {onVerify && (
              <button
                onClick={onVerify}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-accent/40 text-accent hover:bg-accent/10 transition-colors font-medium"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verify
              </button>
            )}
            <CopyButton
              text={`Subject: ${selected.subject}\n\n${selected.body}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
