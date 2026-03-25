using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MultiUserPermissionAccessFirstMigration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OwnerUserId",
                table: "Accounts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Accounts_OwnerUserId",
                table: "Accounts",
                column: "OwnerUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Accounts_Users_OwnerUserId",
                table: "Accounts",
                column: "OwnerUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Accounts_Users_OwnerUserId",
                table: "Accounts");

            migrationBuilder.DropIndex(
                name: "IX_Accounts_OwnerUserId",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "OwnerUserId",
                table: "Accounts");
        }
    }
}
