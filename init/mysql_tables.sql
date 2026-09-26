CREATE TABLE studio (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(255),
  value TEXT,
  createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE designs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  `externalId` BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
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
