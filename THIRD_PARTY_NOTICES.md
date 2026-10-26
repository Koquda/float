# Third-party notices

Float's MIT license applies to the project-authored code. Third-party software keeps its own license and copyright notices.

The repository includes these vendored resources:

| Resource | Copyright | License notice |
| --- | --- | --- |
| Sites Vite plugin | 2026 OpenAI | [MIT](scripts/vite/sites-vite-plugin.LICENSE) |
| shadcn Tailwind stylesheet 4.13.0 | 2023 shadcn | [MIT](vendor/shadcn-tailwind-4.13.0.LICENSE.md) |

The initial application uses the supplied Sites/Vinext starter, including its local development and connector adapters. Existing upstream notices remain in the source.

Dependencies installed through npm are separate packages. Their versions are recorded in `package-lock.json`; their license terms ship with the installed packages. The repository does not redistribute `node_modules`.
