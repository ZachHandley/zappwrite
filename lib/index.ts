import type { AstroIntegration, AstroConfig } from 'astro';
import { createAppwriteFunction } from './appwrite-utils.js';
import { fileURLToPath } from 'url';
import { createGetEnv } from './env.js';

export interface ZappwriteSSROptions {
  endpoint: string;
  projectId: string;
  apiKey: string;
  functionId?: string;
  functionName?: string;
  timeout?: number;
}

export default function zappwriteSSR(
  options: ZappwriteSSROptions
): AstroIntegration {
  let _config: AstroConfig;

  return {
    name: 'zappwrite-ssr',
    hooks: {
      'astro:config:setup': async ({ updateConfig }) => {
        updateConfig({
          vite: {
            ssr: {
              ...((await shouldExternalizeAstroEnvSetup()) ? {
                external: ['astro/env/setup']
              } : {})
            }
          }
        });
      },
      'astro:config:done': ({ config, setAdapter }) => {
        _config = config;
        
        setAdapter({
          name: 'zappwrite-ssr',
          serverEntrypoint: fileURLToPath(new URL('./appwrite-adapter.cjs', import.meta.url)),
          exports: ['handler'],
          supportedAstroFeatures: {
            staticOutput: 'stable',
            serverOutput: 'stable',
            hybridOutput: 'stable',
            envGetSecret: 'experimental',
            assets: {
              supportKind: 'stable',
              isSharpCompatible: true,
              isSquooshCompatible: false,
            },
          },
          adapterFeatures: {
            edgeMiddleware: false,
            functionPerRoute: false,
          },
        });
      },
      'astro:build:done': async ({ dir }) => {
        const buildDir = fileURLToPath(dir);
        console.log("Build directory:", buildDir);
        const envVariables = collectEnvVariables(_config);
        setProcessEnv(_config, envVariables);

        await createAppwriteFunction(
          {
            endpoint: options.endpoint,
            projectId: options.projectId,
            apiKey: options.apiKey,
            functionId: options.functionId,
            functionName: options.functionName,
            timeout: options.timeout || 300,
            envVariables,
          },
          buildDir
        );
      },
    },
  };
}

async function shouldExternalizeAstroEnvSetup() {
  try {
    await import('astro/env/setup');
    return true;
  } catch (e) {
    return false;
  }
}

function setProcessEnv(config: AstroConfig, env: Record<string, unknown>) {
  const getEnv = createGetEnv(env);

  // Set env variables
  if (config.experimental.env?.schema) {
    for (const key of Object.keys(config.experimental.env.schema)) {
      const value = getEnv(key);
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  }
}

function collectEnvVariables(config: AstroConfig): Record<string, string> {
  const envVariables: Record<string, string> = {};
  const allowedPrefixes = ['PUBLIC_', 'ASTRO_', 'SITE_'];

  // Get schema variables first
  if (config.experimental.env?.schema) {
    for (const [key, schema] of Object.entries(config.experimental.env.schema)) {
      const value = process.env[key];
      
      if (value !== undefined && value !== null) {
        envVariables[key] = value;
      } else if ('default' in schema && schema.default !== undefined) {
        // Use schema default if available
        envVariables[key] = String(schema.default);
      } else if (!schema.optional) {
        throw new Error(`Required environment variable ${key} is not defined`);
      }
    }
  }

  // Add prefixed variables from process.env
  for (const [key, value] of Object.entries(process.env)) {
    if (
      allowedPrefixes.some(prefix => key.startsWith(prefix)) &&
      value !== undefined && 
      value !== null
    ) {
      envVariables[key] = value;
    }
  }

  return envVariables;
}