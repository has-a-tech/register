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
//   GITHUB_TOKEN        looks up the author's account age and posts the result comment
//   GITHUB_REPOSITORY   owner/repo (set by GitHub Actions)
//   PR_NUMBER           pull request number, for the comment
//   VERIFY_API_URL      the has-a.tech site (default https://has-a.tech)
//   VERIFY_API_KEY      secret for the student-verification lookup

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

const VERIFY_URL = (process.env.VERIFY_API_URL || "https://has-a.tech").replace(/\/$/, "");
const COMMENT_MARKER = "<!-- has-a-tech-bot -->";

async function isVerifiedStudent(login) {
  if (!process.env.VERIFY_API_KEY) throw new Error("VERIFY_API_KEY isn't configured");
  const res = await fetch(`${VERIFY_URL}/api/status/${encodeURIComponent(login)}`, {
    headers: { Authorization: `Bearer ${process.env.VERIFY_API_KEY}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`verification service returned ${res.status}`);
  return (await res.json()).verified === true;
}

// Looks at the target website and returns warnings for the human reviewer.
// These never fail the check on their own: a person decides.
const SUSPICIOUS_PHRASES = [
  "seed phrase", "recovery phrase", "secret phrase", "verify your account", "confirm your identity",
  "enter your password", "account suspended", "connect your wallet", "claim your reward",
];
async function siteWarnings(name, data) {
  const r = data?.records || {};
  let url;
  if (typeof r.CNAME === "string") url = `https://${r.CNAME.replace(/\.$/, "")}/`;
  else if (Array.isArray(r.A) && r.A.length) url = `http://${r.A[0]}/`;
  else return [];
  const warnings = [];
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "has-a-tech-review-bot" } });
    if (res.status >= 400) {
      warnings.push(`\`${url}\` returned HTTP ${res.status}. Make sure your site is online before review.`);
      return warnings;
    }
    const text = (await res.text()).slice(0, 300000);
    const lower = text.toLowerCase();
    const visible = lower.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (visible.length < 40) warnings.push(`\`${url}\` looks almost empty. Your site needs real content before it can be approved.`);
    if (/<input[^>]+type\s*=\s*["']?password/.test(lower)) {
      warnings.push(`\`${url}\` has a password field. Login pages aren't allowed; a reviewer will look closely.`);
    }
    const found = SUSPICIOUS_PHRASES.filter((p) => visible.includes(p));
    if (found.length) warnings.push(`\`${url}\` contains phrases often used in scams (${found.map((p) => `"${p}"`).join(", ")}). A reviewer will look closely.`);
  } catch (e) {
    warnings.push(`Couldn't load \`${url}\` (${e.name === "TimeoutError" ? "timed out" : "not reachable"}). Make sure your site is online before review.`);
  }
  return warnings;
}

async function postComment(body) {
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !pr || !token) return;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "has-a-tech-validator" };
  try {
    const list = await fetch(`https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=100`, { headers });
    const existing = list.ok ? (await list.json()).find((c) => c.user?.type === "Bot" && c.body?.includes(COMMENT_MARKER)) : null;
    const url = existing
      ? `https://api.github.com/repos/${repo}/issues/comments/${existing.id}`
      : `https://api.github.com/repos/${repo}/issues/${pr}/comments`;
    const res = await fetch(url, { method: existing ? "PATCH" : "POST", headers, body: JSON.stringify({ body }) });
    if (!res.ok) console.error(`Couldn't post the comment (${res.status}).`);
  } catch (e) {
    console.error("Couldn't post the comment:", e.message);
  }
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
    if (!/^[A-Za-z0-9_.-]{1,253}$/.test(name)) {
      // Don't echo odd file names back into the comment.
      errors.push("A file name uses characters that aren't allowed. Use lowercase letters, numbers, hyphens and dots.");
      continue;
    }
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
    try {
      if (!(await isVerifiedStudent(AUTHOR))) {
        errors.push(
          `@${AUTHOR} isn't verified as a student yet. Verify at ${VERIFY_URL}/verify while signed in as ${AUTHOR}, ` +
            "then close and reopen this pull request to check again."
        );
      }
    } catch (e) {
      errors.push(`Couldn't check student verification (${e.message}). A maintainer will re-run this check.`);
    }
  }

  // 5. Format and content rules for every changed file (plus their nested names).
  const toCheck = new Set();
  for (const { name, status } of changed) {
    if (status !== "D") toCheck.add(name);
    for (const other of after.keys()) if (other.endsWith("." + name)) toCheck.add(other);
  }
  for (const p of validateSet(after, toCheck)) errors.push(`domains/${p.name}.json: ${p.message}`);

  // 6. Look at the websites (warnings for the reviewer, not failures).
  const warnings = [];
  if (errors.length === 0) {
    for (const { name, status } of changed) {
      if (status === "D") continue;
      warnings.push(...(await siteWarnings(name, after.get(name)?.data)));
    }
  }

  // Report.
  const lines = [COMMENT_MARKER];
  if (errors.length) {
    lines.push(`### ❌ ${errors.length} problem${errors.length > 1 ? "s" : ""} to fix`, "", ...errors.map((e) => `- ${e}`), "",
      "Edit your file in your fork and this check runs again automatically. The [guide](https://has-a.tech/guide) explains each step.");
  } else {
    lines.push("### ✅ Your request passed the automatic checks", "", "A maintainer will look at your site and review it soon.");
  }
  if (warnings.length) {
    lines.push("", "#### Things the reviewer will look at", "", ...warnings.map((w) => `- ${w}`));
  }
  const report = lines.join("\n");
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
  await postComment(report);
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error("Validator crashed:", e);
  process.exit(1);
});
