FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["Finance.WebAPI/Finance.WebAPI.csproj", "Finance.WebAPI/"]
COPY ["Finance.BusinessLayer/Finance.BusinessLayer.csproj", "Finance.BusinessLayer/"]
COPY ["Finance.Domain/Finance.Domain.csproj", "Finance.Domain/"]
COPY ["Finance.Infrastructure/Finance.Infrastructure.csproj", "Finance.Infrastructure/"]
COPY ["Finance.Models/Finance.Models.csproj", "Finance.Models/"]

RUN dotnet restore "Finance.WebAPI/Finance.WebAPI.csproj"

COPY . .
WORKDIR /src/Finance.WebAPI
RUN dotnet publish "Finance.WebAPI.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "Finance.WebAPI.dll"]
