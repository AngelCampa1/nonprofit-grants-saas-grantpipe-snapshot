import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form";
import { Input } from "./input";

const schema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
});

type FormValues = z.infer<typeof schema>;

// Helper: renders a minimal Form + FormField with the given defaultValues / errors
function SimpleForm({ triggerError = false }: { triggerError?: boolean }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", name: "" },
  });

  // Use useEffect to avoid "too many re-renders" from calling setError during render
  useEffect(() => {
    if (triggerError) {
      form.setError("email", { type: "manual", message: "Invalid email address" });
    }
  }, [triggerError, form]);

  return (
    <Form {...form}>
      <form>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} data-testid="email-input" />
              </FormControl>
              <FormDescription>We will never share your email.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} data-testid="name-input" />
              </FormControl>
              <FormMessage>Enter your full name.</FormMessage>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

describe("Form (RHF + Zod integration)", () => {
  describe("Form", () => {
    it("renders children and provides form context", () => {
      render(<SimpleForm />);
      expect(screen.getByTestId("email-input")).toBeInTheDocument();
      expect(screen.getByTestId("name-input")).toBeInTheDocument();
    });
  });

  describe("FormField", () => {
    it("renders the field via Controller render prop", () => {
      render(<SimpleForm />);
      // If FormField/Controller renders correctly, the input is visible
      expect(screen.getByTestId("email-input")).toBeInTheDocument();
    });
  });

  describe("FormItem", () => {
    it("creates a layout wrapper div with data-slot='form-item'", () => {
      const { container } = render(<SimpleForm />);
      const items = container.querySelectorAll("[data-slot='form-item']");
      expect(items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("FormLabel", () => {
    it("renders label text", () => {
      render(<SimpleForm />);
      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Name")).toBeInTheDocument();
    });

    it("has data-slot='form-label'", () => {
      const { container } = render(<SimpleForm />);
      const labels = container.querySelectorAll("[data-slot='form-label']");
      expect(labels.length).toBeGreaterThanOrEqual(2);
    });

    it("applies error class when field has an error", async () => {
      await act(async () => {
        render(<SimpleForm triggerError />);
      });
      // The Email label should have the destructive/error class
      const emailLabel = screen.getByText("Email");
      expect(emailLabel.className).toMatch(/destructive/);
    });

    it("does not apply error class when field is valid", () => {
      render(<SimpleForm triggerError={false} />);
      const nameLabel = screen.getByText("Name");
      expect(nameLabel.className).not.toMatch(/destructive/);
    });
  });

  describe("FormControl", () => {
    it("injects id onto the control element matching FormLabel htmlFor", () => {
      render(<SimpleForm />);
      const emailInput = screen.getByTestId("email-input");
      const emailLabel = screen.getByText("Email");
      // Label's htmlFor should match input's id
      const labelHtmlFor = emailLabel.getAttribute("for");
      expect(labelHtmlFor).toBeTruthy();
      expect(emailInput.getAttribute("id")).toBe(labelHtmlFor);
    });

    it("injects aria-describedby pointing to description element", () => {
      render(<SimpleForm />);
      const emailInput = screen.getByTestId("email-input");
      const describedBy = emailInput.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      // Should reference the description element
      const descEl = document.getElementById(describedBy!.split(" ")[0]);
      expect(descEl).toBeInTheDocument();
    });

    it("injects aria-invalid=true when field has an error", async () => {
      await act(async () => {
        render(<SimpleForm triggerError />);
      });
      const emailInput = screen.getByTestId("email-input");
      expect(emailInput).toHaveAttribute("aria-invalid", "true");
    });

    it("does not inject aria-invalid when field is valid", () => {
      render(<SimpleForm triggerError={false} />);
      const emailInput = screen.getByTestId("email-input");
      expect(emailInput).not.toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("FormDescription", () => {
    it("renders helper text with muted styling", () => {
      render(<SimpleForm />);
      const desc = screen.getByText("We will never share your email.");
      expect(desc).toBeInTheDocument();
      expect(desc.tagName).toBe("P");
      expect(desc.getAttribute("data-slot")).toBe("form-description");
      expect(desc.className).toMatch(/muted/);
    });
  });

  describe("FormMessage", () => {
    it("renders error message when field has a validation error", async () => {
      await act(async () => {
        render(<SimpleForm triggerError />);
      });
      expect(screen.getByText("Invalid email address")).toBeInTheDocument();
    });

    it("renders children (static fallback) when no error is present", () => {
      render(<SimpleForm triggerError={false} />);
      // Name field has <FormMessage>Enter your full name.</FormMessage> with no error
      expect(screen.getByText("Enter your full name.")).toBeInTheDocument();
    });

    it("renders nothing when there is no error and no children", () => {
      render(<SimpleForm triggerError={false} />);
      // Email field FormMessage has no children and no error — should not render any message
      // Check no error text exists for email field
      expect(screen.queryByText("Invalid email address")).not.toBeInTheDocument();
    });

    it("has data-slot='form-message' when rendered", async () => {
      await act(async () => {
        render(<SimpleForm triggerError />);
      });
      const errorMsg = screen.getByText("Invalid email address");
      expect(errorMsg.getAttribute("data-slot")).toBe("form-message");
    });
  });

  describe("useFormField error boundary", () => {
    it("throws when used outside a <FormField> context", () => {
      // Suppress React's console.error for expected throw
      const consoleError = console.error;
      console.error = () => {};

      function BadComponent() {
        const form = useForm<FormValues>({
          resolver: zodResolver(schema),
          defaultValues: { email: "", name: "" },
        });
        return (
          <Form {...form}>
            <form>
              {/* FormItem without FormField — name will be empty string (falsy) */}
              <FormItem>
                <FormLabel>Label</FormLabel>
              </FormItem>
            </form>
          </Form>
        );
      }

      expect(() => render(<BadComponent />)).toThrow(
        "useFormField must be used within a <FormField>",
      );

      console.error = consoleError;
    });
  });
});
