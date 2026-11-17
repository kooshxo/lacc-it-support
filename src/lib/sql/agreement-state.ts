export type AgreementLifecycle = "PENDING" | "SIGNED" | "PRINTED" | "HANDED_OFF";
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
