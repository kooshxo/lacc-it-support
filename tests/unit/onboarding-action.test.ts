import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireEmployee, requireAgent, createOnboardingRequest, updateOnboardingStatus, revalidatePath } = vi.hoisted(() => ({
  requireEmployee: vi.fn(),
  requireAgent: vi.fn(),
  createOnboardingRequest: vi.fn(),
  updateOnboardingStatus: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ requireEmployee, requireAgent }));
vi.mock("@/lib/sql/it-operations", () => ({ createOnboardingRequest, updateOnboardingStatus }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

import { submitOnboardingRequest } from "@/app/(portal)/it/onboarding/actions";

function submission() {
  const form = new FormData();
  form.set("firstName", "New");
  form.set("lastName", "Employee");
  form.set("startDate", "2026-12-01");
  form.set("needByDate", "");
  form.append("needs", "Computer account / Cuenta de computadora");
  form.append("locations", "Remote / Remoto");
  form.set("sharedDriveAccess", "");
  form.set("equipmentDetails", "");
  form.set("contactEmail", "contact@thelatincenter.org");
  return form;
}

describe("employee New Hire Setup submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATA_BACKEND = "sql";
    createOnboardingRequest.mockResolvedValue({ id: "request-1", duplicate: false });
  });

  it("stores an employee-submitted request and returns to the employee confirmation view", async () => {
    requireEmployee.mockResolvedValue({ employeeUid: "employee-1", role: "EMPLOYEE" });

    await expect(submitOnboardingRequest(submission())).rejects.toThrow("REDIRECT:/requests/onboarding/new?submitted=1");

    expect(createOnboardingRequest).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "New",
      last_name: "Employee",
      start_date: "2026-12-01",
      requested_needs: ["Computer account / Cuenta de computadora"],
      work_locations: ["Remote / Remoto"],
      main_contact_email: "contact@thelatincenter.org",
    }), "employee-1");
    expect(revalidatePath).toHaveBeenCalledWith("/it/onboarding");
  });

  it("does not let an IT agent initiate a New Hire Setup request", async () => {
    requireEmployee.mockResolvedValue({ employeeUid: "shared-it", role: "IT_AGENT" });

    await expect(submitOnboardingRequest(submission())).rejects.toThrow("REDIRECT:/access-denied");

    expect(createOnboardingRequest).not.toHaveBeenCalled();
  });
});
