export type AgreementLifecycle = "PENDING" | "SIGNED" | "PRINTED" | "HANDED_OFF" | "COMPLETED";
/** The approved source document is a laptop letter; other categories are ineligible. */
export function isLaptopAgreementCategory(category: unknown) {
  return typeof category === "string" && category.trim().toLocaleLowerCase("en-US") === "laptop";
}
export function isElectronicAgreementWorkflowEnabled() {
  return process.env.ELECTRONIC_AGREEMENTS_ENABLED === "true";
}
const agreementTermsBody = `property of the Latin American Community Center.\n\nThis Agency Laptop is to be used only for purposes relating to my work at the LACC. The device will not be handled in a manner that places it at a probable risk* of becoming lost, stolen, or damaged in any way. Loss of and any damage that this laptop incurs must be immediately reported to the Information Technology department of the LACC.\n\nI understand that I must return this Laptop, cellular, my office keys, and my LACC Agency ID upon ending my employment at the Latin American Community Center.\n\n*It will be determined solely by the IT department if a risk is considered to be a “probable risk”.`;
/** Verbatim approved legal wording; identity and laptop fields are rendered from the assignment snapshot. */
export function laptopAgreementTerms() { return agreementTermsBody; }
export function canMarkAgreementPrinted(status:string){return status==="SIGNED";}
export function canMarkAgreementHandedOff(status:string){return status==="PRINTED";}

export function agreementNextAction(input: {
  status: AgreementLifecycle;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
  now?: Date;
}) {
  if (input.revokedAt) return "REVOKED" as const;
  const expired = new Date(input.expiresAt).getTime() <= (input.now ?? new Date()).getTime();
  if (input.status === "PENDING" && expired) return "EXPIRED" as const;
  if (input.status === "PENDING") return "AWAITING_SIGNATURE" as const;
  if (input.status === "SIGNED") return "PRINT" as const;
  if (input.status === "PRINTED") return "HAND_OFF" as const;
  if (input.status === "COMPLETED") return "COMPLETE" as const;
  return "COMPLETE" as const;
}

export function validateSignerInput(name: string, consent: boolean) {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  return {
    valid: normalizedName.length > 0 && normalizedName.length <= 200 && consent,
    normalizedName,
  };
}

export function isValidAgreementToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
