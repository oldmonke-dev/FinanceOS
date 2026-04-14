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

ARG TABULA_VERSION=1.0.5
ARG OTP_FRONTEND_BASE_URL=https://finos-staging.oldmonke.com/
ARG OTP_ACTIVE_WINDOW_MINUTES=5
ARG OTP_REQUEST_HISTORY_LIMIT=20

RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-21-jre-headless curl ca-certificates \
    && mkdir -p /opt/tabula \
    && curl -fsSL "https://github.com/tabulapdf/tabula-java/releases/download/v${TABULA_VERSION}/tabula-${TABULA_VERSION}-jar-with-dependencies.jar" -o /opt/tabula/tabula.jar \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8080

ENV Otp__FrontendBaseUrl=${OTP_FRONTEND_BASE_URL}
ENV Otp__ActiveWindowMinutes=${OTP_ACTIVE_WINDOW_MINUTES}
ENV Otp__RequestHistoryLimit=${OTP_REQUEST_HISTORY_LIMIT}

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "Finance.WebAPI.dll"]
