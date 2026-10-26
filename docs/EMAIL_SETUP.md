# Transactional e-mail: provider setup and operation

The application sends exactly two transactional messages:

| Purpose | Link | Token lifetime |
| --- | --- | --- |
| E-mail verification | `/auth/verify-email?token=…` | 24 hours |
| Password reset | `/auth/reset-password?token=…` | 60 minutes |

Both flows live in `src/lib/account-service.ts` and `src/lib/auth-tokens.ts`.
Only a SHA-256 digest of the token is stored; the raw value is placed in the
link once and is never logged.

## Delivery is paused (current state)

`EMAIL_DELIVERY_ENABLED` is the operator switch. Delivery is **paused unless it
is exactly `"true"`**: no Resend call, no SMTP connection, no outbox file and no
fake success. `sendTransactionalEmail()` returns
`{ delivered: false, mode: 'paused', failure: 'delivery_paused' }`, and the
account service creates **no token** for a link that could never reach a mailbox.

```
EMAIL_DELIVERY_ENABLED="false"   # default when unset
```

Consequences while paused:

- Registration and login work immediately; the address is simply not confirmed.
- E-mail verification and password reset remain implemented and testable, but no
  message leaves the process (`/auth/verify-email/resend` and the reset request
  answer generically).
- The UI states the pause instead of asking users to wait for a link.
- Developer access is granted by an administrator through the application flow
  (see `docs/PHASE6_REPORT.md`), not by confirming an address.

Reactivating delivery is a deliberate two-step change: set
`EMAIL_DELIVERY_ENABLED="true"`, then configure and verify a real provider
(Resend or SMTP) as described below. Nothing else in the code changes.

## Provider selection

`src/lib/email.ts` picks the first **configured** path. There is no silent
downgrade:

1. **Resend HTTPS API** — `RESEND_API_KEY` present.
2. **SMTP** — `EMAIL_SERVER_HOST` and `EMAIL_FROM` present.
3. **Local outbox** — development/test only, writes to `.local-db/outbox/`
   with mode `0600`.
4. **Unconfigured** — production returns the generic response and logs one
   line; nothing is delivered and no success is faked.

A set `RESEND_API_KEY` without `EMAIL_FROM` is an operator error: the send fails
with `invalid_config` instead of falling through to SMTP or the outbox.

## Status values

`sendTransactionalEmail()` returns `{ delivered, mode, failure?, providerStatus? }`:

- `delivered: true` means the provider accepted the message (HTTP 2xx or SMTP
  `250`). It is **not** proof of inbox delivery — bounces and suppressions are
  visible only in the provider dashboard.
- `failure` is one of `not_configured`, `invalid_config`, `origin_unavailable`,
  `provider_error`, `timeout`, `network_error`, `outbox_error`.

Requests are never retried automatically: a retry would duplicate mail. The
HTTP handlers answer generically, so a caller cannot use the result to
enumerate accounts.

## Required environment variables

| Variable | Where | Meaning |
| --- | --- | --- |
| `RESEND_API_KEY` | server only | Resend API key (`re_…`). Never `NEXT_PUBLIC_`. |
| `EMAIL_FROM` | server only | Sender, e.g. `WebRadio <noreply@example.com>`. Domain must be verified at the provider. |
| `NEXTAUTH_URL` | server only | Public origin used to build links, e.g. `https://webradio-website.vercel.app`. |

Set them in Vercel under **Settings → Environment Variables for both
Preview and Production**, then redeploy so the running functions receive them.
`NEXTAUTH_URL` must be the real HTTPS origin in production; link generation
never uses the request `Host` header and refuses plain HTTP outside loopback.

## Setting up Resend

1. Create an account at <https://resend.com> and an API key with sending
   permission. Store it only as `RESEND_API_KEY` in Vercel (and in the local
   `.env` if you want to test real delivery outside production).
2. Add the sender domain under **Domains** and publish the DNS records Resend
   shows (SPF/DKIM, plus DMARC for reliable delivery). For `*.vercel.app` you
   cannot publish DNS records — use a domain you control as `EMAIL_FROM`.
3. Wait until the domain shows **Verified**, otherwise the API answers with
   `validation_error` or `403`.
4. Set `EMAIL_FROM` to an address on that verified domain and send one test
   message to your own mailbox.
5. Keep a test-mode sender (`onboarding@resend.dev`) out of production: it only
   delivers to the account owner.

None of this has been executed from this workspace. No account, key or DNS
record exists yet, so **production delivery is not verified** until step 4
succeeds.

## Local development and tests

Without `RESEND_API_KEY` and `EMAIL_SERVER_HOST`, development writes each
message to `.local-db/outbox/` (git-ignored). Open the file to copy the link;
the token is not printed to the console. Tests mock `fetch`, so they never
contact Resend.

Check the directory is ignored and never committed:

```
git check-ignore -v .local-db/outbox
```

## Diagnosing delivery problems

Provider failures are logged as a stable error name plus HTTP status, never the
response body, recipient or message text. Look for:

```
[email] Resend rejected the message { status: 422, providerError: 'validation_error' }
[email] Resend request failed { name: 'TimeoutError', reason: 'timeout' }
[email] delivery is not configured; no transactional mail was sent
```

Common causes: unverified domain (`403`), `EMAIL_FROM` not on the verified
domain (`422`), key without sending permission (`401`).

### Unrelated: `CONTRACT.MARKER_READ_FAILED`

This code is **not** an e-mail problem. Prisma 8 verifies
`prisma_contract.marker` on the first query of a runtime instance and wraps any
driver failure during that probe as `CONTRACT.MARKER_READ_FAILED`. A database
that is unreachable, rejecting the password, or missing the schema therefore
surfaces as a "marker" error on the first query — including the rate limiter and
the registration endpoint.

`src/lib/db-error-diagnostics.ts` now logs the nested driver code and SQLSTATE
alongside the wrapper, e.g.:

```
[rate-limit] limiter unavailable; failing open
{ name: 'CliStructuredError', code: 'CONTRACT.MARKER_READ_FAILED',
  rootCode: '28P01', sqlState: '28P01', depth: 2 }
```

`sqlState` points at the real cause: `28P01` invalid password, `3D000` unknown
database, `42P01` missing table, `ECONNREFUSED`/`ETIMEDOUT` for connectivity.
Check the local cluster before assuming a contract or migration problem:

```
pg_isready -h 127.0.0.1 -p 5433
```

On Windows the local server can accept TCP connections while failing to reserve
shared memory for a backend (`could not reserve shared memory region … error
code 487`), which produces exactly this wrapped error. Restarting the
development cluster clears it; the application code is not involved.
