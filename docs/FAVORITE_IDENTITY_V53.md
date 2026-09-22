# Favorite identity V53

Scope: preserve favorite metadata and prevent distinct media from collapsing through a profile/page URL. This commit contains no private favorite records, URLs, credentials, or images.

- Equality for image-bearing records is derived from the record's own media URL. Legacy alias/page fingerprints are not equality evidence.
- Legacy ID aliases are retained as evidence but are not re-used as verified associations. Ambiguous reused IDs receive distinct primary IDs.
- Existing v1/v2 Blob snapshots are read-only. `api/favorites-sync.js` now calls `lib/velvet-sync-journal.js`, not the deprecated overwrite-based `lib/velvet-sync-store.js`.
- Authenticated POST inputs are retained under private, content-addressed, non-overwritable V53 objects. Independent concurrent requests do not overwrite each other's inputs.
- Client and server capacity checks fail without truncation. Existing Scriptable clients are blocked from receiving a union that would exceed their local limits.
- PWA state, archive metadata, and shared-view cache are retained in `_pre_v53` keys before the live synchronization result is applied.
- Source-label presentation is not changed.

Verification: synthetic regression/conservation tests run in CI. A public-code artifact is emitted for private offline replay against user-provided metadata. Synthetic tests and deployment readiness are not proof of iPhone rendering or complete recovery.

Recovery boundaries: URL-less device images are not uploaded by this change. Existing IDs/URLs that were already overwritten cannot be reconstructed from alias counts alone. A separate, authenticated, metadata-only recovery execution is required. No private recovery payload is committed to this repository.

Operational limit: the immutable journal is deliberately bounded at 512 records. Reaching the limit stops new synchronization; compaction requires its own preservation audit and approval.
