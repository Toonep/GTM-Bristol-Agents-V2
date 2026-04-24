// Uses Hunter.io to find and verify professional email addresses for discovered leads.

const axios = require('axios');
const { createLogger } = require('../utils/logger');

const log = createLogger('hunter');
const HUNTER_URL = 'https://api.hunter.io/v2/domain-search';

const OWNER_TITLES = ['owner', 'founder', 'president', 'ceo', 'principal'];

function extractDomain(website) {
  try {
    const normalized = website.startsWith('http') ? website : `https://${website}`;
    const { hostname } = new URL(normalized);
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function pickBestEmail(emails) {
  if (!emails || emails.length === 0) return null;

  const ownerEmail = emails.find(e =>
    OWNER_TITLES.some(t => (e.position || '').toLowerCase().includes(t))
  );

  return ownerEmail || emails[0];
}

async function enrichWithHunter(lead, config) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    log.warn('HUNTER_API_KEY not set — skipping Hunter enrichment');
    return lead;
  }

  // Only invoke when email is missing and a website is available
  if (lead.email_primary !== null || !lead.website) return lead;

  const domain = extractDomain(lead.website);
  if (!domain) {
    log.debug(`Hunter: could not parse domain from "${lead.website}"`);
    return lead;
  }

  log.info(`Hunter domain search (email null): ${domain} for "${lead.business_name}"`);

  try {
    const resp = await axios.get(HUNTER_URL, {
      params: { domain, api_key: apiKey, limit: 5 },
    });

    const emails = resp.data?.data?.emails || [];
    const best = pickBestEmail(emails);

    if (best) {
      lead.email_primary = best.value;

      if (!lead.owner_first_name && best.first_name) {
        lead.owner_first_name = best.first_name;
        lead.owner_last_name = best.last_name || null;
        lead.owner_title = best.position || lead.owner_title;
      }

      log.info(`Hunter found email for "${lead.business_name}": ${best.value}`);
      lead.source_secondary = appendSource(lead.source_secondary, 'hunter');
    } else {
      log.debug(`Hunter: no emails found for domain ${domain}`);
    }
  } catch (err) {
    if (err.response?.status === 429) {
      log.warn('Hunter rate limit reached');
    } else {
      log.error(`Hunter failed for domain "${domain}": ${err.message}`);
    }
  }

  return lead;
}

function appendSource(existing, name) {
  if (!existing) return name;
  if (existing.split(',').includes(name)) return existing;
  return `${existing},${name}`;
}

module.exports = { enrichWithHunter };
