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

interface AnalysisInputPayload {
  generated_at: string;
  generated_at_local: string;
  window_hours: number;
  top_events: unknown[];
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
      if (!t) {
        return true;
      }
      // Remove any explicit source/reference markers in list or plain lines.
      return !/^(?:[-*]\s*)?(?:\*{0,2})?(?:来源|参考链接|数据来源)(?:\*{0,2})?\s*[：:]/.test(t);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeChineseSpacing(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('```') ||
        trimmed.startsWith('`')
      ) {
        return line;
      }

      return line
        .replace(/([\u4e00-\u9fff])\s+([A-Za-z0-9])/g, '$1$2')
        .replace(/([A-Za-z0-9])\s+([\u4e00-\u9fff])/g, '$1$2')
        .replace(/\s+([，。！？；：、）】》])/g, '$1')
        .replace(/([（【《])\s+/g, '$1');
    })
    .join('\n');
}

async function main(): Promise<number> {
  const configPath = resolve('config/ai-analysis.config.json');
  if (!existsSync(configPath)) {
    console.log(`ℹ️ Skip AI analysis: config not found at ${configPath}`);
    return 0;
  }

  const config = JSON.parse(await readFile(configPath, 'utf-8')) as AnalysisConfig;
  if (!config.enabled) {
    console.log('ℹ️ Skip AI analysis: enabled=false');
    return 0;
  }

  const inputPath = resolve(config.input_path);
  const promptPath = resolve(config.prompt_path);
  const outputPath = resolve(
    config.output_markdown_path || config.output_path || 'data/ai-output-md/ai-analysis-24h.md',
  );
  if (!existsSync(inputPath)) {
    throw new Error(`analysis input not found: ${inputPath}`);
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

  const input = JSON.parse(await readFile(inputPath, 'utf-8')) as AnalysisInputPayload;
  const compactInput = {
    ...input,
    top_events: (input.top_events || []).slice(0, config.openai.max_events),
  };
  const promptTemplate = await readFile(promptPath, 'utf-8');
  const prompt = renderTemplate(promptTemplate, {
    window_hours: String(compactInput.window_hours),
    source_generated_at: compactInput.generated_at || '',
    source_generated_at_local: compactInput.generated_at_local || '',
    analysis_json: JSON.stringify(compactInput, null, 2),
  });

  let reasoningContent = '';
  let answerContent = '';
  let isAnswering = false;

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
      choices?: Array<{ delta?: { reasoning_content?: string; content?: string } }>;
    }>;

    for await (const chunk of stream) {
      if (!chunk.choices?.length) {
        continue;
      }
      const delta = chunk.choices[0].delta as {
        reasoning_content?: string;
        content?: string;
      };
      if (delta.reasoning_content) {
        reasoningContent += delta.reasoning_content;
      }
      if (delta.content) {
        isAnswering = true;
        answerContent += delta.content;
      }
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

  if (!isAnswering && !answerContent.trim()) {
    throw new Error('empty AI response content');
  }

  const cleanedContent = normalizeChineseSpacing(removeSourceLines(answerContent.trim()));

  const markdownDocument =
    `<!-- source_generated_at: ${compactInput.generated_at} -->\n` +
    `<!-- source_generated_at_local: ${compactInput.generated_at_local} -->\n` +
    `<!-- model: ${config.openai.model} -->\n` +
    `<!-- reasoning_chars: ${reasoningContent.length} -->\n\n` +
    cleanedContent +
    '\n';

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdownDocument, 'utf-8');
  console.log(`✅ ${outputPath}`);

  const backupDate = (compactInput.generated_at_local || '').slice(0, 10) || 'unknown-date';
  const backupPath = resolve(join('data/backups/ai-output-md', backupDate, 'ai-analysis-24h.md'));
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
