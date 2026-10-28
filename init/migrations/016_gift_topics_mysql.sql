-- Rerunnable on MySQL 8; NULL keeps automatic selection for existing and new prints.
SET @gift_column_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'designs' AND column_name = 'giftTopics');
SET @gift_ddl = IF(@gift_column_exists = 0, 'ALTER TABLE designs ADD COLUMN giftTopics JSON NULL', 'SELECT 1');
PREPARE gift_stmt FROM @gift_ddl;
EXECUTE gift_stmt;
DEALLOCATE PREPARE gift_stmt;
