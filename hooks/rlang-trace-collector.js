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

function simpleHash(str) {
  // djb2 hash — fast, deterministic, good distribution
  let hash = 5381;
  for (let i = 0; i < (str || '').length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit int
  }
  return Math.abs(hash).toString(36);
}

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

function isRealUserPrompt(entry) {
  // Real user prompts have type "user" at the entry level (not tool results)
  // and contain string content or text blocks (not tool_result blocks)
  const msg = entry.message;
  if (!msg || msg.role !== 'user') return false;

  // Entry-level type field distinguishes real prompts from tool results
  if (entry.type === 'tool_result') return false;

  // If content is a string, it's a real prompt
  if (typeof msg.content === 'string') return true;

  // If content is an array, check for tool_result blocks
  if (Array.isArray(msg.content)) {
    const hasToolResult = msg.content.some(b => b.type === 'tool_result');
    const hasText = msg.content.some(b => b.type === 'text');
    // Tool results without any text = not a real prompt
    // Tool results WITH text = could be a follow-up, but usually not
    return hasText && !hasToolResult;
  }

  return false;
}

function getUserPromptText(entry) {
  const msg = entry.message;
  if (!msg) return null;
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  return null;
}

function extractFullTask(sessionFile) {
  const lines = fs.readFileSync(sessionFile, 'utf8').trim().split('\n');
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }

  // Step 1: Find the LAST real user prompt (walk backwards)
  let promptIndex = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isRealUserPrompt(entries[i])) {
      promptIndex = i;
      break;
    }
  }
  if (promptIndex === -1) return null;

  const userPrompt = getUserPromptText(entries[promptIndex]);
  if (!userPrompt) return null;

  // Step 2: Collect ALL assistant content from promptIndex forward
  const thinkingBlocks = [];   // ordered list of all thinking blocks
  const textBlocks = [];       // ordered list of all text responses
  const toolCalls = [];        // ordered list of tool uses (name + summary)
  let model = null;
  let turnCount = 0;

  for (let i = promptIndex + 1; i < entries.length; i++) {
    const msg = entries[i].message;
    if (!msg || msg.role !== 'assistant') continue;

    if (!model && msg.model) model = msg.model;
    turnCount++;

    if (!Array.isArray(msg.content)) {
      if (typeof msg.content === 'string' && msg.content.trim()) {
        textBlocks.push(msg.content.trim());
      }
      continue;
    }

    for (const block of msg.content) {
      if (block.type === 'thinking' && block.thinking) {
        thinkingBlocks.push(block.thinking);
      }
      if (block.type === 'text' && block.text && block.text.trim()) {
        textBlocks.push(block.text.trim());
      }
      if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name || 'unknown',
          // Capture a short summary of tool input for context
          input_summary: summarizeToolInput(block.input),
        });
      }
    }
  }

  if (thinkingBlocks.length === 0) return null;

  // Step 3: Chain all thinking blocks with step markers
  let chainedThinking;
  if (thinkingBlocks.length === 1) {
    chainedThinking = thinkingBlocks[0];
  } else {
    chainedThinking = thinkingBlocks
      .map((block, i) => `// === Step ${i + 1}/${thinkingBlocks.length} ===\n${block}`)
      .join('\n\n');
  }

  // Step 4: Build the final response (last text block is the primary response,
  // earlier text blocks are intermediate status updates)
  const finalResponse = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1] : '';
  const intermediateResponses = textBlocks.slice(0, -1);

  return {
    userPrompt,
    thinking: chainedThinking,
    response: finalResponse,
    model,
    turnCount,
    thinkingBlockCount: thinkingBlocks.length,
    toolCalls,
    intermediateResponses,
  };
}

function summarizeToolInput(input) {
  if (!input) return '';
  if (typeof input === 'string') return input.slice(0, 100);
  // For objects, grab key fields
  const summary = [];
  if (input.command) summary.push(`cmd: ${input.command.slice(0, 80)}`);
  if (input.file_path) summary.push(`file: ${input.file_path}`);
  if (input.pattern) summary.push(`pattern: ${input.pattern}`);
  if (input.prompt) summary.push(`prompt: ${input.prompt.slice(0, 80)}`);
  if (input.description) summary.push(input.description.slice(0, 80));
  return summary.join(' | ') || JSON.stringify(input).slice(0, 100);
}

function buildShareGPTEntry(taskData, metadata) {
  const systemPrompt =
    "You are a reasoning assistant that thinks in RLang, a Rust-inspired structured reasoning language. " +
    "When solving problems, produce an RLang trace inside <think> tags with four phases: " +
    "Frame (observe evidence, establish beliefs), Explore (decompose, evaluate, plan), " +
    "Verify (check constraints), Decide (assert/hedge/suspend/reject). " +
    "For multi-step tasks, produce a chained trace with step markers. " +
    "Then provide a clear English response.";

  // Build the assistant value: <think>RLANG</think>\n\nENGLISH
  let assistantValue = '';
  if (taskData.thinking) {
    assistantValue = `<think>\n${taskData.thinking.trim()}\n</think>\n\n`;
  }

  // Include tool call context between thinking and response if present
  if (taskData.toolCalls && taskData.toolCalls.length > 0) {
    const toolSummary = taskData.toolCalls
      .map(t => `[tool: ${t.name}] ${t.input_summary}`)
      .join('\n');
    assistantValue += `<!-- tools used:\n${toolSummary}\n-->\n\n`;
  }

  assistantValue += (taskData.response || '').trim();

  return {
    id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    conversations: [
      { from: 'system', value: systemPrompt },
      { from: 'human', value: (taskData.userPrompt || '').trim() },
      { from: 'gpt', value: assistantValue },
    ],
    metadata: {
      source: 'rlang-think-plugin',
      session_id: metadata.sessionId || null,
      timestamp: new Date().toISOString(),
      model: taskData.model || null,
      phases: metadata.phases || [],
      thinking_blocks: taskData.thinkingBlockCount || 1,
      turns: taskData.turnCount || 1,
      tools_used: (taskData.toolCalls || []).map(t => t.name),
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

    // Extract full task (all thinking blocks from last real user prompt)
    const taskData = extractFullTask(sessionFile);
    if (!taskData || !taskData.thinking || !taskData.userPrompt) return;

    // Check for RLang content in the chained thinking
    if (!hasRLangContent(taskData.thinking)) return;

    // Extract metadata
    const phases = extractPhases(taskData.thinking);
    const rlangTokens = estimateTokens(taskData.thinking);
    const responseTokens = estimateTokens(taskData.response);
    const compressionRatio = responseTokens > 0 ? (responseTokens / rlangTokens).toFixed(2) : null;

    // Build ShareGPT entry
    const entry = buildShareGPTEntry(taskData, {
      sessionId,
      phases,
      rlangTokens,
      responseTokens,
      compressionRatio,
    });

    // Dedup: use a stable key from session_id + user prompt hash.
    // On each Stop, we overwrite the previous trace for the same prompt,
    // so only the final (most complete) version survives.
    const promptHash = simpleHash(taskData.userPrompt);
    const dedupeKey = `${sessionId}_${promptHash}`;

    fs.mkdirSync(TRACES_DIR, { recursive: true });

    // Read existing traces, replace any with same dedupeKey, append if new
    let existingLines = [];
    try {
      existingLines = fs.readFileSync(TRACES_FILE, 'utf8').trim().split('\n').filter(Boolean);
    } catch { /* file doesn't exist yet */ }

    let replaced = false;
    const updatedLines = existingLines.map(line => {
      try {
        const existing = JSON.parse(line);
        if (existing.metadata && existing.metadata._dedupe_key === dedupeKey) {
          replaced = true;
          entry.metadata._dedupe_key = dedupeKey;
          return JSON.stringify(entry);
        }
      } catch { /* keep malformed lines */ }
      return line;
    });

    if (!replaced) {
      entry.metadata._dedupe_key = dedupeKey;
      updatedLines.push(JSON.stringify(entry));
    }

    fs.writeFileSync(TRACES_FILE, updatedLines.join('\n') + '\n');

    // Update stats file
    const statsFile = path.join(TRACES_DIR, 'stats.json');
    let stats = { total_traces: 0, total_rlang_tokens: 0, total_response_tokens: 0 };
    try { stats = JSON.parse(fs.readFileSync(statsFile, 'utf8')); } catch {}
    if (!replaced) stats.total_traces++;
    stats.total_rlang_tokens += rlangTokens;
    stats.total_response_tokens += responseTokens;
    stats.last_collected = new Date().toISOString();
    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));

  } catch (e) {
    // Silent fail — don't break the session
  }
});
