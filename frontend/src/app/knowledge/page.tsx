"use client";

import { useState, useRef, useCallback } from "react";
import KnowledgePanel from "@/components/KnowledgePanel";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ACCEPTED = ".pdf,.docx,.pptx,.txt,.md,.csv";

function LocalUpload({ onIndexed }: { onIndexed: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const valid = Array.from(incoming).filter(f =>
      /\.(pdf|docx|pptx|txt|md|csv)$/i.test(f.name)
    );
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...valid.filter(f => !names.has(f.name))];
    });
  };

  const removeFile = (name: string) =>
    setFiles(prev => prev.filter(f => f.name !== name));

  const handleUpload = useCallback(async () => {
    if (!files.length || uploading) return;
    setUploading(true);
    setMsg("");
    setProcessing(files.map(f => f.name));

    const form = new FormData();
    files.forEach(f => form.append("files", f));

    try {
      const res = await fetch(`${API}/knowledge/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        setMsg(err.detail || "Upload failed");
        setProcessing([]);
        setUploading(false);
        return;
      }

      // Poll every 2s until doc count increases or 90s timeout
      const startRes = await fetch(`${API}/knowledge/status`);
      const startData = startRes.ok ? await startRes.json() : {};
      const startChunks = startData.chunk_count || 0;
      let elapsed = 0;

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        elapsed += 2000;
        try {
          const s = await fetch(`${API}/knowledge/status`).then(r => r.ok ? r.json() : null);
          const done = (s?.chunk_count || 0) > startChunks || elapsed >= 90000;
          if (done) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setProcessing([]);
            setUploading(false);
            setFiles([]);
            setMsg(`✓ ${files.length} file(s) indexed`);
            setTimeout(() => setMsg(""), 3000);
            onIndexed();
          }
        } catch {}
      }, 2000);
    } catch {
      setMsg("Network error — is the backend running?");
      setProcessing([]);
      setUploading(false);
    }
  }, [files, uploading, onIndexed]);

  const mimeIcon = (name: string) => {
    if (name.endsWith(".pdf")) return "📕";
    if (name.endsWith(".pptx")) return "📊";
    if (name.endsWith(".docx")) return "📄";
    if (name.endsWith(".csv")) return "📋";
    return "📝";
  };

  return (
    <div className="rounded-xl border border-outline/20 bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-foreground mb-0.5">Upload from Computer</h3>
        <p className="text-xs text-muted/50">PDF, DOCX, PPTX, TXT, MD, CSV</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 cursor-pointer transition-all ${
          dragging ? "border-accent bg-accent/5" : "border-outline/20 hover:border-accent/40 hover:bg-accent/3"
        }`}
      >
        <svg className="w-8 h-8 text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground/60">Drop files here or click to browse</p>
          <p className="text-xs text-muted/40 mt-0.5">PDF · DOCX · PPTX · TXT · MD · CSV</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(f => {
            const isProcessing = processing.includes(f.name);
            return (
              <div key={f.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-outline/15 bg-surface/30">
                <span className="text-base flex-shrink-0">{mimeIcon(f.name)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground/80 truncate">{f.name}</p>
                  {isProcessing ? (
                    <div className="mt-1 h-0.5 rounded-full bg-outline/20 overflow-hidden">
                      <div className="h-full bg-accent/60 animate-pulse w-3/4" />
                    </div>
                  ) : (
                    <p className="text-[0.6rem] text-muted/40">{(f.size / 1024).toFixed(0)} KB</p>
                  )}
                </div>
                {isProcessing ? (
                  <svg className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <button
                    onClick={() => removeFile(f.name)}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-error/40 hover:text-error hover:bg-error/10 text-xs font-bold transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {msg && (
        <p className={`text-xs text-center ${msg.startsWith("✓") ? "text-secondary" : "text-error"}`}>{msg}</p>
      )}

      {files.length > 0 && !uploading && (
        <button
          onClick={handleUpload}
          className="w-full py-2.5 rounded-lg bg-accent/20 border border-accent/30 text-accent text-xs font-bold hover:bg-accent/30 transition-colors"
        >
          Index {files.length} file{files.length > 1 ? "s" : ""} →
        </button>
      )}

      {uploading && processing.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-1">
          <svg className="w-3.5 h-3.5 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-xs text-accent font-semibold">Indexing — this takes ~30s per file…</span>
        </div>
      )}
    </div>
  );
}

export default function KnowledgePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground mb-1">Company Knowledge</h1>
        <p className="text-sm text-foreground/40">
          Connect Google Drive docs or upload files directly — agents use this context to personalize every outreach.
        </p>
      </div>

      {/* Local upload */}
      <LocalUpload onIndexed={() => setRefreshKey(k => k + 1)} />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-outline/15" />
        <span className="text-[0.6rem] uppercase tracking-widest text-muted/40 font-bold">or connect Google Drive</span>
        <div className="flex-1 h-px bg-outline/15" />
      </div>

      {/* Google Drive panel */}
      <KnowledgePanel key={refreshKey} />
    </div>
  );
}
