ALTER TABLE public.organization_email_senders
  ADD COLUMN IF NOT EXISTS mail_domain text,
  ADD COLUMN IF NOT EXISTS reply_domain text,
  ADD COLUMN IF NOT EXISTS domain_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS domain_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS organization_email_senders_org_unique
  ON public.organization_email_senders (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS organization_email_senders_mail_domain_unique
  ON public.organization_email_senders (lower(mail_domain))
  WHERE mail_domain IS NOT NULL;

UPDATE public.organization_email_senders
SET mail_domain = COALESCE(mail_domain, split_part(sender_email, '@', 2)),
    domain_verified = COALESCE(verified, false),
    domain_verified_at = COALESCE(domain_verified_at, CASE WHEN verified THEN now() ELSE NULL END)
WHERE sender_email IS NOT NULL;

UPDATE public.organization_email_senders
SET reply_domain = COALESCE(reply_domain, mail_domain)
WHERE mail_domain IS NOT NULL;

ALTER TABLE public.organization_email_senders ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.organization_email_senders TO authenticated;
GRANT ALL ON public.organization_email_senders TO service_role;

DROP POLICY IF EXISTS "Users can view own organization email sender" ON public.organization_email_senders;
CREATE POLICY "Users can view own organization email sender"
  ON public.organization_email_senders
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));