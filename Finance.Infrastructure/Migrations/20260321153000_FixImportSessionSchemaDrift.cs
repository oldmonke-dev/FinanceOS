using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixImportSessionSchemaDrift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessions"
                ADD COLUMN IF NOT EXISTS "Label" character varying(100) NOT NULL DEFAULT 'user_imports';
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessions"
                ADD COLUMN IF NOT EXISTS "IsDeletable" boolean NOT NULL DEFAULT TRUE;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessions"
                ADD COLUMN IF NOT EXISTS "IsArchived" boolean NOT NULL DEFAULT FALSE;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessions"
                ADD COLUMN IF NOT EXISTS "Status" character varying(40) NOT NULL DEFAULT 'Active';
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessionRows"
                ADD COLUMN IF NOT EXISTS "MappingSource" character varying(40) NOT NULL DEFAULT 'none';
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessionRows"
                ADD COLUMN IF NOT EXISTS "AddedToLedgerAt" timestamp with time zone NULL;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessionRows"
                ADD COLUMN IF NOT EXISTS "PostedTransactionId" uuid NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessionRows"
                DROP COLUMN IF EXISTS "PostedTransactionId";
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessionRows"
                DROP COLUMN IF EXISTS "AddedToLedgerAt";
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessionRows"
                DROP COLUMN IF EXISTS "MappingSource";
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessions"
                DROP COLUMN IF EXISTS "Status";
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessions"
                DROP COLUMN IF EXISTS "IsArchived";
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessions"
                DROP COLUMN IF EXISTS "IsDeletable";
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "ImportSessions"
                DROP COLUMN IF EXISTS "Label";
                """);
        }
    }
}
