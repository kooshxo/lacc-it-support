const spanishMarkers = /\b(el|la|los|las|que|una|uno|por|para|con|del|está|necesito|ayuda|problema|correo|contraseña|computadora|impresora)\b|[áéíóúñ¿¡]/i;
export function isSpanishText(value: string): boolean { return spanishMarkers.test(value); }
export async function translateTicketDescription(value: string): Promise<string | null> {
  if (!value.trim() || !isSpanishText(value)) return null;
  try {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams({ client: "gtx", sl: "es", tl: "en", dt: "t", q: value }).toString();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) return null;
    const translated = payload[0].map((part) => Array.isArray(part) ? String(part[0] ?? "") : "").join("").trim();
    return translated && translated !== value.trim() ? translated : null;
  } catch { return null; }
}
