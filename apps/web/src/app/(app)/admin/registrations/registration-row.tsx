"use client";

import { useActionState, useState } from "react";

import { approveRegistrationAction, rejectRegistrationAction } from "./actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Option {
  id: string;
  name: string;
}

const initialState: ActionResult = {};

export function RegistrationRow({
  request,
  roles,
  properties,
  departments,
}: {
  request: {
    requestId: string;
    userId: string;
    fullName: string;
    email: string;
    justification: string | null;
    createdAt: string;
  };
  roles: Array<Option & { code: string }>;
  properties: Option[];
  departments: Option[];
}) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveRegistrationAction,
    initialState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectRegistrationAction,
    initialState,
  );
  const [grantMedical, setGrantMedical] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{request.fullName}</CardTitle>
        <p className="text-muted-foreground text-sm">{request.email}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {request.justification ? (
          <p className="text-sm">
            <span className="font-medium">Requesting: </span>
            {request.justification}
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Submitted {new Date(request.createdAt).toLocaleString()}
        </p>

        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">Approve &amp; assign access</Button>
            </DialogTrigger>
            <DialogContent>
              <form action={approveAction} className="flex flex-col gap-4">
                <input type="hidden" name="userId" value={request.userId} />
                <input type="hidden" name="registrationRequestId" value={request.requestId} />
                <DialogHeader>
                  <DialogTitle>Approve {request.fullName}</DialogTitle>
                  <DialogDescription>
                    Assign a role, at least one property, and departments. This grants access
                    immediately.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-2">
                  <Label htmlFor={`role-${request.requestId}`}>Role</Label>
                  <Select name="roleId" required>
                    <SelectTrigger id={`role-${request.requestId}`}>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Properties</Label>
                  <div className="flex flex-col gap-2">
                    {properties.map((property) => (
                      <label key={property.id} className="flex items-center gap-2 text-sm">
                        <Checkbox name="propertyIds" value={property.id} />
                        {property.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Departments</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {departments.map((department) => (
                      <label key={department.id} className="flex items-center gap-2 text-sm">
                        <Checkbox name="departmentIds" value={department.id} />
                        {department.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="grantMedicalPermission"
                      checked={grantMedical}
                      onCheckedChange={(checked) => setGrantMedical(checked === true)}
                    />
                    Grant medical-data access (separate from role — see
                    docs/roles-permissions.md §3)
                  </label>
                  {grantMedical ? (
                    <Textarea
                      name="medicalPermissionReason"
                      placeholder="Reason for granting medical-data access (required)"
                      rows={2}
                    />
                  ) : null}
                </div>

                {approveState.error ? (
                  <p className="text-destructive text-sm">{approveState.error}</p>
                ) : null}

                <DialogFooter>
                  <Button type="submit" disabled={approvePending}>
                    {approvePending ? "Approving..." : "Approve"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="destructive">
                Reject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form action={rejectAction} className="flex flex-col gap-4">
                <input type="hidden" name="userId" value={request.userId} />
                <input type="hidden" name="registrationRequestId" value={request.requestId} />
                <DialogHeader>
                  <DialogTitle>Reject {request.fullName}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2">
                  <Label htmlFor={`reason-${request.requestId}`}>Reason</Label>
                  <Textarea
                    id={`reason-${request.requestId}`}
                    name="reason"
                    required
                    rows={3}
                  />
                </div>
                {rejectState.error ? (
                  <p className="text-destructive text-sm">{rejectState.error}</p>
                ) : null}
                <DialogFooter>
                  <Button type="submit" variant="destructive" disabled={rejectPending}>
                    {rejectPending ? "Rejecting..." : "Reject"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
