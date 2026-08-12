export function percentile(samples: number[], quantile: number) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const bounded = Math.max(0, Math.min(1, quantile));
  const index = Math.max(0, Math.ceil(bounded * sorted.length) - 1);
  return sorted[index];
}
