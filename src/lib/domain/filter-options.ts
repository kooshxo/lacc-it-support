export function distinctTrimmedStrings(values: readonly unknown[]): string[] {
  const options = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) options.add(normalized);
  }
  return [...options].sort((a, b) => a.localeCompare(b));
}
