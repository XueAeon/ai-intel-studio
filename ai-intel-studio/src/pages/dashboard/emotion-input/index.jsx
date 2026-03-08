import { CONFIG } from 'src/global-config';

import { EmotionInputView } from 'src/sections/emotion-input/view';

const metadata = { title: `Emotion Input | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return (
    <>
      <title>{metadata.title}</title>
      <EmotionInputView />
    </>
  );
}
