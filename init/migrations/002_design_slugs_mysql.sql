-- Adds the URL slug for /designs/<slug>. Idempotent.
-- Rollout: run this BEFORE the next Redbubble sync (the sync inserts `slug`), then run `npm run backfill:slugs`.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'designs' AND COLUMN_NAME = 'slug');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE designs ADD COLUMN slug VARCHAR(255) NULL AFTER title', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'designs' AND INDEX_NAME = 'designs_slug_key');
SET @ddl := IF(@has_idx = 0, 'ALTER TABLE designs ADD UNIQUE KEY designs_slug_key (slug)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
