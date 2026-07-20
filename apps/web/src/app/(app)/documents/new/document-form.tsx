"use client";

import { useActionState } from "react";

import { createDocumentAction } from "../actions";
import type { ActionResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: ActionResult = {};

export function DocumentForm({
  properties,
  departments,
}: {
  properties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(createDocumentAction, initialState);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                name="category"
                placeholder="e.g. Procedure, Risk assessment"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confidentialityLevel">Confidentiality</Label>
              <Select name="confidentialityLevel" defaultValue="internal" required>
                <SelectTrigger id="confidentialityLevel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="retentionPeriodMonths">Retention period (months)</Label>
            <Input
              id="retentionPeriodMonths"
              name="retentionPeriodMonths"
              type="number"
              min={0}
            />
          </div>

          <div className="grid gap-2">
            <Label>Applicable properties</Label>
            <div className="flex flex-col gap-2">
              {properties.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox name="propertyIds" value={p.id} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Applicable departments</Label>
            <div className="grid grid-cols-2 gap-2">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <Checkbox name="departmentIds" value={d.id} />
                  {d.name}
                </label>
              ))}
            </div>
          </div>

          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create document"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
