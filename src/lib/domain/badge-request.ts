import { z } from 'zod';
export const badgeRequestSchema = z.object({
  operationUid: z.uuid(),
  requestType: z.enum(['New badge','Replacement badge','Access / PIN only']),
  department: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(60),
  extension: z.string().trim().max(20),
  supervisorEmail: z.email().max(254).refine(value=>value.toLowerCase().endsWith('@thelatincenter.org')),
  preferredPin: z.string().trim().regex(/^(?:|\d{4,12})$/, "Use 4–12 digits for the preferred PIN."),
  badgeNumber: z.string().trim().max(80),
  details: z.string().trim().min(10).max(4000),
}).superRefine((value, context)=>{
  if(value.requestType==='Replacement badge'&&!value.badgeNumber) context.addIssue({code:'custom',path:['badgeNumber'],message:'Enter the existing badge number, or unknown.'});
});
