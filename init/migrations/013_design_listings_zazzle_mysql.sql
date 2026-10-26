-- Adds zazzle to the design_listings platform CHECK (pod-uploader publishes every
-- pod-studio package design to Zazzle as well). Rerunnable: the named
-- design_listings_platform_check from migration 011 is found by its clause and
-- replaced; reruns change nothing.
SET @old := (SELECT tc.CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS tc
             JOIN information_schema.CHECK_CONSTRAINTS cc
               ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
             WHERE tc.CONSTRAINT_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'design_listings'
               AND tc.CONSTRAINT_TYPE = 'CHECK'
               AND cc.CHECK_CLAUSE LIKE '%tostadora%' AND cc.CHECK_CLAUSE NOT LIKE '%zazzle%'
             LIMIT 1);
SET @ddl := IF(@old IS NOT NULL, CONCAT('ALTER TABLE design_listings DROP CHECK ', @old), 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'design_listings'
               AND CONSTRAINT_NAME = 'design_listings_platform_check');
SET @ddl := IF(@has = 0, 'ALTER TABLE design_listings ADD CONSTRAINT design_listings_platform_check CHECK (platform IN (''redbubble'', ''teepublic'', ''spreadshirt'', ''tostadora'', ''zazzle''))', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
