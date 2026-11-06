export function ticketNumberFromUid(ticketUid: string, year = new Date().getUTCFullYear()) {
  const compact = ticketUid.replaceAll("-", "").slice(0, 10).toUpperCase();
  return `LACC-${year}-${compact}`;
}
