import { describe, expect, it } from "vitest";
import { agreementNextAction, canMarkAgreementHandedOff, canMarkAgreementPrinted, isLaptopAgreementCategory, isValidAgreementToken, laptopAgreementTerms, validateSignerInput } from "@/lib/sql/agreement-state";

describe("equipment agreement lifecycle helpers",()=>{
  const expiresAt="2026-11-24T17:00:00.000Z";
  it("exposes only the next valid physical workflow action",()=>{
    const now=new Date("2026-11-20T00:00:00.000Z");
    expect(agreementNextAction({status:"PENDING",expiresAt,revokedAt:null,now})).toBe("AWAITING_SIGNATURE");
    expect(agreementNextAction({status:"SIGNED",expiresAt,revokedAt:null,now})).toBe("PRINT");
    expect(agreementNextAction({status:"PRINTED",expiresAt,revokedAt:null,now})).toBe("HAND_OFF");
    expect(agreementNextAction({status:"HANDED_OFF",expiresAt,revokedAt:null,now})).toBe("COMPLETE");
    expect(canMarkAgreementPrinted("SIGNED")).toBe(true);
    expect(canMarkAgreementPrinted("PENDING")).toBe(false);
    expect(canMarkAgreementHandedOff("PRINTED")).toBe(true);
    expect(canMarkAgreementHandedOff("SIGNED")).toBe(false);
  });
  it("treats expiry boundary and revocation as unavailable",()=>{
    const boundary=new Date(expiresAt);
    expect(agreementNextAction({status:"PENDING",expiresAt,revokedAt:null,now:boundary})).toBe("EXPIRED");
    expect(agreementNextAction({status:"PENDING",expiresAt,revokedAt:"2026-11-21T00:00:00.000Z",now:new Date("2026-11-20T00:00:00.000Z")})).toBe("REVOKED");
  });
  it("normalizes a typed name and requires explicit consent",()=>{
    expect(validateSignerInput("  María   Rivera ",true)).toEqual({valid:true,normalizedName:"María Rivera"});
    expect(validateSignerInput("María Rivera",false).valid).toBe(false);
    expect(validateSignerInput("  ",true).valid).toBe(false);
    expect(validateSignerInput("x".repeat(201),true).valid).toBe(false);
  });
  it("accepts only the 32-byte base64url bearer-token shape",()=>{
    expect(isValidAgreementToken("A".repeat(43))).toBe(true);
    expect(isValidAgreementToken("A".repeat(42))).toBe(false);
    expect(isValidAgreementToken(`${"A".repeat(42)}.`)).toBe(false);
  });
  it("limits the supervisor-approved letter to laptops and reproduces its terms with assigned device details",()=>{
    expect(isLaptopAgreementCategory(" Laptop ")).toBe(true);
    for (const category of ["Phone", "Mobile phone", "Tablet", "Desktop", "Laptop bag", null]) {
      expect(isLaptopAgreementCategory(category)).toBe(false);
    }
    const text=laptopAgreementTerms();
    expect(text).toContain("property of the Latin American Community Center.\n\nThis Agency Laptop is to be used only for purposes relating to my work at the LACC.");
    expect(text).toContain("I understand that I must return this Laptop, cellular, my office keys, and my LACC Agency ID upon ending my employment at the Latin American Community Center.");
    expect(text).not.toContain("the equipment identified above");
    expect(text).not.toContain("This equipment is property of");
  });
});
