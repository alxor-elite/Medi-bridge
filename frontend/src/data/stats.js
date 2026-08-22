/** Headline network figures for the landing page & marketing surfaces. */

export const LANDING_STATS = [
  { key: 'orgs', label: 'Verified Organizations', value: 342, suffix: '+', hint: 'Hospitals, pharmacies & distributors' },
  { key: 'medicines', label: 'Available Medicines', value: 5100, suffix: '+', hint: 'Tracked across live inventories' },
  { key: 'emergencies', label: 'Active Emergency Requests', value: 28, suffix: '', hint: 'Being matched right now' },
  { key: 'match', label: 'Avg. Match Time', value: 4.2, suffix: ' min', hint: 'Search to reserved stock' },
]

export const LANDING_FEATURES = [
  {
    key: 'search',
    title: 'Search in seconds',
    body: 'Type a medicine or equipment name and instantly see verified suppliers with live stock, distance and ETA.',
  },
  {
    key: 'verify',
    title: 'Only verified organizations',
    body: 'Every hospital, pharmacy and distributor is checked and approved before joining the network.',
  },
  {
    key: 'reserve',
    title: 'Reserve before you order',
    body: 'Lock stock at the nearest source so it is held for you while you confirm the emergency order.',
  },
  {
    key: 'track',
    title: 'Track to the door',
    body: 'Follow every order from accepted to delivered with a clear, real-time status timeline.',
  },
]

export const HOW_IT_WORKS = [
  { step: 1, title: 'Search', body: 'Enter the medicine or equipment you need and the quantity.' },
  { step: 2, title: 'Compare', body: 'See verified suppliers ranked by stock, distance, ETA and confidence.' },
  { step: 3, title: 'Reserve', body: 'Hold stock at the best-matched source instantly.' },
  { step: 4, title: 'Order & track', body: 'Place the emergency order and follow it to delivery.' },
]
