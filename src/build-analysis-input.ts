import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { Command } from 'commander';

import { CONFIG } from './config.js';
import type { ArchiveItem, LatestPayload } from './types.js';
import { parseISO, toISOString, toZonedISOString, utcNow } from './utils/date.js';
import { writeJson } from './output/index.js';

interface AnalysisEvent {
  event_id: string;
  title: string;
  title_zh: string | null;
  title_bilingual: string;
  published_at: string | null;
  age_hours: number | null;
  site_id: string;
  site_name: string;
  source: string;
  url: string;
  related_count: number;
  related_urls: string[];
  signals: {
    source_weight: number;
    keyword_hits: number;
    cross_source_count: number;
    recency_score: number;
    total_score: number;
  };
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

const SOURCE_WEIGHTS: Record<string, number> = {
  officialai: 1.35,
  aibasedaily: 1.15,
  aibase: 1.1,
  aihubtoday: 1.05,
  zeli: 1.0,
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
): AnalysisEvent['signals'] {
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

async function main(): Promise<number> {
  const program = new Command();

  program
    .option('--input <path>', 'Input latest-24h file path', 'data/collected/latest-24h.json')
    .option('--output <path>', 'Output analysis input file path', 'data/ai-input/analysis-input-24h.json')
    .option('--max-events <count>', 'Maximum events for AI analysis', '80')
    .parse();

  const opts = program.opts();
  const inputPath = resolve(opts.input);
  const outputPath = resolve(opts.output);
  const maxEvents = Math.max(20, Math.min(300, parseInt(opts.maxEvents, 10) || 80));
  const perSiteCap = Math.max(6, Math.floor(maxEvents * 0.35));

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

  const ranked: AnalysisEvent[] = [];
  for (const [key, grouped] of groups.entries()) {
    const rep = pickRepresentative(grouped, now);
    const published = parseISO(rep.published_at || rep.first_seen_at);
    const ageHours = published ? Math.max(0, (now.getTime() - published.getTime()) / 3600000) : null;
    const signals = scoreEvent(rep, grouped, now);

    ranked.push({
      event_id: key,
      title: rep.title,
      title_zh: rep.title_zh || null,
      title_bilingual: rep.title_bilingual || rep.title,
      published_at: rep.published_at || rep.first_seen_at || null,
      age_hours: ageHours === null ? null : Number(ageHours.toFixed(2)),
      site_id: rep.site_id,
      site_name: rep.site_name,
      source: rep.source,
      url: rep.url,
      related_count: grouped.length,
      related_urls: Array.from(new Set(grouped.map((it) => it.url))).slice(0, 5),
      signals,
    });
  }

  ranked.sort((a, b) => b.signals.total_score - a.signals.total_score);

  const selected: AnalysisEvent[] = [];
  const siteCounts = new Map<string, number>();
  for (const ev of ranked) {
    if (selected.length >= maxEvents) break;
    const c = siteCounts.get(ev.site_id) || 0;
    if (c >= perSiteCap) continue;
    selected.push(ev);
    siteCounts.set(ev.site_id, c + 1);
  }

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
      output_events: selected.length,
      max_events: maxEvents,
      per_site_cap: perSiteCap,
    },
    site_distribution: siteDistribution,
    top_events: selected,
  };

  await writeJson(outputPath, out);
  console.log(`✅ ${outputPath} (${selected.length} events / ${items.length} items)`);

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
