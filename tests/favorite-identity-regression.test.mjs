import test from 'node:test';
import assert from 'node:assert/strict';
import { unionFavorites, mergeSyncLibrary, combineSyncStates } from '../lib/velvet-sync-core.js';
import { planSharedFavoriteRecovery } from '../src/favorite-sync-recovery.js';
import { mergeFavoriteDisplayRows } from '../src/favorite-live-sync.js';
const a = { id: 'script-a', source: 'same-source', page_url: 'https://example.test/post/1', image_url: 'https://media.example.test/a.jpg' };
const b = { ...a, id: 'script-b', image_url: 'https://media.example.test/b.jpg' };
const payload = items => ({ items, orphan_ids: [] });
const poisoned = item => ({ ...item, uid: 'p:' + a.page_url, aliases: { ids: ['old-group'], fingerprints: ['p:' + a.page_url, 'm:' + a.image_url] } });
test('server: distinct images on the same post remain separate', () => {
  assert.equal(unionFavorites([a], [b], 'scriptable').length, 2);
});
test('server: source ID reuse does not merge different image URLs', () => {
  assert.equal(unionFavorites([a], [{ ...b, id: a.id }], 'scriptable').length, 2);
});
test('server: legacy page/media fingerprints cannot reintroduce false merges', () => {
  assert.equal(unionFavorites([poisoned(a)], [poisoned(b)], 'scriptable').length, 2);
});
test('server: same image with different IDs and signed query still merges', () => {
  const rows = unionFavorites([a], [{ ...a, id: 'pwa-a', image_url: a.image_url + '?token=rotated' }], 'pwa');
  assert.equal(rows.length, 1);
  assert.deepEqual(new Set(rows[0].aliases.ids), new Set(['script-a', 'pwa-a']));
});
test('server: replay is idempotent and retains old records', () => {
  const first = mergeSyncLibrary(payload([a]), { favorites: [b] }, 'scriptable');
  assert.equal(first.items.length, 2);
  assert.equal(mergeSyncLibrary(first, { favorites: [b] }, 'scriptable').changed, false);
});
test('planner: two images sharing a post map by media, not by page', () => {
  const plan = planSharedFavoriteRecovery({ payload: payload([a, b]), catalog: [{ ...a, id: 'catalog-a' }, { ...b, id: 'catalog-b' }] });
  assert.deepEqual(new Set(plan.likedIds), new Set(['catalog-a', 'catalog-b']));
  assert.equal(plan.archiveItems.length, 2);
});
test('planner: contaminated old aliases cannot collapse two image records', () => {
  const plan = planSharedFavoriteRecovery({ payload: payload([poisoned(a), poisoned(b)]), currentLikedIds: ['old-group'], catalog: [] });
  assert.equal(plan.archiveItems.length, 2);
  assert.ok(plan.likedIds.includes('old-group'));
});
test('display: shared post does not hide a different image', () => {
  assert.equal(mergeFavoriteDisplayRows([a], [b]).length, 2);
});
test('display: inherited UID/fingerprints are not image equality', () => {
  assert.equal(mergeFavoriteDisplayRows([poisoned(a)], [poisoned(b)]).length, 2);
});
test('display: same image still appears only once', () => {
  assert.equal(mergeFavoriteDisplayRows([a], [{ ...a, id: 'pwa-a', image_url: a.image_url + '?token=other' }]).length, 1);
});
test('display: empty image_url does not suppress a valid thumbnail', () => {
  const rows = mergeFavoriteDisplayRows([], [{ ...a, image_url: '', thumb_url: a.image_url }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].image_url, a.image_url);
});
test('end-to-end: source label changes do not lose either image', () => {
  const combined = combineSyncStates([{ source: 'scriptable', state: payload([{ ...a, source_label: 'Source A' }]) }, { source: 'pwa', state: payload([{ ...b, source_label: 'Category B' }]) }]);
  const plan = planSharedFavoriteRecovery({ payload: combined, currentLikedIds: ['local-only'], catalog: [] });
  const rows = mergeFavoriteDisplayRows(plan.archiveItems, combined.items);
  assert.deepEqual(new Set(rows.map(x => x.image_url)), new Set([a.image_url, b.image_url]));
  assert.ok(plan.likedIds.includes('local-only'));
});
test('pure operations do not mutate their inputs', () => {
  const input = [structuredClone(a), structuredClone(b)], before = JSON.stringify(input);
  const combined = unionFavorites(input, [], 'existing');
  planSharedFavoriteRecovery({ payload: payload(combined), currentLikedIds: ['local-only'] });
  mergeFavoriteDisplayRows(input, combined);
  assert.equal(JSON.stringify(input), before);
});
