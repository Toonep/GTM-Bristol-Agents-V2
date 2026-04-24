// Scores each lead for quality and fit based on data completeness and source signals.

const WEIGHTS = {
  business_name: 15,
  phone_primary: 20,
  email_primary: 20,
  owner_first_name: 15,
  website: 10,
  street_address: 10,
  employee_count_estimate: 10,
};

function calculateScore(lead) {
  let score = 0;

  for (const [field, points] of Object.entries(WEIGHTS)) {
    if (lead[field] !== null && lead[field] !== undefined && lead[field] !== '') {
      score += points;
    }
  }

  return Math.min(score, 100);
}

module.exports = { calculateScore, WEIGHTS };
