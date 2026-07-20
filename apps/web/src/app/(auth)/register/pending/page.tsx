import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function RegistrationPendingPage() {
  return (
    <Alert>
      <AlertTitle>Registration received</AlertTitle>
      <AlertDescription>
        <p>
          Your account is awaiting administrator approval. You will not be able to see any
          property or department data until an administrator assigns your role, properties and
          departments.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
