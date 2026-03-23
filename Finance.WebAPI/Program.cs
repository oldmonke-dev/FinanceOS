using Finance.BusinessLayer.Interfaces;
using Finance.BusinessLayer.Services;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Finance.Infrastructure.Repositories;
using Finance.Infrastructure.Services;
using Finance.WebAPI.Configuration;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json.Serialization;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
var enableHttpsRedirection = !builder.Environment.IsDevelopment();
var authOptions = builder.Configuration.GetSection("Auth").Get<AuthOptions>()
    ?? throw new InvalidOperationException("Auth configuration is required.");

if (string.IsNullOrWhiteSpace(authOptions.JwtSecret))
{
    throw new InvalidOperationException("Auth:JwtSecret must be configured.");
}

builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection("Auth"));

// Add services to the container.

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(authOptions.JwtSecret));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = authOptions.Issuer,
            ValidAudience = authOptions.Audience,
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.FromMinutes(1),
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddCors(options =>
{
    var allowedOrigins = builder.Configuration
        .GetSection("Cors:AllowedOrigins")
        .Get<string[]>()
        ?.Where(origin => !string.IsNullOrWhiteSpace(origin))
        .Select(origin => origin.Trim())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray() ?? [];

    if (allowedOrigins.Length == 0)
    {
        throw new InvalidOperationException("Cors:AllowedOrigins must define at least one origin.");
    }

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
builder.Services.AddScoped<IUserPreferenceRepository, UserPreferenceRepository>();
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    dbContext.Database.Migrate();
    await AppDbContextSeed.SeedRootUserAsync(dbContext);
    await AppDbContextSeed.SeedDefaultAccountsAsync(dbContext);
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

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
