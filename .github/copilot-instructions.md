# Home Assistant Coding Guidelines
- All secrets, passwords, and IP addresses must use `!secret <secret_name>` referencing `secrets.yaml` or `.env`.
- Automations should be modular and follow modern Home Assistant YAML syntax.
- Use entity IDs fetched via the Home Assistant MCP tools rather than guessing.
- Always validate YAML syntax before outputting complete configuration blocks.