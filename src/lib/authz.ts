import "server-only";
import { redirect } from "next/navigation";
import { isLaccEmail, staffRole } from "@/lib/identity";
import { auth } from "@/auth";
import type { Employee } from "@/lib/domain/models";
import { getRepository } from "@/lib/excel";

export async function getOptionalEmployee(): Promise<Employee | null> {
  let email: string | null | undefined;
  if (process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production") email = process.env.DEMO_USER_EMAIL ?? "it.staff@thelatincenter.org";
  else {
    const session = await auth();
    email = session?.user?.email;
    if (process.env.DATA_BACKEND === "sql" && email && session?.user?.id) {
      const role = staffRole(email);
      const microsoft = session.user.id.startsWith(`${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}:`);
      if ((!microsoft || !isLaccEmail(email)) && role === "EMPLOYEE") return null;
      return { employeeUid: session.user.id, email, displayName: session.user.name || email, departmentUid: "", locationUid: "", role, active: true };
    }
  }
  if (!email) return null;
  if (process.env.NODE_ENV === "production" && staffRole(email) === "EMPLOYEE") return null;
  return getRepository().getEmployeeByEmail(email);
}

export async function requireEmployee() { const employee = await getOptionalEmployee(); if (!employee) redirect("/api/auth/signin"); return employee; }
export async function requireAgent() { const employee = await requireEmployee(); if (employee.role === "EMPLOYEE") redirect("/access-denied"); return employee; }
export async function requireAdmin() { const employee = await requireEmployee(); if (employee.role !== "ADMIN") redirect("/access-denied"); return employee; }
