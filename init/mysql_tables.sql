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
  UNIQUE KEY designs_title_key(title)
);
