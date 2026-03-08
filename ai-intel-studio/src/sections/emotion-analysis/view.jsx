import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { DashboardContent } from 'src/layouts/dashboard';
import { useEmotionAnalysisMarkdown } from 'src/actions/emotion-feed';

import { Iconify } from 'src/components/iconify';
import { Markdown } from 'src/components/markdown';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

export function EmotionAnalysisView() {
  const {
    emotionAnalysisMarkdown,
    emotionAnalysisLoading,
    emotionAnalysisError,
    emotionAnalysisValidating,
    refreshEmotionAnalysis,
  } = useEmotionAnalysisMarkdown();

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading="情绪AI分析"
        links={[
          { name: '首页', href: paths.dashboard.general.home },
          { name: '情绪AI分析' },
        ]}
        action={
          <Button
            variant="contained"
            startIcon={<Iconify icon="solar:refresh-linear" />}
            onClick={() => refreshEmotionAnalysis()}
            disabled={emotionAnalysisLoading || emotionAnalysisValidating}
          >
            刷新
          </Button>
        }
        sx={{ mb: 3 }}
      />

      {emotionAnalysisError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          加载失败：{emotionAnalysisError?.message || String(emotionAnalysisError)}
        </Alert>
      ) : null}

      {emotionAnalysisLoading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : null}

      {!emotionAnalysisLoading ? (
        <Card>
          <CardHeader title="Markdown 预览（emotion-analysis-24h.md）" />
          <Divider />
          <CardContent sx={{ maxHeight: 1000, overflow: 'auto' }}>
            <Markdown>{emotionAnalysisMarkdown || '*暂无内容*'}</Markdown>
          </CardContent>
        </Card>
      ) : null}
    </DashboardContent>
  );
}
