# Development Health and Worktree Integration Guide

This guide provides a reproducible process for checking project health and safely integrating changes from separate Git worktrees.

## Project Health Check

### Running Local Health Checks

```bash
# Full health check (code quality + security)
npm run health:full

# Code quality only
npm run health:check

# Security audit only
npm run health:security
```

### Health Check Components

**A. Code Quality**
- TypeScript compilation (`npx tsc --noEmit`)
- ESLint (`npx eslint src`)
- Jest unit tests (`npm test`)
- Production build (`npm run build`)
- Prisma contract emission (`npm run prisma:contract:emit`)
- Git diff whitespace check (`git diff --check`)

**B. Dependencies & Security**
- Security audit (critical vulnerabilities only)
- Outdated packages detection
- Lockfile consistency

**C. Error Categories**

| Category | Description | Examples |
|-----------|-------------|----------|
| CRITICAL | Security issue, data loss, severe functional failure | Vulnerabilities, DB connection failure |
| HIGH | Essential function impaired | TypeScript errors, build failures |
| MEDIUM | Limited impact failures | ESLint warnings, some test failures |
| LOW | Minor issues or quality problems | Whitespace issues |
| INFO | Warnings, improvements, technical debt | Outdated packages |

## Worktree Integration Process

### Creating a New Worktree

```bash
# Create a new worktree for a feature
git worktree add ../webradio-feature-branch feature-branch

# Create a worktree for a detached HEAD
git worktree add ../webradio-experiment <commit-hash>
```

### Checking Worktree Integration Readiness

```bash
# Compare source and target worktrees
node scripts/worktree-integration-check.mjs <source-path> [target-path]
```

This script:
- Detects source and target branches
- Compares HEAD commits
- Lists changed files in both worktrees
- Checks for package.json conflicts
- Provides integration readiness assessment

### Integration Methods

**Method A: Targeted File Overwrite**

When only specific files should be integrated:

1. Run worktree integration check
2. Review the diff of target files
3. Copy files manually:
   ```bash
   cp ../source-worktree/package.json ./package.json
   cp ../source-worktree/package-lock.json ./package-lock.json
   ```
4. Run `npm ci` to install dependencies
5. Run `npm run health:full` to verify
6. Run full test suite
7. Review git diff before committing

**Method B: Full Feature Merge**

When an entire feature branch should be integrated:

1. Ensure target worktree has no uncommitted changes
2. Review feature branch commits
3. Check for conflicts:
   ```bash
   git merge --no-commit --no-ff feature-branch
   ```
4. Resolve conflicts manually if any
5. Run `npm run health:full`
6. If checks pass, complete the merge
7. If checks fail, abort: `git merge --abort`

### Conflict Handling

**Common Conflicts:**
- package.json dependency version conflicts
- Lockfile mismatches
- Schema or migration conflicts
- Untracked file conflicts

**Resolution:**
1. Never auto-resolve conflicts
2. Review each conflict manually
3. Prefer target worktree version for business logic
4. Prefer source worktree version for intended upgrades
5. Document resolution decisions

### Post-Integration Verification

After any integration:

```bash
# Full health check
npm run health:full

# Full test suite
npm test

# Production build
npm run build

# Git status review
git status
git diff --stat
```

## Rollback and Recovery

### Before Committing

If integration checks fail:

```bash
# Discard copied files
git restore package.json package-lock.json

# Abort merge if using merge method
git merge --abort

# Reset to clean state
git clean -fd
git reset --hard HEAD
```

### After Committing

If issues are discovered after commit:

```bash
# Revert last commit
git revert HEAD

# Or reset to previous commit (use with caution)
git reset --hard HEAD~1
```

## Approval Points

Your explicit approval is required at:

1. **Before any file overwrite** – after worktree check
2. **Before any merge** – after conflict review
3. **Before commit** – after all health checks pass
4. **Before push** – after local verification

## CI Integration

The GitHub Actions CI workflow (`.github/workflows/ci.yml`) runs automatically on:
- Pushes to `main`, `master`, `develop`
- Pull requests to `main`, `master`, `develop`

CI checks:
- Lint
- Type Check
- Unit Tests
- Integration Tests (PostgreSQL)
- Build
- Security Audit (critical level)

No automatic deployments are performed by this workflow.

## Common Issues

### Health Check Fails

1. Check which specific check failed
2. Review error messages
3. Fix issues in the worktree
4. Re-run health check
5. Do not integrate until checks pass

### Worktree Not Found

```bash
# List all worktrees
git worktree list

# Remove stale worktree
git worktree remove <path>
```

### Lockfile Conflicts

Always copy both `package.json` and `package-lock.json` together. Never mix them.

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run health:check` | Code quality checks |
| `npm run health:security` | Security audit (critical) |
| `npm run health:full` | Full health check |
| `node scripts/worktree-integration-check.mjs` | Worktree comparison |
