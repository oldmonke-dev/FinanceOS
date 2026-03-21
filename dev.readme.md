# Developer Setup

## Prerequisites

- .NET SDK
- Node.js and npm
- PostgreSQL

## PostgreSQL Setup on Ubuntu / WSL

Update packages:

```bash
sudo apt update
sudo apt upgrade
```

Install PostgreSQL:

```bash
sudo apt install postgresql postgresql-contrib
```

Start PostgreSQL:

```bash
sudo service postgresql start
sudo service postgresql status
```

Switch to the `postgres` user and open `psql`:

```bash
sudo -i -u postgres
psql
```

## Create the Database

Inside `psql`, run:

```sql
CREATE DATABASE finance_db;
\l
```

Exit `psql`:

```sql
\q
```

## Create an App User

Open `psql` again and run:

```sql
CREATE USER finance_user WITH PASSWORD 'strongpassword';
ALTER ROLE finance_user SET client_encoding TO 'utf8';
ALTER ROLE finance_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE finance_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE finance_db TO finance_user;
```

## Connection String

Update `Finance.WebAPI/appsettings.Development.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=finance_db;Username=finance_user;Password=strongpassword"
  }
}
```

Test the connection:

```bash
psql -U finance_user -d finance_db -h localhost
```

Verify PostgreSQL is listening on port `5432`:

```bash
sudo ss -tulnp | grep 5432
```

## Entity Framework Migrations

Apply the current migrations:

```bash
dotnet ef database update --project Finance.Infrastructure --startup-project Finance.WebAPI
```

Create a new migration:

```bash
dotnet ef migrations add Sample --project Finance.Infrastructure --startup-project Finance.WebAPI
```

After adding a migration, apply it with:

```bash
dotnet ef database update --project Finance.Infrastructure --startup-project Finance.WebAPI
```

## Running the Backend

From the repository root:

```bash
dotnet run --project Finance.WebAPI
```

## Running the SPA

From `Finance.WebAPI/finance-spa`:

```bash
npm install
npm run dev
```

The SPA reads its API base URL from:

- `Finance.WebAPI/finance-spa/.env.local`

Example:

```env
NEXT_PUBLIC_FINANCE_API_BASE_URL=http://localhost:5132
```
