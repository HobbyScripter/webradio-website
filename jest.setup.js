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

// jsdom (Jest) does not expose the Fetch API globals that Next.js 16 and the
// Prisma 8 runtime reference at module load. Provide minimal synchronous
// placeholders so server modules can be imported in unit tests; real requests
// are never issued by these tests.
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class Request {};
}
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {};
}
if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = class Headers {};
}
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.resolve(new globalThis.Response());
}