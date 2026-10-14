import { Filter, Segmented } from './ui'
import { Range, useUser } from '../lib/userdata'

/** Limit every personal page to recent games. */
export default function RangeFilter() {
  const { range, setRange, allGames } = useUser()
  if (!allGames.length) return null
  return (
    <Filter label="Games from">
      <Segmented value={range} onChange={(r: Range) => setRange(r)} label="Date range"
        options={[{ value: 'all', label: 'All time' }, { value: 'year', label: 'Year' }, { value: '3m', label: '3 months' }, { value: '1m', label: 'Month' }, { value: '1d', label: 'Day' }]} />
    </Filter>
  )
}
