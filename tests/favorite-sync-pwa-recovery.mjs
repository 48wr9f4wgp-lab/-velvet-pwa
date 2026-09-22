import assert from "node:assert/strict";
import {
  normalizeRecoveryPairCode,
  planSharedFavoriteRecovery
} from "../src/favorite-sync-recovery.js";
import { mergeFavoriteDisplayRows } from "../src/favorite-live-sync.js";

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

const displayRows = mergeFavoriteDisplayRows(
  [
    {
      id: "local-1",
      image_url: "https://cdn.example.com/local.jpg",
      page_url: "https://example.com/local"
    }
  ],
  [
    {
      uid: "p:https://example.com/script",
      id: "script-1",
      image_url: "https://cdn.example.com/script.jpg?token=abc",
      page_url: "https://example.com/script?utm_source=x"
    },
    {
      id: "local-alias",
      image_url: "https://cdn.example.com/local.jpg?token=def",
      page_url: "https://example.com/local?utm_source=y"
    }
  ]
);
assert.equal(displayRows.length, 2, "shared-only favorites must render even when absent from local liked IDs");
assert.equal(displayRows[0].id, "script-1", "shared union should be a first-class display source");
assert.ok(displayRows.some(row => row.id === "local-alias" || row.id === "local-1"), "local favorite should remain present");
assert.equal(displayRows.filter(row => row.page_url?.includes("/local")).length, 1, "same favorite must not duplicate across local/shared identities");

console.log("Velvet PWA shared favorite recovery tests OK");
