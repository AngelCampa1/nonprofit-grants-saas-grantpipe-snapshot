import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
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
import {
  createCommunicationSchema,
  type CreateCommunicationInput,
  COMMUNICATION_TYPE_LABELS,
  COMMUNICATION_TYPES,
} from "@grantpipe/shared";

interface CommunicationFormProps {
  onSubmit: (data: CreateCommunicationInput) => void | Promise<void>;
}

export function CommunicationForm({ onSubmit }: CommunicationFormProps) {
  const form = useForm<CreateCommunicationInput>({
    resolver: zodResolver(createCommunicationSchema),
    defaultValues: {
      type: "note",
      subject: "",
      body: "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (data) => {
          await onSubmit(data);
        })}
        noValidate
        className="space-y-4"
      >
        {/* Communication Type */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Communication Type</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange} name={field.name}>
                  <SelectTrigger className="w-full" aria-label="Communication Type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMUNICATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {COMMUNICATION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Subject */}
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Brief subject…" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Body */}
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Body</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Notes or message body…" rows={5} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Logging…" : "Log communication"}
        </Button>
      </form>
    </Form>
  );
}
