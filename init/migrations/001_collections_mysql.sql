-- Adds Redbubble collections support: `collections` table and the
-- `design_collections` many-to-many join table linking `designs` to `collections`.
-- Idempotent: safe to run multiple times.
-- Run once via the `mysql` client against an existing database.

CREATE TABLE IF NOT EXISTS collections (
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

CREATE TABLE IF NOT EXISTS design_collections (
  `designId` CHAR(36) NOT NULL,
  `collectionId` CHAR(36) NOT NULL,
  PRIMARY KEY (`designId`, `collectionId`),
  KEY design_collections_collectionid_idx (`collectionId`),
  CONSTRAINT design_collections_design_fk FOREIGN KEY (`designId`) REFERENCES designs (id) ON DELETE CASCADE,
  CONSTRAINT design_collections_collection_fk FOREIGN KEY (`collectionId`) REFERENCES collections (id) ON DELETE CASCADE
);
