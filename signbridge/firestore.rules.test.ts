// Firestore security rules adversarial verification specification.
// Evaluates the Dirty Dozen payloads against firestore.rules when run with @firebase/rules-unit-testing.

export const DIRTY_DOZEN_CASES = [
  { name: 'Unverified email profile create', expected: 'PERMISSION_DENIED' },
  { name: 'Shadow field injection on user profile', expected: 'PERMISSION_DENIED' },
  { name: 'Cross-owner custom sign write', expected: 'PERMISSION_DENIED' },
  { name: 'PII private doc read by non-owner', expected: 'PERMISSION_DENIED' },
  { name: 'Orphaned custom sign sample write', expected: 'PERMISSION_DENIED' },
  { name: 'Sample flatFeatures type/size poisoning', expected: 'PERMISSION_DENIED' },
  { name: 'Client-forged createdAt timestamp', expected: 'PERMISSION_DENIED' },
  { name: 'Immortal ownerId mutation on update', expected: 'PERMISSION_DENIED' },
  { name: 'Terminal completed session update', expected: 'PERMISSION_DENIED' },
  { name: 'Oversized/invalid room document ID', expected: 'PERMISSION_DENIED' },
  { name: 'Unscoped rooms collection list scrape', expected: 'PERMISSION_DENIED' },
  { name: 'Out-of-bounds analytics confidence/latency', expected: 'PERMISSION_DENIED' },
] as const;
