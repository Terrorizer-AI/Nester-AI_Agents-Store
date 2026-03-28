"use client";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

export default function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-card-border bg-card px-4 py-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
