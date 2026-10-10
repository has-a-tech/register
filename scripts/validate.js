#!/usr/bin/env node
"use strict";

// Validates every file in domains/. Run locally with:  node scripts/validate.js
// The deploy workflow runs this before touching DNS.

const { loadDomainsFromDir, validateSet } = require("./lib");

const { domains, problems } = loadDomainsFromDir();
problems.push(...validateSet(domains));

if (domains.size === 0) {
  problems.push({ file: "domains/", message: "No domain files found. Refusing to continue." });
}

if (problems.length) {
  console.error(`❌ Found ${problems.length} problem(s):\n`);
  for (const p of problems) {
    console.error(`  ${p.file || `domains/${p.name}.json`} — ${p.message}`);
  }
  process.exit(1);
}
console.log(`✅ All ${domains.size} domain file(s) are valid.`);
