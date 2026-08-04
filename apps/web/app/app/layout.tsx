import "../dashboard.css";

/**
 * The /app segment. Exists only to scope the dashboard stylesheet to this
 * route, so the landing page never loads it and the two sheets cannot collide.
 */
export default function DashboardLayout(props: { children: React.ReactNode }) {
  return props.children;
}
