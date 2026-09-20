# Velvet Pinterest category setup

Velvet v49 treats Pinterest as a separate live category.

## Architecture

- Pinterest is not merged into `velvet-content.json`.
- Pinterest API data is not committed to GitHub or persisted by Velvet.
- Selecting the Pinterest category fetches the configured board live through `/api/pinterest`.
- The `すべて` category continues to contain only Velvet's existing sources.
- Pinterest Pins are not added to Velvet favorites or preference-learning state.
- Each Pin links back to its canonical Pinterest Pin page.
- Velvet does not scrape Pinterest.

This separation is intentional because Pinterest's Developer Guidelines restrict storage of API-derived information and require Pinterest content to link back to Pinterest.

## Vercel environment variables

Configure these variables on the Vercel project:

- `PINTEREST_ACCESS_TOKEN`
- `PINTEREST_BOARD_ID`

Use a dedicated board whose contents you are comfortable exposing through this personal PWA. The current Velvet deployment does not have user authentication protecting `/api/pinterest`, so do not point it at a secret/private board.

## Pinterest API access

The board read flow needs Pinterest API access with the minimum read scopes required for the board and Pins, normally:

- `boards:read`
- `pins:read`

Pinterest requires an approved developer app/business account for API access. Test tokens can be used for initial validation, but production tokens expire and must be managed according to Pinterest's current authentication documentation.

References:

- https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
- https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/
- https://policy.pinterest.com/en/developer-guidelines
