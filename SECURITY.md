# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** using GitHub's
[security advisory](https://github.com/Kurisa-kuku/MINEWORLD-Datasets-site/security/advisories/new)
feature. Do not open a public issue for a live vulnerability or a privacy incident.

Include:

- the affected page or workflow;
- reproduction steps;
- impact (for example token exposure, stored XSS, malicious issue content);
- any suggested fix.

We aim to acknowledge reports within a few days. This is a volunteer project, so please allow reasonable time for a fix.

## Known design boundaries

- **No auth backend.** GitHub browser tokens are stored in `sessionStorage` and, after login, sent only to `api.github.com`. Device flow optionally uses the secretless proxy in `workers/oauth-proxy` for GitHub's OAuth handshake; it must never log request or response bodies. A compromised browser extension or XSS can read tokens, as with any static GitHub client. Do not sign in with an organisation-wide admin token.
- **Public issue content is untrusted.** Automation parses it as data, never executes it. Admin rendering uses `textContent`, not HTML injection.
- **External covers.** The automation only downloads covers from an allowlist of GitHub-hosted image hosts and enforces size and image decoding limits before using sharp.
- **Workflow permissions.** `issue-to-pr` has write access to contents and pull requests. Pull requests still require a human merge; branch protection is recommended on `main`.
- **Third-party scripts.** Giscus loads code from `giscus.app`, and the GitHub avatar endpoints are embedded as images. Review your privacy posture before enabling them.

## Secrets

Never put a token, OAuth client secret or signing key in a `PUBLIC_*` variable. The GitHub Pages build only needs public values. If a secret is accidentally committed, revoke it immediately and rewrite the history.
