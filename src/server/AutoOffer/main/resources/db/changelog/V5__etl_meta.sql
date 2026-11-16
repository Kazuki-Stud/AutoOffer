SET search_path TO autooffer, pg_catalog;

CREATE TABLE IF NOT EXISTS etl_watermark (
    pipeline_name  varchar(64) PRIMARY KEY,
    last_synced_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
    updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO etl_watermark (pipeline_name)
VALUES ('vacancies_to_clickhouse')
ON CONFLICT (pipeline_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS etl_runs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_name  varchar(64) NOT NULL,
    started_at     timestamptz NOT NULL DEFAULT now(),
    finished_at    timestamptz,
    status         varchar(16) NOT NULL CHECK (status IN ('running','success','failed')),
    rows_extracted integer     NOT NULL DEFAULT 0,
    rows_loaded    integer     NOT NULL DEFAULT 0,
    rows_rejected  integer     NOT NULL DEFAULT 0,
    error_message  text
);

CREATE INDEX IF NOT EXISTS ix_etl_runs_started ON etl_runs (pipeline_name, started_at DESC);

GRANT SELECT, UPDATE (last_synced_at, updated_at) ON etl_watermark TO app_write;
GRANT SELECT, INSERT, UPDATE                      ON etl_runs      TO app_write;
