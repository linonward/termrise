import { createDeepSeekJson } from "@repo/ai/adapters/deepseek-json";
import { createClaudeWebOrigin } from "@repo/research/adapters/claude-web-origin";
import { createDataForSeoProvider } from "@repo/research/adapters/dataforseo";
import { createDeepSeekAnalyst } from "@repo/research/adapters/deepseek-analyst";
import { createDeepSeekLaunchSiteAnalyst } from "@repo/research/adapters/deepseek-launch-sites";
import { createDeepSeekNewWordClassifier } from "@repo/research/adapters/deepseek-new-word-classes";
import { createDeepSeekNewWordOriginAnalyst } from "@repo/research/adapters/deepseek-new-word-origin";
import { createDeepSeekNewWordAnalyst } from "@repo/research/adapters/deepseek-new-words";
import { createDeepSeekPageJudge } from "@repo/research/adapters/deepseek-page-judge";
import { createDeepSeekSeedExtractor } from "@repo/research/adapters/deepseek-seeds";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";
import { createFakeKeywordProvider } from "@repo/research/adapters/fake-keywords";
import { createFakeLaunchSiteAnalyst } from "@repo/research/adapters/fake-launch-sites";
import { createFakeNewWordClassifier } from "@repo/research/adapters/fake-new-word-classes";
import { createFakeNewWordOriginAnalyst } from "@repo/research/adapters/fake-new-word-origin";
import { createFakeNewWordAnalyst } from "@repo/research/adapters/fake-new-words";
import { createFakePageJudge } from "@repo/research/adapters/fake-page-judge";
import { createFakeSeedExtractor } from "@repo/research/adapters/fake-seeds";
import { createGoogleAutocomplete } from "@repo/research/adapters/google-autocomplete";
import {
  createHuggingFaceNames,
  createGitHubNames,
  createItchNames,
  createProductHuntNames,
  createShowHnNames,
} from "@repo/research/adapters/name-sources";
import {
  createGitHubOrigin,
  createHackerNewsOrigin,
  createHuggingFaceOrigin,
} from "@repo/research/adapters/origin-sources";
import { readPage } from "@repo/research/adapters/page-reader";
import { createTrendingNow } from "@repo/research/adapters/trending-now";

import type { WorkerEnv } from "./env";

// The opportunity analyst the env selects; workerEnv() has checked its variables.
export function createAnalyst(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekAnalyst(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeAnalyst();
}

// The keyword data provider the env selects.
export function createKeywordProvider(env: WorkerEnv) {
  return env.KEYWORD_PROVIDER === "dataforseo"
    ? createDataForSeoProvider({
        login: env.DATAFORSEO_LOGIN!,
        password: env.DATAFORSEO_PASSWORD!,
      })
    : createFakeKeywordProvider();
}

// Seed suggestions use the analyst's provider and model: no variables of their own.
export function createSeedExtractor(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekSeedExtractor(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeSeedExtractor();
}

// New-word explanations use the analyst's provider and model too.
export function createNewWordAnalyst(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekNewWordAnalyst(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeNewWordAnalyst();
}

// Sorting new words before the screen uses the analyst's provider and model too (S75).
export function createNewWordClassifier(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekNewWordClassifier(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeNewWordClassifier();
}

// Launch-site readings use the analyst's provider and model too.
export function createLaunchSiteAnalyst(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekLaunchSiteAnalyst(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeLaunchSiteAnalyst();
}

// New-word origins use the analyst's provider and model too.
export function createNewWordOriginAnalyst(env: WorkerEnv) {
  return env.ANALYST_PROVIDER === "deepseek"
    ? createDeepSeekNewWordOriginAnalyst(
        createDeepSeekJson({
          apiKey: env.DEEPSEEK_API_KEY!,
          model: env.DEEPSEEK_MODEL!,
        }),
      )
    : createFakeNewWordOriginAnalyst();
}

// The free sources searched for a word's origin. Only with real keyword data: tests and
// local runs on fake data make no calls to them.
export function createOriginSources(env: WorkerEnv) {
  return env.KEYWORD_PROVIDER === "dataforseo"
    ? [
        createHackerNewsOrigin(),
        createHuggingFaceOrigin(),
        createGitHubOrigin({ token: env.GITHUB_TOKEN }),
      ]
    : [];
}

// Free lists of new names for the new words; only with real keyword data.
export function createNameSources(env: WorkerEnv) {
  return env.KEYWORD_PROVIDER === "dataforseo"
    ? [
        createHuggingFaceNames(),
        createItchNames(),
        createShowHnNames(),
        createGitHubNames({ token: env.GITHUB_TOKEN }),
        createTrendingNow(),
        ...(env.PRODUCT_HUNT_TOKEN
          ? [createProductHuntNames({ token: env.PRODUCT_HUNT_TOKEN })]
          : []),
      ]
    : [];
}

// Google's suggestions for the roots, compared with the last scan; real data only.
export function createSuggestions(env: WorkerEnv) {
  return env.KEYWORD_PROVIDER === "dataforseo"
    ? createGoogleAutocomplete()
    : undefined;
}

// The page check of the evergreen deep check: pages are read and suggestions fetched only
// with real keyword data (fake results point at made-up addresses).
export function createPageCheck(env: WorkerEnv) {
  if (env.KEYWORD_PROVIDER !== "dataforseo") return {};
  return {
    readPage: (url: string) => readPage(url),
    autocomplete: createGoogleAutocomplete(),
    pageJudge:
      env.ANALYST_PROVIDER === "deepseek"
        ? createDeepSeekPageJudge(
            createDeepSeekJson({
              apiKey: env.DEEPSEEK_API_KEY!,
              model: env.DEEPSEEK_MODEL!,
            }),
          )
        : createFakePageJudge(),
  };
}

// Claude's web search for new-word origins; off without a key or without real data.
export function createWebOrigin(env: WorkerEnv) {
  return env.ANTHROPIC_API_KEY && env.KEYWORD_PROVIDER === "dataforseo"
    ? createClaudeWebOrigin({ apiKey: env.ANTHROPIC_API_KEY })
    : undefined;
}
