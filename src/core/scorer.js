/**
 * Weighted 5-Pillar Health Scorer.
 * Computes overall database health score (0-100) and per-pillar health breakdown.
 */

const PILLAR_WEIGHTS = {
  schema: 25,
  lock: 20,
  query: 25,
  memory: 15,
  config: 15
};

const SEVERITY_LEVELS = {
  CRITICAL: 'CRITICAL',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

/**
 * Calculates health score from collected audit findings across 5 pillars.
 *
 * @param {Object} pillarFindings - Object mapping pillar keys to lists of issue objects.
 * @returns {Object} Calculated overall health score, grade, and pillar breakdown.
 */
function calculateHealthScore(pillarFindings = {}) {
  const breakdown = {};
  let totalScore = 0;
  const allIssues = [];

  for (const [pillar, maxPoints] of Object.entries(PILLAR_WEIGHTS)) {
    const issues = pillarFindings[pillar] || [];
    let deduction = 0;

    // Group deductions by issue code to enforce group-level cap limits
    const issueCodeCounts = {};

    for (const issue of issues) {
      allIssues.push({ ...issue, pillar });
      const code = issue.code || 'GENERIC';
      issueCodeCounts[code] = (issueCodeCounts[code] || 0) + 1;

      // Deductions by severity
      let itemDeduction = 0.5; // INFO
      if (issue.severity === SEVERITY_LEVELS.CRITICAL) {
        itemDeduction = 6.0;
      } else if (issue.severity === SEVERITY_LEVELS.WARNING) {
        itemDeduction = 2.5;
      }

      // Diminishing penalty for repeated issues of the same type
      const count = issueCodeCounts[code];
      const factor = count === 1 ? 1.0 : count <= 3 ? 0.6 : 0.2;
      deduction += itemDeduction * factor;
    }

    // Pillar deduction cannot exceed the maximum pillar weight
    const finalPillarScore = Math.max(0, Math.round((maxPoints - Math.min(maxPoints, deduction)) * 10) / 10);
    breakdown[pillar] = {
      score: finalPillarScore,
      maxScore: maxPoints,
      percentage: Math.round((finalPillarScore / maxPoints) * 100),
      issueCount: issues.length,
      criticalCount: issues.filter((i) => i.severity === SEVERITY_LEVELS.CRITICAL).length,
      warningCount: issues.filter((i) => i.severity === SEVERITY_LEVELS.WARNING).length,
      infoCount: issues.filter((i) => i.severity === SEVERITY_LEVELS.INFO).length
    };

    totalScore += finalPillarScore;
  }

  const roundedTotal = Math.max(0, Math.min(100, Math.round(totalScore)));

  // Determine health grade
  let grade = 'A';
  let statusText = 'EXCELLENT';
  let color = '#10b981'; // emerald-500

  if (roundedTotal >= 90) {
    grade = 'A+';
    statusText = 'EXCELLENT';
    color = '#10b981';
  } else if (roundedTotal >= 80) {
    grade = 'B';
    statusText = 'GOOD';
    color = '#3b82f6'; // blue-500
  } else if (roundedTotal >= 65) {
    grade = 'C';
    statusText = 'NEEDS OPTIMIZATION';
    color = '#f59e0b'; // amber-500
  } else if (roundedTotal >= 50) {
    grade = 'D';
    statusText = 'HIGH RISK';
    color = '#f97316'; // orange-500
  } else {
    grade = 'F';
    statusText = 'CRITICAL BOTTLENECK';
    color = '#ef4444'; // red-500
  }

  return {
    score: roundedTotal,
    grade,
    statusText,
    color,
    breakdown,
    summary: {
      totalIssues: allIssues.length,
      criticalIssues: allIssues.filter((i) => i.severity === SEVERITY_LEVELS.CRITICAL).length,
      warningIssues: allIssues.filter((i) => i.severity === SEVERITY_LEVELS.WARNING).length,
      infoIssues: allIssues.filter((i) => i.severity === SEVERITY_LEVELS.INFO).length
    }
  };
}

module.exports = {
  PILLAR_WEIGHTS,
  SEVERITY_LEVELS,
  calculateHealthScore
};
