#!/usr/bin/env node
"use strict";

// Checks a pull request. Runs from the trusted base branch and only READS the
// pull request's files as data (via `git show`), never executes them.
//
// Environment (set by .github/workflows/validate.yml):
//   BASE_SHA            base commit of the pull request
//   HEAD_REF            local ref holding the PR head (default: pr-head)
//   PR_AUTHOR           GitHub login of the PR author
//   AUTHOR_ASSOCIATION  OWNER / MEMBER / COLLABORATOR / CONTRIBUTOR / NONE ...
//   GITHUB_TOKEN        used only to look up the author's account age

const fs = require("fs");
const { execFileSync } = require("child_process");
const {
  config,
  loadDomainsFromDir,
  validateSet,
  parseDomainFile,
  countTopLevelOwned,
  sameUser,
} = require("./lib");

const BASE_SHA = process.env.BASE_SHA;
const HEAD_REF = process.env.HEAD_REF || "pr-head";
const AUTHOR = process.env.PR_AUTHOR || "";
const ASSOCIATION = process.env.AUTHOR_ASSOCIATION || "NONE";
const IS_MAINTAINER = ["OWNER", "MEMBER", "COLLABORATOR"].includes(ASSOCIATION);
const DOMAIN_FILE_RE = /^domains\/([^/]+)\.json$/;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

async function accountAgeDays(login) {
  const headers = { "User-Agent": "has-a-tech-validator", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const user = await res.json();
  return (Date.now() - new Date(user.created_at).getTime()) / 86400000;
}

async function main() {
  if (!BASE_SHA || !AUTHOR) throw new Error("BASE_SHA and PR_AUTHOR must be set.");
  const errors = []; // plain strings

  // 1. What did the PR change?
  const changes = git(["diff", "--name-status", "--no-renames", `${BASE_SHA}...${HEAD_REF}`])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status: status[0], path: rest.join("\t") };
    });

  if (changes.length === 0) errors.push("This pull request doesn't change any files.");

  const outside = changes.filter((c) => !DOMAIN_FILE_RE.test(c.path));
  if (outside.length && !IS_MAINTAINER) {
    errors.push(
      "Only files inside domains/ ending in .json can be changed. These aren't allowed: " +
        outside.map((c) => c.path).join(", ")
    );
  }

  // 2. Build the domain set as it would look after merging.
  const base = loadDomainsFromDir().domains;
  const after = new Map(base);
  const changed = [];
  for (const c of changes) {
    const m = c.path.match(DOMAIN_FILE_RE);
    if (!m) continue;
    const name = m[1];
    if (c.status === "D") {
      after.delete(name);
    } else {
      const text = git(["show", `${HEAD_REF}:${c.path}`]);
      if (Buffer.byteLength(text) > config.maxFileBytes) {
        errors.push(`domains/${name}.json is too large.`);
        continue;
      }
      after.set(name, parseDomainFile(text));
    }
    changed.push({ name, status: c.status });
  }

  // 3. Ownership rules.
  let addsTopLevel = false;
  for (const { name, status } of changed) {
    const before = base.get(name);
    const now = after.get(name);
    const beforeOwner = before?.data?.owner?.username;
    const nowOwner = now?.data?.owner?.username;

    if (status === "A") {
      if (before) errors.push(`"${name}" is already taken.`);
      if (!IS_MAINTAINER && nowOwner !== undefined && !sameUser(nowOwner, AUTHOR)) {
        errors.push(`domains/${name}.json: "owner.username" must be your own GitHub username (${AUTHOR}).`);
      }
      if (!name.includes(".")) addsTopLevel = true;
    } else if (status === "M") {
      if (!IS_MAINTAINER && !sameUser(beforeOwner, AUTHOR)) {
        errors.push(`You can only change domains you own. "${name}" belongs to ${beforeOwner}.`);
      }
      if (!IS_MAINTAINER && nowOwner !== undefined && !sameUser(nowOwner, beforeOwner)) {
        errors.push(`The owner of "${name}" can't be changed in a pull request. Open an issue instead.`);
      }
    } else if (status === "D") {
      if (!IS_MAINTAINER && !sameUser(beforeOwner, AUTHOR)) {
        errors.push(`You can only remove domains you own. "${name}" belongs to ${beforeOwner}.`);
      }
      for (const other of after.keys()) {
        if (other.endsWith("." + name)) {
          errors.push(`Remove "${other}" too: it depends on "${name}".`);
        }
      }
    } else {
      errors.push(`Unsupported change type "${status}" for domains/${name}.json.`);
    }
  }

  // 4. Limits for new users.
  if (!IS_MAINTAINER && addsTopLevel) {
    const owned = countTopLevelOwned(after, AUTHOR);
    if (owned > config.maxDomainsPerUser) {
      errors.push(
        `Each GitHub account can have ${config.maxDomainsPerUser} top-level name(s); you would have ${owned}. ` +
          "(Nested names like blog.yourname don't count.)"
      );
    }
    try {
      const age = await accountAgeDays(AUTHOR);
      if (age < config.minAccountAgeDays) {
        errors.push(`Your GitHub account must be at least ${config.minAccountAgeDays} days old to register.`);
      }
    } catch (e) {
      errors.push(`Couldn't check your GitHub account age (${e.message}). A maintainer will re-run this check.`);
    }
  }

  // 5. Format and content rules for every changed file (plus their nested names).
  const toCheck = new Set();
  for (const { name, status } of changed) {
    if (status !== "D") toCheck.add(name);
    for (const other of after.keys()) if (other.endsWith("." + name)) toCheck.add(other);
  }
  for (const p of validateSet(after, toCheck)) errors.push(`domains/${p.name}.json: ${p.message}`);

  // Report.
  const lines = errors.length
    ? [`## ❌ ${errors.length} problem(s) found`, "", ...errors.map((e) => `- ${e}`), "",
       "Fix these in your fork and the check will run again automatically."]
    : ["## ✅ Looks good!", "", "A maintainer will review your request soon."];
  const report = lines.join("\n");
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error("Validator crashed:", e);
  process.exit(1);
});
