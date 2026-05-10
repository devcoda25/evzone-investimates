const fs = require('fs');

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

function findModel(name) {
  const idx = schema.indexOf('model ' + name + ' {');
  if (idx === -1) return null;
  let start = idx + ('model ' + name + ' {').length;
  let depth = 1;
  let i = start;
  while (i < schema.length && depth > 0) {
    if (schema[i] === '{') depth++;
    if (schema[i] === '}') depth--;
    i++;
  }
  return schema.substring(start, i - 1).trim();
}

const models = ['ComplianceCase', 'Notification', 'Dispute', 'KycApplication', 'KybApplication', 'PaymentIntent', 'PaymentTransaction', 'Payout', 'WatchlistItem', 'ImpactReport', 'Milestone', 'Document'];
models.forEach(m => {
  const content = findModel(m);
  console.log('=== ' + m + ' ===');
  console.log(content || 'NOT FOUND');
  console.log();
});