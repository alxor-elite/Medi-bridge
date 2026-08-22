/**
 * Central catalog of medicines & equipment that flows through the network.
 * Descriptions are logistics-oriented only — MediBridge locates and procures
 * supplies, it does not advise on clinical use.
 */

export const CATEGORIES = {
  emergency_drug: { id: 'emergency_drug', label: 'Emergency Drug' },
  iv_fluid: { id: 'iv_fluid', label: 'IV Fluid' },
  equipment: { id: 'equipment', label: 'Equipment' },
  consumable: { id: 'consumable', label: 'Consumable' },
  blood: { id: 'blood', label: 'Blood Product' },
}

export const MEDICINES = [
  {
    id: 'med-adrenaline-1mg',
    name: 'Adrenaline 1mg/mL',
    generic: 'Epinephrine',
    category: 'emergency_drug',
    form: 'Injection',
    unit: 'ampoule',
    controlled: false,
    tags: ['adrenaline', 'epinephrine', 'anaphylaxis', 'cardiac arrest'],
  },
  {
    id: 'med-atropine-600',
    name: 'Atropine 0.6mg',
    generic: 'Atropine Sulphate',
    category: 'emergency_drug',
    form: 'Injection',
    unit: 'ampoule',
    controlled: false,
    tags: ['atropine', 'bradycardia'],
  },
  {
    id: 'med-amiodarone-150',
    name: 'Amiodarone 150mg',
    generic: 'Amiodarone HCl',
    category: 'emergency_drug',
    form: 'Injection',
    unit: 'ampoule',
    controlled: false,
    tags: ['amiodarone', 'arrhythmia', 'cardiac'],
  },
  {
    id: 'med-noradrenaline-4mg',
    name: 'Noradrenaline 4mg',
    generic: 'Norepinephrine',
    category: 'emergency_drug',
    form: 'Injection',
    unit: 'ampoule',
    controlled: false,
    tags: ['noradrenaline', 'norepinephrine', 'shock', 'vasopressor'],
  },
  {
    id: 'med-tranexamic-500',
    name: 'Tranexamic Acid 500mg',
    generic: 'Tranexamic Acid',
    category: 'emergency_drug',
    form: 'Injection',
    unit: 'ampoule',
    controlled: false,
    tags: ['tranexamic', 'txa', 'bleeding', 'trauma'],
  },
  {
    id: 'med-heparin-5000',
    name: 'Heparin 5000 IU',
    generic: 'Heparin Sodium',
    category: 'emergency_drug',
    form: 'Injection',
    unit: 'vial',
    controlled: false,
    tags: ['heparin', 'anticoagulant'],
  },
  {
    id: 'med-ceftriaxone-1g',
    name: 'Ceftriaxone 1g',
    generic: 'Ceftriaxone',
    category: 'emergency_drug',
    form: 'Injection',
    unit: 'vial',
    controlled: false,
    tags: ['ceftriaxone', 'antibiotic', 'sepsis'],
  },
  {
    id: 'med-insulin-100',
    name: 'Human Insulin 100 IU',
    generic: 'Insulin (Regular)',
    category: 'emergency_drug',
    form: 'Vial',
    unit: 'vial',
    controlled: false,
    tags: ['insulin', 'diabetes', 'dka'],
  },
  {
    id: 'med-salbutamol-inhaler',
    name: 'Salbutamol Inhaler',
    generic: 'Salbutamol',
    category: 'emergency_drug',
    form: 'Inhaler',
    unit: 'unit',
    controlled: false,
    tags: ['salbutamol', 'albuterol', 'asthma', 'respiratory'],
  },
  {
    id: 'med-normal-saline-500',
    name: 'Normal Saline 0.9% 500mL',
    generic: 'Sodium Chloride',
    category: 'iv_fluid',
    form: 'IV Bag',
    unit: 'bag',
    controlled: false,
    tags: ['saline', 'ns', 'iv fluid', 'resuscitation'],
  },
  {
    id: 'med-ringer-lactate-500',
    name: 'Ringer Lactate 500mL',
    generic: "Ringer's Lactate",
    category: 'iv_fluid',
    form: 'IV Bag',
    unit: 'bag',
    controlled: false,
    tags: ['ringer lactate', 'rl', 'iv fluid'],
  },
  {
    id: 'med-oxygen-cylinder',
    name: 'Medical Oxygen Cylinder (10L)',
    generic: 'Oxygen',
    category: 'equipment',
    form: 'Cylinder',
    unit: 'cylinder',
    controlled: false,
    tags: ['oxygen', 'o2', 'cylinder', 'respiratory'],
  },
  {
    id: 'med-ventilator',
    name: 'ICU Ventilator',
    generic: 'Mechanical Ventilator',
    category: 'equipment',
    form: 'Device',
    unit: 'unit',
    controlled: false,
    tags: ['ventilator', 'icu', 'respiratory support'],
  },
  {
    id: 'med-defibrillator',
    name: 'Defibrillator (AED)',
    generic: 'Automated External Defibrillator',
    category: 'equipment',
    form: 'Device',
    unit: 'unit',
    controlled: false,
    tags: ['defibrillator', 'aed', 'cardiac'],
  },
  {
    id: 'med-blood-o-neg',
    name: 'Blood Unit — O Negative',
    generic: 'Packed Red Cells (O-)',
    category: 'blood',
    form: 'Blood Bag',
    unit: 'unit',
    controlled: true,
    tags: ['blood', 'o negative', 'transfusion', 'universal donor'],
  },
  {
    id: 'med-n95',
    name: 'N95 Respirator Masks',
    generic: 'N95 Mask',
    category: 'consumable',
    form: 'Box of 20',
    unit: 'box',
    controlled: false,
    tags: ['n95', 'mask', 'ppe'],
  },
]

export const MEDICINE_MAP = Object.fromEntries(MEDICINES.map((m) => [m.id, m]))

/** Simple client-side catalog search over name / generic / tags. */
export function searchMedicines(query = '') {
  const q = query.trim().toLowerCase()
  if (!q) return MEDICINES
  return MEDICINES.filter((m) => {
    const haystack = [m.name, m.generic, ...(m.tags || [])]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}
