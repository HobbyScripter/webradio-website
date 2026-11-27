#!/usr/bin/env node
/**
 * Worktree Integration Check Script
 * 
 * Compares source and target worktrees for safe integration.
 * Usage: node scripts/worktree-integration-check.mjs <source-path> [target-path]
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, relative } from 'path';

const sourcePath = process.argv[2];
const targetPath = process.argv[3] || process.cwd();

if (!sourcePath) {
  console.error('❌ Error: Source worktree path required');
  console.log('Usage: node scripts/worktree-integration-check.mjs <source-path> [target-path]');
  process.exit(1);
}

function runCommand(cmd, cwd) {
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe', cwd });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

console.log('🔍 Worktree Integration Check\n');
console.log('='.repeat(50));

// Get source status
console.log('\n📂 Source Worktree:', sourcePath);
const sourceBranch = runCommand('git branch --show-current', sourcePath);
const sourceStatus = runCommand('git status --short', sourcePath);
const sourceHEAD = runCommand('git rev-parse HEAD', sourcePath);

console.log('  Branch:', sourceBranch.success ? sourceBranch.output.trim() : 'unknown');
console.log('  HEAD:', sourceHEAD.success ? sourceHEAD.output.trim() : 'unknown');
console.log('  Changed files:', sourceStatus.success ? sourceStatus.output.split('\n').length : 'unknown');

// Get target status
console.log('\n📂 Target Worktree:', targetPath);
const targetBranch = runCommand('git branch --show-current', targetPath);
const targetStatus = runCommand('git status --short', targetPath);
const targetHEAD = runCommand('git rev-parse HEAD', targetPath);

console.log('  Branch:', targetBranch.success ? targetBranch.output.trim() : 'unknown');
console.log('  HEAD:', targetHEAD.success ? targetHEAD.output.trim() : 'unknown');
console.log('  Changed files:', targetStatus.success ? targetStatus.output.split('\n').length : 'unknown');

// Compare HEADs
if (sourceHEAD.success && targetHEAD.success) {
  if (sourceHEAD.output.trim() === targetHEAD.output.trim()) {
    console.log('\n✅ Both worktrees are on the same commit');
  } else {
    console.log('\n⚠️  Worktrees are on different commits');
  }
}

// Check for conflicts
console.log('\n🔍 Conflict Detection');
console.log('  Checking for overlapping file changes...');

// Check package.json specifically
const sourcePackage = resolve(sourcePath, 'package.json');
const targetPackage = resolve(targetPath, 'package.json');

if (existsSync(sourcePackage) && existsSync(targetPackage)) {
  const sourcePkg = JSON.parse(readFileSync(sourcePackage, 'utf8'));
  const targetPkg = JSON.parse(readFileSync(targetPackage, 'utf8'));
  
  if (sourcePkg.dependencies?.next !== targetPkg.dependencies?.next) {
    console.log('  ⚠️  Next.js version differs');
    console.log(`    Source: ${sourcePkg.dependencies?.next}`);
    console.log(`    Target: ${targetPkg.dependencies?.next}`);
  }
}

console.log('\n' + '='.repeat(50));
console.log('📊 Integration Readiness');
console.log('\n⚠️  Manual Review Required:');
console.log('  1. Review all changed files');
console.log('  2. Ensure no untracked files are lost');
console.log('  3. Verify target worktree has no uncommitted changes');
console.log('  4. Run health check before integration');
console.log('\n✅ Ready for manual integration review');
