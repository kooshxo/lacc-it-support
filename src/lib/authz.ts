import "server-only";
import { redirect } from "next/navigation";
import { staffRole } from "@/lib/identity";
import { auth } from "@/auth";
import type { Employee } from "@/lib/domain/models";
import { getRepository } from "@/lib/excel";

export async function getOptionalEmployee(): Promise<Employee | null> {
  let email: string | null | undefined;
  if (process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production") {
    if (process.env.DATA_BACKEND === "sql") return {
      employeeUid: "e2e-shared-it", email: "it-staff@shared.invalid", displayName: "IT Staff",
      departmentUid: "IT", locationUid: "", role: "IT_AGENT", active: true,
    };
    email = process.env.DEMO_USER_EMAIL ?? "it.staff@thelatincenter.org";
  }
  else {
    const session = await auth();
    email = session?.user?.email;
    if (process.env.DATA_BACKEND === "sql") {
      if (session?.user?.id !== "shared-it") return null;
      return {
        employeeUid: "shared-it",
        email: "it-staff@shared.invalid",
        displayName: "IT Staff",
        departmentUid: "IT",
        locationUid: "",
        role: "IT_AGENT",
        active: true,
      };
    }
    if (session?.user?.id === "shared-it") {
      return null;
    }
  }
  if (!email) return null;
  if (process.env.NODE_ENV === "production" && staffRole(email) === "EMPLOYEE") return null;
  return getRepository().getEmployeeByEmail(email);
}

export async function requireEmployee() { const employee = await getOptionalEmployee(); if (!employee) redirect("/api/auth/signin"); return employee; }
export async function requireAgent() { const employee = await requireEmployee(); if (employee.role === "EMPLOYEE") redirect("/access-denied"); return employee; }
export async function requireAdmin() { const employee = await requireEmployee(); if (employee.role !== "ADMIN") redirect("/access-denied"); return employee; }
