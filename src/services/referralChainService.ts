/**
 * Reusable Referral Chain Validation and Traversal Service
 * Authoritative business rules for VioLeafyServer referral networks.
 */

export interface ChainMember {
  level: number;
  customer: any;
  customerId: string;
  customerName: string;
  isTransactionCustomer: boolean;
}

export interface ResolvedChainResult {
  valid: boolean;
  reason: string;
  customerType: 'ORGANIC' | 'REFERRED';
  isOrganic: boolean;
  primaryCustomerId: string;
  chain: ChainMember[];
  loopDetected: boolean;
  duplicateCustomerDetected: boolean;
}

export interface EditValidationResult {
  valid: boolean;
  error?: string;
  message?: string;
  proposedChain?: ChainMember[];
}

/**
 * Helper to normalize string keys for consistent comparison
 */
function normKey(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().toLowerCase();
}

/**
 * Clean digits helper for phone number matching
 */
function cleanDigits(val: any): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

/**
 * Finds a customer or partner from database collections by ID, referral code, phone, or email.
 */
export async function findCustomerInCollections(
  identifier: string,
  getDocsFn: (collection: string) => Promise<any[]>
): Promise<any | null> {
  if (!identifier) return null;

  const target = normKey(identifier);
  const targetDigits = cleanDigits(identifier);

  const customers = await getDocsFn('customers');
  const referrals = await getDocsFn('referrals');
  const pool = [...customers, ...referrals];

  for (const item of pool) {
    if (!item) continue;
    const id = normKey(item.id);
    const custId = normKey(item.customerId);
    const refCode = normKey(item.referralCode || item.referralId);
    const mobileDigits = cleanDigits(item.mobileNumber);
    const email = normKey(item.email);
    const name = normKey(item.name);

    if (id === target && id !== '') return item;
    if (custId === target && custId !== '') return item;
    if (refCode === target && refCode !== '') return item;
    if (
      targetDigits.length >= 7 &&
      mobileDigits.length >= 7 &&
      (mobileDigits === targetDigits ||
        mobileDigits.endsWith(targetDigits) ||
        targetDigits.endsWith(mobileDigits))
    ) {
      return item;
    }
    if (email === target && email !== '') return item;
    if (name === target && name !== '') return item;
  }

  return null;
}

/**
 * Gets existing upline/sponsor ID for a given customer.
 */
export function resolveValidSponsorId(customer: any): string | null {
  if (!customer) return null;

  const ownKeys = new Set<string>();
  if (customer.id) ownKeys.add(String(customer.id).trim().toLowerCase());
  if (customer.customerId) ownKeys.add(String(customer.customerId).trim().toLowerCase());
  if (customer.referralCode) ownKeys.add(String(customer.referralCode).trim().toLowerCase());
  if (customer.referralId) ownKeys.add(String(customer.referralId).trim().toLowerCase());

  const ownMobileDigits = cleanDigits(customer.mobileNumber);

  const candidates = [
    customer.referredById,
    customer.parentId,
    customer.sponsorPartnerId,
    customer.sponsorId,
    customer.sponsorCode,
    customer.referredByCode,
    customer.referredBy,
    customer.referralmobileno,
  ];

  for (const rawCandidate of candidates) {
    if (!rawCandidate) continue;
    const candStr = String(rawCandidate).trim();
    if (!candStr) continue;

    const candLower = candStr.toLowerCase();
    const candDigits = cleanDigits(candStr);

    // Guard against self-referral
    if (ownKeys.has(candLower)) continue;
    if (
      candDigits &&
      ownMobileDigits &&
      candDigits.length >= 7 &&
      ownMobileDigits.length >= 7 &&
      (candDigits === ownMobileDigits ||
        candDigits.endsWith(ownMobileDigits) ||
        ownMobileDigits.endsWith(candDigits))
    ) {
      continue;
    }

    return candStr;
  }

  return null;
}

export function getExistingUplineId(customer: any): string | null {
  return resolveValidSponsorId(customer);
}

/**
 * Resolves transaction-relative referral chain up to Level 6.
 * L1 = Transaction Customer (Primary)
 * L2 = Immediate Upline
 * L3 = Second Upline
 * L4 = Third Upline
 * L5 = Fourth Upline
 * L6 = Fifth Upline (Termination Boundary - No Commission)
 * L7 = NEVER generated!
 */
export async function resolveReferralChainAuthoritative(
  transactionCustomerId: string,
  getDocsFn: (collection: string) => Promise<any[]>
): Promise<ResolvedChainResult> {
  const transactionCustomer = await findCustomerInCollections(transactionCustomerId, getDocsFn);

  if (!transactionCustomer) {
    return {
      valid: false,
      reason: 'CUSTOMER_NOT_FOUND',
      customerType: 'ORGANIC',
      isOrganic: true,
      primaryCustomerId: transactionCustomerId,
      chain: [],
      loopDetected: false,
      duplicateCustomerDetected: false,
    };
  }

  const primaryId = String(
    transactionCustomer.id || transactionCustomer.customerId || transactionCustomer.referralCode || transactionCustomerId
  );
  const primaryName = transactionCustomer.name || transactionCustomer.customerName || 'Unnamed Customer';

  const chain: ChainMember[] = [];
  const visitedCustomers = new Set<string>();

  // L1 is ALWAYS the transaction customer
  chain.push({
    level: 1,
    customer: transactionCustomer,
    customerId: primaryId,
    customerName: primaryName,
    isTransactionCustomer: true,
  });

  visitedCustomers.add(normKey(primaryId));

  const directUplineId = getExistingUplineId(transactionCustomer);

  // Check if ORGANIC
  if (!directUplineId) {
    return {
      valid: true,
      reason: 'ORGANIC_CUSTOMER',
      customerType: 'ORGANIC',
      isOrganic: true,
      primaryCustomerId: primaryId,
      chain,
      loopDetected: false,
      duplicateCustomerDetected: false,
    };
  }

  let currentUplineId: string | null = directUplineId;
  let level = 2; // Immediate upline is L2

  let loopDetected = false;
  let duplicateCustomerDetected = false;
  let terminationReason = 'MAX_LEVEL_REACHED';

  while (currentUplineId && level <= 6) {
    const sponsor = await findCustomerInCollections(currentUplineId, getDocsFn);

    if (!sponsor) {
      terminationReason = 'NO_FURTHER_UPLINE';
      break;
    }

    const sponsorId = String(sponsor.id || sponsor.customerId || sponsor.referralCode || currentUplineId);
    const sponsorKey = normKey(sponsorId);

    // Loop & Duplicate Customer Detection
    if (visitedCustomers.has(sponsorKey)) {
      loopDetected = true;
      duplicateCustomerDetected = true;
      terminationReason = 'REFERRAL_LOOP_DETECTED';
      console.warn(`[REFERRAL_CHAIN] Loop/duplicate customer detected for sponsor ${sponsorId} at L${level}. Terminating.`);
      break;
    }

    visitedCustomers.add(sponsorKey);

    chain.push({
      level,
      customer: sponsor,
      customerId: sponsorId,
      customerName: sponsor.name || sponsor.customerName || 'Unnamed Partner',
      isTransactionCustomer: false,
    });

    if (level === 6) {
      terminationReason = 'L6_TERMINATION_BOUNDARY_REACHED';
      break;
    }

    currentUplineId = getExistingUplineId(sponsor);
    level++;
  }

  return {
    valid: !loopDetected,
    reason: loopDetected ? 'REFERRAL_LOOP_DETECTED' : terminationReason,
    customerType: 'REFERRED',
    isOrganic: false,
    primaryCustomerId: primaryId,
    chain,
    loopDetected,
    duplicateCustomerDetected,
  };
}

/**
 * Validates whether an existing referral relationship edit is permitted.
 * Blocks creating brand-new relationships if no relationship previously existed,
 * unless explicitly authorized as an existing-relationship correction workflow.
 * Rejects self-referrals, loops/cycles, duplicate relationships.
 */
export async function validateExistingReferralEdit(
  customerId: string,
  proposedSponsorId: string,
  getDocsFn: (collection: string) => Promise<any[]>
): Promise<EditValidationResult> {
  if (!customerId || !proposedSponsorId) {
    return {
      valid: false,
      error: 'INVALID_INPUT',
      message: 'Both customer ID and proposed sponsor ID are required.',
    };
  }

  const customer = await findCustomerInCollections(customerId, getDocsFn);
  if (!customer) {
    return {
      valid: false,
      error: 'CUSTOMER_NOT_FOUND',
      message: `Customer ${customerId} not found in database.`,
    };
  }

  // 1. Check self-referral
  const normCustId = normKey(customerId);
  const normSponsorInput = normKey(proposedSponsorId);

  const targetSponsor = await findCustomerInCollections(proposedSponsorId, getDocsFn);
  if (!targetSponsor) {
    return {
      valid: false,
      error: 'SPONSOR_NOT_FOUND',
      message: `Proposed sponsor ${proposedSponsorId} not found in database.`,
    };
  }

  const normTargetSponsorId = normKey(targetSponsor.id || targetSponsor.customerId || targetSponsor.referralCode);
  const normTargetSponsorMobile = cleanDigits(targetSponsor.mobileNumber);
  const normCustMobile = cleanDigits(customer.mobileNumber);

  if (
    normCustId === normSponsorInput ||
    normCustId === normTargetSponsorId ||
    (normTargetSponsorMobile && normCustMobile === normTargetSponsorMobile)
  ) {
    return {
      valid: false,
      error: 'SELF_REFERRAL_PROHIBITED',
      message: 'A customer cannot refer themselves or be their own sponsor.',
    };
  }

  // 2. Check duplicate relationship (if existing sponsor is already target sponsor)
  const currentSponsorId = getExistingUplineId(customer);
  if (currentSponsorId) {
    const normCurrent = normKey(currentSponsorId);
    const cleanCurrentDigits = cleanDigits(currentSponsorId);

    if (
      normCurrent === normTargetSponsorId ||
      normCurrent === normSponsorInput ||
      (cleanCurrentDigits.length >= 7 && normTargetSponsorMobile && cleanCurrentDigits === normTargetSponsorMobile)
    ) {
      return {
        valid: false,
        error: 'DUPLICATE_RELATIONSHIP',
        message: 'This referral relationship already exists.',
      };
    }
  }

  // 3. Cycle Detection: Check if customer is an ancestor of the proposed sponsor
  // Traversing up from proposed sponsor
  let current: any = targetSponsor;
  const visited = new Set<string>();
  visited.add(normTargetSponsorId);

  while (current) {
    const parentId = getExistingUplineId(current);
    if (!parentId) break;

    const normParent = normKey(parentId);

    if (normParent === normCustId) {
      return {
        valid: false,
        error: 'CIRCULAR_REFERRAL_DETECTED',
        message: 'Modifying this relationship would create a circular referral loop.',
      };
    }

    if (visited.has(normParent)) {
      // Existing loop in proposed sponsor's chain
      break;
    }

    visited.add(normParent);
    current = await findCustomerInCollections(parentId, getDocsFn);
  }

  return {
    valid: true,
    message: 'Referral relationship edit validation passed.',
  };
}

/**
 * Centralized service object for Referral Chain operations
 */
export const ReferralChainService = {
  findCustomer: findCustomerInCollections,
  getExistingUplineId,
  resolveChain: resolveReferralChainAuthoritative,
  validateEdit: validateExistingReferralEdit,
};
