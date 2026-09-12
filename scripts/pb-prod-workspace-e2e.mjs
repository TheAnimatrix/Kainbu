#!/usr/bin/env node
import { workspaceSmoke } from './workspace-smoke.mjs';
await workspaceSmoke(process.argv[2] || 'https://kainbu.avarnic.com');
