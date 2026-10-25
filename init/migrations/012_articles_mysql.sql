CREATE TABLE IF NOT EXISTS article_announcements (
  sourceArticleId VARCHAR(100) NOT NULL,
  blog VARCHAR(253) NOT NULL,
  tumblrPostId VARCHAR(30) NOT NULL,
  tumblrUrl TEXT NOT NULL,
  title VARCHAR(300) NOT NULL,
  excerpt TEXT NOT NULL,
  imageUrl TEXT NOT NULL,
  imageSha256 CHAR(64) NOT NULL,
  imageAlt TEXT NOT NULL,
  revision CHAR(64) NOT NULL,
  checkedAt DATETIME(3) NULL,
  publication JSON NULL,
  PRIMARY KEY (blog, sourceArticleId)
);
