import { Link } from "react-router-dom";

/**
 * Orientation link at the top of a nested page.
 *
 * It points at the page's parent in the app's own hierarchy, not at browser
 * history: arriving from a NearBlocks link, a shared URL or a wallet redirect
 * leaves nothing useful behind to go "back" to, and a history-based control
 * would either do nothing or send the reader somewhere they never were.
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="backlink">
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}
