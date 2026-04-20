#!/usr/bin/env node
// rlang-think — SessionStart activation hook
//
// Writes a flag file at ~/.claude/.rlang-think-active so statusline
// scripts can detect RLang thinking mode. Emits a short ruleset
// reminder as SessionStart context.

const fs = require('fs');
const path = require('path');
const os = require('os');

const flagPath = path.join(os.homedir(), '.claude', '.rlang-think-active');

try {
  fs.mkdirSync(path.dirname(flagPath), { recursive: true });
  fs.writeFileSync(flagPath, 'standard');
} catch (e) {
  // Silent fail -- flag is best-effort
}

process.stdout.write(
  "RLANG THINKING MODE ACTIVE. " +
  "All internal reasoning uses RLang traces with 4 mandatory phases. " +
  "Phase order: Frame (observe/establish beliefs) -> Explore (decompose/evaluate/plan) -> " +
  "Verify (check constraints) -> Decide (assert/hedge/suspend/reject). " +
  "Core operators: obs(), blf<>, hyp(), eval(), decomp(), resolve(), req(), chk(), assert(), act(). " +
  "Connectives: |> -> ||> <| ~> !> ?> @> <@. " +
  "Confidence: typed floats 0.0-1.0, computed from evidence via resolve(), never asserted. " +
  "Modes: impl Deductive|Inductive|Abductive|Bayesian|Analogical. " +
  "English output stays normal. Only <think> blocks change to RLang. " +
  "TRACE COLLECTION: All RLang traces auto-saved to ~/.claude/rlang-traces/traces.jsonl in ShareGPT format for training. " +
  "User says 'stop rlang' or 'normal thinking' to deactivate."
);
