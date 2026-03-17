# Real Agent Executor

The worker service uses `RealAgentExecutor` to run actual agent packages
instead of stubs. Supported agents:

- **accessibility** — axe-core WCAG 2.1 AA scanning via Playwright
- **performance** — Core Web Vitals via Chrome DevTools Protocol
- **security** — HTTP headers, TLS, XSS, SQLi checks
- **api** — endpoint discovery and testing
- **ui-functional** — Playwright browser automation
- **explorer** — Playwright site crawling

Agents that are still stubbed: spec-reader, data-generator, cross-browser, load.
