import { pn } from './formatters';

/**
 * Map Client Ads Performance sheet row to client object
 */
export const mapClient = (r) => {
  const sellerLeads = pn(r['Lifetime Seller Leads']);
  const buyerLeads = pn(r['Lifetime Buyer Leads']);
  const listingLeads = pn(r['Listing Leads']);
  const mortgageLeads = pn(r['Lifetime Mortgage Leads']);
  const totalLeads = sellerLeads + buyerLeads + listingLeads;
  const spend = pn(r['Total Ad Spend']);
  const sellerAppts7 = pn(r['Seller Appts in the Last 7 Days']);
  const buyerAppts7 = pn(r['Buyer Appts in the Last 7 Days']);

  return {
    client: r['Client'] || '',
    adAccount: r['Ad Account Name'] || '',
    teamMember: r['Team Member'] || '',
    status: r['Status'] || '',
    dailySetAdSpend: pn(r['Daily Set Ad Spend']),
    state: r['State'] || '',
    campaign: r['CAMPAIGN'] || '',
    specificTarget: r['Specific Target'] || '',
    overlap: r['Overlap'] || '',
    overallStanding: r['Overall Standing'] || '',
    callingStatus: r['Calling/Non-calling'] || '',
    usingDqReasons: r['Using DQ Reasons'] || '',
    callingUsingCrm: r['Calling using CRM'] || '',
    mbNotes: r['MB Detailed Notes / Test Conducted'] || '',
    currentTestings: r['Current Testings'] || '',
    clientAvgHomeValue: r['Client Avg Home Value'] || '',
    startDate: r['CORRECT SETUP TIMING START DATE'] || r['OLD Start Date'] || '',
    contract: r['Contract'] || '',
    contractLengthMonths: r['Contract Length In Months'] || '',
    remainingContractMonths: r['# Of Remaining Contract Months Left'] || '',
    leadySync: r['Lead Sync'] || r['Leady Sync'] || '',
    months: pn(r['Months Running']),
    weeks: pn(r['Weeks Running']),
    days: pn(r['Days Running']),
    spend: spend,
    spendPerMonth: pn(r['Ad Spend Per Month']),
    spendPerDay: pn(r['Ad Spend Per Day']),
    // Last 3 Days - Seller
    last3DaySellerLeads: pn(r['Last 3 Day Seller Leads']),
    last3DaySellerSpend: pn(r['Last 3 Days Seller Ad Spend']),
    last3DaySellerCPL: pn(r['Last 3 Days Seller CPL']),
    // Last 7 Days - Seller
    last7DaySellerLeads: pn(r['Last 7 Day Seller Leads']),
    last7DaySellerSpend: pn(r['Last 7 Day Seller Spend']),
    last7DaySellerCPL: pn(r['Last 7 Days Seller CPL']),
    // Lifetime - Seller
    sellerLeads: sellerLeads,
    sellerSpend: pn(r['Lifetime Seller Ad Spend']),
    sellerCPL: pn(r['Lifetime Seller CPL']),
    // Last 3 Days - Buyer
    last3DayBuyerLeads: pn(r['Last 3 Day Buyer Leads']),
    last3DayBuyerSpend: pn(r['Last 3 Days Buyer Ad Spend']),
    last3DayBuyerCPL: pn(r['Last 3 Days Buyer CPL']),
    // Last 7 Days - Buyer
    last7DayBuyerLeads: pn(r['Last 7 Day Buyer Leads']),
    last7DayBuyerSpend: pn(r['Last 7 Day Buyer Spend']),
    last7DayBuyerCPL: pn(r['Last 7 Days Buyer CPL']),
    // Lifetime - Buyer
    buyerLeads: buyerLeads,
    buyerSpend: pn(r['Lifetime Buyer Ad Spend']),
    buyerCPL: pn(r['Lifetime Buyer CPL']),
    // Other lead types
    listingLeads: listingLeads,
    // Mortgage
    last3DayMortgageLeads: pn(r['Last 3 Day Mortgage Leads']),
    last3DayMortgageSpend: pn(r['Last 3 Days Mortgage Ad Spend']),
    last3DayMortgageCPL: pn(r['Last 3 Days Mortgage CPL']),
    last7DayMortgageLeads: pn(r['Last 7 Day Mortgage Leads']),
    last7DayMortgageSpend: pn(r['Last 7 Day Mortgage Spend']),
    last7DayMortgageCPL: pn(r['Last 7 Days Mortgage CPL']),
    mortgageLeads: mortgageLeads,
    mortgageSpend: pn(r['Lifetime Mortgage Ad Spend']),
    mortgageCPL: pn(r['Lifetime Mortgage CPL']),
    mortgageAppts: pn(r['Total Appts Mortgage']),
    // Appointments
    appts: pn(r['Total Appts (Seller + Buyers)']),
    sellerAppts: pn(r['Total Seller Appts']),
    sellerAppts7: sellerAppts7,
    avgSellerApptsWeek: pn(r['Avg Seller Appts per Week']),
    sellerLeadToAppt: pn(r['Seller Lead To Appt Ratio']),
    costPerSellerAppt: pn(r['Total Ad Spend Cost Per Seller Appt'] || r['Total Ad Spend Cost Per Seller Appts']),
    buyerAppts: pn(r['Total Buyer Appts']),
    buyerAppts7: buyerAppts7,
    avgBuyerApptsWeek: pn(r['Avg Buyer Appts per Week']),
    buyerLeadToAppt: pn(r['Buyer Lead To Appt Ratio']),
    costPerBuyerAppt: pn(r['Total Ad Spend Cost Per Buyer Appts'] || r['Ad Spend Cost Per Buyer Appts']),
    // Deals
    deals: pn(r['Potential Deals']),
    listings: pn(r['Listing']),
    buyerSigned: pn(r['Buyer Signed']),
    leadsPerListing: pn(r['Leads/Listing']),
    leadsPerDeal: pn(r['Leads/Potential Deal']),
    leadsPerSignedBuyer: pn(r['Leads/Signed Buyer']),
    adSpendPerDeal: pn(r['Ad Spend/Potential Deal']),
    adSpendPerListing: pn(r['Ad Spend/Listing']),
    adSpendPerBuyer: pn(r['Ad Spend/Buyer']),
    // Computed totals
    leads: totalLeads,
    cpl: totalLeads > 0 ? spend / totalLeads : 0,
    appts7: sellerAppts7 + buyerAppts7,
    last3DayLeads: pn(r['Last 3 Day Seller Leads']) + pn(r['Last 3 Day Buyer Leads']),
    last7DayLeads: pn(r['Last 7 Day Seller Leads']) + pn(r['Last 7 Day Buyer Leads'])
  };
};

/**
 * Map Setup Timing sheet row to setup object
 */
export const mapSetupTiming = (r) => ({
  client: r['VAM'] || '',
  csmRep: r['CSM'] || '',
  lastForm: r['Last Form'] || '',
  lastFormDate: r['Date'] || '',
  status: r['Status'] || '',
  concern: r['Concern'] || '',
  referral: r['Referral'] || '',
  testimonial: r['Testmonial'] || '',
  lender: r['Status_1'] || '',
  state: r['State'] || '',
  campaign: r['Campaign'] || '',
  contractCategory: r['Contract Category'] || '',
  spanish: r['Spanish'] || '',
  mrr: r['MRR'] || '',
  fulfilled: r['Fullfilled'] || '',
  info: r['Info'] || '',
  daysLeft: r['Days left'] || '',
  duePayment: r['Due Payment'] || '',
  lastCsmNote: r['Last CSM Rep - Note - date'] || '',
  upcomingCsmDate: r['upcoming CSM rep - date'] || '',
  paidDate: r['Paid date'] || '',
  onboardedDate: r['Onboarded date'] || '',
  launchCallDate: r['Launch call date'] || '',
  adLiveDate: r[' Ad Live date'] || r['Ad Live date'] || '',
  billingCycle: r['Billing cycle'] || '',
  freeTrialDays: r['Free trial Days'] || '',
  adsOnPauseDays: r['ADs on pause total days'] || '',
  closings: r['Closings'] || '',
  signed: r['Signed'] || '',
  appts: r[' Appts '] || r['Appts'] || '',
  behindSchedule: r['Behind schedule'] || '',
  missing: r['Missing'] || '',
  shuPercent: r['SHU%'] || '',
  calling: r['Calling'] || '',
  dialer: r['Dialer'] || '',
  sLeads: r['S Leads'] || '',
  bLeads: r['B Leads'] || '',
  cpl: r['CPL'] || '',
  cpa: r['CPA'] || '',
  sAppts: r['(S)appts'] || '',
  bAppts: r['(B)appts'] || '',
  shu: r['SHU'] || '',
  ns: r['NS'] || '',
  stageOnCrm: r['Stage on CRM'] || '',
  timezone: r['Timezone'] || '',
  onboardingRep: r['Rep'] || '',
  redFlags: r['Red flags'] || '',
  crmFees: r['CRM Fees'] || '',
  adSpendFees: r['ad spend fees'] || '',
  responsiveness: r['Responsivness'] || '',
  leadGenExp: r['Lead gen exp'] || '',
  callingExpectations: r['Calling expectaions'] || '',
  fathom1: r['Fathom'] || '',
  adsOnPauseDaysDetail: r['ads on pause days'] || '',
  adAccountName: r['Ad Account name'] || '',
  adSpend: r['Ad Spend'] || '',
  radius: r['radius'] || '',
  city: r['City'] || '',
  target: r['Target'] || '',
  launch: r['Launch'] || '',
  adsRep: r['Rep'] || '',
  readiness: r['Readiness'] || '',
  personality: r['Personality'] || '',
  expectations: r['Expectations'] || '',
  unresolvedConcerns: r['Unresolved Concerns'] || '',
  firstCheckin: r['1st Check-in'] || '',
  firstCsm: r['1st CSM'] || '',
  revenueContracted: r['Revenue Contracted'] || '',
  contractLength: r['Contract length'] || '',
  moPaymentsCollected: r['mo payments collected'] || '',
  billingAdjust: r['Billing adjust'] || '',
  platform: r['Platform'] || '',
  nameEmail: r['Name/email'] || '',
  contractNotes: r['contract notes'] || '',
  paymentNotes: r['Payment notes'] || '',
  amountCollected: r['Amount collected'] || '',
  b2b: r['B2B'] || '',
  closedOn: r['Closed on'] || '',
  commission: r['commision'] || '',
  setterCloser: r['Setter & Closer'] || '',
});

/**
 * Get computed client metrics (for dashboard overview)
 */
export const getClientMetrics = (c) => ({
  ...c,
  totalLeads: c.sellerLeads + c.buyerLeads + c.listingLeads,
  last3DayLeads: c.last3DaySellerLeads + c.last3DayBuyerLeads,
  last7DayLeads: c.last7DaySellerLeads + c.last7DayBuyerLeads,
  appts7: c.sellerAppts7 + c.buyerAppts7,
  cpl: (c.sellerLeads + c.buyerLeads + c.listingLeads) > 0
    ? c.spend / (c.sellerLeads + c.buyerLeads + c.listingLeads)
    : 0
});
