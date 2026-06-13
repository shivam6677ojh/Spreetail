import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="text-center">
      <h1 className="text-4xl font-bold">Page not found</h1>
      <Link className="mt-6 inline-block font-semibold text-brand-600 hover:text-brand-700" to="/">
        Return home
      </Link>
    </section>
  );
}
