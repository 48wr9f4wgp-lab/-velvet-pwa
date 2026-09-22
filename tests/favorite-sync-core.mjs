import assert from "node:assert/strict";
import { canonicalizeUrlForIdentity, combineSyncStates, mergeSyncLibrary, unionFavorites } from "../lib/velvet-sync-core.js";

assert.equal(
  canonicalizeUrlForIdentity("https://EXAMPLE.com/a/?utm_source=x&b=2&a=1#frag"),
  "https://example.com/a?a=1&b=2"
);
assert.equal(
  canonicalizeUrlForIdentity("https://example.com/post?source=edition&ref=42"),
  "https://example.com/post?ref=42&source=edition",
  "generic query keys must remain because they may be content identity"
);

const pwa = {
  id: "pwa-1",
  page_url: "https://example.com/post/42?utm_source=feed",
  image_url: "https://cdn.example.com/42.jpg?token=abc",
  source: "TGAV1",
  title: "PWA"
};

const scriptable = {
  id: "script-99",
  pageURL: "https://example.com/post/42",
  imageURL: "https://cdn.example.com/42.jpg?token=def",
  source: "TGAV1",
  sourceLabel: "Scriptable",
  ts: 1780000000000
};

const union = unionFavorites([pwa], [scriptable], "scriptable");
assert.equal(union.length, 1, "same page/media must merge across volatile IDs");
assert.deepEqual(new Set(union[0].aliases.ids), new Set(["pwa-1", "script-99"]));

const separate = unionFavorites(
  [{ id: "same", source: "A", image_url: "https://a.example/x.jpg" }],
  [{ id: "same", source: "B", image_url: "https://b.example/y.jpg" }],
  "scriptable"
);
assert.equal(separate.length, 2, "ID alone must not merge distinct sources");

const current = {
  items: [pwa],
  orphan_ids: ["legacy-orphan"],
  revision: 7
};
const merged = mergeSyncLibrary(current, {
  favorites: [scriptable],
  likedIds: ["script-99", "unresolved-id"]
}, "scriptable");

assert.equal(merged.items.length, 1);
assert.deepEqual(merged.orphan_ids.sort(), ["legacy-orphan", "unresolved-id"].sort());
assert.equal(merged.changed, true);

const idempotent = mergeSyncLibrary(
  { items: merged.items, orphan_ids: merged.orphan_ids },
  { favorites: [scriptable], likedIds: ["unresolved-id"] },
  "scriptable"
);
assert.equal(idempotent.changed, false, "replaying the same sync must be idempotent");

const noDelete = mergeSyncLibrary(
  { items: [pwa], orphan_ids: [] },
  { favorites: [], likedIds: [] },
  "pwa"
);
assert.equal(noDelete.items.length, 1, "phase A sync must never delete existing favorites");

const combined = combineSyncStates([
  {
    source: "legacy",
    state: {
      revision: 1,
      updated_at: "2026-09-20T00:00:00.000Z",
      items: [pwa],
      orphan_ids: ["legacy-only"]
    }
  },
  {
    source: "scriptable",
    state: {
      revision: 2,
      updated_at: "2026-09-21T00:00:00.000Z",
      items: [scriptable],
      orphan_ids: ["script-orphan"]
    }
  },
  {
    source: "pwa",
    state: {
      revision: 3,
      updated_at: "2026-09-22T00:00:00.000Z",
      items: [{
        id: "pwa-2",
        page_url: "https://example.com/post/99",
        image_url: "https://cdn.example.com/99.jpg",
        source: "TGAV2"
      }],
      orphan_ids: ["pwa-orphan"]
    }
  }
]);

assert.equal(combined.schema_version, 2);
assert.equal(combined.add_only, true);
assert.equal(combined.revision, 6);
assert.equal(combined.updated_at, "2026-09-22T00:00:00.000Z");
assert.equal(combined.items.length, 2, "legacy and Scriptable aliases should collapse while distinct PWA item remains");
assert.deepEqual(new Set(combined.orphan_ids), new Set(["legacy-only", "script-orphan", "pwa-orphan"]));

console.log("Velvet favorite sync core tests OK");
