import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
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
import { useEmotionAnalysisMarkdown } from 'src/actions/emotion-feed';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Markdown } from 'src/components/markdown';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

function normalizeEmotionAnalysisMarkdown(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/^\s*\d+\.\s+###\s*/gm, '### ')
    .replace(/^\s*[-*]\s*###\s*/gm, '### ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createTopic(name) {
  return {
    name: name || '',
    opening: '',
    point: '',
    ask: '',
    crowd: '',
    resonance: '',
  };
}

function parseEmotionAnalysis(raw) {
  const text = normalizeEmotionAnalysisMarkdown(raw);
  const lines = text.split('\n');

  const title = lines.find((l) => l.trim().startsWith('# '))?.trim().replace(/^#\s*/, '') || '情绪AI分析';
  const subtitle = lines.find((l) => l.trim().startsWith('> '))?.trim().replace(/^>\s*/, '') || '';

  const mainline = [];
  const risks = [];
  const avoidTopics = [];
  const avoidPhrases = [];
  const topics = [];
  const top3 = [];

  let section = '';
  let currentTopic = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (t.startsWith('## ')) {
      section = t.replace(/^##\s*/, '');
      currentTopic = null;
      continue;
    }

    if (t.startsWith('### ')) {
      const h3 = t.replace(/^###\s*/, '');
      if (section.includes('推荐话题') && !h3.includes('不建议碰') && !h3.includes('避雷')) {
        currentTopic = createTopic(h3);
        topics.push(currentTopic);
      } else {
        currentTopic = null;
        section = h3;
      }
      continue;
    }

    if (section.includes('今日情绪主线') && /^[-*]\s+/.test(t)) {
      mainline.push(t.replace(/^[-*]\s+/, ''));
      continue;
    }

    if (section.includes('风险提醒') && /^[-*0-9]+\s*/.test(t)) {
      risks.push(t.replace(/^[-*0-9.\s]+/, ''));
      continue;
    }

    if (section.includes('优先讲哪') && /^[0-9]+\.\s+/.test(t)) {
      top3.push(t.replace(/^[0-9]+\.\s+/, ''));
      continue;
    }

    if (section.includes('不建议碰') && /^[-*]\s+/.test(t)) {
      avoidTopics.push(t.replace(/^[-*]\s+/, ''));
      continue;
    }

    if (section.includes('避雷表达') && /^[-*]\s+/.test(t)) {
      avoidPhrases.push(t.replace(/^[-*]\s+/, ''));
      continue;
    }

    // Fallback: model outputs topic blocks without "### 话题名"
    if (section.includes('推荐话题') && /^[-*]\s+/.test(t)) {
      const item = t.replace(/^[-*]\s+/, '');
      const isPoint = /^\*{0,2}主观点\*{0,2}：/.test(item);
      const isOpening = /^\*{0,2}(?:开场话术|导语|开篇导语)\*{0,2}：/.test(item);
      const isAsk = /^\*{0,2}(?:互动提问|互动引导)\*{0,2}：/.test(item);
      const isCrowd = /^\*{0,2}适合人群\*{0,2}：/.test(item);
      const isResonance = /^\*{0,2}女性共鸣点\*{0,2}：/.test(item);
      if (!(isPoint || isOpening || isAsk || isCrowd || isResonance)) continue;

      if (!currentTopic || (isPoint && currentTopic.point)) {
        currentTopic = createTopic(`话题 ${topics.length + 1}`);
        topics.push(currentTopic);
      }

      if (isOpening) {
        currentTopic.opening = item
          .replace(/^\*{0,2}(?:开场话术|导语|开篇导语)\*{0,2}：/, '')
          .trim();
      } else if (isPoint) {
        currentTopic.point = item.replace(/^\*{0,2}主观点\*{0,2}：/, '').trim();
      } else if (isAsk) {
        currentTopic.ask = item.replace(/^\*{0,2}(?:互动提问|互动引导)\*{0,2}：/, '').trim();
      } else if (isCrowd) {
        currentTopic.crowd = item.replace(/^\*{0,2}适合人群\*{0,2}：/, '').trim();
      } else if (isResonance) {
        currentTopic.resonance = item.replace(/^\*{0,2}女性共鸣点\*{0,2}：/, '').trim();
      }
      continue;
    }
  }

  return { title, subtitle, mainline, topics, top3, avoidTopics, avoidPhrases, risks };
}

function buildTopicCopyPrompt(topic, idx) {
  const blocks = [
    '# 任务说明',
    '你是一位女性情感专栏公众号写手。请基于以下话题素材，写一篇可直接发布的公众号文章。',
    '',
    '# 输出要求（必须遵守）',
    '1. 只输出 Markdown 正文，不要代码块。',
    '2. 结构必须包含：标题、导语、正文小节（3-5个）、结尾行动建议。',
    '3. 语气：温柔但有立场，共情且不煽动，不制造性别对立。',
    '4. 不要编造事实，不要法律/医疗建议，不要空泛鸡汤。',
    '',
    `# 选题素材（话题 ${idx + 1}）`,
    `- 话题名：${topic.name || `话题 ${idx + 1}`}`,
    topic.opening ? `- 导语：${topic.opening}` : null,
    topic.point ? `- 主观点：${topic.point}` : null,
    topic.ask ? `- 互动引导：${topic.ask}` : null,
    topic.crowd ? `- 适合人群：${topic.crowd}` : null,
    topic.resonance ? `- 女性共鸣点：${topic.resonance}` : null,
    '',
    '# 我补充的描述（请结合展开）',
    '[在这里补充你的背景、案例、语气偏好、文章长度要求]',
  ];

  return blocks.filter(Boolean).join('\n').trim();
}

async function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持复制');
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('浏览器拒绝复制');
  } finally {
    document.body.removeChild(ta);
  }
}

export function EmotionAnalysisView() {
  const {
    emotionAnalysisMarkdown,
    emotionAnalysisLoading,
    emotionAnalysisError,
    emotionAnalysisValidating,
    refreshEmotionAnalysis,
  } = useEmotionAnalysisMarkdown();
  const parsed = parseEmotionAnalysis(emotionAnalysisMarkdown);
  const statItems = [
    { label: '主线', value: parsed.mainline.length, icon: 'solar:heart-angle-bold' },
    { label: '话题', value: parsed.topics.length, icon: 'solar:chat-round-like-bold' },
    { label: '风险', value: parsed.risks.length, icon: 'solar:shield-warning-bold' },
  ];

  const copyTopicPrompt = async (topic, idx) => {
    try {
      const prompt = buildTopicCopyPrompt(topic, idx);
      await copyText(prompt);
      toast.success(`已复制话题 ${idx + 1} 的 AI 写作提示词`);
    } catch (error) {
      toast.error(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

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
        <Grid container spacing={2.2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card
              sx={{
                mb: 2,
                color: 'common.white',
                borderRadius: 2.5,
                background:
                  'linear-gradient(120deg, rgba(17,24,39,1) 0%, rgba(30,64,175,1) 52%, rgba(14,116,144,1) 100%)',
              }}
            >
              <CardContent sx={{ py: 3 }}>
                <Typography variant="h4" sx={{ mb: 1.2, lineHeight: 1.3 }}>
                  {parsed.title}
                </Typography>
                {parsed.subtitle ? (
                  <Typography variant="body2" sx={{ opacity: 0.92, mb: 2 }}>
                    {parsed.subtitle}
                  </Typography>
                ) : null}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {statItems.map((item) => (
                    <Chip
                      key={item.label}
                      icon={<Iconify icon={item.icon} />}
                      label={`${item.label} ${item.value}`}
                      sx={{
                        color: 'common.white',
                        bgcolor: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.18)',
                      }}
                    />
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ mb: 2, borderRadius: 2 }}>
              <CardHeader title="今日情绪主线" subheader="可直接写入公众号导语的核心观察" />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1}>
                  {parsed.mainline.length ? (
                    parsed.mainline.map((line, idx) => (
                      <Stack
                        key={`${line}-${idx}`}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{
                          p: 1.2,
                          borderRadius: 1.5,
                          bgcolor: idx % 2 === 0 ? 'var(--palette-background-neutral)' : 'transparent',
                        }}
                      >
                        <Chip size="small" color="primary" label={idx + 1} sx={{ minWidth: 34 }} />
                        <Typography variant="body2">{line}</Typography>
                      </Stack>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      暂未解析到主线内容
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 2 }}>
              <CardHeader
                title={`推荐话题（${parsed.topics.length}）`}
                subheader="按导语、观点、互动引导自动拆分为可写作卡片"
              />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1.8}>
                  {parsed.topics.length ? (
                    parsed.topics.map((topic, idx) => (
                      <Card
                        key={`${topic.name}-${idx}`}
                        variant="outlined"
                        sx={{
                          p: 1.6,
                          borderRadius: 2,
                          borderColor: 'divider',
                          boxShadow: '0 10px 20px rgba(15,23,42,0.05)',
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ mb: 1 }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip size="small" color="secondary" label={idx + 1} />
                            <Typography variant="subtitle2">{topic.name || `话题 ${idx + 1}`}</Typography>
                          </Stack>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Iconify icon="solar:copy-bold" />}
                            onClick={() => copyTopicPrompt(topic, idx)}
                          >
                            复制
                          </Button>
                        </Stack>
                        {topic.opening ? <Markdown>{`- **导语：** ${topic.opening}`}</Markdown> : null}
                        {topic.point ? <Markdown>{`- **观点：** ${topic.point}`}</Markdown> : null}
                        {topic.ask ? (
                          <Box
                            sx={{
                              p: 1,
                              borderRadius: 1.5,
                              bgcolor: 'var(--palette-background-neutral)',
                              mb: 0.5,
                            }}
                          >
                            <Markdown>{`- **互动引导：** ${topic.ask}`}</Markdown>
                          </Box>
                        ) : null}
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                          {topic.crowd ? (
                            <Chip
                              size="small"
                              label={topic.crowd}
                              sx={{ bgcolor: 'rgba(37,99,235,0.1)', color: 'rgb(30,64,175)' }}
                            />
                          ) : null}
                          {topic.resonance ? <Chip size="small" variant="outlined" label={topic.resonance} /> : null}
                        </Stack>
                      </Card>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      暂未解析到推荐话题，以下为原始 Markdown：
                    </Typography>
                  )}
                  {!parsed.topics.length ? <Markdown>{emotionAnalysisMarkdown || '*暂无内容*'}</Markdown> : null}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ mb: 2, borderRadius: 2 }}>
              <CardHeader title="策略与避坑" subheader="优先级与表达风险提醒" />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  优先讲哪 3 个
                </Typography>
                <Stack spacing={0.8} sx={{ mb: 2 }}>
                  {parsed.top3.length ? (
                    parsed.top3.map((x, i) => (
                      <Alert key={`${x}-${i}`} severity="info" icon={false}>
                        {i + 1}. {x}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      暂无
                    </Typography>
                  )}
                </Stack>

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  不建议碰的话题
                </Typography>
                <Stack spacing={0.8} sx={{ mb: 2 }}>
                  {parsed.avoidTopics.length ? (
                    parsed.avoidTopics.map((x, i) => (
                      <Alert key={`${x}-${i}`} severity="warning" icon={false}>
                        {x}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      暂无
                    </Typography>
                  )}
                </Stack>

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  避雷表达
                </Typography>
                <Stack spacing={0.8}>
                  {parsed.avoidPhrases.length ? (
                    parsed.avoidPhrases.map((x, i) => (
                      <Alert key={`${x}-${i}`} severity="warning" icon={false}>
                        {x}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      暂无
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 2 }}>
              <CardHeader title="风险提醒" />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Stack spacing={0.8}>
                  {parsed.risks.length ? (
                    parsed.risks.map((x, i) => (
                      <Alert key={`${x}-${i}`} severity="error" icon={false}>
                        {i + 1}. {x}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      暂无
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : null}
    </DashboardContent>
  );
}
