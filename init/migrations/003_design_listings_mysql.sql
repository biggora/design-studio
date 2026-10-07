-- MySQL 8: rerunnable, including upgrades previously applied without a history table.
ALTER TABLE designs
  MODIFY COLUMN `externalId` BIGINT NULL,
  MODIFY COLUMN title VARCHAR(500) NOT NULL;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'designs' AND COLUMN_NAME = 'sourceImageId');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE designs ADD COLUMN `sourceImageId` BIGINT NULL UNIQUE', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'designs' AND COLUMN_NAME = 'sha256');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE designs ADD COLUMN sha256 VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'designs' AND COLUMN_NAME = 'source');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE designs ADD COLUMN source TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has_check := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'designs' AND CONSTRAINT_NAME = 'designs_sha256_check');
SET @ddl := IF(@has_check = 0, 'ALTER TABLE designs ADD CONSTRAINT designs_sha256_check CHECK (sha256 REGEXP ''^[0-9a-f]{64}$'')', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS design_listings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  `designId` CHAR(36) NOT NULL,
  platform VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL CHECK (platform IN ('redbubble', 'teepublic', 'spreadshirt')),
  account VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  `externalId` VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,
  url TEXT NOT NULL,
  title VARCHAR(500),
  description TEXT,
  tags JSON,
  `thumbnailUrl` TEXT,
  `publishedAt` DATETIME(3),
  extra JSON,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT design_listings_design_fk FOREIGN KEY (`designId`) REFERENCES designs(id) ON DELETE CASCADE,
  UNIQUE KEY design_listings_platform_externalid_key (platform, `externalId`),
  UNIQUE KEY design_listings_design_platform_account_key (`designId`, platform, account)
);
