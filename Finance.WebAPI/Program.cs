using Finance.BusinessLayer.Interfaces;
using Finance.BusinessLayer.Services;
using Finance.Domain.Entities.Core;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Finance.Infrastructure.Repositories;
using Finance.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
var enableHttpsRedirection = !builder.Environment.IsDevelopment();

// Add services to the container.

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddCors(options =>
{
    var configuredOrigins = builder.Configuration
        .GetSection("Cors:AllowedOrigins")
        .Get<string[]>()
        ?.Where(origin => !string.IsNullOrWhiteSpace(origin))
        .Select(origin => origin.Trim())
        .ToArray();

    var allowedOrigins = configuredOrigins is { Length: > 0 }
        ? configuredOrigins
        : new[]
        {
            "http://localhost:3000",
            "https://localhost:3000",
            "http://127.0.0.1:3000",
            "https://127.0.0.1:3000",
        };

    options.AddPolicy("Spa", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' was not found.");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));
builder.Services.AddScoped<AccountRepository>();
builder.Services.AddScoped<IAccountRepository>(serviceProvider => serviceProvider.GetRequiredService<AccountRepository>());
builder.Services.AddScoped<IAccountWorkflowService, AccountWorkflowService>();
builder.Services.AddScoped<IImportSessionRepository, ImportSessionRepository>();
builder.Services.AddScoped<IImportLearningRepository, ImportLearningRepository>();
builder.Services.AddScoped<IImportSessionService, ImportSessionService>();
builder.Services.AddScoped<IStrategyService, StrategyService>();
builder.Services.AddScoped<ITransactionRepository, TransactionRepository>();
builder.Services.AddScoped<ITransactionService, TransactionService>();
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    dbContext.Database.Migrate();
    EnsureRootUserSeeded(dbContext);
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

}

app.UseCors("Spa");

if (enableHttpsRedirection)
{
    app.UseHttpsRedirection();
}

app.UseAuthorization();

app.MapControllers();

app.Run();

static void EnsureRootUserSeeded(AppDbContext dbContext)
{
    var rootUserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const string rootEmail = "root@finance.local";

    if (dbContext.Users.Any(user => user.Id == rootUserId))
    {
        return;
    }

    var existingRootUser = dbContext.Users.FirstOrDefault(user => user.Email == rootEmail);
    if (existingRootUser is not null)
    {
        existingRootUser.Id = rootUserId;
        existingRootUser.DisplayName = "Root User";
        existingRootUser.IsActive = true;

        if (existingRootUser.CreatedAt == default)
        {
            existingRootUser.CreatedAt = new DateTime(2026, 3, 20, 0, 0, 0, DateTimeKind.Utc);
        }

        dbContext.SaveChanges();
        return;
    }

    dbContext.Users.Add(new User
    {
        Id = rootUserId,
        Email = rootEmail,
        DisplayName = "Root User",
        IsActive = true,
        CreatedAt = new DateTime(2026, 3, 20, 0, 0, 0, DateTimeKind.Utc),
        LastSeenAt = null,
    });

    dbContext.SaveChanges();
}
