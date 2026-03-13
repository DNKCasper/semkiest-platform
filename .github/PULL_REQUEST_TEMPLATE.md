## Summary

<!-- Provide a concise description of the changes and the motivation behind them. -->

Resolves: <!-- e.g., SEM-123 -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Refactoring (no functional changes)
- [ ] Documentation update
- [ ] Dependency update
- [ ] Infrastructure / CI change

## Testing

- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] All new and existing unit tests pass locally (`pnpm turbo test`)
- [ ] Integration tests pass locally (`pnpm turbo test:integration`)
- [ ] I have tested edge cases and error conditions

## Type Safety

- [ ] No TypeScript errors (`pnpm turbo typecheck`)
- [ ] No `any` types introduced (use concrete types or generics)
- [ ] Strict null checks satisfied

## Code Quality

- [ ] ESLint passes with 0 errors and 0 warnings (`pnpm turbo lint`)
- [ ] No `console.log` statements in production code
- [ ] Unused imports removed
- [ ] Complex logic is commented

## Documentation

- [ ] JSDoc comments added for new public functions, components, and types
- [ ] README updated if a new package or major feature was added
- [ ] `.env.example` updated if new environment variables were introduced
- [ ] API endpoints documented (request/response examples) if applicable

## Database (if applicable)

- [ ] Prisma schema updated (`packages/database/prisma/schema.prisma`)
- [ ] Migration created (`prisma migrate dev --name <description>`)
- [ ] Migration tested (up and down)
- [ ] Seed data added for new tables if needed

## Build & Integration

- [ ] `pnpm turbo build` succeeds with no warnings
- [ ] No breaking changes to existing APIs
- [ ] Cross-package imports (`@sem/shared`, `@sem/database`, etc.) work correctly
- [ ] Turborepo task definitions updated if new build/test tasks were added

## Screenshots / Recordings (if applicable)

<!-- Add before/after screenshots or screen recordings for UI changes. -->
