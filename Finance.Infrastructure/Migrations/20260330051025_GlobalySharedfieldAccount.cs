using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Finance.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class GlobalySharedfieldAccount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsGloballyShared",
                table: "Accounts",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsGloballyShared",
                table: "Accounts");
        }
    }
}
