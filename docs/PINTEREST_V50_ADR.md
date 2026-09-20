# ADR: Pinterest private-board integration v50

Date: 2026-09-20
Title: Velvet
Scope: title-local
Status: ACCEPTED FOR PREVIEW VALIDATION

## Decision

Use Pinterest OAuth Authorization Code flow and server-side encrypted session cookies for private-board access.

Do not use:
- public Pinterest Board/Profile widgets;
- scraping;
- Pinterest login credentials;
- browser-visible access/refresh tokens;
- repository-stored credentials;
- write scopes.

## Why

The product requirement is to browse multiple Pinterest boards without changing those boards from private/secret to public.

A public widget cannot satisfy that requirement. A single server-side global token would also be unsafe because Velvet's web origin is publicly reachable and could expose one user's private data to unrelated visitors.

The selected architecture binds Pinterest authorization to an encrypted HttpOnly cookie on the user's browser. Private board and Pin data is fetched only for a request carrying that authorized session.

## Security properties

- App secret remains server-side.
- Access and refresh tokens are encrypted before being stored in cookies.
- Tokens are HttpOnly, Secure, SameSite=Lax.
- OAuth callback validates state with timing-safe comparison.
- Private API responses use private/no-store.
- Pinterest data is not written to GitHub or velvet-content.json.
- Client JavaScript never receives OAuth tokens.

## Known risk

iPhone Home Screen PWA OAuth return behavior must be validated on a real device. The implementation is not VERIFIED_BASELINE until a real Pinterest authorization can return to Velvet and the same Home Screen app can read the authenticated cookie session.

## Promotion gate

Do not merge v50 to Production until:
1. Pinterest Developer App is approved/configured.
2. Preview redirect URI is registered.
3. Real secret/private boards are returned.
4. Multiple boards switch correctly.
5. Pins render without persistence into Velvet taste/history.
6. iPhone Home Screen PWA survives the OAuth round trip.
7. Disconnect removes access.
8. GitHub QA remains green.
