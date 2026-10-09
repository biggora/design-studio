<?xml version="1.0" encoding="UTF-8"?>
<!--
  Browser styling for the Pinterest RSS feeds (x served at /feeds/pinterest/*.xml
  and /feeds/pinterest.xml). Browsers apply it via the <?xml-stylesheet?>
  processing instruction; Pinterest and other feed readers ignore it and read
  the XML itself. Colors are the site's design tokens (DESIGN.md): Loom Ink,
  Thread Shadow, Indigo Thread, Warp Grey, Linen Mist, Card White.
-->
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:media="http://search.yahoo.com/mrss/"
  exclude-result-prefixes="media"
>
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title><xsl:value-of select="rss/channel/title"/></title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #d3d9d4;
            color: #212a31;
            font-family: Inter, system-ui, -apple-system, sans-serif;
            line-height: 1.5;
          }
          .band {
            background: #212a31;
            color: #d3d9d4;
            padding: 20px 24px;
          }
          .brand { font-size: 20px; font-weight: 700; }
          .band .sub { color: #748d92; font-size: 14px; margin-top: 2px; }
          main { max-width: 880px; margin: 0 auto; padding: 24px 16px 56px; }
          .card {
            background: #ffffff;
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            padding: 24px;
            margin-bottom: 24px;
          }
          .badge {
            display: inline-block;
            background: #124e66;
            color: #d3d9d4;
            border-radius: 6px;
            padding: 2px 10px;
            font-size: 12px;
          }
          h1 { font-size: 28px; font-weight: 700; line-height: 1.11; margin: 12px 0 8px; }
          .meta { color: #748d92; font-size: 14px; margin: 4px 0; overflow-wrap: anywhere; }
          .meta a { color: #124e66; text-decoration: none; }
          .meta a:hover { text-decoration: underline; }
          .item { display: flex; gap: 16px; }
          .item img {
            flex: none;
            width: 128px;
            height: 192px;
            object-fit: cover;
            border-radius: 8px;
            background: #d3d9d4;
          }
          .item h2 { font-size: 17px; font-weight: 600; line-height: 1.33; margin: 0 0 8px; }
          .item h2 a { color: #124e66; text-decoration: none; }
          .item h2 a:hover { text-decoration: underline; }
          .desc {
            margin: 0 0 8px;
            font-size: 14px;
            color: #212a31;
            display: -webkit-box;
            -webkit-line-clamp: 4;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .date { color: #748d92; font-size: 12px; }
          @media (max-width: 480px) {
            .item { flex-direction: column; }
            .item img { width: 100%; height: auto; aspect-ratio: 2 / 3; }
          }
        </style>
      </head>
      <body>
        <div class="band">
          <div class="brand">ThreadQuirk</div>
          <div class="sub">RSS feed — Pinterest auto-publish (one feed per board)</div>
        </div>
        <main>
          <xsl:apply-templates select="rss/channel"/>
        </main>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="channel">
    <div class="card">
      <span class="badge"><xsl:value-of select="count(item)"/> items</span>
      <h1><xsl:value-of select="title"/></h1>
      <p class="meta"><xsl:value-of select="description"/></p>
      <p class="meta">
        Last build: <xsl:value-of select="lastBuildDate"/>
      </p>
      <p class="meta">
        Feed URL: <a href="{link}"><xsl:value-of select="link"/></a>
      </p>
    </div>
    <xsl:apply-templates select="item"/>
  </xsl:template>

  <xsl:template match="item">
    <div class="card item">
      <xsl:if test="media:content/@url">
        <!-- crossorigin: XSLT-rendered pages are opaque-origin to Chromium, so a
             plain <img> would be ORB-blocked; a CORS request loads fine. -->
        <img src="{media:content/@url}" alt="{title}" crossorigin="anonymous"/>
      </xsl:if>
      <div>
        <h2><a href="{link}"><xsl:value-of select="title"/></a></h2>
        <p class="desc"><xsl:value-of select="description"/></p>
        <div class="date"><xsl:value-of select="pubDate"/></div>
      </div>
    </div>
  </xsl:template>

</xsl:stylesheet>
