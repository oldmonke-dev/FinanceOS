using Finance.BusinessLayer.Interfaces;
using Finance.BusinessLayer.Services;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Finance.Infrastructure.Repositories;
using Finance.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

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
    options.AddPolicy("Spa", policy =>
    {
        policy
            .WithOrigins("http://localhost:3000", "https://localhost:3000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql("Host=localhost;Port=5432;Database=finance_db;Username=oldmonke;Password=aditisahu"));
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



// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

}


app.UseHttpsRedirection();
app.UseCors("Spa");

app.UseAuthorization();

app.MapControllers();

app.Run();
