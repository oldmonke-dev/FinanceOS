using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddedLedgerSequenceToTransactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LedgerSequence",
                table: "Transactions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(
                """
                WITH ranked_transactions AS (
                    SELECT
                        "Id",
                        ROW_NUMBER() OVER (
                            PARTITION BY DATE("TransactionDate")
                            ORDER BY "CreatedAt" DESC, "Id" DESC
                        ) AS "LedgerSequence"
                    FROM "Transactions"
                )
                UPDATE "Transactions" AS t
                SET "LedgerSequence" = ranked_transactions."LedgerSequence"
                FROM ranked_transactions
                WHERE t."Id" = ranked_transactions."Id";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LedgerSequence",
                table: "Transactions");
        }
    }
}
