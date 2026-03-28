"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// ── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "nester_chat_conversations";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
  } catch {
    // storage full — drop oldest
  }
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Markdown-lite renderer ───────────────────────────────────────────────────

function renderMarkdown(text: string) {
  // Split into lines, handle headers, bold, code blocks, lists, citations
  const blocks = text.split(/\n\n+/);
  return blocks.map((block, bi) => {
    // Code block
    if (block.startsWith("```")) {
      const lines = block.split("\n");
      const lang = lines[0].slice(3).trim();
      const code = lines.slice(1, lines[lines.length - 1] === "```" ? -1 : undefined).join("\n");
      return (
        <div key={bi} className="my-2 rounded-lg overflow-hidden border border-card-border">
          {lang && (
            <div className="px-3 py-1 bg-surface-high text-[10px] text-muted font-mono uppercase">{lang}</div>
          )}
          <pre className="px-3 py-2 bg-surface-low text-xs font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap">{code}</pre>
        </div>
      );
    }

    // Headers
    if (block.startsWith("### ")) {
      return <h4 key={bi} className="text-sm font-semibold text-foreground mt-3 mb-1">{renderInline(block.slice(4))}</h4>;
    }
    if (block.startsWith("## ")) {
      return <h3 key={bi} className="text-base font-semibold text-foreground mt-3 mb-1">{renderInline(block.slice(3))}</h3>;
    }

    // Bullet list
    const lines = block.split("\n");
    const isList = lines.every((l) => /^[-*]\s/.test(l.trim()) || l.trim() === "");
    if (isList && lines.some((l) => l.trim())) {
      return (
        <ul key={bi} className="my-1.5 space-y-1 ml-1">
          {lines.filter((l) => l.trim()).map((l, li) => (
            <li key={li} className="flex gap-2 text-[13px] leading-relaxed text-foreground/85">
              <span className="text-accent mt-0.5 shrink-0">&#8226;</span>
              <span>{renderInline(l.replace(/^[-*]\s/, ""))}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Numbered list
    const isNumbered = lines.every((l) => /^\d+[.)]\s/.test(l.trim()) || l.trim() === "");
    if (isNumbered && lines.some((l) => l.trim())) {
      return (
        <ol key={bi} className="my-1.5 space-y-1 ml-1">
          {lines.filter((l) => l.trim()).map((l, li) => (
            <li key={li} className="flex gap-2 text-[13px] leading-relaxed text-foreground/85">
              <span className="text-accent shrink-0 font-medium w-5 text-right">{li + 1}.</span>
              <span>{renderInline(l.replace(/^\d+[.)]\s/, ""))}</span>
            </li>
          ))}
        </ol>
      );
    }

    // Paragraph
    return (
      <p key={bi} className="text-[13px] leading-relaxed text-foreground/85 my-1.5">
        {block.split("\n").map((line, li, arr) => (
          <span key={li}>
            {renderInline(line)}
            {li < arr.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

function renderInline(text: string) {
  // Handle: **bold**, `code`, [Memory: x], and normal text
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[Memory:[^\]]+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="px-1.5 py-0.5 rounded bg-surface-high text-accent-dim text-[11px] font-mono">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("[Memory:")) {
      return (
        <span
          key={i}
          className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary/10 text-secondary border border-secondary/20 whitespace-nowrap align-middle"
        >
          <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  {
    title: "Summarize all prospects",
    desc: "Get an overview of everyone you've researched",
    prompt: "Give me a summary of all prospects I've researched so far — their names, companies, and the key pain points you found.",
  },
  {
    title: "Compare companies",
    desc: "Find patterns across researched companies",
    prompt: "Compare the companies I've researched. What industries are they in, what stage, and what common pain points do they share?",
  },
  {
    title: "Strongest buying signals",
    desc: "Who's most likely to convert?",
    prompt: "Which prospect has the strongest buying signals? What evidence supports this?",
  },
  {
    title: "Communication insights",
    desc: "Writing styles and how to approach",
    prompt: "What communication styles have you observed across the prospects? Who prefers formal vs casual tone?",
  },
];

// ── Main Chat Page ───────────────────────────────────────────────────────────

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const loaded = loadConversations();
    setConversations(loaded);
    if (loaded.length > 0) {
      setActiveId(loaded[0].id);
    }
  }, []);

  // Save to localStorage whenever conversations change
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations);
    }
  }, [conversations]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeId]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  const active = conversations.find((c) => c.id === activeId) || null;

  // ── Actions ──────────────────────────────────────────────────────────────

  function createConversation(firstMessage?: string): string {
    const convo: Conversation = {
      id: newId(),
      title: firstMessage ? firstMessage.slice(0, 50) : "New chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [convo, ...prev]);
    setActiveId(convo.id);
    return convo.id;
  }

  function deleteConversation(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      return next;
    });
    if (activeId === id) {
      setActiveId(conversations.find((c) => c.id !== id)?.id || null);
    }
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      let targetId = activeId;
      if (!targetId) {
        targetId = createConversation(text);
      }

      const userMsg: Message = { id: newId(), role: "user", content: text, timestamp: Date.now() };
      const assistantMsg: Message = { id: newId(), role: "assistant", content: "", streaming: true, timestamp: Date.now() };

      // Add both messages
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? {
                ...c,
                title: c.messages.length === 0 ? text.slice(0, 50) : c.title,
                messages: [...c.messages, userMsg, assistantMsg],
                updatedAt: Date.now(),
              }
            : c
        )
      );
      setInput("");
      setLoading(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        // Build history from current conversation
        const currentConvo = conversations.find((c) => c.id === targetId);
        const history = (currentConvo?.messages || [])
          .filter((m) => !m.streaming)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch(`${API}/chat/memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, history }),
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
                const acc = accumulated;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== targetId) return c;
                    const msgs = [...c.messages];
                    msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: acc, streaming: true };
                    return { ...c, messages: msgs };
                  })
                );
              }
            } catch {
              // malformed SSE
            }
          }
        }

        // Finalize
        const final = accumulated;
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== targetId) return c;
            const msgs = [...c.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: final, streaming: false };
            return { ...c, messages: msgs, updatedAt: Date.now() };
          })
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== targetId) return c;
            const msgs = [...c.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: "Something went wrong. Please try again.", streaming: false };
            return { ...c, messages: msgs };
          })
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, activeId, conversations],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ── Time formatting ────────────────────────────────────────────────────

  function timeLabel(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const isEmpty = !active || active.messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div
        className={`shrink-0 border-r border-card-border bg-surface-low flex flex-col transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        }`}
      >
        {/* New chat button */}
        <div className="p-3 border-b border-card-border">
          <button
            onClick={() => {
              createConversation();
              setInput("");
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-card-border text-sm text-foreground/80 hover:bg-card hover:border-accent/30 transition-colors"
          >
            <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 && (
            <p className="text-xs text-muted text-center py-8 px-4">No conversations yet</p>
          )}
          {conversations.map((convo) => (
            <div
              key={convo.id}
              className={`group flex items-center gap-2 mx-2 mb-0.5 rounded-lg cursor-pointer transition-colors ${
                convo.id === activeId
                  ? "bg-card border border-accent/20 text-foreground"
                  : "hover:bg-card/60 text-foreground/60 border border-transparent"
              }`}
            >
              <button
                onClick={() => setActiveId(convo.id)}
                className="flex-1 text-left px-3 py-2.5 min-w-0"
              >
                <p className="text-xs font-medium truncate">{convo.title}</p>
                <p className="text-[10px] text-muted mt-0.5">{timeLabel(convo.updatedAt)}</p>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(convo.id);
                }}
                className="pr-2 opacity-0 group-hover:opacity-100 text-muted hover:text-error transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-card-border">
          <div className="flex items-center gap-2 px-2">
            <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <span className="text-[10px] text-muted">Powered by Nester</span>
          </div>
        </div>
      </div>

      {/* ── Main Chat Area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="shrink-0 h-12 border-b border-card-border flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h2 className="text-sm font-medium text-foreground/80 truncate">
            {active?.title || "Nester Memory Chat"}
          </h2>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-[10px] text-muted">Nester AI</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            /* ── Empty state / Welcome ─────────────────────────────────── */
            <div className="flex flex-col items-center justify-center h-full px-6">
              <div className="max-w-2xl w-full">
                {/* Logo */}
                <div className="flex flex-col items-center mb-10">
                  <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/20 flex items-center justify-center mb-4">
                    <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight mb-2">Nester Memory Chat</h1>
                  <p className="text-sm text-muted text-center max-w-md">
                    Ask anything about prospects, companies, and research from your pipeline runs.
                    Every answer is grounded in your Nester knowledge base.
                  </p>
                </div>

                {/* Suggestion cards */}
                <div className="grid grid-cols-2 gap-3">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.title}
                      onClick={() => sendMessage(s.prompt)}
                      className="text-left p-4 rounded-xl border border-card-border bg-card hover:border-accent/30 hover:bg-card/80 transition-all group"
                    >
                      <p className="text-sm font-medium group-hover:text-accent-dim transition-colors mb-1">{s.title}</p>
                      <p className="text-xs text-muted">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ── Message thread ────────────────────────────────────────── */
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
              {active?.messages.map((msg) => (
                <div key={msg.id} className="animate-fade-in">
                  {msg.role === "user" ? (
                    /* User message */
                    <div className="flex gap-3 justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-tr-md px-4 py-3 bg-accent text-white">
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-1 text-[11px] font-bold text-white">
                        U
                      </div>
                    </div>
                  ) : (
                    /* Assistant message */
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-secondary/15 border border-secondary/20 flex items-center justify-center shrink-0 mt-1">
                        <svg className="w-3.5 h-3.5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 bg-card border border-card-border">
                        {msg.content ? (
                          <div>{renderMarkdown(msg.content)}</div>
                        ) : null}
                        {msg.streaming && (
                          <span className="inline-block w-2 h-4 bg-secondary/60 ml-0.5 animate-pulse rounded-sm align-middle" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Input area ────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-card-border px-6 py-4">
          <form
            onSubmit={handleSubmit}
            className="max-w-3xl mx-auto relative"
          >
            <div className="relative flex items-end gap-3 rounded-2xl border border-card-border bg-card px-4 py-3 focus-within:border-accent/40 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about prospects, companies, or research insights..."
                disabled={loading}
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted resize-none focus:outline-none disabled:opacity-50 max-h-32"
                style={{ minHeight: "24px" }}
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = "24px";
                  t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
                }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="shrink-0 w-8 h-8 rounded-lg bg-accent flex items-center justify-center disabled:opacity-30 hover:bg-accent/90 transition-colors"
              >
                {loading ? (
                  <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-center text-[10px] text-muted mt-2">
              Nester Memory Chat &middot; Answers grounded in your pipeline research &middot; Powered by Nester
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
