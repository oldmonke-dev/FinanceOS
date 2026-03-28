using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddedFinanceYeardPrefences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CustomFinancialYearStartDate",
                table: "UserPreferences",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FinancialYearMode",
                table: "UserPreferences",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "indian");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CustomFinancialYearStartDate",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "FinancialYearMode",
                table: "UserPreferences");
        }
    }
}
