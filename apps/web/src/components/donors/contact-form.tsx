import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@grantpipe/ui";
import { createContactSchema, type CreateContactInput, CONTACT_TYPES } from "@grantpipe/shared";
import { PipelineStageSelect } from "./pipeline-stage-select";
import { useContacts } from "../../hooks/use-donors";

const NONE_SENTINEL = "__none__";

interface ContactFormProps {
  onSubmit: (data: CreateContactInput) => void | Promise<void>;
  defaultValues?: Partial<CreateContactInput>;
}

export function ContactForm({ onSubmit, defaultValues }: ContactFormProps) {
  const orgQuery = useContacts({
    type: "organization",
    page: 1,
    pageSize: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const orgOptions = orgQuery.data?.data ?? [];

  const form = useForm({
    resolver: standardSchemaResolver(createContactSchema),
    defaultValues: {
      type: "individual" as const,
      pipelineStage: "prospect" as const,
      isVolunteer: false,
      emailOptOut: false,
      ...Object.fromEntries(
        Object.entries(defaultValues ?? {}).map(([k, v]) => [k, v === null ? undefined : v]),
      ),
    },
  });

  const contactType = useWatch({ control: form.control, name: "type" }) ?? "individual";

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (data) => {
          await onSubmit(data as CreateContactInput);
        })}
        noValidate
        className="space-y-4"
      >
        {/* Contact Type */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Type</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange} name={field.name}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === "individual" ? "Individual" : "Organization"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Conditional fields */}
        {contactType === "individual" ? (
          <>
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={(field.value as string | undefined) ?? ""}
                      placeholder="Jane"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={(field.value as string | undefined) ?? ""}
                      placeholder="Doe"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : (
          <FormField
            control={form.control}
            name="organizationName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Organization Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={(field.value as string | undefined) ?? ""}
                    placeholder="ACME Foundation"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={(field.value as string | undefined) ?? ""}
                  placeholder="contact@example.com"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="emailOptOut"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <FormControl>
                <Checkbox
                  id="contact-email-opt-out"
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                />
              </FormControl>
              <div className="space-y-1">
                <FormLabel htmlFor="contact-email-opt-out">Do not send batch messages</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Skip this contact in donor email batches.
                </p>
              </div>
            </FormItem>
          )}
        />

        {/* Phone */}
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={(field.value as string | undefined) ?? ""}
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Address */}
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={(field.value as string | undefined) ?? ""}
                  placeholder="123 Main St, City, ST 00000"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Pipeline Stage */}
        <FormField
          control={form.control}
          name="pipelineStage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pipeline Stage</FormLabel>
              <FormControl>
                <PipelineStageSelect
                  value={field.value}
                  onChange={field.onChange}
                  name={field.name}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Volunteer */}
        <FormField
          control={form.control}
          name="isVolunteer"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2">
              <FormControl>
                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel>Volunteer</FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Affiliated Organization */}
        <FormField
          control={form.control}
          name="affiliatedOrgId"
          render={({ field }) => {
            const currentValue =
              field.value != null && field.value !== "" ? (field.value as string) : NONE_SENTINEL;
            return (
              <FormItem>
                <FormLabel>Affiliated Organization</FormLabel>
                <FormControl>
                  <Select
                    value={currentValue}
                    onValueChange={(v) => {
                      field.onChange(v === NONE_SENTINEL ? undefined : v);
                    }}
                    name={field.name}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_SENTINEL}>None</SelectItem>
                      {orgOptions.map((org) => {
                        const label =
                          (org.organizationName ??
                            [org.firstName, org.lastName].filter(Boolean).join(" ")) ||
                          org.id;
                        return (
                          <SelectItem key={org.id} value={org.id}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={(field.value as string | undefined) ?? ""}
                  placeholder="Additional notes…"
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Save"}
        </Button>
      </form>
    </Form>
  );
}
