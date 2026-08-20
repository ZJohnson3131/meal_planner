"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const MAX_EMAIL_CHARACTERS = 320;
const MAX_PASSWORD_CHARACTERS = 1_024;
const MAX_DISPLAY_NAME_CHARACTERS = 200;
const MIN_SIGNUP_PASSWORD_CHARACTERS = 6;

const emailSchema = z.string().trim().email().max(MAX_EMAIL_CHARACTERS);
const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_CHARACTERS),
});
const signUpSchema = signInSchema.extend({
  displayName: z.string().trim().min(1).max(MAX_DISPLAY_NAME_CHARACTERS),
  password: z.string().min(MIN_SIGNUP_PASSWORD_CHARACTERS).max(MAX_PASSWORD_CHARACTERS),
});

export async function signIn(formData: FormData) {
  const parsedInput = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsedInput.success) redirect("/login?error=invalid_credentials");

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword(parsedInput.data);
  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const parsedInput = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsedInput.success) redirect("/signup?error=signup_failed");

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: parsedInput.data.email,
    password: parsedInput.data.password,
    options: { data: { display_name: parsedInput.data.displayName } },
  });

  if (error) {
    redirect("/signup?error=signup_failed");
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("We could not sign you out. Please try again.");
  redirect("/");
}
