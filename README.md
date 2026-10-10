# has-a.tech

**Get a free `yourname.has-a.tech` address for your website.**
Portfolios, blogs, projects, art, a page for your band: if it's yours and it's legit, it's welcome.

Free, open, and run in the open: every name is a small file in this repository.

---

## How to get your name

You need a GitHub account (at least 30 days old) and a website that's already online somewhere, such as GitHub Pages, Azure Static Web Apps, Vercel, Netlify, Cloudflare Pages, or your own server.

1. **Check the name is free:** look in the [`domains`](./domains) folder. If `yourname.json` isn't there, it's available.
2. **Fork** this repository (button at the top right).
3. In your fork, open the `domains` folder and click **Add file → Create new file**.
4. Name the file **`yourname.json`** (lowercase letters, numbers and hyphens only).
5. Paste in one of the examples below and fill it in.
6. **Commit**, then go to your fork's main page and click **Contribute → Open pull request**.
7. Fill in the checklist. An automatic check runs within a minute. If it shows ❌, open it to see what to fix.
8. A maintainer reviews your request. Once it's merged, your name works within a few minutes.

Each GitHub account can have **one** name (plus nested names under it, like `blog.yourname.has-a.tech`).

---

## The file format

```json
{
  "description": "What your site is, in a sentence.",
  "owner": {
    "username": "your-github-username",
    "email": "optional@example.com"
  },
  "records": {
    "CNAME": "your-site.example.com"
  },
  "proxied": false
}
```

| Field | Required | What it is |
|---|---|---|
| `description` | Yes | What the site is. 10–300 characters. |
| `owner.username` | Yes | Your GitHub username. Must match the account opening the pull request. |
| `owner.email` | No | A contact email. **This file is public**, so only add one you're happy to share. |
| `records` | Yes | Where your name should point. See below. |
| `proxied` | No | `true` routes traffic through Cloudflare's proxy. Leave it out (or `false`) if you're not sure. |

### Supported records

- **`CNAME`**: point to another hostname. A single string, no `https://`, no `/`. Can't be combined with other records.
- **`A`**: a list of IPv4 addresses, e.g. `["203.0.113.10"]`
- **`AAAA`**: a list of IPv6 addresses
- **`TXT`**: a string or list of strings, often used to verify ownership with a host

### Examples by host

**GitHub Pages**
```json
"records": { "CNAME": "your-github-username.github.io" }
```
Then add `yourname.has-a.tech` under your repo's **Settings → Pages → Custom domain**.

**Azure Static Web Apps**
```json
"records": { "CNAME": "your-app-name.azurestaticapps.net" }
```
After it's merged, add it in Azure: **Custom domains → Add → Custom domain on other DNS**.

**Vercel**
```json
"records": { "CNAME": "cname.vercel-dns.com" }
```

**Cloudflare Pages**
```json
"records": { "CNAME": "your-project.pages.dev" }
```

**Your own server**
```json
"records": { "A": ["203.0.113.10"] }
```

**A verification record for your host** goes in a nested file, e.g. `domains/_vercel.yourname.json`:
```json
{
  "description": "Vercel verification for yourname.has-a.tech",
  "owner": { "username": "your-github-username" },
  "records": { "TXT": "vc-domain-verify=..." }
}
```

> **HTTPS:** your host provides the HTTPS certificate. GitHub Pages, Azure, Vercel, Netlify and Cloudflare Pages all do this automatically once the name points at them.

---

## Changing or removing your name

Open a pull request that edits or deletes your file. You can only change names you own.

## Rules

Please read the [Terms of Service](./TERMS_OF_SERVICE.md). In short: no phishing, malware, scams, impersonation, illegal content, or harassment. Names that break the rules are removed without warning. Names that look like logins or well-known brands are blocked automatically.

## Report abuse

Seen a `has-a.tech` name being misused? [Open an abuse report](https://github.com/has-a-tech/register/issues/new?template=report-abuse.yml) or email **abuse@has-a.tech**. Use email for anything that shouldn't be public.

---

_has-a.tech is a free community project. It's provided as-is, with no guarantee of uptime._
