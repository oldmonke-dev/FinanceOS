using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddedAccountPermissionsPage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ReportingMode",
                table: "Accounts",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "Included");

            migrationBuilder.CreateTable(
                name: "AccountAccesses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CanView = table.Column<bool>(type: "boolean", nullable: false),
                    CanPost = table.Column<bool>(type: "boolean", nullable: false),
                    CanEditTransaction = table.Column<bool>(type: "boolean", nullable: false),
                    CanDeleteTransaction = table.Column<bool>(type: "boolean", nullable: false),
                    CanManageAccess = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccountAccesses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AccountAccesses_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AccountAccesses_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccountAccesses_AccountId_UserId",
                table: "AccountAccesses",
                columns: new[] { "AccountId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AccountAccesses_UserId",
                table: "AccountAccesses",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AccountAccesses");

            migrationBuilder.DropColumn(
                name: "ReportingMode",
                table: "Accounts");
        }
    }
}
