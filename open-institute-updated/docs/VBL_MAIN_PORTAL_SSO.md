# SSO
1. Student/trainer is logged into the portal, clicks *Virtual Business Lab*.
2. `POST /api/integration/v1/sso/assertion` (portal auth) -> `{assertion, expiresAt, labUrl}`. Assertion = `base64url(JSON claims) + "." + hex HMAC-SHA256(PORTAL_SSO_SECRET)`; claims: `iss=kvbdtc-portal, aud=virtual-business-lab, sub, portalUserId, portalStudentId|portalTrainerId, registrationNumber, roles, nonce, issuedAt, expiresAt` (60 s). **No password ever crosses.**
3. Browser goes to `<labUrl>/lab?assertion=...`; the page POSTs it to `/integration/v1/sso`.
4. Lab verifies signature, issuer, audience, expiry, and burns the **one-time nonce** (replay -> 409). Students are JIT-provisioned/looked up via `integration_student_map`; trainers must already be mapped (created by a `staff.assigned` event). A local session token is returned.
Tested: valid, expired, replayed, malformed, unmapped trainer. **Known limits:** shared-secret HMAC (not asymmetric/JWKS); SSO secret rotation is manual; the Lab landing page shows only companies / pending assessments — a full Lab UI does not exist.
