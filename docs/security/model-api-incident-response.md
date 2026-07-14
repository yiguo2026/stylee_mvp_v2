# Model API key incident response

The App and GitHub Pages build must never receive DeepSeek, DashScope, Ark, or Supabase service-role credentials. Model provider keys belong only to model service; Supabase service-role does not belong in either client or model service.

For the keys that were exposed before this fix:

1. Revoke every old DeepSeek and DashScope key in the provider consoles. Disabling a GitHub Actions secret does not revoke the provider credential.
2. Create new keys with the smallest available permissions, per-environment separation, spend caps, and billing alerts.
3. Store new keys only in the model-service host's secret manager as `DEEPSEEK_API_KEY` and `DASHSCOPE_API_KEY`.
4. Remove the old `EXPO_PUBLIC_DEEPSEEK_*`, `EXPO_PUBLIC_DASHSCOPE_*`, `EXPO_PUBLIC_ARK_*`, and `EXPO_PUBLIC_SUPABASE_SERVICE_*` entries from GitHub Actions secrets/variables and Expo/EAS secrets.
5. If a Supabase service-role key ever entered a Web build, revoke/rotate it after migrating registration to Supabase Auth + database trigger. Do not move it into model service.
6. Review provider usage and invoices from the first suspicious timestamp, preserve request/IP evidence, and contact provider support for disputed charges.

The old values remain recoverable from existing clones and Git history until a coordinated history rewrite is completed. Rotation is mandatory even if history is rewritten.
