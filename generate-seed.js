const fs = require('fs');
const path = require('path');

const seedCode = `
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const PASS = {
  admin: 'Admin123!',
  compliance: 'Compliance123!',
  support: 'Support123!',
  investor1: 'Investor123!',
  investor2: 'Margaret456!',
  investor3: 'Rajesh789!',
  entrepreneur1: 'Entrepreneur123!',
  entrepreneur2: 'Fatima456!',
  assessor1: 'Provider123!',
  assessor2: 'Nadia456!',
  assessor3: 'Omar789!',
};

async function createUser(input) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {},
    create: {
      email: input.email,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      countryCode: input.countryCode,
    },
  });
  await prisma.userTenantMembership.upsert({
    where: { userId_tenantId_role: { userId: user.id, tenantId: input.tenantId, role: input.role } },
    update: {},
    create: { userId: user.id, tenantId: input.tenantId, role: input.role },
  });
  return user;
}

async function getOrCreateLedgerAccount(params) {
  return prisma.ledgerAccount.upsert({
    where: { tenantId_ownerType_ownerId_currency_name: params },
    update: {},
    create: params,
  });
}

async function main() {
  console.log('Starting seed...');

  const platformTenant = await prisma.tenant.upsert({
    where: { slug: 'evzone-platform' },
    update: {},
    create: { name: 'EVzone Platform', slug: 'evzone-platform', type: 'PLATFORM', countryCode: 'UG' },
  });

  console.log('Seeding platform users...');
  const admin = await createUser({ tenantId: platformTenant.id, email: 'admin@evzone.com', passwordHash: await bcrypt.hash(PASS.admin, 12), firstName: 'EVzone', lastName: 'Admin', role: 'SUPER_ADMIN', countryCode: 'UG' });
  const complianceOfficer = await createUser({ tenantId: platformTenant.id, email: 'compliance@evzone.com', passwordHash: await bcrypt.hash(PASS.compliance, 12), firstName: 'Compliance', lastName: 'Officer', role: 'COMPLIANCE_OFFICER', countryCode: 'UG' });
  await createUser({ tenantId: platformTenant.id, email: 'support@evzone.com', passwordHash: await bcrypt.hash(PASS.support, 12), firstName: 'Support', lastName: 'Agent', role: 'SUPPORT_AGENT', countryCode: 'UG' });

  console.log('Seeding investors...');
  const investor1 = await createUser({ tenantId: platformTenant.id, email: 'sarah.chen@email.com', passwordHash: await bcrypt.hash(PASS.investor1, 12), firstName: 'Sarah', lastName: 'Chen', role: 'INVESTOR', countryCode: 'US' });
  await prisma.investorProfile.upsert({ where: { userId: investor1.id }, update: {}, create: { userId: investor1.id, investorType: 'INDIVIDUAL', riskTolerance: 'MODERATE', annualIncome: '120000', netWorth: '500000', accreditationStatus: true, preferredSectors: ['SOLAR', 'WIND'], investmentGoals: ['Impact returns', 'Portfolio diversification'], totalInvested: '75000', totalReturns: '5000', activeInvestments: 2, completedInvestments: 1, esgPreferences: { priority: ['climate', 'social'] } } });

  const investor2 = await createUser({ tenantId: platformTenant.id, email: 'margaret.okafor@email.com', passwordHash: await bcrypt.hash(PASS.investor2, 12), firstName: 'Margaret', lastName: 'Okafor', role: 'INVESTOR', countryCode: 'NG' });
  await prisma.investorProfile.upsert({ where: { userId: investor2.id }, update: {}, create: { userId: investor2.id, investorType: 'INSTITUTIONAL', riskTolerance: 'AGGRESSIVE', annualIncome: '2500000', netWorth: '15000000', accreditationStatus: true, preferredSectors: ['HYDRO', 'GREEN_HYDROGEN', 'BIOMASS'], investmentGoals: ['Large-scale impact', 'Long-term returns'], totalInvested: '2000000', totalReturns: '180000', activeInvestments: 4, completedInvestments: 3, esgPreferences: { priority: ['governance', 'climate'] } } });

  const investor3 = await createUser({ tenantId: platformTenant.id, email: 'rajesh.patel@email.com', passwordHash: await bcrypt.hash(PASS.investor3, 12), firstName: 'Rajesh', lastName: 'Patel', role: 'INVESTOR', countryCode: 'KE' });
  await prisma.investorProfile.upsert({ where: { userId: investor3.id }, update: {}, create: { userId: investor3.id, investorType: 'IMPACT_FUND', riskTolerance: 'CONSERVATIVE', annualIncome: '800000', netWorth: '5000000', accreditationStatus: true, preferredSectors: ['SOLAR', 'ENERGY_STORAGE', 'EV_CHARGING'], investmentGoals: ['Steady returns', 'Climate impact'], totalInvested: '350000', totalReturns: '28000', activeInvestments: 1, completedInvestments: 2, esgPreferences: { priority: ['environment', 'climate'] } } });

  console.log('Seeding entrepreneurs...');
  const entrepreneur1 = await createUser({ tenantId: platformTenant.id, email: 'amina.osei@email.com', passwordHash: await bcrypt.hash(PASS.entrepreneur1, 12), firstName: 'Amina', lastName: 'Osei', role: 'ENTREPRENEUR', countryCode: 'UG' });
  await prisma.entrepreneurProfile.upsert({ where: { userId: entrepreneur1.id }, update: {}, create: { userId: entrepreneur1.id, companyName: 'SunHarvest Microgrids', industry: 'Renewable Energy', stage: 'EARLY_REVENUE', companyRegistration: 'UG-CORP-2023-0042', companyWebsite: 'https://sunharvest.co.ug', foundedYear: 2021, teamSize: 18, previousFunding: '150000', totalRaised: '350000', activeCampaigns: 1, completedCampaigns: 1, pitchDeck: 'https://storage.evzone.com/decks/sunharvest-pitch.pdf' } });

  const entrepreneur2 = await createUser({ tenantId: platformTenant.id, email: 'fatima.ibrahim@email.com', passwordHash: await bcrypt.hash(PASS.entrepreneur2, 12), firstName: 'Fatima', lastName: 'Ibrahim', role: 'ENTREPRENEUR', countryCode: 'GH' });
  await prisma.entrepreneurProfile.upsert({ where: { userId: entrepreneur2.id }, update: {}, create: { userId: entrepreneur2.id, companyName: 'GreenWave Biogas', industry: 'Clean Energy', stage: 'GROWTH', companyRegistration: 'GH-REG-2022-0115', companyWebsite: 'https://greenwavebiogas.com', foundedYear: 2020, teamSize: 35, previousFunding: '500000', totalRaised: '1200000', activeCampaigns: 2, completedCampaigns: 2, pitchDeck: 'https://storage.evzone.com/decks/greenwave-pitch.pdf' } });

  console.log('Seeding assessors...');
  const assessor1 = await createUser({ tenantId: platformTenant.id, email: 'dr.kwame@email.com', passwordHash: await bcrypt.hash(PASS.assessor1, 12), firstName: 'Kwame', lastName: 'Asante', role: 'ASSESSOR', countryCode: 'UG' });
  await prisma.assessorProfile.upsert({ where: { userId: assessor1.id }, update: {}, create: { userId: assessor1.id, organizationName: 'Asante Green Due Diligence', organizationType: 'FIRM', specialties: ['ESG', 'FINANCIAL', 'TECHNICAL'], yearsOfExperience: 12, serviceRegions: ['UG', 'KE', 'GH', 'NG'], insuranceValid: true, tier: 'Gold', rating: 4.8, avgTurnaround: 14, completedEngagements: 47, licenseExpiry: new Date('2026-12-31'), bio: 'Senior ESG consultant with 12 years in African green finance.', availabilityStatus: 'AVAILABLE', hourlyRate: 150 } });

  const assessor2 = await createUser({ tenantId: platformTenant.id, email: 'nadia.kovacs@email.com', passwordHash: await bcrypt.hash(PASS.assessor2, 12), firstName: 'Nadia', lastName: 'Kovacs', role: 'ASSESSOR', countryCode: 'HU' });
  await prisma.assessorProfile.upsert({ where: { userId: assessor2.id }, update: {}, create: { userId: assessor2.id, organizationName: 'Kovacs Climate Analytics', organizationType: 'FIRM', specialties: ['TECHNICAL', 'FINANCIAL', 'MARKET'], yearsOfExperience: 8, serviceRegions: ['EU', 'HU', 'DE', 'AT'], insuranceValid: true, tier: 'Silver', rating: 4.5, avgTurnaround: 10, completedEngagements: 28, licenseExpiry: new Date('2026-09-30'), bio: 'Climate risk analyst specializing in European green hydrogen projects.', availabilityStatus: 'AVAILABLE', hourlyRate: 180 } });

  const assessor3 = await createUser({ tenantId: platformTenant.id, email: 'omar.yusuf@email.com', passwordHash: await bcrypt.hash(PASS.assessor3, 12), firstName: 'Omar', lastName: 'Yusuf', role: 'ASSESSOR', countryCode: 'KE' });
  await prisma.assessorProfile.upsert({ where: { userId: assessor3.id }, update: {}, create: { userId: assessor3.id, organizationName: 'Yusuf Independent Consulting', organizationType: 'INDIVIDUAL_CONSULTANT', specialties: ['LEGAL', 'ESG', 'GOVERNANCE'], yearsOfExperience: 15, serviceRegions: ['KE', 'TZ', 'RW', 'UG'], insuranceValid: true, tier: 'Platinum', rating: 4.9, avgTurnaround: 7, completedEngagements: 63, licenseExpiry: new Date('2027-03-31'), bio: 'Legal and ESG compliance expert for East African infrastructure.', availabilityStatus: 'AVAILABLE', hourlyRate: 200 } });

  console.log('Seeding projects...');
  const project1 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: platformTenant.id, slug: 'sunharvest-microgrids' } }, update: {}, create: { tenantId: platformTenant.id, ownerUserId: entrepreneur1.id, title: 'SunHarvest Microgrids', slug: 'sunharvest-microgrids', summary: 'Solar microgrids for productive-use energy in East Africa.', description: 'A portfolio of solar microgrids serving small businesses and homes in rural Uganda.', longDescription: 'SunHarvest Microgrids deploys containerized solar microgrid solutions across East Africa.', country: 'Uganda', countryCode: 'UG', city: 'Kampala', region: 'Central Region', coordinates: '0.3476, 32.5825', locationDescription: 'Greater Kampala Metropolitan Area', sector: 'SOLAR', stage: 'FEASIBILITY', status: 'ACTIVE', fundingTarget: '500000', fundingRaised: '0', minInvestment: '100', maxInvestment: '50000', currency: 'USD', equityOffered: '15', valuation: '3500000', structure: 'Revenue share with buyback option', returnTarget: '12', expectedImpact: { co2AvoidedTonnes: 1200, householdsServed: 4000, jobsCreated: 85, mwInstalled: 2.5 }, impactMetrics: { co2Avoided: 1200, householdsServed: 4000 }, sdgs: [7, 8, 13], risks: { regulatory: 'Medium', currency: 'Medium', technology: 'Low' }, teamMembers: [{ name: 'Amina Osei', role: 'CEO' }, { name: 'James Okello', role: 'CTO' }], listedAt: new Date('2026-01-15'), viewCount: 1247, featured: true, featuredOrder: 1 } });

  const project2 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: platformTenant.id, slug: 'lakewind-energy' } }, update: {}, create: { tenantId: platformTenant.id, ownerUserId: entrepreneur2.id, title: 'LakeWind Energy Turbines', slug: 'lakewind-energy', summary: 'Small-scale wind turbines for Lake Victoria fishing communities.', description: 'Deploying 50 small wind turbines across Lake Victoria fishing communities.', country: 'Kenya', countryCode: 'KE', city: 'Kisumu', region: 'Nyanza', coordinates: '-0.0917, 34.7680', locationDescription: 'Lake Victoria shoreline, Kisumu County', sector: 'WIND', stage: 'CONSTRUCTION', status: 'DRAFT', fundingTarget: '750000', fundingRaised: '0', minInvestment: '200', maxInvestment: '25000', currency: 'USD', equityOffered: '20', valuation: '4000000', structure: 'Equity stake with annual dividends', returnTarget: '15', expectedImpact: { co2AvoidedTonnes: 3500, householdsServed: 8000, jobsCreated: 200, mwInstalled: 7.5 }, sdgs: [7, 8, 14], risks: { regulatory: 'Low', currency: 'Medium', technology: 'Low' }, teamMembers: [{ name: 'Fatima Ibrahim', role: 'CEO' }, { name: 'David Otieno', role: 'Operations' }], viewCount: 342, featured: false } });

  const project3 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: platformTenant.id, slug: 'biowaste-ghana' } }, update: {}, create: { tenantId: platformTenant.id, ownerUserId: entrepreneur2.id, title: 'BioWaste Ghana - Composting Network', slug: 'biowaste-ghana', summary: 'Urban organic waste composting network in Accra.', description: 'Building a network of community composting facilities across Accra.', country: 'Ghana', countryCode: 'GH', city: 'Accra', region: 'Greater Accra', coordinates: '5.6037, -0.1870', locationDescription: 'Accra Metropolitan Area', sector: 'BIOMASS', stage: 'FEASIBILITY', status: 'SUBMITTED', fundingTarget: '300000', fundingRaised: '0', minInvestment: '50', maxInvestment: '10000', currency: 'USD', equityOffered: '10', valuation: '1500000', structure: 'Revenue share', returnTarget: '18', expectedImpact: { wasteDivertedTonnes: 5000, compostProducedTonnes: 2000, jobsCreated: 120, co2AvoidedTonnes: 800 }, sdgs: [11, 12, 13], risks: { regulatory: 'Low', currency: 'Medium', technology: 'Low' }, teamMembers: [{ name: 'Fatima Ibrahim', role: 'CEO' }, { name: 'Kwame Mensah', role: 'Operations Manager' }], viewCount: 156, featured: false } });

  const project4 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: platformTenant.id, slug: 'rift-valley-geothermal' } }, update: {}, create: { tenantId: platformTenant.id, ownerUserId: entrepreneur1.id, title: 'Rift Valley Geothermal Pilot', slug: 'rift-valley-geothermal', summary: 'Geothermal energy pilot in the Kenyan Rift Valley.', description: 'A 2MW geothermal pilot plant exploring low-temperature geothermal resources.', country: 'Kenya', countryCode: 'KE', city: 'Nakuru', region: 'Rift Valley', coordinates: '-0.2833, 36.0667', locationDescription: 'Nakuru County, Kenya', sector: 'GREEN_HYDROGEN', stage: 'CONSTRUCTION', status: 'UNDER_REVIEW', fundingTarget: '1200000', fundingRaised: '0', minInvestment: '500', maxInvestment: '100000', currency: 'USD', equityOffered: '25', valuation: '8000000', structure: 'Equity + royalty', returnTarget: '20', expectedImpact: { mwInstalled: 2, householdsServed: 15000, jobsCreated: 300, co2AvoidedTonnes: 15000 }, sdgs: [7, 8, 13], risks: { regulatory: 'High', currency: 'Medium', technology: 'Medium' }, teamMembers: [{ name: 'Amina Osei', role: 'Project Lead' }, { name: 'Dr. John Mwangi', role: 'Geologist' }], viewCount: 89, featured: false } });

  const project5 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: platformTenant.id, slug: 'solar-irrigation-ethiopia' } }, update: {}, create: { tenantId: platformTenant.id, ownerUserId: entrepreneur1.id, title: 'Solar Irrigation Ethiopia', slug: 'solar-irrigation-ethiopia', summary: 'Solar-powered irrigation for smallholder farmers in Ethiopia.', description: 'Deploying solar-powered drip irrigation for 500 smallholder farmers.', country: 'Ethiopia', countryCode: 'ET', city: 'Bahir Dar', sector: 'SOLAR', stage: 'OPERATIONAL', status: 'DUE_DILIGENCE', fundingTarget: '400000', fundingRaised: '0', minInvestment: '250', maxInvestment: '50000', currency: 'USD', equityOffered: '18', valuation: '2500000', structure: 'Equity with revenue share', returnTarget: '14', expectedImpact: { farmersSupported: 500, hectaresIrrigated: 200, cropYieldIncrease: '40%', co2AvoidedTonnes: 600 }, sdgs: [2, 6, 7, 13], risks: { regulatory: 'Medium', currency: 'High', technology: 'Low' }, viewCount: 56, featured: false } });

  const project6 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: platformTenant.id, slug: 'waste2energy-nigeria' } }, update: {}, create: { tenantId: platformTenant.id, ownerUserId: entrepreneur2.id, title: 'Waste2Energy Nigeria', slug: 'waste2energy-nigeria', summary: 'Converting urban waste to clean energy in Lagos.', description: 'A waste-to-energy plant in Lagos converting 500 tons of municipal waste daily.', country: 'Nigeria', countryCode: 'NG', city: 'Lagos', region: 'Lagos', coordinates: '6.5244, 3.3792', locationDescription: 'Lagos Mainland', sector: 'BIOMASS', stage: 'OPERATIONAL', status: 'APPROVED', fundingTarget: '2000000', fundingRaised: '0', minInvestment: '500', maxInvestment: '100000', currency: 'USD', equityOffered: '22', valuation: '12000000', structure: 'Equity stake', returnTarget: '16', expectedImpact: { wasteProcessedTonnes: 182500, mwInstalled: 10, householdsServed: 50000, jobsCreated: 400, co2AvoidedTonnes: 25000 }, sdgs: [7, 8, 11, 13], risks: { regulatory: 'Medium', currency: 'High', technology: 'Medium' }, viewCount: 2103, featured: true, featuredOrder: 2 } });

  console.log('Seeding deals...');
  await prisma.deal.upsert({ where: { id: '00000000-0000-0000-0000-000000000001' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000001', tenantId: platformTenant.id, projectId: project1.id, title: 'SunHarvest Seed Raise', status: 'LIVE', minInvestment: '100', targetAmount: '500000', maxAmount: '750000', opensAt: new Date('2026-01-15'), closesAt: new Date('2026-07-15'), currency: 'USD' } });
  await prisma.deal.upsert({ where: { id: '00000000-0000-0000-0000-000000000002' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000002', tenantId: platformTenant.id, projectId: project6.id, title: 'Waste2Energy Series A', status: 'COMPLIANCE_REVIEW', minInvestment: '500', targetAmount: '2000000', maxAmount: '3000000', opensAt: new Date('2026-04-01'), closesAt: new Date('2026-09-30'), currency: 'USD' } });
  await prisma.deal.upsert({ where: { id: '00000000-0000-0000-0000-000000000003' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000003', tenantId: platformTenant.id, projectId: project2.id, title: 'LakeWind Energy Phase 1', status: 'APPROVED', minInvestment: '200', targetAmount: '750000', maxAmount: '1000000', opensAt: new Date('2026-05-01'), closesAt: new Date('2026-11-30'), currency: 'USD' } });

  console.log('Seeding investments...');
  const inv1 = await prisma.investment.upsert({ where: { investorUserId_idempotencyKey: { investorUserId: investor1.id, idempotencyKey: 'inv-sarah-001' } }, update: {}, create: { tenantId: platformTenant.id, dealId: '00000000-0000-0000-0000-000000000001', projectId: project1.id, investorUserId: investor1.id, amount: '15000', currency: 'USD', status: 'CONFIRMED', idempotencyKey: 'inv-sarah-001', paymentMethod: 'BANK_TRANSFER', confirmedAt: new Date('2026-02-01') } });
  const inv2 = await prisma.investment.upsert({ where: { investorUserId_idempotencyKey: { investorUserId: investor1.id, idempotencyKey: 'inv-sarah-002' } }, update: {}, create: { tenantId: platformTenant.id, dealId: '00000000-0000-0000-0000-000000000001', projectId: project1.id, investorUserId: investor1.id, amount: '25000', currency: 'USD', status: 'CONFIRMED', idempotencyKey: 'inv-sarah-002', paymentMethod: 'BANK_TRANSFER', confirmedAt: new Date('2026-02-15') } });
  const inv3 = await prisma.investment.upsert({ where: { investorUserId_idempotencyKey: { investorUserId: investor2.id, idempotencyKey: 'inv-margaret-001' } }, update: {}, create: { tenantId: platformTenant.id, dealId: '00000000-0000-0000-0000-000000000001', projectId: project1.id, investorUserId: investor2.id, amount: '100000', currency: 'USD', status: 'PENDING_PAYMENT', idempotencyKey: 'inv-margaret-001', paymentMethod: 'MOBILE_MONEY' } });
  const inv4 = await prisma.investment.upsert({ where: { investorUserId_idempotencyKey: { investorUserId: investor3.id, idempotencyKey: 'inv-rajesh-001' } }, update: {}, create: { tenantId: platformTenant.id, dealId: '00000000-0000-0000-0000-000000000001', projectId: project1.id, investorUserId: investor3.id, amount: '50000', currency: 'USD', status: 'PENDING_COMPLIANCE', idempotencyKey: 'inv-rajesh-001', paymentMethod: 'BANK_TRANSFER' } });

  console.log('Seeding ledger accounts...');
  const investorCashAccount = await getOrCreateLedgerAccount({ tenantId: platformTenant.id, ownerType: 'USER', ownerId: investor1.id, currency: 'USD', name: 'Investor Cash Pending' });
  const projectFundingAccount = await getOrCreateLedgerAccount({ tenantId: platformTenant.id, ownerType: 'PROJECT', ownerId: project1.id, currency: 'USD', name: 'Project Funding Balance' });
  const escrowAccount = await getOrCreateLedgerAccount({ tenantId: platformTenant.id, ownerType: 'PROJECT', ownerId: project1.id, currency: 'USD', name: 'Escrow Liability' });

  console.log('Seeding transactions & ledger entries...');
  const tx1 = await prisma.transaction.create({ data: { tenantId: platformTenant.id, userId: investor1.id, investmentId: inv1.id, projectId: project1.id, type: 'INVESTMENT', amount: '15000', currency: 'USD', status: 'COMPLETED', paymentMethod: 'BANK_TRANSFER', jurisdiction: 'US', processedAt: new Date('2026-02-01') } });
  await prisma.ledgerEntry.createMany({ data: [
    { tenantId: platformTenant.id, accountId: investorCashAccount.id, transactionId: tx1.id, direction: 'DEBIT', amount: '15000', currency: 'USD', memo: 'Investment - SunHarvest' },
    { tenantId: platformTenant.id, accountId: escrowAccount.id, transactionId: tx1.id, direction: 'CREDIT', amount: '15000', currency: 'USD', memo: 'Escrow - SunHarvest' },
  ]});
  const tx2 = await prisma.transaction.create({ data: { tenantId: platformTenant.id, userId: investor1.id, investmentId: inv2.id, projectId: project1.id, type: 'INVESTMENT', amount: '25000', currency: 'USD', status: 'COMPLETED', paymentMethod: 'BANK_TRANSFER', jurisdiction: 'US', processedAt: new Date('2026-02-15') } });
  await prisma.ledgerEntry.createMany({ data: [
    { tenantId: platformTenant.id, accountId: investorCashAccount.id, transactionId: tx2.id, direction: 'DEBIT', amount: '25000', currency: 'USD', memo: 'Investment - SunHarvest' },
    { tenantId: platformTenant.id, accountId: escrowAccount.id, transactionId: tx2.id, direction: 'CREDIT', amount: '25000', currency: 'USD', memo: 'Escrow - SunHarvest' },
  ]});

  console.log('Seeding due diligence cases...');
  const ddCase1 = await prisma.dueDiligenceCase.upsert({ where: { projectId: project1.id }, update: {}, create: { tenantId: platformTenant.id, projectId: project1.id, assignedAssessorId: assessor1.id, status: 'ASSIGNED', assignedAt: new Date('2026-01-20'), dueAt: new Date('2026-03-20'), notes: 'Initial review of solar microgrid portfolio', assessments: { financial: { status: 'pending' }, technical: { status: 'in_progress' }, legal: { status: 'pending' }, esg: { status: 'pending' } } } });
  const ddCase2 = await prisma.dueDiligenceCase.upsert({ where: { projectId: project5.id }, update: {}, create: { tenantId: platformTenant.id, projectId: project5.id, assignedAssessorId: assessor3.id, status: 'IN_PROGRESS', assignedAt: new Date('2026-03-01'), dueAt: new Date('2026-04-30'), startedAt: new Date('2026-03-05'), notes: 'Technical feasibility study underway', assessments: { financial: { status: 'in_progress' }, technical: { status: 'in_progress' }, legal: { status: 'pending' }, esg: { status: 'pending' } } } });

  console.log('Seeding due diligence tasks...');
  await prisma.dueDiligenceTask.createMany({ data: [
    { caseId: ddCase1.id, category: 'FINANCIAL', title: 'Review financial projections', status: 'IN_PROGRESS', assignedToUserId: assessor1.id, dueAt: new Date('2026-02-28') },
    { caseId: ddCase1.id, category: 'TECHNICAL', title: 'Technical site assessment', status: 'OPEN', assignedToUserId: assessor1.id, dueAt: new Date('2026-03-15') },
    { caseId: ddCase1.id, category: 'LEGAL', title: 'Land title verification', status: 'OPEN', assignedToUserId: assessor1.id, dueAt: new Date('2026-03-20') },
    { caseId: ddCase2.id, category: 'FINANCIAL', title: 'Evaluate revenue model', status: 'IN_PROGRESS', assignedToUserId: assessor3.id, dueAt: new Date('2026-04-15') },
    { caseId: ddCase2.id, category: 'TECHNICAL', title: 'Solar resource assessment', status: 'IN_PROGRESS', assignedToUserId: assessor3.id, dueAt: new Date('2026-04-20') },
  ]});

  console.log('Seeding media assets...');
  await prisma.mediaAsset.createMany({ data: [
    { tenantId: platformTenant.id, projectId: project1.id, ownerUserId: entrepreneur1.id, bucket: 'evzone-prod-assets', objectKey: 'tenants/PLAT/proj/sunharvest/gallery/cover-1/original.webp', contentType: 'image/webp', sizeBytes: 245760, status: 'READY', purpose: 'PROJECT_COVER', width: 1200, height: 630, altText: 'SunHarvest cover', sortOrder: 0 },
    { tenantId: platformTenant.id, projectId: project1.id, ownerUserId: entrepreneur1.id, bucket: 'evzone-prod-assets', objectKey: 'tenants/PLAT/proj/sunharvest/gallery/img-1/original.webp', contentType: 'image/webp', sizeBytes: 184320, status: 'READY', purpose: 'PROJECT_GALLERY', width: 1920, height: 1080, altText: 'Solar installation', sortOrder: 1 },
    { tenantId: platformTenant.id, projectId: project6.id, ownerUserId: entrepreneur2.id, bucket: 'evzone-prod-assets', objectKey: 'tenants/PLAT/proj/waste2energy/gallery/cover-1/original.webp', contentType: 'image/webp', sizeBytes: 311296, status: 'READY', purpose: 'PROJECT_COVER', width: 1200, height: 630, altText: 'Waste2Energy cover', sortOrder: 0 },
  ]});

  console.log('Seeding compliance cases...');
  await prisma.complianceCase.createMany({ data: [
    { tenantId: platformTenant.id, userId: investor1.id, status: 'APPROVED', riskRating: 'LOW', decidedBy: complianceOfficer.id, decidedAt: new Date('2026-01-10'), metadata: { accredited: true, kycVerified: true, sanctionsClear: true }, reason: 'Investor fully verified and accredited' },
    { tenantId: platformTenant.id, userId: investor3.id, status: 'OPEN', riskRating: 'MEDIUM', reason: 'Pending enhanced due diligence' },
  ]});

  console.log('Seeding notifications...');
  await prisma.notification.createMany({ data: [
    { tenantId: platformTenant.id, userId: investor1.id, type: 'INVESTMENT_UPDATE', title: 'Investment Confirmed', message: 'Your investment of $15,000 in SunHarvest Microgrids has been confirmed.', data: { investmentId: inv1.id, dealId: '00000000-0000-0000-0000-000000000001', amount: '15000' }, channels: ['in_app', 'email'] },
    { tenantId: platformTenant.id, userId: investor1.id, type: 'PROJECT_UPDATE', title: 'Project Milestone Update', message: 'SunHarvest Microgrids has reached a new milestone.', data: { projectId: project1.id }, channels: ['in_app'] },
    { tenantId: platformTenant.id, userId: investor2.id, type: 'DUE_DILIGENCE', title: 'Due Diligence Required', message: 'A due diligence case has been opened for Solar Irrigation Ethiopia.', data: { projectId: project5.id, caseId: ddCase2.id }, channels: ['in_app', 'email'] },
    { tenantId: platformTenant.id, userId: entrepreneur1.id, type: 'PROJECT_UPDATE', title: 'Project Under Review', message: 'Your project Rift Valley Geothermal Pilot is now under review.', data: { projectId: project4.id }, channels: ['in_app', 'email'] },
    { tenantId: platformTenant.id, userId: entrepreneur2.id, type: 'PROJECT_UPDATE', title: 'Project Submitted', message: 'Your project BioWaste Ghana has been submitted for review.', data: { projectId: project3.id }, channels: ['in_app'] },
  ]});

  console.log('Seeding audit logs...');
  await prisma.auditLog.createMany({ data: [
    { tenantId: platformTenant.id, userId: admin.id, action: 'USER_CREATED', entityType: 'user', entityId: investor1.id, newValues: { email: 'sarah.chen@email.com', role: 'INVESTOR' }, metadata: { source: 'seed' } },
    { tenantId: platformTenant.id, userId: admin.id, action: 'PROJECT_CREATED', entityType: 'project', entityId: project1.id, newValues: { title: 'SunHarvest Microgrids', status: 'ACTIVE' }, metadata: { source: 'seed' } },
    { tenantId: platformTenant.id, userId: admin.id, action: 'PROJECT_SUBMITTED', entityType: 'project', entityId: project3.id, newValues: { title: 'BioWaste Ghana', status: 'SUBMITTED' }, metadata: { source: 'seed' } },
    { tenantId: platformTenant.id, userId: complianceOfficer.id, action: 'COMPLIANCE_REVIEW', entityType: 'compliance_case', entityId: 'pending', newValues: { status: 'APPROVED', userId: investor1.id }, metadata: { source: 'seed' } },
    { tenantId: platformTenant.id, userId: investor1.id, action: 'INVESTMENT_CREATED', entityType: 'investment', entityId: inv1.id, newValues: { amount: '15000', currency: 'USD', dealId: '00000000-0000-0000-0000-000000000001' }, metadata: { source: 'seed' } },
    { tenantId: platformTenant.id, userId: investor1.id, action: 'INVESTMENT_CREATED', entityType: 'investment', entityId: inv2.id, newValues: { amount: '25000', currency: 'USD', dealId: '00000000-0000-0000-0000-000000000001' }, metadata: { source: 'seed' } },
    { tenantId: platformTenant.id, userId: admin.id, action: 'DEAL_CREATED', entityType: 'deal', entityId: '00000000-0000-0000-0000-000000000001', newValues: { title: 'SunHarvest Seed Raise', status: 'LIVE' }, metadata: { source: 'seed' } },
    { tenantId: platformTenant.id, userId: admin.id, action: 'ASSESSOR_ASSIGNED', entityType: 'due_diligence', entityId: ddCase1.id, newValues: { assignedAssessorId: assessor1.id, status: 'ASSIGNED' }, metadata: { source: 'seed' } },
  ]});

  console.log('Seeding watchlist items...');
  await prisma.watchlistItem.createMany({ data: [
    { userId: investor1.id, dealId: '00000000-0000-0000-0000-000000000001', tenantId: platformTenant.id },
    { userId: investor2.id, dealId: '00000000-0000-0000-0000-000000000002', tenantId: platformTenant.id },
  ]});

  console.log('Seeding disputes...');
  await prisma.dispute.createMany({ data: [
    { tenantId: platformTenant.id, type: 'PAYMENT', status: 'OPEN', title: 'Payment delay for investment #1', description: 'Investor reports delayed payment confirmation for investment inv-sarah-001.', initiatorId: investor1.id, entityType: 'investment', entityId: inv1.id, evidence: { transactionId: tx1.id, expectedDate: '2026-02-02' } },
  ]});

  console.log('Seeding payment intents...');
  await prisma.paymentIntent.createMany({ data: [
    { tenantId: platformTenant.id, investmentId: inv3.id, dealId: '00000000-0000-0000-0000-000000000001', userId: investor2.id, provider: 'FLUTTERWAVE', direction: 'COLLECTION', purpose: 'INVESTMENT_FUNDING', internalReference: 'PAY-INV-MARGARET-001', amount: '100000', currency: 'USD', status: 'PENDING', checkoutUrl: 'https://pay.example.com/pay-001', expiresAt: new Date('2026-03-15') },
    { tenantId: platformTenant.id, investmentId: inv4.id, dealId: '00000000-0000-0000-0000-000000000001', userId: investor3.id, provider: 'FLUTTERWAVE', direction: 'COLLECTION', purpose: 'INVESTMENT_FUNDING', internalReference: 'PAY-INV-RAJESH-001', amount: '50000', currency: 'USD', status: 'PENDING', checkoutUrl: 'https://pay.example.com/pay-002', expiresAt: new Date('2026-03-20') },</tool_call>}