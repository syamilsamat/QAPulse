import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin, useChangePassword } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const pwSchema = z
  .object({
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type PwFormValues = z.infer<typeof pwSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, token } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const changePasswordMutation = useChangePassword();

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // After login succeeds, if mustChangePassword we show this overlay
  const [pendingUser, setPendingUser] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const pwForm = useForm<PwFormValues>({
    resolver: zodResolver(pwSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          if (data.user.mustChangePassword) {
            setPendingUser({ id: data.user.id, name: data.user.name });
          } else {
            login(data.user, data.token);
            setLocation("/dashboard");
          }
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Login failed",
            description:
              error?.message || "Please check your credentials and try again.",
          });
        },
      },
    );
  };

  const onChangePassword = (values: PwFormValues) => {
    if (!pendingUser) return;
    changePasswordMutation.mutate(
      { data: { userId: pendingUser.id, newPassword: values.newPassword } },
      {
        onSuccess: () => {
          setPendingUser(null);
          form.reset();
          pwForm.reset();
          loginMutation.reset();
          changePasswordMutation.reset();
          setLocation("/login");
          toast({
            title:
              "Password updated. Please sign in again with your new password.",
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Failed to update password. Please try again.",
          });
        },
      },
    );
  };

  // ── Force password change overlay ──────────────────────────────────────────
  if (pendingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="p-3 bg-primary/10 rounded-full">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Set a new password
            </h1>
            <p className="text-muted-foreground text-sm max-w-xs">
              Hi {pendingUser.name}! Your account requires a password change
              before you can continue.
            </p>
          </div>

          <div className="bg-card border rounded-lg shadow-sm p-6">
            <form
              onSubmit={pwForm.handleSubmit(onChangePassword)}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPw ? "text" : "password"}
                    placeholder="At least 6 characters"
                    {...pwForm.register("newPassword")}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNewPw((v) => !v)}
                    tabIndex={-1}
                  >
                    {showNewPw ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {pwForm.formState.errors.newPassword && (
                  <p className="text-xs text-destructive">
                    {pwForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPw ? "text" : "password"}
                    placeholder="Repeat your new password"
                    {...pwForm.register("confirmPassword")}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPw((v) => !v)}
                    tabIndex={-1}
                  >
                    {showConfirmPw ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {pwForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive">
                    {pwForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending
                  ? "Saving..."
                  : "Set password & continue"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal login form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center justify-center text-center">
          <img
            src={`${import.meta.env.BASE_URL}logo-qa-pulse.png`}
            alt="QA Pulse"
            className="h-60 w-auto object-contain" // Reduced height from h-60 to remove extra space
          />
          {/* Added header text with Montserrat bold font */}
          <h1
            className="mt-6 mb-3 text-3xl text-foreground"
            style={{ fontWeight: 700 }}
          >
            WELCOME TO QA PULSE
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in to QA Pulse to manage your workflows
          </p>
        </div>

        <div className="bg-card border rounded-lg shadow-sm p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="qa@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          {...field}
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassword((v) => !v)}
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
