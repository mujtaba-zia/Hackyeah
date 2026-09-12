import { useGameState } from '../../hooks/useGameState';
import './CityEventsPanel.css';

/** Simulated minutes to a readable day and clock time. */
function simClock(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const hour = Math.floor((minutes % 1440) / 60);
  const minute = Math.floor(minutes % 60);
  return `D${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function CityEventsPanel() {
  const { cityEvents } = useGameState();
  if (cityEvents.history.length === 0) return null;

  return (
    <section className="panel events">
      <h2>City Events</h2>
      <ul className="events__list">
        {cityEvents.history.slice(0, 8).map((entry) => (
          <li key={entry.key} className={`events__row events__row--${entry.severity}`}>
            <span className="events__time">{simClock(entry.simTime)}</span>
            <span className="events__name">{entry.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
