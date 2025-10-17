import { router } from './router.js';
import { renderIntegrations } from './components/integrations.js';
import { renderSources } from './components/sources.js';
import { renderQueries, cleanupQueries } from './components/queries.js';
import { renderAI } from './components/ai.js';
import { renderContent } from './components/content.js';
import { renderOutputs } from './components/outputs.js';

// Register routes
router.register('/integrations', renderIntegrations);
router.register('/sources', renderSources);
router.register('/queries', renderQueries, cleanupQueries);
router.register('/ai', renderAI);
router.register('/content', renderContent);
router.register('/outputs', renderOutputs);

console.log('Palimpsest app initialized');
