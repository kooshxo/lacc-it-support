import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderLaptopAgreementPdf, SIGNED_PDF_FIELD_LAYOUT } from "@/lib/agreements/laptop-pdf";

describe("approved LACC laptop letter PDF",()=>{
  const template=()=>readFile(new URL("../../public/templates/lacc-laptop-letter-background.jpg",import.meta.url));

  it("keeps the typed signature clear of the original Date label",()=>{
    expect(SIGNED_PDF_FIELD_LAYOUT.signature.coverX+SIGNED_PDF_FIELD_LAYOUT.signature.coverWidth).toBeLessThan(SIGNED_PDF_FIELD_LAYOUT.dateLabelStart);
    expect(SIGNED_PDF_FIELD_LAYOUT.signature.textX+SIGNED_PDF_FIELD_LAYOUT.signature.textWidth).toBeLessThan(SIGNED_PDF_FIELD_LAYOUT.dateLabelStart);
    expect(SIGNED_PDF_FIELD_LAYOUT.date.coverX).toBeGreaterThan(SIGNED_PDF_FIELD_LAYOUT.dateLabelStart);
  });

  it("creates a one-page flattened letter with the supplied synthetic signature",async()=>{
    const bytes=await renderLaptopAgreementPdf(await template(),{
      person_name:"Synthetic Sample Employee",manufacturer:"Example Computer Co.",inventory_number:"SYNTH-0001",
      model:"Notebook Pro",serial_number:"SYNTH-SERIAL",service_tag:"SYNTH-TAG",phone_number:"302-555-0100",issued_date:"2026-11-17",
    },{signerName:"Synthetic Sample Employee",signedAt:"2026-11-17T17:57:34.615Z"});
    expect(Buffer.from(bytes).subarray(0,4).toString()).toBe("%PDF");
    const pdf=await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({width:612,height:792});
    expect(pdf.getForm().getFields()).toHaveLength(0);
    expect(bytes.byteLength).toBeLessThan(5*1024*1024);
  });

  it("requires a real employee name but leaves missing device values blank",async()=>{
    const background=await template();
    await expect(renderLaptopAgreementPdf(background,{})).rejects.toThrow("The assigned employee name is required");
    const bytes=await renderLaptopAgreementPdf(background,{person_name:"Synthetic Employee"});
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
