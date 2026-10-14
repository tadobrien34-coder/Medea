import { useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon'

/** Shown on every page you reached by navigating, top-left, to return to where you were. */
export default function BackButton() {
  const nav = useNavigate()
  const loc = useLocation()
  if (loc.key === 'default') return null
  return <button className="back-btn" onClick={() => nav(-1)} aria-label="Back to the previous page"><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon name="arrow" size={15} /></span>Back</button>
}
