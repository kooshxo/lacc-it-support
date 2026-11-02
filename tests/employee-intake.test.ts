import { afterEach, describe, expect, it } from 'vitest';
import { isLaccEmail, staffRole } from '../src/lib/identity';
import { badgeRequestSchema } from '../src/lib/domain/badge-request';
const originalStaff=process.env.IT_STAFF_EMAILS, originalAdmin=process.env.IT_ADMIN_EMAILS;
afterEach(()=>{if(originalStaff===undefined)delete process.env.IT_STAFF_EMAILS;else process.env.IT_STAFF_EMAILS=originalStaff;if(originalAdmin===undefined)delete process.env.IT_ADMIN_EMAILS;else process.env.IT_ADMIN_EMAILS=originalAdmin;});
describe('Employee intake boundaries',()=>{
  it('accepts only the exact work domain',()=>{expect(isLaccEmail('Person@thelatincenter.org')).toBe(true);for(const email of ['person@thelatincenter.org.attacker.com','person@sub.thelatincenter.org','person@gmail.com','@thelatincenter.org'])expect(isLaccEmail(email)).toBe(false);});
  it('does not elevate unlisted users',()=>{process.env.IT_STAFF_EMAILS='agent@thelatincenter.org';process.env.IT_ADMIN_EMAILS='admin@thelatincenter.org';expect(staffRole('employee@thelatincenter.org')).toBe('EMPLOYEE');expect(staffRole('AGENT@thelatincenter.org')).toBe('IT_AGENT');expect(staffRole('admin@thelatincenter.org')).toBe('ADMIN');});
  it('requires an existing badge only for replacements',()=>{const input={operationUid:'00000000-0000-4000-8000-000000000001',requestType:'Access / PIN only',department:'IT',location:'Main',phone:'',extension:'',supervisorEmail:'boss@thelatincenter.org',badgeNumber:'',preferredPin:'',details:'Access to main entrance'};expect(badgeRequestSchema.safeParse(input).success).toBe(true);expect(badgeRequestSchema.safeParse({...input,requestType:'Replacement badge'}).success).toBe(false);expect(badgeRequestSchema.safeParse({...input,preferredPin:'abcd'}).success).toBe(false);});
});
