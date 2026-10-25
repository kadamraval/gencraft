# Security

## Reporting a problem
Please report a vulnerability privately to the owner (kd@kadamraval.com) instead of opening a public issue. Include what you found, how to reproduce it, and which version.

## How the project protects itself
- API keys stay on the person's device and are never put in backups or the model database.
- The model database, content packs and app updates are signed; the app ignores anything with a wrong signature.
- Signing keys are never committed (`.license/` is git-ignored); copies live in GitHub secrets.
- Every push is scanned for secrets, dependencies are audited weekly, and security updates open pull requests automatically.
- Workflow tokens are read-only by default.
- `main` changes only through the release flow; local hooks, tool permissions and a monitoring workflow enforce it because a free private repository cannot lock a branch.
