import assert from "node:assert/strict";
import {
  normalizeRecoveryPairCode,
  planSharedFavoriteRecovery
} from "../src/favorite-sync-recovery.js";

const code = "ABCD-ef12-GH34-ij56-KL78-mn90-OP12-qr34";
assert.equal(code.length, 39);
assert.equal(normalizeRecoveryPairCode(code), code);
assert.equal(normalizeRecoveryPairCode(JSON.stringify({ pair_code: code })), code);
assert.equal(normalizeRecoveryPairCode('{"pair_code":"' + code + '","x":1}'), code);

const payload = {
  items: [
    {
      id: "script-1",
      page_url: "https://example.com/post/1?utm_source=x",
      image_url: "https://cdn.example.com/a.jpg?token=one",
      aliases: { ids: ["script-1", "pwa-1"] }
    },
    {
      id: "script-2",
      page_url: "https://example.com/post/2",
      image_url: "https://cdn.example.com/b.jpg?token=two",
      aliases: { ids: ["script-2"] }
    }
  ],
  orphan_ids: ["orphan-1"]
};

const plan = planSharedFavoriteRecovery({
  payload,
  currentLikedIds: ["local-only"],
  catalog: [
    { id: "pwa-1", page_url: "https://example.com/post/1", image_url: "https://cdn.example.com/a.jpg" },
    { id: "pwa-2", page_url: "https://example.com/post/2?ref=feed", image_url: "https://cdn.example.com/b.jpg?token=other" }
  ]
});

assert.deepEqual(plan.likedIds, ["pwa-1", "pwa-2", "orphan-1", "local-only"]);
assert.equal(plan.archiveItems.length, 2);
assert.equal(plan.archiveItems[0].id, "pwa-1");
assert.equal(plan.archiveItems[1].id, "pwa-2");
assert.equal(plan.addedLocalIds, 3);
assert.equal(plan.representedRemoteIdCount, 4);

const dedupePlan = planSharedFavoriteRecovery({
  payload: {
    items: [
      { id: "a", page_url: "https://example.com/same", image_url: "https://cdn.example.com/x.jpg" },
      { id: "b", page_url: "https://example.com/same?utm_source=y", image_url: "https://cdn.example.com/x.jpg?token=z" }
    ],
    orphan_ids: []
  },
  currentLikedIds: [],
  catalog: [{ id: "catalog-same", page_url: "https://example.com/same", image_url: "https://cdn.example.com/x.jpg" }]
});
assert.deepEqual(dedupePlan.likedIds, ["catalog-same"]);
assert.equal(dedupePlan.archiveItems.length, 1);

console.log("Velvet PWA shared favorite recovery tests OK");
