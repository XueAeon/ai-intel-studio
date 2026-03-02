import type { RawItem } from '../types.js';
import { BaseFetcher } from './base.js';
import { parseDate } from '../utils/date.js';
import { joinUrl } from '../utils/url.js';

export class AiBaseFetcher extends BaseFetcher {
  siteId = 'aibase';
  siteName = 'AIbase';

  async fetch(now: Date): Promise<RawItem[]> {
    const $ = await this.fetchHtml('https://news.aibase.com/zh/news');
    const items: RawItem[] = [];
    const seen = new Set<string>();

    $("a[href^='/zh/news/'], a[href^='/news/']").each((_, a) => {
      const $a = $(a);
      const href = ($a.attr('href') || '').trim();
      if (!href) return;

      const url = joinUrl('https://news.aibase.com', href);
      if (seen.has(url)) return;
      seen.add(url);

      const title = $a.find('.font600').first().text().trim() || $a.find('h3').first().text().trim();
      if (!title) return;

      const timeText = $a.find('.icon-rili').parent().text().replace(/\s+/g, ' ').trim();
      const publishedAt = parseDate(timeText, now);

      items.push(
        this.createItem({
          source: this.siteName,
          title,
          url,
          publishedAt,
          meta: { time_hint: timeText },
        })
      );
    });

    return items;
  }
}
