import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { Command } from 'commander';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

import { CONFIG } from './config.js';
import type { ArchiveItem, LatestPayload } from './types.js';
import { parseISO, toISOString, toZonedISOString, utcNow } from './utils/date.js';
import { fetchText } from './utils/http.js';
import { writeJson } from './output/index.js';
import { normalizeUrl } from './utils/url.js';

interface AnalysisEvent {
  title: string;
  published_at: string | null;
  source: string;
  url: string;
  desc: string | null;
}

interface RankedEvent {
  site_id: string;
  total_score: number;
  event: AnalysisEvent;
}

interface AnalysisInputPayload {
  generated_at: string;
  generated_at_local: string;
  source_generated_at: string | null;
  source_generated_at_local: string | null;
  window_hours: number;
  compression: {
    algorithm_version: string;
    input_items: number;
    clustered_events: number;
    output_events: number;
    max_events: number;
    per_site_cap: number;
  };
  site_distribution: Array<{ site_id: string; count: number }>;
  top_events: AnalysisEvent[];
}

type DescCachePojo = Record<string, string>;

const SOURCE_WEIGHTS: Record<string, number> = {
  officialai: 1.35,
  aibasedaily: 1.15,
  aibase: 1.1,
  aihubtoday: 1.05,
  zeli: 1.0,
  hackernews: 1.0,
  techurls: 0.95,
  newsnow: 0.85,
  buzzing: 0.85,
  iris: 0.85,
  tophub: 0.75,
  opmlrss: 0.7,
};

function normalizeTitle(s: string): string {
  return (s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u3002\uff01\uff1f\uff0c\uff1a\uff1b.!?,:;]+$/g, '')
    .trim();
}

function keywordHits(text: string): number {
  const t = text.toLowerCase();
  let count = 0;
  for (const k of CONFIG.filter.aiKeywords) {
    if (k && t.includes(k)) count++;
  }
  if (CONFIG.filter.enSignalPattern.test(t)) {
    count++;
  }
  return count;
}

function pickRepresentative(items: ArchiveItem[], now: Date): ArchiveItem {
  return items
    .slice()
    .sort((a, b) => {
      const ta = parseISO(a.published_at || a.first_seen_at)?.getTime() ?? 0;
      const tb = parseISO(b.published_at || b.first_seen_at)?.getTime() ?? 0;
      if (ta !== tb) return tb - ta;
      const ah = keywordHits(`${a.title} ${a.source} ${a.url}`);
      const bh = keywordHits(`${b.title} ${b.source} ${b.url}`);
      if (ah !== bh) return bh - ah;
      return (b.id || '').localeCompare(a.id || '');
    })[0];
}

function scoreEvent(
  rep: ArchiveItem,
  grouped: ArchiveItem[],
  now: Date
): {
  source_weight: number;
  keyword_hits: number;
  cross_source_count: number;
  recency_score: number;
  total_score: number;
} {
  const published = parseISO(rep.published_at || rep.first_seen_at);
  const ageHours = published ? Math.max(0, (now.getTime() - published.getTime()) / 3600000) : null;
  const recencyScore = ageHours === null ? 0 : Math.max(0, 1 - ageHours / 24);
  const hits = keywordHits(`${rep.title} ${rep.source} ${rep.url}`);
  const crossSourceCount = new Set(grouped.map((it) => `${it.site_id}::${it.source}`)).size;
  const sourceWeight = SOURCE_WEIGHTS[rep.site_id] ?? 0.8;
  const totalScore = sourceWeight * 1.8 + hits * 0.25 + crossSourceCount * 0.4 + recencyScore * 1.2;
  return {
    source_weight: Number(sourceWeight.toFixed(3)),
    keyword_hits: hits,
    cross_source_count: crossSourceCount,
    recency_score: Number(recencyScore.toFixed(3)),
    total_score: Number(totalScore.toFixed(3)),
  };
}

function normalizeDesc(input: string | null | undefined): string | null {
  const raw = (input || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  return raw.length > 280 ? `${raw.slice(0, 277)}...` : raw;
}

function extractDescFromHtml(html: string): string | null {
  const $ = cheerio.load(html);

  const metaSelectors = [
    "meta[property='og:description']",
    "meta[name='description']",
    "meta[name='twitter:description']",
    "meta[property='twitter:description']",
  ];

  for (const selector of metaSelectors) {
    const content = normalizeDesc($(selector).first().attr('content') || '');
    if (content) return content;
  }

  const articleText =
    normalizeDesc($('article p').first().text()) ||
    normalizeDesc($('main p').first().text()) ||
    normalizeDesc($('p').first().text());
  return articleText;
}

async function loadDescCache(path: string): Promise<Map<string, string>> {
  if (!existsSync(path)) return new Map();
  try {
    const raw = await readFile(path, 'utf-8');
    const obj = JSON.parse(raw) as DescCachePojo;
    const cache = new Map<string, string>();
    for (const [k, v] of Object.entries(obj)) {
      const key = normalizeUrl(k);
      const val = normalizeDesc(v);
      if (key && val) cache.set(key, val);
    }
    return cache;
  } catch {
    return new Map();
  }
}

function descCacheToPojo(cache: Map<string, string>): DescCachePojo {
  const obj: DescCachePojo = {};
  for (const [k, v] of cache.entries()) {
    obj[k] = v;
  }
  return obj;
}

async function fetchDescFromUrl(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const html = await fetchText(url, {
      timeout: timeoutMs,
      retries: 1,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    return extractDescFromHtml(html);
  } catch {
    return null;
  }
}

async function enrichTopEventsDesc(
  events: AnalysisEvent[],
  cache: Map<string, string>,
  options: {
    maxFetch: number;
    timeoutMs: number;
    concurrency: number;
  }
): Promise<{
  events: AnalysisEvent[];
  cache: Map<string, string>;
  fetched: number;
  cacheHit: number;
  filled: number;
}> {
  const out = events.map((e) => ({ ...e, desc: normalizeDesc(e.desc) }));
  const missingIndexes = out
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => !e.desc)
    .map(({ idx }) => idx)
    .slice(0, Math.max(0, options.maxFetch));

  let fetched = 0;
  let cacheHit = 0;
  let filled = 0;
  const limit = pLimit(Math.max(1, options.concurrency));

  await Promise.all(
    missingIndexes.map((idx) =>
      limit(async () => {
        const item = out[idx];
        const key = normalizeUrl(item.url || '');
        if (!key) return;

        const cached = cache.get(key);
        if (cached) {
          item.desc = cached;
          cacheHit++;
          filled++;
          return;
        }

        const desc = await fetchDescFromUrl(key, options.timeoutMs);
        fetched++;
        const normalized = normalizeDesc(desc);
        if (!normalized) return;

        item.desc = normalized;
        cache.set(key, normalized);
        filled++;
      })
    )
  );

  return { events: out, cache, fetched, cacheHit, filled };
}

async function main(): Promise<number> {
  const program = new Command();

  program
    .option('--input <path>', 'Input latest-24h file path', 'data/collected/latest-24h.json')
    .option('--output <path>', 'Output analysis input file path', 'data/ai-input/analysis-input-24h.json')
    .option('--max-events <count>', 'Maximum events for AI analysis', '80')
    .option('--desc-cache <path>', 'URL->desc cache path', 'data/collected/desc-cache.json')
    .option('--desc-fetch-max <count>', 'Max URL fetches to fill missing desc after selection', '80')
    .option('--desc-timeout-ms <ms>', 'Timeout for each desc URL fetch', '10000')
    .option('--desc-concurrency <count>', 'Concurrent URL fetches for desc', '4')
    .parse();

  const opts = program.opts();
  const inputPath = resolve(opts.input);
  const outputPath = resolve(opts.output);
  const maxEvents = Math.max(20, Math.min(300, parseInt(opts.maxEvents, 10) || 80));
  const perSiteCap = Math.max(6, Math.floor(maxEvents * 0.35));
  const descCachePath = resolve(opts.descCache);
  const descFetchMax = Math.max(0, parseInt(opts.descFetchMax, 10) || 80);
  const descTimeoutMs = Math.max(2000, parseInt(opts.descTimeoutMs, 10) || 10000);
  const descConcurrency = Math.max(1, parseInt(opts.descConcurrency, 10) || 4);

  if (!existsSync(inputPath)) {
    throw new Error(`Input not found: ${inputPath}`);
  }

  const now = utcNow();
  const raw = await readFile(inputPath, 'utf-8');
  const payload = JSON.parse(raw) as LatestPayload;
  const items = payload.items || [];

  const groups = new Map<string, ArchiveItem[]>();
  for (const item of items) {
    const key = normalizeTitle(item.title_original || item.title || '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const ranked: RankedEvent[] = [];
  for (const grouped of groups.values()) {
    const rep = pickRepresentative(grouped, now);
    const signals = scoreEvent(rep, grouped, now);

    ranked.push({
      site_id: rep.site_id,
      total_score: signals.total_score,
      event: {
        title: rep.title,
        published_at: rep.published_at || rep.first_seen_at || null,
        source: rep.source,
        url: rep.url,
        desc: rep.desc || null,
      },
    });
  }

  ranked.sort((a, b) => b.total_score - a.total_score);

  const selected: AnalysisEvent[] = [];
  const siteCounts = new Map<string, number>();
  for (const ev of ranked) {
    if (selected.length >= maxEvents) break;
    const c = siteCounts.get(ev.site_id) || 0;
    if (c >= perSiteCap) continue;
    selected.push(ev.event);
    siteCounts.set(ev.site_id, c + 1);
  }

  const descCache = await loadDescCache(descCachePath);
  const descEnriched = await enrichTopEventsDesc(selected, descCache, {
    maxFetch: descFetchMax,
    timeoutMs: descTimeoutMs,
    concurrency: descConcurrency,
  });
  const selectedWithDesc = descEnriched.events;

  const siteDistribution = Array.from(siteCounts.entries())
    .map(([site_id, count]) => ({ site_id, count }))
    .sort((a, b) => b.count - a.count);

  const out: AnalysisInputPayload = {
    generated_at: toISOString(now)!,
    generated_at_local: toZonedISOString(now, CONFIG.timezone)!,
    source_generated_at: payload.generated_at || null,
    source_generated_at_local: (payload as LatestPayload & { generated_at_local?: string }).generated_at_local || null,
    window_hours: payload.window_hours,
    compression: {
      algorithm_version: 'v1.0',
      input_items: items.length,
      clustered_events: ranked.length,
      output_events: selectedWithDesc.length,
      max_events: maxEvents,
      per_site_cap: perSiteCap,
    },
    site_distribution: siteDistribution,
    top_events: selectedWithDesc,
  };

  await writeJson(outputPath, out);
  await writeJson(descCachePath, descCacheToPojo(descEnriched.cache));
  console.log(`✅ ${outputPath} (${selectedWithDesc.length} events / ${items.length} items)`);
  console.log(
    `ℹ️ desc enriched: filled=${descEnriched.filled}, cache_hit=${descEnriched.cacheHit}, fetched=${descEnriched.fetched}`
  );
  console.log(`✅ ${descCachePath}`);

  const backupDate = (out.generated_at_local || '').slice(0, 10) || 'unknown-date';
  const backupPath = resolve(join('data/backups/ai-input', backupDate, 'analysis-input-24h.json'));
  await writeJson(backupPath, out);
  console.log(`✅ ${backupPath}`);

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
