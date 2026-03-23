# Finance.WebAPI

Finance bookkeeping application with:

- ASP.NET Core Web API
- Entity Framework Core with PostgreSQL
- Next.js SPA in `Finance.WebAPI/finance-spa`

## Project Structure

- `Finance.WebAPI`: API startup project
- `Finance.Infrastructure`: EF Core data access, repositories, migrations
- `Finance.BusinessLayer`: application services and DTOs
- `Finance.Domain`: entities and interfaces
- `Finance.WebAPI/finance-spa`: frontend SPA

## Developer Setup

See [dev.readme.md](./dev.readme.md) for:

- PostgreSQL setup
- database creation SQL
- connection string setup
- Entity Framework migration commands
- running the API and SPA locally

## Todo

### App Features

- Show balances inside Import Review.
- Reorder transactions within the same day to avoid misleading negative running balances.
- Add multi-currency support.
- Add more account metadata, including account number and description.
- Build an advanced ledger finder.
- Add a bulk changes page.
- Add RBAC, including a God Mode/admin path and per-user ledger boundaries.
- Add an email client flow for fetching monthly statements.
- Build a PDF-to-CSV tool for statement ingestion.
- Add SMS and OTP support.

### Infra Changes

- Optimize application performance.
- Add Redis where it provides real value.
- Replace UI choke points with loading skeletons.
- Introduce queues for long-running or bursty workflows where needed.
- Plan and execute major refactorings where the current structure is too coupled.
- Replace string-based matches and magic string workflows with enums or stronger typed models.
- Extract large components and services into smaller, focused modules.
- Make Next.js app router pages more modular and easier to reason about. test
