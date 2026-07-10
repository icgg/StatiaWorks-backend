# ESM vs. CommonJS — why the backend is ES modules

> The StatiaWorks backend is written in **ES modules** (ESM): `package.json` has
> `"type": "module"`, so `.js` files use `import`/`export` rather than
> `require`/`module.exports`. This document records **why**, and — more usefully —
> the **full trade-offs**, including the ones that don't bite yet but will.
>
> _Scope: `backend/` · Companion to `README.md` → "Module system (ESM)"._

---

## TL;DR

- **Why ESM:** parity with the Vite frontends (one dialect across the whole repo)
  and alignment with the ecosystem's default direction. It's first-class in modern
  Node — no Babel, no build step for the server.
- **What it is *not* chosen for:** tree-shaking. That's a frontend/bundler benefit
  and is **irrelevant on a long-running Node server** — every module loads at
  startup regardless.
- **Where the real friction lives:** tooling — tests, config files, instrumentation,
  and reverse-interop with CommonJS-only code. Most of it we haven't hit yet; two
  items (**test runner** and **APM/tracing**) are worth deciding deliberately when
  we get there.

---

## Why we chose ESM

1. **Consistency with the rest of the stack.** `../app` and `../admin` are Vue +
   Vite, which are ESM-native. Writing the backend the same way means one mental
   model across all three packages — same syntax, same resolution rules, no
   `require`↔`import` context-switch between server and client.

2. **Ecosystem direction.** ESM is the official JavaScript module system (CommonJS
   was always a Node-specific convention). New Node features and a growing share of
   libraries ship ESM-first — some are ESM-*only* now. Starting on ESM avoids
   swimming against that current and a future forced migration.

3. **First-class in modern Node.** With `"type": "module"`, `.js` files are ESM and
   `import`/`export`, **top-level `await`**, and **`import.meta.url`** all just work —
   no Babel, no `.mjs` gymnastics, no build step for the server. Both are already
   used in the code (e.g. `config/env.js` rebuilds `__dirname` from
   `import.meta.url`).

---

## The honest trade-offs

### A benefit that does *not* apply here

**Tree-shaking / static analysis** is the most-cited ESM advantage, but on a
**backend it's moot** — you don't bundle or tree-shake a long-running Node server;
everything loads at startup. So the genuine pro-ESM case here is *consistency* and
*ecosystem alignment*, **not** any runtime win.

### Costs — ordered roughly by how likely they are to bite this project

| # | Cost | Detail | Bites us? |
|---|---|---|---|
| 1 | **Mandatory file extensions** | Relative imports need the `.js` — `import { db } from '../db/knex.js'`, not `'../db/knex'`. Pervasive; mildly annoying on renames. | Already, everywhere (accepted) |
| 2 | **Reverse interop is the painful direction** | ESM importing CommonJS mostly works, but **CJS cannot synchronously `require()` an ESM module** — historically it threw; recent Node added *experimental*, version-gated `require(esm)`. Also: named imports from a CJS package sometimes force `import pkg from 'x'; const { y } = pkg`. | Only if a CJS-only tool must load our code (not today) |
| 3 | **Config-file gotchas** | With `"type": "module"`, every `*.config.js` becomes ESM, breaking tools that `require()` their config. Fix: name them `.cjs`. (`knexfile.js` is ESM and Knex handles it — a common trip point.) | Latent — watch when adding tooling |
| 4 | **Testing** | **Jest's ESM support is still behind an experimental flag** (`--experimental-vm-modules`) and mocking is clunkier. Prefer **Vitest** (ESM-native, shares Vite config with the frontends) or Node's built-in `node:test`. | **Will bite** — no test suite yet; decide deliberately |
| 5 | **The `require`-idiom family** | Not just `__dirname`: also `require.resolve()`, the `require.main === module` "am I the entry point?" check (→ an `import.meta.url` comparison), and **JSON imports** (`import x from './x.json' with { type: 'json' }` — import attributes, which were flagged/experimental and changed syntax from `assert` to `with`). | One-time translation cost (mostly done) |
| 6 | **Instrumentation / APM** | Many monkey-patching instrumentation libs (older Sentry / OpenTelemetry auto-instrumentation) hooked `require`. Pure ESM uses newer **loader hooks** (`--import` / `register`), where auto-instrumentation historically had rough edges. | **Relevant if we add tracing** (see the observability discussion) |
| 7 | **Live bindings vs. snapshots** | ESM exports are *live read-only bindings* — reassigning an exported `let` is visible to importers; CJS exports a *snapshot* at `require` time. Circular-dependency init behavior also differs. Subtle correctness difference, not just syntax. | Rarely; good to know |

### What we give up in exchange for #1–#7

Not much *for this app specifically*: the backend is self-contained, no CJS tool
needs to `require` it, every dependency (`express`, `knex`, `pg`, `jsonwebtoken`,
`bcryptjs`, `multer`, `node-cron`, `puppeteer`, `resend`, …) imports cleanly, and
there's no test suite pinned to Jest yet.

---

## Practical guidance / decisions this implies

- **Keep writing relative imports with `.js`.** It's required, not optional.
- **Reconstruct Node path globals from `import.meta.url`** when needed:
  ```js
  import { fileURLToPath } from 'node:url'
  import path from 'node:path'
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  ```
- **Name any tool-`require`d config `*.cjs`** if a tool chokes on ESM config.
- **When we add tests:** reach for **Vitest** or `node:test`, *not* Jest — avoids the
  experimental-ESM friction and, for Vitest, reuses the frontend tooling.
- **When we add APM/tracing:** verify the agent supports ESM loader hooks
  (`--import`/`register`) and follow its ESM setup path, not the `require`-patch path.

---

## The one-line version

ESM is the right default here — chosen for repo-wide parity and ecosystem
alignment, **not** for tree-shaking (which is a non-benefit on a server). The real
costs are tooling-shaped (tests, config files, instrumentation, reverse-interop),
most of which we haven't hit — but **test-runner choice** and **APM setup** are the
two to handle deliberately when they come up.
