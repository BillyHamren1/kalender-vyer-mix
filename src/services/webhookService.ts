
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Type definitions for webhook subscriptions
export interface WebhookSubscription {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret_key: string;
  is_active: boolean;
  created_at: string;
  last_triggered_at?: string;
}

export interface CreateWebhookParams {
  name: string;
  url: string;
  events: string[];
  secret_key: string;
}

/**
 * Register a new webhook subscription
 */
export const createWebhookSubscription = async (params: CreateWebhookParams): Promise<WebhookSubscription | null> => {
  try {
    const { data, error } = await supabase
      .from('webhook_subscriptions')
      .insert(params)
      .select()
      .single();

    if (error) {
      console.error('Error creating webhook subscription:', error);
      toast.error(`Failed to create webhook: ${error.message}`);
      return null;
    }

    toast.success(`Webhook "${params.name}" created successfully`);
    return data;
  } catch (error) {
    console.error('Error in createWebhookSubscription:', error);
    toast.error(`Error creating webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
};

/**
 * Get all webhook subscriptions
 */
export const getWebhookSubscriptions = async (): Promise<WebhookSubscription[]> => {
  try {
    const { data, error } = await supabase
      .from('webhook_subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching webhook subscriptions:', error);
      toast.error(`Failed to fetch webhooks: ${error.message}`);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getWebhookSubscriptions:', error);
    toast.error(`Error fetching webhooks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return [];
  }
};

/**
 * Delete a webhook subscription
 */
export const deleteWebhookSubscription = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('webhook_subscriptions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting webhook subscription:', error);
      toast.error(`Failed to delete webhook: ${error.message}`);
      return false;
    }

    toast.success('Webhook deleted successfully');
    return true;
  } catch (error) {
    console.error('Error in deleteWebhookSubscription:', error);
    toast.error(`Error deleting webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};

/**
 * Update a webhook subscription's active status
 */
export const toggleWebhookStatus = async (id: string, isActive: boolean): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('webhook_subscriptions')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      console.error('Error updating webhook status:', error);
      toast.error(`Failed to update webhook: ${error.message}`);
      return false;
    }

    toast.success(`Webhook ${isActive ? 'activated' : 'deactivated'} successfully`);
    return true;
  } catch (error) {
    console.error('Error in toggleWebhookStatus:', error);
    toast.error(`Error updating webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};

/**
 * Test a webhook by sending a test payload
 */
export const testWebhook = async (id: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.functions.invoke(
      'webhook-notifier',
      {
        method: 'POST',
        body: { 
          action: 'test',
          webhook_id: id
        }
      }
    );

    if (error) {
      console.error('Error testing webhook:', error);
      toast.error(`Failed to test webhook: ${error.message}`);
      return false;
    }

    if (data.success) {
      toast.success('Test webhook notification sent successfully');
      return true;
    } else {
      toast.error(`Failed to send test notification: ${data.error}`);
      return false;
    }
  } catch (error) {
    console.error('Error in testWebhook:', error);
    toast.error(`Error testing webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
};
