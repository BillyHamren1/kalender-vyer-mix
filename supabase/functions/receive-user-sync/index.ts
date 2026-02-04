import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret
    const webhookSecret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("WEBHOOK_SECRET");

    if (!expectedSecret) {
      console.error("WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!webhookSecret || webhookSecret !== expectedSecret) {
      console.error("Invalid or missing webhook secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name, user_id, organization_id, roles } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Missing required field: email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Receiving user sync request for: ${email}`);

    // Create admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    if (existingUser) {
      console.log(`User already exists: ${existingUser.id}`);
      
      // Update profile if full_name provided
      if (full_name) {
        await adminClient
          .from('profiles')
          .update({ full_name, organization_id })
          .eq('user_id', existingUser.id);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "User already exists", 
          user_id: existingUser.id 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the user
    const createUserOptions: {
      email: string;
      email_confirm: boolean;
      password?: string;
      user_metadata: {
        full_name?: string;
        synced_from: string;
        original_user_id?: string;
        organization_id?: string;
      };
    } = {
      email,
      email_confirm: true,
      user_metadata: {
        full_name,
        synced_from: "eventflow_hub",
        original_user_id: user_id,
        organization_id,
      },
    };

    // Only set password if provided (otherwise user will need password reset)
    if (password) {
      createUserOptions.password = password;
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser(createUserOptions);

    if (createError) {
      console.error("Error creating user:", createError);
      
      if (createError.message?.includes("already been registered")) {
        return new Response(
          JSON.stringify({ success: true, message: "User already exists" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw createError;
    }

    console.log(`User created successfully: ${newUser.user?.id}`);

    // The profile will be created automatically by the trigger
    // But we can update it with additional info if needed
    if (newUser.user?.id && organization_id) {
      await adminClient
        .from('profiles')
        .update({ organization_id })
        .eq('user_id', newUser.user.id);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: newUser.user?.id,
        message: "User created successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in receive-user-sync:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
