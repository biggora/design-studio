-- Rerunnable on MySQL 8 (DDL commits implicitly).
SET @pin_column_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'designs' AND column_name = 'ogImage');
SET @pin_ddl = IF(@pin_column_exists = 0, 'ALTER TABLE designs ADD COLUMN ogImage JSON NULL', 'SELECT 1');
PREPARE pin_stmt FROM @pin_ddl;
EXECUTE pin_stmt;
DEALLOCATE PREPARE pin_stmt;
