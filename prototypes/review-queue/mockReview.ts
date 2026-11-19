export type Role = "Admin" | "Class rep" | "Unassigned rep";
export const dept = "Computer Science";
export const levels = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "Class of 2026",
];
export const formatLevel = (s: string) => (/^\d+$/.test(s) ? `${s} Level` : s);
export interface Application {
  id: string;
  name: string;
  department: string;
  kind: "Student" | "Staff";
  level: string;
  cohort: string;
  hours: number;
  proof: string;
  invited?: boolean;
  status: "ready" | "approved" | "rejected" | "incomplete";
  reason?: string;
  confirmed?: string;
}
const sample = (
  n: number,
  name: string,
  hours: number,
  extra: Partial<Application> = {}
): Application => ({
  id: `DEMO-${String(n).padStart(3, "0")}`,
  name,
  hours,
  department: dept,
  kind: "Student",
  level: "200",
  cohort: "200",
  proof: "Course registration form",
  status: "ready",
  ...extra,
});
const seed = [
  sample(1, "Ada Dalo", 28),
  sample(2, "Tomi Bako", 21, { invited: true }),
  sample(3, "Lami Koro", 17, {
    department: "Biology",
    level: "Class of 2026",
    cohort: "Class of 2026",
    proof: "Graduate record",
  }),
  sample(4, "Sam Dera", 12, {
    kind: "Staff",
    level: "",
    proof: "Employment document",
  }),
  sample(5, "Reni Moro", 8, {
    kind: "Staff",
    department: "Biology",
    level: "",
    proof: "Verified GSU staff email",
  }),
  sample(6, "Ali Teno", 6, {
    kind: "Staff",
    level: "",
    proof: "Confirmed departmental vouch",
  }),
  sample(7, "Ira Dami", 4, {
    kind: "Staff",
    level: "",
    proof: "Staff ID photo",
  }),
  sample(8, "Ayo Biri", 2, { status: "incomplete", proof: "" }),
];
const scoped = (role: Role, c: Application) =>
  role === "Admin" ||
  (role === "Class rep" &&
    c.kind === "Student" &&
    c.department === dept &&
    c.cohort === "200");
export function createMockReview() {
  const cases = seed.map((c) => ({ ...c }));
  let revision = 1;
  let expires = Date.now() + 7 * 86400000;
  return {
    list: (r: Role) =>
      cases
        .filter((c) => scoped(r, c) && c.status === "ready" && c.proof)
        .sort((a, b) => b.hours - a.hours)
        .map((c) => ({ ...c })),
    decide(
      r: Role,
      id: string,
      decision: "approved" | "rejected",
      level: string,
      reason: string
    ) {
      const c = cases.find((c) => c.id === id);
      if (!c || !scoped(r, c)) throw Error("Outside your review scope.");
      if (c.status !== "ready" || !c.proof)
        throw Error(
          "Another reviewer updated this case. No decision was recorded here."
        );
      if (decision === "rejected" && !reason.trim())
        throw Error("Add an applicant-visible reason.");
      if (
        decision === "approved" &&
        c.kind === "Student" &&
        (!levels.includes(level) ||
          (r === "Class rep" && level !== c.cohort) ||
          (c.level === "Class of 2026") !== (level === "Class of 2026"))
      )
        throw Error(
          "Level is outside this review. Ask an admin to resolve the discrepancy or return it for correction."
        );
      c.status = decision;
      c.reason = decision === "rejected" ? reason.trim() : undefined;
      c.confirmed =
        decision === "approved" && c.kind === "Student" ? level : undefined;
    },
    simulate(id: string) {
      const c = cases.find((c) => c.id === id);
      if (c?.status === "ready") c.status = "approved";
    },
    invite(r: Role, replace = false) {
      if (r !== "Class rep") throw Error("Confirmed rep scope required.");
      if (replace) {
        revision++;
        expires = Date.now() + 7 * 86400000;
      }
      return {
        link: `https://example.invalid/register?invite=demo-${revision}`,
        expires,
      };
    },
  };
}
