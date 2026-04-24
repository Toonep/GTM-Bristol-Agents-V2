// Writes the final scored lead list to a CSV file using fast-csv.

const fs = require('fs');
const path = require('path');
const fastCsv = require('fast-csv');
const { createLogger } = require('../utils/logger');

const log = createLogger('writer');

// Canonical field order — must match the lead schema exactly
const SCHEMA_FIELDS = [
  'id',
  'business_name',
  'owner_first_name',
  'owner_last_name',
  'owner_title',
  'phone_primary',
  'phone_secondary',
  'email_primary',
  'email_secondary',
  'website',
  'street_address',
  'city',
  'state',
  'zip',
  'google_place_id',
  'google_rating',
  'google_review_count',
  'employee_count_estimate',
  'revenue_estimate',
  'years_in_business',
  'linkedin_url',
  'industry',
  'specialty',
  'source_primary',
  'source_secondary',
  'confidence_score',
  'date_sourced',
];

function normalizeRecord(lead) {
  const record = {};
  for (const field of SCHEMA_FIELDS) {
    const val = lead[field];
    record[field] = val !== undefined ? val : null;
  }
  return record;
}

function buildFileStem(config) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const specialty = config.specialty.replace(/[\s/]+/g, '_').toLowerCase();
  const states = config.target_states.join('-');
  return `leads_${specialty}_${states}_${ts}`;
}

async function writeCSV(filePath, leads) {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    const stream = fastCsv.format({ headers: SCHEMA_FIELDS });

    ws.on('error', reject);
    stream.on('error', reject);
    ws.on('finish', resolve);

    stream.pipe(ws);
    for (const lead of leads) stream.write(normalizeRecord(lead));
    stream.end();
  });
}

async function writeOutputs(leads, config) {
  const outputDir = path.resolve(process.cwd(), config.output_directory);
  fs.mkdirSync(outputDir, { recursive: true });

  const stem = buildFileStem(config);
  const jsonPath = path.join(outputDir, `${stem}.json`);
  const csvPath = path.join(outputDir, `${stem}.csv`);

  const normalized = leads.map(normalizeRecord);

  fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2));
  log.info(`JSON written: ${jsonPath} (${leads.length} records)`);

  await writeCSV(csvPath, leads);
  log.info(`CSV written: ${csvPath} (${leads.length} records)`);

  return { jsonPath, csvPath, stem };
}

module.exports = { writeOutputs, SCHEMA_FIELDS, normalizeRecord };
