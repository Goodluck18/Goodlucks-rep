# Critical Correction — Agent/Landlord Verification & Mandatory Listing Access

Branch `arena/40f19dd4-goodlucks-rep` · commit `6ba5ff3` · PR #21 (open) · nothing deployed

---

## 1. Root cause

Three problems, all structural rather than cosmetic:

1. **Listing was never conditioned on verification.** `handle_create_property` only called
   `require_provider_classification()`, and for agents it consulted `agent_can_submit_listings()` — an
   administrator's account switch. `identity_verifications` was read for display only. A landlord could
   register and publish the same minute; an agent needed a staff toggle, not a verified identity.
2. **Verification was described as optional.** `VerificationPanel` carried "Optional for landlords",
   `LandlordDashboard` printed "Identity verification is optional for landlords / You can register and list
   properties without it", and the identity form's copy implied listing did not depend on it.
3. **Approval granted nothing.** `record_verification_decision()` wrote the row, notified the subject and
   stopped. Nothing connected "identity approved" to "may list", so the rule could not be enforced even if
   someone wanted to.

The correction therefore had to introduce a single authority for the question *may this account list?*, make
the identity decision the event that opens listing, and apply that authority to every route that submits or
changes a property — then remove the copy that contradicted it.

---

## 2. Files changed

**Backend**
| File | Change |
|---|---|
| `php-backend/lib/verification.php` | new `LISTING_VERIFICATION_MESSAGE`, `provider_listing_state()`, `grant_listing_access_after_identity_approval()`; approval hook + "You can now list properties" notification; landlord `operatingLocation` requirement and persistence; summary gains `classification`, `classificationRequired`, `isLandlord`, `operatingLocation`, `listing{…}` |
| `php-backend/lib/api.php` | new `require_provider_listing_access()`; applied to `handle_create_property` **and** `handle_update_property`; inner agent message reworded as the suspension switch |
| `php-backend/lib/auth.php` | `public_user()` exposes `canListProperties`, `listingBlockedReason`, `identityVerificationStatus`, `verifiedLabel` for provider roles |

**Frontend**
| File | Change |
|---|---|
| `src/components/VerificationGate.tsx` *(new)* | the one notice + the one sentence, reused by dashboards and the listing page |
| `src/components/VerificationPanel.tsx` | mandatory banner (state, 3 steps, after-submission, agent tier), Step 1 classification, Step 2 identity + landlord operating location, Step 3 Tier 2; optional-for-landlords copy and ownership essay removed |
| `src/components/ListPropertyView.tsx` | blocked accounts get the rule and a way to satisfy it, not an unusable form |
| `src/components/LandlordDashboard.tsx` / `AgentDashboard.tsx` | gate notice; "Verify to list" instead of a dead CTA; verification section copy corrected |
| `src/components/AgentListingForm.tsx` | closed-state copy names verification, not only "administrator approval" |
| `src/components/ProviderClassificationView.tsx`, `src/context/AppContext.tsx` | choosing Agent/Landlord now continues straight into verification |
| `src/components/AdminAgentAccounts.tsx` | "Identity not approved — listing blocked" badge |
| `src/types.ts`, `src/services/apiService.ts` | new fields; `operatingLocation` on the identity submission |

**Tests**
| File | Change |
|---|---|
| `tests/listing-verification.test.mjs` *(new)* | 16 cases (the 15 required + the edit gate) |
| `tests/approve-verification.php` *(new)* | fixture: an approved identity (row + document + agent activation) |
| `tests/helpers.mjs` | `approveProviderVerification()` |
| `tests/{api,task03,user-management,admin-console-api,provider-classification,provider-experience-phase6,tenant-experience}.test.mjs` | fixtures verified where they list; assertions on pre-verification states kept on raw accounts |
| `package.json` | new suite added to `test:api`; `test:listing-verification` script |

No schema change, no migration, no data deletion.

---

## 3. Registration and classification lifecycle

- Exactly two groups remain: **Tenant** and **Agent/Landlord**. The Agent/Landlord group is one account
  (`role` internally `agent` until it chooses), returned with `providerCategory: 'pending'`,
  `classificationRequired: true`, `agentProfile: null`, `isVerified: false`, `canListProperties: false`.
- **Registering never produces a Landlord.** The classification is written only by
  `POST /api/account/classification`, once (a second attempt is refused), audited as `provider.classified`.
- **Verification cannot start before the choice**: document upload and identity submission both run
  `require_provider_classification()` and answer `409` with `fields.classificationRequired`.
- The choice is not a second account and not a second sign-in; the client now navigates from the choice
  directly to `/agent/verification` or `/landlord/verification`.
- A `landlord` row that registers with the role directly (an existing path, and the historical data shape) is
  classified at registration exactly as before — legacy records need no migration.

**Listing authority** (`provider_listing_state()`), derived on every read from stored records:

```
canList = classification is agent|landlord
          AND identity_verifications.status === 'approved'
          AND (role === 'landlord' OR agent profile is not 'suspended')
```

`verifiedLabel` is likewise derived: `Verified Landlord`, `Verified Agent Tier 1` (identity), or
`Verified Agent Tier 2` (identity + approved professional authorisation).

---

## 4. Landlord verification

- Requirements: Ghana Card (both sides), **the official name as printed**, and the **operating location** they
  let property in. The location is required at submission when the account holds none
  (`errors.operatingLocation = "Tell us the city or area you let property in."`) and is persisted to the
  account so the member, the reviewer and the summary all read the same value.
- **No licensing is required or offered**: `POST /api/verification/professional` answers `403` for a landlord.
- On approval: the identity row becomes `approved`, `verifiedLabel` becomes **Verified Landlord**, the
  landlord dashboard is where the account already lives, and listing access opens — the create call succeeds
  and returns a `pending` listing for staff review.
- An approved identity is still **not** an ownership check: every payload keeps
  `establishesOwnership: false`, and the panel says so without implying the check is optional.

---

## 5. Agent Tier 1

- Requirement: Ghana Card identity (both sides + official name).
- On approval, in the same transaction as the decision, `grant_listing_access_after_identity_approval()`
  sets the agent profile to `active` with `can_submit_listings = 1` (note: "Identity verified — Agent Tier 1
  listing access granted."). It **never** overrides a suspension.
- Derived state: `tier: standard`, `commissionTier: tier_a`, **60% agent / 40% Goodlucks**, `verifiedLabel:
  Verified Agent Tier 1`, `canList: true`.
- The member hears about it: "You can now list properties" (or, for a suspended account, an explicit note that
  listing stays closed).

---

## 6. Agent Tier 2

- Requirement: a licence / regulatory authorisation / other credential, uploaded **and** submitted with its
  number, issuer, category and dates.
- Submitting changes nothing: the authorisation sits at `pending_review`, the tier stays `tier_a` at 60%, and
  the label stays `Verified Agent Tier 1` (asserted in the suite).
- Only `POST /api/admin/verifications/{id}/professional/decision` with `approve` moves the account:
  `commissionTier: higher`, **70% agent / 30% Goodlucks**, `verifiedLabel: Verified Agent Tier 2`, and the
  "higher commission tier" notification. Losing it (`mark_expired`) drops the split back to 60/40 by itself,
  because the tier is derived, not stored.

---

## 7. Backend listing restrictions

| Route | Before | Now |
|---|---|---|
| `POST /api/properties` | classification only (agents additionally needed `can_submit_listings`) | `require_provider_listing_access()` then the suspension switch |
| `PUT /api/properties/{id}` | ownership only | `require_provider_listing_access()` + ownership |
| `POST /api/properties/{id}/status`, `/verify`, `/feature` | administrator-only | unchanged — administrators are exempt, so moderation keeps working |
| `DELETE /api/properties/{id}` | ownership only | unchanged (removal is not publication; the gate covers create and edit) |

Refusal shape:

```json
{ "success": false,
  "error": "Complete your identity verification to start listing properties on Goodlucks Homes.",
  "fields": { "verificationRequired": "…same sentence…",
              "verificationStatus": "not_submitted",
              "classificationRequired": "Choose Agent or Landlord to continue." } }
```

`verificationStatus` reports the true state (`not_submitted`, `pending_review`, `rejected`, …) and a suspended
account is told it is suspended rather than unverified. **Hiding the button is not the enforcement** — the
suite proves the API refuses an unauthenticated payload that claims `status: 'active'`, `role: 'admin'`,
`isVerified: true` or `canListProperties: true`, that it refuses publication of someone else's listing, and that
a refused submission stores nothing (0 rows in `mine`).

---

## 8. Removed / corrected messaging

| Removed | Where |
|---|---|
| "Identity verification is optional for landlords." | `LandlordDashboard` verification header |
| "Identity verification is optional — you can register and list properties without it." | `LandlordDashboard` card |
| "(Optional for landlords)" on the identity card | `VerificationPanel` |
| "Identity verification is optional for landlords; never proof of ownership." | `LandlordDashboard` code comment |
| "The official Ghana Card name … is a claim, not a verification" framing of optionality | replaced by the mandatory steps |
| "Listing submissions open once an administrator approves your agent account" | `AgentListingForm` → names verification |
| "pending review" as the reason listing is closed | API → names verification; suspension has its own sentence |

Kept, because it is true and must not be lost: an approved identity is **not** a property inspection and not
proof of ownership. The panel states it inside the mandatory flow, so honesty no longer reads as optionality.
The long privacy essay was reduced to the facts the code enforces (private storage, reviewer-only access with
an audit record, retention, no inspection implied).

---

## 9. Tests and actual results

Command results below are from this session, on this branch, with the SQLite driver and PHP-WASM.

| Suite | Result |
|---|---|
| `npm run test:api` (13 files, incl. the new suite) | **365 tests · 365 pass · 0 fail** |
| `npm run test:listing-verification` (new) | **16 · 16 pass · 0 fail** |
| `npm run test:provider-phase6` | 22 · 22 pass |
| `npm run test:tenant-experience` | 11 · 11 pass |
| `npm run test:receipts-removed-phase7` | 9 · 9 pass |
| `npm run test:fee-policies-phase4` | 12 · 12 pass |
| `npm run test:blog` / `test:blog-html` | 45 · 16 pass |
| `npm run test:sharing` / `test:uploads` | 36 · 20 pass |
| `npm run test:admin-console` / `-phase3` / `-phase4` / `-phase5` | 16 · 11 · 12 · 19 pass |
| `npm run test:property` / `test:access` / `test:content` / `test:design` | 23 · 11 · 4 · 14 pass |
| `npm run test:email-footer` | 3 pass |
| `npm run test:routing` / `test:navigation` / `test:responsive` | 50 · 64 · 20 pass |
| `npx tsc --noEmit` | clean |
| PHP lint (`php-wasm-cli -l`) on the 3 changed backend files + the new fixture | no syntax errors |
| `npm run build` | OK — `dist/assets/index-*.js` 504.36 kB (147.47 kB gzip), CSS 85.83 kB |

**The 15 required regression cases** (all in `tests/listing-verification.test.mjs`, numbered as tested):

1. tenant registers, signs in, tenant dashboard, no verification duty *(test 1)*
2. the Agent/Landlord group creates one shared account *(test 2)*
3. registration never makes it a Landlord and grants no listing *(tests 2–3)*
4. must choose Agent or Landlord before verification/listing *(tests 3–4)*
5. unverified account cannot create a listing *(test 5)*
6. direct API bypass is blocked (payload decorations, publish, foreign edit, zero rows stored) *(test 6)*
7. landlord verification needs Ghana Card + official name + operating location, and no licence *(test 7)*
8. approved landlord can list and reads as Verified Landlord *(test 8)*
9. agent identity approval → Agent Tier 1 with listing access *(test 9)*
10. Tier 1 can list; 60/40 *(test 10)*
11. Tier 2 submission changes nothing *(test 11)*
12. Tier 2 only on administrator approval; 70/30 *(test 12)*
13. existing verified accounts keep access *(test 13)*
14. commission maths for both tiers *(test 14)*
15. administrator property management intact *(test 15)*
16. *(extra)* editing is gated too — a suspended provider cannot rewrite its advert *(test 15b)*

**Live-server smoke test** (real HTTP through the running dev server on port 43131, not a browser):

```
POST /api/auth/register (role provider) → 201, canListProperties false, reason classification_required
POST /api/properties                      → 403 "Complete your identity verification to start listing properties on Goodlucks Homes."
POST /api/account/classification agent    → 200, still canListProperties false, reason identity_not_submitted
GET  /api/verification                    → listing.canList false, classification "agent", isLandlord false
GET  / , /agent/verification, /landlord/verification, /verify/classification,
     /account/classification, /properties, /agent/properties, /landlord/properties → all 200
```

**Not run here (and not claimed):** a real browser (no Chrome/Playwright in the sandbox), MySQL (no server;
only SQLite was exercised), and mail delivery (`EMAIL_TRANSPORT=none`).

**Manual verification steps** for those three, on a machine that has them:

1. *Browser*: sign in as a fresh Agent/Landlord account → `/agent/verification` should show the amber
   mandatory banner with three steps; `/agent/properties` should show "Verify to list" and the notice, and
   `/list-property` should show the blocked page. Submit the Ghana Card (both sides) plus the official name
   and, for a landlord, the location; then approve it in the console and confirm listing opens and the label
   reads "Verified Landlord" / "Verified Agent Tier 1".
2. *MySQL*: run the backend against MySQL with the existing schema, confirm `SELECT status FROM
   identity_verifications` still returns the historical rows and that no migration is required (the new code
   only reads existing columns and writes `users.address`, `users.provider_category`, `agent_profiles.*`,
   `identity_verifications.*`).
3. *Mail*: with a configured transport, confirm the approval emails/notifications — "You can now list
   properties" (identity approval) and the higher-tier notice (professional approval) — arrive once each.

---

## 10. Commit and push

- Commit: **`6ba5ff3`** — "Upgrade 2 correction: mandatory verification before property listing"
  (25 files changed, 1608 insertions, 106 deletions).
- Pushed to `origin/arena/40f19dd4-goodlucks-rep` (`ed344eb..6ba5ff3`), fast-forward, no force, no reset.
- PR **#21** is open on that head commit; its title and body were updated to describe this correction.
- Working tree clean after the commit; no `.data`, `dist`, upload or database file is tracked.

---

## 11. Remaining limitations

- **Landlord suspension does not exist** as a concept, so a landlord loses listing access only through its
  identity status (rejected / resubmission). If staff need to close a landlord's submissions, that wants an
  explicit control rather than a reinterpretation of the agent switch.
- **`DELETE /api/properties/{id}` is not gated** by verification. Deleting is a withdrawal, not a
  publication, and the requirement named create/edit/publish; say the word if it should be included.
- **Existing agent accounts that were verified before this change but never activated** keep
  `account_status = pending_review`: their identity is approved, so `canList` is true, but the agent-profile
  switch still refuses submission. That is the historical state, preserved deliberately; staff can activate
  them from the console, and the console now flags the divergence.
- **Approved identities cannot be re-submitted** by the member (409, by design, to stop an identity swap).
  Correcting one still needs staff.
- **A landlord's operating location falls back to the city given at registration** when the form omits it; an
  account with no stored city must supply it. That keeps existing records valid without a migration, but it
  means the value can predate verification.
- **Verification covers identity, not property.** No listing is marked verified because of an identity check,
  and nothing here inspects a property.
- **Unverified here:** browser rendering, MySQL, and mail delivery — the manual steps in section 9 cover them.
