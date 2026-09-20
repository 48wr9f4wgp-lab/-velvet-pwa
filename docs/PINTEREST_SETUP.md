# Velvet Pinterest category

Velvet v49 uses Pinterest's official Board/Profile website widget, not the Pinterest API.

- No Developer App
- No Business API approval
- No access token
- No Vercel environment variables
- No scraping
- No Pinterest data is copied into velvet-content.json
- Pinterest's pinit.js loads only when the Pinterest category is opened and a public Pinterest URL is configured

## Setup

1. Open a public Pinterest profile or public board.
2. Copy its normal Pinterest URL.
3. In Velvet choose Pinterest.
4. Paste the URL and tap 表示する.

Velvet stores only that URL in localStorage on the device.

Examples:
- https://www.pinterest.com/exampleuser/
- https://www.pinterest.com/exampleuser/exampleboard/

Board URLs use embedBoard. Profile URLs use embedUser.
Pinterest documents that Board widgets can show up to 50 Pins and adapt columns to the parent width.

Official references:
- https://developers.pinterest.com/docs/web-features/widgets/
- https://developers.pinterest.com/docs/web-features/add-ons-overview/
