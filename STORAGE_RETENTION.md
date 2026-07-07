# Storage efficiency, attachment retention & rate limiting

_Stage 8. Backend features that lower storage use, enforce an attachment-retention
policy backed by the Terms of Service, prevent an abuse vector around it, and
rate-limit sensitive endpoints._

This is the reference for how uploaded files are **deduplicated**, how long they
are kept, how the **daily cleanup** decides what to delete, and how the pieces fit
together. If you're changing anything about uploads, the cron, or the
`file_hashes` table, read this first.

---

## 1. Why this exists

Every applicant résumé/cover letter and employer logo is written to disk under
`backend/uploads/{resumes,cover-letters,logos}/`, and the public URL
(`/uploads/<sub>/<file>`) is stored on the DB row. Two problems compound over
time:

1. **Re-uploads waste space.** The same file uploaded twice was stored twice
   under two random names — no dedup.
2. **Attachments for long-closed jobs live forever.**

Stage 8 addresses both, adds a ToS-backed retention rule (attachments become
unavailable **6 months after the job posting closes**), and closes an abuse
vector where an employer could reset that clock by toggling a job's status.

---

## 2. Data model — the `file_hashes` table

Created by migration `src/db/migrations/20260706140000_add_file_hashes.js`:

```sql
CREATE TABLE file_hashes(
  hash       TEXT PRIMARY KEY,   -- sha256 hex of the file contents
  url        TEXT NOT NULL,      -- canonical '/uploads/<sub>/<file>' URL
  byte_size  BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX file_hashes_url_idx ON file_hashes(url);  -- reverse lookup for cleanup
```

This is a **content-address index**, not the canonical owner of a file. The
canonical references are still the plain `text` URL columns on the domain tables:

| Table          | Column(s)                  | Meaning                          |
|----------------|----------------------------|----------------------------------|
| `seekers`      | `resume_url`               | profile résumé                   |
| `applications` | `resume_url`, `cover_url`  | files submitted with an application |
| `employers`    | `logo_url`                 | company logo                     |

A single physical file can be pointed at by **many** of these rows (that's the
whole point of dedup), so those columns are *not* foreign keys to `file_hashes`
— see §4.

---

## 3. Deduplication on upload — `utils/fileDedup.js`

Multer (`middleware/upload.js`) writes each upload to disk under a random hex
name **before** the controller runs, so dedup happens *after* that write:

```
upload arrives → multer writes /uploads/resumes/<random>.pdf
              → controller calls dedupeStored('resumes', file)
```

`dedupeStored(sub, file)`:

1. `null` in → `null` out (mirrors the old `publicUrl` null handling).
2. Compute `sha256` of the just-written file (uploads are capped at
   `env.maxUploadMb`, so reading the whole file is fine).
3. Look the hash up in `file_hashes`:
   - **Hit** → delete the just-written duplicate from disk, return the *existing*
     URL. The DB row that triggered this upload ends up pointing at the already
     stored file.
   - **Miss** → insert `{ hash, url, byte_size }` (with `ON CONFLICT (hash) DO
     NOTHING` to survive a race between two identical concurrent uploads), then
     re-read to return the winning URL. The loser of a race deletes its now-dup
     file.

Wired into the three upload paths, each of which used to call
`publicUrl(sub, file)`:

- `controllers/seeker.controller.js` → `apply` (résumé + cover) and
  `updateProfile` (profile résumé)
- `controllers/employer.controller.js` → `updateCompany` (logo)

`publicUrl` is still exported and used *inside* `dedupeStored`.

> **Effect:** byte-identical files are stored once. Estimated 5–20% storage
> savings (more when many applicants reuse a common template or re-apply).

---

## 4. Reference counting — `utils/fileRefs.js`

Because dedup makes one file back many rows, the cleanup job must **never** delete
a file that another row still uses. That check is `isUrlReferenced(url)`:

```js
export async function isUrlReferenced(url) {
  if (!url) return false
  const [seeker, app, logo] = await Promise.all([
    db('seekers').where({ resume_url: url }).first('id'),
    db('applications').where({ resume_url: url }).orWhere({ cover_url: url }).first('id'),
    db('employers').where({ logo_url: url }).first('id'),
  ])
  return Boolean(seeker || app || logo)
}
```

It runs three parallel lookups across the URL-bearing columns and returns true if
**any** row still points at the URL. `.first('id')` stops at the first match
rather than counting.

### Why queries, not foreign keys

The `*_url` columns are denormalized URL strings (that's how uploads worked before
dedup — the URL lives directly on the domain row). There is no `files` table that
*owns* a URL as a primary key, so there is nothing for an FK to reference; making
this FK-enforced would mean restructuring the schema so the storage layer becomes
the canonical owner and every `*_url` becomes a reference. Instead, `file_hashes`
is a lookup index and `isUrlReferenced` reference-counts across exactly the columns
an FK would have constrained — no schema restructuring required.

### Tuning note

There is currently **no index** on the `*_url` columns, so at large scale these
are sequential scans. They run once a day over the small set of URLs freed by
long-closed jobs, so it's cheap today. If those tables grow large, add indexes on
`applications.resume_url` / `applications.cover_url` (and the seeker/employer
columns) as the tuning lever.

---

## 5. Retention window — one config value

`env.attachmentRetentionMonths` (default **6**, env var
`ATTACHMENT_RETENTION_MONTHS`) is the single source of truth for the policy. Both
the cleanup cron **and** the expiry date shown to employers read it, so the ToS
clause, the UI notice, and the actual deletion can never drift apart.

The matching Terms clause lives in `app/src/views/TermsView.vue` (§7,
"Application attachments and retention").

---

## 6. Daily cleanup — `cron/index.js` → `expireAttachments()`

A second `node-cron` job (alongside the existing trial-expiry sweep), scheduled
for **03:00** server time, and also run once at boot for catch-up. Steps:

1. **Auto-close past-deadline jobs.** Any `status='active'` job whose `deadline`
   has passed is closed:
   ```sql
   UPDATE jobs SET status='closed', closed_at = COALESCE(closed_at, now())
   WHERE status='active' AND deadline IS NOT NULL AND deadline < CURRENT_DATE;
   ```
   `COALESCE` preserves the set-once rule (§7). This is what makes deadline-passed
   postings (which are otherwise "closed" only at read-time) enter the countdown.
2. **Find expired closed jobs** — `status='closed'` and
   `closed_at < now() - <window> months`.
3. **Scrub references.** Collect the distinct `resume_url` + `cover_url` across
   those jobs' applications, then null those columns:
   ```sql
   UPDATE applications SET resume_url=NULL, cover_url=NULL WHERE job_id IN (...);
   ```
4. **Delete orphaned files.** For each freed URL, **after** the scrub, check
   `isUrlReferenced(url)`; if nothing else references it, delete the physical file
   **and** its `file_hashes` row:
   ```js
   for (const url of urls) {
     if (await isUrlReferenced(url)) continue      // still in use → keep
     if (deleteStoredFile(url)) filesDeleted += 1  // fs.unlink, best-effort
     await db('file_hashes').where({ url }).del()  // keep the index in sync
   }
   ```

### Two subtleties that matter

- **Order:** the scrub (step 3) runs *before* the reference check (step 4). Once
  the expiring applications are nulled, they no longer match, so `isUrlReferenced`
  returns true only if a **different** row (a seeker profile, a newer/other
  application, an employer logo) still uses the file. Orphans are deleted; shared
  files survive.
- **The hash row is always removed when the file is (or would be) deleted** — even
  if `deleteStoredFile` returns `false` because the file was already missing. This
  keeps `file_hashes` in sync with disk. If it weren't removed, a *later* upload of
  the same content would dedupe to a URL whose file no longer exists — a dangling
  reference. Removing the row means the next identical upload is correctly treated
  as new.

File-path resolution mirrors `utils/documents.js`:
`path.join(env.uploadDir, url.replace('/uploads/', ''))`.

---

## 7. `closed_at` is set once (anti-abuse)

The retention clock is anchored to when a job **first** closes. Without a guard,
an employer could close → reopen → close a posting to keep pushing the removal
date out. So:

- **Close** stamps `closed_at` only if unset: `closed_at = COALESCE(closed_at, now())`.
- **Reopen** no longer nulls `closed_at` (it just flips `status='active'`).

Applied in both `controllers/employer.controller.js` (`patchPost`) and
`controllers/admin.controller.js` (`setPostStatus`). A reopened job is
`status='active'`, so it's safe from the sweep and shows no removal notice — but
re-closing it does **not** reset the clock.

---

## 8. The employer-facing notice

`utils/shape.js` → `shapeEmployerPost` adds `attachmentsExpireOn` (=
`closed_at` + `attachmentRetentionMonths`, ISO date) to **closed** posts only. The
backend owns the date so the policy window stays in one place.

The frontend surfaces it in two spots:

- `app/src/views/ApplicationDetailView.vue` — a notice in the **Documents**
  section (where files are downloaded): *"Attachments for this closed job will be
  removed on `<date>`. Download anything you need before then."*
- `app/src/components/employer/JobPostCard.vue` — a compact line on the closed
  card.

---

## 9. Rate limiting — `middleware/rateLimit.js`

`express-rate-limit` v8. `app.set('trust proxy', 1)` (already present) lets the
limiters read the real client IP behind the Vite/reverse proxy. Responses are
`429` with a JSON body consistent with the app error handler:
`{ message, code: 'RATE_LIMITED' }`.

| Limiter | Scope | Keyed by | Guards |
|---|---|---|---|
| `globalLimiter` | `app.use('/api', …)` | IP | broad ceiling |
| `authLimiter` | `auth.routes.js` (login, signups, verify + resend, password forgot/reset) and admin `POST /auth/login` | IP | brute-force + email-send abuse |
| `applyLimiter` | `POST /me/applications` | IP | application spam |
| `uploadLimiter` | `PUT /me/profile`, `PUT /me/company` | IP | upload spam |
| `postingIpLimiter` + `postingAccountLimiter` | `POST /me/posts` | IP **and** account | job-posting flooding |

The **posting** guard is two limiters that **both** must pass — a single account
can't flood from many IPs, and one IP can't drive many accounts. The
account-keyed limiter is mounted **after** `requireActiveEmployer`, so
`req.account` is populated; it keys on `acct:<id>` alone (no IP), so there's no
IPv6-key concern.

> **Note:** `authLimiter` is a *single shared instance*, so login/signup/verify/
> reset share one per-IP budget. That's intentional for abuse prevention, but a
> busy shared-office IP hits the combined cap — loosen via the `RL_AUTH_*` env
> vars if needed.

### Config reference (`env.rateLimit`, all env-tunable)

| Env var | Default | Meaning |
|---|---|---|
| `RL_GLOBAL_WINDOW_MIN` / `RL_GLOBAL_MAX` | 15 / 600 | global ceiling |
| `RL_AUTH_WINDOW_MIN` / `RL_AUTH_MAX` | 15 / 20 | auth endpoints |
| `RL_APPLY_WINDOW_MIN` / `RL_APPLY_MAX` | 60 / 30 | application submits |
| `RL_UPLOAD_WINDOW_MIN` / `RL_UPLOAD_MAX` | 60 / 40 | profile/logo uploads |
| `RL_POSTING_WINDOW_MIN` / `RL_POSTING_MAX` | 60 / 10 | job posting (per account **and** per IP) |
| `ATTACHMENT_RETENTION_MONTHS` | 6 | retention window |

---

## 10. Verifying changes

The features were verified with an ad-hoc script (dedup collapse, ref-counted
delete, `closed_at`-once) and a live `429` test. To re-verify manually:

- **Dedup:** upload the same PDF twice via the app → one physical file in
  `uploads/resumes`, one `file_hashes` row, both rows share the URL. A different
  file → new file + new row.
- **Cleanup:** create a closed job with `closed_at` older than the window (and a
  past-deadline active job), import and call `expireAttachments()` directly, then
  confirm: past-deadline job auto-closed; expired job's application URLs nulled;
  orphaned file + hash row deleted; a file still referenced elsewhere kept.
- **`closed_at` once:** close → reopen → close via the employer API; `closed_at`
  never changes after the first close.
- **Rate limiting:** hammer `POST /api/auth/login` past the cap → `429` with the
  JSON body above.

---

## 11. File map

| Concern | File |
|---|---|
| `file_hashes` migration | `src/db/migrations/20260706140000_add_file_hashes.js` |
| Dedup helper | `src/utils/fileDedup.js` |
| Reference counting | `src/utils/fileRefs.js` |
| Cleanup + trial cron | `src/cron/index.js` |
| Retention date on shaped posts | `src/utils/shape.js` (`shapeEmployerPost`) |
| Date helper (`isoAddMonths`) | `src/utils/dates.js` |
| Rate limiters | `src/middleware/rateLimit.js` |
| Config knobs | `src/config/env.js` (`attachmentRetentionMonths`, `rateLimit`) |
| Upload paths (dedup wired in) | `src/controllers/seeker.controller.js`, `src/controllers/employer.controller.js` |
| `closed_at` set-once | `src/controllers/employer.controller.js` (`patchPost`), `src/controllers/admin.controller.js` (`setPostStatus`) |
| ToS clause | `app/src/views/TermsView.vue` |
| Employer notice | `app/src/views/ApplicationDetailView.vue`, `app/src/components/employer/JobPostCard.vue` |
