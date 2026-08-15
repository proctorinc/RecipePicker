import { ErrorScreen } from "@/components/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      title="That recipe isn't on the menu"
      description="The page you were looking for may have moved, or the link may be out of date."
      showHomeLink
    />
  );
}
