// Coordinates all source modules, aggregates raw results into a unified lead list.

const { fetchGooglePlacesLeads } = require('../sources/googlePlaces');
const { enrichWithHunter } = require('../sources/hunter');
const { isDuplicate, addToCache } = require('./deduplicator');
const { calculateScore } = require('./scorer');
const { createLogger } = require('../utils/logger');

const log = createLogger('collector');

async function collectLeadsForCity(city, state, config) {
  log.info(`Starting collection: ${city}, ${state}`);

  const rawLeads = await fetchGooglePlacesLeads(city, state, config);
  log.info(`Google Places: ${rawLeads.length} raw leads for ${city}, ${state}`);

  const cleanLeads = [];

  for (const lead of rawLeads) {
    try {
      if (isDuplicate(lead)) continue;

      // Hunter email fallback — only when email missing and website present
      let enriched = lead;
      if (!enriched.email_primary && enriched.website) {
        enriched = await enrichWithHunter(enriched, config);
      }

      enriched.confidence_score = calculateScore(enriched);
      addToCache(enriched);
      cleanLeads.push(enriched);
    } catch (err) {
      log.error(`Pipeline error on "${lead.business_name}" (${lead.city}): ${err.message}`);
    }
  }

  log.info(`Collection complete: ${city}, ${state} — ${cleanLeads.length} clean leads from ${rawLeads.length} raw`);
  return cleanLeads;
}

module.exports = { collectLeadsForCity };
