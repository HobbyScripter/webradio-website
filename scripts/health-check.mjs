#!/usr/bin/env node
/**
 * Project Health Check Script
 * 
 * Runs comprehensive quality and security checks for the WebRadio Website project.
 * Usage: node scripts/health-check.mjs
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const ERROR_CATEGORIES = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO',
};

const results = {
  codeQuality: {},
  dependencies: {},
  security: {},
  functionals: {},
};

function runCommand(cmd, label) {
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function categorizeError(error, output) {
  if (error.includes('ECONNREFUSED') || error.includes('DATABASE')) {
    return ERROR_CATEGORIES.HIGH;
  }
  if (error.includes('security') || error.includes('vulnerability')) {
    return ERROR_CATEGORIES.CRITICAL;
  }
  if (error.includes('TypeScript error') || error.includes('compilation')) {
    return ERROR_CATEGORIES.HIGH;
  }
  return ERROR_CATEGORIES.MEDIUM;
}

console.log('🔍 WebRadio Website - Health Check\n');
console.log('='.repeat(50));

// A. Code Quality
console.log('\n📋 A. Code Quality');

console.log('  TypeScript...');
const tsc = runCommand('npx tsc --noEmit', 'TypeScript');
results.codeQuality.typescript = tsc.success;
if (!tsc.success) {
  console.log(`    ❌ Failed - ${ERROR_CATEGORIES.HIGH}`);
} else {
  console.log('    ✅ Passed');
}

console.log('  ESLint...');
const eslint = runCommand('npx eslint src', 'ESLint');
results.codeQuality.eslint = eslint.success;
if (!eslint.success) {
  console.log(`    ❌ Failed - ${ERROR_CATEGORIES.MEDIUM}`);
} else {
  console.log('    ✅ Passed');
}

console.log('  Jest Tests...');
const jest = runCommand('npm test', 'Jest');
results.codeQuality.jest = jest.success;
if (!jest.success) {
  console.log(`    ❌ Failed - ${ERROR_CATEGORIES.HIGH}`);
} else {
  console.log('    ✅ Passed');
}

console.log('  Production Build...');
const build = runCommand('npm run build', 'Build');
results.codeQuality.build = build.success;
if (!build.success) {
  console.log(`    ❌ Failed - ${ERROR_CATEGORIES.HIGH}`);
} else {
  console.log('    ✅ Passed');
}

console.log('  Prisma Contract...');
const prisma = runCommand('npm run prisma:contract:emit', 'Prisma');
results.codeQuality.prisma = prisma.success;
if (!prisma.success) {
  console.log(`    ❌ Failed - ${ERROR_CATEGORIES.HIGH}`);
} else {
  console.log('    ✅ Passed');
}

// B. Dependencies & Security
console.log('\n📦 B. Dependencies & Security');

console.log('  Security Audit (Critical)...');
const audit = runCommand('npm audit --audit-level=critical', 'Security Audit');
results.security.audit = audit.success;
if (!audit.success) {
  console.log(`    ❌ Failed - ${ERROR_CATEGORIES.CRITICAL}`);
} else {
  console.log('    ✅ Passed');
}

console.log('  Outdated Packages...');
const outdated = runCommand('npm outdated', 'Outdated');
results.dependencies.outdated = outdated.success;
if (!outdated.success) {
  console.log(`    ⚠️  Some packages outdated - ${ERROR_CATEGORIES.INFO}`);
} else {
  console.log('    ✅ All up to date');
}

// C. Git Diff Check
console.log('\n🔀 C. Git Diff Check');

const gitDiffCheck = runCommand('git diff --check', 'Git Diff');
results.codeQuality.gitDiff = gitDiffCheck.success;
if (!gitDiffCheck.success) {
  console.log(`    ⚠️  Whitespace issues - ${ERROR_CATEGORIES.LOW}`);
} else {
  console.log('    ✅ No whitespace issues');
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Summary');

const passed = Object.values(results.codeQuality).filter(v => v).length +
               Object.values(results.security).filter(v => v).length;
const total = Object.keys(results.codeQuality).length + Object.keys(results.security).length;

console.log(`  Passed: ${passed}/${total}`);
console.log(`  Failed: ${total - passed}/${total}`);

if (passed === total) {
  console.log('\n✅ All checks passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some checks failed. Review the output above.');
  process.exit(1);
}
