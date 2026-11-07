import { z } from "zod";

export const onboardingNeeds = [
  "Computer account / Cuenta de computadora",
  "Email account / Cuenta de correo",
  "Office extension / Extensión telefónica",
  "Desktop setup / Configuración de computadora",
  "Laptop setup / Configuración de laptop",
  "Staff badge / Credencial de empleado",
  "VPN access / Acceso VPN",
  "LACC cellphone / Celular LACC",
] as const;

export const onboardingLocations = [
  "Remote / Remoto",
  "EDC Department 1st floor main building",
  "EDC Department 2nd floor main building",
  "EDC Department - New Castle site",
  "YD Department 2nd floor main building",
  "YD Department - New Castle site",
  "FSS Department 3rd floor main building",
  "FSS Department - New Castle site",
  "P&A Department MOB building",
  "P&A Department New Castle site",
  "P&A Department Main building",
  "Facilities Department main building",
  "Facilities Department MOB building",
  "Facilities Department New Castle site",
  "Custodial main Building",
  "Custodial MOB",
  "Custodial main New Castle site",
] as const;

const laccEmail = z.string().trim().email().max(254).refine((value) => value.toLowerCase().endsWith("@thelatincenter.org"));

export const onboardingRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  startDate: z.iso.date(),
  needByDate: z.union([z.literal(""), z.iso.date()]).default(""),
  needs: z.array(z.enum(onboardingNeeds)).min(1).max(20),
  locations: z.array(z.string().trim().min(1).max(160)).min(1).max(30),
  sharedDriveAccess: z.string().trim().max(4000).default(""),
  equipmentDetails: z.string().trim().max(4000).default(""),
  contactEmail: laccEmail.optional(),
}).strict();

export type OnboardingRequestSubmission = z.infer<typeof onboardingRequestSchema>;
