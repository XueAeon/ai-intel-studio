import { Command } from 'commander';
import pLimit from 'p-limit';
import { join, resolve } from 'path';

import { CONFIG } from '../config.js';
import type { FetchStatus, RawItem } from '../types.js';
import { toISOString, toZonedISOString, utcNow } from '../utils/date.js';
import { normalizeUrl } from '../utils/url.js';
import { writeJson } from '../output/index.js';
import { runFetcher } from '../fetchers/base.js';
import { WeiboEmotionFetcher } from './fetchers/weibo.js';

interface EmotionRecord {
  id: string;
  platform: string;
  source: string;
  title: string;
  desc: string | null;
  url: string;
  published_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

interface EmotionPayload {
  generated_at: string;
  generated_at_local: string;
  window_hours: number;
  total_items: number;
  source_count: number;
  site_stats: Array<{ site_id: string; site_name: string; count: number }>;
  items: EmotionRecord[];
}

function renderEmotionMarkdown(payload: EmotionPayload): string {
  const lines: string[] = [];
  lines.push('# Emotion Input Digest');
  lines.push('');
  lines.push(`- Generated At: ${payload.generated_at_local || payload.generated_at}`);
  lines.push(`- Window Hours: ${payload.window_hours}`);
  lines.push(`- Total Items: ${payload.total_items}`);
  lines.push(`- Source Count: ${payload.source_count}`);
  lines.push('');

  if (payload.site_stats.length > 0) {
    lines.push('## Site Stats');
    lines.push('');
    for (const s of payload.site_stats) {
      lines.push(`- ${s.site_name} (${s.site_id}): ${s.count}`);
    }
    lines.push('');
  }

  lines.push('## Items');
  lines.push('');
  for (const item of payload.items) {
    lines.push(`### ${item.title}`);
    lines.push(`- Platform: ${item.platform}`);
    lines.push(`- Source: ${item.source}`);
    if (item.desc) lines.push(`- Desc: ${item.desc}`);
    if (item.published_at) lines.push(`- Published At: ${item.published_at}`);
    lines.push(`- URL: ${item.url}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function normalizeText(s: string): string {
  return (s || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDesc(s: string | null | undefined): string | null {
  const t = normalizeText(s || '');
  if (!t) return null;
  if (t.length > 280) return `${t.slice(0, 277)}...`;
  return t;
}

function makeId(item: {
  platform: string;
  source: string;
  title: string;
  url: string;
}): string {
  return `${item.platform}::${item.source}::${item.title}::${item.url}`;
}

function toEmotionRecord(item: RawItem, now: Date): EmotionRecord | null {
  const title = normalizeText(item.title);
  const url = normalizeUrl(item.url || '');
  const source = normalizeText(item.source);
  const desc = normalizeDesc(item.desc || String(item.meta?.desc || ''));

  if (!title || !url || !source) return null;

  const platform = item.siteId.replace('emotion-', '') || item.siteId;
  const firstSeen = toISOString(now)!;

  return {
    id: makeId({ platform, source, title, url }),
    platform,
    source,
    title,
    desc,
    url,
    published_at: toISOString(item.publishedAt),
    first_seen_at: firstSeen,
    last_seen_at: firstSeen,
  };
}

async function main(): Promise<number> {
  const program = new Command();

  program
    .name('emotion-intel')
    .description('Collect public emotion-related signals from social platforms')
    .option('--output-dir <dir>', 'Output directory', 'data/emotion-input')
    .option('--output-md-dir <dir>', 'Output markdown directory', 'data/emotion-output-md')
    .option('--window-hours <hours>', 'Window size for output metadata', '24')
    .parse();

  const opts = program.opts();
  const outputDir = resolve(opts.outputDir);
  const outputMdDir = resolve(opts.outputMdDir);
  const windowHours = parseInt(opts.windowHours, 10) || 24;

  const now = utcNow();
  const fetchers = [new WeiboEmotionFetcher()];
  const limit = pLimit(3);

  console.log('');
  console.log('📡 Fetching public emotion signals...');

  const fetchResults = await Promise.all(
    fetchers.map((f) => limit(() => runFetcher(f, now, true)))
  );

  const statuses: FetchStatus[] = [];
  const rawItems: RawItem[] = [];

  for (const { items, status } of fetchResults) {
    statuses.push(status);
    rawItems.push(...items);
  }

  const dedupe = new Map<string, EmotionRecord>();
  for (const item of rawItems) {
    const rec = toEmotionRecord(item, now);
    if (!rec) continue;
    const key = `${rec.title.toLowerCase()}||${rec.url.toLowerCase()}`;
    if (!dedupe.has(key)) {
      dedupe.set(key, rec);
    }
  }

  const items = Array.from(dedupe.values()).sort((a, b) => {
    const ta = new Date(a.published_at || a.first_seen_at).getTime();
    const tb = new Date(b.published_at || b.first_seen_at).getTime();
    return tb - ta;
  });

  const siteStat = new Map<string, { site_id: string; site_name: string; count: number }>();
  for (const item of items) {
    const sid = `emotion-${item.platform}`;
    if (!siteStat.has(sid)) {
      siteStat.set(sid, {
        site_id: sid,
        site_name: item.platform,
        count: 0,
      });
    }
    siteStat.get(sid)!.count += 1;
  }

  const payload: EmotionPayload = {
    generated_at: toISOString(now)!,
    generated_at_local: toZonedISOString(now, CONFIG.timezone)!,
    window_hours: windowHours,
    total_items: items.length,
    source_count: new Set(items.map((i) => `${i.platform}::${i.source}`)).size,
    site_stats: Array.from(siteStat.values()).sort((a, b) => b.count - a.count),
    items,
  };

  const statusPayload = {
    generated_at: toISOString(now)!,
    generated_at_local: toZonedISOString(now, CONFIG.timezone)!,
    sites: statuses,
    successful_sites: statuses.filter((s) => s.ok).length,
    failed_sites: statuses.filter((s) => !s.ok).map((s) => s.site_id),
    fetched_raw_items: rawItems.length,
    items_after_filter: items.length,
  };

  const latestPath = join(outputDir, 'latest-24h-emotion.json');
  const statusPath = join(outputDir, 'source-status-emotion.json');
  const latestMdPath = join(outputMdDir, 'latest-24h-emotion.md');

  await writeJson(latestPath, payload);
  await writeJson(statusPath, statusPayload);

  const backupDate = (payload.generated_at_local || '').slice(0, 10) || 'unknown-date';
  const backupDir = resolve(join('data/backups/emotion-input', backupDate));
  const backupMdDir = resolve(join('data/backups/emotion-output-md', backupDate));
  await writeJson(join(backupDir, 'latest-24h-emotion.json'), payload);
  await writeJson(join(backupDir, 'source-status-emotion.json'), statusPayload);

  // Write Markdown via fs to preserve raw text content.
  const fs = await import('node:fs/promises');
  const md = renderEmotionMarkdown(payload);
  await fs.mkdir(outputMdDir, { recursive: true });
  await fs.writeFile(latestMdPath, md, 'utf8');
  await fs.mkdir(backupMdDir, { recursive: true });
  await fs.writeFile(join(backupMdDir, 'latest-24h-emotion.md'), md, 'utf8');

  console.log('');
  console.log(`✅ ${latestPath} (${items.length} items)`);
  console.log(`✅ ${statusPath}`);
  console.log(`✅ ${latestMdPath}`);
  console.log(`✅ ${join(backupDir, 'latest-24h-emotion.json')}`);
  console.log(`✅ ${join(backupDir, 'source-status-emotion.json')}`);
  console.log(`✅ ${join(backupMdDir, 'latest-24h-emotion.md')}`);

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
