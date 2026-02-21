import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// Valid roles for the application
const VALID_ROLES = ['admin', 'forsaljning', 'projekt', 'lager'] as const;
type AppRole = typeof VALID_ROLES[number];

interface SyncActions {
  passwordUpdated: boolean;
  profileUpdated: boolean;
  rolesSynced: number;
}

// Helper: Find user by email in profiles table (case-insensitive)
async function findUserByProfile(adminClient: any, normalizedEmail: string): Promise<string | null> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('user_id')
    .ilike('email', normalizedEmail)
    .limit(1)
    .single();
  
  if (error || !data) {
    return null;
  }
  return data.user_id;
}

// Helper: Find user by paginating through auth.users
async function findUserByPaginatedSearch(adminClient: any, normalizedEmail: string): Promise<{ id: string; email: string } | null> {
  let page = 1;
  const perPage = 100;
  
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    
    if (error || !data?.users || data.users.length === 0) {
      break;
    }
    
    const found = data.users.find((u: any) => 
      u.email?.toLowerCase().trim() === normalizedEmail
    );
    
    if (found) {
      return { id: found.id, email: found.email };
    }
    
    // If we got fewer users than perPage, we've reached the end
    if (data.users.length < perPage) {
      break;
    }
    
    page++;
    
    // Safety limit to prevent infinite loops
    if (page > 100) {
      console.warn('Reached pagination safety limit');
      break;
    }
  }
  
  return null;
}

// Helper: Sync roles for a user
async function syncUserRoles(
  adminClient: any, 
  userId: string, 
  roles: string[] | undefined,
  organizationId?: string
): Promise<number> {
  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return 0;
  }
  
  // Delete existing roles
  await adminClient
    .from('user_roles')
    .delete()
    .eq('user_id', userId);
  
  // Add new valid roles
  let synced = 0;
  for (const role of roles) {
    if (VALID_ROLES.includes(role as AppRole)) {
      const { error } = await adminClient
        .from('user_roles')
        .insert({ user_id: userId, role, organization_id: organizationId })
        .select();
      
      if (!error) {
        synced++;
        console.log(`Role ${role} added for user ${userId}`);
      } else {
        console.error(`Error adding role ${role}:`, error);
      }
    } else {
      console.warn(`Invalid role ignored: ${role}`);
    }
  }
  
  return synced;
}

// Helper: Update or create profile
async function upsertProfile(
  adminClient: any,
  userId: string,
  normalizedEmail: string,
  fullName: string | undefined,
  organizationId: string | undefined
): Promise<boolean> {
  // First check if profile exists
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (existingProfile) {
    // Update existing profile
    const updateData: any = { email: normalizedEmail };
    if (fullName) updateData.full_name = fullName;
    if (organizationId) updateData.organization_id = organizationId;
    
    const { error } = await adminClient
      .from('profiles')
      .update(updateData)
      .eq('user_id', userId);
    
    return !error;
  } else {
    // Create new profile
    const { error } = await adminClient
      .from('profiles')
      .insert({
        user_id: userId,
        email: normalizedEmail,
        full_name: fullName || null,
        organization_id: organizationId || null,
      });
    
    return !error;
  }
}

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

    // IMPORTANT: Normalize email to prevent case/whitespace mismatches
    const normalizedEmail = email.trim().toLowerCase();
    
    console.log(`Receiving user sync request for: ${normalizedEmail}`);
    console.log(`Roles received: ${JSON.stringify(roles)}`);

    // Create admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve organization_id for multi-tenant
    const { data: orgData } = await adminClient.from('organizations').select('id').limit(1).single();
    const resolvedOrgId = organization_id || orgData?.id;

    const actions: SyncActions = {
      passwordUpdated: false,
      profileUpdated: false,
      rolesSynced: 0,
    };

    // Step 1: Try to find existing user
    // First: check profiles table (fastest, case-insensitive)
    let existingUserId = await findUserByProfile(adminClient, normalizedEmail);
    
    // Fallback: paginated search through auth.users
    if (!existingUserId) {
      console.log('User not found in profiles, searching auth.users...');
      const authUser = await findUserByPaginatedSearch(adminClient, normalizedEmail);
      if (authUser) {
        existingUserId = authUser.id;
        console.log(`Found user in auth.users via pagination: ${existingUserId}`);
      }
    } else {
      console.log(`Found user in profiles: ${existingUserId}`);
    }

    // Step 2: If user exists, update them
    if (existingUserId) {
      console.log(`Updating existing user: ${existingUserId}`);
      
      // Update password if provided
      if (password) {
        const { error: passwordError } = await adminClient.auth.admin.updateUserById(
          existingUserId,
          { password }
        );
        if (passwordError) {
          console.error(`Error updating password for user ${existingUserId}:`, passwordError);
          return new Response(
            JSON.stringify({ error: "Failed to update password", details: passwordError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        actions.passwordUpdated = true;
        console.log(`Password updated for user ${existingUserId}`);
      }

      // Update/create profile
      actions.profileUpdated = await upsertProfile(
        adminClient, 
        existingUserId, 
        normalizedEmail, 
        full_name, 
        organization_id
      );

      // Sync roles
      actions.rolesSynced = await syncUserRoles(adminClient, existingUserId, roles, resolvedOrgId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          user_id: existingUserId,
          mode: "existing",
          actions,
          message: "User synced successfully"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Create new user
    console.log(`Creating new user: ${normalizedEmail}`);
    
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
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: {
        full_name,
        synced_from: "eventflow_hub",
        original_user_id: user_id,
        organization_id,
      },
    };

    if (password) {
      createUserOptions.password = password;
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser(createUserOptions);

    if (createError) {
      console.error("Error creating user:", createError);
      
      // Handle "already registered" - this means our lookup missed the user
      if (createError.message?.includes("already been registered")) {
        console.log('User exists but was not found in lookup. Attempting recovery...');
        
        // Try one more time to find and update
        const authUser = await findUserByPaginatedSearch(adminClient, normalizedEmail);
        
        if (authUser) {
          console.log(`Recovery: found user ${authUser.id}, updating...`);
          
          if (password) {
            const { error: pwErr } = await adminClient.auth.admin.updateUserById(authUser.id, { password });
            actions.passwordUpdated = !pwErr;
            if (pwErr) console.error('Recovery password update failed:', pwErr);
          }
          
          actions.profileUpdated = await upsertProfile(adminClient, authUser.id, normalizedEmail, full_name, organization_id);
          actions.rolesSynced = await syncUserRoles(adminClient, authUser.id, roles, resolvedOrgId);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              user_id: authUser.id,
              mode: "existing_recovered",
              actions,
              message: "User recovered and synced"
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Could not recover - return success but with warning
        return new Response(
          JSON.stringify({ 
            success: true, 
            warning: "User exists but could not be found for update",
            mode: "unrecoverable"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw createError;
    }

    console.log(`User created successfully: ${newUser.user?.id}`);
    
    const newUserId = newUser.user?.id;
    if (!newUserId) {
      throw new Error("User created but no ID returned");
    }

    actions.passwordUpdated = !!password;

    // Update/create profile with normalized email
    actions.profileUpdated = await upsertProfile(
      adminClient, 
      newUserId, 
      normalizedEmail, 
      full_name, 
      organization_id
    );

    // Create roles
    actions.rolesSynced = await syncUserRoles(adminClient, newUserId, roles, resolvedOrgId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: newUserId,
        mode: "created",
        actions,
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
