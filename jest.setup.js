import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { Temporal as TemporalPolyfill } from 'temporal-polyfill';

// The Prisma 8 contract maps timestamptz to Temporal.Instant. Node 26 provides
// a global Temporal, but the jsdom test environment does not always expose it.
if (typeof globalThis.Temporal === 'undefined') {
  globalThis.Temporal = TemporalPolyfill;
}

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}
