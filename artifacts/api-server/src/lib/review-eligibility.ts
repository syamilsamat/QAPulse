import { db, rolesTable } from "@workspace/db";

/**
 * Who may peer-review an artifact.
 *
 * Review used to be a hardcoded list of role slugs per route, which made it
 * accidentally hierarchical: a QA Manager and every custom QA role created on
 * the Roles page were locked out of approving test cases, so a submission in
 * practice sat until a QA Lead or HOD picked it up.
 *
 * Eligibility is now derived from the `roles` table instead — any role in the
 * owning department reviews that department's work regardless of tier, so a
 * member reviews a peer's submission exactly as a lead does. Segregation of
 * duties is unchanged and still enforced per-route: the author of a record can
 * never approve or reject it, whatever their role.
 *
 * The static lists below remain only as the offline fallback for a role row
 * that predates the department/tier_rank columns (they are backfilled by
 * bootstrap() in routes/roles.ts, but a hand-inserted row can miss them).
 */
export type ReviewDomain = "qa" | "fa";

/** Departmentless roles that sit above the org chart — eligible everywhere. */
const UNRESTRICTED_ROLES = ["admin", "cto"];

/** tier_rank at or above which a role counts as leadership (see DEFAULT_ROLES). */
const LEAD_TIER = 2;

const FALLBACK: Record<ReviewDomain, string[]> = {
  qa: ["qa_member", "qa_lead", "qa_manager", "hod_qa"],
  fa: ["fa_member", "fa_lead", "hod_fa", "qa_lead", "qa_manager", "hod_qa"],
};

type RoleRow = { name: string; department: string | null; tierRank: number | null };

// Roles change only from the Roles page, which invalidates this explicitly;
// the TTL is just a backstop for a second API process holding a stale copy.
const CACHE_TTL_MS = 60_000;
let cache: { at: number; rows: RoleRow[] } | null = null;

/** Call after any write to the roles table so eligibility re-resolves at once. */
export function invalidateReviewEligibilityCache(): void {
  cache = null;
}

async function loadRoles(): Promise<RoleRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  try {
    const rows = await db
      .select({ name: rolesTable.name, department: rolesTable.department, tierRank: rolesTable.tierRank })
      .from(rolesTable);
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    // Roles table unreachable — fall back to the static lists rather than
    // locking every reviewer out.
    return cache?.rows ?? [];
  }
}

function eligible(domain: ReviewDomain, row: RoleRow): boolean {
  if (UNRESTRICTED_ROLES.includes(row.name)) return true;
  // Peer review: everyone in the owning department, member tier included.
  if (row.department === domain) return true;
  // QA leadership keeps its standing oversight of FA requirements (it is the
  // downstream consumer of them); it is not extended to QA members, whose
  // channel for a bad requirement is a requirement defect.
  if (domain === "fa" && row.department === "qa" && (row.tierRank ?? 1) >= LEAD_TIER) return true;
  return FALLBACK[domain].includes(row.name);
}

/** Every role slug that may review `domain` work — for notification fan-out. */
export async function reviewRoleNames(domain: ReviewDomain): Promise<string[]> {
  const rows = await loadRoles();
  if (rows.length === 0) return [...FALLBACK[domain], ...UNRESTRICTED_ROLES];
  return rows.filter((r) => eligible(domain, r)).map((r) => r.name);
}

/** Departmentless roles kept out of the "own department only" fallback below
 *  — the FA-oversight extension in FALLBACK.fa is QA leadership acting as a
 *  reviewer, not FA's own department. */
const DEPARTMENT_ONLY_FALLBACK: Record<ReviewDomain, string[]> = {
  qa: FALLBACK.qa,
  fa: ["fa_member", "fa_lead", "hod_fa"],
};

/**
 * Every role slug in `domain`'s own department (plus admin/cto) — narrower
 * than reviewRoleNames(), which also pulls in QA leadership's standing
 * FA-oversight fallback. Used where a notification should reach the record's
 * actual owning department, not everyone who happens to be eligible to
 * review it (DEF-0017 — a requirement submission shouldn't page QA Lead).
 */
export async function departmentRoleNames(domain: ReviewDomain): Promise<string[]> {
  const rows = await loadRoles();
  if (rows.length === 0) return [...DEPARTMENT_ONLY_FALLBACK[domain], ...UNRESTRICTED_ROLES];
  return rows.filter((r) => r.department === domain || UNRESTRICTED_ROLES.includes(r.name)).map((r) => r.name);
}

/** True when `role` may approve/reject `domain` work authored by someone else. */
export async function canReview(domain: ReviewDomain, role: string | null | undefined): Promise<boolean> {
  if (!role) return false;
  if (UNRESTRICTED_ROLES.includes(role)) return true;
  const rows = await loadRoles();
  const row = rows.find((r) => r.name === role);
  if (!row) return FALLBACK[domain].includes(role);
  return eligible(domain, row);
}

/**
 * True when `role` may approve/reject an execution file (test case sign-off)
 * — narrower than canReview("qa", ...), which stays open to qa_member for
 * submitting a file and for per-row peer acceptance. Signing a file off is
 * reserved for QA leadership: qa_lead and above.
 */
const FILE_APPROVAL_LEAD_TIER = 2;
const FILE_APPROVAL_FALLBACK = ["qa_lead", "qa_manager", "hod_qa"];

export async function canApproveExecutionFile(role: string | null | undefined): Promise<boolean> {
  if (!role) return false;
  if (UNRESTRICTED_ROLES.includes(role)) return true;
  const rows = await loadRoles();
  const row = rows.find((r) => r.name === role);
  if (!row) return FILE_APPROVAL_FALLBACK.includes(role);
  return row.department === "qa" && (row.tierRank ?? 1) >= FILE_APPROVAL_LEAD_TIER;
}

/** Every role slug that may approve/reject an execution file — for the
 *  "submitted for review" notification fan-out, so a qa_member (who can no
 *  longer act on it) isn't told to review something they can't approve. */
export async function fileApprovalRoleNames(): Promise<string[]> {
  const rows = await loadRoles();
  if (rows.length === 0) return [...FILE_APPROVAL_FALLBACK, ...UNRESTRICTED_ROLES];
  return rows.filter((r) => r.department === "qa" && (r.tierRank ?? 1) >= FILE_APPROVAL_LEAD_TIER).map((r) => r.name);
}
