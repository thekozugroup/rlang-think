---
name: rlang-review
description: >
  Code review comments using RLang structured reasoning. Each finding is a mini-trace
  with evidence, confidence, and clear action. Cuts review noise while keeping precision.
  Trigger: /rlang-think:review or "rlang review"
---

## Purpose

Write code review feedback as structured RLang findings. Each issue = evidence + confidence + action. No filler, no apologizing, no "you might want to consider."

## Finding Format

```
SEVERITY(confidence): FILE:LINE — OPERATOR_CHAIN
  evidence: WHAT_YOU_SAW
  action: WHAT_TO_DO
```

## Severity Levels

| Level | Symbol | Meaning |
|-------|--------|---------|
| Critical | `!!` | Blocks merge. Security, data loss, crash |
| Major | `!` | Should fix. Bug, perf issue, wrong behavior |
| Minor | `~` | Nice to fix. Style, naming, small improvement |
| Note | `?` | Observation. No action required |

## Example Review

```
!! (0.98): src/auth.rs:42 — token_verify !> no_expiry_chk
  evidence: obs(jwt_decode) |> no conf(exp_field) -> accept_expired
  action: req(token.exp > now()) |> reject(expired)

! (0.85): src/api/handler.rs:108 — unwrap() on user_input
  evidence: obs(.unwrap()) | src:user_req -> panic on bad input
  action: .unwrap() -> match/? operator

~ (0.72): src/db/queries.rs:55 — N+1 query in loop
  evidence: obs(SELECT in for_each) | n:users.len()
  action: batch_query |> JOIN or IN clause

? (0.60): src/config.rs:12 — hardcoded timeout
  evidence: obs(timeout: 30) | no env/config source
  action: ~> extract to config | low_priority
```

## Process

1. Read the diff or files under review
2. For each finding: observe evidence, assess confidence, determine severity
3. Format as RLang finding blocks
4. Group by severity (critical first)
5. End with summary: `TOTAL: N findings (X critical, Y major, Z minor)`

## Boundaries

- Positive feedback: `+ (1.0): clean error handling in auth module` — acknowledge good patterns too
- Don't RLang-ify the suggestion code blocks themselves — show correct code in normal syntax
- If a finding is uncertain (< 0.50), mark as `?` note, not a request for change
- Security findings always `!!` regardless of confidence
