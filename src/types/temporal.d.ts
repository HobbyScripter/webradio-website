/**
 * TypeScript 5.9 does not yet include Temporal in `lib.esnext`, but the
 * Prisma 8 contract maps `timestamptz` to `Temporal.Instant`. The runtime
 * global comes from Node 26 (and is polyfilled in tests); this import adds the
 * matching global type declarations from the installed spec package.
 */
import 'temporal-spec/global';
