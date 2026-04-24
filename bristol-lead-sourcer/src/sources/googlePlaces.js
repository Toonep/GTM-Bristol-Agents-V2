// Fetches business listings from the Google Places API by city and search term.

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../utils/logger');

const log = createLogger('googlePlaces');
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';
const MAX_PAGES_PER_TERM = 3;

function randomDelay() {
  const ms = 200 + Math.floor(Math.random() * 601);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildBaseRecord(config, city, state) {
  return {
    id: uuidv4(),
    business_name: '',
    owner_first_name: null,
    owner_last_name: null,
    owner_title: null,
    phone_primary: null,
    phone_secondary: null,
    email_primary: null,
    email_secondary: null,
    website: null,
    street_address: null,
    city,
    state,
    zip: null,
    google_place_id: null,
    google_rating: null,
    google_review_count: null,
    employee_count_estimate: null,
    revenue_estimate: null,
    years_in_business: null,
    linkedin_url: null,
    industry: config.industry,
    specialty: config.specialty,
    source_primary: 'google_places',
    source_secondary: null,
    confidence_score: 0,
    date_sourced: new Date().toISOString().split('T')[0],
  };
}

function parseAddressComponents(details) {
  let street = null;
  let zip = null;

  if (details.formatted_address) {
    const parts = details.formatted_address.split(',');
    street = (parts[0] || '').trim() || null;
  }

  if (Array.isArray(details.address_components)) {
    const postal = details.address_components.find(c =>
      c.types.includes('postal_code')
    );
    if (postal) zip = postal.long_name;
  }

  return { street, zip };
}

async function fetchPlaceDetails(placeId, apiKey) {
  const fields = [
    'name',
    'formatted_phone_number',
    'website',
    'formatted_address',
    'place_id',
    'rating',
    'user_ratings_total',
    'address_components',
  ].join(',');

  try {
    const resp = await axios.get(`${PLACES_BASE}/details/json`, {
      params: { place_id: placeId, fields, key: apiKey },
    });
    return resp.data.result || null;
  } catch (err) {
    log.error(`Place details failed for ${placeId}: ${err.message}`);
    return null;
  }
}

async function textSearch(query, apiKey, pageToken) {
  try {
    const params = { query, key: apiKey };
    if (pageToken) params.pagetoken = pageToken;
    const resp = await axios.get(`${PLACES_BASE}/textsearch/json`, { params });
    return resp.data;
  } catch (err) {
    log.error(`Text search failed for "${query}": ${err.message}`);
    return null;
  }
}

async function fetchLeadsForTerm(searchTerm, city, state, apiKey, config) {
  const query = `${searchTerm} ${city} ${state}`;
  log.info(`Google Places search: "${query}"`);

  const leads = [];
  let pageToken = null;
  let pageCount = 0;

  do {
    if (pageToken) {
      // Google requires ~2s before a next_page_token becomes valid
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const data = await textSearch(query, apiKey, pageToken);
    if (!data || !Array.isArray(data.results)) break;

    for (const place of data.results) {
      try {
        await randomDelay();

        const details = await fetchPlaceDetails(place.place_id, apiKey);
        if (!details) continue;

        const { street, zip } = parseAddressComponents(details);
        const lead = buildBaseRecord(config, city, state);

        lead.business_name = details.name || place.name || '';
        lead.phone_primary = details.formatted_phone_number || null;
        lead.website = details.website || null;
        lead.street_address = street;
        lead.zip = zip;
        lead.google_place_id = place.place_id;
        lead.google_rating = details.rating ?? place.rating ?? null;
        lead.google_review_count =
          details.user_ratings_total ?? place.user_ratings_total ?? null;

        leads.push(lead);
      } catch (err) {
        log.error(`Error processing place ${place.place_id}: ${err.message}`);
      }
    }

    pageToken = data.next_page_token || null;
    pageCount++;
  } while (pageToken && pageCount < MAX_PAGES_PER_TERM);

  return leads;
}

async function fetchGooglePlacesLeads(city, state, config) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    log.warn('GOOGLE_PLACES_API_KEY not set — skipping Google Places');
    return [];
  }

  const searchTerms = config.specialty_search_terms && config.specialty_search_terms.length
    ? config.specialty_search_terms
    : [config.specialty];

  const allLeads = [];

  for (const term of searchTerms) {
    try {
      const leads = await fetchLeadsForTerm(term, city, state, apiKey, config);
      log.info(`Google Places: ${leads.length} leads for "${term}" in ${city}, ${state}`);
      allLeads.push(...leads);
    } catch (err) {
      log.error(`Error on term "${term}" in ${city}, ${state}: ${err.message}`);
    }
  }

  return allLeads;
}

module.exports = { fetchGooglePlacesLeads };
