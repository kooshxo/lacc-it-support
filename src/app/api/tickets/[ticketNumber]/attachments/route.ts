/** Attachments are intentionally unsupported: Google Sheets is the system of record. */
export async function POST() {
  return Response.json({ error: "Attachments are not supported for Google Sheet tickets." }, { status: 410 });
}
