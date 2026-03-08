import { useMemo } from 'react';

import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { DashboardContent } from 'src/layouts/dashboard';
import { useEmotionInputBundle } from 'src/actions/emotion-feed';

import { Iconify } from 'src/components/iconify';
import { Markdown } from 'src/components/markdown';
import { Chart, useChart } from 'src/components/chart';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

function fNum(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

function formatDateTime(input) {
  if (!input) return '-';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function EmotionInputView() {
  const {
    emotionInput,
    emotionInputMarkdown,
    emotionInputLoading,
    emotionInputError,
    emotionInputValidating,
    refreshEmotionInput,
  } = useEmotionInputBundle();

  const siteStats = useMemo(() => {
    const stats = Array.isArray(emotionInput?.site_stats) ? emotionInput.site_stats : [];
    return [...stats].sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [emotionInput]);

  const topItems = useMemo(
    () => (Array.isArray(emotionInput?.items) ? emotionInput.items.slice(0, 15) : []),
    [emotionInput]
  );

  const sourceChartOptions = useChart({
    xaxis: { categories: siteStats.map((item) => item.site_name || item.site_id) },
    tooltip: { y: { formatter: (v) => `${v} items` } },
  });

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading="情绪原始看板"
        links={[
          { name: '首页', href: paths.dashboard.general.home },
          { name: '情绪原始看板' },
        ]}
        action={
          <Button
            variant="contained"
            startIcon={<Iconify icon="solar:refresh-linear" />}
            onClick={() => refreshEmotionInput()}
            disabled={emotionInputLoading || emotionInputValidating}
          >
            刷新
          </Button>
        }
        sx={{ mb: 3 }}
      />

      {emotionInputError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          加载失败：{emotionInputError?.message || String(emotionInputError)}
        </Alert>
      ) : null}

      {emotionInputLoading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : null}

      {!emotionInputLoading && emotionInput ? (
        <>
          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ p: 2.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  24小时总条数
                </Typography>
                <Typography variant="h4">{fNum(emotionInput.total_items)}</Typography>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ p: 2.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  来源数
                </Typography>
                <Typography variant="h4">{fNum(emotionInput.source_count)}</Typography>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ p: 2.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  数据时间
                </Typography>
                <Typography variant="h6">
                  {formatDateTime(emotionInput.generated_at_local || emotionInput.generated_at)}
                </Typography>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 5 }}>
              <Card sx={{ mb: 2 }}>
                <CardHeader title="来源分布" />
                <Chart
                  type="bar"
                  series={[{ name: '条数', data: siteStats.map((s) => s.count || 0) }]}
                  options={sourceChartOptions}
                  sx={{ px: 2, pb: 2, height: 320 }}
                />
              </Card>

              <Card>
                <CardHeader title="Top 15 条目" />
                <CardContent>
                  <Stack spacing={1.5}>
                    {topItems.map((item, idx) => (
                      <Stack key={`${item.url}-${idx}`} spacing={0.5}>
                        <Typography variant="subtitle2">{item.title || '(无标题)'}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {item.source || '-'}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, lg: 7 }}>
              <Card>
                <CardHeader title="Markdown 预览（latest-24h-emotion.md）" />
                <Divider />
                <CardContent sx={{ maxHeight: 900, overflow: 'auto' }}>
                  <Markdown>{emotionInputMarkdown || '*暂无内容*'}</Markdown>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      ) : null}
    </DashboardContent>
  );
}
