import { useGameState } from '../../hooks/useGameState';
import './ActivityFeed.css';

const MINUTES_PER_DAY = 24 * 60;

function formatTimestamp(time: number): string {
  const totalMinutes = Math.max(0, Math.floor(time));
  const day = Math.floor(totalMinutes / MINUTES_PER_DAY) + 1;
  const minutesToday = totalMinutes % MINUTES_PER_DAY;
  const hours = Math.floor(minutesToday / 60).toString().padStart(2, '0');
  const minutes = (minutesToday % 60).toString().padStart(2, '0');

  return `Day ${day} ${hours}:${minutes}`;
}

/** The feed keeps recent organisation changes legible without adding controls. */
export function ActivityFeed() {
  const { activity } = useGameState();

  return (
    <section className="activity-feed panel" aria-labelledby="activity-feed-title">
      <h2 id="activity-feed-title">Activity</h2>
      {activity.length === 0 ? (
        <p className="activity-feed__empty">Waiting for simulation activity.</p>
      ) : (
        <ol className="activity-feed__list">
          {activity.slice(0, 8).map((entry) => (
            <li className={`activity-feed__item activity-feed__item--${entry.kind}`} key={entry.id}>
              <time className="activity-feed__time">{formatTimestamp(entry.simTime)}</time>
              <span className="activity-feed__text">{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
