#!/usr/bin/env node
// Standalone packaged Kanoki capital MCP; its public manifests are embedded in the bundle.
try { await import('./bundle/capital.mjs'); }
catch { process.stderr.write('Kanoki capital bundle could not start. Rebuild the runtime or reinstall the Kanoki plugin.\n'); process.exitCode = 1; }
