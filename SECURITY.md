# Security policy

Float is an early-stage project. Use the latest code on `main`; older revisions do not receive separate security updates.

Report suspected vulnerabilities through GitHub's private vulnerability reporting on this repository. Open the Security tab, choose Advisories, and select Report a vulnerability. Do not put credentials, financial data, exploit details, or active webhook URLs in a public issue.

Include the affected revision, reproduction steps with synthetic data, and the expected and observed behavior.

The public repository contains source code and sample data. Production credentials belong in runtime secrets. Production identity headers require a trusted authentication gateway. Scheduled imports remain disabled until explicitly configured.
