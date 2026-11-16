#!/bin/sh
set -e

# Создаёт:
# 1) NOLOGIN-роли из V3__roles.sql заранее, чтобы привязать к ним runtime-пользователя
# 2) DB_MIGRATOR_USER — владеет схемой autooffer и запускает Liquibase
# 3) DB_APP_USER — под ним работает Spring Boot (НЕ суперпользователь!)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read')  THEN CREATE ROLE app_read  NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN CREATE ROLE app_write NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN CREATE ROLE app_admin NOLOGIN; END IF;
    END \$\$;

    CREATE ROLE ${DB_MIGRATOR_USER} WITH LOGIN PASSWORD '${DB_MIGRATOR_PASSWORD}';
    GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${DB_MIGRATOR_USER};
    GRANT CREATE ON SCHEMA public TO ${DB_MIGRATOR_USER};
    GRANT app_read, app_write, app_admin TO ${DB_MIGRATOR_USER} WITH ADMIN OPTION;

    CREATE ROLE ${DB_APP_USER} WITH LOGIN PASSWORD '${DB_APP_PASSWORD}';
    GRANT app_admin TO ${DB_APP_USER};
EOSQL
