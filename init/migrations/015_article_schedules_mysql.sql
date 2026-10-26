-- MySQL 8: independently test each column so a partial migration can be retried.
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='article_announcements' AND COLUMN_NAME='showAt')=0,
  'ALTER TABLE article_announcements ADD COLUMN showAt DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='article_announcements' AND COLUMN_NAME='status')=0,
  'ALTER TABLE article_announcements ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT ''automatic''', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='article_announcements' AND COLUMN_NAME='shownAt')=0,
  'ALTER TABLE article_announcements ADD COLUMN shownAt DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='article_announcements' AND COLUMN_NAME='scheduleRevision')=0,
  'ALTER TABLE article_announcements ADD COLUMN scheduleRevision VARCHAR(36) NOT NULL DEFAULT ''''', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='article_announcements' AND COLUMN_NAME='lastError')=0,
  'ALTER TABLE article_announcements ADD COLUMN lastError TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='article_announcements' AND CONSTRAINT_NAME='article_schedule_state_check')=0,
  'ALTER TABLE article_announcements ADD CONSTRAINT article_schedule_state_check CHECK (status IN (''automatic'',''scheduled'',''published'',''cancelled'') AND (status <> ''scheduled'' OR showAt IS NOT NULL))', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='article_announcements' AND INDEX_NAME='article_schedule_due')=0,
  'CREATE INDEX article_schedule_due ON article_announcements (status, showAt)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
