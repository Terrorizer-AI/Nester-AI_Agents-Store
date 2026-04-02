"use client";

import { useEffect, useRef } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when opened; close on Escape
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const variantStyles = {
    danger:  { btn: "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30", icon: "text-red-400", iconBg: "bg-red-500/10 border-red-500/20" },
    warning: { btn: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/30", icon: "text-yellow-400", iconBg: "bg-yellow-500/10 border-yellow-500/20" },
    default: { btn: "bg-accent/20 border-accent/40 text-accent hover:bg-accent/30", icon: "text-accent", iconBg: "bg-accent/10 border-accent/20" },
  }[variant];

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-outline/20 bg-card shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* Top accent line */}
        <div className={`h-px w-full ${variant === "danger" ? "bg-gradient-to-r from-transparent via-red-500/60 to-transparent" : variant === "warning" ? "bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" : "bg-gradient-to-r from-transparent via-accent/60 to-transparent"}`} />

        <div className="px-6 py-5">
          {/* Icon + Title */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`flex-shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center ${variantStyles.iconBg}`}>
              {variant === "danger" ? (
                <svg className={`w-4 h-4 ${variantStyles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              ) : variant === "warning" ? (
                <svg className={`w-4 h-4 ${variantStyles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              ) : (
                <svg className={`w-4 h-4 ${variantStyles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-foreground leading-tight">{title}</h3>
              <p className="mt-1 text-xs text-muted/70 leading-relaxed">{message}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-xs font-semibold border border-outline/20 text-muted hover:text-foreground hover:border-outline/40 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${variantStyles.btn}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
