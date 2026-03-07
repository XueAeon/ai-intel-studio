import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import type { RawItem } from '../types.js';
import { BaseFetcher } from './base.js';
import { fetchText } from '../utils/http.js';
import { parseDate } from '../utils/date.js';
import { joinUrl } from '../utils/url.js';

interface RssEntry {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  categories?: string[];
  contentSnippet?: string;
}

const META_AI_KEYWORDS = [
  'ai',
  'artificial intelligence',
  'llama',
  'meta ai',
  'genai',
  'machine learning',
  'open source ai',
  'foundation model',
];

const META_NOISE_KEYWORDS = [
  'scam',
  'fraud',
  'election',
  'safety',
  'policy',
  'content moderation',
  'cybersecurity',
  'privacy',
  'integrity',
];

const NVIDIA_AI_KEYWORDS = [
  'ai',
  'nemo',
  'cuda',
  'dgx',
  'gr00t',
  'omniverse',
  'llm',
  'genai',
  'inference',
  'data center',
];

function includesAny(text: string, keywords: string[]): boolean {
  const t = (text || '').toLowerCase();
  return keywords.some((k) => t.includes(k));
}

function isRecent(date: Date, now: Date, recentDays: number): boolean {
  const maxFutureMs = 2 * 24 * 60 * 60 * 1000;
  if (date.getTime() > now.getTime() + maxFutureMs) return false;
  const threshold = now.getTime() - recentDays * 24 * 60 * 60 * 1000;
  return date.getTime() >= threshold;
}

export class OfficialAiSourcesFetcher extends BaseFetcher {
  siteId = 'officialai';
  siteName = 'Official AI Sources';

  async fetch(now: Date): Promise<RawItem[]> {
    const items: RawItem[] = [];
    const seen = new Set<string>();
    const RECENT_DAYS = 45;
    const parser = new Parser({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ai-intel-studio/1.0)',
      },
    });

    const pushItem = (
      source: string,
      title: string,
      url: string,
      publishedAt: Date | null,
      desc?: string
    ) => {
      const t = (title || '').trim();
      const u = (url || '').trim();
      if (!t || !u || !u.startsWith('http')) return;
      if (!publishedAt) return;
      if (!isRecent(publishedAt, now, RECENT_DAYS)) return;
      const key = `${source}||${t.toLowerCase()}||${u}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(
        this.createItem({
          source,
          title: t,
          desc: (desc || '').trim() || null,
          url: u,
          publishedAt,
          meta: {
            contentSnippet: (desc || '').trim() || null,
          },
        })
      );
    };

    const addRssFeed = async (
      feedUrl: string,
      source: string,
      filter?: (entry: RssEntry) => boolean
    ) => {
      try {
        const feed = await parser.parseURL(feedUrl);
        for (const entry of (feed.items || []) as RssEntry[]) {
          if (filter && !filter(entry)) continue;
          const title = (entry.title || '').trim();
          const url = (entry.link || '').trim();
          const publishedAt = parseDate(entry.isoDate || entry.pubDate, now);
          pushItem(source, title, url, publishedAt, entry.contentSnippet || '');
        }
      } catch {
        // keep best-effort behavior
      }
    };

    // OpenAI
    await addRssFeed('https://openai.com/news/rss.xml', 'OpenAI');

    // Microsoft AI
    await addRssFeed('https://blogs.microsoft.com/ai/feed/', 'Microsoft AI');

    // NVIDIA (filter to AI-relevant posts)
    await addRssFeed('https://blogs.nvidia.com/feed/', 'NVIDIA Blog', (entry) => {
      const text = `${entry.title || ''} ${entry.contentSnippet || ''}`;
      return includesAny(text, NVIDIA_AI_KEYWORDS);
    });

    // Meta AI fallback from about.fb.com feed (AI-related filtering)
    await addRssFeed('https://about.fb.com/news/feed/', 'Meta AI', (entry) => {
      const categories = (entry.categories || []).join(' ').toLowerCase();
      const text = `${entry.title || ''} ${entry.contentSnippet || ''} ${categories}`;
      return includesAny(text, META_AI_KEYWORDS) && !includesAny(text, META_NOISE_KEYWORDS);
    });

    // Anthropic newsroom page
    try {
      const html = await fetchText('https://www.anthropic.com/news');
      const $ = cheerio.load(html);

      $("a[href^='/news/']").each((_, a) => {
        const $a = $(a);
        const href = ($a.attr('href') || '').trim();
        if (!href || href === '/news') return;

        const title =
          $a.find('h1,h2,h3,h4').first().text().trim() ||
          $a.text().replace(/\s+/g, ' ').trim();
        if (!title || title.length < 10) return;

        const timeText =
          $a.closest('article').find('time').first().attr('datetime') ||
          $a.closest('article').find('time').first().text().trim() ||
          '';
        const publishedAt = parseDate(timeText, now);

        pushItem('Anthropic', title, joinUrl('https://www.anthropic.com', href), publishedAt);
      });
    } catch {
      // ignore
    }

    // Google DeepMind blog/news page
    try {
      const html = await fetchText('https://deepmind.google/blog/');
      const $ = cheerio.load(html);

      $('article').each((_, article) => {
        const $article = $(article);
        const $title = $article.find('h2,h3').first();
        const title = $title.text().replace(/\s+/g, ' ').trim();
        if (!title || title.length < 10) return;

        let href =
          $article.find("a[href*='/discover/blog/']").first().attr('href') ||
          $article.find("a[href*='/blog/']").first().attr('href') ||
          '';
        href = href.trim();
        if (!href) return;

        const timeText =
          $article.find('time').first().attr('datetime') ||
          $article.find('time').first().text().trim() ||
          '';
        const publishedAt = parseDate(timeText, now);

        pushItem('Google DeepMind', title, joinUrl('https://deepmind.google', href), publishedAt);
      });
    } catch {
      // ignore
    }

    items.sort((a, b) => {
      const ta = a.publishedAt?.getTime() ?? 0;
      const tb = b.publishedAt?.getTime() ?? 0;
      return tb - ta;
    });

    return items;
  }
}
