export function ticketMetadataVersion(sourceRow: number, values: string[]): number {
  const input = `${sourceRow}|${values.join("|")}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0) || 1;
}
