# Keeva

Client-encrypted credential vault using Sui Mainnet, Tatum GraphQL or JSON-RPC, and Walrus Memory, with a deep-green login hero and a mint workspace.

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
| `VITE_TATUM_API_TYPE` | `graphql` (new-configuration default) or `json-rpc`; editable in gateway settings |
| `VITE_TATUM_RPC_URL` | Your full HTTPS Sui Mainnet endpoint URL for the selected interface; required, with no default |
| `TATUM_GRAPHQL_RECOVERY_URL` | Optional server-side GraphQL route used only when the requested endpoint returns Tatum `-16401` or `-16405`; blank by default |
| `VITE_TATUM_API_KEY` | Tatum key; Keeva's backend sends it as `x-api-key` to the configured endpoint |
| `VITE_MEMWAL_PRIVATE_KEY` | 64-character hexadecimal delegate private key |
| `VITE_MEMWAL_ACCOUNT_ID` | Full `0x`-prefixed 32-byte memory account object ID |
| `VITE_MEMWAL_AGENT_ID` | Delegate public key, validated against the private key |
| `VITE_MEMWAL_SERVER_URL` | HTTPS relayer, defaults to `https://relayer.memory.walrus.xyz` |
| `VITE_MEMWAL_NAMESPACE` | Root namespace, defaults to `vaultos-production` |

Browser-entered public settings persist in localStorage. Settings now default to **Encrypted · unlock with wallet** on this device. Each wallet has its own AES-256-GCM-encrypted configuration, protected by a PBKDF2-SHA256 key derived from a verified deterministic Ed25519 private personal-message signature (600,000 iterations). The derivation message binds the application origin, Mainnet, wallet, and a random per-save salt. Neither the signature nor the encryption key is stored or sent to a server. **Encrypted · unlock with passphrase** remains available for other wallet types, and **This session only** is an explicit option. Master vault keys and decrypted credentials are never persisted. The delegate public key is sent by the SDK in its signed `x-public-key` header; the identity check additionally includes `x-agent-id`.

The hosted Walrus relayer does not allow direct cross-origin browser requests. Keeva routes its default relayer through the same-origin `/gateway/walrus/` path in Vite development/preview, the production Node server, and the supplied Nginx configuration. The upstream is fixed to `https://relayer.memory.walrus.xyz`; the proxy forwards signed requests and encrypted payloads, never master keys or delegate private keys. Custom HTTPS relayers must allow the application origin through their own CORS configuration. Node integration checks use the relayer directly.

Tatum requests use the same-origin **`POST /api/tatum` backend**, adapted from SubSense's server-side `queryTatum` method. Each request carries the selected endpoint, interface, API key, and public chain query. The backend sends `Content-Type` and `x-api-key` to Tatum, validates the response, and returns chain data or a specific provider error. It does not persist or log API keys. Both GraphQL and the supported JSON-RPC read methods use this route, including remote signature verification. Vault encryption and local digest/signature checks remain in the browser.

Choose **Tatum interface**, then enter your own **Tatum endpoint URL · Sui Mainnet** beside the API key in **Vault & Gateway Settings**. There is no default Tatum gateway. The URL must be an HTTPS `*.gateway.tatum.io` endpoint without custom ports, embedded credentials, query parameters, or fragments; enter the key in its separate field. Connectivity testing, telemetry, and transaction verification use the selected interface and exact URL, and verify Sui Mainnet. The environment variable retains the name `VITE_TATUM_RPC_URL` for compatibility and accepts either interface's endpoint.

Match the interface to your gateway's `/_methods` discovery. Current Tatum Sui Mainnet discovery advertises **GraphQL**. In GraphQL mode, enter the full URL advertised by Tatum, including `/graphql` when present. Tatum's browser CORS policy does not apply to the server-to-server request. An incompatible URL is reported with the provider code, such as `-16401`; GraphQL schema errors include the provider's diagnostic with the API key redacted.

For a deployment with a selected working GraphQL gateway, set `TATUM_GRAPHQL_RECOVERY_URL` in the server environment or ignored `.env.local`. When an existing saved URL returns `-16401` or `-16405`, the backend retries that read once against this explicitly configured route. It reports the resolved URL, the client reuses it for subsequent reads, and connectivity testing updates the form's endpoint. Use **Save configuration** to retain the correction. Authorization failures, partial data, schema errors, and other provider errors do not trigger route changes. With this setting empty, only the exact requested endpoint is used. No Tatum endpoint is embedded in the application source.

Select **JSON-RPC** only when your endpoint advertises Sui `sui_*` and `suix_*` methods. Errors `-32601` and `-16405` mean the named method is unavailable. A gRPC interface or an Ethereum-style `eth_*` method list cannot serve Keeva's Sui GraphQL queries; obtain the matching Sui endpoint from Tatum. Older saved configurations without an interface field retain JSON-RPC interpretation; select GraphQL explicitly when migrating. New configurations select GraphQL but leave the endpoint blank.

Use **Test Tatum connection** to check the endpoint and key independently of Walrus configuration. **Test Vault Connectivity** checks the complete form. Both use the current form without saving it; use **Save configuration** to apply settings. Enter the API and delegate keys once, connect your Mainnet wallet, leave wallet protection selected, and save. After refresh, reconnect the same wallet (wallet auto-connection is enabled) and choose **Unlock saved gateways with wallet** in Secure Vault Initialization or settings. Approve the private message to restore keys and the matching wallet’s configuration; it is not a transaction and has no fee. Keeva does not trigger wallet prompts without a user action. Vault authorization and unlock are still separate.

For wallets without deterministic Ed25519 signatures, choose passphrase protection and supply a separate device passphrase of at least 14 characters. You can also save partially completed setup, so keys already entered are retained while obtaining account IDs or other missing values; vault readiness and full connectivity checks still require complete valid configuration. Earlier passphrase-protected gateway copies remain readable. Normal settings saves never silently remove encrypted copies; updating a protected profile requires unlocking it first. The explicit **Forget** controls remove only the selected browser copy, not vault records. Switching/disconnecting a wallet clears active gateway secrets, and cross-tab configuration changes invalidate in-flight unlocks. Settings are specific to the browser and origin, so `localhost` and `127.0.0.1` have separate storage; clearing site data also removes saved gateway copies.

Each gateway field includes a setup link: Tatum’s [Sui dashboard](https://dashboard.tatum.io/chains/sui) and [API keys](https://dashboard.tatum.io/api-keys), [Walrus Memory account/delegate setup](https://memory.walrus.xyz/), and official guides for [delegate public keys](https://docs.wal.app/walrus-memory/contract/delegate-key-management), [Mainnet relayers](https://docs.wal.app/walrus-memory/relayer/public-relayer), and [namespaces](https://docs.wal.app/walrus-memory/fundamentals/concepts/memory-space). Audit settings link to [Sui event types](https://docs.sui.io/guides/developer/sui-101/using-events). Links open in a new tab without passing form values or a referrer. Namespace names, inactivity timeouts, and device passphrases are chosen locally, not issued by a provider.

The backend allows read-only operations, bounds request/response sizes, rejects redirects, omits browser cookies and authorization headers, and uses a 20-second upstream deadline. Rate-limited reads have up to two retries within that deadline, respecting short `Retry-After` values or using a one/two-second backoff when no delay is provided. Other failures are returned immediately. A missing backend produces a specific startup message rather than treating an HTML page as GraphQL data.

`.env.example` lists environment names. **Vite variables are compiled into public browser assets.** For a shared production deployment, leave secret environment variables empty and enter gateway credentials at runtime through settings. Never publish a build containing an operator’s delegate private key or Tatum API key.

## Components and services

- `src/config/vaultConfig.ts`: schema validation, environment defaults, protected device settings.
- `src/config/walletGateway.ts`: origin-bound wallet-encrypted gateway profiles and local signature verification.
- `src/state/GatewayContext.tsx`: saved-gateway recognition, explicit unlock, and wallet-change invalidation.
- `server/tatum.mjs`: SubSense-style server-to-server GraphQL/JSON-RPC reads, bounded retries, endpoint validation, and provider diagnostics.
- `server/gateway.mjs`: same-origin Tatum API handler, shared by Vite and production.
- `server/app.mjs`: production static hosting, Tatum API, and fixed-upstream Walrus proxy.
- `src/services/tatumTransport.ts`: browser-to-backend transport and structured errors.
- `src/services/tatumSuiClient.ts`: transport selection, JSON-RPC response validation, and shared transaction digest/signature verification.
- `src/services/tatumGraphqlClient.ts`: GraphQL deadlines, strict response validation, Mainnet identity, telemetry, and paginated event/checkpoint reads.
- `src/services/memwalGateway.ts`: production SDK construction, signed account identity, connectivity diagnostics.
- `src/crypto/`: non-extractable AES-256-GCM keys, PBKDF2-SHA256, secure password generation.
- `src/services/vaultStorageService.ts`: immutable encrypted records, SDK persistence, exact inventory discovery, private local search, recovery, encrypted export.
- `src/services/vaultProjection.ts`: revision ancestry validation and concurrent-write detection.
- `src/services/encryptedCache.ts`: ciphertext-only IndexedDB cache and device continuity checkpoints.
- `src/services/securityAuditService.ts`: local reuse, resistance, and rotation analysis.
- `src/state/`: wallet-bound session lifecycle and ephemeral decrypted state.
- `src/views/`: inventory, item composer, security audit, and blob explorer.
- `src/views/PasswordGenerator.tsx`: unlocked-vault password tool with 8–128-character lengths, character-type controls, optional look-alike exclusion, constrained entropy, and protected clipboard copying. Uses Web Crypto rejection sampling; generated passwords stay in memory and can prefill a new credential without saving it automatically. The credential form shares the same options and generator.

### Interface and motion

The interface uses the supplied ribbon-padlock logo, self-hosted DM Sans and Geist Mono, and a mint/forest palette. The login hero includes gateway configuration, wallet connection, and vault authorization. Juice-inspired type scale and Lenis scrolling (`lerp: 0.1`) accompany a hero-only Chladni sand field and fanning logo cards inspired by Janis Wanger. The uncapped cursor trail has 7–9-second natural lives: grains flow into the pattern lines faster as the cursor moves away, then fade out over 0.8 seconds once settled. Background clicks ripple through the field and morph its pattern. Keyboard-accessible pattern and pause controls are available in the hero footer. The authenticated workspace uses a spacious text-based vertical menu. Touch scrolling stays native; reduced-motion preferences disable smooth scrolling and decorative motion. The settings drawer preserves native modal focus behavior, and clipboard checks follow successful writes. Locking immediately unmounts the decrypted workspace. See [design direction](docs/design-direction.md) for reference details.

Dashboard values come from the current vault snapshot and real gateway responses. Connection indicators pulse only for fresh successful readings; disconnected services show explicit setup states. See [design research and decisions](docs/design-direction.md) for the reviewed sources and their application.

## Encryption and indexing protocol

1. A root header carries a random 32-byte salt, a vault identifier, wallet/account binding, KDF parameters, and an authenticated key check. The minimum PBKDF2 work factor is 600,000 SHA-256 iterations.
2. Passphrase mode additionally requires a fresh wallet ownership signature. Wallet-key mode derives from a vault-specific verified Ed25519 personal-message signature. Other wallet schemes can use passphrase mode. Neither signature is sent to MemWal.
3. Each secret has its own AES-GCM envelope. The full credential—including site, username, notes, category, dates, revision ancestry, and audit data—is encrypted again in an outer envelope. Every encryption has an independently random 96-bit IV and 128-bit authentication tag, with account/vault/record-bound additional authenticated data.
4. `rememberAndWait()` uploads only the resulting ciphertext envelope. MemWal adds its own SEAL/storage processing. No credential text is passed to its embedding or analysis endpoints.
5. Each immutable revision occupies a unique opaque namespace beneath `<root>.r.<uuid>`. This avoids depending on a capped similarity search to enumerate or select current revisions. The root namespace contains exactly one header.
6. `listMemories()` is paginated through `has_more`. Each discovered record is retrieved with `recall({ query: constant, topK: 15, namespace })` and matched to its exact blob ID. Decrypted local metadata is searched for user-supplied terms; those terms never leave the browser.
7. Credential writes and their audit events share one authenticated blob. Failed or uncertain writes retain the encrypted request and idempotency identifier in localStorage. The application has an explicit resume action and never automatically retries a paid mutation with fresh ciphertext. Browser Web Locks serialize writes across same-origin tabs; a secure browser supporting Web Locks is required.
8. Revision ancestry is validated before projecting current credentials. Concurrent heads stay visible and block overwrites. Cross-device concurrency is detected rather than arbitrated by an untrusted timestamp.

## Network and verification boundaries

GraphQL telemetry reads the chain identifier and latest checkpoint's epoch, reference gas price, cumulative transaction count, and sequence number in one query. The full genesis digest is decoded to validate Mainnet's `35834a8a` chain identifier. GraphQL errors, partial results, missing required fields, and non-advancing pagination fail closed. Transaction events are paginated in sequence; checkpoint transaction pages are searched until membership is found or the list is exhausted. Both use pages of 50 to respect Tatum's current limit.

In JSON-RPC mode, telemetry requests `sui_getLatestSuiSystemState` and `sui_getReferenceGasPrice`, falling back to their canonical `suix_` names only for method-unavailable responses. Transaction count and checkpoint height are distinct measurements. All metrics originate from live gateway responses. The legacy dapp-kit provider supplies wallet network context; cryptographic verification uses the client for the selected transport.

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

Unit checks exercise actual Web Crypto and Sui signatures, authentication failures, ciphertext/context tampering, generator constraints, missing/cyclic revision history, concurrent updates, reuse, and rotation. GraphQL transport checks additionally exercise response validation and pagination using controlled responses and locally signed transaction bytes. These offline checks do not establish live gateway connectivity.

```sh
npm run test:integration
```

Integration checks read `.env.integration` locally and start the real Node backend on an ephemeral local port. They are skipped if required gateway credentials are absent. Tatum-only checks need the endpoint, interface, and API key; optionally set `KEEVA_INTEGRATION_TX_DIGEST` to verify a real successful programmable transaction. Combined read checks authenticate the real delegate and fetch Mainnet telemetry. Set `KEEVA_INTEGRATION_WRITE=1` explicitly to run a real paid Walrus write/read/restore check in a fresh isolated namespace. It leaves its encrypted blob on Mainnet. End-to-end wallet/storage success must be validated with the operator’s actual configured account.

## Deployment

```sh
npm run build
npm start
```

`npm start` loads `.env.local` when present and serves the built app, `/api/tatum`, and `/gateway/walrus/` together on `127.0.0.1:3000`. Set `HOST` and `PORT` for your deployment. `npm run dev` and `npm run preview` also load local configuration and include the Tatum backend through the shared Vite middleware. Restart an already running development process after updating the backend configuration. For containers, pass server configuration through environment variables.

The Dockerfile runs this Node server on port 3000 as an unprivileged user. Terminate HTTPS at the ingress, configure HSTS there, and pin container image digests in your deployment pipeline. The optional Nginx configuration serves `dist/`, proxies `/api/` to the Node backend on `127.0.0.1:3000`, and provides the fixed Walrus proxy. Adjust that internal backend address when Nginx runs in a separate container. Static-only hosting of `dist/` is insufficient; both gateway routes need their backend handlers.

The Node server and Nginx configuration set CSP, framing, referrer, and browser-permission policies. Restrict `connect-src` and `frame-src` to approved wallet/gateway origins in an institutional deployment; the provided policy accommodates runtime-configured HTTPS relayers and wallet providers.

No application server receives master keys or plaintext credentials. This is a browser service layer backed by the configured networks. MemWal is an evolving external service, and this implementation has not undergone an independent cryptographic or application-security audit.
