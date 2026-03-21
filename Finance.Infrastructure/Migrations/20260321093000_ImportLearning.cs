using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations
{
    public partial class ImportLearning : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MappingSource",
                table: "ImportSessionRows",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "none");

            migrationBuilder.CreateTable(
                name: "ImportLearningStats",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DestinationAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    FeatureKey = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportLearningStats", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ImportLearningStats_Accounts_DestinationAccountId",
                        column: x => x.DestinationAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ImportLearningStats_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ImportSessionLearningEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportSessionRowId = table.Column<Guid>(type: "uuid", nullable: false),
                    DestinationAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    FeatureKey = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportSessionLearningEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ImportSessionLearningEntries_Accounts_DestinationAccountId",
                        column: x => x.DestinationAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ImportSessionLearningEntries_ImportSessionRows_ImportSessionRowId",
                        column: x => x.ImportSessionRowId,
                        principalTable: "ImportSessionRows",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ImportSessionLearningEntries_ImportSessions_ImportSessionId",
                        column: x => x.ImportSessionId,
                        principalTable: "ImportSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportLearningStats_DestinationAccountId",
                table: "ImportLearningStats",
                column: "DestinationAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportLearningStats_UserId_DestinationAccountId_FeatureKey",
                table: "ImportLearningStats",
                columns: new[] { "UserId", "DestinationAccountId", "FeatureKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ImportSessionLearningEntries_DestinationAccountId",
                table: "ImportSessionLearningEntries",
                column: "DestinationAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportSessionLearningEntries_ImportSessionId_ImportSessionRowId_DestinationAccountId_FeatureKey",
                table: "ImportSessionLearningEntries",
                columns: new[] { "ImportSessionId", "ImportSessionRowId", "DestinationAccountId", "FeatureKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ImportSessionLearningEntries_ImportSessionRowId",
                table: "ImportSessionLearningEntries",
                column: "ImportSessionRowId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ImportLearningStats");

            migrationBuilder.DropTable(
                name: "ImportSessionLearningEntries");

            migrationBuilder.DropColumn(
                name: "MappingSource",
                table: "ImportSessionRows");
        }
    }
}
