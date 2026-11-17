# Security Specification & Red-Team TDD

## Data Invariants
1. User PII (`email`, `photoUrl`) resides exclusively in `/users/{userId}/private/{docId}` and is readable/writable solely by `request.auth.uid == userId` with verified email.
2. All custom signs, samples, sessions, and analytics events enforce `ownerId == request.auth.uid` and verify parent ownership via `get()`/`exists()` where applicable.
3. Timestamps (`createdAt`, `updatedAt`, `startedAt`, `joinedAt`) must equal `request.time`.
4. Terminal states (`status == 'completed'` on sessions, `status == 'ended'` on rooms) lock further mutations.
5. Every ID path segment and ID field must pass `isValidId()` (`^[a-zA-Z0-9_\-]+$`, `size() <= 128`).

## Dirty Dozen Adversarial Payloads
1. **Unverified Email Create**: User with `email_verified: false` attempts to create `/users/{uid}`. Must return `PERMISSION_DENIED`.
2. **Ghost Field Injection (Shadow Update)**: Authenticated user adds `"isAdmin": true` to `/users/{uid}`. Must return `PERMISSION_DENIED`.
3. **Cross-Owner Sign Spoofing**: User A attempts to create `/users/userB/customSigns/s1` with `ownerId: "userA"`. Must return `PERMISSION_DENIED`.
4. **PII Cross-Read**: User B attempts `get` on `/users/userA/private/info`. Must return `PERMISSION_DENIED`.
5. **Orphaned Sample Creation**: User creates `/users/userA/customSigns/nonexistent/samples/smp1`. Must return `PERMISSION_DENIED`.
6. **Sample Array Poisoning**: User creates sample with `flatFeatures: ["bad"]` instead of numbers, or length > 1900. Must return `PERMISSION_DENIED`.
7. **Timestamp Forgery**: User submits `createdAt: new Date(2020, 0, 1)` instead of `serverTimestamp()`. Must return `PERMISSION_DENIED`.
8. **Immortal Field Tamper**: User updates `ownerId` or `createdAt` on `/users/{uid}/customSigns/{signId}`. Must return `PERMISSION_DENIED`.
9. **Terminal Session Mutation**: User updates `signCount` after session `status` is already `'completed'`. Must return `PERMISSION_DENIED`.
10. **ID Poisoning**: User targets `/rooms/${'a'.repeat(300)}` or path containing `$`. Must return `PERMISSION_DENIED`.
11. **Unbounded List Scraping**: User calls `list` on `/rooms` without `where('hostUid', '==', uid)`. Must return `PERMISSION_DENIED`.
12. **Analytics Confidence Out-of-Range**: User inserts analytics event with `confidence: 99` (> 1.0) or `latencyMs: -50`. Must return `PERMISSION_DENIED`.
