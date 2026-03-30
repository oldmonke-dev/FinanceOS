# Finance.WebAPI User Manual

Finance.WebAPI is a bookkeeping and reporting application built around a split-based general ledger. It combines an ASP.NET Core API, PostgreSQL storage, and a Next.js SPA.

This manual is for day-to-day usage of the application. Developer setup and infrastructure notes remain in [README.md](./README.md) and `dev.readme.md`.

## What The App Does

The application helps you:

- manage a hierarchical chart of accounts
- record balanced double-entry transactions
- inspect account-specific ledger activity
- search and bulk-review transactions
- import statement-like data and map rows into ledger postings
- manage import sessions and review posting matches
- view reporting visuals such as expense mix, monthly trend, and account flow
- manage user preferences such as number grouping and financial-year mode

## Accounting Model

The application uses a double-entry structure.

- A transaction contains multiple splits.
- Each split belongs to one account.
- Splits are stored with:
  - `amount`
  - `side` as `Debit` or `Credit`
  - `memo`
- A transaction is valid only when total debits equal total credits.

Natural balance rules used for balances:

- `Asset`, `Expense`: `balance += debit - credit`
- `Liability`, `Equity`, `Income`: `balance += credit - debit`

Display behavior in the UI:

- `Income` is shown as positive for viewing/reporting.
- `Liability` and `Equity` are shown as negative in balance-style displays.
- Split rows still show `Dr` and `Cr` directly.

This keeps internal journal logic correct while making balances easier to read.

## Main Navigation

The app shell exposes these areas:

- `Overview`
- `Account Tree`
- `Transactions`
- `Advanced Filter`
- `Reports`
- `Importer`
- `Import Sessions`
- `Strategies`
- `Settings`

`Budgets` and `Investments` appear as placeholders and are not active yet.

## Core Features

### Account Tree

The account tree is the main chart-of-accounts view.

You can:

- browse top-level and nested accounts
- view rolled-up balances
- create subaccounts
- rename accounts
- edit opening balances
- delete accounts
- open an account ledger directly

Accounts support:

- account type
- account number
- description
- owner/admin metadata

### Transactions

The Transactions page is for quick manual transaction entry.

You can:

- choose transaction date
- add description and reference number
- enter split lines
- select `Dr` or `Cr`
- add memos
- keep a two-split mirrored mode for fast balanced entry

The page validates balance before submission.

### Account Ledger

The ledger page is account-specific and shows transactions filtered to a selected account.

You can:

- view opening balance and current balance
- inspect counterpart accounts
- edit description, reference, memo, split account, side, and amount
- expand a transaction to view all splits
- save ledger edits as a draft workflow
- undo and redo draft changes
- paginate large ledgers

This is the best place to review how one account is affected over time.

### Advanced Filter

The advanced transactions page is a bulk-review and search workspace.

You can:

- filter by accounts
- filter by description text
- filter by memo text
- filter by date range
- filter by import-session status
- sort by date, description, split count, debit total, and credit total
- edit transactions inline
- delete selected entries
- review `Dr` and `Cr` columns side by side

This page is meant for large-volume review and correction work.

### Reports

The Reports page provides visual reporting.

Current report blocks include:

- `Expense Mix`
  - top expense accounts in the selected scope
- `Monthly Trend`
  - income and expense totals by month
  - supports custom range, financial year, and assessment year filtering
- `Account Flow`
  - sankey-style source-to-destination account flow

Reporting behavior:

- charts generally use presentation-friendly values
- sankey labels and tooltips use compact units
  - Indian grouping: lakhs and crores
  - International grouping: millions and billions

### Importer

The importer helps bring in ledger-ready data from files.

Current capabilities include:

- CSV-style import mapping
- source-account selection
- split-session creation
- statement-style row preparation
- experimental PDF ingestion support in the wider codebase

The importer is designed to prepare rows before they become posted ledger transactions.

### Import Sessions

Import Sessions are the review and posting workflow around imported rows.

You can:

- inspect imported rows
- review destination account suggestions
- compare candidate matches against ledger transactions
- see active vs archived import sessions
- track which rows posted into the ledger

This helps avoid duplicate posting and improves correction workflows.

### Strategies

The Strategies area supports mapping and automation logic used by imports.

The repo also includes Bayesian/statistical mapping logic for destination suggestion and training.

### Settings

Settings include user preferences such as:

- number grouping style
  - `indian`
  - `international`
- financial year mode
  - `indian`
  - `american`
  - `custom`

These preferences affect number formatting and reporting behavior.

## Number Formatting

The application supports two number-grouping styles:

- `Indian`
  - examples: `1,23,456`
  - compact style uses lakhs and crores
- `International`
  - examples: `123,456`
  - compact style uses millions and billions

This affects:

- general numeric formatting
- reports
- sankey flow formatting

## Permissions And Multi-User Behavior

The application supports account-level access control.

Core concepts:

- `Primary owner`
  - the main responsible user for an account
- `Explicit access`
  - per-user permissions granted on an account
- `Globally shared`
  - the account is visible and operationally accessible to all users
- `Core account`
  - protected system account such as `Assets`, `Liability`, `Equity`, `Income`, or `Expenses`
- `Reporting mode`
  - controls whether an account appears in reports
- shared Bayesian learning
  - import-mapping learning is common across the app, then filtered by accessible accounts

Current permissions matrix:

| Actor / Account State | Tree | Ledger | Post | Edit | Delete | Manage | Reports | Bayesian |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- | :--- |
| Owner | Yes | Yes | Yes | Yes | Yes | Yes | Yes if `Included` | Yes, shared pool |
| Explicit access: `CanView` only | Yes | Yes | No | No | No | No | Yes if `Included` | Limited by accessible accounts |
| Explicit access: `CanPost` | Yes | Yes | Yes | No | No | No | Yes if `Included` | Yes, shared pool |
| Explicit access: `CanEditTransaction` | Yes | Yes | No | Yes, if all transaction accounts are editable | No | No | Yes if `Included` | Shared pool |
| Explicit access: `CanDeleteTransaction` | Yes | Yes | No | No | Yes, if all transaction accounts are deletable | No | Yes if `Included` | Shared pool |
| Explicit access: `CanManageAccess` | Yes | Yes | No, unless also granted | No, unless also granted | No, unless also granted | Yes | Yes if `Included` | No extra Bayesian privilege |
| Globally shared user | Yes | Yes | Yes | Yes | Yes | No | Yes if `Included` | Yes, shared pool |
| Admin on normal account | Yes | Yes | Yes | Yes | Yes | Yes | Yes if `Included` | Yes, shared pool |
| Admin on core account | Yes | Yes | Yes | Yes | Yes | Restricted | Yes if `Included` | Yes, shared pool |
| Ancestor shell only | Yes | No | No | No | No | No | Context-dependent | No direct use |

Reporting mode behavior:

| Reporting Mode | Tree | Ledger | Transactions | Reports | Bayesian |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `Included` | Yes | Yes | Yes | Yes | Yes, if accessible |
| `OperationalOnly` | Yes | Yes | Yes | No | Yes, if accessible |
| `Excluded` | Yes | Yes | Yes | No | Yes, if accessible |

Important notes:

- seeing an account in the tree does not always mean the ledger is openable
  - ancestor accounts can be shown to preserve hierarchy
- seeing a transaction does not always mean it can be edited
  - edit and delete require permission on every account touched by that transaction
- `Globally shared` currently means operational access, not just visibility
- reports are account-driven
  - `OperationalOnly` and `Excluded` stay usable in workflows but are omitted from reporting
- Bayesian suggestions come from one shared learning pool
  - candidate destination accounts are still limited by the current user's accessible accounts

## Typical Workflows

### 1. Create Accounts

- open `Account Tree`
- create top-level or nested accounts
- assign account type
- optionally set account number and description
- set opening balance if needed

### 2. Add Transactions Manually

- open `Transactions`
- enter date, description, and optional reference
- select accounts for each split
- set `Dr` / `Cr`
- enter amounts
- submit a balanced transaction

### 3. Import Transactions Through Import Sessions

- use `Importer` to prepare rows from file data
- choose the source account and create an import session
- open `Import Sessions`
- review suggested destination mappings
- inspect candidate ledger matches before posting
- apply session suggestions and shared Bayesian learning
- correct rows where needed and post reviewed rows into transactions

Import sessions actively reuse prior confirmed learning and current-session mapping behavior to improve destination suggestions over time.

### 4. Review One Account

- open `Account Tree`
- click an account
- inspect the account ledger
- edit split details if needed
- save draft changes

### 5. Review Trends

- open `Reports`
- select date mode
- choose custom range or FY/AY
- filter by account and import-session state
- review expense mix, monthly trend, and account flow

## Current Known Product State

The application already covers a substantial bookkeeping workflow, but some areas are still evolving.

Examples:

- reporting logic is still being refined
- budgets and investments are placeholders
- PDF import flow is experimental
- RBAC and multi-user polish still need more testing

## To Do

- screenshots for each page
- import-session lifecycle documentation
- accounting examples with sample transactions
- troubleshooting guide for balancing and import mismatches
