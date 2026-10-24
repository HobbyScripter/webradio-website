import createJestConfig from 'next/jest.js';

const createNextJestConfig = createJestConfig({
  dir: './',
});

/**
 * Real database tests. Run through `npm run test:integration`, which loads
 * TEST_DATABASE_URL, validates that it is a disposable `_test` database and
 * exposes it to the app as DATABASE_URL.
 */
const customJestConfig = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 30000,
};

export default createNextJestConfig(customJestConfig);
