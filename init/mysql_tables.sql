CREATE TABLE studio (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(255),
  value TEXT,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE designs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  `externalId` BIGINT NULL,
  `sourceImageId` BIGINT NULL UNIQUE,
  sha256 VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE CHECK (sha256 REGEXP '^[0-9a-f]{64}$'),
  source TEXT,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(255),
  description TEXT NOT NULL,
  keywords TEXT NOT NULL,
  `imageName` VARCHAR(255),
  `externalImageUrl` TEXT,
  `externalLink` TEXT,
  category VARCHAR(255) DEFAULT 'no_category',
  collection VARCHAR(255) DEFAULT 'no_collection',
  `backgroundColor` VARCHAR(255) NOT NULL DEFAULT '#FFFFFF',
  `backgroundColors` TEXT,
  shared BOOLEAN DEFAULT FALSE,
  props JSON,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY designs_externalid_key(`externalId`),
  UNIQUE KEY designs_title_key(title),
  UNIQUE KEY designs_slug_key(slug)
);

CREATE TABLE collections (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  `externalId` BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  `coverImageUrl` TEXT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY collections_externalid_key(`externalId`)
);

CREATE TABLE design_collections (
  `designId` CHAR(36) NOT NULL,
  `collectionId` CHAR(36) NOT NULL,
  PRIMARY KEY (`designId`, `collectionId`),
  KEY design_collections_collectionid_idx (`collectionId`),
  CONSTRAINT design_collections_design_fk FOREIGN KEY (`designId`) REFERENCES designs (id) ON DELETE CASCADE,
  CONSTRAINT design_collections_collection_fk FOREIGN KEY (`collectionId`) REFERENCES collections (id) ON DELETE CASCADE
);
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
CREATE TABLE design_social_posts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  `designId` CHAR(36) NOT NULL,
  channel VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL CHECK (channel IN ('pinterest', 'bluesky', 'mastodon', 'instagram', 'threads', 'reddit', 'tiktok', 'youtube', 'x', 'linkedin')),
  account VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  variant VARCHAR(50) COLLATE utf8mb4_bin NOT NULL,
  `externalId` VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,
  url TEXT NOT NULL CHECK (CHAR_LENGTH(url) <= 2000),
  `linkUrl` TEXT,
  title VARCHAR(500),
  caption TEXT CHECK (CHAR_LENGTH(caption) <= 5000),
  hashtags JSON,
  `imageUrl` TEXT,
  board VARCHAR(200),
  status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL CHECK (status IN ('published', 'removed')),
  `publishedAt` DATETIME(3) NOT NULL,
  `removedAt` DATETIME(3),
  extra JSON,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT design_social_posts_removed_check CHECK (status <> 'removed' OR `removedAt` IS NOT NULL),
  CONSTRAINT design_social_posts_design_fk FOREIGN KEY (`designId`) REFERENCES designs(id) ON DELETE CASCADE,
  UNIQUE KEY design_social_posts_channel_externalid_key (channel, `externalId`),
  UNIQUE KEY design_social_posts_design_channel_account_variant_key (`designId`, channel, account, variant),
  KEY design_social_posts_designid_idx (`designId`),
  KEY design_social_posts_channel_publishedat_idx (channel, `publishedAt`),
  KEY design_social_posts_account_publishedat_idx (account, `publishedAt`),
  KEY design_social_posts_status_idx (status)
);
