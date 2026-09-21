import assert from "node:assert/strict";
import { canonicalizeUrlForIdentity, mergeSyncLibrary, unionFavorites } from "../lib/velvet-sync-core.js";

assert.equal(
  canonicalizeUrlForIdentity("https://EXAMPLE.com/a/?utm_source=x&b=2&a=1#frag"),
  "https://example.com/a?a=1&b=2"
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

console.log("Velvet favorite sync core tests OK");
