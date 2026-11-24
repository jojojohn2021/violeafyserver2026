import type { AIHealthBenefit } from '../types';

/**
 * Shared structured builders for Section 3:
 * 1. Health Benefits (6 numbered titled points: "Title: Description")
 * 2. Nutritional Information (intro + Nutrient\tNutritional contribution table + Important note)
 * 3. Safety Precautions (Important + titled bullet points + closing disclaimer)
 */

function isAmlaProduct(productName: string): boolean {
  return /\b(amla|nellikk?a|amalaki|gooseberry)\b/i.test(productName);
}

function isSweetOrCandyProduct(productName: string): boolean {
  return /\b(sweet|candy|sugar|coated|honey|jaggery|murabba)\b/i.test(productName);
}

function isHouseholdProduct(productName: string): boolean {
  return /cleaner|detergent|repellent|dishwash|handwash|perfume|floor/i.test(productName);
}

export function buildStructuredHealthBenefits(productName: string): AIHealthBenefit[] {
  const cleanName = String(productName || 'This product').trim();
  if (isHouseholdProduct(cleanName)) {
    return [];
  }

  if (isAmlaProduct(cleanName)) {
    return [
      {
        claim:
          'Rich in antioxidants: Amla contains polyphenols, flavonoids and other antioxidant compounds that help protect cells against oxidative stress.',
        evidence_level: 'nutritional',
        reference_ids: ['REF-1'],
        review_status: 'pending_review',
      },
      {
        claim:
          'Supports immunity: Amla naturally contains vitamin C, although drying and processing can significantly reduce its content.',
        evidence_level: 'nutritional',
        reference_ids: ['REF-1'],
        review_status: 'pending_review',
      },
      {
        claim:
          'Digestive health: Traditionally used to support digestion. Its fibre content may help maintain bowel regularity.',
        evidence_level: 'traditional_use',
        reference_ids: ['REF-1', 'REF-2'],
        review_status: 'pending_review',
      },
      {
        claim:
          'Heart health: Amla polyphenols have been studied for their potential role in supporting healthy cholesterol and cardiovascular health.',
        evidence_level: 'preliminary_study',
        reference_ids: ['REF-1'],
        review_status: 'pending_review',
      },
      {
        claim:
          'Skin and hair health: Its antioxidant nutrients contribute to general skin and tissue health.',
        evidence_level: 'traditional_use',
        reference_ids: ['REF-1'],
        review_status: 'pending_review',
      },
      {
        claim:
          'Traditional Ayurvedic use: Amla is traditionally used as a rejuvenating fruit (Rasayana) in Ayurveda.',
        evidence_level: 'traditional_use',
        reference_ids: ['REF-1', 'REF-2'],
        review_status: 'pending_review',
      },
    ];
  }

  return [
    {
      claim: `Rich in antioxidants: ${cleanName} naturally contains polyphenols, flavonoids and botanical antioxidant compounds that help protect cells against oxidative stress.`,
      evidence_level: 'nutritional',
      reference_ids: ['REF-1'],
      review_status: 'pending_review',
    },
    {
      claim: `Supports immunity: ${cleanName} provides natural phytonutrients and micronutrients that support everyday immune resilience as part of a balanced diet.`,
      evidence_level: 'nutritional',
      reference_ids: ['REF-1'],
      review_status: 'pending_review',
    },
    {
      claim: `Digestive health: Traditionally used to support healthy digestion. Its natural dietary fibre and aromatic compounds may help maintain bowel regularity.`,
      evidence_level: 'traditional_use',
      reference_ids: ['REF-1', 'REF-2'],
      review_status: 'pending_review',
    },
    {
      claim: `Heart and metabolic health: Plant polyphenols in ${cleanName} have been studied for their potential role in supporting healthy lipid balance and cardiovascular wellness.`,
      evidence_level: 'preliminary_study',
      reference_ids: ['REF-1'],
      review_status: 'pending_review',
    },
    {
      claim: `Skin and tissue health: Its natural antioxidant nutrients and trace minerals contribute to general skin, hair and tissue health.`,
      evidence_level: 'traditional_use',
      reference_ids: ['REF-1'],
      review_status: 'pending_review',
    },
    {
      claim: `Traditional Ayurvedic use: ${cleanName} is traditionally valued in Ayurveda and Indian culinary heritage for supporting everyday vitality and seasonal balance.`,
      evidence_level: 'traditional_use',
      reference_ids: ['REF-1', 'REF-2'],
      review_status: 'pending_review',
    },
  ];
}

export function buildStructuredNutritionalInformation(productName: string): string {
  const cleanName = String(productName || 'This product').trim();
  if (isHouseholdProduct(cleanName)) {
    return 'Not applicable for household care products.';
  }

  if (isAmlaProduct(cleanName)) {
    const sweetNote = isSweetOrCandyProduct(cleanName)
      ? 'Important: Sweet-coated dried amla is not nutritionally equivalent to fresh amla. Added sugar can substantially increase its calorie and carbohydrate content.'
      : 'Important: Dried or processed amla is not nutritionally identical to fresh amla. Drying, sweetening, or processing methods can alter vitamin C, calorie, and carbohydrate levels.';

    return [
      'The exact nutritional composition depends on the drying method, sugar coating and recipe.',
      'Nutrient\tNutritional contribution',
      'Carbohydrates\tNaturally present sugars and added sugar',
      'Dietary fibre\tSupports digestive health',
      'Vitamin C\tMay be present, but reduced by processing',
      'Polyphenols\tAntioxidant compounds',
      'Calcium\tSmall amounts',
      'Iron\tSmall amounts',
      'Potassium\tNaturally present',
      '',
      sweetNote,
    ].join('\n');
  }

  const sweetProduct = isSweetOrCandyProduct(cleanName);
  return [
    `The exact nutritional composition of ${cleanName} depends on the cultivar, drying method, processing and recipe.`,
    'Nutrient\tNutritional contribution',
    `Carbohydrates\t${sweetProduct ? 'Naturally present sugars and added sugar' : 'Naturally occurring plant carbohydrates'}`,
    'Dietary fibre\tSupports digestive health',
    'Vitamin C / Phytonutrients\tNaturally present; levels may vary with drying and processing',
    'Polyphenols\tAntioxidant compounds',
    'Calcium\tSmall amounts',
    'Iron\tSmall amounts',
    'Potassium\tNaturally present',
    '',
    sweetProduct
      ? `Important: Sweet-coated or processed ${cleanName} is not nutritionally equivalent to fresh whole botanicals. Added sugar can substantially increase its calorie and carbohydrate content.`
      : `Important: Natural agricultural products vary by harvest, origin, and processing. Check the product nutrition label for batch-specific values.`,
  ].join('\n');
}

export function buildStructuredSafetyPrecautionsText(productName: string): string {
  const cleanName = String(productName || 'This product').trim();
  if (isHouseholdProduct(cleanName)) {
    return [
      'Important',
      '- External use only: Keep out of reach of children and pets.',
      '- Eye and skin contact: Avoid direct contact with eyes; rinse thoroughly with water if contact occurs.',
      '- Storage: Store tightly closed away from heat and food items.',
    ].join('\n');
  }

  if (isAmlaProduct(cleanName)) {
    return [
      'Important',
      '- Diabetes: Sweet-coated amla can contain considerable added sugar. People with diabetes should limit portions and check the nutrition label.',
      '- Excessive consumption: May cause stomach discomfort, acidity or loose stools in some people.',
      '- Blood-thinning medicines: Amla extracts may affect platelet activity. People taking anticoagulant or antiplatelet medicines should consult their doctor before regular medicinal use.',
      '- Blood sugar medication: Amla may influence blood glucose; monitor levels if consuming it regularly alongside diabetes medication.',
      '- Dental health: Frequent consumption of sugary, acidic candy can contribute to tooth decay.',
      '- Pregnancy and breastfeeding: Normal food quantities are different from concentrated medicinal supplements; seek medical advice before using high-dose amla preparations.',
      'These precautions are particularly relevant to concentrated extracts and supplements, not necessarily occasional food consumption',
    ].join('\n');
  }

  const sweetProduct = isSweetOrCandyProduct(cleanName);
  return [
    'Important',
    `- Diabetes: ${sweetProduct ? `${cleanName} can contain considerable added sugar. People with diabetes should limit portions and check the nutrition label.` : `Monitor portion sizes and check the nutrition label if you are managing blood glucose levels.`}`,
    `- Excessive consumption: May cause stomach discomfort, acidity or loose stools in some people.`,
    `- Blood-thinning medicines: Concentrated botanical extracts may interact with platelet activity. People taking anticoagulant or antiplatelet medicines should consult their doctor before regular medicinal use.`,
    `- Blood sugar medication: Regular high-dose consumption may influence blood glucose; monitor levels if taking diabetes medication.`,
    `- Allergies & sensitivities: Check the ingredient label for potential botanical allergens before use.`,
    `- Pregnancy and breastfeeding: Normal food quantities are different from concentrated medicinal supplements; seek medical advice before using high-dose ${cleanName} preparations.`,
    'These precautions are particularly relevant to concentrated extracts and supplements, not necessarily occasional food consumption',
  ].join('\n');
}

export function safetyPrecautionsTextToLines(text: string): string[] {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatSafetyPrecautionsArrayToText(
  lines: string[] | undefined,
  productName: string
): string {
  if (Array.isArray(lines) && lines.length > 0) {
    const joined = lines.join('\n').trim();
    // If it already looks structured (starts with Important or has "- " bullets), return as-is
    if (/^Important\b/i.test(joined) || lines.some((l) => l.trim().startsWith('- '))) {
      return joined;
    }
    return joined;
  }
  return buildStructuredSafetyPrecautionsText(productName);
}
