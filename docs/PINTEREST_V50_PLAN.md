# Pinterest v50 plan

Status: IMPLEMENTED IN FEATURE BRANCH / LIVE OAUTH UNVERIFIED
Scope: Velvet title-local
Verified research date: 2026-09-20

The public Pinterest Board/Profile widget integration was retired in v49.2 because the intended Velvet use case should not require making private Pinterest boards public.

## Locked intent

- Keep Pinterest boards private.
- Authorize Pinterest once instead of repeatedly pasting board URLs.
- Show multiple authorized boards in Velvet with one-tap switching.
- Read only. Do not request Pinterest write scopes.
- Do not persist Pinterest boards or Pins into velvet-content.json.
- Do not expose Pinterest access or refresh tokens to browser JavaScript or the public repository.
- Do not restore the public Board/Profile widget approach.

## Official Pinterest basis

Pinterest's current OAuth documentation supports the Authorization Code grant for web apps and documents:
- boards:read for public boards;
- boards:read_secret for secret boards;
- pins:read for public Pins;
- pins:read_secret for secret Pins;
- access token lifetime of 30 days;
- continuous refresh tokens with a 60-day refresh window;
- exact-match redirect URIs;
- server-side protection of app secrets and tokens.

Official sources:
- https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
- https://developers.pinterest.com/docs/getting-started/connect-app/
- https://developers.pinterest.com/docs/key-concepts/best-practices/
- https://developers.pinterest.com/docs/key-concepts/access-tiers/

## v50 architecture

Browser:
- src/pinterest-private.js
- Pinterest appears as a fourth Flow category.
- Only the selected board ID is stored locally.
- Board and Pin payloads are fetched live and are not added to Velvet taste/history state.

Server:
- Authorization Code OAuth.
- AES-256-GCM encrypted HttpOnly cookies.
- Separate encrypted access-token and refresh-token cookies.
- SameSite=Lax, Secure cookies.
- OAuth state cookie with timing-safe callback validation.
- Automatic token refresh.
- Cache-Control private/no-store on private data endpoints.

Required Vercel environment variables:
- PINTEREST_APP_ID
- PINTEREST_APP_SECRET
- VELVET_PINTEREST_SESSION_SECRET

The redirect URI is derived from the active Velvet origin:
- https://<velvet-origin>/api/pinterest-callback

## Current validation state

Implemented:
- OAuth start/callback/disconnect plumbing.
- Encrypted session cookie layer.
- Board list endpoint.
- Per-board Pin endpoint with pagination.
- Multi-board switcher UI.
- Static security/regression QA.

Not yet verified:
- Real Pinterest Developer App approval.
- Real secret-board response shape from Pinterest API.
- Real OAuth callback in iPhone Home Screen PWA.
- Real Pin media rendering for all Pin types.
- Token refresh against live Pinterest.
- Device behavior after returning from Pinterest authorization.

Production merge is blocked until the real OAuth/device validation passes.
