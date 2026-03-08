import { CONFIG } from 'src/global-config';

import { EmotionAnalysisView } from 'src/sections/emotion-analysis/view';

const metadata = { title: `Emotion Analysis | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return (
    <>
      <title>{metadata.title}</title>
      <EmotionAnalysisView />
    </>
  );
}
