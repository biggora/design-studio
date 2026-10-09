<?xml version="1.0" encoding="UTF-8"?>
<!--
  Browser styling for /sitemap.xml (applied via the <?xml-stylesheet?>
  processing instruction; search engines ignore it and parse the XML).
  Colors are the site's design tokens (DESIGN.md): Loom Ink, Indigo Thread,
  Warp Grey, Linen Mist, Card White.
-->
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  exclude-result-prefixes="s"
>
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title><xsl:value-of select="s:urlset/s:url[1]/s:loc"/> — Sitemap</title>
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
          .url { padding: 12px 0; border-bottom: 1px solid #d3d9d4; }
          .url:last-child { border-bottom: none; }
          .loc { font-size: 15px; }
          .loc a { color: #124e66; text-decoration: none; overflow-wrap: anywhere; }
          .loc a:hover { text-decoration: underline; }
          .chip {
            display: inline-block;
            border: 1px solid #748d92;
            color: #748d92;
            border-radius: 6px;
            padding: 0 8px;
            font-size: 12px;
            margin: 6px 6px 0 0;
          }
        </style>
      </head>
      <body>
        <div class="band">
          <div class="brand">ThreadQuirk</div>
          <div class="sub">Sitemap — every public URL of this site</div>
        </div>
        <main>
          <div class="card">
            <span class="badge"><xsl:value-of select="count(s:urlset/s:url)"/> URLs</span>
            <h1>Sitemap</h1>
            <p class="meta">
              Machine-readable index for search engines (sitemap protocol 0.9).
              Back to the site: <a href="{s:urlset/s:url[1]/s:loc}"><xsl:value-of select="s:urlset/s:url[1]/s:loc"/></a>
            </p>
          </div>
          <div class="card">
            <xsl:apply-templates select="s:urlset/s:url"/>
          </div>
        </main>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="s:url">
    <div class="url">
      <div class="loc"><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></div>
      <xsl:if test="s:lastmod"><span class="chip">lastmod: <xsl:value-of select="s:lastmod"/></span></xsl:if>
      <xsl:if test="s:changefreq"><span class="chip">changes: <xsl:value-of select="s:changefreq"/></span></xsl:if>
      <xsl:if test="s:priority"><span class="chip">priority: <xsl:value-of select="s:priority"/></span></xsl:if>
    </div>
  </xsl:template>

</xsl:stylesheet>
