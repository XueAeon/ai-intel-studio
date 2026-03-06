import { useMemo, useState, useEffect, useCallback } from 'react';

import Link from '@mui/material/Link';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Select from '@mui/material/Select';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import CardHeader from '@mui/material/CardHeader';
import FormControl from '@mui/material/FormControl';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

const PAGE_SIZE = 50;

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

async function fetchJsonFromCandidates(pathsList) {
  let lastError = '数据加载失败';

  for (const path of pathsList) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        lastError = `请求失败: ${response.status} ${response.statusText} (${path})`;
        continue;
      }

      const raw = await response.text();
      const trimmed = raw.trim();
      if (!trimmed) {
        lastError = `响应为空: ${path}`;
        continue;
      }
      if (trimmed.startsWith('<')) {
        lastError = `返回了 HTML 而不是 JSON: ${path}`;
        continue;
      }
      return JSON.parse(trimmed);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

export function NewsFeedView() {
  const [timeRange, setTimeRange] = useState('24h');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSite, setSelectedSite] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const fetchData = useCallback(
    async (range, silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      try {
        const basePath = import.meta.env.BASE_URL || '/';
        const fileName = range === '24h' ? 'latest-24h.json' : 'latest-7d.json';
        const json = await fetchJsonFromCandidates([
          `${basePath}data/collected/${fileName}`,
          `${basePath}data/${fileName}`,
        ]);
        setData(json);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchData(timeRange);
  }, [timeRange, fetchData]);

  const siteStats = useMemo(() => {
    const stats = Array.isArray(data?.site_stats) ? data.site_stats : [];
    return [...stats].sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [data]);

  const sourceStats = useMemo(() => {
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length || selectedSite === 'all') return [];
    const map = new Map();
    for (const item of items) {
      if (item.site_id !== selectedSite) continue;
      const key = item.source || '';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [data, selectedSite]);

  const filteredAll = useMemo(() => {
    const items = Array.isArray(data?.items) ? data.items : [];
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedSite !== 'all' && item.site_id !== selectedSite) return false;
      if (selectedSource !== 'all' && item.source !== selectedSource) return false;
      if (!query) return true;
      const title = String(item.title || '').toLowerCase();
      const titleZh = String(item.title_zh || '').toLowerCase();
      const source = String(item.source || '').toLowerCase();
      return title.includes(query) || titleZh.includes(query) || source.includes(query);
    });
  }, [data, searchQuery, selectedSite, selectedSource]);

  const visibleItems = useMemo(() => filteredAll.slice(0, displayCount), [filteredAll, displayCount]);
  const hasMore = displayCount < filteredAll.length;

  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [timeRange, selectedSite, selectedSource, searchQuery]);

  useEffect(() => {
    setSelectedSource('all');
  }, [selectedSite]);

  useEffect(() => {
    if (selectedSite === 'all') return;
    const exists = siteStats.some((s) => s.site_id === selectedSite);
    if (!exists) {
      setSelectedSite('all');
      setSelectedSource('all');
    }
  }, [siteStats, selectedSite]);

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading="资讯列表"
        links={[
          { name: '首页', href: paths.dashboard.general.home },
          { name: '资讯列表' },
        ]}
        action={
          <Button
            variant="contained"
            startIcon={<Iconify icon="solar:refresh-linear" />}
            onClick={() => fetchData(timeRange, true)}
            disabled={refreshing || loading}
          >
            刷新
          </Button>
        }
        sx={{ mb: 3 }}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          资讯加载失败：{error}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="time-range-label">时间窗口</InputLabel>
              <Select
                labelId="time-range-label"
                label="时间窗口"
                value={timeRange}
                onChange={(event) => setTimeRange(event.target.value)}
              >
                <MenuItem value="24h">近 24 小时</MenuItem>
                <MenuItem value="7d">近 7 天</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="site-select-label">站点</InputLabel>
              <Select
                labelId="site-select-label"
                label="站点"
                value={selectedSite}
                onChange={(event) => setSelectedSite(event.target.value)}
              >
                <MenuItem value="all">全部站点</MenuItem>
                {siteStats.map((site) => (
                  <MenuItem key={site.site_id} value={site.site_id}>
                    {site.site_name} ({site.count || 0})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 220 }} disabled={selectedSite === 'all'}>
              <InputLabel id="source-select-label">来源</InputLabel>
              <Select
                labelId="source-select-label"
                label="来源"
                value={selectedSource}
                onChange={(event) => setSelectedSource(event.target.value)}
              >
                <MenuItem value="all">全部来源</MenuItem>
                {sourceStats.map((source) => (
                  <MenuItem key={source.source} value={source.source}>
                    {source.source || 'Unknown'} ({source.count})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              placeholder="搜索标题 / 来源"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              sx={{ minWidth: 260, flex: 1 }}
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="资讯明细"
          subheader={
            loading
              ? '正在加载...'
              : `共 ${filteredAll.length} 条，已显示 ${visibleItems.length} 条 · 数据生成于 ${formatDateTime(data?.generated_at)}`
          }
        />
        <Divider />
        <CardContent>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 8 }}>
              <CircularProgress size={28} />
            </Stack>
          ) : null}

          {!loading && !visibleItems.length ? (
            <Alert severity="info">当前筛选条件下暂无资讯。</Alert>
          ) : null}

          {!loading && visibleItems.length ? (
            <Stack spacing={1.5}>
              {visibleItems.map((item, index) => {
                const title = item.title_zh || item.title || '(无标题)';
                return (
                  <Card key={`${item.url}-${index}`} variant="outlined">
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip size="small" label={item.site_name || item.site_id || 'Unknown'} />
                          <Chip size="small" variant="outlined" label={item.source || 'Unknown'} />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={formatDateTime(item.published_at || item.first_seen_at)}
                          />
                        </Stack>

                        <Typography variant="subtitle1" sx={{ lineHeight: 1.6 }}>
                          {title}
                        </Typography>

                        <Link
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                          sx={{ fontSize: 13, wordBreak: 'break-all' }}
                        >
                          {item.url}
                        </Link>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          ) : null}

          {hasMore ? (
            <Stack alignItems="center" sx={{ mt: 2 }}>
              <Button variant="outlined" onClick={() => setDisplayCount((prev) => prev + PAGE_SIZE)}>
                加载更多
              </Button>
            </Stack>
          ) : null}
        </CardContent>
      </Card>
    </DashboardContent>
  );
}
