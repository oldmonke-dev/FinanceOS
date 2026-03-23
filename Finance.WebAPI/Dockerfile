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

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ghostscript libglib2.0-0 libsm6 libxext6 libxrender1 \
    && python3 -m venv /opt/camelot \
    && /opt/camelot/bin/pip install --no-cache-dir camelot-py pypdf pandas \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "Finance.WebAPI.dll"]
