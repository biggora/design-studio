-- The pod-uploader CDN artwork for a design: {"key","version","width","height"} JSON or NULL.
-- Written only by the listings ingest (utils/listings-database.ts); never by the scrapers
-- or background tooling. Idempotent, like the other column migrations.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'designs' AND COLUMN_NAME = 'cdnImage');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE designs ADD COLUMN `cdnImage` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
