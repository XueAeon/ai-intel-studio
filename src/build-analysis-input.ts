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
  source_key: string;
  category: EventCategory;
  is_show_ask_hn: boolean;
  is_finance_story: boolean;
  total_score: number;
  event: AnalysisEvent;
}

type EventCategory =
  | 'model'
  | 'product'
  | 'developer'
  | 'research'
  | 'infrastructure'
  | 'industry'
  | 'policy';

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

const CATEGORY_ORDER: EventCategory[] = [
  'model',
  'product',
  'developer',
  'research',
  'infrastructure',
  'industry',
  'policy',
];

function normalizeTitle(s: string): string {
  return (s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u3002\uff01\uff1f\uff0c\uff1a\uff1b.!?,:;]+$/g, '')
    .trim();
}

function normalizeSourceKey(source: string): string {
  return (source || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim();
}

function classifyCategory(title: string, source: string, url: string): EventCategory {
  const text = `${title} ${source} ${url}`.toLowerCase();

  if (
    /(regulat|policy|compliance|privacy|safety|security|law|government|eu ai act|监管|政策|合规|隐私|安全|红队)/i.test(text)
  ) {
    return 'policy';
  }
  if (
    /(funding|acquire|acquisition|ipo|valuation|market|stock|revenue|partnership|融资|收购|估值|股价|财报|合作)/i.test(
      text
    )
  ) {
    return 'industry';
  }
  if (
    /(gpu|chip|npu|cuda|datacenter|data center|cloud|inference engine|server|hardware|算力|芯片|数据中心|推理引擎)/i.test(
      text
    )
  ) {
    return 'infrastructure';
  }
  if (
    /(paper|arxiv|benchmark|eval|evaluation|study|research|论文|评测|基准|研究)/i.test(text)
  ) {
    return 'research';
  }
  if (
    /(gpt|claude|gemini|llama|qwen|mistral|deepseek|model|模型|foundation model)/i.test(text)
  ) {
    return 'model';
  }
  if (
    /(github|open source|sdk|api|framework|cli|show hn|ask hn|开源|开发者|工具链|agent sdk)/i.test(text)
  ) {
    return 'developer';
  }
  return 'product';
}

function isShowAskHn(title: string, source: string): boolean {
  void source;
  return /^(show hn:|ask hn:)/i.test((title || '').trim());
}

function isFinanceStory(source: string, title: string): boolean {
  const src = (source || '').toLowerCase();
  const t = (title || '').toLowerCase();
  if (src.includes('finance.yahoo.com')) return true;
  return /(stock|shares|buy|sell|股价|买入|市值|财报)/i.test(t);
}

function qualityAdjustment(title: string, source: string, desc: string | null): number {
  let delta = 0;
  const t = (title || '').toLowerCase();
  const s = (source || '').toLowerCase();

  if (/^(show hn:|ask hn:)/i.test(title.trim())) {
    delta -= 1.0;
  }
  if (isFinanceStory(source, title)) {
    delta -= 1.25;
  }
  if (!desc) {
    delta -= 0.25;
  }
  if (s.includes('openai') || s.includes('anthropic') || s.includes('google deepmind')) {
    delta += 0.25;
  }
  if (/daily|日报/i.test(t) && t.length > 36) {
    delta -= 0.35;
  }
  return delta;
}

function buildCategoryTargets(maxEvents: number): Record<EventCategory, number> {
  const scale = maxEvents / 80;
  return {
    model: Math.max(3, Math.round(4 * scale)),
    product: Math.max(3, Math.round(4 * scale)),
    developer: Math.max(4, Math.round(5 * scale)),
    research: Math.max(3, Math.round(4 * scale)),
    infrastructure: Math.max(3, Math.round(4 * scale)),
    industry: Math.max(3, Math.round(4 * scale)),
    policy: Math.max(2, Math.round(2 * scale)),
  };
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
  now: Date,
  desc: string | null
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
  const quality = qualityAdjustment(rep.title, rep.source, desc);
  const totalScore =
    sourceWeight * 2.2 +
    Math.min(hits, 8) * 0.12 +
    crossSourceCount * 1.15 +
    recencyScore * 0.95 +
    quality;
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
  const cleaned = raw
    .replace(/^by\s+[A-Za-z][^|]{0,80}\|\s*/i, '')
    .replace(/^from\s+[^.]{0,80}\.\s*/i, '')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 280 ? `${cleaned.slice(0, 277)}...` : cleaned;
}

function isLowQualityDesc(desc: string, title?: string): boolean {
  const d = desc.trim();
  if (!d) return true;
  if (d.length < 24) return true;

  const lowQualityPatterns = [
    /view the full context on techmeme/i,
    /在 youtube 上畅享你喜爱的视频和音乐/i,
    /上传原创内容并与亲朋好友和全世界观众分享/i,
    /欢迎来到【?ai日报】?栏目/i,
    /点击了解[:：]?\s*https?:\/\//i,
    /this report does not contain sensitive information/i,
    /cookie|privacy policy|accept all|subscribe now/i,
  ];
  if (lowQualityPatterns.some((p) => p.test(d))) return true;

  // If it's basically repeating the title, it provides little extra context.
  const t = (title || '').trim().toLowerCase();
  if (t) {
    const dt = d.toLowerCase();
    if (dt === t || dt.includes(t)) return true;
  }
  return false;
}

function extractDescFromHtml(html: string): string | null {
  const $ = cheerio.load(html);

  const metaSelectors = [
    "meta[property='og:description']",
    "meta[name='description']",
    "meta[name='twitter:description']",
    "meta[property='twitter:description']",
  ];

  const candidates: string[] = [];
  for (const selector of metaSelectors) {
    const content = normalizeDesc($(selector).first().attr('content') || '');
    if (content) candidates.push(content);
  }

  $('article p, main p, p')
    .slice(0, 8)
    .each((_, el) => {
      const text = normalizeDesc($(el).text());
      if (text) candidates.push(text);
    });

  for (const candidate of candidates) {
    if (!isLowQualityDesc(candidate)) {
      return candidate;
    }
  }
  return null;
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

        const cached = normalizeDesc(cache.get(key));
        if (cached && !isLowQualityDesc(cached, item.title)) {
          item.desc = cached;
          cacheHit++;
          filled++;
          return;
        }

        const desc = await fetchDescFromUrl(key, options.timeoutMs);
        fetched++;
        const normalized = normalizeDesc(desc);
        if (!normalized || isLowQualityDesc(normalized, item.title)) return;

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
    const normalizedDesc = (() => {
      const normalized = normalizeDesc(rep.desc || null);
      if (!normalized || isLowQualityDesc(normalized, rep.title)) return null;
      return normalized;
    })();
    const signals = scoreEvent(rep, grouped, now, normalizedDesc);
    const sourceKey = normalizeSourceKey(rep.source);
    const category = classifyCategory(rep.title, rep.source, rep.url);
    const showAsk = isShowAskHn(rep.title, rep.source);
    const finance = isFinanceStory(rep.source, rep.title);

    ranked.push({
      site_id: rep.site_id,
      source_key: sourceKey || 'unknown-source',
      category,
      is_show_ask_hn: showAsk,
      is_finance_story: finance,
      total_score: signals.total_score,
      event: {
        title: rep.title,
        published_at: rep.published_at || rep.first_seen_at || null,
        source: rep.source,
        url: rep.url,
        desc: normalizedDesc,
      },
    });
  }

  ranked.sort((a, b) => b.total_score - a.total_score);

  const selected: RankedEvent[] = [];
  const selectedIndexes = new Set<number>();
  const siteCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const categoryCounts = new Map<EventCategory, number>();
  let showAskCount = 0;
  let financeCount = 0;

  const perSiteCap = Math.max(5, Math.floor(maxEvents * 0.2));
  const perSourceCap = Math.max(4, Math.floor(maxEvents * 0.1));
  const showAskCap = Math.max(4, Math.floor(maxEvents * 0.1));
  const financeCap = Math.max(2, Math.floor(maxEvents * 0.04));
  const categoryTargets = buildCategoryTargets(maxEvents);

  function canPick(ev: RankedEvent): boolean {
    const c = siteCounts.get(ev.site_id) || 0;
    if (c >= perSiteCap) return false;
    const sc = sourceCounts.get(ev.source_key) || 0;
    if (sc >= perSourceCap) return false;
    if (ev.is_show_ask_hn && showAskCount >= showAskCap) return false;
    if (ev.is_finance_story && financeCount >= financeCap) return false;
    return true;
  }

  function pick(idx: number): void {
    const ev = ranked[idx];
    selected.push(ev);
    selectedIndexes.add(idx);
    siteCounts.set(ev.site_id, (siteCounts.get(ev.site_id) || 0) + 1);
    sourceCounts.set(ev.source_key, (sourceCounts.get(ev.source_key) || 0) + 1);
    categoryCounts.set(ev.category, (categoryCounts.get(ev.category) || 0) + 1);
    if (ev.is_show_ask_hn) showAskCount++;
    if (ev.is_finance_story) financeCount++;
  }

  // Pass 1: guarantee minimum topical coverage across categories.
  for (const cat of CATEGORY_ORDER) {
    const need = categoryTargets[cat];
    for (let i = 0; i < ranked.length; i++) {
      if ((categoryCounts.get(cat) || 0) >= need) break;
      if (selected.length >= maxEvents) break;
      if (selectedIndexes.has(i)) continue;
      const ev = ranked[i];
      if (ev.category !== cat) continue;
      if (!canPick(ev)) continue;
      pick(i);
    }
  }

  // Pass 2: fill remaining slots by score with caps applied.
  for (let i = 0; i < ranked.length; i++) {
    if (selected.length >= maxEvents) break;
    if (selectedIndexes.has(i)) continue;
    const ev = ranked[i];
    if (!canPick(ev)) continue;
    pick(i);
  }

  const descCache = await loadDescCache(descCachePath);
  const descEnriched = await enrichTopEventsDesc(
    selected.map((x) => x.event),
    descCache,
    {
      maxFetch: descFetchMax,
      timeoutMs: descTimeoutMs,
      concurrency: descConcurrency,
    }
  );
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
      algorithm_version: 'v1.1',
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
