import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Employee } from "@/lib/domain/models";
import { getRepository } from "@/lib/excel";

export async function getOptionalEmployee(): Promise<Employee | null> {
  let email: string | null | undefined;
  if (process.env.AUTH_BYPASS === "true") email = process.env.DEMO_USER_EMAIL ?? "it.staff@thelatincenter.org";
  else email = (await auth())?.user?.email;
  if (!email) return null;
  return getRepository().getEmployeeByEmail(email);
}

export async function requireEmployee() { const employee = await getOptionalEmployee(); if (!employee) redirect("/api/auth/signin"); return employee; }
export async function requireAgent() { const employee = await requireEmployee(); if (employee.role === "EMPLOYEE") redirect("/access-denied"); return employee; }
export async function requireAdmin() { const employee = await requireEmployee(); if (employee.role !== "ADMIN") redirect("/access-denied"); return employee; }
