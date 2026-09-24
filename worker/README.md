Not used by My Buildy v0.1. Kept for a possible hosted option later.

# My Buildy Worker proxy — DISABLED in v0.1

> ⚠️ **This Cloudflare Worker proxy is not used by the app in v0.1.** The "Use proxy"
> option was removed from Settings and the Anthropic provider always calls the API
> directly. The folder is kept for reference only.
>
> It is disabled pending **authentication work** — an unauthenticated proxy
> is an open relay for whoever holds the URL, so it must require a per-user token
> before it is re-enabled. Do not deploy or point the app at this until that lands.

The original proxy code (Anthropic passthrough) lives in `src/`. Re-enabling it will
require: (1) an auth check on every request, (2) wiring a new authenticated proxy
mode back into the provider + Settings UI.
