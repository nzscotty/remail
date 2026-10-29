# Project Guidelines

## Provider API boundary

- Treat functions under `api/` as authenticated, allow-listed provider proxies. They may route requests, add authentication/provider-required headers, and validate proxy parameters, but must pass provider request and response data through without Remail-specific transformations.
- Keep provider request construction, response validation, filtering, contact derivation, quoted-text cleanup, and mapping to Remail domain objects in the app under `src/services/`.
- Use generated `googleapis` types for Gmail wire shapes and `@microsoft/microsoft-graph-types` for Graph shapes. Name provider wire types distinctly from `RemailConversation` and `RemailMessage`, and make conversion functions explicitly map provider data to Remail objects.
