// Queries Apollo.io for enriched company and contact data by domain or company name.

const axios = require('axios');
const { createLogger } = require('../utils/logger');

const log = createLogger('apollo');
const APOLLO_BASE = 'https://api.apollo.io/v1';

const OWNER_TITLES = ['owner', 'president', 'ceo', 'founder', 'principal', 'managing member'];

async function searchOrganization(businessName, city, state, apiKey) {
  try {
    const resp = await axios.post(
      `${APOLLO_BASE}/organizations/search`,
      {
        api_key: apiKey,
        q_organization_name: businessName,
        organization_locations: [`${city}, ${state}`],
        page: 1,
        per_page: 1,
      },
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } }
    );
    return resp.data?.organizations?.[0] || null;
  } catch (err) {
    if (err.response?.status === 429) throw err;
    log.warn(`Apollo org search failed for "${businessName}": ${err.message}`);
    return null;
  }
}

async function searchContact(orgId, apiKey) {
  try {
    const resp = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      {
        api_key: apiKey,
        organization_ids: [orgId],
        person_titles: OWNER_TITLES,
        page: 1,
        per_page: 1,
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return resp.data?.people?.[0] || null;
  } catch (err) {
    if (err.response?.status === 429) throw err;
    log.warn(`Apollo people search failed for org ${orgId}: ${err.message}`);
    return null;
  }
}

async function enrichWithApollo(lead, config) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    log.warn('APOLLO_API_KEY not set — skipping Apollo enrichment');
    return lead;
  }

  if (!lead.business_name) return lead;

  try {
    log.debug(`Apollo lookup: "${lead.business_name}", ${lead.city}, ${lead.state}`);

    const org = await searchOrganization(lead.business_name, lead.city, lead.state, apiKey);
    if (!org) {
      log.debug(`No Apollo org match for "${lead.business_name}"`);
      return lead;
    }

    lead.employee_count_estimate = org.estimated_num_employees ?? lead.employee_count_estimate;
    lead.revenue_estimate = org.annual_revenue ?? lead.revenue_estimate;
    lead.linkedin_url = org.linkedin_url || lead.linkedin_url;

    const contact = await searchContact(org.id, apiKey);
    if (contact) {
      lead.owner_first_name = contact.first_name || lead.owner_first_name;
      lead.owner_last_name = contact.last_name || lead.owner_last_name;
      lead.owner_title = contact.title || lead.owner_title;
      lead.email_primary = contact.email || lead.email_primary;
    }

    lead.source_secondary = appendSource(lead.source_secondary, 'apollo');
  } catch (err) {
    if (err.response?.status === 429) {
      log.warn('Apollo rate limit reached — backing off 60s');
      await new Promise(resolve => setTimeout(resolve, 60000));
    } else {
      log.error(`Apollo enrichment error for "${lead.business_name}": ${err.message}`);
    }
  }

  return lead;
}

function appendSource(existing, name) {
  if (!existing) return name;
  if (existing.split(',').includes(name)) return existing;
  return `${existing},${name}`;
}

module.exports = { enrichWithApollo };
