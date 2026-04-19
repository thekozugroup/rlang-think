RLang Think replaces verbose English chain-of-thought with structured reasoning traces. Instead of "Let me think about this... Actually, wait, let me reconsider..." your agent produces a typed 4-phase trace with confidence values computed from evidence -- in ~6x fewer tokens.

## Screenshots

![RLang reasoning trace in terminal](https://raw.githubusercontent.com/thekozugroup/RLang/main/docs/screenshot.png)

## How it works

Every reasoning trace follows four mandatory phases: **Frame** (observe evidence, establish beliefs with typed confidence), **Explore** (decompose the problem, evaluate candidates, build evidence chains), **Verify** (check constraints, bounded backtracking if needed), and **Decide** (commit to a conclusion with assert/hedge/suspend/reject).

The language uses Rust-inspired syntax: beliefs carry typed confidence (`blf<0.85>`), evidence has provenance (`src:obs(ci_pipeline)`), and temporal freshness markers (`t:fresh`/`t:stale`) prevent stale-data reasoning. Nine connective operators (`|>`, `->`, `||>`, `<|`, `~>`, `!>`, `?>`, `@>`, `<@`) replace English transition words.

Seven reasoning anti-patterns are structurally impossible: circular reasoning (phase order enforced), infinite reflection (bounded retries), confidence theater (confidence computed from evidence, never asserted), premature commitment (Verify mandatory before Decide), and three others.

## Install

**Claude Code:**
```bash
claude plugin add thekozugroup/rlang-think
```

**Cursor:** Copy `.cursor/skills/rlang-think/SKILL.md` to your project.

**OpenAI/Other agents:** Use `plugins/rlang-think/skills/rlang-think/agents/openai.yaml` or paste the SKILL.md content as a system prompt.

## Skills

| Skill | Command | What it does |
|-------|---------|-------------|
| `rlang-think` | `/rlang-think` | Core reasoning mode -- all `<think>` blocks use RLang |
| `rlang-compress` | `/rlang-think:compress <file>` | Compress CLAUDE.md and memory files to RLang notation |
| `rlang-commit` | `/rlang-think:commit` | Commit messages in RLang operator notation |
| `rlang-review` | `/rlang-think:review` | Code review findings as structured RLang traces |

## Stack

- Claude Code plugin system (SKILL.md format)
- Cursor skills compatibility (.cursor/skills/)
- OpenAI agent YAML config
- Based on [RLang v0.2](https://github.com/thekozugroup/RLang) language specification

## Status

Active
