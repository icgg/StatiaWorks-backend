// Storage-efficiency: a content-addressed table for uploaded files. When a file
// is uploaded its sha256 is looked up here; a hit lets us reuse the already
// stored file instead of keeping a byte-identical duplicate. The daily
// attachment-cleanup cron removes a row when it deletes the physical file it
// points at. Idempotent (IF NOT EXISTS) to match the additive-migration style.

export async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS file_hashes(
      hash       TEXT PRIMARY KEY,           -- sha256 hex of the file contents
      url        TEXT NOT NULL,              -- canonical '/uploads/<sub>/<file>' URL
      byte_size  BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Reverse lookup (url -> row) for the cleanup cron's DELETE-by-url.
    CREATE INDEX IF NOT EXISTS file_hashes_url_idx ON file_hashes(url);
  `)
}

export async function down(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS file_hashes_url_idx;
    DROP TABLE IF EXISTS file_hashes;
  `)
}
