// Prints a run summary to stdout: total leads found, deduped, scored, and written.

const { createLogger } = require('../utils/logger');

const log = createLogger('summarizer');

function printSummary(stats) {
  const {
    startTime,
    endTime,
    totalRaw,
    totalDeduped,
    totalWritten,
    duplicatesFound,
    stateBreakdown,
    config,
    outputFiles,
    apiKeyStatus,
    dryRun,
  } = stats;

  const durationSec = ((endTime - startTime) / 1000).toFixed(1);
  const bar = '─'.repeat(62);

  const lines = [
    '',
    bar,
    `  BRISTOL LEAD SOURCER — RUN SUMMARY${dryRun ? '  [DRY RUN]' : ''}`,
    bar,
    `  Industry   : ${config.industry}`,
    `  Specialty  : ${config.specialty}`,
    `  Search terms: ${(config.specialty_search_terms || [config.specialty]).join(', ')}`,
    `  States     : ${config.target_states.join(', ')}`,
    `  Target     : ${config.leads_target}`,
    bar,
    `  Raw leads collected  : ${totalRaw}`,
    `  Duplicates removed   : ${duplicatesFound}`,
    `  Clean leads written  : ${totalWritten}`,
    `  Duration             : ${durationSec}s`,
    bar,
  ];

  if (stateBreakdown && Object.keys(stateBreakdown).length > 0) {
    lines.push('  Leads by state:');
    for (const [state, count] of Object.entries(stateBreakdown)) {
      lines.push(`    ${state.padEnd(6)}: ${count}`);
    }
    lines.push(bar);
  }

  if (apiKeyStatus) {
    const presentList = apiKeyStatus.present.length ? apiKeyStatus.present.join(', ') : 'none';
    const missingList = apiKeyStatus.missing.length ? apiKeyStatus.missing.join(', ') : 'none';
    lines.push(`  API keys present : ${presentList}`);
    lines.push(`  API keys missing : ${missingList}`);
    lines.push(bar);
  }

  if (outputFiles) {
    lines.push(`  JSON  : ${outputFiles.jsonPath}`);
    lines.push(`  CSV   : ${outputFiles.csvPath}`);
    lines.push(bar);
  }

  lines.push('');
  const summary = lines.join('\n');
  console.log(summary);

  log.info(`Run complete: ${totalWritten} leads written in ${durationSec}s`);
  return summary;
}

module.exports = { printSummary };
