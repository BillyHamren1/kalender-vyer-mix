import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("close_project call to external system", async () => {
  // Sign in
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: "admin@fransaugust.se",
      password: "admin123",
    }),
  });
  const signInBody = await signInRes.text();
  
  let accessToken: string;
  if (signInRes.ok) {
    const parsed = JSON.parse(signInBody);
    accessToken = parsed.access_token;
    console.log("Auth: Signed in successfully");
  } else {
    console.log("Auth failed:", signInRes.status, signInBody);
    throw new Error("Could not authenticate");
  }

  // Call close_project
  const res = await fetch(`${SUPABASE_URL}/functions/v1/planning-api-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      type: "close_project",
      method: "POST",
      booking_id: "98924253-108d-420a-943c-105098fbbdc2",
      data: { status: "READY_FOR_INVOICING" },
    }),
  });

  const body = await res.text();
  console.log(`=== CLOSE_PROJECT RESULT ===`);
  console.log(`HTTP Status: ${res.status}`);
  console.log(`Response: ${body}`);
  console.log(`============================`);
});
