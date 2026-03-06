import { CONFIG } from 'src/global-config';

import { NewsFeedView } from 'src/sections/news-feed/view';

const metadata = { title: `News Feed | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return (
    <>
      <title>{metadata.title}</title>
      <NewsFeedView />
    </>
  );
}

