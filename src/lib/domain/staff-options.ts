/** Initial approved technician choices for spreadsheet column P. */
export const completedByOptions = ["Duane", "Jose"] as const;
export type CompletedBy = (typeof completedByOptions)[number];

export function normalizeCompletedBy(value: string | undefined, options: readonly string[] = completedByOptions): string {
  const normalized = value?.trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized) ?? "";
}
