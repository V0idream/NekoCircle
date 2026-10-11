import { defineCloudflareConfig } from '@opennextjs/cloudflare';
// No R2, Durable Objects, Images or other paid/usage-billed storage is provisioned.
export default defineCloudflareConfig({ incrementalCache: 'dummy', tagCache: 'dummy', queue: 'dummy', cachePurge: 'dummy', routePreloadingBehavior: 'none' });
