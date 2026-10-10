# Maintainer guide

How has-a.tech runs, and how to look after it.

## How it works

```
Pull request ──► Validate workflow ──► Maintainer review ──► Merge ──► Deploy workflow ──► Cloudflare DNS
(domains/*.json)   (scripts/check-pr.js)                               (DNSControl)
```

- **`domains/`**: one JSON file per name. This folder is the single source of truth.
- **`.github/workflows/validate.yml`**: checks every pull request. It runs the scripts from `main` and reads the pull request's files only as data, so a pull request can't change the rules it's checked against.
- **`.github/workflows/deploy.yml`**: on every merge, validates all files again, then DNSControl makes Cloudflare match `domains/` exactly.
- **`dnsconfig.js`**: turns the JSON files into DNS records. It never touches `@` and `www` (the website), `send` (outgoing email), `_dmarc` or `*._domainkey`.
- **Student verification** lives in [has-a-tech/website](https://github.com/has-a-tech/website). For each new name, the bot asks `https://has-a.tech/api/status/<username>` whether the author is a verified student, using the `VERIFY_API_KEY` secret.
- **Site check:** after the rules pass, the bot loads the target website and lists warning signs for you (offline, empty, password fields, scam phrases). These are hints, not verdicts.
- **`util/`**: the settings (`config.json`), reserved names, and blocked phishing words.

## One-time setup

1. **Push this repository** to `github.com/has-a-tech/register`.
2. **Add the Cloudflare token:** repo **Settings → Secrets and variables → Actions → New repository secret**. Name: `CLOUDFLARE_API_TOKEN`. Value: the token you created (Edit zone DNS, has-a.tech only).
3. **Protect `main`:** **Settings → Branches → Add branch ruleset** (or classic rule) for `main`:
   - Require a pull request before merging, with **1 approval**
   - Require review from Code Owners
   - Require status checks to pass: **validate**
   - Block force pushes
4. **Actions permissions:** **Settings → Actions → General**: allow GitHub Actions to run.
5. **Run the first deploy:** **Actions → Deploy DNS → Run workflow**. Check the "Preview changes" step to see what it created.
6. **Website and verification:** set up [has-a-tech/website](https://github.com/has-a-tech/website) by following its `SETUP.md`. It serves `has-a.tech` and `www`, which the automation leaves alone.
7. **Connect verification:** add a repository secret `VERIFY_API_KEY` with the same value as the website's `STATUS_API_KEY`. Without it, every new request fails with "Couldn't check student verification".

## Reviewing a pull request

The automatic check covers the format, ownership, student verification, account age, limits and blocked words. You check what a robot can't:

- [ ] Read the bot's comment, especially "Things the reviewer will look at".
- [ ] Open the target website. Is it real, online, and not a placeholder?
- [ ] Is it appropriate for a service used by teenagers?
- [ ] Does it match the description?
- [ ] Is it anything from the banned list in the Terms (phishing, impersonation, scams, etc.)?
- [ ] Does the name itself look like an attempt to impersonate someone or something?
- [ ] The pull request changes **only** files in `domains/`.

If in doubt, ask questions in the pull request or don't merge.

**Never** add a step to `validate.yml` that runs code or installs packages from the pull request. That workflow runs with access to the repository, so running untrusted code there would be dangerous.

## Handling abuse

1. **Remove the file** from `domains/` (open and merge a quick pull request, or commit directly as an admin). The deploy workflow deletes the DNS record within minutes.
2. Deleting the record only in the Cloudflare dashboard isn't enough: the next deploy would put it back.
3. For serious abuse (phishing, malware), block the user from the organization: **Org settings → Moderation → Blocked users**.
4. Reply to the reporter, and close the issue.

## Changing the rules

- Limits (names per user, minimum account age, name length): `util/config.json`
- Reserved names: `util/reserved.json`
- Phishing words: `util/blocked-words.json`
- Test locally before pushing: `node scripts/validate.js`

## Later

- **Public Suffix List:** once you have real users, apply at <https://github.com/publicsuffix/list>. This isolates each user's site (cookies, HTTPS rate limits) from the others.
- **Cloudflare Project Alexandria:** apply for sponsorship once the project is established.
- **More maintainers:** invite trusted reviewers to the organization and add them to `.github/CODEOWNERS`.
- **DNSControl updates:** bump the `version` in `deploy.yml` now and then.
