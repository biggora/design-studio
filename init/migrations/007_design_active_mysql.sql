-- The manual `active` switch: false hides a print from every public surface
-- (catalog, feeds, sitemap, public API) and 404s its direct URLs. Idempotent,
-- like the other column migrations. Column only: procedure bodies cannot be
-- redefined through the migration runner, so fresh installs get the filtered
-- random procedures from init/mysql_functions.sql instead.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'designs' AND COLUMN_NAME = 'active');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE designs ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE AFTER shared', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
