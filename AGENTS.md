# Agent guide (Kainbu)

Project conventions: [CLAUDE.md](CLAUDE.md).

## Skills (read when relevant)

| Skill | Path |
|-------|------|
| Dokploy / production deploy | [.cursor/skills/kainbu-dokploy/SKILL.md](.cursor/skills/kainbu-dokploy/SKILL.md) |
| Testing & e2e scripts | [.cursor/skills/kainbu-testing/SKILL.md](.cursor/skills/kainbu-testing/SKILL.md) |
| Release / pre-push / CD | [.cursor/skills/kainbu-release/SKILL.md](.cursor/skills/kainbu-release/SKILL.md) |
| PocketBase / workspace bugs | [.cursor/skills/kainbu-pocketbase/SKILL.md](.cursor/skills/kainbu-pocketbase/SKILL.md) |

Index: [.cursor/skills/README.md](.cursor/skills/README.md)

## Quick verify before claiming done

```bash
npm run check && npm run check:server
npm run test:local-docker   # requires docker compose up
```

Production after deploy: `node scripts/pb-prod-workspace-e2e.mjs`
