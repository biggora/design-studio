#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {load} from 'cheerio';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' && value.trim().length > 0;
const absolute = (value, base) => new URL(value, base).href;
const EXPECT_FIELDS = new Set(['title', 'h1', 'canonical', 'meta', 'imageAlt', 'textIncludes', 'links', 'indexable']);

function validate(manifest) {
  if (!object(manifest) || !Array.isArray(manifest.pages) || !manifest.pages.length) throw new Error('Manifest needs a nonempty pages array');
  for (const page of manifest.pages) {
    if (!object(page) || !string(page.url)) throw new Error('Each page needs a URL');
    const url = new URL(page.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use HTTP(S) URLs without embedded credentials');
    if (page.expect === undefined) continue;
    const e = page.expect;
    if (!object(e) || Object.keys(e).some(key => !EXPECT_FIELDS.has(key))) throw new Error('Invalid or unknown expectation field');
    for (const key of ['title', 'h1', 'canonical', 'imageAlt']) {
      if (e[key] !== undefined && !string(e[key])) throw new Error(`Expected ${key} must be a nonempty string`);
    }
    if (e.meta !== undefined && (!object(e.meta) || Object.entries(e.meta).some(([key, value]) => !string(key) || !string(value)))) throw new Error('Expected meta must map names/properties to nonempty strings');
    if (e.textIncludes !== undefined && (!Array.isArray(e.textIncludes) || !e.textIncludes.every(string))) throw new Error('Expected textIncludes must be an array of strings');
    if (e.indexable !== undefined && typeof e.indexable !== 'boolean') throw new Error('Expected indexable must be boolean');
    if (e.links !== undefined && (!Array.isArray(e.links) || e.links.some(link => !object(link) || !string(link.href) || !string(link.text)
      || (link.sectionHeading !== undefined && !string(link.sectionHeading))))) throw new Error('Expected links need href, text and optional sectionHeading');
    if (e.canonical !== undefined) absolute(e.canonical, page.url);
    for (const link of e.links ?? []) absolute(link.href, page.url);
  }
}

async function audit(page) {
  const result = {url: page.url, checks: [], warnings: []};
  const check = (name, actual, expected) => result.checks.push({name, passed: actual === expected, actual, expected});
  try {
    const response = await fetch(page.url, {credentials: 'omit', signal: AbortSignal.timeout(15000)});
    result.finalUrl = response.url;
    result.status = response.status;
    result.headers = Object.fromEntries(['content-type', 'x-robots-tag', 'cache-control', 'age', 'x-vercel-cache', 'cf-cache-status']
      .map(key => [key, response.headers.get(key)]).filter(([, value]) => value !== null));
    check('HTTP status', response.status, 200);
    if (response.headers.get('content-type')) check('HTML content type', /(?:text\/html|application\/xhtml\+xml)/i.test(response.headers.get('content-type')), true);
    const $ = load(await response.text());
    const meta = {};
    $('meta').each((_, el) => {
      const key = ($(el).attr('name') ?? $(el).attr('property'))?.toLowerCase();
      if (key) (meta[key] ??= []).push($(el).attr('content') ?? '');
    });
    const h1 = $('h1').map((_, el) => clean($(el).text())).get();
    const canonicals = $('link[rel="canonical"]').map((_, el) => $(el).attr('href') ?? '').get();
    const images = $('img').map((_, el) => ({src: $(el).attr('src') ?? null, alt: $(el).attr('alt') ?? null})).get();
    const links = $('a[href]').map((_, el) => ({href: $(el).attr('href'), text: clean($(el).text())})).get();
    const types = new Set();
    function collect(value) {
      if (Array.isArray(value)) return value.forEach(collect);
      if (!object(value)) return;
      for (const type of Array.isArray(value['@type']) ? value['@type'] : [value['@type']]) if (typeof type === 'string') types.add(type);
      Object.values(value).forEach(collect);
    }
    $('script[type="application/ld+json"]').each((_, el) => {
      try { collect(JSON.parse($(el).text())); } catch { result.warnings.push('Unparseable JSON-LD block'); }
    });
    const body = $('body').clone();
    body.find('script,style,noscript').remove();
    const text = clean(body.text());
    const robots = [...(meta.robots ?? []), ...(meta.googlebot ?? []), response.headers.get('x-robots-tag') ?? ''];
    result.observed = {title: clean($('title').first().text()), h1, canonical: canonicals, meta, images, links, structuredDataTypes: [...types], noindexSignal: robots.some(value => /\b(noindex|none)\b/i.test(value))};
    if (h1.length !== 1) result.warnings.push(`Observed ${h1.length} H1 elements`);
    if (canonicals.length !== 1) result.warnings.push(`Observed ${canonicals.length} canonical links`);
    if (!meta.description?.length) result.warnings.push('No meta description observed');
    const e = page.expect ?? {};
    if (e.title !== undefined) check('title', result.observed.title, clean(e.title));
    if (e.h1 !== undefined) { check('H1 count', h1.length, 1); check('H1 text', h1[0] ?? null, clean(e.h1)); }
    if (e.canonical !== undefined) {
      check('canonical count', canonicals.length, 1);
      check('canonical URL', canonicals[0] ? absolute(canonicals[0], response.url) : null, absolute(e.canonical, response.url));
    }
    for (const [key, value] of Object.entries(e.meta ?? {})) {
      const values = meta[key.toLowerCase()] ?? [];
      check(`meta ${key} count`, values.length, 1);
      check(`meta ${key}`, values[0] ?? null, value);
    }
    if (e.imageAlt !== undefined) check(`image alt: ${e.imageAlt}`, images.some(image => image.alt === e.imageAlt), true);
    for (const value of e.textIncludes ?? []) check(`body includes: ${value}`, text.includes(clean(value)), true);
    if (e.indexable !== undefined) check('no noindex signal in HTML/headers (not Google index status)', !result.observed.noindexSignal, e.indexable);
    for (const link of e.links ?? []) {
      const scope = link.sectionHeading === undefined ? $.root() : $('section').filter((_, el) =>
        $(el).find('h2,h3').toArray().some(heading => clean($(heading).text()) === clean(link.sectionHeading)));
      const target = absolute(link.href, response.url);
      const found = scope.find('a[href]').toArray().some(el => {
        try { return absolute($(el).attr('href'), response.url) === target && clean($(el).text()) === clean(link.text); } catch { return false; }
      });
      check(`link: ${link.text}${link.sectionHeading ? ` in ${link.sectionHeading}` : ''}`, found, true);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    check('page could be audited', false, true);
  }
  result.passed = result.checks.every(check => check.passed);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !args.some(arg => arg.startsWith('--manifest=')) || !args.some(arg => arg.startsWith('--output='))) throw new Error('Usage: node audit-pages.mjs --manifest=manifest.json --output=report.json');
  const manifestPath = args.find(arg => arg.startsWith('--manifest=')).slice(11);
  const outputPath = args.find(arg => arg.startsWith('--output=')).slice(9);
  if (!manifestPath || !outputPath || path.resolve(manifestPath) === path.resolve(outputPath)) throw new Error('Use distinct, nonempty manifest and output paths');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  validate(manifest);
  const pages = [];
  for (const page of manifest.pages) pages.push(await audit(page));
  const failed = pages.filter(page => !page.passed).length;
  const report = {checkedAt: new Date().toISOString(), scope: 'Anonymous HTTP GET / source HTML only; no keyword demand, browser rendering or Google index verification', passed: failed === 0, pages};
  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({pages: pages.length, failed, output: outputPath}));
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
