# Contributing to Float

Use Node.js 22.13 or newer and follow the local setup in README.md.

Keep money in integer cents and dates in UTC calendar format. Put forecast rules in `lib/float`, validate API inputs at their boundaries, and preserve revision checks on ledger writes. Add regression tests for changed financial behavior.

Before opening a pull request, run:

```sh
npm test
npx tsc --noEmit
npm run build
```

For API changes, run the local preview and `npm run test:api` against the untouched sample ledger. This test changes local sample data and restores it afterward.

Describe the behavior your change affects and the checks you ran. Do not include financial records, credentials, webhook URLs, local databases, or environment files in commits or issue reports.

Contributions are distributed under this repository's MIT license.
