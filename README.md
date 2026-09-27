# new-dev-project

A [Claude Code](https://claude.com/claude-code) skill that scaffolds a new monorepo from a fixed set of rules: **a skeleton, not a product**.

You get folders, configs, linting, documentation, wired-up service keys and working authentication. No business logic, stubs or demo screens: features are written afterwards, following the rules the skeleton sets up.

> The skill's instructions and generated docs are written in Russian. Code, identifiers, UI text and commit messages are in English.

## Stack

| Part | Technologies |
|---|---|
| Web | Next.js (App Router, TypeScript, Tailwind) |
| iOS | SwiftUI (XcodeGen, SwiftLint) |
| Android | Jetpack Compose (Gradle version catalog, detekt) |
| Backend | Railway: Fastify + Drizzle + Postgres + Better Auth, or Firebase |
| Services | Firebase, Stripe, Apple, PostHog, Railway, Vercel, GitHub |

You choose which parts you need when the skill runs.

## What it does

1. **Git**: repository, account, branches.
2. **Access to all services at once**: via `direnv` (`.envrc`) or by checking in each console. Keys are never printed or committed.
3. **Skeleton**:
   - working authentication (email, Google, Apple);
   - lint boundaries between layers and a 500-line limit per file;
   - `AGENTS.md` / `CLAUDE.md` with rules for coding agents;
   - documentation in Obsidian format;
   - a separate database per git branch and protection against diverging migrations;
   - project-level Claude Code skills: `dev-login`, `gate`, `schema-change`, `task-note`.
4. **Local dev**: backend and web run with `npm run dev` as plain processes, no Docker. Postgres comes from `brew`.

Library versions are never taken from memory: only official generators and `@latest`.

## Install

```bash
git clone https://github.com/MatthewOstych/new-dev-project ~/.claude/skills/new-dev-project
```

Restart Claude Code. The skill will show up as `new-dev-project`.

Update:

```bash
git -C ~/.claude/skills/new-dev-project pull
```

## Usage

Ask Claude Code to create a project, for example:

> Set up a new project: web + iOS, backend on Railway

Or call the skill directly: `/new-dev-project`.

The skill never touches anything external unless you explicitly ask: no commits, pushes, deploys, or changes to Railway, Vercel, Stripe or Firebase projects.

## Structure

```
SKILL.md          main skill instructions
reference/        rules for platforms, services, docs, database
templates/        files copied into the new project
  root/           root configs (.gitignore, eslint, prettier, .envrc)
  web/ ios/ android/ backend/
  scripts/        dev runner, per-branch database, file size check
  claude/         Claude Code settings, hooks and skills for the project
  docs/           documentation templates
```

Template placeholders use the `{{UPPER_SNAKE}}` format; all values are described in `reference/placeholders.md`.
