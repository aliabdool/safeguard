import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCatalystHostedLoginUrl } from "@/lib/catalyst/env";

export default function LoginPage() {
  const hostedLoginUrl = getCatalystHostedLoginUrl();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your Sunlife SafeGuard account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href={hostedLoginUrl}>Sign in with your company account</a>
          </Button>
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        No account yet?{" "}
        <Link href="/register" className="underline underline-offset-4">
          Register
        </Link>
      </p>
    </div>
  );
}
