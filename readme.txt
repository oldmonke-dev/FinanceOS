1️⃣ Update Ubuntu packages

Open your WSL Ubuntu terminal.

sudo apt update
sudo apt upgrade
2️⃣ Install PostgreSQL
sudo apt install postgresql postgresql-contrib

This installs:

PostgreSQL server

CLI tools (psql)

useful extensions

3️⃣ Start PostgreSQL

WSL does not always auto-start services, so run:

sudo service postgresql start

Check status:

sudo service postgresql status
4️⃣ Switch to postgres user

Postgres creates a default Linux user called postgres.

sudo -i -u postgres

Open the database shell:

psql

You should see:

postgres=#
5️⃣ Create your database

For your finance app:

CREATE DATABASE finance_db;

List databases:

\l

Exit:

\q
6️⃣ Create a user (recommended)

Instead of using the postgres superuser.

psql

Then run:

CREATE USER finance_user WITH PASSWORD 'strongpassword';
ALTER ROLE finance_user SET client_encoding TO 'utf8';
ALTER ROLE finance_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE finance_user SET timezone TO 'UTC';

GRANT ALL PRIVILEGES ON DATABASE finance_db TO finance_user;
7️⃣ Connection string for your .NET app

In appsettings.json:

{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=finance_db;Username=finance_user;Password=strongpassword"
  }
}

Since WSL exposes localhost to Windows, your .NET app on Windows can connect to it.

8️⃣ Test connection

From Ubuntu:

psql -U finance_user -d finance_db -h localhost
9️⃣ Verify Postgres port
sudo ss -tulnp | grep 5432

Expected:

LISTEN 0 128 127.0.0.1:5432
🔟 Run EF migrations

Once the DB exists:

dotnet ef database update

This will create your tables (Accounts, Transactions, etc).

🔧 Optional but very useful tools

Install:

sudo apt install pgadmin4

or on Windows install:

DBeaver

pgAdmin

TablePlus

These let you visually inspect tables.