# Keeva

Client-encrypted credential vault using Sui Mainnet, Tatum JSON-RPC, and Walrus Memory. Functional React components are included; the visual design is intentionally provisional pending the design reference.

## Run

Requires Node.js 22.23.4 or a newer security-patched supported release.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Use **Vault & Gateway Settings**, connect the owning Mainnet wallet, run **Test Vault Connectivity**, then **Inspect existing vault**. Initialize only for an unused namespace; use restore for an existing vault with a missing index.

The configured MemWal account and registered delegate must already exist on Mainnet. Obtain them through the Walrus Memory account-management flow. Keeva validates the delegate’s derived public key, authenticated account identity, connected owner, relayer network, and Tatum chain identifier. It does not create or fund accounts automatically.

### Gateway configuration

| Setting | Purpose |
| --- | --- |
| `VITE_TATUM_API_KEY` | Tatum key, transmitted as `x-api-key` only to the fixed Mainnet gateway |
| `VITE_MEMWAL_PRIVATE_KEY` | 64-character hexadecimal delegate private key |
| `VITE_MEMWAL_ACCOUNT_ID` | Full `0x`-prefixed 32-byte memory account object ID |
| `VITE_MEMWAL_AGENT_ID` | Delegate public key, validated against the private key |
| `VITE_MEMWAL_SERVER_URL` | HTTPS relayer, defaults to `https://relayer.memory.walrus.xyz` |
| `VITE_MEMWAL_NAMESPACE` | Root namespace, defaults to `vaultos-production` |

Browser-entered public settings persist in localStorage. Secrets are session-only by default. Optional device persistence wraps gateway secrets with AES-GCM under a separate PBKDF2-derived device passphrase. Master vault keys and decrypted credentials are never persisted. The delegate public key is sent by the SDK in its signed `x-public-key` header; the identity check additionally includes `x-agent-id`.

`.env.example` lists environment names. **Vite variables are compiled into public browser assets.** For a shared production deployment, leave secret environment variables empty and enter gateway credentials at runtime through settings. Never publish a build containing an operator’s delegate private key or Tatum API key.

## Components and services

- `src/config/vaultConfig.ts`: schema validation, environment defaults, protected device settings.
- `src/services/tatumSuiClient.ts`: JSON-RPC deadlines, response validation, Mainnet identity, telemetry, transaction verification.
- `src/services/memwalGateway.ts`: production SDK construction, signed account identity, connectivity diagnostics.
- `src/crypto/`: non-extractable AES-256-GCM keys, PBKDF2-SHA256, secure password generation.
- `src/services/vaultStorageService.ts`: immutable encrypted records, SDK persistence, exact inventory discovery, private local search, recovery, encrypted export.
- `src/services/vaultProjection.ts`: revision ancestry validation and concurrent-write detection.
- `src/services/encryptedCache.ts`: ciphertext-only IndexedDB cache and device continuity checkpoints.
- `src/services/securityAuditService.ts`: local reuse, resistance, and rotation analysis.
- `src/state/`: wallet-bound session lifecycle and ephemeral decrypted state.
- `src/views/`: inventory, item composer, security audit, and blob explorer.

## Encryption and indexing protocol

1. A root header carries a random 32-byte salt, a vault identifier, wallet/account binding, KDF parameters, and an authenticated key check. The minimum PBKDF2 work factor is 600,000 SHA-256 iterations.
2. Passphrase mode additionally requires a fresh wallet ownership signature. Wallet-key mode derives from a vault-specific verified Ed25519 personal-message signature. Other wallet schemes can use passphrase mode. Neither signature is sent to MemWal.
3. Each secret has its own AES-GCM envelope. The full credential—including site, username, notes, category, dates, revision ancestry, and audit data—is encrypted again in an outer envelope. Every encryption has an independently random 96-bit IV and 128-bit authentication tag, with account/vault/record-bound additional authenticated data.
4. `rememberAndWait()` uploads only the resulting ciphertext envelope. MemWal adds its own SEAL/storage processing. No credential text is passed to its embedding or analysis endpoints.
5. Each immutable revision occupies a unique opaque namespace beneath `<root>.r.<uuid>`. This avoids depending on a capped similarity search to enumerate or select current revisions. The root namespace contains exactly one header.
6. `listMemories()` is paginated through `has_more`. Each discovered record is retrieved with `recall({ query: constant, topK: 15, namespace })` and matched to its exact blob ID. Decrypted local metadata is searched for user-supplied terms; those terms never leave the browser.
7. Credential writes and their audit events share one authenticated blob. Failed or uncertain writes retain the encrypted request and idempotency identifier in localStorage. The application has an explicit resume action and never automatically retries a paid mutation with fresh ciphertext.
8. Revision ancestry is validated before projecting current credentials. Concurrent heads stay visible and block overwrites. Cross-device concurrency is detected rather than arbitrated by an untrusted timestamp.

## Network and verification boundaries

Tatum telemetry requests the specified `sui_getLatestSuiSystemState` and `sui_getReferenceGasPrice` methods, falling back to their canonical `suix_` names only for JSON-RPC method-not-found. Transaction count and checkpoint height are distinct measurements. All metrics originate from live RPC responses.

Transaction verification recomputes the transaction digest from BCS bytes, verifies sender/sponsor intent signatures using the Sui SDK, checks the connected sender, and requests checkpoint membership. Contract event recognition uses explicitly configured full event types. **Checkpoint membership, execution status, and event contents are RPC-attested, not independently verified validator-certificate proofs.** No sharing or recovery contract is assumed to exist. A verified transaction is recorded as `transaction.checked`, never as a claimed sharing or recovery success.

The zero-knowledge property concerns credential contents relative to the relayer/storage service. Account identity, namespaces, opaque record identifiers, ciphertext lengths, timing, and access patterns remain observable. MemWal may forward ciphertext and the constant discovery phrase to its embedding provider. Local content search is not private server-side semantic search and does not claim to hide traffic metadata.

## Recovery and retention

`restoreVaultIndex()` restores the root and discovered revision namespaces using the real SDK. The current relayer has bounded onchain candidate discovery and no complete restore cursor. Its `truncated: false` response does not prove exhaustive recovery. Namespace/index loss can therefore require operator-side recovery or relayer improvements. The UI reports the restore scope rather than claiming complete recovery.

Encrypted exports include the authenticated header, ciphertext records, and blob/namespace metadata. Retain exports externally; keep master material separately. Exports provide data portability and recovery evidence; automated backup import and conflict reconciliation are not yet implemented. Existing ciphertext remains on Walrus according to storage retention. Rotation creates a new revision and does not erase earlier copies. No deletion or perpetual-retention guarantee is made.

Device continuity checkpoints detect a replaced header or previously observed records disappearing from the index. A fresh device has no independent history checkpoint, and the relayer can omit previously unseen records. A consensus-backed vault head or independent authenticated manifest is needed for stronger rollback/completeness guarantees.

## Session handling

The vault locks on inactivity, page hiding, page exit, wallet/account changes, and settings changes. In-flight operations cannot reopen a locked session. Password-bearing form submissions bypass mutation caching. Clipboard clearing after 30 seconds is attempted only if the clipboard still matches the copied value; browser permission failures are reported. Closing the tab or browser can prevent that timer from running.

Web Crypto keys are non-extractable. Temporary byte buffers are overwritten where possible. JavaScript strings and browser/extension memory cannot be reliably zeroized. The browser, delivered application code, dependencies, and wallet extension remain trusted components; local malware or compromised application delivery is outside client-side encryption’s protection.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Unit checks exercise actual Web Crypto and Sui signatures, authentication failures, ciphertext/context tampering, generator constraints, missing/cyclic revision history, concurrent updates, reuse, and rotation. They do not replace gateway operations with in-memory network substitutes.

```sh
npm run test:integration
```

Integration checks read `.env.integration` locally and are skipped if required gateway credentials are absent. Read checks authenticate the real delegate and fetch Mainnet telemetry. Set `KEEVA_INTEGRATION_WRITE=1` explicitly to run a real paid Walrus write/read/restore check in a fresh isolated namespace. It leaves its encrypted blob on Mainnet. End-to-end wallet/storage success must be validated with the operator’s actual configured account.

## Deployment

```sh
npm run build
npm run preview
```

Serve `dist/` over HTTPS. A Dockerfile and Nginx configuration are provided. Terminate TLS at the ingress, configure HSTS there, and pin container image digests in your deployment pipeline. Nginx sets CSP, framing, referrer, and browser-permission policies. Restrict `connect-src` and `frame-src` to approved wallet/gateway origins in an institutional deployment; the provided policy accommodates runtime-configured HTTPS relayers and wallet providers.

No application server receives master keys or plaintext credentials. This is a browser service layer backed by the configured networks. MemWal is an evolving external service, and this implementation has not undergone an independent cryptographic or application-security audit.
