import type { RawItem } from '../../types.js';
import { parseDate } from '../../utils/date.js';
import { joinUrl } from '../../utils/url.js';
import { BaseFetcher } from '../../fetchers/base.js';

interface WeiboHotApiItem {
  word?: string;
  note?: string;
  num?: number;
  label_name?: string;
  raw_hot?: number;
  is_ad?: number;
}

interface WeiboHotApiResponse {
  data?: {
    realtime?: WeiboHotApiItem[];
  };
}

interface WeiboGroupConfig {
  group: 'mine' | 'search' | 'entertainment' | 'life' | 'social';
  pageUrl: string;
  sourceName: string;
}

const GROUPS: WeiboGroupConfig[] = [
  {
    group: 'mine',
    pageUrl: 'https://weibo.com/hot/mine',
    sourceName: '微博热榜-mine',
  },
  {
    group: 'search',
    pageUrl: 'https://weibo.com/hot/search',
    sourceName: '微博热榜-search',
  },
  {
    group: 'entertainment',
    pageUrl: 'https://weibo.com/hot/entertainment',
    sourceName: '微博热榜-entertainment',
  },
  {
    group: 'life',
    pageUrl: 'https://weibo.com/hot/life',
    sourceName: '微博热榜-life',
  },
  {
    group: 'social',
    pageUrl: 'https://weibo.com/hot/social',
    sourceName: '微博热榜-social',
  },
];

export class WeiboEmotionFetcher extends BaseFetcher {
  siteId = 'emotion-weibo';
  siteName = '微博';

  async fetch(now: Date): Promise<RawItem[]> {
    const items: RawItem[] = [];
    const seen = new Set<string>();

    for (const cfg of GROUPS) {
      try {
        const api = `https://weibo.com/ajax/side/hotSearch?group=${cfg.group}`;
        const data = await this.fetchJsonData<WeiboHotApiResponse>(api, {
          headers: {
            Referer: cfg.pageUrl,
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json,text/plain,*/*',
          },
        });
        let picked = 0;
        for (const it of data.data?.realtime || []) {
          if (it.is_ad === 1) continue;
          const keyword = (it.word || '').trim();
          if (!keyword) continue;
          const url = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}&from=hot_${cfg.group}`;
          const key = `${cfg.group}||${keyword.toLowerCase()}||${url}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const score =
            typeof it.raw_hot === 'number' ? it.raw_hot : typeof it.num === 'number' ? it.num : null;
          const desc = [it.note, it.label_name].filter(Boolean).join(' ').trim() || null;

          items.push(
            this.createItem({
              source: cfg.sourceName,
              title: keyword,
              desc,
              url,
              publishedAt: now,
              meta: {
                score,
                platform: 'weibo',
                group: cfg.group,
                source_page: cfg.pageUrl,
              },
            })
          );
          picked += 1;
          if (picked >= 30) break;
        }
      } catch {
        continue;
      }
    }

    if (items.length === 0) {
      const $ = await this.fetchHtml('https://s.weibo.com/top/summary?cate=realtimehot');
      $('table tbody tr').each((_, tr) => {
        const $tr = $(tr);
        const $a = $tr.find('td:nth-child(2) a').first();
        const title = $a.text().replace(/\s+/g, ' ').trim();
        const href = ($a.attr('href') || '').trim();
        if (!title || !href) return;

        const url = joinUrl('https://s.weibo.com', href);
        const hot = $tr.find('td:nth-child(2) span').first().text().trim();
        const key = `${title.toLowerCase()}||${url}`;
        if (seen.has(key)) return;
        seen.add(key);

        items.push(
          this.createItem({
            source: '微博热搜',
            title,
            desc: hot || null,
            url,
            publishedAt: parseDate(now.toISOString(), now),
            meta: {
              platform: 'weibo',
            },
          })
        );
      });
    }

    return items;
  }
}
