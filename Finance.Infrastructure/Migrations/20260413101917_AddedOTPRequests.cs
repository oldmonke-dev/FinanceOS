using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddedOTPRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OtpDeviceRegistrations",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OtpDeviceRegistrations", x => x.UserId);
                });

            migrationBuilder.CreateTable(
                name: "OtpRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastForwardedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OtpRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OtpRequests_Users_TargetUserId",
                        column: x => x.TargetUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OtpForwardedMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OtpRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderMasked = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SenderEncrypted = table.Column<string>(type: "text", nullable: false),
                    MessagePreview = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    MessageEncrypted = table.Column<string>(type: "text", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OtpForwardedMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OtpForwardedMessages_OtpRequests_OtpRequestId",
                        column: x => x.OtpRequestId,
                        principalTable: "OtpRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OtpForwardedMessages_OtpRequestId_ReceivedAt",
                table: "OtpForwardedMessages",
                columns: new[] { "OtpRequestId", "ReceivedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OtpRequests_TargetUserId_ExpiresAt",
                table: "OtpRequests",
                columns: new[] { "TargetUserId", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OtpRequests_UserId_ExpiresAt",
                table: "OtpRequests",
                columns: new[] { "UserId", "ExpiresAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OtpDeviceRegistrations");

            migrationBuilder.DropTable(
                name: "OtpForwardedMessages");

            migrationBuilder.DropTable(
                name: "OtpRequests");
        }
    }
}
