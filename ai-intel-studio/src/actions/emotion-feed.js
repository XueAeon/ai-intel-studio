import useSWR from 'swr';
import { useMemo } from 'react';

const swrOptions = {
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
};

async function fetchJsonFromCandidates(pathsList) {
  let lastError = 'emotion json load failed';
  for (const path of pathsList) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText} (${path})`;
        continue;
      }
      const text = await response.text();
      if (!text.trim()) {
        lastError = `empty response (${path})`;
        continue;
      }
      if (text.trim().startsWith('<')) {
        lastError = `html response (${path})`;
        continue;
      }
      return JSON.parse(text);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

async function fetchTextFromCandidates(pathsList) {
  let lastError = 'emotion markdown load failed';
  for (const path of pathsList) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText} (${path})`;
        continue;
      }
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

async function fetchEmotionInputBundle() {
  const basePath = import.meta.env.BASE_URL || '/';
  const [json, markdown] = await Promise.all([
    fetchJsonFromCandidates([
      `${basePath}data/emotion-input/latest-24h-emotion.json`,
      `${basePath}data/latest-24h-emotion.json`,
    ]),
    fetchTextFromCandidates([
      `${basePath}data/emotion-output-md/latest-24h-emotion.md`,
      `${basePath}data/latest-24h-emotion.md`,
    ]),
  ]);
  return { json, markdown };
}

async function fetchEmotionAnalysisMarkdown() {
  const basePath = import.meta.env.BASE_URL || '/';
  return fetchTextFromCandidates([
    `${basePath}data/emotion-output-md/emotion-analysis-24h.md`,
    `${basePath}data/emotion-analysis-24h.md`,
  ]);
}

export function useEmotionInputBundle() {
  const { data, isLoading, error, isValidating, mutate } = useSWR(
    'emotion-input-bundle',
    fetchEmotionInputBundle,
    swrOptions
  );

  return useMemo(
    () => ({
      emotionInput: data?.json || null,
      emotionInputMarkdown: data?.markdown || '',
      emotionInputLoading: isLoading,
      emotionInputError: error,
      emotionInputValidating: isValidating,
      refreshEmotionInput: mutate,
    }),
    [data, error, isLoading, isValidating, mutate]
  );
}

export function useEmotionAnalysisMarkdown() {
  const { data, isLoading, error, isValidating, mutate } = useSWR(
    'emotion-analysis-markdown',
    fetchEmotionAnalysisMarkdown,
    swrOptions
  );

  return useMemo(
    () => ({
      emotionAnalysisMarkdown: data || '',
      emotionAnalysisLoading: isLoading,
      emotionAnalysisError: error,
      emotionAnalysisValidating: isValidating,
      refreshEmotionAnalysis: mutate,
    }),
    [data, error, isLoading, isValidating, mutate]
  );
}
