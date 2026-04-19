#!/usr/bin/env node
// rlang-think — UserPromptSubmit hook to track active mode
// Inspects user input for /rlang-think commands and writes mode to flag file

const fs = require('fs');
const path = require('path');
const os = require('os');

const flagPath = path.join(os.homedir(), '.claude', '.rlang-think-active');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim().toLowerCase();

    // Match /rlang-think commands
    if (prompt.startsWith('/rlang-think') || prompt.startsWith('/rlang')) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0];
      const arg = parts[1] || '';

      let mode = null;

      if (cmd === '/rlang-think:compress' || cmd === '/rlang-compress') {
        mode = 'compress';
      } else if (cmd === '/rlang-think:commit' || cmd === '/rlang-commit') {
        mode = 'commit';
      } else if (cmd === '/rlang-think:review' || cmd === '/rlang-review') {
        mode = 'review';
      } else if (cmd === '/rlang-think' || cmd === '/rlang') {
        if (arg === 'lite') mode = 'lite';
        else if (arg === 'dense') mode = 'dense';
        else if (arg === 'off') {
          try { fs.unlinkSync(flagPath); } catch (e) {}
          return;
        }
        else mode = 'standard';
      }

      if (mode) {
        fs.mkdirSync(path.dirname(flagPath), { recursive: true });
        fs.writeFileSync(flagPath, mode);
      }
    }

    // Detect deactivation
    if (/\b(stop rlang|normal thinking|rlang off)\b/i.test(prompt)) {
      try { fs.unlinkSync(flagPath); } catch (e) {}
    }
  } catch (e) {
    // Silent fail
  }
});
