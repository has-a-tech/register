"use strict";

// Shared validation rules for has-a.tech domain files.
// Plain Node.js, no dependencies, so it is easy to audit.

const fs = require("fs");
const path = require("path");
const net = require("net");

const ROOT = path.join(__dirname, "..");
const DOMAINS_DIR = path.join(ROOT, "domains");
const config = require("../util/config.json");
const reserved = new Set(require("../util/reserved.json"));
const blocked = require("../util/blocked-words.json");

const ALLOWED_KEYS = ["description", "owner", "records", "proxied"];
const OWNER_KEYS = ["username"];
const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT"];

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const UNDERSCORE_LABEL_RE = /^_[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const GITHUB_USER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const HOSTNAME_RE = /^(?=.{1,253}$)(?:(?!-)[a-z0-9_-]{1,63}(?<!-)\.)+[a-z][a-z0-9-]{0,62}$/i;

// ---------- helpers ----------

function topLabel(name) {
  const parts = name.split(".");
  return parts[parts.length - 1];
}

function sameUser(a, b) {
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}

function isPublicIPv4(ip) {
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast and reserved
  return true;
}

function isPublicIPv6(ip) {
  if (!net.isIPv6(ip)) return false;
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return false;
  if (/^fe[89ab]/.test(v)) return false; // link-local
  if (/^f[cd]/.test(v)) return false; // unique local
  if (v.startsWith("ff")) return false; // multicast
  if (v.startsWith("::ffff:")) return false; // IPv4-mapped
  if (v.startsWith("2001:db8")) return false; // documentation
  return true;
}

// ---------- single-file checks ----------

function validateName(name) {
  const errors = [];
  if (name !== name.toLowerCase()) errors.push("The file name must be all lowercase.");
  const labels = name.split(".");
  labels.forEach((label, i) => {
    const isTop = i === labels.length - 1;
    if (label.length === 0) {
      errors.push("The file name has an empty part (two dots in a row, or a leading dot).");
    } else if (label.length > 63) {
      errors.push(`"${label}" is longer than 63 characters.`);
    } else if (!LABEL_RE.test(label) && !(!isTop && UNDERSCORE_LABEL_RE.test(label))) {
      errors.push(
        `"${label}" can only use a-z, 0-9 and hyphens, and can't start or end with a hyphen` +
          (isTop ? "." : " (a leading underscore is allowed here, e.g. _vercel).")
      );
    }
  });
  const top = topLabel(name);
  if (top.length < config.minNameLength) {
    errors.push(`Names must be at least ${config.minNameLength} characters long.`);
  }
  if (reserved.has(top)) errors.push(`"${top}" is a reserved name.`);
  if ((name + "." + config.domain).length > 253) errors.push("The full name is too long.");

  for (const label of labels) {
    const plain = label.replace(/^_/, "");
    for (const s of blocked.substrings) {
      if (plain.includes(s)) errors.push(`"${label}" contains "${s}", which isn't allowed (phishing risk).`);
    }
    for (const part of plain.split("-")) {
      if (blocked.words.includes(part)) {
        errors.push(`"${label}" contains the word "${part}", which isn't allowed (phishing risk).`);
      }
    }
  }
  return errors;
}

function validateData(name, data) {
  const errors = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["The file must contain a single JSON object { ... }."];
  }
  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS.includes(key)) errors.push(`Unknown field "${key}". Allowed: ${ALLOWED_KEYS.join(", ")}.`);
  }

  // description
  const d = data.description;
  if (typeof d !== "string" || d.trim().length < config.descriptionMinLength) {
    errors.push(`"description" is required: tell us what the site is (at least ${config.descriptionMinLength} characters).`);
  } else if (d.length > config.descriptionMaxLength) {
    errors.push(`"description" must be at most ${config.descriptionMaxLength} characters.`);
  }

  // owner
  const o = data.owner;
  if (typeof o !== "object" || o === null || Array.isArray(o)) {
    errors.push('"owner" is required, e.g. { "username": "your-github-username" }.');
  } else {
    for (const key of Object.keys(o)) {
      if (key === "email") {
        errors.push('Remove "owner.email": this file is public. Your school email is checked privately at https://has-a.tech/verify instead.');
      } else if (!OWNER_KEYS.includes(key)) {
        errors.push(`Unknown field "owner.${key}". Allowed: ${OWNER_KEYS.join(", ")}.`);
      }
    }
    if (typeof o.username !== "string" || !GITHUB_USER_RE.test(o.username)) {
      errors.push('"owner.username" must be your GitHub username.');
    }
  }

  // records
  const r = data.records;
  if (typeof r !== "object" || r === null || Array.isArray(r) || Object.keys(r).length === 0) {
    errors.push('"records" is required and needs at least one record, e.g. { "CNAME": "example.github.io" }.');
    return errors;
  }
  const types = Object.keys(r);
  for (const t of types) {
    if (!RECORD_TYPES.includes(t)) errors.push(`Record type "${t}" isn't supported. Allowed: ${RECORD_TYPES.join(", ")}.`);
  }

  if ("CNAME" in r) {
    if (types.length > 1) errors.push("A CNAME record can't be combined with other record types on the same name.");
    const c = r.CNAME;
    if (typeof c !== "string") {
      errors.push('"CNAME" must be a single hostname string.');
    } else {
      const host = c.replace(/\.$/, "");
      if (/^[a-z]+:\/\//i.test(c) || c.includes("/")) {
        errors.push('"CNAME" must be just a hostname, without https:// or any path.');
      } else if (net.isIP(host)) {
        errors.push('"CNAME" can\'t be an IP address. Use an "A" or "AAAA" record instead.');
      } else if (!HOSTNAME_RE.test(host)) {
        errors.push(`"CNAME" value "${c}" isn't a valid hostname.`);
      } else if (host.toLowerCase() === config.domain || host.toLowerCase().endsWith("." + config.domain)) {
        errors.push(`"CNAME" can't point to ${config.domain} itself.`);
      }
    }
  }

  for (const [t, check, label] of [
    ["A", isPublicIPv4, "public IPv4 address"],
    ["AAAA", isPublicIPv6, "public IPv6 address"],
  ]) {
    if (!(t in r)) continue;
    const v = r[t];
    if (!Array.isArray(v) || v.length === 0 || v.length > 10) {
      errors.push(`"${t}" must be a list of 1 to 10 addresses, e.g. ["203.0.113.10"].`);
      continue;
    }
    if (new Set(v).size !== v.length) errors.push(`"${t}" has duplicate addresses.`);
    for (const ip of v) {
      if (typeof ip !== "string" || !check(ip)) errors.push(`"${ip}" in "${t}" isn't a valid ${label}.`);
    }
  }

  if ("TXT" in r) {
    const v = typeof r.TXT === "string" ? [r.TXT] : r.TXT;
    if (!Array.isArray(v) || v.length === 0 || v.length > 10) {
      errors.push('"TXT" must be a string or a list of 1 to 10 strings.');
    } else {
      for (const s of v) {
        if (typeof s !== "string" || s.length === 0 || s.length > 255) {
          errors.push("Each TXT value must be a string of 1 to 255 characters.");
        }
      }
    }
  }

  // proxied
  if (data.proxied !== undefined) {
    if (typeof data.proxied !== "boolean") {
      errors.push('"proxied" must be true or false (without quotes).');
    } else if (data.proxied && !types.some((t) => ["A", "AAAA", "CNAME"].includes(t))) {
      errors.push('"proxied" only works with A, AAAA or CNAME records.');
    } else if (data.proxied && name.split(".").some((l) => l.startsWith("_"))) {
      errors.push('"proxied" can\'t be used on names with an underscore part.');
    }
  }
  return errors;
}

// ---------- multi-file checks ----------

// domains: Map<name, { data, parseError }>
function validateSet(domains, onlyNames) {
  const problems = []; // { name, message }
  const names = onlyNames ? [...onlyNames] : [...domains.keys()];
  for (const name of names) {
    const entry = domains.get(name);
    if (!entry) continue;
    if (entry.parseError) {
      problems.push({ name, message: entry.parseError });
      continue;
    }
    for (const m of validateName(name)) problems.push({ name, message: m });
    for (const m of validateData(name, entry.data)) problems.push({ name, message: m });

    // Nested names (blog.bharat, _vercel.bharat) need the top-level name to exist with the same owner.
    if (name.includes(".")) {
      const top = topLabel(name);
      const parent = domains.get(top);
      if (!parent || parent.parseError) {
        problems.push({ name, message: `To register "${name}", you must first own "${top}" (domains/${top}.json).` });
      } else if (!sameUser(parent.data?.owner?.username, entry.data?.owner?.username)) {
        problems.push({ name, message: `"${name}" must have the same owner as "${top}".` });
      }
    }
  }
  return problems;
}

function parseDomainFile(text) {
  try {
    return { data: JSON.parse(text) };
  } catch (e) {
    return { parseError: `This file isn't valid JSON: ${e.message}` };
  }
}

function loadDomainsFromDir(dir = DOMAINS_DIR) {
  const domains = new Map();
  const problems = [];
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(".")) continue;
    if (!file.endsWith(".json")) {
      problems.push({ file: `domains/${file}`, message: "Only .json files are allowed in domains/." });
      continue;
    }
    const full = path.join(dir, file);
    if (fs.statSync(full).size > config.maxFileBytes) {
      problems.push({ file: `domains/${file}`, message: "This file is too large." });
      continue;
    }
    domains.set(file.slice(0, -5), parseDomainFile(fs.readFileSync(full, "utf8")));
  }
  return { domains, problems };
}

function countTopLevelOwned(domains, username) {
  let n = 0;
  for (const [name, entry] of domains) {
    if (!name.includes(".") && sameUser(entry.data?.owner?.username, username)) n++;
  }
  return n;
}

module.exports = {
  config,
  DOMAINS_DIR,
  validateName,
  validateData,
  validateSet,
  parseDomainFile,
  loadDomainsFromDir,
  countTopLevelOwned,
  sameUser,
  topLabel,
};
