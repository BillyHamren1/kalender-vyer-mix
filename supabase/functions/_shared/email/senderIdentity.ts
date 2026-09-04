/**
 * Kanonisk, fail-closed avsändaridentitet per organisation.
 *
 * Modell: `modul@<organisationens verifierade maildomän>`, t.ex.
 * `planning@viking.e-flow.se`.
 *
 * Regler (aldrig fallback):
 *  - Saknas organisations-id → kasta direkt, ingen uppslagning.
 *  - Raden måste tillhöra exakt den organisationen.
 *  - `enabled` och `domain_verified` måste vara true och `mail_domain` ifylld.
 *  - Ingen annan organisations rad (t.ex. Frans August) får någonsin användas.
 */

export type EmailModule = 'planning' | 'lager' | 'booking';

export class SenderNotConfiguredError extends Error {
  readonly status = 422;
  readonly code = 'sender_not_configured';
  constructor(message: string) {
    super(message);
    this.name = 'SenderNotConfiguredError';
  }
}

export interface SenderIdentity {
  displayName: string;
  address: string;
  from: string;
  mailDomain: string;
  replyDomain: string;
  organizationId: string;
  module: EmailModule;
}

export interface SenderRow {
  organization_id: string;
  display_name: string | null;
  mail_domain: string | null;
  reply_domain: string | null;
  domain_verified: boolean | null;
  enabled: boolean | null;
}

const normalizeDomain = (value: string) => value.trim().toLowerCase().replace(/^@/, '');

/** Ren funktion — testbar utan databas. */
export function buildSenderIdentity(
  organizationId: string | null | undefined,
  module: EmailModule,
  row: SenderRow | null | undefined,
): SenderIdentity {
  if (!organizationId) {
    throw new SenderNotConfiguredError('Organisation saknas – e-post kan inte skickas (fail closed).');
  }
  if (!row) {
    throw new SenderNotConfiguredError('Organisationen saknar konfigurerad avsändardomän – utskicket stoppades.');
  }
  if (row.organization_id !== organizationId) {
    throw new SenderNotConfiguredError('Avsändarkonfigurationen tillhör en annan organisation – utskicket stoppades.');
  }
  if (row.enabled !== true) {
    throw new SenderNotConfiguredError('E-postutskick är avstängt för organisationen.');
  }
  if (row.domain_verified !== true) {
    throw new SenderNotConfiguredError('Organisationens avsändardomän är inte verifierad – utskicket stoppades.');
  }
  const mailDomain = row.mail_domain ? normalizeDomain(row.mail_domain) : '';
  if (!mailDomain) {
    throw new SenderNotConfiguredError('Organisationen saknar avsändardomän – utskicket stoppades.');
  }

  const replyDomain = row.reply_domain ? normalizeDomain(row.reply_domain) : mailDomain;
  const displayName = (row.display_name || '').trim();
  if (!displayName) {
    throw new SenderNotConfiguredError('Organisationen saknar avsändarnamn – utskicket stoppades.');
  }

  const address = `${module}@${mailDomain}`;
  return {
    displayName,
    address,
    from: `${displayName} <${address}>`,
    mailDomain,
    replyDomain,
    organizationId,
    module,
  };
}

/** Bygger Reply-To som routar svaret till rätt organisation + ärende/bokning. */
export function buildReplyTo(identity: SenderIdentity, threadToken: string | null | undefined): string {
  if (!threadToken) return identity.address;
  return `r-${threadToken}@${identity.replyDomain}`;
}

/** Plockar ut trådtoken ur en inkommande Reply-To-adress. */
export function parseReplyToken(toAddress: string | null | undefined): { token: string; domain: string } | null {
  if (!toAddress) return null;
  const match = /(?:^|<)\s*r-([0-9a-fA-F-]{36})@([^\s>,;]+)\s*(?:>|$)/.exec(toAddress);
  if (!match) return null;
  return { token: match[1].toLowerCase(), domain: normalizeDomain(match[2]) };
}

/** Databasläsning + validering. Kastar SenderNotConfiguredError vid allt som saknas. */
export async function resolveSender(
  supabase: { from: (t: string) => any },
  organizationId: string | null | undefined,
  module: EmailModule,
): Promise<SenderIdentity> {
  if (!organizationId) {
    throw new SenderNotConfiguredError('Organisation saknas – e-post kan inte skickas (fail closed).');
  }
  const { data, error } = await supabase
    .from('organization_email_senders')
    .select('organization_id, display_name, mail_domain, reply_domain, domain_verified, enabled')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    throw new SenderNotConfiguredError(`Kunde inte läsa avsändarkonfiguration: ${error.message}`);
  }
  return buildSenderIdentity(organizationId, module, data as SenderRow | null);
}
