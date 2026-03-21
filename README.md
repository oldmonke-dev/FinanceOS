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
