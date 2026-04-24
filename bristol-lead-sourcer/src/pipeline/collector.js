// Coordinates all source modules, aggregates raw results into a unified lead list.

const { fetchGooglePlacesLeads } = require('../sources/googlePlaces');
const { enrichWithApollo } = require('../sources/apollo');
const { enrichWithSerpApi } = require('../sources/serpapi');
const { enrichWithHunter } = require('../sources/hunter');
const { isDuplicate, addToCache } = require('./deduplicator');
const { calculateScore } = require('./scorer');
const { createLogger } = require('../utils/logger');

const log = createLogger('collector');

async function collectLeadsForCity(city, state, config) {
  log.info(`Starting collection: ${city}, ${state}`);

  // Step 1 — Primary source: Google Places builds all base records
  const rawLeads = await fetchGooglePlacesLeads(city, state, config);
  log.info(`Google Places: ${rawLeads.length} raw leads for ${city}, ${state}`);

  const cleanLeads = [];

  for (const lead of rawLeads) {
    try {
      // Step 2 — Deduplication (skip before enrichment to save API quota)
      if (isDuplicate(lead)) continue;

      // Step 3 — Apollo enrichment (always attempt for owner + company data)
      let enriched = await enrichWithApollo(lead, config);

      // Step 4 — SerpAPI gap fill (only when owner still unknown after Apollo)
      if (!enriched.owner_first_name) {
        enriched = await enrichWithSerpApi(enriched, config);
      }

      // Step 5 — Hunter email fallback (only when email missing and website present)
      if (!enriched.email_primary && enriched.website) {
        enriched = await enrichWithHunter(enriched, config);
      }

      // Step 6 — Score the completed record
      enriched.confidence_score = calculateScore(enriched);

      // Step 7 — Register in dedup cache and collect
      addToCache(enriched);
      cleanLeads.push(enriched);
    } catch (err) {
      log.error(`Pipeline error on "${lead.business_name}" (${lead.city}): ${err.message}`);
    }
  }

  log.info(
    `Collection complete: ${city}, ${state} — ` +
    `${cleanLeads.length} clean leads from ${rawLeads.length} raw`
  );

  return cleanLeads;
}

module.exports = { collectLeadsForCity };
