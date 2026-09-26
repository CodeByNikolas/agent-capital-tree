#!/usr/bin/env node
// One bundled import avoids thousands of slow node_modules reads across the WSL /mnt boundary.
try { await import('./bundle/capital.mjs'); }
catch { process.stderr.write('Capital MCP bundle unavailable. Run pnpm --filter @agent-capital-tree/runtime build.\n'); process.exitCode = 1; }
