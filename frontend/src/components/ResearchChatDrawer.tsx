"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface ResearchChatDrawerProps {
  open: boolean;
  onClose: () => void;
  researchContext: Record<string, unknown>;
}

// ── Suggested questions ───────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Where does the opening line come from?",
  "Why was this hook chosen over others?",
  "What post is referenced in the email?",
  "What pain points did you find in the research?",
  "How recent are the posts used?",
  "What data supports the Basepair mention?",
  "What is this person's communication style based on?",
];

// ── Citation renderer ─────────────────────────────────────────────────────────
// Turns [Source: X → Y] into a highlighted badge inline

function renderWithCitations(text: string) {
  const parts = text.split(/(\[Source:[^\]]+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("[Source:")) {
      const inner = part.slice(1, -1); // strip [ ]
      return (
        <span
          key={i}
          className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent border border-accent/20 whitespace-nowrap"
        >
          <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {inner}
        </span>
      );
    }
    // Render newlines as <br>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function ResearchChatDrawer({
  open,
  onClose,
  researchContext,
}: ResearchChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Cancel any in-flight stream when closing
  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;

      const userMsg: ChatMessage = { role: "user", content: question };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      // Add empty assistant message that we'll stream into
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", streaming: true },
      ]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch(`${API}/verify/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            history,
            research_context: researchContext,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

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
              // malformed SSE line — skip
            }
          }
        }

        // Mark streaming done
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
    [loading, messages, researchContext],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-[480px] flex flex-col bg-background border-l border-card-border shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Verify Email Research</h2>
            <p className="text-xs text-muted mt-0.5">
              Ask anything — every answer is cited from the raw research data
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-border/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isEmpty && (
            <div className="space-y-4">
              {/* Intro */}
              <div className="rounded-xl bg-accent/8 border border-accent/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    I have the full research context — LinkedIn profile, company website,
                    company LinkedIn, activity analysis, and persona. Ask me to verify any
                    claim in the email and I{"'"}ll cite the exact source.
                  </p>
                </div>
              </div>

              {/* Suggested questions */}
              <div>
                <p className="text-xs text-muted mb-2 uppercase tracking-wider font-medium">
                  Try asking
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="w-full text-left text-xs px-3 py-2.5 rounded-lg border border-card-border text-foreground/75 hover:text-foreground hover:border-accent/40 hover:bg-accent/5 transition-colors"
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
              {/* Avatar */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                  msg.role === "user"
                    ? "bg-accent text-white"
                    : "bg-card-border text-muted"
                }`}
              >
                {msg.role === "user" ? "U" : "AI"}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent text-white rounded-tr-sm"
                    : "bg-card border border-card-border text-foreground/90 rounded-tl-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  <>
                    {renderWithCitations(msg.content)}
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-3.5 bg-accent/60 ml-0.5 animate-pulse rounded-sm" />
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
              placeholder="Ask about any part of the email…"
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
              className="mt-2 w-full text-center text-xs text-muted hover:text-foreground transition-colors"
            >
              Clear conversation
            </button>
          )}
        </div>
      </div>
    </>
  );
}
