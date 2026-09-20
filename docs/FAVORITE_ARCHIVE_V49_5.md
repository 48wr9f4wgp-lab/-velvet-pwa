# Velvet v49.5 Favorite Archive

Status: IMPLEMENTED IN FEATURE BRANCH / DEVICE VALIDATION PENDING
Date: 2026-09-20
Scope: Velvet title-local

## Product intent

A favorite must continue to appear in Velvet even if the live feed later removes the item or the original image URL stops responding.

## Design

When an item becomes a favorite:

1. Velvet snapshots the small item metadata into localStorage under a dedicated archive key.
2. Velvet fetches the favorite image with no-cors and stores the response in a dedicated Cache Storage cache.
3. The Service Worker intercepts image requests only, checks the dedicated favorite cache first, and otherwise falls through to the network.
4. Favorites view prefers the archived snapshot over the current live catalog.
5. Existing favorites that still exist in the current catalog are backfilled after upgrade. Metadata is stored immediately; media is cached sequentially to avoid an iPhone network burst.

When a favorite is removed:

- its archived metadata is removed immediately;
- media deletion is delayed briefly so the existing Undo action can restore it;
- cached media is deleted only when no other archived favorite uses the same URL.

Clear History / Clear All removes the favorite archive and media cache.

## Storage durability

Velvet requests persistent browser storage when a favorite is archived.

This is designed to survive:
- the item disappearing from velvet-content.json;
- the original remote image becoming unavailable;
- normal app restarts and ordinary network outages.

It cannot guarantee survival after:
- deleting the Home Screen PWA or clearing site data;
- browser/OS storage eviction despite a persistence request;
- device loss or migration without a separate backup/export.

Therefore "permanent" in v49.5 means durable local retention while Velvet's local app data remains present on the device.

## Security / scope

- No server upload.
- No GitHub persistence of user favorites.
- No external analytics.
- Shell JS/CSS/HTML remain network-first and are not cached by the Service Worker.
- The Service Worker cache-first path is limited to request.destination === "image".
