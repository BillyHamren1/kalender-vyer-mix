-- Add tables to realtime publication so subscriptions work
ALTER PUBLICATION supabase_realtime ADD TABLE project_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE transport_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE transport_email_log;