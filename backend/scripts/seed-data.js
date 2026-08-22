'use strict';

/**
 * Source data for the demo seed.
 *
 * Real product and organisation-shaped names so the demo looks credible, but
 * every organisation, address and person here is invented. There is no patient
 * data anywhere in this file, and there must never be.
 */

/** Bengaluru city centre - the demo network is clustered around it. */
const CITY = { name: 'Bengaluru', latitude: 12.9716, longitude: 77.5946 };

const LOCALITIES = [
  'Indiranagar', 'Koramangala', 'Jayanagar', 'Malleshwaram', 'Whitefield',
  'HSR Layout', 'Rajajinagar', 'Basavanagudi', 'Yelahanka', 'Marathahalli',
  'Banashankari', 'Hebbal', 'BTM Layout', 'JP Nagar', 'Electronic City',
  'Vijayanagar', 'Frazer Town', 'Sadashivanagar', 'Bellandur', 'Kalyan Nagar',
];

const HOSPITAL_NAMES = [
  'Aster Central', 'Sanjeevini Multispecialty', 'Meenakshi General', 'Vydehi Care',
  'St. Martha Memorial', 'Chirayu Trauma Centre', 'Nightingale Institute', 'Sparsh Ortho',
  'Cauvery Heart Centre', 'Amrutha Childrens', 'Sagar Speciality', 'Rainbow Womens',
  'Kaveri Emergency', 'Prakriya Medical', 'Sunrise Critical Care', 'Bhagwan Mahaveer',
  'Trinity Wellness', 'Sushrutha Surgical', 'Manipal Riverside', 'Aarogya Community',
];

const PHARMACY_NAMES = [
  'MedPlus', 'Apollo Pharmacy', 'Wellness Forever', 'Trust Chemists', 'Sri Sai Medicals',
  'Janata Medical Stores', 'Health First', 'Lifeline Chemists', 'CarePoint Pharmacy',
  'Green Cross Medicals', 'Ganesh Medical Hall', 'Nova Chemists', 'Vitality Drug House',
  'Aayush Pharmacy', 'Meds24 Store', 'Prime Care Chemists', 'Sanjivani Medicals',
  'Krishna Drug House', 'Om Sai Pharmacy', 'City Medical Stores', 'Sharada Chemists',
  'Bharath Medicals', 'Curewell Pharmacy', 'Vasan Medical Store', 'Shanti Chemists',
  'Ashirwad Medicals', 'Nectar Pharmacy', 'Vijaya Drug Mart', 'Sanchi Medicals',
  'Hilltop Chemists',
];

const SUPPLIER_NAMES = [
  'Kaveri Medical Distributors', 'Deccan Pharma Logistics', 'BioServe Supply Chain',
  'Nandi Healthcare Supplies', 'SouthMed Wholesalers', 'Vitrix Medical Depot',
  'Ashoka Surgical Supplies', 'CoreMed Distribution', 'Pinnacle Pharma Trading',
  'Sahyadri Cold Chain',
];

/**
 * Catalogue seed. Combined with the forms/strengths below this expands past
 * the 100 medicines the brief asks for.
 */
const MEDICINE_BASE = [
  { generic: 'Adrenaline (Epinephrine)', brand: 'Adrenor', category: 'Emergency', form: 'Injection', strengths: ['1mg/ml', '0.5mg/ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Atropine Sulphate', brand: 'Atrosulf', category: 'Emergency', form: 'Injection', strengths: ['0.6mg/ml'], rx: true },
  { generic: 'Amiodarone', brand: 'Cordarone', category: 'Cardiology', form: 'Injection', strengths: ['150mg/3ml'], rx: true },
  { generic: 'Noradrenaline', brand: 'Noradren', category: 'Emergency', form: 'Injection', strengths: ['2mg/2ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Dopamine', brand: 'Dopacard', category: 'Cardiology', form: 'Injection', strengths: ['200mg/5ml'], rx: true },
  { generic: 'Paracetamol', brand: 'Dolo', category: 'Analgesic', form: 'Tablet', strengths: ['500mg', '650mg'] },
  { generic: 'Ibuprofen', brand: 'Brufen', category: 'Analgesic', form: 'Tablet', strengths: ['200mg', '400mg'] },
  { generic: 'Diclofenac Sodium', brand: 'Voveran', category: 'Analgesic', form: 'Injection', strengths: ['75mg/3ml'], rx: true },
  { generic: 'Tramadol', brand: 'Ultracet', category: 'Analgesic', form: 'Capsule', strengths: ['50mg'], rx: true },
  { generic: 'Morphine Sulphate', brand: 'Morcontin', category: 'Analgesic', form: 'Injection', strengths: ['10mg/ml'], rx: true },
  { generic: 'Amoxicillin', brand: 'Mox', category: 'Antibiotic', form: 'Capsule', strengths: ['250mg', '500mg'], rx: true },
  { generic: 'Amoxicillin + Clavulanate', brand: 'Augmentin', category: 'Antibiotic', form: 'Tablet', strengths: ['625mg'], rx: true },
  { generic: 'Azithromycin', brand: 'Azithral', category: 'Antibiotic', form: 'Tablet', strengths: ['250mg', '500mg'], rx: true },
  { generic: 'Ceftriaxone', brand: 'Monocef', category: 'Antibiotic', form: 'Injection', strengths: ['1g', '2g'], rx: true },
  { generic: 'Meropenem', brand: 'Meronem', category: 'Antibiotic', form: 'Injection', strengths: ['500mg', '1g'], rx: true },
  { generic: 'Vancomycin', brand: 'Vancocin', category: 'Antibiotic', form: 'Injection', strengths: ['500mg'], rx: true },
  { generic: 'Piperacillin + Tazobactam', brand: 'Zosyn', category: 'Antibiotic', form: 'Injection', strengths: ['4.5g'], rx: true },
  { generic: 'Metronidazole', brand: 'Flagyl', category: 'Antibiotic', form: 'Infusion', strengths: ['500mg/100ml'], rx: true },
  { generic: 'Ciprofloxacin', brand: 'Cifran', category: 'Antibiotic', form: 'Tablet', strengths: ['500mg'], rx: true },
  { generic: 'Doxycycline', brand: 'Doxt', category: 'Antibiotic', form: 'Capsule', strengths: ['100mg'], rx: true },
  { generic: 'Insulin Human', brand: 'Actrapid', category: 'Endocrine', form: 'Injection', strengths: ['100IU/ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Insulin Glargine', brand: 'Lantus', category: 'Endocrine', form: 'Injection', strengths: ['100IU/ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Metformin', brand: 'Glycomet', category: 'Endocrine', form: 'Tablet', strengths: ['500mg', '850mg'], rx: true },
  { generic: 'Levothyroxine', brand: 'Thyronorm', category: 'Endocrine', form: 'Tablet', strengths: ['50mcg', '100mcg'], rx: true },
  { generic: 'Hydrocortisone', brand: 'Efcorlin', category: 'Steroid', form: 'Injection', strengths: ['100mg'], rx: true },
  { generic: 'Dexamethasone', brand: 'Decadron', category: 'Steroid', form: 'Injection', strengths: ['4mg/ml'], rx: true },
  { generic: 'Methylprednisolone', brand: 'Solu-Medrol', category: 'Steroid', form: 'Injection', strengths: ['40mg', '125mg'], rx: true },
  { generic: 'Salbutamol', brand: 'Asthalin', category: 'Respiratory', form: 'Respule', strengths: ['2.5mg/2.5ml'] },
  { generic: 'Ipratropium Bromide', brand: 'Ipravent', category: 'Respiratory', form: 'Respule', strengths: ['500mcg/2ml'] },
  { generic: 'Budesonide', brand: 'Budecort', category: 'Respiratory', form: 'Respule', strengths: ['0.5mg/2ml'], rx: true },
  { generic: 'Montelukast', brand: 'Montair', category: 'Respiratory', form: 'Tablet', strengths: ['10mg'], rx: true },
  { generic: 'Heparin Sodium', brand: 'Heparin', category: 'Anticoagulant', form: 'Injection', strengths: ['5000IU/ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Enoxaparin', brand: 'Clexane', category: 'Anticoagulant', form: 'Injection', strengths: ['40mg/0.4ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Warfarin', brand: 'Warf', category: 'Anticoagulant', form: 'Tablet', strengths: ['5mg'], rx: true },
  { generic: 'Tranexamic Acid', brand: 'Texid', category: 'Haemostatic', form: 'Injection', strengths: ['500mg/5ml'], rx: true },
  { generic: 'Aspirin', brand: 'Ecosprin', category: 'Cardiology', form: 'Tablet', strengths: ['75mg', '150mg'] },
  { generic: 'Atorvastatin', brand: 'Atorva', category: 'Cardiology', form: 'Tablet', strengths: ['10mg', '40mg'], rx: true },
  { generic: 'Metoprolol', brand: 'Metolar', category: 'Cardiology', form: 'Tablet', strengths: ['25mg', '50mg'], rx: true },
  { generic: 'Amlodipine', brand: 'Amlong', category: 'Cardiology', form: 'Tablet', strengths: ['5mg', '10mg'], rx: true },
  { generic: 'Furosemide', brand: 'Lasix', category: 'Cardiology', form: 'Injection', strengths: ['20mg/2ml'], rx: true },
  { generic: 'Nitroglycerin', brand: 'Nitrocontin', category: 'Cardiology', form: 'Injection', strengths: ['5mg/ml'], rx: true },
  { generic: 'Ondansetron', brand: 'Emeset', category: 'Antiemetic', form: 'Injection', strengths: ['2mg/ml'] },
  { generic: 'Pantoprazole', brand: 'Pantocid', category: 'Gastro', form: 'Injection', strengths: ['40mg'], rx: true },
  { generic: 'Ranitidine', brand: 'Rantac', category: 'Gastro', form: 'Injection', strengths: ['25mg/ml'] },
  { generic: 'Domperidone', brand: 'Domstal', category: 'Gastro', form: 'Tablet', strengths: ['10mg'] },
  { generic: 'Midazolam', brand: 'Fulsed', category: 'Anaesthesia', form: 'Injection', strengths: ['5mg/ml'], rx: true },
  { generic: 'Propofol', brand: 'Diprivan', category: 'Anaesthesia', form: 'Injection', strengths: ['200mg/20ml'], rx: true },
  { generic: 'Ketamine', brand: 'Ketmin', category: 'Anaesthesia', form: 'Injection', strengths: ['50mg/ml'], rx: true },
  { generic: 'Lignocaine', brand: 'Xylocaine', category: 'Anaesthesia', form: 'Injection', strengths: ['2%'], rx: true },
  { generic: 'Succinylcholine', brand: 'Scoline', category: 'Anaesthesia', form: 'Injection', strengths: ['50mg/ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Phenytoin', brand: 'Eptoin', category: 'Neurology', form: 'Injection', strengths: ['50mg/ml'], rx: true },
  { generic: 'Levetiracetam', brand: 'Levera', category: 'Neurology', form: 'Injection', strengths: ['500mg/5ml'], rx: true },
  { generic: 'Diazepam', brand: 'Calmpose', category: 'Neurology', form: 'Injection', strengths: ['10mg/2ml'], rx: true },
  { generic: 'Mannitol', brand: 'Mannitol', category: 'Neurology', form: 'Infusion', strengths: ['20% 100ml'], rx: true },
  { generic: 'Normal Saline', brand: 'NS', category: 'IV Fluid', form: 'Infusion', strengths: ['0.9% 500ml', '0.9% 1000ml'] },
  { generic: 'Ringer Lactate', brand: 'RL', category: 'IV Fluid', form: 'Infusion', strengths: ['500ml'] },
  { generic: 'Dextrose', brand: 'DNS', category: 'IV Fluid', form: 'Infusion', strengths: ['5% 500ml', '25% 100ml'] },
  { generic: 'Tetanus Immunoglobulin', brand: 'Tetglob', category: 'Immunological', form: 'Injection', strengths: ['250IU'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Anti-Rabies Vaccine', brand: 'Rabipur', category: 'Vaccine', form: 'Injection', strengths: ['1ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Anti-Snake Venom', brand: 'Snake Venom Antiserum', category: 'Antidote', form: 'Injection', strengths: ['10ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Naloxone', brand: 'Nalox', category: 'Antidote', form: 'Injection', strengths: ['0.4mg/ml'], rx: true },
  { generic: 'N-Acetylcysteine', brand: 'Mucomix', category: 'Antidote', form: 'Injection', strengths: ['200mg/ml'], rx: true },
  { generic: 'Activated Charcoal', brand: 'Carbomix', category: 'Antidote', form: 'Suspension', strengths: ['50g'] },
  { generic: 'Oxytocin', brand: 'Syntocinon', category: 'Obstetrics', form: 'Injection', strengths: ['5IU/ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Magnesium Sulphate', brand: 'MgSO4', category: 'Obstetrics', form: 'Injection', strengths: ['1g/2ml'], rx: true },
  { generic: 'Iron Sucrose', brand: 'Orofer S', category: 'Haematology', form: 'Injection', strengths: ['100mg/5ml'], rx: true },
  { generic: 'Vitamin K', brand: 'Kapex', category: 'Haematology', form: 'Injection', strengths: ['10mg/ml'], rx: true },
  { generic: 'Potassium Chloride', brand: 'KCl', category: 'Electrolyte', form: 'Injection', strengths: ['15% 10ml'], rx: true },
  { generic: 'Sodium Bicarbonate', brand: 'Soda Bicarb', category: 'Electrolyte', form: 'Injection', strengths: ['7.5% 25ml'] },
  { generic: 'Calcium Gluconate', brand: 'Calcigluc', category: 'Electrolyte', form: 'Injection', strengths: ['10% 10ml'] },
  { generic: 'Clopidogrel', brand: 'Clopilet', category: 'Cardiology', form: 'Tablet', strengths: ['75mg'], rx: true },
  { generic: 'Streptokinase', brand: 'STPase', category: 'Cardiology', form: 'Injection', strengths: ['1.5MIU'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Dobutamine', brand: 'Dobutrex', category: 'Cardiology', form: 'Injection', strengths: ['250mg/5ml'], rx: true },
  { generic: 'Labetalol', brand: 'Lobet', category: 'Cardiology', form: 'Injection', strengths: ['20mg/4ml'], rx: true },
  { generic: 'Fentanyl', brand: 'Fentanyl', category: 'Anaesthesia', form: 'Injection', strengths: ['50mcg/ml'], rx: true },
  { generic: 'Vecuronium', brand: 'Norcuron', category: 'Anaesthesia', form: 'Injection', strengths: ['4mg'], rx: true },
  { generic: 'Neostigmine', brand: 'Prostigmin', category: 'Anaesthesia', form: 'Injection', strengths: ['0.5mg/ml'], rx: true },
  { generic: 'Linezolid', brand: 'Linospan', category: 'Antibiotic', form: 'Infusion', strengths: ['600mg/300ml'], rx: true },
  { generic: 'Colistin', brand: 'Colistimax', category: 'Antibiotic', form: 'Injection', strengths: ['1MIU'], rx: true },
  { generic: 'Cefotaxime', brand: 'Taxim', category: 'Antibiotic', form: 'Injection', strengths: ['1g'], rx: true },
  { generic: 'Gentamicin', brand: 'Genticyn', category: 'Antibiotic', form: 'Injection', strengths: ['80mg/2ml'], rx: true },
  { generic: 'Fluconazole', brand: 'Forcan', category: 'Antifungal', form: 'Infusion', strengths: ['200mg/100ml'], rx: true },
  { generic: 'Amphotericin B', brand: 'Fungizone', category: 'Antifungal', form: 'Injection', strengths: ['50mg'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Acyclovir', brand: 'Zovirax', category: 'Antiviral', form: 'Injection', strengths: ['250mg'], rx: true },
  { generic: 'Artesunate', brand: 'Falcigo', category: 'Antimalarial', form: 'Injection', strengths: ['60mg'], rx: true },
  { generic: 'Hydroxyethyl Starch', brand: 'Voluven', category: 'IV Fluid', form: 'Infusion', strengths: ['6% 500ml'], rx: true },
  { generic: 'Human Albumin', brand: 'Alburel', category: 'IV Fluid', form: 'Infusion', strengths: ['20% 100ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Tetanus Toxoid', brand: 'TT Vaccine', category: 'Vaccine', form: 'Injection', strengths: ['0.5ml'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Hepatitis B Immunoglobulin', brand: 'Hepabig', category: 'Immunological', form: 'Injection', strengths: ['100IU'], storage: 'COLD_CHAIN_2_8C', rx: true },
  { generic: 'Protamine Sulphate', brand: 'Protasulf', category: 'Antidote', form: 'Injection', strengths: ['50mg/5ml'], rx: true },
  { generic: 'Flumazenil', brand: 'Flumanil', category: 'Antidote', form: 'Injection', strengths: ['0.5mg/5ml'], rx: true },
  { generic: 'Pralidoxime', brand: 'Pamzine', category: 'Antidote', form: 'Injection', strengths: ['1g'], rx: true },
  { generic: 'Chlorpheniramine', brand: 'Avil', category: 'Antihistamine', form: 'Injection', strengths: ['22.75mg/ml'] },
  { generic: 'Hydroxyzine', brand: 'Atarax', category: 'Antihistamine', form: 'Tablet', strengths: ['25mg'] },
  { generic: 'Povidone Iodine', brand: 'Betadine', category: 'Antiseptic', form: 'Solution', strengths: ['5% 500ml'] },
  { generic: 'Chlorhexidine', brand: 'Hexidine', category: 'Antiseptic', form: 'Solution', strengths: ['2% 500ml'] },
];

const EQUIPMENT_BASE = [
  { name: 'Portable Ventilator', category: 'Respiratory', manufacturer: 'Medtronic', models: ['PB560', 'PB980'] },
  { name: 'Oxygen Concentrator', category: 'Respiratory', manufacturer: 'Philips', models: ['EverFlo 5L', 'SimplyGo 10L'] },
  { name: 'Oxygen Cylinder Type D', category: 'Respiratory', manufacturer: 'INOX', models: ['D-Type 46L'] },
  { name: 'BiPAP Machine', category: 'Respiratory', manufacturer: 'ResMed', models: ['Lumis 150', 'Stellar 150'] },
  { name: 'Pulse Oximeter', category: 'Monitoring', manufacturer: 'Nidek', models: ['FingerTip Pro', 'Handheld 200'] },
  { name: 'Multipara Patient Monitor', category: 'Monitoring', manufacturer: 'Mindray', models: ['iMEC8', 'uMEC12'] },
  { name: 'ECG Machine', category: 'Monitoring', manufacturer: 'BPL', models: ['Cardiart 6108T', 'Cardiart 9108'] },
  { name: 'Defibrillator', category: 'Emergency', manufacturer: 'Zoll', models: ['AED Plus', 'R Series'] },
  { name: 'Infusion Pump', category: 'Infusion', manufacturer: 'B. Braun', models: ['Infusomat Space', 'Perfusor Space'] },
  { name: 'Syringe Pump', category: 'Infusion', manufacturer: 'Nipro', models: ['SP-500', 'SP-700'] },
  { name: 'Suction Machine', category: 'Emergency', manufacturer: 'Devilbiss', models: ['Vacu-Aide 7314', 'Homecare 7305'] },
  { name: 'Nebulizer', category: 'Respiratory', manufacturer: 'Omron', models: ['NE-C801', 'NE-C28'] },
  { name: 'Digital BP Monitor', category: 'Monitoring', manufacturer: 'Omron', models: ['HEM-7120', 'HEM-8712'] },
  { name: 'Glucometer', category: 'Diagnostics', manufacturer: 'Accu-Chek', models: ['Active', 'Instant'] },
  { name: 'Laryngoscope Set', category: 'Airway', manufacturer: 'Welch Allyn', models: ['Macintosh Fiber Optic'] },
  { name: 'Ambu Bag Adult', category: 'Airway', manufacturer: 'Ambu', models: ['SPUR II Adult'] },
  { name: 'Ambu Bag Paediatric', category: 'Airway', manufacturer: 'Ambu', models: ['SPUR II Paediatric'] },
  { name: 'ICU Bed Electric', category: 'Furniture', manufacturer: 'Hill-Rom', models: ['Progressa', 'AvantGuard 1600'] },
  { name: 'Stretcher Trolley', category: 'Furniture', manufacturer: 'Stryker', models: ['Prime X', 'M-Series'] },
  { name: 'Wheelchair Foldable', category: 'Mobility', manufacturer: 'Karma', models: ['KM-2500', 'Ryder 20'] },
  { name: 'Vaccine Cold Box', category: 'Cold Chain', manufacturer: 'Blowkings', models: ['CB-44', 'CB-22'] },
  { name: 'Blood Bank Refrigerator', category: 'Cold Chain', manufacturer: 'Haier', models: ['HXC-158B', 'HXC-429'] },
  { name: 'Autoclave Sterilizer', category: 'Sterilisation', manufacturer: 'Equitron', models: ['7501 DLX', '7508 STD'] },
  { name: 'Surgical Diathermy Unit', category: 'Surgical', manufacturer: 'Covidien', models: ['ForceTriad', 'Valleylab FT10'] },
  { name: 'Portable Ultrasound', category: 'Diagnostics', manufacturer: 'GE Healthcare', models: ['Vscan Air', 'Logiq E'] },
  { name: 'Infrared Thermometer', category: 'Diagnostics', manufacturer: 'Dr Trust', models: ['Model 601'] },
  { name: 'Warming Blanket Unit', category: 'Critical Care', manufacturer: '3M', models: ['Bair Hugger 775'] },
  { name: 'Dialysis Machine', category: 'Critical Care', manufacturer: 'Fresenius', models: ['4008S', '5008S'] },
];

const STORAGE_REQUIREMENTS = ['ROOM_TEMPERATURE', 'COOL_DRY_PLACE', 'COLD_CHAIN_2_8C'];

module.exports = {
  CITY,
  LOCALITIES,
  HOSPITAL_NAMES,
  PHARMACY_NAMES,
  SUPPLIER_NAMES,
  MEDICINE_BASE,
  EQUIPMENT_BASE,
  STORAGE_REQUIREMENTS,
};
