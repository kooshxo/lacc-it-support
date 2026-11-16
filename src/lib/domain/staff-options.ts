/** Compatibility fallback for non-Google ticket backends. Google uses native Sheet validation. */
export const completedByOptions = ["Duane", "Jose"] as const;
export type CompletedBy = (typeof completedByOptions)[number];

export function normalizeCompletedBy(value: string | undefined, options: readonly string[] = completedByOptions): string {
  const normalized = value?.trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized) ?? "";
}
