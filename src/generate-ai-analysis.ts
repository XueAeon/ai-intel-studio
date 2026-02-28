import OpenAI from 'openai';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
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
  output_path: string;
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
  const outputPath = resolve(config.output_path);
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

  const htmlDocument =
    `<!-- source_generated_at: ${compactInput.generated_at} -->\n` +
    `<!-- source_generated_at_local: ${compactInput.generated_at_local} -->\n` +
    `<!-- model: ${config.openai.model} -->\n` +
    `<!-- reasoning_chars: ${reasoningContent.length} -->\n\n` +
    answerContent.trim() +
    '\n';

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, htmlDocument, 'utf-8');
  console.log(`✅ ${outputPath}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
