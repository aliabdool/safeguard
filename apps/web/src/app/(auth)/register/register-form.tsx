"use client";

import { useActionState } from "react";

import { signUpAction, type ActionResult } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionResult = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request access</CardTitle>
        <CardDescription>
          Your account starts pending approval. You&apos;ll receive an email to set your
          password once it&apos;s created. An administrator will assign your role, properties
          and departments before you can see any data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="justification">
              What role/property/department are you requesting?
            </Label>
            <Textarea
              id="justification"
              name="justification"
              placeholder="e.g. Duty Manager at Sunlife Beach Resort, Front Office"
              rows={3}
            />
          </div>
          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Submitting..." : "Request access"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
