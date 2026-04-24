// Entry point: parses CLI args and orchestrates the full lead sourcing pipeline run.

const { program } = require('commander');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { loadConfig, checkApiKeys } = require('./config');
const { collectLeadsForCity } = require('./pipeline/collector');
const { flushDuplicates, resetCache, getCacheStats } = require('./pipeline/deduplicator');
const { writeOutputs, SCHEMA_FIELDS, normalizeRecord } = require('./output/writer');
const { printSummary } = require('./output/summarizer');
const { getCitiesByState } = require('./utils/cityList');
const { createLogger } = require('./utils/logger');

const log = createLogger('index');

function buildDryRunLead(config) {
  const state = (config.target_states || ['TX'])[0];
  return {
    id: uuidv4(),
    business_name: `Sample ${config.specialty} Business`,
    owner_first_name: 'Jane',
    owner_last_name: 'Smith',
    owner_title: 'Owner',
    phone_primary: '555-000-0001',
    phone_secondary: null,
    email_primary: 'jane@example.com',
    email_secondary: null,
    website: 'https://example.com',
    street_address: '100 Main St',
    city: 'Houston',
    state,
    zip: '77001',
    google_place_id: 'dry-run-place-id',
    google_rating: 4.5,
    google_review_count: 42,
    employee_count_estimate: 5,
    revenue_estimate: null,
    years_in_business: null,
    linkedin_url: null,
    industry: config.industry,
    specialty: config.specialty,
    source_primary: 'dry_run',
    source_secondary: null,
    confidence_score: 85,
    date_sourced: new Date().toISOString().split('T')[0],
  };
}

async function runDryRun(config) {
  const startTime = Date.now();
  log.info('=== DRY RUN — no API calls will be made ===');

  log.info(`Industry    : ${config.industry}`);
  log.info(`Specialty   : ${config.specialty}`);
  log.info(`Search terms: ${(config.specialty_search_terms || [config.specialty]).join(', ')}`);
  log.info(`States      : ${config.target_states.join(', ')}`);
  log.info(`Lead target : ${config.leads_target}`);
  log.info(`Cities/state: ${config.cities_per_state}`);

  // Preview cities for each state
  for (const state of config.target_states) {
    const cities = getCitiesByState(state, config.cities_per_state);
    if (cities.length === 0) {
      log.warn(`Unknown state code: "${state}" — no cities found`);
    } else {
      const preview = cities.slice(0, 3).join(', ');
      log.info(`${state}: ${cities.length} cities queued (${preview}${cities.length > 3 ? '...' : ''})`);
    }
  }

  // API key detection — log presence/absence only, never values
  const apiKeyStatus = checkApiKeys();
  const missingCount = apiKeyStatus.missing.length;
  if (missingCount > 0) {
    log.warn(`${missingCount} API key(s) missing — those sources will be skipped during live runs`);
  }

  // Build synthetic lead and validate all schema fields are present
  const dryRunLead = buildDryRunLead(config);
  const missingFields = SCHEMA_FIELDS.filter(f => !(f in dryRunLead));
  if (missingFields.length > 0) {
    log.error(`SCHEMA VALIDATION FAILED — missing fields: ${missingFields.join(', ')}`);
    process.exit(1);
  }
  log.info(`Schema validation PASSED — all ${SCHEMA_FIELDS.length} required fields present`);

  // Write dry-run output files so schema can be inspected
  const outputFiles = await writeOutputs([dryRunLead], config);

  printSummary({
    startTime,
    endTime: Date.now(),
    totalRaw: 1,
    totalDeduped: 0,
    totalWritten: 1,
    duplicatesFound: 0,
    stateBreakdown: { [dryRunLead.state]: 1 },
    config,
    outputFiles,
    apiKeyStatus,
    dryRun: true,
  });

  log.info('=== DRY RUN COMPLETE ===');
}

async function runLive(config) {
  const startTime = Date.now();
  resetCache();

  log.info('=== LIVE RUN STARTING ===');
  log.info(`Industry: ${config.industry} | Specialty: ${config.specialty}`);
  log.info(`States: ${config.target_states.join(', ')} | Target: ${config.leads_target} leads`);

  const allLeads = [];
  const stateBreakdown = {};
  let targetReached = false;

  for (const state of config.target_states) {
    if (targetReached) break;

    const cities = getCitiesByState(state, config.cities_per_state);
    if (cities.length === 0) {
      log.warn(`No cities found for state "${state}" — skipping`);
      continue;
    }

    stateBreakdown[state] = 0;
    log.info(`${state}: starting — ${cities.length} cities`);

    for (const city of cities) {
      if (allLeads.length >= config.leads_target) {
        log.info(`Lead target reached (${config.leads_target}) — stopping collection`);
        targetReached = true;
        break;
      }

      try {
        const cityLeads = await collectLeadsForCity(city, state, config);
        allLeads.push(...cityLeads);
        stateBreakdown[state] = (stateBreakdown[state] || 0) + cityLeads.length;
        log.info(`${city}, ${state}: +${cityLeads.length} leads | running total: ${allLeads.length}`);
      } catch (err) {
        log.error(`Failed on ${city}, ${state}: ${err.message}`);
      }
    }

    log.info(`${state} complete: ${stateBreakdown[state]} leads`);
  }

  const cacheStats = getCacheStats();
  const outputDir = path.resolve(process.cwd(), config.output_directory);
  flushDuplicates(outputDir);

  const outputFiles = await writeOutputs(allLeads, config);
  const apiKeyStatus = checkApiKeys();

  printSummary({
    startTime,
    endTime: Date.now(),
    totalRaw: allLeads.length + (cacheStats.duplicatesFound || 0),
    totalDeduped: cacheStats.duplicatesFound || 0,
    totalWritten: allLeads.length,
    duplicatesFound: cacheStats.duplicatesFound || 0,
    stateBreakdown,
    config,
    outputFiles,
    apiKeyStatus,
    dryRun: false,
  });
}

async function main() {
  program
    .name('bristol-lead-sourcer')
    .description('Dynamic SMB lead sourcing agent')
    .option('--dry-run', 'validate config and schema without making any API calls')
    .option('--states <states>', 'comma-separated US state codes, e.g. TX,CA,FL')
    .option('--target <number>', 'maximum number of leads to collect')
    .option('--specialty <specialty>', 'override specialty from config.json')
    .option('--industry <industry>', 'override industry from config.json')
    .option('--cities-per-state <number>', 'override cities_per_state from config.json')
    .parse(process.argv);

  const opts = program.opts();

  const config = loadConfig({
    states: opts.states,
    target: opts.target,
    specialty: opts.specialty,
    industry: opts.industry,
    citiesPerState: opts.citiesPerState,
  });

  if (opts.dryRun) {
    await runDryRun(config);
  } else {
    await runLive(config);
  }
}

main().catch(err => {
  const errLog = createLogger('main');
  errLog.error(`Fatal: ${err.message}`);
  errLog.error(err.stack);
  process.exit(1);
});
