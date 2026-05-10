const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function u(user) {
  const { tenantId, role, ...userData } = user;
  const u = await prisma.user.upsert({
    where: { email: userData.email },
    update: {},
    create: { ...userData, status: 'ACTIVE', kycStatus: 'VERIFIED' }
  });
  await prisma.userTenantMembership.upsert({
    where: { userId_tenantId_role: { userId: u.id, tenantId: tenantId, role: role } },
    update: {}, create: { userId: u.id, tenantId: tenantId, role: role }
  });
  return u;
}

async function main() {
  const t = await prisma.tenant.upsert({
    where: { slug: 'evzone-platform' }, update: {},
    create: { name: 'EVzone Platform', slug: 'evzone-platform', type: 'PLATFORM', countryCode: 'UG' }
  });

  const admin = await u({ tenantId: t.id, email: 'admin@evzone.com', passwordHash: await bcrypt.hash('Admin123!', 12), firstName: 'EVzone', lastName: 'Admin', role: 'SUPER_ADMIN', countryCode: 'UG' });
  const co = await u({ tenantId: t.id, email: 'compliance@evzone.com', passwordHash: await bcrypt.hash('Compliance123!', 12), firstName: 'Compliance', lastName: 'Officer', role: 'COMPLIANCE_OFFICER', countryCode: 'UG' });
  await u({ tenantId: t.id, email: 'support@evzone.com', passwordHash: await bcrypt.hash('Support123!', 12), firstName: 'Support', lastName: 'Agent', role: 'SUPPORT_AGENT', countryCode: 'UG' });

  const inv1 = await u({ tenantId: t.id, email: 'sarah.chen@email.com', passwordHash: await bcrypt.hash('Investor123!', 12), firstName: 'Sarah', lastName: 'Chen', role: 'INVESTOR', countryCode: 'US' });
  await prisma.investorProfile.upsert({ where: { userId: inv1.id }, update: {}, create: { userId: inv1.id, investorType: 'INDIVIDUAL', riskTolerance: 'MODERATE', annualIncome: '120000', netWorth: '500000', accreditationStatus: true, preferredSectors: ['SOLAR','WIND'], investmentGoals: ['Impact returns'], totalInvested: '75000', totalReturns: '5000', activeInvestments: 2, completedInvestments: 1, esgPreferences: { priority: ['climate','social'] } } });

  const inv2 = await u({ tenantId: t.id, email: 'margaret.okafor@email.com', passwordHash: await bcrypt.hash('Margaret456!', 12), firstName: 'Margaret', lastName: 'Okafor', role: 'INVESTOR', countryCode: 'NG' });
  await prisma.investorProfile.upsert({ where: { userId: inv2.id }, update: {}, create: { userId: inv2.id, investorType: 'INSTITUTIONAL', riskTolerance: 'AGGRESSIVE', annualIncome: '2500000', netWorth: '15000000', accreditationStatus: true, preferredSectors: ['HYDRO','GREEN_HYDROGEN','BIOMASS'], investmentGoals: ['Large-scale impact'], totalInvested: '2000000', totalReturns: '180000', activeInvestments: 4, completedInvestments: 3, esgPreferences: { priority: ['governance','climate'] } } });

  const inv3 = await u({ tenantId: t.id, email: 'rajesh.patel@email.com', passwordHash: await bcrypt.hash('Rajesh789!', 12), firstName: 'Rajesh', lastName: 'Patel', role: 'INVESTOR', countryCode: 'KE' });
  await prisma.investorProfile.upsert({ where: { userId: inv3.id }, update: {}, create: { userId: inv3.id, investorType: 'IMPACT_FUND', riskTolerance: 'CONSERVATIVE', annualIncome: '800000', netWorth: '5000000', accreditationStatus: true, preferredSectors: ['SOLAR','ENERGY_STORAGE','EV_CHARGING'], investmentGoals: ['Steady returns'], totalInvested: '350000', totalReturns: '28000', activeInvestments: 1, completedInvestments: 2, esgPreferences: { priority: ['environment','climate'] } } });

  const ent1 = await u({ tenantId: t.id, email: 'amina.osei@email.com', passwordHash: await bcrypt.hash('Entrepreneur123!', 12), firstName: 'Amina', lastName: 'Osei', role: 'ENTREPRENEUR', countryCode: 'UG' });
  await prisma.entrepreneurProfile.upsert({ where: { userId: ent1.id }, update: {}, create: { userId: ent1.id, companyName: 'SunHarvest Microgrids', industry: 'Renewable Energy', stage: 'EARLY_REVENUE', companyRegistration: 'UG-CORP-2023-0042', companyWebsite: 'https://sunharvest.co.ug', foundedYear: 2021, teamSize: 18, previousFunding: '150000', totalRaised: '350000', activeCampaigns: 1, completedCampaigns: 1, pitchDeck: 'https://storage.evzone.com/decks/sunharvest-pitch.pdf' } });

  const ent2 = await u({ tenantId: t.id, email: 'fatima.ibrahim@email.com', passwordHash: await bcrypt.hash('Fatima456!', 12), firstName: 'Fatima', lastName: 'Ibrahim', role: 'ENTREPRENEUR', countryCode: 'GH' });
  await prisma.entrepreneurProfile.upsert({ where: { userId: ent2.id }, update: {}, create: { userId: ent2.id, companyName: 'GreenWave Biogas', industry: 'Clean Energy', stage: 'GROWTH', companyRegistration: 'GH-REG-2022-0115', companyWebsite: 'https://greenwavebiogas.com', foundedYear: 2020, teamSize: 35, previousFunding: '500000', totalRaised: '1200000', activeCampaigns: 2, completedCampaigns: 2, pitchDeck: 'https://storage.evzone.com/decks/greenwave-pitch.pdf' } });

  const as1 = await u({ tenantId: t.id, email: 'dr.kwame@email.com', passwordHash: await bcrypt.hash('Provider123!', 12), firstName: 'Kwame', lastName: 'Asante', role: 'ASSESSOR', countryCode: 'UG' });
  await prisma.assessorProfile.upsert({ where: { userId: as1.id }, update: {}, create: { userId: as1.id, organizationName: 'Asante Green Due Diligence', organizationType: 'FIRM', specialties: ['ESG','FINANCIAL','TECHNICAL'], yearsOfExperience: 12, serviceRegions: ['UG','KE','GH','NG'], insuranceValid: true, tier: 'Gold', rating: 4.8, avgTurnaround: 14, completedEngagements: 47, licenseExpiry: new Date('2026-12-31'), bio: 'Senior ESG consultant.', availabilityStatus: 'AVAILABLE', hourlyRate: 150 } });

  const as2 = await u({ tenantId: t.id, email: 'nadia.kovacs@email.com', passwordHash: await bcrypt.hash('Nadia456!', 12), firstName: 'Nadia', lastName: 'Kovacs', role: 'ASSESSOR', countryCode: 'HU' });
  await prisma.assessorProfile.upsert({ where: { userId: as2.id }, update: {}, create: { userId: as2.id, organizationName: 'Kovacs Climate Analytics', organizationType: 'FIRM', specialties: ['TECHNICAL','FINANCIAL','MARKET'], yearsOfExperience: 8, serviceRegions: ['EU','HU','DE','AT'], insuranceValid: true, tier: 'Silver', rating: 4.5, avgTurnaround: 10, completedEngagements: 28, licenseExpiry: new Date('2026-09-30'), bio: 'Climate risk analyst.', availabilityStatus: 'AVAILABLE', hourlyRate: 180 } });

  const as3 = await u({ tenantId: t.id, email: 'omar.yusuf@email.com', passwordHash: await bcrypt.hash('Omar789!', 12), firstName: 'Omar', lastName: 'Yusuf', role: 'ASSESSOR', countryCode: 'KE' });
  await prisma.assessorProfile.upsert({ where: { userId: as3.id }, update: {}, create: { userId: as3.id, organizationName: 'Yusuf Independent Consulting', organizationType: 'INDIVIDUAL_CONSULTANT', specialties: ['LEGAL','ESG','GOVERNANCE'], yearsOfExperience: 15, serviceRegions: ['KE','TZ','RW','UG'], insuranceValid: true, tier: 'Platinum', rating: 4.9, avgTurnaround: 7, completedEngagements: 63, licenseExpiry: new Date('2027-03-31'), bio: 'Legal and ESG expert.', availabilityStatus: 'AVAILABLE', hourlyRate: 200 } });

  console.log('Users seeded.');

  const p1 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: t.id, slug: 'sunharvest-microgrids' } }, update: {}, create: { tenantId: t.id, ownerUserId: ent1.id, title: 'SunHarvest Microgrids', slug: 'sunharvest-microgrids', summary: 'Solar microgrids for productive-use energy in East Africa.', description: 'A portfolio of solar microgrids.', country: 'Uganda', countryCode: 'UG', city: 'Kampala', region: 'Central Region', coordinates: '0.3476, 32.5825', locationDescription: 'Greater Kampala', sector: 'SOLAR', stage: 'FEASIBILITY', status: 'ACTIVE', fundingTarget: '500000', fundingRaised: '0', minInvestment: '100', maxInvestment: '50000', currency: 'USD', equityOffered: '15', valuation: '3500000', structure: 'Revenue share', returnTarget: '12', expectedImpact: { co2AvoidedTonnes: 1200, householdsServed: 4000 }, sdgs: [7,8,13], risks: { regulatory: 'Medium', currency: 'Medium', technology: 'Low' }, teamMembers: [{ name: 'Amina Osei', role: 'CEO' }], listedAt: new Date('2026-01-15'), viewCount: 1247, featured: true, featuredOrder: 1 } });
  const p2 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: t.id, slug: 'lakewind-energy' } }, update: {}, create: { tenantId: t.id, ownerUserId: ent2.id, title: 'LakeWind Energy Turbines', slug: 'lakewind-energy', summary: 'Small-scale wind turbines.', description: 'Deploying 50 small wind turbines.', country: 'Kenya', countryCode: 'KE', city: 'Kisumu', region: 'Nyanza', coordinates: '-0.0917, 34.7680', locationDescription: 'Kisumu County', sector: 'WIND', stage: 'CONSTRUCTION', status: 'DRAFT', fundingTarget: '750000', fundingRaised: '0', minInvestment: '200', maxInvestment: '25000', currency: 'USD', equityOffered: '20', valuation: '4000000', structure: 'Equity stake', returnTarget: '15', expectedImpact: { co2AvoidedTonnes: 3500, householdsServed: 8000 }, sdgs: [7,8,14], risks: { regulatory: 'Low', currency: 'Medium', technology: 'Low' }, teamMembers: [{ name: 'Fatima Ibrahim', role: 'CEO' }], viewCount: 342, featured: false } });
  const p3 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: t.id, slug: 'biowaste-ghana' } }, update: {}, create: { tenantId: t.id, ownerUserId: ent2.id, title: 'BioWaste Ghana', slug: 'biowaste-ghana', summary: 'Urban organic waste composting.', description: 'Community composting facilities.', country: 'Ghana', countryCode: 'GH', city: 'Accra', region: 'Greater Accra', coordinates: '5.6037, -0.1870', locationDescription: 'Accra', sector: 'BIOMASS', stage: 'FEASIBILITY', status: 'SUBMITTED', fundingTarget: '300000', fundingRaised: '0', minInvestment: '50', maxInvestment: '10000', currency: 'USD', equityOffered: '10', valuation: '1500000', structure: 'Revenue share', returnTarget: '18', expectedImpact: { wasteDivertedTonnes: 5000, jobsCreated: 120 }, sdgs: [11,12,13], risks: { regulatory: 'Low', currency: 'Medium', technology: 'Low' }, teamMembers: [{ name: 'Fatima Ibrahim', role: 'CEO' }], viewCount: 156, featured: false } });
  const p4 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: t.id, slug: 'rift-valley-geothermal' } }, update: {}, create: { tenantId: t.id, ownerUserId: ent1.id, title: 'Rift Valley Geothermal Pilot', slug: 'rift-valley-geothermal', summary: 'Geothermal pilot in Kenya.', description: 'A 2MW geothermal pilot plant.', country: 'Kenya', countryCode: 'KE', city: 'Nakuru', region: 'Rift Valley', coordinates: '-0.2833, 36.0667', locationDescription: 'Nakuru County', sector: 'GREEN_HYDROGEN', stage: 'CONSTRUCTION', status: 'UNDER_REVIEW', fundingTarget: '1200000', fundingRaised: '0', minInvestment: '500', maxInvestment: '100000', currency: 'USD', equityOffered: '25', valuation: '8000000', structure: 'Equity + royalty', returnTarget: '20', expectedImpact: { mwInstalled: 2, householdsServed: 15000 }, sdgs: [7,8,13], risks: { regulatory: 'High', currency: 'Medium', technology: 'Medium' }, teamMembers: [{ name: 'Amina Osei', role: 'Project Lead' }], viewCount: 89, featured: false } });
  const p5 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: t.id, slug: 'solar-irrigation-ethiopia' } }, update: {}, create: { tenantId: t.id, ownerUserId: ent1.id, title: 'Solar Irrigation Ethiopia', slug: 'solar-irrigation-ethiopia', summary: 'Solar-powered irrigation.', description: 'Solar drip irrigation for 500 farmers.', country: 'Ethiopia', countryCode: 'ET', city: 'Bahir Dar', region: 'Amhara', coordinates: '11.65, 37.39', locationDescription: 'Bahir Dar', sector: 'SOLAR', stage: 'OPERATIONAL', status: 'DUE_DILIGENCE', fundingTarget: '400000', fundingRaised: '0', minInvestment: '250', maxInvestment: '50000', currency: 'USD', equityOffered: '18', valuation: '2500000', structure: 'Equity with revenue share', returnTarget: '14', expectedImpact: { farmersSupported: 500, co2AvoidedTonnes: 600 }, sdgs: [2,6,7,13], risks: { regulatory: 'Medium', currency: 'High', technology: 'Low' }, viewCount: 56, featured: false } });
  const p6 = await prisma.project.upsert({ where: { tenantId_slug: { tenantId: t.id, slug: 'waste2energy-nigeria' } }, update: {}, create: { tenantId: t.id, ownerUserId: ent2.id, title: 'Waste2Energy Nigeria', slug: 'waste2energy-nigeria', summary: 'Waste to energy in Lagos.', description: 'Waste-to-energy plant.', country: 'Nigeria', countryCode: 'NG', city: 'Lagos', region: 'Lagos', coordinates: '6.5244, 3.3792', locationDescription: 'Lagos Mainland', sector: 'BIOMASS', stage: 'OPERATIONAL', status: 'APPROVED', fundingTarget: '2000000', fundingRaised: '0', minInvestment: '500', maxInvestment: '100000', currency: 'USD', equityOffered: '22', valuation: '12000000', structure: 'Equity stake', returnTarget: '16', expectedImpact: { wasteProcessedTonnes: 182500, mwInstalled: 10, householdsServed: 50000 }, sdgs: [7,8,11,13], risks: { regulatory: 'Medium', currency: 'High', technology: 'Medium' }, viewCount: 2103, featured: true, featuredOrder: 2 } });

  console.log('Projects seeded.');

  await prisma.deal.upsert({ where: { id: '00000000-0000-0000-0000-000000000001' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000001', tenantId: t.id, projectId: p1.id, title: 'SunHarvest Seed Raise', status: 'LIVE', minInvestment: '100', targetAmount: '500000', maxAmount: '750000', opensAt: new Date('2026-01-15'), closesAt: new Date('2026-07-15'), currency: 'USD' } });
  await prisma.deal.upsert({ where: { id: '00000000-0000-0000-0000-000000000002' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000002', tenantId: t.id, projectId: p6.id, title: 'Waste2Energy Series A', status: 'COMPLIANCE_REVIEW', minInvestment: '500', targetAmount: '2000000', maxAmount: '3000000', opensAt: new Date('2026-04-01'), closesAt: new Date('2026-09-30'), currency: 'USD' } });
  await prisma.deal.upsert({ where: { id: '00000000-0000-0000-0000-000000000003' }, update: {}, create: { id: '00000000-0000-0000-0000-000000000003', tenantId: t.id, projectId: p2.id, title: 'LakeWind Phase 1', status: 'APPROVED', minInvestment: '200', targetAmount: '750000', maxAmount: '1000000', opensAt: new Date('2026-05-01'), closesAt: new Date('2026-11-30'), currency: 'USD' } });

  console.log('Deals seeded.');

  const i1 = await prisma.investment.upsert({ where: { investorUserId_idempotencyKey: { investorUserId: inv1.id, idempotencyKey: 'inv-sarah-001' } }, update: {}, create: { tenantId: t.id, dealId: '00000000-0000-0000-0000-000000000001', projectId: p1.id, investorUserId: inv1.id, amount: '15000', currency: 'USD', status: 'CONFIRMED', idempotencyKey: 'inv-sarah-001', paymentMethod: 'BANK_TRANSFER', confirmedAt: new Date('2026-02-01') } });
  const i2 = await prisma.investment.upsert({ where: { investorUserId_idempotencyKey: { investorUserId: inv1.id, idempotencyKey: 'inv-sarah-002' } }, update: {}, create: { tenantId: t.id, dealId: '00000000-0000-0000-0000-000000000001', projectId: p1.id, investorUserId: inv1.id, amount: '25000', currency: 'USD', status: 'CONFIRMED', idempotencyKey: 'inv-sarah-002', paymentMethod: 'BANK_TRANSFER', confirmedAt: new Date('2026-02-15') } });
  const i3 = await prisma.investment.upsert({ where: { investorUserId_idempotencyKey: { investorUserId: inv2.id, idempotencyKey: 'inv-margaret-001' } }, update: {}, create: { tenantId: t.id, dealId: '00000000-0000-0000-0000-000000000001', projectId: p1.id, investorUserId: inv2.id, amount: '100000', currency: 'USD', status: 'PENDING_PAYMENT', idempotencyKey: 'inv-margaret-001', paymentMethod: 'MOBILE_MONEY' } });
  const i4 = await prisma.investment.upsert({ where: { investorUserId_idempotencyKey: { investorUserId: inv3.id, idempotencyKey: 'inv-rajesh-001' } }, update: {}, create: { tenantId: t.id, dealId: '00000000-0000-0000-0000-000000000001', projectId: p1.id, investorUserId: inv3.id, amount: '50000', currency: 'USD', status: 'PENDING_COMPLIANCE', idempotencyKey: 'inv-rajesh-001', paymentMethod: 'BANK_TRANSFER' } });

  console.log('Investments seeded.');

  const cashAcct = await getOrCreateLedger({ tenantId: t.id, ownerType: 'USER', ownerId: inv1.id, currency: 'USD', name: 'Investor Cash Pending' });
  const fundAcct = await getOrCreateLedger({ tenantId: t.id, ownerType: 'PROJECT', ownerId: p1.id, currency: 'USD', name: 'Project Funding Balance' });
  const escAcct = await getOrCreateLedger({ tenantId: t.id, ownerType: 'PROJECT', ownerId: p1.id, currency: 'USD', name: 'Escrow Liability' });

  const tx1 = await prisma.transaction.create({ data: { tenantId: t.id, userId: inv1.id, investmentId: i1.id, projectId: p1.id, type: 'INVESTMENT', amount: '15000', currency: 'USD', status: 'COMPLETED', paymentMethod: 'BANK_TRANSFER', jurisdiction: 'US', processedAt: new Date('2026-02-01') } });
  await prisma.ledgerEntry.createMany({ data: [
    { tenantId: t.id, accountId: cashAcct.id, transactionId: tx1.id, direction: 'DEBIT', amount: '15000', currency: 'USD', memo: 'Investment - SunHarvest' },
    { tenantId: t.id, accountId: escAcct.id, transactionId: tx1.id, direction: 'CREDIT', amount: '15000', currency: 'USD', memo: 'Escrow - SunHarvest' }
  ]});
  const tx2 = await prisma.transaction.create({ data: { tenantId: t.id, userId: inv1.id, investmentId: i2.id, projectId: p1.id, type: 'INVESTMENT', amount: '25000', currency: 'USD', status: 'COMPLETED', paymentMethod: 'BANK_TRANSFER', jurisdiction: 'US', processedAt: new Date('2026-02-15') } });
  await prisma.ledgerEntry.createMany({ data: [
    { tenantId: t.id, accountId: cashAcct.id, transactionId: tx2.id, direction: 'DEBIT', amount: '25000', currency: 'USD', memo: 'Investment - SunHarvest' },
    { tenantId: t.id, accountId: escAcct.id, transactionId: tx2.id, direction: 'CREDIT', amount: '25000', currency: 'USD', memo: 'Escrow - SunHarvest' }
  ]});

  console.log('Transactions seeded.');

  const dd1 = await prisma.dueDiligenceCase.upsert({ where: { projectId: p1.id }, update: {}, create: { tenantId: t.id, projectId: p1.id, assignedAssessorId: as1.id, status: 'ASSIGNED', assignedAt: new Date('2026-01-20'), dueAt: new Date('2026-03-20'), notes: 'Initial review', assessments: { financial: { status: 'pending' }, technical: { status: 'in_progress' }, legal: { status: 'pending' }, esg: { status: 'pending' } } } });
  const dd2 = await prisma.dueDiligenceCase.upsert({ where: { projectId: p5.id }, update: {}, create: { tenantId: t.id, projectId: p5.id, assignedAssessorId: as3.id, status: 'IN_PROGRESS', assignedAt: new Date('2026-03-01'), dueAt: new Date('2026-04-30'), startedAt: new Date('2026-03-05'), notes: 'Technical feasibility', assessments: { financial: { status: 'in_progress' }, technical: { status: 'in_progress' }, legal: { status: 'pending' }, esg: { status: 'pending' } } } });

  await prisma.dueDiligenceTask.createMany({ data: [
    { caseId: dd1.id, category: 'FINANCIAL', title: 'Review financial projections', status: 'IN_PROGRESS', assignedToUserId: as1.id, dueAt: new Date('2026-02-28') },
    { caseId: dd1.id, category: 'TECHNICAL', title: 'Technical site assessment', status: 'OPEN', assignedToUserId: as1.id, dueAt: new Date('2026-03-15') },
    { caseId: dd1.id, category: 'LEGAL', title: 'Land title verification', status: 'OPEN', assignedToUserId: as1.id, dueAt: new Date('2026-03-20') },
    { caseId: dd2.id, category: 'FINANCIAL', title: 'Evaluate revenue model', status: 'IN_PROGRESS', assignedToUserId: as3.id, dueAt: new Date('2026-04-15') },
    { caseId: dd2.id, category: 'TECHNICAL', title: 'Solar resource assessment', status: 'IN_PROGRESS', assignedToUserId: as3.id, dueAt: new Date('2026-04-20') }
  ]});

  console.log('DD seeded.');

  await prisma.mediaAsset.createMany({ data: [
    { tenantId: t.id, projectId: p1.id, ownerUserId: ent1.id, bucket: 'evzone-prod-assets', objectKey: 'tenants/PLAT/proj/sunharvest/gallery/cover-1/original.webp', contentType: 'image/webp', sizeBytes: 245760, status: 'READY', purpose: 'PROJECT_COVER', width: 1200, height: 630, altText: 'SunHarvest cover', sortOrder: 0 },
    { tenantId: t.id, projectId: p1.id, ownerUserId: ent1.id, bucket: 'evzone-prod-assets', objectKey: 'tenants/PLAT/proj/sunharvest/gallery/img-1/original.webp', contentType: 'image/webp', sizeBytes: 184320, status: 'READY', purpose: 'PROJECT_GALLERY', width: 1920, height: 1080, altText: 'Solar installation', sortOrder: 1 },
    { tenantId: t.id, projectId: p6.id, ownerUserId: ent2.id, bucket: 'evzone-prod-assets', objectKey: 'tenants/PLAT/proj/waste2energy/gallery/cover-1/original.webp', contentType: 'image/webp', sizeBytes: 311296, status: 'READY', purpose: 'PROJECT_COVER', width: 1200, height: 630, altText: 'Waste2Energy cover', sortOrder: 0 }
  ]});

  console.log('Media seeded.');

  await prisma.complianceCase.createMany({ data: [
    { tenantId: t.id, userId: inv1.id, status: 'APPROVED', riskRating: 'LOW', decidedBy: co.id, decidedAt: new Date('2026-01-10'), metadata: { accredited: true, kycVerified: true, sanctionsClear: true }, reason: 'Investor fully verified' },
    { tenantId: t.id, userId: inv3.id, status: 'OPEN', riskRating: 'MEDIUM', reason: 'Pending enhanced due diligence' }
  ]});

  console.log('Compliance seeded.');

  await prisma.notification.createMany({ data: [
    { tenantId: t.id, userId: inv1.id, type: 'INVESTMENT_UPDATE', title: 'Investment Confirmed', message: 'Your investment of $15,000 in SunHarvest has been confirmed.', data: { investmentId: i1.id, dealId: '00000000-0000-0000-0000-000000000001', amount: '15000' }, channels: ['in_app','email'] },
    { tenantId: t.id, userId: inv1.id, type: 'PROJECT_UPDATE', title: 'Project Milestone Update', message: 'SunHarvest has reached a new milestone.', data: { projectId: p1.id }, channels: ['in_app'] },
    { tenantId: t.id, userId: inv2.id, type: 'DUE_DILIGENCE', title: 'Due Diligence Required', message: 'A due diligence case has been opened for Solar Irrigation Ethiopia.', data: { projectId: p5.id, caseId: dd2.id }, channels: ['in_app','email'] },
    { tenantId: t.id, userId: ent1.id, type: 'PROJECT_UPDATE', title: 'Project Under Review', message: 'Your project Rift Valley Geothermal Pilot is now under review.', data: { projectId: p4.id }, channels: ['in_app','email'] },
    { tenantId: t.id, userId: ent2.id, type: 'PROJECT_UPDATE', title: 'Project Submitted', message: 'Your project BioWaste Ghana has been submitted.', data: { projectId: p3.id }, channels: ['in_app'] }
  ]});

  console.log('Notifications seeded.');

  await prisma.auditLog.createMany({ data: [
    { tenantId: t.id, userId: admin.id, action: 'USER_CREATED', entityType: 'user', entityId: inv1.id, newValues: { email: 'sarah.chen@email.com', role: 'INVESTOR' }, metadata: { source: 'seed' } },
    { tenantId: t.id, userId: admin.id, action: 'PROJECT_CREATED', entityType: 'project', entityId: p1.id, newValues: { title: 'SunHarvest Microgrids', status: 'ACTIVE' }, metadata: { source: 'seed' } },
    { tenantId: t.id, userId: admin.id, action: 'PROJECT_SUBMITTED', entityType: 'project', entityId: p3.id, newValues: { title: 'BioWaste Ghana', status: 'SUBMITTED' }, metadata: { source: 'seed' } },
    { tenantId: t.id, userId: co.id, action: 'COMPLIANCE_REVIEW', entityType: 'compliance_case', entityId: 'pending', newValues: { status: 'APPROVED', userId: inv1.id }, metadata: { source: 'seed' } },
    { tenantId: t.id, userId: inv1.id, action: 'INVESTMENT_CREATED', entityType: 'investment', entityId: i1.id, newValues: { amount: '15000', currency: 'USD' }, metadata: { source: 'seed' } },
    { tenantId: t.id, userId: inv1.id, action: 'INVESTMENT_CREATED', entityType: 'investment', entityId: i2.id, newValues: { amount: '25000', currency: 'USD' }, metadata: { source: 'seed' } },
    { tenantId: t.id, userId: admin.id, action: 'DEAL_CREATED', entityType: 'deal', entityId: '00000000-0000-0000-0000-000000000001', newValues: { title: 'SunHarvest Seed Raise', status: 'LIVE' }, metadata: { source: 'seed' } },
    { tenantId: t.id, userId: admin.id, action: 'ASSESSOR_ASSIGNED', entityType: 'due_diligence', entityId: dd1.id, newValues: { assignedAssessorId: as1.id, status: 'ASSIGNED' }, metadata: { source: 'seed' } }
  ]});

  console.log('Audit logs seeded.');

  await prisma.watchlistItem.createMany({ data: [
    { userId: inv1.id, dealId: '00000000-0000-0000-0000-000000000001', tenantId: t.id },
    { userId: inv2.id, dealId: '00000000-0000-0000-0000-000000000002', tenantId: t.id }
  ]});

  await prisma.dispute.createMany({ data: [
    { tenantId: t.id, type: 'PAYMENT', status: 'OPEN', title: 'Payment delay for investment #1', description: 'Investor reports delayed payment confirmation.', initiatorId: inv1.id, entityType: 'investment', entityId: i1.id, evidence: { transactionId: tx1.id, expectedDate: '2026-02-02' } }
  ]});

  console.log('Watchlist & disputes seeded.');

  const pi1 = await prisma.paymentIntent.create({ data: { tenantId: t.id, investmentId: i3.id, dealId: '00000000-0000-0000-0000-000000000001', userId: inv2.id, provider: 'FLUTTERWAVE', direction: 'COLLECTION', purpose: 'INVESTMENT_FUNDING', internalReference: 'PAY-INV-MARGARET-001', amount: '100000', currency: 'USD', status: 'PENDING', checkoutUrl: 'https://pay.example.com/pay-001', expiresAt: new Date('2026-03-15') } });
  const pi2 = await prisma.paymentIntent.create({ data: { tenantId: t.id, investmentId: i4.id, dealId: '00000000-0000-0000-0000-000000000001', userId: inv3.id, provider: 'FLUTTERWAVE', direction: 'COLLECTION', purpose: 'INVESTMENT_FUNDING', internalReference: 'PAY-INV-RAJESH-001', amount: '50000', currency: 'USD', status: 'PENDING', checkoutUrl: 'https://pay.example.com/pay-002', expiresAt: new Date('2026-03-20') } });

  await prisma.paymentTransaction.createMany({ data: [
    { tenantId: t.id, paymentIntentId: pi1.id, provider: 'FLUTTERWAVE', amount: '100000', currency: 'USD', status: 'PENDING', providerStatus: 'initiated' },
    { tenantId: t.id, paymentIntentId: pi2.id, provider: 'FLUTTERWAVE', amount: '50000', currency: 'USD', status: 'PENDING', providerStatus: 'initiated' }
  ]});

  console.log('Payments seeded.');

  await prisma.impactReport.create({ data: { tenantId: t.id, projectId: p1.id, submittedBy: ent1.id, reportingPeriodStart: new Date('2025-01-01'), reportingPeriodEnd: new Date('2025-12-31'), metrics: { co2AvoidedTonnes: 1100, energyGenerated: 5200, householdsServed: 3800 }, evidenceAttachments: { reports: ['impact-report-2025.pdf'] }, status: 'VERIFIED', submittedAt: new Date('2026-01-15'), reviewedAt: new Date('2026-02-01'), reviewedBy: as1.id, reviewNotes: 'All metrics verified.' } });

  console.log('Impact report seeded.');

  await prisma.kycApplication.createMany({ data: [
    { tenantId: t.id, userId: inv1.id, provider: 'SMILE_IDENTITY', status: 'VERIFIED', idType: 'PASSPORT', idNumber: 'US1234567', idExpiryDate: new Date('2029-01-01'), nationality: 'US', dateOfBirth: new Date('1985-03-15'), submittedData: {}, providerResult: {}, verificationScore: 95, verifiedAt: new Date('2026-01-05') },
    { tenantId: t.id, userId: inv2.id, provider: 'SMILE_IDENTITY', status: 'VERIFIED', idType: 'NATIONAL_ID', idNumber: 'NG9876543', idExpiryDate: new Date('2028-06-15'), nationality: 'NG', dateOfBirth: new Date('1982-08-20'), submittedData: {}, providerResult: {}, verificationScore: 92, verifiedAt: new Date('2026-01-06') },
    { tenantId: t.id, userId: inv3.id, provider: 'SMILE_IDENTITY', status: 'PENDING', idType: 'PASSPORT', idNumber: 'KE5551234', idExpiryDate: new Date('2027-09-30'), nationality: 'KE', dateOfBirth: new Date('1978-11-10'), submittedData: {}, providerResult: {}, verificationScore: null, verifiedAt: null }
  ]});

  await prisma.kybApplication.createMany({ data: [
    { tenantId: t.id, userId: ent1.id, organizationName: 'SunHarvest Microgrids', registrationNumber: 'UG-CORP-2023-0042', jurisdiction: 'UG', provider: 'GENERIC', status: 'VERIFIED', verificationScore: 88, verifiedAt: new Date('2026-01-07') },
    { tenantId: t.id, userId: ent2.id, organizationName: 'GreenWave Biogas', registrationNumber: 'GH-REG-2022-0115', jurisdiction: 'GH', provider: 'GENERIC', status: 'VERIFIED', verificationScore: 91, verifiedAt: new Date('2026-01-08') }
  ]});

  console.log('KYC/KYB seeded.');

  await prisma.payout.create({ data: { tenantId: t.id, userId: inv1.id, provider: 'FLUTTERWAVE', internalReference: 'PAYOUT-INV1-001', amount: '5000', currency: 'USD', destinationType: 'BANK_ACCOUNT', destinationMasked: '****1234', status: 'SUCCEEDED' } });

  console.log('Seed complete!');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });</tool_call>}