import type { AuditEvent, Credential, RecordBody, VaultSnapshot, BlobEntry } from '../types/vault';
import { invariant } from '../lib/errors';

export function projectVault(records: Array<{ body: RecordBody; credential?: Credential; blobId: string }>, blobs: BlobEntry[]): VaultSnapshot {
  const groups = new Map<string, Credential[]>();
  const auditEvents: AuditEvent[] = [];
  const eventIds = new Set<string>();
  for (const { body, credential, blobId } of records) {
    invariant(!eventIds.has(body.audit.id), 'AUDIT_DUPLICATE', 'The vault contains a duplicate audit identifier.');
    eventIds.add(body.audit.id);
    auditEvents.push({ ...body.audit, blobId });
    if (credential) groups.set(credential.id, [...(groups.get(credential.id) ?? []), credential]);
  }
  const credentials: Credential[] = [];
  const conflicts: string[] = [];
  for (const [id, versions] of groups) {
    const byRevision = new Map(versions.map((version) => [version.revision, version]));
    invariant(byRevision.size === versions.length, 'REVISION_DUPLICATE', 'The vault contains a duplicate credential revision.');
    const roots = versions.filter((version) => version.parentRevision === null);
    invariant(roots.length >= 1, 'HISTORY_INCOMPLETE', 'Credential history is incomplete. Restore the index before continuing.');
    const parents = new Set(versions.map((version) => version.parentRevision).filter(Boolean));
    const leaves = versions.filter((version) => !parents.has(version.revision));
    for (const version of versions) {
      const visited = new Set<string>();
      let node: Credential | undefined = version;
      while (node) {
        invariant(!visited.has(node.revision), 'HISTORY_CYCLE', 'Credential history contains an invalid cycle.');
        visited.add(node.revision);
        if (!node.parentRevision) break;
        node = byRevision.get(node.parentRevision);
        invariant(node, 'HISTORY_INCOMPLETE', 'A previous credential revision is missing. Restore the index before continuing.');
      }
    }
    if (roots.length !== 1 || leaves.length !== 1) {
      conflicts.push(id);
      credentials.push(...leaves);
    } else credentials.push(leaves[0]!);
  }
  return { credentials: credentials.sort((a, b) => a.siteName.localeCompare(b.siteName)),
    auditEvents: auditEvents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    blobs, conflicts, synchronizedAt: new Date().toISOString() };
}
