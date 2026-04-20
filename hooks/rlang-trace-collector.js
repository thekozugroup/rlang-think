#!/usr/bin/env node
// rlang-think — Stop hook that extracts RLang traces from session transcripts
// and saves them in ShareGPT format for training data collection.
//
// Runs after every assistant turn. Checks if RLang mode is active,
// finds the session transcript, extracts the last user+assistant pair,
// and if the thinking block contains RLang patterns, saves the trace.

const fs = require('fs');
const path = require('path');
const os = require('os');

const FLAG_PATH = path.join(os.homedir(), '.claude', '.rlang-think-active');
const TRACES_DIR = path.join(os.homedir(), '.claude', 'rlang-traces');
const TRACES_FILE = path.join(TRACES_DIR, 'traces.jsonl');

// RLang pattern detection — must match actual RLang syntax
const RLANG_PATTERNS = [
  /\#\[phase\((Frame|Explore|Verify|Decide)\)\]/,
  /impl\s+(Deductive|Inductive|Abductive|Bayesian|Analogical)/,
  /\bobs\([^)]+\)/,
  /\bblf<[\d.]+>/,
  /\bresolve\([^)]+\)/,
  /\bsup\([^)]+\)/,
  /\bwkn\([^)]+\)/,
  /\bassert\([^)]+\)/,
  /\bgoal\([^)]+\)/,
  /\bdecomp\([^)]+\)/,
  /\breq\([^)]+\)/,
  /\bchk\([^)]+\)/,
];

function hasRLangContent(text) {
  if (!text) return false;
  let matches = 0;
  for (const pattern of RLANG_PATTERNS) {
    if (pattern.test(text)) matches++;
  }
  // Require at least 3 distinct RLang patterns to avoid false positives
  return matches >= 3;
}

function extractPhases(text) {
  const phases = [];
  const phaseRegex = /#\[phase\((\w+)\)\]/g;
  let match;
  while ((match = phaseRegex.exec(text)) !== null) {
    phases.push(match[1]);
  }
  return phases;
}

function estimateTokens(text) {
  // Rough estimate: ~4 chars per token for code-like content
  return Math.ceil((text || '').length / 4);
}

function findSessionFile(sessionId) {
  // Session transcripts live in ~/.claude/projects/PROJECT_SLUG/SESSION_ID.jsonl
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsDir)) return null;

  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of projectDirs) {
    const candidate = path.join(projectsDir, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function extractLastConversation(sessionFile) {
  const lines = fs.readFileSync(sessionFile, 'utf8').trim().split('\n');

  let lastUserPrompt = null;
  let lastThinking = null;
  let lastResponse = null;
  let lastModel = null;

  // Walk backwards to find the last complete user → assistant pair
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }

    const msg = entry.message;
    if (!msg) continue;

    if (msg.role === 'assistant' && !lastResponse) {
      lastModel = msg.model || null;
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'thinking' && !lastThinking) {
            lastThinking = block.thinking;
          }
          if (block.type === 'text' && !lastResponse) {
            lastResponse = block.text;
          }
        }
      } else if (typeof msg.content === 'string' && !lastResponse) {
        lastResponse = msg.content;
      }
    }

    if (msg.role === 'user' && lastResponse) {
      if (typeof msg.content === 'string') {
        lastUserPrompt = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Extract text parts from content array
        lastUserPrompt = msg.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
      }
      break; // Found the pair
    }
  }

  return { userPrompt: lastUserPrompt, thinking: lastThinking, response: lastResponse, model: lastModel };
}

function buildShareGPTEntry(userPrompt, thinking, response, metadata) {
  const systemPrompt =
    "You are a reasoning assistant that thinks in RLang, a Rust-inspired structured reasoning language. " +
    "When solving problems, produce an RLang trace inside <think> tags with four phases: " +
    "Frame (observe evidence, establish beliefs), Explore (decompose, evaluate, plan), " +
    "Verify (check constraints), Decide (assert/hedge/suspend/reject). " +
    "Then provide a clear English response.";

  // Build the assistant value: <think>RLANG</think>\n\nENGLISH
  let assistantValue = '';
  if (thinking) {
    assistantValue = `<think>\n${thinking.trim()}\n</think>\n\n`;
  }
  assistantValue += (response || '').trim();

  return {
    id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    conversations: [
      { from: 'system', value: systemPrompt },
      { from: 'human', value: (userPrompt || '').trim() },
      { from: 'gpt', value: assistantValue },
    ],
    metadata: {
      source: 'rlang-think-plugin',
      session_id: metadata.sessionId || null,
      timestamp: new Date().toISOString(),
      model: metadata.model || null,
      phases: metadata.phases || [],
      rlang_tokens_est: metadata.rlangTokens || 0,
      response_tokens_est: metadata.responseTokens || 0,
      compression_ratio: metadata.compressionRatio || null,
    },
  };
}

// --- Main ---
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    // Check if RLang mode is active
    if (!fs.existsSync(FLAG_PATH)) return;

    const data = JSON.parse(input);
    const sessionId = data.session_id || data.sessionId;
    if (!sessionId) return;

    // Find session transcript
    const sessionFile = findSessionFile(sessionId);
    if (!sessionFile) return;

    // Extract last conversation
    const { userPrompt, thinking, response, model } = extractLastConversation(sessionFile);
    if (!thinking || !userPrompt) return;

    // Check for RLang content in thinking block
    if (!hasRLangContent(thinking)) return;

    // Extract metadata
    const phases = extractPhases(thinking);
    const rlangTokens = estimateTokens(thinking);
    const responseTokens = estimateTokens(response);
    const compressionRatio = responseTokens > 0 ? (responseTokens / rlangTokens).toFixed(2) : null;

    // Build ShareGPT entry
    const entry = buildShareGPTEntry(userPrompt, thinking, response, {
      sessionId,
      model,
      phases,
      rlangTokens,
      responseTokens,
      compressionRatio,
    });

    // Save
    fs.mkdirSync(TRACES_DIR, { recursive: true });
    fs.appendFileSync(TRACES_FILE, JSON.stringify(entry) + '\n');

    // Also update a stats file
    const statsFile = path.join(TRACES_DIR, 'stats.json');
    let stats = { total_traces: 0, total_rlang_tokens: 0, total_response_tokens: 0 };
    try { stats = JSON.parse(fs.readFileSync(statsFile, 'utf8')); } catch {}
    stats.total_traces++;
    stats.total_rlang_tokens += rlangTokens;
    stats.total_response_tokens += responseTokens;
    stats.last_collected = new Date().toISOString();
    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));

  } catch (e) {
    // Silent fail — don't break the session
  }
});
