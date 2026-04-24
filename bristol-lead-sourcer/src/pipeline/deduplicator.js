// Removes duplicate leads using fuzzy name/address matching via fast-levenshtein.

const levenshtein = require('fast-levenshtein');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../utils/logger');

const log = createLogger('deduplicator');

// In-memory caches — live for the duration of a single pipeline run
const byPlaceId = new Set();
const byPhone = new Set();
// key: "normalizedName|zip"  →  value: lead id for debug tracing
const byNameZip = new Map();

const duplicateLog = [];

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDuplicate(lead) {
  // Primary: google_place_id — exact match
  if (lead.google_place_id && byPlaceId.has(lead.google_place_id)) {
    log.debug(`Dup by place_id: "${lead.business_name}" (${lead.google_place_id})`);
    duplicateLog.push({ ...lead, duplicate_reason: 'place_id' });
    return true;
  }

  // Secondary: normalized phone number — exact match
  const phone = normalizePhone(lead.phone_primary);
  if (phone && byPhone.has(phone)) {
    log.debug(`Dup by phone: "${lead.business_name}" (${phone})`);
    duplicateLog.push({ ...lead, duplicate_reason: 'phone' });
    return true;
  }

  // Tertiary: fuzzy business_name within same zip code
  if (lead.business_name && lead.zip) {
    const incomingName = normalizeName(lead.business_name);
    for (const [cachedKey] of byNameZip) {
      const [cachedName, cachedZip] = cachedKey.split('|');
      if (cachedZip === lead.zip) {
        const distance = levenshtein.get(incomingName, cachedName);
        if (distance < 3) {
          log.debug(
            `Dup by fuzzy name+zip: "${lead.business_name}" ~ "${cachedName}" ` +
            `zip=${lead.zip} distance=${distance}`
          );
          duplicateLog.push({ ...lead, duplicate_reason: 'fuzzy_name_zip' });
          return true;
        }
      }
    }
  }

  return false;
}

function addToCache(lead) {
  if (lead.google_place_id) byPlaceId.add(lead.google_place_id);

  const phone = normalizePhone(lead.phone_primary);
  if (phone) byPhone.add(phone);

  if (lead.business_name && lead.zip) {
    const key = `${normalizeName(lead.business_name)}|${lead.zip}`;
    byNameZip.set(key, lead.id);
  }
}

function flushDuplicates(outputDir) {
  if (duplicateLog.length === 0) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(outputDir, `duplicates_${timestamp}.json`);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(duplicateLog, null, 2));
    log.info(`Wrote ${duplicateLog.length} duplicate records to ${filePath}`);
  } catch (err) {
    log.error(`Failed to write duplicates file: ${err.message}`);
  }
}

function resetCache() {
  byPlaceId.clear();
  byPhone.clear();
  byNameZip.clear();
  duplicateLog.length = 0;
}

function getCacheStats() {
  return {
    byPlaceId: byPlaceId.size,
    byPhone: byPhone.size,
    byNameZip: byNameZip.size,
    duplicatesFound: duplicateLog.length,
  };
}

module.exports = { isDuplicate, addToCache, flushDuplicates, resetCache, getCacheStats };
