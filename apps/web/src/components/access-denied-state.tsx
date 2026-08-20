import { Link } from "@tanstack/react-router";
import { Alert, Button } from "@grantpipe/ui";

export function AccessDeniedState(props: { title: string; description: string }) {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Alert title={props.title} variant="destructive">
        <div className="space-y-3">
          <p>{props.description}</p>
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </Alert>
    </div>
  );
}
