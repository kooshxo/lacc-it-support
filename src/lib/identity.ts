export function isLaccEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^@\s]+@thelatincenter\.org$/i.test(value);
}
export function staffRole(email: string): 'EMPLOYEE' | 'IT_AGENT' | 'ADMIN' {
  const contains=(key:string)=>(process.env[key]??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
  return contains('IT_ADMIN_EMAILS')?'ADMIN':contains('IT_STAFF_EMAILS')?'IT_AGENT':'EMPLOYEE';
}
