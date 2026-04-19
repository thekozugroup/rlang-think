---
name: rlang-think
description: >
  Structured reasoning mode. All internal thinking uses RLang — a Rust-inspired
  reasoning language with typed confidence, evidence chains, and four mandatory phases.
  Achieves ~6x token compression on reasoning while preventing circular logic,
  infinite reflection, and confidence theater.
  Trigger: /rlang-think, "think in rlang", "use rlang", "structured reasoning"
---

All internal reasoning uses RLang. English output stays normal. Only the thinking changes.

Default: **on** once activated. `/rlang-think off` to deactivate.

## How It Works

When you reason about any problem, structure your `<think>` block as an RLang trace instead of English prose. The trace has exactly four phases executed in order. No skipping. No unbounded loops.

```
Frame --> Explore --> Verify --> Decide
```

## Phase Reference

### Frame — observe and establish beliefs

```rust
#[phase(Frame)]
impl Deductive {
    let evidence: blf<CONFIDENCE> = obs(WHAT) | p:FLOAT | ep:MODE | src:SOURCE | t:FRESHNESS;
}
```

- `obs(x)` — observe a fact from context
- `blf<0.85>` — typed confidence (0.0–1.0)
- `ep:direct` / `ep:inferred` / `ep:reported` — how you know it
- `src:obs(where)` — evidence source
- `t:fresh` / `t:stale` — temporal freshness
- `scope:local` / `scope:global` — applicability

### Explore — decompose, evaluate, plan

```rust
#[phase(Explore)]
{
    let ev = [
        obs(signal_a) => sup(belief, +0.10),   // supporting evidence
        obs(signal_b) => wkn(belief, -0.15),   // weakening evidence
    ];
    belief |> resolve(ev) -> Ok(blf<UPDATED>);

    decomp("problem") -> {
        eval("option_a", 0.72)
        eval("option_b", 0.88)    // highest confidence wins
    } ||>
    goal("objective") ~>
    plan("approach", steps: N)
}
```

- `sup(x, +delta)` / `wkn(x, -delta)` / `neut(x)` — evidence modifiers
- `resolve(ev)` — compute final confidence from evidence
- `decomp()` — break problem into parts
- `eval()` — evaluate a candidate with confidence
- `goal()` — declare objective
- `plan()` — commit to approach

### Verify — check constraints

```rust
#[phase(Verify)]
{
    req(CONDITION) |> chk("label", CONFIDENCE);
    req(belief.p > 0.5);
}
```

- `req()` — declare a constraint that must hold
- `chk()` — verify a condition with confidence
- If verify fails: bounded rebloom to Explore (max 3)

### Decide — commit to conclusion

```rust
#[phase(Decide)]
{
    match conf(belief) {
        c if c > 0.85 => assert(conclusion),
        c if c > 0.50 => hedge(conclusion),
        _ => suspend(conclusion),
    }
    act("action", param: value)
}
```

- `assert()` — high-confidence conclusion
- `hedge()` — moderate confidence, proceed with caveats
- `suspend()` — insufficient evidence, defer
- `reject()` — evidence contradicts
- `act()` — execute action
- `emit()` — produce output

## Connective Operators

Wire expressions together. Use instead of English transition words.

| Symbol | Name | Replaces |
|--------|------|----------|
| `\|>` | Pipe | "then", "next", "and so" |
| `->` | Transform | "which gives us", "resulting in" |
| `\|\|>` | Fan-out | "simultaneously", "in parallel" |
| `<\|` | Aggregate | "combining all of", "merging" |
| `~>` | Tentative | "maybe", "let's try", "possibly" |
| `!>` | Error | "but if that fails", "however" |
| `?>` | Fallible | "try X, otherwise Y" |
| `@>` | Store | "remember this", "note that" |
| `<@` | Retrieve | "recall that", "as noted earlier" |

## Metadata

```rust
@trace "trace_name" @model "model_name"
#[bounded(max_retries)]     // prevent infinite loops
```

## Reasoning Modes

Choose per-trace based on task type:

| Mode | When | Prefix |
|------|------|--------|
| `impl Deductive` | Given facts → certain conclusion | Logic, math |
| `impl Inductive` | Patterns → general rule | Data analysis |
| `impl Abductive` | Observations → best explanation | Debugging |
| `impl Bayesian` | Prior beliefs updated by evidence | Uncertain domains |
| `impl Analogical` | Known case → similar case | Design, architecture |

## Complete Example

**User asks:** "Should we deploy this fix to production?"

**Your `<think>` block:**

```rust
@trace "deploy_decision" @model "opus-4.6"

#[phase(Frame)]
impl Bayesian {
    let tests: blf<0.99> = obs(ci_pass) | p:0.99 | ep:direct | src:obs(ci) | t:fresh;
    let risk: blf<0.40> = obs(no_rollback) | p:0.40 | ep:inferred | src:obs(infra);
    let traffic: blf<0.90> = obs(low_traffic) | p:0.90 | ep:direct | src:obs(metrics) | t:fresh;
}

#[phase(Explore)]
{
    let ev = [
        tests => sup(deploy, +0.15),
        risk => wkn(deploy, -0.25),
        traffic => sup(deploy, +0.10),
    ];
    deploy |> resolve(ev) -> Ok(blf<0.70>);
    goal("ship_fix") ~> plan("deploy_with_monitoring", steps: 2)
}

#[phase(Verify)]
{
    req(deploy.p > 0.5);
    chk("tests_green", 0.99);
    chk("low_traffic_window", 0.90);
}

#[phase(Decide)]
{
    match conf(deploy) {
        c if c > 0.85 => assert(deploy),
        c if c > 0.50 => hedge(deploy),
        _ => suspend(deploy),
    }
    act("deploy", env: "prod") |>
    act("monitor", duration: "2h")
}
```

**Your response (normal English):** "Yes, deploy with monitoring. Tests pass, traffic is low, but set up a 2-hour monitoring window since there's no rollback plan."

## Anti-Pattern Prevention

These reasoning failures are structurally impossible in RLang:

| Failure | Prevention |
|---------|-----------|
| Circular reasoning | Phase order enforced: Frame→Explore→Verify→Decide |
| Infinite reflection | `#[bounded(max_retries)]` on all backtrack |
| Constraint forgetting | `req()` persists across phases |
| Premature commitment | Verify mandatory before Decide |
| Over-verification | Single Verify phase, bounded rebloom |
| Rumination | Rebloom requires new `DiagnosisKind` |
| Confidence theater | `p:` computed from `resolve(ev)`, never asserted |

## When NOT to Use RLang Thinking

- Trivial questions needing no reasoning ("What time is it?")
- Pure creative writing where structure would constrain
- User explicitly asks for step-by-step English explanation

Use RLang for: debugging, architecture decisions, trade-off analysis, planning, code review reasoning, deployment decisions, risk assessment — anything where structured reasoning adds value.

## Intensity Levels

| Level | Description |
|-------|------------|
| **standard** | Full 4-phase traces with all metadata. Default |
| **lite** | Phases + core operators only. Skip metadata, freshness |
| **dense** | Abbreviated identifiers, minimal whitespace, max compression |

Switch: `/rlang-think standard|lite|dense`
