import OpenAI from 'openai';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import process from 'process';

interface OpenAIAnalysisConfig {
  api_key_env: string;
  base_url: string;
  model: string;
  enable_thinking: boolean;
  stream: boolean;
  stream_include_usage: boolean;
  temperature: number;
  max_events: number;
  request_timeout_ms: number;
}

interface AnalysisConfig {
  enabled: boolean;
  openai: OpenAIAnalysisConfig;
  input_path: string;
  prompt_path: string;
  output_markdown_path?: string;
  output_path?: string;
}

interface EmotionInputPayload {
  generated_at: string;
  generated_at_local: string;
  window_hours: number;
  total_items: number;
  items: Array<{
    title?: string;
    source?: string;
    desc?: string | null;
    url?: string;
  }>;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

function removeSourceLines(markdown: string): string {
  return markdown
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      return !/^(?:[-*]\s*)?(?:\*{0,2})?(?:来源|参考链接|数据来源)(?:\*{0,2})?\s*[：:]/.test(t);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasRequiredSections(markdown: string): boolean {
  const text = markdown || '';
  const required = ['# 微博情绪日报：', '## 今日情绪主线', '## 推荐情绪话题（5-10个）'];
  return required.every((s) => text.includes(s));
}

function normalizeText(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function buildFallbackAnalysis(input: EmotionInputPayload): string {
  const titles = (input.items || [])
    .map((it) => normalizeText(it.title || ''))
    .filter(Boolean)
    .slice(0, 80);
  const top = titles.slice(0, 10);

  const topics = top.slice(0, 8).map((t, idx) => {
    const short = t.length > 26 ? `${t.slice(0, 26)}...` : t;
    return {
      i: idx + 1,
      name: `从「${short}」延展的关系议题`,
      open: `今天这条大家都看到了，我们先不站队，先聊背后的情绪需求。`,
      point: `这类讨论常见的核心不是对错，而是关系中的期待落差与沟通边界。`,
      ask: `如果你在类似处境里，最想被理解的一句话是什么？`,
      crowd: '恋爱关系/婚恋沟通/高敏感人群',
      resonance: '“我说不清，但我真的委屈”这类被忽视感',
    };
  });

  const lines: string[] = [];
  lines.push('# 今日情感直播选题盘点：关系边界与情绪价值成为主讨论');
  lines.push('> 今天适合聊“关系里我该如何表达需求”');
  lines.push('');
  lines.push('## 今日情绪主线（给主播）');
  lines.push('- 观众更在意“被看见”而非“谁赢了争论”。');
  lines.push('- 关系冲突话题背后，普遍是边界不清与期待错位。');
  lines.push('- 婚恋与亲密关系讨论里，“沟通方式”成为高频痛点。');
  lines.push('- 样本显示，情绪共鸣点集中在委屈、失望、犹豫与自我怀疑。');
  lines.push('');
  lines.push('## 推荐话题（5-10个）');
  lines.push('');
  for (const t of topics) {
    lines.push(`### ${t.name}`);
    lines.push(`- 开场话术：${t.open}`);
    lines.push(`- 主观点：${t.point}`);
    lines.push(`- 互动提问：${t.ask}`);
    lines.push(`- 适合人群：${t.crowd}`);
    lines.push(`- 女性共鸣点：${t.resonance}`);
    lines.push('');
  }
  lines.push('## 今晚直播建议');
  lines.push('### 优先讲哪3个');
  lines.push('1. 关系里的情绪劳动谁在承担');
  lines.push('2. 如何表达需求而不是积累委屈');
  lines.push('3. 冲突后如何修复安全感');
  lines.push('');
  lines.push('### 不建议碰的话题');
  lines.push('- 直接贴标签断定某一性别“天生如何”。');
  lines.push('- 对个体事件做极端道德审判。');
  lines.push('');
  lines.push('### 避雷表达');
  lines.push('- 避免“你就是太矫情/你活该”这类否定体验的句子。');
  lines.push('- 避免“所有人都这样”这类绝对化判断。');
  lines.push('');
  lines.push('## 风险提醒');
  lines.push('- 热搜样本具有时效和偏差，不代表全部关系样态。');
  lines.push('- 直播中先共情再分析，能显著降低对立情绪。');
  lines.push('- 不对当事人做心理诊断，不鼓励网暴与人身攻击。');
  lines.push('');
  return lines.join('\n').trim();
}

async function main(): Promise<number> {
  const configPath = resolve('config/emotion-analysis.config.json');
  if (!existsSync(configPath)) {
    console.log(`ℹ️ Skip emotion analysis: config not found at ${configPath}`);
    return 0;
  }

  const config = JSON.parse(await readFile(configPath, 'utf-8')) as AnalysisConfig;
  if (!config.enabled) {
    console.log('ℹ️ Skip emotion analysis: enabled=false');
    return 0;
  }

  const inputPath = resolve(config.input_path);
  const promptPath = resolve(config.prompt_path);
  const outputPath = resolve(
    config.output_markdown_path || config.output_path || 'data/emotion-output-md/emotion-analysis-24h.md',
  );
  if (!existsSync(inputPath)) {
    throw new Error(`emotion input not found: ${inputPath}`);
  }
  if (!existsSync(promptPath)) {
    throw new Error(`prompt template not found: ${promptPath}`);
  }

  const apiKey = process.env[config.openai.api_key_env];
  if (!apiKey) {
    throw new Error(`missing env: ${config.openai.api_key_env}`);
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: config.openai.base_url,
  });

  const input = JSON.parse(await readFile(inputPath, 'utf-8')) as EmotionInputPayload;
  const compactInput = {
    ...input,
    items: (input.items || []).slice(0, config.openai.max_events),
  };
  const promptTemplate = await readFile(promptPath, 'utf-8');
  const prompt = renderTemplate(promptTemplate, {
    emotion_json: JSON.stringify(compactInput, null, 2),
  });

  let answerContent = '';

  if (config.openai.stream) {
    const streamRequest = {
      model: config.openai.model,
      temperature: config.openai.temperature,
      messages: [{ role: 'user', content: prompt }],
      enable_thinking: config.openai.enable_thinking,
      stream: true,
      stream_options: {
        include_usage: config.openai.stream_include_usage,
      },
      timeout: config.openai.request_timeout_ms,
    } as unknown as Parameters<typeof openai.chat.completions.create>[0];

    const stream = (await openai.chat.completions.create(streamRequest)) as AsyncIterable<{
      choices?: Array<{ delta?: { content?: string } }>;
    }>;

    for await (const chunk of stream) {
      if (!chunk.choices?.length) continue;
      const delta = chunk.choices[0].delta as { content?: string };
      if (delta.content) answerContent += delta.content;
    }
  } else {
    const request = {
      model: config.openai.model,
      temperature: config.openai.temperature,
      messages: [{ role: 'user', content: prompt }],
      enable_thinking: config.openai.enable_thinking,
      timeout: config.openai.request_timeout_ms,
    } as unknown as Parameters<typeof openai.chat.completions.create>[0];

    const completion = (await openai.chat.completions.create(request)) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    answerContent = completion.choices?.[0]?.message?.content?.trim() || '';
  }

  if (!answerContent.trim()) {
    throw new Error('empty AI response content');
  }

  let cleanedContent = removeSourceLines(answerContent.trim());
  if (!hasRequiredSections(cleanedContent)) {
    console.warn('⚠️ AI response missing required sections, fallback template used.');
    cleanedContent = buildFallbackAnalysis(compactInput);
  }

  const markdownDocument =
    `<!-- source_generated_at: ${compactInput.generated_at} -->\n` +
    `<!-- source_generated_at_local: ${compactInput.generated_at_local} -->\n` +
    `<!-- model: ${config.openai.model} -->\n\n` +
    cleanedContent +
    '\n';

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdownDocument, 'utf-8');
  console.log(`✅ ${outputPath}`);

  const backupDate = (compactInput.generated_at_local || '').slice(0, 10) || 'unknown-date';
  const backupPath = resolve(
    join('data/backups/emotion-output-md', backupDate, 'emotion-analysis-24h.md'),
  );
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, markdownDocument, 'utf-8');
  console.log(`✅ ${backupPath}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
