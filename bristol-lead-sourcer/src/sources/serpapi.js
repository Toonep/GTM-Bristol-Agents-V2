// Scrapes Google Search results via SerpAPI to discover leads not in Places or Apollo.

const axios = require('axios');
const { createLogger } = require('../utils/logger');

const log = createLogger('serpapi');
const SERPAPI_URL = 'https://serpapi.com/search';

// Matches "Owner: John Smith" or "owned by Jane Doe" patterns in snippet text
const OWNER_PATTERN = /(?:owner[,:\s]+|owned\s+by\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/;

function extractOwnerFromText(text) {
  const match = text.match(OWNER_PATTERN);
  if (!match) return null;
  const parts = match[1].trim().split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(' ') || null };
}

async function enrichWithSerpApi(lead, config) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    log.warn('SERPAPI_KEY not set — skipping SerpAPI enrichment');
    return lead;
  }

  // Only invoke when owner is still unknown after Apollo
  if (lead.owner_first_name !== null) return lead;

  const query = `${lead.business_name} ${lead.city} owner`;
  log.info(`SerpAPI call (owner null): "${query}"`);

  try {
    const resp = await axios.get(SERPAPI_URL, {
      params: { api_key: apiKey, q: query, engine: 'google', num: 5 },
    });

    // Check knowledge graph first — highest signal
    const kg = resp.data?.knowledge_graph;
    if (kg) {
      const kgText = `${kg.title || ''} ${kg.description || ''} ${kg.subtitle || ''}`;
      const found = extractOwnerFromText(kgText);
      if (found) {
        lead.owner_first_name = found.first;
        lead.owner_last_name = found.last;
        log.info(`SerpAPI KG owner found for "${lead.business_name}": ${found.first} ${found.last}`);
        lead.source_secondary = appendSource(lead.source_secondary, 'serpapi');
        return lead;
      }
    }

    // Fall back to organic snippet scanning
    const results = resp.data?.organic_results || [];
    for (const result of results) {
      const text = `${result.title || ''} ${result.snippet || ''}`;
      const found = extractOwnerFromText(text);
      if (found) {
        lead.owner_first_name = found.first;
        lead.owner_last_name = found.last;
        log.info(`SerpAPI snippet owner found for "${lead.business_name}": ${found.first} ${found.last}`);
        lead.source_secondary = appendSource(lead.source_secondary, 'serpapi');
        return lead;
      }
    }

    log.debug(`SerpAPI: no owner found for "${lead.business_name}"`);
  } catch (err) {
    if (err.response?.status === 429) {
      log.warn('SerpAPI rate limit reached');
    } else {
      log.error(`SerpAPI failed for "${lead.business_name}": ${err.message}`);
    }
  }

  return lead;
}

function appendSource(existing, name) {
  if (!existing) return name;
  if (existing.split(',').includes(name)) return existing;
  return `${existing},${name}`;
}

module.exports = { enrichWithSerpApi };
