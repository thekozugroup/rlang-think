---
name: rlang-commit
description: >
  Generate ultra-compressed commit messages using RLang operator notation.
  Preserves semantic meaning of changes while cutting message tokens 50-70%.
  Trigger: /rlang-think:commit or "rlang commit"
---

## Purpose

Write commit messages using RLang notation. Captures what changed, why, and impact — in minimal tokens.

## Format

```
TYPE(SCOPE): OPERATOR_CHAIN

BODY (optional, RLang notation)
```

## Type Mapping

| Conventional | RLang |
|-------------|-------|
| feat | +feat |
| fix | !fix |
| refactor | ~refac |
| perf | ^perf |
| test | ?test |
| docs | @docs |
| chore | .chore |

## Examples

**Standard commit:**
```
feat(auth): add OAuth2 login flow with Google provider
```

**RLang commit:**
```
+feat(auth): OAuth2 |> Google provider
```

---

**Standard:**
```
fix(api): resolve race condition in concurrent webhook processing
that caused duplicate events when multiple workers consumed the same queue
```

**RLang:**
```
!fix(api): webhook race_cond -> dedup
workers ||> same_queue !> duplicate_events
```

---

**Standard:**
```
refactor(db): migrate from raw SQL queries to SQLAlchemy ORM
for better type safety and query composition
```

**RLang:**
```
~refac(db): raw_sql -> SQLAlchemy ORM
reason: type_safety + query_compose
```

## Process

1. Read staged changes (`git diff --cached`)
2. Analyze: what changed, why, impact
3. Write message in RLang commit format
4. Present for approval

## Boundaries

- Breaking changes: prefix with `!!` → `!!+feat(api): v2 endpoints -> breaking`
- Security fixes: prefix with `[sec]` → `[sec]!fix(auth): token_expire chk`
- Multi-scope: chain with `|>` → `+feat(auth|api): OAuth2 |> middleware |> routes`
