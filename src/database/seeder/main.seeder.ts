import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities';
import {
  InvestorProfile, EntrepreneurProfile, AssessorProfile
} from '../../modules/users/entities';
import {
  UserRole, UserStatus, KycStatus,
  ProjectStatus, ProjectSector, ProjectStage,
  MilestoneStatus, InvestmentStatus,
  TransactionType, TransactionStatus,
  DueDiligenceStatus,
  ComplianceAlertSeverity, ComplianceAlertStatus,
  DisputeStatus, DisputeType,
} from '../../common/enums';
import { Project } from '../../modules/projects/entities';
import { Milestone } from '../../modules/projects/entities';
import { Investment } from '../../modules/investments/entities';
import { Transaction } from '../../modules/investments/entities';
import {
  DueDiligenceEngagement
} from '../../modules/due-diligence/entities';
import { ComplianceAlert } from '../../modules/admin/entities';
import { Dispute } from '../../modules/admin/entities';
import { AuditLog } from '../../modules/admin/entities';
import { Notification } from '../../modules/notifications/entities/notification.entity';
import { Message } from '../../modules/messaging/entities/message.entity';
import * as bcrypt from 'bcrypt';

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'evzone',
    password: process.env.DB_PASSWORD || 'evzone_secret',
    database: process.env.DB_NAME || 'evzone_platform',
    ssl: process.env.DB_SSL === 'true',
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    synchronize: true,
    logging: false,
  });

  await dataSource.initialize();
  console.log('Database connected. Seeding...');

  const userRepo = dataSource.getRepository(User);
  const investorRepo = dataSource.getRepository(InvestorProfile);
  const entrepreneurRepo = dataSource.getRepository(EntrepreneurProfile);
  const assessorRepo = dataSource.getRepository(AssessorProfile);
  const projectRepo = dataSource.getRepository(Project);
  const milestoneRepo = dataSource.getRepository(Milestone);
  const investmentRepo = dataSource.getRepository(Investment);
  const transactionRepo = dataSource.getRepository(Transaction);
  const ddRepo = dataSource.getRepository(DueDiligenceEngagement);
  const alertRepo = dataSource.getRepository(ComplianceAlert);
  const disputeRepo = dataSource.getRepository(Dispute);
  const auditRepo = dataSource.getRepository(AuditLog);
  const notifRepo = dataSource.getRepository(Notification);
  const messageRepo = dataSource.getRepository(Message);

  const hash = (pwd: string) => bcrypt.hashSync(pwd, 12);

  // ============================================
  // USERS (8 users)
  // ============================================
  const users = await userRepo.save([
    // Admin
    {
      email: 'admin@evzone.com',
      password: hash('Admin123!'),
      firstName: 'System',
      lastName: 'Administrator',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.VERIFIED,
      country: 'United States',
      city: 'New York',
      bio: 'Platform administrator with full oversight access.',
      riskLevel: 'low',
      preferences: { theme: 'dark', language: 'en', notifications: { email: true, push: true } },
    },
    // Investor 1
    {
      email: 'sarah.chen@email.com',
      password: hash('Investor123!'),
      firstName: 'Sarah',
      lastName: 'Chen',
      role: UserRole.INVESTOR,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.VERIFIED,
      country: 'Singapore',
      city: 'Singapore',
      bio: 'Impact investor focused on renewable energy in emerging markets.',
      riskLevel: 'low',
      preferences: { theme: 'light', language: 'en', notifications: { email: true, push: false } },
    },
    // Investor 2
    {
      email: 'marcus.johnson@email.com',
      password: hash('Investor123!'),
      firstName: 'Marcus',
      lastName: 'Johnson',
      role: UserRole.INVESTOR,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.VERIFIED,
      country: 'United Kingdom',
      city: 'London',
      bio: 'Institutional investor specializing in green infrastructure.',
      riskLevel: 'low',
      preferences: { theme: 'light', language: 'en', notifications: { email: true, push: true } },
    },
    // Entrepreneur 1
    {
      email: 'amina.osei@email.com',
      password: hash('Entrepreneur123!'),
      firstName: 'Amina',
      lastName: 'Osei',
      role: UserRole.ENTREPRENEUR,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.VERIFIED,
      country: 'Kenya',
      city: 'Nairobi',
      bio: 'Founder of GreenGrid Solar. Building solar infrastructure across East Africa.',
      riskLevel: 'low',
      preferences: { theme: 'light', language: 'en', notifications: { email: true, push: true } },
    },
    // Entrepreneur 2
    {
      email: 'raj.patel@email.com',
      password: hash('Entrepreneur123!'),
      firstName: 'Raj',
      lastName: 'Patel',
      role: UserRole.ENTREPRENEUR,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.PENDING,
      country: 'India',
      city: 'Mumbai',
      bio: 'Clean energy entrepreneur working on wind farm projects.',
      riskLevel: 'medium',
      preferences: { theme: 'dark', language: 'en', notifications: { email: false, push: true } },
    },
    // Assessor 1
    {
      email: 'dr.kwame@email.com',
      password: hash('Assessor123!'),
      firstName: 'Dr. Kwame',
      lastName: 'Asante',
      role: UserRole.ASSESSOR,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.VERIFIED,
      country: 'Ghana',
      city: 'Accra',
      bio: 'ESG audit specialist with 15 years experience in African energy projects.',
      riskLevel: 'low',
      preferences: { theme: 'light', language: 'en', notifications: { email: true, push: true } },
    },
    // Assessor 2
    {
      email: 'elena.muller@email.com',
      password: hash('Assessor123!'),
      firstName: 'Elena',
      lastName: 'Muller',
      role: UserRole.ASSESSOR,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.VERIFIED,
      country: 'Germany',
      city: 'Berlin',
      bio: 'Technical assessment expert specializing in renewable energy systems.',
      riskLevel: 'low',
      preferences: { theme: 'dark', language: 'en', notifications: { email: true, push: false } },
    },
    // Investor 3 (pending)
    {
      email: 'pedro.silva@email.com',
      password: hash('Investor123!'),
      firstName: 'Pedro',
      lastName: 'Silva',
      role: UserRole.INVESTOR,
      status: UserStatus.PENDING_VERIFICATION,
      kycStatus: KycStatus.NOT_STARTED,
      country: 'Brazil',
      city: 'Sao Paulo',
      riskLevel: 'medium',
      preferences: { theme: 'light', language: 'en' },
    },
  ] as User[]);
  console.log(`Created ${users.length} users`);

  const [admin, sarah, marcus, amina, raj, kwame, elena] = users;

  // ============================================
  // PROFILES
  // ============================================
  await investorRepo.save([
    {
      userId: sarah.id,
      investorType: 'IMPACT_FUND',
      riskTolerance: 'MODERATE',
      annualIncome: 350000,
      netWorth: 2500000,
      accreditationStatus: true,
      investmentGoals: ['ESG impact', 'Diversification', 'Emerging markets exposure'],
      preferredSectors: ['SOLAR', 'WIND', 'GREEN_HYDROGEN'],
      totalInvested: 450000,
      totalReturns: 32000,
      activeInvestments: 3,
      completedInvestments: 2,
      esgPreferences: { minEsgScore: 70, excludeFossilFuels: true },
    },
    {
      userId: marcus.id,
      investorType: 'INSTITUTIONAL',
      riskTolerance: 'CONSERVATIVE',
      annualIncome: 500000,
      netWorth: 5000000,
      accreditationStatus: true,
      investmentGoals: ['Stable returns', 'Green portfolio'],
      preferredSectors: ['SOLAR', 'HYDRO', 'ENERGY_STORAGE'],
      totalInvested: 1200000,
      totalReturns: 85000,
      activeInvestments: 4,
      completedInvestments: 1,
    },
    {
      userId: pedro.id,
      investorType: 'INDIVIDUAL',
      riskTolerance: 'AGGRESSIVE',
      totalInvested: 0,
      totalReturns: 0,
      activeInvestments: 0,
      completedInvestments: 0,
    },
  ] as any);

  await entrepreneurRepo.save([
    {
      userId: amina.id,
      companyName: 'GreenGrid Solar Ltd',
      companyRegistration: 'KE-2019-88472',
      companyWebsite: 'https://greengridsolar.co.ke',
      industry: 'Renewable Energy',
      foundedYear: 2019,
      teamSize: 24,
      stage: 'GROWTH',
      previousFunding: 1800000,
      totalRaised: 3200000,
      activeCampaigns: 2,
      completedCampaigns: 3,
    },
    {
      userId: raj.id,
      companyName: 'Vayu Wind Technologies',
      companyRegistration: 'IN-MH-2021-44291',
      companyWebsite: 'https://vayuwind.in',
      industry: 'Renewable Energy',
      foundedYear: 2021,
      teamSize: 12,
      stage: 'EARLY_REVENUE',
      previousFunding: 450000,
      totalRaised: 450000,
      activeCampaigns: 1,
      completedCampaigns: 0,
    },
  ] as any);

  await assessorRepo.save([
    {
      userId: kwame.id,
      organizationName: 'Asante Consulting Group',
      organizationType: 'FIRM',
      specialties: ['ESG_AUDIT', 'FINANCIAL_DUE_DILIGENCE', 'MARKET_ANALYSIS'],
      credentials: { certifications: ['CFA', 'GRESB'], degrees: ['PhD Finance', 'MSc Economics'] },
      yearsOfExperience: 15,
      completedEngagements: 42,
      rating: 4.8,
      availabilityStatus: 'AVAILABLE',
      hourlyRate: 150,
      serviceRegions: ['West Africa', 'East Africa'],
      licenseExpiry: new Date('2026-03-15'),
      insuranceValid: true,
      tier: 'Gold',
      avgTurnaround: 18,
    },
    {
      userId: elena.id,
      organizationName: 'TUV Rheinland Energy',
      organizationType: 'FIRM',
      specialties: ['TECHNICAL_ASSESSMENT', 'ESG_AUDIT', 'LEGAL_REVIEW'],
      credentials: { certifications: ['ISO 14001', 'LEED AP'], degrees: ['MSc Engineering', 'MBA'] },
      yearsOfExperience: 10,
      completedEngagements: 28,
      rating: 4.6,
      availabilityStatus: 'AVAILABLE',
      hourlyRate: 200,
      serviceRegions: ['Europe', 'Africa', 'Asia'],
      licenseExpiry: new Date('2025-12-01'),
      insuranceValid: true,
      tier: 'Gold',
      avgTurnaround: 22,
    },
  ] as any);
  console.log('Created profiles');

  // ============================================
  // PROJECTS (9 projects)
  // ============================================
  const projects = await projectRepo.save([
    {
      entrepreneurId: amina.id,
      title: 'GreenGrid Solar Farm — Machakos',
      slug: 'greengrid-solar-farm-machakos',
      subtitle: 'Utility-scale solar installation powering 50,000 households',
      description: 'A 25MW solar photovoltaic plant in Machakos County, Kenya. The project will generate clean electricity for the national grid while creating 200+ local jobs.',
      longDescription: 'The Machakos Solar Farm represents a major step forward in Kenya\'s renewable energy transition. Located on 120 acres of semi-arid land, this 25MW installation will utilize bifacial solar panels with single-axis tracking to maximize energy yield. The project includes a 33kV substation and 10km transmission line to connect to the national grid. Community benefits include a dedicated education fund, agricultural training programs, and priority hiring for local residents.',
      coverImage: '/assets/projects/machakos-solar.jpg',
      galleryImages: ['/assets/projects/machakos-1.jpg', '/assets/projects/machakos-2.jpg'],
      impactVideo: '/assets/projects/machakos-impact.mp4',
      story: {
        problem: 'Machakos County experiences frequent power outages and 40% of households lack grid access. Diesel generators cost families $80/month.',
        solution: 'A 25MW solar farm with single-axis tracking bifacial panels, connected to the national grid via a 33kV substation.',
        journey: 'Phase I (10MW) completed in 2023, exceeding targets by 12%. Phase II expands capacity to 25MW.',
        vision: 'By 2030, power 500,000 households across Eastern Kenya with 200MW of solar capacity.',
      },
      valuation: 8500000,
      structure: 'Equity',
      returnTarget: 14.5,
      coordinates: '-1.5177, 37.2634',
      locationDescription: 'Located on 120 acres of semi-arid land in Machakos County, 60km southeast of Nairobi.',
      status: ProjectStatus.ACTIVE,
      fundingGoal: 1200000,
      fundingRaised: 892000,
      minInvestment: 500,
      maxInvestment: 100000,
      currency: 'USD',
      equityOffered: 15.0,
      country: 'Kenya',
      city: 'Machakos',
      region: 'Eastern Province',
      sector: ProjectSector.SOLAR,
      stage: ProjectStage.CONSTRUCTION,
      impactMetrics: { co2Reduction: 42000, jobsCreated: 220, householdsServed: 50000, mwCapacity: 25 },
      sdgs: [7, 8, 11, 13],
      campaignStartDate: new Date('2025-01-15'),
      campaignEndDate: new Date('2025-07-15'),
      projectStartDate: new Date('2025-04-01'),
      projectEndDate: new Date('2026-12-31'),
      teamMembers: [
        { name: 'Amina Osei', role: 'CEO & Founder', avatar: '' },
        { name: 'James Mwangi', role: 'CTO', avatar: '' },
        { name: 'Dr. Grace Njoroge', role: 'Project Lead', avatar: '' },
      ],
      featured: true,
      featuredOrder: 1,
      dueDiligenceStatus: 'COMPLETED',
      dueDiligenceScore: 87,
    },
    {
      entrepreneurId: amina.id,
      title: 'Ngong Hills Wind Expansion',
      slug: 'ngong-hills-wind-expansion',
      subtitle: 'Expanding wind capacity in the Ngong Hills corridor',
      description: 'Adding 15MW of wind turbine capacity to the existing Ngong Hills wind farm, leveraging some of East Africa\'s most consistent wind resources.',
      status: ProjectStatus.ACTIVE,
      fundingGoal: 850000,
      fundingRaised: 445000,
      minInvestment: 250,
      currency: 'USD',
      equityOffered: 12.0,
      structure: 'Blended Finance',
      returnTarget: 12.0,
      country: 'Kenya',
      city: 'Ngong',
      sector: ProjectSector.WIND,
      stage: ProjectStage.FEASIBILITY,
      impactMetrics: { co2Reduction: 28000, jobsCreated: 85, mwCapacity: 15 },
      sdgs: [7, 9, 13],
      featured: true,
      featuredOrder: 2,
      dueDiligenceStatus: 'IN_PROGRESS',
    },
    {
      entrepreneurId: raj.id,
      title: 'Vayu Gujarat Wind Farm',
      slug: 'vayu-gujarat-wind-farm',
      subtitle: '50MW onshore wind project in Gujarat\'s wind corridor',
      description: 'Large-scale wind energy project harnessing Gujarat\'s world-class wind resources to power industrial zones with clean electricity.',
      status: ProjectStatus.UNDER_REVIEW,
      fundingGoal: 2500000,
      fundingRaised: 0,
      minInvestment: 1000,
      currency: 'USD',
      equityOffered: 18.0,
      country: 'India',
      city: 'Bhuj',
      region: 'Gujarat',
      sector: ProjectSector.WIND,
      stage: ProjectStage.CONCEPT,
      impactMetrics: { co2Reduction: 95000, jobsCreated: 350, householdsServed: 120000, mwCapacity: 50 },
      sdgs: [7, 9, 11, 13],
    },
    {
      entrepreneurId: amina.id,
      title: 'Limuru Biogas Digester Network',
      slug: 'limuru-biogas-digester-network',
      subtitle: 'Community-scale biogas from agricultural waste',
      description: 'Network of 50 biogas digesters converting dairy farm waste into clean cooking gas and organic fertilizer for smallholder farmers.',
      status: ProjectStatus.FUNDED,
      fundingGoal: 350000,
      fundingRaised: 350000,
      minInvestment: 100,
      currency: 'USD',
      equityOffered: 10.0,
      country: 'Kenya',
      city: 'Limuru',
      sector: ProjectSector.BIOMASS,
      stage: ProjectStage.CONSTRUCTION,
      impactMetrics: { co2Reduction: 12000, jobsCreated: 60, householdsServed: 2500 },
      sdgs: [2, 7, 11, 12],
      dueDiligenceStatus: 'COMPLETED',
      dueDiligenceScore: 92,
    },
    {
      entrepreneurId: raj.id,
      title: 'Mumbai EV Charging Grid',
      slug: 'mumbai-ev-charging-grid',
      subtitle: '100-station EV charging network across Mumbai',
      description: 'Comprehensive electric vehicle charging infrastructure covering commercial, residential, and highway locations across Mumbai.',
      status: ProjectStatus.DRAFT,
      fundingGoal: 1800000,
      fundingRaised: 0,
      minInvestment: 500,
      currency: 'USD',
      equityOffered: 20.0,
      country: 'India',
      city: 'Mumbai',
      sector: ProjectSector.EV_CHARGING,
      stage: ProjectStage.CONCEPT,
      impactMetrics: { co2Reduction: 55000, jobsCreated: 180, stations: 100 },
      sdgs: [7, 9, 11, 13],
    },
    {
      entrepreneurId: amina.id,
      title: 'Blue Nile Micro-Hydro',
      slug: 'blue-nile-micro-hydro',
      subtitle: 'Community-owned micro-hydropower on the Blue Nile',
      description: '5MW run-of-river micro-hydroelectric plant providing reliable baseload power to rural communities in Ethiopia.',
      status: ProjectStatus.COMPLETED,
      fundingGoal: 600000,
      fundingRaised: 600000,
      minInvestment: 200,
      currency: 'USD',
      equityOffered: 8.0,
      country: 'Ethiopia',
      city: 'Bahir Dar',
      sector: ProjectSector.HYDRO,
      stage: ProjectStage.OPERATIONAL,
      impactMetrics: { co2Reduction: 18000, jobsCreated: 95, householdsServed: 15000, mwCapacity: 5 },
      sdgs: [6, 7, 8, 9],
      dueDiligenceStatus: 'COMPLETED',
      dueDiligenceScore: 91,
    },
    {
      entrepreneurId: amina.id,
      title: 'Scottish Offshore Wind Array',
      slug: 'scottish-offshore-wind-array',
      subtitle: '200MW floating offshore wind farm in the North Sea',
      description: 'Cutting-edge floating offshore wind technology positioned 30km off the Scottish coast, harnessing consistent North Sea winds.',
      status: ProjectStatus.ACTIVE,
      fundingGoal: 4500000,
      fundingRaised: 2100000,
      minInvestment: 5000,
      currency: 'USD',
      equityOffered: 10.0,
      country: 'United Kingdom',
      city: 'Aberdeen',
      sector: ProjectSector.WIND,
      stage: ProjectStage.CONSTRUCTION,
      impactMetrics: { co2Reduction: 180000, jobsCreated: 800, householdsServed: 250000, mwCapacity: 200 },
      sdgs: [7, 9, 13, 14],
      featured: true,
      featuredOrder: 3,
      dueDiligenceStatus: 'COMPLETED',
      dueDiligenceScore: 95,
    },
    {
      entrepreneurId: raj.id,
      title: 'Texas Solar + Storage Complex',
      slug: 'texas-solar-storage-complex',
      subtitle: '500MW solar + 200MWh battery storage in West Texas',
      description: 'One of the largest solar-plus-storage installations in North America, providing firm dispatchable clean power to the ERCOT grid.',
      status: ProjectStatus.ACTIVE,
      fundingGoal: 8000000,
      fundingRaised: 5200000,
      minInvestment: 10000,
      currency: 'USD',
      equityOffered: 8.0,
      country: 'United States',
      city: 'Midland',
      state: 'Texas',
      sector: ProjectSector.SOLAR,
      stage: ProjectStage.CONSTRUCTION,
      impactMetrics: { co2Reduction: 420000, jobsCreated: 1200, householdsServed: 400000, mwCapacity: 500 },
      sdgs: [7, 9, 11, 13],
      featured: false,
      dueDiligenceStatus: 'COMPLETED',
      dueDiligenceScore: 89,
    },
    {
      entrepreneurId: raj.id,
      title: 'Hamburg Green Hydrogen Hub',
      slug: 'hamburg-green-hydrogen-hub',
      subtitle: '10MW electrolyzer producing green hydrogen for industry',
      description: 'Industrial-scale green hydrogen production facility using offshore wind power to electrolyze water for the German steel and chemical industries.',
      status: ProjectStatus.UNDER_REVIEW,
      fundingGoal: 3200000,
      fundingRaised: 0,
      minInvestment: 2000,
      currency: 'USD',
      equityOffered: 14.0,
      country: 'Germany',
      city: 'Hamburg',
      sector: ProjectSector.GREEN_HYDROGEN,
      stage: ProjectStage.FEASIBILITY,
      impactMetrics: { co2Reduction: 75000, jobsCreated: 200, mwCapacity: 10 },
      sdgs: [7, 9, 12, 13],
      dueDiligenceStatus: 'NOT_STARTED',
    },
  ] as Project[]);
  console.log(`Created ${projects.length} projects`);

  // ============================================
  // MILESTONES
  // ============================================
  await milestoneRepo.save([
    // Machakos Solar milestones
    { projectId: projects[0].id, title: 'Land Acquisition & Permits', description: 'Secure 120 acres and all regulatory approvals', order: 1, status: MilestoneStatus.COMPLETED, fundingTranche: 200000, dueDate: new Date('2025-02-28'), completedAt: new Date('2025-02-25') },
    { projectId: projects[0].id, title: 'EPC Contractor Selection', description: 'Award engineering, procurement & construction contract', order: 2, status: MilestoneStatus.COMPLETED, fundingTranche: 300000, dueDate: new Date('2025-04-15'), completedAt: new Date('2025-04-10') },
    { projectId: projects[0].id, title: 'Grid Interconnection', description: 'Complete substation and transmission line to national grid', order: 3, status: MilestoneStatus.IN_PROGRESS, fundingTranche: 400000, dueDate: new Date('2025-08-31') },
    { projectId: projects[0].id, title: 'Commercial Operation', description: 'Full capacity operation and handover', order: 4, status: MilestoneStatus.PENDING, fundingTranche: 300000, dueDate: new Date('2026-03-31') },
    // Ngong Wind milestones
    { projectId: projects[1].id, title: 'Wind Resource Assessment', description: 'Complete 12-month LiDAR wind measurement campaign', order: 1, status: MilestoneStatus.COMPLETED, fundingTranche: 100000, dueDate: new Date('2025-03-31'), completedAt: new Date('2025-03-28') },
    { projectId: projects[1].id, title: 'Environmental Impact Study', description: 'Full EIA including bird migration patterns', order: 2, status: MilestoneStatus.IN_PROGRESS, fundingTranche: 150000, dueDate: new Date('2025-07-31') },
    { projectId: projects[1].id, title: 'Turbine Procurement', description: 'Order and manufacture 6 x 2.5MW turbines', order: 3, status: MilestoneStatus.PENDING, fundingTranche: 350000, dueDate: new Date('2025-12-31') },
    { projectId: projects[1].id, title: 'Commissioning', description: 'Install, test and commission all turbines', order: 4, status: MilestoneStatus.PENDING, fundingTranche: 250000, dueDate: new Date('2026-06-30') },
  ] as Milestone[]);
  console.log('Created milestones');

  // ============================================
  // INVESTMENTS
  // ============================================
  await investmentRepo.save([
    { investorId: sarah.id, projectId: projects[0].id, amount: 50000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-001', equityPercentage: 0.625, expectedReturns: 4250, investedAt: new Date('2025-01-20'), confirmedAt: new Date('2025-01-22') },
    { investorId: marcus.id, projectId: projects[0].id, amount: 125000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-002', equityPercentage: 1.562, expectedReturns: 10625, investedAt: new Date('2025-01-25'), confirmedAt: new Date('2025-01-27') },
    { investorId: sarah.id, projectId: projects[1].id, amount: 25000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'CARD', transactionReference: 'INV-2025-003', equityPercentage: 0.441, expectedReturns: 1875, investedAt: new Date('2025-03-01') },
    { investorId: marcus.id, projectId: projects[1].id, amount: 75000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-004', equityPercentage: 1.324, expectedReturns: 5625, investedAt: new Date('2025-03-05') },
    { investorId: sarah.id, projectId: projects[3].id, amount: 15000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-005', investedAt: new Date('2024-08-10'), confirmedAt: new Date('2024-08-12') },
    { investorId: marcus.id, projectId: projects[3].id, amount: 80000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-006', investedAt: new Date('2024-08-15'), confirmedAt: new Date('2024-08-18') },
    { investorId: sarah.id, projectId: projects[6].id, amount: 100000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-007', investedAt: new Date('2025-02-10') },
    { investorId: marcus.id, projectId: projects[6].id, amount: 200000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-008', investedAt: new Date('2025-02-15') },
    { investorId: sarah.id, projectId: projects[7].id, amount: 75000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-009', investedAt: new Date('2025-04-01') },
    { investorId: marcus.id, projectId: projects[7].id, amount: 500000, currency: 'USD', status: InvestmentStatus.CONFIRMED, paymentMethod: 'BANK_TRANSFER', transactionReference: 'INV-2025-010', investedAt: new Date('2025-04-05') },
  ] as Investment[]);
  console.log('Created investments');

  // ============================================
  // TRANSACTIONS
  // ============================================
  await transactionRepo.save([
    { userId: sarah.id, type: TransactionType.DEPOSIT, amount: 250000, currency: 'USD', status: TransactionStatus.COMPLETED, paymentMethod: 'BANK_TRANSFER', fromParty: 'Sarah Chen', toParty: 'Platform Escrow', riskScore: 15, jurisdiction: 'Singapore', processedAt: new Date('2025-01-10') },
    { userId: marcus.id, type: TransactionType.DEPOSIT, amount: 1000000, currency: 'USD', status: TransactionStatus.COMPLETED, paymentMethod: 'BANK_TRANSFER', fromParty: 'Marcus Johnson', toParty: 'Platform Escrow', riskScore: 10, jurisdiction: 'United Kingdom', processedAt: new Date('2025-01-08') },
    { userId: amina.id, type: TransactionType.DEPOSIT, amount: 50000, currency: 'USD', status: TransactionStatus.COMPLETED, paymentMethod: 'BANK_TRANSFER', fromParty: 'Amina Osei', toParty: 'Platform Escrow', riskScore: 20, jurisdiction: 'Kenya', processedAt: new Date('2025-01-05') },
    { userId: sarah.id, projectId: projects[0].id, type: TransactionType.INVESTMENT, amount: 50000, currency: 'USD', status: TransactionStatus.COMPLETED, paymentMethod: 'BANK_TRANSFER', fromParty: 'Sarah Chen', toParty: 'GreenGrid Solar Escrow', riskScore: 15, jurisdiction: 'Kenya', processedAt: new Date('2025-01-22') },
    { userId: marcus.id, projectId: projects[0].id, type: TransactionType.INVESTMENT, amount: 125000, currency: 'USD', status: TransactionStatus.COMPLETED, paymentMethod: 'BANK_TRANSFER', fromParty: 'Marcus Johnson', toParty: 'GreenGrid Solar Escrow', riskScore: 10, jurisdiction: 'Kenya', processedAt: new Date('2025-01-27') },
    { userId: sarah.id, projectId: projects[7].id, type: TransactionType.INVESTMENT, amount: 75000, currency: 'USD', status: TransactionStatus.FLAGGED, paymentMethod: 'BANK_TRANSFER', fromParty: 'Sarah Chen', toParty: 'Texas Solar Escrow', riskScore: 65, jurisdiction: 'United States', processedAt: new Date('2025-04-01') },
    { userId: marcus.id, projectId: projects[7].id, type: TransactionType.INVESTMENT, amount: 500000, currency: 'USD', status: TransactionStatus.ESCROW, paymentMethod: 'BANK_TRANSFER', fromParty: 'Marcus Johnson', toParty: 'Texas Solar Escrow', riskScore: 45, jurisdiction: 'United States', processedAt: new Date('2025-04-05') },
  ] as Transaction[]);
  console.log('Created transactions');

  // ============================================
  // DUE DILIGENCE ENGAGEMENTS
  // ============================================
  await ddRepo.save([
    {
      projectId: projects[0].id,
      assessorId: kwame.id,
      status: DueDiligenceStatus.COMPLETED,
      financialAssessment: { score: 88, findings: 'Strong financials', rating: 'GOOD' },
      technicalAssessment: { score: 85, findings: 'Proven technology', rating: 'GOOD' },
      legalAssessment: { score: 92, findings: 'All permits secured', rating: 'EXCELLENT' },
      esgAssessment: { score: 90, findings: 'High community engagement', rating: 'EXCELLENT' },
      marketAssessment: { score: 82, findings: 'Strong PPA in place', rating: 'GOOD' },
      overallScore: 87,
      riskLevel: 'LOW',
      assignedAt: new Date('2024-11-01'),
      startedAt: new Date('2024-11-05'),
      submittedAt: new Date('2024-12-15'),
      reviewedAt: new Date('2024-12-20'),
      dueDate: new Date('2025-01-15'),
      notes: 'Thorough assessment completed. Project is investment-ready.',
    },
    {
      projectId: projects[1].id,
      assessorId: elena.id,
      status: DueDiligenceStatus.IN_PROGRESS,
      assignedAt: new Date('2025-02-01'),
      startedAt: new Date('2025-02-10'),
      dueDate: new Date('2025-05-01'),
      notes: 'Technical assessment in progress.',
    },
    {
      projectId: projects[7].id,
      assessorId: elena.id,
      status: DueDiligenceStatus.COMPLETED,
      financialAssessment: { score: 90, findings: 'Solid PPA structure', rating: 'EXCELLENT' },
      technicalAssessment: { score: 88, findings: 'Proven solar + battery tech', rating: 'GOOD' },
      legalAssessment: { score: 86, findings: 'Standard ERCOT interconnection', rating: 'GOOD' },
      esgAssessment: { score: 92, findings: 'Significant emissions reduction', rating: 'EXCELLENT' },
      marketAssessment: { score: 90, findings: 'Strong grid demand', rating: 'EXCELLENT' },
      overallScore: 89,
      riskLevel: 'LOW',
      assignedAt: new Date('2024-12-01'),
      startedAt: new Date('2024-12-05'),
      submittedAt: new Date('2025-02-15'),
      reviewedAt: new Date('2025-02-20'),
      dueDate: new Date('2025-03-15'),
      notes: 'Excellent project with strong fundamentals.',
    },
  ] as DueDiligenceEngagement[]);
  console.log('Created due diligence engagements');

  // ============================================
  // COMPLIANCE ALERTS
  // ============================================
  await alertRepo.save([
    { type: 'KYC_ISSUE', severity: ComplianceAlertSeverity.HIGH, entityType: 'USER', entityId: raj.id, title: 'KYC Documents Pending Review', description: 'Entrepreneur Raj Patel submitted KYC documents that require manual review.', status: ComplianceAlertStatus.OPEN, assignedTo: admin.id },
    { type: 'AML_FLAG', severity: ComplianceAlertSeverity.MEDIUM, entityType: 'TRANSACTION', entityId: '', title: 'Large Deposit Alert', description: 'Unusual deposit pattern detected for investor Marcus Johnson.', status: ComplianceAlertStatus.UNDER_REVIEW, assignedTo: admin.id },
    { type: 'DOCUMENT_EXPIRY', severity: ComplianceAlertSeverity.LOW, entityType: 'USER', entityId: kwame.id, title: 'Assessor Certification Expiring', description: 'Dr. Kwame Asante\'s CFA certification expires in 30 days.', status: ComplianceAlertStatus.OPEN },
    { type: 'MANUAL_REVIEW', severity: ComplianceAlertSeverity.MEDIUM, entityType: 'PROJECT', entityId: projects[2].id, title: 'New Project Requires DD Assignment', description: 'Vayu Gujarat Wind Farm is UNDER_REVIEW and needs a due diligence assessor assigned.', status: ComplianceAlertStatus.OPEN, assignedTo: admin.id },
  ] as ComplianceAlert[]);
  console.log('Created compliance alerts');

  // ============================================
  // DISPUTES
  // ============================================
  await disputeRepo.save([
    { initiatorId: sarah.id, respondentId: amina.id, projectId: projects[0].id, type: DisputeType.COMMUNICATION, title: 'Milestone Update Delay', description: 'Investor requests more frequent milestone updates than currently provided.', status: DisputeStatus.UNDER_REVIEW, priority: 'medium', financialImpact: 0 },
    { initiatorId: marcus.id, projectId: projects[7].id, type: DisputeType.PAYMENT, title: 'Tax Documentation Request', description: 'Investor requesting additional tax documentation for large investment.', status: DisputeStatus.MEDIATION, priority: 'high', financialImpact: 12500 },
  ] as Dispute[]);
  console.log('Created disputes');

  // ============================================
  // AUDIT LOGS
  // ============================================
  await auditRepo.save([
    { userId: admin.id, action: 'USER_LOGIN', entityType: 'USER', entityId: admin.id, ipAddress: '192.168.1.1' },
    { userId: admin.id, action: 'PROJECT_APPROVED', entityType: 'PROJECT', entityId: projects[0].id, newValues: { status: 'ACTIVE' } },
    { userId: admin.id, action: 'KYC_VERIFIED', entityType: 'USER', entityId: amina.id, newValues: { kycStatus: 'VERIFIED' } },
    { userId: admin.id, action: 'ENGAGEMENT_CREATED', entityType: 'DUE_DILIGENCE', entityId: '', newValues: { assessorId: kwame.id, projectId: projects[0].id } },
  ] as AuditLog[]);
  console.log('Created audit logs');

  // ============================================
  // NOTIFICATIONS
  // ============================================
  await notifRepo.save([
    { userId: sarah.id, type: 'INVESTMENT_UPDATE', title: 'Investment Confirmed', message: 'Your $50,000 investment in GreenGrid Solar Farm has been confirmed.', data: { projectId: projects[0].id, amount: 50000 }, actionUrl: '/portfolio' },
    { userId: sarah.id, type: 'PROJECT_UPDATE', title: 'Milestone Completed', message: 'EPC Contractor Selection milestone completed for Machakos Solar Farm.', data: { projectId: projects[0].id, milestoneId: '' }, actionUrl: '/projects/' + projects[0].id },
    { userId: amina.id, type: 'SYSTEM', title: 'Campaign Milestone', message: 'Your Machakos Solar Farm campaign has reached 74% of funding goal.', data: { projectId: projects[0].id, progress: 74 }, actionUrl: '/projects/' + projects[0].id },
    { userId: kwame.id, type: 'DUE_DILIGENCE', title: 'New Engagement Assigned', message: 'You have been assigned to assess Ngong Hills Wind Expansion.', data: { engagementId: '', projectId: projects[1].id }, actionUrl: '/engagements' },
    { userId: marcus.id, type: 'INVESTMENT_UPDATE', title: 'Returns Distributed', message: 'You received $2,400 in returns from your Limuru Biogas investment.', data: { projectId: projects[3].id, amount: 2400 }, actionUrl: '/portfolio' },
  ] as Notification[]);
  console.log('Created notifications');

  // ============================================
  // MESSAGES
  // ============================================
  await messageRepo.save([
    { senderId: amina.id, recipientId: sarah.id, projectId: projects[0].id, content: 'Hi Sarah, thank you for your investment in our Machakos Solar Farm. We would love to show you the site next month.', read: true, readAt: new Date('2025-01-21') },
    { senderId: sarah.id, recipientId: amina.id, projectId: projects[0].id, content: 'Hi Amina, that would be wonderful. Please send over the details when ready.', read: true, readAt: new Date('2025-01-21') },
    { senderId: amina.id, recipientId: sarah.id, projectId: projects[0].id, content: 'Will do! We will also share the Q1 progress report next week.', read: false },
    { senderId: kwame.id, recipientId: admin.id, content: 'I have completed the financial assessment for the Machakos project. Overall score is 88/100.', read: true, readAt: new Date('2024-12-16') },
    { senderId: admin.id, recipientId: kwame.id, content: 'Excellent work Dr. Asante. Please proceed with the ESG assessment.', read: true, readAt: new Date('2024-12-16') },
  ] as Message[]);
  console.log('Created messages');

  await dataSource.destroy();
  console.log('\n=================================================');
  console.log('  Seeding complete!');
  console.log('  Created:');
  console.log('    - 8 users (admin, 3 investors, 2 entrepreneurs, 2 assessors)');
  console.log('    - 9 projects across 6 countries');
  console.log('    - 8 milestones');
  console.log('    - 10 investments');
  console.log('    - 3 transactions');
  console.log('    - 3 due diligence engagements');
  console.log('    - 4 compliance alerts');
  console.log('    - 2 disputes');
  console.log('    - 4 audit logs');
  console.log('    - 5 notifications');
  console.log('    - 5 messages');
  console.log('=================================================\n');
}

seed().catch(console.error);
