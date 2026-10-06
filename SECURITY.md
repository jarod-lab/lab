# Security

Report vulnerabilities through GitHub's private vulnerability reporting ("Security" tab → "Report a
vulnerability") rather than a public issue. Include steps to reproduce and the affected version.

Secrets are scanned by gitleaks on every commit and in CI. Never commit `.env` files.
