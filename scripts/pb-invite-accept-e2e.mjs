#!/usr/bin/env node
import { workspaceSmoke } from './workspace-smoke.mjs';
await workspaceSmoke(process.argv[2] || 'http://127.0.0.1:3000', true);
