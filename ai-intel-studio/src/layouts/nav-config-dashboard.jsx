import { paths } from 'src/routes/paths';

import { CONFIG } from 'src/global-config';
import { useTranslate } from 'src/locales';

import { SvgColor } from 'src/components/svg-color';

// ----------------------------------------------------------------------

const icon = (name) => <SvgColor src={`${CONFIG.assetsDir}/assets/icons/navbar/${name}.svg`} />;

const ICONS = {
  home: icon('ic-dashboard'),
  news: icon('ic-blog'),
  md2wechat: icon('ic-file'),
  emotionInput: icon('ic-analytics'),
  emotionAnalysis: icon('ic-chat'),
};

export function useNavData() {
  const { t } = useTranslate('navbar');

  return [
    {
      subheader: t('subheader.main'),
      items: [
        { title: t('home'), path: paths.dashboard.general.home, icon: ICONS.home },
        { title: t('newsFeed.title'), path: paths.dashboard.news, icon: ICONS.news },
      ],
    },
    {
      subheader: t('subheader.management'),
      items: [
        {
          title: t('md2wechat.title'),
          path: paths.dashboard.md2wechat,
          icon: ICONS.md2wechat,
        },
        {
          title: '情绪原始看板',
          path: paths.dashboard.emotionInput,
          icon: ICONS.emotionInput,
        },
        {
          title: '情绪AI分析',
          path: paths.dashboard.emotionAnalysis,
          icon: ICONS.emotionAnalysis,
        },
      ],
    },
  ];
}
