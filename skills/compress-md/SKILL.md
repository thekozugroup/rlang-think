---
name: compress-md
description: >
  Compress natural language memory files (CLAUDE.md, todos, preferences) into RLang notation
  to save input tokens. Preserves all technical substance, code, URLs, and structure.
  Compressed version overwrites the original file. Human-readable backup saved as FILE.original.md.
  Trigger: /rlang-think:compress <filepath> or "compress to rlang"
---

## Purpose

Rewrite memory files (CLAUDE.md, todo lists, project docs) from natural language into RLang-compressed notation. Target: 3-5x token reduction. Preserve every fact.

## Trigger

`/rlang-think:compress <absolute_filepath>` or "compress this file to rlang"

## Process

1. Read the target file completely
2. Save backup: `FILE.original.md` (same directory)
3. Compress content following the rules below
4. Write compressed version to original path
5. Report: original tokens, compressed tokens, ratio

## Compression Rules

### Remove
- Articles (a, an, the)
- Filler (just, really, basically, simply, actually, perhaps, maybe)
- Hedging (I think, it seems, it appears, it's possible that)
- Pleasantries (please note, it's worth mentioning, keep in mind)
- Redundant transitions (however, furthermore, additionally, moreover)
- Repeated information (say it once)

### Preserve EXACTLY (never modify)
- Code blocks, commands, paths, URLs
- Tool names, function signatures, API endpoints
- Version numbers, config values
- File paths and directory structures
- Error messages (quoted exact)
- Git commands and branch names

### Preserve Structure
- Headings hierarchy (##, ###)
- Bullet/numbered lists (compress content, keep structure)
- Code fences with language tags
- Tables (compress cell content)

### Compress Using RLang Patterns

**Instructions → operator notation:**
```
"Always run tests before committing" → req(tests_pass) |> commit
"Use conventional commit format" → commit.fmt: conventional
"Never push to main directly" → req(!push_direct_main)
"If tests fail, fix before proceeding" → tests ?> fix !> block
```

**Preferences → typed beliefs:**
```
"The preferred testing framework is pytest" → test.framework: pytest | p:1.0
"We generally use TypeScript over JavaScript" → lang: ts > js | p:0.90
```

**Conditional rules → match expressions:**
```
"For frontend work, use React. For APIs, use FastAPI."
→ match task {
    frontend => React,
    api => FastAPI,
}
```

**Sequences → pipe chains:**
```
"First lint, then test, then build, then deploy"
→ lint |> test |> build |> deploy
```

**Warnings → error channels:**
```
"Never commit .env files — they contain secrets"
→ .env !> commit | reason: secrets
```

## Example

**Before (CLAUDE.md, ~200 tokens):**
```
## Development Guidelines

When working on this project, please always run the test suite before
committing any changes. We use pytest as our testing framework. The CI
pipeline will also run tests, but it's faster to catch issues locally first.

For commit messages, please follow the conventional commits specification.
This means using prefixes like feat:, fix:, chore:, etc.

Important: Never push directly to the main branch. Always create a feature
branch and open a pull request for review.
```

**After (~60 tokens):**
```
## Dev

req(pytest) |> commit
commit.fmt: conventional (feat:/fix:/chore:)
req(!push_direct_main) -> branch + PR
CI runs tests but local faster
```

## Boundaries

- Never compress code blocks themselves — only the prose around them
- Never compress error messages or exact commands
- If a section is already terse (<10 words), leave it alone
- If compression would lose technical meaning, keep original
- User says "decompress" or "expand": restore from `.original.md` backup
