# has-a.tech

**Free `yourname.has-a.tech` web addresses for students.**
For high school, college and university students aged 13 and up: portfolios, blogs, projects, art, clubs.

👉 **New here? Follow the step-by-step guide at [has-a.tech/guide](https://has-a.tech/guide).** It covers building a free site on GitHub Pages, too.

---

## The short version

1. **Have a website online,** for example on GitHub Pages (free).
2. **Verify you're a student** at [has-a.tech/verify](https://has-a.tech/verify). You sign in with GitHub and confirm your school email with a code. Your email stays private.
3. **Claim your name** with the [claim helper](https://has-a.tech/claim), which prepares your request here on GitHub. Or do it by hand:
   - Fork this repository.
   - Add `domains/yourname.json` (format below).
   - Open a pull request and fill in the checklist.
4. **The bot checks your request** within a minute and comments with the result. A maintainer then reviews your site and merges it.
5. **Add `yourname.has-a.tech` as a custom domain** in your host's settings. Your address works within minutes.

Requirements: a GitHub account at least 30 days old, verified as a student. One name per person (nested names like `blog.yourname` are fine).

---

## The file format

```json
{
  "description": "My portfolio: robotics and drawing projects.",
  "owner": {
    "username": "your-github-username"
  },
  "records": {
    "CNAME": "your-github-username.github.io"
  }
}
```

| Field | Required | What it is |
|---|---|---|
| `description` | Yes | What your site is. 10–300 characters. |
| `owner.username` | Yes | Your GitHub username. Must be the account opening the pull request. |
| `records` | Yes | Where your address points. See below. |
| `proxied` | No | `true` sends traffic through Cloudflare's proxy. Leave it out if you're not sure. |

**Don't add your email address.** This file is public. Student verification happens privately on [has-a.tech/verify](https://has-a.tech/verify).

### Records

- **`CNAME`**: another hostname, as a single string with no `https://` or `/`. Can't be combined with other records.
- **`A`**: a list of public IPv4 addresses, e.g. `["203.0.113.10"]`
- **`AAAA`**: a list of public IPv6 addresses
- **`TXT`**: a string or list of strings, usually for verifying with your host

### Values for common hosts

| Host | Record |
|---|---|
| GitHub Pages | `"CNAME": "your-github-username.github.io"` |
| Azure Static Web Apps | `"CNAME": "your-app.azurestaticapps.net"` |
| Vercel | `"CNAME": "cname.vercel-dns.com"` |
| Netlify | `"CNAME": "your-site.netlify.app"` |
| Cloudflare Pages | `"CNAME": "your-project.pages.dev"` |
| Your own server | `"A": ["your.public.ip.address"]` |

For a host's TXT verification record, add a nested file such as `domains/_vercel.yourname.json` with `"records": { "TXT": "..." }`.

---

## Changing or removing your name

Open a pull request that edits or deletes your file. You can only change names you own.

## Rules

Read the [Terms of Service](./TERMS_OF_SERVICE.md). In short: no phishing, scams, malware, impersonation, harassment or illegal content. Names that look like login pages or well-known brands are blocked automatically, and every request is reviewed by a person.

## Report abuse

See a `has-a.tech` address being misused? Email **abuse@has-a.tech**, or [open an abuse report](https://github.com/has-a-tech/register/issues/new?template=report-abuse.yml). Use email for anything that shouldn't be public.

---

_has-a.tech is a free community project, provided as-is. The website and verification service live in [has-a-tech/website](https://github.com/has-a-tech/website). Maintainers: see [MAINTAINING.md](./MAINTAINING.md)._
