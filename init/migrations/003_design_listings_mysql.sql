-- MySQL 8: apply once, before deploying the ingest API.
ALTER TABLE designs
  MODIFY COLUMN `externalId` BIGINT NULL,
  MODIFY COLUMN title VARCHAR(500) NOT NULL,
  ADD COLUMN `sourceImageId` BIGINT NULL UNIQUE,
  ADD COLUMN sha256 VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  ADD COLUMN source TEXT NULL,
  ADD CONSTRAINT designs_sha256_check CHECK (sha256 REGEXP '^[0-9a-f]{64}$');

CREATE TABLE design_listings (
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
