import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

export const LAPTOP_TEMPLATE_URL = "/templates/lacc-laptop-letter-background.jpg";
export const ELECTRONIC_SIGNATURE_CONSENT_TEXT = "I agree that typing my full name and submitting this form is my electronic signature for this agreement.";

export type LaptopAgreementPdfData = {
  person_name?: unknown;
  manufacturer?: unknown;
  inventory_number?: unknown;
  model?: unknown;
  serial_number?: unknown;
  service_tag?: unknown;
  phone_number?: unknown;
  issued_date?: unknown;
};

function value(input: unknown) {
  return typeof input === "string" ? input.trim() : input == null ? "" : String(input).trim();
}

function fitSize(font: PDFFont, text: string, maxWidth: number, preferred: number, minimum = 7) {
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  if (font.widthOfTextAtSize(text, size) > maxWidth) throw new Error("An agreement field is too long to fit in the approved document layout.");
  return size;
}

function dateOnly(input: unknown) {
  const raw = value(input);
  if (!raw) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function dateAndTime(input: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(input));
}

/**
 * Recreates the approved scanned letter as a flattened, one-page PDF. The
 * background must be the sanitized organization template; all values are drawn
 * as ordinary PDF page content, never as editable AcroForm fields.
 */
export async function renderLaptopAgreementPdf(
  backgroundJpeg: Uint8Array,
  data: LaptopAgreementPdfData,
  options: { signerName?: string; signedAt?: string } = {},
) {
  const personName = value(data.person_name);
  if (!personName) throw new Error("The assigned employee name is required to create an agreement PDF.");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const image = await pdf.embedJpg(backgroundJpeg);
  page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const signatureFont = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const black = rgb(0.04, 0.04, 0.04);

  const issueDate = dateOnly(data.issued_date);
  if (issueDate) page.drawText(`${issueDate}.`, { x: 192, y: 629, size: 10, font: normal, color: black });

  const phrase = " I am now in possession of a:";
  const maxLine = 360;
  const nameSize = fitSize(bold, `${personName}.`, maxLine - normal.widthOfTextAtSize(phrase, 10), 10, 7);
  page.drawText(`${personName}.`, { x: 192, y: 608, size: nameSize, font: bold, color: black });
  page.drawText(phrase, { x: 192 + bold.widthOfTextAtSize(`${personName}.`, nameSize), y: 608, size: 10, font: normal, color: black });

  const fields: Array<[unknown, number, number]> = [
    [data.manufacturer, 300.5, 584],
    [data.inventory_number, 321.5, 569],
    [data.model, 299.5, 554],
    [data.serial_number, 300.5, 539],
    [data.service_tag, 300, 523],
    [data.phone_number, 301.5, 508],
  ];
  for (const [raw, x, y] of fields) {
    const text = value(raw);
    if (!text) continue; // Missing inventory values remain blank; never fabricate them.
    const size = fitSize(bold, text, 552 - x, 10, 7);
    page.drawText(text, { x, y, size, font: bold, color: black });
  }

  if (options.signerName && options.signedAt) {
    const signer = value(options.signerName);
    const signSize = fitSize(signatureFont, signer, 176, 16, 9);
    // Cover only the original blank signature/date rules so flattened marks
    // sit cleanly above them; labels and witness fields remain intact.
    page.drawRectangle({ x: 245, y: 294, width: 190, height: 25, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 470, y: 294, width: 97, height: 25, color: rgb(1, 1, 1) });
    page.drawText(signer, { x: 252, y: 301, size: signSize, font: signatureFont, color: black });
    const timestamp=dateAndTime(options.signedAt);
    const timestampSize=fitSize(normal,timestamp,94,7.2,6);
    page.drawText(timestamp, { x: 472, y: 301, size: timestampSize, font: normal, color: black });
  }
  return pdf.save({ useObjectStreams: false });
}
