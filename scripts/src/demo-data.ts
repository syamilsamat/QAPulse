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
}

export const PROJECTS: DemoProject[] = [
  {
    key: "portal",
    name: "Customer Portal Revamp — DEMO",
    description: "Modernization of the customer-facing web portal: auth, search, checkout, cart, and wishlist.",
    teamKey: "portal-squad",
    directMemberKeys: ["amir", "siti", "devan"],
  },
  {
    key: "banking",
    name: "Mobile Banking App — DEMO",
    description: "Mobile banking app covering fund transfers, bill payment, biometric login, and rewards.",
    teamKey: "banking-squad",
    directMemberKeys: ["amir", "siti", "devan"],
  },
];

export interface DemoMilestone {
  key: string;
  projectKey: string;
  name: string;
  type: "sprint" | "phase" | "release" | "cr";
  status: "completed" | "active" | "planned" | "cancelled";
  targetDate: string;
}

export const MILESTONES: DemoMilestone[] = [
  { key: "sprint12", projectKey: "portal", name: "Sprint 12", type: "sprint", status: "completed", targetDate: "2026-06-20" },
  { key: "sprint13", projectKey: "portal", name: "Sprint 13", type: "sprint", status: "active", targetDate: "2026-07-02" }, // overdue
  { key: "sprint14", projectKey: "portal", name: "Sprint 14", type: "sprint", status: "planned", targetDate: "2026-07-22" },
  { key: "uat1", projectKey: "banking", name: "UAT Phase 1", type: "phase", status: "completed", targetDate: "2026-06-15" },
  { key: "release20", projectKey: "banking", name: "Release 2.0", type: "release", status: "active", targetDate: "2026-07-09" }, // at risk
  { key: "release21", projectKey: "banking", name: "Release 2.1", type: "release", status: "planned", targetDate: "2026-08-15" },
];

export const MODULES = [
  "Authentication", "Search", "Checkout", "Cart", "Wishlist",
  "Fund Transfer", "Statements", "Bill Payment", "Biometrics", "Rewards",
];

export type ReviewFlow = "none" | "approve" | "reject-then-approve";

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
}

export const REQUIREMENTS: DemoRequirement[] = [
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
];
