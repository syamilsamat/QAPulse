/**
 * Content for the client-demo dataset: two realistic projects (an e-commerce
 * customer portal and a mobile banking app), each with a full sprint/release
 * history — milestones spanning completed/at-risk/overdue/planned, a real
 * requirement hierarchy with FA review states, test cases, execution results,
 * defects (including a production escape with root-cause analysis), and
 * tasks spread across a team.
 *
 * This file is pure data — no API calls. seed-demo-data.ts reads it and
 * creates everything via the real endpoints; clear-demo-data.ts tears it
 * back down via the manifest that seeding produces.
 *
 * All dates are anchored to "today" = 2026-07-05 so the schedule-risk story
 * (on-track / at-risk / overdue / planned) actually lands when demoed.
 */

export const DEMO_PASSWORD = "Demo@2026";

export interface DemoUser {
  key: string;
  name: string;
  email: string;
  role: string;
}

export const USERS: DemoUser[] = [
  { key: "amir", name: "Amir Rahman", email: "amir.rahman@demo.qapulse.local", role: "pm_lead" },
  { key: "nadia", name: "Nadia Sulaiman", email: "nadia.sulaiman@demo.qapulse.local", role: "qa_lead" },
  { key: "farid", name: "Farid Karim", email: "farid.karim@demo.qapulse.local", role: "qa_member" },
  { key: "weiling", name: "Wei Ling Tan", email: "wei.ling@demo.qapulse.local", role: "qa_member" },
  { key: "siti", name: "Siti Hassan", email: "siti.hassan@demo.qapulse.local", role: "fa_lead" },
  { key: "devan", name: "Devan Kumar", email: "devan.kumar@demo.qapulse.local", role: "dev_lead" },
  // Individual-contributor developer under Devan (dev_lead) — on both
  // projects so the PM Dashboard's per-project Capacity table shows the
  // same person with a different workload depending on the project.
  { key: "hafiz", name: "Hafiz Rosli", email: "hafiz.rosli@demo.qapulse.local", role: "dev_member" },
  // CR035 — not on portal-squad and not in any directMemberKeys, so her
  // only project access is the module-scoped grant seeded below. Exists
  // purely to demonstrate the "project + module" scope on the new Project
  // Access panel — not used anywhere else in the seed flow.
  { key: "aisyah", name: "Aisyah Rahim", email: "aisyah.rahim@demo.qapulse.local", role: "qa_member" },
];

export interface DemoTeam {
  key: string;
  name: string;
  department: string;
  members: { userKey: string; role: "member" | "lead" }[];
}

export const TEAMS: DemoTeam[] = [
  {
    key: "portal-squad",
    name: "Customer Portal Squad",
    department: "qa",
    members: [
      { userKey: "nadia", role: "lead" },
      { userKey: "farid", role: "member" },
    ],
  },
  {
    key: "banking-squad",
    name: "Banking App Squad",
    department: "qa",
    members: [{ userKey: "weiling", role: "member" }],
  },
];

export interface DemoProject {
  key: string;
  name: string;
  description: string;
  teamKey: string;
  directMemberKeys: string[]; // cross-cutting roles added via project_members
  // CR035 — which of the global MODULES catalog apply to this project
  // (project_modules). "Authentication" deliberately appears on both demo
  // projects, to show a module can belong to more than one project.
  moduleNames: string[];
}

export const PROJECTS: DemoProject[] = [
  {
    key: "portal",
    name: "Customer Portal Revamp — DEMO",
    description: "Modernization of the customer-facing web portal: auth, search, checkout, cart, and wishlist.",
    teamKey: "portal-squad",
    directMemberKeys: ["amir", "siti", "devan", "hafiz"],
    moduleNames: ["Authentication", "Search", "Checkout", "Cart", "Wishlist"],
  },
  {
    key: "banking",
    name: "Mobile Banking App — DEMO",
    description: "Mobile banking app covering fund transfers, bill payment, biometric login, and rewards.",
    teamKey: "banking-squad",
    directMemberKeys: ["amir", "siti", "devan", "hafiz"],
    moduleNames: ["Authentication", "Fund Transfer", "Statements", "Bill Payment", "Biometrics", "Rewards"],
  },
];

export interface DemoMilestone {
  key: string;
  projectKey: string;
  name: string;
  type: "sprint" | "phase" | "release" | "cr";
  status: "completed" | "active" | "planned" | "cancelled";
  targetDate: string;
  startDate?: string;      // when the requirements phase kicked off
  reqTargetDate?: string;  // when all requirements should be approved
  devTargetDate?: string;  // when dev handover to QA should happen
  qaTargetDate?: string;   // when QA sign-off is expected
  uatTargetDate?: string;  // when UAT sign-off is expected
  goLiveDate?: string;     // planned go-live (deployment) — the last phase marker
  environment?: string;    // test environment the milestone runs in (ENV1…ENV6)
  // CR033p1 — retrospective, only meaningful for status:"completed". When
  // set, seed-demo-data.ts creates the milestone active-then-transitions it
  // to completed via PATCH (as closedByKey) so closedBy/completedAt are
  // stamped through the real flow instead of being backfilled at creation.
  lessonsLearned?: string;
  // Classification for the Lessons Learnt export's Type column. Left unset
  // on purpose for milestones whose note genuinely mixes what-went-wrong
  // and what-went-right in one paragraph — forcing a single type there
  // would misrepresent it (see lessons-learned-excel.ts's own reasoning).
  lessonsLearnedType?: "what_went_wrong" | "what_went_right" | "best_practice";
  closedByKey?: string;
}

export const MILESTONES: DemoMilestone[] = [
  // Older completed sprints — benchmark history for the PM Dashboard's
  // "Is this a pattern?" trend table (it averages the last 5 completed
  // milestones in the project). Phase durations worsen sprint over sprint
  // (Sprint 10 → 11 → 12), so the table tells a visible story.
  {
    key: "sprint10", projectKey: "portal", name: "Sprint 10", type: "sprint", status: "completed", targetDate: "2026-04-15",
    startDate: "2026-03-16", reqTargetDate: "2026-03-24", devTargetDate: "2026-04-03", qaTargetDate: "2026-04-10", uatTargetDate: "2026-04-15", goLiveDate: "2026-04-17", environment: "ENV1",
    lessonsLearned: "Smoothest sprint of the quarter — small, well-sliced requirements meant QA turned everything around in under a week. Worth protecting this scope discipline as the team takes on the checkout work.",
    lessonsLearnedType: "best_practice",
    closedByKey: "amir",
  },
  {
    key: "sprint11", projectKey: "portal", name: "Sprint 11", type: "sprint", status: "completed", targetDate: "2026-05-13",
    startDate: "2026-04-13", reqTargetDate: "2026-04-22", devTargetDate: "2026-05-04", qaTargetDate: "2026-05-09", uatTargetDate: "2026-05-13", goLiveDate: "2026-05-15", environment: "ENV1",
    lessonsLearned: "The equal-rating tie-break rule for search filters wasn't nailed down until QA had already built the test script — FA rejected the requirement once for missing detail, and even after revision the fix still didn't fully land before QA testing (products with the same rating kept coming back in random order across refreshes). Acceptance criteria need the tie-break rule spelled out before dev estimates, not discovered during test design.",
    lessonsLearnedType: "what_went_wrong",
    closedByKey: "amir",
  },
  // Completed — all phase targets met, pills show grey (done). Carries
  // lessons learned, to show the "captured" state on the PM Dashboard.
  {
    key: "sprint12", projectKey: "portal", name: "Sprint 12", type: "sprint", status: "completed", targetDate: "2026-06-24",
    startDate: "2026-05-18", reqTargetDate: "2026-05-28", devTargetDate: "2026-06-10", qaTargetDate: "2026-06-19", uatTargetDate: "2026-06-24", goLiveDate: "2026-06-26", environment: "ENV2",
    lessonsLearned: "Login lockout defect (DEF from Sprint 12) slipped through because the regression suite only covered the happy path for auth. Added a dedicated negative-path checklist for Sprint 13 onward. Search relevance tuning went smoothly — the early FA/QA pairing session on acceptance criteria paid off and should become standard practice.",
    closedByKey: "amir",
  },
  // Overdue — ALL four phase targets missed, pills show red · Late
  {
    key: "sprint13", projectKey: "portal", name: "Sprint 13", type: "sprint", status: "active", targetDate: "2026-07-08",
    startDate: "2026-06-08", reqTargetDate: "2026-06-18", devTargetDate: "2026-06-26", qaTargetDate: "2026-07-01", uatTargetDate: "2026-07-08", goLiveDate: "2026-07-10", environment: "ENV2",
  },
  // Planned — future dates, all grey (not late yet)
  {
    key: "sprint14", projectKey: "portal", name: "Sprint 14", type: "sprint", status: "planned", targetDate: "2026-07-29",
    startDate: "2026-07-04", reqTargetDate: "2026-07-14", devTargetDate: "2026-07-19", qaTargetDate: "2026-07-22", uatTargetDate: "2026-07-29", goLiveDate: "2026-07-31", environment: "ENV2",
  },
  // Older completed phase — second benchmark row for the banking project's
  // "Is this a pattern?" table.
  {
    key: "sit1", projectKey: "banking", name: "SIT Phase 1", type: "phase", status: "completed", targetDate: "2026-04-28",
    startDate: "2026-03-28", reqTargetDate: "2026-04-06", devTargetDate: "2026-04-17", qaTargetDate: "2026-04-27", uatTargetDate: "2026-04-28", goLiveDate: "2026-04-30", environment: "ENV3",
    lessonsLearned: "Security-sensitive flows (PIN login, lockout after three failed attempts) passed cleanly on the first SIT pass — the extra time spent on negative-path scenarios during test design paid off immediately. Worth carrying the same rigor into the transaction and statement features still ahead.",
    lessonsLearnedType: "what_went_right",
    closedByKey: "amir",
  },
  // Completed — phase targets all met. Closed but no lessons learned
  // captured yet, to show that state on the PM Dashboard too.
  {
    key: "uat1", projectKey: "banking", name: "UAT Phase 1", type: "phase", status: "completed", targetDate: "2026-06-15",
    startDate: "2026-05-10", reqTargetDate: "2026-05-20", devTargetDate: "2026-05-30", qaTargetDate: "2026-06-14", uatTargetDate: "2026-06-15", goLiveDate: "2026-06-18", environment: "ENV4",
    closedByKey: "amir",
  },
  // At risk — requirements done on time (grey), dev target missed (red), QA target upcoming (grey)
  {
    key: "release20", projectKey: "banking", name: "Release 2.0", type: "release", status: "active", targetDate: "2026-07-15",
    startDate: "2026-06-10", reqTargetDate: "2026-06-20", devTargetDate: "2026-07-01", qaTargetDate: "2026-07-08", uatTargetDate: "2026-07-15", goLiveDate: "2026-07-18", environment: "ENV3",
  },
  // Planned — all future
  {
    key: "release21", projectKey: "banking", name: "Release 2.1", type: "release", status: "planned", targetDate: "2026-08-21",
    startDate: "2026-07-22", reqTargetDate: "2026-08-01", devTargetDate: "2026-08-08", qaTargetDate: "2026-08-14", uatTargetDate: "2026-08-21", goLiveDate: "2026-08-25", environment: "ENV3",
  },
];

export const MODULES = [
  "Authentication", "Search", "Checkout", "Cart", "Wishlist",
  "Fund Transfer", "Statements", "Bill Payment", "Biometrics", "Rewards",
];

export type ReviewFlow =
  | "none"                // never submitted — stays as draft
  | "approve"             // submitted → approved
  | "reject-then-approve" // submitted → rejected → revised → re-submitted → approved
  | "reject-stay"         // submitted → rejected → author has NOT revised (blocked)
  | "approve-then-edit";  // submitted → approved → edited by FA → back in_review (dev still in progress)

export interface DemoRequirement {
  key: string;
  projectKey: string;
  milestoneKey: string;
  parentKey?: string;
  title: string;
  description: string;
  module: string;
  priority: "low" | "normal" | "high" | "urgent";
  acceptanceCriteria?: string[];
  authorKey: string;
  reviewFlow: ReviewFlow;
  reviewerKey?: string;
  rejectComment?: string;
  // reject-then-approve only — what the author changes the description to
  // when revising in response to the reject comment. Falls back to a generic
  // cart-merge clarification in seed-demo-data.ts if omitted.
  revisedDescription?: string;
}

export const REQUIREMENTS: DemoRequirement[] = [
  // ── Sprint 10 (Customer Portal, completed — oldest benchmark row) ───────
  // All approved first-pass (100% first-pass rate in the trend table).
  {
    key: "r-register", projectKey: "portal", milestoneKey: "sprint10",
    title: "Customer account registration", module: "Authentication", priority: "high",
    description: "New customers can create a portal account with their email address and a password.",
    acceptanceCriteria: [
      "Registration requires a unique email address and a password meeting the strength policy",
      "A verification email is sent before the account becomes active",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-pwd-reset", projectKey: "portal", milestoneKey: "sprint10", parentKey: "r-register",
    title: "Password reset via email link", module: "Authentication", priority: "normal",
    description: "Customers who forget their password can request a time-limited reset link by email.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-browse", projectKey: "portal", milestoneKey: "sprint10",
    title: "Browse products by category", module: "Search", priority: "high",
    description: "Customers can browse the catalog through a category tree without typing a search query.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-cart-add", projectKey: "portal", milestoneKey: "sprint10",
    title: "Add product to shopping cart", module: "Cart", priority: "high",
    description: "Customers can add a product to their cart from the product page and see the cart count update.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },

  // ── Sprint 11 (Customer Portal, completed) ──────────────────────────────
  // One reject-then-approve (75% first-pass rate — dips in the trend table).
  {
    key: "r-profile", projectKey: "portal", milestoneKey: "sprint11",
    title: "Edit customer profile details", module: "Authentication", priority: "normal",
    description: "Customers can update their display name, phone number, and default shipping address from a profile page.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-search-filter", projectKey: "portal", milestoneKey: "sprint11",
    title: "Filter search results by price and rating", module: "Search", priority: "high",
    description: "Search results can be narrowed with a price range slider and a minimum star-rating filter.",
    acceptanceCriteria: [
      "Filters apply without a full page reload",
      "Active filters are shown as removable chips above the results",
    ],
    authorKey: "siti", reviewFlow: "reject-then-approve", reviewerKey: "nadia",
    rejectComment: "The AC doesn't say how ties are ordered when two products have the same rating — QA can't write a deterministic expected result. Please define the tie-break rule.",
    revisedDescription: "Search results can be narrowed with a price range slider and a minimum star-rating filter. Tie-break rule: products with equal rating are ordered by review count, then by newest first.",
  },
  {
    key: "r-cart-qty", projectKey: "portal", milestoneKey: "sprint11",
    title: "Update item quantity in cart", module: "Cart", priority: "normal",
    description: "Customers can change the quantity of any cart line item, with the total recalculating immediately.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-checkout-reg", projectKey: "portal", milestoneKey: "sprint11",
    title: "Checkout for registered customers", module: "Checkout", priority: "urgent",
    description: "Logged-in customers can complete a purchase using their saved shipping address and payment method.",
    acceptanceCriteria: [
      "Saved address and payment method are pre-filled at checkout",
      "Order appears in the customer's order history immediately after payment",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },

  // ── Sprint 12 (Customer Portal, completed) ──────────────────────────────
  {
    key: "r-login", projectKey: "portal", milestoneKey: "sprint12",
    title: "User login with email and password", module: "Authentication", priority: "high",
    description: "Registered customers can sign in to the portal using their email address and password.",
    acceptanceCriteria: [
      "Valid credentials log the user in and redirect to the dashboard",
      "Invalid credentials show a clear error without revealing which field was wrong",
      "The session persists across a browser refresh",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-login-format", projectKey: "portal", milestoneKey: "sprint12", parentKey: "r-login",
    title: "Validate email format on login form", module: "Authentication", priority: "normal",
    description: "The login form rejects malformed email addresses before submitting to the server.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-login-lockout", projectKey: "portal", milestoneKey: "sprint12", parentKey: "r-login",
    title: "Lock account after 5 failed login attempts", module: "Authentication", priority: "high",
    description: "Repeated failed logins temporarily lock the account to slow down credential-stuffing attempts.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-search", projectKey: "portal", milestoneKey: "sprint12",
    title: "Global product search", module: "Search", priority: "high",
    description: "Customers can search the full catalog from a search bar visible on every page.",
    acceptanceCriteria: [
      "Results return in under 1 second for a typical query",
      "Search matches product titles, SKUs, and category names",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-search-autocomplete", projectKey: "portal", milestoneKey: "sprint12", parentKey: "r-search",
    title: "Search autocomplete suggestions", module: "Search", priority: "normal",
    description: "As the customer types, the search bar suggests matching products before they hit enter.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },

  // ── Sprint 13 (Customer Portal, active/overdue) ─────────────────────────
  {
    key: "r-guest-checkout", projectKey: "portal", milestoneKey: "sprint13",
    title: "Guest checkout flow", module: "Checkout", priority: "urgent",
    description: "Customers can complete a purchase without creating an account.",
    acceptanceCriteria: [
      "Guest can enter shipping and payment details in one flow",
      "An order confirmation is shown immediately after payment succeeds",
      "Guest is offered the option to create an account after checkout",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-guest-promo", projectKey: "portal", milestoneKey: "sprint13", parentKey: "r-guest-checkout",
    title: "Guest checkout — apply promo code", module: "Checkout", priority: "normal",
    description: "Guests can enter a promo code during checkout and see the discount applied before paying.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-guest-email", projectKey: "portal", milestoneKey: "sprint13", parentKey: "r-guest-checkout",
    title: "Guest checkout — order confirmation email", module: "Checkout", priority: "high",
    description: "Guests receive an order confirmation email immediately after a successful guest checkout.",
    authorKey: "siti", reviewFlow: "none", // still in_review — contributes to the "overdue, not ready" story
  },
  {
    key: "r-cart-persist", projectKey: "portal", milestoneKey: "sprint13",
    title: "Shopping cart persistence across sessions", module: "Cart", priority: "high",
    description: "A customer's cart contents survive a logout/login and a closed browser tab.",
    acceptanceCriteria: [
      "Cart contents are restored on the next login from any device",
      "Merging a guest cart into an account cart never drops items",
    ],
    authorKey: "siti", reviewFlow: "reject-then-approve", reviewerKey: "nadia",
    rejectComment: "Acceptance criteria don't say what happens if the same item is in both the guest cart and the account cart with different quantities — please clarify the merge rule before this goes to dev.",
  },
  {
    key: "r-cart-merge", projectKey: "portal", milestoneKey: "sprint13", parentKey: "r-cart-persist",
    title: "Merge guest cart into account cart on login", module: "Cart", priority: "normal",
    description: "When a guest with items in their cart logs in, those items merge into their account cart instead of being lost.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },

  // ── Sprint 13 — extra scenarios ────────────────────────────────────────
  {
    key: "r-guest-address", projectKey: "portal", milestoneKey: "sprint13",
    title: "Save guest shipping address for express checkout", module: "Checkout", priority: "normal",
    description: "Guests who complete checkout are offered the option to save their shipping address locally in the browser for faster re-entry on their next visit.",
    acceptanceCriteria: [
      "Address is saved only with explicit opt-in, never silently",
    ],
    authorKey: "siti",
    reviewFlow: "reject-stay", reviewerKey: "nadia",
    rejectComment: "This conflicts with PDPA — storing PII locally in the browser without server-side consent logging is not acceptable. Please consult with the compliance team and revise the AC before resubmitting.",
  },
  {
    // Late addition: sprint13 execution is already underway when this requirement arrives
    key: "r-sso-google", projectKey: "portal", milestoneKey: "sprint13",
    title: "Sign in with Google (SSO)", module: "Authentication", priority: "high",
    description: "Customers can log in or register using their existing Google account via OAuth 2.0, removing the need to create a separate portal password.",
    acceptanceCriteria: [
      "Clicking 'Continue with Google' redirects to Google's OAuth consent screen",
      "On successful OAuth grant, the customer is logged in and their profile is auto-populated from Google",
      "If the Google email is already registered as a password account, the two are linked automatically",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },

  // ── Sprint 14 (Customer Portal, planned — nothing submitted yet) ────────
  {
    key: "r-wishlist-save", projectKey: "portal", milestoneKey: "sprint14",
    title: "Save items to wishlist", module: "Wishlist", priority: "normal",
    description: "Customers can save a product to a personal wishlist for later, from the product page.",
    authorKey: "siti", reviewFlow: "none",
  },
  {
    key: "r-wishlist-tocart", projectKey: "portal", milestoneKey: "sprint14", parentKey: "r-wishlist-save",
    title: "Move wishlist item to cart", module: "Wishlist", priority: "normal",
    description: "A single action moves a wishlist item into the shopping cart.",
    authorKey: "siti", reviewFlow: "none",
  },
  {
    key: "r-wishlist-share", projectKey: "portal", milestoneKey: "sprint14",
    title: "Share wishlist via link", module: "Wishlist", priority: "low",
    description: "Customers can generate a shareable read-only link to their wishlist.",
    authorKey: "siti", reviewFlow: "none",
  },

  // ── SIT Phase 1 (Mobile Banking, completed — older benchmark row) ───────
  {
    key: "r-pin-login", projectKey: "banking", milestoneKey: "sit1",
    title: "Secure 6-digit PIN login", module: "Authentication", priority: "high",
    description: "Customers log in to the app with a 6-digit PIN, with the account locking after repeated failures.",
    acceptanceCriteria: [
      "PIN entry is masked and never stored in plain text",
      "Three consecutive wrong PINs lock the app for 15 minutes",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-balance", projectKey: "banking", milestoneKey: "sit1",
    title: "Account balance overview on home screen", module: "Statements", priority: "high",
    description: "After login, the home screen shows current and available balance for every linked account.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-txn-history", projectKey: "banking", milestoneKey: "sit1",
    title: "View past transfer history", module: "Fund Transfer", priority: "normal",
    description: "Customers can view a chronological list of their past transfers with amount, date, and recipient.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },

  // ── UAT Phase 1 (Mobile Banking, completed) ─────────────────────────────
  {
    key: "r-transfer", projectKey: "banking", milestoneKey: "uat1",
    title: "Transfer funds between own accounts", module: "Fund Transfer", priority: "urgent",
    description: "Customers can move money between their own linked accounts within the app.",
    acceptanceCriteria: [
      "Transfer completes in real time and both account balances update immediately",
      "The customer sees a confirmation screen with a reference number",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-transfer-otp", projectKey: "banking", milestoneKey: "uat1", parentKey: "r-transfer",
    title: "Transfer confirmation with OTP", module: "Fund Transfer", priority: "urgent",
    description: "Transfers above the daily threshold require a one-time password sent to the registered phone number.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-transfer-limit", projectKey: "banking", milestoneKey: "uat1", parentKey: "r-transfer",
    title: "Daily transfer limit enforcement", module: "Fund Transfer", priority: "high",
    description: "The app blocks a transfer that would exceed the customer's daily transfer limit.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-estatement", projectKey: "banking", milestoneKey: "uat1",
    title: "Download monthly e-statement as PDF", module: "Statements", priority: "normal",
    description: "Customers can download any of their last 12 monthly statements as a PDF.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },

  // ── Release 2.0 (Mobile Banking, active/at-risk) ────────────────────────
  {
    key: "r-billpay", projectKey: "banking", milestoneKey: "release20",
    title: "Pay utility bills via linked billers", module: "Bill Payment", priority: "high",
    description: "Customers can pay electricity, water, and internet bills from a list of linked billers.",
    acceptanceCriteria: [
      "Payment reflects on the biller's side within one business day",
      "A digital receipt is generated for every successful payment",
    ],
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-billpay-recurring", projectKey: "banking", milestoneKey: "release20", parentKey: "r-billpay",
    title: "Save biller for recurring payment", module: "Bill Payment", priority: "normal",
    description: "Customers can mark a biller for automatic recurring monthly payment.",
    authorKey: "siti", reviewFlow: "none", // still in_review — part of why this milestone is at risk
  },
  {
    key: "r-billpay-receipt", projectKey: "banking", milestoneKey: "release20", parentKey: "r-billpay",
    title: "Bill payment receipt download", module: "Bill Payment", priority: "normal",
    description: "Customers can download a PDF receipt for any past bill payment.",
    authorKey: "siti", reviewFlow: "approve", reviewerKey: "nadia",
  },
  {
    key: "r-biometric", projectKey: "banking", milestoneKey: "release20",
    title: "Biometric login (fingerprint/Face ID)", module: "Biometrics", priority: "high",
    description: "Customers can enable fingerprint or Face ID as an alternative to entering their PIN on login.",
    acceptanceCriteria: [
      "Falls back to PIN entry if biometric auth fails twice",
      "Biometric login can be disabled from Settings at any time",
    ],
    authorKey: "siti", reviewFlow: "none", // still in_review — the other big reason this milestone is at risk
  },

  // ── Release 2.0 — extra scenario: approved then edited mid-development ──
  {
    key: "r-billpay-dispute", projectKey: "banking", milestoneKey: "release20",
    title: "Dispute a bill payment within 48 hours", module: "Bill Payment", priority: "high",
    description: "Customers can raise a dispute for any bill payment within 48 hours of the transaction. The dispute is routed to the biller and a reference number is issued.",
    acceptanceCriteria: [
      "Dispute option is visible on every completed bill payment for 48 hours",
      "Submitting a dispute freezes the payment record and generates a reference number",
      "Customer receives an email confirmation with the dispute reference",
    ],
    authorKey: "siti",
    reviewFlow: "approve-then-edit", reviewerKey: "nadia",
    // editedDescription and editedAC are picked up by seed-demo-data.ts
    editedDescription: "Customers can raise a dispute for any bill payment within 24 hours (revised down from 48 — compliance team confirmed 24 h aligns with the payment network SLA). The dispute is routed to the biller and a reference number is issued.",
    editedAcceptanceCriteria: [
      "Dispute option is visible on every completed bill payment for 24 hours (changed from 48)",
      "Submitting a dispute freezes the payment record and generates a reference number",
      "Customer receives an email confirmation with the dispute reference",
      "Dispute window countdown is shown in the payment detail screen",
    ],
  } as any,

  // ── Release 2.1 (Mobile Banking, planned) ───────────────────────────────
  {
    key: "r-rewards-redeem", projectKey: "banking", milestoneKey: "release21",
    title: "Rewards points redemption", module: "Rewards", priority: "normal",
    description: "Customers can redeem accumulated rewards points for statement credit or vouchers.",
    authorKey: "siti", reviewFlow: "none",
  },
  {
    key: "r-rewards-expiry", projectKey: "banking", milestoneKey: "release21",
    title: "Rewards points expiry notification", module: "Rewards", priority: "low",
    description: "Customers get a push notification 30 days before unused rewards points expire.",
    authorKey: "siti", reviewFlow: "none",
  },
];

export interface DemoTestCase {
  key: string;
  requirementKey: string;
  title: string;
  preconditions: string;
  testSteps: string;
  expectedResult: string;
  type: "manual" | "automation_candidate";
  priority: "low" | "normal" | "high" | "urgent";
  authorKey: string;
  aiAssisted?: boolean;
}

export const TEST_CASES: DemoTestCase[] = [
  // Sprint 10
  { key: "tc-register-happy", requirementKey: "r-register", title: "Register a new account with a unique email", preconditions: "The email address is not yet registered.", testSteps: "1. Open the registration page\n2. Enter a unique email and a policy-compliant password\n3. Submit and follow the verification email link", expectedResult: "Account is created, the verification link activates it, and the customer can log in.", type: "automation_candidate", priority: "high", authorKey: "nadia" },
  { key: "tc-register-dupe", requirementKey: "r-register", title: "Registration rejects an already-registered email", preconditions: "The email address is already registered.", testSteps: "1. Open the registration page\n2. Enter the already-registered email\n3. Submit", expectedResult: "Registration is blocked with a clear 'email already in use' message.", type: "manual", priority: "normal", authorKey: "farid" },
  { key: "tc-pwd-reset", requirementKey: "r-pwd-reset", title: "Password reset link expires after its time limit", preconditions: "A reset link was requested more than 24 hours ago.", testSteps: "1. Request a password reset\n2. Wait past the link's expiry window\n3. Open the link", expectedResult: "The expired link is rejected and the customer is prompted to request a new one.", type: "manual", priority: "normal", authorKey: "farid" },
  { key: "tc-browse-cat", requirementKey: "r-browse", title: "Category tree lists products of the selected category", preconditions: "Catalog contains products in the 'Accessories' category.", testSteps: "1. Open the category tree\n2. Select 'Accessories'", expectedResult: "Only products belonging to 'Accessories' are listed.", type: "automation_candidate", priority: "high", authorKey: "farid" },
  { key: "tc-cart-add", requirementKey: "r-cart-add", title: "Adding a product updates the cart count", preconditions: "Customer is on a product page with an empty cart.", testSteps: "1. Click 'Add to cart'\n2. Observe the cart icon", expectedResult: "The cart count badge changes from 0 to 1 and the product is in the cart.", type: "automation_candidate", priority: "high", authorKey: "nadia" },

  // Sprint 11
  { key: "tc-profile-edit", requirementKey: "r-profile", title: "Profile changes persist after re-login", preconditions: "Customer is logged in.", testSteps: "1. Change the display name and phone number on the profile page\n2. Save\n3. Log out and log back in", expectedResult: "The updated details are shown after re-login.", type: "manual", priority: "normal", authorKey: "farid" },
  { key: "tc-filter-price", requirementKey: "r-search-filter", title: "Price range filter narrows results", preconditions: "Catalog contains products priced both inside and outside RM50–RM100.", testSteps: "1. Search for a broad term\n2. Set the price slider to RM50–RM100", expectedResult: "Only products priced within RM50–RM100 remain in the results, without a page reload.", type: "automation_candidate", priority: "high", authorKey: "farid" },
  { key: "tc-filter-rating", requirementKey: "r-search-filter", title: "Equal-rating products are ordered by review count", preconditions: "Two products share the same star rating with different review counts.", testSteps: "1. Apply a minimum-rating filter that includes both products\n2. Compare their order in the results", expectedResult: "The product with more reviews is listed first (tie-break rule).", type: "manual", priority: "normal", authorKey: "farid", aiAssisted: true },
  { key: "tc-cart-qty", requirementKey: "r-cart-qty", title: "Quantity change recalculates the cart total", preconditions: "Cart contains one item with quantity 1.", testSteps: "1. Open the cart\n2. Change the item quantity to 3", expectedResult: "Line subtotal and cart total update immediately to 3× the unit price.", type: "automation_candidate", priority: "normal", authorKey: "nadia" },
  { key: "tc-checkout-reg", requirementKey: "r-checkout-reg", title: "Registered checkout pre-fills saved details", preconditions: "Customer has a saved address and payment method.", testSteps: "1. Add an item to cart\n2. Proceed to checkout while logged in", expectedResult: "Saved shipping address and payment method are pre-filled; order completes and appears in order history.", type: "automation_candidate", priority: "urgent", authorKey: "nadia" },

  // SIT Phase 1 (Banking)
  { key: "tc-pin-login-ok", requirementKey: "r-pin-login", title: "Correct PIN logs the customer in", preconditions: "Customer has an activated app profile with a set PIN.", testSteps: "1. Launch the app\n2. Enter the correct 6-digit PIN", expectedResult: "Customer lands on the home screen with their accounts visible.", type: "automation_candidate", priority: "high", authorKey: "weiling" },
  { key: "tc-pin-lockout", requirementKey: "r-pin-login", title: "Three wrong PINs lock the app for 15 minutes", preconditions: "Customer has a set PIN and the app is not currently locked.", testSteps: "1. Enter a wrong PIN three times in a row\n2. Attempt a fourth login with the correct PIN", expectedResult: "The fourth attempt is blocked with a lockout message showing the remaining wait time.", type: "manual", priority: "high", authorKey: "weiling" },
  { key: "tc-balance-home", requirementKey: "r-balance", title: "Home screen shows balances for all linked accounts", preconditions: "Customer has two linked accounts.", testSteps: "1. Log in\n2. Inspect the home screen account cards", expectedResult: "Both accounts appear with correct current and available balances.", type: "manual", priority: "high", authorKey: "weiling" },
  { key: "tc-txn-history", requirementKey: "r-txn-history", title: "Transfer history lists transfers newest first", preconditions: "Account has at least 5 past transfers.", testSteps: "1. Open Transfer history\n2. Check the ordering and details of the entries", expectedResult: "Transfers are listed newest first with amount, date, and recipient shown for each.", type: "manual", priority: "normal", authorKey: "weiling" },

  // Sprint 12
  { key: "tc-login-valid", requirementKey: "r-login", title: "Login succeeds with valid credentials", preconditions: "A registered, active customer account exists.", testSteps: "1. Go to the login page\n2. Enter the registered email and correct password\n3. Click Sign In", expectedResult: "User is redirected to the dashboard and their name appears in the header.", type: "automation_candidate", priority: "high", authorKey: "nadia" },
  { key: "tc-login-invalid", requirementKey: "r-login", title: "Login fails with wrong password", preconditions: "A registered, active customer account exists.", testSteps: "1. Go to the login page\n2. Enter the registered email with an incorrect password\n3. Click Sign In", expectedResult: "A generic 'invalid email or password' error is shown; the specific wrong field is not revealed.", type: "manual", priority: "high", authorKey: "nadia" },
  { key: "tc-login-format", requirementKey: "r-login-format", title: "Login form rejects malformed email", preconditions: "None.", testSteps: "1. Go to the login page\n2. Enter 'not-an-email' in the email field\n3. Attempt to submit", expectedResult: "Form shows an inline validation error and does not submit to the server.", type: "automation_candidate", priority: "normal", authorKey: "farid", aiAssisted: true },
  { key: "tc-lockout", requirementKey: "r-login-lockout", title: "Account locks after 5 failed attempts", preconditions: "A registered account exists and is not currently locked.", testSteps: "1. Attempt login with the wrong password 5 times in a row\n2. Attempt a 6th login with the correct password", expectedResult: "The 6th attempt is rejected with an 'account temporarily locked' message, even though the password is correct.", type: "manual", priority: "high", authorKey: "nadia" },
  { key: "tc-search-basic", requirementKey: "r-search", title: "Search returns matching products", preconditions: "Catalog contains at least one product named 'Wireless Mouse'.", testSteps: "1. Type 'wireless mouse' into the global search bar\n2. Press Enter", expectedResult: "Results page lists the 'Wireless Mouse' product within the first 3 results.", type: "automation_candidate", priority: "high", authorKey: "farid" },
  { key: "tc-search-autocomplete", requirementKey: "r-search-autocomplete", title: "Autocomplete suggests products while typing", preconditions: "Catalog contains at least one product named 'Wireless Mouse'.", testSteps: "1. Click the search bar\n2. Type 'wire' without pressing Enter", expectedResult: "A dropdown appears suggesting 'Wireless Mouse' and similar matches before the user finishes typing.", type: "manual", priority: "normal", authorKey: "farid", aiAssisted: true },

  // Sprint 13
  { key: "tc-guest-checkout-happy", requirementKey: "r-guest-checkout", title: "Guest completes checkout without an account", preconditions: "Cart contains at least one item; user is not logged in.", testSteps: "1. Add an item to cart\n2. Proceed to checkout as guest\n3. Enter shipping and payment details\n4. Confirm the order", expectedResult: "Order confirmation screen is shown with an order number; no account was required.", type: "automation_candidate", priority: "urgent", authorKey: "nadia" },
  { key: "tc-guest-checkout-invalid-card", requirementKey: "r-guest-checkout", title: "Guest checkout rejects an expired card", preconditions: "Cart contains at least one item; user is not logged in.", testSteps: "1. Proceed to guest checkout\n2. Enter a card with a past expiry date\n3. Submit payment", expectedResult: "Payment is rejected with a clear 'card expired' message; order is not placed.", type: "manual", priority: "high", authorKey: "farid" },
  { key: "tc-guest-promo-valid", requirementKey: "r-guest-promo", title: "Valid promo code applies a discount", preconditions: "An active promo code 'SAVE10' exists giving 10% off.", testSteps: "1. Proceed to guest checkout with items in cart\n2. Enter 'SAVE10' in the promo code field\n3. Apply the code", expectedResult: "Order total updates to reflect a 10% discount before payment.", type: "automation_candidate", priority: "normal", authorKey: "farid" },
  { key: "tc-guest-promo-invalid", requirementKey: "r-guest-promo", title: "Expired promo code is rejected", preconditions: "Promo code 'WINTER22' expired last year.", testSteps: "1. Proceed to guest checkout\n2. Enter 'WINTER22' in the promo code field\n3. Apply the code", expectedResult: "An 'expired or invalid code' message is shown and the order total is unchanged.", type: "manual", priority: "low", authorKey: "farid" },
  { key: "tc-cart-merge-basic", requirementKey: "r-cart-merge", title: "Guest cart merges into account cart on login", preconditions: "A guest has 2 items in cart; their account has 1 different item saved.", testSteps: "1. As a guest, add 2 items to cart\n2. Log into an existing account with 1 item already in its cart\n3. Open the cart", expectedResult: "Cart shows all 3 items combined; no item is lost or duplicated.", type: "automation_candidate", priority: "normal", authorKey: "nadia" },

  // Wishlist (Sprint 14 — written but not yet run)
  { key: "tc-wishlist-save", requirementKey: "r-wishlist-save", title: "Save a product to wishlist from product page", preconditions: "Customer is logged in and viewing a product page.", testSteps: "1. Click the 'Save to wishlist' icon on a product page\n2. Navigate to My Wishlist", expectedResult: "The product appears in the customer's wishlist.", type: "manual", priority: "normal", authorKey: "farid" },
  { key: "tc-wishlist-tocart", requirementKey: "r-wishlist-tocart", title: "Move a wishlist item to cart", preconditions: "Wishlist contains at least one item.", testSteps: "1. Open My Wishlist\n2. Click 'Move to cart' on an item", expectedResult: "Item is added to the cart and removed from the wishlist.", type: "manual", priority: "normal", authorKey: "farid" },

  // UAT Phase 1 (Banking)
  { key: "tc-transfer-basic", requirementKey: "r-transfer", title: "Transfer between own accounts updates balances immediately", preconditions: "Customer has two linked accounts, Account A with sufficient balance.", testSteps: "1. Select Transfer > Between my accounts\n2. Choose Account A as source, Account B as destination\n3. Enter an amount within available balance\n4. Confirm", expectedResult: "Account A balance decreases and Account B balance increases immediately; a reference number is shown.", type: "automation_candidate", priority: "urgent", authorKey: "weiling" },
  { key: "tc-transfer-insufficient", requirementKey: "r-transfer", title: "Transfer is blocked when balance is insufficient", preconditions: "Account A balance is lower than the requested transfer amount.", testSteps: "1. Attempt to transfer more than Account A's available balance", expectedResult: "Transfer is rejected with an 'insufficient balance' message; no amount is deducted.", type: "manual", priority: "high", authorKey: "weiling" },
  { key: "tc-transfer-otp-valid", requirementKey: "r-transfer-otp", title: "OTP is required above the confirmation threshold", preconditions: "Transfer amount exceeds the OTP threshold.", testSteps: "1. Initiate a transfer above the threshold\n2. Enter the OTP received via SMS\n3. Confirm", expectedResult: "Transfer completes only after the correct OTP is entered.", type: "automation_candidate", priority: "urgent", authorKey: "weiling" },
  { key: "tc-transfer-otp-wrong", requirementKey: "r-transfer-otp", title: "Transfer is blocked with an incorrect OTP", preconditions: "Transfer amount exceeds the OTP threshold.", testSteps: "1. Initiate a transfer above the threshold\n2. Enter an incorrect OTP\n3. Attempt to confirm", expectedResult: "Transfer is rejected; account balances are unchanged.", type: "manual", priority: "high", authorKey: "weiling" },
  { key: "tc-transfer-limit", requirementKey: "r-transfer-limit", title: "Transfer exceeding daily limit is blocked", preconditions: "Customer has already transferred close to their daily limit today.", testSteps: "1. Attempt a transfer that would push total transfers today over the daily limit", expectedResult: "Transfer is rejected with a message stating the daily limit has been reached.", type: "automation_candidate", priority: "high", authorKey: "weiling" },
  { key: "tc-estatement-download", requirementKey: "r-estatement", title: "Download a past monthly e-statement as PDF", preconditions: "Account has at least 3 months of statement history.", testSteps: "1. Go to Statements\n2. Select a month from 3 months ago\n3. Tap Download", expectedResult: "A PDF for the selected month downloads and opens correctly, with matching account details.", type: "manual", priority: "normal", authorKey: "weiling" },

  // Release 2.0 (Banking, at risk)
  { key: "tc-billpay-basic", requirementKey: "r-billpay", title: "Pay a linked utility biller successfully", preconditions: "At least one biller is linked to the account with sufficient balance.", testSteps: "1. Go to Bill Payment\n2. Select a linked biller\n3. Enter the amount due\n4. Confirm payment", expectedResult: "Payment succeeds and a confirmation with reference number is shown.", type: "automation_candidate", priority: "high", authorKey: "weiling" },
  { key: "tc-billpay-insufficient", requirementKey: "r-billpay", title: "Bill payment is blocked with insufficient balance", preconditions: "Account balance is lower than the bill amount.", testSteps: "1. Attempt to pay a bill greater than the current balance", expectedResult: "Payment is rejected with an 'insufficient balance' message.", type: "manual", priority: "high", authorKey: "weiling" },
  { key: "tc-billpay-receipt", requirementKey: "r-billpay-receipt", title: "Download receipt for a past bill payment", preconditions: "At least one completed bill payment exists in history.", testSteps: "1. Go to Bill Payment history\n2. Select a past payment\n3. Tap Download receipt", expectedResult: "A PDF receipt downloads matching the selected payment's details.", type: "manual", priority: "normal", authorKey: "weiling" },
  { key: "tc-biometric-enable", requirementKey: "r-biometric", title: "Enable Face ID login from Settings", preconditions: "Device supports Face ID; customer is logged in with PIN.", testSteps: "1. Go to Settings > Security\n2. Enable Face ID login\n3. Log out and log back in using Face ID", expectedResult: "Face ID successfully logs the customer in without requiring PIN entry.", type: "manual", priority: "high", authorKey: "weiling" },
  { key: "tc-biometric-fallback", requirementKey: "r-biometric", title: "Login falls back to PIN after 2 failed biometric attempts", preconditions: "Face ID is enabled but will be simulated to fail.", testSteps: "1. Attempt Face ID login and fail it twice", expectedResult: "App automatically offers PIN entry as a fallback after the second failure.", type: "manual", priority: "normal", authorKey: "weiling" },
];

export interface DemoExecutionRow {
  tcKey: string;
  result: "Passed" | "Failed" | "Blocked" | "Not Executed";
  actualResult?: string;
}

export interface DemoExecutionFile {
  key: string;
  projectKey: string;
  milestoneKey: string;
  redmineTicketId: string;
  title: string;
  fileType: "qa" | "uat";
  tracker: string;
  qaPic: string;
  rows: DemoExecutionRow[];
}

export const EXECUTION_FILES: DemoExecutionFile[] = [
  // Sprint 10 — QA and UAT files, so the phase timeline gets a bounded QA
  // segment (QA ends where UAT begins) and a UAT segment for the benchmark.
  {
    key: "ex-sprint10-qa", projectKey: "portal", milestoneKey: "sprint10",
    redmineTicketId: "QA-1010", title: "Sprint 10 — Registration & Browse", fileType: "qa", tracker: "QA Testing", qaPic: "Farid Karim",
    rows: [
      { tcKey: "tc-register-happy", result: "Passed" },
      { tcKey: "tc-register-dupe", result: "Passed" },
      { tcKey: "tc-pwd-reset", result: "Failed", actualResult: "Reset link older than 24 hours still opened the reset form and accepted a new password." },
      { tcKey: "tc-browse-cat", result: "Passed" },
      { tcKey: "tc-cart-add", result: "Passed" },
    ],
  },
  {
    key: "ex-sprint10-uat", projectKey: "portal", milestoneKey: "sprint10",
    redmineTicketId: "UAT-1010", title: "Sprint 10 — Registration UAT", fileType: "uat", tracker: "UAT", qaPic: "Amir Rahman",
    rows: [
      { tcKey: "tc-register-happy", result: "Passed" },
      { tcKey: "tc-cart-add", result: "Passed" },
    ],
  },
  // Sprint 11 — same QA + UAT pairing.
  {
    key: "ex-sprint11-qa", projectKey: "portal", milestoneKey: "sprint11",
    redmineTicketId: "QA-1011", title: "Sprint 11 — Profile, Filters & Checkout", fileType: "qa", tracker: "QA Testing", qaPic: "Farid Karim",
    rows: [
      { tcKey: "tc-profile-edit", result: "Passed" },
      { tcKey: "tc-filter-price", result: "Passed" },
      { tcKey: "tc-filter-rating", result: "Failed", actualResult: "Equal-rating products came back in random order between refreshes — the review-count tie-break is not applied." },
      { tcKey: "tc-cart-qty", result: "Passed" },
      { tcKey: "tc-checkout-reg", result: "Passed" },
    ],
  },
  {
    key: "ex-sprint11-uat", projectKey: "portal", milestoneKey: "sprint11",
    redmineTicketId: "UAT-1011", title: "Sprint 11 — Checkout UAT", fileType: "uat", tracker: "UAT", qaPic: "Amir Rahman",
    rows: [
      { tcKey: "tc-checkout-reg", result: "Passed" },
      { tcKey: "tc-filter-price", result: "Passed" },
    ],
  },
  // SIT Phase 1 (Banking) — QA-type file only; the QA segment closes at the
  // milestone's (backdated) completion date.
  {
    key: "ex-sit1", projectKey: "banking", milestoneKey: "sit1",
    redmineTicketId: "QA-2000", title: "SIT Phase 1 — Login & Balances", fileType: "qa", tracker: "QA Testing", qaPic: "Wei Ling Tan",
    rows: [
      { tcKey: "tc-pin-login-ok", result: "Passed" },
      { tcKey: "tc-pin-lockout", result: "Passed" },
      { tcKey: "tc-balance-home", result: "Passed" },
      { tcKey: "tc-txn-history", result: "Failed", actualResult: "Transfers older than 90 days are missing from the list entirely instead of paginating." },
    ],
  },
  {
    key: "ex-sprint12", projectKey: "portal", milestoneKey: "sprint12",
    redmineTicketId: "QA-1012", title: "Sprint 12 — Auth & Search Regression", fileType: "qa", tracker: "QA Testing", qaPic: "Nadia Sulaiman",
    rows: [
      { tcKey: "tc-login-valid", result: "Passed" },
      { tcKey: "tc-login-invalid", result: "Passed" },
      { tcKey: "tc-login-format", result: "Passed" },
      { tcKey: "tc-lockout", result: "Failed", actualResult: "Account was not locked after 5 failed attempts — a 6th and 7th attempt were both still accepted." },
      { tcKey: "tc-search-basic", result: "Passed" },
      { tcKey: "tc-search-autocomplete", result: "Passed" },
    ],
  },
  // Sprint 12 UAT — without a UAT-type file the completed milestone's
  // actual bar has no UAT phase at all (phases only exist where execution
  // rows of that file type exist).
  {
    key: "ex-sprint12-uat", projectKey: "portal", milestoneKey: "sprint12",
    redmineTicketId: "UAT-1012", title: "Sprint 12 — Auth & Search UAT", fileType: "uat", tracker: "UAT", qaPic: "Amir Rahman",
    rows: [
      { tcKey: "tc-login-valid", result: "Passed" },
      { tcKey: "tc-search-basic", result: "Passed" },
    ],
  },
  {
    key: "ex-sprint13-qa", projectKey: "portal", milestoneKey: "sprint13",
    redmineTicketId: "QA-1013", title: "Sprint 13 — Checkout & Cart", fileType: "qa", tracker: "QA Testing", qaPic: "Farid Karim",
    rows: [
      { tcKey: "tc-guest-checkout-happy", result: "Passed" },
      { tcKey: "tc-guest-checkout-invalid-card", result: "Failed", actualResult: "Order was placed successfully even though the card's expiry date was in the past — validation is not checked." },
      { tcKey: "tc-guest-promo-valid", result: "Passed" },
      { tcKey: "tc-guest-promo-invalid", result: "Blocked", actualResult: "Cannot test — promo code admin panel is not available in this environment yet." },
      { tcKey: "tc-cart-merge-basic", result: "Not Executed" },
    ],
  },
  {
    key: "ex-sprint13-uat", projectKey: "portal", milestoneKey: "sprint13",
    redmineTicketId: "UAT-1013", title: "Sprint 13 — Checkout UAT", fileType: "uat", tracker: "UAT", qaPic: "Amir Rahman",
    rows: [
      { tcKey: "tc-guest-checkout-happy", result: "Passed" },
      { tcKey: "tc-guest-promo-valid", result: "Not Executed" },
    ],
  },
  // UAT Phase 1's QA (SIT) run — without a QA-type file the milestone's
  // actual bar jumps straight from Develop to UAT with no QA testing phase.
  // The e-statement TC passing here while failing later in UAT also sets up
  // the escape story.
  {
    key: "ex-uat1-qa", projectKey: "banking", milestoneKey: "uat1",
    redmineTicketId: "QA-2001", title: "UAT Phase 1 — SIT Regression", fileType: "qa", tracker: "QA Testing", qaPic: "Wei Ling Tan",
    rows: [
      { tcKey: "tc-transfer-basic", result: "Passed" },
      { tcKey: "tc-transfer-otp-valid", result: "Passed" },
      { tcKey: "tc-transfer-limit", result: "Passed" },
      { tcKey: "tc-estatement-download", result: "Passed" },
    ],
  },
  {
    key: "ex-uat1", projectKey: "banking", milestoneKey: "uat1",
    redmineTicketId: "UAT-2001", title: "UAT Phase 1 — Fund Transfer & Statements", fileType: "uat", tracker: "UAT", qaPic: "Wei Ling Tan",
    rows: [
      { tcKey: "tc-transfer-basic", result: "Passed" },
      { tcKey: "tc-transfer-insufficient", result: "Passed" },
      { tcKey: "tc-transfer-otp-valid", result: "Passed" },
      { tcKey: "tc-transfer-otp-wrong", result: "Passed" },
      { tcKey: "tc-transfer-limit", result: "Passed" },
      { tcKey: "tc-estatement-download", result: "Failed", actualResult: "Downloaded PDF shows the wrong month's transaction list — header says June but rows are May's." },
    ],
  },
  {
    key: "ex-release20", projectKey: "banking", milestoneKey: "release20",
    redmineTicketId: "QA-2020", title: "Release 2.0 — Bill Payment & Biometrics", fileType: "qa", tracker: "QA Testing", qaPic: "Wei Ling Tan",
    rows: [
      { tcKey: "tc-billpay-basic", result: "Passed" },
      { tcKey: "tc-billpay-insufficient", result: "Passed" },
      { tcKey: "tc-billpay-receipt", result: "Not Executed" },
      { tcKey: "tc-biometric-enable", result: "Failed", actualResult: "Face ID prompt never appears on Settings > Security toggle — nothing happens when tapping Enable." },
      { tcKey: "tc-biometric-fallback", result: "Not Executed" },
    ],
  },
];

export interface DemoDefect {
  key: string;
  projectKey: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  severity: "low" | "medium" | "high" | "critical";
  module: string;
  source: "qa" | "production";
  foundIn: "SIT" | "UAT" | "Production";
  reporterKey: string;
  executionFileKey?: string;
  tcKeyInFile?: string;
  requirementKey?: string;
  escapeClass?: "coverage_gap" | "selection_gap" | "passed_wrongly";
  escapeStatus?: "pending" | "analyzing" | "closed";
  createRegressionTc?: boolean;
}

export const DEFECTS: DemoDefect[] = [
  {
    key: "def-lockout", projectKey: "portal", title: "Account lockout does not trigger after 5 failed logins", severity: "high", module: "Authentication",
    description: "Repeated failed login attempts should lock the account temporarily; the lockout never engages.",
    stepsToReproduce: "1. Attempt login with the wrong password 5 times\n2. Attempt a 6th login with the correct password",
    expectedResult: "The 6th attempt is rejected with an account-locked message.",
    actualResult: "The 6th and 7th attempts were both accepted with the correct password — no lockout occurred.",
    source: "qa", foundIn: "SIT", reporterKey: "nadia",
    executionFileKey: "ex-sprint12", tcKeyInFile: "tc-lockout", requirementKey: "r-login-lockout",
  },
  {
    key: "def-expired-card", projectKey: "portal", title: "Guest checkout accepts an expired card", severity: "critical", module: "Checkout",
    description: "Card expiry date is not validated during guest checkout, allowing orders to be placed with expired cards.",
    stepsToReproduce: "1. Proceed to guest checkout with items in cart\n2. Enter a card with a past expiry date\n3. Submit payment",
    expectedResult: "Payment is rejected with a card-expired message.",
    actualResult: "Order was placed successfully with no validation error.",
    source: "qa", foundIn: "SIT", reporterKey: "farid",
    executionFileKey: "ex-sprint13-qa", tcKeyInFile: "tc-guest-checkout-invalid-card", requirementKey: "r-guest-checkout",
  },
  {
    key: "def-estatement-wrong-month", projectKey: "banking", title: "E-statement PDF shows the wrong month's transactions", severity: "high", module: "Statements",
    description: "Selecting a past month's statement downloads a PDF whose header matches the selected month but whose transaction rows belong to a different month.",
    stepsToReproduce: "1. Go to Statements\n2. Select a month from 3 months ago\n3. Download the PDF and inspect the transaction rows",
    expectedResult: "PDF header and transaction rows both match the selected month.",
    actualResult: "Header says June, but the listed transactions are May's.",
    source: "qa", foundIn: "UAT", reporterKey: "weiling",
    executionFileKey: "ex-uat1", tcKeyInFile: "tc-estatement-download", requirementKey: "r-estatement",
  },
  {
    key: "def-faceid-noop", projectKey: "banking", title: "Enabling Face ID does nothing on Settings screen", severity: "high", module: "Biometrics",
    description: "Tapping the Face ID toggle in Settings > Security has no visible effect — no permission prompt, no confirmation.",
    stepsToReproduce: "1. Go to Settings > Security\n2. Tap 'Enable Face ID'",
    expectedResult: "Device's Face ID permission prompt appears, and once granted, Face ID login becomes available.",
    actualResult: "Nothing happens when tapping the toggle.",
    source: "qa", foundIn: "SIT", reporterKey: "weiling",
    executionFileKey: "ex-release20", tcKeyInFile: "tc-biometric-enable", requirementKey: "r-biometric",
  },
  {
    key: "def-prod-doubletransfer", projectKey: "banking", title: "Customer charged twice for a single fund transfer under poor network conditions", severity: "critical", module: "Fund Transfer",
    description: "A customer on a spotty connection tapped Confirm once but was shown a timeout error, then retried — both transfers went through, resulting in a double deduction.",
    stepsToReproduce: "1. Initiate a transfer\n2. Simulate a network timeout after tapping Confirm but before the response returns\n3. Retry the same transfer",
    expectedResult: "The app should recognize the in-flight transfer and not submit a duplicate.",
    actualResult: "Both the original and retried transfer were processed, deducting the amount twice.",
    source: "production", foundIn: "Production", reporterKey: "amir",
    escapeClass: "coverage_gap", escapeStatus: "closed", createRegressionTc: true,
    requirementKey: "r-transfer",
  },
  {
    key: "def-prod-wishlist-nolink", projectKey: "portal", title: "Wishlist share link opens a blank page for some customers", severity: "medium", module: "Wishlist",
    description: "A handful of customers reported that a shared wishlist link opens a blank white screen instead of the wishlist. Not yet reproduced consistently.",
    stepsToReproduce: "1. Generate a wishlist share link\n2. Open it in an incognito window on iOS Safari",
    expectedResult: "The shared wishlist renders read-only for the recipient.",
    actualResult: "Blank white page, no console errors captured yet.",
    source: "production", foundIn: "Production", reporterKey: "amir",
    escapeClass: "selection_gap", escapeStatus: "pending",
  },
];

export interface DemoTask {
  key: string;
  projectKey: string;
  milestoneKey?: string;
  requirementKey?: string;
  name: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: string;
  assigneeKeys: string[];
  module: string;
  startDate?: string;
  dueDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  completionPercentage?: number;
}

export const TASKS: DemoTask[] = [
  { key: "t-login-regr", projectKey: "portal", milestoneKey: "sprint12", requirementKey: "r-login", name: "Regression-test authentication module for Sprint 12", priority: "High", status: "released_to_production", assigneeKeys: ["nadia"], module: "Authentication", startDate: "2026-06-14", dueDate: "2026-06-19", actualStartDate: "2026-06-14", actualEndDate: "2026-06-19", estimatedHours: 8, actualHours: 9, completionPercentage: 100 },
  { key: "t-search-regr", projectKey: "portal", milestoneKey: "sprint12", requirementKey: "r-search", name: "Verify search relevance tuning", priority: "Medium", status: "done", assigneeKeys: ["farid"], module: "Search", startDate: "2026-06-15", dueDate: "2026-06-19", actualStartDate: "2026-06-15", actualEndDate: "2026-06-18", estimatedHours: 6, actualHours: 5, completionPercentage: 100 },
  { key: "t-lockout-fix-verify", projectKey: "portal", milestoneKey: "sprint12", requirementKey: "r-login-lockout", name: "Re-verify account lockout fix (DEF from Sprint 12)", priority: "High", status: "done", assigneeKeys: ["nadia"], module: "Authentication", startDate: "2026-06-19", dueDate: "2026-06-20", actualStartDate: "2026-06-19", actualEndDate: "2026-06-20", estimatedHours: 2, actualHours: 2, completionPercentage: 100 },

  { key: "t-checkout-test", projectKey: "portal", milestoneKey: "sprint13", requirementKey: "r-guest-checkout", name: "Execute guest checkout test suite", priority: "Critical", status: "in_progress", assigneeKeys: ["farid", "nadia"], module: "Checkout", startDate: "2026-06-28", dueDate: "2026-07-05", estimatedHours: 12, actualHours: 7, completionPercentage: 60 },
  { key: "t-cart-merge-dev-support", projectKey: "portal", milestoneKey: "sprint13", requirementKey: "r-cart-persist", name: "Clarify cart-merge rule with FA and re-test", priority: "Medium", status: "blocked", assigneeKeys: ["farid"], module: "Cart", startDate: "2026-06-29", dueDate: "2026-07-01", estimatedHours: 4, actualHours: 1, completionPercentage: 20 },
  { key: "t-promo-env", projectKey: "portal", milestoneKey: "sprint13", requirementKey: "r-guest-promo", name: "Request promo-code admin access for SIT environment", priority: "Low", status: "uat", assigneeKeys: ["farid"], module: "Checkout", startDate: "2026-06-30", dueDate: "2026-07-03", estimatedHours: 2, completionPercentage: 30 },

  { key: "t-transfer-uat", projectKey: "banking", milestoneKey: "uat1", requirementKey: "r-transfer", name: "Run fund transfer UAT with business users", priority: "Critical", status: "released_to_production", assigneeKeys: ["weiling"], module: "Fund Transfer", startDate: "2026-06-08", dueDate: "2026-06-14", actualStartDate: "2026-06-08", actualEndDate: "2026-06-14", estimatedHours: 16, actualHours: 18, completionPercentage: 100 },
  { key: "t-estatement-fix-verify", projectKey: "banking", milestoneKey: "uat1", requirementKey: "r-estatement", name: "Re-test e-statement month-mismatch fix", priority: "High", status: "done", assigneeKeys: ["weiling"], module: "Statements", startDate: "2026-06-14", dueDate: "2026-06-15", actualStartDate: "2026-06-14", actualEndDate: "2026-06-15", estimatedHours: 3, actualHours: 3, completionPercentage: 100 },

  { key: "t-billpay-test", projectKey: "banking", milestoneKey: "release20", requirementKey: "r-billpay", name: "Execute bill payment test suite", priority: "High", status: "sit", assigneeKeys: ["weiling"], module: "Bill Payment", startDate: "2026-07-01", dueDate: "2026-07-06", estimatedHours: 10, actualHours: 6, completionPercentage: 65 },
  { key: "t-biometric-followup", projectKey: "banking", milestoneKey: "release20", requirementKey: "r-biometric", name: "Follow up with dev on Face ID toggle defect", priority: "Critical", status: "blocked", assigneeKeys: ["weiling", "devan"], module: "Biometrics", startDate: "2026-07-02", dueDate: "2026-07-04", estimatedHours: 4, actualHours: 2, completionPercentage: 40 },
  { key: "t-rewards-scoping", projectKey: "banking", milestoneKey: "release21", requirementKey: "r-rewards-redeem", name: "Scope test approach for rewards redemption", priority: "Low", status: "new", assigneeKeys: ["weiling"], module: "Rewards", startDate: "2026-07-10", dueDate: "2026-07-15", estimatedHours: 3, completionPercentage: 0 },

  { key: "t-prod-doubletransfer-rca", projectKey: "banking", name: "Root-cause the double-transfer production incident", priority: "Critical", status: "done", assigneeKeys: ["devan", "amir"], module: "Fund Transfer", startDate: "2026-06-25", dueDate: "2026-06-27", actualStartDate: "2026-06-25", actualEndDate: "2026-06-28", estimatedHours: 8, actualHours: 11, completionPercentage: 100 },

  // New scenario: late SSO requirement — QA spinning up test approach while sprint13 already running
  { key: "t-sso-prep", projectKey: "portal", milestoneKey: "sprint13", requirementKey: "r-sso-google", name: "Prepare test cases and environment for Google SSO", priority: "High", status: "new", assigneeKeys: ["nadia"], module: "Authentication", startDate: "2026-07-05", dueDate: "2026-07-08", estimatedHours: 5, completionPercentage: 0 },

  // New scenario: dev mid-development when requirement gets edited back to in_review
  { key: "t-billpay-dispute-dev", projectKey: "banking", milestoneKey: "release20", requirementKey: "r-billpay-dispute", name: "Develop bill payment dispute flow (on hold — req back in review)", priority: "High", status: "blocked", assigneeKeys: ["devan"], module: "Bill Payment", startDate: "2026-07-01", dueDate: "2026-07-07", estimatedHours: 12, actualHours: 5, completionPercentage: 40 },

  // Hafiz Rosli (dev_member, under Devan) — heavier dev load on Portal
  // (where Devan has no tasks at all), lighter load on Banking, so the PM
  // Dashboard capacity table shows the same person's workload differing by
  // project.
  { key: "t-cart-merge-dev", projectKey: "portal", milestoneKey: "sprint13", requirementKey: "r-cart-merge", name: "Implement cart-merge quantity rule", priority: "Medium", status: "in_progress", assigneeKeys: ["hafiz"], module: "Cart", startDate: "2026-06-27", dueDate: "2026-07-04", actualStartDate: "2026-06-27", estimatedHours: 10, actualHours: 6, completionPercentage: 55 },
  { key: "t-sso-backend-dev", projectKey: "portal", milestoneKey: "sprint13", requirementKey: "r-sso-google", name: "Build Google OAuth backend integration", priority: "High", status: "blocked", assigneeKeys: ["hafiz"], module: "Authentication", startDate: "2026-06-29", dueDate: "2026-07-06", estimatedHours: 14, actualHours: 3, completionPercentage: 20 },
  { key: "t-lockout-dev-fix", projectKey: "portal", milestoneKey: "sprint12", requirementKey: "r-login-lockout", name: "Fix account lockout logic after 5 failed attempts", priority: "High", status: "released_to_production", assigneeKeys: ["hafiz"], module: "Authentication", startDate: "2026-06-16", dueDate: "2026-06-19", actualStartDate: "2026-06-16", actualEndDate: "2026-06-18", estimatedHours: 6, actualHours: 7, completionPercentage: 100 },
  { key: "t-rewards-dev-scoping", projectKey: "banking", milestoneKey: "release21", requirementKey: "r-rewards-redeem", name: "Scope rewards redemption backend design", priority: "Low", status: "new", assigneeKeys: ["hafiz"], module: "Rewards", startDate: "2026-07-10", dueDate: "2026-07-16", estimatedHours: 4, completionPercentage: 0 },
];

// ── CR033p2: Risk Register ────────────────────────────────────────────────
// Covers every cell of the 3x3 probability x impact heat map (low/medium/
// high score bands plus the high-high critical cell), every category, every
// status, and a mix of milestone-tagged vs general (project-wide) risks —
// so the PM Dashboard's Risk Register card has a full scenario count to show.
// raisedByKey must be a Lead-tier+ user (POST /risks is gated) — amir
// (pm_lead), nadia (qa_lead), siti (fa_lead), devan (dev_lead) all qualify.
export interface DemoRisk {
  key: string;
  projectKey: string;
  milestoneKey?: string; // omitted = general / project-wide
  title: string;
  description?: string;
  category: "schedule" | "scope" | "resource" | "technical" | "external" | "other";
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  status: "open" | "mitigating" | "closed" | "realized";
  mitigationPlan?: string;
  responseStrategy?: "avoid" | "transfer" | "mitigate" | "accept";
  ownerKey?: string;
  raisedByKey: string;
}

export const RISKS: DemoRisk[] = [
  // low x low = Low
  {
    key: "risk-holiday-freeze", projectKey: "banking", category: "schedule", probability: "low", impact: "low", status: "open",
    raisedByKey: "amir", title: "Year-end change freeze could delay final QA sign-off",
    description: "Bank's IT ops enforces a Dec 15–Jan 2 change freeze; if Release 2.1 slips past early December, sign-off has to wait until January.",
  },
  // low x medium = Low
  {
    key: "risk-scope-rewards-tiers", projectKey: "banking", milestoneKey: "release20", category: "scope", probability: "low", impact: "medium", status: "mitigating",
    raisedByKey: "siti", ownerKey: "siti", responseStrategy: "avoid", title: "Rewards team may add tiered redemption mid-release",
    mitigationPlan: "FA lead confirmed scope is locked for 2.0; tiered redemption deferred to the 2.1 backlog.",
  },
  // low x high = Medium
  {
    key: "risk-portal-search-spof", projectKey: "portal", category: "resource", probability: "low", impact: "high", status: "open",
    raisedByKey: "nadia", title: "Only one QA engineer covers Search — single point of failure for regression coverage",
    description: "Farid is the only tester who owns the search relevance suite; any absence blocks Sprint 13/14 regression.",
  },
  // medium x low = Low
  {
    key: "risk-cart-merge-ambiguity", projectKey: "portal", milestoneKey: "sprint13", category: "technical", probability: "medium", impact: "low", status: "mitigating",
    raisedByKey: "devan", ownerKey: "devan", responseStrategy: "mitigate", title: "Cart-merge quantity rule still ambiguous for edge cases (out-of-stock mid-merge)",
    mitigationPlan: "Dev lead scheduled a clarification session with FA this week; interim rule (cap at stock) already implemented as a placeholder.",
  },
  // medium x medium = Medium
  {
    key: "risk-kyc-vendor-sla", projectKey: "banking", category: "external", probability: "medium", impact: "medium", status: "open",
    raisedByKey: "amir", title: "Third-party KYC vendor API has no committed SLA for sandbox uptime",
    description: "Sandbox has had two unannounced outages in the last month; no formal SLA exists in the vendor contract.",
  },
  // medium x high = High
  {
    key: "risk-biometric-license", projectKey: "banking", milestoneKey: "release20", category: "other", probability: "medium", impact: "high", status: "mitigating",
    raisedByKey: "devan", ownerKey: "devan", responseStrategy: "mitigate", title: "Biometric SDK license renewal falls mid-release",
    mitigationPlan: "Procurement notified six weeks ahead; renewal PO raised and being tracked with the vendor account manager.",
  },
  // high x low = Medium
  {
    key: "risk-legacy-payment-sunset", projectKey: "portal", category: "schedule", probability: "high", impact: "low", status: "closed",
    raisedByKey: "amir", ownerKey: "amir", responseStrategy: "mitigate", title: "Legacy payment gateway sunset date could force emergency rework",
    mitigationPlan: "Vendor confirmed the sunset date was pushed to Q1 2027 — no longer a near-term risk for Sprint 12/13.",
  },
  // high x medium = High
  {
    key: "risk-sso-security-review", projectKey: "portal", milestoneKey: "sprint13", category: "technical", probability: "high", impact: "medium", status: "open",
    raisedByKey: "nadia", title: "Google SSO integration has not yet passed a formal security review",
    description: "OAuth scopes and token storage haven't been reviewed by InfoSec; the Sprint 13 target date assumes no review is required.",
  },
  // high x high = Critical
  {
    key: "risk-regulatory-approval", projectKey: "banking", category: "external", probability: "high", impact: "high", status: "realized",
    raisedByKey: "amir", ownerKey: "amir", responseStrategy: "accept", title: "Regulatory approval for new fund-transfer limits delayed by central bank",
    description: "Central bank review queue backed up; this risk has materialized and is now the root cause behind Release 2.0's schedule risk.",
    mitigationPlan: "Escalated to the compliance team; approval is now expected to slip Release 2.0 by roughly three weeks.",
  },
];
