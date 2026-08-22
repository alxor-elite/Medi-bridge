import { StatCard } from '../ui/StatCard'
import { Reveal } from '../ui/Reveal'
import { cn } from '../../lib/cn'

const COLS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
}

/**
 * Responsive grid of metric tiles. `items` are StatCard prop objects
 * ({ key, icon, label, value, tone, suffix, hint }). Shared by every
 * dashboard so metrics look identical across roles.
 */
export function StatsCards({ items = [], columns = 4, animate = true, className }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4', COLS[columns] || COLS[4], className)}>
      {items.map((item, i) => (
        <Reveal key={item.key || item.label} delay={i * 60}>
          <StatCard {...item} animate={animate} />
        </Reveal>
      ))}
    </div>
  )
}
