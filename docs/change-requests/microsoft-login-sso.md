# CR: Microsoft Login Integration

**Status:** Deferred — not yet started

## Context

QA Pulse currently uses email/password authentication (JWT). The goal is to replace this with Microsoft Entra ID (Azure AD) SSO — single-tenant, org accounts only. Password-based login is removed entirely. Users who sign in with a Microsoft email not already in QA Pulse get a "contact admin" error (no auto-provisioning). Admins pre-create user accounts with just name, email, and role — no password required.

The feature branch `claude/microsoft-login-integration-6cm4go` was 5 commits behind `main` (all execution fixes from June 29) at time of writing. Branch must be synced first.

---

## Steps

### 0. Sync branch with main
Merge `main` into the feature branch to pick up missing execution fix commits before implementing the feature.

---

### 1. DB Schema — make `password` nullable
**`lib/db/src/schema/users.ts`**
- Change `password: text("password").notNull()` → `password: text("password")`

Apply with `npx drizzle-kit push` from `lib/db/` (no migrations folder — project uses push mode).

---

### 2. API Zod — password optional in CreateUserBody
**`lib/api-zod/src/generated/api.ts`** (line 105)
- Change `password: zod.string()` → `password: zod.string().optional()`

---

### 3. Backend — new Microsoft auth endpoint
**`artifacts/api-server/src/routes/auth.ts`**

Add `POST /auth/microsoft`:
- Body: `{ idToken: string }`
- Validate the Azure AD ID token:
  - Fetch signing keys from `https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys` via `jwks-rsa`
  - Verify with `jsonwebtoken` (already installed): issuer = `https://sts.windows.net/${AZURE_TENANT_ID}/`, audience = `AZURE_CLIENT_ID`
- Extract `email` (from `preferred_username` or `upn` claims)
- Look up user in `usersTable` by email
- 404 if not found: `"Account not registered. Contact your QA administrator."`
- 403 if `isActive === false`: existing deactivated error
- Issue QA Pulse JWT via existing `signToken()` and return `{ user, token }`

Remove `POST /auth/login` (password login no longer used).
Keep `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password` unchanged (they don't hurt).

**New package** — add to `artifacts/api-server/package.json`:
- `jwks-rsa`

**New env vars** (backend, document in README/PROJECT.md):
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`

---

### 4. Frontend — replace Login page with Microsoft SSO

**New file**: `artifacts/qa-pulse/src/lib/msal.ts`
```ts
import { PublicClientApplication } from "@azure/msal-browser";

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
});
```

**`artifacts/qa-pulse/src/App.tsx`**
- Import `MsalProvider` from `@azure/msal-react` and `msalInstance` from `@/lib/msal`
- Wrap existing `<AuthProvider>` with `<MsalProvider instance={msalInstance}>`

**`artifacts/qa-pulse/src/pages/Login.tsx`** — full rewrite:
- Remove email/password form and force-change-password overlay
- Keep logo/branding (existing `AnimatedQALogo`)
- Add "Sign in with Microsoft" button — on click: `msalInstance.loginRedirect({ scopes: ["openid", "profile", "email"] })`
- Add a `useEffect` (via `useMsal()` hook) that fires when `accounts` array is non-empty:
  - `acquireTokenSilent({ scopes: ["openid"], account })` → get ID token
  - `POST /auth/microsoft` with `{ idToken }` → get QA Pulse `{ user, token }`
  - Call `AuthContext.login(user, token)` → redirect to `/dashboard`
  - On error (404/403): show toast and call `msalInstance.logout()`

**New packages** — add to `artifacts/qa-pulse/package.json`:
- `@azure/msal-browser`
- `@azure/msal-react`

**New env vars** (frontend):
- `VITE_AZURE_CLIENT_ID`
- `VITE_AZURE_TENANT_ID`

---

### 5. Settings — remove password from user creation
**`artifacts/qa-pulse/src/pages/Settings.tsx`**
- Remove `password` input from the Create User form (admin user management section)
- Remove the "Change Password" card (users no longer have QA Pulse passwords)
- Update the create-user mutation payload to omit `password`

**`artifacts/api-server/src/routes/users.ts`** — `POST /users`
- Remove `mustChangePassword: true` from the insert payload (no longer relevant)
- If `password` is provided (e.g. via API manually), still hash it — otherwise insert with `null`

---

## Verification

1. Register an Azure App in Entra ID:
   - Platform: Single Page Application (SPA), Redirect URI = app URL
   - Supported account types: single tenant
   - Enable ID tokens in Token configuration
2. Set env vars: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` (backend) + `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID` (frontend)
3. `cd lib/db && npx drizzle-kit push` to make `password` nullable
4. Start app — login page should show only "Sign in with Microsoft" button
5. Click button → Azure AD redirects back → QA Pulse JWT issued → dashboard loads
6. Try a Microsoft email not in DB → expect 404 toast "Account not registered"
7. Admin creates a new user (no password field) → user can log in via Microsoft
8. Test `GET /auth/me` still works with existing JWT tokens
