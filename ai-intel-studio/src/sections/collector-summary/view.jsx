import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import CardHeader from '@mui/material/CardHeader';
import LinearProgress from '@mui/material/LinearProgress';
import TableContainer from '@mui/material/TableContainer';

import { paths } from 'src/routes/paths';

import { DashboardContent } from 'src/layouts/dashboard';
import { useNewsSummary } from 'src/actions/news-summary';

import { Iconify } from 'src/components/iconify';
import { Chart, useChart } from 'src/components/chart';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

function fNum(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

function fPct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function fMs(ms) {
  if (!ms) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function StatCard({ title, value, subvalue, icon }) {
  return (
    <Card sx={{ p: 2.5, height: 1 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {title}
        </Typography>
        <Iconify icon={icon} width={20} />
      </Stack>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
        {subvalue}
      </Typography>
    </Card>
  );
}

export function CollectorSummaryView() {
  const { summary, summaryLoading, summaryError, refreshSummary, summaryValidating } = useNewsSummary();

  const charts = summary?.charts || {};
  const metrics = summary?.metrics || {};
  const sourceStatus = summary?.source_status || {};

  const topSites24h = Array.isArray(charts.top_sites_24h) ? charts.top_sites_24h : [];
  const timeline = Array.isArray(charts.timeline_24h_total) ? charts.timeline_24h_total : [];
  const sourceHealth = Array.isArray(charts.source_health) ? charts.source_health : [];
  const topKeywords = Array.isArray(charts.top_keywords) ? charts.top_keywords : [];
  const topEvents = Array.isArray(summary?.top_events) ? summary.top_events : [];
  const slowestSources = Array.isArray(sourceStatus.slowest_sources) ? sourceStatus.slowest_sources : [];

  const sitesBarOptions = useChart({
    xaxis: { categories: topSites24h.map((item) => item.site_name || item.site_id) },
    legend: { show: true },
    tooltip: { y: { formatter: (v) => `${v} items` } },
  });

  const trendOptions = useChart({
    xaxis: { categories: timeline.map((item) => item.label || item.date) },
    stroke: { curve: 'smooth' },
    legend: { show: true },
    tooltip: { y: { formatter: (v) => `${v} items` } },
  });

  const sourceHealthOptions = useChart({
    labels: sourceHealth.map((s) => s.label),
    legend: { show: true, position: 'bottom' },
    plotOptions: { pie: { donut: { labels: { show: true } } } },
  });

  const keywordOptions = useChart({
    xaxis: { categories: topKeywords.map((item) => item.word) },
    tooltip: { y: { formatter: (v) => `${v} hits` } },
    plotOptions: { bar: { horizontal: true, borderRadius: 2 } },
  });

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading="Dashboard"
        links={[
          { name: '首页', href: paths.dashboard.general.home },
          { name: 'Collector Summary' },
        ]}
        action={
          <Button
            variant="contained"
            startIcon={<Iconify icon="solar:refresh-linear" />}
            onClick={() => refreshSummary()}
          >
            刷新
          </Button>
        }
        sx={{ mb: 3 }}
      />

      {summaryLoading && <LinearProgress sx={{ mb: 2 }} />}
      {summaryValidating && !summaryLoading && <LinearProgress sx={{ mb: 2 }} />}
      {summaryError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          汇总数据加载失败：{summaryError?.message || String(summaryError)}
        </Alert>
      )}

      {summary && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <StatCard
                title="24小时有效资讯"
                value={fNum(metrics.total_24h)}
                subvalue={`原始 ${fNum(metrics.raw_24h)}，去重率 ${fPct(metrics.dedup_rate_24h)}`}
                icon="solar:document-text-bold"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <StatCard
                title="7天有效资讯"
                value={fNum(metrics.total_7d)}
                subvalue={`原始 ${fNum(metrics.raw_7d)}，去重率 ${fPct(metrics.dedup_rate_7d)}`}
                icon="solar:calendar-date-bold"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <StatCard
                title="AI相关命中率(24h)"
                value={fPct(metrics.ai_focused_rate_24h)}
                subvalue="有效识别 AI 相关内容的比例"
                icon="solar:cpu-bolt-bold"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 3 }}>
              <StatCard
                title="数据源健康度"
                value={fPct(metrics.source_success_rate)}
                subvalue={`成功 ${fNum(metrics.success_sources)} / 失败 ${fNum(metrics.failed_sources)}`}
                icon="solar:shield-check-bold"
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, xl: 8 }}>
              <Card sx={{ mb: 2.5 }}>
                <CardHeader
                  title="来源分布（24h）"
                  subheader={`数据生成时间：${summary.generated_at_local || summary.generated_at || '-'}`}
                />
                <Chart
                  type="bar"
                  series={[
                    { name: '有效条数', data: topSites24h.map((item) => item.count || 0) },
                    { name: '原始条数', data: topSites24h.map((item) => item.raw_count || 0) },
                  ]}
                  options={sitesBarOptions}
                  sx={{ px: 2, pb: 2, height: 360 }}
                />
              </Card>

              <Card sx={{ mb: 2.5 }}>
                <CardHeader title="最近14天趋势（每日 latest-24h 归档）" />
                <Chart
                  type="line"
                  series={[
                    { name: '有效条数', data: timeline.map((item) => item.total_items || 0) },
                    { name: '原始条数', data: timeline.map((item) => item.total_items_raw || 0) },
                  ]}
                  options={trendOptions}
                  sx={{ px: 2, pb: 2, height: 360 }}
                />
              </Card>

              <Card>
                <CardHeader title="Top 关键词（24h 标题）" />
                <Chart
                  type="bar"
                  series={[{ name: '词频', data: topKeywords.map((item) => item.count || 0) }]}
                  options={keywordOptions}
                  sx={{ px: 2, pb: 2, height: 460 }}
                />
              </Card>
            </Grid>

            <Grid size={{ xs: 12, xl: 4 }}>
              <Card sx={{ mb: 2.5 }}>
                <CardHeader title="数据源健康状态" />
                <Chart
                  type="donut"
                  series={sourceHealth.map((s) => s.value || 0)}
                  options={sourceHealthOptions}
                  sx={{ px: 2, pb: 2, height: 280 }}
                />
              </Card>

              <Card>
                <CardHeader title="慢源告警（抓取耗时最高）" />
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  sx={{ mx: 2, mb: 2, width: 'auto', overflowX: 'auto' }}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>来源</TableCell>
                        <TableCell align="right">耗时</TableCell>
                        <TableCell align="right">条数</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {slowestSources.slice(0, 8).map((row) => (
                        <TableRow key={row.site_id}>
                          <TableCell>{row.site_name || row.site_id}</TableCell>
                          <TableCell align="right">{fMs(row.duration_ms)}</TableCell>
                          <TableCell align="right">{fNum(row.item_count)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ mt: 2.5 }}>
            <CardHeader title="压缩后事件样本（analysis-input-24h）" />
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ mx: 2, mb: 2, width: 'auto', overflowX: 'auto' }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>标题</TableCell>
                    <TableCell>来源</TableCell>
                    <TableCell align="right">关联数</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topEvents.slice(0, 12).map((event) => (
                    <TableRow key={event.event_id || event.url}>
                      <TableCell sx={{ maxWidth: 640 }}>
                        <Typography variant="body2">{event.title_zh || event.title}</Typography>
                        {event.url ? (
                          <Typography
                            component="a"
                            href={event.url}
                            target="_blank"
                            rel="noreferrer"
                            variant="caption"
                            sx={{ color: 'text.secondary' }}
                          >
                            {event.url}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell>{event.site_name || event.source || '-'}</TableCell>
                      <TableCell align="right">{fNum(event.related_count || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </>
      )}
    </DashboardContent>
  );
}
