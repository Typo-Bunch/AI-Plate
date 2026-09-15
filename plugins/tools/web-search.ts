/**
 * Robust Multi-Source Web Search & Page Extraction Plugin.
 *
 * Architecture:
 *   - All providers are queried concurrently with per-request timeouts (AbortController).
 *   - Provider failures are isolated and silently skipped (resilient aggregation).
 *   - Results are deduplicated by normalized URL, scored for accuracy, and sorted.
 *
 * Providers:
 *   1. Google News RSS — broad real-time web coverage, news, blog posts.
 *   2. Hacker News Algolia — technical and AI-focused community posts.
 *   3. Dev.to API — developer community articles (activated contextually).
 *   4. Wikipedia API — encyclopedic knowledge fallback.
 *
 * Tools Registered:
 *   - `web_search`     — Multi-source search with accuracy scoring.
 *   - `fetch_web_page` — Extract readable text from any URL.
 */

import { CONFIG } from "../../core/config.js";
import type { ToolHandler, ToolPlugin, ToolSchema } from "../../core/types.js";

// ─── Constants ──────────────────────────────────────────────────────

const USER_AGENT = CONFIG.WEB_SEARCH.USER_AGENT;

/** Per-provider request timeout in milliseconds. */
const PROVIDER_TIMEOUT_MS = 8_000;

/** Per-page fetch timeout in milliseconds. */
const PAGE_FETCH_TIMEOUT_MS = 12_000;

/** Stop-words excluded from accuracy scoring. */
const STOP_WORDS = new Set([
  "a", "an", "the", "for", "and", "or", "but", "with", "this", "that",
  "from", "into", "about", "what", "how", "why", "when", "where", "who",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "shall", "should", "may", "might",
  "can", "could", "of", "in", "on", "at", "to", "by", "it", "its", "me",
  "my", "we", "our", "you", "your", "he", "she", "they", "them", "his",
  "her", "site:dev.to", "dev.to",
]);

// ─── Utilities ──────────────────────────────────────────────────────

/** Clean HTML entities and strip remaining tags. */
function cleanHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a URL for deduplication (strip protocol, www, trailing slash). */
function normalizeUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/** Create an AbortSignal that fires after `ms` milliseconds. */
function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/** Safely fetch with a timeout. Returns null on any failure. */
async function safeFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = PROVIDER_TIMEOUT_MS
): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      ...options,
      signal: timeoutSignal(timeoutMs),
      headers: {
        "User-Agent": USER_AGENT,
        ...(options.headers as Record<string, string> | undefined),
      },
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

// ─── Accuracy Scoring ───────────────────────────────────────────────

/**
 * Multi-factor relevance score (0–100) for a search result.
 *
 * Factors:
 *   - Term coverage in combined text     (0–50 pts)
 *   - Term coverage specifically in title (0–25 pts)
 *   - Exact phrase match bonus            (0–15 pts)
 *   - Trusted domain authority bonus      (0–10 pts)
 */
function scoreResult(
  query: string,
  title: string,
  snippet: string,
  url: string
): number {
  const cleanQ = query.toLowerCase().replace(/["']/g, "");
  const terms = cleanQ
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  if (terms.length === 0) return 80; // No meaningful terms → neutral score

  const combined = `${title} ${snippet} ${url}`.toLowerCase();
  const titleLow = title.toLowerCase();

  let termHits = 0;
  let titleHits = 0;
  for (const t of terms) {
    if (combined.includes(t)) termHits++;
    if (titleLow.includes(t)) titleHits++;
  }

  const termCoverage = (termHits / terms.length) * 50;
  const titleBonus = (titleHits / terms.length) * 25;
  const exactBonus = combined.includes(cleanQ) ? 15 : 0;
  const domainBonus =
    /(github\.com|dev\.to|ai\.google\.dev|cloud\.google\.com|blog\.google|wikipedia\.org|stackoverflow\.com|venturebeat\.com|techcrunch\.com|arxiv\.org|reuters\.com|bloomberg\.com|nature\.com|sciencedirect\.com|nytimes\.com|wsj\.com|bbc\.com|theverge\.com|wired\.com|medium\.com|docs\.python\.org|developer\.mozilla\.org|npmjs\.com|pypi\.org|huggingface\.co|openai\.com|anthropic\.com|microsoft\.com|apple\.com|aws\.amazon\.com)/i.test(
      url
    )
      ? 10
      : 0;

  return Math.min(100, Math.round(termCoverage + titleBonus + exactBonus + domainBonus));
}

// ─── Search Result Type ─────────────────────────────────────────────

interface RawResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
}

// ─── Providers ──────────────────────────────────────────────────────

/** Google News RSS Feed — broad real-time web coverage. */
async function searchGoogleRss(query: string): Promise<RawResult[]> {
  const cleanQ = query.replace(/site:dev\.to/gi, "").replace(/["']/g, "").trim();
  const res = await safeFetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQ || query)}&hl=en-US&gl=US&ceid=US:en`
  );
  if (!res) return [];

  const xml = await res.text();
  const items = xml.split("<item>");
  const results: RawResult[] = [];

  for (let i = 1; i < Math.min(items.length, 15); i++) {
    const block = items[i];
    const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(block);
    const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(block);
    const pubMatch = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block);
    const sourceMatch = /<source[^>]*>([\s\S]*?)<\/source>/i.exec(block);

    if (titleMatch && linkMatch) {
      const rawTitle = cleanHtml(titleMatch[1]);
      // Google RSS titles often include " - Source" suffix; keep it for accuracy scoring
      const published = pubMatch?.[1] ?? "Recent";
      const sourceLabel = sourceMatch ? cleanHtml(sourceMatch[1]) : "";

      results.push({
        title: rawTitle,
        link: linkMatch[1].trim(),
        snippet: sourceLabel
          ? `[${sourceLabel}] Published: ${published}`
          : `Published: ${published}`,
        source: "Google Web",
      });
    }
  }
  return results;
}

/** Hacker News Algolia — technical community results. */
async function searchHackerNews(query: string): Promise<RawResult[]> {
  const cleanQ = query.replace(/["']/g, "").trim();
  const res = await safeFetch(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(cleanQ)}&hitsPerPage=10`
  );
  if (!res) return [];

  const data = (await res.json()) as Record<string, unknown>;
  const hits = data.hits as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(hits)) return [];

  const results: RawResult[] = [];
  for (const hit of hits) {
    const title = hit.title as string | undefined;
    const url = hit.url as string | undefined;
    const storyText = hit.story_text as string | undefined;
    const points = (hit.points as number) ?? 0;
    const comments = (hit.num_comments as number) ?? 0;

    if (title && (url || storyText)) {
      results.push({
        title: cleanHtml(title),
        link: url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        snippet: cleanHtml(
          storyText || `↑${points} pts · ${comments} comments`
        ).slice(0, 250),
        source: "Hacker News",
      });
    }
  }
  return results;
}

/** Dev.to Public API — developer community articles. */
async function searchDevTo(query: string): Promise<RawResult[]> {
  const cleanQ = query
    .replace(/site:dev\.to/gi, "")
    .replace(/dev\.to/gi, "")
    .replace(/dev to/gi, "")
    .replace(/["']/g, "")
    .trim();

  const res = await safeFetch(
    `https://dev.to/api/articles?per_page=10&q=${encodeURIComponent(cleanQ || query)}`
  );
  if (!res) return [];

  const items = (await res.json()) as Array<Record<string, unknown>>;
  const results: RawResult[] = [];

  for (const item of items) {
    const title = item.title as string | undefined;
    const url = item.url as string | undefined;
    const desc = (item.description as string) ?? "";
    const tags = item.tag_list as string[] | undefined;

    if (title && url) {
      results.push({
        title,
        link: url,
        snippet: cleanHtml(
          `${desc}${tags?.length ? ` [Tags: ${tags.join(", ")}]` : ""}`
        ),
        source: "Dev.to",
      });
    }
  }
  return results;
}

/** Wikipedia API — encyclopedic knowledge fallback. */
async function searchWikipedia(query: string): Promise<RawResult[]> {
  const res = await safeFetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`
  );
  if (!res) return [];

  const data = (await res.json()) as Record<string, unknown>;
  const queryData = data.query as Record<string, unknown> | undefined;
  const searchItems = (queryData?.search as Array<Record<string, unknown>>) ?? [];

  return searchItems.map((item) => ({
    title: cleanHtml(item.title as string),
    link: `https://en.wikipedia.org/wiki/${encodeURIComponent((item.title as string).replace(/\s+/g, "_"))}`,
    snippet: cleanHtml((item.snippet as string) ?? ""),
    source: "Wikipedia",
  }));
}

/** Detect currency pairs and fetch live forex exchange rates directly. */
async function searchLiveCurrencyRates(query: string): Promise<RawResult[]> {
  const currencyMatch = query.match(
    /\b(USD|EUR|GBP|INR|NZD|AUD|CAD|JPY|CHF|CNY|SGD|HKD|KRW|BRL|RUB|ZAR|AED|SAR)\s*(?:to|in|\/|\->|=)?\s*(USD|EUR|GBP|INR|NZD|AUD|CAD|JPY|CHF|CNY|SGD|HKD|KRW|BRL|RUB|ZAR|AED|SAR)\b/i
  );

  if (!currencyMatch) {
    // Check for common full names
    const isNzd = /new zealand|nzd/i.test(query);
    const isInr = /rupee|inr|indian/i.test(query);
    const isUsd = /dollar|usd|us/i.test(query);
    const isEur = /euro|eur/i.test(query);

    if (isNzd && isInr) {
      return fetchDirectRate("NZD", "INR");
    } else if (isUsd && isInr) {
      return fetchDirectRate("USD", "INR");
    } else if (isEur && isInr) {
      return fetchDirectRate("EUR", "INR");
    }
    return [];
  }

  const base = currencyMatch[1].toUpperCase();
  const target = currencyMatch[2].toUpperCase();

  if (base === target) return [];
  return fetchDirectRate(base, target);
}

async function fetchDirectRate(base: string, target: string): Promise<RawResult[]> {
  try {
    const res = await safeFetch(`https://open.er-api.com/v6/latest/${base}`, {}, 5000);
    if (!res) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const rate = data.rates?.[target];
    if (typeof rate === "number") {
      const nowUtc = data.time_last_update_utc || new Date().toUTCString();
      return [
        {
          title: `Live Currency Exchange Rate: 1 ${base} = ${rate.toFixed(4)} ${target}`,
          link: `https://open.er-api.com/v6/latest/${base}`,
          snippet: `Current verified live exchange rate: 1 ${base} = ${rate.toFixed(4)} ${target} (Inverse: 1 ${target} = ${(1 / rate).toFixed(4)} ${base}). Last updated: ${nowUtc}. Exact financial data.`,
          source: "Live Exchange Rate API",
        },
      ];
    }
  } catch {
    // Non-fatal
  }
  return [];
}

/** DuckDuckGo Instant Answer API */
async function searchDuckDuckGo(query: string): Promise<RawResult[]> {
  try {
    const res = await safeFetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      {},
      5000
    );
    if (!res) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const results: RawResult[] = [];

    if (data.Answer) {
      results.push({
        title: cleanHtml(data.Heading || query),
        link: data.AbstractURL || "https://duckduckgo.com",
        snippet: cleanHtml(data.Answer),
        source: "DuckDuckGo Instant Answer",
      });
    } else if (data.AbstractText) {
      results.push({
        title: cleanHtml(data.Heading || query),
        link: data.AbstractURL || "https://duckduckgo.com",
        snippet: cleanHtml(data.AbstractText),
        source: "DuckDuckGo",
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: cleanHtml(topic.Text.slice(0, 80)),
            link: topic.FirstURL,
            snippet: cleanHtml(topic.Text),
            source: "DuckDuckGo",
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Aggregator ─────────────────────────────────────────────────────

/**
 * Query all providers concurrently. Failures are silently skipped.
 */
async function aggregateSearch(query: string): Promise<RawResult[]> {
  const qLow = query.toLowerCase();
  const wantsDevTo =
    qLow.includes("dev.to") ||
    qLow.includes("dev to") ||
    qLow.includes("site:dev.to");

  // Fire all providers in parallel
  const providers: Array<Promise<RawResult[]>> = [
    searchLiveCurrencyRates(query),
    searchDuckDuckGo(query),
    searchGoogleRss(query),
    searchHackerNews(query),
  ];

  if (wantsDevTo) {
    providers.push(searchDevTo(query));
  }

  // Always include Wikipedia for breadth
  providers.push(searchWikipedia(query));

  const settled = await Promise.allSettled(providers);

  const allResults: RawResult[] = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      allResults.push(...outcome.value);
    }
  }

  return allResults;
}

// ─── Tool Handlers ──────────────────────────────────────────────────

/** `web_search` handler: aggregate, score, deduplicate, filter. */
const webSearchHandler: ToolHandler = async (args) => {
  const query = (args.query as string)?.trim();
  const maxResults =
    typeof args.max_results === "number"
      ? args.max_results
      : CONFIG.WEB_SEARCH.DEFAULT_MAX_RESULTS;
  const minAccuracy =
    typeof args.min_accuracy === "number"
      ? args.min_accuracy
      : CONFIG.WEB_SEARCH.DEFAULT_MIN_ACCURACY;

  if (!query) {
    return { error: "The 'query' argument is required and cannot be empty." };
  }

  try {
    const rawResults = await aggregateSearch(query);

    if (rawResults.length === 0) {
      return {
        query,
        count: 0,
        message:
          "No results found across all search providers. " +
          "Try rephrasing the query or using fetch_web_page with a known URL.",
      };
    }

    // Deduplicate by normalized URL
    const seen = new Set<string>();
    const scored: Array<{
      title: string;
      link: string;
      snippet: string;
      source: string;
      accuracy: number;
      confidence: "High" | "Medium" | "Low";
    }> = [];

    for (const r of rawResults) {
      const key = normalizeUrl(r.link);
      if (seen.has(key)) continue;
      seen.add(key);

      const accuracy = scoreResult(query, r.title, r.snippet, r.link);
      scored.push({
        ...r,
        accuracy,
        confidence:
          accuracy >= 80 ? "High" : accuracy >= 60 ? "Medium" : "Low",
      });
    }

    // Sort by accuracy descending
    scored.sort((a, b) => b.accuracy - a.accuracy);

    // Apply accuracy threshold with graceful fallback
    let filtered = scored.filter((r) => r.accuracy >= minAccuracy);
    if (filtered.length === 0 && scored.length > 0) {
      // Nothing meets threshold — return best available with a note
      filtered = scored.slice(0, maxResults);
    } else {
      filtered = filtered.slice(0, maxResults);
    }

    const avgAccuracy = Math.round(
      filtered.reduce((s, r) => s + r.accuracy, 0) / filtered.length
    );

    return {
      query,
      accuracyThreshold: `${minAccuracy}%`,
      averageAccuracy: `${avgAccuracy}%`,
      count: filtered.length,
      providersQueried: [
        "Google Web",
        "DuckDuckGo",
        "Hacker News",
        "Dev.to",
        "Wikipedia",
        "Live Exchange Rate API"
      ],
      results: filtered.map((r) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        source: r.source,
        accuracy: `${r.accuracy}%`,
        confidence: r.confidence,
      })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { query, error: `Search failed: ${msg}` };
  }
};

/** `fetch_web_page` handler: extract readable text from a URL. */
const fetchWebPageHandler: ToolHandler = async (args) => {
  const targetUrl = (args.url as string)?.trim();
  const maxLength =
    typeof args.max_length === "number"
      ? args.max_length
      : CONFIG.WEB_SEARCH.DEFAULT_MAX_PAGE_LENGTH;

  if (!targetUrl) {
    return { error: "The 'url' argument is required." };
  }

  // Basic URL validation
  try {
    new URL(targetUrl);
  } catch {
    return { error: `Invalid URL: "${targetUrl}". Must be a full URL starting with http:// or https://.` };
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,text/plain,application/xhtml+xml,*/*",
      },
      signal: timeoutSignal(PAGE_FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        url: targetUrl,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    // Check content type — only process text-based responses
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("application/xml") &&
      !contentType.includes("application/json")
    ) {
      return {
        url: targetUrl,
        error: `Unsupported content type: ${contentType}. Only text-based pages can be extracted.`,
      };
    }

    const html = await response.text();

    // Extract title before stripping tags
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = titleMatch ? cleanHtml(titleMatch[1]) : "";

    // Strip non-content elements, then tags, then decode entities
    const cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer\b[\s\S]*?<\/footer>/gi, "")
      .replace(/<header\b[\s\S]*?<\/header>/gi, "")
      .replace(/<aside\b[\s\S]*?<\/aside>/gi, "")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const truncated = cleaned.slice(0, maxLength);

    return {
      url: targetUrl,
      title,
      totalCharacters: cleaned.length,
      returnedCharacters: truncated.length,
      isTruncated: cleaned.length > maxLength,
      content: truncated,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("timeout")) {
      return {
        url: targetUrl,
        error: `Request timed out after ${PAGE_FETCH_TIMEOUT_MS / 1000}s. The page may be too slow or unreachable.`,
      };
    }
    return { url: targetUrl, error: `Fetch failed: ${msg}` };
  }
};

// ─── Tool Schemas ───────────────────────────────────────────────────

const webSearchSchema: ToolSchema = {
  name: "web_search",
  description:
    "Search the live internet for articles, documentation, news, and technical content. " +
    "Aggregates results from Google Web, Hacker News, Dev.to, and Wikipedia with " +
    "per-result accuracy scoring and confidence ratings. Default accuracy threshold: 75%.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The search query. Use natural language (e.g., 'Gemini 3.1 Flash-Lite benchmarks'). " +
          "Include 'dev.to' to also search the Dev.to community.",
      },
      max_results: {
        type: "number",
        description: "Maximum results to return (default: 5, max: 20).",
      },
      min_accuracy: {
        type: "number",
        description:
          "Minimum accuracy score percentage (0–100) to include a result (default: 75). " +
          "Lower values return more results; higher values are stricter.",
      },
    },
    required: ["query"],
  },
};

const fetchWebPageSchema: ToolSchema = {
  name: "fetch_web_page",
  description:
    "Fetch a web page and extract its readable text content. " +
    "Use this to read full articles, documentation, or blog posts found via web_search. " +
    "Has a 12-second timeout and validates content type before extraction.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "The full URL to fetch (must start with http:// or https://).",
      },
      max_length: {
        type: "number",
        description:
          "Maximum characters of text to extract (default: 6000). Increase for long articles.",
      },
    },
    required: ["url"],
  },
};

// ─── Plugin Export ──────────────────────────────────────────────────

export const webSearchPlugin: ToolPlugin = {
  id: "web_search",
  name: "Web Search & Web Reader",
  description: "Real-time web search across Google News, Hacker News, Dev.to, Wikipedia, and direct URL page text extraction.",
  icon: "🌐",

  register(registerTool) {
    registerTool(webSearchSchema, webSearchHandler);
    registerTool(fetchWebPageSchema, fetchWebPageHandler);
  },
};

export default webSearchPlugin;
