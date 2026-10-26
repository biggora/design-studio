-- Social posts: adds the facebook and tumblr channels and the scheduled status (a post
-- placed in the platform's native scheduler; publishedAt then holds the planned publish
-- time). Rerunnable: the previous channel/status checks — the auto-named column CHECKs
-- from migration 004 — are found by their clauses and replaced with named ones; reruns
-- change nothing. Status transitions and delete live in utils/social-posts-database.ts.
SET @old := (SELECT tc.CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS tc
             JOIN information_schema.CHECK_CONSTRAINTS cc
               ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
             WHERE tc.CONSTRAINT_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'design_social_posts'
               AND tc.CONSTRAINT_TYPE = 'CHECK'
               AND cc.CHECK_CLAUSE LIKE '%pinterest%' AND cc.CHECK_CLAUSE NOT LIKE '%tumblr%'
             LIMIT 1);
SET @ddl := IF(@old IS NOT NULL, CONCAT('ALTER TABLE design_social_posts DROP CHECK ', @old), 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'design_social_posts'
               AND CONSTRAINT_NAME = 'design_social_posts_channel_check');
SET @ddl := IF(@has = 0, 'ALTER TABLE design_social_posts ADD CONSTRAINT design_social_posts_channel_check CHECK (channel IN (''pinterest'', ''bluesky'', ''mastodon'', ''instagram'', ''threads'', ''reddit'', ''tiktok'', ''youtube'', ''x'', ''linkedin'', ''facebook'', ''tumblr''))', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old := (SELECT tc.CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS tc
             JOIN information_schema.CHECK_CONSTRAINTS cc
               ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
             WHERE tc.CONSTRAINT_SCHEMA = DATABASE() AND tc.TABLE_NAME = 'design_social_posts'
               AND tc.CONSTRAINT_TYPE = 'CHECK'
               AND cc.CHECK_CLAUSE LIKE '%published%' AND cc.CHECK_CLAUSE NOT LIKE '%scheduled%'
             LIMIT 1);
SET @ddl := IF(@old IS NOT NULL, CONCAT('ALTER TABLE design_social_posts DROP CHECK ', @old), 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'design_social_posts'
               AND CONSTRAINT_NAME = 'design_social_posts_status_check');
SET @ddl := IF(@has = 0, 'ALTER TABLE design_social_posts ADD CONSTRAINT design_social_posts_status_check CHECK (status IN (''scheduled'', ''published'', ''removed''))', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
